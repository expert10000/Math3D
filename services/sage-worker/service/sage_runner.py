import os
if os.environ.get("MATH3D_SAGE_WORKER_LIMITS") == "1":
    import resource
    cpu_seconds = int(os.environ["MATH3D_SAGE_WORKER_CPU_SECONDS"])
    memory_bytes = int(os.environ["MATH3D_SAGE_WORKER_MEMORY_BYTES"])
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))
    resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))

import json
import math
import re
import sys
import time
from fractions import Fraction
from pathlib import Path

from sage.all import ChainComplex, GF, I, QQ, SR, ZZ, PolynomialRing, cos, e, exp, gcd, identity_matrix, inverse_mod, latex, log, matrix, pi, sin, solve, sqrt, tan, var
from sage.env import SAGE_VERSION
if __package__:
    from .algebra_reconstruction import reconstruct_algebra, inspect_algebra_domains
    from .finite_field_explorer import explore_finite_field
    from .padic_workspace import run_padic_workspace
    from .number_field_operations import run_number_field_operation
    from .galois_analysis import analyze_galois
    from .finite_group_operations import analyze_finite_group, group_capability_available
else:
    from algebra_reconstruction import reconstruct_algebra, inspect_algebra_domains
    from finite_field_explorer import explore_finite_field
    from padic_workspace import run_padic_workspace
    from number_field_operations import run_number_field_operation
    from galois_analysis import analyze_galois
    from finite_group_operations import analyze_finite_group, group_capability_available


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
        "engineVersion": str(SAGE_VERSION),
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
        "engineVersion": str(SAGE_VERSION),
        "operation": operation,
        "success": False,
        "latex": "",
        "result": {},
        "warnings": [],
        "elapsedMs": elapsed_ms,
        "error": message,
    }


def _validate_expression(expr):
    text = str(expr if expr is not None and not isinstance(expr, bool) else "").strip()
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


def _surface_calculus(operation, params):
    variables = _variables(params, ("x", "y", "z"))
    if set(variables) != {"x", "y", "z"} or len(variables) != 3:
        raise SageRequestError("Surface calculus requires x, y, z as the three variables.")
    expression = _symbolic_expression(params.get("expression"), variables)
    axes = [SR(name) for name in ("x", "y", "z")]
    gradient = [expression.diff(axis).simplify_full() for axis in axes]
    if operation == "sage.symbolic.gradient":
        return _success(operation, {"components": [str(item) for item in gradient], "text": str(gradient)}, latex(gradient))
    if operation == "sage.symbolic.hessian":
        hessian = [[item.diff(axis).simplify_full() for axis in axes] for item in gradient]
        return _success(operation, {"matrix": [[str(item) for item in row] for row in hessian], "text": str(hessian)}, latex(hessian))
    points = solve([expression == 0] + [item == 0 for item in gradient], axes, solution_dict=True)
    if len(points) > 64:
        raise SageRequestError("More than 64 singularities; narrow the surface equation.")
    if any(any(axis not in point for axis in axes) for point in points):
        raise SageRequestError("The singular set is not a finite list of isolated points.")
    return _success(operation, {"points": [{str(axis): str(point[axis]) for axis in axes if axis in point} for point in points],
                                "criterion": "F=0 and gradient F=0", "text": str(points)}, latex(points))


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


