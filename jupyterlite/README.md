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

运行时 `ready` 的含义不是“收到环境准备单元的 execute reply”，而是同一 `generation` 的内核已完成环境准备并同时处于 `idle + connected`。测试探针不得裸等 `future.done`，必须有独立截止时间，并在超时时输出内核及扩展运行时状态。

piplite 管理的包必须先由 `piplite.install()` 安装，再通过动态导入验证；不要把这些模块同时写进同一请求的静态 `import` 预加载语句。`pyodide-kernel` 会在执行源码前调用 `loadPackagesFromImports()`，混用两条安装路径会在慢 worker 上争用包状态并可能永久停在 `busy`。
