# MATH3D — Topology Module Roadmap

**Status:** refined working roadmap
**Scope:** standalone Topology workspace, with bounded Mesh and Geometry integration
**Baseline:** MATH3D 1.4.9, inspected 2026-09-13

## Executive decision

Build Topology as a **hybrid teaching lab and computational workbench**. Preserve the current quotient-space teaching experience, but make each visual realization a consumer of a canonical combinatorial object—not the definition of the topology.

~~~text
fundamental diagram / CW source / Mesh snapshot
                     |
                     v
       canonical finite combinatorial complex
              |                     |
              v                     v
     exact computed analysis    visual realizations
              |             (diagram / schematic / immersion / embedding)
              v
         results, diagnostics, comparison, export
~~~

Initial formal scope is deliberately finite: combinatorial 2D CW complexes and 2D simplicial complexes from triangulated Mesh snapshots. This supports exact boundary maps, homology, surface eligibility, and group presentations without claiming a general topology prover.

## Existing baseline to preserve

The standalone module already includes:

- editable fundamental diagrams with directed edges, faces, labels, pairings, and boundary words;
- normalization, fan triangulation, equivalence classes, source-to-quotient maps, and CW-style quotient inspection;
- presets, regular polygon templates, raw-JSON/direct editing, undo/redo, and polygon-word utilities;
- Diagram, Quotient, Realization, Animation, and preset Compare views;
- generic and recognized specialized 3D displays; overlays, linked selection, stories, and animation plans;
- structural diagnostics, focused navigation, JSON/CSV diagnostics export, and .math3d-topology v1 persistence.

This roadmap extends that work. It must retain existing documents and teaching stories, including the ability to inspect malformed or singular spaces.

## Required correction: visual preset is not a formal proof

Preset names and 3D models are valuable teaching content, but a preset identity, boundary-word pattern, or surface-looking R3 image cannot by itself establish the formal type of the underlying quotient.

Before formal algebra becomes user-facing, audit every preset:

| Record | Required evidence |
| --- | --- |
| Source | Exact directed diagram, pairings, attachments, and word |
| Canonical result | Normalized CW complex with source-cell map |
| Intended type | Teaching label and checked combinatorial model |
| Computed result | Boundary maps, homology, eligibility, classification |
| Realization | Explicit embedded / immersed / schematic type and fidelity |
| Outcome | Retain, relabel visual analogy, migrate source, or split teaching/formal presets |

The audited canonical fixture—not a legacy display name—is the authority for algebraic regression tests. A disk whose full boundary is contracted, for example, can have a different cellular boundary map from a disk whose boundary segments remain a single identified 1-cell.

## Non-negotiable correctness rules

1. **Separate topology from realization.** Label every R3 model embedded, immersed, or schematic.
2. **Attach provenance to results.** Show method, coefficient domain, assumptions, source revision/hash, and algorithm version.
3. **Do not classify before eligibility.** Formal surface names require finite/connected/manifold/boundary/orientability checks.
4. **Use no floats in integral topology.** Integral homology and torsion require exact integer arithmetic and Smith normal form (SNF).
5. **Separate source, refinement, and display counts.** A temporary face fan or dense visualization mesh never changes canonical Euler characteristic.
6. **Unsupported input is an explicit result.** Preserve it, report the prerequisite that failed, and compute only what is valid.
7. **Equal invariants are inconclusive.** Compare cannot infer equivalence from currently matching calculations.

## Canonical architecture

~~~ts
type TopologySource =
  | { kind: "fundamental-diagram"; value: FundamentalDiagram }
  | { kind: "cw-complex"; value: CWComplexInput }
  | { kind: "simplicial-complex"; value: SimplicialComplexInput }
  | { kind: "mesh-snapshot"; value: MeshTopologySnapshot }
  | { kind: "geometry-snapshot"; value: GeometryTopologySnapshot };

type TopologyObject = {
  id: string;
  name: string;
  source: TopologySource;                 // authoritative
  canonical: CanonicalTopologyComplex;    // derived and versioned
  provenance: TopologyProvenance;
  analysis?: TopologyAnalysisResult;      // cache with source hash
  realizations: TopologyRealization[];    // non-authoritative
};
~~~

The first canonical model supports named 0-cells, oriented 1-cells (including loops), and oriented 2-cells attached by finite closed edge words. This is sufficient for the first cellular boundary implementation. Higher-dimensional CW cells, arbitrary continuous attaching maps, and tetrahedral complexes are later work.

