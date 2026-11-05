# GF-41–43 first reviewable gates

## GF-41 — local basin-map validation

The bounded analytic gate samples at most 7×7 seeds on an XY plane from a pinned
Cartesian vector source. The Project result saves the seed grid, declared
attractor positions, capture radius, solver method, tolerances, step and time
limits, and a classification hash. Capture is a finite-time observation, not a
proof of a global basin. Adjacent seeds assigned different attractors are
marked as inconclusive boundary cells. Uncaptured or solver-stopped seeds are
also inconclusive. The Project reopens with its source pin and withholds the
result after the source revision changes. The desktop panel reports counts and
the work budget; the compact Project result does not store a raster.

## GF-42 — oriented Poincaré sections

The section recipe saves a finite directed segment, a unit normal, crossing
direction, seed, solver settings, crossing cap and tangency tolerance. A
bounded trajectory supplies crossings with interpolated time, physical
position, distance along the segment and normal speed. Wrong-direction,
outside-segment, near-tangent and repeated events are excluded. A compact
Project result pins the source and crossing hash. Graph handoff creates a
source-linked point series of time versus section distance, with their units.
Graphs withholds that series if the source, saved result or point rows change.
Crossings are numerical samples, with no claim about later returns beyond the
integration limit or a rigorous periodic orbit.

## GF-43 — mobile Project round trips

Mobile import and export retain the saved GF-38 tensor recipe, the temporal
frame source used by GF-39 playback, and GF-40 linked derivative curve IDs and
parameters. GF-39 mesh correspondence is an in-memory validation result and
has no separate saved contract. Explorer
lists these contracts as focusable cards with spoken status. A scientific
bundle without mobile byte verification is labeled unverified; mobile Graphs
withholds source-linked point tables and announces the reason. Derivative
recipes remain visible while unsupported mobile editing and export are
disabled. The code-level accessibility check confirms keyboard-focusable
recipe controls with labels and expanded state, plus polite live status for
withheld values. Full screen-reader and physical-device signoff remains a
separate release gate.

## Evidence

- `tests/unit/gf41Gf42TopologyStudies.test.ts`: double-well basins,
  inconclusive separatrix, bounded work and cancellation, oriented orbit
  crossings, Graph guard, source change and Project round trip.
- `tests/unit/gf43MobileScientificProject.test.ts`: GF-38–40 contract import,
  mobile package export/reimport, stable IDs and withheld scientific values.
- `tests/e2e/graph-field-gf41-gf42.spec.ts`: desktop analytic panel, saved
  basin and section recipes, Graph crossing handoff and Project reopen.
