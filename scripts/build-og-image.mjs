// 生成社交分享卡片 public/og.jpg。
//
// 做成脚本而不是一次性产物，是因为图上印着站名和三个数字——站名改过一次（去掉
// 「全题库」），题量以后也会变。手工出图意味着每次改文案都要找回原始设计稿。
//
// 配色与字体直接取自 app/globals.css 的变量和标题字体栈，卡片和站点因此是同一套
// 视觉，而不是两张分别设计的图。
//
// 用法：npm run og:build
//
// 刻意不画公章样式的圆形印记：站点在《免责声明》里明确声明与各认定机构无隶属或
// 授权关系，分享卡片上摆一个官方感的印章会直接推翻那句话。

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const WIDTH = 1672;
const HEIGHT = 941;
const OUTPUT = "public/og.jpg";

const CODE = [
  [["import", "kw"], [" numpy ", "t"], ["as", "kw"], [" np", "t"]],
  [],
  [["def", "kw"], [" train", "fn"], ["(X, y, lr=", "t"], ["0.01", "num"], ["):", "t"]],
  [["    w = np.zeros(X.shape[", "t"], ["1", "num"], ["])", "t"]],
  [["    b = ", "t"], ["0.0", "num"]],
  [["    ", "t"], ["for", "kw"], [" epoch ", "t"], ["in", "kw"], [" range(", "t"], ["100", "num"], ["):", "t"]],
  [["        y_pred = X.dot(w) + b", "t"]],
  [["        grad_w = X.T.dot(y_pred - y) / len(y)", "t"]],
  [["        w -= lr * grad_w", "t"]],
  [["        b -= lr * np.mean(y_pred - y)", "t"]],
  [["    ", "t"], ["return", "kw"], [" w, b", "t"]],
];

