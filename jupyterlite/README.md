# JupyterLite 构建说明

线上直接发布 `public/lite`，不需要 Python 或 Notebook 服务器。该目录是预构建产物；源码位于：

- `content/`：由 `scripts/generate-jupyterlite-notebooks.py` 生成的 20 个 Notebook。
- `../jupyterlite-extension/`：站点云端草稿桥接扩展。
- `jupyter-lite.json` 与 `overrides.json`：JupyterLite 配置。

重新生成时使用 JupyterLite 0.6.4、Pyodide Kernel 0.6.1 和 Pyodide 0.27.7：

```powershell
python -m venv .jupyterlite-venv
& .\.jupyterlite-venv\Scripts\python.exe -m pip install jupyterlite-core==0.6.4 jupyterlite-pyodide-kernel==0.6.1 jupyter-iframe-commands==0.3.0 jupyter-server==2.20.0
npm --prefix jupyterlite-extension ci
npm run jupyterlite:extension
npm run jupyterlite:notebooks
$env:JUPYTERLITE_JUPYTER = ".\.jupyterlite-venv\Scripts\jupyter.exe"
npm run jupyterlite:build
```

数据集与 ONNX 模型不重复写入 `public/lite`。Notebook 运行时根据 `public/labs/manifest.json` 按题加载素材；ONNX 模型继续使用分片、SHA-256 校验和 Cache Storage。

## 提交前验证

扩展源码、Notebook 生成器或 JupyterLite 配置发生变化后，至少执行：

```powershell
npm run jupyterlite:build
$env:CI = "true"
npm.cmd run test:browser -- tests/e2e/kernel-restart.spec.mjs --repeat-each=3
Remove-Item Env:CI
```

随后按 `docs/TESTING.md` 运行完整的 CI 同构门禁。`public/lite/extensions/ai-trainer-jupyterlite/` 中生成的 hashed bundle 与 `public/lite/jupyter-lite.json` 的 `remoteEntry.*.js` 引用必须一起提交；只提交源码或只更新其中一侧都不构成可发布产物。

运行时 `ready` 的含义不是“收到环境准备单元的 execute reply”，也不只是 `idle + connected`；扩展必须在同一 `generation`、同一 `kernelId` 上完成环境准备、等回空闲，再成功执行一条新的有界 follow-up 命令。所有程序化内核请求统一由扩展持有并设置独立 deadline，测试通过 `ai-trainer:probe-environment` 调用，不直接占用底层连接。任何命令超时都会让当前 generation 被隔离，后续准备必须先重启内核；如果旧 generation 因正常 kernel replacement 被取消，调用者应跟随新 generation 的恢复，不能把取消显示成永久错误。

piplite 管理的包必须先由 `piplite.install()` 安装，再通过动态导入验证；不要把这些模块同时写进同一请求的静态 `import` 预加载语句。`pyodide-kernel` 会在执行源码前调用 `loadPackagesFromImports()`，分开两条路径可避免安装与预扫描交叠；这项调整能减载，但不再视为本轮永久等待的主要根因。

## 内核与持久化的硬约束（改动前必读）

这几条都是踩过坑换来的，破坏其中任何一条都会造成静默的数据丢失或全站级故障。
对应的故障记录见 `docs/INCIDENTS.md`。

**不要再把 `@jupyterlite/application-extension:service-worker-manager` 加进 `disabledExtensions`。** 上游判定是 `mountDrive = serviceWorkerManager?.enabled || crossOriginIsolated`（`@jupyterlite/pyodide-kernel-extension` 0.6.1，与上游 wheel 逐字节一致，改不了）。禁用它等于把这个 OR 砍成只剩跨源隔离一项，而跨源隔离由 COOP/COEP 响应头承载、随响应进浏览器缓存，**部署到不了已经缓存旧头的设备**。挂载失败时学员的 `to_csv` 产物会落进内存文件系统：文件浏览器看不到、刷新即失，而题目因为有素材兜底仍然照常能跑，所以完全没有外部信号。该 SW 的 HTTP 缓存默认是关的（注册 URL 带 `?enableCache=false`），不会造成 `INCIDENTS.md` 4.1 那类缓存毒化。

