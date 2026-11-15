# UI cleanup draft state — shared thread handoff

Updated: 2026-11-15. Repository: expert10000/Math3D.
Reviewed source: `2cf4b6a4b096ff08f3e7c8e928c542d25acca065`. Planning files reached main at `9f2a9f79abeb9d36225199fe899185863de74665`. First implementation `8448e91fda5c3c832037dd02a44292197363ac90` was merged by PR70 as `4fca932b2802d4b9085fbfe1134793f976c446fd`.

## How threads cooperate

1. Pull current main and read this file before editing. Inspect the current claim and current source; this review SHA is evidence, not permission to overwrite newer work.
2. Claim one task with an identifiable owner/branch, base commit, exact file/region scope and next check. Commit/push the claim before substantive overlapping edits. States: proposed → claimed → implemented → verified; use blocked with a concrete reason.
3. Use isolated worktrees. Do not reset or reuse another thread's dirty tree, override a claim, or copy another branch's test PASS onto your commit.
4. `renderer/src/App.tsx` is a serial-edit resource. Agree the exact region and exchange minimal patches. Component-only tasks can proceed independently after checking imports and shared CSS. No broad formatting or monolith rewrite as a cleanup side effect.
5. A stale claim is not automatically free: contact the owner or record an explicit handoff. Keep partial work and tests visible. This file does not imply exclusive ownership of the entire repository.
6. Record source/harness SHA, actual commands, results, screenshots/CI links, limitations and next steps. Missing/skipped/cancelled/incomplete tests are not verified. The existing Integration Lab remains the canonical acceptance-evidence owner.
7. Preserve original scientific milestone approval and its exact commit. UI cleanup does not automatically qualify newer builds or installers. Signing stays separate; Cloudflare stays excluded.

## Active claims

| Task | State | Owner / branch | Reviewed base | Owned scope | Next check |
| --- | --- | --- | --- | --- | --- |
| SHARED-01 | verified (scoped) | this cleanup thread / codex/ui-cleanup-first-slice | 2cf4b6a4 | Production footer patch merged; no further App.tsx edits reserved by this task | Closed: scoped Windows native CI passed at fa27817f; no file reservation |
| CA-01 | implemented; verification pending (responsive layout slice) | UI cleanup thread / codex/ui-workbench-implementation | 0272172c | App.tsx analytic Explorer layout JSX only (around111000–111340); new complexExplorerLayout.css; focused native layout test and scoped workflow | Check responsive Z/W/Inspector bounds at1100 and800px; preserve math handlers and existing layout state |
| Geometry #61 | external draft | codex/geometry-topology-2-0 / PR61 | See current PR head | Geometry topology/control work; coordinate any App.tsx overlap | Owned by its existing thread; not modified here |

## Workbench backlog

| Draft / tasks | State | Owner | Evidence / remaining work |
| --- | --- | --- | --- |
| [Mesh](MESH_UI_REVIEW_DRAFT.md), MESH-01…05 | proposed | unclaimed | Native Smooth and Undo spot checks recorded; layout, capability, persistence acceptance pending |
| [Complex](COMPLEX_ANALYSIS_UI_REVIEW_DRAFT.md), CA-01…05 | proposed | unclaimed | 1/z preset and explorer navigation observed; plot/layout and analytic workflows pending |
| [Topology](TOPOLOGY_UI_REVIEW_DRAFT.md), TOP-01…05 | proposed | unclaimed | Torus canonical χ=0 versus display mesh observed; view/algebra/persistence cleanup pending |
| [Surfaces](SURFACES_UI_REVIEW_DRAFT.md), SURF-01…05 | proposed | unclaimed | Implicit preset switch and canonical Analysis panel observed; representation/derive/save journey pending |
| [Graphs](GRAPHS_UI_REVIEW_DRAFT.md), GR-01…05 | proposed | SHARED-01 verified; other tasks unclaimed | y=x preview/create/hide/show observed; remaining Graph layout/scientific-transfer tasks unclaimed |

## SHARED-01 evidence and implementation state

