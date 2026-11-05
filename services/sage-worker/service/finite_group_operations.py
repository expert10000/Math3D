"""Complete GAP-backed invariants for a pinned, small E01 group presentation."""

import re
from sage.all import PermutationGroup, Permutations, gap


def group_capability_available():
    try:
        return bool(re.fullmatch(r'"[0-9][A-Za-z0-9.+-]{0,39}"', str(gap.eval("GAPInfo.Version"))))
    except Exception:
        return False


def _input(params):
    if type(params) is not dict or set(params) != {"format", "schemaVersion", "projectId", "target",
            "targetHash", "definition"} or params["format"] != "math3d.sage-finite-group-operation" or \
            params["schemaVersion"] != 1 or type(params["projectId"]) is not str or \
            type(params["targetHash"]) is not str or type(params["target"]) is not dict or \
            set(params["target"]) != {"objectId", "revision"} or \
            type(params["target"]["objectId"]) is not str or \
            type(params["target"]["revision"]) is not int or params["target"]["revision"] < 1:
        raise ValueError("GAP operation requires a pinned versioned finite-group request.")
    definition = params["definition"]
    if type(definition) is not dict or definition.get("kind") != "finite-group":
        raise ValueError("Finite-group definition is missing.")
    if definition.get("representation") == "permutation":
        if set(definition) not in ({"kind", "representation", "degree", "generators", "relations"},
                {"kind", "representation", "degree", "generators", "relations", "source"}) or \
                type(definition["degree"]) is not int or not 2 <= definition["degree"] <= 8 or \
                type(definition["generators"]) is not list or not 1 <= len(definition["generators"]) <= 3 or \
                type(definition["relations"]) is not list or len(definition["relations"]) > 8:
            raise ValueError("Invalid bounded permutation-group definition.")
        degree = definition["degree"]
        generators = []
        names = set()
        for item in definition["generators"]:
            if type(item) is not dict or set(item) != {"name", "images"} or \
                    type(item["name"]) is not str or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,15}", item["name"]) or \
                    item["name"] in names or type(item["images"]) is not list or \
                    len(item["images"]) != degree or \
                    any(type(image) is not int for image in item["images"]) or \
                    sorted(item["images"]) != list(range(1, degree + 1)):
                raise ValueError("Invalid named permutation generator.")
            names.add(item["name"])
            generators.append(Permutations(degree)(item["images"]))
        for relation in definition["relations"]:
            if type(relation) is not dict or set(relation) != {"label", "word"} or \
                    type(relation["label"]) is not str or not 1 <= len(relation["label"]) <= 80 or \
                    type(relation["word"]) is not list or not 1 <= len(relation["word"]) <= 16:
                raise ValueError("Invalid group relation.")
            product = Permutations(degree)(list(range(1, degree + 1)))
            for term in relation["word"]:
                if type(term) is not dict or set(term) != {"generator", "exponent"} or \
                        term["generator"] not in names or type(term["exponent"]) is not int or \
                        term["exponent"] == 0 or abs(term["exponent"]) > 8:
                    raise ValueError("Invalid group relation word.")
                generator = generators[[item["name"] for item in definition["generators"]].index(term["generator"])]
                product *= generator ** term["exponent"]
            if product != Permutations(degree)(list(range(1, degree + 1))):
                raise ValueError("A saved group relation is false.")
    elif definition.get("representation") == "abelian":
        if set(definition) not in ({"kind", "representation", "invariantFactors", "generators"},
                {"kind", "representation", "invariantFactors", "generators", "source"}) or \
                type(definition["invariantFactors"]) is not list or \
                not 1 <= len(definition["invariantFactors"]) <= 4 or \
                any(type(factor) is not int or not 2 <= factor <= 64 for factor in definition["invariantFactors"]) or \
                sum(definition["invariantFactors"]) > 8 or \
                type(definition["generators"]) is not list or \
                len(definition["generators"]) != len(definition["invariantFactors"]):
            raise ValueError("Invalid bounded finite-abelian-group definition.")
        factors = definition["invariantFactors"]
        if any(factors[i] % factors[i - 1] for i in range(1, len(factors))) or \
                any(type(name) is not str or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,15}", name)
                    for name in definition["generators"]) or len(set(definition["generators"])) != len(factors):
            raise ValueError("Invalid abelian invariant factors or generators.")
        degree = sum(factors)
        generators = []
        offset = 0
        for factor in factors:
            images = list(range(1, degree + 1))
            for index in range(factor):
                images[offset + index] = offset + ((index + 1) % factor) + 1
            generators.append(Permutations(degree)(images))
            offset += factor
    else:
        raise ValueError("Unsupported finite-group representation.")
    group = PermutationGroup(generators)
    if int(group.order()) > 16:
        raise ValueError("GAP group dossier requires order at most 16.")
    return group, degree


def analyze_finite_group(params):
    group, degree = _input(params)
    gap_version = str(gap.eval("GAPInfo.Version")).strip('"')
    if int(group.gap().Size()) != int(group.order()):
        raise ValueError("GAP and Sage group orders disagree.")
    elements = sorted((tuple(int(i) for i in item.tuple()) for item in group.list()))
    indexes = {element: index for index, element in enumerate(elements)}
    if len(indexes) != int(group.order()):
        raise ValueError("GAP did not return distinct group elements.")
    center = sorted(indexes[tuple(int(i) for i in item.tuple())] for item in group.center().list())
    classes = sorted((sorted(indexes[tuple(int(i) for i in item.tuple())] for item in conjugacy_class)
        for conjugacy_class in group.conjugacy_classes()), key=lambda members: (len(members), members))
    subgroups = []
    for subgroup in group.subgroups():
        members = sorted(indexes[tuple(int(i) for i in item.tuple())] for item in subgroup.list())
        subgroups.append({"members": members, "normal": bool(subgroup.is_normal(group))})
    subgroups.sort(key=lambda subgroup: (len(subgroup["members"]), subgroup["members"]))
    if len(subgroups) > 128:
        raise ValueError("GAP subgroup count exceeds the complete-result limit of 128.")
    return {"format": "math3d.sage-finite-group-result", "schemaVersion": 1,
        "order": int(group.order()), "actionDegree": degree, "gapVersion": gap_version,
        "elements": [list(element) for element in elements], "center": center,
        "conjugacyClasses": classes, "subgroups": subgroups, "complete": True}
