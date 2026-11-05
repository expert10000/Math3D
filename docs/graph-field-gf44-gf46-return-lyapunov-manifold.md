# GF-44–46 first reviewable gates

## GF-44 — Poincaré return maps

The saved GF-42 oriented section is the input. The analytic gate rejects fewer
than three crossings, a reached crossing cap, GF-42-reported tangencies, outside-segment
events, early solver stops, and crossing sequences that change under tighter
integration tolerances. It pairs successive physical section distances
`s_n → s_(n+1)` in their directed time order. The Project result pins the
source and upstream section hash, the tolerance, the row hash and the maximum
refinement difference. Graphs stores a guarded point series in physical
coordinate units on both axes; a source, section or row change withholds it.
Matching refinements cannot certify that no crossing occurred between solver
samples. No periodic-orbit or global recurrence claim follows from these finite
samples.

## GF-45 — finite-time directional growth

The analytic recipe saves a physical seed, unit perturbation direction,
perturbation distance, interval and solver settings. Four bounded trajectories
measure growth at two initial separations. The displayed value is
`log(final separation / initial separation) / interval` in inverse time units.
The difference between perturbation scales and local integration error yield
an explicit numerical uncertainty indicator, not a certified error bound.
Incomplete time coverage, domain exits
and unresolved separation are unavailable; changing the source withholds the
saved result. This is a finite-time directional estimate, not an asymptotic
Lyapunov exponent or an FTLE field.

## GF-46 — local manifold surface patches

The gate requires a saved equilibrium and two real, separated, well-conditioned
eigendirections of the same stable or unstable branch. A small seed ring is
integrated in the required time direction, sampled at common times and joined
into consistently oriented triangles. Missing time coverage, a degenerate
facet, a fold, or an out-of-domain seed leaves the patch unavailable. The
Project result keeps the recipe, source and equilibrium hashes, geometry hash,
counts, local classification, units and all trajectory stop reasons. Vertex
and index arrays use the existing Mesh binary sidecar and generated-by
relation; Project JSON never embeds scientific geometry. Reopen verifies the
sidecar checksum before treating the Mesh as current. This patch is local and
finite-time; global manifold continuation remains open.

## Evidence

- `tests/unit/gf44Gf46AdvancedTopology.test.ts`: analytic circular returns,
  order, cap and refinement guards, linear growth and neutral rotation,
  bounded work, local saddle patch, Project package and Mesh byte round trip,
  mobile contract reading, and source-change withholding.
- `tests/e2e/graph-field-gf44-gf45.spec.ts`: desktop return and finite-time
  authoring, saved Graph handoff and Project reopen.
- `tests/e2e/graph-field-gf46.spec.ts`: desktop local patch promotion to Mesh
  and Project reopen.
