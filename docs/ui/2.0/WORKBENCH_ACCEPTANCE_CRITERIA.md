# Workbench acceptance criteria — Mesh, Complex, Surfaces, Graphs

Status: design contract, not executed acceptance. Source reviewed: `6d102492bc0f2a94fa70eb6363b1e8e056cde5ab` (2026-11-16). The five original reviews remain at their stated `2cf4b6a4` observation source. This file turns the remaining journeys into observable gates without changing mathematical or persistence owners. Record every case against the exact source and harness commit that ran it. `PASS`, `FAIL`, `MISSING` and `BLOCKED` are distinct; a test file, screenshot, or a source-built result cannot certify an installed release.

## Common evidence required for each journey

1. Capture the source document ID, revision/generation, representation, frame/units, selected entity, and relevant resource SHA-256 before the action. Capture them again after every navigation, operation, source edit and reopen. Identity changes must be explained by an explicit new-object action; a view switch must not change them.
2. Record the command or Job ID, runtime/backend and availability, source revision consumed, output document/result ID, destination choice, warnings, and whether a result is current or historical. A highlighted step or visible preview is not execution evidence.
3. Preserve source and result payloads separately. Verify saved resource bytes against recorded hashes after a cold process reopen or portable import. If bytes are absent or changed, retain honest historical metadata and withhold/relink; do not render fabricated current output.
4. Edit the source after a result exists. Assert that the old result becomes stale, cannot replace the current viewport result, and a late Job from an earlier generation cannot publish. Recompute through the existing command path; no direct state mutation in the test.
5. Run focused source-built native tests first. Then run the same acceptance on an identified installed executable/installer pair with hashes and runtime provenance. State exactly which backend, platform, frame mapping and operation families were exercised. Leave optional CGAL/pygalmesh and signing outside PASS until actually present and exercised.

## MESH-04 — indexed source versus connected interpretation

`topologyInspector.ts` derives adjacency from actual vertex indices (or three independent vertices per triangle for unindexed input). `meshHealth.ts` combines local readiness and topology, while the benchmark suite can make an explicit spatial-weld comparison. These are different observations. Displaying a `Healthy`/`Invalid` mesh-health state must name its scope; it must not imply analytic validity of a Surface or Complex function.

| Case | Fixture/action | Required observable result |
| --- | --- | --- |
| M4.1 | Import an ASCII STL cube with coincident but split vertices; inspect raw and explicitly requested connected/spatial-weld interpretation. | Raw indexed counts and connected/weld counts have distinct labels, method and tolerance; no vertex buffer, resource hash, document revision or selection changes merely by viewing the interpretation. |
| M4.2 | Inspect an open-boundary sheet and a non-manifold edge fixture. | Boundary edges/loops, manifold and closed-solid suitability are separate from triangle validity and sampled self-intersection status. No universal “invalid mathematics” claim is derived from an open sheet. |
| M4.3 | Explicitly apply a weld or repair command, then Undo. | The command creates a revisioned result with destination and lineage; Undo restores original indexed bytes and topology, while the earlier interpretation remains identified as historical. |

UI completion gate: Mesh Analyze/Inspector shows `Indexed source` before counts; any connected interpretation shows its own method/tolerance and counts beside it. If only the indexed view exists, say so and do not present a fabricated connected value. MESH-04 remains open until this is implemented and M4.1–M4.3 run natively. Existing `renderer/src/mesh/meshBenchmarkRegression.test.ts` has importer and welded benchmark coverage, but does not prove this UI contract.

## MESH-01 remaining operation forms

After PR74's Clean/Decimate/Smooth form is reconciled, apply the same visible Source → Parameters → Output → Run hierarchy to the remaining rows without moving their scientific handlers. Boolean must keep operand A/B identities, operation and Auto/Fast/Robust strategy, backend readiness and an explicit destination beside Run. Implicit Preview and Implicit Mesh must show analytic source, sampling/domain controls, whether the result is preview or mesh, and destination. CGAL Validate must clearly say it is non-destructive and show no replace choice; Repair and Repair+Validate must retain the existing repair toggles, hole limit, New object/Replace and save-after-review warning. Unsupported Imprint/strategy combinations stay disabled with their current reasons. Native acceptance must exercise one available example per family, verify that toggling a strategy or destination changes the Run summary without executing, and assert the returned method/output lineage after execution. This work remains pending while the UI integration chat owns `MeshOperationsPanel.tsx`.

## MESH-05 — full Mesh operation lifecycle

| Case | Required action and assertion |
| --- | --- |
| M5.1 | Start with built-in Box. Capture source ID/revision/hash; choose Smooth or Clean, explicit `New object`, and confirm parameters/source/output adjacent to Run. Execute via ready worker. Assert Job completes, result ID differs, source hash stays fixed, result history and Compare point to the correct two versions. |
| M5.2 | Repeat with `Replace`, then Validate/Compare and Undo/Redo. Assert the destination identity/revision semantics of the actual owner, exact resource hashes, committed selection and last-operation feedback at each step. A display-only comparison is not a mathematical certificate. |
| M5.3 | Save Project, close the Electron process, reopen and verify source/result IDs, selection, operation history, backend/method, warnings and sidecar hashes. Remove one copied sidecar and reopen a disposable copy: metadata remains inspectable, output is withheld and relink is explicit. |
| M5.4 | Launch an operation, edit/replace its source before completion, and deliver old output late. The earlier generation cannot publish as current. Exercise worker unavailable/recovery with the prior result still inspectable and Run disabled for a stated reason. |

