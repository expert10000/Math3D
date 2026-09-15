# MATH3D Topology v1 release gates

**Gate owner:** Topology module  
**Status:** formal migration closed and passing on 2026-09-15
**Authoritative command:** `npm run test:topology:v1:acceptance`

## Formal fixture matrix

The mandatory unit gate covers Point, Circle, Sphere, Torus, Cylinder, Möbius band, RP², Klein bottle, Moore `M(Z/3,1)`, and a contractible degree-one 2-complex.

For every fixture it verifies:

- deterministic canonicalization hash;
- structural validity and source-cell mapping;
- exact decimal-`bigint` boundary matrices over `Z`;
- `∂₁∂₂ = 0`;
- expected integral Betti numbers and `H₁` torsion;
- exact `Z/2Z` computation through the shared pipeline;
- Euler–homology consistency;
- CW presentation abelianization agreement with exact `H₁`;
- algorithm/source provenance.

The same gate verifies that a stale v2 cache is discarded and recomputed from its authoritative source. Adapter fixtures additionally prove that incomplete Mesh indices, oversized interactive exact computations, and unresolved or unsupported Geometry conversions are rejected rather than guessed or allowed to freeze the renderer.

A generated degree-`n` attaching-map property matrix (`n = 1…12`) verifies exact
chain conditions, integral torsion, mod-2 parity behavior, and Euler/homology
consistency beyond the named fixture corpus.

## Sage differential and execution safety

The dedicated Sage gate validates the constrained sparse-matrix request/response
contract against local exact results. It covers engine and source provenance, torsion
publication, stale-result rejection, unavailable-engine fallback, timeout,
cancellation, late-output suppression, malformed results, and size limits. Local
fallback remains explicitly labeled `Z/2Z`; it is never presented as integral
homology.

## Production mutation route

All completed Topology source edits, drag completions, imports, undo, redo, replay,
and reopened legacy history now enter through `TopologyDiagramCommandAdapter` and the
application kernel. The former React snapshot-history fallback has been removed.
Released v1/v2 files still open, but their source history is migrated once into
kernel transactions before it becomes interactive. V3 remains the normal replayable
save format.

## End-to-end gate

`npm run test:topology:v1:e2e` covers:

- authoritative source/refinement/canonical/display count separation;
- Complex View cells, attachments, exact matrices, chain condition, and source mapping;
- Algebra View integral/mod-2 homology, Smith normal form, Euler consistency, π₁ presentation, and abelianization;
- certified surface classification and withheld-claim language;
- non-authoritative R³ realization labels;
- exact/certified comparison witnesses and inconclusive equivalence language;
- read-only current-Mesh and selected-Geometry handoffs, visible fidelity, responsive budget refusal for dense tessellations, and Locate-source navigation when correspondence is available.

Existing document tests retain malformed/stale input, v1 migration, multi-face save/reopen, and history checks. Existing responsive smoke coverage remains part of the aggregate acceptance command.

## Commands

```text
npm run test:topology:v1:unit
npm run test:topology:v1:sage
npm run typecheck:noemit
npm run build:core
npm run test:topology:v1:e2e
npm run test:app:responsive:smoke
npm run test:topology:v1:formal
```

The aggregate command executes these gates in order. The completed local gate passed
146 Topology tests across 26 files, 8 dedicated Sage/publication tests across 2
files, cross-project TypeScript, desktop and renderer production builds, 2 Electron
semantic/realization journeys, and phone/tablet/desktop responsive smoke coverage.
A release is blocked by any failed step.

Higher-dimensional complexes, cup products, persistent homology, general
group-isomorphism solving, and embedding proofs remain outside v1 scope. Existing
fundamental-diagram authoring, v1/v2 document loading, raw diagram import, Geometry
tessellation handoff, and non-authoritative realization modes remain supported; none
was removed to close this migration.
