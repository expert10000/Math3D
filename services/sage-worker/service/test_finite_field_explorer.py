"""G01 exact prime and extension field fixtures; run with sage -python -m unittest."""

import unittest

from .sage_runner import run_payload
from .test_algebra_reconstruction import F, object_record, request


def explore(p, degree, element):
    record = object_record(F, f"F{p ** degree}", {"kind": "finite-field", "characteristic": p,
        "degree": degree, "generator": "a", "construction": "canonical"})
    algebra = request([record], F)["params"]
    return run_payload({"operation": "sage.finiteField.explore", "params": {
        "format": "math3d.sage-finite-field-explorer", "schemaVersion": 1,
        "algebra": algebra, "element": element}})["result"]


class FiniteFieldExplorerTests(unittest.TestCase):
    def test_gf7_generator_and_complete_table(self):
        result = explore(7, 1, [3])
        self.assertEqual((result["characteristic"], result["degree"], result["order"]), (7, 1, 7))
        self.assertEqual(result["selected"]["frobeniusOrbit"], [[3]])
        self.assertEqual((result["selected"]["trace"], result["selected"]["norm"]), ("3", "3"))
        self.assertEqual(result["selected"]["minimalPolynomial"], [4, 1])
        self.assertEqual(result["selected"]["multiplicativeOrder"], 6)
        self.assertTrue(result["selected"]["primitive"])
        self.assertEqual(len(result["primitiveElements"]), 2)
        self.assertEqual(result["multiplicationTable"]["status"], "complete")
        self.assertEqual(result["multiplicationTable"]["cells"][3][5], 1)

    def test_gf4_frobenius_trace_norm_and_minimal_polynomial(self):
        result = explore(2, 2, [0, 1])
        self.assertEqual(result["definingPolynomial"], [1, 1, 1])
        self.assertEqual(result["selected"]["frobeniusOrbit"], [[0, 1], [1, 1]])
        self.assertEqual((result["selected"]["trace"], result["selected"]["norm"]), ("1", "1"))
        self.assertEqual(result["selected"]["minimalPolynomial"], [1, 1, 1])
        self.assertEqual(result["selected"]["multiplicativeOrder"], 3)
        self.assertEqual(len(result["primitiveElements"]), 2)
        self.assertEqual(result["multiplicationTable"]["cells"][1][2], 1)

    def test_gf49_bounded_elements_and_table_reason(self):
        result = explore(7, 2, [0, 1])
        self.assertEqual(result["order"], 49)
        self.assertEqual(len(result["elements"]), 49)
        self.assertEqual(len(result["selected"]["frobeniusOrbit"]), 2)
        self.assertEqual(result["multiplicationTable"]["status"], "unavailable")
        self.assertIn("16 elements", result["multiplicationTable"]["reason"])

    def test_rejects_oversized_field_and_invalid_element(self):
        for p, degree, element, fragment in [(2, 7, [0] * 7, "at most 64"),
                (7, 2, [7, 0], "coefficients"), (7, 2, [0], "coefficients"),
                (7, 2, [True, 0], "coefficients")]:
            with self.subTest(p=p, degree=degree, element=element), self.assertRaisesRegex(ValueError, fragment):
                explore(p, degree, element)


if __name__ == "__main__":
    unittest.main()
