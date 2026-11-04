"""Run with `sage -python -m unittest service.test_number_field_operations`."""

import unittest
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from .sage_runner import run_payload, OPERATIONS
from .test_algebra_reconstruction import object_record, PROJECT, Q, F


def fixture():
    q = object_record(Q, "Q", {"kind": "rational-field"})
    q_ref = {"objectId": Q, "revision": 1}
    k = object_record(F, "K", {"kind": "number-field", "baseField": q_ref,
        "definingPolynomial": ["-5", "0", "1"], "generator": "a"}, [q_ref])
    field = {"format": "math3d.sage-algebra-reconstruction", "schemaVersion": 1,
        "projectId": PROJECT, "target": {"objectId": F, "revision": 1}, "objects": [q, k]}
    return field, k


def request(operation, field, **arguments):
    return {"operation": operation, "params": {"format": "math3d.sage-number-field-operation",
        "schemaVersion": 1, "field": field, **arguments}}


class NumberFieldOperationTests(unittest.TestCase):
    def test_norm_trace_embeddings_and_degree_product(self):
        field, k = fixture()
        operation = "sage.numberField.elementDossier"
        self.assertIn(operation, OPERATIONS)
        result = run_payload(request(operation, field, element=["1", "1"]))["result"]
        self.assertEqual(result["definitionHash"], k["contentHash"])
        self.assertEqual((result["norm"], result["trace"]), ("-4", "2"))
        self.assertEqual((result["baseDegree"], result["relativeDegree"], result["absoluteDegree"]), (1, 2, 2))
        self.assertEqual(result["basis"], ["1", "a"])
        self.assertEqual([item["elementImage"] for item in result["embeddings"]], ["1 + √5", "1 - √5"])
        unit = run_payload(request(operation, field, element=["1", "0"]))["result"]
        self.assertEqual((unit["norm"], unit["trace"]), ("1", "2"))

    def test_inert_ramified_and_split_prime_ideals(self):
        field, _ = fixture()
        operation = "sage.numberField.primeDecomposition"
        self.assertIn(operation, OPERATIONS)
        for rational_prime, splitting, expected in (
            (2, "inert", [(1, 2, "4")]),
            (5, "ramified", [(2, 1, "5")]),
            (11, "split", [(1, 1, "11"), (1, 1, "11")]),
        ):
            with self.subTest(prime=rational_prime):
                result = run_payload(request(operation, field, prime=rational_prime))["result"]
                self.assertEqual(result["splitting"], splitting)
                self.assertEqual(result["degreeCheck"], 2)
                self.assertEqual([(item["ramificationIndex"], item["residueDegree"], item["norm"])
                    for item in result["factors"]], expected)
                self.assertTrue(all(item["ideal"] for item in result["factors"]))

    def test_rejects_invalid_prime_element_and_target(self):
        field, _ = fixture()
        with self.assertRaisesRegex(ValueError, "prime from 2 to 97"):
            run_payload(request("sage.numberField.primeDecomposition", field, prime=9))
        with self.assertRaisesRegex(ValueError, "bounded canonical"):
            run_payload(request("sage.numberField.elementDossier", field, element=["01", "1"]))
        wrong = {**field, "target": {"objectId": Q, "revision": 1}}
        with self.assertRaisesRegex(ValueError, "target must be last"):
            run_payload(request("sage.numberField.elementDossier", wrong, element=["1", "1"]))

    def test_script_entry_point_used_by_service_adapter(self):
        field, _ = fixture()
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "input.json"
            output = Path(directory) / "output.json"
            source.write_text(json.dumps(request("sage.numberField.primeDecomposition", field, prime=5)), encoding="utf-8")
            subprocess.run([sys.executable, str(Path(__file__).with_name("sage_runner.py")),
                str(source), str(output)], check=True, timeout=30)
            response = json.loads(output.read_text(encoding="utf-8"))
        self.assertTrue(response["success"], response.get("error"))
        self.assertEqual(response["result"]["splitting"], "ramified")


if __name__ == "__main__":
    unittest.main()
