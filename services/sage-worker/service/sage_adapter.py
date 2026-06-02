import json
import subprocess
import tempfile
import time
from pathlib import Path


def run_sage_operation(operation: str, params: dict, timeout_seconds: int = 30) -> dict:
    start = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        input_path = Path(tmp) / "input.json"
        output_path = Path(tmp) / "output.json"
        input_path.write_text(json.dumps({"operation": operation, "params": params}), encoding="utf-8")

        completed = subprocess.run(
            ["sage", "-python", "/app/service/sage_runner.py", str(input_path), str(output_path)],
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
        )

        if completed.returncode != 0:
            return {
                "engine": "sagemath",
                "operation": operation,
                "success": False,
                "latex": "",
                "result": {},
                "warnings": [],
                "elapsedMs": round((time.time() - start) * 1000),
                "error": (completed.stderr or completed.stdout or "SageMath execution failed").strip(),
            }

        if not output_path.exists():
            return {
                "engine": "sagemath",
                "operation": operation,
                "success": False,
                "latex": "",
                "result": {},
                "warnings": [],
                "elapsedMs": round((time.time() - start) * 1000),
                "error": "SageMath did not produce output JSON.",
            }

        try:
            return json.loads(output_path.read_text(encoding="utf-8"))
        except Exception as exc:
            return {
                "engine": "sagemath",
                "operation": operation,
                "success": False,
                "latex": "",
                "result": {},
                "warnings": [],
                "elapsedMs": round((time.time() - start) * 1000),
                "error": f"Failed to parse SageMath output: {exc}",
            }
