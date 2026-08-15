import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const standaloneRoot = resolve(projectRoot, ".next", "standalone");
const outputRoot = resolve(projectRoot, "dist", "self-hosted");
const sourceRevision = process.env.SOURCE_REVISION?.trim();

if (sourceRevision && !/^[0-9a-f]{40}$/.test(sourceRevision)) {
  throw new Error("SOURCE_REVISION must be a full lowercase Git SHA");
}

await access(resolve(standaloneRoot, "server.js"));
await Promise.all([
  access(resolve(projectRoot, ".next", "static")),
  access(resolve(projectRoot, "public")),
]);

await rm(outputRoot, { force: true, recursive: true });
await mkdir(outputRoot, { recursive: true });
await cp(standaloneRoot, outputRoot, { recursive: true });
await cp(resolve(projectRoot, ".next", "static"), resolve(outputRoot, ".next", "static"), { recursive: true });
await cp(resolve(projectRoot, "public"), resolve(outputRoot, "public"), { recursive: true });
await cp(resolve(projectRoot, "drizzle"), resolve(outputRoot, "drizzle"), { recursive: true });
// 基础设施配置必须跟着同一个 artifact 走。它原先只存在仓库里、靠人手工同步到服务器，
// 结果三份里漂了一份：2026-08-14 实测服务器上的 /usr/local/sbin/deploy-aitrainer 是旧版，
// 整段数据库迁移门禁不存在，而 SELF-HOSTING.md 一直声称它在。手工同步的东西一定会漂，
// 唯一的修法是让它和应用代码走同一条已验证路径。deploy-release.sh 会在发布成功后据此
// 更新 Nginx 配置、systemd unit 和它自己。
await cp(resolve(projectRoot, "deploy"), resolve(outputRoot, "deploy"), { recursive: true });
await mkdir(resolve(outputRoot, "scripts"), { recursive: true });
const migrationScript = resolve(projectRoot, "scripts", "manage-database.mjs");
const packagedScript = resolve(outputRoot, "scripts", "manage-database.mjs");
await cp(migrationScript, packagedScript);

// 迁移脚本不经过 webpack：它以源码形式随 artifact 下发，由 deploy-release.sh 直接执行。
// 而 Next 的 standalone 只带「应用 server 代码 trace 到」的依赖，应用里的 postgres 已经被
// 打进 .next/server 的 chunk，不会以包的形式留在 node_modules 里——2026-08-15 线上因此报
// `ERR_MODULE_NOT_FOUND: Cannot find package 'postgres'`，发布中断在迁移这一步。
//
// 所以脚本自己的第三方依赖必须显式带上。放在 scripts/node_modules 而不是根 node_modules：
// 后者是 Next trace 出来的，混入手工拷贝的内容会分不清哪些是自动的、哪些不是。
const scriptModules = resolve(outputRoot, "scripts", "node_modules");
const pending = [...(await readFile(migrationScript, "utf8")).matchAll(/^import\s[^"']*["']([^"']+)["']/gm)]
  .map(match => match[1])
  .filter(specifier => !specifier.startsWith("node:") && !specifier.startsWith("."));
const packaged = new Set();
while (pending.length > 0) {
  const specifier = pending.pop();
  if (packaged.has(specifier)) continue;
  packaged.add(specifier);
  const target = resolve(scriptModules, specifier);
  await cp(resolve(projectRoot, "node_modules", specifier), target, { recursive: true });
  // 传递依赖照 npm 的扁平布局一并带上；当前 postgres@3.4.7 是零依赖，这个循环只跑一轮。
  const manifest = JSON.parse(await readFile(resolve(target, "package.json"), "utf8"));
  pending.push(...Object.keys(manifest.dependencies ?? {}));
}

// 拷完必须验证，而且要验证「解析结果落在 artifact 里」而不是「能 import 到」——本仓库的
// node_modules 是 dist/ 的祖先目录，只判断能否 import 的话，即使一个字节都没拷进去也照样
// 通过，等于没验。少拷一个包会让解析逃到仓库的 node_modules，这里当场发现。
const requireFromPackagedScript = createRequire(packagedScript);
for (const specifier of packaged) {
  const resolved = requireFromPackagedScript.resolve(specifier);
  if (!resolved.startsWith(outputRoot)) {
    throw new Error(`${specifier} resolves outside the release to ${resolved}; the migration script would fail on the server`);
  }
}

await writeFile(resolve(outputRoot, "DEPLOYMENT.txt"), [
  "AI Trainer self-hosted release",
  ...(sourceRevision ? [`Source revision: ${sourceRevision}`] : []),
  "Start with: HOSTNAME=127.0.0.1 PORT=3000 node server.js",
  "",
].join("\n"));

console.log(`Packaged self-hosted release at ${outputRoot}`);
