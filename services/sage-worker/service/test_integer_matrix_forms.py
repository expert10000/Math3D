"""Run with `sage -python -m unittest service.test_integer_matrix_forms`."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from .sage_runner import run_payload


def request(rows):
    return {"operation": "sage.matrix.integer_forms", "params": {
        "format": "math3d.sage-integer-matrix-forms", "schemaVersion": 1, "matrix": rows}}


def forms(rows):
    return run_payload(request(rows))["result"]


class IntegerMatrixFormsTests(unittest.TestCase):
    def test_diagonal_smith_cokernel_matches_shared_fixture(self):
        actual = forms([["2", "0", "0"], ["0", "6", "0"], ["0", "0", "0"]])
        fixture = json.loads((Path(__file__).parents[3] / "tests" / "fixtures" /
            "sage-integer-matrix-forms-2-6-0.json").read_text(encoding="utf-8"))
        self.assertEqual(actual, fixture)
        self.assertEqual(actual["smith"]["diagonal"], ["2", "6", "0"])
        self.assertEqual(actual["cokernel"], {"freeRank": 1, "torsionOrders": ["2", "6"]})

    def test_nontrivial_unimodular_transformations(self):
        actual = forms([["2", "4"], ["4", "10"]])
        self.assertEqual(actual["smith"]["diagonal"], ["2", "2"])
        self.assertEqual(actual["smith"]["transformations"]["status"], "verified")
        self.assertEqual(actual["hermite"]["transformation"]["status"], "verified")
        self.assertEqual(actual["cokernel"], {"freeRank": 0, "torsionOrders": ["2", "2"]})

    def test_rectangular_and_zero_cokernel_ranks(self):
        wide = forms([["2", "4", "6"], ["4", "10", "14"]])
        self.assertEqual(wide["inputShape"], [2, 3])
        self.assertEqual(wide["smith"]["diagonal"], ["2", "2"])
        self.assertEqual(wide["cokernel"]["freeRank"], 0)
        tall = forms([["2"], ["4"], ["6"]])
        self.assertEqual(tall["inputShape"], [3, 1])
        self.assertEqual(tall["smith"]["diagonal"], ["2"])
        self.assertEqual(tall["cokernel"], {"freeRank": 2, "torsionOrders": ["2"]})
        zero = forms([["0", "0"], ["0", "0"]])
        self.assertEqual(zero["rank"], 0)
        self.assertEqual(zero["cokernel"], {"freeRank": 2, "torsionOrders": []})

    def test_rejects_invalid_or_executable_inputs(self):
        for rows in ([], [["1"], ["1", "2"]], [["-0"]], [["01"]], [["1/2"]],
                [["1;print(1)"]], [["1"]] * 7):
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                forms(rows)
        for extra in ({"code": "print(1)"}, {"schemaVersion": True}, {"format": "other"}):
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                run_payload({"operation": "sage.matrix.integer_forms", "params": {
                    **request([["1"]])["params"], **extra}})

    def test_script_entry_point(self):
        with tempfile.TemporaryDirectory() as directory:
            input_path, output_path = Path(directory) / "input.json", Path(directory) / "output.json"
            input_path.write_text(json.dumps(request([["2", "4"], ["4", "10"]])), encoding="utf-8")
            subprocess.run([sys.executable, str(Path(__file__).with_name("sage_runner.py")),
                str(input_path), str(output_path)], check=True, timeout=30)
            response = json.loads(output_path.read_text(encoding="utf-8"))
        self.assertTrue(response["success"])
        self.assertEqual(response["operation"], "sage.matrix.integer_forms")
        self.assertTrue(response["engineVersion"])


if __name__ == "__main__":
    unittest.main()
