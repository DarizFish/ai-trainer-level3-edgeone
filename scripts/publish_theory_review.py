#!/usr/bin/env python3
"""Publish a complete theory-review ledger into ``data/content.json``.

The review ledger is intentionally separate from the learner-facing content.
This command is the only bridge between the two.  It refuses to publish until
all 900 questions pass the structural state validator and the independent
answer/explanation quality gate.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import sys
from collections import Counter
from contextlib import nullcontext
from pathlib import Path
from typing import Any

from theory_review_quality import build_report as build_quality_report
from theory_review_state import (
    BATCH_ID,
    DEFAULT_AUDIT_PATH as DEFAULT_REFERENCE_AUDIT_PATH,
    DEFAULT_CONTENT_PATH,
    DEFAULT_REFERENCE_PATH,
    DEFAULT_STATE_DIR,
    all_entries,
    file_sha256,
    read_json,
    state_lock,
    utc_now,
    validate_state,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_AUDIT_PATH = PROJECT_ROOT / "data" / "references" / "theory-review-audit.json"
DEFAULT_VERSION = "2026-07-26-v8"

PUBLISHABLE_SOURCE_MAPPING = {
    "official_word": {
        "answerSource": "official",
        "answerBasis": "manual_official",
        "confidence": "high",
    },
    "secondary_site": {
        "answerSource": "derived",
        "answerBasis": "third_party_reference",
        "confidence": "medium",
    },
    "independent_editorial": {
        "answerSource": "derived",
        "answerBasis": "editorial_review",
        "confidence": "medium",
    },
    "independent_review": {
        "answerSource": "derived",
        "answerBasis": "editorial_review",
        "confidence": "medium",
    },
}
FORBIDDEN_PUBLISH_SOURCES = {"heuristic", "unresolved"}


def json_bytes(payload: Any, *, compact: bool) -> bytes:
    if compact:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    return text.encode("utf-8")


def bytes_sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def answer_key(answer: Any) -> tuple[str, ...]:
    if not isinstance(answer, list):
        return ()
    return tuple(sorted(str(value) for value in answer))


def display_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return resolved.as_posix()


def load_manifest_entries(state_dir: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    manifest = read_json(state_dir / "manifest.json")
    return manifest, all_entries(state_dir, manifest)


def complete_gate(
    *,
    content_path: Path,
    reference_path: Path,
    reference_audit_path: Path,
    state_dir: Path,
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    """Run both existing gates and enforce publication-only invariants."""

    state_summary = validate_state(
        content_path=content_path,
        reference_path=reference_path,
        audit_path=reference_audit_path,
        state_dir=state_dir,
    )
    quality_report, quality_errors = build_quality_report(
        content_path=content_path,
        reference_path=reference_path,
        audit_path=reference_audit_path,
        state_dir=state_dir,
        require_complete=True,
    )
    if quality_errors:
        raise ValueError("理论审校质量门禁未通过：\n- " + "\n- ".join(quality_errors[:50]))

    manifest, entries = load_manifest_entries(state_dir)
    errors: list[str] = []
    if manifest.get("batchId") != BATCH_ID:
        errors.append(f"审校批次异常：{manifest.get('batchId')!r}")
    if len(entries) != 900 or state_summary.get("reviewed") != 900:
        errors.append(f"必须完成 900 题审校，当前 {state_summary.get('reviewed', 0)}/900")
    generated_count = sum(
        entry.get("explanationGenerationStatus") in {"generated", "reviewed"}
        and isinstance(entry.get("generatedExplanation"), str)
        and bool(entry["generatedExplanation"].strip())
        for entry in entries
    )
    if generated_count != 900:
        errors.append(f"必须生成 900 条独立解析，当前 {generated_count}/900")
    expected_shards = {descriptor["id"] for descriptor in manifest.get("shards", [])}
    qa_records = [
        record
        for record in manifest.get("appliedBatches", [])
        if record.get("reviewStage") == "qa"
    ]
    qa_shard_counts = Counter(record.get("shardId") for record in qa_records)
    missing_qa_shards = sorted(expected_shards - set(qa_shard_counts))
    duplicate_qa_shards = sorted(
        shard_id for shard_id, count in qa_shard_counts.items() if shard_id and count != 1
    )
    invalid_qa_counts = sorted(
        str(record.get("shardId"))
        for record in qa_records
        if record.get("count") != 100
    )
    if missing_qa_shards:
        errors.append(f"仍有分片未完成交叉复核：{', '.join(missing_qa_shards)}")
    if duplicate_qa_shards:
        errors.append(f"交叉复核分片记录不唯一：{', '.join(duplicate_qa_shards)}")
    if invalid_qa_counts:
        errors.append(f"交叉复核分片必须各含 100 题：{', '.join(invalid_qa_counts)}")
    open_conflicts = [
        entry["questionId"] for entry in entries if entry.get("conflict", {}).get("status") == "open"
    ]
    if open_conflicts:
        errors.append(f"仍有开放冲突：{', '.join(open_conflicts[:20])}")
    forbidden = [
        entry["questionId"]
        for entry in entries
        if entry.get("adoptedBasis", {}).get("source") in FORBIDDEN_PUBLISH_SOURCES
    ]
    unknown = [
        entry["questionId"]
        for entry in entries
        if entry.get("adoptedBasis", {}).get("source") not in PUBLISHABLE_SOURCE_MAPPING
        and entry.get("adoptedBasis", {}).get("source") not in FORBIDDEN_PUBLISH_SOURCES
    ]
    if forbidden:
        errors.append(f"禁止发布 heuristic/unresolved 依据：{', '.join(forbidden[:20])}")
    if unknown:
        errors.append(f"存在未知发布依据：{', '.join(unknown[:20])}")
    if errors:
        raise ValueError("理论审校发布门禁未通过：\n- " + "\n- ".join(errors))
    return state_summary, quality_report, entries


def shard_hashes(state_dir: Path, manifest: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for descriptor in manifest["shards"]:
        path = state_dir / descriptor["path"]
        result.append(
            {
                "id": descriptor["id"],
                "path": display_path(path),
                "questionType": descriptor["questionType"],
                "count": descriptor["count"],
                "sha256": file_sha256(path),
            }
        )
    return result


def publish_content_payload(
    *,
    content: dict[str, Any],
    entries: list[dict[str, Any]],
    manifest: dict[str, Any],
    quality_report: dict[str, Any],
    version: str,
    generated_at: str,
    manifest_path: Path,
    output_audit_path: Path,
    manifest_sha256: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return the updated content and publication facts without writing files."""

    if not version.strip():
        raise ValueError("发布版本不能为空")
    theory = content.get("theory")
    if not isinstance(theory, list) or len(theory) != 900:
        raise ValueError("content.theory 必须恰好包含 900 题")

    entry_by_id = {entry["questionId"]: entry for entry in entries}
    if len(entry_by_id) != 900:
        raise ValueError("审校状态题号必须恰好 900 个且唯一")

    published = copy.deepcopy(content)
    answer_changes: list[dict[str, Any]] = []
    official_answer_changes: list[str] = []
    source_counts: Counter[str] = Counter()
    content_basis_counts: Counter[str] = Counter()

    for question in published["theory"]:
        question_id = question["id"]
        entry = entry_by_id.get(question_id)
        if entry is None:
            raise ValueError(f"审校状态缺少题号：{question_id}")
        reviewed_answer = entry.get("reviewedAnswer")
        explanation = entry.get("generatedExplanation")
        adopted_source = entry.get("adoptedBasis", {}).get("source")
        mapping = PUBLISHABLE_SOURCE_MAPPING.get(adopted_source)
        if mapping is None:
            raise ValueError(f"{question_id}: 禁止发布依据 {adopted_source!r}")
        if not isinstance(reviewed_answer, list) or not reviewed_answer:
            raise ValueError(f"{question_id}: reviewedAnswer 为空")
        if not isinstance(explanation, str) or not explanation.strip():
            raise ValueError(f"{question_id}: generatedExplanation 为空")

        official_match = entry.get("officialWordMatch", {})
        is_official = official_match.get("status") == "matched" or question.get("answerSource") == "official"
        if is_official:
            expected_official = (
                official_match.get("answer")
                if official_match.get("status") == "matched"
                else question.get("answer")
            )
            if answer_key(reviewed_answer) != answer_key(expected_official):
                official_answer_changes.append(question_id)
            if answer_key(reviewed_answer) != answer_key(question.get("answer")):
                official_answer_changes.append(question_id)
            if adopted_source != "official_word":
                raise ValueError(f"{question_id}: 官方题必须采用 official_word 依据")

        if answer_key(reviewed_answer) != answer_key(question.get("answer")):
            answer_changes.append(
                {
                    "questionId": question_id,
                    "from": question.get("answer"),
                    "to": reviewed_answer,
                    "adoptedSource": adopted_source,
                }
            )

        question["answer"] = list(reviewed_answer)
        question["explanation"] = explanation.strip()
        question.update(mapping)
        source_counts[adopted_source] += 1
        content_basis_counts[mapping["answerBasis"]] += 1

    if official_answer_changes:
        changed_ids = sorted(set(official_answer_changes))
        raise ValueError("官方 Word 答案禁止变化：" + ", ".join(changed_ids[:20]))

    resolved_conflicts = [
        {
            "questionId": entry["questionId"],
            "kind": entry["conflict"].get("kind"),
            "sources": entry["conflict"].get("sources", []),
            "details": entry["conflict"].get("details"),
            "adoptedSource": entry["adoptedBasis"]["source"],
        }
        for entry in entries
        if entry.get("conflict", {}).get("status") == "resolved"
    ]
    if any(entry.get("conflict", {}).get("status") == "open" for entry in entries):
        raise ValueError("存在开放冲突，禁止构建发布内容")

    basis_counts = dict(sorted(source_counts.items()))
    answer_basis_counts = dict(sorted(content_basis_counts.items()))
    theory_review = {
        "batchId": manifest["batchId"],
        "version": version,
        "publishedAt": generated_at,
        "reviewedQuestions": len(entries),
        "independentExplanations": quality_report["generatedExplanations"],
        "crossReviewedQuestions": quality_report["crossReviewedExplanations"],
        "crossReviewShards": len(
            {
                record["shardId"]
                for record in manifest.get("appliedBatches", [])
                if record.get("reviewStage") == "qa"
            }
        ),
        "answerChanges": len(answer_changes),
        "officialAnswerChanges": 0,
        "resolvedConflicts": len(resolved_conflicts),
        "basisCounts": basis_counts,
        "manifestPath": display_path(manifest_path),
        "manifestSha256": manifest_sha256,
        "auditPath": display_path(output_audit_path),
    }
    published["version"] = version
    published["theoryReview"] = theory_review

    theory_reference = dict(published.get("theoryReference") or {})
    theory_reference.update(
        {
            "reviewBatchId": manifest["batchId"],
            "reviewVersion": version,
            "reviewedQuestions": len(entries),
            "independentExplanations": quality_report["generatedExplanations"],
            "remainingHeuristicAnswers": 0,
            "resolvedConflicts": len(resolved_conflicts),
        }
    )
    published["theoryReference"] = theory_reference

    stats = dict(published.get("stats") or {})
    stats.update(
        {
            "theoryQuestions": len(published["theory"]),
            "officialTheoryAnswers": sum(
                question.get("answerSource") == "official" for question in published["theory"]
            ),
            "derivedTheoryAnswers": sum(
                question.get("answerSource") == "derived" for question in published["theory"]
            ),
        }
    )
    published["stats"] = stats
    facts = {
        "answerChanges": answer_changes,
        "resolvedConflicts": resolved_conflicts,
        "basisCounts": basis_counts,
        "contentAnswerBasisCounts": answer_basis_counts,
    }
    return published, facts


