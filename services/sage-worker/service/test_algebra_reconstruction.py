"""Run with `sage -python -m unittest service.test_algebra_reconstruction`."""

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from .sage_runner import run_payload
from .algebra_reconstruction import _coercion


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


def domain_request(left_objects, left_target, right_objects, right_target):
    return {"operation": "sage.algebra.inspectDomains", "params": {
        "format": "math3d.sage-algebra-domain-inspection", "schemaVersion": 1, "projectId": PROJECT,
        "left": request(left_objects, left_target)["params"],
        "right": request(right_objects, right_target)["params"]}}


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

    def test_prime_modular_ring_and_extension_field(self):
        prime = object_record(F, "F13", {"kind": "modular-ring", "modulus": "13"})
        prime_result = run_payload(request([prime], F))
        self.assertTrue(prime_result["success"])
        self.assertTrue(prime_result["result"]["isField"])
        self.assertEqual(prime_result["result"]["characteristic"], "13")
        extension = object_record(F, "F49", {"kind": "finite-field", "characteristic": 7,
            "degree": 2, "generator": "a", "construction": "canonical"})
        extension_result = run_payload(request([extension], F))
        self.assertTrue(extension_result["success"])
        self.assertTrue(extension_result["result"]["isField"])
        self.assertEqual(extension_result["result"]["characteristic"], "7")
        self.assertIn("7^2", extension_result["result"]["text"])

    def test_quadratic_number_field_with_exact_dossier(self):
        q = object_record(Q, "Q", {"kind": "rational-field"})
        q_ref = {"objectId": Q, "revision": 1}
        k = object_record(F, "K", {"kind": "number-field", "baseField": q_ref,
            "definingPolynomial": ["-5", "0", "1"], "generator": "a"}, [q_ref])
        outcome = run_payload(request([q, k], F))
        self.assertTrue(outcome["success"], outcome.get("error"))
        result = outcome["result"]
        self.assertTrue(result["isField"])
        self.assertEqual(result["definitionHash"], k["contentHash"])
        self.assertEqual(result["numberField"]["degree"], 2)
        self.assertEqual(result["numberField"]["signature"], [2, 0])
        self.assertEqual(result["numberField"]["polynomialDiscriminant"], "20")
        self.assertEqual(result["numberField"]["fieldDiscriminant"], "5")
        self.assertEqual(result["numberField"]["powerBasis"], ["1", "a"])
        self.assertEqual(result["numberField"]["embeddingCount"], 2)
        self.assertEqual(len(result["numberField"]["integralBasis"]), 2)

    def test_quadratic_number_field_rejects_reducible_and_wrong_parent(self):
        q = object_record(Q, "Q", {"kind": "rational-field"})
        q_ref = {"objectId": Q, "revision": 1}
        bad = object_record(F, "K", {"kind": "number-field", "baseField": q_ref,
            "definingPolynomial": ["-4", "0", "1"], "generator": "a"}, [q_ref])
        with self.assertRaisesRegex(ValueError, "reducible"):
            run_payload(request([q, bad], F))
        z = object_record(Z, "Z", {"kind": "integer-ring"})
        z_ref = {"objectId": Z, "revision": 1}
        wrong = object_record(F, "K", {"kind": "number-field", "baseField": z_ref,
            "definingPolynomial": ["-5", "0", "1"], "generator": "a"}, [z_ref])
        with self.assertRaisesRegex(ValueError, "pinned QQ"):
            run_payload(request([z, wrong], F))

    def test_biquadratic_tower_has_verified_inclusion_and_degree_product(self):
        q = object_record(Q, "Q", {"kind": "rational-field"})
        q_ref = {"objectId": Q, "revision": 1}
        k = object_record(F, "K", {"kind": "number-field", "baseField": q_ref,
            "definingPolynomial": ["-2", "0", "1"], "generator": "a"}, [q_ref])
        k_ref = {"objectId": F, "revision": 1}
        l = object_record(Z, "L", {"kind": "field-extension", "baseField": k_ref,
            "radicand": "3", "generator": "b"}, [k_ref])
        outcome = run_payload(request([q, k, l], Z))
        self.assertTrue(outcome["success"], outcome.get("error"))
        result = outcome["result"]
        self.assertTrue(result["isField"])
        self.assertEqual(result["definitionHash"], l["contentHash"])
        self.assertEqual(result["fieldExtension"], {"baseDegree": 2, "relativeDegree": 2,
            "absoluteDegree": 4, "baseGeneratorImage": "a", "extensionGenerator": "b",
            "inclusionMapAvailable": True, "baseRelationVerified": True,
            "extensionRelationVerified": True})
        same = object_record(Z, "L", {"kind": "field-extension", "baseField": k_ref,
            "radicand": "2", "generator": "b"}, [k_ref])
        with self.assertRaisesRegex(ValueError, "reducible"):
            run_payload(request([q, k, same], Z))
        wrong = object_record(Z, "L", {"kind": "field-extension", "baseField": q_ref,
            "radicand": "3", "generator": "b"}, [q_ref])
        with self.assertRaisesRegex(ValueError, "quadratic number-field parent"):
            run_payload(request([q, wrong], Z))

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

    def test_directional_canonical_coercion_and_map_identity(self):
        z = object_record(Z, "Z", {"kind": "integer-ring"})
        q = object_record(Q, "Q", {"kind": "rational-field"})
        result = run_payload(domain_request([z], Z, [q], Q))
        self.assertTrue(result["success"])
        data = result["result"]
        self.assertEqual(data["left"]["characteristic"], "0")
        self.assertTrue(data["right"]["isField"])
        self.assertTrue(data["right"]["isExact"])
        self.assertEqual(data["leftToRight"]["status"], "canonical")
        self.assertTrue(data["leftToRight"]["mapId"].startswith("sha256:"))
        self.assertEqual(data["leftToRight"]["sourceHash"], z["contentHash"])
        self.assertEqual(data["rightToLeft"]["status"], "incompatible")
        self.assertEqual(data["rightToLeft"]["error"]["code"], "NO_CANONICAL_COERCION")
        self.assertEqual(data["rightToLeft"]["error"]["targetCharacteristic"], "0")
        again = run_payload(domain_request([z], Z, [q], Q))
        self.assertEqual(data["leftToRight"]["mapId"], again["result"]["leftToRight"]["mapId"])

    def test_incompatible_polynomial_parents_and_pinned_base(self):
        q = object_record(Q, "Q", {"kind": "rational-field"})
        f = object_record(F, "F5", {"kind": "finite-field", "characteristic": 5,
            "degree": 1, "generator": "a", "construction": "canonical"})
        q_ref, f_ref = {"objectId": Q, "revision": 1}, {"objectId": F, "revision": 1}
        rq = object_record(R, "RQ", {"kind": "polynomial-ring", "coefficientDomain": q_ref,
            "variables": ["x", "y"], "monomialOrder": "degrevlex"}, [q_ref])
        rf = object_record(Z, "RF", {"kind": "polynomial-ring", "coefficientDomain": f_ref,
            "variables": ["x", "y"], "monomialOrder": "degrevlex"}, [f_ref])
        result = run_payload(domain_request([q, rq], R, [f, rf], Z))
        self.assertTrue(result["success"])
        data = result["result"]
        self.assertEqual(data["left"]["coefficientDomain"], q_ref)
        self.assertEqual(data["right"]["coefficientDomain"], f_ref)
        self.assertEqual(data["left"]["variables"], ["x", "y"])
        self.assertEqual(data["left"]["monomialOrder"], "degrevlex")
        self.assertEqual(data["leftToRight"]["status"], "incompatible")
        self.assertEqual(data["rightToLeft"]["status"], "incompatible")
        self.assertEqual(data["leftToRight"]["error"]["sourceCharacteristic"], "0")
        self.assertEqual(data["leftToRight"]["error"]["targetCharacteristic"], "5")

    def test_domain_snapshot_rejects_mismatched_project_and_code(self):
        q = object_record(Q, "Q", {"kind": "rational-field"})
        wrong_project = domain_request([q], Q, [q], Q)
        wrong_project["params"]["right"]["projectId"] = "math3d:project:" + "f" * 32
        with self.assertRaisesRegex(ValueError, "same Project"):
            run_payload(wrong_project)
        code = domain_request([q], Q, [q], Q)
        code["params"]["left"]["objects"][0] = {**q, "python": "__import__('os')"}
        with self.assertRaisesRegex(ValueError, "exactly"):
            run_payload(code)
        conflicting = domain_request([q], Q, [object_record(Q, "Q", {"kind": "integer-ring"})], Q)
        with self.assertRaisesRegex(ValueError, "Conflicting Sage algebra definition"):
            run_payload(conflicting)

    def test_indeterminate_coercion_is_not_mislabeled_incompatible(self):
        from sage.all import ZZ

        class FailingParent:
            def coerce_map_from(self, _source):
                raise ValueError("internal Sage diagnostic")

            def characteristic(self):
                return ZZ(0)

        q = object_record(Q, "Q", {"kind": "rational-field"})
        result = _coercion(q, ZZ, q, FailingParent())
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["error"]["code"], "COERCION_CHECK_FAILED")
        self.assertNotIn("internal Sage diagnostic", result["error"]["message"])


if __name__ == "__main__":
    unittest.main()
