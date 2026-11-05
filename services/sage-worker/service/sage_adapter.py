import json
import os
import signal
import subprocess
import tempfile
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from threading import Condition, Event
from uuid import uuid4


MAX_RUNNING_JOBS = 2
MAX_QUEUED_JOBS = 4
MAX_QUEUE_WAIT_SECONDS = 10
MAX_INPUT_BYTES = 64 * 1024
MAX_OUTPUT_BYTES = 256 * 1024
MAX_WALL_SECONDS = 30
MAX_CPU_SECONDS = 30
MAX_MEMORY_BYTES = 4 * 1024 * 1024 * 1024


@dataclass
class _Job:
    cancelled: Event
    running: bool = False
    process: subprocess.Popen[str] | None = None


_condition = Condition()
_active_jobs: dict[str, _Job] = {}
_waiting: deque[str] = deque()
_running_count = 0
_early_cancellations: dict[str, float] = {}


def _prune_early_cancellations() -> None:
    now = time.monotonic()
    for job_id, expiry in list(_early_cancellations.items()):
        if expiry <= now:
            del _early_cancellations[job_id]


def cancel_sage_job(job_id: str) -> bool:
    with _condition:
        active = _active_jobs.get(job_id)
        if active is None:
            _prune_early_cancellations()
            if len(_early_cancellations) >= 1024:
                del _early_cancellations[next(iter(_early_cancellations))]
            _early_cancellations[job_id] = time.monotonic() + 60
            return True
        active.cancelled.set()
        process = active.process
        _condition.notify_all()
    if process is not None:
        _stop_process(process, force=False)
    return True


def _stop_process(process: subprocess.Popen[str], force: bool) -> None:
    try:
        if os.name != "nt" and getattr(process, "pid", None):
            os.killpg(process.pid, signal.SIGKILL if force else signal.SIGTERM)
        elif process.poll() is None and force:
            process.kill()
        elif process.poll() is None:
            process.terminate()
    except ProcessLookupError:
        pass


def _admit_job(job_id: str, job: _Job) -> str | None:
    global _running_count
    with _condition:
        _prune_early_cancellations()
        if _early_cancellations.pop(job_id, None) is not None:
            return "cancelled"
        if job_id in _active_jobs:
            return "duplicate"
        if _running_count >= MAX_RUNNING_JOBS and len(_waiting) >= MAX_QUEUED_JOBS:
            return "queue-full"
        _active_jobs[job_id] = job
        if _running_count < MAX_RUNNING_JOBS and not _waiting:
            job.running = True
            _running_count += 1
            return None
        _waiting.append(job_id)
        deadline = time.monotonic() + MAX_QUEUE_WAIT_SECONDS
        while True:
            if job.cancelled.is_set():
                _waiting.remove(job_id)
                del _active_jobs[job_id]
                _condition.notify_all()
                return "cancelled"
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                _waiting.remove(job_id)
                del _active_jobs[job_id]
                _condition.notify_all()
                return "queue-timeout"
            if _waiting[0] == job_id and _running_count < MAX_RUNNING_JOBS:
                _waiting.popleft()
                job.running = True
                _running_count += 1
                return None
            _condition.wait(timeout=remaining)


def _release_job(job_id: str) -> None:
    global _running_count
    with _condition:
        job = _active_jobs.pop(job_id, None)
        if job and job.running:
            _running_count -= 1
        _condition.notify_all()


def _failure(operation: str, start: float, message: str, code: str | None = None) -> dict:
    return {
        "engine": "sagemath", "operation": operation, "success": False,
        "latex": "", "result": {}, "warnings": [],
        "elapsedMs": round((time.time() - start) * 1000), "error": message,
        **({"errorCode": code} if code else {}),
    }


def ideal_timeout_seconds(operation: str, params: dict, hard_limit: int = 30) -> float:
    """Apply a reviewed shorter wall clock cap before launching a Sage ideal job."""
    if not operation.startswith("sage.ideal.") or not isinstance(params, dict):
        return float(hard_limit)
    budget = params.get("budget")
    profiles = {"standard": 15000, "expanded": 30000}
    if not isinstance(budget, dict) or not isinstance(budget.get("profile"), str) or \
            budget["profile"] not in profiles or \
            type(budget.get("wallTimeMs")) is not int or \
            budget["wallTimeMs"] != profiles[budget["profile"]]:
        return float(hard_limit)
    return min(float(hard_limit), budget["wallTimeMs"] / 1000)


