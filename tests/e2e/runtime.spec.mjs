import { expect, test } from "@playwright/test";

const runtimeRevision = "20260726-pyodide0277-runtime11";
const pyodideEntryPath = "/lite/static/pyodide/pyodide.js";
const pyodideWasmLoaderPath = "/lite/static/pyodide/pyodide.asm.js";
const onnxEntryPath = "/labs/runtime/onnxruntime-web/1.27.0/ort.wasm.bundle.min.js";
const fatalModulePattern = /Failed to fetch dynamically imported module|application\/octet-stream|MIME type|pyodide\.mjs|pyodide\.asm\.mjs/i;

test("JupyterLite starts the Pyodide kernel through JavaScript MIME resources", async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  const requestedMjs = [];
  const runtimeResponses = new Map();

  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith(".mjs")) requestedMjs.push(pathname);
  });
  page.on("response", response => {
    const pathname = new URL(response.url()).pathname;
    if ([pyodideEntryPath, pyodideWasmLoaderPath].includes(pathname)) {
      runtimeResponses.set(pathname, {
        contentType: response.headers()["content-type"] ?? "",
        status: response.status(),
      });
    }
  });

  const workspace = `playwright-${Date.now()}`;
  await page.goto(
    `/lite/lab/index.html?path=1.1.2%2F1.1.2.ipynb&workspace=${workspace}&ui=${runtimeRevision}`,
    { waitUntil: "domcontentloaded" },
  );

  await expect(page.getByRole("button", { name: /Python \(Pyodide\) \| Idle/ })).toBeVisible({
    timeout: 90_000,
  });
  await expect.poll(async () => page.evaluate(() => {
    const setupCell = [...document.querySelectorAll(".jp-Cell")]
      .find(cell => cell.textContent?.includes("JupyterLite 环境准备"));
    if (!setupCell) return "setup cell missing";
    const output = setupCell.querySelector(".jp-OutputArea")?.textContent ?? "";
    if (/Traceback|Error:/.test(output)) return output.slice(-500);
    return output.includes("环境已就绪") ? "ready" : "pending";
  }), {
    message: "the hidden environment preparation cell should install dependencies and verify its material",
    timeout: 120_000,
  }).toBe("ready");

  const configuredPyodideUrl = await page.locator("#jupyter-config-data").evaluate(element => {
    const config = JSON.parse(element.textContent || "{}");
    return config.litePluginSettings?.["@jupyterlite/pyodide-kernel-extension:kernel"]?.pyodideUrl;
  });
  expect(configuredPyodideUrl).toContain(`${pyodideEntryPath}?runtime=${runtimeRevision}`);

  for (const path of [pyodideEntryPath, pyodideWasmLoaderPath]) {
    const response = runtimeResponses.get(path);
    expect(response, `${path} should be requested during kernel startup`).toBeDefined();
    expect(response.status).toBe(200);
    expect(response.contentType).toMatch(/^(?:application|text)\/javascript/i);
  }

  expect(requestedMjs).toEqual([]);
  expect([...consoleErrors, ...pageErrors].filter(message => fatalModulePattern.test(message))).toEqual([]);
});

test("ONNX Runtime can be dynamically imported from its EdgeOne-safe JavaScript URL", async ({ page }) => {
  let moduleResponse;
  const requestedMjs = [];

  page.on("request", request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith(".mjs")) requestedMjs.push(pathname);
  });
  page.on("response", response => {
    if (new URL(response.url()).pathname === onnxEntryPath) {
      moduleResponse = {
        contentType: response.headers()["content-type"] ?? "",
        status: response.status(),
      };
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const moduleLoaded = await page.evaluate(async modulePath => {
    const ort = await import(modulePath);
    return typeof ort.InferenceSession === "function" && typeof ort.Tensor === "function";
  }, `${onnxEntryPath}?playwright=${runtimeRevision}`);

  expect(moduleLoaded).toBe(true);
  expect(moduleResponse).toBeDefined();
  expect(moduleResponse.status).toBe(200);
  expect(moduleResponse.contentType).toMatch(/^(?:application|text)\/javascript/i);
  expect(requestedMjs).toEqual([]);
});
