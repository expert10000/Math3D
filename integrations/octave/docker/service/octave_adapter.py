import json
import subprocess
import tempfile
import time
from pathlib import Path


def _as_float_matrix(matrix: list[list[float]]) -> list[list[float]]:
    return [[float(value) for value in row] for row in matrix]


def _as_float_vector(vector: list[float]) -> list[float]:
    return [float(value) for value in vector]


def _run_octave_script(script_call: str, payload: dict, shape: list[int]) -> dict:
    start = time.time()

    with tempfile.TemporaryDirectory() as tmp:
        input_path = Path(tmp) / "input.json"
        output_path = Path(tmp) / "output.json"
        input_path.write_text(json.dumps(payload), encoding="utf-8")

        cmd = [
            "octave",
            "--quiet",
            "--eval",
            f"addpath('/app/scripts'); {script_call}('{input_path}', '{output_path}');",
        ]

        completed = subprocess.run(
            cmd,
            text=True,
            capture_output=True,
            timeout=20,
        )

        if completed.returncode != 0:
            return {
                "ok": False,
                "engine": "gnu-octave",
                "error": (completed.stderr or completed.stdout or "Octave execution failed").strip(),
            }

        if not output_path.exists():
            return {
                "ok": False,
                "engine": "gnu-octave",
                "error": "Octave did not produce output JSON.",
            }

        try:
            result = json.loads(output_path.read_text(encoding="utf-8"))
        except Exception as exc:
            return {
                "ok": False,
                "engine": "gnu-octave",
                "error": f"Failed to parse Octave output: {exc}",
            }

        result["elapsedMs"] = round((time.time() - start) * 1000)
        result["inputShape"] = shape
        return result


def run_octave_eig(matrix: list[list[float]]) -> dict:
    numeric_matrix = _as_float_matrix(matrix)
    shape = [len(numeric_matrix), len(numeric_matrix[0]) if numeric_matrix else 0]
    return _run_octave_script("eig_demo", {"matrix": numeric_matrix}, shape)


def run_octave_solve(matrix: list[list[float]], rhs: list[float]) -> dict:
    numeric_matrix = _as_float_matrix(matrix)
    numeric_rhs = _as_float_vector(rhs)
    shape = [len(numeric_matrix), len(numeric_matrix[0]) if numeric_matrix else 0]
    return _run_octave_script(
        "solve_demo",
        {"matrix": numeric_matrix, "rhs": numeric_rhs},
        shape,
    )
