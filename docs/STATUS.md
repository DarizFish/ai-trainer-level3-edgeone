# 项目当前状态

更新时间：2026-08-15。本文取代原 `SESSION-HANDOFF.md`，用于把项目移交给其他会话或协作者。只记录**当前**事实与待办；历史改进见 `IMPROVEMENTS.md`。

## 1. 坐标

| 项目 | 值 |
| --- | --- |
| 正式站 | https://www.aitrainer3.xyz/ |
| 本地目录 | `C:\Users\zd\Documents\aitrainer3\edgeone-site` |
| 当前维护分支 | `main`；本地任务分支 `codex/post-migration-hardening` 已合并 |
| 已验证代码基线 | 加固提交 `43ebdac`，经 PR #14 合并为 `main` 提交 `8cca4ec`；验证证据见第 3 节 |
| PR 状态 | PR #14 已在 Quality Gate 通过后合并；未启用硬分支保护 |
| 阿里云源站 | `39.96.7.2` 已部署并通过 `/api/health/ready`；当前 schema 为 `0002_condemned_klaw` |
| 正式域名路由 | **已切换完成**：`www.aitrainer3.xyz` 由 EdgeOne CDN 回源阿里云 Nginx，2026-08-15 实测返回 `Server: nginx`、`/api/health/ready` 为 `ready`。EdgeOne Pages 不再承载正式流量。架构见 `SELF-HOSTING.md` |
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

### 网站运营功能分支

**已验证（2026-08-15，尚未发布）**：`codex/site-operations-features` 实现公告、面向考生的个人报名六步清单、备用网址状态页、ICP 备案页脚和自愿赞赏。备用网址已进入顶部菜单，实操题的环境准备、浏览器运行、逐项核对和模板恢复已在首页前置展示。公告关闭状态刷新后仍保留，桌面和 390px 无横向溢出。

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
- **nginx 多带的 COOP/COEP 已删除。** `b175204`(07-27) 为跨源隔离加上 → `1aee62c`(08-02) 照抄进 Nginx → `ff54ebd`(08-13) 只从 `edgeone.json` 和 `next.config.ts` 删掉，Nginx 留到了迁移当天才第一次挡在用户前面。约束本身见第 9 节。

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

## 4. 已知问题

> 4.1 到 4.5 是同一天排查同一个故障的产物，按发现顺序排列。核心教训只有一句：**文件名不带内容哈希、内容却随构建变化的文件，绝不能按 `immutable` 缓存。**

### 4.1 Lab 卡死：可变配置文件被当作不可变资源缓存

**症状**：`/practical/<code>/lab` 在常用 Chrome 里启动时静默卡死，无痕窗口正常；线上代码没有任何改动却会自行恢复。

**根因**，线上实测响应头：

```text
/lite/jupyter-lite.json    Cache-Control: public,max-age=31536000,immutable
/lite/service-worker.js    Cache-Control: public,max-age=31536000,immutable
/lite/config-utils.js      Cache-Control: public,max-age=31536000,immutable
/lite/lab/index.html       Cache-Control: public,max-age=0,must-revalidate
```

`jupyter-lite.json` 是**唯一**记录四个 `federated_extensions` 的地方——`lab/index.html` 的内联 `#jupyter-config-data` 里没有——它却被按一年不可变缓存。而 `822b40b` 换掉了其中两个 bundle 并删除了旧文件：

| 扩展 | 旧 hash | 线上现状 |
| --- | --- | --- |
| `@jupyterlite/pyodide-kernel-extension` | `af5d2dda3bb046a0` | 404 |
| `ai-trainer-jupyterlite` | `e1c036871c986d7d325f` | 404 |

于是持有旧 `jupyter-lite.json` 的浏览器会请求这两个已删除的 bundle → 404 → 联邦扩展加载失败 → 启动流程永远停住。无痕窗口无缓存，拿到新配置所以正常。等缓存副本被淘汰后又自行恢复，这解释了“什么也没改、过一阵好了”。

**已修**：`edgeone.json` 为这些文件显式设置 `max-age=0, must-revalidate`，见 4.2 的完整清单。带内容 hash 的 `/lite/build/*`、`/labs/models/*` 和带版本号的 `*.whl` 保持 immutable 不变。

**用户侧仍需手动清一次**：已经中毒的浏览器不会因为响应头变化而恢复——它们手里的副本标着一年不过期，根本不会回源校验。清理方式见 4.3。

### 4.2 同一病根的第二处：`pyodide-lock.json`（内核完全不启动）

修完 `jupyter-lite.json` 后故障并未消失，表现变成「Python 内核握手 超时」，内核指示器停在 `No Kernel`。根因是同一类问题落在另一个文件上：

```
/lite/static/pyodide/pyodide-lock.json
```

它命中 `/lite/static/*` 的 immutable 规则，文件名里却没有内容哈希。`822b40b` 把 Pyodide 从 0.26.x 升到 0.27.7 后，浏览器里同一 URL 的两份内容：

| | `info.version` | 包数 |
| --- | --- | --- |
| 走缓存 | 无此字段（旧 schema） | 359 |
| 强制回源 | `0.27.7` | 351 |

Pyodide 0.27.7 读到旧 lock 文件后 `initializePackageIndex` 抛出 `Lock file version doesn't match Pyodide version`，运行时永不完成初始化，内核根本不启动。

