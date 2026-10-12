# Scientific Scene Runtime — additive roadmap

**Status (2026-10-12):** SSR-00–04 complete for the two bounded proof fixtures, with [lifecycle measurements and limitations](scientific-scene-lifecycle-measurements.md). SSR-05 adds a [standalone Python publisher](../integrations/python/README.md); SSR-06 onward remains deferred as marked below. This extends the M3D-Q program; it does not replace or renumber it.

**Boundary:** `quantum-scene/v1|v2` remains a frozen, Lab-owned interchange format and `.qscene` remains readable. A future producer-neutral `scientific-scene/v1` must be an additional, versioned format and adapter path. Math3D remains the independent consumer; it does not call the Theory Lab worker.

## Goal

Let Theory Lab and, later, non-quantum producers provide typed scientific datasets and optional declarative views to Math3D. Math3D remains primarily a visualization, analysis and editing application: it imports, validates, views and selects scientific data, but it does not contain a Python interpreter or bundle CGAL, VTK or Sage for this feature. Keep source artifacts, scene interpretation, derived display quantities, and editable Project documents distinct. A worker or producer supplies values, coordinates, units and provenance; Math3D chooses the presentation from safe, declared capabilities. Supplied geometry may also be retained when it is part of the verified source—Math3D must not silently regenerate or reinterpret it.

```text
independent producer → immutable artifact(s) → versioned scientific scene
                                               ├─ existing viewers + exact selection
                                               └─ optional Project artifact link

existing Theory Lab result → quantum-scene/v1|v2 → compatibility adapter ─┘
```

## SSR-00 — compatibility map (complete)

The field-by-field map and evidence are in [the compatibility map](scientific-scene-compatibility-map.md). It covers the Lab scene contract, Math3D importer, Project document, exact-sample selection and scientific job service. Its primary finding is that the generic runtime should reuse those safety and lifecycle primitives, while adding semantics that the current quantum-specific schema cannot express. No existing bundle or Project document is migrated by SSR-00.

## Lean first delivery

| Gate | Status | Deliverable | Acceptance |
| --- | --- | --- | --- |
| SSR-01 | Complete | Measure baseline footprint; define a small, pure `scientific-scene/v1` manifest and binary dataset-reference contract in shared TypeScript. | [Contract and checks](scientific-scene-v1-contract.md): no runtime/worker import, executable formula or URL; strict versions, semantic types, coordinates, units, shape, encoding and hashes; repeatable footprint measurement. |
| SSR-02 | Complete | Adapt one pinned **hydrogenic 2p** `.qscene` through the generic manifest while retaining the old importer and exact source bytes. | Both paths verify the same source hashes, complex grid, units and provenance; existing `.qscene` open/restart/tamper tests remain green. The compatibility adapter is read-only and has no new UI entry point. |
| SSR-03 | Complete | Add one deterministic **non-quantum** scalar-field fixture, `f(x,y)=sin(x)cos(y)`, and display it through an adapter to existing Math3D surface/selection infrastructure. | The same manifest validator admits both proof fixtures. The bundled scalar surface uses GeometryViewer/SurfaceViewer; sample selection re-verifies source bytes, coordinates and units. Changed metadata or binary bytes are refused. No Python runtime is involved. This is a bundled example, not a general-purpose file picker or Project document. |
| SSR-04 | Complete, bounded proof | [Measured](scientific-scene-lifecycle-measurements.md) loading, idle/startup cost, display copies and unload for both fixtures. Exact sample selection now uses a stable source ID and reads one verified value, not a new whole-array copy. The main adapter caps the display before transfer and close clears its active source. | No material measured startup regression; +3,389 B all-JS gzip versus pre-contract baseline; canvas and WebGL context release verified on close. OS working set remains cache-warm, so full memory return is **not** claimed. A pick names scene/dataset/sample, not display LOD. |

SSR-01–04 are the mandatory first release. They prove one existing quantum bundle **and** one non-quantum fixture and test the cost before any Python integration. Existing `SurfaceViewer`, GeometryViewer, Volume and graph/picking infrastructure are reused; there is no second renderer.

## Optional follow-ons — separate decisions