const codeHtml = CODE.map((line, index) => {
  const spans = line.map(([text, kind]) => `<span class="${kind}">${text}</span>`).join("");
  return `<div class="code-line"><i>${index + 1}</i>${spans || "&nbsp;"}</div>`;
}).join("");

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
    /* 纸面：米色底 + 右下微微压深，再叠一层极淡的横线，取「稿纸」的意思而不真画格子。 */
    background:
      repeating-linear-gradient(to bottom, rgba(178,58,43,.055) 0 1px, transparent 1px 46px),
      radial-gradient(120% 100% at 18% 12%, #f7f2e7 0%, #f1ebdd 46%, #e6dcc6 100%);
  }
  .sheet { position: relative; width: 100%; height: 100%; padding: 120px 78px 0; }
  /* 左边一条竖红线，配合横线坐实稿纸的联想。 */
  .sheet::before { content: ""; position: absolute; top: 0; bottom: 0; left: 58px;
    border-left: 2px solid rgba(178,58,43,.16); }

  .eyebrow { display: flex; align-items: center; gap: 14px;
    font-size: 19px; font-weight: 700; letter-spacing: .3em; color: #b23a2b; }
  .eyebrow::before { content: ""; width: 42px; height: 2px; background: currentColor; }

  .stage { display: flex; align-items: flex-start; justify-content: space-between; gap: 40px; margin-top: 46px; }

  h1 { font-family: "Noto Serif SC", STSong, SimSun, serif; font-weight: 900; line-height: 1.06; }
  .line-a { display: block; font-size: 98px; color: #102a43; letter-spacing: .01em; white-space: nowrap; }
  .line-b { display: block; font-size: 128px; color: #b23a2b; letter-spacing: .04em; margin-top: 8px; white-space: nowrap; }

  /* 两行标题之间的分隔：金色细线 + 菱形，和站内 .eyebrow 的横杠是同一种装饰语言。 */
  .rule { display: flex; align-items: center; gap: 16px; width: 540px; margin: 26px 0 22px; }
  .rule span { flex: 1; height: 1px; background: linear-gradient(to right, #b18a43, rgba(177,138,67,.15)); }
  .rule span:last-child { background: linear-gradient(to left, #b18a43, rgba(177,138,67,.15)); }
  .rule b { color: #b18a43; font-size: 15px; }

  .tagline { margin-top: 40px; font-size: 26px; letter-spacing: .16em; color: #3e5365; }

  /* 代码窗：站点的差异点是「Python 直接在浏览器里跑」，这一块就是那句话的图形化。 */
  .window { width: 540px; flex: none; margin-top: 6px; transform: rotate(1.4deg);
    background: #0f2438; border-radius: 9px; overflow: hidden;
    box-shadow: 0 30px 70px rgba(38,32,21,.28), 0 0 0 1px rgba(16,42,67,.5); }
  .bar { display: flex; align-items: center; gap: 9px; padding: 14px 18px; background: #16324a; }
  .bar i { width: 12px; height: 12px; border-radius: 50%; }
  .bar i:nth-child(1) { background: #c9553f; } .bar i:nth-child(2) { background: #cf9a3c; } .bar i:nth-child(3) { background: #8fa3b4; }
  .code { padding: 22px 22px 26px; font-family: Consolas, "Cascadia Mono", monospace; font-size: 19px; line-height: 1.72; }
  .code-line { white-space: pre; color: #dbe6ef; }
  .code-line i { display: inline-block; width: 30px; font-style: normal; color: #4d6a85; }
  .kw { color: #e0a04c; } .fn { color: #7cc4e8; } .num { color: #b6d98a; } .t { color: #dbe6ef; }

  /* 底部数字带：三个数字是这个站最直接的卖点，单独占一条。 */
  .band { position: absolute; left: 0; right: 0; bottom: 0; height: 178px;
    display: flex; align-items: center; justify-content: center; gap: 62px;
    background: linear-gradient(to bottom, #b8402f, #9c3125); border-top: 3px solid #8e2d23; }
  .stat { display: flex; align-items: baseline; gap: 14px; }
  .stat strong { font-family: "Noto Serif SC", STSong, SimSun, serif; font-weight: 900; font-size: 82px; color: #edd7a4; line-height: 1; }
  .stat span { font-size: 27px; font-weight: 500; letter-spacing: .08em; color: #f7e9d4; }
  .sep { color: rgba(247,233,212,.5); font-size: 20px; }
</style></head><body>
  <div class="sheet">
    <p class="eyebrow">国家职业技能等级认定 · 上海</p>
    <div class="stage">
      <div>
        <h1><span class="line-a">人工智能训练师三级</span></h1>
        <div class="rule"><span></span><b>◆</b><span></span></div>
        <h1><span class="line-b">题库备考站</span></h1>
        <p class="tagline">理论 · 实操 · 模拟 · 在线实验</p>
      </div>
      <div class="window">
        <div class="bar"><i></i><i></i><i></i></div>
        <div class="code">${codeHtml}</div>
      </div>
    </div>
    <div class="band">
      <div class="stat"><strong>900</strong><span>道理论题</span></div>
      <div class="sep">◆</div>
      <div class="stat"><strong>40</strong><span>道实操题</span></div>
      <div class="sep">◆</div>
      <div class="stat"><strong>20</strong><span>个在线实验</span></div>
    </div>
  </div>
</body></html>`;

const scratch = mkdtempSync(join(tmpdir(), "og-"));
const png = join(scratch, "og.png");

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: png });
await browser.close();

// 走 PIL 而不是 Playwright 的 type:"jpeg"：这张图主体是大号红蓝中文标题，Chromium
// 默认的 4:2:0 色度抽样会让笔画边缘发糊，PIL 能指定 subsampling=0 保住 4:4:4。
execFileSync("python", ["-c", `
from PIL import Image
im = Image.open(r"${png}").convert("RGB")
im.save(r"${OUTPUT}", "JPEG", quality=86, optimize=True, progressive=True, subsampling=0)
print(f"{im.size[0]}x{im.size[1]}")
`], { stdio: "inherit" });

rmSync(scratch, { recursive: true, force: true });
console.log(`已写入 ${OUTPUT}`);