**排查中被证伪的两条线索**，记在这里避免重复投入：

- `Pyodide contents will NOT be synced with Jupyter Contents` 这句警告在**能正常运行代码的无痕窗口里同样出现**，是噪音而非故障信号。顺着它查 Service Worker、`mountDrive`、心跳路径都是无效方向。
- 清 IndexedDB、localStorage、Service Worker、禁用全部浏览器扩展均无效——病根在 HTTP 磁盘缓存这一层，上述操作都够不着。

**已修**：`edgeone.json` 把 pyodide 目录下六个无哈希文件改为 must-revalidate：`pyodide.js`、`pyodide.mjs`、`pyodide.asm.js`、`pyodide.asm.wasm`、`pyodide-lock.json`、`python_stdlib.zip`。`*.whl` 文件名带版本号，升级时文件名会变，仍保持 immutable。

`tests/contracts.test.mjs` 新增回归断言，覆盖全部 12 个「随构建变化且文件名无哈希」的文件，防止这类问题第三次发生。

### 4.3 EdgeOne 规则优先级：**靠后的规则生效**

线上实测得出，与直觉相反，务必记住：

> 多条 `headers` 规则匹配同一路径时，EdgeOne 应用**文件中靠后**的那条。

第一次修复把 pyodide 规则放在 `/lite/static/*` **之前**，部署后完全无效——`pyodide-lock.json` 仍返回 `public, max-age=31536000, immutable`，且值带空格，正是 `/lite/static/*` 那条规则的写法（EdgeOne 自身默认值不带空格，可用这一点区分是谁在生效）。`/lite/jupyter-lite.json*` 之所以一次成功，是因为它本就排在后面。

另一条实测结论：**规则的 `source` 匹配包含查询串**。精确路径 `/lite/config-utils.js` 匹配不到 `/lite/config-utils.js?_=<rev>`，必须写成 `/lite/config-utils.js*`。`service-worker.js` 的真实注册 URL 带 `?enableCache=false`，同样需要通配符。

**清理已中毒浏览器的正确方法**（DevTools 的 Clear site data 不够）：

`Clear site data` 清的是按源隔离的存储（IndexedDB、Cache Storage、localStorage、Service Worker 注册），而 immutable 响应存在**全局 HTTP 磁盘缓存**里，两者是不同的东西。硬刷新也只对本次导航直接加载的资源生效，`pyodide-lock.json` 由 Pyodide 在 Web Worker 里后续请求，不在覆盖范围内。

可行的两种方式：

1. `chrome://settings/clearBrowserData` → 勾选「缓存的图片和文件」（全局，最彻底，已验证有效）。
2. 在站点页面的 Console 里对具体 URL 执行 `fetch(url, { cache: "reload" })`，逐个改写缓存条目（精确，不影响其它网站）。

### 4.4 内核启动超时余量过小

`jupyterlite-extension/src/index.ts` 原先把内核启动与握手超时硬编码为 60 秒。同一条网络上实测就绪耗时在 **30 秒到 56.5 秒**之间浮动，余量只有几秒，网络稍慢就会误报「握手超时」而内核其实仍在正常加载。已改为常量 `KERNEL_BOOT_TIMEOUT_MS = 180000`。

### 4.5 JupyterLite 心跳路径在子路径部署下必然 404

`ServiceWorkerManager._pingServiceWorker` 把路径硬编码为站点根下的 `/api/service-worker-heartbeat`，而本站把 JupyterLite 挂在 `/lite/` 下，service worker 作用域是 `/lite/`，永远拦不到该请求。已新增 `app/api/service-worker-heartbeat/route.ts` 返回纯文本 `ok`。注意：心跳失败只会让存活轮询停止，**不会**置空注册，所以它不是 4.1／4.2 的原因。

### 4.6 Playwright 测试服务器必须有单一所有者并可确认回收

旧的 Playwright `webServer` 探活曾被本机 `HTTP_PROXY` 的 400 响应误判为服务已就绪；改用 managed `webServer` 后，在 Windows 上又出现所有用例已经通过、runner 却因子进程和继承管道未回收而不退出。两者本质上都是测试框架无法可靠证明“当前服务由谁创建、何时已经结束”。

当前由 `tests/e2e/global-setup.mjs` 直接创建并探活测试服务，测试结束时先发送终止信号、等待退出，超过截止时间才强制回收；`scripts/start-built-server.mjs` 也在同一 Node 进程中启动 Next，不再额外套一层 Node 子进程。`CI=true` 时若端口已被占用会直接失败，避免复用旧构建。`NO_PROXY=localhost,127.0.0.1,::1` 仍可保留给其他本地工具，但不再是 Playwright 正确启动服务的前提。

### 4.7 生产冒烟的素材检查在慢网络下必然超时

`tests/production-smoke.test.mjs` 按 4 并发校验 24 份实操素材，单请求超时 30 秒。2026-07-26 实测 24 份素材字节全部一致（size + SHA-256 全对），但 `/labs/2.2.1/finance数据集.csv`（7.78 MB）单独下载耗时 25.6 秒、`/labs/2.1.3/finance数据集.csv`（7.13 MB）16.0 秒，四并发下必然触发超时。失败原因是带宽而非内容。修复方向：对大文件降低并发或提高单请求超时。

