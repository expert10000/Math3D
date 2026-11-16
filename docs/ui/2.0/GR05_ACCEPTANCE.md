# GR-05 Graph UI acceptance — source-built Windows draft

Date: 2026-11-16. Status: **scoped native pass; broader GR-05 gates remain**. This is source-built Electron evidence, not an installed-app or release approval.

## Exact execution boundary

- Product build: `836bdb52b5253cf8a683d3d02a8b218fa539ed1d`, stacked on PR92 preview `f5bd954431d29ea602be32c8be37ad509c5e3de3`. `dist/build-identity.json` recorded `dirty:false`, renderer index SHA256 `78f25d4ea4a8f3ffa4cf1906e24a2fde7afc3206be51dc2aea271a20c18a2446`.
- Windows native Electron, isolated temporary profiles, repository Playwright config, zero retries. `npm run build:core` passed after `npm ci --ignore-scripts`, `npm --prefix renderer ci --ignore-scripts`, and `npm run ensure:electron`. `npx tsc -p tests/e2e/tsconfig.json --noEmit` passed.
- `npx playwright test tests/e2e/graph-ui-gr05.spec.ts tests/e2e/graph2d-scientific-dataset.spec.ts tests/e2e/graph-field-gf56.spec.ts tests/e2e/project-field-flagship-journey.spec.ts -g 'GR-05 authored|GRA-10 explicitly|GRA-13.3 reviews|GF-56 verifies|Field Gallery source flows' --reporter=line`: **5/5 passed, 0 skipped, 2.0 minutes**.
- `npx vitest run tests/unit/gf23BundledProfile.test.ts tests/unit/gf24ScientificComparison.test.ts tests/unit/gf56BundledFtleProfile.test.ts tests/unit/crossModuleFrameBoundary.test.ts --maxWorkers=1`: **17/17 passed, four files**.
- Recovery source `0b1c153fd622f1bb2ddf30b252d999e162c2d9ca`: rebuilt renderer with a clean build identity. `npx playwright test tests/e2e/graph-field-gf34.spec.ts tests/e2e/field-explorer-scientific-workflow.spec.ts --reporter=line` reached a PASS for the full scientific Field Explorer repair/reopen journey. The GF-34 case then exposed a Gallery-versus-detail test locator and was rerun after correcting that locator.
- Final GF-34 test source `23312957250ec71e637d1624c8485c78183c120e`, same renderer code as `0b1c153f`: `npx playwright test tests/e2e/graph-field-gf34.spec.ts --reporter=line` **1/1 passed in 27.9 seconds**. [Native preview capture](evidence/gr05-unverified-saved-preview.png), SHA256 `bdb8b3d94a2baad64ee3060e6d367154df41ad341d51efc29bdc87f21aea578b`.
- `npx vitest run renderer/src/vectorfield3d/fieldExplorerScientificWorkflow.test.ts tests/unit/gf23BundledProfile.test.ts tests/unit/gf24ScientificComparison.test.ts --maxWorkers=1`: **8/8 passed**, including the existing fail-closed source-admission contract. Renderer and E2E TypeScript typechecks passed.

## Observed matrix

| GR-05 boundary | Result | Native evidence and limit |
| --- | --- | --- |
| Cartesian, polar, parametric, data series | PASS, scoped | New `graph-ui-gr05.spec.ts` previews then commits all four in one Project, inspects parametric and polar probes and changes to polar grid. It verifies the four objects after native process restart and portable Project export/import. |
| Project Workbook and Notes identity | PASS, scoped | The same test starts from the Graph Derivative Investigation Project, keeps its Workbook and Note IDs through save, cold reopen and portable import. `project-field-flagship-journey.spec.ts` additionally checks a saved source pin, Graph profile, Workbook payload and changed-source withholding through restart and transfer. |
| Verified scientific bundle and source bytes | PASS, scoped | GRA-10 imports checked 1D samples and rejects changed resource bytes. GRA-13.3 withholds missing source values, refuses a replacement with changed axis units or wrong component, and relinks only a freshly verified matching bundle. |
| Temporal frames and Graph result | PASS, scoped | GF-56 saves a verified bundle-frame FTLE Graph profile and finds its provenance after Project reopen. Unit tests reject incompatible frames/units and changed generations. |
| Different physical grids and changed-bundle cold reopen | PASS, scoped | GF-34 requires explicit aligned physical overlap and computes a 729/729 profile. Changed coarse bundle bytes still block Project activation. The saved Project opens automatically as a read-only metadata preview: the Graph profile's label, result identity, axis/units and saved row hash remain inspectable, with values withheld and document actions disabled. The existing Field Explorer repair/reopen journey passes. |
| Late Job output and unavailable installed runtime | MISSING | The bounded run did not simulate late output or execute an installed app. No claim is made from existing unrelated suites. |

## Cold-reopen recovery and safety boundary

`graph-field-gf34.spec.ts` originally could not collect on Windows because its shared fixture resolved `import.meta.url` under Playwright's CommonJS transform. The fixture now uses the same repository-relative path convention as the native test. With collection fixed, the native journey computed and saved the cross-grid comparison. After one byte changed in `east.f64`, normal Project activation correctly refused unverified scientific values:

> Project import failed: Project scientific field unavailable: Coarse verified field. Saved source changed: Scientific resource integrity failed: east

The recovery change preserves that refusal. It opens the saved Project as a read-only metadata preview, labels result and artifact freshness as source unverified, displays the saved Graph comparison profile's identity and provenance, and explains that the source must be repaired or relinked before activation. It does not load or publish corrupted numerical values. The prior workspace remains untouched. The existing scientific Field Explorer journey can repair the source and reopen the Project. No `App.tsx`, CSS, scientific computation or workflow file changed.

## Next acceptance checks

1. Review the narrow Project preview recovery in draft PR95 against PR92's updated merge head; keep fail-closed scientific activation.
2. Qualify negative frame and unit combinations through the native UI, plus missing sidecar bytes and late Job output after source generation changes.
3. Rerun the bounded native suite after PR92 integration. Installed Windows E8 remains separate.
