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

## Deferred research layer

Do not schedule before the above release gates are stable:

- higher-dimensional simplicial/CW complexes and tetrahedral input;
- cohomology and cup products;
- induced maps on homology;
- persistent homology and filtrations;
- general realization or embedding solving.

## Definition of success

The first full-workbench release lets a user create or load a supported finite 2D complex, inspect canonical cells and attachments, see exact boundary matrices, compute H0–H2 over Z and Z/2Z, understand why classification is available or withheld, and trace every result to source cells—while preserving existing quotient stories and visualizations without conceptual ambiguity.
