from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from practical_spreadsheet_answers import task_fingerprint


DEFAULT_SNAPSHOT_PATH = Path("data/references/practical-rubric-answers-2026-07-17.json")
SNAPSHOT_VERSION = "2026-07-17-v1"


def load_snapshot(path: Path = DEFAULT_SNAPSHOT_PATH) -> dict[str, Any]:
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    if snapshot.get("version") != SNAPSHOT_VERSION:
        raise ValueError(f"Unexpected practical rubric snapshot version: {snapshot.get('version')}")
    answers = snapshot.get("answers")
    if not isinstance(answers, list) or not answers:
        raise ValueError("Practical rubric snapshot contains no answers")
    codes = [entry.get("code") for entry in answers]
    if len(codes) != len(set(codes)):
        raise ValueError("Practical rubric snapshot contains duplicate task codes")
    return snapshot


def apply_rubric_answers(tasks: list[dict[str, Any]], snapshot: dict[str, Any]) -> dict[str, Any]:
    by_code = {task["code"]: task for task in tasks}
    applied: list[dict[str, Any]] = []
    covered_items = 0

    for entry in snapshot["answers"]:
        code = entry["code"]
        task = by_code.get(code)
        if task is None:
            raise ValueError(f"Rubric answer task is missing: {code}")
        if task["answerSource"] != "derived" or task["answerBasis"] != "official_rubric":
            raise ValueError(f"Rubric answer must only replace a rubric-only derived answer: {code}")

        fingerprint = task_fingerprint(task)
        if fingerprint != entry["taskSha256"]:
            raise ValueError(f"Question or rubric changed for practical rubric answer: {code}")

        rubric_ids = {item["id"] for item in task["rubric"]}
        coverage = entry.get("rubricCoverage")
        if not isinstance(coverage, dict) or set(coverage) != rubric_ids:
            raise ValueError(f"Rubric coverage is incomplete: {code}")
        if any(not str(value).strip() for value in coverage.values()):
            raise ValueError(f"Rubric coverage contains an empty description: {code}")

        reference = entry.get("referenceAnswer", "").strip()
        if len(reference) < 300 or reference.startswith("建议答案应完整覆盖以下评分点"):
            raise ValueError(f"Practical rubric answer is not substantive: {code}")
        if any(rubric_id not in reference for rubric_id in rubric_ids):
            raise ValueError(f"Reference answer does not expose every rubric item: {code}")

        task["referenceAnswer"] = reference
        task["answerBasis"] = "official_task_rubric_example"
        covered_items += len(rubric_ids)
        applied.append({
            "code": code,
            "taskSha256": fingerprint,
            "rubricItems": len(rubric_ids),
            "referenceSha256": hashlib.sha256(reference.encode("utf-8")).hexdigest(),
        })

    return {
        "snapshotVersion": snapshot["version"],
        "capturedAt": snapshot["capturedAt"],
        "reviewMethod": snapshot["reviewMethod"],
        "reviewedTasks": len(applied),
        "coveredRubricItems": covered_items,
        "tasks": applied,
    }


def content_metadata(snapshot: dict[str, Any], audit: dict[str, Any]) -> dict[str, Any]:
    return {
        "snapshotVersion": snapshot["version"],
        "capturedAt": snapshot["capturedAt"],
        "reviewMethod": snapshot["reviewMethod"],
        "reviewedTasks": audit["reviewedTasks"],
        "coveredRubricItems": audit["coveredRubricItems"],
    }
