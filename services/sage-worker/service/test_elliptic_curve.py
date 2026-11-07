"""G04 exact short Weierstrass fixtures against live Sage."""

import unittest

from .sage_runner import run_payload
from .test_algebra_reconstruction import object_record, PROJECT, Q, F


def curve_request(field_definition, a, b, point):
    field = object_record(Q, "Base", field_definition)
    parent = {"objectId": Q, "revision": 1}
    curve = object_record(F, "E", {"kind": "elliptic-curve", "baseField": parent,
        "model": "short-weierstrass", "a": a, "b": b}, [parent])
    return {"operation": "sage.ellipticCurve.dossier", "params": {
        "format": "math3d.sage-elliptic-curve", "schemaVersion": 1,
        "curve": {"format": "math3d.sage-algebra-reconstruction", "schemaVersion": 1,
            "projectId": PROJECT, "target": {"objectId": F, "revision": 1}, "objects": [field, curve]},
        "point": point}}


def study(field_definition, a, b, point):
    return run_payload(curve_request(field_definition, a, b, point))


class EllipticCurveTests(unittest.TestCase):
    def test_rational_invariants_and_group_law(self):
        output = study({"kind": "rational-field"}, "-1", "1", ["0", "1"])
        self.assertTrue(output["success"], output.get("error"))
        result = output["result"]
        self.assertEqual((result["discriminant"], result["jInvariant"], result["doublePoint"]),
            ("-368", "-6912/23", ["1/4", "-7/8"]))
        self.assertFalse(result["singular"])

    def test_prime_field_invariants_and_group_law(self):
        output = study({"kind": "finite-field", "characteristic": 5, "degree": 1,
            "generator": "a", "construction": "canonical"}, "1", "1", ["0", "1"])
        self.assertTrue(output["success"], output.get("error"))
        result = output["result"]
        self.assertEqual((result["characteristic"], result["discriminant"],
            result["jInvariant"], result["doublePoint"]), (5, "4", "2", ["4", "2"]))

    def test_rejects_singular_and_off_curve(self):
        for a, b, point in (("0", "0", None), ("-1", "1", ["1", "2"])):
            with self.assertRaises(ValueError):
                study({"kind": "rational-field"}, a, b, point)
        with self.assertRaises(ValueError):
            study({"kind": "finite-field", "characteristic": 5, "degree": 1,
                "generator": "a", "construction": "canonical"}, "3", "1", None)

    def test_two_torsion_doubles_to_infinity(self):
        output = study({"kind": "rational-field"}, "-1", "0", ["0", "0"])
        self.assertTrue(output["success"])
        self.assertIsNone(output["result"]["doublePoint"])


if __name__ == "__main__":
    unittest.main()