### 4.8 `runtime.spec.mjs` 的依赖安装用例在本机必然超时

「task dependencies install without an environment cell in the official notebook」这条用例打开 `/practical/2.1.2/lab` 等「代码区已就绪」，断言给了 240 秒，但**用例自身的超时是 playwright 配置里的 120 秒**，两者矛盾，慢一点就必然死在 120 秒。2026-08-06 核实：对未改动的产物同样失败，与当轮改动无关；同一台机器上用独立探针跑同一道题，环境准备约 40 秒完成，说明失败在页面就绪链路而非依赖安装本身。修复方向：给该用例加 `test.setTimeout()`，或把断言超时降到 120 秒以内。

### 4.9 已修：`/content/*` 题库按 immutable 缓存，文件名却不带内容哈希

与 4.1／4.2 同一个病根，只是发生在题库而不是 JupyterLite 配置上。`next.config.ts` 给 `/content/:path*` 发 `immutable, max-age=31536000`，而文件名只由 `data/entities/meta.json` 的人工版本号拼成（`theory-2026-07-28-v9.json`）。题库页、实操页和两个模拟考页的题目全部是客户端取这三份 JSON 渲染的，所以只要改了题却忘了改版本号，URL 不变，已经取过它的浏览器和 CDN 节点会把旧题库留整整一年——改对的题永远到不了学员，且没有任何外部信号。

`scripts/generate-public-content.mjs` 已改为按内容 SHA-256 前 16 位命名（`theory-<version>.<hash>.json`），并清掉旧哈希的副本；URL 统一由生成的 `data/content-assets.json` 经 `lib/content-assets.ts` 提供，页面和加载器不再自己拼文件名。改题即换 URL，不依赖任何人记得改版本号。`content.version` 语义不变，仍然只用于草稿与考试快照的失效判断，因此这次修复不会作废学员已写的内容。

### 4.10 已修：`ali.` 新链路上页面被 CDN 缓存一年

2026-08-14 实测 `https://ali.aitrainer3.xyz/`：`cache-control: s-maxage=31536000`、`age: 114379`、`eo-cache-status: HIT`。这个头是 Next.js 给预渲染页面发的，而 `deploy/nginx/aitrainer.conf` 的 `map` 对页面路径取 `default ""`——Nginx 什么都不加，Next 的 `s-maxage` 就原样透给了 EdgeOne，页面因此可以在边缘留最多一年，改了首页也同步不到用户。

与 4.1／4.2／4.9 同一病根的第四次，但这次是新架构带来的：EdgeOne 从 Pages（会把页面重写成 `max-age=0, must-revalidate`）变成纯 CDN 之后，**响应头就是缓存策略本身**，源站不写就等于放任。已把 `default` 改为 `public, max-age=0, must-revalidate`，`/api/*` 单列为 `no-store`（响应按 Cookie 区分用户，CDN 只按 URL 建缓存键），并在 `location /` 增加 `proxy_hide_header Cache-Control` —— 不隐藏的话 Nginx 加的指令只会与 Next 的并列成逗号列表，共享缓存仍然认 `s-maxage`。带内容哈希的路径继续 immutable。

已在容器里用真实 Nginx 加一个冒充 Next 的上游逐路径验证：页面与 `/labs/`、`/materials/` 重校验且 `s-maxage` 不再残留、ETag 保留（重校验实测 304）、`/api/*` 为 `no-store`、`/_next/static/` 与 `/content/` 仍为 immutable。**这份配置不在发布流水线里，需手工同步到服务器并 reload。**

### 4.11 已修：3.2.3 的官方 `Image.ANTIALIAS` 在 Pillow 10 上必然报错

3.2.3 的官方考题写着 `img.resize((64, 64), Image.ANTIALIAS)`。`ANTIALIAS` 在 Pillow 9.1 弃用、10.0 删除，而站点自带的 Pyodide 0.27.7 提供 Pillow 10.2.0，官方代码原样运行必然 `AttributeError`。

降版本这条路不存在：Pillow 是 C 扩展，PyPI 上没有任何 wasm32/emscripten wheel，`piplite` 装不了 9.x；带 Pillow 9 的只有 Pyodide 0.23.x（Python 3.11.2、旧 repodata 格式），0.24 起已经是 Pillow 10。为一个别名把整套 wheel 和 ONNX 运行时退回去不成立。

因此按字体路径映射的同一套办法处理：题目一个字不改，`kernelEnvironmentSource` 在题目 import 了 `PIL` 时于准备阶段补回 `Image.ANTIALIAS = Image.Resampling.LANCZOS`。`ANTIALIAS` 本来就只是 `LANCZOS` 的兼容别名，重采样结果不变。`tests/e2e/pillow-antialias.spec.mjs` 在真实内核里跑那一行官方代码，contracts 另有一条守住「题目源码没有被改写」。

### 4.12 已修：CDN 挡在前面后，全站限流塌缩成「一个节点一个桶」