Use a UI-independent core under renderer/src/topology/core. It must not import React, Electron, Three.js, Mesh, or Geometry. Mesh and Geometry adapters remain thin. Promote to a shared workspace package only if multiple adapters prove the need.

~~~ts
type TopologyResult<T> = {
  status: "exact" | "certified-within-model" | "recognized" |
    "heuristic" | "unknown" | "unsupported" | "failed";
  value?: T;
  method: string;
  assumptions: string[];
  sourceRevision: string;
  algorithmVersion: string;
  diagnostics: TopologyDiagnostic[];
};
~~~

## Analysis pipeline

~~~text
source -> canonicalize -> structural validation -> exact boundary operators
-> verify ∂1∂2 = 0 -> homology in chosen coefficients -> derived invariants
-> supported manifold eligibility / orientability -> surface classification when eligible
-> optional π1 presentation and visualizations
~~~

### Structural validation

Validate finite unique IDs, no dangling references, closed/contiguous oriented attachment walks, incidence/source-map consistency, boundary operator dimensions, components, boundary candidates, and supported edge/vertex links. The UI always names the model being checked: “2-manifold with boundary certified for canonical finite refinement” is meaningful; “valid manifold” derived from a rendered shape is not.

### Exact chain complexes and homology

For the v1 2D CW scope:

~~~math
0 \longrightarrow C_2 \xrightarrow{\partial_2} C_1
\xrightarrow{\partial_1} C_0 \longrightarrow 0.
~~~

- ∂1 derives from oriented edge endpoints.
- ∂2 derives from signed edge occurrences in a face attachment word.
- Integral matrices use bigint and SNF, retaining enough reduction information to map representative cycles to cells.
- Z/2Z is a separate exact finite-field path.
- The first UI supports Z and Z/2Z; Q and Z/pZ wait for a proven matrix API.

The Algebra view shows matrices, groups, Betti numbers, torsion, cell-linked rows/columns, and:

~~~math
\chi(X) = \sum_k (-1)^k c_k = \sum_k (-1)^k \beta_k.
~~~

This is an internal correctness and teaching cross-check, not a replacement for validation.

### Surface classification and π1

Classify only finite, connected, supported 2-manifolds with valid boundary data:

~~~math
\text{orientable: } \chi = 2 - 2g - b
\qquad
\text{non-orientable: } \chi = 2 - k - b.
~~~

Report genus or crosscap number only when the corresponding non-negative integer equation holds. A recognized preset can be shown separately.

After the CW core stabilizes, derive π1 presentations from a spanning tree of the 1-skeleton and 2-cell relators. Initial scope is derivation, transparent reductions, and abelianization cross-checked against H1; no general group-isomorphism solver.

## Product views and authoring

~~~text
Diagram | Complex | Algebra | Realization | Animation | Compare
~~~

| View | Responsibility |
| --- | --- |
| Diagram | Existing direct editing plus guided polygon-word workflow |
| Complex | Cells, attachments, incidence, source/refinement/display counts, stars, links, validity |
| Algebra | Matrices, coefficients, homology, torsion, Euler check, optional π1 |
| Realization | Existing views with explicit realization type and source mapping |
| Animation | Existing stories plus deterministic construction trace |
| Compare | Documents/invariants; distinguishes or reports inconclusive only |

Promote polygon words into a visible reversible flow:

~~~text
word -> parsed occurrences -> pairing/orientation review
-> recognized explanation -> build diagram -> canonical complex
~~~

The first multi-face editor is controlled rather than “general CW editing”: add/edit named 0/1/2-cells, edit/reverse closed attachment words, explicitly subdivide cells with source maps, inspect a cell browser, undo/redo, and focus diagnostics. Defer arbitrary contractions, auto-repair, and freehand face drawing.

## Cross-module integration

### Mesh → Topology

Accept a read-only triangulated snapshot with vertex IDs, oriented triangles, source revision, and Mesh element mapping. Return topology results and original IDs for Locate in Mesh. Flag incomplete indices, non-triangle data, missing orientation, and non-surface-dimensional data; do not guess or mutate Mesh.

### Geometry → Topology

Start with one explicit Geometry export which supplies a finite incidence complex—normally a chosen tessellation or a tightly documented semantic subset. Do not infer a reliable complex from arbitrary trims, open analytic surfaces, or unresolved B-rep-like data. Show conversion method/fidelity and map back only where correspondence exists.

## Persistence

Keep .math3d-topology v1 readable. v2 follows only after source/canonical contracts stabilize.

