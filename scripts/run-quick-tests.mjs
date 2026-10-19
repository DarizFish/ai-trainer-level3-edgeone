import { spawn } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is unavailable; run this script through npm run test:quick");
const children = new Set();
let stopping = false;

function stopChildren(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, "run", script], {
      stdio: "inherit",
      windowsHide: true,
    });
    children.add(child);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      children.delete(child);
      if (code === 0) resolve();
      else reject(new Error(`${script} failed${signal ? ` with ${signal}` : ` with exit code ${code}`}`));
    });
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopChildren(signal);
    process.exitCode = 1;
  });
}

try {
  // The two static analyzers are independent and CPU-bound. Content validation
  // and contract tests both launch Python fixture processes, so keep those
  // sequential after the static pair to avoid Windows process-spawn flakiness.
  await Promise.all([run("lint"), run("typecheck")]);
  await run("test:miniprogram");
  await run("content:validate");
  await run("content:miniprogram:audit");
  await run("test:contracts");
} catch (error) {
  stopChildren();
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
