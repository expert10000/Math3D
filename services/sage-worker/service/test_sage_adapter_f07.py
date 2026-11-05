"""F07 worker admission, cancellation, cleanup and budget tests without Sage."""

import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from . import sage_adapter as worker


CHILD = """import json, subprocess, sys, time
request = json.load(open(sys.argv[1], encoding='utf-8'))
mode = request['params'].get('mode')
if mode == 'sleep':
    time.sleep(60)
elif mode == 'descendant':
    grandchild = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
    open(request['params']['pidPath'], 'w', encoding='utf-8').write(str(grandchild.pid))
    time.sleep(60)
elif mode == 'cpu':
    import resource
    limit = int(__import__('os').environ['MATH3D_SAGE_WORKER_CPU_SECONDS'])
    resource.setrlimit(resource.RLIMIT_CPU, (limit, limit + 1))
    while True:
        pass
elif mode == 'large':
    open(sys.argv[2], 'w', encoding='utf-8').write('x' * 300000)
else:
    json.dump({'success': True, 'result': {'value': 42}}, open(sys.argv[2], 'w', encoding='utf-8'))
"""


class WorkerBudgetTests(unittest.TestCase):
    def setUp(self):
        self.spawned = []
        actual_popen = subprocess.Popen

        def launch(args, **kwargs):
            process = actual_popen([sys.executable, "-c", CHILD, args[-2], args[-1]], **kwargs)
            self.spawned.append((process, Path(args[-2]).parent))
            return process

        self.patcher = patch.object(worker.subprocess, "Popen", side_effect=launch)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        for process, _ in self.spawned:
            if process.poll() is None:
                process.kill()
                process.wait()

    def wait_for(self, predicate):
        deadline = time.monotonic() + 3
        while not predicate():
            if time.monotonic() >= deadline:
                self.fail("Worker did not reach expected state")
            time.sleep(0.01)

    def test_deadline_kills_process_and_removes_temp_directory(self):
        result = worker.run_sage_operation("sage.test", {"mode": "sleep"},
                                           timeout_seconds=0.15, job_id="f07-deadline")
        self.assertEqual(result["errorCode"], "deadline_exceeded")
        process, temp_path = self.spawned[0]
        self.assertIsNotNone(process.poll())
        self.assertFalse(temp_path.exists())
        self.assertNotIn("f07-deadline", worker._active_jobs)

    @unittest.skipIf(os.name == "nt", "POSIX process-group check")
    def test_deadline_kills_descendant_process_group(self):
        descriptor, pid_path = tempfile.mkstemp(prefix="f07-descendant-")
        os.close(descriptor)
        descendant_pid = None
        try:
            result = worker.run_sage_operation("sage.test", {"mode": "descendant", "pidPath": pid_path},
                                               timeout_seconds=0.3, job_id="f07-descendant")
            self.assertEqual(result["errorCode"], "deadline_exceeded")
            descendant_pid = int(Path(pid_path).read_text(encoding="utf-8"))
            status = Path(f"/proc/{descendant_pid}/stat")
            self.wait_for(lambda: not status.exists() or status.read_text().split()[2] == "Z")
            self.assertIsNotNone(self.spawned[0][0].poll())
            self.assertFalse(self.spawned[0][1].exists())
        finally:
            Path(pid_path).unlink(missing_ok=True)
            if descendant_pid is not None:
                try:
                    os.kill(descendant_pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass

    @unittest.skipIf(os.name == "nt", "POSIX CPU limit check")
    def test_cpu_budget_stops_busy_child(self):
        with patch.object(worker, "MAX_CPU_SECONDS", 1), patch.object(worker, "MAX_WALL_SECONDS", 5):
            result = worker.run_sage_operation("sage.test", {"mode": "cpu"},
                                               timeout_seconds=5, job_id="f07-cpu")
        self.assertEqual(result["errorCode"], "cpu_limit_exceeded")
        self.assertIsNotNone(self.spawned[0][0].poll())
        self.assertFalse(self.spawned[0][1].exists())

    def test_fifo_queue_cancel_and_queue_full_without_launch(self):
        with patch.object(worker, "MAX_RUNNING_JOBS", 1), patch.object(worker, "MAX_QUEUED_JOBS", 1):
            with ThreadPoolExecutor(max_workers=2) as pool:
                first = pool.submit(worker.run_sage_operation, "sage.test", {"mode": "sleep"}, 30, "f07-first")
                self.wait_for(lambda: len(self.spawned) == 1)
                second = pool.submit(worker.run_sage_operation, "sage.test", {}, 30, "f07-queued")
                self.wait_for(lambda: "f07-queued" in worker._waiting)
                full = worker.run_sage_operation("sage.test", {}, job_id="f07-full")
                self.assertEqual(full["errorCode"], "queue_full")
                self.assertEqual(len(self.spawned), 1)
                worker.cancel_sage_job("f07-queued")
                self.assertEqual(second.result(timeout=3)["errorCode"], "cancelled")
                self.assertEqual(len(self.spawned), 1)
                worker.cancel_sage_job("f07-first")
                self.assertEqual(first.result(timeout=3)["errorCode"], "cancelled")
        self.assertEqual(len(worker._waiting), 0)
        self.assertEqual(worker._running_count, 0)
        self.assertFalse(self.spawned[0][1].exists())

    def test_input_and_output_budgets(self):
        large_input = worker.run_sage_operation("sage.test", {"text": "x" * worker.MAX_INPUT_BYTES},
                                                job_id="f07-input")
        self.assertEqual(large_input["errorCode"], "input_limit_exceeded")
        self.assertEqual(len(self.spawned), 0)
        large_output = worker.run_sage_operation("sage.test", {"mode": "large"}, job_id="f07-output")
        self.assertEqual(large_output["errorCode"], "output_limit_exceeded")
        self.assertFalse(self.spawned[0][1].exists())

    def test_queue_wait_budget_releases_waiter(self):
        with patch.object(worker, "MAX_RUNNING_JOBS", 1), patch.object(worker, "MAX_QUEUE_WAIT_SECONDS", 0.05):
            with ThreadPoolExecutor(max_workers=1) as pool:
                first = pool.submit(worker.run_sage_operation, "sage.test", {"mode": "sleep"}, 30, "f07-wait-first")
                self.wait_for(lambda: len(self.spawned) == 1)
                result = worker.run_sage_operation("sage.test", {}, job_id="f07-wait-expired")
                self.assertEqual(result["errorCode"], "queue_timeout")
                self.assertEqual(len(self.spawned), 1)
                worker.cancel_sage_job("f07-wait-first")
                self.assertEqual(first.result(timeout=3)["errorCode"], "cancelled")
        self.assertEqual(worker._running_count, 0)


if __name__ == "__main__":
    unittest.main()
