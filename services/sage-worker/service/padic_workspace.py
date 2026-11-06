"""Bounded precision-explicit Qp/Zp arithmetic and simple-root Hensel lifting."""

import re

from sage.all import QQ, Qp, Zp, PolynomialRing, Infinity, is_prime


FORMAT = "math3d.sage-padic-workspace"
RESULT_FORMAT = "math3d.sage-padic-workspace-result"


def _rational(value, integral):
    if type(value) is not dict or set(value) != {"numerator", "denominator"}:
        raise ValueError("p-adic operands require canonical rational pairs.")
    numerator, denominator = value["numerator"], value["denominator"]
    if type(numerator) is not str or type(denominator) is not str or \
            not re.fullmatch(r"(?:0|-?[1-9][0-9]{0,14})", numerator) or \
            not re.fullmatch(r"[1-9][0-9]{0,14}", denominator):
        raise ValueError("p-adic operands require bounded canonical integers.")
    exact = QQ(int(numerator)) / int(denominator)
    if str(exact.numerator()) != numerator or str(exact.denominator()) != denominator or \
            (integral and denominator != "1"):
        raise ValueError("p-adic operands must be reduced and integral for Zp.")
    return exact


def _polynomial(data, prime):
    if data is None:
        return None
    if type(data) is not dict or set(data) != {"coefficients", "seed"} or \
            type(data["coefficients"]) is not list or not 2 <= len(data["coefficients"]) <= 5 or \
            any(type(item) is not str or not re.fullmatch(r"(?:0|-?[1-9][0-9]{0,5})", item)
                for item in data["coefficients"]) or data["coefficients"][-1] == "0" or \
            type(data["seed"]) is not int or not 0 <= data["seed"] < prime:
        raise ValueError("Hensel input requires a bounded integral polynomial and residue seed.")
    coefficients = [int(item) for item in data["coefficients"]]
    seed = data["seed"]
    value = sum(item * seed ** index for index, item in enumerate(coefficients))
    derivative = sum(index * item * seed ** (index - 1) for index, item in enumerate(coefficients[1:], 1))
    if value % prime or derivative % prime == 0:
        raise ValueError("Hensel seed must be a simple root modulo p.")
    return coefficients, seed


def run_padic_workspace(params):
    if type(params) is not dict or set(params) != {"format", "schemaVersion", "projectId", "target",
            "targetHash", "domain", "prime", "precision", "a", "b", "hensel"} or \
            params["format"] != FORMAT or type(params["schemaVersion"]) is not int or params["schemaVersion"] != 1:
        raise ValueError("p-adic workspace requires a versioned pinned request.")
    prime, precision, domain = params["prime"], params["precision"], params["domain"]
    if type(prime) is not int or not 2 <= prime <= 31 or not is_prime(prime) or \
            type(precision) is not int or not 2 <= precision <= 16 or domain not in ("Zp", "Qp"):
        raise ValueError("p-adic workspace requires prime p ≤ 31 and precision 2–16.")
    if type(params["target"]) is not dict or set(params["target"]) != {"objectId", "revision"} or \
            type(params["target"]["objectId"]) is not str or \
            type(params["target"]["revision"]) is not int or params["target"]["revision"] < 1 or \
            type(params["targetHash"]) is not str or type(params["projectId"]) is not str:
        raise ValueError("p-adic workspace requires a pinned parent record.")
    a = _rational(params["a"], domain == "Zp")
    b = _rational(params["b"], domain == "Zp")
    hensel = _polynomial(params["hensel"], prime)
    field = Zp(prime, prec=precision) if domain == "Zp" else Qp(prime, prec=precision)
    x, y = field(a), field(b)

    def shown(value, exact):
        absolute = value.precision_absolute()
        infinite = absolute == Infinity
        relative = int(value.precision_relative())
        uncertain = not infinite and value.is_zero()
        if infinite:
            status, valuation, digits, absolute_value = "exact-zero", None, [], None
        elif uncertain:
            status, valuation, digits, absolute_value = "undetermined", None, [], int(absolute)
        else:
            status, valuation, digits, absolute_value = "known-nonzero", int(value.valuation()), \
                [int(item) for item in value.unit_part().expansion()], int(absolute)
        return {"source": {"numerator": str(exact.numerator()), "denominator": str(exact.denominator())},
            "text": str(value), "zeroStatus": status, "valuation": valuation,
            "absolutePrecision": absolute_value, "relativePrecision": relative,
            "digits": digits, "precisionLost": status == "undetermined" or \
                (status == "known-nonzero" and relative < precision)}

    lifted = None
    if hensel is not None:
        coefficients, seed = hensel
        ring = PolynomialRing(Zp(prime, prec=precision), "t")
        polynomial = ring(coefficients)
        roots = [root for root, multiplicity in polynomial.roots() if multiplicity == 1 and
            int(root.lift()) % prime == seed]
        if len(roots) != 1 or int(roots[0].precision_absolute()) < precision:
            raise ValueError("Sage did not determine the requested simple p-adic root to the chosen precision.")
        modulus = prime ** precision
        lifted = {"coefficients": [str(item) for item in coefficients], "seed": seed,
            "rootResidue": str(int(roots[0].lift()) % modulus), "modulus": str(modulus),
            "absolutePrecision": precision, "relativePrecision": int(roots[0].precision_relative()),
            "zeroStatus": "undetermined" if roots[0].is_zero() else "known-nonzero",
            "text": str(roots[0])}
    return {"format": RESULT_FORMAT, "schemaVersion": 1,
        "target": params["target"], "targetHash": params["targetHash"],
        "domain": domain, "prime": prime, "precision": precision,
        "entries": {"a": shown(x, a), "b": shown(y, b),
            "sum": shown(x + y, a + b), "product": shown(x * y, a * b)},
        "hensel": lifted}
