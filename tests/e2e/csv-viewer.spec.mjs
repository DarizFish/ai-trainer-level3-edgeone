import { expect, test } from "@playwright/test";

// JupyterLite 的 drive 按扩展名决定传输格式，站点为了保住 2.1.4 那份 GBK 数据集把
// .csv 登记成了二进制（scripts/patch-jupyterlite-config.py），于是官方 CSV 查看器
// 请求 text 却拿到一整串 Base64，双击预览会显示成乱码。解码由
// jupyterlite-extension/src/csvViewer.ts 在显示端完成，这里守住三条不变量：
// 文档内容是解码后的表格、CSVViewer 取数用的 toString() 也是、模型没有变脏（不变脏
// 才不会触发自动保存，素材才不会被改写）。
const datasets = [
  { path: "1-1-1/patient_data.csv", header: "PatientID,Age,BMI,BloodPressure" },
  { path: "2-1-4/medical_data.csv", header: "病人ID,年龄,性别,地区" }
];

for (const dataset of datasets) {
  test(`${dataset.path} 预览显示解码后的表格而不是 Base64`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    // window.jupyterapp 只在 exposeAppInBrowser 打开时才有。生产配置里不能开——它
    // 会把整个命令注册表暴露给考生——所以只在测试请求里把这个开关注入进去。
    await page.route("**/lite/jupyter-lite.json*", async route => {
      const response = await route.fetch();
      const config = JSON.parse(await response.text());
      config["jupyter-config-data"].exposeAppInBrowser = "true";
      await route.fulfill({ response, body: JSON.stringify(config) });
    });

    await page.goto(
      `/lite/lab/index.html?path=${encodeURIComponent(dataset.path)}&workspace=csv-viewer-check`,
      { waitUntil: "domcontentloaded" }
    );

    // 窗口是同步建出来的、内容是随后异步灌进去的，所以要等到内容真的到位。
    await page.waitForFunction(
      expected => {
        const widget = window.jupyterapp?.shell?.currentWidget;
        if (widget?.context?.path !== expected) return false;
        return Boolean(widget.context.model?.sharedModel?.getSource());
      },
      dataset.path,
      { timeout: 90_000 }
    );

    const observed = await page.evaluate(() => {
      const model = window.jupyterapp.shell.currentWidget.context.model;
      return {
        source: model.sharedModel.getSource().slice(0, 64),
        // CSVViewer 是从 toString() 取数据喂给 DataGrid 的（widget.ts 的 _updateGrid），
        // 所以这一条才是「表格里显示的是什么」。
        serialized: model.toString().slice(0, 64),
        dirty: model.dirty
      };
    });

    expect(observed.source).toContain(dataset.header);
    expect(observed.serialized).toContain(dataset.header);
    expect(observed.dirty).toBe(false);
    expect(pageErrors).toEqual([]);
  });
}
