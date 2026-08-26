#!/usr/bin/env python3
import sys
import json
import base64
import traceback
import math
import os
import contextlib
from typing import Any, Dict, List, Optional, Tuple

if __package__ in (None, ""):
    _HERE = os.path.dirname(os.path.abspath(__file__))
    if _HERE not in sys.path:
        sys.path.insert(0, _HERE)
    from runtime import bootstrap_worker_paths, dependency_probe
else:
    from .runtime import bootstrap_worker_paths, dependency_probe

bootstrap_worker_paths()

WORKER_VERSION = "1.0.0"
PROTOCOL_VERSION = "2026-03-15"


def send(obj: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def send_error(
    job_id: str,
    code: str,
    message: str,
    details: Optional[Any] = None,
    request_type: Optional[str] = None,
) -> None:
    payload: Dict[str, Any] = {
        "type": "error",
        "jobId": job_id or "",
        "ok": False,
        "code": code,
        "message": str(message),
        "error": {
            "code": code,
            "message": str(message),
            "details": details,
        },
    }
    if details is not None:
        payload["details"] = details
    if request_type:
        payload["requestType"] = request_type
    send(payload)


def send_binary(obj: Dict[str, Any], parts: List[Tuple[str, bytes]]) -> None:
    meta = dict(obj)
    meta["binary"] = [{"name": name, "bytes": len(data)} for name, data in parts]
    sys.stdout.write(json.dumps(meta) + "\n")
    sys.stdout.flush()
    for _name, data in parts:
        if data:
            sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def read_exact(count: int) -> bytes:
    if count <= 0:
        return b""
    out = bytearray()
    while len(out) < count:
        chunk = sys.stdin.buffer.read(count - len(out))
        if not chunk:
            raise EOFError("Unexpected EOF while reading binary payload")
        out.extend(chunk)
    return bytes(out)


def read_message() -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, bytes]], bool]:
    line = sys.stdin.buffer.readline()
    if not line:
        return None, None, True
    line = line.strip()
    if not line:
        return None, None, False
    try:
        msg = json.loads(line)
    except Exception as e:
        send_error("", "BAD_JSON", f"Bad JSON: {e}")
        return None, None, False
    payloads = None
    parts = msg.get("binary")
    if isinstance(parts, list):
        payloads = {}
        for part in parts:
            name = str(part.get("name", ""))
            size = int(part.get("bytes", 0) or 0)
            payloads[name] = read_exact(size)
    return msg, payloads, False

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
        "ok": True,
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
    probe = dependency_probe()
    dependencies = probe.get("dependencies") or {}
    if not probe.get("ok"):
        missing_required = [
            name
            for name, info in dependencies.items()
            if info and bool(info.get("required")) and not bool(info.get("ok"))
        ]
        detail = {
            "missingRequired": missing_required,
            "dependencies": dependencies,
            "optionalMissing": probe.get("optionalMissing", []),
        }
        send_error(
            job_id,
            "DEPENDENCY_MISSING",
            f"Python deps unavailable: missing required modules ({', '.join(missing_required)})",
            detail,
            "health",
        )
        return

    send(
        {
            "type": "health",
            "jobId": job_id,
            "ok": True,
            "version": WORKER_VERSION,
            "protocol": PROTOCOL_VERSION,
            "dependencies": dependencies,
            "optionalMissing": probe.get("optionalMissing", []),
        }
    )


