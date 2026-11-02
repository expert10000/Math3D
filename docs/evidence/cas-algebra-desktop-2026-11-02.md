# Desktop CAS / Algebra acceptance — 2026-11-02

The isolated acceptance worktree started at remote `main` commit `d4ede5ca9b1352886c9226ee2704913d04ed7984`. The exact tested source includes the control-label and acceptance-test changes in `2a3cbccdf5185bcf0516e66a12ff123387a94688`. This was a Windows Electron run with SageMath 9.5 installed in WSL Ubuntu. The Docker daemon was unavailable; Docker success was exercised only through the existing local HTTP test service.

## Result

| Gate | Observation |
| --- | --- |
| CAS → shared Services → Inspector | Real Local WSL Sage simplified `sin(x)^2 + cos(x)^2` to the exact result `1`. The Inspector reported SageMath 9.5 and identified the CAS input as freeform, with no saved source link. |
| Runtime discovery | Local WSL reported available with ten operations, version and limits. The absent Docker service was reported unavailable with its failed health check and an instruction to start the service. |
| Workbook save and independent reopen | Save to Workbook retained the exact request, response, engine version and diagnostics. After a reload, the result remained visible. After clearing the isolated app storage, importing the exported `.math3d` file restored the same freeform result and version. |
| Export | The `.math3d` session bundle and Markdown export both contained the operation, SageMath 9.5 and result `1`. The bundle's `sage-result/v1` evidence retained the local backend, CAS input, job ID and bounded-AST diagnostic. |
| Linked-source freshness | In the shared Surface Services flow, a source-linked result was current on save, stale after an implicit expression edit, and unavailable after restart when that session source could not be recovered. The old preview and commit actions were disabled. This path used a mock Docker HTTP service; the separate real Local WSL Surface test verified exact results and current-source state. A freeform Geometry result remained explicitly unlinked. |
| Console trust | The real Local WSL Console test verified trust before execution, output and input hash provenance, cancellation, Compute job visibility, and trust reset on reopening. |

`npm run build:core`, `npm run typecheck:noemit`, four focused Vitest files (50 tests), and the five selected Electron Playwright flows passed. The initial Surface flow exposed an ambiguous “Operation” accessible label. The shortcut group is now named “Symbolic shortcuts” and the selector has the explicit “Operation” label. Its rerun passed. A separate older assertion expected an unlinked Geometry input to be source-unavailable; it now checks the intended freeform label and passes.

## Exact artifacts

| Artifact | SHA-256 |
| --- | --- |
| [Saved Workbook bundle](cas-algebra-workbook-2026-11-02.math3d) | `6b1e1e5b8d3fc3abef61a683761ea3e7dba0331f63a5188997d3bea86ec4a0b0` |
| [Markdown export](cas-algebra-workbook-2026-11-02.md) | `588082f9ee1e90de0b4bdb7d5f2fb526ef7d9021438a9479a888c7f1e8752d18` |

Screenshots show the [real CAS result](cas-algebra-local-result-2026-11-02.png), [runtime state](cas-algebra-docker-unavailable-2026-11-02.png), and [independently imported Workbook evidence](cas-algebra-independent-import-2026-11-02.png).

This gate covers the desktop development build and one real Local WSL Sage installation. It does not certify a live Docker container, hosted runtime, packaged installer, or other operating systems.
