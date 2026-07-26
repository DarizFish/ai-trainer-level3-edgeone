#!/usr/bin/env python3
"""Maintain the resumable, per-question review ledger for the theory bank.

The ledger is deliberately separate from ``data/content.json``.  It records
review workflow and evidence without publishing an answer or explanation.
Nine 100-question shards keep concurrent review work reasonably isolated.

Commands:

* ``sync`` refreshes source evidence and preserves review work when the
  question/evidence fingerprints still match.
* ``validate`` detects source drift, malformed entries and stale summaries.
* ``summary`` prints review progress.
* ``update`` atomically changes the workflow fields for one question.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from theory_reference import (
    LOCAL_TO_REFERENCE_TYPE,
    question_fingerprint,
    reference_answer,
    reference_local_id,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONTENT_PATH = PROJECT_ROOT / "data" / "content.json"
DEFAULT_REFERENCE_PATH = PROJECT_ROOT / "data" / "references" / "theory-question-bank-2026-07-16.json"
DEFAULT_AUDIT_PATH = PROJECT_ROOT / "data" / "references" / "theory-reference-audit.json"
DEFAULT_STATE_DIR = PROJECT_ROOT / "data" / "references" / "theory-review-state"
DEFAULT_SCHEMA_PATH = PROJECT_ROOT / "data" / "references" / "theory-review-state.schema.json"

SCHEMA_VERSION = "1.0.0"
BATCH_ID = "theory-900-review-2026-07-26-v1"
OFFICIAL_WORD_RELATIVE_PATH = (
    "../3级评价指导手册（上网）/05-评价指导手册（上网）/"
    "第5部分_人工智能训练师_3级_理论知识模拟试卷.docx"
)
OFFICIAL_WORD_SHA256 = "f7841d937a09770b84a3273119cd4562a3159c1c00a8a429a7fd7a8b964916cd"

QUESTION_TYPES = ("judge", "single", "multi")
PROCESSING_STATUSES = {"pending", "in_progress", "needs_resolution", "reviewed", "blocked"}
EXPLANATION_STATUSES = {"pending", "in_progress", "generated", "reviewed"}
MATCH_STATUSES = {"matched", "not_found", "not_matched", "needs_review", "unavailable"}
ADOPTED_SOURCES = {
    "official_word",
    "secondary_site",
    "independent_editorial",
    "independent_review",
    "heuristic",
    "unresolved",
}
CONFLICT_STATUSES = {"none", "open", "resolved"}
CONFLICT_KINDS = {None, "answer_mismatch", "question_mismatch", "missing_evidence", "other"}
CONTENT_BASIS_TO_SOURCE = {
    "manual_official": "official_word",
    "third_party_reference": "secondary_site",
    "editorial_review": "independent_editorial",
    "heuristic": "heuristic",
}
SOURCE_TO_CONTENT_BASIS = {
    "official_word": "manual_official",
    "secondary_site": "third_party_reference",
    "independent_editorial": "editorial_review",
    "independent_review": "editorial_review",
    "heuristic": "heuristic",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"JSON 顶层必须是对象：{path}")
    return payload


def write_json_atomic(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def payload_sha256(payload: Any) -> str:
    encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def question_number(question_id: str) -> int:
    return int(question_id.rsplit("-", 1)[1])


def shard_id(question_type: str, number: int) -> str:
    start = ((number - 1) // 100) * 100 + 1
    return f"{question_type}-{start:03d}-{start + 99:03d}"


def shard_path(state_dir: Path, shard: str) -> Path:
    return state_dir / f"{shard}.json"


def valid_answer(question_type: str, options: list[Any], answer: Any) -> bool:
    if not isinstance(answer, list) or not answer or len(answer) != len(set(answer)):
        return False
    if question_type == "judge":
        allowed = {"√", "×"}
    else:
        allowed = {chr(65 + index) for index in range(len(options))}
    return all(isinstance(value, str) and value in allowed for value in answer)


def answers_equal(left: Any, right: Any) -> bool:
    return isinstance(left, list) and isinstance(right, list) and set(left) == set(right)


def adopted_source_for_review(
    entry: dict[str, Any],
    reviewed_answer: list[str],
    explicit_source: Any,
) -> str:
    official = entry["officialWordMatch"]
    secondary = entry["secondarySiteMatch"]
    if explicit_source is None:
        if official["status"] == "matched" and answers_equal(reviewed_answer, official["answer"]):
            return "official_word"
        if secondary["status"] == "matched" and answers_equal(reviewed_answer, secondary["answer"]):
            return "secondary_site"
        return "independent_review"

    if explicit_source not in ADOPTED_SOURCES - {"heuristic", "unresolved"}:
        raise ValueError("adoptedSource 非法")
    if explicit_source == "official_word" and not (
        official["status"] == "matched" and answers_equal(reviewed_answer, official["answer"])
    ):
        raise ValueError("adoptedSource=official_word 但答案与官方 Word 匹配记录不一致")
    if explicit_source == "secondary_site" and not (
        secondary["status"] == "matched" and answers_equal(reviewed_answer, secondary["answer"])
    ):
        raise ValueError("adoptedSource=secondary_site 但答案与严格匹配的次级站记录不一致")
    if explicit_source == "independent_editorial" and not (
        entry["adoptedBasis"]["contentAnswerBasis"] == "editorial_review"
        and answers_equal(reviewed_answer, entry["currentAnswer"])
    ):
        raise ValueError("adoptedSource=independent_editorial 但当前题没有对应编辑复核依据")
    return explicit_source


def source_entry(question: dict[str, Any], reference: dict[str, Any], audit: dict[str, Any]) -> dict[str, Any]:
    question_id = question["id"]
    official_ids = set(audit["_officialIds"])
    unmatched = audit["_unmatchedById"]
    differences = audit["_differenceById"]

    if question_id in official_ids:
        official_match: dict[str, Any] = {
            "status": "matched",
            "answer": list(question["answer"]),
            "matchMethod": "normalized_stem",
            "sourceQuestionId": question_id,
        }
    else:
        official_match = {
            "status": "not_found",
            "answer": None,
            "matchMethod": None,
            "sourceQuestionId": None,
        }

    reference_id = reference_local_id(reference)
    mismatch = unmatched.get(question_id)
    secondary_match = {
        "status": "not_matched" if mismatch else "matched",
        "answer": reference_answer(reference),
        "matchMethod": None if mismatch else "type_sequence_stem_options",
        "mismatchReasons": list(mismatch.get("reasons", [])) if mismatch else [],
        "sourceQuestionId": reference["id"],
    }

    difference = differences.get(question_id)
    if difference:
        conflict: dict[str, Any] = {
            "status": "open",
            "kind": "answer_mismatch",
            "sources": ["official_word", "secondary_site"],
            "details": {
                "officialWordAnswer": list(difference["manualAnswer"]),
                "secondarySiteAnswer": list(difference["referenceAnswer"]),
            },
        }
    else:
        conflict = {
            "status": "none",
            "kind": None,
            "sources": [],
            "details": None,
        }

    answer_basis = question["answerBasis"]
    adopted_source = CONTENT_BASIS_TO_SOURCE.get(answer_basis, "unresolved")
    adopted_basis = {
        "source": adopted_source,
        "contentAnswerBasis": answer_basis,
        "decisionStatus": "provisional",
        "evidence": {
            "officialWord": official_match["status"] == "matched",
            "secondarySite": secondary_match["status"] == "matched",
            "independentReview": answer_basis == "editorial_review",
        },
    }

    evidence_fingerprint = payload_sha256(
        {
            "contentAnswer": question["answer"],
            "officialWordMatch": official_match,
            "secondarySiteMatch": secondary_match,
        }
    )
    initial_status = "needs_resolution" if difference or adopted_source == "heuristic" else "pending"
    return {
        "questionId": question_id,
        "questionType": question["type"],
        "questionFingerprint": question_fingerprint(question),
        "evidenceFingerprint": evidence_fingerprint,
        "processingStatus": initial_status,
        "currentAnswer": list(question["answer"]),
        "reviewedAnswer": None,
        "officialWordMatch": official_match,
        "secondarySiteMatch": secondary_match,
        "adoptedBasis": adopted_basis,
        "conflict": conflict,
        # Existing website explanations are intentionally not imported here.
        "explanationGenerationStatus": "pending",
        "generatedExplanation": None,
        "reviewedAt": None,
        "reviewedBy": None,
        "notes": [],
        "lastUpdatedAt": None,
    }


def preserve_work(seed: dict[str, Any], existing: dict[str, Any] | None) -> dict[str, Any]:
    if not existing or existing.get("questionFingerprint") != seed["questionFingerprint"]:
        return seed
    evidence_unchanged = existing.get("evidenceFingerprint") == seed["evidenceFingerprint"]
    published_review_answer = existing.get("reviewedAnswer") == seed["currentAnswer"]
    if not evidence_unchanged and not published_review_answer:
        seed["processingStatus"] = "needs_resolution"
        seed["notes"] = ["同步时检测到依据或内容答案变化，已要求重新审阅。"]
        return seed

    for field in (
        "processingStatus",
        "currentAnswer",
        "reviewedAnswer",
        "adoptedBasis",
        "conflict",
        "explanationGenerationStatus",
        "generatedExplanation",
        "reviewedAt",
        "reviewedBy",
        "notes",
        "lastUpdatedAt",
    ):
        if field in existing:
            seed[field] = existing[field]
    if isinstance(seed.get("notes"), list):
        seed["notes"] = list(dict.fromkeys(seed["notes"]))
    return seed


def load_existing_entries(state_dir: Path) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    manifest_path = state_dir / "manifest.json"
    if not manifest_path.exists():
        return {}, {}
    manifest = read_json(manifest_path)
    entries: dict[str, dict[str, Any]] = {}
    for descriptor in manifest.get("shards", []):
        path = state_dir / str(descriptor.get("path", ""))
        if not path.exists():
            continue
        shard = read_json(path)
        for entry in shard.get("questions", []):
            if isinstance(entry, dict) and isinstance(entry.get("questionId"), str):
                entries[entry["questionId"]] = entry
    return manifest, entries


def prepare_sources(
    content_path: Path,
    reference_path: Path,
    audit_path: Path,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    content = read_json(content_path)
    reference = read_json(reference_path)
    audit = read_json(audit_path)
    theory = content.get("theory")
    reference_questions = reference.get("questions")
    if not isinstance(theory, list) or not isinstance(reference_questions, list):
        raise ValueError("内容或外站快照缺少理论题数组")
    if len(theory) != 900 or len(reference_questions) != 900:
        raise ValueError(f"理论题数量异常：content={len(theory)} reference={len(reference_questions)}")
    if len({item.get("id") for item in theory}) != 900:
        raise ValueError("content 理论题号为空或重复")

    official_ids = content.get("officialTheoryMock", {}).get("questionIds")
    if not isinstance(official_ids, list) or len(official_ids) != 190:
        raise ValueError("官方 Word 模拟试卷题号应为 190 道")
    audit["_officialIds"] = official_ids
    audit["_unmatchedById"] = {item["id"]: item for item in audit.get("unmatched", [])}
    audit["_differenceById"] = {item["id"]: item for item in audit.get("officialDifferences", [])}
    return content, reference, audit


def build_summary(entries: list[dict[str, Any]]) -> dict[str, Any]:
    def counts(field: str) -> dict[str, int]:
        return dict(sorted(Counter(str(entry[field]) for entry in entries).items()))

    return {
        "total": len(entries),
        "byQuestionType": counts("questionType"),
        "byProcessingStatus": counts("processingStatus"),
        "byOfficialWordMatch": dict(
            sorted(Counter(entry["officialWordMatch"]["status"] for entry in entries).items())
        ),
        "bySecondarySiteMatch": dict(
            sorted(Counter(entry["secondarySiteMatch"]["status"] for entry in entries).items())
        ),
        "byAdoptedBasis": dict(sorted(Counter(entry["adoptedBasis"]["source"] for entry in entries).items())),
        "byConflictStatus": dict(sorted(Counter(entry["conflict"]["status"] for entry in entries).items())),
        "byExplanationGenerationStatus": counts("explanationGenerationStatus"),
        "reviewed": sum(entry["processingStatus"] == "reviewed" for entry in entries),
        "remaining": sum(entry["processingStatus"] != "reviewed" for entry in entries),
    }


def all_entries(state_dir: Path, manifest: dict[str, Any]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for descriptor in manifest.get("shards", []):
        shard = read_json(state_dir / descriptor["path"])
        questions = shard.get("questions")
        if not isinstance(questions, list):
            raise ValueError(f"分片缺少 questions：{descriptor['path']}")
        entries.extend(questions)
    return entries


@contextmanager
def state_lock(state_dir: Path) -> Iterator[None]:
    state_dir.mkdir(parents=True, exist_ok=True)
    lock_path = state_dir / ".review-state.lock"
    try:
        descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as error:
        raise RuntimeError(f"审校状态正被其他进程更新；如进程已终止，请删除 {lock_path}") from error
    try:
        os.write(descriptor, f"{os.getpid()}\n".encode("ascii"))
        os.close(descriptor)
        yield
    finally:
        lock_path.unlink(missing_ok=True)


def sync_state(
    *,
    content_path: Path,
    reference_path: Path,
    audit_path: Path,
    state_dir: Path,
) -> dict[str, Any]:
    content, reference, audit = prepare_sources(content_path, reference_path, audit_path)
    existing_manifest, existing_entries = load_existing_entries(state_dir)
    published_review = content.get("theoryReview")
    if existing_manifest and isinstance(published_review, dict) and (
        published_review.get("batchId") == existing_manifest.get("batchId")
    ):
        manifest_path = state_dir / "manifest.json"
        if published_review.get("manifestSha256") != file_sha256(manifest_path):
            raise ValueError("已发布题库关联的审校 manifest 哈希不一致，禁止用 sync 覆盖审计证据")
        return existing_manifest
    reference_by_id = {reference_local_id(item): item for item in reference["questions"]}
    now = utc_now()

    entries: list[dict[str, Any]] = []
    for question in content["theory"]:
        reference_question = reference_by_id.get(question["id"])
        if reference_question is None:
            raise ValueError(f"外站快照缺少对应题号：{question['id']}")
        seed = source_entry(question, reference_question, audit)
        entries.append(preserve_work(seed, existing_entries.get(question["id"])))
    entries.sort(key=lambda item: (QUESTION_TYPES.index(item["questionType"]), question_number(item["questionId"])))

    descriptors: list[dict[str, Any]] = []
    by_shard: dict[str, list[dict[str, Any]]] = {}
    for entry in entries:
        key = shard_id(entry["questionType"], question_number(entry["questionId"]))
        by_shard.setdefault(key, []).append(entry)

    for key, questions in by_shard.items():
        start = question_number(questions[0]["questionId"])
        end = question_number(questions[-1]["questionId"])
        shard_payload = {
            "$schema": "../theory-review-state.schema.json",
            "schemaVersion": SCHEMA_VERSION,
            "batchId": BATCH_ID,
            "shardId": key,
            "questionType": questions[0]["questionType"],
            "range": {"start": start, "end": end},
            "updatedAt": now,
            "questions": questions,
        }
        path = shard_path(state_dir, key)
        write_json_atomic(path, shard_payload)
        descriptors.append(
            {
                "id": key,
                "path": path.name,
                "questionType": questions[0]["questionType"],
                "range": {"start": start, "end": end},
                "count": len(questions),
            }
        )

    created_at = existing_manifest.get("createdAt") if existing_manifest else now
    manifest = {
        "$schema": "../theory-review-state.schema.json",
        "schemaVersion": SCHEMA_VERSION,
        "batchId": BATCH_ID,
        "createdAt": created_at,
        "updatedAt": now,
        "content": {
            "path": "data/content.json",
            "version": content.get("version"),
            "sha256": file_sha256(content_path),
        },
        "sources": {
            "officialWord": {
                "priority": 1,
                "relativePath": OFFICIAL_WORD_RELATIVE_PATH,
                "sha256": OFFICIAL_WORD_SHA256,
                "matchMethod": "normalized_stem",
                "matchedQuestions": len(audit["_officialIds"]),
            },
            "secondarySite": {
                "priority": 2,
                "sourceUrl": reference.get("sourceUrl"),
                "snapshotVersion": reference.get("version"),
                "capturedAt": reference.get("capturedAt"),
                "sourceSha256": reference.get("sourceSha256"),
                "strictMatchedQuestions": audit.get("summary", {}).get("strictMatches"),
            },
        },
        "policy": {
            "answerPriority": ["official_word", "secondary_site", "independent_review"],
            "explanationPolicy": "independent_generation_only",
            "explanationNote": "解析必须独立生成；不得复制官方 Word 或次级站的既有解析。",
            "publishPolicy": "审校状态不直接发布；确认后另行更新 data/content.json。",
        },
        "appliedBatches": existing_manifest.get("appliedBatches", []),
        "summary": build_summary(entries),
        "shards": descriptors,
    }
    write_json_atomic(state_dir / "manifest.json", manifest)
    return manifest


def validate_entry(
    entry: dict[str, Any],
    question: dict[str, Any],
    reference: dict[str, Any],
    official_ids: set[str],
    unmatched_by_id: dict[str, Any],
) -> list[str]:
    errors: list[str] = []
    question_id = question["id"]
    required = {
        "questionId",
        "questionType",
        "questionFingerprint",
        "evidenceFingerprint",
        "processingStatus",
        "currentAnswer",
        "reviewedAnswer",
        "officialWordMatch",
        "secondarySiteMatch",
        "adoptedBasis",
        "conflict",
        "explanationGenerationStatus",
        "generatedExplanation",
        "reviewedAt",
        "reviewedBy",
        "notes",
        "lastUpdatedAt",
    }
    missing = required - set(entry)
    if missing:
        return [f"{question_id}: 缺少字段 {sorted(missing)}"]
    if entry["questionId"] != question_id or entry["questionType"] != question["type"]:
        errors.append(f"{question_id}: 题号或题型与 content 不一致")
    if entry["questionFingerprint"] != question_fingerprint(question):
        errors.append(f"{question_id}: 题干/选项指纹已过期，请运行 sync")
    if entry["processingStatus"] not in PROCESSING_STATUSES:
        errors.append(f"{question_id}: processingStatus 非法")
    if entry["explanationGenerationStatus"] not in EXPLANATION_STATUSES:
        errors.append(f"{question_id}: explanationGenerationStatus 非法")
    if not valid_answer(question["type"], question.get("options", []), entry["currentAnswer"]):
        errors.append(f"{question_id}: currentAnswer 非法")
    if entry["reviewedAnswer"] is not None and not valid_answer(
        question["type"], question.get("options", []), entry["reviewedAnswer"]
    ):
        errors.append(f"{question_id}: reviewedAnswer 非法")

    official = entry["officialWordMatch"]
    expected_official_status = "matched" if question_id in official_ids else "not_found"
    if not isinstance(official, dict) or official.get("status") not in MATCH_STATUSES:
        errors.append(f"{question_id}: officialWordMatch 非法")
    elif official["status"] != expected_official_status:
        errors.append(f"{question_id}: officialWordMatch 与官方题号清单不一致")

    secondary = entry["secondarySiteMatch"]
    expected_secondary_status = "not_matched" if question_id in unmatched_by_id else "matched"
    expected_reference_answer = reference_answer(reference)
    if not isinstance(secondary, dict) or secondary.get("status") not in MATCH_STATUSES:
        errors.append(f"{question_id}: secondarySiteMatch 非法")
    else:
        if secondary["status"] != expected_secondary_status:
            errors.append(f"{question_id}: secondarySiteMatch 与审计快照不一致")
        if secondary.get("answer") != expected_reference_answer:
            errors.append(f"{question_id}: secondarySiteMatch.answer 与快照不一致")

    adopted = entry["adoptedBasis"]
    if not isinstance(adopted, dict) or adopted.get("source") not in ADOPTED_SOURCES:
        errors.append(f"{question_id}: adoptedBasis 非法")
    elif adopted.get("decisionStatus") not in {"provisional", "confirmed"}:
        errors.append(f"{question_id}: adoptedBasis.decisionStatus 非法")
    else:
        expected_content_basis = SOURCE_TO_CONTENT_BASIS.get(adopted["source"])
        if expected_content_basis and adopted.get("contentAnswerBasis") != expected_content_basis:
            errors.append(
                f"{question_id}: adoptedBasis.contentAnswerBasis 与 adoptedBasis.source 不一致"
            )

    conflict = entry["conflict"]
    if not isinstance(conflict, dict) or conflict.get("status") not in CONFLICT_STATUSES:
        errors.append(f"{question_id}: conflict 非法")
    elif conflict.get("kind") not in CONFLICT_KINDS:
        errors.append(f"{question_id}: conflict.kind 非法")

    for field in ("reviewedAt", "lastUpdatedAt"):
        value = entry[field]
        if value is not None and not isinstance(value, str):
            errors.append(f"{question_id}: {field} 必须是 ISO 时间或 null")
    if entry["reviewedBy"] is not None and not isinstance(entry["reviewedBy"], str):
        errors.append(f"{question_id}: reviewedBy 必须是字符串或 null")
    if not isinstance(entry["notes"], list) or any(not isinstance(note, str) for note in entry["notes"]):
        errors.append(f"{question_id}: notes 必须是字符串数组")
    elif len(entry["notes"]) != len(set(entry["notes"])):
        errors.append(f"{question_id}: notes 含重复记录")
    explanation = entry["generatedExplanation"]
    if explanation is not None:
        if not isinstance(explanation, str) or not explanation.strip():
            errors.append(f"{question_id}: generatedExplanation 必须是非空字符串或 null")
        elif explanation.strip() == str(reference.get("explanation", "")).strip():
            errors.append(f"{question_id}: generatedExplanation 不得逐字复制次级站解析")
    if entry["explanationGenerationStatus"] in {"generated", "reviewed"} and not (
        isinstance(explanation, str) and explanation.strip()
    ):
        errors.append(f"{question_id}: 解析状态已生成但 generatedExplanation 为空")
    if entry["processingStatus"] == "reviewed" and entry["reviewedAnswer"] is None:
        errors.append(f"{question_id}: 已审阅但 reviewedAnswer 为空")
    return errors


def validate_state(
    *,
    content_path: Path,
    reference_path: Path,
    audit_path: Path,
    state_dir: Path,
) -> dict[str, Any]:
    content, reference, audit = prepare_sources(content_path, reference_path, audit_path)
    manifest_path = state_dir / "manifest.json"
    manifest = read_json(manifest_path)
    errors: list[str] = []
    if manifest.get("schemaVersion") != SCHEMA_VERSION or manifest.get("batchId") != BATCH_ID:
        errors.append("manifest schemaVersion 或 batchId 不一致")
    current_content_sha256 = file_sha256(content_path)
    baseline_content_matches = manifest.get("content", {}).get("sha256") == current_content_sha256
    published_review = content.get("theoryReview")
    published_content_matches = (
        isinstance(published_review, dict)
        and published_review.get("batchId") == manifest.get("batchId")
        and published_review.get("manifestSha256") == file_sha256(manifest_path)
    )
    if not baseline_content_matches and not published_content_matches:
        errors.append("data/content.json 已变化且无法关联到本审校批次，请先运行 sync")
    if manifest.get("sources", {}).get("secondarySite", {}).get("sourceSha256") != reference.get("sourceSha256"):
        errors.append("次级站快照已变化，请先运行 sync")
    if manifest.get("policy", {}).get("explanationPolicy") != "independent_generation_only":
        errors.append("解析策略必须是 independent_generation_only")

    entries = all_entries(state_dir, manifest)
    by_entry_id = {entry.get("questionId"): entry for entry in entries if isinstance(entry, dict)}
    if len(entries) != 900 or len(by_entry_id) != 900:
        errors.append(f"逐题状态应为 900 条且题号唯一，实际 {len(entries)} / {len(by_entry_id)}")
    content_by_id = {question["id"]: question for question in content["theory"]}
    reference_by_id = {reference_local_id(item): item for item in reference["questions"]}
    if set(by_entry_id) != set(content_by_id):
        errors.append("逐题状态题号集合与 content 不一致")
    else:
        for question_id, question in content_by_id.items():
            errors.extend(
                validate_entry(
                    by_entry_id[question_id],
                    question,
                    reference_by_id[question_id],
                    set(audit["_officialIds"]),
                    audit["_unmatchedById"],
                )
            )
            if published_content_matches:
                entry = by_entry_id[question_id]
                if entry.get("reviewedAnswer") != question.get("answer"):
                    errors.append(f"{question_id}: 已发布答案与审校账本不一致")
                if str(entry.get("generatedExplanation", "")).strip() != str(
                    question.get("explanation", "")
                ).strip():
                    errors.append(f"{question_id}: 已发布解析与审校账本不一致")
                expected_basis = SOURCE_TO_CONTENT_BASIS.get(
                    entry.get("adoptedBasis", {}).get("source")
                )
                if expected_basis and question.get("answerBasis") != expected_basis:
                    errors.append(f"{question_id}: 已发布 answerBasis 与审校依据不一致")

    actual_summary = build_summary(entries)
    if manifest.get("summary") != actual_summary:
        errors.append("manifest.summary 与逐题状态不一致")
    descriptor_count = sum(int(item.get("count", 0)) for item in manifest.get("shards", []))
    if len(manifest.get("shards", [])) != 9 or descriptor_count != 900:
        errors.append("manifest 必须登记 9 个、合计 900 道题的分片")
    valid_shard_ids = {item.get("id") for item in manifest.get("shards", [])}
    applied_records = manifest.get("appliedBatches", [])
    seen_applied_keys: set[tuple[str, str]] = set()
    generation_reviewers_by_shard: dict[str, set[str]] = {}
    for record in applied_records:
        if not isinstance(record, dict):
            errors.append("manifest.appliedBatches 含非对象记录")
            continue
        batch_id = record.get("batchId")
        record_shard_id = record.get("shardId")
        stage = record.get("reviewStage")
        reviewers = record.get("reviewers")
        key = (str(batch_id), str(record_shard_id))
        if key in seen_applied_keys:
            errors.append(f"manifest.appliedBatches 重复：{batch_id} / {record_shard_id}")
        seen_applied_keys.add(key)
        if record_shard_id not in valid_shard_ids:
            errors.append(f"manifest.appliedBatches 分片非法：{record_shard_id}")
        if stage not in {"generation", "qa"}:
            errors.append(f"{record_shard_id}: reviewStage 必须是 generation 或 qa")
        if not isinstance(reviewers, list) or not reviewers or any(
            not isinstance(reviewer, str) or not reviewer.strip() for reviewer in reviewers
        ):
            errors.append(f"{record_shard_id}: appliedBatches.reviewers 必须是非空字符串数组")
            reviewer_set: set[str] = set()
        else:
            reviewer_set = set(reviewers)
            if len(reviewer_set) != len(reviewers):
                errors.append(f"{record_shard_id}: appliedBatches.reviewers 不得重复")
        if stage == "generation":
            generation_reviewers_by_shard.setdefault(str(record_shard_id), set()).update(
                reviewer_set
            )
        elif stage == "qa":
            generation_reviewers = generation_reviewers_by_shard.get(str(record_shard_id), set())
            if not generation_reviewers:
                errors.append(f"{record_shard_id}: QA 记录之前缺少一审 reviewer")
            overlap = sorted(generation_reviewers & reviewer_set)
            if overlap:
                errors.append(
                    f"{record_shard_id}: QA reviewer 与一审重复：{', '.join(overlap)}"
                )
    if errors:
        raise ValueError("审校状态校验失败：\n- " + "\n- ".join(errors[:50]))
    return actual_summary


def find_entry(state_dir: Path, manifest: dict[str, Any], question_id: str) -> tuple[Path, dict[str, Any], dict[str, Any]]:
    match = re.fullmatch(r"(judge|single|multi)-(\d{3})", question_id)
    if not match or not 1 <= int(match.group(2)) <= 300:
        raise ValueError(f"题号非法：{question_id}")
    target_shard = shard_id(match.group(1), int(match.group(2)))
    descriptor = next((item for item in manifest["shards"] if item["id"] == target_shard), None)
    if descriptor is None:
        raise ValueError(f"manifest 缺少分片：{target_shard}")
    path = state_dir / descriptor["path"]
    shard = read_json(path)
    entry = next((item for item in shard["questions"] if item["questionId"] == question_id), None)
    if entry is None:
        raise ValueError(f"分片缺少题号：{question_id}")
    return path, shard, entry


def update_entry(args: argparse.Namespace) -> dict[str, Any]:
    manifest_path = args.state_dir / "manifest.json"
    manifest = read_json(manifest_path)
    path, shard, entry = find_entry(args.state_dir, manifest, args.question_id)
    changed = False

    if args.processing_status is not None:
        entry["processingStatus"] = args.processing_status
        changed = True
    if args.reviewed_answer is not None:
        answer = json.loads(args.reviewed_answer)
        if not isinstance(answer, list):
            raise ValueError("--reviewed-answer 必须是 JSON 数组，例如 '[\"A\"]'")
        entry["reviewedAnswer"] = answer
        changed = True
    if args.adopted_source is not None:
        entry["adoptedBasis"]["source"] = args.adopted_source
        content_basis = SOURCE_TO_CONTENT_BASIS.get(args.adopted_source)
        if content_basis is not None:
            entry["adoptedBasis"]["contentAnswerBasis"] = content_basis
        entry["adoptedBasis"]["decisionStatus"] = args.decision_status or "confirmed"
        entry["adoptedBasis"]["evidence"]["independentReview"] = args.adopted_source in {
            "independent_editorial",
            "independent_review",
        }
        changed = True
    elif args.decision_status is not None:
        entry["adoptedBasis"]["decisionStatus"] = args.decision_status
        changed = True
    if args.explanation_status is not None:
        entry["explanationGenerationStatus"] = args.explanation_status
        changed = True
    if args.generated_explanation is not None:
        explanation = args.generated_explanation.strip()
        if not explanation:
            raise ValueError("--generated-explanation 不得为空")
        entry["generatedExplanation"] = explanation
        changed = True
    if args.conflict_status is not None:
        entry["conflict"]["status"] = args.conflict_status
        changed = True
    if args.reviewed_by is not None:
        entry["reviewedBy"] = args.reviewed_by
        changed = True
    if args.note is not None:
        entry["notes"].append(args.note)
        changed = True
    if not changed:
        raise ValueError("update 至少需要一个变更参数")

    now = utc_now()
    entry["lastUpdatedAt"] = now
    if args.reviewed_at is not None:
        entry["reviewedAt"] = now if args.reviewed_at == "now" else args.reviewed_at
    elif args.processing_status == "reviewed":
        entry["reviewedAt"] = now
    shard["updatedAt"] = now
    write_json_atomic(path, shard)

    entries = all_entries(args.state_dir, manifest)
    manifest["summary"] = build_summary(entries)
    manifest["updatedAt"] = now
    write_json_atomic(manifest_path, manifest)
    return entry


def apply_review_batch(args: argparse.Namespace) -> dict[str, Any]:
    """Validate a review payload fully, then replace affected shards and manifest."""

    validate_state(
        content_path=args.content,
        reference_path=args.reference,
        audit_path=args.audit,
        state_dir=args.state_dir,
    )
    content, reference, audit = prepare_sources(args.content, args.reference, args.audit)
    manifest_path = args.state_dir / "manifest.json"
    manifest = read_json(manifest_path)
    batch = read_json(args.input)
    batch_id = batch.get("batchId")
    reviews = batch.get("reviews")
    review_stage = batch.get("reviewStage", "generation")
    if batch.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"批量审校 schemaVersion 必须是 {SCHEMA_VERSION}")
    if review_stage not in {"generation", "qa"}:
        raise ValueError("批量审校 reviewStage 必须是 generation 或 qa")
    if not isinstance(batch_id, str) or not batch_id.strip():
        raise ValueError("批量审校文件缺少非空 batchId")
    if not isinstance(reviews, list) or not reviews:
        raise ValueError("批量审校文件缺少非空 reviews 数组")
    if len(reviews) > 100:
        raise ValueError("单个审校批次最多 100 题，请按状态分片提交")
    review_ids = [item.get("questionId") for item in reviews if isinstance(item, dict)]
    if len(review_ids) != len(reviews) or len(review_ids) != len(set(review_ids)):
        raise ValueError("批量审校 reviews 含非对象、空题号或重复题号")
    default_reviewer = batch.get("reviewedBy")
    reviewers = sorted(
        {
            str(item.get("reviewedBy") or default_reviewer).strip()
            for item in reviews
            if isinstance(item, dict) and str(item.get("reviewedBy") or default_reviewer).strip()
        }
    )
    if not reviewers or any(
        not isinstance(item.get("reviewedBy") or default_reviewer, str)
        or not str(item.get("reviewedBy") or default_reviewer).strip()
        for item in reviews
    ):
        raise ValueError("批量审校的每道题都必须能解析到非空 reviewedBy")
    derived_shard_ids = {
        shard_id(question_id.rsplit("-", 1)[0], question_number(question_id))
        for question_id in review_ids
        if isinstance(question_id, str) and re.fullmatch(r"(?:judge|single|multi)-\d{3}", question_id)
    }
    if len(derived_shard_ids) != 1:
        raise ValueError("一个审校批次必须且只能对应一个 100 题状态分片")
    review_shard_id = next(iter(derived_shard_ids))
    declared_shard_id = batch.get("shardId")
    if declared_shard_id is not None and declared_shard_id != review_shard_id:
        raise ValueError(f"批次 shardId 与题号范围不一致：{declared_shard_id} != {review_shard_id}")
    if any(
        item.get("batchId") == batch_id and item.get("shardId") == review_shard_id
        for item in manifest.get("appliedBatches", [])
    ):
        raise ValueError(f"批次分片已应用，拒绝重复导入：{batch_id} / {review_shard_id}")
    if review_stage == "qa":
        generation_records = [
            item
            for item in manifest.get("appliedBatches", [])
            if item.get("shardId") == review_shard_id
            and item.get("reviewStage", "generation") == "generation"
        ]
        if not generation_records:
            raise ValueError(f"{review_shard_id}: 交叉复核前必须存在一审批次记录")
        generation_reviewers = {
            reviewer
            for item in generation_records
            for reviewer in item.get("reviewers", [])
            if isinstance(reviewer, str) and reviewer.strip()
        }
        if not generation_reviewers:
            raise ValueError(f"{review_shard_id}: 一审批次缺少 reviewer 追踪信息")
        overlapping_reviewers = sorted(generation_reviewers & set(reviewers))
        if overlapping_reviewers:
            raise ValueError(
                f"{review_shard_id}: 交叉复核者必须独立于一审，重复 reviewer："
                + ", ".join(overlapping_reviewers)
            )

    content_by_id = {question["id"]: question for question in content["theory"]}
    reference_by_id = {reference_local_id(item): item for item in reference["questions"]}
    official_ids = set(audit["_officialIds"])
    unmatched_by_id = audit["_unmatchedById"]
    descriptors = {item["id"]: item for item in manifest["shards"]}
    affected_ids = derived_shard_ids
    if len(affected_ids) == 0:
        raise ValueError("批量审校文件不含合法题号")

    shards: dict[str, dict[str, Any]] = {}
    originals: dict[Path, dict[str, Any]] = {manifest_path: copy.deepcopy(manifest)}
    for target_id in affected_ids:
        descriptor = descriptors.get(target_id)
        if descriptor is None:
            raise ValueError(f"manifest 缺少分片：{target_id}")
        path = args.state_dir / descriptor["path"]
        shard = read_json(path)
        shards[target_id] = shard
        originals[path] = copy.deepcopy(shard)

    now = utc_now()
    for review in reviews:
        question_id = review["questionId"]
        question = content_by_id.get(question_id)
        reference_question = reference_by_id.get(question_id)
        if question is None or reference_question is None:
            raise ValueError(f"批次题号不在当前 900 题中：{question_id}")
        target_id = shard_id(question["type"], question_number(question_id))
        entry = next(
            (item for item in shards[target_id]["questions"] if item["questionId"] == question_id),
            None,
        )
        if entry is None:
            raise ValueError(f"状态分片缺少题号：{question_id}")
        if review.get("questionFingerprint") != entry["questionFingerprint"]:
            raise ValueError(f"{question_id}: questionFingerprint 不一致，禁止导入过期审校结果")
        if review_stage == "qa" and not (
            entry["processingStatus"] == "reviewed"
            and entry["explanationGenerationStatus"] in {"generated", "reviewed"}
            and isinstance(entry["generatedExplanation"], str)
            and entry["generatedExplanation"].strip()
        ):
            raise ValueError(f"{question_id}: 交叉复核前必须已有完整的一审答案与解析")

        reviewed_answer = review.get("reviewedAnswer")
        if not valid_answer(question["type"], question.get("options", []), reviewed_answer):
            raise ValueError(f"{question_id}: reviewedAnswer 非法")
        explanation = review.get("generatedExplanation")
        if not isinstance(explanation, str) or not explanation.strip():
            raise ValueError(f"{question_id}: generatedExplanation 不能为空")
        explanation = explanation.strip()
        if explanation == str(reference_question.get("explanation", "")).strip():
            raise ValueError(f"{question_id}: generatedExplanation 不得逐字复制次级站解析")
        reviewed_by = review.get("reviewedBy") or batch.get("reviewedBy")
        if not isinstance(reviewed_by, str) or not reviewed_by.strip():
            raise ValueError(f"{question_id}: reviewedBy 不能为空")
        notes = review.get("notes")
        if not isinstance(notes, list) or any(not isinstance(note, str) for note in notes):
            raise ValueError(f"{question_id}: notes 必须是字符串数组")
        try:
            adopted_source = adopted_source_for_review(entry, reviewed_answer, review.get("adoptedSource"))
        except ValueError as error:
            raise ValueError(f"{question_id}: {error}") from error
        resolve_conflict = review.get("resolveConflict", False)
        if not isinstance(resolve_conflict, bool):
            raise ValueError(f"{question_id}: resolveConflict 必须是布尔值")
        if entry["conflict"]["status"] == "open" and not resolve_conflict:
            raise ValueError(f"{question_id}: 存在开放冲突，批次必须显式设置 resolveConflict=true")

        entry["reviewedAnswer"] = reviewed_answer
        entry["generatedExplanation"] = explanation
        entry["processingStatus"] = "reviewed"
        entry["explanationGenerationStatus"] = "reviewed" if review_stage == "qa" else "generated"
        entry["reviewedAt"] = review.get("reviewedAt") or now
        entry["reviewedBy"] = reviewed_by.strip()
        for note in notes:
            if note and note not in entry["notes"]:
                entry["notes"].append(note)
        if review_stage == "qa":
            qa_note = f"交叉复核通过：{reviewed_by.strip()}"
            if qa_note not in entry["notes"]:
                entry["notes"].append(qa_note)
        entry["lastUpdatedAt"] = now
        entry["adoptedBasis"]["source"] = adopted_source
        entry["adoptedBasis"]["contentAnswerBasis"] = SOURCE_TO_CONTENT_BASIS[adopted_source]
        entry["adoptedBasis"]["decisionStatus"] = "confirmed"
        entry["adoptedBasis"]["evidence"]["independentReview"] = adopted_source in {
            "independent_editorial",
            "independent_review",
        }
        if resolve_conflict and entry["conflict"]["status"] == "open":
            entry["conflict"]["status"] = "resolved"

        entry_errors = validate_entry(
            entry,
            question,
            reference_question,
            official_ids,
            unmatched_by_id,
        )
        if entry_errors:
            raise ValueError("批次条目校验失败：\n- " + "\n- ".join(entry_errors))

    for shard in shards.values():
        shard["updatedAt"] = now
    all_current_entries: list[dict[str, Any]] = []
    for descriptor in manifest["shards"]:
        target_id = descriptor["id"]
        shard = shards.get(target_id) or read_json(args.state_dir / descriptor["path"])
        all_current_entries.extend(shard["questions"])
    manifest["summary"] = build_summary(all_current_entries)
    manifest["updatedAt"] = now
    manifest.setdefault("appliedBatches", []).append(
        {
            "batchId": batch_id,
            "shardId": review_shard_id,
            "inputSha256": file_sha256(args.input),
            "appliedAt": now,
            "count": len(reviews),
            "reviewStage": review_stage,
            "reviewers": reviewers,
        }
    )

    staged: list[tuple[Path, Path]] = []
    try:
        for target_id, shard in shards.items():
            target = args.state_dir / descriptors[target_id]["path"]
            temporary = target.with_suffix(target.suffix + ".batch.tmp")
            temporary.write_text(json.dumps(shard, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            staged.append((temporary, target))
        manifest_temporary = manifest_path.with_suffix(manifest_path.suffix + ".batch.tmp")
        manifest_temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        staged.append((manifest_temporary, manifest_path))
        for temporary, target in staged:
            os.replace(temporary, target)
        summary = validate_state(
            content_path=args.content,
            reference_path=args.reference,
            audit_path=args.audit,
            state_dir=args.state_dir,
        )
    except Exception:
        for temporary, _ in staged:
            temporary.unlink(missing_ok=True)
        for target, original in originals.items():
            write_json_atomic(target, original)
        raise
    return {
        "batchId": batch_id,
        "shardId": review_shard_id,
        "applied": len(reviews),
        "summary": summary,
    }


def add_common_paths(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--content", type=Path, default=DEFAULT_CONTENT_PATH)
    parser.add_argument("--reference", type=Path, default=DEFAULT_REFERENCE_PATH)
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT_PATH)
    parser.add_argument("--state-dir", type=Path, default=DEFAULT_STATE_DIR)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    for name in ("sync", "validate", "summary"):
        command = subparsers.add_parser(name)
        add_common_paths(command)

    update = subparsers.add_parser("update")
    add_common_paths(update)
    update.add_argument("question_id")
    update.add_argument("--processing-status", choices=sorted(PROCESSING_STATUSES))
    update.add_argument(
        "--reviewed-answer",
        "--answer",
        dest="reviewed_answer",
        help='复核结论的 JSON 数组，例如 ["A"] 或 ["A","C"]；不覆盖 currentAnswer',
    )
    update.add_argument("--adopted-source", choices=sorted(ADOPTED_SOURCES))
    update.add_argument("--decision-status", choices=("provisional", "confirmed"))
    update.add_argument("--explanation-status", choices=sorted(EXPLANATION_STATUSES))
    update.add_argument("--generated-explanation", help="本轮独立生成的解析正文")
    update.add_argument("--conflict-status", choices=sorted(CONFLICT_STATUSES))
    update.add_argument("--reviewed-at", help="ISO 时间；传 now 使用当前时间")
    update.add_argument("--reviewed-by")
    update.add_argument("--note")

    apply_batch = subparsers.add_parser("apply-batch")
    add_common_paths(apply_batch)
    apply_batch.add_argument("--input", type=Path, required=True, help="逐题审校批次 JSON")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "summary":
        manifest = read_json(args.state_dir / "manifest.json")
        print(json.dumps(manifest["summary"], ensure_ascii=False, indent=2))
        return
    if args.command == "validate":
        summary = validate_state(
            content_path=args.content,
            reference_path=args.reference,
            audit_path=args.audit,
            state_dir=args.state_dir,
        )
        print(json.dumps({"valid": True, "summary": summary}, ensure_ascii=False, indent=2))
        return
    with state_lock(args.state_dir):
        if args.command == "sync":
            manifest = sync_state(
                content_path=args.content,
                reference_path=args.reference,
                audit_path=args.audit,
                state_dir=args.state_dir,
            )
            print(json.dumps({"stateDir": str(args.state_dir), "summary": manifest["summary"]}, ensure_ascii=False, indent=2))
        elif args.command == "apply-batch":
            result = apply_review_batch(args)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            entry = update_entry(args)
            validate_state(
                content_path=args.content,
                reference_path=args.reference,
                audit_path=args.audit,
                state_dir=args.state_dir,
            )
            print(json.dumps(entry, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