def run_sage_operation(operation: str, params: dict, timeout_seconds: int = MAX_WALL_SECONDS,
                       job_id: str | None = None) -> dict:
    start = time.time()
    job_id = job_id or str(uuid4())
    payload = json.dumps({"operation": operation, "params": params})
    if len(payload.encode("utf-8")) > MAX_INPUT_BYTES:
        return _failure(operation, start, "Sage input exceeds the 64 KiB worker budget.", "input_limit_exceeded")
    job = _Job(Event())
    admission = _admit_job(job_id, job)
    if admission:
        messages = {"cancelled": "Sage Docker job cancelled before execution.",
                    "duplicate": "Sage Docker job ID is already running.",
                    "queue-full": f"Sage Docker queue is full ({MAX_RUNNING_JOBS} running, {MAX_QUEUED_JOBS} waiting).",
                    "queue-timeout": f"Sage Docker queue wait exceeded {MAX_QUEUE_WAIT_SECONDS:g} seconds."}
        return _failure(operation, start, messages[admission], admission.replace("-", "_"))
    try:
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.json"
            output_path = Path(tmp) / "output.json"
            input_path.write_text(payload, encoding="utf-8")
            if job.cancelled.is_set():
                return _failure(operation, start, "Sage Docker job cancelled.", "cancelled")
            stderr_path = Path(tmp) / "stderr.txt"
            with stderr_path.open("w+", encoding="utf-8") as stderr_file:
                return _execute_sage(job, operation, params, timeout_seconds,
                                     start, input_path, output_path, stderr_path, stderr_file)
    finally:
        _release_job(job_id)


def _execute_sage(job: _Job, operation: str, params: dict,
                  timeout_seconds: int, start: float, input_path: Path, output_path: Path,
                  stderr_path: Path, stderr_file) -> dict:
    process = subprocess.Popen(
        ["sage", "-python", "/app/service/sage_runner.py", str(input_path), str(output_path)],
        text=True, stdout=subprocess.DEVNULL, stderr=stderr_file,
        start_new_session=os.name != "nt",
        env={**os.environ, "MATH3D_SAGE_WORKER_LIMITS": "1",
             "MATH3D_SAGE_WORKER_CPU_SECONDS": str(MAX_CPU_SECONDS),
             "MATH3D_SAGE_WORKER_MEMORY_BYTES": str(MAX_MEMORY_BYTES)},
    )
    try:
        with _condition:
            job.process = process
            already_cancelled = job.cancelled.is_set()
        if already_cancelled:
            _stop_process(process, force=True)
        effective_timeout = ideal_timeout_seconds(operation, params,
                                                  min(timeout_seconds, MAX_WALL_SECONDS))
        deadline = time.monotonic() + effective_timeout
        timed_out = False
        while True:
            try:
                process.communicate(timeout=0.1)
                break
            except subprocess.TimeoutExpired:
                if job.cancelled.is_set() or time.monotonic() >= deadline:
                    timed_out = not job.cancelled.is_set()
                    _stop_process(process, force=True)
                    process.communicate()
                    break
        if job.cancelled.is_set():
            return _failure(operation, start, "Sage Docker job cancelled.", "cancelled")
        if timed_out or time.monotonic() >= deadline:
            return _failure(operation, start, f"SageMath wall-time budget exceeded ({effective_timeout:g} s).",
                            "deadline_exceeded")
        if stderr_path.stat().st_size > MAX_OUTPUT_BYTES:
            return _failure(operation, start, "Sage diagnostics exceed the 256 KiB worker budget.",
                            "output_limit_exceeded")
        if process.returncode != 0:
            if os.name != "nt" and process.returncode == -signal.SIGXCPU:
                return _failure(operation, start, "Sage CPU-time budget exceeded.", "cpu_limit_exceeded")
            return _failure(operation, start, stderr_path.read_text(encoding="utf-8").strip() or "SageMath execution failed")
        if not output_path.exists():
            return _failure(operation, start, "SageMath did not produce output JSON.")
        if output_path.stat().st_size > MAX_OUTPUT_BYTES:
            return _failure(operation, start, "Sage output exceeds the 256 KiB worker budget.",
                            "output_limit_exceeded")
        try:
            return json.loads(output_path.read_text(encoding="utf-8"))
        except Exception as exc:
            return _failure(operation, start, f"Failed to parse SageMath output: {exc}")
    finally:
        _stop_process(process, force=True)
        with _condition:
            job.process = None
