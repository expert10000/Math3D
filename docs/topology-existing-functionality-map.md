# Topology module — existing functionality map

**Purpose.** This is the implementation baseline for the Topology roadmap. It covers the standalone **Topology** workspace (`TopologyScreen` and `renderer/src/topology/`), rather than the separate mesh-topology tools in Mesh or semantic topology tools in Geometry.

**Inspected:** 2026-09-13
**Product version:** `1.4.9`

## Module at a glance

```text
Fundamental diagram
  -> normalize
  -> triangulate polygonal faces when required
  -> derive vertex / edge equivalence classes
  -> build CW-style quotient complex
  -> make specialized or generic R3 realizations
  -> inspect, animate, compare, save, or export diagnostics
```

The module is an interactive teaching and construction tool for polygonal quotient spaces. Its central data model is a *fundamental diagram*: vertices, directed edges, faces, edge labels, pairings, and boundary words.

## Delivered functionality

| Area | Current capability | Notes |
| --- | --- | --- |
| Learning entry points | Euler, Constructing Polygon, Polyhedra, Klein bottle, and Möbius subtabs | Euler includes classical-polyhedra V/E/F/χ reference rows. |
| Preset library | 10 quotient examples: dunce cap, dunce map, Möbius band, projective plane, torus, Klein bottle, cone, suspension, cylinder, and sphere by boundary contraction | Each supplies a fundamental diagram and boundary word. |
| Diagram authoring | Preset and editor modes; regular polygon templates; drag/select/add/remove vertices and edges; edge label, direction, and pairing editing; raw JSON editor; undo/redo (up to 120 snapshots) | Newly added edges can optionally be appended to the first face boundary. |
| Polygon-word tools | Parse and format words, create orientable and non-orientable genus words (g/n 1–8), classify familiar torus/projective/Klein patterns, generate an editable diagram from a word | The word utilities are domain helpers; the visible editor is primarily diagram-based. |
| Quotient construction | Normalization; fan triangulation of faces with >3 boundary edges; equivalence by explicit pairings and shared labels; orientation matching/reversal; source-to-quotient maps | The result retains normalized/subdivided diagrams, classes, attachments, incidence, optional face-fan refinement, pipeline status, and warnings. |
| Quotient inspection | Diagram, Quotient Structure, Realization, Animation, and Compare views | Quotient view shows skeleton, equivalence classes, attachments, incidences, cell boundaries, and orientation relations. |
| 3D realization | Generic immersed and flat schematic realizations for any quotient; specialized realizations when recognized for torus (smooth/cut-open), Möbius (smooth/cut-open), RP², Klein bottle, cylinder, cone, dunce map, sphere, and suspension | RP² and Klein models are explicitly presented as immersions with self-intersections where applicable. |
| Viewer interaction | Three.js realization viewer with camera controls and overlays: seams, 1-skeleton, identified corners/singularities, edge classes, boundary/core loops, orientation-flip traveler, self-intersection curves, boundary components, fundamental loops, and linked diagram-to-realization edge selection | Overlay availability is realization/story dependent. |
| Narrative animation | Play/pause/step/reset timeline, named construction stages for key presets, 2D explanations and selected 3D staged narratives | Identification operations have a persistent order/group plan and can be reordered/grouped. |
| Comparison | Side-by-side selection of any two presets with synchronized viewer overlays and compact χ/component/non-manifold counters | Comparison is preset-to-preset, not arbitrary saved-document comparison. |
| Invariants and diagnostics | V/E/F, Euler characteristic, connected components, non-manifold-edge count; derived UI hints for boundary count, orientability, and genus where the module recognizes the construction | Detailed checks: non-manifold edge incidence (>2 faces), disconnected vertex stars, invalid quotient boundary cycles, and pipeline validation warnings. |
| Diagnostic workflow | Expandable warning explanations; focus an offending edge, vertex, or face in the diagram/realization; JSON and CSV diagnostic export | The focus action links diagnostic rows to both source diagram and realization state. |
| Persistence | Versioned `.math3d-topology` document (`format: math3d-topology`, version 1), native save/save-as/open in desktop, browser download/upload fallback | Stores the diagram plus quotient cache, active view, realization selection, and animation plan. |

## Built-in content

| Family | Examples | Canonical word / construction |
| --- | --- | --- |
| Orientable closed surface | Torus | `a b a^-1 b^-1` |
| Non-orientable surfaces | Möbius band, projective plane, Klein bottle | Rectangle/square identifications |
| Quotient / singular examples | Dunce cap, dunce map, cone, sphere boundary contraction, suspension | Edge or boundary contractions |
| Open surface | Cylinder | One opposite edge pair identified |