~~~text
v1 diagram -> construct canonical object -> mark legacy caches stale -> recompute
v2 source + canonical serialization + cache provenance + realizations + view state + history
~~~

In v2, source is authoritative; analysis caches include source hash, coefficient domain, and algorithm version; stale output never looks current; v1 documents may show a legacy-audit warning.

## Delivery milestones

### M0 — semantics and safety

| Deliverable | Acceptance |
| --- | --- |
| Realization metadata | RP2, Klein, and generic views never imply embedding |
| Result provenance | Existing counters/hints distinguish computed, recognized, heuristic, and unknown |
| Three count layers | Euler characteristic visibly uses canonical cells |
| Legacy audit | Existing documents load; corrected labels/warnings are permitted |

### M1 — canonical finite 2D complex

| Deliverable | Acceptance |
| --- | --- |
| Canonical CW contracts and source maps | Fundamental diagrams convert deterministically |
| Structural validation | Invalid attachments return focused diagnostics, never malformed analysis |
| Complex view | Every canonical cell can locate its source |
| Multi-face import | A two-face complex opens, validates, saves, and reloads |

### M2 — exact homology

| Deliverable | Acceptance |
| --- | --- |
| bigint boundary operators | Inspectable cells/matrices; no false ∂² PASS |
| Z and Z/2Z paths | Exact results independently tested |
| SNF | Free rank and torsion fixtures pass without floats |
| Algebra view | Matrix/group/Euler results link to cells |

### M3 — manifold eligibility and classification

| Deliverable | Acceptance |
| --- | --- |
| Links and orientability | Audited torus/cylinder/Möbius/RP2/Klein fixtures return correct status |
| Classification | Only eligible supported surfaces receive formal names |
| Focus mapping | Link/star/boundary results locate source and viable views |
| Teaching upgrade | Torus and Möbius stories show calculation provenance |

### M4 — authoring and interchange

| Deliverable | Acceptance |
| --- | --- |
| Guided words | Valid/malformed words have transparent outcomes |
| Multi-face editor | Edit, undo/redo, validate, save/reopen with stable source maps |
| v2 document | v1 migration and deterministic v2 recomputation |
| Mesh adapter | Read-only snapshot returns locatable results |
| Geometry pilot | One scoped export shows fidelity and rejects unsupported sources |

### M5 — advanced work

- CW π1 presentations and abelianization;
- document/invariant comparison and inspectable deterministic traces;
- Q and Z/pZ if needed;
- core extraction into a workspace package if adapters require it.

## Regression matrix and release gates

Formal fixtures are authored independently of legacy display labels:

| Space | H0 | H1 over Z | H2 | χ | Expected status |
| --- | --- | --- | --- | ---:| --- |
| Point | Z | 0 | 0 | 1 | n/a |
| Circle | Z | Z | 0 | 0 | not a 2D surface input |
| Sphere | Z | 0 | Z | 2 | orientable genus 0 |
| Torus | Z | Z² | Z | 0 | orientable genus 1 |
| Cylinder | Z | Z | 0 | 0 | orientable, boundary 2 |
| Möbius band | Z | Z | 0 | 0 | non-orientable, boundary 1 |
| RP2 | Z | Z/2 | 0 | 1 | non-orientable crosscap 1 |
| Klein bottle | Z | Z ⊕ Z/2 | 0 | 0 | non-orientable crosscap 2 |
| Moore space M(Z/3,1) | Z | Z/3 | 0 | 1 | no surface classification |
| Contractible degree-one 2-complex | Z | 0 | 0 | 1 | no classification unless independently eligible |

Each fixture verifies canonicalization stability, ∂1∂2 = 0, cell-Euler versus Betti-Euler equality, matrix-to-cell mapping, provenance, focused diagnostics, and cache invalidation.

E2E adds complete author/build/analyze flows, malformed-input handling, word workflows, multi-face save/reopen, story provenance, document comparison language, Mesh handoff, Geometry conversion fidelity, responsive layout, keyboard navigation, and accessibility.

An algebraic release requires: fixture matrix pass; no float arithmetic in the integral path; source/cache invalidation pass; existing Topology tests pass; typecheck and production build pass.

## Sequenced commits

