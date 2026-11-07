"""Bounded exact Galois correspondence for a pinned QQ[x] polynomial."""

import re
from sage.all import QQ, ZZ, NumberField, PolynomialRing, DihedralGroup


def _input(params):
    if type(params) is not dict or set(params) != {"format", "schemaVersion", "projectId", "target",
            "targetHash", "coefficientField", "variable", "polynomial"} or \
            params["format"] != "math3d.sage-galois-analysis" or params["schemaVersion"] != 1:
        raise ValueError("Galois analysis requires the exact versioned QQ[x] request.")
    variable, expression = params["variable"], params["polynomial"]
    if type(variable) is not str or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,31}", variable) or \
            type(expression) is not str or not 1 <= len(expression) <= 120 or \
            not re.fullmatch(r"[A-Za-z0-9_+\-*/^()\s]+", expression) or "**" in expression or \
            re.search(r"\^\s*(?:\(|-|\+)", expression) or \
            any(token != variable for token in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", expression)) or \
            any(len(token) > 6 for token in re.findall(r"[0-9]+", expression)) or \
            any(int(power) > 4 for power in re.findall(r"\^\s*([0-9]+)", expression)):
        raise ValueError("Galois polynomial must use one bounded saved QQ[x] variable.")
    try:
        ring = PolynomialRing(QQ, variable)
        polynomial = ring(expression)
    except (TypeError, ValueError, ArithmeticError) as exc:
        raise ValueError("Galois input is not a QQ polynomial.") from exc
    if polynomial.degree() < 2 or polynomial.degree() > 4 or not polynomial.is_monic() or \
            any(coefficient not in ZZ or abs(coefficient) > 100
                for coefficient in polynomial.list()):
        raise ValueError("Galois analysis accepts monic integral polynomials of degree 2–4 with coefficients at most 100.")
    if not polynomial.is_squarefree() or not polynomial.is_irreducible():
        raise ValueError("Galois analysis requires a squarefree irreducible QQ polynomial.")
    return variable, expression, polynomial


def analyze_galois(params):
    variable, expression, polynomial = _input(params)
    root_group = polynomial.galois_group()
    if root_group.order() > 16:
        raise ValueError("Galois group order exceeds the bounded partial-lattice limit of sixteen.")
    group = NumberField(polynomial, "a").galois_group()
    splitting = group.splitting_field()
    order = int(group.order())
    if int(root_group.order()) != order or int(splitting.absolute_degree()) != order or int(group.degree()) != order:
        raise ValueError("Sage Galois order, regular action and splitting degree disagree.")
    elements = sorted(group.list(), key=lambda element: tuple(int(i) for i in element.tuple()))
    tuples = [tuple(int(i) for i in element.tuple()) for element in elements]
    indexes = {item: index for index, item in enumerate(tuples)}
    if tuples[0] != tuple(range(1, order + 1)) or len(indexes) != order:
        raise ValueError("Sage did not return a complete regular permutation action.")
    generators = [indexes[tuple(int(i) for i in element.tuple())] for element in group.gens()]
    raw_subgroups = []
    for subgroup in group.subgroups():
        members = sorted(indexes[tuple(int(i) for i in element.tuple())] for element in subgroup.list())
        raw_subgroups.append((members, subgroup))
    raw_subgroups.sort(key=lambda item: (len(item[0]), item[0]))
    if order <= 8 and len(raw_subgroups) > 16:
        raise ValueError("Galois subgroup count exceeds the complete-lattice limit of 16.")
    partial = order > 8
    omitted_count = 0
    if partial:
        # Keep the trivial and whole groups, plus a deterministic bounded sample.
        shown = min(8, len(raw_subgroups) - 1)
        omitted_count = len(raw_subgroups) - shown
        raw_subgroups = raw_subgroups[:shown - 1] + [raw_subgroups[-1]]
    subgroups = []
    for index, (members, subgroup) in enumerate(raw_subgroups):
        fixed, embedding = subgroup.fixed_field()
        fixed_degree = int(fixed.absolute_degree())
        if fixed_degree * len(members) != order:
            raise ValueError("Sage fixed-field degree does not equal the subgroup index.")
        if fixed is QQ:
            field = {"degree": 1, "polynomial": None, "generatorImage": None, "relationVerified": True}
        else:
            image = embedding(fixed.gen())
            verified = fixed.defining_polynomial()(image) == 0
            if not verified:
                raise ValueError("Sage fixed-field embedding does not satisfy its polynomial.")
            field = {"degree": fixed_degree, "polynomial": str(fixed.defining_polynomial()),
                "generatorImage": str(image), "relationVerified": True}
        subgroups.append({"id": f"H{index}", "members": members, "order": len(members),
            "normal": bool(subgroup.is_normal(group)), "fixedField": field})
    dihedral = order == 8 and bool(root_group.is_isomorphic(DihedralGroup(4)))
    result = {"format": "math3d.sage-galois-analysis-result", "schemaVersion": 1,
        "sourcePolynomial": expression, "variable": variable, "coefficientDomain": "QQ",
        "irreducible": True, "squareFree": True,
        "splittingField": {"degree": order, "definingPolynomial": str(splitting.defining_polynomial())},
        "group": {"order": order, "regularDegree": order,
            "transitiveId": f"{polynomial.degree()}T{root_group.transitive_number()}",
            "classification": "D4" if dihedral else "unclassified",
            "convention": "D4 = symmetries of a square, order 8" if dihedral else "",
            "solvable": bool(group.is_solvable()), "elements": [list(item) for item in tuples],
            "generators": generators},
        "subgroups": subgroups, "complete": not partial}
    if partial:
        result["partialReason"] = "Group order exceeds the reviewed complete-lattice bound of eight. Displayed edges are restricted to the saved subgroup sample."
        result["omittedCount"] = omitted_count
    return result
