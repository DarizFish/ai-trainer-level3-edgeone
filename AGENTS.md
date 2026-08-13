# 仓库协作约束

## 项目文档

- `docs/STATUS.md` 是当前里程碑、已验证状态、最高风险和下一步的入口；`docs/TESTING.md` 是验证命令的来源；`docs/IMPROVEMENTS.md` 保存历史调查；数据库与 JupyterLite 的细节分别放在 `docs/DATABASE-MIGRATIONS.md` 和 `jupyterlite/README.md`。同一事实只维护一个主要来源，其他文档用链接或简短引用。
- 有意义的已验证改动若改变构建、测试、部署、恢复方式、运行时硬约束或 P0/P1 风险，应只同步因此失真的最小文档集。不要为格式修改或临时调试日志更新状态文档。
- 文档陈述要区分“已验证”“决策”“计划”“风险”和“未知”。验证优先级依次为当前可复现行为、代码与配置、Git 历史、现有文档；聊天记录不能作为唯一证据。
- `docs/STATUS.md` 不把会在下一次提交后立即失真的 SHA 写成“最新 head”；使用“已验证代码基线”，并写明对应的测试或 CI 证据。

## 提交前验证

- 普通改动至少运行 `npm.cmd test`；准备推送 PR 时必须在 PowerShell 中运行 `$env:CI = "true"; npm.cmd run test:ci`，完成后可用 `Remove-Item Env:CI` 清理当前会话变量。`CI=true` 会让 Playwright 禁止复用旧服务，并把重试后通过的用例仍视为 flaky 失败。
- 修改 JupyterLite 内核生命周期、环境准备或相关端到端测试时，除完整门禁外，还要把覆盖冷启动与重启的生命周期用例重复至少 3 次：`npm.cmd run test:browser -- tests/e2e/kernel-restart.spec.mjs --repeat-each=3`。
- 不得仅靠增加超时或重试次数掩盖偶发失败。先定位等待条件、资源所有者和失败诊断是否正确；每个可能永久等待的内核探针都必须有独立截止时间并输出内核与运行时状态。

## JupyterLite 产物

- `jupyterlite-extension/` 的源码改动必须执行 `npm.cmd run jupyterlite:extension`，并提交同步生成的 `public/lite/extensions/ai-trainer-jupyterlite/` 与 `public/lite/jupyter-lite.json` 哈希变更。
- 不要手工复用旧的 `remoteEntry.*.js`。完整构建和合同测试必须能证明配置引用的 hashed bundle 实际存在。

## 发布与数据库安全

- PR 上的 Quality Gate 只验证提交，不部署。自托管打包只在已验证提交进入 `main` 后生成，部署工作流只消费该提交的 artifact；EdgeOne 仍独立监听 `main`。
- 未经用户明确授权，不配置或修改硬分支保护，不合并 PR，也不触发任何部署。
- 数据库变更必须遵守 `docs/DATABASE-MIGRATIONS.md` 的 baseline、迁移锁和 expand/contract 流程；不得用未登记的手工 SQL 代替 migration。