| Order | Proposed change | Depends on |
| ---: | --- | --- |
| 1 | fix(topology): label realizations and separate count layers | none |
| 2 | refactor(topology): add provenance and canonical 2-complex contracts | 1 |
| 3 | feat(topology): validate CW attachments and expose Complex view | 2 |
| 4 | feat(topology): build exact cellular boundary operators | 3 |
| 5 | feat(topology): compute Z and Z2 homology with Smith normal form | 4 |
| 6 | feat(topology): add Euler-homology consistency and Algebra view | 5 |
| 7 | feat(topology): certify supported 2-manifold eligibility and classify surfaces | 3, 6 |
| 8 | feat(topology): add guided words and multi-face authoring | 2, 3 |
| 9 | refactor(topology): migrate documents to v2 with v1 compatibility | 2, 8 |
| 10 | feat(topology): derive CW π1 presentations and abelianization | 4, 5 |
| 11 | feat(topology): compare documents and invariants | 6, 9 |
| 12 | feat(topology): add read-only Mesh and scoped Geometry adapters | 2, 6 |
| 13 | test(topology): formal and end-to-end release gates | continuous; mandatory by 6 and 12 |

### Commit 1 — Realization labels and count-layer safety

**Status: complete (2026-09-14).**

Delivered:

- Added explicit `embedded`, `immersed`, or `schematic` metadata to every generated R³ realization; RP² and Klein bottle models are audited as immersed, generic/cut-open teaching models as schematic, and supported smooth surface models as embedded.
- Removed curve-name-based immersion inference and labeled realization authority in the Realization view, selector, right inspector, and Compare view.
- Added separate source-diagram, build-refinement, canonical-quotient, and display-geometry counts. Display mesh density cannot affect the canonical Euler characteristic.
- Made the quotient-complex calculation the sole displayed Euler source; preset/story recognition remains visibly a teaching hint rather than a formal result.
- Relabeled boundary/orientability values as recognized teaching hints and withholds formal genus/classification until the manifold-eligibility milestone is delivered.
- Added unit coverage for the complete preset realization audit and count independence, plus an Electron regression for the visible labels and count layers.

Where in the UI:

- Open **Topology**. The right-side **A. Structure** panel shows all count layers and the canonical Euler value.
- Select **Realization View** to see the active model labeled **Embedded**, **Immersed**, or **Schematic**, together with its non-authoritative status.
- Select **Compare View** to see the realization classification independently for both compared objects.

### Commit 2 — Provenance and canonical 2-complex contracts

**Status: complete (2026-09-14).**

Delivered:

- Added a UI-independent `topology/core` contract layer for authoritative fundamental-diagram, CW-complex, simplicial-complex, Mesh-snapshot, and Geometry-snapshot sources.
- Added a versioned finite canonical 2-complex model with named 0-cells, oriented 1-cells (including loops), and oriented 2-cell attachment words.
- Every canonical cell carries source/refinement references, preserving the route back to the authoring diagram while keeping build-only subdivisions explicit.
- Added deterministic source and canonical fingerprints, source/canonical revisions, and a versioned canonicalization method. Rebuilding identical input yields identical provenance; source edits invalidate the source revision.
- Added the shared `TopologyResult<T>` envelope with explicit evidence status, method, assumptions, source revision, algorithm version, and structured diagnostics.
- Attached the new `TopologyObject` to every quotient build while retaining `.math3d-topology` v1 loading; legacy cached builds reconstruct the missing contract on load.
- Added unit coverage for separation of authority, cell mappings, stable fingerprints, invalidation, and exact/unsupported result envelopes, plus visible provenance regression coverage.

Where in the UI:

- Open **Topology** and inspect the right-side **A. Structure** panel.
- The blue provenance card identifies the **authoritative source**, its deterministic revision, and the **derived canonical 2-complex** schema/canonicalizer version.
- Detailed canonical-cell inspection and attachment validation arrive in Commit 3's Complex view.

### Commit 3 — Structural validation and Complex view

**Status: complete (2026-09-14).**

Delivered:

- Added deterministic structural validation for the canonical finite 2-complex: unique/non-empty cell IDs, endpoint and attachment references, oriented closed/contiguous walks, source-map dimensions and targets, and stored incidence consistency.
- Canonical attachment orientation is now resolved against canonical edge endpoints after quotienting, preventing source-edge orientation from producing false failures.
- Added computed 1-skeleton components, boundary-edge candidates, edge-link occurrence classes, vertex-link connectivity/branching summaries, and expected dimensions for the upcoming exact boundary operators.
- Structural errors return focused `TopologyResult` diagnostics and gate later cellular algebra without discarding malformed inputs. Singular link patterns remain inspectable warnings: they withhold surface eligibility but do not invalidate general CW-complex algebra.
- Added a dedicated **Complex View** with separate 0-cell, oriented 1-cell, and 2-cell browsers; attachment words and walks; incidences; link summaries; source/refinement mappings; cell selection; and diagnostic focus actions.
- Added **Locate authoring source** actions for canonical cells with direct source mappings. Refinement-only cells stay explicitly labeled rather than pretending to be authored cells.
- Added a Structural Validation pipeline stage and right-inspector status/link. Cached v1 builds from before the contract change reconstruct current canonical incidence/validation data when loaded.
- Added unit coverage for all shipped presets and malformed canonical fixtures, plus Electron coverage for the Complex view and cell-to-source inspection.

