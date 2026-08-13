# 项目当前状态

更新时间：2026-08-13。本文取代原 `SESSION-HANDOFF.md`，用于把项目移交给其他会话或协作者。只记录**当前**事实与待办；历史改进见 `IMPROVEMENTS.md`。

## 1. 坐标

| 项目 | 值 |
| --- | --- |
| 正式站 | https://www.aitrainer3.xyz/ |
| 本地目录 | `C:\Users\zd\Documents\aitrainer3\edgeone-site` |
| 当前工作分支 | `codex/fix-main-quality-gate` |
| 已验证代码基线 | 基于 `main` 合并提交 `cd15cc8` 的当前修复工作树；验证证据见第 3 节 |
| PR 状态 | PR #4 已合并；当前分支用于提交 main Quality Gate 修复 |
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

安全依赖升级、PR Quality Gate、verified-artifact 自托管发布和数据库 migration 加固已随 PR #3 进入远端 `main`。PR #4 的 JupyterLite 门禁稳定性与耗时改动也已合并；PR Quality Gate 只验证提交，不部署生产环境。

**已验证（2026-08-13）**：

- PR #4 的提交 `143497f` 已通过 GitHub Actions `Quality gate` run #45（run `31686669348`）：job 总耗时 6 分 20 秒，其中完整门禁 5 分 20 秒。PR 事件中的自托管打包、release archive 和 artifact 上传均按条件跳过，因此这次成功**不代表已经部署**。
- PR #4 合并后的 `main` 提交 `cd15cc8` 在 run #46（run `31701288960`）失败：24/25 通过，`kernel-restart.spec.mjs` 两次都在真正执行 restart 前卡住。首次执行时扩展已为 `ready`、内核为 `busy/connected`，但 30 秒内没有 execute reply；retry 一直停在 `preparing_environment`，240 秒超时。自托管打包和 artifact 上传因此跳过，部署工作流未被触发。
- `143497f` 与合并提交 `cd15cc8` 的代码树相同，排除 merge 过程改变文件内容。
- 当前修复工作树已完成 JupyterLite 扩展和完整站点构建；合同测试 50/50；生命周期用例连续 10/10 首次通过；`CI=true npm run test:ci` 中快速门禁 50/50、生产构建和 Playwright 24/24 首次通过，无 retry、无 flaky，总耗时约 97.5 秒；按 main 工作流设置 `SELF_HOSTED_BUILD=1` 后，standalone 构建和 `package:self-hosted` 也已通过。

**强推断，仍待 GitHub CI 验证**：`pyodide_kernel 0.6.1` 会在执行前扫描静态 import，而原环境准备代码在同一请求中既调用 `piplite.install("openpyxl")`，又静态 `import openpyxl`；完整套件还连续启动两个内容相同的重型 Pyodide worker。两者耦合后，在受限 runner 上更容易表现为内核命令通道不返回。当前修复将 piplite 管理的包改为安装完成后动态导入，并把冷启动与重启合并为同一 worker 的生命周期测试，避免无额外覆盖价值的重复 WASM 与科学计算包加载。GitHub 修复 PR 的门禁结果是最终判据；在此之前不把该推断写成已确认根因。

**当前决策**：暂不增加 `main` 的硬分支保护。Quality Gate 已能在 PR 合并前运行，但在 required check 落地前仍依赖人工保证只合并门禁已通过且 head SHA 未变化的 PR。EdgeOne 继续独立监听 `main`。

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

### 4.6 本机 `HTTP_PROXY` 会让 Playwright 跳过启动本地服务

`HTTP_PROXY=http://127.0.0.1:17890` 在 Machine 作用域生效。Playwright 的 webServer 探活请求 `GET http://127.0.0.1:3210/` 经代理返回 **400**，它把“收到任何 HTTP 响应”判定为服务器已就绪，于是不再启动 `next start`；随后 Chromium 直连 localhost 无人监听，15 项浏览器测试全部 `ERR_CONNECTION_REFUSED`。

已在 User 作用域设置 `NO_PROXY=localhost,127.0.0.1,::1`，设置后 `npm run test:browser` 正常拉起服务（`[WebServer] ✓ Ready in 180ms`）。若要与 `HTTP_PROXY` 同作用域，需用管理员权限执行：

```powershell
[Environment]::SetEnvironmentVariable("NO_PROXY", "localhost,127.0.0.1,::1", "Machine")
```

### 4.7 生产冒烟的素材检查在慢网络下必然超时

`tests/production-smoke.test.mjs` 按 4 并发校验 24 份实操素材，单请求超时 30 秒。2026-07-26 实测 24 份素材字节全部一致（size + SHA-256 全对），但 `/labs/2.2.1/finance数据集.csv`（7.78 MB）单独下载耗时 25.6 秒、`/labs/2.1.3/finance数据集.csv`（7.13 MB）16.0 秒，四并发下必然触发超时。失败原因是带宽而非内容。修复方向：对大文件降低并发或提高单请求超时。

