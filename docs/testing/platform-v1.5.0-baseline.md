# MATH3D v1.5.0 Topology and Complex Analysis baseline

## Purpose

This corpus freezes the user-visible and mathematical behavior that existed at the
v1.5.0 release boundary before the shared application kernel is introduced.  It is
a compatibility oracle, not a new source model.

The machine-readable inventory is
`tests/fixtures/platform-v1.5.0/baseline-manifest.json`.  Focused expectations live
beside it under `topology/` and `complex/`.

## Authority classes

- **Exact:** finite Topology incidence, chain condition, Z/Z2 homology, eligible
  surface classification, discrete Mobius classification, and explicit pole state.
- **Numerical:** complex expression values, stereographic round trips, branch-sheet
  coordinates, and sampled complex-map values.  Each fixture declares a tolerance.
- **Illustrative:** Three.js realization shape, diagram layout, domain coloring,
  animation phase, and 3D value-surface appearance.  E2E tests prove availability
  and navigation only; pixels never prove a mathematical result.

## Topology inventory

The baseline references the existing formal release matrix for Point, Circle,
Sphere, Torus, Cylinder, Mobius band, projective plane, Klein bottle, Moore space,
and invalid complexes.  The compact fixture adds named compatibility expectations
for the principal shipped polygon presets and document-loading outcomes:

- legacy v1 loads by recomputing derived data;
- valid v2 loads with a verified cache;
- stale v2 cache data is ignored and recomputed;
- malformed documents are rejected without inventing conclusions.

The desktop workflow additionally freezes preset selection, guided polygon-word
authoring, Complex View, Algebra View, and non-authoritative R3 realization labels.

## Complex Analysis inventory

The numerical fixture covers identity, square, reciprocal, trigonometric,
logarithmic, implicit-imaginary multiplication, invalid identifiers, non-finite
power behavior, Mobius identity/inversion/poles, stereographic projection, square
root sheets, and a representative complex-map sample.

The desktop workflow freezes discoverability of Function Explorer, Mobius Lab,
Riemann Sphere, Residue Lab, Branch Lab, Covering Lab, and the Complex-map 3D
handoff.  Persistence is intentionally not promoted to a canonical Complex document
in F01; that belongs to C02 and C09.

## Deliberately excluded

- timestamps, generated IDs, temporary paths, and localStorage layout;
- camera position, hover state, panel size, animation phase, and frame timing;
- screenshot pixels as a scientific oracle;
- optional CGAL/Sage availability or performance;
- a new document, command, job, artifact, or provenance contract.

Any later F, T-conformance, or C commit that changes an expectation must identify
the fixture and state whether it is preserved, intentionally migrated, or retired
with replacement coverage.