## Current technical architecture

| Layer | Responsibility | Main implementation |
| --- | --- | --- |
| Screen/UI | State, editing controls, views, stories, diagnostics and persistence controls | `renderer/src/screens/TopologyScreen.tsx` |
| Core contracts | Fundamental diagram, quotient, realization, pipeline and subdivision types | `renderer/src/topology/types.ts` |
| Construction engine | Normalize, triangulate, compute equivalence and build the CW-style quotient | `renderer/src/topology/quotientBuilder.ts` |
| Rendering data | Generic and recognized-preset realizations in R³ | `renderer/src/topology/realization.ts` |
| Interactive 3D view | React Three Fiber realization display and construction guides | `renderer/src/topology/TopologyRealization3DView.tsx` |
| Editing and words | Diagram editing helpers and polygon-word parser/generator/classifier | `renderer/src/topology/editorTools.ts`, `renderer/src/topology/polygonWord.ts` |
| Animation plan | Identification-operation ordering and grouping | `renderer/src/topology/animationPlan.ts` |
| Validation | Structural diagnostic computations | `renderer/src/topology/diagnostics.ts` |
| File format | Versioned topology document schema | `renderer/src/topology/documentFormat.ts` |
| Desktop bridge | Native file-picker/read/write IPC | `src/main.ts`, `src/preload.ts` |

## Quality coverage already present

Unit tests cover quotient construction and triangulation; the recognized torus, Möbius, RP², Klein, cylinder, cone, sphere, and suspension realizations; polygon words; editor mutations; versioned document validation; animation-plan normalization/reordering; and structural diagnostics.

The release E2E check loads the Topology workspace and iterates its visible preset cards during a single desktop session, checking selected preset state and white-screen failures. It is intentionally a release/stability smoke check rather than comprehensive interaction coverage.

Relevant tests:

- `renderer/src/topology/quotientBuilder.test.ts`
- `renderer/src/topology/polygonWord.test.ts`
- `renderer/src/topology/editorTools.test.ts`
- `renderer/src/topology/documentFormat.test.ts`
- `renderer/src/topology/diagnostics.test.ts`
- `renderer/src/topology/animationPlan.test.ts`
- `tests/e2e/release-1-5-0-topology-complex.spec.ts`

## Boundary with the other modules

| Module | Owns | Not part of this Topology module |
| --- | --- | --- |
| Topology | Fundamental polygons, quotient construction, instructional realization/animation, CW-style inspection | General mesh editing, repair, remeshing, or geometric B-rep operations |
| Mesh | Discrete triangle-mesh topology, mesh validity/quality, repair and processing | Fundamental-polygon quotient authoring and teaching stories |
| Geometry | Semantic object/face/edge/vertex topology and geometric construction semantics | The standalone quotient-space editor and realization pipeline |

## Known scope limits / roadmap opportunities

These are **not currently evidenced as delivered capabilities** in the standalone Topology implementation and should be treated as roadmap candidates, not regressions:

1. General algebraic-topology calculations: homology/cohomology groups, Betti numbers, fundamental groups, induced maps, and chain-complex computations.
2. A general-purpose surface classifier. Current orientability, genus, and boundary outputs include recognized-construction hints; the quotient engine always provides structural counts, but does not establish a complete classification theorem for arbitrary input.
3. Robust manifold/validity certification beyond the implemented incidence, vertex-star, and boundary-cycle checks.
4. General geometric realization/embedding solving. Specialized R³ forms are pattern-recognized; unrecognized input uses generic immersed or flat schematic layouts.
5. Multi-face authoring UX, richer diagram constraints, guided pairing operations, and proof/explanation authoring beyond the present raw JSON and direct controls.
6. Direct interchange with Mesh/Geometry, import/export of common mesh formats, and a shared cross-module topology result/history model.
7. Broader workflow-level E2E coverage for authoring, document round trips, animations, diagnostics focus, and accessibility/responsive behavior.

## Suggested next roadmap decision

Before scheduling work, choose the primary product direction:

1. **Teaching lab:** improve guided constructions, explanations, exercises, and visualization polish.
2. **Topology workbench:** add general CW/simplicial complexes, algebraic invariants, certified validation, and interoperable results.
3. **Hybrid:** preserve the teaching workflows while building a reusable core for formal computations.

That choice determines whether the first roadmap milestone should emphasize authoring/learning UX or a new algebraic-computation foundation.
