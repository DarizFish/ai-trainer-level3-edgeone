from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any
from xml.etree import ElementTree
from zipfile import ZipFile

from practical_spreadsheet_answers import file_sha256, task_fingerprint


DEFAULT_SNAPSHOT_PATH = Path("data/references/practical-template-answers-2026-07-17.json")
SNAPSHOT_VERSION = "2026-07-27-v2"
WORD_NAMESPACE = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
UNDERLINE_BLANK = re.compile(r"_{5,}")


def document_paragraphs(path: Path) -> list[str]:
    with ZipFile(path) as archive:
        document = ElementTree.fromstring(archive.read("word/document.xml"))
    return [
        "".join(node.text or "" for node in paragraph.findall(".//w:t", WORD_NAMESPACE)).strip()
        for paragraph in document.findall(".//w:p", WORD_NAMESPACE)
    ]


def template_blank_slots(path: Path) -> list[str]:
    return [
        paragraph
        for paragraph in document_paragraphs(path)
        if paragraph == "学习目标：" or UNDERLINE_BLANK.search(paragraph)
    ]


def load_snapshot(path: Path = DEFAULT_SNAPSHOT_PATH) -> dict[str, Any]:
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    if snapshot.get("version") != SNAPSHOT_VERSION:
        raise ValueError(f"Unexpected practical template snapshot version: {snapshot.get('version')}")
    answers = snapshot.get("answers")
    if not isinstance(answers, list) or not answers:
        raise ValueError("Practical template snapshot contains no answers")
    codes = [entry.get("code") for entry in answers]
    if len(codes) != len(set(codes)):
        raise ValueError("Practical template snapshot contains duplicate task codes")
    return snapshot


def format_reference_answer(entry: dict[str, Any]) -> str:
    fills = entry["fills"]
    lines = [
        f"官方 Word 模板填写示例（{len(fills)} 处空白）",
        "",
        "以下内容按模板中的空白顺序填写，取自官方参考答案中标黄的填空原文。"
        "评分口径为“回答内容与答案类似得 1 分，每题最多 5 分”，作答时无需标黄。",
        "",
    ]
    for index, fill in enumerate(fills, start=1):
        lines.extend([f"{index}. {fill['section']}", f"填写：{fill['answer']}", ""])
    lines.extend([
        "提交检查：",
        entry["submissionChecklist"],
    ])
    return "\n".join(lines).strip()


def apply_template_answers(
    tasks: list[dict[str, Any]],
    source: Path,
    snapshot: dict[str, Any],
) -> dict[str, Any]:
    by_code = {task["code"]: task for task in tasks}
    applied: list[dict[str, Any]] = []
    total_slots = 0

    for entry in snapshot["answers"]:
        code = entry["code"]
        task = by_code.get(code)
        if task is None:
            raise ValueError(f"Template answer task is missing: {code}")
        if task["answerSource"] != "derived" or task["answerBasis"] != "official_rubric":
            raise ValueError(f"Template answer must only replace a rubric-only derived answer: {code}")

        fingerprint = task_fingerprint(task)
        if fingerprint != entry["taskSha256"]:
            raise ValueError(f"Question or rubric changed for template answer: {code}")

        template = entry["template"]
        source_file = source / "人工智能训练师_3级_sucai" / f"{code}-素材" / template["name"]
        if not source_file.is_file():
            raise ValueError(f"Official Word template is missing: {source_file}")
        source_hash = file_sha256(source_file)
        if source_hash != template["sha256"]:
            raise ValueError(f"Official Word template hash changed: {code}")

        blank_slots = template_blank_slots(source_file)
        fills = entry.get("fills")
        if not isinstance(fills, list) or len(fills) != template["blankCount"]:
            raise ValueError(f"Template answer fill count is invalid: {code}")
        if len(blank_slots) != template["blankCount"]:
            raise ValueError(f"Official Word template blank count changed: {code}")
        if any(not fill.get("section", "").strip() or not fill.get("answer", "").strip() for fill in fills):
            raise ValueError(f"Template answer contains an empty fill: {code}")

        reference = format_reference_answer(entry)
        task["referenceAnswer"] = reference
        task["answerBasis"] = "official_template_completion"
        total_slots += len(fills)
        applied.append({
            "code": code,
            "taskSha256": fingerprint,
            "materialSha256": source_hash,
            "blankSlots": len(blank_slots),
            "referenceSha256": hashlib.sha256(reference.encode("utf-8")).hexdigest(),
        })

    return {
        "snapshotVersion": snapshot["version"],
        "capturedAt": snapshot["capturedAt"],
        "reviewMethod": snapshot["reviewMethod"],
        "reviewedTasks": len(applied),
        "filledBlankSlots": total_slots,
        "tasks": applied,
    }


def content_metadata(snapshot: dict[str, Any], audit: dict[str, Any]) -> dict[str, Any]:
    return {
        "snapshotVersion": snapshot["version"],
        "capturedAt": snapshot["capturedAt"],
        "reviewMethod": snapshot["reviewMethod"],
        "reviewedTasks": audit["reviewedTasks"],
        "filledBlankSlots": audit["filledBlankSlots"],
    }