def publication_audit_payload(
    *,
    source_content_path: Path,
    reference_path: Path,
    reference_audit_path: Path,
    state_dir: Path,
    output_audit_path: Path,
    manifest: dict[str, Any],
    quality_report: dict[str, Any],
    published_content: dict[str, Any],
    facts: dict[str, Any],
    version: str,
    generated_at: str,
) -> dict[str, Any]:
    manifest_path = state_dir / "manifest.json"
    published_content_bytes = json_bytes(published_content, compact=True)
    return {
        "version": version,
        "batchId": manifest["batchId"],
        "generatedAt": generated_at,
        "output": {
            "contentPath": display_path(source_content_path),
            "auditPath": display_path(output_audit_path),
            "publishedContentSha256": bytes_sha256(published_content_bytes),
        },
        "sourceHashes": {
            "content": file_sha256(source_content_path),
            "secondaryReferenceSnapshotFile": file_sha256(reference_path),
            "theoryReferenceAudit": file_sha256(reference_audit_path),
            "reviewManifest": file_sha256(manifest_path),
            "officialWord": manifest.get("sources", {}).get("officialWord", {}).get("sha256"),
            "secondarySiteSource": manifest.get("sources", {})
            .get("secondarySite", {})
            .get("sourceSha256"),
        },
        "manifest": {
            "path": display_path(manifest_path),
            "sha256": file_sha256(manifest_path),
            "schemaVersion": manifest.get("schemaVersion"),
        },
        "basisCounts": facts["basisCounts"],
        "contentAnswerBasisCounts": facts["contentAnswerBasisCounts"],
        "answerChanges": {
            "count": len(facts["answerChanges"]),
            "officialAnswerChanges": 0,
            "details": facts["answerChanges"],
        },
        "conflicts": {
            "open": 0,
            "resolved": len(facts["resolvedConflicts"]),
            "details": facts["resolvedConflicts"],
        },
        "explanations": {
            "total": quality_report["generatedExplanations"],
            "independentlyGenerated": quality_report["generatedExplanations"],
            "crossReviewed": quality_report["crossReviewedExplanations"],
            "duplicateGroups": quality_report["duplicateExplanationGroups"],
            "length": quality_report["explanationLength"],
            "warnings": quality_report["warnings"],
            "highestExternalSimilarities": quality_report["highestExternalSimilarities"],
        },
        "shards": shard_hashes(state_dir, manifest),
    }


