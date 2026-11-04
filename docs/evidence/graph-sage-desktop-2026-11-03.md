# Desktop Graph Sage acceptance — 2026-11-03

This gate ran the Windows Electron development build against SageMath 9.5 in local WSL Ubuntu. The isolated worktree started at remote `main` commit `2d01084bda753ac5b59a079313b873f780551aa9`. The test used a fresh Electron profile and worker. It did not force a WSL distribution shutdown, so the 3.1 second first calculation is an observed first run in this session, not a certified cold boot of Ubuntu.

## Result

| Gate | Observation |
| --- | --- |
| Graph → Services → Inspector | A saved Graph function `x^2 - 1` was passed from the selected object to the shared Basic Services Factor operation. Real Local WSL Sage returned the exact factorization `(x + 1)*(x - 1)`. Inspector showed `Exact`, SageMath 9.5, and `Source current`. |
| Linked-source freshness | Save to Workbook initially showed `Source current`. Editing the saved Graph function to `x^2 + 1` changed that same evidence to `Source changed — rerun required`. |
| Bundle and export | The `.math3d` bundle retained `sage-result/v1`, the original Graph source expression and fingerprint, `sage.symbolic.factor` request, local backend, SageMath 9.5, and exact response. Markdown export contained the source, operation, backend, version, and result. |
| Independent reopen | After clearing the isolated app storage, importing the exported `.math3d` bundle restored the exact evidence. It showed `Source unavailable — verify before reuse`, rather than treating an unattached imported result as current. A plain reload gave the same unavailable status when the Graph session source was absent. |
| Valid constant preview | During the first acceptance attempt, previewing `sin(x)^2 + cos(x)^2` crashed the Graph editor because floating-point variation produced an invalid near-zero viewport span. The preview now gives such a curve a usable vertical range. The regression flow previewed and created the graph without a page error. |

`npm run build:core`, `npm run typecheck:noemit`, and three selected Electron Playwright flows passed: the real Local WSL Graph acceptance, the existing mocked Docker Graph Services flow, and the constant-preview regression. The real path is in `tests/e2e/graph-sage-local-desktop.spec.ts`; the preview regression is in `tests/e2e/graph-constant-preview.spec.ts`.

## Exact artifacts

| Artifact | SHA-256 |
| --- | --- |
| [Saved Workbook bundle](graph-sage-workbook-2026-11-03.math3d) | `7211ffef59b5e5b2008ed8aeb819409da007a328a976bd204f99d0e29bfad728` |
| [Markdown export](graph-sage-workbook-2026-11-03.md) | `b85b6ce4321e7c00082435500dc491d2ccc558871417e18515a5ae35326ebcba` |
| [Observed runtime and exact result](graph-sage-observation-2026-11-03.json) | `32a2ae93b195d52ff3fc02e48ee30a0dac7904be61f0574f05f706436868a46e` |

Screenshots show the [real Local WSL result](graph-sage-local-current-2026-11-03.png), [stale Workbook evidence](graph-sage-workbook-stale-2026-11-03.png), and [independent import](graph-sage-independent-import-2026-11-03.png).

This gate covers one Windows desktop development build and one local WSL Sage installation. The Markdown snapshot records the calculation and source revision but does not dynamically update its freshness label after export; the imported `.math3d` evidence resolves freshness against the available source. A live Docker container, packaged installer, and other operating systems remain separate runtime checks.