2026-08-14 实测：真实出口 `183.195.11.71` 经 CDN 到达时，Nginx 记录的 `$remote_addr` 是 `223.109.0.243`（EdgeOne 节点），真实地址在 `EO-Connecting-IP` 里。而 `proxy_set_header X-Real-IP $remote_addr` 是应用唯一信任的来源（systemd 里 `TRUSTED_CLIENT_IP_HEADER=x-real-ip`），于是同一节点后面的所有用户被当成同一个人。按 `lib/auth-throttle.ts` 的策略，`login:ip` 是 20 次/15 分钟、`register:ip` 是 5 次/小时——正式放量当天，正常用户会互相把对方锁死，不需要有人攻击。

`lib/auth-throttle.ts:50` 的注释假设「EdgeOne 部署」和「自托管部署」二选一，而新架构是两者同时成立，这个组合不在原设计里。

改用 Nginx `realip` 模块——只有对端本身落在 `deploy/nginx/aitrainer-edgeone-origin.conf` 的可信集合里时才改写 `$remote_addr`。可信集合是唯一的旋钮，收紧或放宽都只改那一个文件，应用代码不参与。

**2026-08-15 决策：可信集合取全网信任（`0.0.0.0/0`）。** 免费版 EdgeOne 控制台不提供「源站防护 / 回源 IP 网段」，官方 `api.edgeone.ai/ips` 已于 2026-07 下线（现在恰好返回 `0.0.0.0/0`）。手里只有实测到的两个节点，远不是全部；拿这份残缺清单去收紧，绝大多数节点后面的用户仍然共用一个桶——正是要修的那个毛病。所以先保证「所有用户的 IP 都是准的」，伪造留给不依赖 IP 的那道兜底。

代价是明确的，实测直连源站伪造 `EO-Connecting-IP: 9.9.9.9` 能成功、源站目前也确实可直连（见 6.1）：`register:ip` 5 次/小时**失效**（灌注册没有别的闸门，最大敞口）；`login:ip` 20 次/15 分钟**失效**（它同时是 PBKDF2 的 CPU 上界，登录接口对不存在的账号也走等时路径）。仍然有效的是 `login:email` 失败 10 次/15 分钟——它不依赖 IP，现在是撞库的唯一闸门，contracts 有一条守住「账号不存在时也要计数」。

收紧回去两条路，都不用改应用代码：升级套餐拿到网段清单换掉那两行；或者堵住直连——安全组只放行回源网段 + 管理 IP，做到之后全网信任本身就不再有代价，因为唯一可能的对端只剩 EdgeOne，同时解掉 6.1 里「源站可直连」那一条。

2026-08-15 线上实测：经 CDN → `183.195.11.71 via=223.109.0.243`（还原成功）；直连伪造 → `9.9.9.9 via=183.195.11.71`（伪造生效，符合预期）。收紧到实测两节点时测过同一条伪造 → `183.195.11.71 via=183.195.11.71`（被丢弃），说明判定链本身是通的，改回去随时生效。应用侧始终只看得到 Nginx 判定过的 `X-Real-IP`，原始头继续清空。

**伪造挡不住，但看得见。** `$realip_remote_addr` 始终是真实 TCP 对端，`realip` 改不掉它，日志两列都记。经 CDN 的请求 `via=` 是 EdgeOne 节点，直连的不是，所以绕过 CDN 的来源可以直接列出来并按 `via=` 封禁：`awk '$2 ~ /^via=/ {print substr($2,5)}' … | sort | uniq -c | sort -rn`。这是全网信任期间的补偿手段——事后可查，不是事前拦截。

### 4.13 已修：基础设施配置靠手工同步，已经漂了一份

2026-08-14 逐字节比对服务器与仓库：`nginx/aitrainer.conf` 一致、`systemd/aitrainer.service` 一致，但 `/usr/local/sbin/deploy-aitrainer` 是旧版，**缺了发布物结构校验和整段数据库迁移门禁**（`db:migrate` + `db:check`）。而 `SELF-HOSTING.md` 一直声称「发布脚本在切换版本前执行带 advisory lock 的迁移与校验」——文档描述的安全网并不存在。

失败模式是响的不是哑的：`/api/health/ready` 在 schema 不匹配时返回 503，发布脚本探测 60 秒后自动回滚。所以真实后果是「等你加了 `0003` 迁移，发布开始莫名失败并回滚，现场没有线索指向迁移没跑」。当前 schema `0002_condemned_klaw` 正确，是 8-12 手工 baseline 的结果，不是流水线保证的。

根因是 `deploy/` 不在 artifact 里：`package-self-hosted.mjs` 只打包应用代码，`deploy-self-hosted.yml` 虽然 checkout 了仓库但只取 `deploy/ssh/known_hosts`。手工同步的东西一定会漂，只是时间问题。已把 `deploy/` 打进 artifact，由 `deploy-release.sh` 在发布过程中按需应用：unit 在重启前（失败随发布一起回滚）、Nginx 在健康检查后（`nginx -t` 不过就还原并 `exit 13`）、脚本自更新放最后（本次仍用启动时那一份）。早于这次改动的发布物没有 `deploy/`，回滚到它们时跳过并记日志，不会失败。

首次启用需手工装一次 `deploy-aitrainer`（已完成，2026-08-14），之后靠自更新维持。

### 4.14 已修：迁移门禁第一次真跑就断在 `node: command not found`

PR #9 合并后 Quality Gate 通过，部署失败：