def handle_validate_mesh(msg: Dict[str, Any], payloads: Optional[Dict[str, bytes]]) -> None:
    import numpy as np

    job_id = msg.get("jobId", "")
    if not payloads:
        raise RuntimeError("Missing mesh validation payloads")
    positions_raw = payloads.get("positions")
    indices_raw = payloads.get("indices")
    if not positions_raw or not indices_raw:
        raise RuntimeError("Missing mesh validation buffers")

    send({"type": "progress", "jobId": job_id, "phase": "validate", "pct": 5, "msg": "decoding mesh buffers"})
    positions = np.frombuffer(positions_raw, dtype=np.float32)
    indices = np.frombuffer(indices_raw, dtype=np.uint32)
    vertex_count = int(positions.size // 3)
    face_count = int(indices.size // 3)
    if vertex_count <= 0 or face_count <= 0:
        raise RuntimeError("Mesh validation requires non-empty indexed triangle mesh")
    pts = positions[: vertex_count * 3].reshape((-1, 3))
    faces = indices[: face_count * 3].reshape((-1, 3))

    send({"type": "progress", "jobId": job_id, "phase": "validate", "pct": 25, "msg": "checking faces and edges"})
    parent = list(range(vertex_count))
    rank = [0] * vertex_count

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a: int, b: int) -> None:
        ra = find(a)
        rb = find(b)
        if ra == rb:
            return
        if rank[ra] < rank[rb]:
            parent[ra] = rb
        elif rank[ra] > rank[rb]:
            parent[rb] = ra
        else:
            parent[rb] = ra
            rank[ra] += 1

    edge_counts: Dict[Tuple[int, int], int] = {}
    edge_dirs: Dict[Tuple[int, int], List[Tuple[int, int]]] = {}
    seen_faces = set()
    invalid_faces = 0
    degenerate_faces = 0
    duplicate_faces = 0
    used_vertices = set()

    for tri in faces:
        a = int(tri[0])
        b = int(tri[1])
        c = int(tri[2])
        if a < 0 or b < 0 or c < 0 or a >= vertex_count or b >= vertex_count or c >= vertex_count:
            invalid_faces += 1
            continue
        if a == b or b == c or c == a:
            degenerate_faces += 1
            continue
        key_face = tuple(sorted((a, b, c)))
        if key_face in seen_faces:
            duplicate_faces += 1
        seen_faces.add(key_face)
        used_vertices.update((a, b, c))
        union(a, b)
        union(b, c)
        for u, v in ((a, b), (b, c), (c, a)):
            key = (u, v) if u < v else (v, u)
            edge_counts[key] = edge_counts.get(key, 0) + 1
            edge_dirs.setdefault(key, []).append((u, v))

    boundary_edges = sum(1 for count in edge_counts.values() if count == 1)
    non_manifold_edges = sum(1 for count in edge_counts.values() if count > 2)
    edge_count = len(edge_counts)
    component_roots = {find(v) for v in used_vertices}
    component_count = len(component_roots)

    inconsistent_orientation_edges = 0
    for incidences in edge_dirs.values():
        if len(incidences) != 2:
            continue
        if incidences[0] == incidences[1]:
            inconsistent_orientation_edges += 1

    manifold = non_manifold_edges == 0 and invalid_faces == 0 and degenerate_faces == 0
    watertight = manifold and boundary_edges == 0
    oriented = inconsistent_orientation_edges == 0

    send({"type": "progress", "jobId": job_id, "phase": "validate", "pct": 65, "msg": "sampling self-intersection broad phase"})
    options = msg.get("options", {}) if isinstance(msg.get("options", {}), dict) else {}
    sample_limit = int(options.get("selfIntersectionSampleLimit", 1200) or 1200)
    sample_limit = max(0, min(sample_limit, 5000))
    valid_face_mask = np.all(faces < vertex_count, axis=1) if face_count > 0 else np.zeros((0,), dtype=bool)
    valid_faces = faces[valid_face_mask]
    sampled_faces = int(min(sample_limit, valid_faces.shape[0]))
    suspected_pairs = 0
    eps = 1e-7

    def segment_triangle_hit(p0, p1, t0, t1, t2) -> bool:
        direction = p1 - p0
        edge1 = t1 - t0
        edge2 = t2 - t0
        h = np.cross(direction, edge2)
        det = float(np.dot(edge1, h))
        if -eps < det < eps:
            return False
        inv_det = 1.0 / det
        s = p0 - t0
        u = inv_det * float(np.dot(s, h))
        if u < eps or u > 1.0 - eps:
            return False
        q = np.cross(s, edge1)
        v = inv_det * float(np.dot(direction, q))
        if v < eps or u + v > 1.0 - eps:
            return False
        t = inv_det * float(np.dot(edge2, q))
        return eps < t < 1.0 - eps

    def triangles_cross(a_pts, b_pts) -> bool:
        for i0, i1 in ((0, 1), (1, 2), (2, 0)):
            if segment_triangle_hit(a_pts[i0], a_pts[i1], b_pts[0], b_pts[1], b_pts[2]):
                return True
        for i0, i1 in ((0, 1), (1, 2), (2, 0)):
            if segment_triangle_hit(b_pts[i0], b_pts[i1], a_pts[0], a_pts[1], a_pts[2]):
                return True
        return False

    if sampled_faces > 1 and sample_limit > 0:
        if valid_faces.shape[0] > sampled_faces:
            sample_indices = np.linspace(0, valid_faces.shape[0] - 1, sampled_faces, dtype=np.int64)
            sampled = valid_faces[sample_indices]
        else:
            sampled = valid_faces
        tri_pts = pts[sampled]
        bmins = tri_pts.min(axis=1)
        bmaxs = tri_pts.max(axis=1)
        for i in range(sampled_faces):
            a_min = bmins[i]
            a_max = bmaxs[i]
            a_set = {int(sampled[i, 0]), int(sampled[i, 1]), int(sampled[i, 2])}
            for j in range(i + 1, sampled_faces):
                if a_max[0] < bmins[j, 0] or bmaxs[j, 0] < a_min[0]:
                    continue
                if a_max[1] < bmins[j, 1] or bmaxs[j, 1] < a_min[1]:
                    continue
                if a_max[2] < bmins[j, 2] or bmaxs[j, 2] < a_min[2]:
                    continue
                if a_set.intersection((int(sampled[j, 0]), int(sampled[j, 1]), int(sampled[j, 2]))):
                    continue
                if triangles_cross(tri_pts[i], tri_pts[j]):
                    suspected_pairs += 1

    diagnostics = [
        f"Watertight: {'yes' if watertight else 'no'}",
        f"Manifold: {'yes' if manifold else 'no'}",
        f"Connected components: {component_count}",
        f"Boundary edges: {boundary_edges}",
        f"Non-manifold edges: {non_manifold_edges}",
        f"Invalid faces: {invalid_faces}",
        f"Degenerate faces: {degenerate_faces}",
        f"Duplicate faces: {duplicate_faces}",
        f"Orientation-consistent winding: {'yes' if oriented else 'no'}",
        f"Self-intersection broad phase: {suspected_pairs} suspected pair(s) from {sampled_faces} sampled faces",
    ]
    warnings = []
    if not watertight:
        warnings.append("Mesh is not watertight.")
    if not manifold:
        warnings.append("Mesh is not manifold or contains invalid/degenerate faces.")
    if component_count > 1:
        warnings.append(f"Mesh has {component_count} connected components.")
    if not oriented:
        warnings.append(f"Mesh has {inconsistent_orientation_edges} inconsistent shared-edge orientation(s).")
    if suspected_pairs > 0:
        warnings.append("Possible self-intersections detected by sampled AABB broad phase.")
    if valid_faces.shape[0] > sampled_faces:
        warnings.append("Self-intersection check was sampled; increase the limit for deeper inspection.")

    send(
        {
            "type": "cgal_validate_result",
            "jobId": job_id,
            "ok": True,
            "vertexCount": vertex_count,
            "faceCount": face_count,
            "edgeCount": edge_count,
            "componentCount": component_count,
            "boundaryEdgeCount": boundary_edges,
            "nonManifoldEdgeCount": non_manifold_edges,
            "invalidFaceCount": invalid_faces,
            "degenerateFaceCount": degenerate_faces,
            "duplicateFaceCount": duplicate_faces,
            "watertight": watertight,
            "manifold": manifold,
            "oriented": oriented,
            "selfIntersection": {
                "checked": sample_limit > 0,
                "suspectedPairs": suspected_pairs,
                "sampledFaces": sampled_faces,
                "truncated": valid_faces.shape[0] > sampled_faces,
            },
            "diagnostics": diagnostics,
            "warnings": warnings,
        }
    )


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


def handle_vtk_preview(msg: Dict[str, Any]) -> None:
    job_id = msg.get("jobId", "")
    expr = msg.get("expr", "") or msg.get("f", "")
    if not expr:
        raise RuntimeError("Missing expr for vtk preview")
    iso = float(msg.get("iso", 0.0))
    bbox = msg.get("bbox") or msg.get("domain")
    if not bbox or "min" not in bbox or "max" not in bbox:
        raise RuntimeError("Missing bbox for vtk preview")
    bmin = [float(v) for v in bbox["min"]]
    bmax = [float(v) for v in bbox["max"]]

    resolution = int(msg.get("resolution", 80))
    resolution = max(8, min(220, resolution))

    try:
        import numpy as np
        import vtk
        from vtk.util import numpy_support as nps
    except Exception as e:
        raise RuntimeError(f"VTK preview requires numpy+vtk: {e}")

    send({"type": "progress", "jobId": job_id, "phase": "parse", "pct": 5, "msg": "parsing expression"})
    f_sym = safe_lambdify(expr)

    xs = np.linspace(bmin[0], bmax[0], resolution, dtype=np.float32)
    ys = np.linspace(bmin[1], bmax[1], resolution, dtype=np.float32)
    zs = np.linspace(bmin[2], bmax[2], resolution, dtype=np.float32)
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing="ij")
    try:
        vals = f_sym(X, Y, Z).astype(np.float32) - np.float32(iso)
    except Exception as e:
        raise RuntimeError(f"Failed to evaluate expression on grid: {e}")

    safe_scale = np.float32(1e6 * (1.0 + abs(iso)))
    vals = np.where(np.isfinite(vals), vals, safe_scale).astype(np.float32, copy=False)

    img = vtk.vtkImageData()
    img.SetDimensions(resolution, resolution, resolution)
    dx = (bmax[0] - bmin[0]) / max(1, resolution - 1)
    dy = (bmax[1] - bmin[1]) / max(1, resolution - 1)
    dz = (bmax[2] - bmin[2]) / max(1, resolution - 1)
    img.SetOrigin(bmin[0], bmin[1], bmin[2])
    img.SetSpacing(dx, dy, dz)

    flat = vals.ravel(order="F")
    scalars = nps.numpy_to_vtk(flat, deep=1, array_type=vtk.VTK_FLOAT)
    img.GetPointData().SetScalars(scalars)

    send({"type": "progress", "jobId": job_id, "phase": "meshing", "pct": 35, "msg": "running VTK flying edges"})
    if hasattr(vtk, "vtkFlyingEdges3D"):
        fe = vtk.vtkFlyingEdges3D()
        fe.SetInputData(img)
        fe.SetValue(0, 0.0)
        fe.Update()
        poly = fe.GetOutput()
    else:
        mc = vtk.vtkMarchingCubes()
        mc.SetInputData(img)
        mc.SetValue(0, 0.0)
        mc.Update()
        poly = mc.GetOutput()

    target_faces = msg.get("targetFaces")
    target_reduction = msg.get("targetReduction")
    if target_faces or target_reduction:
        try:
            tri = vtk_triangles_only(poly)
            face_count = max(1, int(tri.GetNumberOfPolys()))
            reduction = None
            if isinstance(target_faces, (int, float)) and target_faces > 0:
                reduction = 1.0 - float(target_faces) / float(face_count)
            if reduction is None:
                reduction = float(target_reduction or 0.5)
            reduction = min(max(reduction, 0.0), 0.95)
            dec = vtk.vtkDecimatePro()
            dec.SetInputData(tri)
            dec.SetTargetReduction(reduction)
            dec.PreserveTopologyOn()
            dec.BoundaryVertexDeletionOff()
            dec.Update()
            poly = dec.GetOutput()
        except Exception:
            pass

    send({"type": "progress", "jobId": job_id, "phase": "encode", "pct": 85, "msg": "encoding buffers"})
    pos_out, idx_out, normals_out, vcount, tcount = vtk_poly_to_buffers(poly, True)
    parts: List[Tuple[str, bytes]] = [("positions", pos_out), ("indices", idx_out)]
    if normals_out:
        parts.append(("normals", normals_out))

    send_binary(
        {
            "type": "vtk_result",
            "jobId": job_id,
            "ok": True,
            "vertexCount": vcount,
            "triCount": tcount,
        },
        parts,
    )


