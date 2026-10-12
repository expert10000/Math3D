# Graph2D analysis and constructions roadmap

**Proposed follow-on, 2026-10-13.** The next Graphs release should make analysis match the selected graph kind, then add a small persistent construction model. Existing roots, intersections, Cartesian tangents, saved probes, parameter animation, regression, and Curve/Surface promotion remain the foundation. The [canonical Graph2D roadmap](math3d-graph2d-desktop-mobile-roadmap.md) owns platform sequencing and release gates; this plan starts after G2D43 and does not change delivered status.

## Current baseline and actual gaps

| Area | Current implementation | Follow-on gap |
| --- | --- | --- |
| Graph kinds | Seven source kinds, including polar, share a portable document and sampler. Polar probes retain angle and signed radius. | Analysis actions and guidance must follow the selected kind. |
| Analysis | Bounded roots, extrema, intersections, differential results, Cartesian interval area and arc length exist. | The interval controls use **x** bounds and the integration kernels accept only explicit Cartesian functions. A selected polar curve must not be offered those operations as if they applied. |
| Graph workspace | Tools palette, grid/scales, Gallery, Parameters, export, Fit, and presentation exist. | Toolbar hierarchy is flat. The Inspector leads with source/sampling detail rather than the active result. Function cards expose too many actions at once. |
| Probes and promotion | Source-linked explicit probes and parameter cards persist; Graph → Curve and Graph → Surface promotion is implemented. | A probe or temporary tangent overlay is not yet a general dependent construction object. No new promotion engine is needed. |
| Empty state | The empty-scene message is rendered when the document has zero objects; its text is fixed to Cartesian. | Verify the reported visible-curve/empty-status case against a reproducible saved document. Derive any empty-state wording from the actual document and grid mode. |
| Scientific data | The scientific scene contract and standalone Python publisher have a bounded proof. | Graph dataset import is a separate adapter decision; it must preserve the existing source/artifact boundary. |

## Delivery sequence

Each ID is a reviewable change with focused tests, typecheck, and desktop/web interaction evidence. Shared document or numerical changes additionally need native model parity and save/handoff fixtures. Physical accessibility and device signoff remain governed by the existing Graph2D release gates.

| ID | Priority | Deliverable | Acceptance gate |
| --- | --- | --- | --- |
| **G2D44** | P0 | Make Inspector and Tools actions kind-aware. Separate explicit **x** interval analysis from polar **θ** analysis; show unsupported operations with a reason. Audit the reported empty-scene state. | Selecting each of the seven kinds never exposes a runnable incompatible operation or throws on activation. A populated polar document never reports an empty Cartesian scene; a truly empty document uses accurate grid/source wording. Existing explicit analyses still run. |
| **G2D45** | P0 | Add polar area and arc length in the shared numerical layer, with angular bounds and source-linked results. | Analytic circle cases, signed-radius behavior, pole crossings, repeated traversals, invalid domains, cancellation/budgets, provenance, and desktop/native parity pass. Partial or unresolved integration is labelled; no full value is published for an unresolved interval. |
| **G2D46** | P1 | Reorganize Graphs controls and Inspector without replacing existing tool routes. Keep Fit, zoom, and grid directly reachable; group authoring, construction, analysis, view, and export actions. Compact function cards and prioritize current results. | Desktop keyboard and narrow-layout flows reach every existing action; focus returns after menus; labels and disabled reasons are announced; no authoring, analysis, Gallery, or export route disappears. Selection and scroll position remain stable during resampling. |
| **G2D47** | P1 | Define a versioned construction object contract and typed commands in the shared Graph document/kernel. | Stable IDs, source references, parameter anchors, dependency ordering, cycle rejection, bounds, migration/capability behavior, undo/redo, save/reopen, and desktop/mobile handoff are specified and fixture-tested before new construction UI ships. |
| **G2D48** | P1 | Add point-on-curve and tangent/normal constructions using G2D47. A committed probe may be promoted to a persistent point; tangent and normal depend on that point and source. | Editing source or moving the parameter recomputes through the shared job lifecycle; singular/undefined points show unavailable state. Deleting a source or undoing a step handles dependents explicitly. Rendering is derived from the construction model, never the saved polyline. |
| **G2D49** | P1 | Allow existing root, extremum, and pair-intersection candidates to become source-linked construction objects; add a bounded region/measurement object only after its semantics are reviewed. | Candidate selection records input objects, interval, numerical method, residual/confidence, and source generation. Recompute can change a candidate or make it unavailable without silently relabelling another root as the same point. |
| **G2D50** | P1 | Freeze numerical, interaction, performance, accessibility, and cross-platform acceptance for G2D44–49. | Shared corpus, browser/Electron journeys, mobile model parity, save/undo/handoff, publication metadata, cancellation, and budget regressions pass. Physical signoff is reported separately under MOB-G13/G2D40. |

