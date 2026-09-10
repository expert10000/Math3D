from __future__ import annotations

import json
import math
import os
import subprocess
import tempfile
from typing import Any, Dict, Iterable, List

import numpy as np


def _normalized_location(raw: Dict[str, Any], face_count: int, label: str) -> Dict[str, Any]:
    face = int(raw.get("face", -1))
    if face < 0 or face >= face_count:
        raise RuntimeError(f"{label} face out of range")
    bary_raw = raw.get("bary")
    if not isinstance(bary_raw, (list, tuple)) or len(bary_raw) != 3:
        raise RuntimeError(f"{label} barycentric coordinates must contain three values")
    bary = [float(value) for value in bary_raw]
    if not all(math.isfinite(value) for value in bary):
        raise RuntimeError(f"{label} barycentric coordinates must be finite")
    if min(bary) < -1e-8:
        raise RuntimeError(f"{label} lies outside its triangle")
    total = sum(bary)
    if abs(total) <= 1e-12:
        raise RuntimeError(f"{label} barycentric coordinates have zero sum")
    normalized = [max(0.0, value) / total for value in bary]
    out: Dict[str, Any] = {"face": face, "bary": normalized}
    if raw.get("vertex") is not None:
        out["vertex"] = int(raw["vertex"])
    if raw.get("sourceKind") in {"selected-vertex", "selected-point", "selection-set"}:
        out["sourceKind"] = raw["sourceKind"]
    return out


def _helper_candidates() -> Iterable[str]:
    configured = os.environ.get("MATH3D_CGAL_GEODESIC_EXE", "").strip()
    if configured:
        yield configured

    try:
        from python.worker.runtime import resolve_worker_asset

        for parts in (
            ("cgal-geodesic.exe",),
            ("cgal-geodesic",),
            ("build", "native", "cgal-geodesic", "cgal-geodesic.exe"),
            ("build", "native", "cgal-geodesic", "cgal-geodesic"),
        ):
            candidate = resolve_worker_asset(*parts)
            if candidate:
                yield candidate
    except Exception:
        return


def _resolve_helper() -> str:
    for candidate in _helper_candidates():
        if os.path.isfile(candidate):
            return os.path.abspath(candidate)
    raise RuntimeError(
        "CGAL surface shortest-path helper is unavailable. "
        "Run npm run setup:cgal-worker to build the accurate method."
    )


def _write_request(
    path: str,
    vertices: np.ndarray,
    faces: np.ndarray,
    sources: List[Dict[str, Any]],
    target: Dict[str, Any],
) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as stream:
        stream.write(f"{vertices.shape[0]} {faces.shape[0]} {len(sources)}\n")
        for x, y, z in vertices:
            stream.write(f"{float(x):.17g} {float(y):.17g} {float(z):.17g}\n")
        for a, b, c in faces:
            stream.write(f"{int(a)} {int(b)} {int(c)}\n")
        for location in sources:
            b0, b1, b2 = location["bary"]
            stream.write(f"{location['face']} {b0:.17g} {b1:.17g} {b2:.17g}\n")
        b0, b1, b2 = target["bary"]
        stream.write(f"{target['face']} {b0:.17g} {b1:.17g} {b2:.17g}\n")


def cgal_surface_shortest_path(
    V_in: np.ndarray,
    F_in: np.ndarray,
    sources_raw: List[Dict[str, Any]],
    target_raw: Dict[str, Any],
) -> Dict[str, Any]:
    vertices = np.asarray(V_in, dtype=np.float64)
    faces = np.asarray(F_in, dtype=np.int64)
    if vertices.ndim != 2 or vertices.shape[1] != 3 or vertices.shape[0] == 0:
        raise RuntimeError("V must be a non-empty Nx3 array")
    if faces.ndim != 2 or faces.shape[1] != 3 or faces.shape[0] == 0:
        raise RuntimeError("F must be a non-empty Mx3 array")
    if not np.isfinite(vertices).all():
        raise RuntimeError("V contains non-finite coordinates")
    if int(faces.min()) < 0 or int(faces.max()) >= int(vertices.shape[0]):
        raise RuntimeError("F contains vertex indices outside V")
    if not isinstance(sources_raw, list) or not sources_raw:
        raise RuntimeError("At least one surface source is required")

    sources = [
        _normalized_location(source, int(faces.shape[0]), f"Source {index}")
        for index, source in enumerate(sources_raw)
    ]
    target = _normalized_location(target_raw, int(faces.shape[0]), "Target")
    helper = _resolve_helper()

    request_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="math3d-geodesic-", suffix=".txt", delete=False) as request:
            request_path = request.name
        _write_request(request_path, vertices, faces, sources, target)
        completed = subprocess.run(
            [helper, request_path],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("CGAL surface shortest-path computation timed out") from exc
    finally:
        if request_path:
            try:
                os.unlink(request_path)
            except OSError:
                pass

    raw_output = (completed.stdout or "").strip().splitlines()
    if not raw_output:
        detail = (completed.stderr or "").strip()
        raise RuntimeError(detail or f"CGAL surface shortest-path helper exited with code {completed.returncode}")
    try:
        result = json.loads(raw_output[-1])
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid response from CGAL surface shortest-path helper: {raw_output[-1][:200]}") from exc
    if completed.returncode != 0 or not result.get("ok"):
        error = str(result.get("error") or completed.stderr or "CGAL surface shortest path failed").strip()
        return {"ok": False, "error": error, "disconnected": bool(result.get("disconnected"))}

    source_index = int(result.get("sourceIndex", -1))
    if source_index < 0 or source_index >= len(sources):
        raise RuntimeError("CGAL surface shortest path returned an invalid source index")
    polyline = result.get("polyline")
    if not isinstance(polyline, list) or len(polyline) < 2:
        raise RuntimeError("CGAL surface shortest path returned an empty polyline")
    return {
        "ok": True,
        "method": "cgal-surface-shortest-path",
        "polyline": polyline,
        "length": float(result["length"]),
        "sourceIndex": source_index,
        "source": sources[source_index],
        "target": target,
    }
