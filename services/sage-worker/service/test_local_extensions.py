"""G03 quadratic Qp local-model fixtures against live Sage."""

import unittest

from .sage_runner import OPERATIONS, run_payload
from .test_number_field_operations import fixture
from .test_algebra_reconstruction import object_record, PROJECT, Q, F


def local(prime, precision=8):
    field, _ = fixture()
    return run_payload({"operation": "sage.numberField.localExtensions", "params": {
        "format": "math3d.sage-local-extension", "schemaVersion": 1,
        "field": field, "prime": prime, "precision": precision}})["result"]


class LocalExtensionTests(unittest.TestCase):
    def test_inert_unramified_model(self):
        self.assertIn("sage.numberField.localExtensions", OPERATIONS)
        result = local(3)
        self.assertEqual(result["splitting"], "inert")
        self.assertEqual(result["fieldDiscriminant"], "5")
        self.assertEqual(result["polynomial"], ["-5", "0", "1"])
        self.assertEqual(result["degreeCheck"], 2)
        self.assertEqual(len(result["branches"]), 1)
        branch = result["branches"][0]
        self.assertEqual((branch["ramificationIndex"], branch["residueDegree"],
            branch["localDegree"], branch["residueOrder"]), (1, 2, 2, 9))
        self.assertEqual((branch["model"], branch["idealNorm"], branch["basePrimeValuation"]),
            ("quadratic-extension", "9", 1))

    def test_ramified_eisenstein_model(self):
        result = local(5)
        self.assertEqual(result["splitting"], "ramified")
        branch = result["branches"][0]
        self.assertEqual((branch["ramificationIndex"], branch["residueDegree"],
            branch["localDegree"], branch["residueOrder"]), (2, 1, 2, 5))
        self.assertEqual((branch["generatorResidue"], branch["basePrimeValuation"],
            branch["uniformizerValuation"]), ("0", 2, 1))

    def test_split_roots_match_prime_ideals(self):
        result = local(11)
        self.assertEqual(result["splitting"], "split")
        self.assertEqual(len(result["branches"]), 2)
        self.assertEqual([branch["generatorResidue"] for branch in result["branches"]], ["4", "7"])
        modulus = 11 ** 8
        for branch in result["branches"]:
            root = int(branch["rootResidue"])
            self.assertEqual((root * root - 5) % modulus, 0)
            self.assertEqual(root % 11, int(branch["generatorResidue"]))
            self.assertEqual((branch["model"], branch["rootPrecision"], branch["localDegree"]),
                ("base", 8, 1))

    def test_rejects_even_composite_and_index_prime(self):
        for prime in (2, 9, 37):
            with self.subTest(prime=prime), self.assertRaisesRegex(ValueError, "odd prime"):
                local(prime)
        q = object_record(Q, "Q", {"kind": "rational-field"})
        q_ref = {"objectId": Q, "revision": 1}
        k = object_record(F, "K", {"kind": "number-field", "baseField": q_ref,
            "definingPolynomial": ["-45", "0", "1"], "generator": "a"}, [q_ref])
        field = {"format": "math3d.sage-algebra-reconstruction", "schemaVersion": 1,
            "projectId": PROJECT, "target": {"objectId": F, "revision": 1}, "objects": [q, k]}
        with self.assertRaisesRegex(ValueError, "power-basis index"):
            run_payload({"operation": "sage.numberField.localExtensions", "params": {
                "format": "math3d.sage-local-extension", "schemaVersion": 1,
                "field": field, "prime": 3, "precision": 8}})


if __name__ == "__main__":
    unittest.main()
