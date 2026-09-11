# Geometry professional workflow freeze

Freeze date: 2026-09-11

The professional Geometry workflow uses the same scientific scene, semantic identity, revision model, result lifecycle, and Geometry↔Mesh trace system across analytic and discrete work.

| Region | Frozen responsibility |
| --- | --- |
| Left | Choose the Geometry task, construction or analysis parameters, and primary configuration. |
| Center | Interact with the shared scene, semantic selection, previews, overlays, and camera. |
| Right | Explain Selection, Geometry, Analysis, Diagnostics, Provenance, History, and Actions. |

## Frozen acceptance journeys

1. **Construct → Select → Inspect → Analyze:** semantic identity and source revision remain stable.
2. **Construct → Modify → Analyze → Compare revisions:** both revisions remain visible with explicit provenance.
3. **Validate → select issue → frame issue → inspect or repair:** diagnostics never silently mutate exact Geometry.
4. **Geometry → derived Mesh → Mesh Analyze → exact-versus-discrete Compare:** analytic and discrete values remain visibly distinct.
5. **Mesh derivative → Open Geometry Source → mapped selection → analytic analysis:** trace confidence and source identity remain inspectable.
6. **Analyze → Save → modify source → stale warning → recompute/compare:** stale payload remains inspectable but cannot drive the viewport.
7. **Gallery/New/Demo/Procedural/Scratch/Workbook/Construction Lab/Scene Script round trip:** established entry points remain reachable and saved state round-trips.

## Frozen UI decisions

- The Procedural, Demo preview, Scratch editor, and Workbook scene strip remains as secondary navigation.
- Object Gallery and Scene Gallery remain separate choices under the expandable Gallery group.
- Scratch remains available both from New and from the mode strip.
- Scene Script remains under More and in its established Procedural panel.
- Geometry keeps semantic topology tools; operations that require discrete topology continue through the linked Mesh workflow and are labeled as mesh edits.
- Existing duplicate controls remain during this freeze. Nothing is removed without a separately reviewed and accepted replacement.

## Result and cross-module invariants

- Exact Geometry and discrete Mesh values are never merged into an ambiguous result.
- Saved analysis results preserve parameters, warnings, statistics, engine, timing, source revision, and payload.
- Stale or superseded results cannot publish to the active viewport.
- Derived Mesh relations preserve Geometry source kind/revision, tessellation preset, trace confidence, regeneration history, and comparison targets.
- Geometry→Mesh and Mesh→Geometry navigation retains selection meaning and camera context whenever correspondence is available; partial or unavailable mapping is explicit.

## Acceptance gate

Run the maintained gate from the repository root:

```powershell
npm run test:geometry:professional
```

The command runs the focused Geometry/shared-analysis suite, numerical and performance contracts, complete TypeScript checks, the production core build, Geometry picking and professional-shell E2E, Geometry↔Mesh round trips and persistence, worker-failure coverage, and responsive-layout smoke tests.

Changes after this freeze must preserve the seven journeys, region responsibilities, revision-safe saved-result behavior, cross-module provenance, and maintained acceptance command. New Geometry capabilities should extend the shared scene and Inspector contracts rather than introducing parallel identity or result systems.
