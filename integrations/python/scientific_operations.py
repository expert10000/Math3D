"""Read Math3D operation discovery without claiming a local Python executor.

The caller supplies the Math3D registry manifest and a server's verified binding
report. No operation is available when the report is absent.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence


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
            and "server" in descriptor.get("environments", ())
            and isinstance(descriptor.get("implementationId"), str)
            and descriptor["implementationId"] in verified
        ):
            available.append(dict(descriptor))
    return available
