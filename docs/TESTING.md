# 测试体系

本项目采用从快到慢、从本地到生产的五层质量门禁。测试默认不写数据库，也不创建账号或学习记录。

## 分层

| 层级 | 命令 | 覆盖范围 | 是否需要服务 |
|---|---|---|---|
| 静态质量 | `npm run lint`、`npm run typecheck` | ESLint、TypeScript | 否 |
| 内容与合同 | `npm run content:validate`、`npm run test:contracts` | 900 道理论题、40 道实操题、评分、认证边界、资源哈希、JupyterLite 配置 | 否 |
| 生产构建 | `npm run test:build` | Next.js 生产编译、服务端与静态路由生成 | 否 |
| 浏览器回归 | `npm run test:browser` | 公共页面、匿名跳转、390px 响应式、Pyodide 内核、ONNX 动态导入和 JavaScript MIME | 自动启动本地生产服务 |
| 正式站冒烟 | `npm run test:smoke` | 正式域名路由、EdgeOne MIME、安全头、运行时文件哈希和部署一致性 | 访问正式站，只读 |

## 日常命令

首次运行浏览器测试：

```powershell
npm.cmd run test:install-browser
```

若本机设置了 `HTTP_PROXY`，必须同时设置 `NO_PROXY=localhost,127.0.0.1,::1`。Playwright 的 webServer 探活请求会经代理返回 `400`，它把“收到任何 HTTP 响应”判定为服务已就绪从而跳过启动 `next start`，导致全部浏览器测试报 `ERR_CONNECTION_REFUSED`。

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

只验证已经上线的正式站：

```powershell
npm.cmd run test:smoke
```

可用 `SMOKE_BASE_URL` 指向 EdgeOne 预览域名。正式站大文件经跨境 CDN 时可能超过 30 秒，冒烟单请求允许 90 秒并对瞬时网络失败重试；仍会逐字节核对本地 hash，不因放宽超时降低一致性要求。

## 浏览器测试边界

- 浏览器测试使用已提交的 JupyterLite、Pyodide、科学计算 wheel 和 ONNX Runtime，不访问公共 CDN。
- 每次 Pyodide 测试使用唯一的浏览器工作区，不覆盖用户草稿。
- 当前只覆盖公开学习页面和匿名认证跳转，不连接 Supabase。
- 账号注册、登录、学习进度和草稿写入需要单独的临时 PostgreSQL 测试库；在建立可自动清理的测试数据库前，不应让 CI 写入生产 Supabase。

## CI

`.github/workflows/quality.yml` 在推送和拉取请求时执行生产依赖 high 级审计、完整构建与浏览器/JupyterLite 门禁。`main` 的成功 run 额外生成以 commit SHA 命名的自托管 artifact；部署工作流只能消费该 run 的 artifact。浏览器失败会保留七天的 trace、截图、视频和 HTML 报告。

GitHub 的 `main` 分支规则必须要求 `Quality gate / Full build and browser regression`、至少一个 PR 审批、解决所有 review conversation、合并前保持分支最新，并禁止绕过规则直接推送。EdgeOne 仍会独立监听 `main`，因此分支保护是它只接收已验证提交的边界。

失败定位顺序：

1. 先运行失败日志中对应的单层命令。
2. 浏览器失败时查看 `playwright-report/` 或 CI artifact。
3. 正式站哈希不一致通常表示 EdgeOne 尚未完成部署或部署了不同提交。
4. MIME 失败时优先检查 `.js` 路径、`Content-Type` 和 `X-Content-Type-Options`，不要只检查 HTTP 200。