```text
/usr/local/sbin/deploy-aitrainer: line 141: node: command not found
Error: Process completed with exit code 127
```

根因是 sudo，不是 node 没装。脚本经 `sudo /usr/local/sbin/deploy-aitrainer` 执行，sudo 用 `secure_path` 覆盖 PATH（`/etc/sudoers` 里是 `/sbin:/bin:/usr/sbin:/usr/bin`），而 node 装在 `/usr/local/bin -> /opt/node/bin`。systemd unit 写的是绝对路径 `ExecStart=/opt/node/bin/node`，所以应用一直正常——只有 4.13 新加的这条迁移命令踩到，而它此前从不存在，等于这个洞一直被 4.13 那个 bug 盖着。

解释器改成从 systemd unit 的 `ExecStart` 解析：迁移和运行时必须是同一个 Node，而 unit 本来就是「这个应用用哪个 node」的唯一权威，不必再引入一份配置。优先读本次发布物自带的 unit，其次已装的，最后才退回 PATH；一个都拿不到就 `exit 14` 并说明是 `secure_path` 的问题。服务器上复刻失败环境验证：`env -i PATH=/sbin:/bin:/usr/sbin:/usr/bin` 下 `resolve_node` 得到 `/opt/node/bin/node`（v22.23.2），裸 `node` 仍然 not found。脚本用到的其余 27 个外部命令在同一环境下逐个查过，全部可解析，node 是唯一缺口。

**站点未受影响**：失败发生在切换 symlink 之前，`current` 仍指向上一版，`/api/health/ready` 返回 ready。代价是 `main` 的新代码没能上线。

**教训**：容器彩排把 `node` 换成桩并放进 PATH，恰好绕开了这个洞。用桩验证控制流是有效的，但桩会连带把「这个命令能不能找到」一并假设成真——凡是被替换掉的东西，它的存在性就不再被这次彩排覆盖。

### 4.15 已修：迁移脚本的依赖不在 artifact 里

4.14 修完，node 找到了（v22.23.2），同一步紧接着换了个错法：

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'postgres'
  imported from /srv/aitrainer/releases/<sha>/scripts/manage-database.mjs
