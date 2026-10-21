import copy
import tempfile
import unittest
from pathlib import Path

from graph_analysis_reader import load_graph_analysis, validate_graph_analysis


def fixture():
    return {
        "format": "math3d.graph2d-numerical.v1", "operation": "critical-points",
        "resultId": "graph2d.critical-points.example",
        "source": {"documentId": "math3d:graph2d:example", "revision": 1,
                   "structuralHash": "sha256:" + "a" * 64},
        "objectIds": ["function_1"], "interval": {"min": -2, "max": 2},
        "scan": {"status": "complete", "quality": "approximate", "evaluations": 100,
                 "tolerance": {"absolute": 1e-7}},
        "candidates": [{"kind": "zero", "x": 0.3, "y": 0, "residual": 1e-9,
                        "quality": "refined", "method": "bracket-bisection",
                        "confidence": "numerical", "estimatedXError": 1e-9}],
        "diagnostics": [], "warnings": ["Bounded scan is not exhaustive."],
    }


class GraphAnalysisReaderTests(unittest.TestCase):
    def test_valid_evidence_is_available_for_python_analysis(self):
        data = fixture()
        self.assertEqual(validate_graph_analysis(data)["candidates"][0]["x"], 0.3)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "analysis.json"
            import json
            path.write_text(json.dumps(data), encoding="utf-8")
            self.assertEqual(load_graph_analysis(path)["scan"]["quality"], "approximate")

    def test_refinement_cannot_be_claimed_from_sampling_or_large_residual(self):
        for change in ({"method": "sample"}, {"residual": 1e-3}, {"confidence": "heuristic"}):
            data = copy.deepcopy(fixture())
            data["candidates"][0].update(change)
            with self.assertRaisesRegex(ValueError, "refinement"):
                validate_graph_analysis(data)

    def test_intersection_evidence_is_importable(self):
        data = fixture()
        data["operation"] = "intersections"
        data["objectIds"] = ["function_1", "function_2"]
        data["candidates"] = [{"kind": "intersection", "x": 0.3, "y": 0,
                               "residual": 1e-9, "quality": "refined",
                               "method": "bracket-bisection", "confidence": "numerical",
                               "classification": "crossing"}]
        self.assertEqual(validate_graph_analysis(data)["candidates"][0]["classification"], "crossing")

    def test_rejects_inconsistent_coverage_and_nonfinite_values(self):
        data = fixture()
        data["scan"]["quality"] = "certified"
        with self.assertRaisesRegex(ValueError, "scan quality"):
            validate_graph_analysis(data)
        data = fixture()
        data["candidates"][0]["x"] = float("nan")
        with self.assertRaisesRegex(ValueError, "finite"):
            validate_graph_analysis(data)

    def test_rejects_duplicate_keys_and_oversized_files(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "analysis.json"
            path.write_text('{"format":"a","format":"b"}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                load_graph_analysis(path)
            path.write_bytes(b" " * (1024 * 1024 + 1))
            with self.assertRaisesRegex(ValueError, "1 MiB"):
                load_graph_analysis(path)


if __name__ == "__main__":
    unittest.main()
