// 实体层在 Node 脚本侧的装配入口（从磁盘读，不经打包器）。
//
// 为什么不复用 data/entities/index.ts：那是给 Next 打包器用的静态 import barrel，
// Node 的 ESM 要求 JSON 导入必须带 `with { type: "json" }`，而 TS/Next 不需要——
// 同一个文件没法同时满足两边。这里从文件系统装配，逻辑与 barrel 保持一致，
// contracts 断言 barrel 的 import 清单与目录内容相符，两者不会结构性走散。
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const entitiesRoot = join(root, "data", "entities");

const THEORY_TYPES = ["judge", "single", "multi"];
const AUDIT_BLOCKS = {
  theoryReference: "theory-reference",
  notebookSolutions: "notebook-solutions",
  practicalReferences: "practical-references",
  practicalTemplateReferences: "practical-template-references",
  practicalRubricReferences: "practical-rubric-references",
  theoryReview: "theory-review",
};

const readJson = async (...parts) => JSON.parse(await readFile(join(entitiesRoot, ...parts), "utf8"));

export async function practicalCodes() {
  const files = (await readdir(join(entitiesRoot, "practical"))).filter(name => name.endsWith(".json"));
  return files.map(name => name.replace(/\.json$/, "")).sort();
}

export async function assembleBank() {
  const meta = await readJson("meta.json");
  const theory = (await Promise.all(THEORY_TYPES.map(name => readJson("theory", `${name}.json`)))).flat();
  const practical = await Promise.all((await practicalCodes()).map(code => readJson("practical", `${code}.json`)));

  const bank = { version: meta.version, generatedFrom: meta.generatedFrom };
  for (const [key, file] of Object.entries(AUDIT_BLOCKS)) bank[key] = await readJson("audit", `${file}.json`);
  bank.theory = theory;
  bank.officialTheoryMock = await readJson("exams", "theory-official.json");
  bank.practical = practical;
  bank.officialPracticalMockCodes = (await readJson("exams", "practical-official.json")).taskCodes;
  // stats 是推导值，不存储——存储就意味着可能与实体不一致。
  bank.stats = {
    theoryQuestions: theory.length,
    officialTheoryAnswers: theory.filter(q => q.answerSource === "official").length,
    derivedTheoryAnswers: theory.filter(q => q.answerSource !== "official").length,
    practicalTasks: practical.length,
    notebookTasks: practical.filter(t => t.hasNotebook).length,
    officialPracticalAnswers: practical.filter(t => t.answerSource === "official").length,
  };
  return bank;
}
