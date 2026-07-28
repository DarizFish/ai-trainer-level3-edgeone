// 生成 data/entities/index.ts —— 实体层在 TypeScript 侧的装配入口。
//
// 为什么要生成一个显式的 barrel，而不是让 lib/content.ts 动态读目录：Next 的打包需要
// 静态 import，运行时 glob 拿不到文件。也不用「构建期合成一个大 JSON」的做法——那样
// lib/content.ts 会依赖一个 gitignore 的产物，新克隆或直接跑 test:contracts 时就会
// 找不到文件。
//
// 这个文件是生成的，但**要提交**：它是源码依赖。contracts 里有断言校验它与目录内容
// 一致，漏跑生成器会被拦下。
import { readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const entities = join(root, "data", "entities");

const listJson = async (sub) =>
  (await readdir(join(entities, sub))).filter(name => name.endsWith(".json")).sort();

const practicalFiles = await listJson("practical");
const theoryTypes = ["judge", "single", "multi"];

const ident = (code) => `t${code.replaceAll(".", "_")}`;

const lines = [
  "// 由 scripts/build-entity-index.mjs 生成，请勿手工编辑。",
  "// 实体层：data/entities/ 下按实体切分的题库资产。改一道题只碰一个小文件，",
  "// 而不是重排 944KB 的单行大文件——那种 diff 是没法评审的。",
  "",
  ...theoryTypes.map(name => `import ${name}Questions from "./theory/${name}.json";`),
  "",
  ...practicalFiles.map(file => `import ${ident(file.replace(/\.json$/, ""))} from "./practical/${file}";`),
  "",
  'import meta from "./meta.json";',
  'import theoryOfficialExam from "./exams/theory-official.json";',
  'import practicalOfficialExam from "./exams/practical-official.json";',
  'import theoryReference from "./audit/theory-reference.json";',
  'import notebookSolutions from "./audit/notebook-solutions.json";',
  'import practicalReferences from "./audit/practical-references.json";',
  'import practicalTemplateReferences from "./audit/practical-template-references.json";',
  'import practicalRubricReferences from "./audit/practical-rubric-references.json";',
  'import theoryReview from "./audit/theory-review.json";',
  "",
  "// 顺序即原有 ContentBank 的顺序：理论是 judge/single/multi 三段、段内按 id 递增，",
  "// 实操按题号排序。contracts 断言拼装结果与发布产物一致。",
  `const theory = [${theoryTypes.map(name => `...${name}Questions`).join(", ")}];`,
  `const practical = [${practicalFiles.map(file => ident(file.replace(/\.json$/, ""))).join(", ")}];`,
  "",
  "// stats 是推导值，不存储——存储就意味着可能与实体不一致。",
  "const stats = {",
  "  theoryQuestions: theory.length,",
  '  officialTheoryAnswers: theory.filter(q => q.answerSource === "official").length,',
  '  derivedTheoryAnswers: theory.filter(q => q.answerSource !== "official").length,',
  "  practicalTasks: practical.length,",
  "  notebookTasks: practical.filter(t => t.hasNotebook).length,",
  '  officialPracticalAnswers: practical.filter(t => t.answerSource === "official").length,',
  "};",
  "",
  "export const contentBank = {",
  "  version: meta.version,",
  "  generatedFrom: meta.generatedFrom,",
  "  theoryReference,",
  "  notebookSolutions,",
  "  practicalReferences,",
  "  practicalTemplateReferences,",
  "  practicalRubricReferences,",
  "  theoryReview,",
  "  theory,",
  "  officialTheoryMock: theoryOfficialExam,",
  "  practical,",
  "  officialPracticalMockCodes: practicalOfficialExam.taskCodes,",
  "  stats,",
  "};",
  "",
];

await writeFile(join(entities, "index.ts"), lines.join("\n"), "utf8");
console.log(`Generated data/entities/index.ts (${theoryTypes.length} theory files, ${practicalFiles.length} practical files)`);