def _matrix_linear_dossier(operation, params):
    if set(params) != {"format", "schemaVersion", "matrix"} or \
            params.get("format") != "math3d.sage-matrix-dossier" or type(params.get("schemaVersion")) is not int or \
            params.get("schemaVersion") != 1:
        raise SageRequestError("Matrix dossier requires the versioned exact QQ matrix schema.")
    rows = params["matrix"]
    if not isinstance(rows, list) or not 1 <= len(rows) <= MAX_MATRIX_DIM or \
            not isinstance(rows[0], list) or not 1 <= len(rows[0]) <= MAX_MATRIX_DIM or \
            any(not isinstance(row, list) or len(row) != len(rows[0]) for row in rows):
        raise SageRequestError("Matrix dossier requires a rectangular matrix with 1 to 8 rows and columns.")
    canonical = re.compile(r"^(?:0|-?[1-9][0-9]{0,63})(?:/[1-9][0-9]{0,63})?$")
    if any(not isinstance(entry, str) or not canonical.fullmatch(entry) or str(QQ(entry)) != entry
            for row in rows for entry in row):
        raise SageRequestError("Matrix dossier entries must be reduced canonical QQ fractions of at most 64 digits.")
    mat = matrix(QQ, [[QQ(entry) for entry in row] for row in rows])
    rref = mat.echelon_form()
    pivots = list(rref.pivots())
    free = [column for column in range(mat.ncols()) if column not in pivots]
    kernel = []
    for column in free:
        vector = [QQ(0)] * mat.ncols()
        vector[column] = QQ(1)
        for pivot_row, pivot_column in enumerate(pivots):
            vector[pivot_column] = -rref[pivot_row, column]
        kernel.append([str(entry) for entry in vector])
    result = {
        "format": "math3d.sage-matrix-dossier-result",
        "schemaVersion": 1,
        "coefficientDomain": "QQ",
        "sourceMatrix": rows,
        "inputShape": [mat.nrows(), mat.ncols()],
        "rank": len(pivots),
        "reducedRowEchelonForm": [[str(rref[row, column]) for column in range(mat.ncols())]
            for row in range(mat.nrows())],
        "pivotColumns": pivots,
        "kernelBasis": kernel,
        "imageBasis": [[str(entry) for entry in mat.column(column)] for column in pivots],
        "minimalPolynomial": str(mat.minimal_polynomial("t")) if mat.is_square() else None,
        "characteristicPolynomial": str(mat.charpoly("t")) if mat.is_square() else None,
    }
    return _success(operation, result, latex(rref))


def _integer_matrix_forms(operation, params):
    if set(params) != {"format", "schemaVersion", "matrix"} or \
            params.get("format") != "math3d.sage-integer-matrix-forms" or \
            type(params.get("schemaVersion")) is not int or params.get("schemaVersion") != 1:
        raise SageRequestError("Integer matrix forms require the versioned exact ZZ matrix schema.")
    rows = params["matrix"]
    if not isinstance(rows, list) or not 1 <= len(rows) <= 6 or \
            not isinstance(rows[0], list) or not 1 <= len(rows[0]) <= 6 or \
            any(not isinstance(row, list) or len(row) != len(rows[0]) for row in rows):
        raise SageRequestError("Integer matrix forms require a rectangular 1 to 6 by 1 to 6 matrix.")
    canonical = re.compile(r"^(?:0|-?[1-9][0-9]{0,17})$")
    if any(not isinstance(entry, str) or not canonical.fullmatch(entry) for row in rows for entry in row):
        raise SageRequestError("Integer matrix entries must be canonical signed decimals of at most 18 digits.")
    mat = matrix(ZZ, [[ZZ(entry) for entry in row] for row in rows])
    smith_raw = mat.smith_form()
    if isinstance(smith_raw, tuple) and len(smith_raw) == 3:
        smith, left, right = smith_raw
        if left.det() not in (1, -1) or right.det() not in (1, -1) or left * mat * right != smith:
            raise SageRequestError("Sage Smith transformations failed the unimodular identity check.")
        smith_transform = {"status": "verified", "left": [[str(x) for x in row] for row in left.rows()],
            "right": [[str(x) for x in row] for row in right.rows()]}
    else:
        smith = smith_raw
        smith_transform = {"status": "unavailable", "reason": "Sage did not return Smith transformation matrices."}
    if smith.nrows() != mat.nrows() or smith.ncols() != mat.ncols():
        raise SageRequestError("Sage Smith form has an unexpected shape.")
    diagonal = [smith[i, i] for i in range(min(mat.nrows(), mat.ncols()))]
    nonzero = [entry for entry in diagonal if entry != 0]
    if any(entry < 0 for entry in diagonal) or any(nonzero[i + 1] % nonzero[i] != 0
            for i in range(len(nonzero) - 1)) or len(nonzero) != mat.rank():
        raise SageRequestError("Sage Smith form violates nonnegative invariant-factor divisibility or rank.")
    if any(smith[i, j] != 0 for i in range(mat.nrows()) for j in range(mat.ncols()) if i != j):
        raise SageRequestError("Sage Smith form is not diagonal.")
    try:
        hermite_raw = mat.hermite_form(transformation=True)
    except (TypeError, NotImplementedError):
        hermite_raw = mat.hermite_form()
    if isinstance(hermite_raw, tuple) and len(hermite_raw) == 2:
        hermite, hermite_left = hermite_raw
        if hermite_left.det() not in (1, -1) or hermite_left * mat != hermite:
            raise SageRequestError("Sage Hermite transformation failed the unimodular identity check.")
        hermite_transform = {"status": "verified", "left": [[str(x) for x in row] for row in hermite_left.rows()]}
    else:
        hermite = hermite_raw
        hermite_transform = {"status": "unavailable", "reason": "Sage did not return a Hermite row transformation."}
    if hermite.nrows() != mat.nrows() or hermite.ncols() != mat.ncols():
        raise SageRequestError("Sage Hermite form has an unexpected shape.")
    result = {
        "format": "math3d.sage-integer-matrix-forms-result", "schemaVersion": 1,
        "coefficientDomain": "ZZ", "sourceMatrix": rows,
        "inputShape": [mat.nrows(), mat.ncols()], "rank": len(nonzero),
        "smith": {"form": [[str(x) for x in row] for row in smith.rows()],
            "diagonal": [str(x) for x in diagonal], "transformations": smith_transform},
        "hermite": {"form": [[str(x) for x in row] for row in hermite.rows()],
            "transformation": hermite_transform},
        "cokernel": {"freeRank": mat.nrows() - len(nonzero),
            "torsionOrders": [str(x) for x in nonzero if x > 1]},
    }
    return _success(operation, result, latex(smith))