Where in the UI:

- Open **Topology**, then choose **Complex View** beside the existing Diagram and Quotient Structure views.
- The top status card names the exact validation model and whether cellular algebra is allowed or gated.
- Select any 0-, 1-, or 2-cell to inspect its source/refinement map; use **Locate authoring source** when a direct source cell exists.
- Structural warnings and errors appear under **Focused structural diagnostics** and can select the affected canonical cell.
- The right-side **C. Diagnostics** panel also shows canonical validation status and provides **Open Complex view**.

### Commit 4 — Exact cellular boundary operators

**Status: complete (2026-09-14).**

Delivered:

- Added exact cellular chain groups `C₂ → C₁ → C₀` with deterministic cell-ID bases and row/column mappings back to canonical cells.
- Built `∂₁` as target-minus-source incidence for every oriented 1-cell, including exact cancellation for loop edges.
- Built `∂₂` by summing signed occurrences in each canonical 2-cell attachment word. Repeated occurrences and torsion-producing coefficients are retained exactly.
- All integral arithmetic uses `bigint`; persisted matrices use a documented decimal-bigint encoding so `.math3d-topology` v1 caches remain JSON-safe and lossless.
- Added exact bigint matrix composition and a mandatory `∂₁∂₂ = 0` check. Nonzero entries return cell-focused failed diagnostics rather than a false pass.
- Invalid structural input returns an explicit unsupported result and no matrices, preserving malformed objects for inspection while preventing invalid downstream algebra.
- Corrected the formal canonicalization boundary: authored quotient cells and attachment words define the canonical CW complex, while fan triangulation remains only a separate build refinement. The torus now correctly exposes the minimal `1 V / 2 E / 1 F` cellular presentation.
- Audited inconsistent edge ordering in the Torus, Klein bottle, Suspension, and Cylinder preset diagrams so their source boundary walks are contiguous before refinement.
- Added the Exact Boundary Operators pipeline stage, JSON-cache reconstruction, exact fixture matrices for torus/projective-plane/Klein presentations, and regression coverage over every shipped preset.

Where in the UI:

- Open **Topology → Complex View** and scroll below the cell browsers.
- **Exact cellular boundary operators over Z** displays `∂₁ : C₁ → C₀` and `∂₂ : C₂ → C₁`; rows and columns are labeled by selectable canonical cell IDs.
- The green chain-condition card shows **Exact chain condition ∂₁∂₂ = 0: PASS** when the certified matrices compose to zero.
- The right-side **C. Diagnostics** panel shows the exact-boundary result and chain-condition status. The full Algebra view and homology arrive in Commits 5–6.

### Commit 5 — Exact Z and Z/2Z homology with Smith normal form

**Status: complete (2026-09-14).**

Delivered:

- Added a versioned exact Smith normal form implementation using `bigint` throughout, with tracked left/right unimodular transforms and their inverses rather than diagonal invariants alone.
- Computed integral `H₀`, `H₁`, and `H₂` from the exact cellular chain complex. Results expose Betti numbers, invariant-factor torsion, readable group notation, and representative cycles in canonical cell coordinates.
- Restricted `∂₂` to the exact kernel basis of `∂₁` before the `H₁` quotient, retaining the basis transformations needed to map free and torsion generators back to selectable canonical 1-cells.
- Added a separate exact Gaussian-elimination path over `Z/2Z`; it does not infer finite-field results from integral Betti numbers or discard torsion effects.
- Stored every large integer as a decimal string in result payloads, keeping `.math3d-topology` v1 caches JSON-safe while retaining SNF reduction evidence and cell-linked representatives.
- Gated homology on exact boundary operators and a passing `∂₁∂₂ = 0` check. Invalid inputs return an explicit unsupported result instead of speculative groups.
- Added an Exact Homology pipeline stage and automatic reconstruction for cached legacy builds.
- Added audited fixture coverage for torus, projective plane, Klein bottle, and cylinder over both coefficient domains, including torsion, representative mappings, independent mod-2 behavior, serialization, and unsupported prerequisites.

