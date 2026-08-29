from __future__ import annotations

import time
import sys
from pathlib import Path

import numpy as np
import vtk

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from python.worker.runtime import bootstrap_worker_paths
from python.worker.worker_impl import (
    mesh_boolean_preflight_from_buffers,
    run_native_cgal_boolean,
    vtk_poly_to_buffers,
)


STANDARD_MESHES = ROOT / "tests" / "assets" / "meshes" / "standard"


def read_poly(path: Path):
    reader = vtk.vtkOBJReader() if path.suffix.lower() == ".obj" else vtk.vtkSTLReader()
    reader.SetFileName(str(path))
    reader.Update()

    tri = vtk.vtkTriangleFilter()
    tri.SetInputData(reader.GetOutput())
    tri.Update()

    clean = vtk.vtkCleanPolyData()
    clean.SetInputData(tri.GetOutput())
    clean.Update()
    return clean.GetOutput()


def mesh_buffers(path: Path):
    return vtk_poly_to_buffers(read_poly(path), False)


def shifted_positions(pos_bytes: bytes, dx: float, dy: float = 0.0, dz: float = 0.0) -> bytes:
    points = np.frombuffer(pos_bytes, dtype=np.float32).copy().reshape((-1, 3))
    points += np.asarray([dx, dy, dz], dtype=np.float32)
    return points.astype(np.float32, copy=False).tobytes(order="C")


def mesh_bounds(pos_bytes: bytes):
    points = np.frombuffer(pos_bytes, dtype=np.float32).reshape((-1, 3))
    return points.min(axis=0), points.max(axis=0)


def cutter_box_for_mesh(pos_bytes: bytes, frac: float = 0.25):
    mn, mx = mesh_bounds(pos_bytes)
    center = (mn + mx) * 0.5
    half = float(np.max(mx - mn) * frac * 0.5)
    positions = np.asarray(
        [
            [center[0] - half, center[1] - half, center[2] - half],
            [center[0] + half, center[1] - half, center[2] - half],
            [center[0] + half, center[1] + half, center[2] - half],
            [center[0] - half, center[1] + half, center[2] - half],
            [center[0] - half, center[1] - half, center[2] + half],
            [center[0] + half, center[1] - half, center[2] + half],
            [center[0] + half, center[1] + half, center[2] + half],
            [center[0] - half, center[1] + half, center[2] + half],
        ],
        dtype=np.float32,
    )
    indices = np.asarray(
        [
            [0, 2, 1],
            [0, 3, 2],
            [4, 5, 6],
            [4, 6, 7],
            [0, 1, 5],
            [0, 5, 4],
            [1, 2, 6],
            [1, 6, 5],
            [2, 3, 7],
            [2, 7, 6],
            [3, 0, 4],
            [3, 4, 7],
        ],
        dtype=np.uint32,
    )
    return positions.tobytes(order="C"), indices.tobytes(order="C")


def assert_corefine(name: str, operation: str, pos_a: bytes, idx_a: bytes, pos_b: bytes, idx_b: bytes) -> None:
    start = time.perf_counter()
    result = run_native_cgal_boolean(operation, pos_a, idx_a, pos_b, idx_b, False)
    duration_ms = (time.perf_counter() - start) * 1000
    if result is None:
        raise RuntimeError(f"{name} returned no result")
    _pos, _idx, _normals, vertex_count, face_count, diagnostics, _warnings = result
    if vertex_count <= 0 or face_count <= 0:
        raise RuntimeError(f"{name} returned empty output: {vertex_count} vertices / {face_count} faces")
    if not any("corefine" in entry.lower() for entry in diagnostics):
        raise RuntimeError(f"{name} did not report native CGAL corefine diagnostics: {diagnostics}")
    print(f"{name}: {operation} Native CGAL kernel {vertex_count} V / {face_count} F in {duration_ms:.1f} ms")


def main() -> None:
    bootstrap_worker_paths()

    bunny_pos, bunny_idx, _bunny_normals, bunny_vertices, bunny_faces = mesh_buffers(
        STANDARD_MESHES / "08_stanford_bunny.obj"
    )
    bunny_preflight = mesh_boolean_preflight_from_buffers(bunny_pos, bunny_idx, "Bunny")
    if bunny_preflight["ok"]:
        raise RuntimeError("Bunny preflight unexpectedly passed; expected an open-mesh blocker.")
    if "boundary edges" not in bunny_preflight["message"]:
        raise RuntimeError(f"Bunny blocker was not useful enough: {bunny_preflight['message']}")
    print(f"bunny open-mesh block ok: {bunny_vertices} V / {bunny_faces} F - {bunny_preflight['message']}")

    arm_pos, arm_idx, _arm_normals, arm_vertices, arm_faces = mesh_buffers(STANDARD_MESHES / "11_armadillo.obj")
    arm_preflight = mesh_boolean_preflight_from_buffers(arm_pos, arm_idx, "Armadillo")
    if not arm_preflight["ok"]:
        raise RuntimeError(f"Armadillo preflight failed: {arm_preflight['message']}")
    print(f"armadillo preflight ok: {arm_vertices} V / {arm_faces} F")
    assert_corefine(
        "armadillo overlap pair",
        "intersection",
        arm_pos,
        arm_idx,
        shifted_positions(arm_pos, 0.08),
        arm_idx,
    )

    benchy_pos, benchy_idx, _benchy_normals, benchy_vertices, benchy_faces = mesh_buffers(
        STANDARD_MESHES / "10_3dbenchy.stl"
    )
    benchy_preflight = mesh_boolean_preflight_from_buffers(benchy_pos, benchy_idx, "3DBenchy")
    if not benchy_preflight["ok"]:
        raise RuntimeError(f"3DBenchy preflight failed: {benchy_preflight['message']}")
    print(f"3dbenchy preflight ok: {benchy_vertices} V / {benchy_faces} F")
    box_pos, box_idx = cutter_box_for_mesh(benchy_pos)
    assert_corefine("3dbenchy cutter box", "difference", benchy_pos, benchy_idx, box_pos, box_idx)


if __name__ == "__main__":
    main()
