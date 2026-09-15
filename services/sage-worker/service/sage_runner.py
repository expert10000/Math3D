import json
import re
import sys
import time
from pathlib import Path

from sage.all import ChainComplex, GF, I, QQ, SR, ZZ, PolynomialRing, cos, e, exp, gcd, inverse_mod, latex, log, matrix, pi, sin, solve, sqrt, tan, var
from sage.env import SAGE_VERSION


ENGINE = "sagemath"
MAX_EXPR_LEN = 1200
MAX_MATRIX_DIM = 8
MAX_POLYS = 12
MAX_VARIABLES = 8
MAX_TOPOLOGY_CELLS = 4096
MAX_TOPOLOGY_NONZEROS = 32768
MAX_TOPOLOGY_INTEGER_DIGITS = 128
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


def _require_exact_fields(value, fields, label):
    if not isinstance(value, dict):
        raise SageRequestError(f"{label} must be an object.")
    actual = set(value.keys())
    expected = set(fields)
    unknown = sorted(actual - expected)
    missing = sorted(expected - actual)
    if unknown:
        raise SageRequestError(f"{label} contains unknown fields: {', '.join(unknown)}.")
    if missing:
        raise SageRequestError(f"{label} is missing fields: {', '.join(missing)}.")


def _topology_sparse_matrix(value, label, expected_rows, expected_columns):
    _require_exact_fields(value, ("rows", "columns", "entries"), label)
    rows = value["rows"]
    columns = value["columns"]
    if type(rows) is not int or type(columns) is not int or rows < 0 or columns < 0:
        raise SageRequestError(f"{label} dimensions must be non-negative integers.")
    if rows != expected_rows or columns != expected_columns:
        raise SageRequestError(f"{label} dimensions do not match chainDimensions.")
    entries = value["entries"]
    if not isinstance(entries, list):
        raise SageRequestError(f"{label}.entries must be an array.")
    if len(entries) > MAX_TOPOLOGY_NONZEROS:
        raise SageRequestError(f"Topology nonzero limit exceeded (max {MAX_TOPOLOGY_NONZEROS}).")
    result = matrix(ZZ, rows, columns, sparse=True)
    previous = None
    for index, entry in enumerate(entries):
        entry_label = f"{label}.entries[{index}]"
        _require_exact_fields(entry, ("row", "column", "value"), entry_label)
        row = entry["row"]
        column = entry["column"]
        raw_value = entry["value"]
        if type(row) is not int or type(column) is not int or row < 0 or row >= rows or column < 0 or column >= columns:
            raise SageRequestError(f"{entry_label} coordinate is out of range.")
        coordinate = (row, column)
        if previous is not None and coordinate <= previous:
            raise SageRequestError(f"{label}.entries must be strictly row-major ordered.")
        previous = coordinate
        if not isinstance(raw_value, str) or not re.fullmatch(r"-?[1-9][0-9]*", raw_value):
            raise SageRequestError(f"{entry_label}.value must be a non-zero canonical decimal integer string.")
        if len(raw_value.lstrip("-")) > MAX_TOPOLOGY_INTEGER_DIGITS:
            raise SageRequestError(f"{entry_label}.value exceeds the reviewed integer digit limit.")
        result[row, column] = ZZ(raw_value)
    return result


def _smith_diagonal(mat):
    smith = mat.smith_form(transformation=False)
    values = []
    for index in range(min(smith.nrows(), smith.ncols())):
        value = abs(ZZ(smith[index, index]))
        if value != 0:
            values.append(str(value))
    return values


def _homology_group_record(degree, group):
    orders = [abs(ZZ(order)) for order in group.gens_orders()]
    free_rank = sum(1 for order in orders if order == 0)
    torsion = sorted((order for order in orders if order > 1), key=lambda value: int(value))
    pieces = []
    if free_rank == 1:
        pieces.append("Z")
    elif free_rank > 1:
        pieces.append(f"Z^{free_rank}")
    pieces.extend(f"Z/{value}Z" for value in torsion)
    return {
        "degree": degree,
        "freeRank": free_rank,
        "torsionCoefficients": [str(value) for value in torsion],
        "notation": " ⊕ ".join(pieces) if pieces else "0",
    }


