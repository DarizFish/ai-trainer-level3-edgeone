import { expect, test } from "@playwright/test";
import { exposeJupyterApp } from "./jupyterlite-runtime-helpers.mjs";

// 3.2.3 的官方考题里有 `img.resize((64, 64), Image.ANTIALIAS)`。ANTIALIAS 在 Pillow 10
// 被删除，而站点自带的 Pyodide 只有 Pillow 10.2.0，官方代码原样运行会 AttributeError。
// 题目一个字都不能改，别名由扩展的准备阶段补回；这里在真实内核里跑那一行官方代码。
const notebookPath = "3-2-3/3.2.3.ipynb";

async function runInKernel(page, code) {
  return page.evaluate(async ({ path, code }) => {
    const app = window.jupyterapp;
    const panel = [...app.shell.widgets("main")].find(widget => widget.context?.path === path);
    const kernel = panel.context.sessionContext.session.kernel;
    const future = kernel.requestExecute({ code, stop_on_error: true });
    const stream = [];
    let error = null;
    future.onIOPub = message => {
      if (message.header.msg_type === "stream") stream.push(message.content.text);
      if (message.header.msg_type === "error") error = `${message.content.ename}: ${message.content.evalue}`;
    };
    await future.done;
    return { stream: stream.join(""), error };
  }, { path: notebookPath, code });
}

test("3.2.3 的官方 Image.ANTIALIAS 代码在 Pillow 10 内核上原样运行", async ({ page }) => {
  await exposeJupyterApp(page);
  await page.goto(
    `/lite/lab/index.html?path=${encodeURIComponent(notebookPath)}&workspace=pillow-antialias`,
    { waitUntil: "domcontentloaded" },
  );

  await expect.poll(async () => page.evaluate(async path => {
    const app = window.jupyterapp;
    if (!app?.commands?.hasCommand("ai-trainer:get-runtime-state")) return null;
    if (![...app.shell.widgets("main")].some(widget => widget.context?.path === path)) return null;
    const state = await app.commands.execute("ai-trainer:get-runtime-state", { path });
    return state?.phase ?? null;
  }, notebookPath), { timeout: 300_000, intervals: [500, 1_000, 2_000] }).toBe("ready");

  // 先确认这个内核确实是「删掉了 ANTIALIAS」的那个 Pillow，否则本用例证明不了什么。
  const version = await runInKernel(page, [
    "import PIL",
    "print('pillow', PIL.__version__)",
  ].join("\n"));
  expect(version.error).toBeNull();
  expect(Number.parseInt(version.stream.split(" ")[1], 10)).toBeGreaterThanOrEqual(10);

  // 官方考题原文：逐字复制自 3.2.3 的第一个代码单元。
  const official = await runInKernel(page, [
    "from PIL import Image",
    "img = Image.open('img_test.png').convert('L')",
    "img = img.resize((64, 64), Image.ANTIALIAS)",
    "print('resize-ok', img.size, Image.ANTIALIAS is Image.Resampling.LANCZOS)",
  ].join("\n"));
  expect(official.error).toBeNull();
  expect(official.stream).toContain("resize-ok (64, 64) True");
});
