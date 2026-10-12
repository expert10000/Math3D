#!/usr/bin/env python3
"""Publish a bounded scientific-scene/v1 bundle; no Math3D runtime required."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import tempfile
from typing import Any

MAX_BINARY_BYTES = 16 * 1024 * 1024
MAX_MANIFEST_BYTES = 64 * 1024
ID = re.compile(r"^[A-Za-z][A-Za-z0-9._-]{0,63}$")
SCHEMA = re.compile(r"^[A-Za-z][A-Za-z0-9._-]*/v[1-9][0-9]*$")


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _id(value: Any, label: str) -> str:
    _require(isinstance(value, str) and ID.fullmatch(value) is not None, f"Invalid {label}")
    return value


def _text(value: Any, label: str, limit: int = 160) -> str:
    _require(isinstance(value, str) and 0 < len(value.encode("utf-16-le")) // 2 <= limit and
             value == value.strip() and
             all(ord(char) >= 32 and ord(char) != 127 for char in value), f"Invalid {label}")
    return value


def _number(value: Any, label: str) -> float:
    _require(not isinstance(value, (str, bytes, bool)), f"Invalid {label}")
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise ValueError(f"Invalid {label}") from error
    _require(math.isfinite(number), f"Non-finite {label}")
    return number


def _binary(values: Any, count: int, label: str) -> bytes:
    _require(isinstance(values, (list, tuple)) and len(values) == count, f"{label} shape mismatch")
    data = bytearray(count * 8)
    for index, value in enumerate(values):
        struct.pack_into("<d", data, index * 8, _number(value, f"{label}[{index}]"))
    return bytes(data)


def _json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def publish_scene(spec: dict[str, Any], output: str | Path) -> dict[str, Any]:
    """Write one verified-data-compatible bundle; refuse an existing destination.

    Values are flat, last-axis-fastest. This publisher validates its narrow API;
    Math3D independently validates the contract and re-hashes every import.
    """
    _require(isinstance(spec, dict), "Scientific scene spec must be an object")
    required = {"sceneId", "title", "producer", "sourceId", "sourceSchema", "coordinateKind",
                "axes", "origin", "spacing", "periodic", "shape", "datasetId", "quantity", "real"}
    optional = {"imaginary", "view"}
    _require(required <= spec.keys() and spec.keys() <= required | optional, "Unknown or missing scientific scene spec field")
    scene_id = _id(spec["sceneId"], "scene ID")
    title = _text(spec["title"], "title")
    producer = _id(spec["producer"], "producer")
    source_id = _id(spec["sourceId"], "source ID")
    source_schema = spec["sourceSchema"]
    _require(isinstance(source_schema, str) and SCHEMA.fullmatch(source_schema) is not None, "Invalid source schema")
    _require(spec["coordinateKind"] in ("cartesian", "reciprocal", "index"), "Invalid coordinate kind")
    shape = spec["shape"]
    _require(isinstance(shape, list) and len(shape) in (2, 3) and
             all(type(size) is int and 1 <= size <= 256 for size in shape), "Invalid field shape")
    count = math.prod(shape)
    _require(1 <= count <= 1_000_000, "Field sample limit exceeded")
    axes, origin, spacing, periodic = (spec[key] for key in ("axes", "origin", "spacing", "periodic"))
    _require(all(isinstance(value, list) and len(value) == len(shape)
                 for value in (axes, origin, spacing, periodic)), "Coordinate rank mismatch")
    checked_axes = []
    for axis in axes:
        _require(isinstance(axis, dict) and set(axis) == {"name", "unit"}, "Invalid coordinate axis")
        checked_axes.append({"name": _id(axis["name"], "axis name"), "unit": _text(axis["unit"], "axis unit", 80)})
    _require(len({axis["name"] for axis in checked_axes}) == len(shape), "Duplicate coordinate axis")
    checked_origin = [_number(value, "origin") for value in origin]
    checked_spacing = [_number(value, "spacing") for value in spacing]
    _require(all(abs(value) <= 1_000_000 for value in checked_origin), "Origin exceeds scene domain")
    _require(all(0 < value <= 1_000_000 for value in checked_spacing), "Spacing must be positive and bounded")
    _require(all(type(value) is bool for value in periodic), "Invalid periodic flag")
    _require(all(abs(checked_origin[i] + checked_spacing[i] * (shape[i] - 1)) <= 1_000_000
                 for i in range(len(shape))), "Coordinate extent exceeds scene domain")
    dataset_id = _id(spec["datasetId"], "dataset ID")
    quantity = spec["quantity"]
    _require(isinstance(quantity, dict) and {"name", "unit"} <= quantity.keys() and
             quantity.keys() <= {"name", "unit", "symbol"}, "Invalid quantity")
    checked_quantity = {"name": _text(quantity["name"], "quantity name"),
                        "unit": _text(quantity["unit"], "quantity unit", 80)}
    if "symbol" in quantity:
        checked_quantity["symbol"] = _text(quantity["symbol"], "quantity symbol", 32)
    complex_field = "imaginary" in spec
    _require(not complex_field or len(shape) == 3, "Complex publisher requires a 3D field")
    _require(count * 8 * (2 if complex_field else 1) <= MAX_BINARY_BYTES, "Binary resource budget exceeded")
    real = _binary(spec["real"], count, "real")
    imaginary = _binary(spec["imaginary"], count, "imaginary") if complex_field else None
    resources = []
    payloads = [("real", "real.f64", real)]
    if imaginary is not None:
        payloads.append(("imaginary", "imaginary.f64", imaginary))
    for resource_id, name, data in payloads:
        resources.append({"id": resource_id, "path": name, "format": "f64le", "count": count,
                          "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    view = spec.get("view")
    if view is None:
        view = {"id": "default", "label": "Density slice" if complex_field else
                ("Height surface" if len(shape) == 2 else "Scalar slice"),
                "renderer": "height-surface" if len(shape) == 2 else "slice",
                "operation": "complex-density/v1" if complex_field else "identity"}
        if len(shape) == 3:
            view["axis"] = 2
    _require(isinstance(view, dict) and {"id", "label", "renderer", "operation"} <= view.keys() and
             view.keys() <= {"id", "label", "renderer", "operation", "axis"}, "Invalid view")
    checked_view = {"id": _id(view["id"], "view ID"), "label": _text(view["label"], "view label"),
                    "dataset": dataset_id, "renderer": view["renderer"], "operation": view["operation"]}
    if len(shape) == 2:
        _require(view["renderer"] == "height-surface" and "axis" not in view and
                 view["operation"] == "identity", "Unsupported two-dimensional view")
    else:
        _require(view["renderer"] == "slice" and type(view.get("axis")) is int and
                 0 <= view["axis"] <= 2 and view["operation"] ==
                 ("complex-density/v1" if complex_field else "identity"), "Unsupported three-dimensional view")
        checked_view["axis"] = view["axis"]
    dataset = {"id": dataset_id, "semanticType": "complex-scalar-field" if complex_field else "scalar-field",
               "coordinateSystem": "space", "shape": shape, "order": "last-axis-fastest",
               "quantity": checked_quantity, "real": "real"}
    if complex_field:
        dataset["imaginary"] = "imaginary"
    manifest = {"schema": "scientific-scene/v1", "sceneId": scene_id, "title": title,
                "source": {"producer": producer, "sourceId": source_id, "sourceSchema": source_schema,
                           "sha256": hashlib.sha256(real + (imaginary or b"")).hexdigest()},
                "resources": resources,
                "coordinates": [{"id": "space", "kind": spec["coordinateKind"], "axes": checked_axes,
                                 "origin": checked_origin, "spacing": checked_spacing, "periodic": periodic}],
                "datasets": [dataset], "views": [checked_view]}
    manifest_bytes = _json_bytes(manifest)
    _require(len(manifest_bytes) <= MAX_MANIFEST_BYTES, "Manifest budget exceeded")
    envelope = {"schema": "scientific-scene-bundle/v1",
                "manifest": {"path": "manifest.json", "bytes": len(manifest_bytes),
                             "sha256": hashlib.sha256(manifest_bytes).hexdigest()}}
    target = Path(output).expanduser().absolute()
    _require(target.suffix == ".sscene" and target.name != ".sscene", "Output must be a named .sscene directory")
    _require(target.parent.is_dir(), "Output parent directory does not exist")
    _require(not target.exists() and not target.is_symlink(), "Output already exists")
    staging = Path(tempfile.mkdtemp(prefix=f".{target.stem}-publish-", dir=target.parent))
    try:
        (staging / "bundle.json").write_bytes(_json_bytes(envelope))
        (staging / "manifest.json").write_bytes(manifest_bytes)
        for _, name, data in payloads:
            (staging / name).write_bytes(data)
        _require(not target.exists() and not target.is_symlink(), "Output already exists")
        os.rename(staging, target)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return {"directory": str(target), "manifestSha256": envelope["manifest"]["sha256"],
            "resourceBytes": sum(len(data) for _, _, data in payloads)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish a standalone scientific-scene/v1 directory")
    parser.add_argument("--spec", required=True, type=Path, help="JSON field specification")
    parser.add_argument("--output", required=True, type=Path, help="New .sscene directory")
    args = parser.parse_args()
    _require(args.spec.is_file() and args.spec.stat().st_size <= 32 * 1024 * 1024,
             "Spec file missing or exceeds 32 MiB")
    spec = json.loads(args.spec.read_text(encoding="utf-8"))
    print(json.dumps(publish_scene(spec, args.output), sort_keys=True))


if __name__ == "__main__":
    main()