def restore_target(path: Path, original: bytes | None) -> None:
    if original is None:
        path.unlink(missing_ok=True)
        return
    temporary = path.with_suffix(path.suffix + ".rollback.tmp")
    temporary.write_bytes(original)
    os.replace(temporary, path)


def write_publication_atomic(
    *,
    content_path: Path,
    content_payload: dict[str, Any],
    audit_path: Path,
    audit_payload: dict[str, Any],
) -> None:
    """Stage both files and replace them as one rollback-capable operation."""

    if content_path.resolve() == audit_path.resolve():
        raise ValueError("content 与发布审计不能写入同一路径")
    content_path.parent.mkdir(parents=True, exist_ok=True)
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    content_temporary = content_path.with_suffix(content_path.suffix + ".publish.tmp")
    audit_temporary = audit_path.with_suffix(audit_path.suffix + ".publish.tmp")
    content_temporary.write_bytes(json_bytes(content_payload, compact=True))
    audit_temporary.write_bytes(json_bytes(audit_payload, compact=False))
    originals = {
        content_path: content_path.read_bytes() if content_path.exists() else None,
        audit_path: audit_path.read_bytes() if audit_path.exists() else None,
    }
    replaced: list[Path] = []
    try:
        # Publish the audit first so learner content never points at a missing audit.
        os.replace(audit_temporary, audit_path)
        replaced.append(audit_path)
        os.replace(content_temporary, content_path)
        replaced.append(content_path)
    except BaseException:
        for target in reversed(replaced):
            restore_target(target, originals[target])
        raise
    finally:
        content_temporary.unlink(missing_ok=True)
        audit_temporary.unlink(missing_ok=True)


