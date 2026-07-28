// JupyterLite 浏览器 ONNX Runtime 垫片。
//
// 这段 Python 原先是生成到 notebook 第 0 格里的：9026 字、只读，压在官方考题代码
// 上面——3.2.2 的考题正文才 705 字，垫片是它的 13 倍，学员打开题目先看到的是环境
// 代码。而进入实操题本来就有「下载依赖与素材」和「下载 ONNX 模型」两个准备阶段，
// 运行时垫片属于那里。
//
// 它做的事是往 sys.modules 塞一个兼容原考试 onnxruntime API 的假模块，底层走
// onnxruntime-web。准备阶段与题目代码共用同一个内核命名空间，且早于任何单元格执行，
// 所以官方代码的 `import onnxruntime as ort` 照样命中，行为等价。
//
// 含顶层 await，只能由内核按支持顶层 await 的方式执行——这正是准备阶段的执行方式
// （piplite 安装同样是 `await`），exec() 做不到。
export const ONNX_RUNTIME_TEMPLATE = `# JupyterLite 浏览器 ONNX Runtime：兼容原考试 onnxruntime API，底层使用 onnxruntime-web
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
    manifestPromise ??= fetch(\`\${origin}/labs/manifest.json\`).then(response => {
      if (!response.ok) throw new Error("模型清单加载失败");
      return response.json();
    });
    return manifestPromise;
  };

  const loadRuntime = async () => {
    if (!runtimePromise) {
      const runtimeBase = \`\${origin}/labs/runtime/onnxruntime-web/1.27.0/\`;
      runtimePromise = import(\`\${runtimeBase}ort.wasm.bundle.min.js\`).then(ort => {
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = runtimeBase;
        return ort;
      });
    }
    return runtimePromise;
  };

  const loadModelBytes = async model => {
    const cache = await caches.open("ai-trainer-onnx-v2");
    const cacheKey = new Request(\`\${origin}/labs/model-cache/\${model.modelId}.onnx\`);
    const cached = await cache.match(cacheKey);
    if (cached) {
      const cachedBuffer = await cached.arrayBuffer();
      if (await digest(cachedBuffer) === model.sha256) return new Uint8Array(cachedBuffer);
    }

    const chunks = [];
    let total = 0;
    for (const part of model.chunks) {
      const response = await fetch(\`\${origin}\${part.url}\`);
      if (!response.ok) throw new Error(\`模型分片加载失败：\${part.url}\`);
      const buffer = await response.arrayBuffer();
      if (await digest(buffer) !== part.sha256) throw new Error(\`模型分片校验失败：\${part.url}\`);
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
    if (!model) throw new Error(\`任务 \${taskCode} 没有浏览器模型\`);
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
`;

/** 垫片按题号参数化：把 __TASK_CODE__ 换成当前题号。 */
export function onnxRuntimeSource(taskCode: string): string {
  return ONNX_RUNTIME_TEMPLATE.split("__TASK_CODE__").join(taskCode);
}
