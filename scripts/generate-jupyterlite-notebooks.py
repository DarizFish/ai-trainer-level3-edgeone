#!/usr/bin/env python3
"""Generate the 20 JupyterLite notebooks from the canonical content file."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_entities import load_bank  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
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


# pyodide 自带的包在 import 时由 loadPackagesFromImports 自动加载，piplite 装它们
# 是纯粹的空转。只有 jupyterlite/pypi 里的纯 Python wheel 不在 pyodide-lock 内，
# 必须显式安装。这份清单与 scripts/build-jupyterlite.ps1 的 $purePythonRequirements
# 对应，contracts 断言两者一致。
PIPLITE_ONLY_PACKAGES = {"openpyxl", "seaborn", "imbalanced-learn"}


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


# 官方答案里写死了考场 Windows 机器的字体路径（2.1.4 用了 'C:/Windows/Fonts/simhei.ttf'）。
# 题目和答案不能改，所以把这些路径登记下来，由扩展在准备阶段映射到站点自带的中文字体。
WINDOWS_FONT_PATTERN = re.compile(r"""['"]([A-Za-z]:[\/]{1,2}[^'"]*?\.(?:ttf|ttc|otf))['"]""", re.IGNORECASE)
LAB_CJK_FONT_URL = "/labs/fonts/lab-cjk.ttf"


def font_aliases_for(source: str) -> list[dict]:
    paths = sorted({match.group(1) for match in WINDOWS_FONT_PATTERN.finditer(source)})
    if not paths:
        return []
    font_file = PUBLIC / "labs" / "fonts" / "lab-cjk.ttf"
    if not font_file.is_file():
        raise RuntimeError(
            f"题目引用了平台相关字体 {paths}，但 {font_file} 不存在；先运行 scripts/build-lab-cjk-font.py"
        )
    digest = hashlib.sha256(font_file.read_bytes()).hexdigest()
    return [{"path": path, "url": LAB_CJK_FONT_URL, "sha256": digest} for path in paths]


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
        # 浏览器 ONNX 运行时垫片已移入扩展的准备阶段（见 jupyterlite-extension/src/
        # onnxRuntime.ts）。它原先是 notebook 第 0 格：9026 字、只读，压在官方考题代码
        # 上面——3.2.2 的考题正文才 705 字。进入实操题本来就有「下载依赖与素材」和
        # 「下载 ONNX 模型」两个准备阶段，环境代码属于那里，可见的 notebook 只留官方内容。
        pass
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
                # a silent kernel request before the exercise runs. Only the
                # packages pyodide cannot auto-load on import end up here.
                "pip_packages": [p for p in packages if p in PIPLITE_ONLY_PACKAGES],
                # 素材正常情况下由 mountDrive 挂进内核工作目录，无需下载。但 mountDrive
                # 在内核创建那一刻就定死了，跨域隔离若未成立就没有 /drive，学员会在自己
                # 的代码里撞上 FileNotFoundError。扩展据此清单校验并按需补齐。
                "assets": [
                    {"name": str(a["name"]), "url": str(a["url"]), "sha256": str(a["sha256"])}
                    for a in assets
                ],
                # 见 font_aliases_for：把官方答案里的 Windows 字体路径映射到站点自带字体。
                "font_aliases": font_aliases_for(source),
            },
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    canonical = json.dumps(original_notebook, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    original_notebook["metadata"]["ai_trainer"]["template_sha256"] = hashlib.sha256(canonical.encode()).hexdigest()
    return original_notebook

def main() -> None:
    content = load_bank()
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
