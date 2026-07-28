import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleBank } from "./assemble-entities.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
// 直接从实体层装配，不再经过 data/content.json 这个中间大文件。
const content = await assembleBank();
const outputDirectory = join(projectRoot, "public", "content");

if (!/^[a-zA-Z0-9._-]+$/.test(content.version)) {
  throw new Error(`Content version cannot be used in a public filename: ${content.version}`);
}

await mkdir(outputDirectory, { recursive: true });

const files = [
  {
    name: `theory-${content.version}.json`,
    payload: {
      version: content.version,
      questions: content.theory,
      officialQuestionIds: content.officialTheoryMock.questionIds,
    },
  },
  {
    name: `practical-${content.version}.json`,
    payload: {
      version: content.version,
      tasks: content.practical,
      officialTaskCodes: content.officialPracticalMockCodes,
    },
  },
  {
    name: `practical-catalog-${content.version}.json`,
    payload: {
      version: content.version,
      tasks: content.practical.map((task) => {
        const descriptionExcerpt = task.description.length > 92
          ? `${task.description.slice(0, 92)}…`
          : task.description;
        const materialSummary = task.materials.length
          ? `${task.materials[0].label}${task.materials.length > 1 ? ` 等 ${task.materials.length} 份` : ""}`
          : "手册未配套文件";
        return {
          category: task.category,
          code: task.code,
          descriptionExcerpt,
          durationMinutes: task.durationMinutes,
          group: task.group,
          hasNotebook: task.hasNotebook,
          materialSummary,
          maxScore: task.maxScore,
          rubricCount: task.rubric.length,
          title: task.title,
          unit: task.unit,
        };
      }),
    },
  },
];

await Promise.all(files.map(({ name, payload }) => (
  writeFile(join(outputDirectory, name), JSON.stringify(payload))
)));

// 题目切换按钮只需要有序的题号、标题和 hasNotebook。它渲染在客户端组件里，若直接
// 走 lib/content 会把整份 data/content.json（0.89 MB）打进客户端包，所以这里单独
// 落一份约 1 KB 的索引给 lib/practical-nav.ts 用。contracts 断言两者一致。
const navIndexPath = join(projectRoot, "data", "practical-nav.json");
const navIndex = content.practical.map((task) => ({
  code: task.code,
  hasNotebook: task.hasNotebook,
  title: task.title,
}));
await writeFile(navIndexPath, `${JSON.stringify(navIndex, null, 2)}\n`);

console.log(`Generated ${files.map(({ name }) => name).join(", ")}, practical-nav.json`);
