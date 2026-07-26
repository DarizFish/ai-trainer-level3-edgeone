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

可用 `SMOKE_BASE_URL` 指向 EdgeOne 预览域名。CI 还会设置 `SMOKE_WAIT_MS=300000`，在推送后等待 EdgeOne 最多五分钟，直到线上 Pyodide 文件哈希与当前提交一致，再执行正式站检查。

## 浏览器测试边界

- 浏览器测试使用已提交的 JupyterLite、Pyodide、科学计算 wheel 和 ONNX Runtime，不访问公共 CDN。
- 每次 Pyodide 测试使用唯一的浏览器工作区，不覆盖用户草稿。
- 当前只覆盖公开学习页面和匿名认证跳转，不连接 Supabase。
- 账号注册、登录、学习进度和草稿写入需要单独的临时 PostgreSQL 测试库；在建立可自动清理的测试数据库前，不应让 CI 写入生产 Supabase。

## CI

`.github/workflows/quality.yml` 在推送和拉取请求时执行完整门禁。推送通过后，第二个任务等待 EdgeOne 部署并检查正式域名。浏览器失败会保留七天的 trace、截图、视频和 HTML 报告。

失败定位顺序：

1. 先运行失败日志中对应的单层命令。
2. 浏览器失败时查看 `playwright-report/` 或 CI artifact。
3. 正式站哈希不一致通常表示 EdgeOne 尚未完成部署或部署了不同提交。
4. MIME 失败时优先检查 `.js` 路径、`Content-Type` 和 `X-Content-Type-Options`，不要只检查 HTTP 200。
