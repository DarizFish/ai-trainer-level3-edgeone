import { expect } from "@playwright/test";

export const notebookPath = "2-1-2/2.1.2.ipynb";

export async function exposeJupyterApp(page) {
  await page.route("**/lite/jupyter-lite.json*", async route => {
    const response = await route.fetch();
    const config = JSON.parse(await response.text());
    config["jupyter-config-data"].exposeAppInBrowser = "true";
    await route.fulfill({ response, body: JSON.stringify(config) });
  });
}

export async function openNotebook(page, workspace) {
  await exposeJupyterApp(page);
  await page.goto(
    `/lite/lab/index.html?path=${encodeURIComponent(notebookPath)}&workspace=${workspace}`,
    { waitUntil: "domcontentloaded" },
  );
}

export async function runtimeState(page) {
  return page.evaluate(async path => {
    if (!window.jupyterapp?.commands?.hasCommand("ai-trainer:get-runtime-state")) return null;
    return window.jupyterapp.commands.execute("ai-trainer:get-runtime-state", { path });
  }, notebookPath);
}

export async function waitForRuntimeReady(page, minimumGeneration = 1) {
  const deadline = Date.now() + 240_000;
  let state = null;
  while (Date.now() < deadline) {
    state = await runtimeState(page);
    if (state?.phase === "error") {
      throw new Error(`JupyterLite runtime failed: ${JSON.stringify(state)}`);
    }
    if (state?.phase === "ready" && state.generation >= minimumGeneration) break;
    await page.waitForTimeout(250);
  }
  if (!state || state.phase !== "ready" || state.generation < minimumGeneration) {
    throw new Error(`JupyterLite runtime timed out: ${JSON.stringify(state)}`);
  }
  expect(state).toMatchObject({
    path: notebookPath,
    phase: "ready",
    generation: expect.any(Number),
    kernelId: expect.any(String),
    lastError: null,
  });

  expect(state.generation).toBeGreaterThanOrEqual(minimumGeneration);
  return state;
}

export async function probePreparedEnvironment(page) {
  return page.evaluate(async path => {
    const app = window.jupyterapp;
    let panel = null;
    for (const widget of app.shell.widgets("main")) {
      if (widget?.context?.path === path) {
        panel = widget;
        break;
      }
    }
    const kernel = panel?.sessionContext?.session?.kernel;
    if (!kernel) throw new Error(`No kernel attached to ${path}`);
    const lines = [];
    const future = kernel.requestExecute({
      code: [
        "import warnings",
        "try:",
        "    import openpyxl; _pkg = True",
        "except Exception:",
        "    _pkg = False",
        "print(_pkg, any(f[2] is FutureWarning for f in warnings.filters))",
      ].join("\n"),
      store_history: false,
    });
    future.onIOPub = message => {
      if (message.header.msg_type === "stream") lines.push(message.content.text);
    };
    let timer;
    try {
      const reply = await Promise.race([
        future.done,
        new Promise((_resolve, reject) => {
          timer = window.setTimeout(() => reject(new Error("kernel probe timed out after 30s")), 30_000);
        }),
      ]);
      if (reply.content.status !== "ok") {
        throw new Error(`kernel probe returned ${reply.content.status}`);
      }
      return lines.join("").trim();
    } catch (error) {
      future.dispose?.();
      const runtime = await app.commands.execute("ai-trainer:get-runtime-state", { path });
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}; kernel=${kernel.status}/${kernel.connectionStatus}; runtime=${JSON.stringify(runtime)}`);
    } finally {
      if (timer !== undefined) window.clearTimeout(timer);
    }
  }, notebookPath);
}
