// 登录态下逐题验证：文档题填答并核实持久化；Notebook 题用「填入参考」逐空填答后
// 运行全部，从而同时验证填答功能与官方参考答案能否在浏览器内核里真正跑通。
//   node scripts/verify-practical-signed-in.mjs <sessionCookie> [baseUrl]
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const SESSION = process.argv[2];
const BASE = process.argv[3] ?? "http://127.0.0.1:3200";
const OUT = process.env.VERIFY_OUT ?? "tmp/verify-signed-in.json";
if (!SESSION) throw new Error("需要传入 ai_trainer_session 的值");

const content = JSON.parse(await readFile("data/content.json", "utf8"));
const only = process.env.ONLY_CODES?.split(",").map(c => c.trim()).filter(Boolean);
const tasks = [...content.practical]
  .filter(t => !only || only.includes(t.code))
  .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));

const results = [];
const save = () => writeFile(OUT, JSON.stringify(results, null, 2));

const browser = await chromium.launch({ channel: "chromium" });
const origin = new URL(BASE);
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{
  name: "ai_trainer_session", value: SESSION,
  domain: origin.hostname, path: "/", httpOnly: true, sameSite: "Lax",
}]);

async function checkDocument(page, task) {
  const r = { 填答: false, 持久化: false, 备注: "" };
  await page.goto(`${BASE}/practical/${task.code}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 60000 });
  await page.waitForTimeout(1000);
  const box = page.locator("textarea, .word-inline-field input").first();
  if (!(await box.count())) { r.备注 = "未找到作答框"; return r; }
  if (await box.getAttribute("readonly") !== null) { r.备注 = "登录后作答框仍为只读"; return r; }

  const marker = `验证填答-${task.code}-${Date.now()}`;
  await box.fill(marker);
  await page.waitForTimeout(2500);          // 等待草稿自动保存
  r.填答 = (await box.inputValue()).includes(marker);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 60000 });
  await page.waitForTimeout(2000);
  const after = page.locator("textarea, .word-inline-field input").first();
  r.持久化 = (await after.inputValue().catch(() => "")).includes(marker);
  if (!r.持久化) r.备注 = "刷新后未恢复草稿";
  return r;
}

async function checkNotebook(page, task) {
  const r = { 填答: false, 运行: false, 空数: 0, 备注: "" };
  await page.goto(`${BASE}/practical/${task.code}/lab`, { waitUntil: "domcontentloaded" });
  await page.getByText("代码区已就绪", { exact: false }).waitFor({ state: "visible", timeout: 240000 });
  const frame = page.frameLocator("iframe.jupyter-frame");

  const reveal = page.getByRole("button", { name: "查看答案" });
  if (!(await reveal.count())) { r.备注 = "无「查看答案」按钮"; return r; }
  await reveal.first().click();
  await page.waitForTimeout(3000);

  // JupyterLab 的 notebook 是窗口化渲染的：逐空参考部件要等单元的编辑器真正渲染
  // 才会注入。长 notebook（如 3.2.5）在首屏是 0 个部件，滚动后才出现，所以先把整份
  // notebook 滚一遍，否则会把懒加载误判成功能缺失。
  for (let i = 0; i < 10; i += 1) {
    await frame.locator(".jp-Notebook").first().hover().catch(() => undefined);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(500);
  }
  await page.mouse.wheel(0, -12000);
  await page.waitForTimeout(800);

  // 逐空点「填入参考」。每次点击会重建部件，所以每轮重新取一次。
  for (let round = 0; round < 60; round += 1) {
    const buttons = frame.locator(".ai-trainer-fill-reference button", { hasText: "填入参考" });
    const n = await buttons.count().catch(() => 0);
    const enabled = [];
    for (let i = 0; i < n; i += 1) if (await buttons.nth(i).isEnabled().catch(() => false)) enabled.push(i);
    if (!enabled.length) break;
    await buttons.nth(enabled[0]).click().catch(() => undefined);
    r.空数 += 1;
    await page.waitForTimeout(350);
  }
  r.填答 = r.空数 > 0;
  if (!r.填答) { r.备注 = "没有可填入的空"; return r; }

  await page.getByRole("button", { name: /运行全部/ }).first().click();
  for (let i = 0; i < 180; i += 1) {
    await page.waitForTimeout(1000);
    const errors = await frame.locator(".jp-OutputArea-output[data-mime-type='application/vnd.jupyter.error']").count().catch(() => 0);
    if (errors > 0) {
      const text = await frame.locator(".jp-OutputArea-output").allTextContents().catch(() => []);
      r.备注 = "运行报错: " + text.join(" ").replace(/\s+/g, " ").slice(-140);
      return r;
    }
    const idle = await frame.getByRole("button", { name: /Python \(Pyodide\) \| Idle/ }).count().catch(() => 0);
    const outputs = await frame.locator(".jp-OutputArea-output").count().catch(() => 0);
    if (idle && outputs > 0 && i > 4) { r.运行 = true; return r; }
  }
  r.备注 = r.备注 || "运行全部超时";
  return r;
}

for (const task of tasks) {
  const page = await context.newPage();
  const started = Date.now();
  let row;
  try {
    row = task.hasNotebook ? await checkNotebook(page, task) : await checkDocument(page, task);
  } catch (e) { row = { 备注: "异常: " + String(e).slice(0, 100) }; }
  row.code = task.code;
  row.type = task.hasNotebook ? "Notebook" : "文档";
  row.title = task.title;
  row.秒 = Math.round((Date.now() - started) / 1000);
  results.push(row);
  await save();
  const flags = ["填答", "持久化", "运行"].filter(k => k in row).map(k => `${k}=${row[k] ? "✓" : "✗"}`).join(" ");
  console.log(`${row.code.padEnd(6)} ${row.type.padEnd(9)} ${flags}${row.空数 ? ` 空=${row.空数}` : ""}  ${row.秒}s ${row.备注 || ""}`);
  await page.close();
}

await browser.close();
console.log("\n结果已写入", OUT);
