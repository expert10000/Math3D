"""Bounded exact explorer for a pinned canonical Sage finite field."""

import itertools

if __package__:
    from .algebra_reconstruction import _build_algebra, _validated_objects
else:
    from algebra_reconstruction import _build_algebra, _validated_objects


FORMAT = "math3d.sage-finite-field-explorer"
RESULT_FORMAT = "math3d.sage-finite-field-explorer-result"
MAX_ORDER = 64
MAX_TABLE_ORDER = 16


def explore_finite_field(params):
    if type(params) is not dict or set(params) != {"format", "schemaVersion", "algebra", "element"} or \
            params["format"] != FORMAT or type(params["schemaVersion"]) is not int or params["schemaVersion"] != 1:
        raise ValueError("Finite-field explorer requires a versioned pinned request.")
    algebra = params["algebra"]
    target, records = _validated_objects(algebra)
    record = records[-1]
    definition = record["definition"]
    if record["kind"] != "finite-field":
        raise ValueError("Finite-field explorer requires a saved finite-field target.")
    p, degree = definition["characteristic"], definition["degree"]
    order = p ** degree
    if order > MAX_ORDER:
        raise ValueError("Finite-field explorer supports at most 64 elements.")
    coefficients = params["element"]
    if type(coefficients) is not list or len(coefficients) != degree or any(
            type(coefficient) is not int or not 0 <= coefficient < p for coefficient in coefficients):
        raise ValueError("Element coefficients must be one canonical base-p vector of the field degree.")
    field = _build_algebra(records)[target]
    generator = field.gen()

    def from_vector(vector):
        return sum((field(coefficient) * generator ** index for index, coefficient in enumerate(vector)), field(0))

    def vector(element):
        values = [int(coefficient) for coefficient in element.polynomial().list()]
        return values + [0] * (degree - len(values))

    vectors = [list(item) for item in itertools.product(range(p), repeat=degree)]
    elements = [from_vector(item) for item in vectors]
    index = {tuple(item): position for position, item in enumerate(vectors)}
    selected = from_vector(coefficients)
    orbit = []
    current = selected
    for _ in range(degree):
        coordinate = vector(current)
        if coordinate in orbit:
            break
        orbit.append(coordinate)
        current = current ** p
    if current != selected or degree % len(orbit):
        raise ValueError("Frobenius orbit does not close within the field degree.")
    trace = sum((selected ** (p ** power) for power in range(degree)), field(0))
    norm = field(1)
    for power in range(degree):
        norm *= selected ** (p ** power)
    if trace.polynomial().degree() > 0 or norm.polynomial().degree() > 0:
        raise ValueError("Trace or norm did not land in the prime field.")
    multiplicative_order = int(selected.multiplicative_order()) if selected else None
    primitive = multiplicative_order == order - 1
    primitive_elements = [vectors[position] for position, element in enumerate(elements)
        if element and element.multiplicative_order() == order - 1]
    table = {"status": "complete", "cells": [[index[tuple(vector(left * right))] for right in elements]
        for left in elements]} if order <= MAX_TABLE_ORDER else {
        "status": "unavailable", "reason": "Multiplication table is limited to fields of at most 16 elements."}
    return {
        "format": RESULT_FORMAT, "schemaVersion": 1,
        "target": algebra["target"], "targetHash": record["contentHash"],
        "characteristic": p, "degree": degree, "order": order,
        "generator": definition["generator"], "construction": "canonical",
        "definingPolynomial": None if degree == 1 else [int(item) for item in field.modulus().list()],
        "selected": {"coefficients": coefficients, "text": str(selected),
            "frobeniusOrbit": orbit, "trace": str(int(trace)), "norm": str(int(norm)),
            "minimalPolynomial": [int(item) for item in selected.minpoly().list()],
            "multiplicativeOrder": multiplicative_order, "primitive": primitive},
        "elements": [{"coefficients": item, "text": str(element)}
            for item, element in zip(vectors, elements)],
        "primitiveElements": primitive_elements,
        "multiplicationTable": table,
    }
