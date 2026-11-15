# TOP-05 — Topology functional acceptance and evidence matrix

Date: 2026-11-15. Status: **qualification in progress; no release signoff**.

## Source and ownership boundaries

The initial contribution is **evidence-only**: a native Playwright test, a Windows workflow and this matrix. Do not modify `renderer/src/App.tsx`, `TopologyScreen.tsx`, Geometry #61, `topologyCommandAdapter.ts`, `documentFormat.ts`, `meshSnapshotHandoff.ts` or mathematical algorithms to make a test pass. If a failure reveals a real product defect, document it and claim a separate isolated correction with a new source-bound run.

TOP-01/#75, TOP-03/#77, TOP-02/#79 and TOP-04/#80 have previously merged and each had bounded scoped CI evidence. These results do **not** certify TOP-05.

## Acceptance matrix

| ID | Journey | Evidence path | Current qualification status | Required exit |
| --- | --- | --- | --- | --- |
| TOP05-E1 | Torus: add vertex in live SVG, Undo, Redo, Undo; unchanged authoritative V/E/F/χ and source/canonical hashes after return | `tests/e2e/topology-functional-acceptance.spec.ts` | PASS (source-built Windows at 1440×1000; narrow viewport not qualified) | Native Windows actual interaction PASS, zero retries |
| TOP05-E2 | Torus/Möbius/Klein: select presets, verify expected Euler χ=0, provenance present and mutually distinct; Algebra entry | same E2E | PASS (source-built Windows; three presets) | Native Windows PASS, no conflation of count layers |
| TOP05-E3 | Revisioned read-only Mesh snapshot: capture, mutation isolation, source absence, changed revision STALE and re-analysis CURRENT while retaining original immutable snapshot | `renderer/src/topology/meshSnapshotHandoff.test.ts` (extended) | PASS (current Windows Vitest suite) | Current-head Vitest PASS, exact source-bound report |
| TOP05-E4 | Replayable Topology v3 document: edit/Undo, round-trip serialization, exact identity/canonical hash, results provenance, unavailable artifact bytes, rejection of fabricated/stale content | `renderer/src/topology/topologyPersistence.test.ts` | PASS (current Windows Vitest suite) | Vitest PASS |
| TOP05-E5 | Native save through Electron IPC→close process→restart isolated profile→open saved file; compare identity/canonical hash/replay metadata | `tests/e2e/topology-functional-acceptance.spec.ts` | PASS (source-built IPC file save and cold Electron process reopen) | Source-built native Windows cold-reopen PASS; installed-app and missing-byte recovery independently pending |
| TOP05-E6 | Mesh workbench Box→Topology read-only snapshot CURRENT→Mesh Smooth Replace→Topology STALE/source-unavailable→explicit refresh CURRENT | `tests/e2e/topology-functional-acceptance.spec.ts` (new) | PASS (source-built actual E6 stale/refresh); invalid-source/frame refusal MISSING | Native cross-workbench PASS and separate invalid-source/frame evidence |
| TOP05-E7 | Ineligible/non-manifold diagram and Sage offline fallback; no false classification, missing artifact recovery | Existing `renderer/src/topology/algebraPublication.test.ts` included in Windows CI for Sage-unavailable/timed-out/stale publication | PASS Sage fallback/stale publication unit and native Dunce-cap classification withholding; missing-artifact recovery MISSING | Sage publication regression PASS plus separate native non-manifold and recovery evidence |
| TOP05-E8 | Installed Windows executable cold-reopen, installer/exe hashes, then upgrade/runtime recovery and representative Project export/import | `scripts/topology-installed-qualification.ps1` + Integration Lab owner | Harness AUTHORED / MISSING installed run; upgrade/recovery/export still MISSING | Genuine installed app and matching installer hashes, installed run PASS, upgrade and recovery evidence |

### Qualification policy

- Record the **actual CI checkout SHA**, PR head, tested artifact identity, exact commands, skipped/failing tests and evidence URLs. Pull request runs may execute synthetic merge commits; do not call them direct-head builds.
- Never treat UI-only source hash checks as proof of persistence or scientific algorithm correctness.
- Distinguish source diagram, construction quotient, canonical cells, realization and imported Mesh snapshot. Keep separate source and canonical hashes.
- Reject late Job output and stale results according to existing source generation rules; report missing resources without fabricating bytes.
- Do not infer installed-Windows or signed-release qualification from Windows CI of source-built Electron.
- Any failed test remains a failure. Do not skip, remove or weaken assertions merely to turn the job green.
- Merge an evidence-only PR after review and scoped checks; TOP-05 itself stays open until every required E5–E8 journey has independently passed or the release owner expressly narrows acceptance.

## Current next steps

Source-built TOP-05 Windows qualification now passes all five native and thirteen unit tests on the PR83/main synthetic merge. Complete remaining negative source/frame refusal, missing-resource recovery, narrow-viewport usability, and installed-app/upgrade/runtime-recovery/Project export-import cases before full TOP-05 closeout. A source-built Electron process cold reopen is not installed-app evidence. Preserve Geometry #61 and the scientific command adapter files throughout.

## First Windows qualification failure and correction

