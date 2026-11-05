"""Run with `sage -python -m unittest service.test_module_invariant_factors`."""

import unittest
from .sage_runner import OPERATIONS, run_payload


def request(rows):
    return {"operation": "sage.module.invariantFactors", "params": {
        "format": "math3d.sage-module-invariant-factors", "schemaVersion": 1,
        "projectId": "project-test", "target": {"objectId": "module-test", "revision": 1},
        "targetHash": "module-hash", "baseRing": {"objectId": "zz-test", "revision": 1},
        "baseRingHash": "zz-hash", "ambientRank": len(rows), "relationRank": len(rows[0]),
        "matrix": rows}}


class ModuleInvariantFactorsTests(unittest.TestCase):
    def test_exact_torsion_free_and_zero_modules(self):
        self.assertIn("sage.module.invariantFactors", OPERATIONS)
        for rows, free_rank, torsion in [
            ([['2', '0'], ['0', '6']], 0, ['2', '6']),
            ([['2'], ['0']], 1, ['2']),
            ([[], []], 2, []),
            ([['1']], 0, []),
            ([['2', '4'], ['4', '10']], 0, ['2', '2']),
        ]:
            with self.subTest(rows=rows):
                result = run_payload(request(rows))["result"]
                self.assertEqual((result["freeRank"], result["torsionOrders"]), (free_rank, torsion))
                if rows[0]:
                    self.assertEqual(result["smith"]["transformations"]["status"], "verified")
                else:
                    self.assertIsNone(result["smith"])

    def test_rejects_invalid_relation_matrices_and_unpinned_requests(self):
        base = request([['2'], ['0']])
        for params in ({**base["params"], "matrix": [['2'], ['1/2']]},
                       {**base["params"], "matrix": [['2']]},
                       {**base["params"], "target": {"objectId": "module-test", "revision": 0}},
                       {**base["params"], "code": "print(1)"}):
            with self.subTest(params=params), self.assertRaises(ValueError):
                run_payload({**base, "params": params})


if __name__ == "__main__":
    unittest.main()
