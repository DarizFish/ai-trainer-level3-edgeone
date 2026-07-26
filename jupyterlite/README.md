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
