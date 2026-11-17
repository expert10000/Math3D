# GR-05 Graph UI acceptance — source-built Windows draft

Date: 2026-11-17. Status: **post-integration scoped native pass; refreshed PR95 CI pending**. This is source-built Electron evidence, not an installed-app or release approval.

## Post-PR92 integration refresh

PR92 merged as `55031773e1927d27cd8c25deefcbc7c866b58469`; the follow-up docs-only main head was `b1fdc09d1f053145c49068defe948ca44e55b91c`. PR95 merged those heads without production conflicts. The only later conflict was in this draft-state documentation and preserved PR92's final integration row alongside the GR-05 rows. Relative to main, PR95 changes only its 12 Graph/Project files.

On clean merged Graph source `4e897973e7bd5d9d0134bec3ce625269e17dc5ec`, `npm run build:core` passed with `dirty:false`. `npx playwright test tests/e2e/graph-ui-gr05.spec.ts tests/e2e/graph-field-gf34.spec.ts tests/e2e/graph-ui-gr05-negative-frame-units.spec.ts tests/e2e/graph-ui-gr05-late-job.spec.ts tests/e2e/field-explorer-scientific-workflow.spec.ts --workers=1 --retries=0 --reporter=list` passed **5/5 in 2.4 minutes**. The final docs-only refresh does not change production or tests. CI must still run on the new published PR head; this local result does not establish broad acceptance.

## Exact execution boundary

- Product build: `836bdb52b5253cf8a683d3d02a8b218fa539ed1d`, stacked on PR92 preview `f5bd954431d29ea602be32c8be37ad509c5e3de3`. `dist/build-identity.json` recorded `dirty:false`, renderer index SHA256 `78f25d4ea4a8f3ffa4cf1906e24a2fde7afc3206be51dc2aea271a20c18a2446`.
- Windows native Electron, isolated temporary profiles, repository Playwright config, zero retries. `npm run build:core` passed after `npm ci --ignore-scripts`, `npm --prefix renderer ci --ignore-scripts`, and `npm run ensure:electron`. `npx tsc -p tests/e2e/tsconfig.json --noEmit` passed.
- `npx playwright test tests/e2e/graph-ui-gr05.spec.ts tests/e2e/graph2d-scientific-dataset.spec.ts tests/e2e/graph-field-gf56.spec.ts tests/e2e/project-field-flagship-journey.spec.ts -g 'GR-05 authored|GRA-10 explicitly|GRA-13.3 reviews|GF-56 verifies|Field Gallery source flows' --reporter=line`: **5/5 passed, 0 skipped, 2.0 minutes**.
- `npx vitest run tests/unit/gf23BundledProfile.test.ts tests/unit/gf24ScientificComparison.test.ts tests/unit/gf56BundledFtleProfile.test.ts tests/unit/crossModuleFrameBoundary.test.ts --maxWorkers=1`: **17/17 passed, four files**.
- Recovery source `0b1c153fd622f1bb2ddf30b252d999e162c2d9ca`: rebuilt renderer with a clean build identity. `npx playwright test tests/e2e/graph-field-gf34.spec.ts tests/e2e/field-explorer-scientific-workflow.spec.ts --reporter=line` reached a PASS for the full scientific Field Explorer repair/reopen journey. The GF-34 case then exposed a Gallery-versus-detail test locator and was rerun after correcting that locator.
- Final GF-34 test source `23312957250ec71e637d1624c8485c78183c120e`, same renderer code as `0b1c153f`: `npx playwright test tests/e2e/graph-field-gf34.spec.ts --reporter=line` **1/1 passed in 27.9 seconds**. [Native preview capture](evidence/gr05-unverified-saved-preview.png), SHA256 `bdb8b3d94a2baad64ee3060e6d367154df41ad341d51efc29bdc87f21aea578b`.
- Final recovery head `6864427bec5c343a62818ff115c39a5668b42103`: `npm run build:renderer` passed; `npx playwright test tests/e2e/graph-field-gf34.spec.ts tests/e2e/field-explorer-scientific-workflow.spec.ts --reporter=line` **2/2 passed in 1.7 minutes**. This includes the workspace-change guard in the preview fallback.
- `npx vitest run renderer/src/vectorfield3d/fieldExplorerScientificWorkflow.test.ts tests/unit/gf23BundledProfile.test.ts tests/unit/gf24ScientificComparison.test.ts --maxWorkers=1`: **8/8 passed**, including the existing fail-closed source-admission contract. Renderer and E2E TypeScript typechecks passed.
- Negative/late-Job test source `bdc4e6e5879a66240bd1fe018b05c5e74b555ddc`, same renderer code: `npx playwright test tests/e2e/graph-field-gf34.spec.ts tests/e2e/graph-ui-gr05-negative-frame-units.spec.ts tests/e2e/graph-ui-gr05-late-job.spec.ts --reporter=line`: **3/3 passed in 33.3 seconds**, zero retries. E2E TypeScript typecheck passed. The GF-23 fixture now resolves relative to its source file; `temporalPathlinePresentation.test.ts` passed from both repository root and `renderer` working directories.