- Confirmed before: empty/authored Graphs, Topology and Complex Function Explorer footers show the retained Complex Map Sweep or Box mesh name/type. Source statusItems appends unifiedSelectedNode without workbench scoping.
- Intended behavior: independent workbench footers describe their own view; Graphs can show its current document revision. Do not clear scene/selection, alter owner state, or suppress real result Inspector warnings.
- Preserve: existing Curve and promoted Graph target footer branches; actual Mesh/Surface/Geometry scene footer behavior and all mathematical/runtime owners.
- Implementation: `8448e91fda5c3c832037dd02a44292197363ac90`, merged through [PR70](https://github.com/expert10000/Math3D/pull/70) as `4fca932b2802d4b9085fbfe1134793f976c446fd`. This merge was observed while this thread was verifying; no duplicate PR or overwrite was made.
- Local typecheck passed on the footer patch; clean production core build passed at merge `4fca932b`, renderer SHA256 `c43944dd4cbe3498bc81400a09998a7aadcf77278d0e035ddcdc28055c8719d3`. Renderer builds run with Node heap8192MB; one parallel local build was killed by memory pressure and was repeated successfully in isolation.
- Native after review at merge `4fca932b`: Graphs shows its own scene label and document revision; Topology and Function Explorer omit unrelated mesh/camera/analysis facts. Mesh return shows the actual retained Complex Map Sweep with its mesh facts. See `*-footer-after.png` and `mesh-footer-return-after.png`.
- First scoped CI [43709751019](https://github.com/expert10000/Math3D/actions/runs/43709751019): typecheck/build passed, one native test failed on its final Box expectation. Earlier workbench-isolation assertions passed. Complex map entry intentionally replaces the current sampled mesh; this is not the analytic Explorer’s retained-scene boundary.
- Corrected native test keeps Box preservation after Graphs/Topology, then captures the real Complex Map mesh/counts before entering Function Explorer and asserts their return to Mesh. No application assertion was removed; no production code change was needed for this fixture correction.
- The scoped regression is wired for relevant main/pull-request changes. Exact source and harness commit `fa27817fb69c38dc0b6dae8bc2ec108cab03b13a`: [run 43710641247](https://github.com/expert10000/Math3D/actions/runs/43710641247), attempt 1, Windows 2022, passed. Locked installation, `npm run typecheck:noemit`, `npm run build:core` and the native regression all passed. Playwright: 1 passed, test duration 16.0 seconds (suite 17.3 seconds), retries disabled; no skipped test. SHARED-01 is verified only for this bounded footer/retained-scene scope. Broader scientific and installed-app acceptance is not inherited.
- [CI evidence artifact 14159909121](https://github.com/expert10000/Math3D/actions/runs/43710641247/artifacts/14159909121): `ui-cleanup-footer-evidence`, 2,234 bytes; GitHub/upload-log SHA256 `c79f33647cd85bb231b70906b4d6533444732c2ee548e5ebf4fe69c6099f3e64`. Contains source identity, build identity and Playwright JSON. See [recorded CI observation](evidence/footer-ci-observation.json). The earlier failed head remains separate evidence.
- Larger layout/math/diagnostic changes: separate per-module tasks; not silently included.

## Resuming after interruption

Check remote main, this claim and branch HEAD. Use the screenshot evidence and source files linked in each draft, then inspect current code. Add a dated handoff entry below with owner, branch, last commit, completed checks and the first remaining check. Never infer that this document's proposals were executed.

## Handoff log

- 2026-11-15 — Review prepared from 2cf4b6a4; all five native workspaces inspected in an isolated profile. Planning committed before the first shared implementation; actual code/test evidence will be appended separately.

- 2026-11-15 — Five drafts and17 before captures on main; production footer patch merged via PR70. Shared App.tsx region is released (patch complete); other threads may claim nonoverlapping tasks after reading current main. Automated regression fixture corrected for intentional 3D Complex map generation; final source-bound CI pending.
- 2026-11-15 — Concurrent main update `20694de5998addc05719b83e43c5d31040147a58` merged desktop accessibility #67. Its Project/card/focus/CSS edits are preserved. The only App.tsx delta from4fca is a CAS-gallery focus handler, outside the footer claim. Review the new accessibility changes before taking module layout tasks; the five drafts still explicitly describe their original2cf4b6a4 review source.

- 2026-11-15 — SHARED-01 closed as scoped verified on source/harness `fa27817fb69c38dc0b6dae8bc2ec108cab03b13a`; Windows CI run43710641247 passed. No production file is reserved by this thread. Other threads should pull current main and claim one proposed module task with exact file regions before editing. This documentation-only handoff does not transfer acceptance to its new commit. Next implementation: select an unclaimed module task after checking current source and active claims.

- 2026-11-15 — Claimed CA-01 responsive layout slice from0272172c. Exact scope above; other module tasks remain unclaimed. No ownership of scientific models, Geometry #61 or unrelated App.tsx regions. Claim published before substantive edits.

- 2026-11-15 — CA-01 responsive slice implemented: Inspector stacks below plots when usable workbench width is at most900px; plot grids stack at640px. Existing view conditions, handlers and layout state retained; layout buttons expose aria-pressed. Focused native regression added for800/1100/1600px. Local typecheck and CI are pending; full CA-01 and preset-column cleanup are not yet accepted.
