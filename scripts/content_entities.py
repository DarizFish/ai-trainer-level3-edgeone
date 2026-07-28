"""实体资产层：题库不再是一个 944KB 的单行大文件，而是一组按实体切分的小文件。

  data/entities/
    meta.json                      版本与来源手册
    theory/judge|single|multi.json 三种题型各 300 题
    practical/<题号>.json           40 道实操题，一题一文件
    exams/*.json                    官方模拟卷（题号清单与考试规则）
    audit/*.json                    溯源与评审快照

为什么要拆：原来的 data/content.json 是 944KB 挤在一行，`git log --numstat` 对它
永远输出 `1 1`——一行改、一行增。内容正确性是这个产品的核心价值，而每一次内容变更
都无法评审。此前那次「草稿键嵌了参考答案指纹，改答案长度就把用户已写内容全作废」
的事故，如果 diff 可读，评审时一眼就能看见。

同时有 7 个脚本在写那一个文件，单行格式让合并冲突不可能手工解决。

拼装规则（load_bank）必须能逐字节还原原有的 ContentBank，因为发布产物
（public/content/*.json）的内容不允许因为这次重构而改变。stats 是推导值，不存储。
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ENTITIES = ROOT / "data" / "entities"

THEORY_TYPES = ("judge", "single", "multi")
AUDIT_BLOCKS = {
    "theoryReference": "theory-reference",
    "notebookSolutions": "notebook-solutions",
    "practicalReferences": "practical-references",
    "practicalTemplateReferences": "practical-template-references",
    "practicalRubricReferences": "practical-rubric-references",
    "theoryReview": "theory-review",
}


def dump(path: Path, payload: Any) -> None:
    """统一的落盘格式：缩进两格、中文不转义、结尾换行。

    这是整个实体层可评审的前提——任何写入方都必须走这里，否则一次 json.dumps 默认
    参数就会把全文重排，diff 再次变成不可读。
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def derive_stats(theory: list[dict], practical: list[dict]) -> dict:
    """stats 全部可从实体推导，因此不存储——存储就意味着可能与实体不一致。"""
    return {
        "theoryQuestions": len(theory),
        "officialTheoryAnswers": sum(1 for q in theory if q.get("answerSource") == "official"),
        "derivedTheoryAnswers": sum(1 for q in theory if q.get("answerSource") != "official"),
        "practicalTasks": len(practical),
        "notebookTasks": sum(1 for t in practical if t.get("hasNotebook")),
        "officialPracticalAnswers": sum(1 for t in practical if t.get("answerSource") == "official"),
    }


def split_bank(bank: dict) -> None:
    """把单个 ContentBank 拆进实体层。只在迁移时跑一次。"""
    dump(ENTITIES / "meta.json", {"version": bank["version"], "generatedFrom": bank["generatedFrom"]})

    by_type: dict[str, list[dict]] = {name: [] for name in THEORY_TYPES}
    for question in bank["theory"]:
        by_type[question["type"]].append(question)
    for name, questions in by_type.items():
        dump(ENTITIES / "theory" / f"{name}.json", questions)

    for task in bank["practical"]:
        dump(ENTITIES / "practical" / f"{task['code']}.json", task)

    dump(ENTITIES / "exams" / "theory-official.json", bank["officialTheoryMock"])
    dump(ENTITIES / "exams" / "practical-official.json", {"taskCodes": bank["officialPracticalMockCodes"]})

    for key, filename in AUDIT_BLOCKS.items():
        dump(ENTITIES / "audit" / f"{filename}.json", bank[key])


def load_bank() -> dict:
    """从实体层拼回 ContentBank。

    顺序不额外记录：theory 天然是 judge/single/multi 三段、段内按 id 递增，
    practical 按题号排序——迁移时已实测确认，contracts 里有断言守着。
    """
    meta = load(ENTITIES / "meta.json")
    theory: list[dict] = []
    for name in THEORY_TYPES:
        theory.extend(load(ENTITIES / "theory" / f"{name}.json"))
    practical = [load(path) for path in sorted((ENTITIES / "practical").glob("*.json"), key=lambda p: p.stem)]

    audit = {key: load(ENTITIES / "audit" / f"{filename}.json") for key, filename in AUDIT_BLOCKS.items()}
    # 顶层键序必须与原 content.json 完全一致：已发布的理论评审用紧凑序列化的 SHA-256
    # 盖了封条（publish_theory_review.py 的 publishedContentSha256），键序一变封条就失效。
    bank = {
        "version": meta["version"],
        "generatedFrom": meta["generatedFrom"],
        "theoryReference": audit["theoryReference"],
        "notebookSolutions": audit["notebookSolutions"],
        "practicalReferences": audit["practicalReferences"],
        "practicalTemplateReferences": audit["practicalTemplateReferences"],
        "practicalRubricReferences": audit["practicalRubricReferences"],
        "theory": theory,
        "officialTheoryMock": load(ENTITIES / "exams" / "theory-official.json"),
        "practical": practical,
        "officialPracticalMockCodes": load(ENTITIES / "exams" / "practical-official.json")["taskCodes"],
        "stats": derive_stats(theory, practical),
        "theoryReview": audit["theoryReview"],
    }
    return bank


def canonical_bytes(bank: dict) -> bytes:
    """与 publish_theory_review.json_bytes(compact=True) 相同的规范序列化。

    理论评审的发布封条盖的就是这串字节。实体层必须能逐字节复现它，否则封条失效。
    """
    import json as _json
    return _json.dumps(bank, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def save_task(task: dict) -> None:
    """写回单道实操题——脚本改一道题只碰一个几 KB 的文件。"""
    dump(ENTITIES / "practical" / f"{task['code']}.json", task)


def save_theory(question_type: str, questions: list[dict]) -> None:
    if question_type not in THEORY_TYPES:
        raise ValueError(f"未知题型：{question_type}")
    dump(ENTITIES / "theory" / f"{question_type}.json", questions)


def save_audit(key: str, payload: Any) -> None:
    if key not in AUDIT_BLOCKS:
        raise ValueError(f"未知审计块：{key}")
    dump(ENTITIES / "audit" / f"{AUDIT_BLOCKS[key]}.json", payload)


def write_bank(bank: dict) -> None:
    """把整份 ContentBank 写回实体层。

    给现有脚本用的兼容层：它们的心智模型仍是「读整库 → 改 → 写整库」，这里负责把
    结果落回分片。内容没变的实体会写出完全相同的字节，git 看不见改动——所以一次
    素材同步只会在 diff 里显示它真正碰过的那几道题。
    """
    split_bank(bank)
