"""G02 bounded Qp/Zp precision and Hensel fixtures."""

import unittest

from .padic_workspace import run_padic_workspace


def request(domain="Zp", prime=7, precision=6, a=("3", "1"), b=("4", "1"), hensel=None):
    return {"format": "math3d.sage-padic-workspace", "schemaVersion": 1,
        "projectId": "math3d:project:fixture", "target": {"objectId": "math3d:algebra:fixture", "revision": 1},
        "targetHash": "sha256:fixture", "domain": domain, "prime": prime, "precision": precision,
        "a": {"numerator": a[0], "denominator": a[1]},
        "b": {"numerator": b[0], "denominator": b[1]}, "hensel": hensel}


class PadicWorkspaceTests(unittest.TestCase):
    def test_zp_arithmetic_precision_and_hensel(self):
        result = run_padic_workspace(request(hensel={"coefficients": ["-2", "0", "1"], "seed": 3}))
        self.assertEqual((result["domain"], result["prime"], result["precision"]), ("Zp", 7, 6))
        self.assertEqual(result["entries"]["sum"]["source"], {"numerator": "7", "denominator": "1"})
        self.assertEqual(result["entries"]["sum"]["valuation"], 1)
        self.assertEqual(result["entries"]["sum"]["relativePrecision"], 5)
        self.assertEqual(result["entries"]["sum"]["absolutePrecision"], 6)
        self.assertTrue(result["entries"]["sum"]["precisionLost"])
        self.assertEqual(result["entries"]["sum"]["digits"][0], 1)
        self.assertEqual(result["entries"]["product"]["source"], {"numerator": "12", "denominator": "1"})
        root = result["hensel"]
        self.assertEqual(root["modulus"], str(7 ** 6))
        self.assertEqual(int(root["rootResidue"]) % 7, 3)
        self.assertEqual((int(root["rootResidue"]) ** 2 - 2) % 7 ** 6, 0)

    def test_qp_negative_valuation_and_cancelled_precision(self):
        result = run_padic_workspace(request("Qp", 5, 8, ("1", "5"), ("-1", "5")))
        self.assertEqual(result["entries"]["a"]["valuation"], -1)
        self.assertEqual(result["entries"]["a"]["absolutePrecision"], 7)
        self.assertEqual(result["entries"]["a"]["relativePrecision"], 8)
        self.assertEqual(result["entries"]["sum"]["source"], {"numerator": "0", "denominator": "1"})
        self.assertEqual(result["entries"]["sum"]["zeroStatus"], "undetermined")
        self.assertEqual(result["entries"]["sum"]["absolutePrecision"], 7)
        self.assertTrue(result["entries"]["sum"]["precisionLost"])

    def test_exact_zero_and_invalid_requests(self):
        result = run_padic_workspace(request(a=("0", "1"), b=("2", "1")))
        self.assertEqual(result["entries"]["a"]["zeroStatus"], "exact-zero")
        zero_root = run_padic_workspace(request(hensel={"coefficients": ["0", "1"], "seed": 0}))["hensel"]
        self.assertEqual((zero_root["rootResidue"], zero_root["relativePrecision"], zero_root["zeroStatus"]),
            ("0", 0, "undetermined"))
        for invalid in [request(prime=9), request(precision=17), request(a=("1", "7")),
                request(hensel={"coefficients": ["-2", "0", "1"], "seed": 2})]:
            with self.assertRaises(ValueError):
                run_padic_workspace(invalid)


if __name__ == "__main__":
    unittest.main()
