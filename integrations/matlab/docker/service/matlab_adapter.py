from __future__ import annotations

import importlib
import os
import sys
from dataclasses import dataclass
from typing import Any, Callable

import numpy as np


def _as_real_matrix(values: np.ndarray, name: str) -> list[list[float]] | list[float]:
    reduced = np.real_if_close(values, tol=1000)
    if np.iscomplexobj(reduced):
        raise ValueError(f"{name} contains complex values. PR1 bridge returns real-valued JSON only.")
    if reduced.ndim == 1:
        return [float(x) for x in reduced.tolist()]
    if reduced.ndim == 2:
        return [[float(x) for x in row] for row in reduced.tolist()]
    raise ValueError(f"{name} has unsupported rank: {reduced.ndim}.")


@dataclass
class MatlabAdapterResult:
    eigenvalues: list[float]
    eigenvectors: list[list[float]]


class MatlabEigAdapter:
    def __init__(self, package_path: str | None):
        self.package_path = package_path
        self.package_loaded = False
        self.mode = "numpy-fallback"
        self._compiled_runner: Callable[[np.ndarray], MatlabAdapterResult] | None = None
        self._load_error: str | None = None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    def load(self) -> None:
        if not self.package_path:
            self._load_error = "MATLAB_PACKAGE_PATH is not set."
            return
        if not os.path.isdir(self.package_path):
            self._load_error = f"Compiled package path not found: {self.package_path}"
            return

        module_name = os.path.basename(os.path.normpath(self.package_path))
        parent_dir = os.path.dirname(os.path.normpath(self.package_path))
        if parent_dir and parent_dir not in sys.path:
            sys.path.insert(0, parent_dir)

        try:
            module = importlib.import_module(module_name)
            self._compiled_runner = self._build_runner_from_module(module)
            self.package_loaded = self._compiled_runner is not None
            if self.package_loaded:
                self.mode = "compiled-matlab-package"
                self._load_error = None
            else:
                self._load_error = f"Module '{module_name}' loaded but eig_demo callable was not found."
        except Exception as exc:  # noqa: BLE001
            self._load_error = f"Could not load compiled module '{module_name}': {exc}"

    def _build_runner_from_module(self, module: Any) -> Callable[[np.ndarray], MatlabAdapterResult] | None:
        direct = getattr(module, "eig_demo", None)
        if callable(direct):
            return lambda matrix: self._normalize_result(direct(matrix.tolist()))

        initializer = getattr(module, "initialize", None)
        if callable(initializer):
            runtime_obj = initializer()
            runtime_fn = getattr(runtime_obj, "eig_demo", None)
            if callable(runtime_fn):
                return lambda matrix: self._normalize_result(runtime_fn(matrix.tolist()))
        return None

    def _normalize_result(self, raw: Any) -> MatlabAdapterResult:
        if isinstance(raw, dict):
            values = np.asarray(raw.get("eigenvalues"))
            vectors = np.asarray(raw.get("eigenvectors"))
        elif isinstance(raw, (list, tuple)) and len(raw) == 2:
            values = np.asarray(raw[0])
            vectors = np.asarray(raw[1])
        else:
            values = np.asarray(getattr(raw, "eigenvalues", None))
            vectors = np.asarray(getattr(raw, "eigenvectors", None))

        if values.size == 0 or vectors.size == 0:
            raise ValueError("Compiled package returned empty eig result.")

        eigenvalues = _as_real_matrix(values.reshape(-1), "eigenvalues")
        eigenvectors = _as_real_matrix(vectors, "eigenvectors")
        if not isinstance(eigenvalues, list) or not isinstance(eigenvectors, list):
            raise ValueError("Unexpected eig result structure from compiled package.")
        if eigenvectors and not isinstance(eigenvectors[0], list):
            raise ValueError("Eigenvectors must be a 2D matrix.")
        return MatlabAdapterResult(eigenvalues=eigenvalues, eigenvectors=eigenvectors)  # type: ignore[arg-type]

    def run_eig(self, matrix: np.ndarray) -> MatlabAdapterResult:
        if self._compiled_runner is not None:
            return self._compiled_runner(matrix)

        values, vectors = np.linalg.eig(matrix)
        eigenvalues = _as_real_matrix(values.reshape(-1), "eigenvalues")
        eigenvectors = _as_real_matrix(vectors, "eigenvectors")
        if not isinstance(eigenvalues, list) or not isinstance(eigenvectors, list):
            raise ValueError("Unexpected eig result structure from NumPy fallback.")
        if eigenvectors and not isinstance(eigenvectors[0], list):
            raise ValueError("Eigenvectors must be a 2D matrix.")
        return MatlabAdapterResult(eigenvalues=eigenvalues, eigenvectors=eigenvectors)  # type: ignore[arg-type]

