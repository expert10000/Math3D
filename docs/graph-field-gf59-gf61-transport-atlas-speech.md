# GF-59–61 reviewable gates

## GF-59 — checked transport evidence at surface events

The saved GF-57 component links now admit a bounded midpoint-advection
review. The rule samples the pinned temporal vector field at exact and
midpoint times, including checked scientific transfers when required. It
requires matching length and velocity units in seconds, at most 128 links,
2–16 region witnesses per component and a declared step and distance cap.
The result saves each predicted region overlap or sampling ambiguity,
the rule, both frame geometry signatures and the source and GF-57 result
lineage. Project reopen and source change withhold stale evidence.

Analytic fixtures cover stable components, possible splits and merges,
appearance and disappearance. A witness inside a later component bound is
transport **evidence**, not material identity. Appearance and disappearance
have no two-sided witness. Every result remains `materialIdentity:
unverified`, `interpolation: unavailable` and exact-frame only. General
material tracking and interpolation through topology change remain open.

## GF-60 — bounded atlas coverage refinement

A saved current two-chart GF-58 atlas can add one saved GF-55 chart of the
same source and branch. The third chart needs a validated overlap with an
existing chart, compatible orientation, no screened transverse intersection,
and a strict reduction in uncovered cells in the declared 16×16 projected
coverage grid. The combined unwelded Mesh is limited to 192 vertices, 384
triangles and 1,000,000 evaluations. The result pins the base atlas, all
three members and geometry hashes; the Mesh bytes and Project round trip
are checked. It remains a **local finite-time** atlas. Projected coverage
does not establish a global manifold.

## GF-61 — spoken status clarity

Mobile scientific focus labels now put the result name, spoken physical
units, source revision, and withholding reason before the full provenance.
The expanded detail still exposes IDs and hashes. The same concise form
covers saved tensor results, selections, Graph rows, transport evidence and
local atlas results. Automated assertions cover unit pronunciation,
source-change reasons and unverified selections.

The human TalkBack listening gate is **pending**: `adb devices -l` saw no
connected device during this pass. No spoken audibility or comprehension
claim follows from text assertions alone. The earlier Samsung check found
speech too quiet even with media and accessibility streams at maximum.
The debug APK built successfully as `artifacts/mobile/Math3D-mobile-1.6.0-debug.apk`
(SHA-256 `c35c951dc8ab551f15f9ca6576d27ec5575ca5c301592947ebb3e896bde2357f`).
The repeat should record device and build, quiet-room conditions, the exact
announcement heard for a current tensor and a withheld source, and a user
judgment on clarity. Broader physical-device and platform signoff is separate.

## Evidence

- `tests/unit/gf59SurfaceTransport.test.ts`: exact-frame transport,
  split/merge/appearance/disappearance, budgets, cancellation, Project
  reopen and source-change withholding.
- `tests/unit/gf58ManifoldAtlas.test.ts`: third-chart coverage gain, saved
  lineage, Mesh verification and Project reopen.
- `tests/unit/gf61SpokenScientificStatus.test.ts` and
  `tests/unit/gf47Gf48TensorAccessibility.test.ts`: concise spoken labels,
  units, source state and withholding reasons.
- `tests/e2e/graph-field-gf52.spec.ts` and
  `tests/e2e/graph-field-gf58.spec.ts`: Explorer save and desktop Project
  reopen for GF-59 and GF-60.
