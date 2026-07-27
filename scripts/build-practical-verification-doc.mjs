// 合并匿名与登录态两轮验证结果，生成 docs/PRACTICAL-VERIFICATION.md。
//   node scripts/build-practical-verification-doc.mjs
import { readFile, writeFile } from "node:fs/promises";

const load = async (path) => {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return []; }
};

const anon = await load("tmp/verify-practical-flows.json");
const signed = await load("tmp/verify-signed-in.json");
const signedByCode = new Map(signed.map(row => [row.code, row]));

const rows = [...anon].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
if (rows.length !== 40) throw new Error(`匿名结果应为 40 题，实际 ${rows.length}`);

const mark = (value) => (value ? "✅" : "❌");
const date = new Date().toISOString().slice(0, 10);
const notebooks = rows.filter(row => row.type === "Notebook");
const documents = rows.filter(row => row.type === "文档");
const allPass = rows.every(row => {
  const s = signedByCode.get(row.code);
  const base = row.加载 && row.对比答案 && (row.type === "Notebook" ? row.就绪 && row.运行 : row.作答);
  const extra = !s || (row.type === "Notebook" ? s.填答 && s.运行 : s.填答 && s.持久化);
  return base && extra;
});

const lines = [
  "# 实操题主流程验证状态",
  "",
  "40 道实操题逐题验证加载、就绪、作答、运行与对比答案主流程的结果。",
  "验证驱动真实浏览器，跑在本地生产构建（`npm run build` + `npm start`）上，分匿名与登录两轮。",
  "",
  `**最近验证：${date} · ${allPass ? "40/40 通过" : "存在失败项，见下表"}**（Notebook ${notebooks.length} 题、文档 ${documents.length} 题）`,
  "",
  "## 验证口径",
  "",
  "| 检查项 | Notebook 题 | 文档题 |",
  "|---|---|---|",
  "| 加载 | 页面与 `iframe.jupyter-frame` 渲染 | 页面渲染且未被重定向 |",
  "| 就绪 | 状态栏出现「代码区已就绪」 | 页面可交互 |",
  "| 对比答案 | 点「查看答案」后出现逐空参考 | 点核对按钮后出现参考答案 |",
  "| 填答（登录） | 逐空点「填入参考」写入答案 | 在作答框写入并等待草稿保存 |",
  "| 运行（登录） | 「运行全部」执行到内核空闲且无报错输出 | 不适用 |",
  "| 持久化（登录） | 由运行覆盖 | 刷新页面后草稿仍在 |",
  "",
  "匿名会话下作答控件为 `readOnly`，聚焦会跳转登录页，这是设计行为（`readOnly={!userEmail}`）。",
  "",
  "## Notebook 题（20）",
  "",
  "| 题号 | 标题 | 加载 | 就绪 | 对比答案 | 填答空数 | 运行全部 | 备注 |",
  "|---|---|---|---|---|---|---|---|",
];
for (const row of notebooks) {
  const s = signedByCode.get(row.code) ?? {};
  const note = [row.备注, s.备注].filter(Boolean).join("；");
  lines.push(`| ${row.code} | ${row.title} | ${mark(row.加载)} | ${mark(row.就绪)} | ${mark(row.对比答案)} | ${s.空数 ?? "—"} | ${"运行" in s ? mark(s.运行) : "—"} | ${note} |`);
}

lines.push("", "## 文档题（20）", "", "| 题号 | 标题 | 加载 | 对比答案 | 填答 | 刷新后仍在 | 备注 |", "|---|---|---|---|---|---|---|");
for (const row of documents) {
  const s = signedByCode.get(row.code) ?? {};
  const note = [row.备注?.replace(/^；/, ""), s.备注].filter(Boolean).join("；");
  lines.push(`| ${row.code} | ${row.title} | ${mark(row.加载)} | ${mark(row.对比答案)} | ${"填答" in s ? mark(s.填答) : "—"} | ${"持久化" in s ? mark(s.持久化) : "—"} | ${note} |`);
}

lines.push(
  "",
  "## 复现方式",
  "",
  "```bash",
  "npm run build && npm run start -- -H 127.0.0.1 -p 3200",
  "node scripts/verify-practical-flows.mjs                    # 匿名一轮",
  "# 登录一轮需要一个测试账号的会话 cookie：",
  "curl -s -i -X POST http://127.0.0.1:3200/api/auth/login \\",
  "  -H 'content-type: application/json' \\",
  "  -d '{\"email\":\"<账号>\",\"password\":\"<密码>\"}' | grep -i set-cookie",
  "node scripts/verify-practical-signed-in.mjs <ai_trainer_session 的值>",
  "node scripts/build-practical-verification-doc.mjs         # 刷新本文档",
  "```",
  "",
  "## 已知边界",
  "",
  "- Notebook 的「填答」通过逐空点「填入参考」写入官方参考答案，因此「运行全部」通过同时说明参考答案能在浏览器内核里跑通。",
  "- 登录一轮会向数据库写入测试账号、草稿与提交记录，正式发布前应清理测试账号数据。",
  "- 耗时为本地生产构建下的单题冷启动，含 Pyodide 内核启动；线上受网络影响会更长。",
  "",
);

await writeFile("docs/PRACTICAL-VERIFICATION.md", lines.join("\n"), "utf8");
console.log(`已更新 docs/PRACTICAL-VERIFICATION.md（匿名 ${rows.length} 题，登录 ${signed.length} 题，全通过=${allPass}）`);
