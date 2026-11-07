"""SAGE-C02–C04 exact ideal fixtures; run with sage -python -m unittest."""

import unittest
import subprocess
from unittest.mock import patch

from . import sage_adapter
from .sage_adapter import ideal_timeout_seconds
from .sage_runner import IDEAL_BUDGETS, OPERATIONS, run_payload


BASE = {"format": "math3d.sage-ideal-operation", "schemaVersion": 1,
    "target": {"objectId": "math3d:algebra:ideal", "revision": 1}, "targetHash": "sha256:target",
    "ideal": {"objectId": "math3d:algebra:ideal", "revision": 1}, "idealHash": "sha256:ideal",
    "ambientRing": {"objectId": "math3d:algebra:ring", "revision": 1}, "ambientHash": "sha256:ring",
    "variables": ["x", "y"], "monomialOrder": "lex", "generators": ["x*y-1", "y-1"]}


def compute(operation, **extra):
    return run_payload({"operation": operation, "params": {**BASE, **extra}})["result"]


class IdealOperationTests(unittest.TestCase):
    def test_g06_bounded_invariants_and_exact_fixtures(self):
        for operation in ("sage.ideal.radical", "sage.ideal.primaryDecomposition",
                "sage.ideal.hilbertPolynomial"):
            self.assertIn(operation, OPERATIONS)
            with self.subTest(operation=operation), self.assertRaisesRegex(ValueError, "budget"):
                compute(operation)
        budget = {"budget": IDEAL_BUDGETS["standard"]}
        radical = compute("sage.ideal.radical", generators=["x^2", "y"], **budget)
        self.assertEqual(radical["basis"], ["x", "y"])
        primary = compute("sage.ideal.primaryDecomposition", generators=["x*y"], **budget)
        self.assertEqual(sorted(primary["components"]), [["x"], ["y"]])
        self.assertEqual(sorted(primary["associatedPrimes"]), [["x"], ["y"]])
        hilbert = compute("sage.ideal.hilbertPolynomial", monomialOrder="degrevlex",
            generators=["x"], target={"objectId": "math3d:algebra:quotient", "revision": 1}, **budget)
        self.assertEqual((hilbert["hilbertPolynomial"], hilbert["dimension"], hilbert["grading"]),
            ("1", 1, "standard"))
        for operation, extra in [
            ("sage.ideal.primaryDecomposition", {"generators": ["x^9"]}),
            ("sage.ideal.radical", {"variables": ["x", "y", "z"]}),
            ("sage.ideal.hilbertPolynomial", {"monomialOrder": "lex"}),
            ("sage.ideal.hilbertPolynomial", {"generators": ["x+1"]}),
        ]:
            with self.subTest(operation=operation, extra=extra), self.assertRaises(ValueError):
                compute(operation, **extra, **budget)

    def test_c06_adapter_kills_job_at_wall_time_deadline(self):
        class SlowProcess:
            killed = False
            returncode = -9

            def poll(self):
                return self.returncode if self.killed else None

            def communicate(self, timeout=None):
                if timeout is not None:
                    raise subprocess.TimeoutExpired(cmd="sage", timeout=timeout)
                return "", ""

            def kill(self):
                self.killed = True

        slow = SlowProcess()
        with patch.object(sage_adapter.subprocess, "Popen", return_value=slow):
            response = sage_adapter.run_sage_operation("sage.ideal.groebner",
                {"budget": IDEAL_BUDGETS["standard"]}, timeout_seconds=0)
        self.assertTrue(slow.killed)
        self.assertFalse(response["success"])
        self.assertIn("wall-time budget exceeded", response["error"])

    def test_c06_budget_profiles_and_wall_time_cap(self):
        request = {**BASE, "generators": ["x^9"], "budget": IDEAL_BUDGETS["standard"]}
        with self.assertRaisesRegex(ValueError, "budget"):
            run_payload({"operation": "sage.ideal.groebner", "params": request})
        expanded = {**request, "budget": IDEAL_BUDGETS["expanded"]}
        self.assertEqual(run_payload({"operation": "sage.ideal.groebner", "params": expanded})["result"]["basis"],
            ["x^9"])
        for bad in [{**IDEAL_BUDGETS["standard"], "maxDegree": 100},
                {**IDEAL_BUDGETS["standard"], "wallTimeMs": 60000}, None]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                run_payload({"operation": "sage.ideal.groebner", "params": {**request, "budget": bad}})
        self.assertEqual(ideal_timeout_seconds("sage.ideal.groebner", {"budget": IDEAL_BUDGETS["standard"]}), 15)
        self.assertEqual(ideal_timeout_seconds("sage.ideal.groebner", {"budget": IDEAL_BUDGETS["expanded"]}), 30)
        self.assertEqual(ideal_timeout_seconds("sage.ideal.groebner", {"budget": {"profile": "standard", "wallTimeMs": 60000}}), 30)
        self.assertEqual(ideal_timeout_seconds("sage.ideal.groebner", {"budget": {"profile": [], "wallTimeMs": 15000}}), 30)
        self.assertEqual(ideal_timeout_seconds("sage.numberTheory.gcd", {"budget": IDEAL_BUDGETS["standard"]}), 30)

    def test_c05_capabilities_and_exact_advanced_results(self):
        self.assertIn("sage.ideal.syzygies", OPERATIONS)
        self.assertIn("sage.ideal.hilbertSeries", OPERATIONS)
        graded = {**BASE, "monomialOrder": "degrevlex", "generators": ["x", "y"]}
        syzygies = run_payload({"operation": "sage.ideal.syzygies", "params": graded})["result"]
        self.assertEqual(syzygies["syzygies"], [["-y", "x"]])
        self.assertEqual(syzygies["generatorCount"], 2)
        hilbert = run_payload({"operation": "sage.ideal.hilbertSeries", "params": {
            **graded, "target": {"objectId": "math3d:algebra:quotient", "revision": 1}}})["result"]
        self.assertEqual((hilbert["series"], hilbert["numerator"], hilbert["dimension"], hilbert["grading"]),
            ("1", "t^2 - 2*t + 1", 0, "standard"))

    def test_c05_rejects_unsupported_grading_and_budget(self):
        graded = {**BASE, "monomialOrder": "degrevlex", "generators": ["x", "y"]}
        for operation, extra in [
            ("sage.ideal.hilbertSeries", {"monomialOrder": "lex"}),
            ("sage.ideal.hilbertSeries", {"generators": ["x+1", "y"]}),
            ("sage.ideal.hilbertSeries", {"variables": ["x", "y", "z"]}),
            ("sage.ideal.syzygies", {"generators": ["x", "y", "x+y", "x-y"]}),
            ("sage.ideal.syzygies", {"code": "print(1)"}),
        ]:
            with self.subTest(operation=operation, extra=extra), self.assertRaises(ValueError):
                run_payload({"operation": operation, "params": {**graded, **extra}})

    def test_groebner_and_elimination_goldens(self):
        basis = compute("sage.ideal.groebner")
        self.assertEqual(basis["basis"], ["x - 1", "y - 1"])
        self.assertEqual(basis["targetHash"], BASE["targetHash"])
        eliminated = compute("sage.ideal.eliminate", eliminate=["x"])
        self.assertEqual(eliminated["basis"], ["y - 1"])
        self.assertEqual(eliminated["eliminate"], ["x"])

    def test_member_and_nonmember_normal_forms(self):
        member = compute("sage.ideal.membership", polynomial="x-1")
        self.assertEqual((member["member"], member["normalForm"]), (True, "0"))
        nonmember = compute("sage.ideal.membership", polynomial="x")
        self.assertEqual((nonmember["member"], nonmember["normalForm"]), (False, "1"))

    def test_quotient_dimension_and_pinned_identity(self):
        result = compute("sage.ideal.quotientDimension", target={"objectId": "math3d:algebra:quotient", "revision": 1})
        self.assertEqual(result["dimension"], 0)
        self.assertEqual(result["idealHash"], BASE["idealHash"])
        self.assertIn("Quotient of Multivariate Polynomial Ring", result["quotientPresentation"])

    def test_rejects_invalid_or_unbounded_inputs(self):
        for operation, extra in [
            ("sage.ideal.groebner", {"generators": ["z+1"]}),
            ("sage.ideal.groebner", {"generators": ["x^17"]}),
            ("sage.ideal.groebner", {"generators": ["x**1000000"]}),
            ("sage.ideal.groebner", {"generators": ["1234567890123456789*x"]}),
            ("sage.ideal.groebner", {"generators": ["x;print(1)"]}),
            ("sage.ideal.eliminate", {"eliminate": ["x", "y"]}),
            ("sage.ideal.eliminate", {"eliminate": ["z"]}),
            ("sage.ideal.membership", {"polynomial": "z+1"}),
            ("sage.ideal.groebner", {"variables": ["x", "y", "z", "w"]}),
            ("sage.ideal.groebner", {"code": "print(1)"}),
        ]:
            with self.subTest(operation=operation, extra=extra), self.assertRaises(ValueError):
                compute(operation, **extra)


if __name__ == "__main__":
    unittest.main()
