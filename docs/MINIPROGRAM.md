# 微信小程序接入

## 范围

原生小程序提供理论练习、理论模考、实操填空和邮箱账号。运行 Python 时仅显示文字，告知用户在电脑访问 www.aitrainer3.xyz 并找到相同题号。实操填写保存在设备上，按账号、题号与练习版本隔离。

小程序源码位于独立项目 `miniprogram-1`。产品范围快照是该项目的 `docs/MINIPROGRAM-PLAN-2026-10-03.md`。网站的学习页面和 JupyterLite 不需要为此增加跳转或导入逻辑。

## 接口与数据

| 接口 | 行为 |
| --- | --- |
| `GET /api/content/manifest` | 返回结构版本、内容标识、哈希资源地址、模考规则和服务能力；可公开读取 |
| `POST /api/theory/answer` | 可附带 `submissionId`、`contentId`，在同一事务内保存作答与去重结果 |
| `POST /api/theory/attempt` | 同样支持去重，服务端计分 |
| `GET /api/theory/attempt` | 当前账号最近 100 条成绩摘要；`private, no-store` |
| `POST /api/auth/logout` | `Accept: application/json` 返回 JSON；撤销失败时返回错误，供小程序保留会话并提示重试 |

旧网页不传提交编号仍可使用原有接口。两端共用邮箱密码账号，各自持有可撤销的会话。小程序提取登录响应的会话 Cookie，在后续本站 API 请求中显式发送；密码不保存在设备。iOS、Android 的实际网络与会话行为仍须真机验收。

`api_submissions` 的复合主键为 `(email, operation, submission_id)`，与业务写入保持事务一致。相同编号、相同内容重复提交不增加答题次数或成绩；不同内容复用编号会被拒绝。不兼容的题库标识返回 409。小程序保留这类旧记录，并继续处理新的有效提交。

事务设置 `statement_timeout=5s`、`lock_timeout=3s`，外层继续使用现有数据库 deadline。新增逻辑不关闭共享连接池；锁等待超时只回滚当前事务。并发测试使用隔离的 PGlite 协议服务及单连接池，不能替代多进程生产负载测试。

迁移 `0003_freezing_white_queen.sql` 仅新增表，启用 RLS，未授予客户端直接访问策略。按 [数据库迁移流程](DATABASE-MIGRATIONS.md) 发布。2026-10-03 已在生产应用 `0003` 并通过 schema 检查；正式 API 验证了去重、账号隔离和独立登出。

## 内容生成与验证

`scripts/generate-public-content.mjs` 增加第四份公开资源：小程序实操填写数据。理论标识由理论资源地址的 SHA-256 生成；实操每题另有练习版本，因此修改实操不会使理论记录失效。

`scripts/miniprogram-content.mjs` 将原始 Notebook 空位与完成版代码按顺序对齐。`scripts/miniprogram-rubrics.mjs` 记录逐行及书面答案的评分点对应关系，缺少映射时生成失败。

```powershell
node scripts/generate-public-content.mjs
npm.cmd run content:miniprogram:audit
```

审计从实体文件独立重建全部 20 份 Notebook，检查 331 个代码空位、148 个文字项的来源、Python 语法和 AST。`3.2.3` 原模板使用 `Image.ANTIALIAS`，完成版省略该参数；校验只放行这个明确列出的原有差异，不修改原题。

在小程序目录运行 `npm.cmd run content:sync -- <网站目录>` 更新内置题库。线上内容通过清单哈希校验后整体替换；下载失败继续使用完整旧缓存。

## 验证与发布边界

网站快速测试已包含小程序内容审计。小程序的 `dev:api` 启动内存 PGlite，应用真实 Drizzle 迁移并启动本地 Next API；`test:api` 使用该数据库验证账号、会话、去重、回滚与隔离。测试连接固定为本机测试端口，不读取生产数据库连接。

小程序验收证据保存在其 `docs/ACCEPTANCE.md`；独立网站发布范围与验证记录在其 `docs/RELEASE-SCOPE.md`。

`test:devtools` 将运行代码复制到独立的临时开发者工具项目，通过自动化端口执行界面验收。该测试项目允许模拟器访问本机 HTTP，原项目配置保持不变。此项不证明正式域名配置及真机网络已验收。截图通过 `CAPTURE_DEVTOOLS=1` 单独开启，避免桌面截图接口故障掩盖功能断言。

生产发布需要先完成迁移、网站部署和正式域名配置，再验证小程序真机登录、退出、弱网及重启。合并、部署、小程序提交审核均需要用户明确授权。

当前测试号 `wxa14c09fabccbf577` 已配置 `https://www.aitrainer3.xyz` 为 request 合法域名；测试号预览不能代替正式个人主体注册、备案与审核。用户当前选择先完成测试号验收。
