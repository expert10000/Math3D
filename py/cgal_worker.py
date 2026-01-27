#!/usr/bin/env python3
import sys
import json
import base64
import traceback
import math
import os
import contextlib
from typing import Any, Dict, List, Optional, Tuple


def send(obj: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def b64_f32(arr) -> str:
    import numpy as np
    a = np.asarray(arr, dtype=np.float32)
    return base64.b64encode(a.tobytes(order="C")).decode("ascii")


def b64_u32(arr) -> str:
    import numpy as np
    a = np.asarray(arr, dtype=np.uint32)
    return base64.b64encode(a.tobytes(order="C")).decode("ascii")


def safe_lambdify(expr: str):
    import sympy as sp
    from sympy.parsing.sympy_parser import (
        parse_expr,
        standard_transformations,
        implicit_multiplication_application,
        convert_xor,
    )
    x, y, z = sp.symbols("x y z")
    allowed = {
        "x": x, "y": y, "z": z,
        "sin": sp.sin, "cos": sp.cos, "tan": sp.tan,
        "asin": sp.asin, "acos": sp.acos, "atan": sp.atan,
        "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
        "exp": sp.exp, "log": sp.log, "sqrt": sp.sqrt,
        "Abs": sp.Abs, "abs": sp.Abs,
        "pi": sp.pi, "e": sp.E,
        "min": sp.Min, "max": sp.Max,
    }
    transformations = standard_transformations + (implicit_multiplication_application, convert_xor)
    parsed = parse_expr(expr, local_dict=allowed, transformations=transformations)
    f = sp.lambdify((x, y, z), parsed, modules=["numpy"])
    return f


def norm3(a: float, b: float, c: float) -> float:
    return math.sqrt(a * a + b * b + c * c)


def bbox_center_radius(bmin: List[float], bmax: List[float]) -> Tuple[List[float], float]:
    cx = 0.5 * (bmin[0] + bmax[0])
    cy = 0.5 * (bmin[1] + bmax[1])
    cz = 0.5 * (bmin[2] + bmax[2])
    dx = (bmax[0] - bmin[0])
    dy = (bmax[1] - bmin[1])
    dz = (bmax[2] - bmin[2])
    r = 0.5 * norm3(dx, dy, dz)
    return [cx, cy, cz], r


def compute_scalar(name: Optional[str], f_xyz, pts_np):
    import numpy as np
    if not name:
        return None
    name = name.lower()
    if name == "f":
        return f_xyz(pts_np[:, 0], pts_np[:, 1], pts_np[:, 2]).astype(np.float32)
    if name in ("grad_norm", "grad", "gradnorm"):
        h = 1e-4
        x = pts_np[:, 0]
        y = pts_np[:, 1]
        z = pts_np[:, 2]
        fx1 = f_xyz(x + h, y, z)
        fx0 = f_xyz(x - h, y, z)
        fy1 = f_xyz(x, y + h, z)
        fy0 = f_xyz(x, y - h, z)
        fz1 = f_xyz(x, y, z + h)
        fz0 = f_xyz(x, y, z - h)
        gx = (fx1 - fx0) / (2 * h)
        gy = (fy1 - fy0) / (2 * h)
        gz = (fz1 - fz0) / (2 * h)
        return np.sqrt(gx * gx + gy * gy + gz * gz).astype(np.float32)
    return None


def is_truthy_env(name: str) -> bool:
    val = os.environ.get(name, "")
    return val.lower() in ("1", "true", "yes", "on", "y")


@contextlib.contextmanager
def redirect_stdout_to_stderr():
    saved = os.dup(1)
    try:
        os.dup2(2, 1)
        yield
    finally:
        os.dup2(saved, 1)
        os.close(saved)


def preflight_sample(f_xyz, iso: float, bmin: List[float], bmax: List[float], samples: int = 10):
    import numpy as np
    n = max(3, int(samples))
    xs = np.linspace(bmin[0], bmax[0], n, dtype=np.float64)
    ys = np.linspace(bmin[1], bmax[1], n, dtype=np.float64)
    zs = np.linspace(bmin[2], bmax[2], n, dtype=np.float64)
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing="ij")
    try:
        vals = f_xyz(X, Y, Z) - iso
    except Exception:
        return {"ok": False, "count": int(X.size), "nonfinite": int(X.size)}
    vals = np.asarray(vals, dtype=np.float64)
    finite = np.isfinite(vals)
    nonfinite = int(finite.size - int(finite.sum()))
    if finite.any():
        vmin = float(np.nanmin(vals))
        vmax = float(np.nanmax(vals))
    else:
        vmin = float("nan")
        vmax = float("nan")
    return {"ok": True, "count": int(finite.size), "nonfinite": nonfinite, "min": vmin, "max": vmax}