**不要为 Lab 恢复 COOP/COEP 或 iframe 的 `cross-origin-isolated` 权限。** 在当前 Pyodide Kernel 0.6.1 中，跨源隔离会把内核切回 `SharedArrayBuffer`/`Atomics` 的同步 worker；非隔离时选择的是异步 Comlink worker。本站 ONNX Runtime 已显式使用单线程，因此不需要通过跨源隔离换取 WASM 多线程。这条约束已经被违反过一次，完整经过与三个候选方案见 `docs/decisions/001-lab-no-cross-origin-isolation.md`。**头配置有三份**——`edgeone.json`、`next.config.ts`、`deploy/nginx/aitrainer.conf`——改任何一份都要同步另外两份；`tests/contracts.test.mjs` 会断言三份都不含这两个头。`/drive` 必须只依赖 JupyterLite Service Worker。冷启动前要等待注入的 `IServiceWorkerManager.ready` 且确认 `enabled`，不能只看 `navigator.serviceWorker.controller` 后猜测 JupyterLite 已更新内部注册状态。

**`.csv` 在 `fileTypes` 里是 `fileFormat: "base64"`，这是刻意的。** drive 的 `get()` 忽略 `options.format`，只能按扩展名定格式；改回 `text` 会让 2.1.4 那份 GBK 数据集在读写两个方向都被 UTF-8 解码销毁。显示端的解码在 `jupyterlite-extension/src/csvViewer.ts`，**只改 `fromString`，不要动 `toString`**——`CSVViewer._updateGrid` 正是从 `toString()` 取数据喂 DataGrid，在那里还原成字节会让表格重新变回乱码。

**准备阶段的产物活在内核进程里，不在面板上。** piplite 装的纯 Python wheel、warning policy、预热 import、素材和 ONNX 垫片都随 worker 更换而消失。因此 `prepareEnvironment` 不仅要在 `sessionContext.statusChanged` 的 `restarting`/`autorestarting` 上清账，还必须按真实 `kernelId` 识别用户切换或其他 replacement，并为新 generation 完整重跑。`tests/e2e/kernel-restart.spec.mjs` 同时钉住冷启动、重启和 replacement。

**环境准备开头验证 `/drive` 已存在且 cwd 位于 `/drive`**，否则立即进入可见错误状态；准备结束后还会验证下一条命令确实可以完成。这两个检查分别防止「文件只写进刷新即失的内存文件系统」和「界面显示 ready、命令通道实际已卡死」。

**`ready` 必须代表同一代内核真正完成了一条后继命令。** `idle + connected` 只描述 Jupyter 消息层的状态，不证明 worker 的下一条 execute 会返回。只有当前 `generation` 和 `kernelId` 未变化、环境准备完成、内核恢复 `idle + connected`，并且随后一条新的有界命令也成功完成时才能发布 `ready`。冷启动前由 bridge 完成 Service Worker 与 kernelspec preflight，冷启动本身只由 `DocumentContext`／`SessionContext.initialize()` 拥有；`autoStartDefaultKernel` 必须保持 `true`，不得恢复 bridge 的 `changeKernel()` fallback、固定 grace period 或任何第二启动者。所有程序化内核请求必须经过统一的有界执行函数，超时后不得向可能仍占有 worker 的内核盲目重发。

**官方考题代码一个字都不能改，版本不兼容一律在准备阶段解决。** 已经有三处：2.1.4 的 Windows 字体路径、3.2.5 的 `\_` docstring、3.2.3 的 `Image.ANTIALIAS`（见 `INCIDENTS.md` 4.11）。判断顺序是先看能不能换库版本，换不了才写垫片；垫片必须只还原被删掉的旧行为，不得改变题目的计算结果，并且要有一条在真实内核里跑官方代码的用例。不要用全局 warning filter 隐藏这类问题，否则会同时吞掉其他题目真正有价值的告警。

**扩展改动的发布流程**：`npm run jupyterlite:extension` 构建 → 把 `jupyterlite-extension/labextension/` 同步到 `public/lite/extensions/ai-trainer-jupyterlite/` → 更新 `public/lite/jupyter-lite.json` 里 `federated_extensions` 的 `remoteEntry.*.js` 哈希。每次构建哈希都会变，漏掉最后一步等于没发布，`tests/production-smoke.test.mjs` 会在发布后把它照出来。
