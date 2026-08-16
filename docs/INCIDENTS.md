# 故障档案

本文件回答一个问题：**这个现象以前查过吗，结论是什么。**

每条记录症状、根因和判据。价值不在「已修」两个字，而在于**不必再查一遍**——
其中好几条的表面现象都指向错误方向（"像是缓存问题""像是超时不够"），只有实测
才能推翻。看到相似现象时先在这里搜一遍。

编号沿用原 `STATUS.md` 的小节号。它们已经被 `deploy/nginx/aitrainer.conf`、
`tests/contracts.test.mjs` 和 `tests/production-smoke.test.mjs` 的注释按编号引用，
因此当作稳定 ID 保留，不重新编号。

已修的条目不删除：它们同时是回归测试的由来，删掉之后没人知道那些断言在防什么。


## 故障记录

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

## 附：2026-07-26 全量自检快照

一次性快照，保留用于对照当时的基线，不代表当前状态——当前门禁与验证命令见 `TESTING.md`。

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
