import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
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
await cp(
  resolve(projectRoot, "scripts", "manage-database.mjs"),
  resolve(outputRoot, "scripts", "manage-database.mjs"),
);
await writeFile(resolve(outputRoot, "DEPLOYMENT.txt"), [
  "AI Trainer self-hosted release",
  ...(sourceRevision ? [`Source revision: ${sourceRevision}`] : []),
  "Start with: HOSTNAME=127.0.0.1 PORT=3000 node server.js",
  "",
].join("\n"));

console.log(`Packaged self-hosted release at ${outputRoot}`);
