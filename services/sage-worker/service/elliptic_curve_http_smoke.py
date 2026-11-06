"""Check the published G04 HTTP route inside the Sage container."""

import json
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

from .test_elliptic_curve import curve_request


def main():
    for definition, a, b, expected in (
        ({"kind": "rational-field"}, "-1", "1", ("-368", "-6912/23", ["1/4", "-7/8"])),
        ({"kind": "finite-field", "characteristic": 5, "degree": 1, "generator": "a",
          "construction": "canonical"}, "1", "1", ("4", "2", ["4", "2"]))):
        body = json.dumps(curve_request(definition, a, b, ["0", "1"])).encode("utf-8")
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
        actual = (result.get("discriminant"), result.get("jInvariant"), result.get("doublePoint"))
        if not output.get("success") or actual != expected:
            raise AssertionError(f"G04 HTTP route returned unexpected data: {output}")
    print("G04 HTTP route: QQ and GF(5) invariants and point doubling verified.")


if __name__ == "__main__":
    main()
