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

## 内核与持久化架构

JupyterLite Service Worker 是 `/drive` 的唯一持久化桥。bridge 扩展直接依赖 `IServiceWorkerManager`，并在 Lab 完成启动、打开 Notebook 之前等待其 `ready`，确认 `enabled`、浏览器 controller 和脚本路径，同时等待 Pyodide 插件激活与 Python kernelspec 注册。preflight 完成后，`DocumentContext`／`SessionContext.initialize()` 是唯一冷启动所有者；`autoStartDefaultKernel` 必须保持 `true`，bridge 只能加入初始化，不能再用 `changeKernel()` fallback 创建第二个 Pyodide worker。

Lab 页面不得发送 COOP/COEP，也不得给 iframe 恢复 `cross-origin-isolated` 权限。`@jupyterlite/pyodide-kernel-extension` 0.6.1 在 `crossOriginIsolated=true` 时会选择 `SharedArrayBuffer`/`Atomics` 的同步 coincident worker，非隔离时选择异步 Comlink worker。本站 ONNX Runtime 已显式使用单线程，因此不需要通过跨源隔离换取 WASM 多线程。

环境准备开头会验证 `/drive` 已存在且 cwd 位于 `/drive`，否则立即进入可见错误状态；准备结束后还会验证下一条命令确实可以完成。这两个检查分别防止“文件只写进刷新即失的内存文件系统”和“界面显示 ready、命令通道实际已卡死”。依赖、素材、warning policy 和 ONNX 垫片都属于具体 worker，任何真实 `kernelId` 更换都必须创建新 generation 并完整重建，不能只处理 `restart` 状态事件。

3.2.5 官方 helper 的普通 docstring 含有 Python 3.12 会报告的 `\_` 转义。审计文件和 SHA-256 不得修改；环境准备只在内存中把该 docstring 规范化为 raw string，再以官方模块名编译注册。不要用全局 warning filter 隐藏此问题，否则会同时吞掉其他题目真正有价值的告警。
