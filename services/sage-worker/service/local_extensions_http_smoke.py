"""Verify the published G03 HTTP route inside the Sage container."""

import json
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

from .test_number_field_operations import fixture


def main():
    field, _ = fixture()
    for prime, splitting, degrees in ((3, "inert", [(1, 2)]),
                                      (5, "ramified", [(2, 1)]),
                                      (11, "split", [(1, 1), (1, 1)])):
        payload = {"operation": "sage.numberField.localExtensions", "params": {
            "format": "math3d.sage-local-extension", "schemaVersion": 1,
            "field": field, "prime": prime, "precision": 8}}
        body = json.dumps(payload).encode("utf-8")
        for attempt in range(20):
            try:
                with urlopen(Request("http://127.0.0.1:8767/run", data=body,
                        headers={"Content-Type": "application/json"}), timeout=30) as response:
                    output = json.load(response)
                break
            except URLError:
                if attempt == 19:
                    raise
                time.sleep(0.5)
        result = output.get("result") or {}
        actual = [(branch["ramificationIndex"], branch["residueDegree"])
                  for branch in result.get("branches", [])]
        if not output.get("success") or result.get("splitting") != splitting or actual != degrees:
            raise AssertionError(f"G03 HTTP route returned unexpected p={prime} data: {output}")
    print("G03 HTTP route: inert, ramified and split local models verified.")


if __name__ == "__main__":
    main()
