import { createHash } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
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
    asset: "theory",
    base: `theory-${content.version}`,
    payload: {
      version: content.version,
      questions: content.theory,
      officialQuestionIds: content.officialTheoryMock.questionIds,
    },
  },
  {
    asset: "practical",
    base: `practical-${content.version}`,
    payload: {
      version: content.version,
      tasks: content.practical,
      officialTaskCodes: content.officialPracticalMockCodes,
    },
  },
  {
    asset: "practicalCatalog",
    base: `practical-catalog-${content.version}`,
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

// 文件名里必须带内容哈希，而不是只带 content.version。这三份题库按
// `immutable, max-age=31536000` 发布（见 next.config.ts），而 content.version 是
// data/entities/meta.json 里的人工版本号——只要改了题却忘了改它，URL 就不变，已经
// 取过这个 URL 的浏览器和 CDN 节点会把旧题库留整整一年，修好的题永远到不了学员。
// 这正是 docs/STATUS.md 第 4 节的教训：文件名不带内容哈希、内容却随构建变化的文件，
// 绝不能按 immutable 缓存。哈希由内容推导，改了题就换 URL，不依赖任何人记得改版本号。
const manifest = { version: content.version };
const written = [];
for (const { asset, base, payload } of files) {
  const body = JSON.stringify(payload);
  const digest = createHash("sha256").update(body).digest("hex").slice(0, 16);
  const name = `${base}.${digest}.json`;
  manifest[asset] = `/content/${name}`;
  written.push(name);
  await writeFile(join(outputDirectory, name), body);
}

// 旧哈希的副本必须删掉：它们会跟着部署一起发布，而且再也没有任何页面引用。
for (const entry of await readdir(outputDirectory)) {
  if (!written.includes(entry)) await rm(join(outputDirectory, entry), { recursive: true });
}

// 页面与加载器统一从这份清单取 URL（lib/content-assets.ts），不再自己拼文件名。
const manifestPath = join(projectRoot, "data", "content-assets.json");
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

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

console.log(`Generated ${written.join(", ")}, content-assets.json, practical-nav.json`);
