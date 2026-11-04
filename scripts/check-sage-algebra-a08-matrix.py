"""Compare exact algebra fixture invariants on local Sage and the Docker worker.

Run with `sage -python scripts/check-sage-algebra-a08-matrix.py` from the repository root.
Use `--require-docker` in a CI job that has started the pinned Sage 10.10 worker.
"""

import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "sage-worker"))
from service.sage_runner import run_payload  # noqa: E402


def request_json(url, payload=None):
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    request = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=15 if data else 3) as response:
        return json.load(response)


def signature(response, case):
    if not response.get("success"):
        raise AssertionError(f"{case['name']}: Sage failed: {response.get('error')}")
    value = response["result"]
    target = case["request"]["params"]["target"]
    record = case["request"]["params"]["objects"][-1]
    if value.get("format") != "math3d.sage-algebra-reconstruction-result" or value.get("schemaVersion") != 1:
        raise AssertionError(f"{case['name']}: reconstruction result schema changed")
    if value.get("target") != target or value.get("definitionHash") != record["contentHash"]:
        raise AssertionError(f"{case['name']}: target identity or definition hash changed")
    actual = {key: value.get(key) for key in case["expected"]}
    if actual != case["expected"]:
        raise AssertionError(f"{case['name']}: {actual!r} != {case['expected']!r}")
    return actual


def run_matrix(base_url, require_docker):
    fixture = json.loads((ROOT / "tests" / "fixtures" / "sage-algebra" / "a08-reconstruction.json").read_text("utf-8"))
    if fixture["format"] != "math3d.sage-algebra-runtime-fixtures" or fixture["schemaVersion"] != 1:
        raise AssertionError("Unexpected A08 fixture schema")
    local = {}
    local_version = None
    for case in fixture["cases"]:
        response = run_payload(case["request"])
        local_version = response.get("engineVersion")
        local[case["name"]] = signature(response, case)
    matrix = {"fixtureCount": len(local), "local": {"version": local_version, "status": "passed", "cases": local},
        "docker": {"version": None, "status": "unavailable", "cases": {}}}

    try:
        health = request_json(base_url + "/health")
    except (HTTPError, URLError, TimeoutError, OSError) as error:
        matrix["docker"]["reason"] = str(error)
        if require_docker:
            raise AssertionError(f"Docker Sage worker is required: {error}") from error
        return matrix
    version = str(health.get("engineVersion") or "")
    if not health.get("available") or "sage.algebra.reconstruct" not in health.get("operations", []):
        raise AssertionError("Docker Sage worker does not advertise algebra reconstruction")
    if not version.startswith("10.10"):
        raise AssertionError(f"Expected pinned Docker Sage 10.10, found {version or 'unreported'}")
    docker = {}
    for case in fixture["cases"]:
        response = request_json(base_url + "/run", case["request"])
        docker[case["name"]] = signature(response, case)
        if docker[case["name"]] != local[case["name"]]:
            raise AssertionError(f"{case['name']}: cross-runtime mathematical invariants differ")
    matrix["docker"] = {"version": version, "status": "passed", "cases": docker}
    return matrix


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--docker-url", default="http://127.0.0.1:8767")
    parser.add_argument("--require-docker", action="store_true")
    parser.add_argument("--output", type=Path)
    options = parser.parse_args()
    result = run_matrix(options.docker_url.rstrip("/"), options.require_docker)
    rendered = json.dumps(result, indent=2, sort_keys=True)
    if options.output:
        options.output.parent.mkdir(parents=True, exist_ok=True)
        options.output.write_text(rendered + "\n", encoding="utf-8")
    print(f"A08: {result['fixtureCount']} local Sage {result['local']['version']} fixtures passed; "
        f"Docker {result['docker']['status']}" + (f" ({result['docker'].get('reason')})" if result['docker'].get("reason") else ""))
