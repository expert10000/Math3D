"""Bounded number-field operations over the pinned D01 quadratic object snapshot."""

import re

from sage.all import ZZ

if __package__:
    from .algebra_reconstruction import _build_algebra, _validated_objects
else:
    from algebra_reconstruction import _build_algebra, _validated_objects


FORMAT = "math3d.sage-number-field-operation"
RESULT_FORMAT = "math3d.sage-number-field-result"
ELEMENT = "sage.numberField.elementDossier"
PRIMES = "sage.numberField.primeDecomposition"


def _image(constant, coefficient, root):
    u, v = int(constant), int(coefficient)
    if v == 0:
        return constant
    term = root if v == 1 else f"-({root})" if v == -1 else f"{v}*({root})"
    return term if u == 0 else f"{constant} - {term[1:]}" if term.startswith("-") else f"{constant} + {term}"


def _generator_images(coefficients):
    c, b = int(coefficients[0]), int(coefficients[1])
    discriminant = b * b - 4 * c
    remaining = abs(discriminant)
    radicand = -1 if discriminant < 0 else 1
    square_factor = 1
    factor = 2
    while factor * factor <= remaining:
        exponent = 0
        while remaining % factor == 0:
            remaining //= factor
            exponent += 1
        if exponent % 2:
            radicand *= factor
        square_factor *= factor ** (exponent // 2)
        factor += 1
    if remaining > 1:
        radicand *= remaining
    root = f"√({radicand})" if radicand < 0 else f"√{radicand}"
    if b == 0 and square_factor == 2:
        return [root, f"-{root}"]
    return [f"({-b} + {square_factor}{root})/2", f"({-b} - {square_factor}{root})/2"]


def run_number_field_operation(operation, params):
    if type(params) is not dict or params.get("format") != FORMAT or type(params.get("schemaVersion")) is not int or \
            params["schemaVersion"] != 1:
        raise ValueError("Invalid number-field operation envelope.")
    expected = {"format", "schemaVersion", "field", "element" if operation == ELEMENT else "prime"}
    if set(params) != expected or type(params["field"]) is not dict:
        raise ValueError("Number-field operation fields do not match its typed envelope.")
    target, records = _validated_objects(params["field"])
    record = records[-1]
    definition = record["definition"]
    if definition["kind"] != "number-field":
        raise ValueError("Number-field operation requires a pinned number-field object.")
    parent = definition["baseField"]
    base = next((item for item in records if (item["id"], item["revision"]) ==
        (parent["objectId"], parent["revision"])), None)
    if base is None or base["kind"] != "rational-field":
        raise ValueError("Number field requires a pinned QQ base field.")
    if operation == ELEMENT:
        element = params["element"]
        if type(element) is not list or len(element) != 2 or any(type(item) is not str or
                not re.fullmatch(r"(?:0|-?[1-9][0-9]{0,3})", item) or abs(int(item)) > 4096 for item in element):
            raise ValueError("Element requires two bounded canonical integer coefficients.")
    elif operation == PRIMES:
        prime = params["prime"]
        if type(prime) is not int or not 2 <= prime <= 97 or not ZZ(prime).is_prime():
            raise ValueError("Prime decomposition requires a prime from 2 to 97.")
    else:
        raise ValueError("Unsupported number-field operation.")
    field = _build_algebra(records)[target]
    result = {"format": RESULT_FORMAT, "schemaVersion": 1, "operation": operation,
        "target": params["field"]["target"], "definitionHash": record["contentHash"]}
    if operation == ELEMENT:
        generator = field.gen()
        value = ZZ(element[0]) + ZZ(element[1]) * generator
        roots = _generator_images(definition["definingPolynomial"])
        result.update({"element": element, "norm": str(value.norm()), "trace": str(value.trace()),
            "baseDegree": 1, "relativeDegree": int(field.degree()), "absoluteDegree": int(field.absolute_degree()),
            "basis": ["1", str(generator)], "embeddings": [
                {"index": index, "generatorImage": root,
                    "elementImage": _image(element[0], element[1], root)}
                for index, root in enumerate(roots)]})
    else:
        factors = [{"ideal": str(ideal), "ramificationIndex": int(exponent),
            "residueDegree": int(ideal.residue_class_degree()), "norm": str(ideal.norm())}
            for ideal, exponent in field.ideal(prime).factor()]
        factors.sort(key=lambda item: (item["ramificationIndex"], item["residueDegree"], item["ideal"]))
        splitting = "split" if len(factors) == 2 else "ramified" if factors[0]["ramificationIndex"] == 2 else "inert"
        result.update({"prime": prime, "splitting": splitting, "factors": factors,
            "degreeCheck": sum(item["ramificationIndex"] * item["residueDegree"] for item in factors)})
    return result
