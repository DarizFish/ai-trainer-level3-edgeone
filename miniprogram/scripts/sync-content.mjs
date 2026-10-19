import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const website = resolve(process.argv[2] ?? join(root, ".."));
const { assembleBank } = await import(pathToFileURL(join(website, "scripts/assemble-entities.mjs")).href);
const { buildMiniprogramContent } = await import(pathToFileURL(join(website, "scripts/miniprogram-content.mjs")).href);
const bank = await assembleBank();
const manifest = JSON.parse(await readFile(join(website, "data/content-assets.json"), "utf8"));
const theory = JSON.parse(await readFile(join(website, "public", manifest.theory), "utf8"));
const payload = {
  schemaVersion: 1, version: bank.version,
  contentId: createHash("sha256").update(manifest.theory).digest("hex"),
  questions: theory.questions, officialQuestionIds: theory.officialQuestionIds,
  tasks: buildMiniprogramContent(bank).tasks,
};
await mkdir(join(root, "data"), { recursive: true });
await writeFile(join(root, "data/bundled.js"), `// Generated from website entities. Run npm run content:sync; do not edit.\nmodule.exports = ${JSON.stringify(payload)};\n`);
// Full context is bundled separately so the existing public content API remains
// compatible. The exercise version prevents applying old code to changed blanks.
const contexts = Object.fromEntries(payload.tasks.map(task => {
  const original = bank.practical.find(item => item.code === task.code);
  return [task.code, {
    exerciseVersion: task.exerciseVersion,
    cells: original.notebook?.cells ?? [],
    documents: (original.wordAnswer?.deliverables ?? []).map(({fileName, mode}) => ({fileName, mode})),
  }];
}));
await writeFile(join(root, "data/practical-context.js"), `// Generated from website entities by content:sync; do not edit.\nmodule.exports = ${JSON.stringify(contexts)};\n`);
console.log(`Synced ${payload.questions.length} theory questions and ${payload.tasks.length} practical tasks (${Buffer.byteLength(JSON.stringify(payload))} bytes).`);
