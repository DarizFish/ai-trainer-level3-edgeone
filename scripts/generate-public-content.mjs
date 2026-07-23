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
];

await Promise.all(files.map(({ name, payload }) => (
  writeFile(join(outputDirectory, name), JSON.stringify(payload))
)));

console.log(`Generated ${files.map(({ name }) => name).join(" and ")}`);