def _module_invariant_factors(operation, params):
    required = {"format", "schemaVersion", "projectId", "target", "targetHash", "baseRing",
        "baseRingHash", "ambientRank", "relationRank", "matrix"}
    if set(params) != required or params.get("format") != "math3d.sage-module-invariant-factors" or \
            type(params.get("schemaVersion")) is not int or params["schemaVersion"] != 1:
        raise SageRequestError("Module invariant factors require the versioned pinned ZZ presentation.")
    n, m, rows = params["ambientRank"], params["relationRank"], params["matrix"]
    canonical = re.compile(r"^(?:0|-?[1-9][0-9]{0,17})$")
    if type(n) is not int or not 1 <= n <= 6 or type(m) is not int or not 0 <= m <= 6 or \
            not isinstance(rows, list) or len(rows) != n or any(not isinstance(row, list) or
            len(row) != m or any(not isinstance(entry, str) or not canonical.fullmatch(entry)
                for entry in row) for row in rows):
        raise SageRequestError("ZZ module relation matrix must have bounded canonical integer rows.")
    if not all(isinstance(params[key], str) and params[key] for key in ("projectId", "targetHash", "baseRingHash")) or \
            any(not isinstance(params[key], dict) or set(params[key]) != {"objectId", "revision"} or
                not isinstance(params[key]["objectId"], str) or type(params[key]["revision"]) is not int or
                params[key]["revision"] < 1 for key in ("target", "baseRing")):
        raise SageRequestError("Module and ZZ parent revisions must be pinned.")
    if m == 0:
        result = {"format": "math3d.sage-module-invariant-factors-result", "schemaVersion": 1,
            "coefficientDomain": "ZZ", "freeRank": n, "torsionOrders": [], "smith": None}
        return _success(operation, result)
    mat = matrix(ZZ, [[ZZ(entry) for entry in row] for row in rows])
    smith_raw = mat.smith_form()
    if not isinstance(smith_raw, tuple) or len(smith_raw) != 3:
        raise SageRequestError("This Sage runtime did not return Smith transformation witnesses.")
    smith, left, right = smith_raw
    if left.det() not in (1, -1) or right.det() not in (1, -1) or left * mat * right != smith:
        raise SageRequestError("Smith transformations failed U·A·V=D with unimodular U and V.")
    diagonal = [smith[i, i] for i in range(min(n, m))]
    nonzero = [entry for entry in diagonal if entry != 0]
    if any(entry < 0 for entry in diagonal) or any(nonzero[i + 1] % nonzero[i] != 0
            for i in range(len(nonzero) - 1)) or any(smith[i, j] != 0 for i in range(n)
                for j in range(m) if i != j):
        raise SageRequestError("Smith diagonal violates invariant-factor divisibility.")
    result = {"format": "math3d.sage-module-invariant-factors-result", "schemaVersion": 1,
        "coefficientDomain": "ZZ", "freeRank": n - len(nonzero),
        "torsionOrders": [str(entry) for entry in nonzero if entry > 1],
        "smith": {"form": [[str(x) for x in row] for row in smith.rows()],
            "diagonal": [str(x) for x in diagonal], "transformations": {"status": "verified",
                "left": [[str(x) for x in row] for row in left.rows()],
                "right": [[str(x) for x in row] for row in right.rows()]}}}
    return _success(operation, result, latex(smith))


