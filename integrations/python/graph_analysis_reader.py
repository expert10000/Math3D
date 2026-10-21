"""Read Math3D Graph numerical evidence without running code or trusting its claims.

The source hash identifies the Math3D document revision; this JSON alone does not
contain the source document and cannot independently verify its mathematics.
"""

from __future__ import annotations

import json
import math
import re
import argparse
from pathlib import Path
from typing import Any

MAX_BYTES = 1024 * 1024
MAX_CANDIDATES = 256
FORMAT = "math3d.graph2d-numerical.v1"
_HASH = re.compile(r"sha256:[0-9a-f]{64}\Z")


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def _reject_constant(value: str) -> None:
    raise ValueError(f"Non-finite JSON number: {value}")


def _object(value: Any, fields: set[str], name: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError(f"{name} has missing or unsupported fields")
    return value


def _number(value: Any, name: str, minimum: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be finite")
    if minimum is not None and value < minimum:
        raise ValueError(f"{name} is below its minimum")
    return float(value)


def _text(value: Any, name: str, limit: int = 256) -> str:
    if not isinstance(value, str) or not value or len(value) > limit:
        raise ValueError(f"{name} must be bounded nonempty text")
    return value


def validate_graph_analysis(data: Any) -> dict[str, Any]:
    """Validate a decoded v1 dataset and return it for Python/Theory Lab analysis."""
    root = _object(data, {"format", "operation", "resultId", "source", "objectIds", "interval",
                          "scan", "candidates", "diagnostics", "warnings"}, "dataset")
    if root["format"] != FORMAT or root["operation"] not in ("critical-points", "intersections"):
        raise ValueError("Unsupported Graph numerical dataset format or operation")
    operation = root["operation"]
    _text(root["resultId"], "resultId")
    source = _object(root["source"], {"documentId", "revision", "structuralHash"}, "source")
    if not _text(source["documentId"], "source.documentId").startswith("math3d:"):
        raise ValueError("Invalid Math3D document ID")
    revision = source["revision"]
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
        raise ValueError("Invalid source revision")
    if not _HASH.fullmatch(_text(source["structuralHash"], "source.structuralHash")):
        raise ValueError("Invalid source structural hash")
    object_ids = root["objectIds"]
    expected_ids = 1 if operation == "critical-points" else 2
    if not isinstance(object_ids, list) or len(object_ids) != expected_ids or len(set(map(str, object_ids))) != expected_ids:
        raise ValueError("Invalid object IDs")
    for item in object_ids:
        _text(item, "object ID", 128)
    interval = _object(root["interval"], {"min", "max"}, "interval")
    lower, upper = _number(interval["min"], "interval.min"), _number(interval["max"], "interval.max")
    if lower >= upper:
        raise ValueError("Empty analysis interval")
    scan = _object(root["scan"], {"status", "quality", "evaluations", "tolerance"}, "scan")
    status_quality = {"complete": "approximate", "incomplete": "incomplete", "unavailable": None}
    if scan["status"] not in status_quality or scan["quality"] != status_quality[scan["status"]]:
        raise ValueError("Inconsistent scan quality")
    evaluations = scan["evaluations"]
    if isinstance(evaluations, bool) or not isinstance(evaluations, int) or not 0 <= evaluations <= 12000:
        raise ValueError("Invalid evaluation count")
    tolerance = scan["tolerance"]
    absolute_tolerance: float | None = None
    if tolerance is not None:
        checked = _object(tolerance, {"absolute"}, "scan.tolerance")
        absolute_tolerance = _number(checked["absolute"], "scan.tolerance.absolute", 0)
        if absolute_tolerance == 0:
            raise ValueError("Tolerance must be positive")
    candidates = root["candidates"]
    if not isinstance(candidates, list) or len(candidates) > MAX_CANDIDATES:
        raise ValueError("Candidate list exceeds its bound")
    if scan["status"] == "unavailable" and candidates:
        raise ValueError("Unavailable scan cannot contain candidates")
    for index, candidate in enumerate(candidates):
        name = f"candidates[{index}]"
        fields = {"kind", "x", "y", "residual", "quality", "method", "confidence"}
        fields |= {"estimatedXError"} if operation == "critical-points" else {"classification"}
        item = _object(candidate, fields, name)
        allowed_kinds = ("zero", "minimum", "maximum", "inflection") if operation == "critical-points" else ("intersection",)
        if item["kind"] not in allowed_kinds:
            raise ValueError(f"Invalid {name}.kind")
        x = _number(item["x"], f"{name}.x")
        _number(item["y"], f"{name}.y")
        residual = _number(item["residual"], f"{name}.residual", 0)
        if not lower <= x <= upper:
            raise ValueError(f"{name} is outside the analysis interval")
        if item["quality"] not in ("approximate", "refined") or item["method"] not in (
                "sample", "bracket-bisection", "minimum-absolute-residual") or item["confidence"] not in (
                "numerical", "heuristic"):
            raise ValueError(f"Invalid {name} evidence")
        if item["quality"] == "refined" and (item["method"] != "bracket-bisection" or
                item["confidence"] != "numerical" or absolute_tolerance is None or residual > absolute_tolerance):
            raise ValueError(f"{name} claims refinement without its stated evidence")
        if operation == "critical-points":
            if item["estimatedXError"] is not None:
                _number(item["estimatedXError"], f"{name}.estimatedXError", 0)
        elif item["classification"] not in ("crossing", "tangent-possible"):
            raise ValueError(f"Invalid {name}.classification")
    for field in ("diagnostics", "warnings"):
        values = root[field]
        if not isinstance(values, list) or len(values) > 256:
            raise ValueError(f"Invalid {field} list")
    for warning in root["warnings"]:
        _text(warning, "warning", 2048)
    for item in root["diagnostics"]:
        if not isinstance(item, dict) or not {"code", "severity", "message"} <= set(item) or not set(item) <= {
                "code", "severity", "message", "path"}:
            raise ValueError("Invalid diagnostic fields")
        diagnostic = item
        _text(diagnostic["code"], "diagnostic.code")
        _text(diagnostic["message"], "diagnostic.message", 2048)
        if "path" in diagnostic:
            _text(diagnostic["path"], "diagnostic.path", 256)
        if diagnostic["severity"] not in ("info", "warning", "error"):
            raise ValueError("Invalid diagnostic severity")
    return root


def load_graph_analysis(path: str | Path) -> dict[str, Any]:
    """Read one bounded local JSON file; no Python source or Math3D process is run."""
    with Path(path).open("rb") as handle:
        payload = handle.read(MAX_BYTES + 1)
    if len(payload) > MAX_BYTES:
        raise ValueError("Graph numerical dataset exceeds 1 MiB")
    decoded = json.loads(payload.decode("utf-8"), object_pairs_hook=_reject_duplicate_keys,
                         parse_constant=_reject_constant)
    return validate_graph_analysis(decoded)


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a Math3D Graph numerical JSON export")
    parser.add_argument("dataset", type=Path)
    args = parser.parse_args()
    data = load_graph_analysis(args.dataset)
    print(f"{data['operation']}: {len(data['candidates'])} candidates, "
          f"scan {data['scan']['status']} ({data['scan']['quality']})")


if __name__ == "__main__":
    main()
