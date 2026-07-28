#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

from notebook_solutions import (
    BLANK_PATTERN,
    DEFAULT_AUDIT_PATH as DEFAULT_NOTEBOOK_AUDIT_PATH,
    DEFAULT_SNAPSHOT_PATH as DEFAULT_NOTEBOOK_SNAPSHOT_PATH,
    load_snapshot as load_notebook_solution_snapshot,
)
from practical_spreadsheet_answers import (
    DEFAULT_SNAPSHOT_PATH as DEFAULT_PRACTICAL_SPREADSHEET_PATH,
    load_snapshot as load_practical_spreadsheet_snapshot,
    task_fingerprint as practical_task_fingerprint,
)
from practical_template_answers import (
    DEFAULT_SNAPSHOT_PATH as DEFAULT_PRACTICAL_TEMPLATE_PATH,
    load_snapshot as load_practical_template_snapshot,
    template_blank_slots,
)
from practical_rubric_answers import (
    DEFAULT_SNAPSHOT_PATH as DEFAULT_PRACTICAL_RUBRIC_PATH,
    load_snapshot as load_practical_rubric_snapshot,
)
from theory_reference import (
    DEFAULT_AUDIT_PATH as DEFAULT_THEORY_AUDIT_PATH,
    DEFAULT_EDITORIAL_REVIEW_PATH,
    DEFAULT_REFERENCE_PATH,
    local_answer_indices,
    load_editorial_review,
    load_reference,
    official_answer_hash,
    question_fingerprint,
    reference_local_id,
    strict_match,
)
from theory_review_quality import build_report as build_theory_review_quality_report
from theory_review_state import validate_state as validate_theory_review_state

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_entities import canonical_bytes, load_bank  # noqa: E402


EXPECTED_OFFICIAL_ANSWER_HASH = "2e4bef5183e8fbf66f152006d70bb5843a60f5b519d321f3a54d06eab61e829f"
EXPECTED_OFFICIAL_PRACTICAL_ANSWER_HASH = "f1cb0e6fcabed8d6dab9eea5e760ab1782319db920ec6237b7bae07a088427aa"
EXPECTED_REFERENCE_SOURCE_HASH = "4c0fa4ac6accc6ab335a54f3fe5a04c56485aeeae4dfd46761de960abd6512c8"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

data = load_bank()
theory = data["theory"]
practical = data["practical"]
assert data["version"] == "2026-07-28-v9"
assert len(theory) == 900
assert Counter(q["type"] for q in theory) == {"judge": 300, "single": 300, "multi": 300}
assert Counter(q["answerSource"] for q in theory) == {"official": 190, "derived": 710}
assert Counter(q["answerBasis"] for q in theory) == {
    "manual_official": 190,
    "third_party_reference": 571,
    "editorial_review": 139,
}
assert len({q["id"] for q in theory}) == 900
by_id = {q["id"]: q for q in theory}
mock_ids = data["officialTheoryMock"]["questionIds"]
assert len(mock_ids) == len(set(mock_ids)) == 190
assert all(qid in by_id and by_id[qid]["answerSource"] == "official" for qid in mock_ids)
assert Counter(by_id[qid]["type"] for qid in mock_ids) == {"judge": 40, "single": 140, "multi": 10}
for q in theory:
    valid = {"√", "×"} if q["type"] == "judge" else {chr(65 + i) for i in range(len(q["options"]))}
    assert q["answer"] and set(q["answer"]) <= valid, q["id"]
    assert q["answerSource"] in {"official", "derived"}
    assert q["answerBasis"] in {"manual_official", "third_party_reference", "editorial_review"}
    assert q["confidence"] in {"high", "medium", "low"}
    assert q["explanation"].strip(), q["id"]
    if q["answerBasis"] == "manual_official":
        assert q["answerSource"] == "official" and q["confidence"] == "high", q["id"]
    elif q["answerBasis"] == "third_party_reference":
        assert q["answerSource"] == "derived" and q["confidence"] == "medium", q["id"]
    elif q["answerBasis"] == "editorial_review":
        assert q["answerSource"] == "derived" and q["confidence"] == "medium", q["id"]
    assert len(q["explanation"].strip()) >= 24, q["id"]