def _chain_homology(operation, params):
    required = {"format", "schemaVersion", "projectId", "target", "targetHash", "definition",
        "dimensions", "boundary1", "boundary2"}
    if set(params) != required or params.get("format") != "math3d.sage-chain-homology" or \
            type(params.get("schemaVersion")) is not int or params["schemaVersion"] != 1:
        raise SageRequestError("Chain homology requires the versioned pinned ZZ schema.")
    dims = params["dimensions"]
    if not isinstance(dims, list) or len(dims) != 3 or any(type(n) is not int or not 1 <= n <= 6 for n in dims):
        raise SageRequestError("Chain groups C0, C1, C2 require ranks 1 to 6.")
    n0, n1, n2 = dims
    canonical = re.compile(r"^(?:0|-?[1-9][0-9]{0,17})$")
    def checked_matrix(value, rows, columns):
        if not isinstance(value, list) or len(value) != rows or any(not isinstance(row, list) or
                len(row) != columns or any(not isinstance(entry, str) or not canonical.fullmatch(entry)
                    for entry in row) for row in value):
            raise SageRequestError("Chain boundary matrices require exact bounded ZZ entries and compatible dimensions.")
        return matrix(ZZ, [[ZZ(entry) for entry in row] for row in value])
    if not isinstance(params["projectId"], str) or not params["projectId"] or \
            not isinstance(params["targetHash"], str) or not params["targetHash"] or \
            not isinstance(params["definition"], dict) or params["definition"].get("kind") != "chain-complex" or \
            not isinstance(params["target"], dict):
        raise SageRequestError("Chain object and revisions must be pinned.")
    d1 = checked_matrix(params["boundary1"], n0, n1)
    d2 = checked_matrix(params["boundary2"], n1, n2)
    if not (d1 * d2).is_zero():
        raise SageRequestError("Exact chain condition d1*d2 = 0 failed.")
    def smith_witness(mat):
        raw = mat.smith_form()
        if not isinstance(raw, tuple) or len(raw) != 3:
            raise SageRequestError("This Sage runtime did not return Smith transformation witnesses.")
        form, left, right = raw
        if left.det() not in (1, -1) or right.det() not in (1, -1) or left * mat * right != form:
            raise SageRequestError("Smith transformation identity failed.")
        diagonal = [form[i, i] for i in range(min(mat.nrows(), mat.ncols()))]
        nonzero = [entry for entry in diagonal if entry != 0]
        if any(entry < 0 for entry in diagonal) or any(nonzero[i + 1] % nonzero[i] != 0
                for i in range(len(nonzero) - 1)):
            raise SageRequestError("Smith invariant-factor divisibility failed.")
        return {"form": [[str(x) for x in row] for row in form.rows()],
            "diagonal": [str(x) for x in diagonal], "transformations": {"status": "verified",
                "left": [[str(x) for x in row] for row in left.rows()],
                "right": [[str(x) for x in row] for row in right.rows()]}}, right
    d1_smith, right = smith_witness(d1)
    inverse = right.inverse()
    if right * inverse != identity_matrix(ZZ, n1) or inverse * right != identity_matrix(ZZ, n1):
        raise SageRequestError("Smith kernel basis inverse failed.")
    r1 = d1.rank()
    transformed = inverse * d2
    if any(transformed[i, j] != 0 for i in range(r1) for j in range(n2)):
        raise SageRequestError("d2 is not in the kernel of d1.")
    k = n1 - r1
    restricted = matrix(ZZ, [[transformed[i, j] for j in range(n2)] for i in range(r1, n1)]) if k else None
    restricted_smith, _ = smith_witness(restricted) if restricted is not None else (None, None)
    r2 = restricted.rank() if restricted is not None else 0
    def torsion(smith):
        return [entry for entry in smith["diagonal"] if int(entry) > 1]
    groups = [{"degree": 0, "freeRank": n0 - r1, "torsionOrders": torsion(d1_smith)},
        {"degree": 1, "freeRank": k - r2, "torsionOrders": torsion(restricted_smith) if restricted_smith else []},
        {"degree": 2, "freeRank": n2 - r2, "torsionOrders": []}]
    result = {"format": "math3d.sage-chain-homology-result", "schemaVersion": 1,
        "coefficientDomain": "ZZ", "dimensions": dims, "boundary1Smith": d1_smith,
        "inverseRight": [[str(x) for x in row] for row in inverse.rows()],
        "restrictedBoundary2Smith": restricted_smith, "groups": groups}
    return _success(operation, result)


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


