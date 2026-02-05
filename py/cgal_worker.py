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
        send({"type": "error", "jobId": "", "message": f"Bad JSON: {e}"})
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
        import vtk  # noqa: F401
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

    axis = str(msg.get("axis", "z")).lower()
    index = int(msg.get("index", 0))
    spacing = msg.get("spacing") or [1.0, 1.0, 1.0]
    origin = msg.get("origin") or [0.0, 0.0, 0.0]

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

    if axis == "x":
        idx = max(0, min(nx - 1, index))
        voi = (idx, idx, 0, max(0, ny - 1), 0, max(0, nz - 1))
        width, height = ny, nz
    elif axis == "y":
        idx = max(0, min(ny - 1, index))
        voi = (0, max(0, nx - 1), idx, idx, 0, max(0, nz - 1))
        width, height = nx, nz
    else:
        idx = max(0, min(nz - 1, index))
        voi = (0, max(0, nx - 1), 0, max(0, ny - 1), idx, idx)
        width, height = nx, ny

    extract = vtk.vtkExtractVOI()
    extract.SetInputData(img)
    extract.SetVOI(*voi)
    extract.Update()
    out = extract.GetOutput()
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

    vrange = vmax - vmin
    if vrange > 1e-8:
        scaled = (vals - vmin) / vrange
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

def main() -> None:
    while True:
        msg, payloads, eof = read_message()
        if eof:
            break
        if msg is None:
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
        elif msg.get("type") == "vtk_job":
            try:
                handle_vtk_job(msg, payloads)
            except Exception as e:
                send({
                    "type": "error",
                    "jobId": msg.get("jobId", ""),
                    "message": str(e),
                    "trace": traceback.format_exc(),
                })
        elif msg.get("type") == "vtk_preview":
            try:
                handle_vtk_preview(msg)
            except Exception as e:
                send({
                    "type": "error",
                    "jobId": msg.get("jobId", ""),
                    "message": str(e),
                    "trace": traceback.format_exc(),
                })
        elif msg.get("type") == "volume_slice":
            try:
                handle_volume_slice(msg, payloads)
            except Exception as e:
                send({
                    "type": "error",
                    "jobId": msg.get("jobId", ""),
                    "message": str(e),
                    "trace": traceback.format_exc(),
                })
        elif msg.get("type") == "volume_isosurface":
            try:
                handle_volume_isosurface(msg, payloads)
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
