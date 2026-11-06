"""Pinned nonsingular short Weierstrass curves and bounded exact point doubling."""

import re

if __package__:
    from .algebra_reconstruction import _build_algebra, _validated_objects
else:
    from algebra_reconstruction import _build_algebra, _validated_objects


def run_elliptic_curve(params):
    if type(params) is not dict or set(params) != {"format", "schemaVersion", "curve", "point"} or \
            params["format"] != "math3d.sage-elliptic-curve" or type(params["schemaVersion"]) is not int or \
            params["schemaVersion"] != 1:
        raise ValueError("Curve dossier requires a versioned pinned request.")
    target, records = _validated_objects(params["curve"])
    record = records[-1]
    if record["kind"] != "elliptic-curve":
        raise ValueError("Curve dossier requires a pinned elliptic-curve object.")
    built = _build_algebra(records)
    curve = built[target]
    definition = record["definition"]
    base_ref = definition["baseField"]
    base_key = (base_ref["objectId"], base_ref["revision"])
    base = built[base_key]
    characteristic = int(base.characteristic())
    raw_point = params["point"]
    doubled = None
    if raw_point is not None:
        if type(raw_point) is not list or len(raw_point) != 2 or any(
            type(value) is not str or not re.fullmatch(r"(?:0|-?[1-9][0-9]{0,3})", value) or
            abs(int(value)) > 4096 for value in raw_point
        ):
            raise ValueError("Curve sample point needs two bounded canonical integer coordinates.")
        if characteristic and any(not 0 <= int(value) < characteristic for value in raw_point):
            raise ValueError("Prime-field sample point needs canonical residues.")
        x, y = (base(int(value)) for value in raw_point)
        if y ** 2 != x ** 3 + base(int(definition["a"])) * x + base(int(definition["b"])):
            raise ValueError("Sample point is not on the pinned curve.")
        point = curve([x, y])
        twice = 2 * point
        doubled = None if twice.is_zero() else [str(twice[0]), str(twice[1])]
    return {"format": "math3d.sage-elliptic-curve-result", "schemaVersion": 1,
        "target": params["curve"]["target"], "targetHash": record["contentHash"],
        "baseField": base_ref, "characteristic": characteristic,
        "discriminant": str(curve.discriminant()), "jInvariant": str(curve.j_invariant()),
        "singular": False, "point": raw_point, "doublePoint": doubled}
