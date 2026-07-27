#!/usr/bin/env python3
"""Generate the 20 JupyterLite notebooks from the canonical content file."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
CONTENT_PATH = ROOT / "data" / "content.json"
MANIFEST_PATH = ROOT / "public" / "labs" / "manifest.json"
OUTPUT = ROOT / "jupyterlite" / "content"
PUBLIC = ROOT / "public"


def workspace_slug(code: str) -> str:
    """Directory name for a task's JupyterLite workspace.

    The题号 itself must not become a directory name. JupyterLite derives "is
    this path a directory?" from PathExt.extname(), so a folder called 1.1.1
    parses as a file with extension ".1"; newUntitled then silently writes to
    the root instead, and a "New Text File" there creates a zero-byte file
    named 1.1.1 that masks the whole directory. Dot-free names take the
    correct branch. Mirrors task.code.replaceAll(".", "-") in the web app.
    """
    return code.replace(".", "-")


def lines(source: str) -> list[str]:
    if not source:
        return []
    return source.splitlines(keepends=True)


def safe_child(root: Path, relative: str, label: str) -> Path:
    normalized = relative.replace("\\", "/")
    path = PurePosixPath(normalized)
    if not normalized or path.is_absolute() or ".." in path.parts:
        raise ValueError(f"Unsafe {label}: {relative!r}")
    candidate = (root / Path(*path.parts)).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as error:
        raise ValueError(f"Unsafe {label}: {relative!r}") from error
    return candidate


def copy_workspace_assets(code: str, assets: list[dict], task_dir: Path) -> int:
    copied = 0
    for asset in assets:
        name = str(asset["name"])
        parsed_url = urlsplit(str(asset["url"]))
        if parsed_url.scheme or parsed_url.netloc or not parsed_url.path.startswith("/"):
            raise ValueError(f"Task {code} has a non-local asset URL: {asset['url']!r}")

        source = safe_child(PUBLIC, unquote(parsed_url.path).lstrip("/"), "asset source path")
        target = safe_child(task_dir, name, "workspace asset path")
        payload = source.read_bytes()
        expected_size = int(asset["size"])
        expected_hash = str(asset["sha256"]).lower()
        actual_hash = hashlib.sha256(payload).hexdigest()
        if len(payload) != expected_size:
            raise ValueError(
                f"Task {code} asset {name!r} has size {len(payload)}, expected {expected_size}"
            )
        if actual_hash != expected_hash:
            raise ValueError(
                f"Task {code} asset {name!r} has SHA-256 {actual_hash}, expected {expected_hash}"
            )

        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        copied += 1
    return copied


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
        (r"\b(import|from)\s+xgboost\b", "xgboost"),
        (r"\b(import|from)\s+cv2\b", "opencv-python"),
    ]
    for pattern, package in checks:
        if re.search(pattern, source) and package not in packages:
            packages.append(package)
    if any(str(asset["name"]).lower().endswith(".xlsx") for asset in assets):
        packages.append("openpyxl")
    return packages


def onnx_source(code: str) -> str:
    source = r'''# JupyterLite 浏览器 ONNX Runtime：兼容原考试 onnxruntime API，底层使用 onnxruntime-web
import sys
import types
from types import SimpleNamespace

import numpy as _np
from js import Object
from pyodide.code import run_js
from pyodide.ffi import can_run_sync, run_sync, to_js

_browser_ort_bridge = run_js(r"""
(() => {
  const origin = self.location.origin;
  const sessions = new Map();
  let manifestPromise;
  let runtimePromise;

  const digest = async buffer => {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("");
  };

  const loadManifest = async () => {
    manifestPromise ??= fetch(`${origin}/labs/manifest.json`).then(response => {
      if (!response.ok) throw new Error("模型清单加载失败");
      return response.json();
    });
    return manifestPromise;
  };

  const loadRuntime = async () => {
    if (!runtimePromise) {
      const runtimeBase = `${origin}/labs/runtime/onnxruntime-web/1.27.0/`;
      runtimePromise = import(`${runtimeBase}ort.wasm.bundle.min.js`).then(ort => {
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = runtimeBase;
        return ort;
      });
    }
    return runtimePromise;
  };

  const loadModelBytes = async model => {
    const cache = await caches.open("ai-trainer-onnx-v2");
    const cacheKey = new Request(`${origin}/labs/model-cache/${model.modelId}.onnx`);
    const cached = await cache.match(cacheKey);
    if (cached) {
      const cachedBuffer = await cached.arrayBuffer();
      if (await digest(cachedBuffer) === model.sha256) return new Uint8Array(cachedBuffer);
    }

    const chunks = [];
    let total = 0;
    for (const part of model.chunks) {
      const response = await fetch(`${origin}${part.url}`);
      if (!response.ok) throw new Error(`模型分片加载失败：${part.url}`);
      const buffer = await response.arrayBuffer();
      if (await digest(buffer) !== part.sha256) throw new Error(`模型分片校验失败：${part.url}`);
      const bytes = new Uint8Array(buffer);
      chunks.push(bytes);
      total += bytes.byteLength;
    }

    const modelBytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      modelBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (await digest(modelBytes.buffer) !== model.sha256) throw new Error("模型完整性校验失败");
    await cache.put(cacheKey, new Response(modelBytes, { headers: { "content-type": "application/octet-stream" } }));
    return modelBytes;
  };

  const metadata = (names, items) => names.map((name, index) => {
    const item = items[index];
    return {
      name,
      type: String(item?.type ?? "float32"),
      shape: [...(item?.shape ?? [])],
    };
  });

  const describe = record => ({
    id: record.id,
    model: record.model.name,
    runtime: record.model.browserRuntime,
    variant: record.model.sourceVariant,
    inputs: metadata(record.session.inputNames, record.session.inputMetadata),
    outputs: metadata(record.session.outputNames, record.session.outputMetadata),
  });

  const create = async taskCode => {
    const existing = sessions.get(taskCode);
    if (existing) return describe(existing);
    const manifest = await loadManifest();
    const model = manifest.tasks?.[taskCode]?.model;
    if (!model) throw new Error(`任务 ${taskCode} 没有浏览器模型`);
    const [ort, modelBytes] = await Promise.all([loadRuntime(), loadModelBytes(model)]);
    const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ["wasm"] });
    const record = { id: taskCode, model, ort, session };
    sessions.set(taskCode, record);
    return describe(record);
  };

  const typedData = (type, values) => {
    const data = Array.from(values);
    if (type === "float64") return new Float64Array(data);
    if (type === "int8") return new Int8Array(data);
    if (type === "uint8" || type === "bool") return new Uint8Array(data);
    if (type === "int16") return new Int16Array(data);
    if (type === "uint16") return new Uint16Array(data);
    if (type === "int32") return new Int32Array(data);
    if (type === "uint32") return new Uint32Array(data);
    if (type === "int64") return BigInt64Array.from(data, value => BigInt(value));
    if (type === "uint64") return BigUint64Array.from(data, value => BigInt(value));
    return new Float32Array(data);
  };

  const serializeTensor = (name, tensor) => ({
    name,
    type: tensor.type,
    dims: [...tensor.dims],
    data: Array.from(tensor.data, value => typeof value === "bigint" ? value.toString() : value),
  });

  const run = async (sessionId, inputItems, requestedOutputs) => {
    const record = sessions.get(sessionId);
    if (!record) throw new Error("ONNX 会话不存在，请重新加载实验环境");
    const feeds = {};
    for (const item of Array.from(inputItems)) {
      feeds[item.name] = new record.ort.Tensor(
        item.type,
        typedData(item.type, item.data),
        Array.from(item.dims, Number),
      );
    }
    const outputMap = await record.session.run(feeds);
    const names = requestedOutputs?.length ? Array.from(requestedOutputs) : record.session.outputNames;
    return names.map(name => serializeTensor(name, outputMap[name]));
  };

  const smoke = async taskCode => {
    const info = await create(taskCode);
    const record = sessions.get(taskCode);
    const feeds = {};
    const inputs = [];
    for (const item of info.inputs) {
      const shape = (item.shape.length ? item.shape : [1]).map(value => Number.isInteger(value) && value > 0 ? value : 1);
      const size = shape.reduce((left, right) => left * right, 1);
      feeds[item.name] = new record.ort.Tensor(item.type, typedData(item.type, new Array(size).fill(0)), shape);
      inputs.push({ name: item.name, type: item.type, shape });
    }
    const outputMap = await record.session.run(feeds);
    const outputs = record.session.outputNames.map(name => {
      const tensor = outputMap[name];
      return { name, type: tensor.type, shape: [...tensor.dims] };
    });
    return { model: info.model, runtime: info.runtime, variant: info.variant, inputs, outputs };
  };

  return { create, run, smoke };
})()
""")


def _browser_value(value):
    return value.to_py() if hasattr(value, "to_py") else value


def _numpy_dtype(onnx_type):
    return {
        "float32": _np.float32,
        "float64": _np.float64,
        "int8": _np.int8,
        "uint8": _np.uint8,
        "bool": _np.bool_,
        "int16": _np.int16,
        "uint16": _np.uint16,
        "int32": _np.int32,
        "uint32": _np.uint32,
        "int64": _np.int64,
        "uint64": _np.uint64,
    }.get(onnx_type, _np.float32)


class InferenceSession:
    """浏览器版 onnxruntime.InferenceSession 兼容层。"""

    def __init__(self, model_path, providers=None, **_options):
        if not can_run_sync():
            raise RuntimeError("当前浏览器不支持同步 ONNX 桥接，请升级到最新版 Chromium 浏览器")
        info = _browser_value(run_sync(_browser_ort_bridge.create("__TASK_CODE__")))
        self._session_id = info["id"]
        self._model_path = str(model_path)
        self._providers = list(providers or ["WasmExecutionProvider"])
        self._inputs = [SimpleNamespace(**item) for item in info["inputs"]]
        self._outputs = [SimpleNamespace(**item) for item in info["outputs"]]

    def get_inputs(self):
        return self._inputs

    def get_outputs(self):
        return self._outputs

    def get_providers(self):
        return self._providers

    def run(self, output_names, input_feed, run_options=None):
        del run_options
        inputs = []
        for name, value in input_feed.items():
            array = _np.ascontiguousarray(value)
            onnx_type = {
                "f": "float32" if array.dtype.itemsize <= 4 else "float64",
                "i": f"int{array.dtype.itemsize * 8}",
                "u": f"uint{array.dtype.itemsize * 8}",
                "b": "bool",
            }.get(array.dtype.kind, "float32")
            inputs.append({
                "name": str(name),
                "type": onnx_type,
                "dims": list(array.shape),
                "data": array.reshape(-1).tolist(),
            })
        requested = [] if output_names is None else list(output_names)
        result = run_sync(_browser_ort_bridge.run(
            self._session_id,
            to_js(inputs, dict_converter=Object.fromEntries),
            to_js(requested),
        ))
        outputs = _browser_value(result)
        return [
            _np.asarray(item["data"], dtype=_numpy_dtype(item["type"])).reshape(tuple(item["dims"]))
            for item in outputs
        ]


_onnxruntime = types.ModuleType("onnxruntime")
_onnxruntime.InferenceSession = InferenceSession
_onnxruntime.__version__ = "1.27.0-web"
sys.modules["onnxruntime"] = _onnxruntime


async def browser_onnx_check(task_code="__TASK_CODE__"):
    """执行一次真实的浏览器 WASM 推理，并返回张量结构。"""
    result = await _browser_ort_bridge.smoke(task_code)
    return _browser_value(result)


onnx_result = await browser_onnx_check()
onnx_result
'''
    return source.replace("__TASK_CODE__", code)


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

    # Keep the visible notebook faithful to the supplied source notebook: the
    # official exercise file now contains the exam's own code and nothing else.
    # Warning filters and piplite installs moved into a silent kernel request
    # issued by the JupyterLite extension (see ai_trainer.pip_packages below),
    # and素材下载 disappeared entirely once COOP/COEP made mountDrive true, which
    # puts the shipped workspace files directly in the kernel's working
    # directory. The browser-runtime cell stays: exercises import it by name.
    original_cells: list[dict] = []
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
                "version": "3.12",
            },
            "ai_trainer": {
                "task_code": code,
                "content_version": version,
                "format_version": 4,
                "visible_content": "original-code-only",
                "runtime": "jupyterlite-pyodide",
                "onnx_runtime": "onnxruntime-web@1.27.0" if is_onnx else None,
                # Read by the extension, which installs these through piplite in
                # a silent kernel request before the exercise runs.
                "pip_packages": packages,
            },
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    canonical = json.dumps(original_notebook, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    original_notebook["metadata"]["ai_trainer"]["template_sha256"] = hashlib.sha256(canonical.encode()).hexdigest()
    return original_notebook

def main() -> None:
    content = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)

    generated = 0
    onnx = 0
    copied_assets = 0
    for task in content["practical"]:
        if not task.get("hasNotebook") or not task.get("notebook"):
            continue
        code = task["code"]
        manifest_task = manifest["tasks"].get(code, {"assets": []})
        notebook = notebook_for(task, manifest_task, content["version"])
        task_dir = OUTPUT / workspace_slug(code)
        task_dir.mkdir()
        (task_dir / f"{code}.ipynb").write_text(
            json.dumps(notebook, ensure_ascii=False, indent=1) + "\n",
            encoding="utf-8",
        )
        copied_assets += copy_workspace_assets(code, manifest_task.get("assets", []), task_dir)
        generated += 1
        onnx += int(bool(manifest_task.get("model")))

    print(json.dumps(
        {
            "notebooks": generated,
            "assets": copied_assets,
            "onnxNotebooks": onnx,
            "output": str(OUTPUT),
        },
        ensure_ascii=False,
    ))


if __name__ == "__main__":
    main()
