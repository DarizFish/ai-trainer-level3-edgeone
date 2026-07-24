import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/theory",
  "/theory/mock",
  "/practical",
  "/practical/mock",
  "/blueprint",
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

test("core study pages do not overflow a 390px mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ["/theory", "/practical", "/theory/mock", "/practical/mock"]) {
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