Operation coverage is a matrix: Clean/Decimate/Smooth, boolean, implicit/CGAL and topology edits are separate rows. The first three form families from PR74 do not certify the others. Record unsupported backend rows as `MISSING` or `BLOCKED`, not PASS. The current MESH-01 operation form remains serially owned by the UI integration chat until its branch is reconciled.

## CA-05 — analytic source, result and stale history

| Case | Required action and assertion |
| --- | --- |
| C5.1 | In Function Explorer select `1/z`; inspect the actual expression, Z-plane and W-plane, domain and source revision. Switch 2-pane/3-pane/Focus Z at 800, 1100 and 1600 px usable widths. Plot space and Inspector visibility reflect the selected layout without clipping the preset labels. |
| C5.2 | Set an oriented contour around the pole, run the existing integral/residue command, and inspect orientation, branch/cut policy, exact versus numerical method, backend, error estimate or explicit unavailability, source revision and result ID before publication. Test a contour with no pole as a distinct expected result. |
| C5.3 | In Branch Lab use a branch-sensitive source such as `sqrt(z)`; map a path and run validated continuation. A plotted path alone is not a validated continuation. Assert sheet/monodromy provenance and limitations. |
| C5.4 | Save a result, edit the function or contour, then verify stale history and nonpublication of old/late output. Save Project, cold reopen, and compare document IDs, path, branch policy, result references and available artifact hashes. Missing bytes are withheld with metadata intact. |

`tests/e2e/complex-continuation.spec.ts` covers one validated `sqrt(z)` continuation, while other Complex suites cover separate exact/numerical paths. No existing single run is evidence for C5.1–C5.4 together. CA-01 plot responsiveness from PR71 is a scoped slice; preset-column cleanup and full width behavior remain open.

### CA-01 preset-column completion

At 800, 1100 and 1600 px usable content widths, every Function Explorer preset label and formula must wrap or be fully readable without horizontal clipping, while the chosen preset remains visibly active. Keyboard focus must reach every card, the expression editor and both plot-layout actions; changing a preset must update the editor and plots without resizing the window or hiding the Inspector. Check the actual content rectangle, not only the Electron outer width. The CSS/JSX owner is in `App.tsx`, reserved by the UI integration chat until its shared edits are reconciled; this criterion is not a claim that PR71 implemented it.

## SURF-05 — recipe, analysis and derived representation

| Case | Required action and assertion |
| --- | --- |
| S5.1 | Exercise one implicit, parametric, Weierstrass and spline recipe. Record analytic recipe ID/revision, domain, frame/units, sampling/precision settings, displayed representation and backend. View quality must not silently alter the scientific source or analysis precision. |
| S5.2 | Preview, run a named Surface analysis, inspect method/assumptions/dependency freshness and result ID. Edit a source parameter; the previous result becomes stale and cannot republish. Use a runtime-unavailable path to verify the old result remains inspectable. |
| S5.3 | Bake to Mesh or Promote to SurfaceMesh with explicit target. Record source and derived IDs/revisions/hashes and mapping status. Navigate to Mesh and back; the representation and mapped selection are either exact with frame/units shown or explicitly partial/unavailable. No silent welding or source replacement. |
| S5.4 | Save, close and cold reopen Project; verify recipe, analytic result, derived mesh bytes, selection, lineage and hashes. Remove a copied derived sidecar and verify withholding/relink while source recipe and historical references survive. |

The current `tests/e2e/surface-functional.spec.ts` and `native-saved-surface-workflow.spec.ts` contain pieces of this journey. They do not cover all four recipe families, missing bytes and installed runtime in one qualified matrix.

## GR-05 — authored and scientific Graphs

| Case | Required action and assertion |
| --- | --- |
| G5.1 | Preview then commit cartesian, polar, parametric and data series. Record expression/parameters, domain, sampling validity and current graph ID/revision. Verify visible graph, hide/show, selection/probe and focus return to authoring. |
| G5.2 | Import verified scalar, complex and vector scientific bundles through the existing selection/verification UI. Record source artifact SHA-256, component, coordinate slice, frame, units and grid. Reject changed/missing bytes and incompatible frame/unit/grid explicitly. No silent resample or coordinate reinterpretation. |
| G5.3 | Edit a source or parameter after analysis/pinning. Assert stale derived output, source-linked probes, Workbook/Notes pin and historical reference behavior. A newly drawn line does not automatically update a pinned result. |
| G5.4 | Save/export/import a portable Project and cold reopen. Compare document IDs, graph revisions, selections, notes/pins, dataset references and exact sidecar hashes; test a copied archive with missing data separately. |

`tests/e2e/graph2d-scientific-dataset.spec.ts` already checks individual import/reverification and missing/changed byte cases. Its cases are starting evidence only at their own run SHAs, not a GR-05 end-to-end PASS. GR-04's colored strip observation still needs a reproducible cause before rendering changes.

## Release gate

For each row, the evidence record must contain source and harness SHA, platform/app provenance, command, backend availability, exact test count and result, artifact hashes, and any omitted rows. A source-built Windows native PASS advances only that row. Full-workbench PASS requires all applicable rows plus an installed-app journey; unavailable optional operations remain explicitly unqualified. The Integration Lab owns the canonical execution record.
