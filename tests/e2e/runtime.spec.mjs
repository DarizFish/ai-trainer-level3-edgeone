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
    `/lite/lab/index.html?path=1-1-2%2F1.1.2.ipynb&workspace=${workspace}&ui=${runtimeRevision}`,
    { waitUntil: "domcontentloaded" },
  );

  await expect(page.getByRole("button", { name: /Python \(Pyodide\) \| Idle/ })).toBeVisible({
    timeout: 90_000,
  });
  // mountDrive 只在跨域隔离成立时为真。题目文件已经不再自带素材下载兜底，所以
  // COOP/COEP 一旦回退，20 道题会集体读不到数据文件——把它当硬约束守住。
  expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);

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

test("task dependencies install without an environment cell in the official notebook", async ({ page }) => {
  // 2.1.2 读 .xlsx，需要 openpyxl —— 它是 jupyterlite/pypi 里的纯 Python wheel，
  // 不在 pyodide-lock 内，import 时不会自动加载。题目文件已经没有环境准备单元，
  // 所以这个 import 能成功，只可能是扩展的静默内核请求装上了它。
  await page.goto("/practical/2.1.2/lab", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("代码区已就绪", { exact: false })).toBeVisible({ timeout: 240_000 });

  const frame = page.frameLocator("iframe.jupyter-frame");
  await frame.locator(".jp-Notebook .jp-CodeCell .cm-content").last().click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("b");
  await page.keyboard.press("Enter");
  await page.keyboard.type("import openpyxl; print('env-ok', openpyxl.__version__)");
  await page.keyboard.press("Shift+Enter");

  await expect(frame.locator(".jp-OutputArea-output").filter({ hasText: "env-ok" }))
    .toBeVisible({ timeout: 180_000 });
});
