#!/usr/bin/env python3
"""Snapshot and safely apply the third-party theory reference bank.

The external site is never queried at build or runtime. A maintainer explicitly
creates a versioned snapshot, then this module applies answers only when type,
type-local sequence number, normalized stem, and options all match.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "http://119.28.189.105/questions.js"
SNAPSHOT_VERSION = "2026-07-16-v1"
CONTENT_VERSION = "2026-07-19-v7"
DEFAULT_REFERENCE_PATH = PROJECT_ROOT / "data" / "references" / "theory-question-bank-2026-07-16.json"
DEFAULT_AUDIT_PATH = PROJECT_ROOT / "data" / "references" / "theory-reference-audit.json"
DEFAULT_EDITORIAL_REVIEW_PATH = PROJECT_ROOT / "data" / "references" / "theory-editorial-review-2026-07-17.json"
REFERENCE_TO_LOCAL_TYPE = {"boolean": "judge", "single": "single", "multiple": "multi"}
LOCAL_TO_REFERENCE_TYPE = {value: key for key, value in REFERENCE_TO_LOCAL_TYPE.items()}


def compact(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value))


def strip_number(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).strip()
    value = re.sub(r"^[（(]\s*[）)]\s*", "", value)
    value = re.sub(r"^.*?\d+\s*[.、]\s*", "", value, count=1)
    return value.strip()


def normalize_stem(value: str) -> str:
    value = strip_number(value)
    # Some public-bank multiple-choice stems contain their answer key inside the
    # otherwise blank answer slot, for example ``( D E )``. Ignore only slots
    # containing two or more A-E letters separated by whitespace/punctuation;
    # ordinary abbreviations such as (AI) and (HPC) remain significant.
    value = re.sub(r"[(（]\s*[A-E](?:[\s,，、/]+[A-E])+\s*[)）]", "()", value)
    return compact(value).replace("(", "").replace(")", "")


def normalize_option(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).strip()
    value = re.sub(r"^[（(]\s*[A-E]\s*[）)]\s*", "", value)
    return compact(value)


def extract_question_bank(source: bytes) -> list[dict[str, Any]]:
    text = source.decode("utf-8-sig")
    match = re.search(r"window\.QUESTION_BANK\s*=\s*(\[.*\])\s*;?\s*$", text, re.S)
    if not match:
        raise ValueError("questions.js 中未找到 window.QUESTION_BANK")
    questions = json.loads(match.group(1))
    if not isinstance(questions, list):
        raise ValueError("QUESTION_BANK 必须是数组")
    return questions


def validate_reference_questions(questions: list[dict[str, Any]]) -> None:
    type_counts = Counter(question.get("type") for question in questions)
    expected = {"boolean": 300, "single": 300, "multiple": 300}
    if len(questions) != 900 or type_counts != expected:
        raise ValueError(f"参考题库数量异常：{len(questions)} / {dict(type_counts)}")
    ids = set()
    for question in questions:
        question_id = question.get("id")
        kind = question.get("type")
        if not isinstance(question_id, str) or not re.fullmatch(r"(?:boolean|single|multiple)-\d{3}", question_id):
            raise ValueError(f"参考题号异常：{question_id!r}")
        if question_id in ids or not question_id.startswith(f"{kind}-"):
            raise ValueError(f"参考题号重复或题型不一致：{question_id}")
        ids.add(question_id)
        options = question.get("options")
        answer = question.get("answer")
        if not isinstance(options, list) or not isinstance(answer, list) or not answer:
            raise ValueError(f"参考题选项或答案异常：{question_id}")
        if kind == "boolean":
            valid_indices = {0, 1}
        else:
            valid_indices = set(range(len(options)))
        if not set(answer) <= valid_indices:
            raise ValueError(f"参考题答案越界：{question_id} {answer}")
        if not str(question.get("question", "")).strip() or not str(question.get("explanation", "")).strip():
            raise ValueError(f"参考题题干或解析为空：{question_id}")


def load_reference(path: Path = DEFAULT_REFERENCE_PATH) -> dict[str, Any]:
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    questions = snapshot.get("questions")
    if not isinstance(questions, list):
        raise ValueError(f"参考快照缺少 questions：{path}")
    validate_reference_questions(questions)
    return snapshot


def reference_local_id(question: dict[str, Any]) -> str:
    reference_type = question["type"]
    local_type = REFERENCE_TO_LOCAL_TYPE[reference_type]
    sequence = int(question["id"].rsplit("-", 1)[1])
    return f"{local_type}-{sequence:03d}"


def reference_answer(question: dict[str, Any]) -> list[str]:
    if question["type"] == "boolean":
        return ["\u221a" if index == 0 else "\u00d7" for index in question["answer"]]
    return [chr(65 + index) for index in question["answer"]]


def local_answer_indices(question: dict[str, Any]) -> list[int]:
    if question["type"] == "judge":
        return [0 if answer == "\u221a" else 1 for answer in question["answer"]]
    return [ord(answer) - 65 for answer in question["answer"]]


def strict_match(local: dict[str, Any], reference: dict[str, Any]) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    expected_reference_type = LOCAL_TO_REFERENCE_TYPE.get(local.get("type"))
    if reference.get("type") != expected_reference_type:
        reasons.append("type")
    if reference_local_id(reference) != local.get("id"):
        reasons.append("sequence")
    if normalize_stem(str(reference.get("question", ""))) != normalize_stem(str(local.get("stem", ""))):
        reasons.append("stem")
    if local.get("type") != "judge":
        reference_options = [normalize_option(str(value)) for value in reference.get("options", [])]
        local_options = [normalize_option(str(value)) for value in local.get("options", [])]
        if reference_options != local_options:
            reasons.append("options")
    return not reasons, reasons


def official_answer_hash(theory: list[dict[str, Any]]) -> str:
    rows = [{"id": question["id"], "answer": question["answer"]} for question in theory if question["answerSource"] == "official"]
    encoded = json.dumps(rows, ensure_ascii=True, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def question_fingerprint(question: dict[str, Any]) -> str:
    """Bind a manual review to the exact imported question and options."""
    payload = {
        "id": question["id"],
        "type": question["type"],
        "stem": unicodedata.normalize("NFKC", str(question["stem"])).strip(),
        "options": [unicodedata.normalize("NFKC", str(value)).strip() for value in question.get("options", [])],
    }
    encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def load_editorial_review(path: Path = DEFAULT_EDITORIAL_REVIEW_PATH) -> dict[str, Any]:
    review = json.loads(path.read_text(encoding="utf-8"))
    entries = review.get("reviews")
    if not isinstance(entries, list) or not entries:
        raise ValueError(f"逐题复核快照缺少 reviews：{path}")
    ids = [entry.get("id") for entry in entries]
    if any(not isinstance(value, str) for value in ids) or len(ids) != len(set(ids)):
        raise ValueError("逐题复核题号为空或重复")
    for entry in entries:
        if not re.fullmatch(r"(?:judge|single|multi)-\d{3}", entry["id"]):
            raise ValueError(f"逐题复核题号异常：{entry['id']}")
        if not re.fullmatch(r"[0-9a-f]{64}", str(entry.get("questionSha256", ""))):
            raise ValueError(f"逐题复核题目哈希异常：{entry['id']}")
        if not isinstance(entry.get("answer"), list) or not entry["answer"]:
            raise ValueError(f"逐题复核答案为空：{entry['id']}")
        if not str(entry.get("explanation", "")).strip():
            raise ValueError(f"逐题复核解析为空：{entry['id']}")
    return review


def apply_editorial_reviews(theory: list[dict[str, Any]], review: dict[str, Any]) -> dict[str, Any]:
    by_id = {question["id"]: question for question in theory}
    results: list[dict[str, Any]] = []
    for entry in review["reviews"]:
        question = by_id.get(entry["id"])
        if question is None:
            raise ValueError(f"逐题复核目标不存在：{entry['id']}")
        if question["answerSource"] != "derived" or question["answerBasis"] != "heuristic":
            raise ValueError(f"逐题复核只能应用到尚未严格匹配的非官方题：{entry['id']} ({question['answerBasis']})")
        actual_fingerprint = question_fingerprint(question)
        if actual_fingerprint != entry["questionSha256"]:
            raise ValueError(f"逐题复核题干或选项已变化，必须重新审核：{entry['id']}")
        if question["type"] == "judge":
            valid_answers = {"√", "×"}
        else:
            valid_answers = {chr(65 + index) for index in range(len(question["options"]))}
        candidate_answer = list(dict.fromkeys(entry["answer"]))
        if not candidate_answer or not set(candidate_answer) <= valid_answers:
            raise ValueError(f"逐题复核答案越界：{entry['id']} {candidate_answer}")
        question["answer"] = candidate_answer
        question["explanation"] = str(entry["explanation"]).strip()
        question["confidence"] = "medium"
        question["answerBasis"] = "editorial_review"
        results.append({
            "id": entry["id"],
            "questionSha256": actual_fingerprint,
            "reviewedAnswer": candidate_answer,
        })
    return {
        "version": review["version"],
        "capturedAt": review["capturedAt"],
        "appliedReviews": len(results),
        "results": results,
    }


def apply_reference_answers(theory: list[dict[str, Any]], snapshot: dict[str, Any]) -> dict[str, Any]:
    reference_by_local_id = {reference_local_id(question): question for question in snapshot["questions"]}
    before_official_hash = official_answer_hash(theory)
    counts = Counter()
    unmatched: list[dict[str, Any]] = []
    official_differences: list[dict[str, Any]] = []

    for question in theory:
        source = question["answerSource"]
        question["answerBasis"] = "manual_official" if source == "official" else "heuristic"
        if source == "derived":
            question["confidence"] = "low"
        reference = reference_by_local_id.get(question["id"])
        if reference is None:
            counts[f"unmatched_{source}"] += 1
            unmatched.append({"id": question["id"], "answerSource": source, "reasons": ["missing"]})
            continue
        matches, reasons = strict_match(question, reference)
        if not matches:
            counts[f"unmatched_{source}"] += 1
            unmatched.append({"id": question["id"], "answerSource": source, "reasons": reasons})
            continue

        counts["strict_matches"] += 1
        candidate_answer = reference_answer(reference)
        if source == "official":
            counts["preserved_official"] += 1
            if candidate_answer != question["answer"]:
                official_differences.append({
                    "id": question["id"],
                    "manualAnswer": question["answer"],
                    "referenceAnswer": candidate_answer,
                })
            continue

        counts["applied_derived"] += 1
        question["answer"] = candidate_answer
        question["explanation"] = str(reference["explanation"]).strip()
        question["confidence"] = "medium"
        question["answerBasis"] = "third_party_reference"

    after_official_hash = official_answer_hash(theory)
    if before_official_hash != after_official_hash:
        raise AssertionError("应用参考题库时修改了官方答案")

    summary = {
        "strictMatches": counts["strict_matches"],
        "appliedDerivedAnswers": counts["applied_derived"],
        "unmatchedDerivedAnswers": counts["unmatched_derived"],
        "preservedOfficialAnswers": sum(question["answerSource"] == "official" for question in theory),
        "strictMatchedOfficialAnswers": counts["preserved_official"],
        "unmatchedOfficialAnswers": counts["unmatched_official"],
        "strictOfficialDifferences": len(official_differences),
    }
    return {
        "version": CONTENT_VERSION,
        "referenceSnapshotVersion": snapshot["version"],
        "sourceUrl": snapshot["sourceUrl"],
        "capturedAt": snapshot["capturedAt"],
        "officialAnswersSha256": after_official_hash,
        "summary": summary,
        "unmatched": unmatched,
        "officialDifferences": official_differences,
    }


def content_reference_metadata(snapshot: dict[str, Any], audit: dict[str, Any]) -> dict[str, Any]:
    summary = audit["summary"]
    return {
        "snapshotVersion": snapshot["version"],
        "sourceUrl": snapshot["sourceUrl"],
        "capturedAt": snapshot["capturedAt"],
        "strictMatchedQuestions": summary["strictMatches"],
        "appliedDerivedAnswers": summary["appliedDerivedAnswers"],
        "unmatchedDerivedAnswers": summary["unmatchedDerivedAnswers"],
        "editorialReviewVersion": audit["editorialReview"]["version"],
        "editorialReviewedAnswers": summary["appliedEditorialReviews"],
        "remainingHeuristicAnswers": summary["remainingHeuristicAnswers"],
    }


def write_json(path: Path, payload: Any, *, compact_json: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    if compact_json:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def snapshot_command(args: argparse.Namespace) -> None:
    with urllib.request.urlopen(args.url, timeout=args.timeout) as response:
        source = response.read()
    questions = extract_question_bank(source)
    validate_reference_questions(questions)
    payload = {
        "version": args.version,
        "sourceUrl": args.url,
        "capturedAt": args.captured_at,
        "sourceSha256": hashlib.sha256(source).hexdigest(),
        "questions": questions,
    }
    write_json(args.output, payload)
    print(json.dumps({"output": str(args.output), "questions": len(questions), "sourceSha256": payload["sourceSha256"]}, ensure_ascii=False, indent=2))


def apply_command(args: argparse.Namespace) -> None:
    content = json.loads(args.content.read_text(encoding="utf-8"))
    snapshot = load_reference(args.reference)
    audit = apply_reference_answers(content["theory"], snapshot)
    editorial_review = load_editorial_review(args.editorial_review)
    editorial_audit = apply_editorial_reviews(content["theory"], editorial_review)
    audit["editorialReview"] = editorial_audit
    audit["summary"]["appliedEditorialReviews"] = editorial_audit["appliedReviews"]
    audit["summary"]["remainingHeuristicAnswers"] = sum(question["answerBasis"] == "heuristic" for question in content["theory"])
    content["version"] = args.content_version
    content["theoryReference"] = content_reference_metadata(snapshot, audit)
    write_json(args.content, content, compact_json=True)
    write_json(args.audit, audit)
    print(json.dumps(audit["summary"], ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    snapshot_parser = subparsers.add_parser("snapshot", help="下载并固化参考题库")
    snapshot_parser.add_argument("--url", default=SOURCE_URL)
    snapshot_parser.add_argument("--output", type=Path, default=DEFAULT_REFERENCE_PATH)
    snapshot_parser.add_argument("--version", default=SNAPSHOT_VERSION)
    snapshot_parser.add_argument("--captured-at", default=date.today().isoformat())
    snapshot_parser.add_argument("--timeout", type=int, default=60)
    snapshot_parser.set_defaults(handler=snapshot_command)

    apply_parser = subparsers.add_parser("apply", help="严格匹配后更新资料推导答案")
    apply_parser.add_argument("--reference", type=Path, default=DEFAULT_REFERENCE_PATH)
    apply_parser.add_argument("--content", type=Path, default=PROJECT_ROOT / "data" / "content.json")
    apply_parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT_PATH)
    apply_parser.add_argument("--editorial-review", type=Path, default=DEFAULT_EDITORIAL_REVIEW_PATH)
    apply_parser.add_argument("--content-version", default=CONTENT_VERSION)
    apply_parser.set_defaults(handler=apply_command)

    args = parser.parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