### 4.8 `runtime.spec.mjs` 的依赖安装用例在本机必然超时

「task dependencies install without an environment cell in the official notebook」这条用例打开 `/practical/2.1.2/lab` 等「代码区已就绪」，断言给了 240 秒，但**用例自身的超时是 playwright 配置里的 120 秒**，两者矛盾，慢一点就必然死在 120 秒。2026-08-06 核实：对未改动的产物同样失败，与当轮改动无关；同一台机器上用独立探针跑同一道题，环境准备约 40 秒完成，说明失败在页面就绪链路而非依赖安装本身。修复方向：给该用例加 `test.setTimeout()`，或把断言超时降到 120 秒以内。

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

1. 为 `codex/fix-main-quality-gate` 创建修复 PR（若尚未创建），等待该 PR 的 GitHub Quality Gate 验证上述根因推断。不要直接推送 `main`，也不要把 PR run 当作部署信号。
2. ~~确认 4.3 的规则顺序修正是否生效~~ **已闭环**（2026-07-28 线上实测）。`pyodide-lock.json`、`jupyter-lite.json`、`config-utils.js`、`service-worker.js` 四个文件均返回 `public, max-age=0, must-revalidate`。EdgeOne 的「靠后规则生效」结论成立，缓存毒化的根因已消除。
3. 视情况调整 4.7 的冒烟并发与超时。修好之前 `npm run test:smoke` 会一直停在 2/4，没法当上线后的健康检查用。
4. 按 `TESTING.md` 执行正式站验收；重点人工确认任意 CSV Lab 显示「环境已就绪」、`1.1.2` 的 `sensor_data.csv` 不再校验失败、3.2.x 的 ONNX 题可下载模型并推理。**3.2.x 这条路径至今完全未在生产环境验证过**，是 20 个 lab 里最重的一条链路。
5. 老用户仍需按 4.3 清一次全局 HTTP 缓存；这是一次性的，之后新响应头会自动接管。**2026-08-06 补充**：这条对 `/drive` 挂载已不再必要——恢复 service worker 后，挂载不再依赖跨源隔离，缓存里存着旧响应头的设备也能正常保存文件（已由一台原本受影响的设备确认）。对 4.1 那批按 `immutable` 缓存的文件仍然适用。
6. 给 `/drive` 挂载失败加上运行时自检与用户可见提示。目前失败是静默的：`mountDrive` 为假时只有控制台一行 `console.warn`，而素材兜底会让题目照常能跑，学员直到刷新才发现产物没了。没有这个信号，下一次故障仍然只能靠投诉发现。详见 `IMPROVEMENTS.md` 2026-08-06 条的「未闭环」。
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

**`.csv` 在 `fileTypes` 里是 `fileFormat: "base64"`，这是刻意的。** drive 的 `get()` 忽略 `options.format`，只能按扩展名定格式；改回 `text` 会让 2.1.4 那份 GBK 数据集在读写两个方向都被 UTF-8 解码销毁。显示端的解码在 `jupyterlite-extension/src/csvViewer.ts`，**只改 `fromString`，不要动 `toString`**——`CSVViewer._updateGrid` 正是从 `toString()` 取数据喂 DataGrid，在那里还原成字节会让表格重新变回乱码。

**准备阶段的产物活在内核进程里，不在面板上。** piplite 装的纯 Python wheel、`FutureWarning` 屏蔽、预热 import、ONNX 运行时单元都随内核重启消失，因此 `prepareEnvironment` 必须在 `sessionContext.statusChanged` 的 `restarting`/`autorestarting` 上清账并重跑。`tests/e2e/kernel-restart.spec.mjs` 钉住了这个行为。

**`ready` 必须代表同一代内核真正可接受下一条命令。** 环境准备单元收到 `execute_reply` 时，内核最后一条 `idle` 状态消息可能尚未到达；此时过早发布 `ready`，紧跟的探针会与 worker 竞态并永久挂起。只有当前 `generation` 和 `kernelId` 未变化、环境准备完成，且内核同时为 `status=idle`、`connectionStatus=connected` 时才能发布 `ready`。冷启动只由 `SessionContext.initialize()` 负责，不要恢复固定 grace period 或第二个启动者；所有 `future.done` 探针必须设置独立截止时间并在失败时输出内核与运行时状态。

**扩展改动的发布流程**：`npm run jupyterlite:extension` 构建 → 把 `jupyterlite-extension/labextension/` 同步到 `public/lite/extensions/ai-trainer-jupyterlite/` → 更新 `public/lite/jupyter-lite.json` 里 `federated_extensions` 的 `remoteEntry.*.js` 哈希。每次构建哈希都会变，漏掉最后一步等于没发布。
