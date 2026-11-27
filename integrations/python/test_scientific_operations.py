import unittest

from scientific_operations import discover_server_operations


class ScientificOperationDiscoveryTest(unittest.TestCase):
    def test_requires_registry_and_verified_server_binding(self):
        registry = [
            {"kind": "scientific-operations", "id": "mesh.quality.compute",
             "status": "registered", "environments": ["server"],
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


if __name__ == "__main__":
    unittest.main()
