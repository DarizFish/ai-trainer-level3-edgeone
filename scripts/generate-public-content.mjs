import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const content = JSON.parse(await readFile(join(projectRoot, "data", "content.json"), "utf8"));
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
          answerBasis: task.answerBasis,
          answerSource: task.answerSource,
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

console.log(`Generated ${files.map(({ name }) => name).join(", ")}`);
