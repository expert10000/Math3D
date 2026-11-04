"""Run with ``sage -python -m unittest scripts.test_sage_algebra_b08_matrix -v``."""

import copy
import importlib.util
import unittest
from unittest.mock import patch
from urllib.error import URLError
from pathlib import Path

_spec = importlib.util.spec_from_file_location("sage_b08_gate", Path(__file__).with_name("check-sage-algebra-b08-matrix.py"))
gate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gate)


class B08MatrixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cases = gate.fixture_cases()
        cls.responses = {case["name"]: gate.local_response(case["request"]) for case in cls.cases}
        cls.by_request = {case["request"]["operation"] + repr(case["request"]["params"]):
            cls.responses[case["name"]] for case in cls.cases}

    @classmethod
    def execute(cls, request):
        return copy.deepcopy(cls.by_request[request["operation"] + repr(request["params"])])

    def probe(self, url, request=None):
        if url.endswith("/health"):
            return {"available": True, "engine": "sagemath", "engineVersion": "10.10",
                "operations": sorted(gate.REQUIRED)}
        result = self.execute(request)
        if result["success"]:
            result["engineVersion"] = "10.10"
        return result

    def test_controlled_route_matches_goldens(self):
        with patch.object(gate, "local_response", self.execute):
            result = gate.run_matrix("http://controlled", require_docker=True, probe=self.probe)
        self.assertEqual(result["local"]["status"], "passed")
        self.assertEqual(result["docker"]["status"], "passed")
        self.assertEqual(len(result["docker"]["cases"]), 16)
        self.assertEqual(result["differences"], [])

    def test_changed_exact_matrix_value_fails(self):
        def altered(url, request=None):
            result = self.probe(url, request)
            if request and request["operation"] == "sage.matrix.linear_dossier" and request["params"]["matrix"] == [["1", "2"], ["2", "4"]]:
                result["result"]["rank"] = 2
            return result
        with patch.object(gate, "local_response", self.execute):
            result = gate.run_matrix("http://controlled", require_docker=True, probe=altered)
        self.assertEqual(result["docker"]["status"], "failed")
        self.assertIn("qq_matrix_singular", [failure["case"] for failure in result["docker"]["failures"]])

    def test_unavailable_and_required_route(self):
        def unavailable(_url, _request=None):
            raise URLError("offline")
        with patch.object(gate, "local_response", self.execute):
            optional = gate.run_matrix("http://offline", probe=unavailable)
            required = gate.run_matrix("http://offline", require_docker=True, probe=unavailable)
        self.assertEqual(optional["docker"]["status"], "unavailable")
        self.assertEqual(required["docker"]["status"], "failed")
        self.assertEqual(required["docker"]["failures"][0]["case"], "health")

    def test_rejects_tampered_transformation_identity(self):
        case = next(item for item in self.cases if item["name"] == "zz_smith_hermite_nondiagonal")
        value = copy.deepcopy(self.responses[case["name"]]["result"])
        self.assertEqual(value["smith"]["transformations"]["status"], "verified")
        value["smith"]["transformations"]["left"][0][0] = "3"
        with self.assertRaisesRegex(AssertionError, "Smith unimodular"):
            gate.verify_integer_forms(value)


if __name__ == "__main__":
    unittest.main()
