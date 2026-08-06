import { expect, test } from "@playwright/test";

// 依赖安装、告警屏蔽、素材恢复和 ONNX 运行时都由扩展通过静默内核请求下发，全部活在
// 内核进程里。preparedPanels 记在面板上，重启内核不会换面板——曾经因此重启后不再重跑
// 准备：openpyxl 变成 ModuleNotFoundError（2.1.2 / 2.1.3 / 2.2.1 / 2.2.4 都靠 piplite
// 装纯 Python wheel），FutureWarning 屏蔽也失效，官方答案直接跑不动。
test("重启内核后题目环境会重新准备", async ({ page }) => {
  test.setTimeout(600_000);

  // window.jupyterapp 只在 exposeAppInBrowser 打开时才有；生产配置里不能开，
  // 所以只在测试请求里注入这个开关。
  await page.route("**/lite/jupyter-lite.json*", async route => {
    const response = await route.fetch();
    const config = JSON.parse(await response.text());
    config["jupyter-config-data"].exposeAppInBrowser = "true";
    await route.fulfill({ response, body: JSON.stringify(config) });
  });

  await page.goto("/lite/lab/index.html?path=2-1-2%2F2.1.2.ipynb&workspace=kernel-restart-check", {
    waitUntil: "domcontentloaded"
  });

  const kernelIdle = () => page.waitForFunction(
    () => window.jupyterapp?.shell?.currentWidget?.sessionContext?.session?.kernel?.status === "idle",
    undefined,
    { timeout: 240_000 }
  );

  // 2.1.2 的 openpyxl 不在 pyodide-lock 里，只能由扩展用 piplite 装；能 import 成功
  // 就证明准备阶段确实跑过。FutureWarning 屏蔽同理。
  const probe = () => page.evaluate(async () => {
    const kernel = window.jupyterapp.shell.currentWidget.sessionContext.session.kernel;
    const lines = [];
    const future = kernel.requestExecute({
      code: [
        "import warnings",
        "try:",
        "    import openpyxl; _pkg = True",
        "except Exception:",
        "    _pkg = False",
        "print(_pkg, any(f[2] is FutureWarning for f in warnings.filters))"
      ].join("\n"),
      store_history: false
    });
    future.onIOPub = msg => { if (msg.header.msg_type === "stream") lines.push(msg.content.text); };
    await future.done;
    return lines.join("").trim();
  });

  const waitPrepared = async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if ((await probe()) === "True True") return true;
      await page.waitForTimeout(3000);
    }
    return false;
  };

  await kernelIdle();
  expect(await waitPrepared(), "首次进入应完成环境准备").toBe(true);

  await page.evaluate(async () => {
    await window.jupyterapp.shell.currentWidget.sessionContext.session.kernel.restart();
  });
  await kernelIdle();

  expect(await waitPrepared(), "重启内核后环境应被重新准备").toBe(true);
});
