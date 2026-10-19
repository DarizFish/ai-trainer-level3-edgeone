# 项目当前状态

更新时间：2026-10-19。用于把项目移交给其他会话或协作者。

本文只回答**现在是什么状态**。其余问题按下表分流——每类信息的更新节奏不同，
混在一份文档里的结果是它长到没人会完整读，而没人读完的显式状态等同于隐式状态。

| 你想知道 | 去哪 |
| --- | --- |
| 现在是什么状态、坐标、怎么跑起来 | 本文 |
| 还有什么没做 | `BACKLOG.md` |
| 这个现象以前查过吗、结论是什么 | `INCIDENTS.md` |
| 为什么做出某个重要决定 | `decisions/` |
| 数据库会先在哪里撑不住 | `DATABASE-CAPACITY.md` |
| 改 JupyterLite 前要知道什么 | `../jupyterlite/README.md` |
| 怎么验证、门禁分几层 | `TESTING.md` |
| 历史改进记录 | `IMPROVEMENTS.md` |

## 1. 坐标

### 2026-10-03：小程序接口已发布，真机验收待完成

**已验证**：PR #21 的合并版本通过 [主线 Quality Gate](https://github.com/DarizFish/ai-trainer-level3-edgeone/actions/runs/37132376140)，包括 57 项快速测试、构建、35 项浏览器回归和容器检查。生产迁移 `0003`、候选预备和切流成功；正式域名与源站的原有 6 项冒烟均通过。正式 HTTPS API 验证了注册登录、独立会话、账号隔离、作答去重、190 题计分、交卷重放及成绩列表。接入方式见 [微信小程序接入](MINIPROGRAM.md)。

**发现与修复**：CDN 以 HTTP 回源时，原配置返回的会话 Cookie 缺少 `Secure`。Nginx 现对 `ai_trainer_session` 强制添加该属性，新增线上登出 Cookie 冒烟检查；修复版本部署后必须对正式域名及源站重新运行完整 `test:smoke`。

**边界**：当前小程序 AppID 是测试号，已配置正式站 request 域名并生成预览；用户选择先完成测试号验收。iOS、Android 真机恢复和弱网验收尚未完成。

| 项目 | 值 |
| --- | --- |
| 正式站 | https://www.aitrainer3.xyz/ |
| 本地目录 | `C:\Users\zd\Documents\aitrainer3\edgeone-site` |
| 当前维护分支 | `main`。任务分支合并后即失效，不在此登记分支名 |
| 已验证代码基线 | `64d0963e899cfe8972b24542d069e2287d0be5e0`；主线 Quality Gate、迁移、容器预备及切流后原有 6 项线上冒烟通过；后续 Cookie 修复以新增第 7 项冒烟验收 |
| PR 状态 | PR #21 已合并；未启用硬分支保护 |
| 阿里云源站 | `39.96.7.2` 的 Nginx 在 blue:3000 / green:3001 间切换，实际活动槽以服务器 `/var/lib/aitrainer-deploy/active` 为准，前一实例保留回退；旧 `aitrainer.service` 已停用；当前 schema 为 `0003_freezing_white_queen` |
| 正式域名路由 | `www.aitrainer3.xyz` 由 EdgeOne CDN 回源阿里云 Nginx；2026-10-03 小程序接口切流后，源站及正式域名原有 `test:smoke` 均 6/6 通过。EdgeOne Pages 不承载正式流量。架构见 `SELF-HOSTING.md` |
| GitHub | `ssh://git@ssh.github.com:443/DarizFish/ai-trainer-level3-edgeone.git` |
| EdgeOne 项目 | `makers-xyzgssb9k7as` |
| Supabase | 项目 `sqenbhewvjnmatgkkbqy`，东京区 `aws-0-ap-northeast-1.pooler.supabase.com` |

数据库连接：`DATABASE_URL` 走 6543 事务连接池，网站运行时只读取这一个变量；`DIRECT_URL` 走 5432 会话连接池，Drizzle 配置与数据库管理命令优先使用它。2026-08-12 已验证生产库 8 张业务表与 `0002_snapshot.json` 一致，并建立完整 migration baseline。真实连接串只存在于本地 `.env.local` 和部署密钥中，不要输出或提交。数据库密码曾出现在历史会话记录里，建议上线稳定后旋转。