def _topology_integer_homology(operation, params):
    started = time.time()
    _require_exact_fields(
        params,
        ("format", "schemaVersion", "canonicalHash", "matrixArtifactId", "chainDimensions", "boundary1", "boundary2"),
        "params",
    )


def _complex_ast(node, z, depth=0):
    if depth > 64 or not isinstance(node, dict):
        raise SageRequestError("Complex AST is invalid or too deep.")
    node_type = node.get("type")
    if node_type == "number" and set(node) == {"type", "value"}:
        value = node.get("value")
        if not isinstance(value, (int, float)):
            raise SageRequestError("Complex AST number must be finite.")
        return SR(str(value))
    if node_type == "constant" and set(node) == {"type", "name"}:
        constants = {"i": I, "pi": pi, "e": e}
        if node.get("name") not in constants:
            raise SageRequestError("Unsupported Complex AST constant.")
        return constants[node["name"]]
    if node_type == "variable" and set(node) == {"type", "name"}:
        if node.get("name") != "z":
            raise SageRequestError("Ordinary Complex Sage analysis allows only variable z.")
        return z
    if node_type == "unary" and set(node) == {"type", "operator", "argument"}:
        if node.get("operator") != "-":
            raise SageRequestError("Unsupported Complex AST unary operator.")
        return -_complex_ast(node["argument"], z, depth + 1)
    if node_type == "binary" and set(node) == {"type", "operator", "left", "right"}:
        left = _complex_ast(node["left"], z, depth + 1)
        right = _complex_ast(node["right"], z, depth + 1)
        operation = node.get("operator")
        if operation == "+": return left + right
        if operation == "-": return left - right
        if operation == "*": return left * right
        if operation == "/": return left / right
        if operation == "^": return left ** right
        raise SageRequestError("Unsupported Complex AST binary operator.")
    if node_type == "call" and set(node) == {"type", "name", "argument"}:
        functions = {"sin": sin, "cos": cos, "tan": tan, "exp": exp, "log": log, "sqrt": sqrt}
        if node.get("name") not in functions:
            raise SageRequestError("Unsupported holomorphic Complex AST function.")
        return functions[node["name"]](_complex_ast(node["argument"], z, depth + 1))
    raise SageRequestError("Unsupported or malformed Complex AST node.")


def _complex_point(point):
    if not isinstance(point, dict) or set(point) != {"re", "im"}:
        raise SageRequestError("A structured complex point is required.")
    re_value = point.get("re")
    im_value = point.get("im")
    if not isinstance(re_value, (int, float)) or not isinstance(im_value, (int, float)):
        raise SageRequestError("Complex point coordinates must be finite numbers.")
    return SR(str(re_value)) + I * SR(str(im_value))


