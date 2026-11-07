"""Exact dependency preflight for a distributable frozen worker."""

from __future__ import annotations

import importlib.metadata as metadata
import os
from pathlib import Path
import re
from typing import Callable


OPTIONAL = {"cgal": "MATH3D_REQUIRE_CGAL", "pygalmesh": "MATH3D_REQUIRE_PYGALMESH"}


def pins(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([A-Za-z0-9_.-]+)==([^\s=]+)", line)
        if match is None:
            raise ValueError(f"Worker dependency must have an exact version: {line}")
        name = match.group(1).lower().replace("_", "-")
        if name in result:
            raise ValueError(f"Duplicate worker dependency pin: {name}")
        result[name] = match.group(2)
    return result


def verify_installed(root: Path, version: Callable[[str], str] = metadata.version,
                     environment: dict[str, str] | None = None) -> dict[str, str]:
    environment = dict(os.environ if environment is None else environment)
    expected = pins(root / "requirements.freeze.txt")
    for name, value in pins(root / "build-requirements.freeze.txt").items():
        if name in expected:
            raise ValueError(f"Worker build and runtime pins overlap: {name}")
        expected[name] = value
    installed: dict[str, str] = {}
    for name, pinned in expected.items():
        try:
            actual = version(name)
        except metadata.PackageNotFoundError:
            flag = OPTIONAL.get(name)
            if flag and environment.get(flag, "").strip().lower() not in {"1", "true", "yes", "on"}:
                continue
            raise RuntimeError(f"Worker dependency {name}=={pinned} is missing") from None
        if actual != pinned:
            raise RuntimeError(f"Worker dependency {name}: expected {pinned}, found {actual}")
        installed[name] = actual
    return installed
