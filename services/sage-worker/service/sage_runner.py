import json
import re
import sys
import time
from pathlib import Path

from sage.all import GF, QQ, SR, ZZ, PolynomialRing, gcd, inverse_mod, latex, matrix, solve, var


ENGINE = "sagemath"
MAX_EXPR_LEN = 1200
MAX_MATRIX_DIM = 8
MAX_POLYS = 12
MAX_VARIABLES = 8
SAFE_EXPR_RE = re.compile(r"^[A-Za-z0-9_+\-*/^().,=<>\[\]\s]+$")
NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class SageRequestError(ValueError):
    pass


def _success(operation, result, latex_value="", warnings=None, elapsed_ms=0):
    return {
        "engine": ENGINE,
        "operation": operation,
        "success": True,
        "latex": latex_value,
        "result": result,
        "warnings": warnings or [],
        "elapsedMs": elapsed_ms,
    }


def _failure(operation, message, elapsed_ms=0):
    return {
        "engine": ENGINE,
        "operation": operation,
        "success": False,
        "latex": "",
        "result": {},
        "warnings": [],
        "elapsedMs": elapsed_ms,
        "error": message,
    }


def _validate_expression(expr):
    text = str(expr or "").strip()
    if not text:
        raise SageRequestError("Expression is required.")
    if len(text) > MAX_EXPR_LEN:
        raise SageRequestError(f"Expression is too long (max {MAX_EXPR_LEN} characters).")
    if not SAFE_EXPR_RE.match(text):
        raise SageRequestError("Expression contains unsupported characters.")
    return text


def _validate_name(name, label="variable"):
    text = str(name or "").strip()
    if not NAME_RE.match(text):
        raise SageRequestError(f"Invalid {label}: {text!r}.")
    return text


def _variables(params, default=("x",)):
    raw = params.get("variables", default)
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list) or not raw:
        raise SageRequestError("variables must be a non-empty list.")
    if len(raw) > MAX_VARIABLES:
        raise SageRequestError(f"Too many variables (max {MAX_VARIABLES}).")
    names = [_validate_name(item) for item in raw]
    var(" ".join(names))
    return names


def _symbolic_expression(expr, variables=("x",)):
    _variables({"variables": list(variables)}, variables)
    return SR(_validate_expression(expr))


def _matrix(params):
    rows = params.get("matrix")
    if not isinstance(rows, list) or not rows:
        raise SageRequestError("matrix must be a non-empty array.")
    if len(rows) > MAX_MATRIX_DIM:
        raise SageRequestError(f"Matrix dimension is too large (max {MAX_MATRIX_DIM}).")
    width = None
    converted = []
    for row in rows:
        if not isinstance(row, list) or not row:
            raise SageRequestError("matrix rows must be non-empty arrays.")
        if width is None:
            width = len(row)
            if width > MAX_MATRIX_DIM:
                raise SageRequestError(f"Matrix dimension is too large (max {MAX_MATRIX_DIM}).")
        if len(row) != width:
            raise SageRequestError("matrix rows must have equal length.")
        converted.append([_symbolic_expression(entry) for entry in row])
    if len(converted) != width:
        raise SageRequestError("matrix must be square.")
    return matrix(SR, converted)


def _polynomial_ring(params):
    variables = _variables(params)
    if len(variables) == 1:
        return PolynomialRing(QQ, variables[0]), variables
    return PolynomialRing(QQ, variables, order=str(params.get("order") or "degrevlex")), variables


def _symbolic_unary(operation, params, fn):
    expr = _symbolic_expression(params.get("expression"), _variables(params))
    value = fn(expr)
    return _success(operation, {"text": str(value)}, latex(value))


def _symbolic_solve(operation, params):
    variables = _variables(params)
    raw_equations = params.get("equations", params.get("expression"))
    if isinstance(raw_equations, str):
        raw_equations = [raw_equations]
    if not isinstance(raw_equations, list) or not raw_equations:
        raise SageRequestError("expression or equations must be provided.")
    equations = [_symbolic_expression(item, variables) for item in raw_equations]
    syms = [SR(name) for name in variables]
    value = solve(equations, syms, solution_dict=True)
    return _success(
        operation,
        {"solutions": [str(item) for item in value]},
        latex(value),
    )