def build_publication(
    *,
    content_path: Path,
    reference_path: Path,
    reference_audit_path: Path,
    state_dir: Path,
    output_audit_path: Path,
    version: str,
    generated_at: str | None = None,
    require_unpublished: bool = True,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    if output_audit_path.resolve() == reference_audit_path.resolve():
        raise ValueError("发布审计不得覆盖原 theory-reference-audit")
    if output_audit_path.resolve() == content_path.resolve():
        raise ValueError("发布审计不得与 content 使用同一路径")
    existing_content = read_json(content_path)
    existing_review = existing_content.get("theoryReview")
    if (
        require_unpublished
        and isinstance(existing_review, dict)
        and existing_review.get("batchId") == BATCH_ID
    ):
        raise ValueError(
            f"审校批次 {BATCH_ID} 已发布，拒绝重复发布以免覆盖首次发布审计"
        )
    _, quality_report, entries = complete_gate(
        content_path=content_path,
        reference_path=reference_path,
        reference_audit_path=reference_audit_path,
        state_dir=state_dir,
    )
    content = existing_content
    manifest, current_entries = load_manifest_entries(state_dir)
    if [entry["questionId"] for entry in entries] != [
        entry["questionId"] for entry in current_entries
    ]:
        raise RuntimeError("审校账本在质量门禁后发生变化，请重试")
    generated_at = generated_at or utc_now()
    manifest_path = state_dir / "manifest.json"
    manifest_sha256 = file_sha256(manifest_path)
    published_content, facts = publish_content_payload(
        content=content,
        entries=current_entries,
        manifest=manifest,
        quality_report=quality_report,
        version=version,
        generated_at=generated_at,
        manifest_path=manifest_path,
        output_audit_path=output_audit_path,
        manifest_sha256=manifest_sha256,
    )
    audit = publication_audit_payload(
        source_content_path=content_path,
        reference_path=reference_path,
        reference_audit_path=reference_audit_path,
        state_dir=state_dir,
        output_audit_path=output_audit_path,
        manifest=manifest,
        quality_report=quality_report,
        published_content=published_content,
        facts=facts,
        version=version,
        generated_at=generated_at,
    )
    return published_content, audit, facts


def publish(
    *,
    content_path: Path = DEFAULT_CONTENT_PATH,
    reference_path: Path = DEFAULT_REFERENCE_PATH,
    reference_audit_path: Path = DEFAULT_REFERENCE_AUDIT_PATH,
    state_dir: Path = DEFAULT_STATE_DIR,
    output_audit_path: Path = DEFAULT_OUTPUT_AUDIT_PATH,
    version: str = DEFAULT_VERSION,
    dry_run: bool = False,
) -> dict[str, Any]:
    lock = nullcontext() if dry_run else state_lock(state_dir)
    with lock:
        content_payload, audit_payload, facts = build_publication(
            content_path=content_path,
            reference_path=reference_path,
            reference_audit_path=reference_audit_path,
            state_dir=state_dir,
            output_audit_path=output_audit_path,
            version=version,
        )
        if not dry_run:
            write_publication_atomic(
                content_path=content_path,
                content_payload=content_payload,
                audit_path=output_audit_path,
                audit_payload=audit_payload,
            )
    return {
        "published": not dry_run,
        "dryRun": dry_run,
        "version": version,
        "batchId": content_payload["theoryReview"]["batchId"],
        "reviewedQuestions": content_payload["theoryReview"]["reviewedQuestions"],
        "independentExplanations": content_payload["theoryReview"]["independentExplanations"],
        "crossReviewedQuestions": content_payload["theoryReview"]["crossReviewedQuestions"],
        "answerChanges": len(facts["answerChanges"]),
        "officialAnswerChanges": 0,
        "resolvedConflicts": len(facts["resolvedConflicts"]),
        "contentPath": display_path(content_path),
        "auditPath": display_path(output_audit_path),
    }


# publish_content_payload 只写这几个键，所以发布封条保护的也正是它们。
THEORY_PUBLICATION_KEYS = ("theory", "theoryReference", "theoryReview", "stats", "version")


def publication_drift(
    key: str,
    current: dict[str, Any],
    rebuilt: dict[str, Any],
    audit: dict[str, Any],
) -> list[str]:
    """返回该键下有差异的字段路径；完全一致时返回空列表。"""

    left, right = current.get(key), rebuilt.get(key)
    if not isinstance(left, dict) or not isinstance(right, dict):
        return [] if left == right else [key]
    fields = sorted(set(left) | set(right))
    if key != "theoryReview":
        return [f"{key}.{field}" for field in fields if left.get(field) != right.get(field)]
    # answerChanges 记的是发布相对输入的增量：首次发布时 content 里还是审校前的答
    # 案，重建时 content 已经是发布后的答案，同一份账本必然算出 0。这个字段无法由
    # 重建复现，改由审计自身记录的数值钉住。
    drift = [] if left.get("answerChanges") == audit["answerChanges"]["count"] else [
        f"{key}.answerChanges"
    ]
    return drift + [
        f"{key}.{field}"
        for field in fields
        if field != "answerChanges" and left.get(field) != right.get(field)
    ]


def restamp(
    *,
    content_path: Path = DEFAULT_CONTENT_PATH,
    reference_path: Path = DEFAULT_REFERENCE_PATH,
    reference_audit_path: Path = DEFAULT_REFERENCE_AUDIT_PATH,
    state_dir: Path = DEFAULT_STATE_DIR,
    output_audit_path: Path = DEFAULT_OUTPUT_AUDIT_PATH,
    version: str = DEFAULT_VERSION,
    dry_run: bool = False,
) -> dict[str, Any]:
    """把发布封条重新绑定到当前的 content 文件。

    `output.publishedContentSha256` 是整文件封条：validate-content.py 断言它等于
    data/content.json 的哈希，任何后续改动都会让它失效——包括实操素材同步这类与
    理论审校无关的正当改动。重新发布被设计拒绝，于是唯一出路曾是手改哈希，那等于
    把封条变成橡皮图章。

    这里先按首次发布的时间戳确定性地重建一次发布结果，逐项比对理论审校写入的那几
    个键；只有它们全都与首次发布一致，才认为漂移发生在理论范围之外，可以重新盖章。
    """
    lock = nullcontext() if dry_run else state_lock(state_dir)
    with lock:
        audit = read_json(output_audit_path)
        published_content, _, _ = build_publication(
            content_path=content_path,
            reference_path=reference_path,
            reference_audit_path=reference_audit_path,
            state_dir=state_dir,
            output_audit_path=output_audit_path,
            version=version,
            generated_at=audit["generatedAt"],
            require_unpublished=False,
        )
        current_content = read_json(content_path)
        drifted = [
            field
            for key in THEORY_PUBLICATION_KEYS
            for field in publication_drift(key, current_content, published_content, audit)
        ]
        if drifted:
            raise ValueError(
                "以下理论审校字段已偏离首次发布结果，拒绝重新盖章："
                + "、".join(drifted)
            )

        previous = audit["output"].get("publishedContentSha256")
        current = file_sha256(content_path)
        if previous == current:
            raise ValueError("发布封条与当前 content 已经一致，无需重新盖章")

        audit["output"]["publishedContentSha256"] = current
        audit["output"]["restampedAt"] = utc_now()
        audit["output"]["restampedFrom"] = previous
        if not dry_run:
            output_audit_path.write_bytes(json_bytes(audit, compact=False))
    return {
        "restamped": not dry_run,
        "dryRun": dry_run,
        "auditPath": display_path(output_audit_path),
        "previousSha256": previous,
        "currentSha256": current,
        "verifiedKeys": list(THEORY_PUBLICATION_KEYS),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--content", type=Path, default=DEFAULT_CONTENT_PATH)
    parser.add_argument("--reference", type=Path, default=DEFAULT_REFERENCE_PATH)
    parser.add_argument("--reference-audit", type=Path, default=DEFAULT_REFERENCE_AUDIT_PATH)
    parser.add_argument("--state-dir", type=Path, default=DEFAULT_STATE_DIR)
    parser.add_argument("--output-audit", type=Path, default=DEFAULT_OUTPUT_AUDIT_PATH)
    parser.add_argument("--version", default=DEFAULT_VERSION)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--restamp",
        action="store_true",
        help="理论审校字段未变时，把发布封条重新绑定到当前 content 文件",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    action = restamp if args.restamp else publish
    try:
        result = action(
            content_path=args.content,
            reference_path=args.reference,
            reference_audit_path=args.reference_audit,
            state_dir=args.state_dir,
            output_audit_path=args.output_audit,
            version=args.version,
            dry_run=args.dry_run,
        )
    except (OSError, RuntimeError, ValueError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