def handle_volume_slice(msg: Dict[str, Any], payloads: Optional[Dict[str, bytes]]) -> None:
    job_id = msg.get("jobId", "")
    dims = msg.get("dims") or msg.get("dimensions")
    if not dims or len(dims) != 3:
        raise RuntimeError("Missing dims for volume slice")
    if not payloads or "scalars" not in payloads:
        raise RuntimeError("Missing scalars payload for volume slice")

    spacing = msg.get("spacing") or [1.0, 1.0, 1.0]
    origin = msg.get("origin") or [0.0, 0.0, 0.0]
    plane = msg.get("plane") or None
    window = msg.get("window") or None

    try:
        import numpy as np
        import vtk
        from vtk.util import numpy_support as nps
    except Exception as e:
        raise RuntimeError(f"VTK volume slice requires numpy+vtk: {e}")

    nx, ny, nz = [int(v) for v in dims]
    total = max(0, nx * ny * nz)
    scalars_np = np.frombuffer(payloads["scalars"], dtype=np.float32)
    if scalars_np.size < total:
        raise RuntimeError("Scalars buffer too small for volume slice")
    if scalars_np.size > total:
        scalars_np = scalars_np[:total]

    img = vtk.vtkImageData()
    img.SetDimensions(nx, ny, nz)
    img.SetSpacing(float(spacing[0]), float(spacing[1]), float(spacing[2]))
    img.SetOrigin(float(origin[0]), float(origin[1]), float(origin[2]))
    scalars_vtk = nps.numpy_to_vtk(scalars_np, deep=1, array_type=vtk.VTK_FLOAT)
    img.GetPointData().SetScalars(scalars_vtk)

    def normalize_vec(vec, fallback):
        try:
            v = [float(vec[0]), float(vec[1]), float(vec[2])]
        except Exception:
            return fallback
        n = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
        if n <= 0:
            return fallback
        return [v[0] / n, v[1] / n, v[2] / n]

    if plane:
        center = plane.get("center") or [0.0, 0.0, 0.0]
        u = normalize_vec(plane.get("u"), [1.0, 0.0, 0.0])
        v = normalize_vec(plane.get("v"), [0.0, 1.0, 0.0])
        n = normalize_vec(plane.get("normal"), [0.0, 0.0, 1.0])
        width_world = float(plane.get("width", 0.0) or 0.0)
        height_world = float(plane.get("height", 0.0) or 0.0)
        resolution = plane.get("resolution") or plane.get("dims")
        width = int(resolution[0]) if resolution and len(resolution) >= 2 else max(1, nx)
        height = int(resolution[1]) if resolution and len(resolution) >= 2 else max(1, ny)
    else:
        axis = str(msg.get("axis", "z")).lower()
        index = int(msg.get("index", 0))
        if axis == "x":
            idx = max(0, min(nx - 1, index))
            width, height = ny, nz
            u = [0.0, 1.0, 0.0]
            v = [0.0, 0.0, 1.0]
            n = [1.0, 0.0, 0.0]
            center = [
                float(origin[0] + idx * spacing[0]),
                float(origin[1] + (ny - 1) * spacing[1] * 0.5),
                float(origin[2] + (nz - 1) * spacing[2] * 0.5),
            ]
            width_world = max(0.0, (ny - 1) * float(spacing[1]))
            height_world = max(0.0, (nz - 1) * float(spacing[2]))
        elif axis == "y":
            idx = max(0, min(ny - 1, index))
            width, height = nx, nz
            u = [1.0, 0.0, 0.0]
            v = [0.0, 0.0, 1.0]
            n = [0.0, 1.0, 0.0]
            center = [
                float(origin[0] + (nx - 1) * spacing[0] * 0.5),
                float(origin[1] + idx * spacing[1]),
                float(origin[2] + (nz - 1) * spacing[2] * 0.5),
            ]
            width_world = max(0.0, (nx - 1) * float(spacing[0]))
            height_world = max(0.0, (nz - 1) * float(spacing[2]))
        else:
            idx = max(0, min(nz - 1, index))
            width, height = nx, ny
            u = [1.0, 0.0, 0.0]
            v = [0.0, 1.0, 0.0]
            n = [0.0, 0.0, 1.0]
            center = [
                float(origin[0] + (nx - 1) * spacing[0] * 0.5),
                float(origin[1] + (ny - 1) * spacing[1] * 0.5),
                float(origin[2] + idx * spacing[2]),
            ]
            width_world = max(0.0, (nx - 1) * float(spacing[0]))
            height_world = max(0.0, (ny - 1) * float(spacing[1]))

    width = max(1, int(width))
    height = max(1, int(height))
    spacing_u = width_world / (width - 1) if width > 1 else max(width_world, 1.0)
    spacing_v = height_world / (height - 1) if height > 1 else max(height_world, 1.0)

    axes = vtk.vtkMatrix4x4()
    for i in range(3):
        axes.SetElement(i, 0, float(u[i]))
        axes.SetElement(i, 1, float(v[i]))
        axes.SetElement(i, 2, float(n[i]))
        axes.SetElement(i, 3, float(center[i]))

    reslice = vtk.vtkImageReslice()
    reslice.SetInputData(img)
    reslice.SetOutputDimensionality(2)
    reslice.SetInterpolationModeToLinear()
    reslice.SetResliceAxes(axes)
    reslice.SetOutputOrigin(-0.5 * width_world, -0.5 * height_world, 0.0)
    reslice.SetOutputSpacing(float(spacing_u), float(spacing_v), 1.0)
    reslice.SetOutputExtent(0, width - 1, 0, height - 1, 0, 0)
    reslice.Update()

    out = reslice.GetOutput()
    out_scalars = out.GetPointData().GetScalars()
    if out_scalars is None:
        raise RuntimeError("VTK volume slice missing scalars")

    vals = nps.vtk_to_numpy(out_scalars)
    vals = np.asarray(vals, dtype=np.float32, order="C")
    expected = int(max(0, width * height))
    if vals.size < expected:
        raise RuntimeError("VTK volume slice returned empty data")
    if vals.size > expected:
        vals = vals[:expected]
    vals = vals.reshape((height, width))

    finite = np.isfinite(vals)
    if finite.any():
        vmin = float(np.nanmin(vals))
        vmax = float(np.nanmax(vals))
    else:
        vmin = 0.0
        vmax = 0.0

    low = None
    high = None
    if isinstance(window, dict):
        low = window.get("low")
        high = window.get("high")
    if low is None or high is None:
        low = vmin
        high = vmax

    try:
        low = float(low)
        high = float(high)
    except Exception:
        low = vmin
        high = vmax

    vrange = high - low
    if vrange > 1e-8:
        scaled = (vals - low) / vrange
        scaled = np.where(finite, scaled, 0.0)
        gray = np.clip(scaled * 255.0, 0.0, 255.0).astype(np.uint8)
    else:
        gray = np.zeros((height, width), dtype=np.uint8)

    rgba = np.empty((height, width, 4), dtype=np.uint8)
    rgba[..., 0] = gray
    rgba[..., 1] = gray
    rgba[..., 2] = gray
    rgba[..., 3] = 255

    send_binary(
        {
            "type": "volume_slice_result",
            "jobId": job_id,
            "ok": True,
            "width": int(width),
            "height": int(height),
            "format": "rgba8",
            "min": vmin,
            "max": vmax,
        },
        [("data", rgba.tobytes(order="C"))],
    )


