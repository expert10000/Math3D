"""Opt-in quantitative checks for the standalone CGAL worker on real meshes.

Run with a Python environment containing numpy and vtk after building the native
worker. This intentionally is not part of the default fast test suite.
"""

from __future__ import annotations

import argparse
import os
import struct
import subprocess
import time
from pathlib import Path

import numpy as np
import vtk
from vtk.util import numpy_support


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "tests" / "assets" / "meshes" / "standard"
DEFAULT_WORKER = ROOT / "build" / "native" / "cgal-worker" / "Release" / (
    "math3d-cgal-worker.exe" if os.name == "nt" else "math3d-cgal-worker"
)
FRAME_HEADER = struct.Struct("<4sHHIIIII")
MESH_HEADER = struct.Struct("<4sHHIIIIII")
OPERATIONS = {"union": 1, "difference": 2, "intersection": 3}
CUBE_INDICES = np.asarray(
    [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
        0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
    ],
    dtype="<u4",
)


def read_mesh(path: Path) -> tuple[bytes, bytes]:
    reader = vtk.vtkOBJReader() if path.suffix.lower() == ".obj" else vtk.vtkSTLReader()
    reader.SetFileName(str(path))

    triangles = vtk.vtkTriangleFilter()
    triangles.SetInputConnection(reader.GetOutputPort())
    clean = vtk.vtkCleanPolyData()
    clean.SetInputConnection(triangles.GetOutputPort())
    normals = vtk.vtkPolyDataNormals()
    normals.SetInputConnection(clean.GetOutputPort())
    normals.ConsistencyOn()
    normals.AutoOrientNormalsOn()
    normals.SplittingOff()
    normals.Update()
    poly = normals.GetOutput()
    if poly.GetPoints() is None or poly.GetNumberOfPolys() == 0:
        raise RuntimeError(f"No triangle mesh in {path}")

    positions = np.ascontiguousarray(
        numpy_support.vtk_to_numpy(poly.GetPoints().GetData()), dtype="<f4"
    )
    cells = numpy_support.vtk_to_numpy(poly.GetPolys().GetData())
    if cells.size % 4 or np.any(cells.reshape(-1, 4)[:, 0] != 3):
        raise RuntimeError(f"Non-triangle cells in {path}")
    indices = np.ascontiguousarray(cells.reshape(-1, 4)[:, 1:], dtype="<u4")
    return positions.tobytes(), indices.tobytes()


def shifted_copy(pos_bytes: bytes, fraction: float) -> bytes:
    points = np.frombuffer(pos_bytes, dtype="<f4").copy().reshape(-1, 3)
    points[:, 0] += fraction * float(np.ptp(points[:, 0]))
    return points.tobytes()


