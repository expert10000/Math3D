from __future__ import annotations

import importlib.metadata as metadata
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from version_pins import pins, verify_installed


class WorkerVersionPinsTest(unittest.TestCase):
    def test_mismatch_and_missing_required_dependency_refuse_freeze(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "requirements.freeze.txt").write_text("numpy==2.4.6\nCGAL==6.0.1\n", encoding="utf-8")
            (root / "build-requirements.freeze.txt").write_text("pyinstaller==6.19.0\n", encoding="utf-8")

            def installed(name: str) -> str:
                if name == "cgal":
                    raise metadata.PackageNotFoundError(name)
                return {"numpy": "2.4.6", "pyinstaller": "6.19.0"}[name]

            self.assertEqual(verify_installed(root, installed, {}), {"numpy": "2.4.6", "pyinstaller": "6.19.0"})
            with self.assertRaisesRegex(RuntimeError, "cgal==6.0.1 is missing"):
                verify_installed(root, installed, {"MATH3D_REQUIRE_CGAL": "1"})
            with self.assertRaisesRegex(RuntimeError, "expected 6.19.0, found 6.18.0"):
                verify_installed(root, lambda name: "6.18.0" if name == "pyinstaller" else "2.4.6" if name == "numpy" else "6.0.1", {})

    def test_only_exact_unique_versions_are_accepted(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "pins.txt"
            path.write_text("numpy>=2\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "exact version"):
                pins(path)
            path.write_text("numpy==2.4.6\nNumPy==2.4.6\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                pins(path)


if __name__ == "__main__":
    unittest.main()
