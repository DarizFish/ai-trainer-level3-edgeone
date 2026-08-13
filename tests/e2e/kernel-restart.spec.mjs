import { expect, test } from "@playwright/test";
import {
  notebookPath,
  openNotebook,
  probePreparedEnvironment,
  waitForRuntimeReady,
} from "./jupyterlite-runtime-helpers.mjs";

// Dependencies and warning filters live inside the Pyodide worker. Restarting
// the kernel must therefore create a new runtime generation and prepare it
// before the UI reports that the exercise is ready again.
test("kernel restart prepares a new runtime generation", async ({ page }) => {
  test.setTimeout(420_000);
  await openNotebook(page, `kernel-restart-${Date.now()}`);

  const before = await waitForRuntimeReady(page);
  expect(await probePreparedEnvironment(page)).toBe("True True");

  const after = await page.evaluate(
    path => window.jupyterapp.commands.execute("ai-trainer:restart-and-prepare", { path }),
    notebookPath,
  );

  expect(after).toMatchObject({ phase: "ready", lastError: null });
  expect(after.generation).toBeGreaterThan(before.generation);
  expect(await probePreparedEnvironment(page)).toBe("True True");
});