def surface_cutter(pos_bytes: bytes, idx_bytes: bytes) -> tuple[bytes, bytes]:
    points = np.frombuffer(pos_bytes, dtype="<f4").reshape(-1, 3)
    faces = np.frombuffer(idx_bytes, dtype="<u4").reshape(-1, 3)
    center = points[faces[0]].astype(np.float64).mean(axis=0)
    half_edge = 0.12 * float(np.max(np.ptp(points, axis=0)))
    if half_edge <= 0:
        raise RuntimeError("Cannot construct a cutter for a zero-size mesh")
    corners = np.asarray(
        [
            [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
            [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
        ],
        dtype=np.float64,
    )
    return np.asarray(center + half_edge * corners, dtype="<f4").tobytes(), CUBE_INDICES.tobytes()


def metrics(label: str, pos_bytes: bytes, idx_bytes: bytes) -> dict:
    flat_points = np.frombuffer(pos_bytes, dtype="<f4")
    flat_indices = np.frombuffer(idx_bytes, dtype="<u4")
    if flat_points.size == 0 or flat_points.size % 3 or flat_indices.size == 0 or flat_indices.size % 3:
        raise RuntimeError(f"{label}: empty or malformed triangle buffers")
    points = flat_points.reshape(-1, 3).astype(np.float64)
    faces = flat_indices.reshape(-1, 3)
    if not np.all(np.isfinite(points)) or np.any(faces >= len(points)):
        raise RuntimeError(f"{label}: non-finite coordinates or out-of-range indices")

    edges = np.sort(
        np.concatenate((faces[:, (0, 1)], faces[:, (1, 2)], faces[:, (2, 0)])), axis=1
    )
    _, edge_counts = np.unique(edges, axis=0, return_counts=True)
    boundary = int(np.count_nonzero(edge_counts == 1))
    non_manifold = int(np.count_nonzero(edge_counts > 2))
    if boundary or non_manifold:
        raise RuntimeError(f"{label}: {boundary} boundary edges, {non_manifold} non-manifold edges")

    center = points.mean(axis=0)
    a = points[faces[:, 0]] - center
    b = points[faces[:, 1]] - center
    c = points[faces[:, 2]] - center
    volume = float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum(dtype=np.float64) / 6.0)
    if not np.isfinite(volume) or volume <= 0:
        raise RuntimeError(f"{label}: expected a positive, outward-oriented volume; got {volume}")
    bounds = np.column_stack((points.min(axis=0), points.max(axis=0))).ravel()
    return {"volume": volume, "bounds": bounds, "vertices": len(points), "triangles": len(faces)}


def encode_mesh(pos_bytes: bytes, idx_bytes: bytes) -> bytes:
    if len(pos_bytes) % 12 or len(idx_bytes) % 12:
        raise RuntimeError("Native worker mesh buffers are not triangles")
    total = MESH_HEADER.size + len(pos_bytes) + len(idx_bytes)
    header = MESH_HEADER.pack(
        b"M3DM", 1, MESH_HEADER.size, len(pos_bytes) // 12, len(idx_bytes) // 12,
        len(pos_bytes), len(idx_bytes), total, 0,
    )
    return header + pos_bytes + idx_bytes


def decode_mesh(payload: bytes) -> tuple[bytes, bytes]:
    if len(payload) < MESH_HEADER.size:
        raise RuntimeError("Native worker returned a truncated mesh")
    magic, version, header_size, vertices, triangles, pos_size, idx_size, total, reserved = MESH_HEADER.unpack_from(payload)
    if (magic, version, header_size, reserved) != (b"M3DM", 1, MESH_HEADER.size, 0):
        raise RuntimeError("Native worker returned an invalid mesh header")
    if total != len(payload) or pos_size != 12 * vertices or idx_size != 12 * triangles or total != 32 + pos_size + idx_size:
        raise RuntimeError("Native worker returned inconsistent mesh lengths")
    return payload[32:32 + pos_size], payload[32 + pos_size:]


def run_worker(worker: Path, name: str, operation: str, mesh_a: tuple[bytes, bytes],
               mesh_b: tuple[bytes, bytes], timeout: int) -> tuple[bytes, bytes]:
    job = f"real-mesh-{name}-{operation}".encode("utf-8")
    a = encode_mesh(*mesh_a)
    b = encode_mesh(*mesh_b)
    frame = FRAME_HEADER.pack(b"M3DC", 1, 3, len(job), len(a), len(b), OPERATIONS[operation], 0)
    env = os.environ.copy()
    conda_bin = ROOT.parent / ".conda" / "devshell-cgal" / "Library" / "bin"
    if conda_bin.is_dir():
        env["PATH"] = str(conda_bin) + os.pathsep + env.get("PATH", "")
    try:
        completed = subprocess.run(
            [str(worker)], input=frame + job + a + b, capture_output=True,
            timeout=timeout, env=env, check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"{name} {operation}: native worker exceeded {timeout}s") from exc
    if completed.returncode != 0:
        raise RuntimeError(f"{name} {operation}: worker exited {completed.returncode}: {completed.stderr.decode(errors='replace')}")
    output = completed.stdout
    if len(output) < FRAME_HEADER.size:
        raise RuntimeError(f"{name} {operation}: missing native worker response")
    magic, version, status, job_size, mesh_size, message_size, opcode, reserved = FRAME_HEADER.unpack_from(output)
    if (magic, version, opcode, reserved) != (b"M3DC", 1, 3, 0):
        raise RuntimeError(f"{name} {operation}: invalid native worker response header")
    if len(output) != FRAME_HEADER.size + job_size + mesh_size + message_size:
        raise RuntimeError(f"{name} {operation}: incomplete native worker response")
    start = FRAME_HEADER.size
    if output[start:start + job_size] != job:
        raise RuntimeError(f"{name} {operation}: native worker job ID mismatch")
    message = output[start + job_size + mesh_size:].decode("utf-8", errors="replace")
    if status != 0:
        raise RuntimeError(f"{name} {operation}: native worker rejected the input: {message}")
    if message != "native-cgal":
        raise RuntimeError(f"{name} {operation}: unexpected kernel: {message}")
    return decode_mesh(output[start + job_size:start + job_size + mesh_size])


def require_close(label: str, actual: float, expected: float) -> None:
    tolerance = max(1e-6, 0.005 * abs(expected))
    if abs(actual - expected) > tolerance:
        raise RuntimeError(f"{label}: {actual:.9g} versus {expected:.9g} (tolerance {tolerance:.9g})")


def check_pair(name: str, mesh_a: tuple[bytes, bytes], mesh_b: tuple[bytes, bytes],
               worker: Path, timeout: int) -> None:
    input_a = metrics(f"{name} A", *mesh_a)
    input_b = metrics(f"{name} B", *mesh_b)
    print(f"{name}: A {input_a['triangles']} triangles / volume {input_a['volume']:.6g}; "
          f"B {input_b['triangles']} triangles / volume {input_b['volume']:.6g}", flush=True)
    results = {}
    for operation in ("union", "intersection", "difference"):
        started = time.perf_counter()
        result = run_worker(worker, name, operation, mesh_a, mesh_b, timeout)
        results[operation] = metrics(f"{name} {operation}", *result)
        value = results[operation]
        print(f"  {operation}: {value['triangles']} triangles / volume {value['volume']:.6g} "
              f"/ {time.perf_counter() - started:.1f}s", flush=True)

    a, b = input_a, input_b
    union, intersection, difference = (results[key] for key in ("union", "intersection", "difference"))
    require_close(f"{name} A = difference + intersection",
                  difference["volume"] + intersection["volume"], a["volume"])
    require_close(f"{name} A + B = union + intersection",
                  union["volume"] + intersection["volume"], a["volume"] + b["volume"])

    bounds_tolerance = max(1e-5, 1e-4 * float(np.max(np.ptp(
        np.asarray([a["bounds"], b["bounds"]])[:, (0, 2, 4)], axis=0
    ))))
    expected_union = np.column_stack((
        np.minimum(a["bounds"][::2], b["bounds"][::2]),
        np.maximum(a["bounds"][1::2], b["bounds"][1::2]),
    )).ravel()
    if not np.allclose(union["bounds"], expected_union, atol=bounds_tolerance, rtol=0):
        raise RuntimeError(f"{name}: union bounds do not enclose both inputs")
    for label, result, lower, upper in (
        ("intersection", intersection,
         np.maximum(a["bounds"][::2], b["bounds"][::2]),
         np.minimum(a["bounds"][1::2], b["bounds"][1::2])),
        ("difference", difference, a["bounds"][::2], a["bounds"][1::2]),
    ):
        if np.any(result["bounds"][::2] < lower - bounds_tolerance) or np.any(
            result["bounds"][1::2] > upper + bounds_tolerance
        ):
            raise RuntimeError(f"{name}: {label} bounds escape the input bounds")
    print(f"{name}: closed-manifold topology, bounds, and volume identities passed", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=("all", "armadillo", "3dbenchy"), default="all")
    parser.add_argument("--worker", type=Path, default=DEFAULT_WORKER)
    parser.add_argument("--timeout-seconds", type=int, default=300)
    args = parser.parse_args()
    worker = args.worker.resolve()
    if not worker.is_file():
        raise RuntimeError(f"Build the standalone CGAL worker first: {worker}")
    if args.timeout_seconds <= 0:
        raise RuntimeError("--timeout-seconds must be positive")

    if args.model in ("all", "armadillo"):
        armadillo = read_mesh(ASSETS / "11_armadillo.obj")
        check_pair("armadillo", armadillo, (shifted_copy(armadillo[0], 0.15), armadillo[1]),
                   worker, args.timeout_seconds)
    if args.model in ("all", "3dbenchy"):
        benchy = read_mesh(ASSETS / "10_3dbenchy.stl")
        check_pair("3dbenchy", benchy, surface_cutter(*benchy), worker, args.timeout_seconds)


if __name__ == "__main__":
    main()
