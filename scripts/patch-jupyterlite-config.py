from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_UTILS = ROOT / "public" / "lite" / "config-utils.js"
LAB_INDEX = ROOT / "public" / "lite" / "lab" / "index.html"
RUNTIME_REVISION = "20260724-runtime7"
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
  if (pyodideSettings?.pyodideUrl && runtime && /^[A-Za-z0-9_-]{1,80}$/.test(runtime)) {
    const pyodideUrl = new URL(pyodideSettings.pyodideUrl, window.location.href);
    pyodideUrl.searchParams.set('runtime', runtime);
    if (attempt && /^\\d{1,3}$/.test(attempt)) pyodideUrl.searchParams.set('attempt', attempt);
    pyodideSettings.pyodideUrl = pyodideUrl.toString();
  }
  return config;
}

"""
PATCH_FUNCTION_END = "\n}\n\nfunction dedupFederatedExtensions(config) {"


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
    print(f"Applied JupyterLite workspace and runtime retry support ({RUNTIME_REVISION})")


if __name__ == "__main__":
    main()
