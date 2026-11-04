"""SAGE-C02–C04 exact ideal fixtures; run with sage -python -m unittest."""

import unittest

from .sage_runner import run_payload


BASE = {"format": "math3d.sage-ideal-operation", "schemaVersion": 1,
    "target": {"objectId": "math3d:algebra:ideal", "revision": 1}, "targetHash": "sha256:target",
    "ideal": {"objectId": "math3d:algebra:ideal", "revision": 1}, "idealHash": "sha256:ideal",
    "ambientRing": {"objectId": "math3d:algebra:ring", "revision": 1}, "ambientHash": "sha256:ring",
    "variables": ["x", "y"], "monomialOrder": "lex", "generators": ["x*y-1", "y-1"]}


def compute(operation, **extra):
    return run_payload({"operation": operation, "params": {**BASE, **extra}})["result"]


class IdealOperationTests(unittest.TestCase):
    def test_groebner_and_elimination_goldens(self):
        basis = compute("sage.ideal.groebner")
        self.assertEqual(basis["basis"], ["x - 1", "y - 1"])
        self.assertEqual(basis["targetHash"], BASE["targetHash"])
        eliminated = compute("sage.ideal.eliminate", eliminate=["x"])
        self.assertEqual(eliminated["basis"], ["y - 1"])
        self.assertEqual(eliminated["eliminate"], ["x"])

    def test_member_and_nonmember_normal_forms(self):
        member = compute("sage.ideal.membership", polynomial="x-1")
        self.assertEqual((member["member"], member["normalForm"]), (True, "0"))
        nonmember = compute("sage.ideal.membership", polynomial="x")
        self.assertEqual((nonmember["member"], nonmember["normalForm"]), (False, "1"))

    def test_quotient_dimension_and_pinned_identity(self):
        result = compute("sage.ideal.quotientDimension", target={"objectId": "math3d:algebra:quotient", "revision": 1})
        self.assertEqual(result["dimension"], 0)
        self.assertEqual(result["idealHash"], BASE["idealHash"])
        self.assertIn("Quotient of Multivariate Polynomial Ring", result["quotientPresentation"])

    def test_rejects_invalid_or_unbounded_inputs(self):
        for operation, extra in [
            ("sage.ideal.groebner", {"generators": ["z+1"]}),
            ("sage.ideal.groebner", {"generators": ["x^17"]}),
            ("sage.ideal.groebner", {"generators": ["x**1000000"]}),
            ("sage.ideal.groebner", {"generators": ["1234567890123456789*x"]}),
            ("sage.ideal.groebner", {"generators": ["x;print(1)"]}),
            ("sage.ideal.eliminate", {"eliminate": ["x", "y"]}),
            ("sage.ideal.eliminate", {"eliminate": ["z"]}),
            ("sage.ideal.membership", {"polynomial": "z+1"}),
            ("sage.ideal.groebner", {"variables": ["x", "y", "z", "w"]}),
            ("sage.ideal.groebner", {"code": "print(1)"}),
        ]:
            with self.subTest(operation=operation, extra=extra), self.assertRaises(ValueError):
                compute(operation, **extra)


if __name__ == "__main__":
    unittest.main()
