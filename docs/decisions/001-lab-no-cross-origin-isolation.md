# 001 · Lab 不得进入跨源隔离（COOP/COEP）

状态：生效中。最近一次被违反并修复于 2026-08-15（PR #14）。

## 当时的问题

JupyterLite 的 `/drive` 决定学员文件存在哪里。挂载失败时文件落进内存文件系统：
文件浏览器看不到、刷新即失，而题目因为有素材兜底仍然照常能跑——**没有任何外部信号**。

上游的判定逐字是：

```
mountDrive = serviceWorkerManager?.enabled || crossOriginIsolated
```

（`@jupyterlite/pyodide-kernel-extension` 0.6.1，与上游 wheel 逐字节一致，改不了。）

2026-07 当时 `@jupyterlite/application-extension:service-worker-manager` 被列在
`disabledExtensions` 里，这个 OR 只剩右半边，于是跨源隔离成了唯一可行路径。

## 考虑过的方案

| 方案 | 结论 |
| --- | --- |
| 补 `Cross-Origin-Resource-Policy: same-origin` | **实测无效**。require-corp 对会开新执行上下文的资源查的是策略继承而非 CORP，同源不豁免 |
| 给 Lab 发 COOP/COEP 打开跨源隔离 | 07-27 `b175204` 采用。同时必须给 `/lite/extensions/` 也发 COEP，否则 Pyodide 内核 worker 被 `coep-frame-resource-needs-coep-header` 拦掉，内核永远停在启动中 |
| 恢复 Service Worker，让 OR 的左半边成立 | 08-06 `74bac6c` 采用，成为最终方案 |

## 为什么是现在这个方案

跨源隔离有一个当时没有暴露的代价：**它会把 Pyodide Kernel 0.6.1 切回
`SharedArrayBuffer`/`Atomics` 的同步 worker**，那条路径存在 `/drive` 永久等待的死锁
风险。`ff54ebd` 因此移除了同步路径，并把 COOP/COEP 从 `edgeone.json` 和
`next.config.ts` 删除。

恢复 Service Worker 之后 `mountDrive` 不再依赖跨源隔离，代价消失而收益保留。

## 依赖的假设

- Pyodide Kernel 保持 0.6.x。升级前必须重新确认跨源隔离与同步 worker 的关系。
- `service-worker-manager` 扩展保持启用。把它放回 `disabledExtensions` 等于把上面
  那个 OR 砍回只剩跨源隔离一项，本决策的前提随即失效。
- 浏览器提供 Service Worker。不提供时（Firefox 隐私窗口、Safari 无痕浏览）实验室
  显式失败，这是有意的取舍：显式失败优于静默丢数据。

## 它被违反过一次，以及为什么

头配置有三份：`edgeone.json`、`next.config.ts`、`deploy/nginx/aitrainer.conf`。

```
2026-07-27  b175204  为跨源隔离加上 COOP/COEP（前两份）
2026-08-02  1aee62c  写自托管 Nginx 配置，照抄了当时的 edgeone.json
2026-08-13  ff54ebd  只从前两份删除
2026-08-15  迁移     Nginx 那份第一次挡在用户前面
2026-08-15  43ebdac  删除，并补上门禁
```

约束当时已经写在 `AGENTS.md` 和 `STATUS.md` 两处，措辞也正确。**它仍然漂了 13 天，
因为没有任何东西执行它。**

## 现在由谁守着

- `tests/contracts.test.mjs`：断言三份头配置都不含 COOP/COEP。加回去会红。
- `tests/production-smoke.test.mjs`：断言已发布的 lab 外壳不返回这两个头。

改动 JupyterLite 内核生命周期或部署头配置前，先读 `jupyterlite/README.md` 的硬约束一节。
