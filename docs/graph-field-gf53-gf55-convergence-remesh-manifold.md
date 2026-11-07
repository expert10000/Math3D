# GF-53–55 reviewable gates

## GF-53 — FTLE convergence and Graph handoff

A saved 2×2 GF-50 field is recomputed from its pinned GF-27 time source. A
second 4×4 field halves the perturbation and doubles the RK4 step count.
The physical line profile samples the finer field at the original seed
coordinates using bilinear interpolation. Each cell carries the larger of
the coarse/fine difference and the two perturbation-scale uncertainty
indicators. Cells above the declared tolerance are gaps, not zero values.
The bounded result stores both resolutions, perturbations, step counts,
physical coordinate and inverse-time units, row status and source lineage.

The saved Graph row uses a checked point-table resource and pins the Project,
result summary and rows. On reopen, unverified scientific frames or changed
frames withhold the samples. Explorer can explicitly recompute a profile;
Graphs performs one undoable row edit only after a compatible saved profile
and all pinned frames verify. This tests one finer discretization and does
not prove an asymptotic exponent or convergence for arbitrary fields.

## GF-54 — remeshed surface correspondence

The moving-surface validator now accepts different vertex and triangle
counts for a complete, watertight, topology-stable pair. It checks connected
components and Euler characteristic, then projects both meshes onto the
other's triangles under a 1,024-vertex and 2,048-triangle cap. Normal
orientation, ambiguity and a quarter-shortest-edge maximum geometric error
gate the midpoint. The interpolated preview uses the first mesh's topology
and projected positions; it carries no scientific source hash. Split, merge,
appearance or disappearance pairs retain GF-52 exact-frame playback.
Closest-surface projection is geometric evidence, not material-point tracking.

## GF-55 — extended local manifold validation

A saved GF-46 patch is reverified, then GF-51 nested continuation is repeated
at increasing ring counts within a declared source domain, at most five
attempts and 1,000,000 trajectory evaluations. An attempt records prefix
error, fold or intersection failure, solver stops, work and domain stops,
and vertex count. Accepted geometry stores sampled physical bounds and their
projected two-axis area fraction of the declared domain. Promotion saves
the final source-linked Mesh and the attempt evidence. The result remains
`local-finite-time`; `globalClaim` is always `withheld`. The cap and finite
seed ring do not support a global manifold claim.

## Evidence

- `tests/unit/gf53TemporalFtleProfile.test.ts`: analytic expansion,
  refinement, gaps, cancellation, Project and Graph row reopen, and changed
  frame withholding.
- `renderer/src/vectorfield3d/runTemporalMovingIsosurfaces.test.ts`:
  matching-index, reindexed and remeshed stable meshes, midpoint, changed
  topology and normal orientation.
- `tests/unit/gf55ExtendedManifold.test.ts`: adaptive attempts, bounds,
  work and cancellation gates, Mesh save/reopen and stale-source withholding.
- `tests/e2e/graph-field-gf50.spec.ts` and
  `tests/e2e/graph-field-gf55.spec.ts`: desktop FTLE Graph handoff and extended
  Mesh save/reopen paths.