def handle_volume_isosurface(msg: Dict[str, Any], payloads: Optional[Dict[str, bytes]]) -> None:
    job_id = msg.get("jobId", "")
    dims = msg.get("dims") or msg.get("dimensions")
    if not dims or len(dims) != 3:
        raise RuntimeError("Missing dims for volume isosurface")
    if not payloads or "scalars" not in payloads:
        raise RuntimeError("Missing scalars payload for volume isosurface")

    iso = float(msg.get("iso", 0.0))
    spacing = msg.get("spacing") or [1.0, 1.0, 1.0]
    origin = msg.get("origin") or [0.0, 0.0, 0.0]

    try:
        import numpy as np
        import vtk
        from vtk.util import numpy_support as nps
    except Exception as e:
        raise RuntimeError(f"VTK volume isosurface requires numpy+vtk: {e}")

    nx, ny, nz = [int(v) for v in dims]
    total = max(0, nx * ny * nz)
    scalars_np = np.frombuffer(payloads["scalars"], dtype=np.float32)
    if scalars_np.size < total:
        raise RuntimeError("Scalars buffer too small for volume isosurface")
    if scalars_np.size > total:
        scalars_np = scalars_np[:total]

    img = vtk.vtkImageData()
    img.SetDimensions(nx, ny, nz)
    img.SetSpacing(float(spacing[0]), float(spacing[1]), float(spacing[2]))
    img.SetOrigin(float(origin[0]), float(origin[1]), float(origin[2]))
    scalars_vtk = nps.numpy_to_vtk(scalars_np, deep=1, array_type=vtk.VTK_FLOAT)
    img.GetPointData().SetScalars(scalars_vtk)

    if hasattr(vtk, "vtkFlyingEdges3D"):
        fe = vtk.vtkFlyingEdges3D()
        fe.SetInputData(img)
        fe.SetValue(0, iso)
        fe.Update()
        poly = fe.GetOutput()
    else:
        mc = vtk.vtkMarchingCubes()
        mc.SetInputData(img)
        mc.SetValue(0, iso)
        mc.Update()
        poly = mc.GetOutput()

    pos_out, idx_out, normals_out, vcount, tcount = vtk_poly_to_buffers(poly, True)
    parts: List[Tuple[str, bytes]] = [("positions", pos_out), ("indices", idx_out)]
    if normals_out:
        parts.append(("normals", normals_out))

    send_binary(
        {
            "type": "volume_isosurface_result",
            "jobId": job_id,
            "ok": True,
            "vertexCount": vcount,
            "triCount": tcount,
        },
        parts,
    )