Where in the UI:

- Open **Topology → Complex View** and scroll below **Exact cellular boundary operators over Z**.
- **Exact homology preview** shows `H₀`, `H₁`, and `H₂` first over `Z`, then over `Z/2Z`. Integral rows include Betti numbers and torsion orders.
- Each displayed representative coefficient is a button linked to its canonical cell; selecting it updates the existing canonical-cell inspector.
- The right-side **C. Diagnostics** panel shows the exact homology status and the current integral `H₁` summary.
- Full matrix/group comparison and the Euler–homology consistency check are now available in Commit 6's dedicated **Algebra View**.

### Commit 6 — Euler–homology consistency and Algebra view

**Status: complete (2026-09-14).**

Delivered:

- Added a versioned exact derived-invariant result comparing the canonical cell Euler characteristic with Betti-number Euler characteristics over both `Z` and `Z/2Z`.
- The consistency result is provenance-bearing and independently persisted in the topology analysis cache. Missing homology returns unsupported; any disagreement returns a failed result with a precise coefficient-domain diagnostic.
- Added a dedicated **Algebra View** to the primary Topology view switcher and `.math3d-topology` v1 cached view state.
- The Algebra view displays exact `∂₁` and `∂₂` matrices with canonical cell row/column labels, integral and mod-2 homology groups, Betti numbers, torsion, representative cycles, and retained SNF diagonals.
- Matrix headers and representative terms navigate directly to the selected canonical cell in Complex View, preserving the source/refinement inspection path.
- Added a visible three-way Euler check: canonical cell counts, integral Betti numbers, and mod-2 Betti numbers. Each equation receives its own PASS/FAIL result.
- Added an Euler–Homology Consistency pipeline stage, right-side diagnostic status/action, and automatic reconstruction for legacy cached builds.
- Added unit coverage across every shipped preset, explicit mismatch/unsupported behavior, type/persistence coverage, and Electron navigation/content regression checks.

Where in the UI:

- Open **Topology → Algebra View** beside Complex View.
- The top matrices show `∂₁ : C₁ → C₀` and `∂₂ : C₂ → C₁`; select any row or column cell ID to inspect it in Complex View.
- The two group panels show `H₀`–`H₂` over `Z` and `Z/2Z`, including integral torsion and selectable representative cycles.
- The bottom **Euler–homology consistency** card shows the cell-count equation and both Betti-number equations with exact PASS/FAIL status.
- The right-side **C. Diagnostics** panel also shows the consistency status and provides **Open Algebra view**.

### Commit 7 — Supported 2-manifold eligibility and formal surface classification

**Status: complete (2026-09-14).**

Delivered:

- Added a versioned formal certificate for the finite connected compact 2-manifold model with optional boundary. Preset names and R³ realizations never grant eligibility.
- Certified every canonical edge link as boundary/interior only when it has exactly one/two face occurrences; isolated and higher-valence edge links withhold classification with cell-focused evidence.
- Added multiplicity-aware vertex-link reconstruction. A vertex is supported only when its link is one connected circle or interval; disconnected, branched, isolated, and invalid-degree links are reported explicitly.
- Certified the boundary subcomplex independently as a disjoint union of circles and computed its connected components only after every boundary vertex has degree two.
- Added signed face-orientation propagation across interior edges, including self-identifications. Conflicting signs provide an exact non-orientability certificate rather than relying on a recognized word label.
- Applied the compact-surface equations only after every eligibility check passes: `χ = 2 - 2g - b` for orientable surfaces and `χ = 2 - k - b` for non-orientable surfaces.
- Added formal names for the audited sphere, torus, cylinder/annulus, Möbius band, projective plane, and Klein bottle cases, with general genus/crosscap labels for other supported inputs.
- Corrected the Möbius rectangle preset to the canonical same-boundary-direction attachment word `b a c a`; its former `b a c a^-1` formal data described the cylinder-like orientation class.
- Kept singular Dunce, cone-contraction, and sphere-boundary-contraction teaching presets inspectable but formally unclassified. A smooth or familiar-looking display is not allowed to override failed edge/vertex-link evidence.
- Added the classification pipeline stage, formal diagnostic/export data, cell-focus actions, and provenance-backed teaching cards in the Torus/Möbius realization stories.
- Added audited unit fixtures for torus, cylinder, Möbius band, projective plane, Klein bottle, singular non-surfaces, and an independently authored two-bigon sphere, plus persistence and Electron regression coverage.

Where in the UI:

