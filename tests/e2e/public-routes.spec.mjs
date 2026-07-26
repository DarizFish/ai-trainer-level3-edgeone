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
