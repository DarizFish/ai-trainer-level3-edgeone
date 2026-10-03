import { createHash } from "node:crypto";
import { rubricIdsFor } from "./miniprogram-rubrics.mjs";

const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const blanks = /_{5,}/g;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");

// Remove comments without cutting a # inside a Python string.
function codeOnly(line) {
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "\\") { i++; continue; }
    if (quote) { if (c === quote) quote = ""; }
    else if (c === "'" || c === '"') quote = c;
    else if (c === "#") return line.slice(0, i).trim();
  }
  return line.trim();
}

export function extractCodeFields(task) {
  const original = task.notebook.cells.flatMap((cell) => cell.source.split("\n").map((line, index) => ({
    cellId: cell.id, line: index + 1, original: line, code: codeOnly(line),
  })));
  const source = original.filter((row) => row.code);
  const solutions = task.notebook.solutionCells.flatMap((cell) => cell.source.split("\n").map((line, index) => ({
    cellId: cell.id, line: index + 1, original: line, code: codeOnly(line),
  }))).filter((row) => row.code);
  const patterns = source.map((row) => new RegExp(`^${row.code.split(blanks).map(escapeRegex).join("(.+?)")}$`));
  // Ordered alignment uses unchanged code as anchors, so repeated assignments
  // cannot borrow an answer from a different step of the same notebook.
  const dp = Array.from({ length: source.length + 1 }, () => new Float64Array(solutions.length + 1));
  const matched = source.map((row, i) => solutions.map((solution) => solution.code.match(patterns[i])));
  for (let i = 1; i <= source.length; i++) {
    for (let j = 1; j <= solutions.length; j++) {
      const weight = source[i - 1].code.includes("_____") ? 2 : 10;
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], matched[i - 1][j - 1] ? dp[i - 1][j - 1] + weight : -1);
    }
  }
  const mapping = new Map();
  let i = source.length, j = solutions.length;
  while (i > 0 && j > 0) {
    const weight = source[i - 1].code.includes("_____") ? 2 : 10;
    if (matched[i - 1][j - 1] && dp[i][j] === dp[i - 1][j - 1] + weight) {
      mapping.set(i - 1, j - 1); i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  const fields = [];
  for (const [index, row] of source.entries()) {
    const slots = [...row.code.matchAll(blanks)];
    if (!slots.length) continue;
    const target = mapping.get(index);
    if (target === undefined) throw new Error(`${task.code}: cannot align ${row.cellId}:${row.line}: ${row.original}`);
    const solution = solutions[target];
    const answers = matched[index][target].slice(1);
    if (answers.length !== slots.length || answers.some((value) => !value.trim())) throw new Error(`${task.code}: invalid code blanks`);
    const originalIndex = original.indexOf(row);
    const context = original.slice(Math.max(0, originalIndex - 2), originalIndex + 2).map((item) => item.original).join("\n");
    for (const [slot, answer] of answers.entries()) {
      fields.push({
        id: `${row.cellId}-L${row.line}-B${slot + 1}`,
        label: `第 ${row.line} 行 · 第 ${slot + 1} 空`,
        context, template: row.original, answer, kind: "code", rubricIds: task.rubric.map((item) => item.id),
        source: { cellId: row.cellId, line: row.line, slot: slot + 1, solutionCellId: solution.cellId, solutionLine: solution.line },
      });
    }
  }
  return fields;
}

function documentFields(task) {
  const deliverables = task.wordAnswer?.deliverables ?? [];
  const fields = [];
  for (const [di, doc] of deliverables.entries()) {
    for (const fill of doc.fills ?? []) fields.push({
      id: `doc-${di + 1}-blank-${fill.order}`, label: fill.label,
      context: task.description, answer: fill.answer, kind: "text", rubricIds: task.rubric.map((item) => item.id),
      source: { deliverable: doc.fileName, order: fill.order },
    });
    for (const [si, section] of (doc.sections ?? []).entries()) {
      const lines = [...(section.items ?? []), ...(section.paragraphs ?? [])];
      if (!lines.length) continue;
      fields.push({ id: `doc-${di + 1}-section-${si + 1}`, label: section.heading,
        context: task.description, answer: lines.join("\n"), kind: "text", rubricIds: task.rubric.map((item) => item.id),
        source: { deliverable: doc.fileName, section: si + 1 },
      });
    }
    for (const [ii, item] of (doc.items ?? []).entries()) fields.push({
      id: `doc-${di + 1}-item-${ii + 1}`, label: typeof item === "string" ? `流程要点 ${ii + 1}` : item.direction,
      context: task.description, answer: typeof item === "string" ? item : item.solution, kind: "text",
      rubricIds: task.rubric.map((rubric) => rubric.id), source: { deliverable: doc.fileName, item: ii + 1 },
    });
  }
  return fields;
}

export function buildMiniprogramContent(bank) {
  return {
    schemaVersion: 1, version: bank.version,
    tasks: bank.practical.map((task) => {
      // Code tasks may also require written deliverables; include both.
      const fields = [...(task.hasNotebook ? extractCodeFields(task) : []), ...documentFields(task)];
      for (const field of fields) field.rubricIds = rubricIdsFor(task, field);
      if (!fields.length || new Set(fields.map((field) => field.id)).size !== fields.length) throw new Error(`Invalid exercise ${task.code}`);
      return {
        code: task.code, title: task.title, group: task.group, category: task.category,
        description: task.description, rubric: task.rubric, maxScore: task.maxScore,
        materials: task.materials.map(({ label, name, note, preview }) => ({ label, name, note, preview })),
        fields, exerciseVersion: digest({ fields, rubric: task.rubric }),
      };
    }),
  };
}
