#!/usr/bin/env python3
"""Report the resolved runtime dependency closure of the frozen worker."""

from __future__ import annotations

import importlib.metadata as metadata
import json
import platform
import re
import sys
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name


ROOT = Path(__file__).resolve().parents[1]
requirements_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "python/worker/requirements.freeze.txt"
requirements = []
for line in requirements_path.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    match = re.fullmatch(r"([A-Za-z0-9_.-]+)==([^\s=]+)", line)
    if match is None:
        raise SystemExit(f"Frozen requirement is not exact: {line}")
    requirements.append((canonicalize_name(match.group(1)), match.group(2)))

# PyInstaller includes setuptools runtime hooks in this worker even though it
# is not a direct scientific requirement.
runtime_extras = ["setuptools"]
pending = [name for name, _ in requirements] + runtime_extras
packages = {}
while pending:
    name = pending.pop(0)
    if name in packages:
        continue
    dist = metadata.distribution(name)
    resolved_name = canonicalize_name(dist.metadata["Name"])
    if resolved_name != name:
        raise SystemExit(f"Resolved {name} as unexpected distribution {resolved_name}")
    dependencies = []
    for entry in dist.requires or []:
        requirement = Requirement(entry)
        if requirement.marker and not requirement.marker.evaluate({"extra": ""}):
            continue
        dependency = canonicalize_name(requirement.name)
        dependencies.append(dependency)
        pending.append(dependency)
    packages[name] = {
        "name": dist.metadata["Name"],
        "version": dist.version,
        "licenseExpression": dist.metadata.get("License-Expression"),
        "license": dist.metadata.get("License"),
        "classifiers": [value for value in dist.metadata.get_all("Classifier", []) if "License ::" in value],
        "homePage": dist.metadata.get("Home-page") or dist.metadata.get("Project-URL"),
        "dependencies": sorted(set(dependencies)),
    }

for name, version in requirements:
    if packages[name]["version"] != version:
        raise SystemExit(f"Frozen {name} requires {version}; installed {packages[name]['version']}")

print(json.dumps({
    "pythonVersion": platform.python_version(),
    "requirements": [name for name, _ in requirements],
    "runtimeExtras": runtime_extras,
    "packages": [packages[name] for name in sorted(packages)],
}, sort_keys=True))
