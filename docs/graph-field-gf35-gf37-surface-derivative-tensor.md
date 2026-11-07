# GF-35–37 first reviewable gates

## GF-35 — moving-surface validation

GF-30/33 playback continues to load and verify each pinned frame. A midpoint preview is optional. The pair validator requires complete, watertight, manifold surfaces with the same physical axes, level, units, clip, topology summary, vertex count and triangle indexing. It rejects degenerate edges, reversed normals and vertex displacement beyond half the shortest source edge. This is intentionally conservative: equal topology counts alone do not establish a point correspondence. A failed pair plays its exact frames and displays the reason. A validated pair shows one in-memory midpoint, after another source check, inside the existing 10-second and 64-MiB playback budgets. Midpoints cannot be promoted as verified Mesh resources. General remeshing and topology-changing interpolation remain open.

## GF-36 — linked derivative curves

An explicit Graph function can save its first symbolic derivative as another explicit Graph object under the `graph2d.linked-derivative.v1` capability. The saved origin pins the source object and expression hash; validation checks the stored derivative AST against the source, preventing forged lineage. Parameter values remain live in the derivative expression. Editing the source regenerates the linked expression and origin in the same undoable Graph scene action. If the source has no supported bounded symbolic derivative, creation or source replacement is refused with an unavailable reason. Deleting the source first requires removing its derivative. Project serialization retains the link and its display styling. Higher derivatives, numerical fallback and arbitrary source types are separate work.

## GF-37 — tensor-measure numerical gate

The new pure evaluator accepts a bounded finite 3×3 Jacobian only for a Cartesian orthonormal vector frame with uniform axis and component units. It computes Q-criterion from strain and rotation norms, lambda-2 from the middle eigenvalue of S²+Ω² using a bounded symmetric Jacobi solve, and swirling strength from the complex pair of the Jacobian cubic. An ill-conditioned cubic discriminant withholds swirling strength; a nonconvergent symmetric solve withholds lambda-2. Tests use analytic rigid rotation, reversed rotation and pure strain, plus a numerical Jacobian produced by the existing bounded derived-field evaluator. These measures are **validation only**: GF-16 does not yet expose them as saved operations or claim reliability for noisy scientific grids.

## Evidence

- `renderer/src/vectorfield3d/runTemporalMovingIsosurfaces.test.ts`: analytic separated and merged surfaces, stable correspondence, midpoint gating, memory/cancellation and stale sources.
- `renderer/src/graph2d/graph2dDerivativeCurve.test.ts`: parameter recomputation, source edit, undo/redo, unavailable rule and Project reopen.
- `tests/unit/gf37AdvancedTensorMeasures.test.ts`: analytic and bounded numerical matrices, units, frame refusal and degenerate eigenvalues.
- `tests/e2e/graph-field-gf30-gf31.spec.ts`: visible pair status and optional playback in the desktop viewer.
- `tests/e2e/graph-field-gf36.spec.ts`: saved Graph derivative visible after Project reopen.
