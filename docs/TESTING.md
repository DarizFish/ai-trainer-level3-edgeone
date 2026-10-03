# 测试体系

本项目采用从快到慢、从本地到生产的五层质量门禁。测试默认不写数据库，也不创建账号或学习记录。

## 分层

| 层级 | 命令 | 覆盖范围 | 是否需要服务 |
|---|---|---|---|
| 静态质量 | `npm run lint`、`npm run typecheck` | ESLint、TypeScript | 否 |
| 内容与合同 | `npm run content:validate`、`npm run test:contracts` | 900 道理论题、40 道实操题、评分、认证边界、资源哈希、JupyterLite 配置 | 否 |
| 生产构建 | `npm run test:build` | Next.js 生产编译、服务端与静态路由生成 | 否 |
| 浏览器回归 | `npm run test:browser` | 公共页面、匿名跳转、390px 响应式、Pyodide 内核、ONNX 动态导入和 JavaScript MIME | global setup 自动启动并回收本地生产服务 |
| 正式站冒烟 | `npm run test:smoke` | 公开路由、MIME、安全头、运行时文件哈希和部署一致性；可指定源站或正式域名 | 只读 |

## 日常命令

首次运行浏览器测试：

```powershell
npm.cmd run test:install-browser
```

浏览器测试服务器由 `tests/e2e/global-setup.mjs` 直接拥有：启动后对 `127.0.0.1` 做就绪探测，结束时等待子进程退出并在截止时间后强制回收。`CI=true` 时端口若已被占用会直接失败；本地普通模式可以显式复用已有服务。不要重新改回 Playwright `webServer`，它在本项目的 Windows 环境里既出现过代理 400 被误判为就绪，也出现过用例全部通过后子进程和管道无法回收的挂起。

### 手工验证时踩过的三个坑

1. **换构建前先按端口杀掉旧服务**。`pkill -f next-server` 在本机杀不掉 Node，旧进程会继续占着端口，新起的 `next start` 因 `EADDRINUSE` 静默退出，你以为在验证新代码，其实浏览器拿到的还是上一版构建。可靠做法：

   ```powershell
   Get-NetTCPConnection -LocalPort <端口> -State Listen | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
   ```

2. **开发服务器只能用 `localhost` 访问**。`next.config.ts` 的 `allowedDevOrigins` 写的是 `127.0.0.1`，但 Next 的 dev origin 检查不认这种写法，用 `http://127.0.0.1:<端口>` 打开时页面不会 hydrate，且控制台与终端都没有任何报错，极易误判成代码问题。

3. **强杀服务会在 Supabase 事务连接池留下孤儿连接**。`Stop-Process -Force` 不给进程关闭 PostgreSQL 连接的机会，池子这一侧要过一段时间才回收。反复重启几次后连接槽被占满，此后所有查询（包括从别的进程发出的）都会一直排队，直到 2 分钟 `statement_timeout` 报 `57014 query_canceled`。症状是"数据库好像坏了"，实际只需停掉所有本地服务等一会儿。判断方法：停掉服务后跑一句 `SELECT 1`，正常就是这个原因。

开发过程中运行快速门禁：

```powershell
npm.cmd test
```

准备提交或部署时运行完整门禁：

```powershell
npm.cmd run test:full
```

准备**推送 PR**时应在与 GitHub Actions 同构的 CI 模式下运行：

```powershell
$env:CI = "true"
$env:SELF_HOSTED_BUILD = "1"
npm.cmd run test:ci
Remove-Item Env:CI
Remove-Item Env:SELF_HOSTED_BUILD
```

`test:ci` 当前与 `test:full` 覆盖相同，但 `CI=true` 会改变 Playwright 的关键行为：禁止复用端口上已有的旧服务、允许一次重试以采集 trace，同时通过 `failOnFlakyTests` 让“重试后才通过”仍然阻断门禁。`SELF_HOSTED_BUILD=1` 让浏览器测试运行与阿里云发布一致的 standalone 产物。两者都是 GitHub Quality Gate 的环境设置，因此本地普通模式通过不能替代这一步。

修改 JupyterLite 内核启动、重启、Service Worker、环境准备或等待条件时，还要对冷启动、依赖探针和重启做压力回归：

```powershell
$env:CI = "true"
$env:SELF_HOSTED_BUILD = "1"
npm.cmd run build
npm.cmd run test:browser -- tests/e2e/runtime.spec.mjs tests/e2e/kernel-restart.spec.mjs --repeat-each=3
Remove-Item Env:CI
Remove-Item Env:SELF_HOSTED_BUILD
```