def handle_volume_distance(msg: Dict[str, Any], payloads: Optional[Dict[str, bytes]]) -> None:
    job_id = msg.get("jobId", "")
    dims = msg.get("dims") or msg.get("dimensions")
    if not dims or len(dims) != 3:
        raise RuntimeError("Missing dims for volume distance")
    if not payloads or "positions" not in payloads or "indices" not in payloads:
        raise RuntimeError("Missing mesh payload for volume distance")

    spacing = msg.get("spacing") or [1.0, 1.0, 1.0]
    origin = msg.get("origin") or [0.0, 0.0, 0.0]
    signed = bool(msg.get("signed", False))
    use_winding = bool(msg.get("windingNumber", signed))

    try:
        import numpy as np
        import vtk
        from vtk.util import numpy_support as nps
    except Exception as e:
        raise RuntimeError(f"VTK volume distance requires numpy+vtk: {e}")

    nx, ny, nz = [int(v) for v in dims]
    total = max(0, nx * ny * nz)
    if total <= 0:
        raise RuntimeError("Volume distance requires positive dims")

    poly = vtk_poly_from_buffers(payloads["positions"], payloads["indices"])

    implicit = vtk.vtkImplicitPolyDataDistance()
    implicit.SetInput(poly)

    minx = float(origin[0])
    miny = float(origin[1])
    minz = float(origin[2])
    maxx = minx + float(spacing[0]) * max(0, nx - 1)
    maxy = miny + float(spacing[1]) * max(0, ny - 1)
    maxz = minz + float(spacing[2]) * max(0, nz - 1)

    sample = vtk.vtkSampleFunction()
    sample.SetImplicitFunction(implicit)
    sample.SetModelBounds(minx, maxx, miny, maxy, minz, maxz)
    sample.SetSampleDimensions(nx, ny, nz)
    sample.ComputeNormalsOff()
    sample.Update()

    out = sample.GetOutput()
    out_scalars = out.GetPointData().GetScalars()
    if out_scalars is None:
        raise RuntimeError("VTK distance returned empty scalars")
    vals_raw = nps.vtk_to_numpy(out_scalars)
    vals_raw = np.asarray(vals_raw, dtype=np.float32, order="C")
    if vals_raw.size < total:
        raise RuntimeError("VTK distance returned too few samples")
    if vals_raw.size > total:
        vals_raw = vals_raw[:total]

    vals_mag = np.abs(vals_raw)
    vals = vals_raw if signed else vals_mag
    if signed and use_winding:
        inside_ok = False
        try:
            geom = vtk.vtkImageDataGeometryFilter()
            geom.SetInputData(out)
            geom.Update()
            select = vtk.vtkSelectEnclosedPoints()
            select.SetInputData(geom.GetOutput())
            select.SetSurfaceData(poly)
            select.Update()
            inside_arr = select.GetOutput().GetPointData().GetArray("SelectedPoints")
            if inside_arr is not None:
                inside = nps.vtk_to_numpy(inside_arr)
                if inside.size >= total:
                    sign = np.where(inside[:total] > 0.5, -1.0, 1.0).astype(np.float32)
                    vals = vals_mag * sign
                    inside_ok = True
        except Exception:
            inside_ok = False
        if not inside_ok:
            vals = vals_raw

    send_binary(
        {
            "type": "volume_distance_result",
            "jobId": job_id,
            "ok": True,
            "dims": [nx, ny, nz],
        },
        [("scalars", vals.tobytes(order="C"))],
    )


