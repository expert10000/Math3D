"""Opt-in native CGAL qualification with reproducible real-mesh evidence.

Requires an activated Python environment with numpy and vtk. Nothing runs on import.
The worker executable and source meshes are read-only; outputs stay in --output-dir.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "native_real_mesh_harness", Path(__file__).with_name("test-cgal-native-real-mesh-invariants.py")
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Native real-mesh harness is unavailable")
HARNESS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HARNESS)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def input_record(mesh: tuple[bytes, bytes]) -> dict:
    value = HARNESS.metrics("input", *mesh)
    return {"sha256": sha256(mesh[0] + mesh[1]), "metrics": serializable_metrics(value)}


def serializable_metrics(value: dict) -> dict:
    return {**value, "bounds": value["bounds"].tolist()}


def rotated_copy(mesh: tuple[bytes, bytes]) -> tuple[bytes, bytes]:
    points = np.frombuffer(mesh[0], dtype="<f4").copy().reshape(-1, 3)
    center = (points.min(axis=0) + points.max(axis=0)) / 2
    angle = math.radians(8)
    rotation = np.asarray([[math.cos(angle), -math.sin(angle), 0],
                           [math.sin(angle), math.cos(angle), 0], [0, 0, 1]])
    result = (points - center) @ rotation.T + center
    result[:, 0] += 0.05 * float(np.ptp(points[:, 0]))
    return np.asarray(result, dtype="<f4").tobytes(), mesh[1]


def shifted_surface_cutter(mesh: tuple[bytes, bytes]) -> tuple[bytes, bytes]:
    cutter = HARNESS.surface_cutter(*mesh)
    return HARNESS.shifted_copy(cutter[0], 0.06), cutter[1]


def write_obj(path: Path, mesh: tuple[bytes, bytes]) -> str:
    points = np.frombuffer(mesh[0], dtype="<f4").reshape(-1, 3)
    faces = np.frombuffer(mesh[1], dtype="<u4").reshape(-1, 3)
    with path.open("w", encoding="ascii", newline="\n") as output:
        for x, y, z in points:
            output.write(f"v {x:.9g} {y:.9g} {z:.9g}\n")
        for a, b, c in faces:
            output.write(f"f {int(a) + 1} {int(b) + 1} {int(c) + 1}\n")
    return sha256(path.read_bytes())


def qualify(name: str, source: Path, transform: str, make_b, worker: Path,
            output_dir: Path, operation_seconds: int, deadline: float,
            max_payload: int, expected_rejection: str | None = None) -> dict:
    evidence = {"name": name, "source": source.name, "sourceSha256": sha256(source.read_bytes()),
                "transformB": transform, "expectedOutcome": "rejected" if expected_rejection else "succeeded",
                "operations": [], "invariants": {}, "status": "failed", "diagnostics": []}
    try:
        a = HARNESS.read_mesh(source)
        b = make_b(a)
        evidence["inputs"] = {"A": input_record(a), "B": input_record(b)}
        if sum(map(len, (*a, *b))) > max_payload:
            raise RuntimeError("Encoded input exceeds the configured payload memory budget")
        if expected_rejection:
            remaining = int(deadline - time.monotonic())
            if remaining <= 0:
                raise RuntimeError("Total suite runtime limit exceeded")
            try:
                HARNESS.run_worker(worker, name, "union", a, b, min(operation_seconds, remaining))
            except RuntimeError as error:
                if expected_rejection not in str(error):
                    raise
                evidence["status"] = "passed"
                evidence["observedOutcome"] = "rejected"
                evidence["diagnostics"].append(str(error))
                print(f"{name}: expected rejection: {error}", flush=True)
                return evidence
            raise RuntimeError("Native worker unexpectedly accepted a pair expected to be rejected")
        outputs = {}
        for operation in ("union", "intersection", "difference"):
            remaining = int(deadline - time.monotonic())
            if remaining <= 0:
                raise RuntimeError("Total suite runtime limit exceeded")
            started = time.perf_counter()
            mesh = HARNESS.run_worker(worker, name, operation, a, b, min(operation_seconds, remaining))
            if sum(map(len, mesh)) > max_payload:
                raise RuntimeError(f"{operation} output exceeds the configured payload memory budget")
            metric = HARNESS.metrics(f"{name} {operation}", *mesh)
            artifact = f"{name}-{operation}.obj"
            artifact_hash = write_obj(output_dir / artifact, mesh)
            outputs[operation] = metric
            evidence["operations"].append({"operation": operation, "status": "passed",
                "durationMs": round((time.perf_counter() - started) * 1000), "metrics": serializable_metrics(metric),
                "meshSha256": sha256(mesh[0] + mesh[1]), "artifact": artifact, "artifactSha256": artifact_hash})
            print(f"{name} {operation}: {metric['triangles']} triangles, volume {metric['volume']:.6g}", flush=True)
        a_volume = evidence["inputs"]["A"]["metrics"]["volume"]
        b_volume = evidence["inputs"]["B"]["metrics"]["volume"]
        union, intersection, difference = (outputs[operation] for operation in ("union", "intersection", "difference"))
        difference_identity = difference["volume"] + intersection["volume"]
        union_identity = union["volume"] + intersection["volume"]
        HARNESS.require_close(f"{name}: A = difference + intersection", difference_identity, a_volume)
        HARNESS.require_close(f"{name}: A + B = union + intersection", union_identity, a_volume + b_volume)
        a_bounds = np.asarray(evidence["inputs"]["A"]["metrics"]["bounds"])
        b_bounds = np.asarray(evidence["inputs"]["B"]["metrics"]["bounds"])
        tolerance = max(1e-5, 1e-4 * max(np.ptp(a_bounds), np.ptp(b_bounds)))
        expected_union = np.column_stack((np.minimum(a_bounds[::2], b_bounds[::2]),
                                          np.maximum(a_bounds[1::2], b_bounds[1::2]))).ravel()
        if not np.allclose(union["bounds"], expected_union, atol=tolerance, rtol=0):
            raise RuntimeError("Union bounds do not enclose both inputs")
        for label, result, lower, upper in (
            ("intersection", intersection, np.maximum(a_bounds[::2], b_bounds[::2]),
             np.minimum(a_bounds[1::2], b_bounds[1::2])),
            ("difference", difference, a_bounds[::2], a_bounds[1::2]),
        ):
            if np.any(result["bounds"][::2] < lower - tolerance) or np.any(result["bounds"][1::2] > upper + tolerance):
                raise RuntimeError(f"{label} bounds escape expected input bounds")
        evidence["invariants"] = {"differencePlusIntersection": difference_identity, "expectedA": a_volume,
            "unionPlusIntersection": union_identity, "expectedAPlusB": a_volume + b_volume,
            "relativeVolumeTolerance": 0.005, "boundsTolerance": tolerance,
            "closedManifold": True, "outwardOriented": True}
        evidence["status"] = "passed"
    except Exception as error:
        evidence["diagnostics"].append(str(error))
        print(f"{name}: FAIL: {error}", file=sys.stderr, flush=True)
    return evidence


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", type=Path, required=True)
    parser.add_argument("--assets-dir", type=Path, default=HARNESS.ASSETS)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--operation-seconds", type=int, default=90)
    parser.add_argument("--total-seconds", type=int, default=540)
    parser.add_argument("--max-payload-mb", type=int, default=64)
    parser.add_argument("--recorded-cgal-version", default="unknown")
    args = parser.parse_args()
    if min(args.operation_seconds, args.total_seconds, args.max_payload_mb) <= 0:
        parser.error("Runtime and payload limits must be positive")
    if not args.worker.is_file():
        parser.error("The built native CGAL worker is missing")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + args.total_seconds
    armadillo = args.assets_dir / "11_armadillo.obj"
    benchy = args.assets_dir / "10_3dbenchy.stl"
    tasks = [
        ("armadillo-shift", armadillo, "B translated +0.15 A X-span", lambda a: (HARNESS.shifted_copy(a[0], 0.15), a[1]), None),
        ("armadillo-rotated", armadillo, "B rotated +8 degrees Z, translated +0.05 A X-span", rotated_copy, None),
        ("3dbenchy-cutter", benchy, "B surface-centred cube, half-edge 0.12 max span", lambda a: HARNESS.surface_cutter(*a), None),
        ("3dbenchy-second-cutter", benchy, "B surface-centred cube translated +0.06 cutter X-span", shifted_surface_cutter, None),
        ("3dbenchy-coplanar-overlap", benchy, "B translated +0.08 A X-span; known CGAL corefinement rejection", lambda a: (HARNESS.shifted_copy(a[0], 0.08), a[1]), "Unauthorized intersections of constraints"),
    ]
    cases = [qualify(name, source, transform, make_b, args.worker, args.output_dir,
                     args.operation_seconds, deadline, args.max_payload_mb * 1048576, expected_rejection)
             for name, source, transform, make_b, expected_rejection in tasks]
    passed = sum(case["status"] == "passed" for case in cases)
    suite = {"worker": {"version": "native-protocol-v1", "recordedCgalVersion": args.recorded_cgal_version,
                        "sha256": sha256(args.worker.read_bytes())},
             "limits": {"operationSeconds": args.operation_seconds, "totalSeconds": args.total_seconds,
                        "payloadMiB": args.max_payload_mb},
             "cases": cases, "passed": passed, "total": len(cases)}
    diagnostics = [{"severity": "error", "message": f"{case['name']}: {message}"}
                   for case in cases if case["status"] != "passed" for message in case["diagnostics"]]
    (args.output_dir / "results.json").write_text(
        json.dumps({"realMeshSuite": suite, "diagnostics": diagnostics}, indent=2), encoding="utf-8"
    )
    print(f"Real-mesh qualification: {passed}/{len(cases)} passed", flush=True)
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    raise SystemExit(main())
