# 本次会话改动说明（实操题实验室与侧栏优化）

> 范围：本地部署调试期间对实操题页面（`/practical/[code]` 与 `/practical/[code]/lab`）及 JupyterLite 扩展的一系列优化。均为前端/扩展改动，未改动题库数据与后端。

## 环境与部署说明

- **依赖安装**：本机 npm 默认指向内网镜像（`npm.ctr.int.sap.corp`，需 VPN，当前不可达）。安装时用公共镜像覆盖：`npm install --registry=https://registry.npmjs.org`。lockfile 内地址本就指向公共 npm，无冲突。
- **本地启动**：`npm run dev`（Next.js 16，端口 3000）。
- **JupyterLite 扩展构建**（macOS 上，绕开 Windows 的 PowerShell 脚本）：
  1. `cd jupyterlite-extension && npm install --registry=https://registry.npmjs.org`
  2. `npm run build`（`build-labextension` 由 `@jupyterlab/builder` 提供，已在 devDependencies）
  3. 把 `jupyterlite-extension/labextension/` 的产物同步到 `public/lite/extensions/ai-trainer-jupyterlite/`（`static/*`、`package.json`）
  4. 更新 `public/lite/jupyter-lite.json` 中该扩展的 `remoteEntry.*.js` hash 引用（每次构建 hash 会变）
- **缓存提醒**：`public/lite` 有 service worker 缓存，验证扩展改动需无痕窗口或硬刷新。

---

## 一、JupyterLite 扩展（`jupyterlite-extension/src/index.ts`）

### 1. 修复「核对填空」参考框导致的选择漂移
- **问题**：显示行内参考填写后，鼠标在 notebook 里选择代码「选不准、选不中」，且越靠后越偏。
- **根因**：block widget 用了垂直 `margin`，而 CodeMirror 用 `getBoundingClientRect()` 测块级 widget 高度时计入 padding、忽略 margin —— 每个参考框造成 ~17px 高度低估，逐个累加，下方所有行的指针坐标映射持续偏移。
- **修复**：改用外层 host 容器承载垂直间距为 `padding`（会被测量）；widget 根节点加 `contentEditable="false"`、`user-select:none`、`pointer-events:none`，使其对选择完全透明。

### 2.「核对填空」→「查看答案」，改造为逐空对比 + 自动判定
- 从「只贴参考答案、纯人工判分」升级为**逐空对比**：每空显示「你的填写 vs 参考」并给出自动判定。
- 判定档次简化为三档：`✓ 完全一致` / `✗ 与参考不同` / `· 未填写`（原「结构相符/差异较大」措辞按反馈去除）。
- 代码归一化 `normalizeCode()`（统一空格/引号/运算符周围空白），完全一致时判 ✓。
- 每空新增「填入参考」按钮：把参考答案写入当前行、保留其它空已填内容；已判「完全一致」或无参考时禁用。
- 参考框代码片段可选中复制（`user-select:text`），外壳不可选。
- 参考框宽度锁定为编辑器**可视宽度**（`.cm-scroller` 设 `container-type:inline-size`，host 用 `100cqw` + `sticky;left:0`），修复长代码行下「填入参考」按钮跑到横向滚动区外不可见的问题。

### 3. 控制入口移动与去重
- 「查看答案」切换按钮从 **iframe 内部工具栏移到页面顶部工具栏**（「运行全部」那一栏），新增 `ai-trainer:toggle-fill-review` 命令供外层调用；显示态高亮、可切「隐藏答案」。
- 逐空判定结果**汇总上报**到外层，顶部工具栏下方显示自查汇总条（完全一致 N / 与参考不同 N / 未填写 N）。
- 删除 iframe 内重复的「保存到备考站云端」按钮（与外层「云端保存」功能重复，最终都调用同一 `saveDraft()`）。

### 4. 自动折叠文件浏览器
- Notebook 加载完成即调用 `collapseLeft()`（提前到 `context.ready`，不再依赖内核/练习准备时序），收起左侧文件浏览器面板，代码区可用宽度 724px → 974px。

### 5. 修复「恢复原始模板」后环境准备 cell 重现
- `set-notebook` 命令在 `fromJSON()` 重建单元后，`await cell.ready` 再主动调用 `hideInfrastructureCells()`，不再依赖 `contentChanged` 事件时序，确保 `ai-trainer-setup` 环境准备 cell 保持隐藏。

---

## 二、Notebook 实验室页面（`components/PracticalLabWorkbench.tsx`、`JupyterLiteLab.tsx`、`app/practical/[code]/lab/page.tsx`）

### 1. 顶部题目信息栏重构进侧栏
- 删除页面顶部独立的 `lab-context-bar`（面包屑 + 题号 + 标题 + chips + 返回题库），信息并入侧栏，顶部不再占用垂直空间。

### 2. 侧栏可折叠
- 侧栏可一键收起：展开态右缘竖向「‹」把手（sticky，贴侧栏与代码区边界）；收起态左侧显示竖向卡片（圆形「»」图标 + 题号 + 「题目信息」），点击展开。收起后代码区占满。

