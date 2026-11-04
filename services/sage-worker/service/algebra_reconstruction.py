"""Bounded, declarative algebra constructors. No user text is evaluated as Sage/Python code."""

import hashlib
import json
import re

from sage.all import GF, QQ, QQbar, ZZ, Integers, NumberField, PolynomialRing, latex


FORMAT = "math3d.sage-algebra-reconstruction"
RESULT_FORMAT = "math3d.sage-algebra-reconstruction-result"
DOMAIN_FORMAT = "math3d.sage-algebra-domain-inspection"
DOMAIN_RESULT_FORMAT = "math3d.sage-algebra-domain-inspection-result"
ALGEBRA_ID = re.compile(r"math3d:algebra:[0-9a-f]{32}\Z")
PROJECT_ID = re.compile(r"math3d:project:[0-9a-f]{32}\Z")
IDENTIFIER = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,63}\Z")
HASH = re.compile(r"sha256:[0-9a-f]{64}\Z")
ORDERS = {"lex", "deglex", "degrevlex"}
MAX_INPUT_BYTES = 32 * 1024
MAX_OBJECTS = 32


def _fields(value, expected, label):
    if type(value) is not dict or set(value) != set(expected):
        raise ValueError(f"{label} must contain exactly: {', '.join(expected)}.")


def _reference(value, label):
    _fields(value, ("objectId", "revision"), label)
    if type(value["objectId"]) is not str or not ALGEBRA_ID.fullmatch(value["objectId"]):
        raise ValueError(f"{label}.objectId is invalid.")
    if type(value["revision"]) is not int or value["revision"] < 1:
        raise ValueError(f"{label}.revision must be positive.")
    return (value["objectId"], value["revision"])


def _definition(value):
    if type(value) is not dict:
        raise ValueError("definition must be an object.")
    kind = value.get("kind")
    if kind in ("integer-ring", "rational-field"):
        _fields(value, ("kind",), "definition")
        return []
    if kind == "modular-ring":
        _fields(value, ("kind", "modulus"), "definition")
        modulus = value["modulus"]
        if type(modulus) is not str or not re.fullmatch(r"[1-9][0-9]{0,127}", modulus) or int(modulus) < 2:
            raise ValueError("definition.modulus must be a canonical integer with at most 128 digits.")
        return []
    if kind == "finite-field":
        _fields(value, ("kind", "characteristic", "degree", "generator", "construction"), "definition")
        p, degree = value["characteristic"], value["degree"]
        if type(p) is not int or not 2 <= p <= 1_000_000_000 or not ZZ(p).is_prime():
            raise ValueError("definition.characteristic must be prime.")
        if type(degree) is not int or not 1 <= degree <= 256 or p ** degree > 65536:
            raise ValueError("Finite field cardinality exceeds the bounded reconstruction limit (65536).")
        if type(value["generator"]) is not str or not IDENTIFIER.fullmatch(value["generator"]):
            raise ValueError("definition.generator is invalid.")
        if value["construction"] != "canonical":
            raise ValueError("Only canonical finite-field construction is supported.")
        return []
    if kind == "number-field":
        _fields(value, ("kind", "baseField", "definingPolynomial", "generator"), "definition")
        parent = _reference(value["baseField"], "definition.baseField")
        coefficients = value["definingPolynomial"]
        if type(coefficients) is not list or len(coefficients) != 3 or coefficients[2] != "1" or any(
            type(item) is not str or not re.fullmatch(r"(?:0|-?[1-9][0-9]{0,3})", item) or abs(int(item)) > 4096
            for item in coefficients[:2]
        ):
            raise ValueError("Number field requires monic quadratic integer coefficients bounded by 4096.")
        if type(value["generator"]) is not str or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,31}", value["generator"]):
            raise ValueError("Number field generator is invalid.")
        discriminant = int(coefficients[1]) ** 2 - 4 * int(coefficients[0])
        if discriminant >= 0 and ZZ(discriminant).is_square():
            raise ValueError("Defining quadratic is reducible over QQ.")
        return [parent]
    if kind == "polynomial-ring":
        _fields(value, ("kind", "coefficientDomain", "variables", "monomialOrder"), "definition")
        parent = _reference(value["coefficientDomain"], "definition.coefficientDomain")
        variables = value["variables"]
        if type(variables) is not list or not 1 <= len(variables) <= 8 or any(
            type(name) is not str or not IDENTIFIER.fullmatch(name) for name in variables
        ) or len(set(variables)) != len(variables):
            raise ValueError("definition.variables must be 1–8 distinct mathematical identifiers.")
        if value["monomialOrder"] not in ORDERS:
            raise ValueError("definition.monomialOrder is unsupported.")
        return [parent]
    raise ValueError(f"Unsupported algebra object kind: {kind!r}.")


