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
