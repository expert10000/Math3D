"""Exact H06 tutorial facts on a real Sage runtime; no UI or saved evidence is fabricated."""
import json
from sage.all import GF, QQ, ZZ, PolynomialRing, CyclicPermutationGroup, gcd, matrix, version

field = GF(5)
field_facts = {"characteristic": int(field.characteristic()), "cardinality": int(field.cardinality()),
               "nonzero_invertible": all(value ** -1 in field for value in field if value != 0)}
assert field_facts == {"characteristic": 5, "cardinality": 5, "nonzero_invertible": True}

group = CyclicPermutationGroup(4)
orders = sorted(int(element.order()) for element in group)
group_facts = {"order": int(group.order()), "elementOrders": orders,
               "subgroupCount": len(group.subgroups())}
assert group_facts == {"order": 4, "elementOrders": [1, 2, 4, 4], "subgroupCount": 3}

ring = PolynomialRing(QQ, names=("x", "y"), order="degrevlex")
x, y = ring.gens()
ideal = ring.ideal([x*x, y])
basis = ideal.groebner_basis()
ideal_facts = {"xSquaredMember": x*x in ideal, "yMember": y in ideal,
               "xMember": x in ideal, "normalOne": str(ring(1).reduce(basis)),
               "normalX": str(x.reduce(basis)), "normalXSquared": str((x*x).reduce(basis)),
               "normalY": str(y.reduce(basis))}
assert ideal_facts == {"xSquaredMember": True, "yMember": True, "xMember": False,
                       "normalOne": "1", "normalX": "x", "normalXSquared": "0", "normalY": "0"}

smith_result = matrix(ZZ, 1, 1, [6]).smith_form()
smith = smith_result[0] if isinstance(smith_result, tuple) else smith_result
module_facts = {"smithDiagonal": [str(smith[0, 0])], "freeRank": 0}
assert module_facts == {"smithDiagonal": ["6"], "freeRank": 0}

sweep = [int(gcd(a, b)) for a, b in [(84, 30), (35, 15), (17, 13)]]
assert sweep == [6, 5, 1]
print(json.dumps({"status": "passed", "sageVersion": version(), "field": field_facts,
                  "group": group_facts, "ideal": ideal_facts, "module": module_facts,
                  "gcdSweep": sweep}, sort_keys=True))
