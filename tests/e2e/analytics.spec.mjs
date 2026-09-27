import { expect, test } from "@playwright/test";

test("main page reports a bounded anonymous route event", async ({ page }) => {
  const eventRequests = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/events") eventRequests.push(request);
  });
  const eventResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/events");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  expect((await eventResponse).status()).toBe(204);
  expect(eventRequests).toHaveLength(1);
  expect(eventRequests[0].postDataJSON()).toEqual({
    event_name: "page.viewed",
    route_id: "home",
    occurred_at: expect.any(String),
  });
});

test("event receiver rejects cross-origin and unlisted or oversized data", async ({ request, baseURL }) => {
  const valid = { event_name: "page.viewed", route_id: "theory", occurred_at: new Date().toISOString() };
  const headers = { origin: baseURL };
  expect((await request.post("/api/events", { headers, data: valid })).status()).toBe(204);
  expect((await request.post("/api/events", { headers: { origin: "https://other.example" }, data: valid })).status()).toBe(403);
  expect((await request.post("/api/events", { headers, data: { ...valid, email: "private@example.com" } })).status()).toBe(400);
  expect((await request.post("/api/events", { headers, data: { ...valid, route_id: "/account?email=private@example.com" } })).status()).toBe(400);
  expect((await request.post("/api/events", { headers, data: { ...valid, padding: "x".repeat(1000) } })).status()).toBe(413);
});
