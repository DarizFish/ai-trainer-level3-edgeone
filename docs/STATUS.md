# 项目当前状态

更新时间：2026-07-26。本文取代原 `SESSION-HANDOFF.md`，用于把项目移交给其他会话或协作者。只记录**当前**事实与待办；历史改进见 `IMPROVEMENTS.md`。

## 1. 坐标

| 项目 | 值 |
| --- | --- |
| 正式站 | https://www.aitrainer3.xyz/ |
| 本地目录 | `C:\Users\zd\Documents\aitrainer3\edgeone-site` |
| 当前分支 | `codex/edgeone-migration`（与 `origin` 同步，无未推送提交） |
| 当前 HEAD | `822b40b` 切换 Pyodide 0.27.7 并完善实操作答体验 |
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

| 文件 | 改动 |
| --- | --- |
| `edgeone.json` | `/lite/jupyter-lite.json`、`/lite/service-worker.js` 改为 `max-age=0, must-revalidate`，见 4.1 |
| `eslint.config.mjs` | 忽略 `playwright-report/**`、`test-results/**` |
| `README.md`、`docs/**` | 文档重整 |

### 已回退：JupyterLite 翻译接口无扩展名别名

曾有一组改动为 `/lite/api/translations/{all,en}` 发布无后缀别名，用于排查 Lab 卡死。2026-07-26 已确认它与卡死无关并全部回退，记录在此避免重复尝试：

本地生产构建下用真实 Chromium 打开 Lab（加载 → 内核 Idle → 再等 8 秒），JupyterLite 只请求 `/lite/api/translations/en.json` 与 `all.json`，两者均 200，**从未请求过无后缀路径**。打包代码印证：JupyterLite 自己的翻译插件（`public/lite/build/4761.*.js`、`7311.*.js`）拼的是 `api/translations/${locale}.json`；只有 JupyterLab 核心的 `requestTranslationsAPI`（`jlab_core.*.js`）拼无后缀路径，而它在所有 bundle 中都找不到调用点。

## 4. 已知问题

### 4.1 Lab 卡死：可变配置文件被当作不可变资源缓存（已定位，部分修复）

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

**已修**：`edgeone.json` 为 `/lite/jupyter-lite.json` 和 `/lite/service-worker.js` 显式设置 `max-age=0, must-revalidate`。部署后不会再有新用户被毒化。带内容 hash 的 `/lite/static/*`、`/lite/build/*`、`/labs/models/*` 保持 immutable 不变。

**未修**：已经中毒的浏览器不会因为响应头变化而恢复——它们手里的副本标着一年不过期，根本不会回源校验。这些用户需要手动清站点数据（DevTools → Application → Storage → Clear site data，勾选 unregister service workers），或用无痕窗口。

**若要让中毒浏览器自动恢复**，需要让它去请求一个从未缓存过的 URL：

1. 在 `scripts/patch-jupyterlite-config.py` 里给 `getLiteConfig` 的 `window.fetch(liteUrl)` 追加 `?_=<RUNTIME_REVISION>`（`public/lite/config-utils.js:215`）。
2. 把 `RUNTIME_REVISION` 从 `20260726-pyodide0277-runtime11` 升到下一个版本——**这一步是必需的**，因为 `config-utils.js` 自身也是 immutable，中毒浏览器只有在 URL 变化时才会重新拉取它。`lab/index.html` 是 `must-revalidate`，所以新版本号一定能送达。
3. 同步 `components/JupyterLiteLab.tsx:178` 的 `labRevision`，以及 `tests/contracts.test.mjs`、`tests/e2e/runtime.spec.mjs`、`tests/production-smoke.test.mjs` 中的版本断言。
4. 运行 `npm run jupyterlite:patch` 应用到已提交产物，再跑全量测试。

工作区 slug 不含版本号，升版本不会影响用户草稿。2026-07-26 与产品负责人确认：本轮只做响应头修复，上述自动恢复方案暂缓。

### 4.2 本机 `HTTP_PROXY` 会让 Playwright 跳过启动本地服务

