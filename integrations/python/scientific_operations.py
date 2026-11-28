"""Discover and call Math3D scientific operations through verified server bindings.

The generic client also accepts caller supplied manifests and transports for
embedding. ``connect_scientific_api`` obtains both from one Math3D server.
"""

from __future__ import annotations

import math
import json
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError
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
        workflow_transport: Callable[[Sequence[Mapping[str, Any]]], Mapping[str, Any]] | None = None,
    ) -> None:
        self._available = {
            item["id"]: item
            for item in discover_server_operations(descriptors, verified_implementation_ids)
            if item.get("schemaCompleteness") == "complete"
        }
        self._transport = transport
        self._workflow_transport = workflow_transport

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

    def run_workflow(self, steps: Sequence[Mapping[str, Any]]) -> Mapping[str, Any]:
        if self._workflow_transport is None:
            raise ValueError("No verified workflow transport is configured")
        if not steps or any(step.get("operationId") not in self._available for step in steps):
            raise ValueError("Workflow contains an unverified operation")
        result = self._workflow_transport(steps)
        if not isinstance(result.get("steps"), list):
            raise ValueError("Math3D scientific API returned an invalid workflow result")
        return result


def connect_scientific_api(base_url: str, *, timeout: float = 30.0) -> ScientificOperationClient:
    """Discover real server bindings and execute through Math3D's HTTP API.

    The caller chooses and trusts the server origin. Discovery and execution use
    that same origin; no caller supplied binding list is accepted here.
    """
    parsed = urlsplit(base_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("Expected an HTTP(S) scientific API origin without credentials")
    if not math.isfinite(timeout) or timeout <= 0:
        raise ValueError("timeout must be positive and finite")
    origin = base_url.rstrip("/")

    def request_json(path: str, payload: Mapping[str, Any] | None = None) -> Mapping[str, Any]:
        body = None if payload is None else json.dumps(payload, allow_nan=False).encode("utf-8")
        request = Request(origin + path, data=body,
                          headers={"Accept": "application/json", "Content-Type": "application/json"},
                          method="GET" if body is None else "POST")
        try:
            with urlopen(request, timeout=timeout) as response:
                result = json.load(response)
        except HTTPError as error:
            detail = error.read(1024).decode("utf-8", errors="replace")
            raise ValueError(f"Math3D scientific API returned HTTP {error.code}: {detail}") from error
        if not isinstance(result, dict):
            raise ValueError("Math3D scientific API returned a non-object response")
        return result

    discovery = request_json("/v1/operations")
    descriptors = discovery.get("operations")
    verified = discovery.get("verifiedImplementationIds")
    if not isinstance(descriptors, list) or not isinstance(verified, list):
        raise ValueError("Math3D scientific API did not report verified bindings")

    def transport(operation_id: str, inputs: Mapping[str, Any],
                  parameters: Mapping[str, Any]) -> Mapping[str, Any]:
        envelope = request_json(f"/v1/operations/{quote(operation_id, safe='')}/execute",
                                {"input": inputs, "parameters": parameters})
        if envelope.get("operationId") != operation_id or not isinstance(envelope.get("output"), dict):
            raise ValueError("Math3D scientific API returned a mismatched operation result")
        return envelope["output"]

    def workflow_transport(steps: Sequence[Mapping[str, Any]]) -> Mapping[str, Any]:
        return request_json("/v1/workflows/execute", {"steps": list(steps)})

    return ScientificOperationClient(descriptors, verified, transport, workflow_transport)


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
