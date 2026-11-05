# GF-38–40 first reviewable gates

## GF-38 — saved advanced tensor measures

The GF-03 typed derived-field chain accepts `q-criterion`, `lambda2`, and
`swirling-strength` for a Cartesian orthonormal vector source. It validates
source rank, coordinate and component units, frame, operation output units,
and the existing acyclic recipe before saving. The evaluator reuses GF-37's
conditioned 3×3 Jacobian measures. It accepts a verified scientific vector
transfer or an analytic fixture, bounds source evaluations, and reports
unavailable values at missing grid coverage or ill-conditioned eigenvalues.
The saved document pins source generation and hash; a changed or unverified
source withholds the recipe after Project reopen. The Field Explorer operation
picker exposes the three measures for supported analytic sources.

This gate does not claim robust derivatives on noisy or irregular grids.
Scientific transfers use the existing regular-grid sampler and its coverage
rule; publication remains gated by source verification.

## GF-39 — reindexed moving-surface correspondence

The GF-35 pair validator now handles different vertex numbering and triangle
ordering on the same physical grid. A bounded spatial match must be unique and
one-to-one, preserve the oriented triangle set after remapping, keep motion
below half the shortest source edge, and keep normals aligned. The pair
reports maximum and RMS displacement. Playback aligns the second mesh before
constructing the in-memory midpoint and budgets the remap storage. Failed
matches, splits, merges, ambiguous nearest vertices, and changed
triangulations retain exact-frame playback with an explicit unavailable reason.

This is a correspondence test for reindexing, not a general remesher or a
claim that topology correspondence survives arbitrary geometry changes.

## GF-40 — extended saved derivative curves

Graphs can save first or second derivatives as linked recipe objects under
`graph2d.extended-derivative.v1`. Supported symbolic rules evaluate the
current source AST and parameter values. If the rule or symbolic work limit
fails, the user may explicitly allow a finite-difference approximation. The
approximate curve samples at most 129 positions, reports gaps at undefined or
nonconvergent points, and is never stored as an authored expression. Source
edits update the source hash, domain, and method in one undoable scene action;
deleting a referenced source is refused. Project validation rejects forged or
stale source links and checks the method against current symbolic support.

Higher orders beyond two, arbitrary Graph source types, and global numerical
error guarantees remain open. The finite-difference tolerance is saved with
the recipe, but cusp and discontinuity detection is limited by the sampled
positions and numerical convergence checks.

## Evidence

- `tests/unit/gf38SavedTensorMeasures.test.ts`: source and unit guards,
  verified scientific transfer, coverage, conditioning, bounded evaluation,
  and Project round trip.
- `renderer/src/vectorfield3d/runTemporalMovingIsosurfaces.test.ts`:
  synthetic and extracted reindexed meshes, guarded midpoint playback, and
  topology-change rejection.
- `renderer/src/graph2d/graph2dSavedDerivative.test.ts`: symbolic and
  approximate recipes, parameter changes, gaps, undo/redo, and Project reopen.
- `tests/e2e/graph-field-gf40.spec.ts`: Graphs authoring and Project reopen.
