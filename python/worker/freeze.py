#!/usr/bin/env python3
"""Build standalone worker executable with PyInstaller."""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from typing import List


def has_module(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def truthy_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on", "y"}


def repo_root() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, "..", ".."))


def base_hidden_imports() -> List[str]:
    return [
        "geodesic",
        "geodesic.heat",
        "geodesic.mesh_ops",
        "numpy",
        "scipy",
        "scipy.sparse",
        "scipy.sparse.linalg",
        "sympy",
        "sympy.parsing.sympy_parser",
        "vtk",
        "vtkmodules",
        "vtkmodules.util",
        "vtkmodules.util.numpy_support",
        "CGAL",
        "CGAL.CGAL_Kernel",
        "CGAL.CGAL_Polyhedron_3",
        "CGAL.CGAL_Polygon_mesh_processing",
    ]


def excluded_modules() -> List[str]:
    # Keep PyInstaller focused on worker dependencies only.
    return [
        "IPython",
        "PyQt5",
        "PyQt6",
        "PySide2",
        "PySide6",
        "dask",
        "distributed",
        "jax",
        "keras",
        "matplotlib",
        "notebook",
        "numba",
        "onnx",
        "pandas",
        "pygame",
        "pymc3",
        "pytest",
        "sklearn",
        "tensorflow",
        "tf_keras",
        "tkinter",
        "torch",
        "torchvision",
        "torchaudio",
        "xarray",
    ]


def main() -> int:
    root = repo_root()
    entrypoint = os.path.join(root, "python", "worker", "main.py")
    dist_dir = os.path.join(root, "build", "python-worker-dist")
    work_dir = os.path.join(root, "build", "python-worker-build")
    spec_dir = os.path.join(root, "build", "python-worker-spec")

    if not os.path.exists(entrypoint):
        print(f"[freeze] missing entrypoint: {entrypoint}", file=sys.stderr)
        return 2

    cmd: List[str] = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--console",
        "--name",
        "worker",
        "--distpath",
        dist_dir,
        "--workpath",
        work_dir,
        "--specpath",
        spec_dir,
        "--paths",
        os.path.join(root, "python", "worker"),
        "--paths",
        os.path.join(root, "py"),
        "--collect-binaries",
        "vtkmodules",
        "--collect-data",
        "vtkmodules",
        entrypoint,
    ]

    for name in base_hidden_imports():
        cmd.extend(["--hidden-import", name])

    for name in excluded_modules():
        cmd.extend(["--exclude-module", name])

    if has_module("pygalmesh"):
        cmd.extend([
            "--hidden-import",
            "pygalmesh",
            "--collect-binaries",
            "pygalmesh",
            "--collect-data",
            "pygalmesh",
        ])
    else:
        message = "[freeze] pygalmesh not installed; mesh.generate will be unavailable in this build."
        if truthy_env("MATH3D_REQUIRE_PYGALMESH"):
            print(message, file=sys.stderr)
            print("[freeze] MATH3D_REQUIRE_PYGALMESH is set, failing worker build.", file=sys.stderr)
            return 4
        print(message)

    if has_module("CGAL"):
        cmd.extend([
            "--hidden-import",
            "CGAL",
            "--hidden-import",
            "CGAL.CGAL_Kernel",
            "--hidden-import",
            "CGAL.CGAL_Polyhedron_3",
            "--hidden-import",
            "CGAL.CGAL_Polygon_mesh_processing",
            "--collect-binaries",
            "CGAL",
            "--collect-data",
            "CGAL",
        ])
    else:
        message = "[freeze] CGAL Python bindings not installed; native boolean will use VTK fallback."
        if truthy_env("MATH3D_REQUIRE_CGAL"):
            print(message, file=sys.stderr)
            print("[freeze] MATH3D_REQUIRE_CGAL is set, failing worker build.", file=sys.stderr)
            return 5
        print(message)

    print("[freeze] running:", " ".join(cmd))
    env = dict(os.environ)
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONNOUSERSITE", "1")
    env.setdefault("PYTHONPATH", "")
    result = subprocess.run(cmd, cwd=root, env=env)
    if result.returncode != 0:
        return result.returncode

    exe_name = "worker.exe" if sys.platform.startswith("win") else "worker"
    exe_path = os.path.join(dist_dir, exe_name)
    if not os.path.exists(exe_path):
        print(f"[freeze] expected output missing: {exe_path}", file=sys.stderr)
        return 3

    print(f"[freeze] built: {exe_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
