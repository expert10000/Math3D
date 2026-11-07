"""F08 legacy matrix UI contract on the real Sage runner."""

import unittest

from .sage_runner import run_payload


class BaselineMatrixTests(unittest.TestCase):
    def test_numeric_zero_matrix_entries_support_exact_eigen_and_charpoly(self):
        params = {"matrix": [[1, 0], [0, 2]], "variable": "lambda"}
        eigen = run_payload({"operation": "sage.matrix.eigen_exact", "params": params})
        charpoly = run_payload({"operation": "sage.matrix.charpoly", "params": params})
        self.assertTrue(eigen["success"])
        self.assertEqual(eigen["result"]["eigenvalues"], ["1", "2"])
        self.assertEqual(eigen["result"]["inputShape"], [2, 2])
        self.assertTrue(charpoly["success"])
        self.assertEqual(charpoly["result"]["text"], "lambda^2 - 3*lambda + 2")

    def test_boolean_matrix_entry_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Expression is required"):
            run_payload({"operation": "sage.matrix.charpoly", "params":
                {"matrix": [[True]], "variable": "lambda"}})


if __name__ == "__main__":
    unittest.main()