def handle_volume_streamlines(msg: Dict[str, Any], payloads: Optional[Dict[str, bytes]]) -> None:
    job_id = msg.get("jobId", "")
    dims = msg.get("dims") or msg.get("dimensions")
    if not dims or len(dims) != 3:
        raise RuntimeError("Missing dims for volume streamlines")
    if not payloads or "vectors" not in payloads:
        raise RuntimeError("Missing vectors payload for volume streamlines")

    spacing = msg.get("spacing") or [1.0, 1.0, 1.0]
    origin = msg.get("origin") or [0.0, 0.0, 0.0]
    seeds = msg.get("seeds") or []
    step_size = float(msg.get("stepSize", 0.0) or 0.0)
    max_steps = int(msg.get("maxSteps", 0) or 0)
    max_length = float(msg.get("maxLength", 0.0) or 0.0)

    try:
        import numpy as np
        import vtk
        from vtk.util import numpy_support as nps
    except Exception as e:
        raise RuntimeError(f"VTK streamlines requires numpy+vtk: {e}")

    nx, ny, nz = [int(v) for v in dims]
    total = max(0, nx * ny * nz)
    if total <= 0:
        raise RuntimeError("Streamlines require positive dims")

    vec_np = np.frombuffer(payloads["vectors"], dtype=np.float32)
    if vec_np.size < total * 3:
        raise RuntimeError("Vectors buffer too small for streamlines")
    if vec_np.size > total * 3:
        vec_np = vec_np[: total * 3]
    vec_np = vec_np.reshape((total, 3))

    img = vtk.vtkImageData()
    img.SetDimensions(nx, ny, nz)
    img.SetSpacing(float(spacing[0]), float(spacing[1]), float(spacing[2]))
    img.SetOrigin(float(origin[0]), float(origin[1]), float(origin[2]))
    vectors_vtk = nps.numpy_to_vtk(vec_np, deep=1, array_type=vtk.VTK_FLOAT)
    vectors_vtk.SetNumberOfComponents(3)
    vectors_vtk.SetName("vectors")
    img.GetPointData().SetVectors(vectors_vtk)
    img.GetPointData().SetActiveVectors("vectors")

    if not isinstance(seeds, list) or not seeds:
        send(
            {
                "type": "volume_streamlines_result",
                "jobId": job_id,
                "ok": True,
                "lines": [],
            }
        )
        return

    points = vtk.vtkPoints()
    seed_count = 0
    for s in seeds:
        if not isinstance(s, (list, tuple)) or len(s) < 3:
            continue
        try:
            x, y, z = float(s[0]), float(s[1]), float(s[2])
        except Exception:
            continue
        points.InsertNextPoint(x, y, z)
        seed_count += 1

    if seed_count == 0:
        send(
            {
                "type": "volume_streamlines_result",
                "jobId": job_id,
                "ok": True,
                "lines": [],
            }
        )
        return

    seed_poly = vtk.vtkPolyData()
    seed_poly.SetPoints(points)

    tracer = vtk.vtkStreamTracer()
    tracer.SetInputData(img)
    tracer.SetSourceData(seed_poly)
    tracer.SetIntegratorTypeToRungeKutta4()
    tracer.SetIntegrationDirectionToBoth()
    if step_size > 0:
        tracer.SetInitialIntegrationStep(step_size)
        tracer.SetMinimumIntegrationStep(step_size * 0.2)
        tracer.SetMaximumIntegrationStep(step_size * 2.0)
    if max_steps > 0:
        tracer.SetMaximumNumberOfSteps(max_steps)
    if max_length > 0:
        tracer.SetMaximumPropagation(max_length)
    tracer.Update()

    out = tracer.GetOutput()
    out_points = out.GetPoints()
    if out_points is None or out.GetNumberOfPoints() == 0:
        send(
            {
                "type": "volume_streamlines_result",
                "jobId": job_id,
                "ok": True,
                "lines": [],
            }
        )
        return

    pts_np = nps.vtk_to_numpy(out_points.GetData())
    lines = out.GetLines()
    if lines is None:
        send(
            {
                "type": "volume_streamlines_result",
                "jobId": job_id,
                "ok": True,
                "lines": [],
            }
        )
        return

    cell_data = nps.vtk_to_numpy(lines.GetData())
    if cell_data is None or cell_data.size == 0:
        send(
            {
                "type": "volume_streamlines_result",
                "jobId": job_id,
                "ok": True,
                "lines": [],
            }
        )
        return

    polylines: List[List[List[float]]] = []
    idx = 0
    total_cells = cell_data.size
    while idx < total_cells:
        npts = int(cell_data[idx])
        idx += 1
        if npts <= 1 or idx + npts > total_cells:
            idx += max(0, npts)
            continue
        ids = cell_data[idx : idx + npts]
        idx += npts
        line: List[List[float]] = []
        for pid in ids:
            p = pts_np[int(pid)]
            line.append([float(p[0]), float(p[1]), float(p[2])])
        if len(line) >= 2:
            polylines.append(line)

    send(
        {
            "type": "volume_streamlines_result",
            "jobId": job_id,
            "ok": True,
            "lines": polylines,
        }
    )


def vtk_poly_from_buffers(pos_bytes: bytes, idx_bytes: bytes):
    import numpy as np
    import vtk
    from vtk.util import numpy_support as nps

    positions = np.frombuffer(pos_bytes, dtype=np.float32)
    if positions.size % 3 != 0:
        raise RuntimeError("Positions buffer size not divisible by 3")
    indices = np.frombuffer(idx_bytes, dtype=np.uint32)
    if indices.size % 3 != 0:
        raise RuntimeError("Indices buffer size not divisible by 3")

    pts = positions.reshape(-1, 3)
    tri = indices.reshape(-1, 3).astype(np.int64, copy=False)
    tri_count = int(tri.shape[0])

    vtk_points = vtk.vtkPoints()
    vtk_points.SetData(nps.numpy_to_vtk(pts, deep=1))

    conn = np.empty(tri_count * 4, dtype=np.int64)
    conn[0::4] = 3
    conn[1::4] = tri[:, 0]
    conn[2::4] = tri[:, 1]
    conn[3::4] = tri[:, 2]
    vtk_ids = nps.numpy_to_vtkIdTypeArray(conn, deep=1)
    cells = vtk.vtkCellArray()
    cells.SetCells(tri_count, vtk_ids)

    poly = vtk.vtkPolyData()
    poly.SetPoints(vtk_points)
    poly.SetPolys(cells)
    return poly


def vtk_compute_normals(poly):
    import vtk
    normals = vtk.vtkPolyDataNormals()
    normals.SetInputData(poly)
    normals.ComputePointNormalsOn()
    normals.ComputeCellNormalsOff()
    normals.ConsistencyOn()
    normals.AutoOrientNormalsOn()
    normals.SplittingOff()
    normals.Update()
    return normals.GetOutput()


def vtk_triangles_only(poly):
    import vtk
    tri = vtk.vtkTriangleFilter()
    tri.SetInputData(poly)
    tri.Update()
    return tri.GetOutput()


