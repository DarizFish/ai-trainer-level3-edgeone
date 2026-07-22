from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


DEFAULT_SNAPSHOT_PATH = Path("data/references/practical-spreadsheet-answers-2026-07-17.json")
SNAPSHOT_VERSION = "2026-07-17-v1"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def task_fingerprint(task: dict[str, Any]) -> str:
    payload = {
        "code": task["code"],
        "title": task["title"],
        "description": task["description"],
        "rubric": task["rubric"],
    }
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def load_snapshot(path: Path = DEFAULT_SNAPSHOT_PATH) -> dict[str, Any]:
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    if snapshot.get("version") != SNAPSHOT_VERSION:
        raise ValueError(f"Unexpected practical spreadsheet snapshot version: {snapshot.get('version')}")
    if not isinstance(snapshot.get("answers"), list) or not snapshot["answers"]:
        raise ValueError("Practical spreadsheet snapshot contains no answers")
    return snapshot


def apply_spreadsheet_answers(
    tasks: list[dict[str, Any]],
    source: Path,
    snapshot: dict[str, Any],
) -> dict[str, Any]:
    by_code = {task["code"]: task for task in tasks}
    applied: list[dict[str, str]] = []
    for entry in snapshot["answers"]:
        code = entry["code"]
        task = by_code.get(code)
        if task is None:
            raise ValueError(f"Spreadsheet answer task is missing: {code}")
        if task["answerSource"] != "derived":
            raise ValueError(f"Spreadsheet answer must not replace an official answer: {code}")
        fingerprint = task_fingerprint(task)
        if fingerprint != entry["taskSha256"]:
            raise ValueError(f"Question or rubric changed for spreadsheet answer: {code}")

        material = entry["material"]
        source_file = source / "人工智能训练师_3级_sucai" / f"{code}-素材" / material["name"]
        if not source_file.is_file():
            raise ValueError(f"Official spreadsheet is missing: {source_file}")
        source_hash = file_sha256(source_file)
        if source_hash != material["sha256"]:
            raise ValueError(f"Official spreadsheet hash changed: {code}")

        reference = entry["referenceAnswer"].strip()
        if not reference:
            raise ValueError(f"Spreadsheet answer is empty: {code}")
        task["referenceAnswer"] = reference
        task["answerBasis"] = "official_dataset_analysis"
        applied.append({"code": code, "taskSha256": fingerprint, "materialSha256": source_hash})

    return {
        "snapshotVersion": snapshot["version"],
        "capturedAt": snapshot["capturedAt"],
        "analysisTool": snapshot["analysisTool"],
        "analyzedTasks": len(applied),
        "tasks": applied,
    }


def content_metadata(snapshot: dict[str, Any], audit: dict[str, Any]) -> dict[str, Any]:
    return {
        "snapshotVersion": snapshot["version"],
        "capturedAt": snapshot["capturedAt"],
        "analysisTool": snapshot["analysisTool"],
        "analyzedTasks": audit["analyzedTasks"],
    }
