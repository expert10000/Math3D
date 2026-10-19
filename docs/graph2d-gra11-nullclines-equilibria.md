# GRA-11.4: nullclines, equilibria and Gallery examples

A saved planar phase portrait now samples both zero-derivative contours. Orange dashed curves mean `x′=0`; cyan dotted curves mean `y′=0`. Candidate crossings are refined against the original expressions with up to five Newton steps. A marker is shown only when the vector-field residual is at most `10⁻⁷(1+|position|)`. The Inspector lists each coordinate and residual, the approximate contour grid scale, the candidate and unresolved counts, and whether the analysis completed within its sample and deadline budgets. Grid scale is a resolution proxy, not a certified coordinate error bound. No marker or a completed numerical scan does not prove that no equilibrium exists, especially at tangencies or a continuum of equilibria.

The analysis shares GRA-11.3's maximum of 12,000 expression evaluations and the host deadline. Saved orbit integration runs first. With a tight remaining budget, the analysis reports **partial** or **unavailable** rather than claiming complete results. Source expressions and seeds remain the only saved mathematical content; nullclines and markers recompute after editing a phase portrait or a document parameter. Desktop/web, mobile and published plots draw the same two contour families and equilibrium points.

Graphs Gallery adds a **Differential equations** category with three editable examples:

| Preset | Equations | Reference behavior |
| --- | --- | --- |
| Circular flow | `x′=y`, `y′=-x` | Closed circles and one equilibrium `(0,0)` |
| Saddle flow | `x′=x`, `y′=-y` | Invariant `xy` and one saddle equilibrium `(0,0)` |
| Three equilibria | `x′=x-x³`, `y′=-y` | Isolated equilibria `(-1,0)`, `(0,0)`, `(1,0)` |

Open a preset through **Graphs → Gallery → Differential equations**, or choose **Add phase portrait → Browse phase portrait examples** from Functions. The editor link opens Gallery with the category already selected. The first example is also Featured. Each opens as a normal editable Graph document with its own fresh project identity. Exact-reference tests cover the three systems, bounded work, no false probe, Gallery portability, mobile projection, web rendering, and export primitives. Physical mobile visual and accessibility signoff remains in the existing release gate.

[GRA-11.5](graph2d-gra11-equilibrium-classification.md) adds local Jacobian estimates and conservative stability labels to these numerical candidates.
