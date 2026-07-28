import { expect, test } from "@playwright/test";

// Word 参考答案改成结构化字段后，「答案面板少了一段」这类回归不会报错、只会少显示。
// 所以这里真的把复盘面板点开，数一数每处该出现的块。
test.describe("Word 参考答案在各答题界面完整呈现", () => {
  test("1.2 的一份 docx 两问，各自拿到自己那半边答案", async ({ page }) => {
    await page.goto("/practical/1.2.4");
    await page.getByRole("button", { name: "完成作答，进入复盘" }).click();

    const reviews = page.locator(".business-sheet-review");
    await expect(reviews).toHaveCount(2);
    // 第一问只有「主要问题」，第二问是「优化方案 + 预期效果」——切分错位最典型的表现
    // 就是第二问少掉一块，或者两问拿到同一段。
    await expect(reviews.nth(0).locator(".word-answer-block")).toHaveCount(1);
    await expect(reviews.nth(1).locator(".word-answer-block")).toHaveCount(2);
    await expect(reviews.nth(0)).toContainText("1.2.4-1");
    await expect(reviews.nth(1)).toContainText("1.2.4-2");
    await expect(reviews.nth(1)).toContainText("预期效果");
    await expect(reviews.nth(0)).not.toContainText("预期效果");
    for (const block of await reviews.locator(".word-answer-block").all()) {
      expect((await block.locator("li").count()) > 0).toBe(true);
    }
  });

  test("3.1 的两份 docx 各自成篇，方向与方案成对渲染", async ({ page }) => {
    await page.goto("/practical/3.1.1");
    await page.getByRole("button", { name: "完成作答，进入复盘" }).click();

    const reviews = page.locator(".business-sheet-review");
    await expect(reviews).toHaveCount(2);
    await expect(reviews.nth(0).locator(".word-answer-block")).toHaveCount(3);
    await expect(reviews.nth(1).locator(".word-answer-block")).toHaveCount(1);
    await expect(reviews.nth(1)).toContainText("优化方向与解决方案");
    // 「方向：方案」成对；形态判断错会渲染成 undefined。
    await expect(reviews.nth(1).locator("li").first()).toContainText("：");
    await expect(reviews.nth(1)).not.toContainText("undefined");
  });

  // Notebook 题在 /practical/<题号> 会跳到实验室，Word 交付物是那里的第二个页签。
  test("Notebook 题的 Word 答题卷复盘给出分类报告指标", async ({ page }) => {
    await page.goto("/practical/2.2.1/lab");
    await page.getByRole("tab", { name: "2.2.1.docx" }).click();
    await page.getByRole("button", { name: "完成作答，进入复盘" }).click();

    const review = page.locator(".business-sheet-review");
    await expect(review).toBeVisible();
    // 2.2.1 的指标是分类报告每类一行；按标量 {name,value} 渲染会印出 undefined。
    await expect(review).toContainText("precision 0.95");
    await expect(review).toContainText("模型性能评估");
    await expect(review).not.toContainText("undefined");
    // Word 正文不该同时还留在 referenceAnswer 里——那会让同一段答案出现两遍。
    await expect(review).not.toContainText("import pandas");
    await expect(review.locator(".word-answer-block")).toHaveCount(4);
  });

  test("4.2 模板题的 5 处填空都有参考填写", async ({ page }) => {
    await page.goto("/practical/4.2.2");
    await expect(page.locator(".word-fill-slot, .word-inline-field").first()).toBeVisible();
    // 侧栏那颗；页脚同名按钮在宽屏下是隐藏的。
    await page.getByRole("button", { name: "完成并核对" }).click();
    const document = page.locator(".word-exercise-document").first();
    await expect(document.getByText("参考填写")).toHaveCount(5);
    await expect(document).toContainText("TensorFlow");
  });
});