## PR95 CI boundary

At PR head `f67060380da628a7f48f7747a794bbcb17545966`, Gallery Quality and Field Explorer native workflow passed. Unified Projects Software Acceptance failed during test collection because the GF-23 fixture resolved from the `renderer` working directory; 495 other tests passed. The fixture-path correction is in `bdc4e6e5` and passed locally from both working directories; a new CI run is required. Graph2D Professional, Scientific Project Web Packages and Release 2.0 Flagship workflows were still in progress at observation. The three Cloudflare Pages preview checks also failed on PR92 head `5cd220b5` and earlier PR95 head `7285c2a6`; they are separate from the source-built Graph acceptance.

## Observed matrix

| GR-05 boundary | Result | Native evidence and limit |
| --- | --- | --- |
| Cartesian, polar, parametric, data series | PASS, scoped | New `graph-ui-gr05.spec.ts` previews then commits all four in one Project, inspects parametric and polar probes and changes to polar grid. It verifies the four objects after native process restart and portable Project export/import. |
| Project Workbook and Notes identity | PASS, scoped | The same test starts from the Graph Derivative Investigation Project, keeps its Workbook and Note IDs through save, cold reopen and portable import. `project-field-flagship-journey.spec.ts` additionally checks a saved source pin, Graph profile, Workbook payload and changed-source withholding through restart and transfer. |
| Verified scientific bundle and source bytes | PASS, scoped | GRA-10 imports checked 1D samples and rejects changed resource bytes. GRA-13.3 withholds missing source values, refuses a replacement with changed axis units or wrong component, and relinks only a freshly verified matching bundle. |
| Temporal frames and Graph result | PASS, scoped | GF-56 saves a verified bundle-frame FTLE Graph profile and finds its provenance after Project reopen. Native comparisons reject an incompatible spatial unit, incompatible vector/time units, and a coarse grid under the identical-grid policy; no result is saved. Unit tests reject further incompatible frames/units and changed generations. |
| Different physical grids and changed-bundle cold reopen | PASS, scoped | GF-34 requires explicit aligned physical overlap and computes a 729/729 profile. Changed coarse bundle bytes still block Project activation. The saved Project opens automatically as a read-only metadata preview: the Graph profile's label, result identity, axis/units and saved row hash remain inspectable, with values withheld and document actions disabled. The existing Field Explorer repair/reopen journey passes. |
| Late Graph Job output | PASS, scoped | A native parameter study reaches 8/17 measurements; the test holds its genuine yield, changes the saved measurement and releases the late callback. The Job reports values withheld and creates no Graph series. |
| Missing scientific sidecar | PASS, scoped | The existing native Field Explorer repair journey removes `north.f64` from a legacy v1 external package. Project open remains guarded, reports the missing source, and succeeds only after the original bytes are restored. |
| Installed runtime | MISSING | The bounded run did not execute an installed app. |

## Cold-reopen recovery and safety boundary

`graph-field-gf34.spec.ts` originally could not collect on Windows because its shared fixture resolved `import.meta.url` under Playwright's CommonJS transform. The fixture now uses the same repository-relative path convention as the native test. With collection fixed, the native journey computed and saved the cross-grid comparison. After one byte changed in `east.f64`, normal Project activation correctly refused unverified scientific values:

> Project import failed: Project scientific field unavailable: Coarse verified field. Saved source changed: Scientific resource integrity failed: east

The recovery change preserves that refusal. It opens the saved Project as a read-only metadata preview, labels result and artifact freshness as source unverified, displays the saved Graph comparison profile's identity and provenance, and explains that the source must be repaired or relinked before activation. It does not load or publish corrupted numerical values. The prior workspace remains untouched. The existing scientific Field Explorer journey can repair the source and reopen the Project. No `App.tsx`, CSS, scientific computation or workflow file changed.

## Next acceptance checks

1. Review the narrow Project preview recovery in draft PR95 against merged main; keep fail-closed scientific activation.
2. Confirm the corrected GF-23 fixture and the relevant broad workflows on PR95's new exact head.
3. Complete installed Windows E8 separately.