```

`scripts/manage-database.mjs` **不经过 webpack**：它以源码形式随 artifact 下发，由 `deploy-release.sh` 直接执行。而 `.next/standalone` 的 `node_modules` 只包含 Next 文件追踪的结果——应用里用到的 `postgres` 早被打进 `.next/server` 的 chunk，不会以包的形式留下来。实测发布物顶层 `node_modules` 共 52 个包，没有 `postgres`，也没有 `drizzle-orm`；当前在跑的旧版同样没有，只是它从来不需要。

已让 `package-self-hosted.mjs` 显式打包迁移脚本的第三方依赖到 `scripts/node_modules/`（不放根 `node_modules`：那是 Next trace 出来的，混入手工内容就分不清哪些是自动的），并按 npm 扁平布局带上传递依赖——`postgres@3.4.7` 零依赖，当前只有一个包、357K。

**校验必须是「解析结果落在 artifact 内」，不能是「能不能 import 到」**：本仓库的 `node_modules` 是 `dist/` 的祖先目录，只判断能否 import 的话，一个字节都没拷进去也照样通过，等于没验。打包脚本因此断言 `require.resolve` 的结果以 `outputRoot` 开头。

**端到端验证**（不再只靠桩和本地）：把打包出的依赖布局送到服务器，用真实 `/etc/aitrainer/aitrainer.env`、真实 Supabase、以及复刻的 `env -i PATH=/sbin:/bin:/usr/sbin:/usr/bin`，跑真正的 `manage-database.mjs check` —— 输出 `Schema is current at 0002_condemned_klaw`，退出码 0。另在仓库之外的隔离目录做了正反对照：带依赖能 import，删掉依赖复现线上同一条 `ERR_MODULE_NOT_FOUND`。

**教训**：4.14 和 4.15 是同一个盲点的两次发作——「这段代码在服务器上真的能跑起来吗」这件事，此前从来没有被任何环节验证过，本地构建、契约测试和容器彩排各自都只覆盖了它的一部分。修完这两条之后，打包阶段会自证依赖完整，契约测试会守住依赖必须在 `dependencies` 里。

> 附带记录一次操作失误：4.14 的文档提交写在 push 之后，因此 PR #10 只带走了代码修复，这段说明留在了本地。已随本次一并补上。

## 5. 2026-07-26 全量自检结果

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| `npm run content:validate` | 通过（900 理论题 / 40 实操题 / 20 Notebook） |
| `npm run test:contracts` | 35/35 通过 |
| `npm run test:build` | 通过，16 条路由 |
| `npm run test:browser` | 15/15 通过 |
| `npm run test:smoke` | 2/4；一项来自已回退的别名断言，另一项见 4.7 节 |
| 线上 24 份实操素材 | size 与 SHA-256 全部一致 |
| 线上公开路由与运行时字节 | 通过 |
| 本地生产构建实测 Lab | 内核空闲，隐藏准备单元输出「环境已就绪」 |

`npm run test:browser` 的 15/15 需要先设置 `NO_PROXY`，原因见 4.6。

## 5.1 部署前置条件：迁移门禁已自动化

`auth_throttle` 表是注册与登录限流的存储。应用运行时**不执行 DDL**，表不存在时两个接口都会直接返回 503——也就是说，代码先于 migration 上线会让账号体系整体不可用。顺序必须是：先建表，再部署。

2026-08-12 已逐项验证生产 schema 并在 `drizzle.__drizzle_migrations` 建立 `0000`—`0002` 基线。自托管发布会在切换应用版本前持 PostgreSQL advisory lock 执行 `db:migrate` 与 `db:check`；应用 readiness 同时验证所需 migration hash。新增结构必须遵守 `DATABASE-MIGRATIONS.md` 的 expand/contract 流程，不再手工执行未登记 SQL。

## 6. 下一步

1. 为 `codex/remove-pyodide-sync-deadlock` 创建修复 PR，等待该 PR 的 GitHub Quality Gate 验证上述根因推断。不要直接推送 `main`，也不要把 PR run 当作部署信号。
2. ~~确认 4.3 的规则顺序修正是否生效~~ **已闭环**（2026-07-28 线上实测）。`pyodide-lock.json`、`jupyter-lite.json`、`config-utils.js`、`service-worker.js` 四个文件均返回 `public, max-age=0, must-revalidate`。EdgeOne 的「靠后规则生效」结论成立，缓存毒化的根因已消除。
3. 视情况调整 4.7 的冒烟并发与超时。修好之前 `npm run test:smoke` 会一直停在 2/4，没法当上线后的健康检查用。
4. 按 `TESTING.md` 执行正式站验收；重点人工确认任意 CSV Lab 显示「环境已就绪」、`1.1.2` 的 `sensor_data.csv` 不再校验失败、3.2.x 的 ONNX 题可下载模型并推理。**3.2.x 这条路径至今完全未在生产环境验证过**，是 20 个 lab 里最重的一条链路。
5. 老用户仍需按 4.3 清一次全局 HTTP 缓存；这是一次性的，之后新响应头会自动接管。**2026-08-06 补充**：这条对 `/drive` 挂载已不再必要——恢复 service worker 后，挂载不再依赖跨源隔离，缓存里存着旧响应头的设备也能正常保存文件（已由一台原本受影响的设备确认）。对 4.1 那批按 `immutable` 缓存的文件仍然适用。
6. ~~给 `/drive` 挂载失败加上运行时自检与用户可见提示。~~ **当前分支已实现并由浏览器回归验证**：内核创建前验证 Service Worker 接管，环境准备第一条 Python 语句校验 `/drive` 与 cwd；失败会进入扩展 `error` 状态并显示给用户。
7. 数据库三项待办，按性价比排序，详见第 8 节：`/api/theory/state` 去冗余字段并加 ETag（8.3）；`sessions` 照抄 `sweepThrottle` 加过期清理（8.2）；`theory_attempts` 只保留每人最近 N 次（8.2）。第四项（email 换 `user_id`，8.4）判断为暂不做。

## 6.1 正式发布前仍未处理

| 事项 | 状态 |
| --- | --- |
| 轮换数据库密码（曾出现在历史会话记录中） | 未做，建议发布前完成 |
| 清理生产库测试数据（`users` 13 行、`sessions` 20 行） | 未做，删除不可逆，需人工确认范围 |
| `SITE_CONTACT_EMAIL`（`lib/site.ts`）目前是 `contact@aitrainer3.xyz` | 信箱必须真的收得到信——隐私政策承诺「发邮件可导出/删除账号」，服务条款承诺「侵权可联系处理」 |
| `reference/`（官方答案扫描件）是否入库 | 未决定，当前未提交 |
| 题库来源与二次发布授权 | 法律面问题，需自行确认 |
| 错误监控 / 分析 | 无。线上出问题时没有任何服务端信号 |
| `app/blueprint/` 空目录 | 删除还是补全，未决定 |
| **`register:ip` / `login:ip` 目前可被绕过** | 免费版拿不到回源网段，realip 取全网信任（2026-08-15 决策，见 4.12）。直连源站的人可自造 IP：灌注册无闸门、PBKDF2 无 CPU 上界。撞库仍由 `login:email` 挡住。解法与下一条相同——堵住直连即可，不需要网段清单 |
| **源站可直连、可绕过 CDN** | `curl http://39.96.7.2/` 直接返回完整站点；`firewalld` inactive、iptables 全 ACCEPT。且回源全程明文 HTTP（Nginx 只 `listen 80`）。修法：安全组只放行 EdgeOne 回源网段 + 管理 IP，回源改 HTTPS。**这条现在同时是上一条的解法，优先级随之上升** |
| **宝塔面板监听 `0.0.0.0:8888`** | root 权限的 Python 面板，外网可达，仓库与文档零提及。它抵消了这套部署链路全部的最小权限设计（deploy 用户不能登 shell、sudo 只有一条命令、非特权解包）|
| `releases/` 无清理 | 9 份 × 约 280MB = 2.5G，`deploy-release.sh` 从不删旧版本。40G 磁盘用了 27%，按当前节奏还能撑约 100 次发布。另有 `releases/1aee62c/`（8-02 手工造的孤儿，目录名不是 40 位 SHA、`DEPLOYMENT.txt` 无 `Source revision` 行）|
| 迁移命令以 root 运行发布物里的 JS | `deploy-release.sh` 的 `node scripts/manage-database.mjs` 在 root 下执行 release 自带代码。解包已经降权到 `aitrainer`，这一步没有 |

