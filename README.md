# 人工智能训练师三级题库备考站（EdgeOne 版）

这是“人工智能训练师三级题库备考站”的 EdgeOne Makers 部署版本。它保留现有题库、模拟考试、实操材料、JupyterLite、浏览器内模型和自建邮箱密码账号，并把运行平台从 OpenAI Sites / Cloudflare Worker + D1 迁移为标准 Next.js + EdgeOne Cloud Functions + Supabase PostgreSQL。

原 Sites 项目是回退版本；本目录是独立部署副本。未正式发布前不迁移旧用户、会话或学习记录，Supabase 使用全新表结构。

## 目标架构

- Web 与 API：Next.js 16，部署到 EdgeOne Makers 全球可用区（不含中国大陆）。
- 服务端函数：EdgeOne Cloud Functions，首选香港区域。
- 数据库：Supabase PostgreSQL，东京区域（`aws-0-ap-northeast-1`）。
- 静态资源：题库在构建时打包；JupyterLite、ONNX Runtime 和量化模型保留在 `public/lite`、`public/labs`。
- 身份验证：本站自建邮箱密码账号，PBKDF2-SHA256 哈希、HttpOnly 会话 Cookie、可撤销数据库会话。

不要改回 ChatGPT 登录、工作区身份头或 Supabase Auth；当前产品需要自建邮箱密码账号。

## 环境变量

复制 `.env.example` 为 `.env.local`，仅在本地填写真实值：

```bash
DATABASE_URL=postgresql://...
```

线上只在 EdgeOne 控制台配置 `DATABASE_URL` 密钥。不要把数据库密码、连接串、访问令牌或 `.env.local` 提交到 GitHub。

EdgeOne Cloud Functions 建议使用 Supabase 的 IPv4 兼容连接池地址，端口通常为 `6543`。运行时代码已经关闭 prepared statements，并限制每个函数实例的连接数，以适配事务连接池。

## 初始化数据库

数据库结构由 `db/schema.ts` 与 `drizzle/` 下的版本化 PostgreSQL migration 管理。新 Supabase 项目可任选一种方式初始化：

1. 在 Supabase SQL Editor 中执行 `drizzle/` 下的首个 SQL migration；或
2. 临时设置本机 `DATABASE_URL` 后运行：

```bash
npm run db:migrate
```

应用运行时不会自动执行 DDL。部署前必须先完成 migration。

## 本地开发

要求 Node.js `>=20.9.0`：

```bash
npm install
npm run dev
```

Windows PowerShell 若阻止执行 `npm.ps1`，使用 `npm.cmd`。本机 3000 端口返回 `EACCES` 且原生 SWC 无法加载，本地开发固定使用 Webpack 与其它端口：

```powershell
npm.cmd run dev -- --webpack -p 3200 -H 127.0.0.1
```

若环境里设置了 `HTTP_PROXY`，必须同时设置 `NO_PROXY=localhost,127.0.0.1,::1`，否则浏览器测试无法启动本地服务，原因见 `docs/STATUS.md`。

## 测试与上线前检查

```bash
npm test
npm run test:full
npm run test:smoke
```

`npm test` 是日常快速门禁，执行 ESLint、TypeScript、内容完整性和 28 项合同测试。`npm run test:full` 额外执行生产构建与真实 Chromium 回归，包括 Pyodide 内核启动、ONNX 动态导入和移动端横向溢出检查。`npm run test:smoke` 只读验证已上线正式站的路由、EdgeOne MIME、安全头和运行时文件哈希。

首次运行浏览器测试前执行 `npm run test:install-browser`。完整分层、CI 行为和失败定位见 `docs/TESTING.md`。所有检查通过后再推送到 GitHub 和触发 EdgeOne 部署。

## EdgeOne Makers 部署

1. 把本目录初始化为新的私有 Git 仓库并推送到 GitHub。
2. 在 EdgeOne Makers 中导入该仓库，框架选择 Next.js。
3. Node.js 选择 20 或更高版本，安装命令使用 `npm install`，构建命令使用 `npm run build`。
4. 在生产环境和预览环境添加加密变量 `DATABASE_URL`。
5. 先使用 EdgeOne 分配的预览域名验收，不依赖自定义域名。
6. 验收通过后，再单独配置自定义域名、DNS 与 HTTPS。

`edgeone.json` 保存可提交的缓存和安全响应头设置，不包含密钥。

## 主要页面

- `/theory`：900 道理论题的练习、筛选、错题和收藏。
- `/theory/mock`：理论模拟考试。
- `/practical`：40 道实操题及官方素材。
- `/practical/mock`：实操组卷与复盘。
- `/practical/[code]/lab`：JupyterLite 浏览器内实验室。
- `/progress`：登录后查看账号隔离的学习记录。
- `/account`：注册、登录与退出。

理论和实操内容页保持公开；学习进度、收藏、成绩、草稿和会话写入 Supabase PostgreSQL。

## 内容与资源维护

- 版本化题库：`data/content.json`
- Drizzle schema：`db/schema.ts`
- PostgreSQL migrations：`drizzle/`
- JupyterLite：`public/lite`
- 浏览器模型：`public/labs`
- 内容校验：`scripts/validate-content.py`

内容导入和资源生成命令仍保留在 `package.json`。原始参考资料和大型源压缩包不得提交到网站仓库；只提交已经审计、浏览器可交付的成品资源。

重建 JupyterLite 扩展后，产物需同步到 `public/lite/extensions/ai-trainer-jupyterlite/`，并更新 `public/lite/jupyter-lite.json` 里的 `remoteEntry.*.js` hash 引用——每次构建 hash 都会变。`public/lite` 带 service worker 缓存，验证扩展改动需用无痕窗口或硬刷新。

## 文档

| 文档 | 用途 |
| --- | --- |
| `docs/STATUS.md` | 当前状态、未提交改动、已知问题和下一步；接手项目先读这份 |
| `docs/TESTING.md` | 五层质量门禁、CI 行为和失败定位顺序 |
| `docs/USER_INPUT.md` | 产品负责人可直接编辑的需求入口与状态 |
| `docs/IMPROVEMENTS.md` | 可验证的产品改进记录，按日期倒序 |