def _complex_analysis(operation, params):
    required = {"format", "schemaVersion", "operation", "ast", "variable", "point", "order", "assumptions"}
    if not isinstance(params, dict) or set(params) != required:
        raise SageRequestError("Complex analysis requires the exact structured payload schema.")
    if params.get("format") != "math3d.complex-sage-analysis-input" or params.get("schemaVersion") != 1:
        raise SageRequestError("Unsupported Complex Sage payload version.")
    requested = params.get("operation")
    if requested not in {"derivative", "limit", "poles", "residue", "series"}:
        raise SageRequestError("Unsupported Complex Sage operation.")
    if params.get("variable") != "z":
        raise SageRequestError("Complex Sage variable must be z.")
    z = var("z")
    expr = _complex_ast(params.get("ast"), z).simplify_full()
    point = _complex_point(params.get("point")) if params.get("point") is not None else None
    points = []
    series_terms = []
    if requested == "derivative":
        value = expr.derivative(z).simplify_full()
    elif requested == "limit":
        value = expr.limit(z=point)
    elif requested == "residue":
        value = expr.residue(z == point)
    elif requested == "series":
        order = params.get("order")
        if not isinstance(order, int) or order < 1 or order > 32:
            raise SageRequestError("Series order must be an integer from 1 to 32.")
        value = expr.series(z == point, order)
    else:
        denominator = expr.denominator().factor()
        roots = solve(denominator == 0, z, solution_dict=True) if denominator != 1 else []
        for root in roots:
            root_value = root.get(z)
            if root_value is not None:
                points.append({"value": str(root_value), "order": 1, "classification": "pole"})
        value = denominator
    elapsed_ms = 0
    result = {
        "format": "math3d.complex-sage-analysis-result",
        "schemaVersion": 1,
        "operation": requested,
        "exact": True,
        "value": str(value),
        "latex": str(latex(value)),
        "points": points,
        "series": series_terms,
        "engine": {"name": "SageMath", "version": str(SAGE_VERSION)},
        "algorithm": "sage-structured-complex-analysis",
        "elapsedMs": elapsed_ms,
        "diagnostics": [{"code": "complex/sage-exact", "message": "Exact result computed from a validated normalized AST."}],
    }
    return _success(operation, result, str(latex(value)))
    if params["format"] != "math3d.topology-integer-homology-input" or params["schemaVersion"] != 1:
        raise SageRequestError("Unsupported topology integer-homology schema.")
    if not isinstance(params["canonicalHash"], str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", params["canonicalHash"]):
        raise SageRequestError("canonicalHash must be a lowercase sha256 structural hash.")
    if not isinstance(params["matrixArtifactId"], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}", params["matrixArtifactId"]):
        raise SageRequestError("matrixArtifactId is invalid.")
    dimensions = params["chainDimensions"]
    if not isinstance(dimensions, list) or len(dimensions) != 3 or any(type(value) is not int or value < 0 for value in dimensions):
        raise SageRequestError("chainDimensions must contain exactly three non-negative integers.")
    if sum(dimensions) > MAX_TOPOLOGY_CELLS:
        raise SageRequestError(f"Topology cell limit exceeded (max {MAX_TOPOLOGY_CELLS}).")

    d1 = _topology_sparse_matrix(params["boundary1"], "boundary1", dimensions[0], dimensions[1])
    d2 = _topology_sparse_matrix(params["boundary2"], "boundary2", dimensions[1], dimensions[2])
    if len(params["boundary1"]["entries"]) + len(params["boundary2"]["entries"]) > MAX_TOPOLOGY_NONZEROS:
        raise SageRequestError(f"Topology nonzero limit exceeded (max {MAX_TOPOLOGY_NONZEROS}).")
    if not (d1 * d2).is_zero():
        raise SageRequestError("Exact chain condition d1*d2 = 0 failed.")

    # Sage stores a differential C_n -> C_(n-1) as the matrix that left-
    # multiplies a column vector, matching Math3D's boundary convention. Its
    # constructor also requires explicit zero differentials at nonempty ends.
    differentials = {}
    if dimensions[0] > 0:
        differentials[0] = matrix(ZZ, 0, dimensions[0], sparse=True)
    if dimensions[1] > 0 or dimensions[0] > 0:
        differentials[1] = d1
    if dimensions[2] > 0 or dimensions[1] > 0:
        differentials[2] = d2
    if dimensions[2] > 0:
        differentials[3] = matrix(ZZ, dimensions[2], 0, sparse=True)
    chain = ChainComplex(differentials, base_ring=ZZ, degree=-1, check=True)
    groups = [_homology_group_record(degree, chain.homology(degree, algorithm="auto")) for degree in range(3)]
    elapsed_ms = round((time.time() - started) * 1000)
    result = {
        "format": "math3d.topology-integer-homology-result",
        "schemaVersion": 1,
        "coefficientRing": "Z",
        "canonicalHash": params["canonicalHash"],
        "matrixArtifactId": params["matrixArtifactId"],
        "chainDimensions": dimensions,
        "groups": groups,
        "smithNormalForms": {
            "boundary1Diagonal": _smith_diagonal(d1),
            "boundary2Diagonal": _smith_diagonal(d2),
        },
        "engine": {"name": "SageMath", "version": str(SAGE_VERSION)},
        "algorithm": "sage-chain-complex-smith-normal-form",
        "elapsedMs": elapsed_ms,
        "diagnostics": [{
            "code": "topology/integer-homology-exact",
            "message": "Integral homology computed from the canonical cellular boundary operators over Z.",
        }],
    }
    return _success(operation, result)


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
    "sage.topology.integer_homology": _topology_integer_homology,
    "sage.complex.analyze": _complex_analysis,
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