## 7. ONNX 模型

量化模型已生效：`public/labs/manifest.json` 中 `sourceVariant` 为 `browser-quantized`，五个模型以内容哈希分片形式存放在 `public/labs/models/<hash>/part-NNN.bin`，合计 46 MB（`resnet` 25 MB、`emotion-ferplus` 21 MB、`version-RFB-320` 488 KB、`mnist` 20 KB）。这些路径带内容哈希，适用 `edgeone.json` 中的一年 immutable 缓存。量化源文件保留在被 Git 忽略的 `work/browser-models/quantized`，原始大模型拆分产物不提交。

## 8. 数据库：容量与已知风险

2026-08-06 就「理论题进度表一个人 900 行会不会成为瓶颈」做的完整核查，结论与四项风险记录如下。

### 8.1 900 行/人不是瓶颈，因为它有上限

`theory_progress` 的主键是 `(email, question_id)`，写入走 upsert（`app/api/theory/answer/route.ts`），同一题重复作答只更新不新增；`question_id` 来自固定题库（judge / single / multi 各 300，共 900）。**900 是每人的硬上限，不是增长曲线上的一个点。**

查询侧同样不构成压力：`where email = ?` 命中主键前缀，且同一用户的行是批量写入的、物理相邻，冷缓存十几个页面 I/O，热缓存 1–2 ms。

生产库实测（2026-08-06，35 个用户 / 2943 行）：堆 320 kB、索引 248 kB，即**每行连索引合计约 193 字节**；单人查询计划为 `Index Scan using theory_progress_email_question_id_pk`。据此外推每人答满 900 题约占 174 kB：

| 用户数 | `theory_progress` 占用 |
| --- | --- |
| 1,000 | ~174 MB |
| 10,000 | ~1.7 GB |
| 100,000 | ~17 GB |

**唯一要盯的是 Supabase 存储配额，不是性能**：免费档 0.5 GB 在 3000 用户左右会被这张表单独撑满。

### 8.2 真正无上限增长的是另外三张表

| 表 | 增长方式 | 现有清理 |
| --- | --- | --- |
| `theory_attempts` | 每次模拟考 1 行，`answers_json` 装 190 题答案 ≈ 3 KB | 无 |
| `practical_attempts` | 每次实操评分 1 行，含 `rubric_json` | 仅用户手动重置 |
| `sessions` | 每次登录 1 行 | 仅显式登出时删（`lib/account-auth.ts`） |

一个刷 200 次模拟考的用户在 `theory_attempts` 里占 600 KB，是他全部 900 行进度的 3.5 倍。`sessions` 表上有 `sessions_expires_at_idx`，但**没有任何代码用它做清理**——`auth_throttle` 反而有 `sweepThrottle()`（`lib/auth-throttle.ts`，2% 概率顺手清过期行），把同样的手法照搬到 `sessions` 即可。生产库现状印证了这一点：35 个用户对应 46 行 `sessions`，只增不减。

### 8.3 `/api/theory/state` 全量返回，且同一份数据发了三遍

`app/api/theory/state/route.ts` 把 900 行拆成 `answeredIds`、`wrongIds`、`progress` 三个字段返回，每个 `question_id` 在 JSON 里最多出现三次；而前两个字段完全能从 `progress` 推出来。客户端随后要 `JSON.parse` 900 项并建三个 900 键对象（`components/TheoryPractice.tsx`）。

去掉冗余字段可立刻减半；进一步可用 `count(*)` + `max(updated_at)` 拼 ETag 支持 304，让重复进入题库页接近零成本。**未做。**

### 8.4 Schema 层面：email 当外键、`content_version` 逐行存

`content_version` 当前是 `2026-07-28-v9`（14 字节），在 `theory_progress` 里每人存 900 份完全相同的值，且**没有任何查询读它**——只写不读。`email`（约 21 字节）同理，堆里 900 份、主键索引里再 900 份。

换成 `user_id integer` 能省下约 35% 的堆和 50% 的索引，但要改 7 张表的外键，是一次全库迁移。**判断：现在不做**，等真的贴近存储配额时再连同 `content_version` 提到 user 级别一起处理。

### 8.5 已修：request-facing 的数据库操作全部套上 deadline

2026-08-06 前只有 `account.session.lookup` 和 `theory.answer.upsert` 走 `withDbDeadline`，其余全是裸 `getDb()`。配合 `max: 1` 的连接池，任何一个卡住的查询会把该函数实例后续所有请求堵到 EdgeOne 的 30 秒上限——正是 `0232686` 修过的那个雪崩，只是换了个入口。已全部补齐。

**同时修掉了 `0232686` 里一个一直没生效的分支**：Drizzle 会把驱动错误重新包一层再抛，外层是 `Error: Failed query: INSERT INTO ...`，既没有 `code`、消息里也只有 SQL，真正的 `CONNECT_TIMEOUT` 挂在 `cause` 上。而 `isConnectionFailure` 只看最外层，所以**除了 8 秒 deadline 那条路径，任何真实的连接故障都没能触发「退掉这条坏连接」**。现在改为顺着 `cause` 链找（带深度上限和去重，`cause` 允许成环）。这条只在实测里暴露出来：不看真实错误对象，光读代码看不出来。

