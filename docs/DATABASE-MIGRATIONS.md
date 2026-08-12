# 数据库迁移与双目标发布

EdgeOne 与自托管服务共享同一个 PostgreSQL 数据库。数据库结构只能通过 `drizzle/` 中的版本化迁移变更；应用请求路径禁止执行 DDL。

## 已验证基线

截至 2026-08-12，生产库的 8 张业务表、列、主外键和索引已与 `drizzle/meta/0002_snapshot.json` 逐项核对，并在 `drizzle.__drizzle_migrations` 中登记了 `0000`—`0002` 的时间戳与 SHA-256。当前版本为 `0002_condemned_klaw`。

`db:baseline` 只用于接管一个已有但尚未登记迁移历史的数据库。它先校验完整 schema，再写迁移记录；若表结构不一致、历史只有一部分或 hash 分叉，会回滚并失败。生产基线已经建立，不应再次把它当作日常发布命令。

## 管理命令

管理操作优先读取 `DIRECT_URL`，没有时才使用 `DATABASE_URL`：

```bash
npm run db:check
npm run db:migrate
```

`db:migrate` 与 `db:baseline` 在同一个事务内获取 PostgreSQL advisory lock `aitrainer:drizzle-migrations`。EdgeOne、自托管或人工操作即使同时开始，也只有一个能推进迁移。`db:check` 是只读门禁：迁移历史必须是仓库历史的完整前缀，且当前仓库不能有待执行迁移，最终 schema 必须与快照一致。

自托管发布在切换 `/srv/aitrainer/current` 前自动执行 `db:migrate` 和 `db:check`。`/api/health/ready` 会验证本应用要求的迁移时间戳与 hash 已存在；数据库允许比旧实例更新，以支持滚动发布期间的向后兼容。

## Expand/contract 规则

所有数据库变更至少跨两个生产发布：

1. **Expand**：只新增可空列、带安全默认值的列、新表或兼容索引；旧代码必须继续工作。先合并并确认两个部署目标都运行正常。
2. **Migrate/use**：回填数据并让新代码开始双写或读取新结构。回填必须可恢复、可观测，不能塞进请求路径。
3. **Contract**：确认 EdgeOne 与自托管都已不再读取旧结构后，另开 PR 删除旧列、旧表或兼容逻辑。

单个 PR 不得同时新增替代结构并删除旧结构。破坏性 migration 需要在 PR 中写明观察证据、停止条件和回滚路径。回滚应用版本时，数据库通常不回滚；因此每个 expand 阶段都必须兼容上一版应用。

## 新迁移检查清单

```bash
npm run db:generate
npm run test:quick
```

- 审阅新 SQL，确认只有当前阶段允许的变更；
- 更新 `db/schema-version.ts` 到新 journal 时间戳和 SQL SHA-256；
- 用临时 PostgreSQL 从空库执行全部迁移，再运行 `db:check`；
- PR 必须通过 `Quality gate / Full build and browser regression`；
- 发布后检查两个目标的 `/api/health/ready` 和业务写入路径。