| Gate | Status | Deliverable | Condition |
| --- | --- | --- | --- |
| SSR-05 | Complete, publisher only | [Standalone Python publisher](../integrations/python/README.md) writes compatible bounded scalar or complex fields outside Electron. | Cross-language scalar/complex fixtures, byte integrity, exact samples, limits, non-overwrite and tamper refusal. No embedded interpreter, app-launched Python or general UI picker is claimed. |
| SSR-06 | Deferred | Opt-in Python runtime bridge using the existing `ScientificJobService` and an independently managed environment. | Only if a real workflow needs Math3D-initiated compute; explicit trust, supervision, cancellation and resource limits. Zero Python processes while unused. |
| SSR-07 | Deferred | Dedicated scientific workspace, richer inspector and camera/view presets. | Demonstrated demand after the shared viewer proves useful; existing modal and M3D-Q path remain functional. |
| SSR-08 | Deferred | New `ScientificSceneDocument`, live streaming, Jupyter or remote providers, large/chunked artifacts. | Each requires an independent use case and budget. Start with lightweight Project artifact references; do not proliferate document types pre-emptively. |

QWZ, SSH, vector/tensor fields, Jupyter, remote compute, VTK/CGAL publication and editable promotion are not claims of SSR-01–04. Python, CGAL, VTK and Sage remain external processes/services; desktop, web and mobile may consume the same small contract with platform-specific rendering capabilities.

## Footprint targets (measure, then enforce)

These are engineering targets, not present guarantees: under 100 KiB compressed incremental initial JavaScript, no scientific process while idle, no CGAL/VTK in frontend code, no avoidable full-array copies into React state, and release of scene-owned CPU/GPU buffers on close. The [pre-contract baseline](scientific-scene-footprint-baseline.md) records reproducible build and idle measurements. Compare the same build target and machine; define CI thresholds from measured noise rather than claiming literally zero memory or zero startup time.

## Contract rules to freeze before implementation

1. Preserve `quantum-scene/v1|v2`, its existing binary hashes, memory limits, exact IDs and fail-closed admission. The generic adapter cannot make an invalid old bundle valid.
2. Distinguish a source dataset from a view and from a derived display quantity. Derivations use registered, versioned operations with declared units and inputs; a bundle cannot submit code for Math3D to evaluate.
3. A coordinate descriptor declares the native data axes and mapping to a displayed view. Reciprocal `k`, lattice/site index and Cartesian position are not interchangeable merely because they have three displayed coordinates.
4. A camera is an optional view hint, not scientific source truth. Supplied geometry and source sample IDs remain traceable even when Math3D changes the camera, decimates the display or constructs a derived surface.
5. Hashes establish byte integrity, not producer authenticity or physical validity. Provenance claims are displayed as supplied unless independently checked.
6. “Verified,” “live” and “in a Project” are orthogonal properties: a Project may link an immutable verified source. Do not encode them as one exclusive scene mode.
7. Keep computation out of import. Provider execution requires explicit user action, capability checks and a bounded job; no scene file can invoke a worker.

## Deferred decisions

- Whether the small cross-platform contract should later be extracted from shared `packages/core` into a `packages/contracts` workspace depends on actual consumers and bundle measurements. The Lab-owned quantum schema is not relocated.
- Generic Project artifacts initially link a verified source without a new document type. A dedicated document follows only if independent edit/save/compare/organization workflows require it; the existing `QuantumSceneDocument` remains supported.
- Chunk format, compression and remote addressing wait for a measured large-dataset use case. JSON remains for bounded manifests, not large numerical arrays.
- A Python/Jupyter API is not a shortcut around artifact admission. A standalone publisher can precede a separately approved runtime bridge.

## Relationship to current roadmaps

This program follows [M3D-Q01–Q10](math3d-quantum-integration-roadmap.md) and its current verified scene viewer. It does not change that roadmap's delivered-status claims. Theory Lab's `docs/QUANTUM_SCENE.md` continues to own the quantum scene contract; Math3D independently validates it. The [scene design snapshots](assets/screenshots/quantum-scenes-design-2026-10-12/README.md) are visual evidence for the deferred workspace/design gate, not schema evidence.