> 契约测试钉的是不变量本身——`app/api/**/route.ts` 与 `lib/progress-data.ts`、`lib/account-auth.ts` 里不许再出现裸 `getDb()`。逐个文件写正则漏一个就是一次线上事故。

细节见 `IMPROVEMENTS.md` 同日条目。

## 9. JupyterLite 的几条硬约束（改动前必读）

这几条都是踩过坑换来的，破坏其中任何一条都会造成静默的数据丢失或全站级故障。

**不要再把 `@jupyterlite/application-extension:service-worker-manager` 加进 `disabledExtensions`。** 上游判定是 `mountDrive = serviceWorkerManager?.enabled || crossOriginIsolated`（`@jupyterlite/pyodide-kernel-extension` 0.6.1，与上游 wheel 逐字节一致，改不了）。禁用它等于把这个 OR 砍成只剩跨源隔离一项，而跨源隔离由 COOP/COEP 响应头承载、随响应进浏览器缓存，**部署到不了已经缓存旧头的设备**。挂载失败时学员的 `to_csv` 产物会落进内存文件系统：文件浏览器看不到、刷新即失，而题目因为有素材兜底仍然照常能跑，所以完全没有外部信号。该 SW 的 HTTP 缓存默认是关的（注册 URL 带 `?enableCache=false`），不会造成 4.1 那类缓存毒化。

**不要为 Lab 恢复 COOP/COEP 或 iframe 的 `cross-origin-isolated` 权限。** 在当前 Pyodide Kernel 0.6.1 中，跨源隔离会把内核切回 `SharedArrayBuffer`/`Atomics` 的同步 worker；这正是本轮永久等待的高风险执行路径。这条约束已经被违反过一次：`deploy/nginx/aitrainer.conf` 从 `1aee62c` 一直带着这两个头，直到 2026-08-15 迁移当天才挡在用户前面（详见第 3 节）。**头配置有三份**——`edgeone.json`、`next.config.ts`、`deploy/nginx/aitrainer.conf`——改任何一份都要同步另外两份；`tests/contracts.test.mjs` 现在会断言三份都不含这两个头。`/drive` 必须只依赖 JupyterLite Service Worker。冷启动前要等待注入的 `IServiceWorkerManager.ready` 且确认 `enabled`，不能只看 `navigator.serviceWorker.controller` 后猜测 JupyterLite 已更新内部注册状态。

**`.csv` 在 `fileTypes` 里是 `fileFormat: "base64"`，这是刻意的。** drive 的 `get()` 忽略 `options.format`，只能按扩展名定格式；改回 `text` 会让 2.1.4 那份 GBK 数据集在读写两个方向都被 UTF-8 解码销毁。显示端的解码在 `jupyterlite-extension/src/csvViewer.ts`，**只改 `fromString`，不要动 `toString`**——`CSVViewer._updateGrid` 正是从 `toString()` 取数据喂 DataGrid，在那里还原成字节会让表格重新变回乱码。

**准备阶段的产物活在内核进程里，不在面板上。** piplite 装的纯 Python wheel、warning policy、预热 import、素材和 ONNX 垫片都随 worker 更换而消失。因此 `prepareEnvironment` 不仅要在 `sessionContext.statusChanged` 的 `restarting`/`autorestarting` 上清账，还必须按真实 `kernelId` 识别用户切换或其他 replacement，并为新 generation 完整重跑。`tests/e2e/kernel-restart.spec.mjs` 同时钉住冷启动、重启和 replacement。

**`ready` 必须代表同一代内核真正完成了一条后继命令。** `idle + connected` 只描述 Jupyter 消息层的状态，不证明 worker 的下一条 execute 会返回。只有当前 `generation` 和 `kernelId` 未变化、环境准备完成、内核恢复 `idle + connected`，并且随后一条新的有界命令也成功完成时才能发布 `ready`。冷启动前由 bridge 完成 Service Worker 与 kernelspec preflight，冷启动本身只由 `DocumentContext`／`SessionContext.initialize()` 拥有；`autoStartDefaultKernel` 必须保持 `true`，不得恢复 bridge 的 `changeKernel()` fallback、固定 grace period 或任何第二启动者。所有程序化内核请求必须经过统一的有界执行函数，超时后不得向可能仍占有 worker 的内核盲目重发。

**官方考题代码一个字都不能改，版本不兼容一律在准备阶段解决。** 已经有三处：2.1.4 的 Windows 字体路径、3.2.5 的 `\_` docstring、3.2.3 的 `Image.ANTIALIAS`（见 4.11）。判断顺序是先看能不能换库版本，换不了才写垫片；垫片必须只还原被删掉的旧行为，不得改变题目的计算结果，并且要有一条在真实内核里跑官方代码的用例。

**扩展改动的发布流程**：`npm run jupyterlite:extension` 构建 → 把 `jupyterlite-extension/labextension/` 同步到 `public/lite/extensions/ai-trainer-jupyterlite/` → 更新 `public/lite/jupyter-lite.json` 里 `federated_extensions` 的 `remoteEntry.*.js` 哈希。每次构建哈希都会变，漏掉最后一步等于没发布。
