#!/usr/bin/env python3
"""Quality gate for independently reviewed theory answers and explanations."""

from __future__ import annotations

import argparse
import difflib
import json
import re
import statistics
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from theory_reference import reference_local_id
from theory_review_state import (
    DEFAULT_AUDIT_PATH,
    DEFAULT_CONTENT_PATH,
    DEFAULT_REFERENCE_PATH,
    DEFAULT_STATE_DIR,
    validate_state,
)


BANNED_SOURCE_MARKERS = (
    "119.28.189.105",
    "乔木老师",
    "次级站",
    "外站解析",
    "答案来自指导手册",
    "答案来自参考",
)


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"JSON 顶层必须是对象：{path}")
    return payload


def normalized_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    return re.sub(r"[\W_]+", "", value, flags=re.UNICODE).lower()


def load_entries(state_dir: Path) -> list[dict[str, Any]]:
    manifest = read_json(state_dir / "manifest.json")
    entries: list[dict[str, Any]] = []
    for descriptor in manifest["shards"]:
        shard = read_json(state_dir / descriptor["path"])
        entries.extend(shard["questions"])
    return entries


def build_report(
    *,
    content_path: Path,
    reference_path: Path,
    audit_path: Path,
    state_dir: Path,
    require_complete: bool,
) -> tuple[dict[str, Any], list[str]]:
    validate_state(
        content_path=content_path,
        reference_path=reference_path,
        audit_path=audit_path,
        state_dir=state_dir,
    )
    content = read_json(content_path)
    reference = read_json(reference_path)
    entries = load_entries(state_dir)
    manifest = read_json(state_dir / "manifest.json")
    published_review = content.get("theoryReview")
    content_is_published_review = (
        isinstance(published_review, dict)
        and published_review.get("batchId") == manifest.get("batchId")
    )
    questions = {question["id"]: question for question in content["theory"]}
    reference_questions = {
        reference_local_id(question): question for question in reference["questions"]
    }
    normalized_external_explanations: dict[str, list[str]] = defaultdict(list)
    normalized_existing_explanations: dict[str, list[str]] = defaultdict(list)
    for question_id, reference_question in reference_questions.items():
        external_normalized = normalized_text(
            str(reference_question.get("explanation", "")).strip()
        )
        if external_normalized:
            normalized_external_explanations[external_normalized].append(question_id)
    if not content_is_published_review:
        for question_id, question in questions.items():
            existing_normalized = normalized_text(str(question.get("explanation", "")).strip())
            if existing_normalized:
                normalized_existing_explanations[existing_normalized].append(question_id)

    errors: list[str] = []
    warnings: list[dict[str, Any]] = []
    answer_changes: list[dict[str, Any]] = []
    generated: list[dict[str, Any]] = []
    normalized_groups: dict[str, list[str]] = defaultdict(list)
    similarities: list[tuple[float, str]] = []

    for entry in entries:
        question_id = entry["questionId"]
        question = questions[question_id]
        reference_question = reference_questions[question_id]
        reviewed_answer = entry["reviewedAnswer"]
        explanation = entry["generatedExplanation"]

        if reviewed_answer is not None and set(reviewed_answer) != set(entry["currentAnswer"]):
            answer_changes.append(
                {
                    "questionId": question_id,
                    "from": entry["currentAnswer"],
                    "to": reviewed_answer,
                    "adoptedSource": entry["adoptedBasis"]["source"],
                }
            )

        official = entry["officialWordMatch"]
        if official["status"] == "matched" and reviewed_answer is not None:
            if set(reviewed_answer) != set(official["answer"]):
                errors.append(f"{question_id}: 独立审校改动了官方 Word 答案")

        if explanation is None:
            continue
        generated.append(entry)
        stripped = explanation.strip()
        length = len(stripped)
        if length < 24:
            errors.append(f"{question_id}: 解析过短（{length} 字符）")
        if length > 260:
            warnings.append(
                {"questionId": question_id, "kind": "long_explanation", "length": length}
            )
        if any(marker in stripped for marker in BANNED_SOURCE_MARKERS):
            errors.append(f"{question_id}: 解析包含来源或复用提示语")

        normalized = normalized_text(stripped)
        normalized_groups[normalized].append(question_id)
        if normalized in normalized_external_explanations:
            source_ids = ", ".join(normalized_external_explanations[normalized][:5])
            errors.append(f"{question_id}: 解析规范化后复制了次级站文本（{source_ids}）")
        if normalized in normalized_existing_explanations:
            source_ids = ", ".join(normalized_existing_explanations[normalized][:5])
            errors.append(f"{question_id}: 解析规范化后复用了原题库文本（{source_ids}）")
        if question.get("type") == "multi":
            option_labels = [chr(65 + index) for index in range(len(question.get("options", [])))]
            missing_labels = [
                label
                for label in option_labels
                if not re.search(
                    rf"(?<![A-Z]){re.escape(label)}(?![A-Z])",
                    stripped,
                )
            ]
            if missing_labels:
                errors.append(
                    f"{question_id}: 多选题解析未逐项说明 {', '.join(missing_labels)}"
                )
        external = str(reference_question.get("explanation", "")).strip()
        old = str(question.get("explanation", "")).strip()
        if stripped == external:
            errors.append(f"{question_id}: 解析逐字复制次级站")
        if not content_is_published_review and stripped == old:
            errors.append(f"{question_id}: 解析逐字复用原题库")
        ratio = difflib.SequenceMatcher(None, stripped, external).ratio()
        similarities.append((ratio, question_id))
        if length >= 30 and ratio >= 0.92:
            errors.append(f"{question_id}: 解析与次级站文本高度相似（{ratio:.3f}）")
        elif length >= 30 and ratio >= 0.78:
            warnings.append(
                {
                    "questionId": question_id,
                    "kind": "external_similarity",
                    "ratio": round(ratio, 3),
                }
            )

    duplicate_groups = [
        ids for normalized, ids in normalized_groups.items() if normalized and len(ids) > 1
    ]
    for ids in duplicate_groups:
        errors.append(f"解析重复：{', '.join(ids)}")

    if require_complete:
        if len(generated) != 900:
            errors.append(f"解析尚未全部生成：{len(generated)}/900")
        if sum(entry["processingStatus"] == "reviewed" for entry in entries) != 900:
            errors.append("仍有题目未完成答案审校")
        if sum(
            entry["explanationGenerationStatus"] == "reviewed" for entry in entries
        ) != 900:
            errors.append("仍有解析未完成交叉复核")
        if any(entry["conflict"]["status"] == "open" for entry in entries):
            errors.append("仍有来源冲突未解决")

    lengths = [len(entry["generatedExplanation"].strip()) for entry in generated]
    status_counts = Counter(entry["processingStatus"] for entry in entries)
    explanation_status_counts = Counter(
        entry["explanationGenerationStatus"] for entry in entries
    )
    basis_counts = Counter(entry["adoptedBasis"]["source"] for entry in entries)
    similarities.sort(reverse=True)
    report = {
        "total": len(entries),
        "reviewed": status_counts["reviewed"],
        "generatedExplanations": len(generated),
        "crossReviewedExplanations": explanation_status_counts["reviewed"],
        "answerChanges": len(answer_changes),
        "officialAnswerChanges": sum(
            item["questionId"] in {
                entry["questionId"]
                for entry in entries
                if entry["officialWordMatch"]["status"] == "matched"
            }
            for item in answer_changes
        ),
        "byProcessingStatus": dict(sorted(status_counts.items())),
        "byExplanationStatus": dict(sorted(explanation_status_counts.items())),
        "byAdoptedBasis": dict(sorted(basis_counts.items())),
        "explanationLength": (
            {
                "minimum": min(lengths),
                "median": statistics.median(lengths),
                "maximum": max(lengths),
                "mean": round(statistics.mean(lengths), 2),
            }
            if lengths
            else None
        ),
        "duplicateExplanationGroups": duplicate_groups,
        "highestExternalSimilarities": [
            {"questionId": question_id, "ratio": round(ratio, 3)}
            for ratio, question_id in similarities[:10]
        ],
        "warnings": warnings,
        "answerChangeDetails": answer_changes,
        "errors": errors,
    }
    return report, errors


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--content", type=Path, default=DEFAULT_CONTENT_PATH)
    parser.add_argument("--reference", type=Path, default=DEFAULT_REFERENCE_PATH)
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT_PATH)
    parser.add_argument("--state-dir", type=Path, default=DEFAULT_STATE_DIR)
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()
    report, errors = build_report(
        content_path=args.content,
        reference_path=args.reference,
        audit_path=args.audit,
        state_dir=args.state_dir,
        require_complete=args.require_complete,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
