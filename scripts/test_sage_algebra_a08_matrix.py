"""Exercise the A08 HTTP comparison path with a controlled Sage worker response."""

import importlib.util
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


SCRIPT = Path(__file__).with_name("check-sage-algebra-a08-matrix.py")
SPEC = importlib.util.spec_from_file_location("sage_a08_matrix", SCRIPT)
MATRIX = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MATRIX)


class Handler(BaseHTTPRequestHandler):
    corrupt = False

    def do_GET(self):
        self.reply({"engine": "sagemath", "engineVersion": "10.10", "available": True,
            "status": "ok", "operations": ["sage.algebra.reconstruct"]})

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        response = MATRIX.run_payload(request)
        response["engineVersion"] = "10.10"
        if self.corrupt:
            response["result"]["characteristic"] = "999"
        self.reply(response)

    def reply(self, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        pass


class CrossRuntimeMatrixTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        Handler.corrupt = False
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)

    def test_compares_all_seven_math_signatures(self):
        result = MATRIX.run_matrix(self.url, True)
        self.assertEqual(result["fixtureCount"], 7)
        self.assertTrue(result["local"]["version"])
        self.assertEqual(result["docker"]["version"], "10.10")
        self.assertEqual(result["docker"]["status"], "passed")
        self.assertEqual(result["local"]["cases"], result["docker"]["cases"])

    def test_rejects_a_different_mathematical_result(self):
        Handler.corrupt = True
        with self.assertRaisesRegex(AssertionError, "ZZ"):
            MATRIX.run_matrix(self.url, True)


if __name__ == "__main__":
    unittest.main()
