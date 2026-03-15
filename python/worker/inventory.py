#!/usr/bin/env python3
"""Dependency and asset inventory for worker freezing preparation."""

from __future__ import annotations

import glob
import importlib
import json
import os
from typing import Any, Dict, List

if __package__ in (None, ""):
    import sys

    _HERE = os.path.dirname(os.path.abspath(__file__))
    if _HERE not in sys.path:
        sys.path.insert(0, _HERE)
    from runtime import HEAVY_DEPENDENCIES, bootstrap_worker_paths, find_repo_root
else:
    from .runtime import HEAVY_DEPENDENCIES, bootstrap_worker_paths, find_repo_root


def _shared_objects(module_file: str | None) -> List[str]:
    if not module_file:
        return []
    base = os.path.dirname(os.path.abspath(module_file))
    results: List[str] = []
    for pattern in ("*.dll", "*.pyd", "*.so", "*.dylib"):
        results.extend(glob.glob(os.path.join(base, "**", pattern), recursive=True))
    return sorted(set(results))


def _module_info(name: str) -> Dict[str, Any]:
    try:
        mod = importlib.import_module(name)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    module_file = getattr(mod, "__file__", None)
    return {
        "ok": True,
        "version": getattr(mod, "__version__", None),
        "file": module_file,
        "sharedLibCount": len(_shared_objects(module_file)),
    }


def main() -> None:
    bootstrap = bootstrap_worker_paths()
    repo_root = find_repo_root()
    assets = {
        "entrypoint": os.path.join(repo_root, "python", "worker", "main.py"),
        "implementation": os.path.join(repo_root, "python", "worker", "worker_impl.py"),
        "legacyShim": os.path.join(repo_root, "py", "cgal_worker.py"),
        "geodesicPackage": os.path.join(repo_root, "py", "geodesic"),
        "protocolDoc": os.path.join(repo_root, "docs", "python-worker-protocol.md"),
    }
    out = {
        "bootstrap": bootstrap,
        "dependencies": {name: _module_info(name) for name in HEAVY_DEPENDENCIES},
        "assets": assets,
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
