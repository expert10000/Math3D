import unittest

from scientific_operations import ScientificOperationClient, discover_server_operations


class ScientificOperationDiscoveryTest(unittest.TestCase):
    def test_requires_registry_and_verified_server_binding(self):
        registry = [
            {"kind": "scientific-operations", "id": "mesh.quality.compute",
             "status": "registered", "schemaCompleteness": "complete", "environments": ["server"],
             "implementationId": "worker:mesh.quality.compute"},
            {"kind": "scientific-operations", "id": "surface.curvature.compute",
             "status": "registered", "environments": ["browser", "desktop"],
             "implementationId": "math3d.surface.curvature-field"},
            {"kind": "scientific-operations", "id": "future",
             "status": "catalogued", "environments": ["server"],
             "implementationId": "future"},
        ]
        self.assertEqual(discover_server_operations(registry), [])
        self.assertEqual(
            [item["id"] for item in discover_server_operations(
                registry, ["worker:mesh.quality.compute", "math3d.surface.curvature-field", "future"]
            )],
            ["mesh.quality.compute"],
        )

    def test_client_requires_complete_verified_contract_and_validates_transport(self):
        descriptor = {"kind": "scientific-operations", "id": "number-theory.gcd",
                      "status": "registered", "schemaCompleteness": "complete",
                      "environments": ["server"], "implementationId": "worker:number-theory.gcd",
                      "inputSchema": {"type": "object", "properties": {
                          "a": {"type": "integer"}, "b": {"type": "integer"}},
                          "required": ["a", "b"], "additionalProperties": False},
                      "parameterSchema": {"type": "object", "additionalProperties": False},
                      "outputSchema": {"type": "object", "properties": {
                          "gcd": {"type": "integer", "minimum": 0}},
                          "required": ["gcd"], "additionalProperties": False}}
        calls = []
        client = ScientificOperationClient([descriptor], ["worker:number-theory.gcd"],
                                           lambda operation, inputs, params: calls.append(operation) or {"gcd": 2})
        self.assertEqual(client.operations(), ["number-theory.gcd"])
        self.assertEqual(client.execute("number-theory.gcd", {"a": 8, "b": 6}), {"gcd": 2})
        self.assertEqual(calls, ["number-theory.gcd"])
        with self.assertRaisesRegex(ValueError, "Invalid input"):
            client.execute("number-theory.gcd", {"a": 8.5, "b": 6})
        self.assertEqual(ScientificOperationClient([descriptor], [], lambda *_: {}).operations(), [])
        self.assertEqual(ScientificOperationClient([{**descriptor, "schemaCompleteness": "partial"}],
                                                   ["worker:number-theory.gcd"], lambda *_: {}).operations(), [])


if __name__ == "__main__":
    unittest.main()