- Open **Topology → Algebra View** and scroll below the Euler check to **Surface eligibility & formal classification**.
- The classification appears only above a complete grid of PASS results for finite 2D input, connectedness, edge links, vertex links, boundary circles, and exact algebraic consistency.
- Expand **Vertex-link and orientation evidence** for circle/interval link details and the signed face-orientation certificate.
- Any failed check includes **Inspect cell** actions that open the affected canonical cell in Complex View.
- The right-side **C. Diagnostics** panel separates recognized teaching hints from certified boundary/orientability values and the formal surface name.
- Torus and Möbius **Realization View** stories now include a formal certificate card explaining that classification comes from the canonical complex, not the rendered R³ model.

### Commit 8 — Guided words and controlled multi-face authoring

**Status: complete (2026-09-14).**

Delivered:

- Promoted polygon words into a visible review pipeline: strict token parsing, normalized signed word, occurrence numbers, peer positions, pairing status, diagnostics, recognized explanation, diagram construction, and immediate canonical rebuild.
- Malformed tokens now withhold recognition and building with actionable diagnostics. Single occurrences are identified as retained boundary edges; labels used more than twice are explicitly marked as non-surface multi-identifications rather than silently treated as ordinary pairs.
- Added controlled named 2-cell authoring with a face browser, closed attachment-word editing, deterministic label/edge-ID resolution, attachment reversal, face creation/deletion, and a direct validate-and-focus action.
- Added explicit diagonal subdivision for source faces with four or more boundary occurrences. The original source face ID remains stable, the new face and diagonal receive deterministic IDs, and the canonical source maps rebuild from the edited source.
- Corrected boundary-word regeneration to combine boundary traversal with authored edge orientation, so inverse signs survive edits, undo/redo, and later persistence.
- Retained the existing named 0-/1-cell editor, direct diagram tools, raw JSON escape hatch, and bounded undo/redo history while continuing to defer arbitrary contractions, auto-repair, and freehand face drawing.
- Added unit coverage for valid/malformed word review, boundary/overused-label outcomes, signed attachment preservation, multi-face authoring, reversal, and Euler-preserving diagonal subdivision.

Where in the UI:

- Open **Topology**, select **Editor mode**, and use **Guided polygon word** above the edge table. Type a word such as `a b a^-1 b^-1`; the occurrence table shows signs, peers, and status before **Build reviewed diagram + canonical complex** becomes available.
- In the same left panel, use **Controlled CW authoring** below the edge table to select a face, rename it, edit/reverse its closed attachment, add or delete a face, or subdivide it by a deterministic diagonal.
- Choose **Validate + focus diagnostics** to rebuild and open **Complex View**, where canonical cells, source mappings, attachment validity, and focused diagnostics are inspectable.
- Existing **Undo/Redo** controls in Diagram View cover these source edits. Stable v2 save/reopen of this history and source mapping is delivered by Commit 9.

### Commit 9 — Source-authoritative v2 documents with v1 compatibility

**Status: complete (2026-09-14).**

Delivered:

- Advanced `.math3d-topology` writes to format v2 while retaining a strict read-only v1 compatibility shape.
- V2 serializes the authoritative `TopologySource`, derived canonical complex and provenance, analysis-cache source/canonical fingerprints, coefficient domains, per-stage algorithm versions, realization choices, view state, animation plan, and bounded undo/redo history.
- Added one deterministic load/migration entry point. Both v1 and v2 documents rebuild the canonical complex and exact analysis from the authoritative source; serialized caches are never trusted as the mathematical authority.
- V1 loads ignore legacy cached build results, preserve compatible view/animation choices, produce a visible legacy-audit warning, and materialize a current v2 document model in memory.
- V2 loads verify the serialized canonical value, source/canonical fingerprints, and every analysis algorithm version. A mismatch is labeled stale and recomputed; current data is also freshly reproduced and reported as verified.
- Multi-face documents retain stable authored face IDs, canonical source references, and undo/redo snapshots through JSON save/reopen.
- Added regression coverage for v2 contents and JSON safety, v1 detection/migration with a deliberately incorrect cache, current-v2 verification, tampered/stale-v2 invalidation, and multi-face source-map/history round trips.

Where in the UI:

- Open **Topology** and scroll to **Topology document** in the left panel. Saving now writes v2 automatically; the blue audit line states that source is authoritative and the canonical/cache fingerprints are current.
- Load an existing v1 file with **Load .math3d-topology**. The status reports that v1 was migrated and all derived results were recomputed; the audit line explicitly labels the legacy audit.
- Load a v2 file to see either **derived cache current** or **derived cache recomputed**. A stale cache is never displayed as current analysis.
- V2 restores the saved Diagram/Complex/Algebra/Quotient/Realization/Animation view, realization choice, animation plan, and authoring undo/redo history.

