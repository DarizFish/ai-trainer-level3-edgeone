from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_UTILS = ROOT / "public" / "lite" / "config-utils.js"
LAB_INDEX = ROOT / "public" / "lite" / "lab" / "index.html"
JUPYTER_LITE_CONFIG = ROOT / "public" / "lite" / "jupyter-lite.json"
RUNTIME_REVISION = "20260726-pyodide0277-runtime11"
PYODIDE_CONFIG_URL = "./static/pyodide/pyodide.js"
CALL_ANCHOR = "  finalConfig = dedupFederatedExtensions(finalConfig);"
PATCHED_CALL = "  finalConfig = applyQueryOverrides(finalConfig);"
FUNCTION_ANCHOR = "function dedupFederatedExtensions(config) {"
PATCH_FUNCTION = """function applyQueryOverrides(config) {
  const params = new URLSearchParams(window.location.search);
  const workspace = params.get('workspace');
  if (workspace && /^[A-Za-z0-9_-]{1,80}$/.test(workspace)) {
    config.workspace = workspace;
  }
  const runtime = params.get('ui');
  const attempt = params.get('attempt');
  const pyodideSettings = config.litePluginSettings?.['@jupyterlite/pyodide-kernel-extension:kernel'];
  if (pyodideSettings) {
    const pyodideUrl = new URL('/lite/static/pyodide/pyodide.js', window.location.origin);
    if (runtime && /^[A-Za-z0-9_-]{1,80}$/.test(runtime)) {
      pyodideUrl.searchParams.set('runtime', runtime);
    }
    if (attempt && /^\\d{1,3}$/.test(attempt)) pyodideUrl.searchParams.set('attempt', attempt);
    pyodideSettings.pyodideUrl = pyodideUrl.toString();
  }
  return config;
}

"""
PATCH_FUNCTION_END = "\n}\n\nfunction dedupFederatedExtensions(config) {"


def normalize_contents_models() -> int:
    contents_api = ROOT / "public" / "lite" / "api" / "contents"
    normalized_files = 0

    def normalize_model(model: object) -> bool:
        if not isinstance(model, dict):
            return False
        changed = False
        model_path = model.get("path")
        if isinstance(model_path, str):
            normalized_path = model_path.replace("\\", "/")
            if normalized_path != model_path:
                model["path"] = normalized_path
                changed = True
            expected_name = normalized_path.rsplit("/", 1)[-1] if normalized_path else ""
            if model.get("name") != expected_name:
                model["name"] = expected_name
                changed = True
        content = model.get("content")
        if isinstance(content, list):
            for child in content:
                changed = normalize_model(child) or changed
        return changed

    for index_path in contents_api.rglob("all.json"):
        model = json.loads(index_path.read_text(encoding="utf-8"))
        if normalize_model(model):
            index_path.write_text(
                json.dumps(model, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
                newline="\n",
            )
            normalized_files += 1
    return normalized_files


def main() -> None:
    source = CONFIG_UTILS.read_text(encoding="utf-8")
    if CALL_ANCHOR not in source or FUNCTION_ANCHOR not in source:
        raise RuntimeError("JupyterLite config-utils.js structure changed; workspace patch was not applied")
    if PATCHED_CALL not in source:
        source = source.replace(CALL_ANCHOR, f"{CALL_ANCHOR}\n{PATCHED_CALL}", 1)
    if "function applyQueryOverrides(config) {" in source:
        start = source.index("function applyQueryOverrides(config) {")
        end = source.index(PATCH_FUNCTION_END, start) + len("\n}\n\n")
        source = f"{source[:start]}{PATCH_FUNCTION}{source[end:]}"
    else:
        source = source.replace(FUNCTION_ANCHOR, f"{PATCH_FUNCTION}{FUNCTION_ANCHOR}", 1)
    CONFIG_UTILS.write_text(source, encoding="utf-8", newline="\n")

    lab_index = LAB_INDEX.read_text(encoding="utf-8")
    query_anchor = "../config-utils.js?_="
    query_start = lab_index.find(query_anchor)
    if query_start < 0:
        raise RuntimeError("JupyterLite lab shell no longer imports config-utils.js with a cache key")
    query_end = lab_index.find("'", query_start)
    if query_end < 0:
        raise RuntimeError("JupyterLite config-utils.js import cache key is malformed")
    lab_index = f"{lab_index[:query_start]}{query_anchor}{RUNTIME_REVISION}{lab_index[query_end:]}"
    LAB_INDEX.write_text(lab_index, encoding="utf-8", newline="\n")

    lite_config = JUPYTER_LITE_CONFIG.read_text(encoding="utf-8")
    new_pyodide_url = f'"pyodideUrl": "{PYODIDE_CONFIG_URL}"'
    legacy_pyodide_urls = (
        '"pyodideUrl": "./static/pyodide/pyodide.mjs"',
        '"pyodideUrl": "./static/pyodide/pyodide.esm.js"',
    )
    if new_pyodide_url not in lite_config and not any(
        pyodide_url in lite_config for pyodide_url in legacy_pyodide_urls
    ):
        raise RuntimeError("JupyterLite pyodideUrl changed; the EdgeOne-safe JavaScript path was not applied")
    for legacy_pyodide_url in legacy_pyodide_urls:
        lite_config = lite_config.replace(legacy_pyodide_url, new_pyodide_url)
    JUPYTER_LITE_CONFIG.write_text(lite_config, encoding="utf-8", newline="\n")
    normalized_indexes = normalize_contents_models()
    print(
        f"Applied JupyterLite workspace and runtime retry support ({RUNTIME_REVISION}); "
        f"normalized {normalized_indexes} content indexes"
    )


if __name__ == "__main__":
    main()