def _record(value):
    _fields(value, ("schemaVersion", "id", "kind", "label", "revision", "definition", "dependencies", "contentHash"), "algebra object")
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != 1:
        raise ValueError("Unsupported algebra object schema version.")
    if type(value["id"]) is not str or not ALGEBRA_ID.fullmatch(value["id"]):
        raise ValueError("Algebra object ID is invalid.")
    if type(value["revision"]) is not int or value["revision"] < 1:
        raise ValueError("Algebra object revision must be positive.")
    label = value["label"]
    if type(label) is not str or not label or label != label.strip() or len(label) > 120:
        raise ValueError("Algebra object label is invalid.")
    definition = value["definition"]
    dependencies = _definition(definition)
    if value["kind"] != definition["kind"]:
        raise ValueError("Algebra object kind does not match its definition.")
    if type(value["dependencies"]) is not list or len(value["dependencies"]) != len(dependencies) or [
        _reference(ref, "algebra object dependency") for ref in value["dependencies"]
    ] != dependencies:
        raise ValueError("Algebra object dependencies do not match its definition.")
    if any(ref[0] == value["id"] for ref in dependencies):
        raise ValueError("Algebra object cannot depend on itself.")
    digest = "sha256:" + hashlib.sha256(json.dumps({"schemaVersion": 1, "definition": definition},
        sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()
    if type(value["contentHash"]) is not str or not HASH.fullmatch(value["contentHash"]) or value["contentHash"] != digest:
        raise ValueError("Algebra object definition hash does not match.")
    return dependencies


def _validated_objects(params):
    if len(json.dumps(params, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) > MAX_INPUT_BYTES:
        raise ValueError("Sage algebra input exceeds 32 KiB.")
    _fields(params, ("format", "schemaVersion", "projectId", "target", "objects"), "params")
    if params["format"] != FORMAT or type(params["schemaVersion"]) is not int or params["schemaVersion"] != 1:
        raise ValueError("Unsupported Sage algebra reconstruction format.")
    if type(params["projectId"]) is not str or not PROJECT_ID.fullmatch(params["projectId"]):
        raise ValueError("Sage algebra reconstruction requires a Project ID.")
    target = _reference(params["target"], "target")
    records = params["objects"]
    if type(records) is not list or not 1 <= len(records) <= MAX_OBJECTS:
        raise ValueError("Sage algebra reconstruction requires 1–32 objects.")
    seen = {}
    for item in records:
        dependencies = _record(item)
        key = (item["id"], item["revision"])
        if key in seen:
            raise ValueError("Duplicate Sage algebra object revision.")
        if any(ref not in seen for ref in dependencies):
            raise ValueError("Sage algebra parent must precede its dependent object.")
        seen[key] = item
    if (records[-1]["id"], records[-1]["revision"]) != target:
        raise ValueError("Sage algebra target must be last.")
    reachable = set()

    def visit(key):
        if key in reachable:
            return
        reachable.add(key)
        for ref in seen[key]["dependencies"]:
            visit((ref["objectId"], ref["revision"]))

    visit(target)
    if len(reachable) != len(records):
        raise ValueError("Sage algebra input contains unrelated objects.")
    return target, records


def _build_algebra(records):
    built = {}
    for item in records:
        definition = item["definition"]
        kind = item["kind"]
        if kind == "integer-ring":
            value = ZZ
        elif kind == "rational-field":
            value = QQ
        elif kind == "modular-ring":
            value = Integers(ZZ(definition["modulus"]))
        elif kind == "finite-field":
            value = GF(definition["characteristic"] ** definition["degree"], name=definition["generator"])
        elif kind == "number-field":
            parent = definition["baseField"]
            if built[(parent["objectId"], parent["revision"])] != QQ:
                raise ValueError("Number field requires a pinned QQ base field.")
            ring = PolynomialRing(QQ, "x")
            polynomial = ring([ZZ(item) for item in definition["definingPolynomial"]])
            if not polynomial.is_irreducible():
                raise ValueError("Defining polynomial is reducible over QQ.")
            value = NumberField(polynomial, name=definition["generator"])
        else:
            parent = definition["coefficientDomain"]
            base = built[(parent["objectId"], parent["revision"])]
            variables = definition["variables"]
            value = PolynomialRing(base, variables, order=definition["monomialOrder"])
        built[(item["id"], item["revision"])] = value
    return built


def reconstruct_algebra(params):
    target, records = _validated_objects(params)
    built = _build_algebra(records)
    record = records[-1]
    value = built[target]
    result = {
        "format": RESULT_FORMAT, "schemaVersion": 1,
        "target": params["target"], "kind": record["kind"], "definitionHash": record["contentHash"],
        "text": str(value), "latex": str(latex(value)), "characteristic": str(value.characteristic()),
        "isField": bool(value.is_field()),
    }
    if record["kind"] == "polynomial-ring":
        result["baseRing"] = str(value.base_ring())
        result["variables"] = list(value.variable_names())
    if record["kind"] == "number-field":
        polynomial = value.defining_polynomial()
        result["numberField"] = {"degree": int(value.degree()),
            "signature": [int(item) for item in value.signature()],
            "polynomialDiscriminant": str(polynomial.discriminant()),
            "fieldDiscriminant": str(value.discriminant()),
            "powerBasis": [str(item) for item in value.power_basis()],
            "integralBasis": [str(item) for item in value.integral_basis()],
            "embeddingCount": len(value.embeddings(QQbar))}
    return result


def _domain_descriptor(record, value):
    definition = record["definition"]
    polynomial = record["kind"] == "polynomial-ring"
    return {
        "ref": {"objectId": record["id"], "revision": record["revision"]},
        "definitionHash": record["contentHash"], "kind": record["kind"],
        "text": str(value), "characteristic": str(value.characteristic()),
        "isField": bool(value.is_field()), "isCommutative": bool(value.is_commutative()),
        "isExact": bool(value.is_exact()),
        "coefficientDomain": definition["coefficientDomain"] if polynomial else None,
        "variables": list(value.variable_names()) if polynomial else [],
        "monomialOrder": definition["monomialOrder"] if polynomial else None,
    }


def _coercion(source_record, source, target_record, target):
    source_ref = {"objectId": source_record["id"], "revision": source_record["revision"]}
    target_ref = {"objectId": target_record["id"], "revision": target_record["revision"]}
    result = {"source": source_ref, "target": target_ref,
        "sourceHash": source_record["contentHash"], "targetHash": target_record["contentHash"]}
    try:
        canonical = target.coerce_map_from(source) is not None
    except (TypeError, ValueError, NotImplementedError):
        result.update({"status": "failed", "mapId": None, "error": {
            "code": "COERCION_CHECK_FAILED",
            "message": "Sage could not determine whether a canonical coercion exists for these parents.",
            "sourceCharacteristic": str(source.characteristic()),
            "targetCharacteristic": str(target.characteristic()),
        }})
        return result
    if canonical:
        identity = {"schemaVersion": 1,
            "source": {**source_ref, "definitionHash": source_record["contentHash"]},
            "target": {**target_ref, "definitionHash": target_record["contentHash"]}}
        result.update({"status": "canonical", "mapId": "sha256:" + hashlib.sha256(json.dumps(
            identity, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest(),
            "error": None})
    else:
        result.update({"status": "incompatible", "mapId": None, "error": {
            "code": "NO_CANONICAL_COERCION",
            "message": "No canonical coercion exists from the source parent to the target parent. "
                "Choose an explicit conversion or a compatible parent.",
            "sourceCharacteristic": str(source.characteristic()),
            "targetCharacteristic": str(target.characteristic()),
        }})
    return result


def inspect_algebra_domains(params):
    if len(json.dumps(params, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) > 60 * 1024:
        raise ValueError("Sage algebra domain inspection exceeds 60 KiB.")
    _fields(params, ("format", "schemaVersion", "projectId", "left", "right"), "params")
    if params["format"] != DOMAIN_FORMAT or type(params["schemaVersion"]) is not int or params["schemaVersion"] != 1:
        raise ValueError("Unsupported Sage algebra domain inspection format.")
    if type(params["projectId"]) is not str or not PROJECT_ID.fullmatch(params["projectId"]):
        raise ValueError("Sage algebra domain inspection requires a Project ID.")
    left_key, left_records = _validated_objects(params["left"])
    right_key, right_records = _validated_objects(params["right"])
    if params["left"]["projectId"] != params["projectId"] or params["right"]["projectId"] != params["projectId"]:
        raise ValueError("Sage algebra domains must belong to the same Project.")
    left_revisions = {(item["id"], item["revision"]): item for item in left_records}
    for item in right_records:
        existing = left_revisions.get((item["id"], item["revision"]))
        if existing is not None and existing != item:
            raise ValueError("Conflicting Sage algebra definition for one revision across domain snapshots.")
    left = _build_algebra(left_records)[left_key]
    right = _build_algebra(right_records)[right_key]
    left_record, right_record = left_records[-1], right_records[-1]
    return {"format": DOMAIN_RESULT_FORMAT, "schemaVersion": 1,
        "left": _domain_descriptor(left_record, left), "right": _domain_descriptor(right_record, right),
        "leftToRight": _coercion(left_record, left, right_record, right),
        "rightToLeft": _coercion(right_record, right, left_record, left)}
