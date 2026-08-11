#!/usr/bin/env python3
"""
Math3D Mesh Benchmark Suite bootstrapper.

Creates a reproducible mesh test suite under:
    tests/assets/meshes/

It:
  * generates deterministic basic meshes;
  * generates deterministic "problematic" meshes;
  * downloads standard OBJ/STL benchmark models;
  * optionally creates heavy stress assets;
  * writes manifest + expected JSON metadata.

Core functionality uses only Python's standard library.

Examples
--------
Build normal suite:
    python math3d_mesh_benchmark.py

Choose another output root:
    python math3d_mesh_benchmark.py --root ./tests/assets/meshes

Regenerate everything:
    python math3d_mesh_benchmark.py --force

Generate/download only deterministic assets:
    python math3d_mesh_benchmark.py --skip-downloads

Also build heavy stress assets:
    python math3d_mesh_benchmark.py --include-heavy

Heavy mode can generate a ~500k-triangle binary STL sphere and attempts
to fetch + convert Stanford's full Dragon reconstruction from PLY to OBJ.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import os
import shutil
import struct
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterable, Sequence

USER_AGENT = "Math3D-Mesh-Benchmark/1.0"

COMMON_RAW = "https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data"
BENCHY_RAW = "https://raw.githubusercontent.com/CreativeTools/3DBenchy/master/Single-part/3DBenchy.stl"

DOWNLOADS = [
    {
        "name": "Suzanne",
        "dest": "standard/06_suzanne.obj",
        "url": f"{COMMON_RAW}/suzanne.obj",
        "source": "alecjacobson/common-3d-test-models",
        "role": "small organic / selection / subdivision",
    },
    {
        "name": "Fandisk",
        "dest": "standard/07_fandisk.obj",
        "url": f"{COMMON_RAW}/fandisk.obj",
        "source": "alecjacobson/common-3d-test-models",
        "role": "CAD-like sharp/smooth feature testing",
    },
    {
        "name": "Stanford Bunny",
        "dest": "standard/08_stanford_bunny.obj",
        "url": f"{COMMON_RAW}/stanford-bunny.obj",
        "source": "alecjacobson/common-3d-test-models / Stanford",
        "role": "general organic triangular mesh",
    },
    {
        "name": "Spot",
        "dest": "standard/09_spot_cow.obj",
        "url": f"{COMMON_RAW}/spot.obj",
        "source": "alecjacobson/common-3d-test-models / Keenan Crane",
        "role": "medium organic surface",
    },
    {
        "name": "3DBenchy",
        "dest": "standard/10_3dbenchy.stl",
        "url": BENCHY_RAW,
        "source": "CreativeTools/3DBenchy",
        "role": "real-world engineering-style STL",
    },
    {
        "name": "Armadillo",
        "dest": "standard/11_armadillo.obj",
        "url": f"{COMMON_RAW}/armadillo.obj",
        "source": "alecjacobson/common-3d-test-models / Stanford",
        "role": "large organic mesh",
    },
    {
        "name": "XYZ Dragon",
        "dest": "stress/12_dragon_medium.obj",
        "url": f"{COMMON_RAW}/xyzrgb_dragon.obj",
        "source": "alecjacobson/common-3d-test-models / Stanford",
        "role": "medium stress mesh",
    },
]

STANFORD_DRAGON_ARCHIVE = (
    "https://graphics.stanford.edu/pub/3Dscanrep/dragon/dragon_recon.tar.gz"
)

# ---------------------------------------------------------------------------
# Filesystem helpers
# ---------------------------------------------------------------------------

def ensure_dirs(root: Path) -> None:
    for d in ("basic", "standard", "stress", "problematic", "expected"):
        (root / d).mkdir(parents=True, exist_ok=True)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Downloading
# ---------------------------------------------------------------------------

def download(url: str, dest: Path, force: bool, retries: int = 3, timeout: int = 60) -> bool:
    if dest.exists() and not force:
        print(f"[skip] {dest} already exists")
        return True

    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")

    headers = {"User-Agent": USER_AGENT}
    req = urllib.request.Request(url, headers=headers)

    for attempt in range(1, retries + 1):
        try:
            print(f"[download] {url}")
            with urllib.request.urlopen(req, timeout=timeout) as response, tmp.open("wb") as out:
                total = response.headers.get("Content-Length")
                total_n = int(total) if total and total.isdigit() else None
                received = 0
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    received += len(chunk)
                    if total_n:
                        pct = 100.0 * received / total_n
                        print(f"\r           {received/1048576:.1f}/{total_n/1048576:.1f} MiB ({pct:.0f}%)", end="")
                if total_n:
                    print()
            tmp.replace(dest)
            print(f"[ok] {dest} ({dest.stat().st_size/1048576:.2f} MiB)")
            return True
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            print(f"[warn] attempt {attempt}/{retries} failed: {exc}")
            try:
                tmp.unlink()
            except FileNotFoundError:
                pass
            if attempt < retries:
                time.sleep(attempt * 2)

    print(f"[error] could not download: {url}")
    return False


# ---------------------------------------------------------------------------
# Geometry writers
# ---------------------------------------------------------------------------

Vec3 = tuple[float, float, float]
Face = tuple[int, ...]  # zero-based internally


def write_obj(path: Path, vertices: Sequence[Vec3], faces: Sequence[Face], comment: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write("# Math3D generated benchmark mesh\n")
        if comment:
            for line in comment.splitlines():
                f.write(f"# {line}\n")
        for x, y, z in vertices:
            f.write(f"v {x:.12g} {y:.12g} {z:.12g}\n")
        for face in faces:
            f.write("f " + " ".join(str(i + 1) for i in face) + "\n")


def vsub(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def normalize(v: Vec3) -> Vec3:
    n = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
    if n == 0:
        return (0.0, 0.0, 0.0)
    return (v[0] / n, v[1] / n, v[2] / n)


def triangle_normal(a: Vec3, b: Vec3, c: Vec3) -> Vec3:
    return normalize(cross(vsub(b, a), vsub(c, a)))


def write_ascii_stl(path: Path, vertices: Sequence[Vec3], triangles: Sequence[tuple[int, int, int]], name="mesh") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="ascii", newline="\n") as f:
        f.write(f"solid {name}\n")
        for i, j, k in triangles:
            a, b, c = vertices[i], vertices[j], vertices[k]
            nx, ny, nz = triangle_normal(a, b, c)
            f.write(f"  facet normal {nx:.9g} {ny:.9g} {nz:.9g}\n")
            f.write("    outer loop\n")
            for p in (a, b, c):
                f.write(f"      vertex {p[0]:.9g} {p[1]:.9g} {p[2]:.9g}\n")
            f.write("    endloop\n")
            f.write("  endfacet\n")
        f.write(f"endsolid {name}\n")


# ---------------------------------------------------------------------------
# Basic deterministic meshes
# ---------------------------------------------------------------------------

def tetrahedron() -> tuple[list[Vec3], list[Face]]:
    v = [
        (1.0, 1.0, 1.0),
        (-1.0, -1.0, 1.0),
        (-1.0, 1.0, -1.0),
        (1.0, -1.0, -1.0),
    ]
    f = [
        (0, 2, 1),
        (0, 1, 3),
        (0, 3, 2),
        (1, 2, 3),
    ]
    return v, f


def cube() -> tuple[list[Vec3], list[Face]]:
    v = [
        (-1, -1, -1),  # 0
        ( 1, -1, -1),  # 1
        ( 1,  1, -1),  # 2
        (-1,  1, -1),  # 3
        (-1, -1,  1),  # 4
        ( 1, -1,  1),  # 5
        ( 1,  1,  1),  # 6
        (-1,  1,  1),  # 7
    ]
    f = [
        (0, 2, 1), (0, 3, 2),  # bottom -Z
        (4, 5, 6), (4, 6, 7),  # top +Z
        (0, 1, 5), (0, 5, 4),  # front -Y
        (1, 2, 6), (1, 6, 5),  # right +X
        (2, 3, 7), (2, 7, 6),  # back +Y
        (3, 0, 4), (3, 4, 7),  # left -X
    ]
    return v, f


def cylinder(segments: int = 32) -> tuple[list[Vec3], list[Face]]:
    v: list[Vec3] = []
    f: list[Face] = []
    # bottom/top rings
    for z in (-1.0, 1.0):
        for i in range(segments):
            a = 2 * math.pi * i / segments
            v.append((math.cos(a), math.sin(a), z))
    bottom_center = len(v)
    v.append((0.0, 0.0, -1.0))
    top_center = len(v)
    v.append((0.0, 0.0, 1.0))

    for i in range(segments):
        j = (i + 1) % segments
        bi, bj = i, j
        ti, tj = segments + i, segments + j
        # wall
        f.append((bi, bj, tj))
        f.append((bi, tj, ti))
        # caps
        f.append((bottom_center, bj, bi))
        f.append((top_center, ti, tj))
    return v, f


def torus(major_segments: int = 32, minor_segments: int = 16, R: float = 2.0, r: float = 0.65) -> tuple[list[Vec3], list[Face]]:
    v: list[Vec3] = []
    f: list[Face] = []
    for i in range(major_segments):
        u = 2 * math.pi * i / major_segments
        cu, su = math.cos(u), math.sin(u)
        for j in range(minor_segments):
            w = 2 * math.pi * j / minor_segments
            cw, sw = math.cos(w), math.sin(w)
            v.append(((R + r * cw) * cu, (R + r * cw) * su, r * sw))

    def idx(i: int, j: int) -> int:
        return (i % major_segments) * minor_segments + (j % minor_segments)

    for i in range(major_segments):
        for j in range(minor_segments):
            a = idx(i, j)
            b = idx(i + 1, j)
            c = idx(i + 1, j + 1)
            d = idx(i, j + 1)
            f.append((a, b, c))
            f.append((a, c, d))
    return v, f


# ---------------------------------------------------------------------------
# Problematic deterministic meshes
# ---------------------------------------------------------------------------

def open_boundary_cube() -> tuple[list[Vec3], list[Face]]:
    v, f = cube()
    # Remove the top (+Z) pair -> one square boundary loop, four boundary edges.
    del f[2:4]
    return v, f


def non_manifold_edge() -> tuple[list[Vec3], list[Face]]:
    # Exactly three triangles incident to edge 0--1.
    v = [
        (-1.0, 0.0, 0.0),
        ( 1.0, 0.0, 0.0),
        ( 0.0, 1.0, 0.0),
        ( 0.0,-1.0, 0.0),
        ( 0.0, 0.0, 1.0),
    ]
    f = [(0, 1, 2), (1, 0, 3), (0, 1, 4)]
    return v, f


def disconnected_components() -> tuple[list[Vec3], list[Face]]:
    vertices: list[Vec3] = []
    faces: list[Face] = []

    def append_mesh(vs: Sequence[Vec3], fs: Sequence[Face], offset_xyz: Vec3, scale: float = 1.0):
        base = len(vertices)
        ox, oy, oz = offset_xyz
        for x, y, z in vs:
            vertices.append((x * scale + ox, y * scale + oy, z * scale + oz))
        for face in fs:
            faces.append(tuple(base + i for i in face))

    cv, cf = cube()
    tv, tf = tetrahedron()
    append_mesh(cv, cf, (-3.0, 0.0, 0.0), 0.8)
    append_mesh(cv, cf, ( 3.0, 0.0, 0.0), 0.8)
    append_mesh(tv, tf, ( 0.0, 3.0, 0.0), 0.5)
    return vertices, faces


def degenerate_faces() -> tuple[list[Vec3], list[Face]]:
    # Includes:
    #  * one normal triangle,
    #  * repeated-index triangle,
    #  * collinear zero-area triangle,
    #  * near-zero-area triangle.
    v = [
        (0.0, 0.0, 0.0),   # 0
        (1.0, 0.0, 0.0),   # 1
        (0.0, 1.0, 0.0),   # 2
        (2.0, 0.0, 0.0),   # 3
        (3.0, 0.0, 0.0),   # 4
        (0.0, 0.0, 1e-12), # 5
    ]
    f = [
        (0, 1, 2),  # good
        (0, 1, 1),  # repeated vertex
        (0, 1, 3),  # collinear
        (0, 1, 5),  # near zero area
    ]
    return v, f


def inconsistent_normals() -> tuple[list[Vec3], list[Face]]:
    v, f = cube()
    f = list(f)
    # Reverse exactly one triangle.
    a, b, c = f[2]
    f[2] = (a, c, b)
    return v, f


def self_intersection() -> tuple[list[Vec3], list[Face]]:
    # Two triangles crossing in their interiors.
    # Kept intentionally tiny so a triangle-triangle intersection test has
    # a simple known positive case.
    v = [
        (-1.0, -1.0, 0.0),
        ( 1.0, -1.0, 0.0),
        ( 0.0,  1.0, 0.0),
        ( 0.0, -0.5, -1.0),
        ( 0.0, -0.5,  1.0),
        ( 0.0,  0.8,  0.0),
    ]
    f = [(0, 1, 2), (3, 4, 5)]
    return v, f


# ---------------------------------------------------------------------------
# Metadata / validation utilities
# ---------------------------------------------------------------------------

def edge_counts(faces: Sequence[Face]) -> dict[tuple[int, int], int]:
    result: dict[tuple[int, int], int] = {}
    for face in faces:
        if len(face) < 2:
            continue
        for i, a in enumerate(face):
            b = face[(i + 1) % len(face)]
            e = (a, b) if a < b else (b, a)
            result[e] = result.get(e, 0) + 1
    return result


def component_count(vertex_count: int, faces: Sequence[Face]) -> int:
    used = set(i for face in faces for i in face)
    if not used:
        return 0
    adj: dict[int, set[int]] = {i: set() for i in used}
    for face in faces:
        for i, a in enumerate(face):
            for b in face[i + 1:]:
                adj[a].add(b)
                adj[b].add(a)

    seen: set[int] = set()
    count = 0
    for start in used:
        if start in seen:
            continue
        count += 1
        stack = [start]
        seen.add(start)
        while stack:
            cur = stack.pop()
            for nxt in adj[cur]:
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
    return count


def topology_summary(vertices: Sequence[Vec3], faces: Sequence[Face]) -> dict:
    ec = edge_counts(faces)
    boundary = sum(1 for n in ec.values() if n == 1)
    nonmanifold = sum(1 for n in ec.values() if n > 2)
    return {
        "vertices": len(vertices),
        "edges": len(ec),
        "faces": len(faces),
        "components": component_count(len(vertices), faces),
        "boundaryEdges": boundary,
        "nonManifoldEdges": nonmanifold,
        "closedByEdgeIncidence": boundary == 0 and nonmanifold == 0,
        "eulerCharacteristic": len(vertices) - len(ec) + len(faces),
    }


def write_expected(root: Path, filename: str, metadata: dict) -> None:
    write_json(root / "expected" / filename, metadata)


# ---------------------------------------------------------------------------
# Heavy binary STL generator
# ---------------------------------------------------------------------------

def write_binary_stl_triangle(f, a: Vec3, b: Vec3, c: Vec3) -> None:
    n = triangle_normal(a, b, c)
    f.write(struct.pack(
        "<12fH",
        float(n[0]), float(n[1]), float(n[2]),
        float(a[0]), float(a[1]), float(a[2]),
        float(b[0]), float(b[1]), float(b[2]),
        float(c[0]), float(c[1]), float(c[2]),
        0,
    ))


def generate_dense_sphere_stl(path: Path, lon_segments: int = 720, lat_segments: int = 360, force: bool = False) -> dict:
    if path.exists() and not force:
        print(f"[skip] {path} already exists")
        # Geometry formula below still supplies expected count.
        tri_count = 2 * lon_segments * (lat_segments - 1)
        return {"triangles": tri_count, "generated": False}

    path.parent.mkdir(parents=True, exist_ok=True)
    tri_count = 2 * lon_segments * (lat_segments - 1)

    def p(lat_i: int, lon_i: int) -> Vec3:
        theta = math.pi * lat_i / lat_segments
        phi = 2 * math.pi * (lon_i % lon_segments) / lon_segments
        s = math.sin(theta)
        return (s * math.cos(phi), s * math.sin(phi), math.cos(theta))

    with path.open("wb") as f:
        header = b"Math3D dense UV sphere benchmark"
        f.write(header.ljust(80, b"\0"))
        f.write(struct.pack("<I", tri_count))

        for lat in range(lat_segments):
            for lon in range(lon_segments):
                a = p(lat, lon)
                b = p(lat, lon + 1)
                c = p(lat + 1, lon + 1)
                d = p(lat + 1, lon)

                # At poles one of the two triangles is degenerate. Avoid that
                # and keep the exact count formula 2*lon*(lat_segments-1).
                if lat == 0:
                    write_binary_stl_triangle(f, a, c, d)
                elif lat == lat_segments - 1:
                    write_binary_stl_triangle(f, a, b, c)
                else:
                    write_binary_stl_triangle(f, a, b, c)
                    write_binary_stl_triangle(f, a, c, d)

    actual_tri_count = lon_segments * 2 * (lat_segments - 1)
    print(f"[ok] {path} ({actual_tri_count:,} triangles, {path.stat().st_size/1048576:.1f} MiB)")
    return {"triangles": actual_tri_count, "generated": True}


# ---------------------------------------------------------------------------
# Stanford PLY -> OBJ support for optional full Dragon
# ---------------------------------------------------------------------------

PLY_SCALAR_FORMATS = {
    "char": ("b", 1), "int8": ("b", 1),
    "uchar": ("B", 1), "uint8": ("B", 1),
    "short": ("h", 2), "int16": ("h", 2),
    "ushort": ("H", 2), "uint16": ("H", 2),
    "int": ("i", 4), "int32": ("i", 4),
    "uint": ("I", 4), "uint32": ("I", 4),
    "float": ("f", 4), "float32": ("f", 4),
    "double": ("d", 8), "float64": ("d", 8),
}


def parse_ply_header(f):
    first = f.readline()
    if first.strip() != b"ply":
        raise ValueError("Not a PLY file")

    fmt = None
    elements = []
    current = None

    while True:
        raw = f.readline()
        if not raw:
            raise ValueError("Unexpected EOF in PLY header")
        line = raw.decode("ascii", errors="strict").strip()
        if line == "end_header":
            break
        if not line or line.startswith("comment") or line.startswith("obj_info"):
            continue
        parts = line.split()
        if parts[0] == "format":
            fmt = parts[1]
        elif parts[0] == "element":
            current = {"name": parts[1], "count": int(parts[2]), "properties": []}
            elements.append(current)
        elif parts[0] == "property":
            if current is None:
                raise ValueError("PLY property before element")
            if parts[1] == "list":
                current["properties"].append({
                    "kind": "list",
                    "count_type": parts[2],
                    "item_type": parts[3],
                    "name": parts[4],
                })
            else:
                current["properties"].append({
                    "kind": "scalar",
                    "type": parts[1],
                    "name": parts[2],
                })

    if fmt not in ("ascii", "binary_little_endian", "binary_big_endian"):
        raise ValueError(f"Unsupported PLY format: {fmt}")
    return fmt, elements


def read_binary_scalar(f, typ: str, endian: str):
    fmt, size = PLY_SCALAR_FORMATS[typ]
    data = f.read(size)
    if len(data) != size:
        raise EOFError("Unexpected EOF in binary PLY")
    return struct.unpack(endian + fmt, data)[0]


def convert_ply_to_obj(ply_path: Path, obj_path: Path) -> None:
    print(f"[convert] {ply_path.name} -> {obj_path.name}")
    obj_path.parent.mkdir(parents=True, exist_ok=True)

    with ply_path.open("rb") as f:
        fmt, elements = parse_ply_header(f)

        with obj_path.open("w", encoding="utf-8", newline="\n") as out:
            out.write("# Converted by Math3D mesh benchmark bootstrapper\n")
            out.write("# Source: Stanford 3D Scanning Repository\n")

            if fmt == "ascii":
                for element in elements:
                    name = element["name"]
                    count = element["count"]
                    props = element["properties"]
                    for _ in range(count):
                        parts = f.readline().decode("ascii").strip().split()
                        pos = 0
                        values = {}
                        for prop in props:
                            if prop["kind"] == "scalar":
                                values[prop["name"]] = parts[pos]
                                pos += 1
                            else:
                                n = int(parts[pos]); pos += 1
                                vals = parts[pos:pos+n]; pos += n
                                values[prop["name"]] = vals
                        if name == "vertex":
                            out.write(f"v {values['x']} {values['y']} {values['z']}\n")
                        elif name == "face":
                            inds = values.get("vertex_indices") or values.get("vertex_index")
                            if inds:
                                out.write("f " + " ".join(str(int(i) + 1) for i in inds) + "\n")
                return

            endian = "<" if fmt == "binary_little_endian" else ">"
            for element in elements:
                name = element["name"]
                count = element["count"]
                props = element["properties"]

                for _ in range(count):
                    values = {}
                    for prop in props:
                        if prop["kind"] == "scalar":
                            values[prop["name"]] = read_binary_scalar(f, prop["type"], endian)
                        else:
                            n = int(read_binary_scalar(f, prop["count_type"], endian))
                            values[prop["name"]] = [
                                read_binary_scalar(f, prop["item_type"], endian)
                                for _ in range(n)
                            ]

                    if name == "vertex":
                        out.write(f"v {values['x']:.9g} {values['y']:.9g} {values['z']:.9g}\n")
                    elif name == "face":
                        inds = values.get("vertex_indices") or values.get("vertex_index")
                        if inds:
                            out.write("f " + " ".join(str(int(i) + 1) for i in inds) + "\n")


def build_full_stanford_dragon(root: Path, force: bool, timeout: int) -> dict:
    dest_obj = root / "stress" / "13_dragon_high.obj"
    if dest_obj.exists() and not force:
        print(f"[skip] {dest_obj} already exists")
        return {
            "name": "Stanford Dragon full reconstruction",
            "dest": str(dest_obj.relative_to(root)),
            "status": "existing",
            "sha256": sha256_file(dest_obj),
        }

    with tempfile.TemporaryDirectory(prefix="math3d_dragon_") as td:
        td = Path(td)
        archive = td / "dragon_recon.tar.gz"
        if not download(STANFORD_DRAGON_ARCHIVE, archive, force=True, timeout=timeout):
            return {"name": "Stanford Dragon full reconstruction", "status": "download-failed"}

        print("[extract] Stanford Dragon reconstruction")
        with tarfile.open(archive, "r:gz") as tf:
            members = [m for m in tf.getmembers() if m.isfile() and m.name.lower().endswith(".ply")]
            if not members:
                raise RuntimeError("No PLY files found in Stanford Dragon archive")

            # Prefer exact full-res canonical name if present. Otherwise prefer
            # names without "res" and finally the largest PLY member.
            def score(m):
                base = Path(m.name).name.lower()
                exact = 3 if base == "dragon_vrip.ply" else 0
                no_res = 2 if "res" not in base else 0
                return (exact + no_res, m.size)

            member = max(members, key=score)
            print(f"[extract] selected {member.name} ({member.size/1048576:.1f} MiB)")
            extracted = tf.extractfile(member)
            if extracted is None:
                raise RuntimeError(f"Could not extract {member.name}")
            ply_path = td / "dragon_high.ply"
            with ply_path.open("wb") as out:
                shutil.copyfileobj(extracted, out)

        convert_ply_to_obj(ply_path, dest_obj)

    print(f"[ok] {dest_obj} ({dest_obj.stat().st_size/1048576:.1f} MiB)")
    return {
        "name": "Stanford Dragon full reconstruction",
        "dest": str(dest_obj.relative_to(root)),
        "status": "ok",
        "url": STANFORD_DRAGON_ARCHIVE,
        "sha256": sha256_file(dest_obj),
        "source": "Stanford 3D Scanning Repository",
    }


# ---------------------------------------------------------------------------
# Build suite
# ---------------------------------------------------------------------------

def generate_deterministic(root: Path, force: bool) -> list[dict]:
    generated = []

    jobs = [
        ("01_tetrahedron.obj", "basic", tetrahedron, {
            "purpose": "minimal closed triangular manifold",
            "expected": {"vertices": 4, "edges": 6, "faces": 4, "components": 1,
                         "boundaryEdges": 0, "nonManifoldEdges": 0, "eulerCharacteristic": 2},
        }),
        ("02_cube.obj", "basic", cube, {
            "purpose": "sharp triangulated manifold",
            "expected": {"vertices": 8, "edges": 18, "faces": 12, "components": 1,
                         "boundaryEdges": 0, "nonManifoldEdges": 0, "eulerCharacteristic": 2},
        }),
        ("04_cylinder.obj", "basic", cylinder, {
            "purpose": "mixed flat/curved geometry and edge loops",
        }),
        ("05_torus.obj", "basic", torus, {
            "purpose": "closed genus-1 topology",
            "expected": {"vertices": 512, "edges": 1536, "faces": 1024, "components": 1,
                         "boundaryEdges": 0, "nonManifoldEdges": 0, "eulerCharacteristic": 0, "genus": 1},
        }),
        ("15_open_boundary.obj", "problematic", open_boundary_cube, {
            "purpose": "one square boundary loop",
            "expected": {"vertices": 8, "faces": 10, "components": 1,
                         "boundaryEdges": 4, "nonManifoldEdges": 0, "closed": False,
                         "boundaryLoops": 1},
        }),
        ("16_non_manifold_edge.obj", "problematic", non_manifold_edge, {
            "purpose": "exactly three faces share one edge",
            "expected": {"vertices": 5, "faces": 3, "components": 1,
                         "nonManifoldEdges": 1, "closed": False},
        }),
        ("17_disconnected_components.obj", "problematic", disconnected_components, {
            "purpose": "three disconnected components",
            "expected": {"components": 3},
        }),
        ("18_degenerate_faces.obj", "problematic", degenerate_faces, {
            "purpose": "repeated-vertex, zero-area, and near-zero-area faces",
            "expected": {"degenerateFacesAtLeast": 3},
        }),
        ("19_inconsistent_normals.obj", "problematic", inconsistent_normals, {
            "purpose": "closed cube with one triangle reversed",
            "expected": {"vertices": 8, "faces": 12, "components": 1,
                         "boundaryEdges": 0, "orientationConsistent": False,
                         "flippedFaces": 1},
        }),
        ("20_self_intersection.obj", "problematic", self_intersection, {
            "purpose": "minimal positive triangle-triangle self-intersection case",
            "expected": {"selfIntersectionPairsAtLeast": 1},
        }),
    ]

    for filename, folder, factory, meta in jobs:
        path = root / folder / filename
        if path.exists() and not force:
            print(f"[skip] {path} already exists")
            v, f = factory()
        else:
            v, f = factory()
            write_obj(path, v, f, comment=meta["purpose"])
            print(f"[ok] {path}")

        computed = topology_summary(v, f)
        record = {
            "file": f"{folder}/{filename}",
            "generated": True,
            "purpose": meta["purpose"],
            "computedReference": computed,
            **({"expected": meta["expected"]} if "expected" in meta else {}),
        }
        write_expected(root, Path(filename).stem + ".json", record)
        generated.append(record)

    # ASCII STL cube
    stl_path = root / "basic" / "03_cube_ascii.stl"
    cv, cf = cube()
    if not stl_path.exists() or force:
        write_ascii_stl(stl_path, cv, [tuple(x) for x in cf], name="math3d_cube")
        print(f"[ok] {stl_path}")
    else:
        print(f"[skip] {stl_path} already exists")

    stl_record = {
        "file": "basic/03_cube_ascii.stl",
        "generated": True,
        "purpose": "ASCII STL import + topology reconstruction",
        "expectedAfterSpatialWeld": {
            "uniqueVertices": 8,
            "edges": 18,
            "faces": 12,
            "boundaryEdges": 0,
            "eulerCharacteristic": 2,
        },
        "rawTriangleCornerCount": 36,
    }
    write_expected(root, "03_cube_ascii.json", stl_record)
    generated.append(stl_record)

    return generated


def build_downloads(root: Path, force: bool, timeout: int) -> list[dict]:
    records = []
    for item in DOWNLOADS:
        dest = root / item["dest"]
        ok = download(item["url"], dest, force=force, timeout=timeout)
        rec = dict(item)
        rec["status"] = "ok" if ok else "failed"
        if ok and dest.exists():
            rec["bytes"] = dest.stat().st_size
            rec["sha256"] = sha256_file(dest)
        records.append(rec)
    return records


def write_readme(root: Path) -> None:
    text = """# Math3D Mesh Benchmark Assets

