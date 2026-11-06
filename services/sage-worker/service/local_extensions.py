"""Quadratic global prime decomposition and bounded finite-precision Qp local models."""

from sage.all import Qp, PolynomialRing, ZZ

if __package__:
    from .algebra_reconstruction import _build_algebra, _validated_objects
else:
    from algebra_reconstruction import _build_algebra, _validated_objects


FORMAT = "math3d.sage-local-extension"
RESULT_FORMAT = "math3d.sage-local-extension-result"


def run_local_extension(params):
    if type(params) is not dict or set(params) != {"format", "schemaVersion", "field", "prime", "precision"} or \
            params["format"] != FORMAT or type(params["schemaVersion"]) is not int or params["schemaVersion"] != 1:
        raise ValueError("Local extension requires a versioned pinned number-field request.")
    prime, precision = params["prime"], params["precision"]
    if type(prime) is not int or not 3 <= prime <= 31 or prime % 2 == 0 or not ZZ(prime).is_prime() or \
            type(precision) is not int or not 2 <= precision <= 16:
        raise ValueError("Local extension requires an odd prime at most 31 and precision 2–16.")
    target, records = _validated_objects(params["field"])
    record = records[-1]
    definition = record["definition"]
    if record["kind"] != "number-field" or len(definition["definingPolynomial"]) != 3:
        raise ValueError("Local extension requires a pinned quadratic number field.")
    parent = definition["baseField"]
    if not any(item["id"] == parent["objectId"] and item["revision"] == parent["revision"] and
            item["kind"] == "rational-field" for item in records):
        raise ValueError("Local extension requires a pinned QQ parent.")
    global_field = _build_algebra(records)[target]
    coefficients = [int(item) for item in definition["definingPolynomial"]]
    polynomial_discriminant = coefficients[1] ** 2 - 4 * coefficients[0]
    field_discriminant = int(global_field.discriminant())
    if field_discriminant == 0 or polynomial_discriminant % field_discriminant or \
            (polynomial_discriminant // field_discriminant) % prime == 0:
        raise ValueError("Local model requires a prime away from the defining power-basis index.")
    base = Qp(prime, prec=precision)
    ring = PolynomialRing(base, "t")
    polynomial = ring(coefficients)
    ideals = list(global_field.primes_above(prime))
    if not 1 <= len(ideals) <= 2:
        raise ValueError("Unexpected quadratic prime-ideal decomposition.")
    split = len(ideals) == 2
    roots = {}
    if split:
        for root, multiplicity in polynomial.roots():
            if multiplicity == 1 and int(root.precision_absolute()) >= precision:
                residue = int(root.lift()) % prime
                roots[residue] = root
        if len(roots) != 2:
            raise ValueError("Sage did not determine both split Qp roots to the requested precision.")
    else:
        try:
            extension = base.extension(polynomial, names=definition["generator"])
        except (ValueError, NotImplementedError, TypeError) as error:
            raise ValueError(f"Sage cannot construct this bounded local model: {error}") from error
        if extension.degree() != 2:
            raise ValueError("Local quadratic model has the wrong degree.")
    branches = []
    for ideal in ideals:
        e, f = int(ideal.ramification_index()), int(ideal.residue_class_degree())
        generator_residue = ideal.residue_field()(global_field.gen())
        if split:
            residue = int(generator_residue)
            root = roots.get(residue)
            if root is None:
                raise ValueError("Split local root does not match its prime-ideal residue map.")
            local = base
            root_residue = str(int(root.lift()) % (prime ** precision))
            root_precision = int(root.precision_absolute())
        else:
            local = extension
            root_residue = None
            root_precision = None
        if int(local.ramification_index()) != e or int(local.residue_field().cardinality()) != prime ** f or \
                int(local.uniformizer().valuation()) != 1 or int(local(prime).valuation()) != e:
            raise ValueError("Local model disagrees with the global prime-ideal ramification data.")
        branches.append({"ideal": str(ideal), "idealNorm": str(int(ideal.norm())),
            "ramificationIndex": e, "residueDegree": f, "localDegree": e * f,
            "residueOrder": prime ** f, "generatorResidue": str(generator_residue),
            "model": "base" if split else "quadratic-extension",
            "localField": str(local), "uniformizer": str(local.uniformizer()),
            "uniformizerValuation": 1, "basePrimeValuation": e,
            "rootResidue": root_residue, "rootPrecision": root_precision})
    branches.sort(key=lambda item: int(item["generatorResidue"]) if split else 0)
    splitting = "split" if split else "ramified" if branches[0]["ramificationIndex"] == 2 else "inert"
    if sum(item["ramificationIndex"] * item["residueDegree"] for item in branches) != 2:
        raise ValueError("Local degrees do not sum to the global degree.")
    return {"format": RESULT_FORMAT, "schemaVersion": 1,
        "target": params["field"]["target"], "targetHash": record["contentHash"],
        "prime": prime, "precision": precision, "fieldDiscriminant": str(field_discriminant),
        "polynomial": definition["definingPolynomial"], "splitting": splitting,
        "branches": branches, "degreeCheck": 2}
