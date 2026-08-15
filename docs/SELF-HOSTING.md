# 阿里云自托管运行手册

本文描述统一 `main` 分支的阿里云自托管部署。正式 DNS、ICP备案和数据库迁移不属于本阶段。

## 架构

目标形态是**阿里云作源站、EdgeOne 只作 CDN**，取代原来「EdgeOne Pages 既构建又托管」的形态。

```text
用户 -> EdgeOne CDN -> 阿里云 Nginx :80 -> 127.0.0.1:3000 Next.js -> Supabase PostgreSQL
                                     \-> /_next/static、/lite、/labs、/materials、/content 本机直出
```

| 域名 | 当前指向 | 状态 |
| --- | --- | --- |
| `www.aitrainer3.xyz` | EdgeOne Pages（自建构建与托管） | 现行正式站，待替换 |
| `ali.aitrainer3.xyz` | EdgeOne CDN 回源阿里云 Nginx | 新链路，测试中 |

Nginx 是源站的唯一公网入口。Node 只监听回环地址，PostgreSQL 继续使用 Supabase。服务器通过
`TRUSTED_CLIENT_IP_HEADER=x-real-ip` 只信任 Nginx 覆盖写入的客户端地址；Nginx 同时清空
外部请求中的 `EO-Connecting-IP`，防止攻击者伪装成 EdgeOne 节点绕过限流。

### 缓存语义由 Nginx 单点决定

CDN 挡在前面之后，**响应头就是缓存策略本身**，没有别的开关。`deploy/nginx/aitrainer.conf`
的 `$aitrainer_cache_control` 是唯一的真相来源，三个头（`Cache-Control`、`CDN-Cache-Control`、
`Eo-Cdn-Cache-Control`）取同一个值：

| 路径 | 值 | 理由 |
| --- | --- | --- |
| `/api/*` | `no-store` | 响应按 Cookie 区分用户，而 CDN 只按 URL 建缓存键 |
| `/_next/static/`、`/content/`、`/lite/static/`、`/lite/build/`、`/labs/models/`、`/labs/runtime/` | `immutable` 一年 | 文件名带内容哈希 |
| JupyterLite 的可变配置（`jupyter-lite.json` 等） | `max-age=0, must-revalidate` | 见 `STATUS.md` 4.1／4.2 |
| 其余一切（**含所有页面文档**） | `max-age=0, must-revalidate` | 见下 |

`default` 必须是重校验，不能是空字符串。空字符串等于 Nginx 什么都不加，`location /`
代理的页面就会把 Next.js 自己发的 `Cache-Control: s-maxage=31536000` 原样透给 CDN，
预渲染页面因此在边缘留最多一年——改了首页也同步不到用户。同理，`location /` 里的
`proxy_hide_header Cache-Control` 不能去掉：不隐藏，Nginx 加的指令只会与 Next 的并列成
一个逗号列表，而共享缓存仍然认 `s-maxage`。Next 对预渲染页面发 ETag，重校验返回 304，
代价只是一次条件请求。contracts 里有一条守住这三点。

### 用户真实 IP 必须在 Nginx 还原

EdgeOne 挡在前面之后，`$remote_addr` 是边缘节点而不是用户。实测（2026-08-14）：用户
真实地址 `183.195.11.71` 经 CDN 到达时 `$remote_addr` 是 `223.109.1.187`，真实地址在
`EO-Connecting-IP` 里。而 `proxy_set_header X-Real-IP $remote_addr` 又是应用唯一信任的
来源（`TRUSTED_CLIENT_IP_HEADER=x-real-ip`），不还原就等于**把同一节点后面的所有用户
当成同一个人**：`lib/auth-throttle.ts` 的 `login:ip` 是 20 次/15 分钟、`register:ip` 是
5 次/小时，全站会被压进这一个桶，正常用户互相锁死。

还原用 Nginx 的 `realip` 模块，而不是直接读这个头：它**只在对端本身落在
`deploy/nginx/aitrainer-edgeone-origin.conf` 的可信集合里时才改写 `$remote_addr`**。
可信集合是唯一的旋钮，应用代码和 `aitrainer.conf` 都不参与这个决定。

两个方向的代价不对称：漏列一个节点 → 该节点后面的用户共用一个桶（等于修复前，不是
安全漏洞）；多列一个非 EdgeOne 地址 → 那个地址可以随意伪造用户 IP。

#### 当前取的是全网信任（有意的降级）

本站用 EdgeOne 免费版，控制台不提供「源站防护 / 回源 IP 网段」，官方
`https://api.edgeone.ai/ips` 已于 2026-07 下线（现在恰好返回 `0.0.0.0/0`）。手里只有
2026-08-14 实测到的两个节点，远不是全部；拿这份残缺清单去收紧，结果是绝大多数节点后面
的用户**仍然**共用一个桶——正是要修的那个毛病。所以先保证「所有用户的 IP 都是准的」。

代价是明确的（实测直连源站伪造 `EO-Connecting-IP: 9.9.9.9` 能成功，源站目前也确实可
直连）：