assert official_answer_hash(theory) == EXPECTED_OFFICIAL_ANSWER_HASH
reference = load_reference(DEFAULT_REFERENCE_PATH)
assert reference["version"] == "2026-07-16-v1"
assert reference["sourceSha256"] == EXPECTED_REFERENCE_SOURCE_HASH
reference_by_id = {reference_local_id(item): item for item in reference["questions"]}
strict_matches = 0
for q in theory:
    reference_question = reference_by_id[q["id"]]
    matches, _ = strict_match(q, reference_question)
    strict_matches += int(matches)
    if q["answerBasis"] == "third_party_reference":
        assert matches, q["id"]
        assert local_answer_indices(q) == reference_question["answer"], q["id"]
assert strict_matches == 830

editorial_review = load_editorial_review(DEFAULT_EDITORIAL_REVIEW_PATH)
editorial_by_id = {entry["id"]: entry for entry in editorial_review["reviews"]}
assert len(editorial_by_id) == 23
for entry in editorial_review["reviews"]:
    assert question_fingerprint(by_id[entry["id"]]) == entry["questionSha256"], entry["id"]

assert data["theoryReference"] == {
    "snapshotVersion": "2026-07-16-v1",
    "sourceUrl": "http://119.28.189.105/questions.js",
    "capturedAt": "2026-07-16",
    "strictMatchedQuestions": 830,
    "appliedDerivedAnswers": 649,
    "unmatchedDerivedAnswers": 61,
    "editorialReviewVersion": "2026-07-17-v3",
    "editorialReviewedAnswers": 23,
    "remainingHeuristicAnswers": 0,
    "reviewBatchId": "theory-900-review-2026-07-26-v1",
    "reviewVersion": "2026-07-28-v9",
    "reviewedQuestions": 900,
    "independentExplanations": 900,
    "resolvedConflicts": 5,
}
audit = json.loads(DEFAULT_THEORY_AUDIT_PATH.read_text(encoding="utf-8"))
assert audit["version"] == "2026-07-19-v7"
assert audit["officialAnswersSha256"] == EXPECTED_OFFICIAL_ANSWER_HASH
assert audit["summary"] == {
    "strictMatches": 830,
    "appliedDerivedAnswers": 649,
    "unmatchedDerivedAnswers": 61,
    "preservedOfficialAnswers": 190,
    "strictMatchedOfficialAnswers": 181,
    "unmatchedOfficialAnswers": 9,
    "strictOfficialDifferences": 5,
    "appliedEditorialReviews": 23,
    "remainingHeuristicAnswers": 38,
}
assert audit["editorialReview"]["version"] == "2026-07-17-v3"
assert audit["editorialReview"]["appliedReviews"] == 23
assert len(audit["editorialReview"]["results"]) == 23

review_manifest_path = Path("data/references/theory-review-state/manifest.json")
review_audit_path = Path("data/references/theory-review-audit.json")
review_audit = json.loads(review_audit_path.read_text(encoding="utf-8"))
theory_review = data["theoryReview"]
assert theory_review == {
    "batchId": "theory-900-review-2026-07-26-v1",
    "version": "2026-07-28-v9",
    "publishedAt": review_audit["generatedAt"],
    "reviewedQuestions": 900,
    "independentExplanations": 900,
    "crossReviewedQuestions": 900,
    "crossReviewShards": 9,
    "answerChanges": 79,
    "officialAnswerChanges": 0,
    "resolvedConflicts": 5,
    "basisCounts": {
        "independent_review": 139,
        "official_word": 190,
        "secondary_site": 571,
    },
    "manifestPath": "data/references/theory-review-state/manifest.json",
    "manifestSha256": file_sha256(review_manifest_path),
    "auditPath": "data/references/theory-review-audit.json",
}
assert review_audit["version"] == data["version"]
assert review_audit["batchId"] == theory_review["batchId"]
assert review_audit["basisCounts"] == theory_review["basisCounts"]
assert review_audit["answerChanges"]["count"] == theory_review["answerChanges"]
assert review_audit["answerChanges"]["officialAnswerChanges"] == 0
assert review_audit["conflicts"]["open"] == 0
assert review_audit["conflicts"]["resolved"] == 5
assert review_audit["explanations"]["total"] == 900
assert review_audit["explanations"]["crossReviewed"] == 900
assert review_audit["explanations"]["duplicateGroups"] == []
assert review_audit["explanations"]["warnings"] == []
assert review_audit["manifest"]["sha256"] == theory_review["manifestSha256"]
# 发布封条盖的是紧凑序列化的字节，不是某个文件的字节。实体层能逐字节复现它，
# 所以拆分 content.json 之后封条依然有效，无需重新盖章。
assert review_audit["output"]["publishedContentSha256"] == hashlib.sha256(canonical_bytes(data)).hexdigest()
assert len(review_audit["shards"]) == 9
assert sum(shard["count"] for shard in review_audit["shards"]) == 900

