"""Run with `sage -python -m unittest service.test_algebra_reconstruction`."""

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from .sage_runner import run_payload


PROJECT = "math3d:project:" + "a" * 32
Q = "math3d:algebra:" + "b" * 32
R = "math3d:algebra:" + "c" * 32
F = "math3d:algebra:" + "d" * 32
Z = "math3d:algebra:" + "e" * 32


def object_record(object_id, label, definition, dependencies=None):
    digest = hashlib.sha256(json.dumps({"schemaVersion": 1, "definition": definition},
        sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()
    return {"schemaVersion": 1, "id": object_id, "kind": definition["kind"], "label": label,
        "revision": 1, "definition": definition, "dependencies": dependencies or [], "contentHash": "sha256:" + digest}


def request(objects, target):
    return {"operation": "sage.algebra.reconstruct", "params": {
        "format": "math3d.sage-algebra-reconstruction", "schemaVersion": 1, "projectId": PROJECT,
        "target": {"objectId": target, "revision": 1}, "objects": objects}}


class AlgebraReconstructionTests(unittest.TestCase):
    def test_exact_qq_xy_and_finite_field(self):
        q = object_record(Q, "Q", {"kind": "rational-field"})
        parent = {"objectId": Q, "revision": 1}
        r = object_record(R, "R", {"kind": "polynomial-ring", "coefficientDomain": parent,
            "variables": ["x", "y"], "monomialOrder": "degrevlex"}, [parent])
        result = run_payload(request([q, r], R))
        self.assertTrue(result["success"])
        self.assertEqual(result["result"]["variables"], ["x", "y"])
        self.assertEqual(result["result"]["baseRing"], "Rational Field")
        self.assertEqual(result["result"]["characteristic"], "0")
        self.assertEqual(result["result"]["definitionHash"], r["contentHash"])
        self.assertFalse(result["result"]["isField"])
        self.assertTrue(result["engineVersion"])

        f = object_record(F, "F5", {"kind": "finite-field", "characteristic": 5,
            "degree": 1, "generator": "a", "construction": "canonical"})
        finite = run_payload(request([f], F))
        self.assertTrue(finite["success"])
        self.assertEqual(finite["result"]["characteristic"], "5")
        self.assertTrue(finite["result"]["isField"])
        finite_parent = {"objectId": F, "revision": 1}
        r_over_f5 = object_record(R, "R", {"kind": "polynomial-ring", "coefficientDomain": finite_parent,
            "variables": ["x", "y"], "monomialOrder": "degrevlex"}, [finite_parent])
        changed = run_payload(request([f, r_over_f5], R))
        self.assertTrue(changed["success"])
        self.assertEqual(changed["result"]["characteristic"], "5")
        self.assertEqual(changed["result"]["variables"], ["x", "y"])

    def test_integer_and_modular_ring(self):
        integer = object_record(Z, "Z", {"kind": "integer-ring"})
        z_result = run_payload(request([integer], Z))
        self.assertTrue(z_result["success"])
        self.assertEqual(z_result["result"]["characteristic"], "0")
        modular = object_record(F, "Z12", {"kind": "modular-ring", "modulus": "12"})
        mod_result = run_payload(request([modular], F))
        self.assertTrue(mod_result["success"])
        self.assertEqual(mod_result["result"]["characteristic"], "12")
        self.assertFalse(mod_result["result"]["isField"])

    def test_worker_script_mode_used_by_docker_adapter(self):
        q = object_record(Q, "Q", {"kind": "rational-field"})
        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "input.json"
            output_path = Path(directory) / "output.json"
            input_path.write_text(json.dumps(request([q], Q)), encoding="utf-8")
            subprocess.run([sys.executable, str(Path(__file__).with_name("sage_runner.py")),
                str(input_path), str(output_path)], check=True, timeout=30)
            result = json.loads(output_path.read_text(encoding="utf-8"))
        self.assertTrue(result["success"])
        self.assertEqual(result["result"]["kind"], "rational-field")

    def test_refuses_executable_or_tampered_input(self):
        q = object_record(Q, "Q", {"kind": "rational-field"})
        executable = request([q], Q)
        executable["params"]["code"] = "__import__('os').system('true')"
        with self.assertRaisesRegex(ValueError, "params must contain exactly"):
            run_payload(executable)
        forged = request([{**q, "contentHash": "sha256:" + "0" * 64}], Q)
        with self.assertRaisesRegex(ValueError, "definition hash"):
            run_payload(forged)
        bad_parent = {"objectId": Q, "revision": 1}
        bad_ring = object_record(R, "R", {"kind": "polynomial-ring", "coefficientDomain": bad_parent,
            "variables": ["x;quit()"], "monomialOrder": "lex"}, [bad_parent])
        with self.assertRaisesRegex(ValueError, "variables"):
            run_payload(request([q, bad_ring], R))


if __name__ == "__main__":
    unittest.main()
