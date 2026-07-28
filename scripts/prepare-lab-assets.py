#!/usr/bin/env python3
"""Copy only browser-lab assets and shard ONNX models; never copy the source archive/manuals."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from urllib.parse import quote

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_entities import load_bank, write_bank  # noqa: E402

CHUNK_SIZE = 16 * 1024 * 1024
SKIP_SUFFIXES = {".doc", ".docx", ".ipynb", ".zip", ".rar", ".pyc"}
CANONICAL_TEXT_SUFFIXES = {".csv", ".txt", ".py"}

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def canonical_asset_bytes(source: Path) -> bytes:
    payload = source.read_bytes()
    if source.suffix.lower() in CANONICAL_TEXT_SUFFIXES:
        return payload.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return payload

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path.cwd().parent / "3级评价指导手册（上网）" / "05-评价指导手册（上网）")
    parser.add_argument("--content", type=Path, default=Path("data/content.json"))
    parser.add_argument("--output", type=Path, default=Path("public/labs"))
    parser.add_argument("--browser-models", type=Path, default=Path("work/browser-models/quantized"))
    args = parser.parse_args()
    content = load_bank()
    lab_codes = {task["code"] for task in content["practical"] if task["hasNotebook"]}
    material_root = next((path for path in args.source.rglob("*") if path.is_dir() and path.name.endswith("_sucai")), None)
    if material_root is None:
        material_root = next((path for path in args.source.rglob("*") if path.is_dir() and "sucai" in path.name.lower()), None)
    if material_root is None:
        raise SystemExit("Cannot find practical material directory")
    args.output.mkdir(parents=True, exist_ok=True)
    models_output = args.output / "models"
    if models_output.exists():
        shutil.rmtree(models_output)
    task_manifest: dict[str, dict] = {}
    model_manifest: dict[str, dict] = {}
    directories = list(material_root.iterdir())
    for code in sorted(lab_codes):
        source_dir = next((path for path in directories if path.is_dir() and path.name.startswith(f"{code}-")), None)
        if source_dir is None:
            raise SystemExit(f"Missing source directory for {code}")
        task_dir = args.output / code
        task_dir.mkdir(parents=True, exist_ok=True)
        entry: dict = {"assets": []}
        for source in source_dir.rglob("*"):
            if not source.is_file() or source.suffix.lower() in SKIP_SUFFIXES or "__pycache__" in source.parts:
                continue
            relative = source.relative_to(source_dir)
            if source.suffix.lower() == ".onnx":
                original_digest = sha256(source)
                browser_variant = args.browser_models / f"{original_digest[:16]}.onnx"
                model_source = browser_variant if browser_variant.exists() else source
                digest = sha256(model_source)
                model_id = digest[:16]
                if model_id not in model_manifest:
                    model_dir = args.output / "models" / model_id
                    model_dir.mkdir(parents=True, exist_ok=True)
                    chunks = []
                    with model_source.open("rb") as stream:
                        index = 0
                        while block := stream.read(CHUNK_SIZE):
                            part = model_dir / f"part-{index:03d}.bin"
                            part.write_bytes(block)
                            chunks.append({"url": f"/labs/models/{model_id}/{part.name}", "size": len(block), "sha256": hashlib.sha256(block).hexdigest()})
                            index += 1
                    model_manifest[model_id] = {"sha256": digest, "size": model_source.stat().st_size, "chunks": chunks, "browserRuntime": "onnxruntime-web@1.27.0", "sourceVariant": "browser-quantized" if model_source != source else "original", "originalSha256": original_digest, "originalSize": source.stat().st_size}
                entry["model"] = {"name": source.name, "modelId": model_id, **model_manifest[model_id]}
                continue
            target = task_dir / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            payload = canonical_asset_bytes(source)
            target.write_bytes(payload)
            url_path = "/".join(quote(part) for part in relative.parts)
            entry["assets"].append({
                "name": str(relative).replace("\\", "/"),
                "url": f"/labs/{code}/{url_path}",
                "size": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            })
        task_manifest[code] = entry
    manifest = {"version": content["version"], "chunkSize": CHUNK_SIZE, "tasks": task_manifest, "models": model_manifest}
    (args.output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"labTasks": len(task_manifest), "uniqueModels": len(model_manifest), "modelBytes": sum(m["size"] for m in model_manifest.values()), "assetFiles": sum(len(t["assets"]) for t in task_manifest.values())}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
