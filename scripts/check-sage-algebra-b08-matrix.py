"""B08 exact operation goldens on local Sage and the pinned Docker HTTP route.

Run from the repository root with ``sage -python scripts/check-sage-algebra-b08-matrix.py``.
Use ``--require-docker`` after starting the Sage 10.10 service in CI.
"""

import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "sage-worker"))
from service.sage_runner import SAGE_VERSION, run_payload  # noqa: E402

REQUIRED = {"sage.polynomial.dossier", "sage.matrix.linear_dossier", "sage.matrix.integer_forms"}


def request_json(url, payload=None):
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    request = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=45 if data else 3) as response:
        return json.load(response)


def fixture_cases():
    fixture = json.loads((ROOT / "tests" / "fixtures" / "sage-algebra" / "b08-operations.json").read_text("utf-8"))
    if fixture.get("format") != "math3d.sage-algebra-operation-goldens" or fixture.get("schemaVersion") != 1:
        raise AssertionError("Unexpected B08 fixture schema")
    cases = fixture.get("cases")
    names = [case["name"] for case in cases]
    if len(names) != len(set(names)) or {case["request"]["operation"] for case in cases} != REQUIRED:
        raise AssertionError("B08 fixture names or operation coverage changed")
    if not all(("expected" in case) != ("errorContains" in case) for case in cases):
        raise AssertionError("Each B08 case needs one exact result or failure expectation")
    return cases


def project(actual, expected, path="result"):
    """Check every golden field, including nested matrix and polynomial identities."""
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            raise AssertionError(f"{path}: expected an object")
        return {key: project(actual[key], value, f"{path}.{key}") for key, value in expected.items()}
    if actual != expected:
        raise AssertionError(f"{path}: {actual!r} != {expected!r}")
    return actual


def multiply(left, right):
    return [[sum(a * b for a, b in zip(row, column)) for column in zip(*right)] for row in left]


def determinant(rows):
    if len(rows) == 1:
        return rows[0][0]
    return sum((-1 if column % 2 else 1) * value * determinant(
        [row[:column] + row[column + 1:] for row in rows[1:]]) for column, value in enumerate(rows[0]))


def verify_integer_forms(value):
    """Transformation entries may differ across Sage versions, but their identities may not."""
    source = [[int(entry) for entry in row] for row in value["sourceMatrix"]]
    smith = [[int(entry) for entry in row] for row in value["smith"]["form"]]
    hermite = [[int(entry) for entry in row] for row in value["hermite"]["form"]]
    diagonal = [int(entry) for entry in value["smith"]["diagonal"]]
    if any(smith[i][j] != (diagonal[i] if i == j else 0)
           for i in range(len(source)) for j in range(len(source[0]))):
        raise AssertionError("Smith form is not the declared diagonal")
    nonzero = [entry for entry in diagonal if entry]
    if any(entry < 0 for entry in diagonal) or any(b % a for a, b in zip(nonzero, nonzero[1:])):
        raise AssertionError("Smith invariant factors violate divisibility")
    if value["rank"] != len(nonzero) or value["cokernel"] != {
            "freeRank": len(source) - len(nonzero), "torsionOrders": [str(x) for x in nonzero if x > 1]}:
        raise AssertionError("Smith rank or cokernel invariants differ")
    smith_transform = value["smith"]["transformations"]
    if smith_transform["status"] == "verified":
        left = [[int(x) for x in row] for row in smith_transform["left"]]
        right = [[int(x) for x in row] for row in smith_transform["right"]]
        if abs(determinant(left)) != 1 or abs(determinant(right)) != 1 or multiply(multiply(left, source), right) != smith:
            raise AssertionError("Smith unimodular transformation identity failed")
    elif smith_transform["status"] != "unavailable" or not smith_transform.get("reason"):
        raise AssertionError("Smith transformation status is invalid")
    hermite_transform = value["hermite"]["transformation"]
    if hermite_transform["status"] == "verified":
        left = [[int(x) for x in row] for row in hermite_transform["left"]]
        if abs(determinant(left)) != 1 or multiply(left, source) != hermite:
            raise AssertionError("Hermite unimodular transformation identity failed")
    elif hermite_transform["status"] != "unavailable" or not hermite_transform.get("reason"):
        raise AssertionError("Hermite transformation status is invalid")
    return {"smith": smith_transform["status"], "hermite": hermite_transform["status"]}


