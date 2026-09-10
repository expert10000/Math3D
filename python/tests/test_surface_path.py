from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "py"))

from geodesic import surface_path


class SurfacePathProtocolTests(unittest.TestCase):
    def setUp(self) -> None:
        self.vertices = np.asarray(
            [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
            dtype=np.float64,
        )
        self.faces = np.asarray([[0, 1, 2]], dtype=np.int64)

    def test_normalizes_locations_and_returns_consistent_metadata(self) -> None:
        captured = {}

        def fake_run(args, **kwargs):
            captured["request"] = Path(args[1]).read_text(encoding="utf-8")
            return mock.Mock(
                returncode=0,
                stdout='{"ok":true,"length":1.4142135623730951,"sourceIndex":0,"polyline":[[1,0,0],[0,1,0]]}\n',
                stderr="",
            )

        with mock.patch.object(surface_path, "_resolve_helper", return_value="cgal-geodesic"), mock.patch.object(
            surface_path.subprocess, "run", side_effect=fake_run
        ):
            result = surface_path.cgal_surface_shortest_path(
                self.vertices,
                self.faces,
                [{"face": 0, "bary": [2, 0, 0], "vertex": 0, "sourceKind": "selected-vertex"}],
                {"face": 0, "bary": [0, 3, 0], "vertex": 1},
            )

        self.assertTrue(result["ok"])
        self.assertEqual(result["method"], "cgal-surface-shortest-path")
        self.assertEqual(result["source"]["bary"], [1.0, 0.0, 0.0])
        self.assertEqual(result["target"]["bary"], [0.0, 1.0, 0.0])
        self.assertEqual(result["source"]["sourceKind"], "selected-vertex")
        self.assertIn("3 1 1", captured["request"])

    def test_preserves_disconnected_result(self) -> None:
        response = mock.Mock(
            returncode=2,
            stdout='{"ok":false,"disconnected":true,"error":"Source and target are disconnected"}\n',
            stderr="",
        )
        with mock.patch.object(surface_path, "_resolve_helper", return_value="cgal-geodesic"), mock.patch.object(
            surface_path.subprocess, "run", return_value=response
        ):
            result = surface_path.cgal_surface_shortest_path(
                self.vertices,
                self.faces,
                [{"face": 0, "bary": [1, 0, 0]}],
                {"face": 0, "bary": [0, 1, 0]},
            )
        self.assertFalse(result["ok"])
        self.assertTrue(result["disconnected"])

    def test_rejects_invalid_faces_and_locations_before_launch(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "outside V"):
            surface_path.cgal_surface_shortest_path(
                self.vertices,
                np.asarray([[0, 1, 9]]),
                [{"face": 0, "bary": [1, 0, 0]}],
                {"face": 0, "bary": [0, 1, 0]},
            )
        with self.assertRaisesRegex(RuntimeError, "outside its triangle"):
            surface_path.cgal_surface_shortest_path(
                self.vertices,
                self.faces,
                [{"face": 0, "bary": [-0.1, 0.5, 0.6]}],
                {"face": 0, "bary": [0, 1, 0]},
            )


if __name__ == "__main__":
    unittest.main()
