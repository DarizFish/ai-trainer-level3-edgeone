// 逐题验证 40 道实操题的加载、就绪、作答、运行与对比答案主流程。
// 结果增量落盘，可据此刷新 docs/PRACTICAL-VERIFICATION.md。
//   node scripts/verify-practical-flows.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const BASE = process.argv[2] ?? "http://127.0.0.1:3200";
const OUT = process.env.VERIFY_OUT ?? "tmp/verify-practical-flows.json";
const content = JSON.parse(await readFile("data/content.json", "utf8"));
const tasks = [...content.practical].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));

const results = [];
const save = () => writeFile(OUT, JSON.stringify(results, null, 2));

const browser = await chromium.launch({ channel: "chromium" });

async function checkNotebook(page, task) {
  const r = { 加载: false, 就绪: false, 运行: false, 对比答案: false, 备注: "" };
  await page.goto(`${BASE}/practical/${task.code}/lab`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("iframe.jupyter-frame", { timeout: 60000 });
  r.加载 = true;
  try {
    await page.getByText("代码区已就绪", { exact: false }).waitFor({ state: "visible", timeout: 240000 });
    r.就绪 = true;
  } catch { r.备注 = "未到达「代码区已就绪」"; return r; }

  const frame = page.frameLocator("iframe.jupyter-frame");
  try {
    await frame.locator(".jp-Notebook .jp-CodeCell .cm-content:visible").last().click({ force: true });
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await page.keyboard.press("b");      await page.waitForTimeout(300);
    await page.keyboard.press("Enter");  await page.waitForTimeout(600);
    await page.keyboard.type("print('VERIFY_OK')", { delay: 8 });
    await page.keyboard.press("Shift+Enter");
    for (let i = 0; i < 120; i++) {
      const out = (await frame.locator(".jp-OutputArea-output").allTextContents().catch(() => [])).join(" ");
      if (out.includes("VERIFY_OK")) { r.运行 = true; break; }
      if (/Traceback|Error/.test(out)) { r.备注 = "运行报错: " + out.slice(-90); break; }
      await page.waitForTimeout(1000);
    }
    if (!r.运行 && !r.备注) r.备注 = "运行超时";
  } catch (e) { r.备注 = "运行操作失败: " + String(e).slice(0, 70); }

  try {
    const btn = page.getByRole("button", { name: "查看答案" });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(2500);
      const bar = await page.locator(".fill-review-summary, .jupyter-fill-review, .answer-panel").count();
      const inFrame = await frame.locator(".ai-trainer-fill-reference").count().catch(() => 0);
      r.对比答案 = bar > 0 || inFrame > 0;
      if (!r.对比答案) r.备注 += (r.备注 ? "；" : "") + "点「查看答案」后未出现参考";
    } else { r.备注 += (r.备注 ? "；" : "") + "无「查看答案」按钮"; }
  } catch { r.备注 += (r.备注 ? "；" : "") + "对比答案失败"; }
  return r;
}

async function checkDocument(page, task) {
  const r = { 加载: false, 就绪: true, 作答: false, 对比答案: false, 备注: "" };
  await page.goto(`${BASE}/practical/${task.code}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 60000 });
  await page.waitForTimeout(800);
  r.加载 = /\/practical\//.test(page.url());

  // 匿名访问时作答框是 readOnly，且 onFocus 会跳转登录页——这是设计行为。
  // 这里只核实作答控件存在且处于预期的只读态，不去聚焦，以免触发跳转。
  const boxes = page.locator("textarea, .word-inline-field input, [data-word-answer] input");
  const n = await boxes.count();
  if (n === 0) { r.备注 = "未找到作答输入框"; }
  else {
    const ro = await boxes.first().getAttribute("readonly");
    r.作答 = true;
    r.备注 = ro === null ? `作答框 ${n} 个，可直接输入` : `作答框 ${n} 个，匿名只读（需登录，设计如此）`;
  }

  for (const name of ["完成作答，进入复盘", "完成填写，核对答案", "完成并核对", "完成后核对参考答案"]) {
    const btn = page.getByRole("button", { name });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(1500);
      const shown = await page.locator(".answer-panel, .word-fill-reference, .business-sheet-review, .review-answer").count();
      const text = await page.locator("main").innerText();
      r.对比答案 = shown > 0 || /参考答案|参考填写|参考成果/.test(text);
      if (!r.对比答案) r.备注 += `；点「${name}」后未见参考`;
      break;
    }
  }
  if (!r.对比答案 && !/未见参考/.test(r.备注)) r.备注 += "；未找到核对按钮";
  return r;
}

for (const task of tasks) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const started = Date.now();
  let row;
  try {
    row = task.hasNotebook ? await checkNotebook(page, task) : await checkDocument(page, task);
  } catch (e) {
    row = { 加载: false, 备注: "异常: " + String(e).slice(0, 90) };
  }
  row.code = task.code;
  row.type = task.hasNotebook ? "Notebook" : "文档";
  row.title = task.title;
  row.秒 = Math.round((Date.now() - started) / 1000);
  results.push(row);
  await save();
  const flags = ["加载", "就绪", "运行", "作答", "对比答案"].filter(k => k in row).map(k => `${k}=${row[k] ? "✓" : "✗"}`).join(" ");
  console.log(`${row.code.padEnd(6)} ${row.type.padEnd(9)} ${flags}  ${row.秒}s ${row.备注 || ""}`);
  await page.close();
}

await browser.close();
console.log("\n结果已写入", OUT);