Generated/downloaded by `math3d_mesh_benchmark.py`.

## Folders

- `basic/` - deterministic small geometry.
- `standard/` - standard OBJ/STL test models.
- `stress/` - performance-oriented models.
- `problematic/` - deterministic meshes with known mesh problems.
- `expected/` - expected/reference metadata for deterministic regression tests.

## Recommended test tiers

### Smoke
- `01_tetrahedron.obj`
- `02_cube.obj`
- `03_cube_ascii.stl`
- `15_open_boundary.obj`
- `16_non_manifold_edge.obj`
- `18_degenerate_faces.obj`

### Standard
- Torus
- Suzanne
- Fandisk
- Stanford Bunny
- Spot
- 3DBenchy
- problematic meshes

### Performance
- Armadillo
- Dragon Medium
- optional Dragon High
- optional dense binary STL

## Notes

Downloaded model files remain subject to their upstream source/license terms.
The generated deterministic meshes in `basic/` and `problematic/` are produced
by the bootstrap script specifically for Math3D testing.

`manifest.json` records exact source URLs and SHA-256 hashes of files downloaded
during the current run.
"""
    (root / "README.md").write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Math3D Mesh Benchmark Suite")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path("tests/assets/meshes"),
        help="Output root (default: tests/assets/meshes)",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite/regenerate existing files")
    parser.add_argument("--skip-downloads", action="store_true", help="Generate local deterministic assets only")
    parser.add_argument(
        "--include-heavy",
        action="store_true",
        help="Also create dense STL and download/convert full Stanford Dragon",
    )
    parser.add_argument(
        "--dense-lon",
        type=int,
        default=720,
        help="Dense sphere longitude segments (default 720)",
    )
    parser.add_argument(
        "--dense-lat",
        type=int,
        default=360,
        help="Dense sphere latitude segments (default 360)",
    )
    parser.add_argument("--timeout", type=int, default=60, help="HTTP timeout seconds (default 60)")
    args = parser.parse_args()

    root = args.root.resolve()
    ensure_dirs(root)
    print(f"Math3D mesh benchmark root: {root}")

    manifest = {
        "suite": "Math3D Mesh Benchmark Suite",
        "version": 1,
        "generated": [],
        "downloads": [],
        "heavy": [],
    }

    manifest["generated"] = generate_deterministic(root, args.force)

    if not args.skip_downloads:
        manifest["downloads"] = build_downloads(root, args.force, args.timeout)

    if args.include_heavy:
        dense_path = root / "stress" / "14_large_dense_surface.stl"
        dense = generate_dense_sphere_stl(
            dense_path,
            lon_segments=args.dense_lon,
            lat_segments=args.dense_lat,
            force=args.force,
        )
        dense_record = {
            "name": "Dense generated UV sphere",
            "dest": "stress/14_large_dense_surface.stl",
            "status": "ok",
            "purpose": "binary STL parse/render/topology stress",
            **dense,
        }
        if dense_path.exists():
            dense_record["bytes"] = dense_path.stat().st_size
            dense_record["sha256"] = sha256_file(dense_path)
        manifest["heavy"].append(dense_record)

        if not args.skip_downloads:
            try:
                manifest["heavy"].append(
                    build_full_stanford_dragon(root, args.force, args.timeout)
                )
            except Exception as exc:
                print(f"[warn] full Stanford Dragon conversion failed: {exc}")
                manifest["heavy"].append({
                    "name": "Stanford Dragon full reconstruction",
                    "status": "failed",
                    "error": str(exc),
                })

    write_readme(root)
    write_json(root / "manifest.json", manifest)

    print()
    print("Done.")
    print(f"Manifest: {root / 'manifest.json'}")
    print(f"Expected: {root / 'expected'}")
    print()
    print("Suggested Math3D test order:")
    print("  basic -> problematic -> standard -> stress")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
