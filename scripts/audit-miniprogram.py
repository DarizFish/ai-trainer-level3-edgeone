"""Independently reconstruct every mini-program blank from canonical entities."""
import ast
import io
import json
import re
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / "data/content-assets.json").read_text(encoding="utf-8"))
bank = json.loads((ROOT / "public" / manifest["miniprogramPractical"].lstrip("/")).read_text(encoding="utf-8"))

def tokens(source):
    found = []
    try:
        for token in tokenize.generate_tokens(io.StringIO(source.strip()).readline):
            if token.type not in (tokenize.COMMENT, tokenize.NL, tokenize.NEWLINE, tokenize.ENDMARKER):
                found.append((token.type, token.string))
    except tokenize.TokenError as error:
        # A blank can sit on one line of a multi-line call. Whole-notebook AST
        # parsing below independently checks the complete syntax.
        # Python 3.12 adds "unexpected" to this same incomplete-line error.
        assert error.args[0] in (
            'EOF in multi-line statement',
            'unexpected EOF in multi-line statement',
        ), error
    return found

codes = set()
code_count = text_count = notebooks = 0
differences = []
for task in bank["tasks"]:
    code = task["code"]
    assert code not in codes, code
    codes.add(code)
    original = json.loads((ROOT / "data/entities/practical" / (code + ".json")).read_text(encoding="utf-8"))
    fields = task["fields"]
    assert task["description"] == original["description"]
    assert task["rubric"] == original["rubric"]
    by_line = {}
    for field in fields:
        ref = field["source"]
        if field["kind"] == "code":
            code_count += 1
            by_line.setdefault((ref["cellId"], ref["line"]), []).append(field)
        else:
            text_count += 1
            doc = next(d for d in original["wordAnswer"]["deliverables"] if d["fileName"] == ref["deliverable"])
            if "order" in ref:
                expected = next(f["answer"] for f in doc["fills"] if f["order"] == ref["order"])
            elif "section" in ref:
                section = doc["sections"][ref["section"] - 1]
                expected = "\n".join(section.get("items", []) + section.get("paragraphs", []))
            else:
                item = doc["items"][ref["item"] - 1]
                expected = item if isinstance(item, str) else item["solution"]
            assert field["answer"] == expected, (code, field["id"])
    if not original.get("hasNotebook"):
        continue
    notebooks += 1
    cells = []
    for cell in original["notebook"]["cells"]:
        lines = cell["source"].split("\n")
        for line_number, line in enumerate(lines, 1):
            blanks = list(re.finditer(r"_{5,}", line.split("#")[0]))
            if not blanks:
                continue
            matched = sorted(by_line[(cell["id"], line_number)], key=lambda f: f["source"]["slot"])
            assert len(matched) == len(blanks), (code, line_number)
            answers = iter(f["answer"] for f in matched)
            filled = re.sub(r"_{5,}", lambda _: next(answers), line)
            solution_ref = matched[0]["source"]
            solution_cell = next(c for c in original["notebook"]["solutionCells"] if c["id"] == solution_ref["solutionCellId"])
            solution_line = solution_cell["source"].split("\n")[solution_ref["solutionLine"] - 1]
            assert tokens(filled) == tokens(solution_line), (code, cell["id"], line_number, filled, solution_line)
            lines[line_number - 1] = filled
        cells.append("\n".join(lines))
    reconstructed = "\n".join(cells)
    solution = "\n".join(c["source"] for c in original["notebook"]["solutionCells"])
    actual_tree = ast.parse(reconstructed, filename=code)
    expected_tree = ast.parse(solution, filename=code + " reference")
    if code == "3.2.3":
        # The source template uses the old Pillow resize filter, whereas the
        # supplied completed notebook omits it. That line has no blank. Keep
        # the original template; allow only this exact pre-existing difference.
        old = "img.resize((64, 64), Image.ANTIALIAS)"
        assert reconstructed.count(old) == 1
        assert "img.resize((64, 64))" in solution
        actual_tree = ast.parse(reconstructed.replace(old, "img.resize((64, 64))"))
    if ast.dump(actual_tree) != ast.dump(expected_tree):
        differences.append(code)
assert len(codes) == 40
assert notebooks == 20
assert not differences, f"Reconstructed notebook differs from canonical solution: {differences}"
print(json.dumps({"tasks":len(codes), "notebooks":notebooks, "codeBlanks":code_count,
                  "textFields":text_count, "syntaxAndAST":"passed; 3.2.3 retains the template's existing Pillow filter"},ensure_ascii=False))