### Commit 10 — CW fundamental-group presentations and abelianization

**Status: complete (2026-09-14).**

Delivered:

- Added a UI-independent, versioned derivation of a finite connected 2D CW fundamental-group presentation from the canonical complex.
- Builds a deterministic maximal tree of the canonical 1-skeleton, collapses its edges, assigns one inspectable generator to each non-tree 1-cell, and derives one relator from each oriented 2-cell attachment.
- Retains a step-by-step reduction audit for every relator: authored/canonical word, tree-collapse projection, adjacent free cancellations, cyclic-end cancellations, and final reduced word.
- Computes the presentation abelianization over exact `bigint` integers using a generator-by-relator exponent-sum matrix and Smith normal form.
- Cross-checks free rank and torsion factors against the independently computed exact integral `H₁`. A mismatch is a failed result rather than a silently displayed presentation.
- Explicitly withholds a single-basepoint presentation for disconnected or structurally invalid input; no general groupoid or group-isomorphism solver is claimed.
- Added the result and algorithm version to pipeline provenance, v2 cache provenance, legacy-cache reconstruction, the Algebra view, and the right diagnostics summary.
- Added exact fixtures for torus, projective plane, Klein bottle, a real free-cancellation trace, and disconnected-input withholding.

Where in the UI:

- Open **Topology → Algebra View** and scroll below the homology groups to **Fundamental group π₁ presentation**.
- The first line shows `π₁(X, base) = ⟨generators | relators⟩`. Select a generator to inspect its canonical 1-cell and source mapping.
- Expand any relator to see the source boundary word and every tree-collapse/free-reduction step; use **Inspect 2-cell** to locate its attachment in Complex View.
- The green abelianization row compares the exact SNF result with independently computed `H₁` and displays **PASS** only when free rank and torsion agree.
- The right-side **C. Diagnostics** panel also reports the presentation status and compact group presentation.

### Commit 11 — Document and invariant comparison

**Status: complete (2026-09-14).**

Delivered:

- Replaced the preset-only comparison summary with a versioned, UI-independent invariant comparison report.
- Compare now accepts any mixture of shipped presets, the current live workspace, and saved `.math3d-topology` v1/v2 documents. Comparison loads are read-only and never replace the active workspace.
- Saved inputs use the v2 migration/audit path: v1 caches are ignored and recomputed, while v2 fingerprints and algorithm versions are verified before comparison.
- Compares exact Euler characteristic and `H₀`–`H₂` over `Z` and `Z/2Z`, plus orientability, boundary-component count, and genus/crosscap data only when both inputs have certified compact-surface results.
- A difference in an exact/certified invariant produces a precise **DISTINGUISHED** witness. If no available invariant differs, the result is **INCONCLUSIVE** and explicitly says that equivalence/homeomorphism remains unproved.
- Shows derived π₁ presentation text and R³ realization type for context but never treats differences in either as distinguishing evidence: different presentations may define isomorphic groups, and display models are non-authoritative.
- Retained synchronized side-by-side realization controls while adding a complete evidence table with authority, values, result state, and the mathematical meaning of each row.
- Added regression fixtures for homology witnesses, certified-surface witnesses, matching-invariant inconclusiveness, and non-authoritative presentation/realization differences.

Where in the UI:

- Open **Topology → Compare View**.
- For either side, choose a preset, select **Use current workspace**, or choose **Load document…** for a saved v1/v2 topology file. The source/audit line identifies exactly what is being compared.
- The side-by-side R³ models remain available for visual context. Scroll to **Compare documents and invariants** for the authoritative comparison report.
- A red **DISTINGUISHED** result lists every exact/certified witness. An amber **INCONCLUSIVE** result means only that the current computations found no difference—not that the objects are equivalent.

## Deferred research layer

Do not schedule before the above release gates are stable:

- higher-dimensional simplicial/CW complexes and tetrahedral input;
- cohomology and cup products;
- induced maps on homology;
- persistent homology and filtrations;
- general realization or embedding solving.

## Definition of success

The first full-workbench release lets a user create or load a supported finite 2D complex, inspect canonical cells and attachments, see exact boundary matrices, compute H0–H2 over Z and Z/2Z, understand why classification is available or withheld, and trace every result to source cells—while preserving existing quotient stories and visualizations without conceptual ambiguity.
