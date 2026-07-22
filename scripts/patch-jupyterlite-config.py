from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_UTILS = ROOT / "public" / "lite" / "config-utils.js"
CALL_ANCHOR = "  finalConfig = dedupFederatedExtensions(finalConfig);"
PATCHED_CALL = "  finalConfig = applyQueryOverrides(finalConfig);"
FUNCTION_ANCHOR = "function dedupFederatedExtensions(config) {"
PATCH_FUNCTION = """function applyQueryOverrides(config) {
  const workspace = new URLSearchParams(window.location.search).get('workspace');
  if (workspace && /^[A-Za-z0-9_-]{1,80}$/.test(workspace)) {
    config.workspace = workspace;
  }
  return config;
}

"""


def main() -> None:
    source = CONFIG_UTILS.read_text(encoding="utf-8")
    if PATCHED_CALL in source and PATCH_FUNCTION in source:
        print("JupyterLite workspace query patch already applied")
        return
    if CALL_ANCHOR not in source or FUNCTION_ANCHOR not in source:
        raise RuntimeError("JupyterLite config-utils.js structure changed; workspace patch was not applied")
    source = source.replace(CALL_ANCHOR, f"{CALL_ANCHOR}\n{PATCHED_CALL}", 1)
    source = source.replace(FUNCTION_ANCHOR, f"{PATCH_FUNCTION}{FUNCTION_ANCHOR}", 1)
    CONFIG_UTILS.write_text(source, encoding="utf-8", newline="\n")
    print("Applied per-task JupyterLite workspace query support")


if __name__ == "__main__":
    main()
