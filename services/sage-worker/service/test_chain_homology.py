"""Run with `sage -python -m unittest service.test_chain_homology`."""

import unittest
from .sage_runner import OPERATIONS, run_payload


def request(d1, d2):
    return {"operation": "sage.chain.homology", "params": {
        "format": "math3d.sage-chain-homology", "schemaVersion": 1,
        "projectId": "project-test", "target": {"objectId": "chain-test", "revision": 1},
        "targetHash": "chain-hash", "definition": {"kind": "chain-complex"},
        "dimensions": [len(d1), len(d2), len(d2[0])], "boundary1": d1, "boundary2": d2}}


class ChainHomologyTests(unittest.TestCase):
    def test_free_torsion_and_changed_kernel_basis(self):
        self.assertIn("sage.chain.homology", OPERATIONS)
        cases = [
            ([['0']], [['2']], [(1, []), (0, ['2']), (0, [])]),
            ([['0', '0']], [['2'], ['0']], [(1, []), (1, ['2']), (0, [])]),
            ([['2', '4']], [['-2'], ['1']], [(0, ['2']), (0, []), (0, [])]),
            ([['0']], [['0']], [(1, []), (1, []), (1, [])]),
        ]
        for d1, d2, expected in cases:
            with self.subTest(d1=d1, d2=d2):
                result = run_payload(request(d1, d2))["result"]
                self.assertEqual([(g["freeRank"], g["torsionOrders"]) for g in result["groups"]], expected)
                self.assertEqual(result["boundary1Smith"]["transformations"]["status"], "verified")

    def test_rejects_nonzero_composition_and_bad_dimensions(self):
        for d1, d2 in [([['1']], [['2']]), ([['1', '0']], [['1'], ['0']])]:
            with self.subTest(d1=d1, d2=d2), self.assertRaises(ValueError):
                run_payload(request(d1, d2))
        bad = request([['0']], [['0']])
        bad["params"]["dimensions"] = [1, 2, 1]
        with self.assertRaises(ValueError):
            run_payload(bad)


if __name__ == "__main__":
    unittest.main()
