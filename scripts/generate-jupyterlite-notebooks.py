#!/usr/bin/env python3
"""Generate the 20 JupyterLite notebooks from the canonical content file."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT_PATH = ROOT / "data" / "content.json"
MANIFEST_PATH = ROOT / "public" / "labs" / "manifest.json"
OUTPUT = ROOT / "jupyterlite" / "content"


def lines(source: str) -> list[str]:
    if not source:
        return []
    return source.splitlines(keepends=True)


def markdown_cell(source: str, **metadata: object) -> dict:
    return {
        "cell_type": "markdown",
        "metadata": metadata,
        "source": lines(source),
    }


def code_cell(source: str, **metadata: object) -> dict:
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": metadata,
        "outputs": [],
        "source": lines(source),
    }


def dependencies(source: str, assets: list[dict]) -> list[str]:
    packages: list[str] = []
    checks = [
        (r"\b(import|from)\s+pandas\b", "pandas"),
        (r"\b(import|from)\s+numpy\b", "numpy"),
        (r"\b(import|from)\s+matplotlib\b", "matplotlib"),
        (r"\b(import|from)\s+sklearn\b", "scikit-learn"),
        (r"\b(import|from)\s+scipy\b", "scipy"),
        (r"\b(import|from)\s+PIL\b", "Pillow"),
        (r"\b(import|from)\s+seaborn\b", "seaborn"),
        (r"\b(import|from)\s+imblearn\b", "imbalanced-learn"),
    ]
    for pattern, package in checks:
        if re.search(pattern, source) and package not in packages:
            packages.append(package)
    if any(str(asset["name"]).lower().endswith(".xlsx") for asset in assets):
        packages.append("openpyxl")
    return packages


def browser_safe_source(source: str) -> str:
    replacements = {
        "import xgboost as xgb": "# JupyterLite：本题评分目标不依赖可选的 xgboost 原生库，浏览器内核跳过此导入。",
        "from xgboost import XGBRegressor": "# JupyterLite：本题评分目标不依赖可选的 XGBRegressor，浏览器内核跳过此导入。",
    }
    for original, replacement in replacements.items():
        source = source.replace(original, replacement)
    return source


def setup_source(code: str, assets: list[dict], packages: list[str]) -> str:
    return f'''# JupyterLite 环境准备：安装本题依赖，并按需下载本题素材
from pathlib import Path
import hashlib
import piplite
from pyodide.http import pyfetch

PACKAGES = {json.dumps(packages, ensure_ascii=False)}
ASSETS = {json.dumps(assets, ensure_ascii=False)}

if PACKAGES:
    await piplite.install(PACKAGES)

for asset in ASSETS:
    target = Path(asset["name"])
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == asset["sha256"]:
        continue
    response = await pyfetch(asset["url"])
    payload = await response.bytes()
    digest = hashlib.sha256(payload).hexdigest()
    if digest != asset["sha256"]:
        raise RuntimeError(f"素材校验失败：{{asset['name']}}")
    target.write_bytes(payload)

print("✓ {code} 环境已就绪", f"依赖 {{len(PACKAGES)}} 项，素材 {{len(ASSETS)}} 个")
'''


def onnx_source(code: str) -> str:
    return f'''# JupyterLite 浏览器 ONNX Runtime：从现有分片清单加载、校验、缓存并执行模型
from pyodide.code import run_js

_browser_ort_run = run_js(r"""
async (taskCode) => {{
  const origin = self.location.origin;
  const digest = async buffer => {{
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("");
  }};
  const response = await fetch(`${{origin}}/labs/manifest.json`);
  if (!response.ok) throw new Error("模型清单加载失败");
  const manifest = await response.json();
  const model = manifest.tasks?.[taskCode]?.model;
  if (!model) throw new Error(`任务 ${{taskCode}} 没有浏览器模型`);

  const cache = await caches.open("ai-trainer-onnx-v2");
  const cacheKey = new Request(`${{origin}}/labs/model-cache/${{model.modelId}}.onnx`);
  let modelBytes;
  const cached = await cache.match(cacheKey);
  if (cached) {{
    const cachedBuffer = await cached.arrayBuffer();
    if (await digest(cachedBuffer) === model.sha256) modelBytes = new Uint8Array(cachedBuffer);
  }}
  if (!modelBytes) {{
    const chunks = [];
    let total = 0;
    for (const part of model.chunks) {{
      const partResponse = await fetch(`${{origin}}${{part.url}}`);
      if (!partResponse.ok) throw new Error(`模型分片加载失败：${{part.url}}`);
      const partBuffer = await partResponse.arrayBuffer();
      if (await digest(partBuffer) !== part.sha256) throw new Error(`模型分片校验失败：${{part.url}}`);
      const bytes = new Uint8Array(partBuffer);
      chunks.push(bytes);
      total += bytes.byteLength;
    }}
    modelBytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {{ modelBytes.set(chunk, offset); offset += chunk.byteLength; }}
    if (await digest(modelBytes.buffer) !== model.sha256) throw new Error("模型完整性校验失败");
    await cache.put(cacheKey, new Response(modelBytes, {{ headers: {{ "content-type": "application/octet-stream" }} }}));
  }}

  const runtimeBase = `${{origin}}/labs/runtime/onnxruntime-web/1.27.0/`;
  const ort = await import(`${{runtimeBase}}ort.wasm.bundle.min.js`);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = runtimeBase;
  const session = await ort.InferenceSession.create(modelBytes, {{ executionProviders: ["wasm"] }});
  const feeds = {{}};
  const inputs = [];
  for (const [index, name] of session.inputNames.entries()) {{
    const meta = session.inputMetadata[index];
    if (!meta?.isTensor) continue;
    const shape = (meta.shape?.length ? meta.shape : [1]).map(value => Number.isInteger(value) && value > 0 ? value : 1);
    const size = shape.reduce((left, right) => left * right, 1);
    const sourceType = String(meta.type ?? "float32");
    const type = sourceType.includes("uint8") ? "uint8" : sourceType.includes("int32") ? "int32" : "float32";
    const data = type === "uint8" ? new Uint8Array(size) : type === "int32" ? new Int32Array(size) : new Float32Array(size);
    feeds[name] = new ort.Tensor(type, data, shape);
    inputs.push({{ name, type, shape }});
  }}
  const outputMap = await session.run(feeds);
  const outputs = Object.entries(outputMap).map(([name, tensor]) => ({{ name, type: tensor.type, shape: [...tensor.dims] }}));
  return {{ model: model.name, runtime: model.browserRuntime, variant: model.sourceVariant, inputs, outputs }};
}}
""")

async def browser_onnx_check(task_code="{code}"):
    """执行一次真实的浏览器 WASM 推理，并返回张量结构。"""
    result = await _browser_ort_run(task_code)
    return result.to_py() if hasattr(result, "to_py") else result

onnx_result = await browser_onnx_check()
onnx_result
'''


def rubric_markdown(task: dict) -> str:
    rows = ["| 评分点 | 分值 | 方式 |", "|---|---:|---|"]
    for item in task.get("rubric", []):
        mode = "程序结果" if item.get("mode") == "auto" else "人工核对"
        rows.append(f"| {item['id']} {item['description']} | {item['points']} | {mode} |")
    return "\n".join(rows)


def notebook_for(task: dict, manifest_task: dict, version: str) -> dict:
    code = task["code"]
    template = task["notebook"]
    source = "\n\n".join(cell.get("source", "") for cell in template.get("cells", []))
    assets = manifest_task.get("assets", [])
    packages = dependencies(source, assets)
    is_onnx = bool(manifest_task.get("model"))
    if is_onnx:
        for package in ("numpy", "Pillow"):
            if package not in packages:
                packages.append(package)

    # Keep the visible notebook faithful to the supplied source notebook.
    # Bootstrap and browser-runtime cells are tagged and hidden by the local
    # JupyterLite extension; task text and rubrics stay in the website UI.
    original_cells = [
        code_cell(setup_source(code, assets, packages), tags=["ai-trainer-setup"], editable=False),
    ]
    if is_onnx:
        original_cells.append(code_cell(onnx_source(code), tags=["ai-trainer-onnx"], editable=False))
    for item in template.get("cells", []):
        original_cells.append(code_cell(
            item.get("source", ""),
            tags=["ai-trainer-exercise"],
            ai_trainer_cell_id=item.get("id"),
        ))

    original_notebook = {
        "cells": original_cells,
        "metadata": {
            "kernelspec": {
                "display_name": "Python (Pyodide)",
                "language": "python",
                "name": "python",
            },
            "language_info": {
                "codemirror_mode": {"name": "python", "version": 3},
                "file_extension": ".py",
                "mimetype": "text/x-python",
                "name": "python",
                "nbconvert_exporter": "python",
                "pygments_lexer": "ipython3",
                "version": "3.13",
            },
            "ai_trainer": {
                "task_code": code,
                "content_version": version,
                "format_version": 3,
                "visible_content": "original-code-only",
                "runtime": "jupyterlite-pyodide",
                "onnx_runtime": "onnxruntime-web@1.27.0" if is_onnx else None,
            },
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    canonical = json.dumps(original_notebook, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    original_notebook["metadata"]["ai_trainer"]["template_sha256"] = hashlib.sha256(canonical.encode()).hexdigest()
    return original_notebook

    intro = f'''# {code}　{task["title"]}

> 人工智能训练师三级 · JupyterLite 浏览器实验

{task.get("description", "")}

## 使用方法

1. 先运行“环境准备”单元，依赖和素材只保存在当前浏览器。
2. 在练习单元中补全下划线，使用 `Shift + Enter` 逐格运行，或从菜单运行全部单元。
3. JupyterLite 会自动保存到本机 IndexedDB；工具栏“保存到备考站云端”会同步完整 `.ipynb` 到账号。
4. 评分表是核对清单，不再把“能运行且没有下划线”误称为隐藏测试。

## 评分点

{rubric_markdown(task)}
'''
    cells = [
        markdown_cell(intro, tags=["ai-trainer-intro"]),
        code_cell(setup_source(code, assets, packages), tags=["ai-trainer-setup"], editable=False),
    ]

    if is_onnx:
        cells.append(markdown_cell(
            "## 浏览器 ONNX 推理\n\n下一个单元使用 `onnxruntime-web` + WebAssembly 执行真实模型，"
            "包含分片下载、SHA-256 校验和 Cache Storage 缓存。原考试代码使用 Python `onnxruntime`，"
            "在纯浏览器内核中请用这里的异步适配入口。",
            tags=["ai-trainer-onnx-note"],
        ))
        cells.append(code_cell(onnx_source(code), tags=["ai-trainer-onnx"], editable=False))
        original = "\n\n".join(cell.get("source", "") for cell in template.get("cells", []))
        cells.append(markdown_cell(
            "## 原考试 Python 模板（对照）\n\n以下代码面向带原生 `onnxruntime` 的 Python 环境；保留用于对照迁移。\n\n"
            f"```python\n{original}\n```",
            tags=["ai-trainer-reference-template"],
        ))
        cells.append(code_cell(
            f'''# 在这里编写本题的 JupyterLite 浏览器实现
# 可先复用上方已加载的结果；需要再次执行时：
result = await browser_onnx_check("{code}")
print("模型：", result["model"])
print("输入：", result["inputs"])
print("输出：", result["outputs"])
''',
            tags=["ai-trainer-exercise"],
            ai_trainer_cell_id="browser-onnx-exercise",
        ))
    else:
        cells.append(markdown_cell("## 练习区", tags=["ai-trainer-exercise-heading"]))
        for item in template.get("cells", []):
            cells.append(code_cell(
                browser_safe_source(item.get("source", "")),
                tags=["ai-trainer-exercise"],
                ai_trainer_cell_id=item.get("id"),
            ))

    notebook = {
        "cells": cells,
        "metadata": {
            "kernelspec": {
                "display_name": "Python (Pyodide)",
                "language": "python",
                "name": "python",
            },
            "language_info": {
                "codemirror_mode": {"name": "python", "version": 3},
                "file_extension": ".py",
                "mimetype": "text/x-python",
                "name": "python",
                "nbconvert_exporter": "python",
                "pygments_lexer": "ipython3",
                "version": "3.13",
            },
            "ai_trainer": {
                "task_code": code,
                "content_version": version,
                "format_version": 2,
                "runtime": "jupyterlite-pyodide",
                "onnx_runtime": "onnxruntime-web@1.27.0" if is_onnx else None,
            },
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    canonical = json.dumps(notebook, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    notebook["metadata"]["ai_trainer"]["template_sha256"] = hashlib.sha256(canonical.encode()).hexdigest()
    return notebook


def main() -> None:
    content = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)

    generated = 0
    onnx = 0
    for task in content["practical"]:
        if not task.get("hasNotebook") or not task.get("notebook"):
            continue
        code = task["code"]
        manifest_task = manifest["tasks"].get(code, {"assets": []})
        notebook = notebook_for(task, manifest_task, content["version"])
        task_dir = OUTPUT / code
        task_dir.mkdir()
        (task_dir / f"{code}.ipynb").write_text(
            json.dumps(notebook, ensure_ascii=False, indent=1) + "\n",
            encoding="utf-8",
        )
        generated += 1
        onnx += int(bool(manifest_task.get("model")))

    print(json.dumps({"notebooks": generated, "onnxNotebooks": onnx, "output": str(OUTPUT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
