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
  // Keep Pyodide on its asynchronous Comlink worker. Cross-origin isolation
  // selects the SharedArrayBuffer/Atomics implementation, whose synchronous
  // drive bridge can deadlock while the kernel still reports connected.
  expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(false);

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
  await page.route("**/lite/jupyter-lite.json*", async route => {
    const response = await route.fetch();
    const config = JSON.parse(await response.text());
    config["jupyter-config-data"].exposeAppInBrowser = "true";
    await route.fulfill({ response, body: JSON.stringify(config) });
  });
  await page.goto("/practical/2.1.2/lab", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("代码区已就绪", { exact: false })).toBeVisible({ timeout: 240_000 });

  // Ask the extension that owns environment preparation to verify the same
  // bounded command path. Tests must not create a second, unmanaged owner of
  // the raw kernel connection.
  const observed = await page.locator("iframe.jupyter-frame").evaluate(async (iframe, path) => {
    const app = iframe.contentWindow?.jupyterapp;
    if (!app) throw new Error("JupyterLite app is not exposed to the embedded exercise test");
    return app.commands.execute("ai-trainer:probe-environment", { path });
  }, "2-1-2/2.1.2.ipynb");

  expect(observed.runtime).toMatchObject({ phase: "ready", lastError: null });
  expect(observed.output).toBe("env-ok True True True");
});
