import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));

async function isAvailable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  if (process.env.TEST_BASE_URL) return;

  const port = Number.parseInt(process.env.TEST_PORT ?? "3210", 10);
  const url = `http://127.0.0.1:${port}/`;
  if (await isAvailable(url)) {
    if (process.env.CI) throw new Error(`${url} is already in use before the test server starts`);
    return;
  }

  const child = spawn(process.execPath, [resolve(projectRoot, "scripts", "start-built-server.mjs"), String(port)], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", chunk => process.stdout.write(`[WebServer] ${chunk}`));
  child.stderr.on("data", chunk => process.stderr.write(`[WebServer] ${chunk}`));

  const exited = new Promise(resolveExit => {
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });

  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) {
      await exited;
      return;
    }
    child.kill("SIGTERM");
    const closed = await Promise.race([
      exited.then(() => true),
      delay(10_000).then(() => false),
    ]);
    if (closed) return;
    child.kill("SIGKILL");
    await exited;
  };

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      const result = await exited;
      throw new Error(`Test server exited before becoming ready: ${JSON.stringify(result)}`);
    }
    if (await isAvailable(url)) return stop;
    await delay(250);
  }

  await stop();
  throw new Error(`Timed out waiting 120000ms for test server at ${url}`);
}