`HTTP_PROXY=http://127.0.0.1:17890` 在 Machine 作用域生效。Playwright 的 webServer 探活请求 `GET http://127.0.0.1:3210/` 经代理返回 **400**，它把“收到任何 HTTP 响应”判定为服务器已就绪，于是不再启动 `next start`；随后 Chromium 直连 localhost 无人监听，15 项浏览器测试全部 `ERR_CONNECTION_REFUSED`。

已在 User 作用域设置 `NO_PROXY=localhost,127.0.0.1,::1`，设置后 `npm run test:browser` 正常拉起服务（`[WebServer] ✓ Ready in 180ms`）。若要与 `HTTP_PROXY` 同作用域，需用管理员权限执行：

```powershell
[Environment]::SetEnvironmentVariable("NO_PROXY", "localhost,127.0.0.1,::1", "Machine")
```

### 4.3 生产冒烟的素材检查在慢网络下必然超时

`tests/production-smoke.test.mjs` 按 4 并发校验 24 份实操素材，单请求超时 30 秒。2026-07-26 实测 24 份素材字节全部一致（size + SHA-256 全对），但 `/labs/2.2.1/finance数据集.csv`（7.78 MB）单独下载耗时 25.6 秒、`/labs/2.1.3/finance数据集.csv`（7.13 MB）16.0 秒，四并发下必然触发超时。失败原因是带宽而非内容。修复方向：对大文件降低并发或提高单请求超时。

## 5. 2026-07-26 全量自检结果

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| `npm run content:validate` | 通过（900 理论题 / 40 实操题 / 20 Notebook） |
| `npm run test:contracts` | 35/35 通过 |
| `npm run test:build` | 通过，16 条路由 |
| `npm run test:browser` | 14/15；唯一失败项来自已回退的翻译别名断言，回退后不再存在 |
| `npm run test:smoke` | 2/4；一项失败来自已回退的别名断言，另一项见 4.3 节 |
| 线上 24 份实操素材 | size 与 SHA-256 全部一致 |
| 线上公开路由与运行时字节 | 通过 |

自检期间修复：`public/lite/api/translations/{all,en}` 原为手写的 LF 文件（117 B / 67 B），与 CRLF 源 JSON（124 B / 69 B）不一致导致合同测试失败；已按构建脚本的 `Copy-Item` 方式重新生成为字节副本。两个文件的 git 属性均为 `text: unspecified`，在 `core.autocrlf=true` 下提交后会统一规范成 LF，线上与源文件一致。

## 6. 下一步

1. 全量 `npm run test:full` 通过后提交并推送，推送会触发 EdgeOne 自动部署。
2. 部署后确认 4.1 的缓存头已生效：

   ```powershell
   curl.exe -sI https://www.aitrainer3.xyz/lite/jupyter-lite.json | findstr /i cache-control
   ```

   期望是 `max-age=0, must-revalidate`。EdgeOne 的默认规则会给 `/lite` 下的文件加 immutable，本次是用显式 `headers` 覆盖，必须部署后实测确认覆盖生效；若未生效再考虑同时调整 `caches` 段。
3. 视情况调整 4.3 的冒烟并发与超时。
4. 按 `TESTING.md` 执行正式站验收；重点人工确认任意 CSV Lab 显示“环境已就绪”、`1.1.2` 的 `sensor_data.csv` 不再校验失败、3.2.x 的 ONNX 题可下载模型并推理、Chrome 控制台无 Pyodide MIME 或动态 import 错误。
5. 已中毒浏览器仍需手动清站点数据；若这类反馈变多，再执行 4.1 里的自动恢复方案。

## 7. ONNX 模型

量化模型已生效：`public/labs/manifest.json` 中 `sourceVariant` 为 `browser-quantized`，五个模型以内容哈希分片形式存放在 `public/labs/models/<hash>/part-NNN.bin`，合计 46 MB（`resnet` 25 MB、`emotion-ferplus` 21 MB、`version-RFB-320` 488 KB、`mnist` 20 KB）。这些路径带内容哈希，适用 `edgeone.json` 中的一年 immutable 缓存。量化源文件保留在被 Git 忽略的 `work/browser-models/quantized`，原始大模型拆分产物不提交。