def _matrix_eigen_exact(operation, params):
    mat = _matrix(params)
    eigenvalues = mat.eigenvalues()
    charpoly = mat.charpoly(str(params.get("variable") or "lambda"))
    return _success(
        operation,
        {
            "inputShape": [mat.nrows(), mat.ncols()],
            "eigenvalues": [str(item) for item in eigenvalues],
            "charpoly": str(charpoly),
        },
        latex(eigenvalues),
    )


def _matrix_charpoly(operation, params):
    mat = _matrix(params)
    poly = mat.charpoly(_validate_name(params.get("variable") or "lambda"))
    return _success(operation, {"inputShape": [mat.nrows(), mat.ncols()], "text": str(poly)}, latex(poly))


def _polynomial_factor(operation, params):
    ring, _variables_list = _polynomial_ring(params)
    poly = ring(_validate_expression(params.get("polynomial") or params.get("expression")))
    value = poly.factor()
    return _success(operation, {"text": str(value)}, latex(value))


def _polynomial_roots_exact(operation, params):
    ring, _variables_list = _polynomial_ring(params)
    poly = ring(_validate_expression(params.get("polynomial") or params.get("expression")))
    roots = poly.roots(multiplicities=True)
    return _success(
        operation,
        {"roots": [{"value": str(value), "multiplicity": int(mult)} for value, mult in roots]},
        latex(roots),
    )


def _groebner_compute(operation, params):
    ring, _variables_list = _polynomial_ring(params)
    raw_polys = params.get("polynomials")
    if not isinstance(raw_polys, list) or not raw_polys:
        raise SageRequestError("polynomials must be a non-empty list.")
    if len(raw_polys) > MAX_POLYS:
        raise SageRequestError(f"Too many polynomials (max {MAX_POLYS}).")
    polys = [ring(_validate_expression(item)) for item in raw_polys]
    basis = ring.ideal(polys).groebner_basis()
    return _success(operation, {"basis": [str(item) for item in basis]}, latex(basis))


def _number_theory_gcd(operation, params):
    values = params.get("values")
    if values is None:
        values = [params.get("a"), params.get("b")]
    if not isinstance(values, list) or len(values) < 2:
        raise SageRequestError("values must contain at least two integers.")
    ints = [ZZ(item) for item in values]
    value = ints[0]
    for item in ints[1:]:
        value = gcd(value, item)
    return _success(operation, {"value": str(value)}, latex(value))


def _number_theory_mod_inverse(operation, params):
    modulus = ZZ(params.get("modulus"))
    if modulus <= 1:
        raise SageRequestError("modulus must be greater than 1.")
    value = inverse_mod(ZZ(params.get("a")), modulus)
    return _success(operation, {"value": str(value), "modulus": str(modulus)}, latex(value))


OPERATIONS = {
    "sage.symbolic.simplify": lambda op, params: _symbolic_unary(op, params, lambda expr: expr.simplify_full()),
    "sage.symbolic.factor": lambda op, params: _symbolic_unary(op, params, lambda expr: expr.factor()),
    "sage.symbolic.expand": lambda op, params: _symbolic_unary(op, params, lambda expr: expr.expand()),
    "sage.symbolic.solve": _symbolic_solve,
    "sage.matrix.eigen_exact": _matrix_eigen_exact,
    "sage.matrix.charpoly": _matrix_charpoly,
    "sage.polynomial.roots_exact": _polynomial_roots_exact,
    "sage.polynomial.factor": _polynomial_factor,
    "sage.groebner.compute": _groebner_compute,
    "sage.numberTheory.gcd": _number_theory_gcd,
    "sage.numberTheory.modInverse": _number_theory_mod_inverse,
}


def run_payload(payload):
    operation = str(payload.get("operation") or "").strip()
    if operation not in OPERATIONS:
        raise SageRequestError(f"Unsupported Sage operation: {operation}")
    params = payload.get("params") or {}
    if not isinstance(params, dict):
        raise SageRequestError("params must be an object.")
    return OPERATIONS[operation](operation, params)


def main(input_path, output_path):
    start = time.time()
    operation = ""
    try:
        payload = json.loads(Path(input_path).read_text(encoding="utf-8"))
        operation = str(payload.get("operation") or "")
        result = run_payload(payload)
        result["elapsedMs"] = round((time.time() - start) * 1000)
    except Exception as exc:
        result = _failure(operation or "unknown", str(exc), round((time.time() - start) * 1000))
    Path(output_path).write_text(json.dumps(result), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
