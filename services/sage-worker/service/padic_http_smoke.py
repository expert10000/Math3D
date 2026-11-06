"""Run inside the Sage container to verify the published G02 HTTP route."""

import json
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

from .test_padic_workspace import request


def main():
    payload = {"operation": "sage.numberTheory.padic", "params": request(
        hensel={"coefficients": ["-2", "0", "1"], "seed": 3})}
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
    if not output.get("success") or result.get("entries", {}).get("sum", {}).get("relativePrecision") != 5 or \
            result.get("hensel", {}).get("rootResidue") != "38181":
        raise AssertionError("G02 HTTP route returned an unexpected result.")
    print("G02 HTTP route: Z7 precision loss and Hensel lift verified.")


if __name__ == "__main__":
    main()