本地开发并非所有页面都需要数据库：公开题库、静态页面和 JupyterLite 无数据库可加载；注册、登录、收藏、错题、学习进度、成绩和云端草稿需要数据库。

## 2. 本地运行

Windows 上有两个已知约束：3000 端口返回 `EACCES`；Next.js 原生 SWC 无法加载且 Turbopack 不支持 WASM fallback。因此固定使用 Webpack 与非 3000 端口：

```powershell
npm.cmd run dev -- --webpack -p 3200 -H 127.0.0.1
```

生产构建同样固定为 `next build --webpack`（已写入 `package.json`）。

## 3. 当前质量门禁

安全依赖升级、PR Quality Gate、verified-artifact 自托管发布、数据库 migration 加固，以及 JupyterLite 内核冷启动与测试 readiness 修复已进入远端 `main`。PR Quality Gate 只验证提交，不部署生产环境。

### 2026-10-19：生产依赖高危审计修补（尚未部署）

**已验证（代码与本地门禁）**：Next.js 与 eslint-config-next 从 `16.3.6` 升至同系列补丁 `16.3.8`，锁文件中的 sharp 升至 `0.35.5`、source-map-js 升至 `1.2.2`。`npm.cmd audit --omit=dev --audit-level=high` 通过，消除这三项依赖的 high 通告；sanitize-html 及其上层依赖仍报告 8 项 moderate，未在本次修补范围内。`CI=true`、`SELF_HOSTED_BUILD=1` 的完整 `test:ci` 通过 57 项合同测试、生产构建和 35 项浏览器回归，无重试或 flaky。

成功运行不再上传浏览器报告，减少 artifact 占用，也避免存储额度影响成功门禁的结果。失败诊断与正式发布产物的要求见 [测试说明](TESTING.md)；部署工作流继续验证正式产物的身份和哈希。

**边界**：本轮仅修补仓库依赖，不执行网站预备或切流；线上仍运行既有部署，依赖修补须随之后的网站独立发布生效。

### 单机双槽容器首次切流（2026-09-27）

