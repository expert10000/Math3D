#!/usr/bin/env python3
"""Numerical verification for Commit 6's CGAL surface shortest-path helper."""

from __future__ import annotations

import heapq
import math
import sys
from pathlib import Path
from typing import List, Tuple

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "py"))

from geodesic.surface_path import cgal_surface_shortest_path


def vertex_location(faces: np.ndarray, vertex: int) -> dict:
    for face_index, triangle in enumerate(faces):
        for corner, candidate in enumerate(triangle):
            if int(candidate) == vertex:
                bary = [0.0, 0.0, 0.0]
                bary[corner] = 1.0
                return {"face": face_index, "bary": bary, "vertex": vertex}
    raise AssertionError(f"vertex {vertex} is not referenced")


def grid(nx: int, ny: int) -> Tuple[np.ndarray, np.ndarray]:
    vertices = np.asarray([(x, y, 0.0) for y in range(ny + 1) for x in range(nx + 1)], dtype=np.float64)
    faces: List[Tuple[int, int, int]] = []
    stride = nx + 1
    for y in range(ny):
        for x in range(nx):
            a = y * stride + x
            b = a + 1
            d = (y + 1) * stride + x
            c = d + 1
            faces.extend([(a, b, c), (a, c, d)])
    return vertices, np.asarray(faces, dtype=np.int64)


def cylinder(theta_steps: int = 72, z_steps: int = 12) -> Tuple[np.ndarray, np.ndarray]:
    vertices = []
    for z_index in range(z_steps + 1):
        z = z_index / z_steps
        for theta_index in range(theta_steps + 1):
            theta = 2.0 * math.pi * theta_index / theta_steps
            vertices.append((math.cos(theta), math.sin(theta), z))
    faces = []
    stride = theta_steps + 1
    for z_index in range(z_steps):
        for theta_index in range(theta_steps):
            a = z_index * stride + theta_index
            b = a + 1
            d = (z_index + 1) * stride + theta_index
            c = d + 1
            faces.extend([(a, b, c), (a, c, d)])
    return np.asarray(vertices), np.asarray(faces, dtype=np.int64)


def sphere(longitudes: int = 64, latitudes: int = 32) -> Tuple[np.ndarray, np.ndarray]:
    vertices = [(0.0, 0.0, 1.0)]
    for latitude in range(1, latitudes):
        phi = math.pi * latitude / latitudes
        for longitude in range(longitudes):
            theta = 2.0 * math.pi * longitude / longitudes
            vertices.append((math.sin(phi) * math.cos(theta), math.sin(phi) * math.sin(theta), math.cos(phi)))
    south = len(vertices)
    vertices.append((0.0, 0.0, -1.0))
    faces = []
    for longitude in range(longitudes):
        nxt = (longitude + 1) % longitudes
        faces.append((0, 1 + longitude, 1 + nxt))
    for latitude in range(latitudes - 2):
        ring = 1 + latitude * longitudes
        next_ring = ring + longitudes
        for longitude in range(longitudes):
            nxt = (longitude + 1) % longitudes
            a, b = ring + longitude, ring + nxt
            d, c = next_ring + longitude, next_ring + nxt
            faces.extend([(a, d, c), (a, c, b)])
    last_ring = 1 + (latitudes - 2) * longitudes
    for longitude in range(longitudes):
        nxt = (longitude + 1) % longitudes
        faces.append((last_ring + longitude, south, last_ring + nxt))
    return np.asarray(vertices), np.asarray(faces, dtype=np.int64)


def graph_distance(vertices: np.ndarray, faces: np.ndarray, source: int, target: int) -> float:
    neighbors = [dict() for _ in vertices]
    for a, b, c in faces:
        for left, right in ((a, b), (b, c), (c, a)):
            weight = float(np.linalg.norm(vertices[left] - vertices[right]))
            neighbors[int(left)][int(right)] = min(neighbors[int(left)].get(int(right), math.inf), weight)
            neighbors[int(right)][int(left)] = min(neighbors[int(right)].get(int(left), math.inf), weight)
    distances = [math.inf] * len(vertices)
    distances[source] = 0.0
    queue = [(0.0, source)]
    while queue:
        distance, vertex = heapq.heappop(queue)
        if vertex == target:
            return distance
        if distance != distances[vertex]:
            continue
        for neighbor, weight in neighbors[vertex].items():
            candidate = distance + weight
            if candidate < distances[neighbor]:
                distances[neighbor] = candidate
                heapq.heappush(queue, (candidate, neighbor))
    return math.inf


def run_path(vertices: np.ndarray, faces: np.ndarray, source: int, target: int) -> dict:
    return cgal_surface_shortest_path(
        vertices,
        faces,
        [{**vertex_location(faces, source), "sourceKind": "selected-vertex"}],
        vertex_location(faces, target),
    )


def assert_close(label: str, actual: float, expected: float, rel: float) -> None:
    error = abs(actual - expected) / max(abs(expected), 1e-12)
    if error > rel:
        raise AssertionError(f"{label}: {actual:.8g} vs {expected:.8g} ({error:.2%} > {rel:.2%})")
    print(f"PASS {label}: {actual:.8g} (expected {expected:.8g}, error {error:.2%})")


def main() -> int:
    plane_v, plane_f = grid(8, 8)
    plane = run_path(plane_v, plane_f, 0, len(plane_v) - 1)
    assert plane["ok"]
    assert_close("plane", plane["length"], math.sqrt(128.0), 1e-10)

    cyl_v, cyl_f = cylinder()
    stride = 73
    cyl_source = 6 * stride + 8
    cyl_target = 10 * stride + 26
    cylinder_result = run_path(cyl_v, cyl_f, cyl_source, cyl_target)
    assert cylinder_result["ok"]
    expected_cylinder = math.hypot(2.0 * math.pi * 18 / 72, 4 / 12)
    assert_close("cylinder", cylinder_result["length"], expected_cylinder, 0.02)

    sphere_v, sphere_f = sphere()
    equator_ring = 1 + (16 - 1) * 64
    sphere_result = run_path(sphere_v, sphere_f, equator_ring, equator_ring + 16)
    assert sphere_result["ok"]
    assert_close("sphere", sphere_result["length"], math.pi / 2.0, 0.03)

    difference_v, difference_f = grid(1, 1)
    surface_result = run_path(difference_v, difference_f, 1, 2)
    assert surface_result["ok"]
    edge_graph_length = graph_distance(difference_v, difference_f, 1, 2)
    if not edge_graph_length > surface_result["length"] * 1.3:
        raise AssertionError("graph-versus-surface test did not expose the expected edge-routing overestimate")
    print(f"PASS graph-versus-surface: graph={edge_graph_length:.8g}, surface={surface_result['length']:.8g}")

    disconnected_v = np.asarray([(0, 0, 0), (1, 0, 0), (0, 1, 0), (3, 0, 0), (4, 0, 0), (3, 1, 0)], dtype=float)
    disconnected_f = np.asarray([(0, 1, 2), (3, 4, 5)], dtype=np.int64)
    disconnected = run_path(disconnected_v, disconnected_f, 0, 3)
    if disconnected.get("ok") or not disconnected.get("disconnected"):
        raise AssertionError(f"disconnected endpoint test failed: {disconnected}")
    print("PASS disconnected endpoints")

    large_v, large_f = grid(75, 75)
    large = run_path(large_v, large_f, 0, len(large_v) - 1)
    assert large["ok"] and len(large["polyline"]) >= 2
    assert_close("large mesh", large["length"], math.hypot(75, 75), 1e-10)
    print(f"PASS large mesh: {len(large_v)} vertices / {len(large_f)} faces")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
