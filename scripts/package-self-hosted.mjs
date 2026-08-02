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
await writeFile(resolve(outputRoot, "DEPLOYMENT.txt"), [
  "AI Trainer self-hosted release",
  ...(sourceRevision ? [`Source revision: ${sourceRevision}`] : []),
  "Start with: HOSTNAME=127.0.0.1 PORT=3000 node server.js",
  "",
].join("\n"));

console.log(`Packaged self-hosted release at ${outputRoot}`);
