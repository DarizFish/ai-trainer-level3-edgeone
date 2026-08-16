# 数据库：容量与已知风险

本文件回答一个问题：**数据库会先在哪里撑不住，以及为什么现在不动它。**

数据来自生产库实测，不是估算——每条都写明测量日期与当时的行数，因为结论会随
用量变化而失效。表结构与迁移流程见 `DATABASE-MIGRATIONS.md`，这里只谈容量、
增长方式和取舍。

编号沿用原 `STATUS.md` 的小节号（8.1–8.5），`IMPROVEMENTS.md` 按编号引用过它们。


2026-08-06 就「理论题进度表一个人 900 行会不会成为瓶颈」做的完整核查，结论与四项风险记录如下。

### 8.1 900 行/人不是瓶颈，因为它有上限

`theory_progress` 的主键是 `(email, question_id)`，写入走 upsert（`app/api/theory/answer/route.ts`），同一题重复作答只更新不新增；`question_id` 来自固定题库（judge / single / multi 各 300，共 900）。**900 是每人的硬上限，不是增长曲线上的一个点。**

查询侧同样不构成压力：`where email = ?` 命中主键前缀，且同一用户的行是批量写入的、物理相邻，冷缓存十几个页面 I/O，热缓存 1–2 ms。

生产库实测（2026-08-06，35 个用户 / 2943 行）：堆 320 kB、索引 248 kB，即**每行连索引合计约 193 字节**；单人查询计划为 `Index Scan using theory_progress_email_question_id_pk`。据此外推每人答满 900 题约占 174 kB：

| 用户数 | `theory_progress` 占用 |
| --- | --- |
| 1,000 | ~174 MB |
| 10,000 | ~1.7 GB |
| 100,000 | ~17 GB |

**唯一要盯的是 Supabase 存储配额，不是性能**：免费档 0.5 GB 在 3000 用户左右会被这张表单独撑满。

### 8.2 真正无上限增长的是另外三张表

| 表 | 增长方式 | 现有清理 |
| --- | --- | --- |
| `theory_attempts` | 每次模拟考 1 行，`answers_json` 装 190 题答案 ≈ 3 KB | 无 |
| `practical_attempts` | 每次实操评分 1 行，含 `rubric_json` | 仅用户手动重置 |
| `sessions` | 每次登录 1 行 | 仅显式登出时删（`lib/account-auth.ts`） |

一个刷 200 次模拟考的用户在 `theory_attempts` 里占 600 KB，是他全部 900 行进度的 3.5 倍。`sessions` 表上有 `sessions_expires_at_idx`，但**没有任何代码用它做清理**——`auth_throttle` 反而有 `sweepThrottle()`（`lib/auth-throttle.ts`，2% 概率顺手清过期行），把同样的手法照搬到 `sessions` 即可。生产库现状印证了这一点：35 个用户对应 46 行 `sessions`，只增不减。

### 8.3 `/api/theory/state` 全量返回，且同一份数据发了三遍

`app/api/theory/state/route.ts` 把 900 行拆成 `answeredIds`、`wrongIds`、`progress` 三个字段返回，每个 `question_id` 在 JSON 里最多出现三次；而前两个字段完全能从 `progress` 推出来。客户端随后要 `JSON.parse` 900 项并建三个 900 键对象（`components/TheoryPractice.tsx`）。

去掉冗余字段可立刻减半；进一步可用 `count(*)` + `max(updated_at)` 拼 ETag 支持 304，让重复进入题库页接近零成本。**未做。**

### 8.4 Schema 层面：email 当外键、`content_version` 逐行存

`content_version` 当前是 `2026-07-28-v9`（14 字节），在 `theory_progress` 里每人存 900 份完全相同的值，且**没有任何查询读它**——只写不读。`email`（约 21 字节）同理，堆里 900 份、主键索引里再 900 份。

换成 `user_id integer` 能省下约 35% 的堆和 50% 的索引，但要改 7 张表的外键，是一次全库迁移。**判断：现在不做**，等真的贴近存储配额时再连同 `content_version` 提到 user 级别一起处理。

### 8.5 已修：request-facing 的数据库操作全部套上 deadline

2026-08-06 前只有 `account.session.lookup` 和 `theory.answer.upsert` 走 `withDbDeadline`，其余全是裸 `getDb()`。配合 `max: 1` 的连接池，任何一个卡住的查询会把该函数实例后续所有请求堵到 EdgeOne 的 30 秒上限——正是 `0232686` 修过的那个雪崩，只是换了个入口。已全部补齐。

**同时修掉了 `0232686` 里一个一直没生效的分支**：Drizzle 会把驱动错误重新包一层再抛，外层是 `Error: Failed query: INSERT INTO ...`，既没有 `code`、消息里也只有 SQL，真正的 `CONNECT_TIMEOUT` 挂在 `cause` 上。而 `isConnectionFailure` 只看最外层，所以**除了 8 秒 deadline 那条路径，任何真实的连接故障都没能触发「退掉这条坏连接」**。现在改为顺着 `cause` 链找（带深度上限和去重，`cause` 允许成环）。这条只在实测里暴露出来：不看真实错误对象，光读代码看不出来。

> 契约测试钉的是不变量本身——`app/api/**/route.ts` 与 `lib/progress-data.ts`、`lib/account-auth.ts` 里不许再出现裸 `getDb()`。逐个文件写正则漏一个就是一次线上事故。

细节见 `IMPROVEMENTS.md` 同日条目。

