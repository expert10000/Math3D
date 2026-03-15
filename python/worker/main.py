#!/usr/bin/env python3
"""
Stable worker entrypoint for Electron -> Python subprocess communication.
"""

import argparse
import json
import sys

if __package__ in (None, ""):
    import os

    _HERE = os.path.dirname(os.path.abspath(__file__))
    if _HERE not in sys.path:
        sys.path.insert(0, _HERE)
    from runtime import bootstrap_worker_paths
    from worker_impl import main as worker_main
else:
    from .runtime import bootstrap_worker_paths
    from .runtime import dependency_probe
    from .worker_impl import main as worker_main

if __package__ in (None, ""):
    from runtime import dependency_probe

WORKER_VERSION = "1.0.0"
PROTOCOL_VERSION = "2026-03-15"


def _emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Math3D Python worker entrypoint")
    parser.add_argument("--ping", action="store_true", help="Emit protocol ping response and exit")
    parser.add_argument("--version", action="store_true", help="Emit worker version/protocol and exit")
    parser.add_argument("--health", action="store_true", help="Run dependency probe and exit")
    return parser.parse_args(argv)


def main() -> None:
    bootstrap_worker_paths()
    args = _parse_args(sys.argv[1:])
    if args.ping:
        _emit({"type": "pong", "ok": True, "version": WORKER_VERSION, "protocol": PROTOCOL_VERSION})
        return
    if args.version:
        _emit({"type": "version", "ok": True, "version": WORKER_VERSION, "protocol": PROTOCOL_VERSION})
        return
    if args.health:
        probe = dependency_probe()
        _emit(
            {
                "type": "health",
                "ok": bool(probe.get("ok")),
                "version": WORKER_VERSION,
                "protocol": PROTOCOL_VERSION,
                "dependencies": probe.get("dependencies", {}),
            }
        )
        return
    worker_main()


if __name__ == "__main__":
    main()
