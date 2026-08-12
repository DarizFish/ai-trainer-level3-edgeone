# 阿里云自托管运行手册

本文描述统一 `main` 分支的阿里云自托管部署。正式 DNS、ICP备案、EdgeOne 下线和数据库迁移不属于本阶段。

## 架构

```text
HTTP :80 -> Nginx -> 127.0.0.1:3000 Next.js -> Supabase PostgreSQL
              \-> /_next/static、/lite、/labs、/materials、/content 本机直出
```

Nginx 是唯一公网入口。Node 只监听回环地址，PostgreSQL 继续使用 Supabase。服务器通过
`TRUSTED_CLIENT_IP_HEADER=x-real-ip` 只信任 Nginx 覆盖写入的客户端地址；Nginx 同时清空
外部请求中的 `EO-Connecting-IP`，防止攻击者伪装成 EdgeOne 节点绕过限流。

## 构建与发布物

服务器运行 Node.js 22。生产发布物在 Linux 环境生成：

```bash
npm ci
npm run test:quick
SELF_HOSTED_BUILD=1 npm run build:self-hosted
```

PowerShell 中最后一条等价命令是：

```powershell
$env:SELF_HOSTED_BUILD="1"
npm.cmd run build:self-hosted
Remove-Item Env:SELF_HOSTED_BUILD
```

`dist/self-hosted` 包含 `server.js`、Next.js 文件追踪依赖、`.next/static` 和 `public`。
不要从 Windows 直接复制 `.next/standalone` 到 Linux，因为其中可能带有平台相关依赖。

发布目录使用不可变版本并由软链接切换：

```text
/srv/aitrainer/releases/<git-commit>/
/srv/aitrainer/current -> releases/<git-commit>
```

回滚时把 `current` 指回上一个通过验证的版本并重启 `aitrainer.service`。

## 运行环境

`/etc/aitrainer/aitrainer.env` 权限必须为 `0600`，至少包含：

```dotenv
DATABASE_URL=postgresql://...
```

数据库 migration 必须先于依赖新表或新列的代码部署。现有 Supabase 库没有完整的
`__drizzle_migrations` 基线，不能直接对生产库盲目运行 `npm run db:migrate`。

## GitHub Actions 发布

`.github/workflows/deploy-self-hosted.yml` 在 push 到 `main` 时自动运行，也支持手动触发。它在 GitHub 的
Ubuntu Runner 上执行完整质量门禁，打包已经通过测试的 Next.js standalone，然后通过
专用 `deploy` 用户上传到服务器。服务器会校验 Git SHA、SHA-256、归档路径和发布物结构，
再原子切换 `/srv/aitrainer/current`；readiness 未在 60 秒内通过时自动指回上一版本。

仓库或 `self-hosted-production` Environment 需要配置一个 Secret：

```text
DEPLOY_SSH_PRIVATE_KEY=<专用 Ed25519 私钥全文>
```

不要把日常 root 登录私钥放进 GitHub。服务器的 `deploy` 用户没有密码、不能端口转发，
仅能通过 sudo 调用 `/usr/local/sbin/deploy-aitrainer`。服务器 SSH 主机公钥固定记录在
`deploy/ssh/known_hosts`，Actions 禁止在首次连接时动态信任未知主机。

`main` 是 EdgeOne 与阿里云共用的生产源码分支。push 到 `main` 后，GitHub Actions 会设置
`SELF_HOSTED_BUILD=1`，通过完整质量门禁后自动发布阿里云；EdgeOne 则用同一提交执行标准
Next.js 构建。也可以在 GitHub Actions 页面选择 **Deploy self-hosted server**，点击
**Run workflow** 手动重发指定提交。建议为 `self-hosted-production` Environment 配置人工审批。

## IP 测试限制

备案完成前可以访问 `http://服务器IP` 验证公开页面、API、数据库和静态文件。但普通
HTTP IP 地址不是浏览器安全上下文，不能作为 JupyterLite Service Worker、Secure Cookie
和完整 COOP/COEP 验收结论。

完整浏览器测试通过 SSH 隧道访问 Nginx：

```powershell
ssh -i "$env:USERPROFILE\.ssh\home.pem" -L 8080:127.0.0.1:80 root@39.96.7.2
```

然后访问 `http://localhost:8080`。浏览器把 `localhost` 视为安全上下文，可以验证
Service Worker 和 JupyterLite。正式上线仍必须使用受信任 HTTPS 证书。

## 验收

```bash
curl -fsS http://127.0.0.1:3000/api/health/live
curl -fsS http://127.0.0.1:3000/api/health/ready
curl -fsS http://127.0.0.1/api/health/ready
```

还必须检查：

- Node 3000 和数据库端口未暴露公网；
- `/lite/static/pyodide/pyodide-lock.json` 为 `must-revalidate`；
- `/labs/models/...` 为一年 `immutable`；
- JavaScript、MJS 和 WASM MIME 正确；
- Lab 页面与 JupyterLite iframe 具备 COOP/COEP；
- 登录 Cookie、真实 IP、4 MiB 草稿和退出登录正常；
- EdgeOne 正式站保持可回滚，正式 DNS 未改动。