def vtk_poly_to_buffers(poly, compute_normals: bool):
    import numpy as np
    from vtk.util import numpy_support as nps

    out_poly = vtk_triangles_only(poly)
    if compute_normals:
        out_poly = vtk_compute_normals(out_poly)

    pts_vtk = out_poly.GetPoints()
    if pts_vtk is None:
        raise RuntimeError("VTK output missing points")
    pts_np = nps.vtk_to_numpy(pts_vtk.GetData())
    if pts_np is None or pts_np.size == 0:
        raise RuntimeError("VTK output has empty points")
    pts_np = np.asarray(pts_np, dtype=np.float32)

    polys = out_poly.GetPolys()
    if polys is None:
        raise RuntimeError("VTK output missing polys")
    cell_data = nps.vtk_to_numpy(polys.GetData())
    if cell_data is None or cell_data.size == 0:
        raise RuntimeError("VTK output has empty polys")
    if cell_data.size % 4 != 0:
        raise RuntimeError("VTK polys are not triangles")
    cells = cell_data.reshape(-1, 4)
    if not np.all(cells[:, 0] == 3):
        raise RuntimeError("Non-triangle cells found after triangle filter")
    indices = cells[:, 1:4].astype(np.uint32, copy=False)

    normals_buf = None
    if compute_normals:
        n_arr = out_poly.GetPointData().GetNormals()
        if n_arr is not None:
            normals_np = nps.vtk_to_numpy(n_arr)
            if normals_np is not None and normals_np.size == pts_np.size:
                normals_buf = np.asarray(normals_np, dtype=np.float32).tobytes(order="C")

    return (
        pts_np.tobytes(order="C"),
        indices.tobytes(order="C"),
        normals_buf,
        int(pts_np.shape[0]),
        int(indices.shape[0]),
    )


def vtk_prepare_poly_for_boolean(poly):
    import vtk

    tri = vtk.vtkTriangleFilter()
    tri.SetInputData(poly)
    tri.Update()

    clean = vtk.vtkCleanPolyData()
    clean.SetInputData(tri.GetOutput())
    clean.PointMergingOn()
    clean.Update()
    return clean.GetOutput()


def handle_vtk_job(msg: Dict[str, Any], payloads: Optional[Dict[str, bytes]]) -> None:
    job_id = msg.get("jobId", "")
    op = msg.get("op") or msg.get("action")
    if not op:
        raise RuntimeError("Missing op for vtk_job")
    if not payloads:
        raise RuntimeError("Missing binary payloads for vtk_job")
    pos_bytes = payloads.get("positions")
    idx_bytes = payloads.get("indices")
    if not pos_bytes or not idx_bytes:
        raise RuntimeError("vtk_job requires positions + indices buffers")

    try:
        import vtk  # noqa: F401
    except Exception as e:
        raise RuntimeError(f"VTK not available: {e}")

    options = msg.get("options") or {}
    compute_normals = bool(options.get("computeNormals", True))

    poly = vtk_poly_from_buffers(pos_bytes, idx_bytes)
    if op == "vtk_clean_normals":
        import vtk
        clean = vtk.vtkCleanPolyData()
        clean.SetInputData(poly)
        clean.PointMergingOn()
        clean.Update()
        tri = vtk_triangles_only(clean.GetOutput())
        out_poly = vtk_compute_normals(tri)
        compute_normals = True
    elif op == "vtk_decimate":
        import vtk
        tri = vtk_triangles_only(poly)
        target_reduction = options.get("targetReduction")
        target_faces = options.get("targetFaces")
        reduction = None
        if isinstance(target_faces, (int, float)) and target_faces > 0:
            face_count = max(1, int(tri.GetNumberOfPolys()))
            reduction = 1.0 - float(target_faces) / float(face_count)
        if reduction is None:
            reduction = float(target_reduction or 0.5)
        reduction = min(max(reduction, 0.0), 0.95)
        dec = vtk.vtkDecimatePro()
        dec.SetInputData(tri)
        dec.SetTargetReduction(reduction)
        dec.PreserveTopologyOn()
        dec.BoundaryVertexDeletionOff()
        dec.Update()
        out_poly = dec.GetOutput()
    elif op == "vtk_smooth":
        import vtk
        tri = vtk_triangles_only(poly)
        iterations = int(options.get("iterations", 20))
        iterations = max(1, min(200, iterations))
        passband = float(options.get("passband", 0.1))
        passband = min(max(passband, 0.001), 1.0)
        smooth = vtk.vtkWindowedSincPolyDataFilter()
        smooth.SetInputData(tri)
        smooth.SetNumberOfIterations(iterations)
        smooth.SetPassBand(passband)
        smooth.NormalizeCoordinatesOn()
        smooth.FeatureEdgeSmoothingOff()
        smooth.BoundarySmoothingOn()
        smooth.NonManifoldSmoothingOn()
        smooth.Update()
        out_poly = smooth.GetOutput()
    else:
        raise RuntimeError(f"Unknown vtk op: {op}")

    pos_out, idx_out, normals_out, vcount, tcount = vtk_poly_to_buffers(out_poly, compute_normals)
    parts: List[Tuple[str, bytes]] = [("positions", pos_out), ("indices", idx_out)]
    if normals_out:
        parts.append(("normals", normals_out))

    send_binary(
        {
            "type": "vtk_result",
            "jobId": job_id,
            "ok": True,
            "vertexCount": vcount,
            "triCount": tcount,
        },
        parts,
    )


