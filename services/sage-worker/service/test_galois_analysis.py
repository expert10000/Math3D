"""Run with `sage -python -m unittest service.test_galois_analysis`."""

import unittest
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from .sage_runner import run_payload, OPERATIONS


def request(polynomial="x^4-2"):
    return {"operation": "sage.galois.analyze", "params": {
        "format": "math3d.sage-galois-analysis", "schemaVersion": 1,
        "projectId": "project-test", "target": {"objectId": "ring-test", "revision": 1},
        "targetHash": "hash-test", "coefficientField": {"objectId": "q-test", "revision": 1,
            "contentHash": "hash-q"}, "variable": "x", "polynomial": polynomial}}


class GaloisAnalysisTests(unittest.TestCase):
    def test_order_eight_dihedral_correspondence(self):
        self.assertIn("sage.galois.analyze", OPERATIONS)
        response = run_payload(request())
        self.assertTrue(response["success"], response.get("error"))
        result = response["result"]
        self.assertEqual((result["group"]["order"], result["splittingField"]["degree"]), (8, 8))
        self.assertEqual((result["group"]["transitiveId"], result["group"]["classification"]), ("4T3", "D4"))
        self.assertEqual(len(result["subgroups"]), 10)
        self.assertEqual(sorted(item["fixedField"]["degree"] for item in result["subgroups"]),
            [1, 2, 2, 2, 4, 4, 4, 4, 4, 8])
        self.assertEqual(sum(item["normal"] for item in result["subgroups"]), 6)
        self.assertTrue(all(item["fixedField"]["relationVerified"] for item in result["subgroups"]))

    def test_rejects_reducible_and_oversized_group(self):
        for polynomial, reason in (("x^4-4", "irreducible"), ("x^5-2", "bounded"),
                                   ("x^4-x-1", "order exceeds"), ("y^4-2", "variable")):
            with self.subTest(polynomial=polynomial), self.assertRaisesRegex(ValueError, reason):
                run_payload(request(polynomial))

    def test_quadratic_and_cubic_small_groups(self):
        for polynomial, order, subgroups in (("x^2-2", 2, 2), ("x^3-2", 6, 6)):
            with self.subTest(polynomial=polynomial):
                result = run_payload(request(polynomial))["result"]
                self.assertEqual(result["group"]["order"], order)
                self.assertEqual(result["splittingField"]["degree"], order)
                self.assertEqual(len(result["subgroups"]), subgroups)

    def test_standalone_service_adapter(self):
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory) / "input.json", Path(directory) / "output.json"
            source.write_text(json.dumps(request()), encoding="utf-8")
            subprocess.run([sys.executable, str(Path(__file__).with_name("sage_runner.py")),
                str(source), str(target)], check=True, timeout=35)
            response = json.loads(target.read_text(encoding="utf-8"))
        self.assertTrue(response["success"], response.get("error"))
        self.assertEqual(response["result"]["group"]["order"], 8)


if __name__ == "__main__":
    unittest.main()
