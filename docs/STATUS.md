# 项目当前状态

更新时间：2026-07-26。本文取代原 `SESSION-HANDOFF.md`，用于把项目移交给其他会话或协作者。只记录**当前**事实与待办；历史改进见 `IMPROVEMENTS.md`。

## 1. 坐标

| 项目 | 值 |
| --- | --- |
| 正式站 | https://www.aitrainer3.xyz/ |
| 本地目录 | `C:\Users\zd\Documents\aitrainer3\edgeone-site` |
| 当前分支 | `codex/edgeone-migration`（与 `origin` 同步，无未推送提交） |
| 当前 HEAD | `8cab82d` 修正 EdgeOne 规则优先级 |
| GitHub | `ssh://git@ssh.github.com:443/DarizFish/ai-trainer-level3-edgeone.git` |
| EdgeOne 项目 | `makers-xyzgssb9k7as` |
| Supabase | 项目 `sqenbhewvjnmatgkkbqy`，东京区 `aws-0-ap-northeast-1.pooler.supabase.com` |

数据库连接：`DATABASE_URL` 走 6543 事务连接池，网站运行时只读取这一个变量；`DIRECT_URL` 走 5432 会话连接池，目前仅备迁移与管理操作使用，`drizzle.config.ts` 尚未接入。真实连接串只存在于本地 `.env.local` 和 EdgeOne 控制台密钥中，不要输出或提交。数据库密码曾出现在历史会话记录里，建议上线稳定后旋转。

本地开发并非所有页面都需要数据库：公开题库、静态页面和 JupyterLite 无数据库可加载；注册、登录、收藏、错题、学习进度、成绩和云端草稿需要数据库。

## 2. 本地运行

Windows 上有两个已知约束：3000 端口返回 `EACCES`；Next.js 原生 SWC 无法加载且 Turbopack 不支持 WASM fallback。因此固定使用 Webpack 与非 3000 端口：

```powershell
npm.cmd run dev -- --webpack -p 3200 -H 127.0.0.1
```

生产构建同样固定为 `next build --webpack`（已写入 `package.json`）。

## 3. 未提交的改动

无。工作区干净，全部改动已推送到 `origin/codex/edgeone-migration`。

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

## 6. 下一步

1. **确认 4.3 的规则顺序修正是否生效**——这是唯一未闭环的验证项：

   ```powershell
   curl.exe -sI https://www.aitrainer3.xyz/lite/static/pyodide/pyodide-lock.json | findstr /i cache-control
   ```

   期望 `max-age=0, must-revalidate`。若仍返回 `immutable`，说明 EdgeOne 的优先级还有别的规则（例如按 source 特异性而非顺序），退路是把 `/lite/static/*` 收窄成只覆盖 `*.whl` 等带版本号的子集。**在确认之前不要认为缓存问题已彻底解决**：升级 Pyodide 会再次毒化所有老用户。
2. 视情况调整 4.7 的冒烟并发与超时。
3. 按 `TESTING.md` 执行正式站验收；重点人工确认任意 CSV Lab 显示「环境已就绪」、`1.1.2` 的 `sensor_data.csv` 不再校验失败、3.2.x 的 ONNX 题可下载模型并推理。3.2.x 这条路径本轮完全未验证。
4. 老用户仍需按 4.3 清一次全局 HTTP 缓存；这是一次性的，之后新响应头会自动接管。

## 7. ONNX 模型

量化模型已生效：`public/labs/manifest.json` 中 `sourceVariant` 为 `browser-quantized`，五个模型以内容哈希分片形式存放在 `public/labs/models/<hash>/part-NNN.bin`，合计 46 MB（`resnet` 25 MB、`emotion-ferplus` 21 MB、`version-RFB-320` 488 KB、`mnist` 20 KB）。这些路径带内容哈希，适用 `edgeone.json` 中的一年 immutable 缓存。量化源文件保留在被 Git 忽略的 `work/browser-models/quantized`，原始大模型拆分产物不提交。
