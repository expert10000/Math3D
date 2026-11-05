"""Run with `sage -python -m unittest service.test_finite_group_operations`."""

import unittest
from .sage_runner import OPERATIONS, run_payload


def request(definition):
    return {"operation": "sage.group.dossier", "params": {
        "format": "math3d.sage-finite-group-operation", "schemaVersion": 1,
        "projectId": "project-test", "target": {"objectId": "group-test", "revision": 1},
        "targetHash": "hash-test", "definition": definition}}


class FiniteGroupOperationTests(unittest.TestCase):
    def test_linked_galois_source_preserves_gap_dossier(self):
        definition = {"kind": "finite-group", "representation": "permutation", "degree": 4,
            "generators": [{"name": "r", "images": [2, 3, 4, 1]},
                {"name": "s", "images": [1, 4, 3, 2]}], "relations": [],
            "source": {"ring": {"objectId": "math3d:algebra:test", "revision": 1},
                "polynomial": "x^4-2", "splittingPolynomial": "x^8+4", "evidenceId": "evidence-test"}}
        response = run_payload(request(definition))
        self.assertTrue(response["success"])
        self.assertEqual((response["result"]["order"], len(response["result"]["subgroups"])), (8, 10))

    def test_capability_and_exact_small_groups(self):
        self.assertIn("sage.group.dossier", OPERATIONS)
        definitions = [
            ({"kind": "finite-group", "representation": "abelian", "invariantFactors": [4],
                "generators": ["a"]}, (4, 4, 3, 4)),
            ({"kind": "finite-group", "representation": "abelian", "invariantFactors": [2, 2],
                "generators": ["a", "b"]}, (4, 4, 5, 4)),
            ({"kind": "finite-group", "representation": "permutation", "degree": 3,
                "generators": [{"name": "r", "images": [2, 3, 1]}, {"name": "s", "images": [2, 1, 3]}],
                "relations": []}, (6, 1, 6, 3)),
            ({"kind": "finite-group", "representation": "permutation", "degree": 4,
                "generators": [{"name": "r", "images": [2, 3, 4, 1]},
                    {"name": "s", "images": [1, 4, 3, 2]}], "relations": []}, (8, 2, 10, 5)),
            ({"kind": "finite-group", "representation": "permutation", "degree": 8,
                "generators": [{"name": "i", "images": [3, 4, 2, 1, 7, 8, 6, 5]},
                    {"name": "j", "images": [5, 6, 8, 7, 2, 1, 3, 4]}], "relations": []}, (8, 2, 6, 5)),
        ]
        for definition, expected in definitions:
            with self.subTest(definition=definition):
                response = run_payload(request(definition))
                self.assertTrue(response["success"])
                result = response["result"]
                self.assertEqual((result["order"], len(result["center"]), len(result["subgroups"]),
                    len(result["conjugacyClasses"])), expected)
                self.assertTrue(result["complete"])
                if expected[0] == 8 and expected[2] == 10:  # D4, distinct from Q8
                    self.assertEqual(result["center"], [0, 5])
                    self.assertEqual(result["conjugacyClasses"],
                        [[0], [5], [1, 4], [2, 7], [3, 6]])
                    self.assertEqual([(item["members"], item["normal"]) for item in result["subgroups"]], [
                        ([0], True), ([0, 1], False), ([0, 2], False), ([0, 4], False),
                        ([0, 5], True), ([0, 7], False), ([0, 1, 4, 5], True),
                        ([0, 2, 5, 7], True), ([0, 3, 5, 6], True),
                        ([0, 1, 2, 3, 4, 5, 6, 7], True)])

    def test_rejects_invalid_and_oversized_requests(self):
        base = {"kind": "finite-group", "representation": "abelian", "invariantFactors": [2, 2],
            "generators": ["a", "b"]}
        for definition in ({**base, "invariantFactors": [2, 3]},
                           {**base, "invariantFactors": [4, 8]},
                           {**base, "generators": ["a", "a"]}):
            with self.subTest(definition=definition), self.assertRaises(ValueError):
                run_payload(request(definition))


if __name__ == "__main__":
    unittest.main()
