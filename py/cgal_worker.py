#!/usr/bin/env python3
import sys
import json
import base64
import traceback
import math
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

    def g_eval(u):
        x = u[0] + center[0]
        y = u[1] + center[1]
        z = u[2] + center[2]
        return float(f_sym(x, y, z) - iso)

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
    distance_bound = float(quality.get("distanceBound", quality.get("max_facet_distance", 0.02)))
    if "target_edge" in quality:
        try:
            distance_bound = float(quality.get("target_edge"))
        except Exception:
            pass

    send({"type": "progress", "jobId": job_id, "phase": "meshing", "pct": 20, "msg": "running CGAL surface mesher"})
    mesh = pygalmesh.generate_surface_mesh(
        dom,
        min_facet_angle=min_facet_angle,
        max_radius_surface_delaunay_ball=radius_bound,
        max_facet_distance=distance_bound,
        verbose=bool(msg.get("verbose", False)),
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
    except Exception as e:
        send({
            "type": "error",
            "jobId": job_id,
            "message": f"pygalmesh unavailable: {e}",
            "trace": traceback.format_exc(),
        })
        return

    send({"type": "health", "jobId": job_id, "ok": True})


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
        else:
            send({"type": "error", "jobId": msg.get("jobId", ""), "message": f"Unknown type: {msg.get('type')}"})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        send({"type": "error", "jobId": "", "message": str(e), "trace": traceback.format_exc()})
