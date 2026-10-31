import json
import subprocess
import tempfile
import time
from pathlib import Path
from threading import Event, Lock


_active_lock = Lock()
_active_jobs: dict[str, tuple[Event, subprocess.Popen[str] | None]] = {}
_early_cancellations: dict[str, float] = {}


def _prune_early_cancellations() -> None:
    now = time.monotonic()
    for job_id, expiry in list(_early_cancellations.items()):
        if expiry <= now:
            del _early_cancellations[job_id]


def cancel_sage_job(job_id: str) -> bool:
    with _active_lock:
        active = _active_jobs.get(job_id)
        if active is None:
            _prune_early_cancellations()
            if len(_early_cancellations) >= 1024:
                del _early_cancellations[next(iter(_early_cancellations))]
            _early_cancellations[job_id] = time.monotonic() + 60
            return True
        event, process = active
        event.set()
        if process is not None and process.poll() is None:
            process.terminate()
        return True


def _failure(operation: str, start: float, message: str) -> dict:
    return {
        "engine": "sagemath", "operation": operation, "success": False,
        "latex": "", "result": {}, "warnings": [],
        "elapsedMs": round((time.time() - start) * 1000), "error": message,
    }


def run_sage_operation(operation: str, params: dict, timeout_seconds: int = 30, job_id: str | None = None) -> dict:
    start = time.time()
    cancelled = Event()
    if job_id is not None:
        with _active_lock:
            _prune_early_cancellations()
            if _early_cancellations.pop(job_id, None) is not None:
                return _failure(operation, start, "Sage Docker job cancelled.")
            if job_id in _active_jobs:
                return _failure(operation, start, "Sage Docker job ID is already running.")
            _active_jobs[job_id] = (cancelled, None)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.json"
            output_path = Path(tmp) / "output.json"
            input_path.write_text(json.dumps({"operation": operation, "params": params}), encoding="utf-8")
            if cancelled.is_set():
                return _failure(operation, start, "Sage Docker job cancelled.")
            process = subprocess.Popen(
                ["sage", "-python", "/app/service/sage_runner.py", str(input_path), str(output_path)],
                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            if job_id is not None:
                with _active_lock:
                    _active_jobs[job_id] = (cancelled, process)
                    if cancelled.is_set() and process.poll() is None:
                        process.terminate()
            deadline = time.monotonic() + timeout_seconds
            while True:
                try:
                    stdout, stderr = process.communicate(timeout=0.1)
                    break
                except subprocess.TimeoutExpired:
                    if cancelled.is_set() or time.monotonic() >= deadline:
                        process.kill()
                        stdout, stderr = process.communicate()
                        break
            if cancelled.is_set():
                return _failure(operation, start, "Sage Docker job cancelled.")
            if time.monotonic() >= deadline:
                return _failure(operation, start, "SageMath execution timed out.")
            if process.returncode != 0:
                return _failure(operation, start, (stderr or stdout or "SageMath execution failed").strip())
            if not output_path.exists():
                return _failure(operation, start, "SageMath did not produce output JSON.")
            try:
                return json.loads(output_path.read_text(encoding="utf-8"))
            except Exception as exc:
                return _failure(operation, start, f"Failed to parse SageMath output: {exc}")
    finally:
        if job_id is not None:
            with _active_lock:
                _active_jobs.pop(job_id, None)
