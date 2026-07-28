"""把 Word 交付物答案写进实体层的结构化字段。

背景：站点此前把 Word 答案和评分点、Python 代码说明混在同一个 referenceAnswer
字符串里，靠四种字符串匹配去切分（找「Word 交付物作答示例」、找「<题号>.docx」、
找「（2）」、找「Python 参考代码：」）。任何一条官方口径的措辞变化都可能让切分错位，
而错位的表现是「答案面板少了一段」，不会报错。

现在改为结构化：

    task.wordAnswer = {
      "source": "...",                       # 溯源，界面不展示
      "deliverables": [
        {"fileName": "3.1.1.docx", "mode": "analysis_report",
         "sections": [{"heading": "...", "items": ["..."]}]},
        ...
      ]
    }

模板填空题（4.1/4.2）用 fills 而不是 sections：

        {"fileName": "4.1.1.docx", "mode": "template_fills",
         "fills": [{"order": 1, "label": "...", "answer": "..."}]}

同时把 Word 正文从 referenceAnswer 里剥掉，让结构化字段成为唯一事实来源：
有 Notebook 的题只保留评分点与 Python 代码说明；纯文档题的 referenceAnswer 整段
都是 Word 答案，剥完为空。

用法：python scripts/practical_word_answers.py [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_entities import ENTITIES, dump, load  # noqa: E402

DEFAULT_SNAPSHOT = Path("data/references/practical-word-answers-2026-07-28.json")
SNAPSHOT_VERSION = "2026-07-28-v1"
WORD_EXAMPLE_HEADING = "Word 交付物作答示例"
PYTHON_NOTE_MARKER = "\nPython 参考代码："


def starts_word_body(code: str, line: str) -> bool:
    """这一行是不是 Word 正文的起点。

    官方原文用「（2）」或「<题号>.docx」另起一行引出 Word 交付物，标记后面可能还跟着
    小标题（2.1.1 是「（2）数据清洗和标注规范」），所以按前缀匹配而不是整行相等。
    """
    probe = line.strip()
    return probe.startswith("（2）") or probe.startswith(f"{code}.docx") or probe.startswith(WORD_EXAMPLE_HEADING)


def strip_word_narrative(code: str, reference_answer: str, has_notebook: bool) -> str:
    """把 Word 正文从 referenceAnswer 里剥掉，让结构化字段成为唯一事实来源。

    三种版式：
      纯文档题（1.2/3.1/4.x）：整段都是 Word 答案，剥完为空。
      本站撰写的 Notebook 题：正文夹在「Word 交付物作答示例」与「Python 参考代码：」
        之间，切掉中段，保留前面的评分点与后面的代码说明。
      官方原文的 Notebook 题（2.1.1/2.2.1/3.2.1）：`（1）…代码…` 之后用单独一行的
        「（2）」或「<题号>.docx」引出 Word 正文，从那一行截断，只留代码部分。
    """
    if not has_notebook:
        return ""
    start = reference_answer.find(WORD_EXAMPLE_HEADING)
    if start >= 0:
        tail_start = reference_answer.find(PYTHON_NOTE_MARKER, start)
        head = reference_answer[:start].rstrip()
        tail = reference_answer[tail_start:].strip() if tail_start >= 0 else ""
        return f"{head}\n\n{tail}".strip() if tail else head
    lines = reference_answer.split("\n")
    for index, line in enumerate(lines):
        if starts_word_body(code, line):
            return "\n".join(lines[:index]).rstrip()
    return reference_answer.strip()


def iter_answer_lines(word_answer: dict):
    for deliverable in word_answer["deliverables"]:
        for value in (deliverable.get("model"), *(deliverable.get("fills") or [])):
            if isinstance(value, dict):
                yield value["answer"]
            elif value:
                yield value
        for item in deliverable.get("items") or []:
            yield from (item.values() if isinstance(item, dict) else [item])
        for section in deliverable.get("sections") or []:
            yield section["heading"]
            yield from section.get("items") or []
            yield from section.get("paragraphs") or []


def assert_narrative_stripped(code: str, reference_answer: str, word_answer: dict, has_notebook: bool) -> None:
    """核对 Word 正文确实被切掉了。

    版式判断出错时最省事的失败方式是「切了个寂寞」——正文原样留在 referenceAnswer 里，
    页面上同一份答案出现两遍。这里查两件事：引出正文的那几个标记不该再出现；结构化答案
    里逐字取自官方原文的句子也不该还留在 referenceAnswer 里。任一命中就报错。
    """
    for line in reference_answer.split("\n"):
        if starts_word_body(code, line):
            raise ValueError(f"{code} 的 referenceAnswer 仍带着引出 Word 正文的标记：{line.strip()}")
    for line in iter_answer_lines(word_answer):
        probe = line.strip()
        if len(probe) >= 12 and probe in reference_answer:
            raise ValueError(f"{code} 的 referenceAnswer 仍残留 Word 正文：{probe[:30]}…")
    if has_notebook and not reference_answer.strip():
        raise ValueError(f"{code} 有 Notebook，剥掉 Word 正文后不该什么都不剩")


# 参考快照里的交付物已经是建好模的领域数据，五种形态各有其存在理由：
#   sections[].items      条目式（1.2、2.1、3.2 的分点作答）
#   sections[].paragraphs 段落式（2.2 的测试报告正文）
#   items[]               方向/方案成对（3.1 的优化方案）
#   fills[]               模板填空（4.1、4.2 的 5 个空）
#   model/metrics/comparison  2.2 的模型与复算指标
# 重新设计一套统一 schema 只会丢信息，所以原样保留，只校验形态在已知集合内——
# 参考文件将来多出没见过的键时，这里会直接报错而不是静默丢弃。
DELIVERABLE_KEYS = {"fileName", "mode", "sections", "items", "fills", "model", "metrics", "comparison"}
SECTION_KEYS = {"heading", "items", "paragraphs", "part"}
# items 和 metrics 都是多态的，站点要按形态分别渲染，形态判断错了不会报错、只会在页面上
# 印出 undefined。所以这里把允许的形态写死：
#   items    3.1 是「方向 + 方案」成对，3.2 是普通条目
#   metrics  2.2.2/2.2.4 是回归指标标量，2.2.1 是分类报告的每类一行
DIRECTION_KEYS = {"direction", "solution"}
SCALAR_METRIC_KEYS = {"name", "value"}
CLASS_METRIC_KEYS = {"class", "precision", "recall", "f1Score", "support"}
COMPARISON_KEYS = {"model", "trainR2", "testR2", "mse"}


def validate_deliverable(code: str, item: dict) -> dict:
    unknown = set(item) - DELIVERABLE_KEYS
    if unknown:
        raise ValueError(f"{code} 的交付物出现未知字段：{sorted(unknown)}")
    if not item.get("fileName") or not item.get("mode"):
        raise ValueError(f"{code} 的交付物缺少 fileName 或 mode")
    if not any(key in item for key in ("sections", "items", "fills")):
        raise ValueError(f"{code} 的交付物没有任何作答内容")
    for section in item.get("sections", []):
        unknown_section = set(section) - SECTION_KEYS
        if unknown_section:
            raise ValueError(f"{code} 的小节出现未知字段：{sorted(unknown_section)}")
        if not section.get("heading"):
            raise ValueError(f"{code} 的小节缺少 heading")
        if not section.get("items") and not section.get("paragraphs"):
            raise ValueError(f"{code} 的小节既没有 items 也没有 paragraphs")
    for fill in item.get("fills", []):
        if not all(key in fill for key in ("order", "label", "answer")):
            raise ValueError(f"{code} 的填空缺少 order/label/answer")
    for entry in item.get("items", []):
        if isinstance(entry, str):
            if not entry.strip():
                raise ValueError(f"{code} 的条目为空")
        elif set(entry) != DIRECTION_KEYS:
            raise ValueError(f"{code} 的条目形态未知：{sorted(entry)}")
    for metric in item.get("metrics", []):
        if set(metric) not in (SCALAR_METRIC_KEYS, CLASS_METRIC_KEYS):
            raise ValueError(f"{code} 的指标形态未知：{sorted(metric)}")
    if "comparison" in item and set(item["comparison"]) != COMPARISON_KEYS:
        raise ValueError(f"{code} 的对照模型形态未知：{sorted(item['comparison'])}")
    return item


def assign_section_parts(code: str, deliverable: dict) -> None:
    """1.2 的官方交付物是一份 .docx 里答两问，把「哪一节属于哪一问」在构建期定死。

    答题卷按两问分栏收作答，此前是运行时在 referenceAnswer 里找「二、<题号>-2」这类
    标记现切——官方口径换个措辞切分就静默错位，表现为「第二问的参考答案不见了」，不报错。
    这里改成构建期判定：小节标题以「<题号>-1」「<题号>-2」开头的开启对应一问，其余
    小节归属上一问（「预期效果」跟着第二问）。判定不成立就在这里报错，而不是等到线上。
    """
    sections = deliverable.get("sections", [])
    part = 0
    for section in sections:
        for candidate in (1, 2):
            if section["heading"].startswith(f"{code}-{candidate}"):
                part = candidate
                break
        if part == 0:
            raise ValueError(f"{code} 的首个小节没有标明题号，无法归属到某一问：{section['heading']}")
        section["part"] = part
    parts = {section["part"] for section in sections}
    if parts != {1, 2}:
        raise ValueError(f"{code} 的小节没有覆盖两问，实得 {sorted(parts)}")


def build_word_answer(entry: dict) -> dict:
    deliverables = [validate_deliverable(entry["code"], item) for item in entry["wordDeliverables"]]
    # 溯源留在数据里但界面不展示：这批答案里 4.2.1 含 OCR，出问题时要查得到来源。
    return {"source": entry["answerSource"], "deliverables": deliverables}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    if snapshot.get("version") != SNAPSHOT_VERSION:
        raise ValueError(f"参考快照版本不符：{snapshot.get('version')}，期望 {SNAPSHOT_VERSION}")
    answers = snapshot["answers"]
    if len(answers) != snapshot["scope"]["answerCount"]:
        raise ValueError("参考快照声明的条目数与实际不符")

    changed, stripped_chars = 0, 0
    for entry in answers:
        path = ENTITIES / "practical" / f"{entry['code']}.json"
        task = load(path)
        before = json.dumps(task, ensure_ascii=False, sort_keys=True)

        task["wordAnswer"] = build_word_answer(entry)
        if task["group"] == "1.2":
            for deliverable in task["wordAnswer"]["deliverables"]:
                assign_section_parts(task["code"], deliverable)
        original = task["referenceAnswer"]
        has_notebook = bool(task.get("hasNotebook"))
        task["referenceAnswer"] = strip_word_narrative(task["code"], original, has_notebook)
        assert_narrative_stripped(task["code"], task["referenceAnswer"], task["wordAnswer"], has_notebook)
        stripped_chars += len(original) - len(task["referenceAnswer"])

        if json.dumps(task, ensure_ascii=False, sort_keys=True) != before:
            changed += 1
            if not args.dry_run:
                dump(path, task)

    # 未覆盖的题（1.1.x）不应留下 wordAnswer 字段
    covered = {entry["code"] for entry in answers}
    for path in sorted((ENTITIES / "practical").glob("*.json")):
        if path.stem in covered:
            continue
        task = load(path)
        if "wordAnswer" in task:
            raise ValueError(f"{path.stem} 不在本批范围内却已有 wordAnswer")

    print(json.dumps({
        "snapshot": snapshot["version"],
        "tasksUpdated": changed,
        "referenceAnswerCharsRemoved": stripped_chars,
        "dryRun": args.dry_run,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
