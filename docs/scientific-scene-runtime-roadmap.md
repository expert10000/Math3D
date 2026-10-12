# Scientific Scene Runtime — additive roadmap

**Status (2026-10-12):** SSR-00 compatibility map complete. SSR-01 onward planned, not implemented by this document. This extends the M3D-Q program; it does not replace or renumber it.

**Boundary:** `quantum-scene/v1|v2` remains a frozen, Lab-owned interchange format and `.qscene` remains readable. A future producer-neutral `scientific-scene/v1` must be an additional, versioned format and adapter path. Math3D remains the independent consumer; it does not call the Theory Lab worker.

## Goal

Let Theory Lab and, later, non-quantum producers provide typed scientific datasets and optional declarative views to Math3D. Keep source artifacts, scene interpretation, derived display quantities, and editable Project documents distinct. A worker or producer supplies values, coordinates, units and provenance; Math3D chooses the presentation from safe, declared capabilities. Supplied geometry may also be retained when it is part of the verified source—Math3D must not silently regenerate or reinterpret it.

```text
producer result → immutable artifact(s) → versioned scientific scene
                                            ├─ read-only views + exact selection
                                            └─ optional linked Project document

existing Theory Lab result → quantum-scene/v1|v2 → compatibility adapter ─┘
```

## SSR-00 — compatibility map (complete)

The field-by-field map and evidence are in [the compatibility map](scientific-scene-compatibility-map.md). It covers the Lab scene contract, Math3D importer, Project document, exact-sample selection and scientific job service. Its primary finding is that the generic runtime should reuse those safety and lifecycle primitives, while adding semantics that the current quantum-specific schema cannot express. No existing bundle or Project document is migrated by SSR-00.

## Delivery sequence

| Gate | Status | Deliverable | Acceptance |
| --- | --- | --- | --- |
| SSR-01 | Planned | Define `scientific-scene/v1` envelope, typed dataset/coordinate descriptors, source relationships and declarative view hints. | Strict schema, bounded references, units/shape/encoding checks and unknown-version refusal. No executable formulas or URLs in a bundle. |
| SSR-02 | Planned | Adapt one pinned **hydrogenic 2p** `.qscene` into the generic reader without rewriting its bytes or changing the original importer. | Both paths verify the same source hashes, complex grid, units and provenance; existing `.qscene` open/restart/tamper tests still pass. |
| SSR-03 | Planned | Add one deterministic **non-quantum** scalar-field fixture, `f(x,y)=sin(x)cos(y)`, as a generic artifact and scene. No Python runtime is involved. | Independent generic import displays source grid, axes, units, a bounded view and exact sample values; changed metadata or binary bytes are refused. This is the first proof the contract is not quantum-specific. |
| SSR-04 | Planned | Normalize source-backed selection and registered display derivations across the two fixtures. | A pick names scene/dataset/sample and returns verified source values; density and phase are labelled derived, with a fixed algorithm ID/version and source fingerprint. Stale results are refused. No arbitrary expression evaluation. |
| SSR-05 | Planned | Admit a generic read-only `ScientificSceneDocument` into Projects, alongside the existing `QuantumSceneDocument`. | Source location stays separate from hashed identity; save/restart/relink/tamper acceptance preserves old Projects and old quantum links. No implicit conversion to editable Mesh/Volume. |
| SSR-06 | Planned | Build a scientific scene workspace with dataset/view navigation, source-aware camera hints and separate Scientific, Selection, View, Run and Provenance inspector sections. | Quantum and non-quantum proof fixtures share the workspace; existing SSH/QWZ views remain accessible in the old viewer until their adapters pass parity. Camera framing and unavailable-state labels are tested. |
| SSR-07 | Planned | Introduce a provider boundary by extending the existing bounded `ScientificJobService`, not duplicating its request/events/cancel/stale-source logic. | Two in-process/non-Python adapters demonstrate the interface; resource/deadline limits and event ordering remain tested. No direct renderer process execution. |
| SSR-08 | Planned | Add an opt-in local Python provider and publication helper only after SSR-02/03 pass. | Explicit trust and environment policy, supervised process lifecycle, cancellation, bounded outputs, versioned artifacts and source verification. No arbitrary Python from imported scenes or the React renderer. |
| SSR-09 | Planned | Extend binary resources to larger/chunked datasets and progressive views when a measured fixture requires them. | Per-chunk integrity, bounded memory and back-pressure; incomplete streams never masquerade as verified final artifacts. Existing 16 MiB `.qscene` rule stays unchanged. |

SSR-01–03 are the first implementation tranche. They must prove one existing quantum bundle **and** one non-quantum fixture before any Python provider work starts. QWZ, SSH, vector/tensor fields, Jupyter, remote compute, VTK/CGAL publication and editable promotion are follow-on adapters, not claims of SSR-01–03.

## Contract rules to freeze before implementation

1. Preserve `quantum-scene/v1|v2`, its existing binary hashes, memory limits, exact IDs and fail-closed admission. The generic adapter cannot make an invalid old bundle valid.
2. Distinguish a source dataset from a view and from a derived display quantity. Derivations use registered, versioned operations with declared units and inputs; a bundle cannot submit code for Math3D to evaluate.
3. A coordinate descriptor declares the native data axes and mapping to a displayed view. Reciprocal `k`, lattice/site index and Cartesian position are not interchangeable merely because they have three displayed coordinates.
4. A camera is an optional view hint, not scientific source truth. Supplied geometry and source sample IDs remain traceable even when Math3D changes the camera, decimates the display or constructs a derived surface.
5. Hashes establish byte integrity, not producer authenticity or physical validity. Provenance claims are displayed as supplied unless independently checked.
6. “Verified,” “live” and “in a Project” are orthogonal properties: a Project may link an immutable verified source. Do not encode them as one exclusive scene mode.
7. Keep computation out of import. Provider execution requires explicit user action, capability checks and a bounded job; no scene file can invoke a worker.

## Deferred decisions

- Whether the new generic contract belongs in `packages/core` or a separate package is decided in SSR-01 after dependency-direction tests; the Lab-owned quantum schema is not relocated.
- Chunk format, compression and remote addressing wait for SSR-09 measurements. JSON remains for bounded manifests, not large numerical arrays.
- A Python/Jupyter API is deliberately not designed as a shortcut around artifact admission. A minimal publish API can follow the provider security model in SSR-08.

## Relationship to current roadmaps

This program follows [M3D-Q01–Q10](math3d-quantum-integration-roadmap.md) and its current verified scene viewer. It does not change that roadmap's delivered-status claims. Theory Lab's `docs/QUANTUM_SCENE.md` continues to own the quantum scene contract; Math3D independently validates it. The [scene design snapshots](assets/screenshots/quantum-scenes-design-2026-10-12/README.md) are visual evidence for SSR-06, not schema evidence.