def estimate_triangles_from_bbox(bmin: List[float], bmax: List[float], target_edge: float) -> int:
    if not target_edge or target_edge <= 0:
        return 0
    center, r = bbox_center_radius(bmin, bmax)
    _ = center
    area = 4.0 * math.pi * r * r
    tri_area = (math.sqrt(3.0) / 4.0) * (target_edge * target_edge)
    est = int(max(0.0, area / max(1e-12, tri_area)))
    return est


def handle_job(msg: Dict[str, Any]) -> None:
    job_id = msg.get("jobId", "")
    expr = msg.get("expr", "") or msg.get("f", "")
    if not expr:
        raise RuntimeError("Missing expr")
    iso = float(msg.get("iso", 0.0))

    bbox = msg.get("bbox") or msg.get("domain")
    if not bbox or "min" not in bbox or "max" not in bbox:
        raise RuntimeError("Missing bbox")

    bmin = [float(v) for v in bbox["min"]]
    bmax = [float(v) for v in bbox["max"]]
    quality = msg.get("quality", {})
    scalar = msg.get("scalar", None)

    send({"type": "progress", "jobId": job_id, "phase": "parse", "pct": 5, "msg": "parsing expression"})
    f_sym = safe_lambdify(expr)

    center, r = bbox_center_radius(bmin, bmax)
    pad = float(msg.get("boundingPad", 1.05))
    r2 = (r * pad) ** 2

    safe_scale = 1e6 * (1.0 + abs(iso))

    def g_eval(u):
        x = u[0] + center[0]
        y = u[1] + center[1]
        z = u[2] + center[2]
        try:
            v = float(f_sym(x, y, z) - iso)
        except Exception:
            return safe_scale
        if not math.isfinite(v):
            return safe_scale
        return v

    try:
        import pygalmesh
    except Exception:
        raise RuntimeError("pygalmesh not installed (robust meshing unavailable)")

    class ImplicitDomain(pygalmesh.DomainBase):
        def __init__(self):
            super().__init__()

        def eval(self, x):
            return g_eval(x)

        def get_bounding_sphere_squared_radius(self):
            return r2

    dom = ImplicitDomain()

    min_facet_angle = float(quality.get("minFacetAngle", 30.0))
    radius_bound = float(quality.get("radiusBound", quality.get("max_radius_surface_delaunay_ball", 0.1)))
    distance_bound = float(
        quality.get(
            "distanceBound",
            quality.get("max_facet_distance", quality.get("target_edge", 0.02)),
        )
    )
    if "target_edge" in quality:
        try:
            distance_bound = float(quality.get("target_edge"))
        except Exception:
            pass
    if distance_bound > 0 and radius_bound > 0:
        radius_bound = min(radius_bound, distance_bound)

    preflight_n = int(msg.get("preflightSamples", 10))
    preflight = preflight_sample(f_sym, iso, bmin, bmax, preflight_n)
    if preflight.get("count"):
        nonfinite = preflight.get("nonfinite", 0)
        count = preflight.get("count", 1)
        frac = 100.0 * float(nonfinite) / float(max(1, count))
        if nonfinite > 0:
            send({
                "type": "progress",
                "jobId": job_id,
                "phase": "preflight",
                "pct": 10,
                "msg": f"preflight: {nonfinite}/{count} non-finite ({frac:.1f}%)",
            })
        else:
            send({"type": "progress", "jobId": job_id, "phase": "preflight", "pct": 10, "msg": "preflight: OK"})

        vmin = preflight.get("min")
        vmax = preflight.get("max")
        if (
            isinstance(vmin, (int, float))
            and isinstance(vmax, (int, float))
            and math.isfinite(vmin)
            and math.isfinite(vmax)
        ):
            if vmin * vmax > 0:
                min_abs = min(abs(vmin), abs(vmax))
                tol = max(1e-4, 2.0 * distance_bound)
                if min_abs > tol:
                    raise RuntimeError(
                        f"No sign change in domain (f-iso min={vmin:.3g}, max={vmax:.3g}). "
                        "Expand the domain or adjust iso/expr."
                    )

    est_tris = estimate_triangles_from_bbox(bmin, bmax, distance_bound)
    send({
        "type": "progress",
        "jobId": job_id,
        "phase": "setup",
        "pct": 15,
        "msg": f"edge~{distance_bound:.4g}, radius~{radius_bound:.4g}, estTris~{est_tris}",
    })

    verbose_flag = bool(msg.get("verbose", False)) or is_truthy_env("MATH3D_CGAL_VERBOSE")

    send({"type": "progress", "jobId": job_id, "phase": "meshing", "pct": 20, "msg": "running CGAL surface mesher"})
    if verbose_flag:
        with redirect_stdout_to_stderr():
            mesh = pygalmesh.generate_surface_mesh(
                dom,
                min_facet_angle=min_facet_angle,
                max_radius_surface_delaunay_ball=radius_bound,
                max_facet_distance=distance_bound,
                verbose=True,
            )
    else:
        mesh = pygalmesh.generate_surface_mesh(
            dom,
            min_facet_angle=min_facet_angle,
            max_radius_surface_delaunay_ball=radius_bound,
            max_facet_distance=distance_bound,
            verbose=False,
        )

    import numpy as np
    pts = np.asarray(mesh.points, dtype=np.float32)
    if pts.ndim != 2 or pts.shape[1] != 3:
        raise RuntimeError("Mesh points array is invalid")
    pts += np.asarray(center, dtype=np.float32)

    tri = None
    if hasattr(mesh, "cells_dict") and isinstance(mesh.cells_dict, dict):
        tri = mesh.cells_dict.get("triangle")
    if tri is None and hasattr(mesh, "cells"):
        for cell in mesh.cells:
            if isinstance(cell, tuple) and len(cell) == 2:
                if cell[0] == "triangle":
                    tri = cell[1]
                    break
            else:
                cell_type = getattr(cell, "type", None)
                cell_data = getattr(cell, "data", None)
                if cell_type == "triangle":
                    tri = cell_data
                    break
    if tri is None:
        raise RuntimeError("Triangle cells not found in mesh")

    tri = np.asarray(tri, dtype=np.uint32)
    if tri.ndim != 2 or tri.shape[1] != 3:
        tri = tri.reshape(-1, 3)

    send({"type": "progress", "jobId": job_id, "phase": "encode", "pct": 90, "msg": "encoding buffers"})

    positions_b64 = b64_f32(pts.reshape(-1))
    indices_b64 = b64_u32(tri.reshape(-1))

    scalar_arr = compute_scalar(scalar, f_sym, pts) if scalar else None

    res = {
        "type": "result",
        "jobId": job_id,
        "positions_b64": positions_b64,
        "indices_b64": indices_b64,
        "vertexCount": int(pts.shape[0]),
        "triCount": int(tri.shape[0]),
    }
    if scalar_arr is not None:
        res["scalar_b64"] = b64_f32(scalar_arr)

    send(res)


