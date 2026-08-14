import { expect, test } from "@playwright/test";
import {
  notebookPath,
  openNotebook,
  probePreparedEnvironment,
  waitForRuntimeReady,
} from "./jupyterlite-runtime-helpers.mjs";

// Exercise cold start and restart in the same worker. A separate heavy cold-
// start test duplicated the Pyodide/openpyxl setup immediately before this
// scenario, which retained enough WebAssembly memory to starve slow CI runners
// while adding no distinct assertion.
test("kernel lifecycle prepares cold start and a new restart generation", async ({ page }) => {
  test.setTimeout(420_000);
  await openNotebook(page, `kernel-restart-${Date.now()}`);

  const before = await waitForRuntimeReady(page);
  expect(await probePreparedEnvironment(page)).toBe("env-ok True True True");

  const after = await page.evaluate(
    path => window.jupyterapp.commands.execute("ai-trainer:restart-and-prepare", { path }),
    notebookPath,
  );

  expect(after).toMatchObject({ phase: "ready", lastError: null });
  expect(after.generation).toBeGreaterThan(before.generation);
  expect(await probePreparedEnvironment(page)).toBe("env-ok True True True");
});

test("cold start owns one kernel and never asks the user to select one", async ({ page }) => {
  test.setTimeout(300_000);
  await openNotebook(page, `kernel-owner-${Date.now()}`);

  const dialog = page.locator(".jp-Dialog").filter({ hasText: /Select Kernel|选择内核/i });
  await expect(dialog).toHaveCount(0);
  const ready = await waitForRuntimeReady(page);
  expect(await page.evaluate(() => window.__aiTrainerDialogTitles)).toEqual([]);

  const ownership = await page.evaluate(path => {
    const app = window.jupyterapp;
    const panel = [...app.shell.widgets("main")].find(widget => widget.context?.path === path);
    const sessions = [...app.serviceManager.sessions.running()];
    const kernels = [...app.serviceManager.kernels.running()];
    return {
      panelKernelId: panel?.sessionContext.session?.kernel?.id ?? null,
      sessionKernelIds: sessions.map(session => session.kernel?.id).filter(Boolean),
      kernelIds: kernels.map(kernel => kernel.id),
    };
  }, notebookPath);

  expect(ownership.panelKernelId).toBe(ready.kernelId);
  expect(new Set(ownership.sessionKernelIds)).toEqual(new Set([ready.kernelId]));
  expect(new Set(ownership.kernelIds)).toEqual(new Set([ready.kernelId]));
  expect(await page.evaluate(() => window.__aiTrainerDialogTitles)).toEqual([]);
  await expect(dialog).toHaveCount(0);
});

test("a replacement kernel automatically rebuilds the exercise environment", async ({ page }) => {
  test.setTimeout(420_000);
  await openNotebook(page, `kernel-replacement-${Date.now()}`);
  const before = await waitForRuntimeReady(page);

  await page.evaluate(async path => {
    const app = window.jupyterapp;
    const panel = [...app.shell.widgets("main")].find(widget => widget.context?.path === path);
    if (!panel) throw new Error(`Notebook panel not found: ${path}`);
    await panel.sessionContext.changeKernel({ name: "python" });
  }, notebookPath);

  const after = await waitForRuntimeReady(page, before.generation + 1);
  expect(after.kernelId).not.toBe(before.kernelId);
  expect(await probePreparedEnvironment(page)).toBe("env-ok True True True");
});