| 闸门 | 全网信任下 |
| --- | --- |
| `register:ip` 5 次/小时 | **失效**。灌注册没有别的闸门，这是最大的敞口 |
| `login:ip` 20 次/15 分钟 | **失效**。它同时是 PBKDF2 的 CPU 上界 |
| `login:email` 失败 10 次/15 分钟 | 仍然有效，不依赖 IP。**现在是撞库的唯一闸门** |

收紧回去有两条路，都不用改应用代码：升级套餐拿到回源网段清单换掉那两行；或者堵住直连
——安全组只放行回源网段 + 管理 IP，做到这一步之后全网信任本身就不再有代价，因为唯一
可能的对端只剩 EdgeOne。后者同时解掉 §6.1 里「源站可直连」那一条。

伪造挡不住，但**看得见**：日志格式是 `$remote_addr via=$realip_remote_addr`，`via=` 始终
是真实 TCP 对端，`realip` 改不掉它。经 CDN 的请求 `via=` 是 EdgeOne 节点，直连的不是，
所以下面这条能把绕过 CDN 的来源直接列出来，需要时按 `via=` 封禁：

```bash
awk '$2 ~ /^via=/ {print substr($2,5)}' /var/log/nginx/aitrainer.access.log | sort | uniq -c | sort -rn
```

2026-08-15 实测：经 CDN 记成 `183.195.11.71 via=223.109.0.243`（还原成功）；直连伪造记成
`9.9.9.9 via=183.195.11.71`（伪造生效，但真身留在 `via=`）。

收紧之后这条命令换个用法——列出**没能还原**的请求，其 `via=` 即候选的漏列节点地址：

```bash
awk '$2 ~ /^via=/ && $1 == substr($2,5)' /var/log/nginx/aitrainer.access.log
```

## 基础设施配置随 artifact 下发

`deploy/` 下的 Nginx 配置、systemd unit 和发布脚本本身，**和应用代码走同一条已验证路径**：
`package-self-hosted.mjs` 把 `deploy/` 打进 artifact，`deploy-release.sh` 在发布过程中按需应用。

顺序是有讲究的：

| 时机 | 动作 | 为什么在这一步 |
| --- | --- | --- |
| 重启之前 | systemd unit | 它决定进程怎么起，晚了这次重启就用不上；备份留着，健康检查失败要跟着回滚 |
| 健康检查之后 | Nginx 配置 | 它只描述边缘行为，坏配置不该把已经健康的应用拖下水。`nginx -t` 不过就还原并 `exit 13` |
| 最后 | 发布脚本自更新 | 本次发布自始至终用启动时那一份，新逻辑从下一次生效 |

自更新这一步是闭环的关键。没有它，这个脚本就是唯一永远无法通过流水线更新的文件——
2026-08-14 实测服务器上的 `/usr/local/sbin/deploy-aitrainer` 正是这样漂成了旧版，**整段
数据库迁移门禁不存在**，而本文当时还在声称它生效。手工同步的东西一定会漂，只是时间问题。

早于这次改动的发布物里没有 `deploy/`，回滚到它们时会跳过全部基础设施步骤并在日志里说明，
服务器保持现有配置——降级，而不是部署不了。

首次启用需要手工装一次（之后靠自更新）：

```bash
install -o root -g root -m 0755 deploy/scripts/deploy-release.sh /usr/local/sbin/deploy-aitrainer
```

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

`dist/self-hosted` 包含 `server.js`、Next.js 文件追踪依赖、`.next/static`、`public`，以及发布前使用的 migration journal 和数据库管理脚本。
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
DIRECT_URL=postgresql://...
```

生产 Supabase 已在 2026-08-12 建立到 `0002_condemned_klaw` 的完整 Drizzle 基线。发布脚本在切换版本前执行带 advisory lock 的 `db:migrate` 与 `db:check`；任一步失败都不会切换服务。迁移流程见 `DATABASE-MIGRATIONS.md`。

## GitHub Actions 发布

`.github/workflows/quality.yml` 在 PR 与 `main` push 上执行完整质量门禁；只有 `main` 的成功 run 才会生成以 commit SHA 命名的 Next.js standalone artifact。`.github/workflows/deploy-self-hosted.yml` 由成功的 `workflow_run` 触发，只下载该 run 的 artifact，不重新构建未验证源码，然后通过专用 `deploy` 用户上传到服务器。服务器会校验 Git SHA、SHA-256、归档路径和发布物结构，
再原子切换 `/srv/aitrainer/current`；readiness 未在 60 秒内通过时自动指回上一版本。

仓库或 `self-hosted-production` Environment 需要配置一个 Secret：

```text
DEPLOY_SSH_PRIVATE_KEY=<专用 Ed25519 私钥全文>
```

不要把日常 root 登录私钥放进 GitHub。服务器的 `deploy` 用户没有密码、不能端口转发，
仅能通过 sudo 调用 `/usr/local/sbin/deploy-aitrainer`。服务器 SSH 主机公钥固定记录在
`deploy/ssh/known_hosts`，Actions 禁止在首次连接时动态信任未知主机。

`main` 是 EdgeOne 与阿里云共用的受保护生产分支。变更必须通过 PR 和 `Quality gate / Full build and browser regression` 后才能合并。EdgeOne 用合并提交执行标准 Next.js 构建；自托管只消费同一提交的已验证 artifact。建议为 `self-hosted-production` Environment 配置人工审批。

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