def signature(response, case):
    operation = case["request"]["operation"]
    if response.get("operation") != operation or response.get("engine") != "sagemath":
        raise AssertionError("Response operation or engine differs from request")
    if "errorContains" in case:
        if response.get("success") or case["errorContains"] not in str(response.get("error", "")):
            raise AssertionError(f"Expected rejection containing {case['errorContains']!r}: {response!r}")
        return {"rejected": case["errorContains"]}
    if not response.get("success"):
        raise AssertionError(f"Sage failed: {response.get('error')}")
    if not response.get("engineVersion"):
        raise AssertionError("Successful Sage response lacks engine version")
    value = response["result"]
    if operation == "sage.polynomial.dossier":
        if value.get("schemaVersion") != 1 or value.get("coefficientDomain") != "QQ" or value.get("variable") != "x" or value.get("sourcePolynomial") != case["request"]["params"]["polynomial"]:
            raise AssertionError("Polynomial dossier schema or source changed")
    else:
        expected_format = "math3d.sage-matrix-dossier-result" if operation == "sage.matrix.linear_dossier" else "math3d.sage-integer-matrix-forms-result"
        domain = "QQ" if operation == "sage.matrix.linear_dossier" else "ZZ"
        if value.get("format") != expected_format or value.get("schemaVersion") != 1 or value.get("coefficientDomain") != domain or value.get("sourceMatrix") != case["request"]["params"]["matrix"]:
            raise AssertionError("Matrix dossier schema or source changed")
    selected = project(value, case["expected"])
    if operation == "sage.matrix.integer_forms":
        selected["transformationStatus"] = verify_integer_forms(value)
    return selected


def local_response(request):
    try:
        return run_payload(request)
    except Exception as error:
        return {"engine": "sagemath", "operation": request["operation"], "success": False, "error": str(error)}


def run_cases(cases, execute):
    signatures, failures = {}, []
    for case in cases:
        try:
            signatures[case["name"]] = signature(execute(case["request"]), case)
        except Exception as error:
            failures.append({"case": case["name"], "reason": str(error)})
    return signatures, failures


def run_matrix(base_url, require_docker=False, probe=request_json):
    cases = fixture_cases()
    local, local_failures = run_cases(cases, local_response)
    matrix = {"fixtureCount": len(cases), "local": {"version": str(SAGE_VERSION),
        "status": "failed" if local_failures else "passed", "cases": local, "failures": local_failures},
        "docker": {"version": None, "status": "unavailable", "cases": {}, "failures": []}, "differences": []}
    try:
        health = probe(base_url + "/health")
    except (HTTPError, URLError, TimeoutError, OSError) as error:
        matrix["docker"]["reason"] = str(error)
        if require_docker:
            matrix["docker"]["status"] = "failed"
            matrix["docker"]["failures"].append({"case": "health", "reason": "Required Docker route unavailable"})
        return matrix
    version = str(health.get("engineVersion") or "")
    matrix["docker"]["version"] = version
    missing = REQUIRED - set(health.get("operations") or [])
    if not health.get("available") or health.get("engine") != "sagemath" or not version.startswith("10.10") or missing:
        matrix["docker"]["status"] = "failed"
        matrix["docker"]["failures"].append({"case": "health", "reason":
            f"Expected healthy Sage 10.10 and all B08 operations; missing={sorted(missing)} version={version!r}"})
        return matrix
    docker, failures = run_cases(cases, lambda request: probe(base_url + "/run", request))
    matrix["docker"].update(status="failed" if failures else "passed", cases=docker, failures=failures)
    matrix["differences"] = [{"case": name, "local": local[name], "docker": docker[name]}
        for name in sorted(local.keys() & docker.keys()) if local[name] != docker[name]]
    if matrix["differences"]:
        matrix["docker"]["status"] = "failed"
    return matrix


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--docker-url", default="http://127.0.0.1:8767")
    parser.add_argument("--require-docker", action="store_true")
    parser.add_argument("--output", type=Path)
    options = parser.parse_args()
    result = run_matrix(options.docker_url.rstrip("/"), options.require_docker)
    rendered = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if options.output:
        options.output.parent.mkdir(parents=True, exist_ok=True)
        options.output.write_text(rendered, encoding="utf-8")
    print(f"B08: {len(result['local']['cases'])}/{result['fixtureCount']} local Sage {result['local']['version']} cases; "
        f"Docker {result['docker']['status']}; {len(result['differences'])} differences")
    if result["local"]["failures"] or result["docker"]["status"] == "failed":
        for route in ("local", "docker"):
            for failure in result[route]["failures"]:
                print(f"{route}/{failure['case']}: {failure['reason']}", file=sys.stderr)
        sys.exit(1)
