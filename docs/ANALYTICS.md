# 数据分析：第一阶段口径与事件清单

状态：首批记录点、同源事件接口和可重复运行的只读报表已上线；首次线上验证与尚未覆盖的验收项见 [`STATUS.md`](STATUS.md)。数据源决策见 [`decisions/002-analytics-from-logs-and-database.md`](decisions/002-analytics-from-logs-and-database.md)。

本阶段分别使用浏览器事件、服务端业务日志和数据库，并在报表中标明信号的可信边界。所有时间窗口按北京时间展示，查询时以 UTC 时间边界过滤；报表须注明起止时间、代码／内容版本和生成时间。

```text
浏览器内可观察事件 ──> 本站同源事件接口 ──┐
服务端业务结果 ──────────────────────────> 统一 JSON 日志 ──> 可替换的采集／查询后端
数据库业务记录 ──────────────────────────> 只读汇总 ────────> 指标报表
```

本站事件接口属于现有网站，不单独部署埋点服务或让浏览器直连日志厂商。应用只输出通用结构化日志；日志后端的接入配置与查询适配独立于事件协议。浏览器事件可丢失、延迟、重复或被伪造，不能替代数据库记录。

## 指标口径

| 指标 | 事实来源与定义 | 解释边界 |
| --- | --- | --- |
| 当前账号数 | 数据库 `users` 当前行数 | 是当前仍存在的账号，不是历史累计注册量 |
| 新增且仍存在的账号 | `users.created_at` 落在时间窗口内的当前行数 | 删除账号后历史窗口会变化；不能称为当时的全部注册量 |
| 理论题当前覆盖 | 每位账号在 `theory_progress` 中的不同 `question_id` 数，按当前题库版本解释 | upsert 保存当前状态，不能从历史快照推算每日新增覆盖 |
| 理论模拟交卷与成绩 | `theory_attempts.created_at` 落在窗口内的记录数，以及 `mode`、`score/max_score`、`passed` 分布 | 是已保存的交卷，不等于开始考试人数；以后若清理旧尝试，历史窗口会变化 |
| 成功注册／登录操作 | `account.registered`、`account.login_succeeded` 日志条数 | 是操作次数，不是独立用户数；仅覆盖上线之后 |
| 成功保存答题 | `theory.answers_saved` 日志条数与 `question_count` 之和 | 一次请求可能批量保存多题；`event_id` 只能去除采集重复，不能识别客户端重试产生的第二次成功操作 |
| 主要页面浏览 | `page.viewed` 浏览器事件，按规范化路由计数 | 是上报次数，不是独立访客；不含查询参数，丢失与机器人访问会影响统计 |
| 实验室环境就绪／失败 | `lab.environment_ready`、`lab.environment_failed` 浏览器事件，按题号和加载代次计数 | 同一加载代次按结果或失败原因去重；失败后恢复可能同时有失败与就绪事件，不等于代码运行成功 |
| 请求错误与耗时 | Nginx 请求日志中的状态码与 `rt=` 请求耗时，报表按状态类别汇总 | 请求级信号，不能直接推断学习结果；静态资源与机器人请求仍混在总请求中，API 单列 |

不发布“全站活跃用户”“访问到注册转化率”或“代码运行完成率”指标，直到相应身份口径和成功判据被定义并验证。`page.viewed` 与 `lab.environment_ready` 的次数也不能相除后称为独立用户转化率。

## 首批业务事件

服务端成功事件只在对应数据库操作及相关会话创建成功之后记录；服务端操作失败另记失败事件。超时后即使数据库最终提交，也不会有“已确认成功”事件，故数据库仍是最终事实来源。浏览器事件只在本机已经观察到对应状态时上报，不把 HTTP 接收成功当作业务完成。统一日志采用一行 JSON，字段包括 `schema_version`、`event_id`、`received_at`（服务端 UTC）、`event_name`、`source`（`server` 或 `browser`）、`outcome`（`success`、`failure` 或页面进入的 `observed`）和生产容器的 `release_revision`；按事件加入 `operation`、`content_version`、`question_count`、`mode`、`route_id`、`task_code`、`load_generation`、`duration_ms` 或非敏感的 `reason_code`。浏览器另存 `occurred_at`，不得代替服务端接收时间做时间窗口过滤。`load_generation` 只在同一次页面生命周期内编号，不能用于跨会话去重。新增字段先更新本文件和解析查询，避免同名字段改变语义。

