"""Write deterministic A08 reconstruction requests for the Sage 9.5/10.10 matrix."""

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "tests" / "fixtures" / "sage-algebra" / "a08-reconstruction.json"
PROJECT = "math3d:project:" + "a" * 32


def object_record(identifier, label, definition, dependencies=()):
    digest = hashlib.sha256(json.dumps({"schemaVersion": 1, "definition": definition},
        sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()
    return {"schemaVersion": 1, "id": "math3d:algebra:" + identifier * 32,
        "kind": definition["kind"], "label": label, "revision": 1,
        "definition": definition, "dependencies": list(dependencies), "contentHash": "sha256:" + digest}


def case(name, objects, expected):
    target = objects[-1]
    return {"name": name, "request": {"operation": "sage.algebra.reconstruct", "params": {
        "format": "math3d.sage-algebra-reconstruction", "schemaVersion": 1, "projectId": PROJECT,
        "target": {"objectId": target["id"], "revision": 1}, "objects": objects}},
        "expected": {"kind": target["kind"], "characteristic": expected["characteristic"],
            "isField": expected["isField"], **({"variables": expected["variables"]} if "variables" in expected else {})}}


z = object_record("b", "Z", {"kind": "integer-ring"})
q = object_record("c", "Q", {"kind": "rational-field"})
z12 = object_record("d", "Z12", {"kind": "modular-ring", "modulus": "12"})
z13 = object_record("e", "F13", {"kind": "modular-ring", "modulus": "13"})
f49 = object_record("f", "F49", {"kind": "finite-field", "characteristic": 7,
    "degree": 2, "generator": "a", "construction": "canonical"})
q_ref = {"objectId": q["id"], "revision": 1}
f_ref = {"objectId": f49["id"], "revision": 1}
qxy = object_record("1", "Qxy", {"kind": "polynomial-ring", "coefficientDomain": q_ref,
    "variables": ["x", "y"], "monomialOrder": "degrevlex"}, [q_ref])
f49t = object_record("2", "F49t", {"kind": "polynomial-ring", "coefficientDomain": f_ref,
    "variables": ["t"], "monomialOrder": "lex"}, [f_ref])

FIXTURES = {"format": "math3d.sage-algebra-runtime-fixtures", "schemaVersion": 1, "cases": [
    case("ZZ", [z], {"characteristic": "0", "isField": False}),
    case("QQ", [q], {"characteristic": "0", "isField": True}),
    case("Z/12Z", [z12], {"characteristic": "12", "isField": False}),
    case("Z/13Z", [z13], {"characteristic": "13", "isField": True}),
    case("GF(7^2)", [f49], {"characteristic": "7", "isField": True}),
    case("QQ[x,y]", [q, qxy], {"characteristic": "0", "isField": False, "variables": ["x", "y"]}),
    case("GF(7^2)[t]", [f49, f49t], {"characteristic": "7", "isField": False, "variables": ["t"]}),
]}


if __name__ == "__main__":
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    DESTINATION.write_text(json.dumps(FIXTURES, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(FIXTURES['cases'])} fixtures to {DESTINATION}")
