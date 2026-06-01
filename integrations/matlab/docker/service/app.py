from __future__ import annotations

import os
import time
from typing import Any

import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS

from matlab_adapter import MatlabEigAdapter


def _validate_square_numeric_matrix(payload: Any) -> np.ndarray:
    if not isinstance(payload, list) or not payload:
        raise ValueError("matrix must be a non-empty 2D array.")
    if not all(isinstance(row, list) for row in payload):
        raise ValueError("matrix must be a 2D array of rows.")

    row_count = len(payload)
    col_count = len(payload[0])
    if col_count == 0:
        raise ValueError("matrix must contain at least one column.")
    if row_count != col_count:
        raise ValueError("matrix must be square (n x n).")
    if any(len(row) != col_count for row in payload):
        raise ValueError("matrix rows must all have the same length.")

    matrix = np.asarray(payload, dtype=float)
    if matrix.ndim != 2 or matrix.shape[0] != matrix.shape[1]:
        raise ValueError("matrix must be square (n x n).")
    if not np.isfinite(matrix).all():
        raise ValueError("matrix must contain only finite numeric values.")
    return matrix


app = Flask(__name__)
CORS(app)

adapter = MatlabEigAdapter(os.getenv("MATLAB_PACKAGE_PATH"))
adapter.load()


@app.get("/health")
def health():
    response = {
        "status": "ok",
        "runtime": "matlab-runtime",
        "packageLoaded": bool(adapter.package_loaded or adapter.mode == "numpy-fallback"),
        "mode": adapter.mode,
    }
    if adapter.load_error:
        response["warning"] = adapter.load_error
    return jsonify(response)


@app.post("/eig")
def eig_endpoint():
    body = request.get_json(silent=True) or {}
    try:
        matrix = _validate_square_numeric_matrix(body.get("matrix"))
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400

    start = time.perf_counter()
    try:
        eig_result = adapter.run_eig(matrix)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"ok": False, "error": f"eig computation failed: {exc}"}), 500
    elapsed_ms = int((time.perf_counter() - start) * 1000)

    return jsonify(
        {
            "ok": True,
            "inputShape": [int(matrix.shape[0]), int(matrix.shape[1])],
            "eigenvalues": eig_result.eigenvalues,
            "eigenvectors": eig_result.eigenvectors,
            "elapsedMs": elapsed_ms,
        }
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8765"))
    app.run(host="0.0.0.0", port=port)