`SELF_HOSTED_BUILD=1` 会让浏览器测试通过 `scripts/start-built-server.mjs` 直接运行 `.next/standalone/server.js`，并补齐 standalone 运行所需的 `.next/static` 与 `public`，与阿里云发布产物保持一致。

不得用增加全局超时或重试次数作为 flaky 的默认修复。内核命令可能永久不返回，每个程序化请求都应经过扩展的有界执行入口；超时后该内核代次会被标记为不可复用，恢复必须先受控重启，不能向同一 worker 继续盲目发命令。`idle/connected` 也不是就绪证明，扩展必须在环境准备后成功执行一条新的 follow-up 命令才发布 `ready`。

生命周期用例验证三条不同路径：冷启动只能产生一个 session／kernel 且不能出现内核选择弹窗；restart 必须进入新 generation 并重建环境；用户触发的 kernel replacement 必须按新 `kernelId` 自动重建环境。环境探针必须走 `ai-trainer:probe-environment`，由扩展作为程序化内核请求的唯一所有者；测试不得直接调用底层 `kernel.requestExecute`。探针同时验证依赖、`/drive`、工作目录、warning policy、题目 Python helper 和 ONNX 垫片。

直接打开 `/lite/lab/index.html?path=...` 的测试不能把 `window.jupyterapp` 存在或 `ai-trainer:*` 命令已注册当成 Notebook 就绪：扩展会先注册命令，再等待异步 startup preflight，Lab router 只在 `app.started` 后打开目标 path。执行任何 panel-scoped 命令前，必须确认目标 path 已出现在 `app.shell.widgets("main")`；否则快速 runner 可能碰巧通过，慢 runner 会稳定报“尚未打开本题 Notebook”。

切流后先核对源站，再核对正式域名（两次都从待验证版本的 checkout 运行）：

```powershell
$env:SMOKE_BASE_URL='http://39.96.7.2/'
npm.cmd run test:smoke
Remove-Item Env:SMOKE_BASE_URL
npm.cmd run test:smoke
```

也可用 `SMOKE_BASE_URL` 指向 EdgeOne 预览域名。正式站大文件经跨境 CDN 时可能超过 30 秒，冒烟单请求允许 90 秒并对瞬时网络失败重试；仍会逐字节核对本地 hash，不因放宽超时降低一致性要求。此脚本不测试登录、业务写入或 ONNX 推理。

## 浏览器测试边界

- 浏览器测试使用已提交的 JupyterLite、Pyodide、科学计算 wheel 和 ONNX Runtime，不访问公共 CDN。
- 每次 Pyodide 测试使用唯一的浏览器工作区，不覆盖用户草稿。
- 当前只覆盖公开学习页面和匿名认证跳转，不连接 Supabase。
- 账号注册、登录、学习进度和草稿写入需要单独的临时 PostgreSQL 测试库；在建立可自动清理的测试数据库前，不应让 CI 写入生产 Supabase。

- 小程序接入提供了独立的本机 PGlite API 测试库，覆盖账号、会话、作答和成绩去重；运行方法与边界见 [微信小程序接入](MINIPROGRAM.md)。普通浏览器回归仍不写入该数据库。快速门禁还包含 `content:miniprogram:audit`，独立核对实操填空来源及重建代码。

## CI

`.github/workflows/quality.yml` 在推送和拉取请求时执行生产依赖 high 级审计、完整构建与浏览器/JupyterLite 门禁。`main` 的成功 run 额外生成以 commit SHA 命名的自托管 artifact；部署工作流只能消费该 run 的 artifact。浏览器失败会保留七天的 trace、截图、视频和 HTML 报告。

PR 上的 Quality Gate **不负责部署**：打包和 artifact 上传步骤只在 `push main` 时执行，部署工作流再消费已经验证的 artifact。EdgeOne 仍会独立监听 `main`。

**当前决策（2026-08-13）**：暂不增加 `main` 的硬分支保护。现阶段必须依靠合并纪律，只合并 Quality Gate 已通过且 head SHA 未变化的 PR；若以后启用硬保护，再把 `Quality gate / Full build and browser regression` 设为 required check。

失败定位顺序：

1. 先运行失败日志中对应的单层命令。
2. 浏览器失败时查看 `playwright-report/` 或 CI artifact。
3. 正式站哈希不一致时，先检查源站 active 版本和 Nginx 静态目录，再检查 CDN 缓存；也可能是测试 checkout 与已部署提交不同。
4. MIME 失败时优先检查 `.js` 路径、`Content-Type` 和 `X-Content-Type-Options`，不要只检查 HTTP 200。
