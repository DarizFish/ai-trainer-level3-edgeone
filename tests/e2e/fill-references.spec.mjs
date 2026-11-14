import { expect, test } from "@playwright/test";

const cases = [
  {
    code: "1.1.5",
    answers: ["['Age']", "data['Age'].astype", "['Speed']", "data['Speed'].astype"],
    lines: ["data['Age'] = data['Age'].astype(int)", "data['Speed'] = data['Speed'].astype(float)"],
  },
  {
    code: "2.2.5",
    answers: ["df['daily_steps']"],
    lines: ["y = df['daily_steps']"],
  },
];

for (const { code, answers, lines } of cases) {
  test(`${code} fills partial blanks with their individual references`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.route("**/lite/jupyter-lite.json*", async route => {
      const response = await route.fetch();
      const config = JSON.parse(await response.text());
      config["jupyter-config-data"].exposeAppInBrowser = "true";
      await route.fulfill({ response, body: JSON.stringify(config) });
    });
    await page.goto(`/practical/${code}/lab`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("代码区已就绪", { exact: false })).toBeVisible({ timeout: 240_000 });
    await page.getByRole("button", { name: "查看答案", exact: true }).click();
    const frame = page.frameLocator("iframe.jupyter-frame");
    for (const answer of answers) {
      const row = frame.locator(".ai-trainer-fill-row").filter({
        has: frame.locator(".ai-trainer-fill-ref").getByText(answer, { exact: true }),
      });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "填入参考", exact: true }).click();
    }
    const notebook = await page.locator("iframe.jupyter-frame").evaluate(async (iframe, code) => {
      const app = iframe.contentWindow?.jupyterapp;
      if (!app) throw new Error("JupyterLite app is unavailable");
      return app.commands.execute("ai-trainer:get-notebook", { path: `${code.replaceAll(".", "-")}/${code}.ipynb` });
    }, code);
    const actualLines = notebook.cells.flatMap(cell =>
      (Array.isArray(cell.source) ? cell.source.join("") : cell.source).split("\n")
        .map(line => line.split("#")[0].trim()),
    );
    for (const line of lines) expect(actualLines).toContain(line);
  });
}
