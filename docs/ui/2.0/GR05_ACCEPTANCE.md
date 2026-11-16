# GR-05 Graph UI acceptance — source-built Windows draft

Date: 2026-11-16. Status: **partial native pass; changed-bundle cold reopen fails**. This is source-built Electron evidence, not an installed-app or release approval.

## Exact execution boundary

- Product build: `836bdb52b5253cf8a683d3d02a8b218fa539ed1d`, stacked on PR92 preview `f5bd954431d29ea602be32c8be37ad509c5e3de3`. `dist/build-identity.json` recorded `dirty:false`, renderer index SHA256 `78f25d4ea4a8f3ffa4cf1906e24a2fde7afc3206be51dc2aea271a20c18a2446`.
- Windows native Electron, isolated temporary profiles, repository Playwright config, zero retries. `npm run build:core` passed after `npm ci --ignore-scripts`, `npm --prefix renderer ci --ignore-scripts`, and `npm run ensure:electron`. `npx tsc -p tests/e2e/tsconfig.json --noEmit` passed.
- `npx playwright test tests/e2e/graph-ui-gr05.spec.ts tests/e2e/graph2d-scientific-dataset.spec.ts tests/e2e/graph-field-gf56.spec.ts tests/e2e/project-field-flagship-journey.spec.ts -g 'GR-05 authored|GRA-10 explicitly|GRA-13.3 reviews|GF-56 verifies|Field Gallery source flows' --reporter=line`: **5/5 passed, 0 skipped, 2.0 minutes**.
- `npx vitest run tests/unit/gf23BundledProfile.test.ts tests/unit/gf24ScientificComparison.test.ts tests/unit/gf56BundledFtleProfile.test.ts tests/unit/crossModuleFrameBoundary.test.ts --maxWorkers=1`: **17/17 passed, four files**.

## Observed matrix

| GR-05 boundary | Result | Native evidence and limit |
| --- | --- | --- |
| Cartesian, polar, parametric, data series | PASS, scoped | New `graph-ui-gr05.spec.ts` previews then commits all four in one Project, inspects parametric and polar probes and changes to polar grid. It verifies the four objects after native process restart and portable Project export/import. |
| Project Workbook and Notes identity | PASS, scoped | The same test starts from the Graph Derivative Investigation Project, keeps its Workbook and Note IDs through save, cold reopen and portable import. `project-field-flagship-journey.spec.ts` additionally checks a saved source pin, Graph profile, Workbook payload and changed-source withholding through restart and transfer. |
| Verified scientific bundle and source bytes | PASS, scoped | GRA-10 imports checked 1D samples and rejects changed resource bytes. GRA-13.3 withholds missing source values, refuses a replacement with changed axis units or wrong component, and relinks only a freshly verified matching bundle. |
| Temporal frames and Graph result | PASS, scoped | GF-56 saves a verified bundle-frame FTLE Graph profile and finds its provenance after Project reopen. Unit tests reject incompatible frames/units and changed generations. |
| Different physical grids | PASS in unit; native cold-reopen FAIL | GF-34 unit cases require explicit aligned physical overlap and withhold changed Graph rows. The native GF-34 journey computes and saves a 729/729 overlap profile, but changing coarse bundle bytes before cold reopen makes the Project import fail, so the saved Graph profile cannot be inspected in withheld state. |
| Late Job output and unavailable installed runtime | MISSING | The bounded run did not simulate late output or execute an installed app. No claim is made from existing unrelated suites. |

## Reproduced cold-reopen failure

`graph-field-gf34.spec.ts` originally could not collect on Windows because its shared fixture resolved `import.meta.url` under Playwright's CommonJS transform. The fixture now uses the same repository-relative path convention as the native test. The affected fixture unit tests pass. With collection fixed, the native journey computed and saved the cross-grid comparison and reached its final cold reopen. After one byte changed in `east.f64`, Project reported:

> Project import failed: Project scientific field unavailable: Coarse verified field. Saved source changed: Scientific resource integrity failed: east

The test now waits for a successful Project open before selecting the saved comparison Graph document. That assertion fails on the quoted error. The app does not publish corrupted values; the open failure blocks inspection of the historical result and source-linked Graph profile. The regression remains in the draft test. Resolving it likely touches shared Project restore and `App.tsx` owned by PR92 integration, so no production patch is included here.

## Next acceptance checks

1. Agree the shared Project restore boundary with the PR92 owner. Make a changed or missing scientific resource reopen into inspectable metadata with values withheld, or document a deliberate fail-closed Project policy and provide a recovery path. Rerun GF-34 on the resulting exact head.
2. Qualify negative frame and unit combinations through the native UI, plus missing sidecar bytes and late Job output after source generation changes.
3. Rerun the bounded native suite after PR92 integration. Installed Windows E8 remains separate.