**已验证**：`main` 的 [Quality Gate run 36258772694](https://github.com/DarizFish/ai-trainer-level3-edgeone/actions/runs/36258772694) 为成功，产物对应 `47c05719ef773ce9a43d185b3fc502cfca7e8a40`；[容器预备 run 36284665165](https://github.com/DarizFish/ai-trainer-level3-edgeone/actions/runs/36284665165) 成功。候选 `aitrainer-green` 在 3001 端口为 healthy，切流脚本成功；服务器的 `active` 记录及 Nginx 配置均指向该提交和 3001 端口。

**已验证**：切流后从对应 checkout 对源站 `http://39.96.7.2/` 与正式域名分别运行 `npm.cmd run test:smoke`，均为 6/6 通过；覆盖公开路由、静态文件字节哈希和 MIME、Lab 配置、扩展入口及隔离头。新旧实例的 `/api/health/ready` 均返回 `database=ok` 和 `schema=0002_condemned_klaw`。

**历史阶段**：首次切流时旧 `aitrainer.service` 曾留在 3000 端口。2026-09-27 数据分析版本发布前已停用，当前回退目标改为 `aitrainer-green`；本次发布中显式执行过 `switch-aitrainer-container rollback` 并验证 green readiness。冒烟测试不覆盖账号登录、业务写入或 ONNX 推理。

### 数据记录与分析上线（2026-09-27）

**已验证**：PR #19 合并提交 `3bded47114f7c84430e4407712f5c942ce58c166` 的 [main Quality Gate run 36291278911](https://github.com/DarizFish/ai-trainer-level3-edgeone/actions/runs/36291278911) 成功；[容器预备 run 36292696263](https://github.com/DarizFish/ai-trainer-level3-edgeone/actions/runs/36292696263) 使用同一提交的 artifact 成功。服务器 `active` 记录、Nginx 路由和 blue 镜像版本均指向该提交。源站与正式域名在切流后各运行 `npm.cmd run test:smoke`，均为 6/6 通过；正式域名的 `tests/e2e/analytics.spec.mjs` 为 2/2 通过。green 保持 healthy，可回退。

**已验证**：浏览器 `page.viewed`、`lab.environment_ready` 和真实请求触发的服务端 `theory.answers_saved` 事件进入 blue 的 journald，事件含完整 `release_revision`；成功保存事件在代码中位于数据库操作成功之后。Nginx 新日志记录 `rt=` 且不记录查询参数；journald 实际配置为持久化、逐日轮转、最长 30 天及 512 MB 上限。服务器日报成功读取 blue/green 日志、Nginx 日志并对 Supabase 执行只读汇总。首次短暂切流产生的 2 条事件缺少版本字段，日报按 `unknown` 保留；旧格式 Nginx 行被计为无效输入。当天窗口尚未结束，`window.complete=false`。操作与指标口径见 [ANALYTICS.md](ANALYTICS.md)。

**尚未验证**：注册、登录及交卷成功事件尚无本轮生产观测；本轮未创建额外的生产测试账号。历史交卷可能早于新日志上线，不能把当日数据库交卷数与当日新日志数的差异当作数据丢失。

### 网站运营功能分支

**已发布（2026-08-15，PR #11）**：公告、面向考生的个人报名六步清单、备用网址状态页、ICP 备案页脚和自愿赞赏已随 `main` 上线。备用网址已进入顶部菜单，实操题的环境准备、浏览器运行、逐项核对和模板恢复已在首页前置展示。公告关闭状态刷新后仍保留，桌面和 390px 无横向溢出。

**自愿赞赏当前整条关闭**：收款码还是占位图，留着入口只会把用户领到一个不能付款的页面。开关是 `lib/features.ts` 的 `voluntarySupportEnabled = false`，沿用 `practicalMockEnabled` 那套写法——首页提示带、顶部菜单、页脚、sitemap 四个出口都不出现，直达 `/support` 由 `proxy.ts` 302 回首页。页面与文案整体保留，真实收款码到位并用真机验过金额与收款主体后翻成 `true` 即恢复，不需要重新实现。契约测试守的是「四个出口一个都不漏」而不是「代码已删除」——漏一个的后果就是用户点进去付不了款。

**待配置**：真实收款码（决定赞赏何时开启）；备用域名尚未提供，`/access` 明确显示“尚未对外启用”且不暴露服务器 IP。需求边界和开启条件见 `SITE-OPERATIONS-PRODUCT-REQUIREMENTS.md`。

**已验证（2026-08-14）**：

- 生产现象与源码控制流相互印证：JupyterLab 已显示 `Python (Pyodide)` 时，外层仍可能报告“内核已更替，丢弃第 1 代环境准备结果”。基线同时设置 `autoStartDefaultKernel=false`，并让 bridge 在 `SessionContext.initialize()` 之后回退到 `changeKernel()`；JupyterLab 选择流程和 bridge 因而都可能成为冷启动所有者，两个 Pyodide worker 竞争后会改变 `kernelId`，旧 generation 的准备结果随即失效。
- **决策**：恢复 `autoStartDefaultKernel=true`。bridge 扩展在 Notebook 打开前等待 JupyterLite Service Worker 接管、Pyodide 插件激活和 Python kernelspec 注册；此后只由 `DocumentContext`／`SessionContext.initialize()` 拥有冷启动，bridge 仅加入初始化，不再用 `changeKernel()` 兜底。
- 每个真实 `kernelId` 对应一个运行时 generation。用户切换内核或 JupyterLab 更换 worker 后，新 generation 会自动重建依赖、素材、warning policy 和 ONNX 垫片；旧 generation 的取消会跟随新 generation 恢复，不再把正常更替暴露为永久红色错误。
- 3.2.5 官方 `vision/utils/box_utils_numpy.py` 的普通 docstring 含 `\_`，Python 3.12 首次编译会产生 `SyntaxWarning`。官方文件和审计哈希保持不变；环境准备只在内存中把对应 docstring 规范化为 raw string，编译后以原模块名注册。ONNX 回归重复 3 次均未观察到该 warning。
- 提交 `969f25e` 曾在本地通过 `CI=true + SELF_HOSTED_BUILD=1` 的 27/27 浏览器门禁，但 GitHub runner 暴露出两项独立的测试所有权错误：三个生命周期用例在首轮和 retry 共 6 次于目标 Notebook 注册前调用 panel-scoped 命令；官方题目弹窗又因自定义 keydown 与原生 `<dialog>` 同时处理 Escape 出现 1 次 flaky。前者改为显式等待目标 path 出现在 `app.shell.widgets("main")`，后者只保留浏览器原生 cancel/close。关闭 retry 后，生命周期压力回归 15/15、Escape 回归 20/20；最终工作树的完整同构门禁也通过合同测试 50/50、Playwright 27/27，全部首轮通过且无 retry/flaky，并通过 Next.js 16.3.0 standalone 构建。
- **已验证（GitHub）**：修复提交 `94cdd33` 的 PR Quality Gate run `31769689925` 成功；PR #7 合并后的 `main` Quality Gate run `31770512365` 成功；`main` 合并提交为 `b8eb0ce`。
- **已验证（阿里云）**：`Deploy verified self-hosted release` run `31770822118` 成功消费 `b8eb0ce` 的已验证 artifact。公网 `http://39.96.7.2/api/health/ready` 返回 `status=ready`、`database=ok` 和 schema `0002_condemned_klaw`。
- ~~**风险（正式域名）**~~ 与 ~~**风险（正式域名仍停在 2026-08-06 的构建）**~~：**2026-08-15 已解除。** 正式域名当天完成切换，实测 `Server: nginx`、`/api/health/ready` 返回 `ready` / `database=ok` / schema `0002_condemned_klaw`、`jupyter-lite.json` 与 checkout 一致。原因也随之明确：那两条不是缓存问题，而是 EdgeOne Pages 的部署没有跟上 `main`，切换到 CDN 回源阿里云后该链路不复存在。

### 迁移后加固（2026-08-15，PR #14 / `43ebdac` → `main` `8cca4ec`）

正式域名切换的同一天，线上还一步从 `e67c7a8`（08-06）升到了 `main`，跨 38 个提交。三处按 EdgeOne 假设写的东西没跟着改，已修复：

- **退连接的爆炸半径。** `withDbDeadline` 原先一次超时就 `end({ timeout: 0 })`——那是按 EdgeOne 的 `max: 1` 设计的：函数实例各自独立，退掉只炸自己那一个。自托管是单进程共用一个 client，同样的动作会把当时**所有用户**的在途查询一起拒掉；而 lab 每 12 秒自动保存一次草稿、正文上限 4 MB、数据库还在东京，一个大草稿用户反复超时就能拖垮全站的数据库层。现改为按原因分流：真正的连接故障立即退，纯语句超时只让该请求失败，**连续 3 次**才认为连接卡死。阈值不能是 1（等于没改），也不能没有（卡死的连接会被永久占住）。`DATABASE_POOL_MAX` 3 → 10。
- **SW 门禁的报错改成给出下一步。** `ensureServiceWorkerControl` 是本次升级新增的硬门禁（`e67c7a8` 里 0 处），方向正确——没有 SW 时 JupyterLite 会静默退回内存文件系统，学员 `to_csv` 出来的文件刷新即失且无任何外部信号。但四条报错写的都是内部机制。真实原因几乎从来不是浏览器太旧，而是隐私窗口：**Firefox 隐私窗口和 Safari 无痕浏览直接禁用 Service Worker，Chrome/Edge 无痕反而支持。**
- **nginx 多带的 COOP/COEP 已删除。** `b175204`(07-27) 为跨源隔离加上 → `1aee62c`(08-02) 照抄进 Nginx → `ff54ebd`(08-13) 只从 `edgeone.json` 和 `next.config.ts` 删掉，Nginx 留到了迁移当天才第一次挡在用户前面。约束本身见 `../jupyterlite/README.md` 的硬约束一节。

**守卫**：`tests/contracts.test.mjs` 断言 `nginx`、`edgeone.json`、`next.config.ts` 三份都不含这两个头（反向验证过会红）；`tests/production-smoke.test.mjs` 断言 lab 外壳不带 COOP/COEP，且 `jupyter-lite.json` 引用的每个 `remoteEntry.*.js` 返回 200。后者能把「配置漏更新导致实验室永远加载中」在发布后立刻抓出来。

**顺带修掉一个一直是红的测试**：`test:smoke` 的缓存键写死在 `20260726-pyodide0277-runtime11`，而 `969f25e` 已换成 `20260814-kernel-owner-runtime12`，现改为从 `public/lite/lab/index.html` 读取。

**已验证（线上，2026-08-15）**：`npm run test:smoke` 6/6 通过；`/lite/lab/index.html` 不再返回任何 `Cross-Origin-*` 头；新扩展入口 `remoteEntry.2982eb0ec7d48f12e948.js` 返回 200，旧的 `remoteEntry.00ce498ab5bcc55d1ce7.js` 返回 404。

**未能从本机验证**：`DATABASE_POOL_MAX=10` 是否已随 `systemctl daemon-reload` 生效——`/api/health/ready` 不暴露池大小。需在服务器上执行 `systemctl show aitrainer -p Environment` 确认。

**排查时已排除，不必重查**：用户端缓存在这次跳版本中是干净的（`/lite/static/`、`/lite/build/`、`/labs/models/`、`/labs/runtime/` 一个字节没动，变了的文件全在 must-revalidate 上）；发布切换是原子换 symlink，静态文件没有 404 窗口；`.wasm` 在 Nginx 下拿到 `application/wasm`。另外 2026-07-26（`c1d08ee`）之前的 immutable 缓存不构成存量用户风险——网站 7-29 才对外推广，外部用户的首次访问全在修复之后。

**已排除**：这组三个新现象不是 `/drive` 同步 worker 死锁的再次表现。前一轮移除 COOP/COEP、以 Service Worker 作为唯一 `/drive` 桥的约束继续有效；本轮修复的是冷启动所有权和内核 generation 生命周期。

**当前决策**：暂不增加 `main` 的硬分支保护。Quality Gate 已能在 PR 合并前运行，但在 required check 落地前仍依赖人工保证只合并门禁已通过且 head SHA 未变化的 PR。EdgeOne Pages 继续独立监听 `main`；未来新增 EdgeOne CDN 回源阿里云时，应保留现有 Pages 项目，并把域名路由、动态 `/api/*` 不缓存和静态 JupyterLite 缓存规则作为独立上线验收项。

### 已回退：JupyterLite 翻译接口无扩展名别名

曾有一组改动为 `/lite/api/translations/{all,en}` 发布无后缀别名，用于排查 Lab 卡死。2026-07-26 已确认它与卡死无关并全部回退，记录在此避免重复尝试：

本地生产构建下用真实 Chromium 打开 Lab（加载 → 内核 Idle → 再等 8 秒），JupyterLite 只请求 `/lite/api/translations/en.json` 与 `all.json`，两者均 200，**从未请求过无后缀路径**。打包代码印证：JupyterLite 自己的翻译插件（`public/lite/build/4761.*.js`、`7311.*.js`）拼的是 `api/translations/${locale}.json`；只有 JupyterLab 核心的 `requestTranslationsAPI`（`jlab_core.*.js`）拼无后缀路径，而它在所有 bundle 中都找不到调用点。


## 4. 部署前置条件：迁移门禁已自动化

`auth_throttle` 表是注册与登录限流的存储。应用运行时**不执行 DDL**，表不存在时两个接口都会直接返回 503——也就是说，代码先于 migration 上线会让账号体系整体不可用。顺序必须是：先建表，再部署。

2026-08-12 已逐项验证生产 schema 并在 `drizzle.__drizzle_migrations` 建立 `0000`—`0002` 基线。自托管发布会在切换应用版本前持 PostgreSQL advisory lock 执行 `db:migrate` 与 `db:check`；应用 readiness 同时验证所需 migration hash。新增结构必须遵守 `DATABASE-MIGRATIONS.md` 的 expand/contract 流程，不再手工执行未登记 SQL。


## 5. ONNX 模型

量化模型已生效：`public/labs/manifest.json` 中 `sourceVariant` 为 `browser-quantized`，五个模型以内容哈希分片形式存放在 `public/labs/models/<hash>/part-NNN.bin`，合计 46 MB（`resnet` 25 MB、`emotion-ferplus` 21 MB、`version-RFB-320` 488 KB、`mnist` 20 KB）。这些路径带内容哈希，适用 `edgeone.json` 中的一年 immutable 缓存。量化源文件保留在被 Git 忽略的 `work/browser-models/quantized`，原始大模型拆分产物不提交。

