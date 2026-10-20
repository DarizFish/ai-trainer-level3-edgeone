import { expect, test } from "@playwright/test";

test("a direct theory visitor can discover the mini program without losing their question", async ({ page }) => {
  await page.goto("/theory?question=multi-218", { waitUntil: "domcontentloaded" });
  const notice = page.getByRole("region", { name: "网站公告" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("微信小程序上线了");
  await expect(page.locator(".practice-question-card .chip").first()).toHaveText("多选题");
  await notice.getByRole("button", { name: "关闭这条公告" }).click();
  await expect(notice).toHaveCount(0);
  await expect(page).toHaveURL(/question=multi-218/);
  await expect(page.locator(".practice-option")).toHaveCount(5);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(notice).toHaveCount(0);
});

test("a notice is offered once even when the visitor navigates away without dismissing it", async ({ page, context }) => {
  await page.goto("/practical", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "网站公告" })).toBeVisible();
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "理论题库", exact: true }).click();
  await expect(page).toHaveURL(/\/theory$/);
  await expect(page.getByRole("region", { name: "网站公告" })).toHaveCount(0);
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "网站公告" })).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "网站公告" })).toHaveCount(0);
  const anotherTab = await context.newPage();
  await anotherTab.goto("/resources", { waitUntil: "domcontentloaded" });
  await expect(anotherTab.getByRole("region", { name: "网站公告" })).toHaveCount(0);
});

test("dismissal of an older announcement does not hide the new mini program announcement", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ai-trainer-notice-dismissed:registration-guide-2026-08", "1"));
  await page.goto("/resources", { waitUntil: "domcontentloaded" });
  const notice = page.getByRole("region", { name: "网站公告" });
  await expect(notice).toBeVisible();
  await notice.getByRole("link", { name: /查看小程序/ }).click();
  await expect(page).toHaveURL(/\/miniprogram$/);
  await expect(page.getByRole("heading", { name: /手机刷题，\s*随时接着练。/ })).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("unavailable browser storage does not break studying or repeat the notice on client navigation", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    for (const name of ["localStorage", "sessionStorage"]) {
      Object.defineProperty(window, name, { configurable: true, get() { throw new Error("Storage unavailable"); } });
    }
  });
  await page.goto("/resources", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "网站公告" })).toBeVisible();
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "备用网址", exact: true }).click();
  await expect(page).toHaveURL(/\/access$/);
  await expect(page.getByRole("region", { name: "网站公告" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the mini program entry shows usable original media and a persistent mobile menu link", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/miniprogram", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "网站公告" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "人工智能训练师三级备考", exact: true })).toBeVisible();
  const images = page.locator("main img");
  await expect(images).toHaveCount(4);
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
  }
  const download = page.getByRole("link", { name: "保存小程序码", exact: true });
  await expect(download).toHaveAttribute("download", /小程序码/);
  const code = await request.get(await download.getAttribute("href"));
  expect(code.status()).toBe(200);
  expect(code.headers()["content-type"]).toMatch(/^image\//);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const dimensions = await page.locator("html").evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }));
    expect(dimensions.scroll, `page fits a ${width}px screen`).toBeLessThanOrEqual(dimensions.width + 1);
    await page.locator(".mobile-menu summary").click();
    await expect(page.getByRole("navigation", { name: "手机主导航", exact: true }).getByRole("link", { name: "小程序", exact: true })).toHaveAttribute("aria-current", "page");
    await page.locator(".mobile-menu summary").click();
  }
});