def _polynomial_dossier(operation, params):
    if set(params) != {"polynomial", "variables"}:
        raise SageRequestError("Polynomial dossier requires exactly polynomial and variables.")
    variables = params["variables"]
    if not isinstance(variables, list) or len(variables) != 1 or not isinstance(variables[0], str):
        raise SageRequestError("Polynomial dossier requires one saved QQ polynomial variable.")
    variable = _validate_name(variables[0])
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", variable):
        raise SageRequestError("Polynomial dossier variable must match the saved algebra object schema.")
    expression = _validate_expression(params["polynomial"])
    if not re.fullmatch(r"[A-Za-z0-9_+\-*/^()\s]+", expression):
        raise SageRequestError("Polynomial dossier contains unsupported syntax.")
    if any(token != variable for token in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", expression)):
        raise SageRequestError("Polynomial dossier uses a variable outside the selected ring.")
    if any(len(token) > 18 for token in re.findall(r"[0-9]+", expression)) or any(
        int(power) > 16 for power in re.findall(r"\^\s*([0-9]+)", expression)
    ) or "**" in expression or re.search(r"\^\s*(?:[^0-9\s]|[0-9]+\s*\^)", expression):
        raise SageRequestError("Polynomial dossier has an oversized or unsupported exponent or coefficient.")
    ring = PolynomialRing(QQ, variable)
    try:
        poly = ring(expression)
    except (TypeError, ValueError, ArithmeticError) as exc:
        raise SageRequestError("Polynomial dossier input is not a QQ polynomial.") from exc
    if poly.is_zero():
        raise SageRequestError("Polynomial dossier requires a nonzero polynomial.")
    if poly.degree() > 16 or any(abs(coefficient.numerator()).nbits() > 256 or
        coefficient.denominator().nbits() > 256 for coefficient in poly.list()):
        raise SageRequestError("Polynomial dossier exceeds the degree or coefficient budget.")
    factorization = poly.factor()
    square_free = poly.squarefree_decomposition()
    content = gcd(poly.list())
    derivative = poly.derivative()
    result = {
        "schemaVersion": 1,
        "coefficientDomain": "QQ",
        "variable": variable,
        "sourcePolynomial": expression,
        "polynomial": str(poly),
        "degree": int(poly.degree()),
        "leadingCoefficient": str(poly.leading_coefficient()),
        "constantCoefficient": str(poly[0]),
        "content": str(content),
        "primitivePart": str(poly / content),
        "derivative": str(derivative),
        "derivativeGcd": str(gcd(poly, derivative)),
        "squareFree": bool(poly.is_squarefree()),
        "squareFreeDecomposition": {"unit": str(square_free.unit()), "factors": [
            {"polynomial": str(part), "multiplicity": int(multiplicity)}
            for part, multiplicity in sorted(square_free, key=lambda item: str(item[0]))]},
        "factorization": {"unit": str(factorization.unit()), "factors": [
            {"polynomial": str(part), "multiplicity": int(multiplicity)}
            for part, multiplicity in sorted(factorization, key=lambda item: str(item[0]))]},
        "irreducibleOverQQ": bool(poly.degree() > 0 and poly.is_irreducible()),
        "discriminant": str(poly.discriminant()) if poly.degree() >= 2 else None,
        "rationalRoots": [{"value": str(root), "multiplicity": int(multiplicity)}
            for root, multiplicity in sorted(poly.roots(ring=QQ), key=lambda item: item[0])],
    }
    return _success(operation, result, latex(poly))


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


IDEAL_BUDGETS = {
    "standard": {"format": "math3d.sage-ideal-budget", "schemaVersion": 1, "profile": "standard",
        "maxVariables": 2, "maxGenerators": 3, "maxDegree": 8, "maxTermsPerPolynomial": 48,
        "maxResultBytes": 16384, "wallTimeMs": 15000},
    "expanded": {"format": "math3d.sage-ideal-budget", "schemaVersion": 1, "profile": "expanded",
        "maxVariables": 3, "maxGenerators": 6, "maxDegree": 16, "maxTermsPerPolynomial": 128,
        "maxResultBytes": 65536, "wallTimeMs": 30000},
}


def _ideal_operation(operation, params):
    common = {"format", "schemaVersion", "target", "targetHash", "ideal", "idealHash",
        "ambientRing", "ambientHash", "variables", "monomialOrder", "generators"}
    extra = {"sage.ideal.groebner": set(), "sage.ideal.eliminate": {"eliminate"},
        "sage.ideal.membership": {"polynomial"}, "sage.ideal.quotientDimension": set(),
        "sage.ideal.syzygies": set(), "sage.ideal.hilbertSeries": set()}[operation]
    _require_exact_fields(params, common | extra | ({"budget"} if "budget" in params else set()), "ideal request")
    if params["format"] != "math3d.sage-ideal-operation" or type(params["schemaVersion"]) is not int or params["schemaVersion"] != 1:
        raise SageRequestError("Ideal request requires the versioned exact schema.")
    budget = params.get("budget")
    if "budget" in params:
        _require_exact_fields(budget, IDEAL_BUDGETS["standard"].keys(), "ideal budget")
        expected = IDEAL_BUDGETS.get(budget.get("profile")) if isinstance(budget.get("profile"), str) else None
        if expected is None or budget != expected or type(budget["schemaVersion"]) is not int:
            raise SageRequestError("Ideal budget must match a supported bounded profile exactly.")
    variables = params["variables"]
    if not isinstance(variables, list) or not 1 <= len(variables) <= 3 or \
            any(not isinstance(item, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", item) for item in variables) or \
            len(set(variables)) != len(variables):
        raise SageRequestError("Ideal operations require one to three distinct ambient variables.")
    order = params["monomialOrder"]
    if order not in ("lex", "deglex", "degrevlex"):
        raise SageRequestError("Unsupported ideal monomial order.")
    generators = params["generators"]
    if not isinstance(generators, list) or not 1 <= len(generators) <= 6 or len(set(generators)) != len(generators):
        raise SageRequestError("Ideal operations require one to six distinct generators.")
    if budget is not None and (len(variables) > budget["maxVariables"] or len(generators) > budget["maxGenerators"]):
        raise SageRequestError(f"{budget['profile']} ideal budget exceeded: variables or generators.")
    if operation in ("sage.ideal.syzygies", "sage.ideal.hilbertSeries") and \
            (len(variables) > 2 or len(generators) > 3):
        raise SageRequestError("Advanced ideal operations require at most two variables and three generators.")
    ring = PolynomialRing(QQ, variables, order=order)
    def polynomial(source):
        if not isinstance(source, str) or len(source) > 128 or "**" in source or \
                not re.fullmatch(r"[A-Za-z0-9_()+*^/\-]+", source) or \
                any(token not in variables for token in re.findall(r"[A-Za-z][A-Za-z0-9_]*", source)) or \
                any(len(number) > 18 for number in re.findall(r"[0-9]+", source)) or \
                any(int(power) > 16 for power in re.findall(r"\^([0-9]+)", source)):
            raise SageRequestError("Invalid or unbounded polynomial in the pinned ideal ring.")
        try:
            value = ring(source)
        except (TypeError, ValueError, ArithmeticError) as error:
            raise SageRequestError("Polynomial does not belong to the pinned ideal ring.") from error
        if value.total_degree() > (budget["maxDegree"] if budget else 16) or \
                len(value.monomials()) > (budget["maxTermsPerPolynomial"] if budget else 128):
            raise SageRequestError("Ideal polynomial degree or term budget exceeded.")
        return value
    polys = [polynomial(item) for item in generators]
    ideal = ring.ideal(polys)
    shared = {"format": "math3d.sage-ideal-result", "schemaVersion": 1,
        "target": params["target"], "targetHash": params["targetHash"], "idealHash": params["idealHash"]}
    if operation == "sage.ideal.syzygies":
        module = ideal.syzygy_module()
        rows = [[str(value) for value in row] for row in module.rows()]
        if module.ncols() != len(polys) or any(sum(row[index] * polys[index]
                for index in range(len(polys))) != 0 for row in module.rows()):
            raise SageRequestError("Sage syzygy rows do not annihilate the pinned generators.")
        result = {**shared, "syzygies": rows, "generatorCount": len(polys)}
    elif operation == "sage.ideal.hilbertSeries":
        if order == "lex" or not ideal.is_homogeneous():
            raise SageRequestError("Hilbert series requires a graded monomial order and a homogeneous ideal.")
        result = {**shared, "series": str(ideal.hilbert_series()),
            "numerator": str(ideal.hilbert_numerator()), "dimension": int(ideal.dimension()),
            "grading": "standard"}
    elif operation == "sage.ideal.quotientDimension":
        quotient = ring.quotient(ideal)
        result = {**shared, "dimension": int(ideal.dimension()), "quotientPresentation": str(quotient)}
    elif operation == "sage.ideal.eliminate":
        eliminate = params["eliminate"]
        if not isinstance(eliminate, list) or not 0 < len(eliminate) < len(variables) or \
                len(set(eliminate)) != len(eliminate) or any(item not in variables for item in eliminate):
            raise SageRequestError("Eliminate a proper nonempty subset of ambient variables.")
        basis = ideal.elimination_ideal([ring(item) for item in eliminate]).groebner_basis()
        result = {**shared, "basis": [str(item) for item in basis], "eliminate": eliminate}
    else:
        basis = ideal.groebner_basis()
        result = {**shared, "basis": [str(item) for item in basis]}
        if operation == "sage.ideal.membership":
            source = params["polynomial"]
            normal = ideal.reduce(polynomial(source))
            result.update(polynomial=source, member=bool(normal == 0), normalForm=str(normal))
    if "basis" in result and (len(result["basis"]) > 128 or any(len(item) > 1024 for item in result["basis"])):
        raise SageRequestError("Ideal basis exceeds the bounded output budget.")
    if "normalForm" in result and len(result["normalForm"]) > 1024:
        raise SageRequestError("Ideal normal form exceeds the bounded output budget.")
    if "syzygies" in result and (len(result["syzygies"]) > 128 or
            any(len(entry) > 1024 for row in result["syzygies"] for entry in row)):
        raise SageRequestError("Syzygy output exceeds the bounded result budget.")
    if "series" in result and (len(result["series"]) > 1024 or len(result["numerator"]) > 1024):
        raise SageRequestError("Hilbert output exceeds the bounded result budget.")
    if len(json.dumps(result, ensure_ascii=False).encode("utf-8")) > (budget["maxResultBytes"] if budget else 65536):
        raise SageRequestError("Ideal result exceeds the bounded output budget.")
    return _success(operation, result)


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
    # HomologyGroup is additive: its Smith invariant factors include 0 for Z.
    orders = [abs(ZZ(order)) for order in group.invariants()]
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


def _complex_ast(node, z, depth=0):
    if depth > 64 or not isinstance(node, dict):
        raise SageRequestError("Complex AST is invalid or too deep.")
    node_type = node.get("type")
    if node_type == "number" and set(node) == {"type", "value"}:
        value = node.get("value")
        if type(value) not in (int, float) or not math.isfinite(value):
            raise SageRequestError("Complex AST number must be finite.")
        fraction = Fraction(str(value))
        return QQ(fraction.numerator) / QQ(fraction.denominator)
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
    if type(re_value) not in (int, float) or type(im_value) not in (int, float) or not math.isfinite(re_value) or not math.isfinite(im_value):
        raise SageRequestError("Complex point coordinates must be finite numbers.")
    real, imaginary = Fraction(str(re_value)), Fraction(str(im_value))
    return QQ(real.numerator) / QQ(real.denominator) + I * QQ(imaginary.numerator) / QQ(imaginary.denominator)


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
    if params.get("assumptions") != []:
        raise SageRequestError("This exact adapter does not qualify additional assumptions.")
    z = var("z")
    expr = _complex_ast(params.get("ast"), z).simplify_full()
    point = _complex_point(params.get("point")) if params.get("point") is not None else None
    if requested in {"limit", "residue", "series"} and point is None:
        raise SageRequestError("A finite expansion/evaluation point is required.")
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
        if type(order) is not int or order < 1 or order > 32:
            raise SageRequestError("Series order must be an integer from 1 to 32.")
        value = expr.series(z == point, order)
        coefficients = value.coefficients()
        if any(power not in ZZ or z in SR(coefficient).variables() for coefficient, power in coefficients):
            raise SageRequestError("Fractional series exponents are outside the qualified integer-power output.")
        series_terms = [{"power": int(power), "coefficient": str(coefficient)} for coefficient, power in coefficients]
        if any(term["power"] < -32 or term["power"] > 32 for term in series_terms):
            raise SageRequestError("Series powers exceed the reviewed output bounds.")
    else:
        denominator = expr.denominator().factor()
        try:
            degree = int(denominator.polynomial(ring=PolynomialRing(SR, str(z))).degree()) if denominator != 1 else 0
        except (TypeError, ValueError):
            raise SageRequestError("Pole enumeration requires a polynomial denominator.")
        if degree < 0 or degree > 64:
            raise SageRequestError("Pole enumeration exceeds the reviewed degree limit.")
        roots = solve(denominator == 0, z, solution_dict=True) if denominator != 1 else []
        for root in roots:
            root_value = root.get(z)
            if root_value is not None:
                multiplicity = 1
                while multiplicity <= degree and denominator.derivative(z, multiplicity).subs(z == root_value).simplify_full() == 0:
                    multiplicity += 1
                points.append({"value": str(root_value), "order": multiplicity, "classification": "pole"})
        if sum(item["order"] for item in points) != degree:
            raise SageRequestError("Sage did not resolve the complete polynomial pole set.")
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



def _ideal_capability_available(method):
    try:
        probe_ring = PolynomialRing(QQ, ["x", "y"], order="degrevlex")
        x, y = probe_ring.gens()
        getattr(probe_ring.ideal([x, y]), method)()
        return True
    except Exception:
        return False


OPERATIONS = {
    "sage.algebra.reconstruct": lambda op, params: _success(op, reconstruct_algebra(params)),
    "sage.finiteField.explore": lambda op, params: _success(op, explore_finite_field(params)),
    "sage.numberTheory.padic": lambda op, params: _success(op, run_padic_workspace(params)),
    "sage.algebra.inspectDomains": lambda op, params: _success(op, inspect_algebra_domains(params)),
    "sage.numberField.elementDossier": lambda op, params: _success(op, run_number_field_operation(op, params)),
    "sage.numberField.primeDecomposition": lambda op, params: _success(op, run_number_field_operation(op, params)),
    "sage.galois.analyze": lambda op, params: _success(op, analyze_galois(params)),
    "sage.symbolic.simplify": lambda op, params: _symbolic_unary(op, params, lambda expr: expr.simplify_full()),
    "sage.symbolic.factor": lambda op, params: _symbolic_unary(op, params, lambda expr: expr.factor()),
    "sage.symbolic.expand": lambda op, params: _symbolic_unary(op, params, lambda expr: expr.expand()),
    "sage.symbolic.solve": _symbolic_solve,
    "sage.symbolic.gradient": _surface_calculus,
    "sage.symbolic.hessian": _surface_calculus,
    "sage.symbolic.singularities": _surface_calculus,
    "sage.matrix.eigen_exact": _matrix_eigen_exact,
    "sage.matrix.charpoly": _matrix_charpoly,
    "sage.matrix.linear_dossier": _matrix_linear_dossier,
    "sage.matrix.integer_forms": _integer_matrix_forms,
    "sage.module.invariantFactors": _module_invariant_factors,
    "sage.chain.homology": _chain_homology,
    "sage.polynomial.roots_exact": _polynomial_roots_exact,
    "sage.polynomial.factor": _polynomial_factor,
    "sage.polynomial.dossier": _polynomial_dossier,
    "sage.groebner.compute": _groebner_compute,
    "sage.ideal.groebner": _ideal_operation,
    "sage.ideal.eliminate": _ideal_operation,
    "sage.ideal.membership": _ideal_operation,
    "sage.ideal.quotientDimension": _ideal_operation,
    "sage.numberTheory.gcd": _number_theory_gcd,
    "sage.numberTheory.modInverse": _number_theory_mod_inverse,
    "sage.topology.integer_homology": _topology_integer_homology,
    "sage.complex.analyze": _complex_analysis,
}
if _ideal_capability_available("syzygy_module"):
    OPERATIONS["sage.ideal.syzygies"] = _ideal_operation
if _ideal_capability_available("is_homogeneous") and _ideal_capability_available("hilbert_series") and \
        _ideal_capability_available("hilbert_numerator"):
    OPERATIONS["sage.ideal.hilbertSeries"] = _ideal_operation
if group_capability_available():
    OPERATIONS["sage.group.dossier"] = lambda op, params: _success(op, analyze_finite_group(params))


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
