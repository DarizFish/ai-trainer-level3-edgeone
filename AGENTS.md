# 仓库协作约束

本文件是控制面：规定 Agent 该怎么工作，以及项目知识存放在哪里。
它不是项目百科——知识写进 `docs/`，流程写成脚本或测试。

## 状态归属

- 仓库文件是长期项目知识的唯一事实来源。项目架构、关键约束、设计决策、
  操作规范、当前工作阶段和可复用流程，不得只存在于任何 Agent 的私有 Memory。
- 当前目标、当前计划、刚读过的文件、工具结果、失败的尝试属于会话短期状态，
  留在会话内，不写入仓库。
- 不自动把推断出来的结论固化为长期状态；长期状态的变更需要显式确认。

## 文档路由

按「回答哪个问题」归位。同一事实只维护一个主要来源，其他位置用链接引用。

| 问题 | 位置 |
| --- | --- |
| Agent 该怎么工作 | 本文件 |
| 项目是什么、为什么这样设计 | `docs/` |
| 为什么做出某个重要决定 | `docs/decisions/` |
| 现在做到哪里、当前阻塞、下一步 | 状态文档或 Issue |
| 什么是可执行的事实 | 测试与脚本 |

- 上表是分类规则，不是文件清单。新增文档不需要在此登记。
- 能用脚本或测试表达的规则，优先让机器验证，不要只写成自然语言。
- 决策记录不只写结论，还要写当时的问题、考虑过哪些方案、为什么采用当前
  方案、依赖哪些假设。

## 状态晋升

会话中产生的信息默认不进入长期状态。写入前先问一次：这条信息是否持久？

值得晋升：

- 明确且稳定的项目约束
- 经过验证的非显然事实
- 反复出现的失败模式
- 稳定的架构决策
- 能显著减少未来错误的流程

不晋升：

- 临时环境状态、当前分支、部署 ID
- 一次性搜索结果、单次偶然成功
- 未验证的因果推断
- Agent 自己猜测出来的偏好

不确定的信息不晋升。长期状态的质量比数量重要。

## 作用域

- 每条规则放在能完整解释它的最小作用域。
- 跨项目的个人工作习惯属于全局 Agent 配置，不写进本文件。
- 只适用于某个子模块的规则，写进该模块自己的 `AGENTS.md`。
- 这样既避免一个项目的经验污染另一个项目，也避免局部规则被错误提升为全局政策。

## 适配层

- 核心协议属于仓库。各 Agent 的 Skill、命令或配置只做薄 wrapper，
  不得成为某条流程的唯一载体，否则换 Agent 时流程会漂移。

## 交接检验

改动长期状态后自查：**换一个全新的 Agent，仅凭仓库、显式状态、当前任务和
外部系统，能否重建足够的工作上下文并继续工作，而不需要有人重讲历史？**
答案为否，说明仍有重要的隐式状态没有外置。

---

以下按项目填写，以上部分跨项目通用。

## 项目文档

- 按上面路由表的分类，本项目的落点是：`docs/STATUS.md`（现在是什么状态）、
  `docs/BACKLOG.md`（还有什么没做）、`docs/INCIDENTS.md`（这个现象以前查过吗）、
  `docs/decisions/`（为什么这么定）、`docs/TESTING.md`（验证命令的来源）、
  `docs/IMPROVEMENTS.md`（历史改进）。数据库分两份：`DATABASE-MIGRATIONS.md` 讲
  迁移流程，`DATABASE-CAPACITY.md` 讲容量与增长。JupyterLite 的硬约束和构建流程
  在 `jupyterlite/README.md`。
- 这四份按生命周期分开，不要合并回一份：状态会天天变，待办按完成删除，故障档案
  只增不改，决策记录被推翻时追加而不改写。混在一起的结果是文档长到没人完整读，
  而没人读完的显式状态等同于隐式状态。
- 有意义的已验证改动若改变构建、测试、部署、恢复方式、运行时硬约束或
  P0/P1 风险，应只同步因此失真的最小文档集。不要为格式修改或临时调试日志
  更新状态文档。
- 文档陈述要区分「已验证」「决策」「计划」「风险」和「未知」。验证优先级依次为
  当前可复现行为、代码与配置、Git 历史、现有文档；聊天记录不能作为唯一证据。
- `docs/STATUS.md` 不把会在下一次提交后立即失真的 SHA 写成「最新 head」；
  使用「已验证代码基线」，并写明对应的测试或 CI 证据。

## 提交前验证

- 普通改动至少运行 `npm.cmd test`；准备推送 PR 时必须在 PowerShell 中运行
  `$env:CI = "true"; npm.cmd run test:ci`，完成后可用 `Remove-Item Env:CI` 清理
  当前会话变量。`CI=true` 会让 Playwright 禁止复用旧服务，并把重试后通过的用例
  仍视为 flaky 失败。
- 修改 JupyterLite 内核生命周期、环境准备或相关端到端测试时，除完整门禁外，
  还要把覆盖冷启动与重启的生命周期用例重复至少 3 次：
  `npm.cmd run test:browser -- tests/e2e/kernel-restart.spec.mjs --repeat-each=3`。
- 不得仅靠增加超时或重试次数掩盖偶发失败。先定位等待条件、资源所有者和失败诊断
  是否正确；每个可能永久等待的内核探针都必须有独立截止时间并输出内核与运行时状态。
- 部署到自托管后运行 `npm.cmd run test:smoke`，它是唯一验证「线上等于当前
  checkout」的门禁。它失修过一次而长期无人察觉，因此不要跳过。

## JupyterLite 产物

- `jupyterlite-extension/` 的源码改动必须执行 `npm.cmd run jupyterlite:extension`，
  并提交同步生成的 `public/lite/extensions/ai-trainer-jupyterlite/` 与
  `public/lite/jupyter-lite.json` 哈希变更。
- 不要手工复用旧的 `remoteEntry.*.js`。配置引用的 hashed bundle 必须在 checkout
  中存在（`tests/contracts.test.mjs`），也必须在已发布的站点上存在
  （`tests/production-smoke.test.mjs`）。
- 不得为 Lab 恢复 COOP/COEP 或 iframe 的 `cross-origin-isolated` 权限；当前
  Pyodide Kernel 会因此切换到存在同步 `/drive` 永久等待风险的
  SharedArrayBuffer/Atomics worker。`/drive` 只通过 JupyterLite Service Worker
  挂载，创建内核前必须等待 `IServiceWorkerManager.ready/enabled`。
- 头配置有三份且必须一致：`edgeone.json`、`next.config.ts`、
  `deploy/nginx/aitrainer.conf`。改一份就要同步另外两份
  （`tests/contracts.test.mjs` 断言三份都不含 COOP/COEP）。

## 发布与数据库安全

- PR 上的 Quality Gate 只验证提交，不部署。自托管打包只在已验证提交进入 `main`
  后生成，部署工作流只消费该提交的 artifact；EdgeOne 仍独立监听 `main`。
- 未经用户明确授权，不配置或修改硬分支保护，不合并 PR，也不触发任何部署。
- 数据库变更必须遵守 `docs/DATABASE-MIGRATIONS.md` 的 baseline、迁移锁和
  expand/contract 流程；不得用未登记的手工 SQL 代替 migration。
- 自托管是单进程共用一个数据库连接池，与 EdgeOne「每个函数实例一条连接」不同。
  新增或修改请求路径上的数据库操作时，必须评估失败处置的爆炸半径是波及单个请求
  还是全站。