### 3. 侧栏内部顺序与滚动优化
- 顺序调整为：题目信息 → 作答工作区（Notebook/测试报告切换）→ 提示 → 题目要求（此前作答工作区被排在最底部，需滚动才可见）。
- 消除题目要求区的内部 `max-height/overflow`，避免与侧栏本身的双重滚动。

### 4. 代码区高度
- iframe 高度公式扣减值 `222px → 180px`、下限 `640 → 660px`，底部多余留白 66px → 24px，代码可视区 +42px。

---

## 三、实操题统一改造（4 类题型：Notebook 1.1/2.1/2.2/3.2、Word 4.1/4.2、业务 1.2、报告 3.1）

### 1. 共享题目页头 + 跨题导航
- 新增 `components/PracticalTaskHeader.tsx`：统一「面包屑 + 题号 + 标题 + chips + 上一题/题库/下一题」页头。
  - `variant="page"` 与 `variant="rail"` 两种；最终四类题都用 `rail` 变体放侧栏顶部。
  - 跨题导航为紧凑胶囊 `‹ 上一题 · 题库 · 下一题 ›`；首/末题对应箭头禁用。
- `lib/content.ts` 新增 `getPracticalNeighbors(code)`（按题库自然顺序 1.1.1→4.2.5 取前后题）与 `practicalTaskHref(task)`（按 `hasNotebook` 决定 `/lab` 或详情路由），跨 notebook↔非 notebook 边界生成正确链接、一次直达。

### 2. 侧栏视觉统一
- **宽度**统一 300px（此前 Notebook 310 / 其它 290）。
- **背景透明度**统一 `.94`（此前 Word `.92`）。
- **内边距根治**：`.is-rail` 页头自带 18px 横向内边距，四类侧栏容器统一 `padding:0`、内容块统一 18px inset，修复 Business 页头贴边（原仅 1px）的 bug。四类页头左内边距统一为 19px（18px + 1px 边框）。

### 3. 侧栏内容模型统一
- 新增 `components/PracticalBrief.tsx`：统一「题目要求」折叠块 = 题干 `description` + 官方任务单三段（场地设备要求 / 技能要求 / 质量指标）。
  - 此前 `officialTaskSheet` 三段**仅 Business 展示**，其余三类丢弃；现四类题全部展示。
  - Business 主区原常驻的四段说明移入此侧栏折叠块，主区去重、直接进入答题。
- 新增 `components/PracticalMaterialsList.tsx`：统一「本题文件」列表（类型标签 + 文件名 + 大小 + 下载/「实验区加载」标注）。
  - 此前素材呈现有下载链接 / 侧栏列表 / iframe 内隐式 / 无 共四种；现四类统一（无 materials 则不渲染）。
- 四类侧栏统一分区顺序：**页头 → 题目要求 → 本题文件 → 题型专有内容**（填空进度 / 分节导航 / 工作区切换 / 大题导航）。

### 4. 保留的合理差异（非缺陷）
- **可折叠**：仅 Notebook 侧栏可折叠（为 iframe 腾空间）。
- **作答区（主区）**：各题型专有（填空画布 / 答题纸 / notebook），不强求统一。
- **答案/评分交互**：inline widget / 逐空按钮 / 复盘区，受交付形态限制，本轮未统一。

---

## 主要涉及文件

| 文件 | 改动 |
| --- | --- |
| `jupyterlite-extension/src/index.ts` | 参考框选择/宽度修复、逐空对比+填入参考、toggle 命令、折叠文件浏览器、恢复模板修复、删重复保存按钮 |
| `components/PracticalTaskHeader.tsx` | 新增·共享页头+跨题导航 |
| `components/PracticalBrief.tsx` | 新增·统一题目要求（题干+官方三段） |
| `components/PracticalMaterialsList.tsx` | 新增·统一本题文件列表 |
| `components/PracticalLabWorkbench.tsx` | 侧栏折叠、顺序、接入共享组件 |
| `components/JupyterLiteLab.tsx` | 查看答案按钮/汇总、iframe 高度 |
| `components/WordTemplateExercise.tsx` | 侧栏接入 Brief+Materials |
| `components/PracticalResponseExercise.tsx` | 侧栏接入 Brief+Materials |
| `components/BusinessAnalysisAnswerSheet.tsx` | 侧栏接入 Brief+Materials、主区去重 |
| `app/practical/[code]/page.tsx` | 移除外层页头 |
| `app/practical/[code]/lab/page.tsx` | 移除顶部 context bar |
| `lib/content.ts` | `getPracticalNeighbors` / `practicalTaskHref` |
| `app/globals.css` | 侧栏统一样式、页头/胶囊导航、Brief/Materials 样式、清理死样式 |
| `public/lite/**` | 扩展构建产物与 `jupyter-lite.json` 引用同步 |

## 验证方式

- `npx tsc --noEmit` 全程无错误。
- Playwright（系统 Chrome）截图与量测：四类侧栏宽度 300 / 页头内边距 19 / 背景 `.94` 一致；Brief 三段官方要求四类均在；跨题导航 notebook↔非 notebook 边界正确、首末题禁用；参考框「填入参考」按钮可见、选择不漂移。
