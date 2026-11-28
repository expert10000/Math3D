"""Read Math3D operation discovery without claiming a local Python executor.

The caller supplies the Math3D registry manifest and a server's verified binding
report. No operation is available when the report is absent.
"""

from __future__ import annotations

import math
from typing import Any, Callable, Mapping, Sequence


def discover_server_operations(
    descriptors: Sequence[Mapping[str, Any]],
    verified_implementation_ids: Sequence[str] = (),
) -> list[dict[str, Any]]:
    """Return registered server operations whose implementations are verified."""
    verified = set(verified_implementation_ids)
    available: list[dict[str, Any]] = []
    for descriptor in descriptors:
        if (
            descriptor.get("kind") == "scientific-operations"
            and descriptor.get("status") == "registered"
            and descriptor.get("schemaCompleteness") == "complete"
            and "server" in descriptor.get("environments", ())
            and isinstance(descriptor.get("implementationId"), str)
            and descriptor["implementationId"] in verified
        ):
            available.append(dict(descriptor))
    return available


class ScientificOperationClient:
    """Descriptor driven Python call surface over a caller supplied verified transport.

    The transport owns authentication, cancellation and the actual server request.
    Discovery alone cannot make an operation executable.
    """

    def __init__(
        self,
        descriptors: Sequence[Mapping[str, Any]],
        verified_implementation_ids: Sequence[str],
        transport: Callable[[str, Mapping[str, Any], Mapping[str, Any]], Mapping[str, Any]],
    ) -> None:
        self._available = {
            item["id"]: item
            for item in discover_server_operations(descriptors, verified_implementation_ids)
            if item.get("schemaCompleteness") == "complete"
        }
        self._transport = transport

    def operations(self) -> list[str]:
        return sorted(self._available)

    def execute(
        self,
        operation_id: str,
        inputs: Mapping[str, Any],
        parameters: Mapping[str, Any] | None = None,
    ) -> Mapping[str, Any]:
        descriptor = self._available.get(operation_id)
        if descriptor is None:
            raise ValueError(f"No complete verified server operation: {operation_id}")
        params = parameters or {}
        if not _valid_schema(descriptor.get("inputSchema", {}), inputs) or not _valid_schema(
            descriptor.get("parameterSchema", {}), params
        ):
            raise ValueError(f"Invalid input or parameters for {operation_id}")
        result = self._transport(operation_id, inputs, params)
        if not _valid_schema(descriptor.get("outputSchema", {}), result):
            raise ValueError(f"Invalid result for {operation_id}")
        return result


def _valid_schema(schema: Mapping[str, Any], value: Any) -> bool:
    """Validate the JSON Schema subset used by Math3D discovery."""
    choices = schema.get("anyOf")
    if choices is not None:
        return any(_valid_schema(choice, value) for choice in choices)
    if "enum" in schema and value not in schema["enum"]:
        return False
    kind = schema.get("type")
    if kind == "null":
        return value is None
    if kind == "string":
        return isinstance(value, str)
    if kind == "boolean":
        return isinstance(value, bool)
    if kind in ("number", "integer"):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return False
        if not math.isfinite(value):
            return False
        if kind == "integer" and (not isinstance(value, int) and not value.is_integer()):
            return False
        return ("minimum" not in schema or value >= schema["minimum"]) and (
            "maximum" not in schema or value <= schema["maximum"]
        )
    if kind == "array":
        if not isinstance(value, list):
            return False
        if "minItems" in schema and len(value) < schema["minItems"]:
            return False
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            return False
        return "items" not in schema or all(_valid_schema(schema["items"], item) for item in value)
    if kind == "object":
        if not isinstance(value, Mapping) or any(key not in value for key in schema.get("required", ())):
            return False
        properties = schema.get("properties", {})
        return all(
            _valid_schema(properties[key], item) if key in properties else schema.get("additionalProperties") is not False
            for key, item in value.items()
        )
    return False