def handle_health(msg: Dict[str, Any]) -> None:
    job_id = msg.get("jobId", "")
    try:
        import pygalmesh  # noqa: F401
        import sympy  # noqa: F401
        import numpy  # noqa: F401
        import scipy  # noqa: F401
    except Exception as e:
        send({
            "type": "error",
            "jobId": job_id,
            "message": f"Python deps unavailable: {e}",
            "trace": traceback.format_exc(),
        })
        return

    send({"type": "health", "jobId": job_id, "ok": True})


def handle_geodesic_heat(msg: Dict[str, Any]) -> None:
    job_id = msg.get("jobId", "")
    mesh = msg.get("mesh") or {}
    V = mesh.get("V")
    F = mesh.get("F")
    if V is None or F is None:
        raise RuntimeError("Missing mesh V/F for geodesic heat")
    source = msg.get("source")
    target = msg.get("target")
    if not source or not target:
        raise RuntimeError("Missing source/target for geodesic heat")

    import numpy as np
    from geodesic.heat import heat_geodesic

    V_np = np.asarray(V, dtype=np.float64)
    F_np = np.asarray(F, dtype=np.int32)
    if V_np.ndim != 2 or V_np.shape[1] != 3:
        raise RuntimeError("V must be Nx3")
    if F_np.ndim != 2 or F_np.shape[1] != 3:
        raise RuntimeError("F must be Mx3")
    face_count = int(F_np.shape[0])
    src_face = int(source.get("face", -1))
    tgt_face = int(target.get("face", -1))
    if src_face < 0 or src_face >= face_count or tgt_face < 0 or tgt_face >= face_count:
        raise RuntimeError("Source/target face out of range")

    options = msg.get("options", {}) or {}
    res = heat_geodesic(V_np, F_np, source, target, options)
    res["type"] = "geodesic_heat_result"
    res["jobId"] = job_id
    send(res)


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception as e:
            send({"type": "error", "jobId": "", "message": f"Bad JSON: {e}"})
            continue

        if msg.get("type") == "mesh_job":
            try:
                handle_job(msg)
            except Exception as e:
                send({
                    "type": "error",
                    "jobId": msg.get("jobId", ""),
                    "message": str(e),
                    "trace": traceback.format_exc(),
                })
        elif msg.get("type") == "ping":
            send({"type": "pong", "jobId": msg.get("jobId", "")})
        elif msg.get("type") == "health":
            handle_health(msg)
        elif msg.get("type") == "geodesic_heat":
            try:
                handle_geodesic_heat(msg)
            except Exception as e:
                send({
                    "type": "error",
                    "jobId": msg.get("jobId", ""),
                    "message": str(e),
                    "trace": traceback.format_exc(),
                })
        else:
            send({"type": "error", "jobId": msg.get("jobId", ""), "message": f"Unknown type: {msg.get('type')}"})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        send({"type": "error", "jobId": "", "message": str(e), "trace": traceback.format_exc()})