### First release boundary

Ship G2D44–46 as the first slice. It fixes wrong-kind actions, adds native polar measurements, and makes those results usable. G2D47–49 form a second slice because persistent dependencies change the portable document contract. G2D50 is the evidence gate for the second slice. The order keeps UI shortcuts from promising constructions before the source model exists.

## Polar mathematics and product rules

For a polar source \(r(\theta)\), the source domain and selected measurement interval are angular, in radians internally. The probe reports \(\theta\), signed \(r\), and Cartesian \((x,y)=(r\cos\theta,r\sin\theta)\). Degrees may be an input/display option, but conversion occurs at the UI boundary and the unit is always explicit.

- **Swept area:** \(A=\tfrac12\int_{\alpha}^{\beta}r(\theta)^2\,d\theta\). Label this as area swept with multiplicity. It is not automatically the area of the geometric union when a curve retraces or overlaps itself. If a user requests union area, that is a separate region/topology operation.
- **Path length:** \(L=\int_{\alpha}^{\beta}\sqrt{r(\theta)^2+(r'(\theta))^2}\,d\theta\). Negative radius is valid; a sign change may pass through the pole and must not be silently converted to \(|r|\) before differentiation.
- **Bounds and confidence:** Intersect requested angular bounds with the authored domain only when the UI explicitly says it is clipping; otherwise reject an out-of-domain request. Report undefined cells, numerical tolerance, evaluation count, method, estimated error, and source generation. Reuse the existing result envelope and shared bounded-job infrastructure.
- **Reference curve:** \(r=2\cos\theta\) on \([0,\pi]\) traces the circle \((x-1)^2+y^2=1\) once. At \(\theta=\pi/3\), \(r=1\) and \((x,y)=(1/2,\sqrt3/2)\). Area is \(\pi\), length is \(2\pi\). On \([0,2\pi]\), the path retraces the circle: swept area is \(2\pi\) and path length is \(4\pi\), while the geometric union area remains \(\pi\).

Numerical tests should include this analytic case, \(r=a\) over one full turn, negative-radius intervals, pole crossings, repeated turns, cusps, undefined expressions, open endpoints, and finite evaluation budgets. A polygon drawn by the sampler is never the numerical oracle.

## Construction contract to settle in G2D47

The Graph document owns construction intent: object ID, kind, ordered input references, parameter or interval anchor, style, and required capability. The kernel owns commands and revision history. A pure resolver evaluates the dependency graph against exact source generations and publishes derived geometry/results through the existing artifact/job lifecycle. The renderer only projects those outputs.

The first object kinds are `point-on-curve`, `tangent`, and `normal`; root, extremum, and intersection anchors follow in G2D49. Use source parameter identity (`x`, `t`, or `theta`) for a point on a curve, including polar points with negative radius. A numerical candidate additionally needs a bounded search interval and stable matching policy. Persist intent and references, not sampled coordinates or a frozen drawn line.

Define the lifecycle before implementation: source edit → dependent pending/stale → recomputed or unavailable; source deletion → explicit dependent handling; undo/redo → deterministic replay; export → source/result provenance. Cycles and cross-document references need explicit rejection or a reviewed relation type. Construction count, depth, evaluation, and artifact-size limits must be bounded. A result's confidence label must distinguish exact definitions from approximate numerical solutions.

## Later decisions, outside the first two slices

| Candidate | Decision rule |
| --- | --- |
| More fitting models | Extend the existing checked point-series regression only when a concrete dataset and error model justify polynomial, nonlinear, or spline fitting. |
| Curvature constructions | Reuse the existing explicit local differential result first; extend to parametric/polar only with derivative and singularity rules. |
| Graph → Curve/Surface | Preserve the delivered promotion workflow. Add a construction-aware snapshot only when a downstream Curve/Surface use case needs it. |
| Scientific/Python graph datasets | Design an adapter to verified, immutable scientific-scene datasets or checked point-table sidecars. Require units, coordinate meaning, hashes, provenance, bounds, and an explicit import choice. Do not execute Python in the Graph viewer or treat sampled geometry as an editable expression. Align with [Scientific Scene Runtime](scientific-scene-runtime-roadmap.md). |
| Differential equations, Fourier analysis, complex mappings | Start separate problem statements and numerical acceptance corpora after the construction release. They are distinct domain features, not prerequisites for G2D44–50. |

## Implementation start checklist

1. Reproduce the reported polar Inspector and empty-status states with a saved Graph fixture; record whether the empty wording is a live bug or stale screenshot/state.
2. Land G2D44 before exposing any new polar measurement button. Keep existing explicit area/length behavior covered.
3. Freeze the G2D45 result semantics and analytic corpus before integrating Inspector controls.
4. Review the G2D47 schema, capability, invalidation, and deletion rules against the existing project/handoff contract before building G2D48 UI.