state_summary = validate_theory_review_state(
    content_path=None,  # None = 用实体层装配的当前题库
    reference_path=DEFAULT_REFERENCE_PATH,
    audit_path=DEFAULT_THEORY_AUDIT_PATH,
    state_dir=Path("data/references/theory-review-state"),
)
assert state_summary["reviewed"] == 900
assert state_summary["byExplanationGenerationStatus"] == {"reviewed": 900}
quality_report, quality_errors = build_theory_review_quality_report(
    content_path=None,  # None = 用实体层装配的当前题库
    reference_path=DEFAULT_REFERENCE_PATH,
    audit_path=DEFAULT_THEORY_AUDIT_PATH,
    state_dir=Path("data/references/theory-review-state"),
    require_complete=True,
)
assert quality_errors == []
assert quality_report["crossReviewedExplanations"] == 900
assert len(practical) == len({t["code"] for t in practical}) == 40
assert sum(t["hasNotebook"] for t in practical) == 20
assert Counter(t["answerSource"] for t in practical) == {"official": 6, "derived": 34}
assert Counter(t["answerBasis"] for t in practical) == {
    "manual_official": 6,
    "completed_reference_notebook": 16,
    "official_dataset_analysis": 4,
    "official_template_completion": 9,
    "official_task_rubric_example": 5,
}
official_practical_answers = [t for t in practical if t["answerSource"] == "official"]
# 指纹要覆盖官方答案的全部落点。Word 正文自 2026-07-28-v9 起搬进结构化的 wordAnswer，
# 只按 referenceAnswer 取指纹就等于放开了对正文的防篡改。
official_practical_payload = [
    [task["code"], task["referenceAnswer"], task.get("wordAnswer")] for task in official_practical_answers
]
assert hashlib.sha256(json.dumps(official_practical_payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest() == EXPECTED_OFFICIAL_PRACTICAL_ANSWER_HASH
for task in official_practical_answers:
    assert task["answerBasis"] == "manual_official", task["code"]
    answer = task["referenceAnswer"]
    # 纯文档题（3.1.1/4.2.1）整段都是 Word 正文，referenceAnswer 因此为空。
    assert answer.strip() or task.get("wordAnswer", {}).get("deliverables"), task["code"]
    assert not re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", answer), task["code"]
    assert "人工智能训练师（三级）操作技能考核" not in answer, task["code"]
    assert "试题单" not in answer and "试题代码：" not in answer and "试题名称：" not in answer, task["code"]
assert Counter(t["notebook"]["solutionSource"] for t in practical if t["hasNotebook"]) == {"completed_reference_notebook": 20}
assert len(data["officialPracticalMockCodes"]) == 6
by_code = {t["code"]: t for t in practical}
assert sum(by_code[code]["maxScore"] for code in data["officialPracticalMockCodes"]) == 100
spreadsheet_snapshot = load_practical_spreadsheet_snapshot(DEFAULT_PRACTICAL_SPREADSHEET_PATH)
assert data["practicalReferences"] == {
    "snapshotVersion": "2026-07-27-v2",
    "capturedAt": "2026-07-27",
    "analysisTool": "@oai/artifact-tool 2.8.6",
    "analyzedTasks": 4,
}
spreadsheet_entries = {entry["code"]: entry for entry in spreadsheet_snapshot["answers"]}
assert set(spreadsheet_entries) == {"3.1.2", "3.1.3", "3.1.4", "3.1.5"}
for code, entry in spreadsheet_entries.items():
    task = by_code[code]
    assert task["answerSource"] == "derived"
    assert task["answerBasis"] == "official_dataset_analysis"
    assert practical_task_fingerprint(task) == entry["taskSha256"], code
    # 作答示例自 2026-07-28-v9 起改存结构化的 wordAnswer（scripts/practical_word_answers.py
    # 按官方参考快照写入），referenceAnswer 因此清空。本快照继续为数据分析结论提供依据。
    assert task["referenceAnswer"] == "", code
    assert task["wordAnswer"]["deliverables"], code
    spreadsheet = next(material for material in task["materials"] if material["kind"] == "spreadsheet")
    assert spreadsheet["name"] == entry["material"]["name"], code
    assert spreadsheet["sha256"] == entry["material"]["sha256"], code
assert spreadsheet_entries["3.1.2"]["metrics"]["response"]["mean"] == 1.064
assert spreadsheet_entries["3.1.3"]["metrics"]["functions"]["心率"]["delay"] == 1.502
assert spreadsheet_entries["3.1.4"]["metrics"]["functions"]["bodyFat"]["count"] == 8
assert spreadsheet_entries["3.1.5"]["metrics"]["responseCorrelations"]["temperature"] == 0.004
template_snapshot = load_practical_template_snapshot(DEFAULT_PRACTICAL_TEMPLATE_PATH)
assert data["practicalTemplateReferences"] == {
    "snapshotVersion": "2026-07-27-v2",
    "capturedAt": "2026-07-27",
    "reviewMethod": "official_docx_blank_slots",
    "reviewedTasks": 9,
    "filledBlankSlots": 45,
}
template_entries = {entry["code"]: entry for entry in template_snapshot["answers"]}
assert set(template_entries) == {"4.1.1", "4.1.2", "4.1.3", "4.1.4", "4.1.5", "4.2.2", "4.2.3", "4.2.4", "4.2.5"}
assert sum(len(entry["fills"]) for entry in template_entries.values()) == 45
for code, entry in template_entries.items():
    task = by_code[code]
    assert task["answerSource"] == "derived"
    assert task["answerBasis"] == "official_template_completion"
    assert practical_task_fingerprint(task) == entry["taskSha256"], code
    assert task["referenceAnswer"] == "", code
    fills = task["wordAnswer"]["deliverables"][0]["fills"]
    assert [fill["order"] for fill in fills] == [1, 2, 3, 4, 5], code
    assert all(fill["answer"].strip() and fill["label"].strip() for fill in fills), code
    template = next(material for material in task["materials"] if material["kind"] == "document")
    assert template["name"] == entry["template"]["name"], code
    assert template["sha256"] == entry["template"]["sha256"], code
    published_template = Path("public") / unquote(template["url"]).lstrip("/")
    assert len(template_blank_slots(published_template)) == entry["template"]["blankCount"] == 5, code
rubric_snapshot = load_practical_rubric_snapshot(DEFAULT_PRACTICAL_RUBRIC_PATH)
assert data["practicalRubricReferences"] == {
    "snapshotVersion": "2026-07-27-v2",
    "capturedAt": "2026-07-27",
    "reviewMethod": "official_task_and_rubric_editorial",
    "reviewedTasks": 5,
    "coveredRubricItems": 26,
}
rubric_entries = {entry["code"]: entry for entry in rubric_snapshot["answers"]}
assert set(rubric_entries) == {"1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5"}
assert sum(len(entry["rubricCoverage"]) for entry in rubric_entries.values()) == 26
for code, entry in rubric_entries.items():
    task = by_code[code]
    assert task["answerSource"] == "derived"
    assert task["answerBasis"] == "official_task_rubric_example"
    assert practical_task_fingerprint(task) == entry["taskSha256"], code
    assert set(entry["rubricCoverage"]) == {item["id"] for item in task["rubric"]}, code
    assert not task["materials"], code
    assert task["referenceAnswer"] == "", code
    # 1.2 是一份 .docx 答两问，每个小节都要标明归属，否则答题卷会漏掉一整问。
    sections = task["wordAnswer"]["deliverables"][0]["sections"]
    assert {section["part"] for section in sections} == {1, 2}, code
    assert all(section["heading"].strip() and section["items"] for section in sections), code
rubric_items = [item for task in practical for item in task["rubric"]]
assert len(rubric_items) == 297
assert sum(item["points"] > 1 for item in rubric_items) == 177
assert all(float(item["points"]).is_integer() and 1 <= item["points"] <= 6 for item in rubric_items)
for task in practical:
    assert task["answerBasis"] in {"manual_official", "completed_reference_notebook", "official_dataset_analysis", "official_template_completion", "official_task_rubric_example", "official_rubric"}, task["code"]
    assert task["rubric"] and abs(sum(item["points"] for item in task["rubric"]) - task["maxScore"]) < .001, task["code"]
    assert all(item["mode"] in {"auto", "self"} for item in task["rubric"])
    assert isinstance(task["materials"], list), task["code"]
    if task["hasNotebook"]:
        notebook = task["notebook"]
        assert notebook and notebook["cells"] and notebook["solutionCells"], task["code"]
        template_source = "\n".join(cell["source"] for cell in notebook["cells"])
        solution_source = "\n".join(cell["source"] for cell in notebook["solutionCells"])
        assert BLANK_PATTERN.search(template_source), task["code"]
        assert not BLANK_PATTERN.search(solution_source), task["code"]
        assert hashlib.sha256(solution_source.encode("utf-8")).hexdigest() == notebook["solutionSha256"], task["code"]
        if task["answerSource"] == "derived":
            assert "配套完成版 Notebook" in task["referenceAnswer"], task["code"]
            assert task["answerBasis"] == "completed_reference_notebook", task["code"]

materials = [material for task in practical for material in task["materials"]]
assert sum(bool(task["materials"]) for task in practical) == 35
assert len(materials) == 74
assert Counter(material["kind"] for material in materials) == {
    "notebook": 20,
    "dataset": 13,
    "document": 20,
    "spreadsheet": 7,
    "image": 5,
    "text": 3,
    "model": 5,
    "code": 1,
}
assert all(len(material["sha256"]) == 64 and material["size"] > 0 and material["note"] for material in materials)
word_preview_tasks = [task for task in practical if task["group"] in {"4.1", "4.2"}]
assert len(word_preview_tasks) == 10
for task in word_preview_tasks:
    documents = [material for material in task["materials"] if material["kind"] == "document"]
    assert len(documents) == 1, task["code"]
    preview = documents[0].get("preview")
    assert preview and all(block["kind"] in {"heading", "list", "paragraph"} and block["text"].strip() for block in preview), task["code"]
    if task["group"] == "4.1":
        assert sum(block["text"] == "学习目标：" for block in preview) == 5, task["code"]
    else:
        assert sum(bool(re.search(r"_{5,}", block["text"])) for block in preview) == 5, task["code"]
assert not any(material.get("preview") for task in practical if task["group"] not in {"4.1", "4.2"} for material in task["materials"])
for material in materials:
    if not material["url"]:
        assert material["kind"] == "model", material["name"]
        continue
    published = Path("public") / unquote(material["url"]).lstrip("/")
    assert published.exists() and published.is_file(), published
    if material["kind"] != "notebook":
        assert published.stat().st_size == material["size"], published
        assert file_sha256(published) == material["sha256"], published
for code in ["3.1.1", "3.1.2", "3.1.3", "3.1.4", "3.1.5"]:
    spreadsheets = [material for material in by_code[code]["materials"] if material["kind"] == "spreadsheet"]
    assert len(spreadsheets) == 1 and spreadsheets[0]["url"].startswith(f"/materials/{code}/"), code
    assert (Path("public/materials") / code / spreadsheets[0]["name"]).exists(), code

material_audit = json.loads(Path("data/references/practical-material-audit.json").read_text(encoding="utf-8"))
assert material_audit["contentVersion"] in {"2026-07-19-v7", data["version"]}
assert material_audit["summary"]["sourceDirectories"] == 35
assert material_audit["summary"]["tasksWithMaterials"] == 35
assert material_audit["summary"]["tasksWithoutOfficialFiles"] == ["1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5"]
assert material_audit["summary"]["orphanSourceDirectories"] == []
assert material_audit["summary"]["materialFiles"] == 74
assert material_audit["summary"]["sourceTreeSha256"] == "3f2bd85018e21d8ba11cee6fb9b6f624734122fd79f58dec647eb492261cb1ab"
assert material_audit["summary"]["sourceFilesRegistered"] == 74
assert material_audit["summary"]["exactBrowserCopies"] == 49
assert material_audit["summary"]["browserDeliveriesVerified"] == 74
assert material_audit["summary"]["tasksFullyRegistered"] == 40
for task in practical:
    audited = next(item for item in material_audit["tasks"] if item["code"] == task["code"])
    assert audited["files"] == len(task["materials"]), task["code"]
    assert audited["allSourceFilesRegistered"], task["code"]
    assert all(item["deliveryVerified"] for item in audited["materials"]), task["code"]
    assert [item["sha256"] for item in audited["materials"]] == [item["sha256"] for item in task["materials"]], task["code"]
    assert [item.get("preview") for item in audited["materials"]] == [item.get("preview") for item in task["materials"]], task["code"]
for code in ["3.1.1", "3.1.2", "3.1.3", "3.1.4", "3.1.5"]:
    audited = next(item for item in material_audit["tasks"] if item["code"] == code)
    assert len(audited["materials"]) == 1
    assert audited["materials"][0]["kind"] == "spreadsheet"
    assert audited["materials"][0]["delivery"] == "direct-download"
    assert audited["materials"][0]["publishedExactCopy"] is True
source_audit = json.loads(Path("data/references/practical-source-audit.json").read_text(encoding="utf-8"))
assert source_audit["summary"] == {
    "tasks": 40,
    "titleMatches": 40,
    "descriptionMatches": 40,
    "rubricCountMatches": 40,
    "rubricItemChecks": 297,
    "rubricItemExactMatches": 297,
}

notebook_snapshot = load_notebook_solution_snapshot(DEFAULT_NOTEBOOK_SNAPSHOT_PATH)
assert all(solution["sourceOutputs"] >= 1 for solution in notebook_snapshot["solutions"])
assert data["notebookSolutions"] == {
    "snapshotVersion": "2026-07-16-v1",
    "capturedAt": "2026-07-16",
    "notebookSolutions": 20,
    "derivedNotebookSolutions": 16,
    "solutionsWithBlanks": 0,
}
notebook_audit = json.loads(DEFAULT_NOTEBOOK_AUDIT_PATH.read_text(encoding="utf-8"))
assert notebook_audit["summary"] == {
    "notebookSolutions": 20,
    "derivedNotebookSolutions": 16,
    "officialNotebookSolutions": 4,
    "solutionCodeCells": 33,
    "solutionsWithBlanks": 0,
}
manifest_path = Path("public/labs/manifest.json")
if manifest_path.exists():
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert len(manifest["tasks"]) == 20
    assert all(chunk["size"] <= 16 * 1024 * 1024 for model in manifest["models"].values() for chunk in model["chunks"])
    assert all(model["sourceVariant"] == "browser-quantized" for model in manifest["models"].values())
    original_model_hashes = {material["sha256"] for material in materials if material["kind"] == "model"}
    assert {model["originalSha256"] for model in manifest["models"].values()} == original_model_hashes
    for model in manifest["models"].values():
        for chunk in model["chunks"]:
            published = Path("public") / chunk["url"].lstrip("/")
            assert published.exists() and published.stat().st_size == chunk["size"], published
            assert file_sha256(published) == chunk["sha256"], published
print(json.dumps(data["stats"], ensure_ascii=False, indent=2))
print("内容验证通过")
