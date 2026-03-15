#!/usr/bin/env python3
"""Backward-compatible shim. Prefer: python python/worker/main.py"""

import os
import runpy
import sys


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, ".."))
    entrypoint = os.path.join(root, "python", "worker", "main.py")
    if not os.path.exists(entrypoint):
        raise RuntimeError(f"Worker entrypoint not found: {entrypoint}")
    if root not in sys.path:
        sys.path.insert(0, root)
    runpy.run_path(entrypoint, run_name="__main__")


if __name__ == "__main__":
    main()
