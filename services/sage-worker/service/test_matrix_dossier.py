"""Run with `sage -python -m unittest service.test_matrix_dossier`."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from .sage_runner import run_payload


def request(rows):
    return {"operation": "sage.matrix.linear_dossier", "params": {
        "format": "math3d.sage-matrix-dossier", "schemaVersion": 1, "matrix": rows}}


def dossier(rows):
    return run_payload(request(rows))["result"]


class MatrixDossierTests(unittest.TestCase):
    def test_singular_square_matches_shared_fixture(self):
        actual = dossier([["1", "2"], ["2", "4"]])
        fixture = json.loads((Path(__file__).parents[3] / "tests" / "fixtures" /
            "sage-matrix-dossier-singular.json").read_text(encoding="utf-8"))
        self.assertEqual(actual, fixture)
        self.assertEqual(actual["rank"], 1)
        self.assertEqual(actual["kernelBasis"], [["-2", "1"]])
        self.assertEqual(actual["minimalPolynomial"], "t^2 - 5*t")

    def test_rectangular_rref_kernel_and_image(self):
        actual = dossier([["1", "2", "3"], ["2", "4", "6"]])
        self.assertEqual(actual["inputShape"], [2, 3])
        self.assertEqual(actual["rank"], 1)
        self.assertEqual(actual["reducedRowEchelonForm"], [["1", "2", "3"], ["0", "0", "0"]])
        self.assertEqual(actual["kernelBasis"], [["-2", "1", "0"], ["-3", "0", "1"]])
        self.assertEqual(actual["imageBasis"], [["1", "2"]])
        self.assertIsNone(actual["minimalPolynomial"])

    def test_nondiagonalizable_and_rational_entries(self):
        jordan = dossier([["1", "1"], ["0", "1"]])
        self.assertEqual(jordan["minimalPolynomial"], "t^2 - 2*t + 1")
        self.assertEqual(jordan["kernelBasis"], [])
        rational = dossier([["1/2", "1"], ["0", "3/2"]])
        self.assertEqual(rational["rank"], 2)
        self.assertEqual(rational["minimalPolynomial"], "t^2 - 2*t + 3/4")

    def test_zero_matrix_has_full_kernel(self):
        zero = dossier([["0", "0"], ["0", "0"]])
        self.assertEqual(zero["rank"], 0)
        self.assertEqual(zero["pivotColumns"], [])
        self.assertEqual(zero["kernelBasis"], [["1", "0"], ["0", "1"]])
        self.assertEqual(zero["imageBasis"], [])
        self.assertEqual(zero["minimalPolynomial"], "t")

    def test_rejects_unbounded_or_malformed_matrix(self):
        for rows in ([], [["1"], ["1", "2"]], [["2/4"]], [["-0"]], [["1/0"]],
                [["1;print(1)"]], [["1"]] * 9):
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                dossier(rows)
        for extra in ({"code": "print(1)"}, {"schemaVersion": True}, {"format": "other"}):
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                run_payload({"operation": "sage.matrix.linear_dossier", "params": {
                    **request([["1"]])["params"], **extra}})

    def test_worker_script_envelope(self):
        with tempfile.TemporaryDirectory() as directory:
            input_path, output_path = Path(directory) / "input.json", Path(directory) / "output.json"
            input_path.write_text(json.dumps(request([["1", "2"], ["2", "4"]])), encoding="utf-8")
            subprocess.run([sys.executable, str(Path(__file__).with_name("sage_runner.py")),
                str(input_path), str(output_path)], check=True, timeout=30)
            response = json.loads(output_path.read_text(encoding="utf-8"))
        self.assertTrue(response["success"])
        self.assertEqual(response["operation"], "sage.matrix.linear_dossier")
        self.assertTrue(response["engineVersion"])


if __name__ == "__main__":
    unittest.main()
