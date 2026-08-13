import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = process.argv[2] ?? process.env.PORT ?? "3210";

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
  const { spawn } = await import("node:child_process");
  const nextBin = resolve(projectRoot, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", port], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => child.kill(signal));
  }
  child.once("exit", code => {
    process.exitCode = code ?? 1;
  });
}
