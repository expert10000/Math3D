# TOP-05 — Topology functional acceptance and evidence matrix

Date: 2026-11-15. Status: **qualification in progress; no release signoff**.

## Source and ownership boundaries

The initial contribution is **evidence-only**: a native Playwright test, a Windows workflow and this matrix. Do not modify `renderer/src/App.tsx`, `TopologyScreen.tsx`, Geometry #61, `topologyCommandAdapter.ts`, `documentFormat.ts`, `meshSnapshotHandoff.ts` or mathematical algorithms to make a test pass. If a failure reveals a real product defect, document it and claim a separate isolated correction with a new source-bound run.

TOP-01/#75, TOP-03/#77, TOP-02/#79 and TOP-04/#80 have previously merged and each had bounded scoped CI evidence. These results do **not** certify TOP-05.

## Acceptance matrix

| ID | Journey | Evidence path | Initial status | Required exit |
| --- | --- | --- | --- | --- |
| TOP05-E1 | Torus: add vertex in live SVG, Undo, Redo, Undo; unchanged authoritative V/E/F/χ and source/canonical hashes after return | `tests/e2e/topology-functional-acceptance.spec.ts` | MISSING execution | Native Windows actual interaction PASS, zero retries |
| TOP05-E2 | Torus/Möbius/Klein: select presets, verify expected Euler χ=0, provenance present and mutually distinct; Algebra entry | same E2E | MISSING execution | Native Windows PASS, no conflation of count layers |
| TOP05-E3 | Revisioned read-only Mesh snapshot: capture data, stable locate-back references, mutation isolation, same revision CURRENT and changed revision STALE | `renderer/src/topology/meshSnapshotHandoff.test.ts` | MISSING current-head rerun | Vitest PASS, exact source-bound report |
| TOP05-E4 | Replayable Topology v3 document: edit/Undo, round-trip serialization, exact identity/canonical hash, results provenance, unavailable artifact bytes, rejection of fabricated/stale content | `renderer/src/topology/topologyPersistence.test.ts` | MISSING current-head rerun | Vitest PASS |
| TOP05-E5 | Native save through Electron IPC→close process→restart isolated profile→open saved file; compare identity/canonical hash/replay metadata | `tests/e2e/topology-functional-acceptance.spec.ts` | MISSING execution (test authored) | Source-built native Windows cold-reopen PASS; installed-app and missing-byte recovery independently pending |
| TOP05-E6 | Actual Mesh workbench→Topology snapshot, source edit→stale UI→refresh/re-analyze; invalid source and frame refusal | **no current E2E** | MISSING | Cross-workbench UI run with source/revision/hash checks |
| TOP05-E7 | Ineligible/non-manifold diagram and Sage offline fallback; no false classification, missing artifact recovery | **no current E2E** | MISSING | Bounded native and scientific/job evidence |
| TOP05-E8 | Installed Windows application save/cold reopen + runtime recovery and representative Project export/import | existing Integration Lab release owner | MISSING | Installed-app evidence with executable and installer hashes |

### Qualification policy

- Record the **actual CI checkout SHA**, PR head, tested artifact identity, exact commands, skipped/failing tests and evidence URLs. Pull request runs may execute synthetic merge commits; do not call them direct-head builds.
- Never treat UI-only source hash checks as proof of persistence or scientific algorithm correctness.
- Distinguish source diagram, construction quotient, canonical cells, realization and imported Mesh snapshot. Keep separate source and canonical hashes.
- Reject late Job output and stale results according to existing source generation rules; report missing resources without fabricating bytes.
- Do not infer installed-Windows or signed-release qualification from Windows CI of source-built Electron.
- Any failed test remains a failure. Do not skip, remove or weaken assertions merely to turn the job green.
- Merge an evidence-only PR after review and scoped checks; TOP-05 itself stays open until every required E5–E8 journey has independently passed or the release owner expressly narrows acceptance.

## Current next steps

Run scoped Windows qualification including newly authored native file cold reopen. Inspect Playwright and Vitest evidence; fix harness errors transparently without weakening scientific assertions. A source-built Electron process cold reopen is not installed-app evidence; E6 cross-workbench snapshot refresh and E8 installer evidence remain distinct. Preserve Geometry #61 and the scientific command adapter files throughout.
