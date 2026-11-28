import unittest
import json
import math
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from scientific_operations import ScientificOperationClient, discover_server_operations, connect_scientific_api


class ScientificOperationDiscoveryTest(unittest.TestCase):
    def test_requires_registry_and_verified_server_binding(self):
        registry = [
            {"kind": "scientific-operations", "id": "mesh.quality.compute",
             "status": "registered", "schemaCompleteness": "complete", "environments": ["server"],
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

    def test_client_requires_complete_verified_contract_and_validates_transport(self):
        descriptor = {"kind": "scientific-operations", "id": "number-theory.gcd",
                      "status": "registered", "schemaCompleteness": "complete",
                      "environments": ["server"], "implementationId": "worker:number-theory.gcd",
                      "inputSchema": {"type": "object", "properties": {
                          "a": {"type": "integer"}, "b": {"type": "integer"}},
                          "required": ["a", "b"], "additionalProperties": False},
                      "parameterSchema": {"type": "object", "additionalProperties": False},
                      "outputSchema": {"type": "object", "properties": {
                          "gcd": {"type": "integer", "minimum": 0}},
                          "required": ["gcd"], "additionalProperties": False}}
        calls = []
        client = ScientificOperationClient([descriptor], ["worker:number-theory.gcd"],
                                           lambda operation, inputs, params: calls.append(operation) or {"gcd": 2})
        self.assertEqual(client.operations(), ["number-theory.gcd"])
        self.assertEqual(client.execute("number-theory.gcd", {"a": 8, "b": 6}), {"gcd": 2})
        self.assertEqual(calls, ["number-theory.gcd"])
        with self.assertRaisesRegex(ValueError, "Invalid input"):
            client.execute("number-theory.gcd", {"a": 8.5, "b": 6})
        self.assertEqual(ScientificOperationClient([descriptor], [], lambda *_: {}).operations(), [])
        self.assertEqual(ScientificOperationClient([{**descriptor, "schemaCompleteness": "partial"}],
                                                   ["worker:number-theory.gcd"], lambda *_: {}).operations(), [])

    def test_http_transport_discovers_and_executes_on_the_same_server(self):
        descriptor = {"kind": "scientific-operations", "id": "number-theory.gcd",
                      "status": "registered", "schemaCompleteness": "complete",
                      "environments": ["server"], "implementationId": "worker:number-theory.gcd",
                      "inputSchema": {"type": "object", "properties": {
                          "a": {"type": "integer"}, "b": {"type": "integer"}},
                          "required": ["a", "b"], "additionalProperties": False},
                      "parameterSchema": {"type": "object", "additionalProperties": False},
                      "outputSchema": {"type": "object", "properties": {
                          "gcd": {"type": "integer"}}, "required": ["gcd"]}}

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"operations": [descriptor],
                                             "verifiedImplementationIds": ["worker:number-theory.gcd"]}).encode())

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                if self.path == "/v1/workflows/execute":
                    self.wfile.write(json.dumps({"steps": [{"id": item["id"],
                        "operationId": item["operationId"], "output": {"gcd": 6}}
                        for item in body["steps"]]}).encode())
                else:
                    self.wfile.write(json.dumps({"operationId": "number-theory.gcd",
                                                 "output": {"gcd": math.gcd(
                                                     body["input"]["a"], body["input"]["b"])}}).encode())

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = connect_scientific_api(f"http://127.0.0.1:{server.server_port}")
            self.assertEqual(client.operations(), ["number-theory.gcd"])
            self.assertEqual(client.execute("number-theory.gcd", {"a": 18, "b": 12}), {"gcd": 6})
            self.assertEqual(client.run_workflow([{"id": "step1",
                "operationId": "number-theory.gcd", "input": {"a": 18, "b": 12},
                "parameters": {}}])["steps"][0]["output"], {"gcd": 6})
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
