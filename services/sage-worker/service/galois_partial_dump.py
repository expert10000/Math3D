"""Write the reviewed order-twelve partial correspondence fixture."""

import json
from .sage_runner import run_payload
from .test_galois_analysis import request


if __name__ == "__main__":
    print(json.dumps(run_payload(request("x^4-3*x^3+3*x^2+2*x+1"))["result"],
        sort_keys=True, separators=(",", ":")))
