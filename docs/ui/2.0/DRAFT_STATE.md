# UI cleanup draft state — shared thread handoff

Updated: 2026-11-15. Repository: expert10000/Math3D.
Reviewed source: `2cf4b6a4b096ff08f3e7c8e928c542d25acca065`. Planning files are intended for main; implementation starts on `codex/ui-cleanup-first-slice`.

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
| SHARED-01 | claimed | this cleanup thread / codex/ui-cleanup-first-slice | 2cf4b6a4 | App.tsx statusItems presentation gating only; native regression test; no Geometry handlers | Focused regression and native before/after footer check |
| Geometry #61 | external draft | codex/geometry-topology-2-0 / PR61 | See current PR head | Geometry topology/control work; coordinate any App.tsx overlap | Owned by its existing thread; not modified here |

## Workbench backlog

| Draft / tasks | State | Owner | Evidence / remaining work |
| --- | --- | --- | --- |
| [Mesh](MESH_UI_REVIEW_DRAFT.md), MESH-01…05 | proposed | unclaimed | Native Smooth and Undo spot checks recorded; layout, capability, persistence acceptance pending |
| [Complex](COMPLEX_ANALYSIS_UI_REVIEW_DRAFT.md), CA-01…05 | proposed | unclaimed | 1/z preset and explorer navigation observed; plot/layout and analytic workflows pending |
| [Topology](TOPOLOGY_UI_REVIEW_DRAFT.md), TOP-01…05 | proposed | unclaimed | Torus canonical χ=0 versus display mesh observed; view/algebra/persistence cleanup pending |
| [Surfaces](SURFACES_UI_REVIEW_DRAFT.md), SURF-01…05 | proposed | unclaimed | Implicit preset switch and canonical Analysis panel observed; representation/derive/save journey pending |
| [Graphs](GRAPHS_UI_REVIEW_DRAFT.md), GR-01…05 | proposed | SHARED-01 only claimed | y=x preview/create/hide/show observed; remaining Graph layout/scientific-transfer tasks unclaimed |

## SHARED-01 evidence and implementation state

- Confirmed before: empty/authored Graphs, Topology and Complex Function Explorer footers show the retained Complex Map Sweep or Box mesh name/type. Source statusItems appends unifiedSelectedNode without workbench scoping.
- Intended behavior: independent workbench footers describe their own view; Graphs can show its current document revision. Do not clear scene/selection, alter owner state, or suppress real result Inspector warnings.
- Preserve: existing Curve and promoted Graph target footer branches; actual Mesh/Surface/Geometry scene footer behavior and all mathematical/runtime owners.
- Implementation commit: pending.
- Actual focused tests and native after evidence: pending. The draft is not yet verified.
- Larger layout/math/diagnostic changes: separate per-module tasks; not silently included.

## Resuming after interruption

Check remote main, this claim and branch HEAD. Use the screenshot evidence and source files linked in each draft, then inspect current code. Add a dated handoff entry below with owner, branch, last commit, completed checks and the first remaining check. Never infer that this document's proposals were executed.

## Handoff log

- 2026-11-15 — Review prepared from 2cf4b6a4; all five native workspaces inspected in an isolated profile. Planning committed before the first shared implementation; actual code/test evidence will be appended separately.
