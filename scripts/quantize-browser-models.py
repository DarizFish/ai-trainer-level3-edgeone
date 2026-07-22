#!/usr/bin/env python3
"""Create and locally validate small ONNX replicas for the browser WebAssembly runtime."""
from __future__ import annotations

import argparse
import hashlib
import shutil
from pathlib import Path

import numpy as np
import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("work/browser-models/quantized"))
    args = parser.parse_args()
    input_dir = args.output.parent / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    for source in args.source.rglob("*.onnx"):
        original_digest = sha256(source)
        if original_digest in seen:
            continue
        seen.add(original_digest)
        ascii_input = input_dir / f"{original_digest[:16]}.onnx"
        output = args.output / f"{original_digest[:16]}.onnx"
        shutil.copy2(source, ascii_input)
        quantize_dynamic(str(ascii_input), str(output), weight_type=QuantType.QUInt8, op_types_to_quantize=["Conv", "MatMul", "Gemm"])
        session = ort.InferenceSession(str(output), providers=["CPUExecutionProvider"])
        feeds = {}
        for value in session.get_inputs():
            shape = [dimension if isinstance(dimension, int) and dimension > 0 else 1 for dimension in value.shape]
            dtype = np.uint8 if "uint8" in value.type else np.float32
            feeds[value.name] = np.zeros(shape, dtype=dtype)
        session.run(None, feeds)
        print(f"{source.name}: {source.stat().st_size} -> {output.stat().st_size} bytes, validated")

if __name__ == "__main__":
    main()
