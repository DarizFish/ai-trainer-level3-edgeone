import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = process.argv[2] ?? process.env.PORT ?? "3210";
const parsedPort = Number.parseInt(port, 10);

if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
  throw new Error(`Invalid server port: ${port}`);
}

process.env.NODE_ENV ??= "production";
process.env.NEXT_RUNTIME ??= "nodejs";
process.env.NEXT_PRIVATE_START_TIME ??= Date.now().toString();

if (process.env.SELF_HOSTED_BUILD === "1") {
  const standaloneRoot = resolve(projectRoot, ".next", "standalone");
  await mkdir(resolve(standaloneRoot, ".next"), { recursive: true });
  await Promise.all([
    cp(resolve(projectRoot, ".next", "static"), resolve(standaloneRoot, ".next", "static"), { recursive: true }),
    cp(resolve(projectRoot, "public"), resolve(standaloneRoot, "public"), { recursive: true }),
  ]);
  process.env.HOSTNAME = "127.0.0.1";
  process.env.PORT = port;
  await import(pathToFileURL(resolve(standaloneRoot, "server.js")).href);
} else {
  // Keep Next in this process. Playwright owns the webServer process tree; a
  // wrapper that spawns another Node process can retain inherited stdout/stderr
  // handles after every test has passed, leaving the runner stuck in teardown.
  const nextStartPath = resolve(projectRoot, "node_modules", "next", "dist", "cli", "next-start.js");
  const nextStartModule = await import(pathToFileURL(nextStartPath).href);
  const nextStart = nextStartModule.nextStart ?? nextStartModule.default?.nextStart;
  if (typeof nextStart !== "function") throw new Error("Next.js nextStart entry point is unavailable");
  await nextStart({ hostname: "127.0.0.1", port: parsedPort }, projectRoot);
}
