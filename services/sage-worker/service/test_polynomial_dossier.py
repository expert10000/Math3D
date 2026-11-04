"""Run with `sage -python -m unittest service.test_polynomial_dossier`."""

import unittest
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from .sage_runner import run_payload


def dossier(polynomial, variable="x"):
    return run_payload({"operation": "sage.polynomial.dossier",
        "params": {"polynomial": polynomial, "variables": [variable]}})["result"]


class PolynomialDossierTests(unittest.TestCase):
    def test_exact_factor_roots_and_discriminant(self):
        result = dossier("x^2-1")
        fixture = json.loads((Path(__file__).parents[3] / "tests" / "fixtures" /
            "sage-polynomial-dossier-x2minus1.json").read_text(encoding="utf-8"))
        self.assertEqual(result, fixture)
        self.assertEqual(result["schemaVersion"], 1)
        self.assertEqual(result["coefficientDomain"], "QQ")
        self.assertEqual(result["degree"], 2)
        self.assertEqual(result["derivative"], "2*x")
        self.assertEqual(result["derivativeGcd"], "1")
        self.assertEqual(result["discriminant"], "4")
        self.assertTrue(result["squareFree"])
        self.assertFalse(result["irreducibleOverQQ"])
        self.assertEqual({part["polynomial"] for part in result["factorization"]["factors"]}, {"x - 1", "x + 1"})
        self.assertEqual({root["value"] for root in result["rationalRoots"]}, {"-1", "1"})

    def test_repeated_roots_and_square_free_decomposition(self):
        result = dossier("(x-1)^2")
        self.assertFalse(result["squareFree"])
        self.assertEqual(result["derivativeGcd"], "x - 1")
        self.assertEqual(result["discriminant"], "0")
        self.assertEqual(result["rationalRoots"], [{"value": "1", "multiplicity": 2}])
        self.assertEqual(result["squareFreeDecomposition"]["factors"], [{"polynomial": "x - 1", "multiplicity": 2}])

    def test_irreducible_qq_does_not_claim_no_complex_roots(self):
        result = dossier("x^2+1")
        self.assertTrue(result["irreducibleOverQQ"])
        self.assertEqual(result["discriminant"], "-4")
        self.assertEqual(result["rationalRoots"], [])
        fourth = dossier("x^4-2")
        self.assertTrue(fourth["irreducibleOverQQ"])
        self.assertEqual(fourth["rationalRoots"], [])

    def test_content_and_primitive_part_remain_exact(self):
        result = dossier("2*x^2-2")
        self.assertEqual(result["content"], "2")
        self.assertEqual(result["primitivePart"], "x^2 - 1")
        self.assertEqual(result["factorization"]["unit"], "2")
        constant = dossier("2")
        self.assertEqual(constant["degree"], 0)
        self.assertIsNone(constant["discriminant"])
        self.assertEqual(constant["rationalRoots"], [])

    def test_worker_script_envelope(self):
        with tempfile.TemporaryDirectory() as directory:
            input_path, output_path = Path(directory) / "input.json", Path(directory) / "output.json"
            input_path.write_text(json.dumps({"operation": "sage.polynomial.dossier", "params": {
                "polynomial": "x^2-1", "variables": ["x"]}}), encoding="utf-8")
            subprocess.run([sys.executable, str(Path(__file__).with_name("sage_runner.py")),
                str(input_path), str(output_path)], check=True, timeout=30)
            response = json.loads(output_path.read_text(encoding="utf-8"))
        self.assertTrue(response["success"])
        self.assertEqual(response["operation"], "sage.polynomial.dossier")
        self.assertEqual(response["result"]["discriminant"], "4")
        self.assertTrue(response["engineVersion"])

    def test_rejects_invalid_or_unbounded_recipes(self):
        for polynomial in ("0", "x^17+1", "x^999", "y+1", "x;print(1)", "x^2+9999999999999999999"):
            with self.subTest(polynomial=polynomial), self.assertRaises(ValueError):
                dossier(polynomial)
        with self.assertRaisesRegex(ValueError, "exactly"):
            run_payload({"operation": "sage.polynomial.dossier", "params": {
                "polynomial": "x+1", "variables": ["x"], "code": "print(1)"}})
        with self.assertRaisesRegex(ValueError, "Invalid variable"):
            dossier("x+y", "x,y")


if __name__ == "__main__":
    unittest.main()
