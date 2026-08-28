#!/usr/bin/env python3
"""Runtime helpers for worker startup, path resolution, and packaging diagnostics."""

from __future__ import annotations

import importlib
import os
import sys
from typing import Any, Dict, List, Optional

REQUIRED_DEPENDENCIES = ["numpy", "scipy", "sympy", "vtk"]
OPTIONAL_DEPENDENCIES = ["pygalmesh", "CGAL"]
HEAVY_DEPENDENCIES = REQUIRED_DEPENDENCIES + OPTIONAL_DEPENDENCIES


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def _walk_up(path: str, max_levels: int = 8) -> List[str]:
    cur = os.path.abspath(path)
    out = [cur]
    for _ in range(max_levels):
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        out.append(parent)
        cur = parent
    return out


def _candidate_roots() -> List[str]:
    here = os.path.dirname(os.path.abspath(__file__))
    roots: List[str] = []
    roots.extend(_walk_up(here))
    roots.extend(_walk_up(os.getcwd()))

    if getattr(sys, "_MEIPASS", None):
        roots.extend(_walk_up(getattr(sys, "_MEIPASS")))
    if getattr(sys, "executable", None):
        roots.extend(_walk_up(os.path.dirname(os.path.abspath(sys.executable))))

    seen = set()
    ordered: List[str] = []
    for item in roots:
        key = os.path.normcase(os.path.normpath(item))
        if key in seen:
            continue
        seen.add(key)
        ordered.append(item)
    return ordered


def find_repo_root() -> str:
    for root in _candidate_roots():
        if os.path.exists(os.path.join(root, "package.json")) and os.path.isdir(os.path.join(root, "python")):
            return root
    return os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def resolve_worker_asset(*parts: str) -> Optional[str]:
    rel = os.path.join(*parts)
    for root in _candidate_roots():
        candidate = os.path.join(root, rel)
        if os.path.exists(candidate):
            return candidate
    return None


def _ensure_syspath(path: str) -> None:
    norm = os.path.normcase(os.path.normpath(path))
    existing = {os.path.normcase(os.path.normpath(p)) for p in sys.path if isinstance(p, str)}
    if norm not in existing:
        sys.path.insert(0, path)


def bootstrap_worker_paths() -> Dict[str, str]:
    repo_root = find_repo_root()
    worker_dir = os.path.dirname(os.path.abspath(__file__))
    legacy_py_dir = os.path.join(repo_root, "py")

    _ensure_syspath(worker_dir)
    _ensure_syspath(repo_root)
    if os.path.isdir(legacy_py_dir):
        _ensure_syspath(legacy_py_dir)

    return {
        "repo_root": repo_root,
        "worker_dir": worker_dir,
        "legacy_py_dir": legacy_py_dir,
        "frozen": "1" if is_frozen() else "0",
    }


def dependency_probe() -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "ok": True,
        "dependencies": {},
        "required": list(REQUIRED_DEPENDENCIES),
        "optional": list(OPTIONAL_DEPENDENCIES),
        "optionalMissing": [],
    }

    ordered = [(name, True) for name in REQUIRED_DEPENDENCIES] + [
        (name, False) for name in OPTIONAL_DEPENDENCIES
    ]
    for name, required in ordered:
        try:
            mod = importlib.import_module(name)
            result["dependencies"][name] = {
                "ok": True,
                "required": required,
                "file": getattr(mod, "__file__", None),
                "version": getattr(mod, "__version__", None),
            }
        except Exception as exc:
            if required:
                result["ok"] = False
            else:
                result["optionalMissing"].append(name)
            result["dependencies"][name] = {
                "ok": False,
                "required": required,
                "error": str(exc),
            }
    return result