| 事件 | 发出位置与时机 | 用途 |
| --- | --- | --- |
| `account.registered` | 注册写入并建立会话成功后 | 统计接入后的成功注册操作 |
| `account.login_succeeded` | 凭据验证且会话写入成功后 | 统计成功登录操作 |
| `theory.answers_saved` | 理论答案 upsert 成功后 | 统计保存请求与本次不同题目数 |
| `theory.exam_submitted` | 理论模拟成绩写入成功后 | 与数据库交卷记录对账；数据库仍是成绩来源 |
| `business.operation_failed` | 账号和数据库关键操作因服务端故障失败时，按稳定的 `operation` 和 `reason_code` 分类 | 定位关键业务失败；用户输入校验失败不记作服务故障 |
| `page.viewed` | 浏览器进入主要路由时，每次路由进入上报一次 | 观察页面使用；只传路由模板，不传完整 URL 或查询参数 |
| `lab.environment_ready` | 浏览器确认该题依赖与内核准备完成时，每个加载代次至多上报一次 | 观察环境真正就绪，而非只打开实验室页面 |
| `lab.environment_failed` | 浏览器确认环境准备失败时，每个失败阶段按稳定错误码上报 | 定位实验室失败；不发送完整异常、Notebook 内容或堆栈 |

同源事件接口只接受白名单事件与字段，限制请求体为 512 字节；按受信来源地址在进程内限速，并设全局上限。该限速保护单进程，不能替代边缘层的分布式限速。浏览器以尽力而为方式发送，页面不等待上报完成。草稿自动保存频率高，第一阶段不为每次成功保存增加业务事件。`lab.environment_ready` 不代表用户代码运行成功，不把页面访问或草稿保存冒充实验成功。

## 日志采集与保留

容器的 Docker 日志驱动为 `journald`；应用把一行 JSON 写到标准输出，journald 的 `MESSAGE` 字段保存原文，`CONTAINER_NAME` 区分 blue/green。日志查询和日报只解析上述通用事件协议，不依赖 CLS 或任何日志厂商字段。Nginx 访问日志只写请求路径，不写查询参数或 Referer；保留网络地址与浏览器信息供安全排查，在末尾增加 `rt=$request_time` 供请求状态与耗时聚合。日报不输出原始网络地址、路径或浏览器信息。现有 Nginx logrotate 按天轮转并保留 52 份，公开说明采用最多 60 天的上界。宿主机以 [`deploy/journald/aitrainer-analytics.conf`](../deploy/journald/aitrainer-analytics.conf) 设置 journald 持久化、逐日轮转和最长 30 天保留；这是宿主机级设置，同样影响其他服务的 journald 日志。原始日志访问限于服务器管理员。

部署后由管理员从已验证的 release 执行一次配置安装，并核对生效值：

```bash
sudo bash /srv/aitrainer/releases/<完整 SHA>/deploy/scripts/configure-analytics-journal.sh \
  /srv/aitrainer/releases/<完整 SHA>/deploy/journald/aitrainer-analytics.conf
systemd-analyze cat-config systemd/journald.conf | grep -E '^(Storage|MaxFileSec|MaxRetentionSec|SystemMaxUse)='
```

## 生成日报

管理员在服务器上执行，日期按北京时间解释；命令从 blue/green 的 journald 日志和 Nginx 日志取数，在只读数据库事务中计算账号与理论交卷汇总。原始日志只落到权限为 `0700` 的 `/run` 临时目录，退出时删除；标准输出只有聚合 JSON。

```bash
sudo bash /srv/aitrainer/releases/<完整 SHA>/deploy/scripts/run-analytics-report.sh 2026-09-27
```

也可把同一份通用 JSONL 日志导出后，在有 `DATABASE_URL` 的检出目录运行 `npm run analytics:report -- --from 2026-09-27T00:00:00+08:00 --to 2026-09-28T00:00:00+08:00 --events events.jsonl --access access.log`。报表包含生成时间、UTC 窗口、生成时活跃版本及事件所属版本、有效／重复／无效日志行数、页面和实验事件、服务端业务事件、数据库汇总及交卷对账差异。交卷数以数据库为准；日志缺失、迟到、重复和客户端重试会造成差异，不能把差异直接解释成数据丢失。上线前的历史没有这些业务事件，不能补算。

## 验收边界

本地测试验证接口拒绝跨源、超大和额外个人字段的请求，以及日报的时间窗口和去重。线上已验证浏览器真实上报、带版本号的容器结构化事件、30 天保留配置和生产库只读日报；`lab.environment_ready` 已由真实 Lab 环境准备产生，`theory.answers_saved` 已由真实业务请求产生。注册、登录和交卷事件尚待真实业务发生后逐项核对。指标查询不输出个人明细。首个上线日含旧格式访问日志与初次预备时未带版本号的少量事件，日报分别记为无效输入和 `unknown`，不应解释为当天日志全部丢失。报表的来源日志是否完整，需要另外检查采集与轮转状态；单机 journald 随主机故障可能丢失，不能作为学习数据的恢复来源。