def handle_vtk_boolean(msg: Dict[str, Any], payloads: Optional[Dict[str, bytes]]) -> None:
    job_id = msg.get("jobId", "")
    operation = str(msg.get("operation") or "union").lower()
    if not payloads:
        raise RuntimeError("Missing binary payloads for vtk boolean")

    pos_a = payloads.get("positionsA")
    idx_a = payloads.get("indicesA")
    pos_b = payloads.get("positionsB")
    idx_b = payloads.get("indicesB")
    if not pos_a or not idx_a or not pos_b or not idx_b:
        raise RuntimeError("vtk boolean requires positionsA/indicesA/positionsB/indicesB")

    try:
        import vtk
    except Exception as e:
        raise RuntimeError(f"VTK not available: {e}")

    options = msg.get("options") or {}
    compute_normals = bool(options.get("computeNormals", True))

    poly_a = vtk_prepare_poly_for_boolean(vtk_poly_from_buffers(pos_a, idx_a))
    poly_b = vtk_prepare_poly_for_boolean(vtk_poly_from_buffers(pos_b, idx_b))

    if operation in ("union", "difference", "intersection"):
        boolean = vtk.vtkBooleanOperationPolyDataFilter()
        if operation == "union":
            boolean.SetOperationToUnion()
        elif operation == "difference":
            boolean.SetOperationToDifference()
            if hasattr(boolean, "ReorientDifferenceCellsOn"):
                boolean.ReorientDifferenceCellsOn()
        else:
            boolean.SetOperationToIntersection()
        boolean.SetInputData(0, poly_a)
        boolean.SetInputData(1, poly_b)
        boolean.Update()
        out_poly = boolean.GetOutput()
    elif operation == "imprint":
        inter = vtk.vtkIntersectionPolyDataFilter()
        inter.SetInputData(0, poly_a)
        inter.SetInputData(1, poly_b)
        if hasattr(inter, "SplitFirstOutputOff"):
            inter.SplitFirstOutputOff()
        if hasattr(inter, "SplitSecondOutputOff"):
            inter.SplitSecondOutputOff()
        inter.Update()
        lines = inter.GetOutput(0)
        if lines is None or lines.GetNumberOfPoints() <= 0:
            raise RuntimeError("No intersection curve found for imprint.")
        radius = float(options.get("curveRadius", 0.0) or 0.0)
        if radius <= 0:
            bounds = poly_a.GetBounds()
            if bounds:
                dx = float(bounds[1] - bounds[0])
                dy = float(bounds[3] - bounds[2])
                dz = float(bounds[5] - bounds[4])
                diag = max(1e-6, (dx * dx + dy * dy + dz * dz) ** 0.5)
                radius = max(1e-4, diag * 0.0025)
            else:
                radius = 1e-3
        tube = vtk.vtkTubeFilter()
        tube.SetInputData(lines)
        tube.SetRadius(radius)
        tube.SetNumberOfSides(12)
        tube.CappingOn()
        tube.Update()
        out_poly = tube.GetOutput()
    else:
        raise RuntimeError(f"Unsupported vtk boolean operation: {operation}")

    out_poly = vtk_triangles_only(out_poly)
    if out_poly is None or out_poly.GetNumberOfPoints() <= 0 or out_poly.GetNumberOfPolys() <= 0:
        raise RuntimeError("VTK boolean produced empty output.")

    pos_out, idx_out, normals_out, vcount, tcount = vtk_poly_to_buffers(out_poly, compute_normals)
    parts: List[Tuple[str, bytes]] = [("positions", pos_out), ("indices", idx_out)]
    if normals_out:
        parts.append(("normals", normals_out))

    send_binary(
        {
            "type": "vtk_result",
            "jobId": job_id,
            "ok": True,
            "vertexCount": vcount,
            "triCount": tcount,
        },
        parts,
    )

def main() -> None:
    alias_map = {
        "mesh.generate": "mesh_job",
        "mesh.validate": "validate_mesh",
        "mesh.transform": "vtk_job",
        "mesh.boolean": "vtk_boolean",
        "mesh.preview": "vtk_preview",
        "volume.slice": "volume_slice",
        "volume.isosurface": "volume_isosurface",
        "volume.distance": "volume_distance",
        "volume.streamlines": "volume_streamlines",
        "geodesic.heat": "geodesic_heat",
    }

    supported = [
        "ping",
        "version",
        "health",
        "mesh.generate",
        "mesh.validate",
        "mesh.transform",
        "mesh.boolean",
        "mesh.preview",
        "volume.slice",
        "volume.isosurface",
        "volume.distance",
        "volume.streamlines",
        "geodesic.heat",
    ]

    def run_handler(msg: Dict[str, Any], handler, payloads: Optional[Dict[str, bytes]] = None) -> None:
        try:
            if payloads is None:
                handler(msg)
            else:
                handler(msg, payloads)
        except Exception as e:
            send_error(
                msg.get("jobId", ""),
                "WORKER_EXCEPTION",
                str(e),
                {"trace": traceback.format_exc()},
                str(msg.get("type", "")),
            )

    while True:
        msg, payloads, eof = read_message()
        if eof:
            break
        if msg is None:
            continue

        msg_type_raw = str(msg.get("type", ""))
        msg_type = alias_map.get(msg_type_raw, msg_type_raw)

        if msg_type == "mesh_job":
            run_handler(msg, handle_job)
        elif msg_type == "validate_mesh":
            run_handler(msg, handle_validate_mesh, payloads)
        elif msg_type == "vtk_job":
            run_handler(msg, handle_vtk_job, payloads)
        elif msg_type == "vtk_boolean":
            run_handler(msg, handle_vtk_boolean, payloads)
        elif msg_type == "vtk_preview":
            run_handler(msg, handle_vtk_preview)
        elif msg_type == "volume_slice":
            run_handler(msg, handle_volume_slice, payloads)
        elif msg_type == "volume_isosurface":
            run_handler(msg, handle_volume_isosurface, payloads)
        elif msg_type == "volume_distance":
            run_handler(msg, handle_volume_distance, payloads)
        elif msg_type == "volume_streamlines":
            run_handler(msg, handle_volume_streamlines, payloads)
        elif msg_type == "ping":
            send(
                {
                    "type": "pong",
                    "jobId": msg.get("jobId", ""),
                    "ok": True,
                    "version": WORKER_VERSION,
                    "protocol": PROTOCOL_VERSION,
                }
            )
        elif msg_type == "version":
            send(
                {
                    "type": "version",
                    "jobId": msg.get("jobId", ""),
                    "ok": True,
                    "version": WORKER_VERSION,
                    "protocol": PROTOCOL_VERSION,
                }
            )
        elif msg_type == "health":
            handle_health(msg)
        elif msg_type == "geodesic_heat":
            run_handler(msg, handle_geodesic_heat)
        else:
            send_error(
                msg.get("jobId", ""),
                "UNKNOWN_REQUEST",
                f"Unknown request type: {msg_type_raw}",
                {"supported": supported},
                msg_type_raw,
            )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        send_error("", "WORKER_FATAL", str(e), {"trace": traceback.format_exc()}, "__main__")
