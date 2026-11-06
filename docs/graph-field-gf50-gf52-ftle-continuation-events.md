# GF-50–52 reviewable gates

## GF-50 — finite-time Lyapunov field

The saved `vector3d.temporal-ftle-field` result pins a GF-27 temporal source,
all frame generations, a physical slice, a 2–4 by 2–4 seed grid, start/end
times, RK4 step count and perturbation. Admission requires linear time
interpolation, matching Cartesian coordinate units and velocity units of
coordinate per time. Seven flow trajectories per seed estimate the largest
Cauchy–Green stretch at two perturbation scales. The result reports inverse
time units, the scale difference as a numerical uncertainty indicator,
complete coverage and at most 60,000 velocity evaluations. Work yields between
seeds for cancellation and progress. Missing samples or frame verification
withhold the entire field. Scientific-bundle frames require a fresh final
verification before publication. Project reopen retains the recipe and cells;
the source guard withholds values until its pinned frames verify again.

This is a finite-time, finite-grid estimate. The scale difference does not
certify integration or sampling error. The current UI runs four seeds on the
central slice with 32 steps; broader grids and adaptive convergence are
separate work.

## GF-51 — local manifold continuation

A saved GF-46 patch can be recomputed and checked before continuation. The
candidate adds 1–4 time rings at the same interval within the existing eight
ring and four time-unit limits. Publication requires the saved base geometry
hash, a current equilibrium and source, complete solver stop reasons, the
GF-46 fold/orientation gate, shared-ring prefix agreement within the declared
tolerance, and zero screened intersections among nonadjacent triangles. The
result stores measured prefix error, tolerance, intersection count, stop
reasons, Mesh geometry hash and source lineage. Promotion uses the existing
source-linked Mesh sidecar and keeps `local-finite-time` as the claim.

The triangle screen detects transverse and coplanar overlaps in these bounded
patches; it is not a proof of a global embedded invariant manifold. Failed
convergence, folds or intersections leave additional geometry unavailable.

## GF-52 — exact-frame topology events

For 2–4 verified pinned isosurfaces, the event result checks source pins,
identical physical extraction rules and complete meshes. A bounded union-find
pass records connected components, Euler characteristic and physical bounds.
Bounding overlap supports **possible** split or merge labels; absent overlap
supports sampled-frame appearance or disappearance. Ambiguous changes remain
inconclusive. The saved result contains compact event evidence and surface
signatures, with no interpolated mesh. A complete empty frame can now play as
an exact frame and cannot be promoted to Mesh or interpolated. Changed or
unverified frames withhold saved event status. Existing GF-35/39 interpolation
continues only for separately validated topology-stable pairs.

Component counts and bounds do not identify material points or prove when a
topology change occurred between frames. General remeshing and topology
correspondence remain research gates.

## Evidence

- `tests/unit/gf50TemporalLyapunovField.test.ts`: analytic expansion,
  uncertainty, verified-bundle admission, cancellation, save/reopen and
  changed-frame withholding.
- `tests/unit/gf51ManifoldContinuation.test.ts`: nested-ring continuation,
  transverse/coplanar intersection screens, budget and source-change checks,
  Mesh promotion and Project reopen.
- `tests/unit/gf52TemporalSurfaceEvents.test.ts` and
  `renderer/src/vectorfield3d/gf52TemporalSurfacePlayback.test.ts`: analytic
  merge/split/disappearance fixtures, saved event source guard, complete empty
  frame playback without interpolation.
- `tests/e2e/graph-field-gf50.spec.ts`, `graph-field-gf51.spec.ts` and
  `graph-field-gf52.spec.ts`: desktop Project save/reopen workflows and UI
  controls for each first gate.
