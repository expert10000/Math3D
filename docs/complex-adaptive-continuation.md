# Adaptive branch continuation and monodromy (C10)

C10 adds discriminant-aware path lifting to the existing Branch Lab. Open
**Complex Analysis -> Branch Lab -> Branch**, select `log(z)`, `sqrt(z)`,
`z^(1/3)`, or `sqrt(z^2-1)`, then choose **Analyze adaptive continuation**.

The result records source revision, original/refined samples, minimum discriminant
distance, precision escalation, branch-point windings, sheet shift, and monodromy.
Subdivision increases near branch points and precision escalates from 30 to 50 or 80
digits as the path approaches the discriminant.

A permutation is published only when the path closes, stays separated from the
discriminant, and every winding converges to an integer. Otherwise the outcome is
`uncertain`, the permutation is withheld, and the inspector explains why. Existing
preset diagrams, cut controls, animations, and sheet previews remain illustrative
compatibility views.
