#!/usr/bin/env python3
"""Snapshot completed practical notebooks and attach their code as references."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import date
from pathlib import Path
from typing import Any

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_entities import load_bank, write_bank  # noqa: E402


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_VERSION = "2026-07-16-v1"
CONTENT_VERSION = "2026-07-19-v7"
DEFAULT_SNAPSHOT_PATH = PROJECT_ROOT / "data" / "references" / "notebook-solutions-2026-07-16.json"
DEFAULT_AUDIT_PATH = PROJECT_ROOT / "data" / "references" / "notebook-solution-audit.json"
BLANK_PATTERN = re.compile(r"___+")


def write_json(path: Path, payload: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    if compact:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def solution_cells(notebook: dict[str, Any]) -> list[dict[str, str]]:
    cells: list[dict[str, str]] = []
    for cell in notebook.get("cells", []):
        if cell.get("cell_type") != "code":
            continue
        source = "".join(cell.get("source", [])).strip()
        if not source:
            continue
        cells.append({"id": f"solution-{len(cells) + 1}", "source": source + "\n"})
    return cells


def validate_snapshot(snapshot: dict[str, Any]) -> None:
    solutions = snapshot.get("solutions")
    if not isinstance(solutions, list) or len(solutions) != 20:
        raise ValueError("完成版 Notebook 快照必须包含 20 题")
    codes = set()
    for solution in solutions:
        code = solution.get("code")
        cells = solution.get("cells")
        if not isinstance(code, str) or not re.fullmatch(r"\d\.\d\.\d", code) or code in codes:
            raise ValueError(f"完成版 Notebook 题号异常：{code!r}")
        codes.add(code)
        if not isinstance(cells, list) or not cells:
            raise ValueError(f"完成版 Notebook 没有代码：{code}")
        source = "\n".join(str(cell.get("source", "")) for cell in cells)
        if BLANK_PATTERN.search(source):
            raise ValueError(f"完成版 Notebook 仍含待补空格：{code}")
        if hashlib.sha256(source.encode("utf-8")).hexdigest() != solution.get("codeSha256"):
            raise ValueError(f"完成版 Notebook 代码哈希异常：{code}")


def load_snapshot(path: Path = DEFAULT_SNAPSHOT_PATH) -> dict[str, Any]:
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    validate_snapshot(snapshot)
    return snapshot


def apply_notebook_solutions(practical: list[dict[str, Any]], snapshot: dict[str, Any]) -> dict[str, Any]:
    by_code = {solution["code"]: solution for solution in snapshot["solutions"]}
    notebook_tasks = [task for task in practical if task.get("hasNotebook")]
    if {task["code"] for task in notebook_tasks} != set(by_code):
        raise ValueError("完成版 Notebook 题号与实操题库不一致")

    derived = 0
    official = 0
    code_cells = 0
    for task in notebook_tasks:
        solution = by_code[task["code"]]
        notebook = task.get("notebook")
        if not isinstance(notebook, dict):
            raise ValueError(f"实操题缺少 Notebook 模板：{task['code']}")
        notebook["solutionCells"] = solution["cells"]
        notebook["solutionSource"] = "completed_reference_notebook"
        notebook["solutionSha256"] = solution["codeSha256"]
        code_cells += len(solution["cells"])
        if task["answerSource"] == "official":
            official += 1
        else:
            derived += 1
            rubric_reference = task["referenceAnswer"].split("\n\nPython 部分：", 1)[0].rstrip()
            task["referenceAnswer"] = (
                rubric_reference
                + f"\n\nPython 参考代码：已从配套完成版 Notebook 提取 {len(solution['cells'])} 个代码单元。"
                + "请在实验室的“答案与来源”中查看或下载；该代码不是指导手册官方标准答案。"
            )

    return {
        "version": "2026-07-16-v1",
        "snapshotVersion": snapshot["version"],
        "capturedAt": snapshot["capturedAt"],
        "summary": {
            "notebookSolutions": len(notebook_tasks),
            "derivedNotebookSolutions": derived,
            "officialNotebookSolutions": official,
            "solutionCodeCells": code_cells,
            "solutionsWithBlanks": 0,
        },
        "solutions": [
            {
                "code": solution["code"],
                "sourceNotebookSha256": solution["sourceNotebookSha256"],
                "codeSha256": solution["codeSha256"],
                "codeCells": len(solution["cells"]),
                "sourceOutputs": solution["sourceOutputs"],
            }
            for solution in snapshot["solutions"]
        ],
    }


def content_metadata(snapshot: dict[str, Any], audit: dict[str, Any]) -> dict[str, Any]:
    summary = audit["summary"]
    return {
        "snapshotVersion": snapshot["version"],
        "capturedAt": snapshot["capturedAt"],
        "notebookSolutions": summary["notebookSolutions"],
        "derivedNotebookSolutions": summary["derivedNotebookSolutions"],
        "solutionsWithBlanks": summary["solutionsWithBlanks"],
    }


def snapshot_command(args: argparse.Namespace) -> None:
    materials = args.materials.resolve()
    if not materials.is_dir():
        raise FileNotFoundError(f"完成版 Notebook 素材目录不存在：{materials}")
    canonical = load_bank()
    notebook_codes = sorted(task["code"] for task in canonical["practical"] if task.get("hasNotebook"))
    solutions = []
    for code in notebook_codes:
        folder = materials / f"{code}-素材"
        notebook_path = folder / f"{code}.ipynb"
        if not notebook_path.is_file():
            raise FileNotFoundError(f"缺少完成版 Notebook：{notebook_path}")
        raw = notebook_path.read_bytes()
        notebook = json.loads(raw.decode("utf-8-sig"))
        cells = solution_cells(notebook)
        source = "\n".join(cell["source"] for cell in cells)
        solutions.append({
            "code": code,
            "sourceNotebookSha256": hashlib.sha256(raw).hexdigest(),
            "sourceOutputs": sum(len(cell.get("outputs", [])) for cell in notebook.get("cells", [])),
            "codeSha256": hashlib.sha256(source.encode("utf-8")).hexdigest(),
            "cells": cells,
        })
    payload = {
        "version": args.version,
        "capturedAt": args.captured_at,
        "sourceLabel": "用户提供的配套完成版 Notebook",
        "solutions": solutions,
    }
    validate_snapshot(payload)
    write_json(args.output, payload)
    print(json.dumps({"output": str(args.output), "notebooks": len(solutions), "codeCells": sum(len(item["cells"]) for item in solutions)}, ensure_ascii=False, indent=2))


def apply_command(args: argparse.Namespace) -> None:
    content = load_bank()
    snapshot = load_snapshot(args.snapshot)
    audit = apply_notebook_solutions(content["practical"], snapshot)
    if args.content_version:
        content["version"] = args.content_version
    content["notebookSolutions"] = content_metadata(snapshot, audit)
    write_bank(content)
    write_json(args.audit, audit)
    print(json.dumps(audit["summary"], ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    snapshot_parser = subparsers.add_parser("snapshot", help="从配套完成版 Notebook 固化代码快照")
    snapshot_parser.add_argument("--materials", type=Path, required=True)
    snapshot_parser.add_argument("--output", type=Path, default=DEFAULT_SNAPSHOT_PATH)
    snapshot_parser.add_argument("--version", default=SNAPSHOT_VERSION)
    snapshot_parser.add_argument("--captured-at", default=date.today().isoformat())
    snapshot_parser.set_defaults(handler=snapshot_command)

    apply_parser = subparsers.add_parser("apply", help="将完成版代码写入实操题参考答案")
    apply_parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT_PATH)
    apply_parser.add_argument("--content", type=Path, default=PROJECT_ROOT / "data" / "content.json")
    apply_parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT_PATH)
    apply_parser.add_argument(
        "--content-version",
        help="可选；省略时保留 data/content.json 的现有版本，避免覆盖已发布审校版本",
    )
    apply_parser.set_defaults(handler=apply_command)

    args = parser.parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
