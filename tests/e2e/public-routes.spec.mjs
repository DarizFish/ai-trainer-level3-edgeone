import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/theory",
  "/theory/mock",
  "/practical",
  "/resources",
];

for (const route of publicRoutes) {
  test(`${route} renders without a browser exception`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });

    expect(response, `${route} should return a document response`).not.toBeNull();
    expect(response.status(), `${route} should not return an HTTP error`).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    await expect(page).toHaveTitle(/人工智能训练师三级/);
    expect(pageErrors).toEqual([]);
  });
}

test("anonymous progress access renders the local account experience", async ({ page }) => {
  const response = await page.goto("/progress", { waitUntil: "domcontentloaded" });

  expect(response).not.toBeNull();
  expect(response.status()).toBeLessThan(400);
  await expect(page.locator("main.account-page")).toBeVisible();
  await expect(page.locator("form.account-form")).toBeVisible();
  await expect(page.locator(".progress-grid")).toHaveCount(0);
});

test("disabled practical mock redirects to the practical catalog", async ({ page }) => {
  const response = await page.goto("/practical/mock", { waitUntil: "domcontentloaded" });

  expect(response).not.toBeNull();
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/practical$/);
  await expect(page.locator("main")).toBeVisible();
});

test("theory sidebar shows separate type progress without redundant groups", async ({ page }) => {
  await page.goto("/theory", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".theory-type-progress-entry")).toHaveCount(3);
  await expect(page.getByText("题型进度", { exact: true })).toBeVisible();
  await expect(page.getByText("当前练习", { exact: true })).toHaveCount(0);
  await expect(page.getByText("知识领域", { exact: true })).toHaveCount(0);
  await expect(page.getByText("题库与考试", { exact: true })).toHaveCount(0);
});

test("every Word practical family uses the 1.2 paper answer-sheet structure", async ({ page }) => {
  for (const route of ["/practical/1.2.1", "/practical/3.1.1"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".word-answer-sheet .business-sheet-sidebar")).toBeVisible();
    await expect(page.locator(".word-answer-sheet .business-sheet-paper")).toBeVisible();
    await expect(page.locator(".word-answer-sheet .business-sheet-section")).toHaveCount(2);
  }

  await page.goto("/practical/4.1.1", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".word-template-answer-sheet .business-sheet-sidebar")).toBeVisible();
  await expect(page.locator(".word-template-answer-sheet .business-sheet-paper")).toBeVisible();
  await expect(page.locator(".word-template-answer-sheet [data-word-answer]")).toHaveCount(5);

  await page.goto("/practical/2.1.1/lab", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /2\.1\.1\.docx/ }).click();
  await expect(page.locator(".notebook-word-answer-sheet.business-sheet-paper")).toBeVisible();
  await expect(page.locator(".notebook-word-answer-sheet .business-sheet-section textarea")).toBeVisible();
  await expect(page.getByRole("button", { name: "完成作答，进入复盘" })).toBeVisible();
});

test("core study pages do not overflow a 390px mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ["/theory", "/practical", "/theory/mock"]) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response.status(), `${route} should load on mobile`).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    const dimensions = await page.locator("html").evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(dimensions.scrollWidth, `${route} should not scroll horizontally`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  }
});

test("Word answer sheet stays within a 390px practical lab viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/practical/2.1.1/lab", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /2\.1\.1\.docx/ }).click();
  await expect(page.locator(".notebook-word-answer-sheet")).toBeVisible();
  const dimensions = await page.locator("html").evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});

test("practical lab shows scan-friendly requirements and an accessible full official prompt", async ({ page }) => {
  await page.goto("/practical/2.1.2/lab", { waitUntil: "domcontentloaded" });

  const sidebar = page.locator(".lab-task-sidebar");
  await expect(sidebar.locator(".practical-materials-list")).toHaveCount(0);
  await expect(sidebar.getByText("本题文件", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByText(/代码、结果和导出文件在 Notebook 中完成/)).toHaveCount(0);

  const brief = page.locator(".lab-task-sidebar .practical-brief").first();
  await expect(brief.locator("summary small").first()).toHaveText("9 条要求");
  await brief.locator("summary").first().click();
  await expect(brief.locator(".practical-brief-body > :first-child")).toHaveClass(/practical-full-prompt-trigger/);
  await expect(brief.locator(".practical-requirement-list > li")).toHaveCount(9);
  await expect(brief.getByText(/1\.您的性别/)).toBeVisible();

  await brief.getByRole("button", { name: "查看完整官方题目" }).click();
  const dialog = page.getByRole("dialog", { name: "完整官方题目" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("场地设备要求", { exact: true })).toBeVisible();
  await expect(dialog.locator(".practical-prompt-content section").first().locator("p")).toContainText("大学生低碳生活行为的影响因素数据集");
  await dialog.getByRole("button", { name: "关闭完整官方题目" }).press("Escape");
  await expect(dialog).toBeHidden();
});

test("full official prompt becomes a viewport-sized reading layer on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/practical/1.1.1/lab", { waitUntil: "domcontentloaded" });

  const brief = page.locator(".lab-task-sidebar .practical-brief").first();
  await brief.locator("summary").first().click();
  await brief.getByRole("button", { name: "查看完整官方题目" }).click();

  const dialog = page.getByRole("dialog", { name: "完整官方题目" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(389);
  expect(box.height).toBeGreaterThanOrEqual(843);
});

test("mobile theory options are never buried under the action bar", async ({ page }) => {
  // 多选题有 5 个选项，390×780 的手机上装不下「题干 + 5 选项 + 两行操作栏」。操作栏
  // 原先在窄屏也吸底，96% 不透明，抽样 18 道多选题有 18 道的末选项压在它下面——学员
  // 看到的是「C 之后就没了」。改为静态排布后，选项最多被屏幕下沿截断，那是所有人都
  // 认得的「还有内容」信号，而不是一条看起来像页脚的横栏。
  await page.setViewportSize({ width: 390, height: 780 });
  // 直接定位到最坏的一道：300 道多选题全是 5 个选项，multi-218 的题干最长（82 字），
  // 它的末选项能让开操作栏，其余 299 道就都能。走 ?question= 而不是点题型抽屉，是因为
  // 切题型会触发登录判定，测试不该依赖账号状态。
  await page.goto("/theory?question=multi-218", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".practice-question-card .chip").first()).toHaveText("多选题");
  await expect(page.locator(".practice-option")).toHaveCount(5);

  // 只约束结果不约束做法：将来换别的方式让开操作栏也应当算通过。
  const gap = await page.evaluate(() => {
    const barTop = document.querySelector(".practice-bottom-bar").getBoundingClientRect().top;
    const last = [...document.querySelectorAll(".practice-option")].at(-1).getBoundingClientRect();
    return Math.round(barTop - last.bottom);
  });
  expect(gap).toBeGreaterThanOrEqual(0);

  // 题号抽屉是用手指点的，300 个格子密排，点错就跳错题。
  await page.locator(".question-map-trigger").click();
  const cell = page.locator(".question-number-grid button").first();
  await expect(cell).toBeVisible();
  const cellBox = await cell.boundingBox();
  expect(cellBox.height).toBeGreaterThanOrEqual(44);
});
