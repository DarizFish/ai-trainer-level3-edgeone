import { expect, test } from "@playwright/test";
import {
  openNotebook,
  probePreparedEnvironment,
  waitForRuntimeReady,
} from "./jupyterlite-runtime-helpers.mjs";

test("cold start prepares the requested notebook environment", async ({ page }) => {
  test.setTimeout(300_000);
  await openNotebook(page, `kernel-cold-start-${Date.now()}`);

  const state = await waitForRuntimeReady(page);
  expect(state.connectionStatus).toBe("connected");
  expect(await probePreparedEnvironment(page)).toBe("True True");
});
