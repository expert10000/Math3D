# Graph2D grid, tools and canvas roadmap

Requested 2026-09-29 from the supplied graph-paper/tool-palette screenshot. Execution order: **G2D41 → G2D42 → G2D43 → GGL11**. The [canonical roadmap](math3d-graph2d-desktop-mobile-roadmap.md) owns overall sequencing. G2D40 software acceptance is a baseline, not physical release signoff.

## G2D41 — grid display controls (first implementation)

Desktop/web gets a clearly named Grid panel; native reuses Display. Controls cover grid, X/Y axes, numeric tick labels, minor subdivisions, automatic density, independent manual X/Y Cartesian spacing and contrast. Manual spacing is in world units for linear axes and integer decades for log10 axes; polar mode uses its existing bounded radial/angular projection and explicitly disables Cartesian-only manual spacing.

Desktop valid changes preview immediately; Apply/Close saves, Cancel/Escape discards unapplied changes, and closing preserves the inspected selection. Display-only grid changes do not restart curve sampling. During zoom the Inspector retains explicitly labelled previous observations with stable scroll/layout while workers update.

New optional display settings require a shared validated capability. Absent settings preserve old document bytes, source identity, previews and frozen exports. Visibility/spacing/contrast commands are reversible display edits, never expression/domain/data edits. Tick generation is bounded even for extreme ranges/tiny steps; insufficient pixel spacing is omitted and explained, not silently presented as a complete grid. Every renderer/export uses the shared spacing intent. Theme-aware live colors and system high-contrast colors remain legible.

Acceptance: strict malformed/positive/log validation, bounded ticks, independent known steps, legacy digest equality, save/reopen/undo/handoff, desktop/native model parity, real browser/Electron keyboard/layout checks and export intent. Physical native/print/screen-reader acceptance stays pending.

## G2D42 — relevant tools palette

A compact grid of named buttons exposes Move/select, Point/probe, Slider, Roots, Extrema, Intersections, Tangent and Regression. These are routes to existing mathematics, not duplicate evaluators. Tools needing explicit functions, a committed probe, two functions or original point data explain and enforce those prerequisites. Opening tools does not alter source or trigger autoplay. Analysis retains numerical confidence, bounded intervals and staleness labels.

Desktop/web uses a collapsible palette; phone uses a touch-friendly compact sheet and tablet can retain side controls. Original labelled icon/vector artwork, text names, 44px touch targets, keyboard focus and Escape/return behavior. Keep Gallery, Grid, Parameters and Export reachable on narrow layouts.

## G2D43 — relevant on-graph elements

Expose existing source-linked probes as labelled markers with coordinates, bounded label placement, rename/delete/locate and visibility controls. Invalid/non-positive log coordinates and stale probes remain omitted or clearly labelled; they never become extrapolated evidence. Add optional compact parameter cards sharing the existing session preview/apply/cancel and deterministic playback; no second animation state machine.

Free independent points, arbitrary text, geometry constructions, rectangle selection/multi-transform and snapping are not promised by these three milestones. Such features need a separately reviewed source/constraint model. Existing editable Graph projects remain the only save authority.

## Delivery tracking

- Roadmap pushed as `482aa0c`; G2D41 shared policy and desktop/native controls are software implemented and locally accepted. [Behavior, evidence and pending physical checks](graph2d-g41-grid-controls.md).
- G2D42 and G2D43 are implemented; see [tools behavior and evidence](graph2d-g42-tools.md) and [saved probes and parameter cards](graph2d-g43-canvas-controls.md).
- Full G13/professional signed-device and real screen-reader release gates remain pending.
