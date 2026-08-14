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
  await page.addInitScript(() => {
    window.__aiTrainerDialogTitles = [];
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const dialogs = node.matches(".jp-Dialog") ? [node] : [...node.querySelectorAll(".jp-Dialog")];
          for (const dialog of dialogs) {
            const text = dialog.textContent ?? "";
            if (/Select Kernel|选择内核/i.test(text)) window.__aiTrainerDialogTitles.push(text);
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
  await page.goto(
    `/lite/lab/index.html?path=${encodeURIComponent(notebookPath)}&workspace=${workspace}`,
    { waitUntil: "domcontentloaded" },
  );
  await waitForNotebookPanel(page);
}

async function notebookObservation(page) {
  return page.evaluate(path => {
    const app = window.jupyterapp;
    if (!app) {
      return { appExposed: false, commandReady: false, panelOpen: false, openPaths: [] };
    }
    const openPaths = [...app.shell.widgets("main")]
      .map(widget => widget.context?.path)
      .filter(path => typeof path === "string");
    return {
      appExposed: true,
      commandReady: app.commands.hasCommand("ai-trainer:get-runtime-state"),
      panelOpen: openPaths.includes(path),
      openPaths,
    };
  }, notebookPath);
}

export async function waitForNotebookPanel(page) {
  let observed = null;
  try {
    await expect.poll(async () => {
      observed = await notebookObservation(page);
      return observed.commandReady && observed.panelOpen;
    }, {
      message: `JupyterLite should open ${notebookPath} before runtime commands execute`,
      timeout: 120_000,
      intervals: [100, 250, 500, 1_000],
    }).toBe(true);
  } catch (error) {
    throw new Error(`JupyterLite did not register the target Notebook: ${JSON.stringify(observed)}`, { cause: error });
  }
  return observed;
}

export async function runtimeState(page) {
  return page.evaluate(async path => {
    const app = window.jupyterapp;
    if (!app?.commands?.hasCommand("ai-trainer:get-runtime-state")) return null;
    const panelOpen = [...app.shell.widgets("main")].some(widget => widget.context?.path === path);
    if (!panelOpen) return null;
    return app.commands.execute("ai-trainer:get-runtime-state", { path });
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

export async function probePreparedEnvironment(page, path = notebookPath) {
  return page.evaluate(async path => {
    const app = window.jupyterapp;
    const result = await app.commands.execute("ai-trainer:probe-environment", { path });
    return result.output;
  }, path);
}