Run [43724530425](https://github.com/expert10000/Math3D/actions/runs/43724530425) FAILED: typecheck/core build and eight persistence/snapshot unit tests passed, native Torus/Möbius/Klein test passed, but native diagram editor and cold-reopen tests failed. The editor XPath looked for unnamespaced SVG using a sibling axis, so it found no element; replaced with a parent-scoped SVG locator, without dropping vertex count/Undo/Redo assertions. The cold-reopen test mistakenly compared UI fnv1a32 canonical view hash with the persistence document's SHA256 canonical hash; the corrected test validates each separately and preserves equality of the serialized SHA256 before and after reopening as well as UI hash invariants. Do not carry forward the failed run as PASS.

Expanded pending scope: source-revision reanalysis Vitest, actual Mesh→Topology→Mesh Replace→Topology refresh native test, and an installed-executable PowerShell harness with mandatory installer/exe SHA256 evidence. Installed executable must be a genuine existing installation under Program Files/LocalAppData; no automatic installation, upgrade, signing or installed-app result is claimed. The script requires installer/exe paths supplied by the release owner and does not install software. Until an installed binary is available and the native journey passes, E8 is MISSING.

## Offline scientific publication regression

Windows TOP-05 qualification additionally runs the existing `algebraPublication.test.ts` suite, which separately asserts that unavailable Sage reports only a labeled local Z/2Z fallback, timed-out jobs do not masquerade as exact results, and stale exact publications are rejected. This is existing mathematical/job unit evidence, not a native runtime-recovery journey, and does not qualify non-manifold/ineligible native UI cases.

## Run 43738247846 and E6 worker-gate diagnostic continuation

Run [43738247846](https://github.com/expert10000/Math3D/actions/runs/43738247846) at source head `8992d6ad931ec4d4b27dcadca4450041591c80c8` completed **FAIL** overall: source-built Windows typecheck/core build PASS, 13/13 Vitest PASS, native 4/5 PASS. Source-built native passes were E1 Torus real edit/Undo/Redo/Undo (1440×1000 only), E2 Torus/Möbius/Klein, E5 IPC file cold-process reopen and replay, and E7 Dunce-cap non-manifold classification WITHHELD. E6 FAIL: Run Smooth remained disabled 45 seconds after Mesh→Topology→Mesh, before any source revision mutation could occur. E6 snapshot staleness/refresh therefore remains untested in the native journey even though the source lifecycle unit tests pass.

[Issue #85](https://github.com/expert10000/Math3D/issues/85) owns diagnosis. Current test instrumentation on head `9a72dbe20fe8407601fa33ad8e04499637368888` captures worker status both before navigation and after returning to Mesh, status bar text, visible operation panel summary, active workbench and disabled Run control, attaches JSON and rethrows the same failure. This is not a workaround, bypass or accepted scientific result. No production changes or scientific adapter edits.

**Installed-app E8 is still MISSING.** The existing PowerShell script accepts exact installer and installed-executable paths, checks their SHA-256 identities and runs the native cold-reopen test with the installed binary. There is no supplied installed executable and matching installer in this runtime, so the script has not been executed and no installed-app qualification may be inferred from the source-built CI.

## Source-built Windows worker-bootstrap correction and first complete native PASS

The initial E6 disabled Smooth gate was observed **before** any Topology navigation, not caused by a demonstrated Mesh→Topology transition regression. Source-built Windows CI lacked the required Python scientific runtime. The worker `python/worker/runtime.py` requires NumPy/SciPy/SymPy/VTK; CGAL and pygalmesh are optional for its health check. Isolated CI-only [PR89](https://github.com/expert10000/Math3D/pull/89) merged as `e22b1091a30ef26464b646267c5b1a5538756ba8`. [Windows worker smoke43769717601](https://github.com/expert10000/Math3D/actions/runs/43769717601) **PASS** with required pinned dependencies; optional CGAL and pygalmesh absent/unqualified. Source-built TOP-05 CI now calls that reusable preparation action before native tests; no UI handlers, scientific algorithms or readiness gates were altered.

[Windows TOP-05 run43769930920](https://github.com/expert10000/Math3D/actions/runs/43769930920) **PASS** (actual checkout synthetic merge `a0134c1`, combining PR83 head `3591fb0f35d4276c5017e9e559fec54e592f028d` with main bootstrap commit `e22b1091a30ef26464b646267c5b1a5538756ba8`). Locked npm installation, TypeScript typecheck, core build, pinned worker health, Vitest **13/13**, and Playwright **5/5** (no retries) all succeeded. E6 operated a real Box mesh, captured a CURRENT read-only Topology snapshot, returned to Mesh and completed Smooth Replace, observed STALE/source-unavailable metadata, explicitly re-analyzed and recovered CURRENT. Artifact `topology-functional-qualification-evidence`, ID 14184431049, 61,048 bytes. This **qualifies source-built scoped acceptance only**; it is not an installed/signed Windows build or a complete release.

[Issue85](https://github.com/expert10000/Math3D/issues/85) was closed for the source-built worker-readiness blocker after this PASS. Distinct missing gates remain: installed Windows executable/installer hashes and installed cold-reopen/upgrade/runtime recovery, portable Project export/import, unsupported frame/source handling and missing-artifact recovery. TOP-05 overall remains open; PR83 stays draft/unmerged pending broader release acceptance decisions.
