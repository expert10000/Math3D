# M3D20-09 — source-freeze readiness snapshot

**Snapshot:** 2026-11-14. This records a reviewed source baseline and CI receipts; it is not an RC1 freeze or release sign-off.

## Source identity and integration

- `main` when this receipt was revised: `1b41be899ad5cc25ec5b05c9951a853923f6bc39` ([commit](https://github.com/expert10000/Math3D/commit/1b41be899ad5cc25ec5b05c9951a853923f6bc39)). It adds a Windows Sage endpoint reachability receipt to two release documents and no source files. This is the exact commit to requalify before an RC1 freeze.
- Its parent `3b518f154906218368ce046f2010098590d44326` ([commit](https://github.com/expert10000/Math3D/commit/3b518f154906218368ce046f2010098590d44326)) adds a guarded local Sage route for Windows qualification: a preflight workflow, bridge and tunnel scripts, and a Docker Compose change. It changes source, so the earlier source matrix cannot qualify it by ancestry alone.
- The preceding `7ec9aa82c9fec821c0421f403707c5e988c2d671` is the squash merge of [PR #60](https://github.com/expert10000/Math3D/pull/60), an Android internal APK and emulator documentation/evidence change. #60 was merged at `2026-11-14T22:03:53Z` from head `a6b80bfb3d63c5178e529045a08a4abbbdcaa8a7`. `git diff --name-status f7258881 7ec9aa82` lists only eight documentation/evidence files. The physical-device gate remains open.
- #60's parent, `f725888199b35e93809c1b20f12c54afea0c2efc`, has the last completed full source workflow matrix.
- [PR #57](https://github.com/expert10000/Math3D/pull/57) records hosted-web/Cloudflare work deferred for this pass. [PR #61](https://github.com/expert10000/Math3D/pull/61) changes Geometry source as well as plans and belongs to its journey owner. Neither is included in this snapshot. Any later source merge requires a new identity and matching receipts.

## Completed full-source CI on the parent

Every run below has `headSha = f725888199b35e93809c1b20f12c54afea0c2efc`, `status = completed`, and `conclusion = success`:

| Workflow | Run |
| --- | --- |
| M3D20 frame and resource relink regressions | [43625939172](https://github.com/expert10000/Math3D/actions/runs/43625939172) |
| Gallery Quality | [43625939240](https://github.com/expert10000/Math3D/actions/runs/43625939240) |
| Unified Projects Software Acceptance | [43625939178](https://github.com/expert10000/Math3D/actions/runs/43625939178) |
| Docs Pages | [43625939267](https://github.com/expert10000/Math3D/actions/runs/43625939267) |
| Release 2.0 Flagship Source Evidence | [43625939150](https://github.com/expert10000/Math3D/actions/runs/43625939150) |
| Windows Source Smoke | [43625939283](https://github.com/expert10000/Math3D/actions/runs/43625939283) |
| CI Build and Worker Smoke | [43625939219](https://github.com/expert10000/Math3D/actions/runs/43625939219) |
| Linux Package Smoke | [43625939211](https://github.com/expert10000/Math3D/actions/runs/43625939211) |
| Mobile Android Gate | [43625939128](https://github.com/expert10000/Math3D/actions/runs/43625939128) |
| Graph2D Professional Software Acceptance | [43625939292](https://github.com/expert10000/Math3D/actions/runs/43625939292) |

## CI on the documentation merge

These runs have `headSha = 7ec9aa82c9fec821c0421f403707c5e988c2d671` and were started by the #60 merge. The subsequent Sage source push cancelled three; they are not passes:

| Workflow | Run | Conclusion |
| --- | --- | --- |
| Mobile Android Gate | [43646085488](https://github.com/expert10000/Math3D/actions/runs/43646085488) | Cancelled |
| Linux Package Smoke | [43646085536](https://github.com/expert10000/Math3D/actions/runs/43646085536) | Cancelled |
| Windows Source Smoke | [43646085542](https://github.com/expert10000/Math3D/actions/runs/43646085542) | Success |
| Docs Pages | [43646085513](https://github.com/expert10000/Math3D/actions/runs/43646085513) | Success |
| CI Build and Worker Smoke | [43646085561](https://github.com/expert10000/Math3D/actions/runs/43646085561) | Cancelled |

## New source CI on `3b518f15`

All runs below have `headSha = 3b518f154906218368ce046f2010098590d44326`. The later documentation push cancelled most of the overlapping runs. Their current status must be checked at the links:

| Workflow | Run |
| --- | --- |
| Check live Sage endpoint from Windows | [43646985315](https://github.com/expert10000/Math3D/actions/runs/43646985315) |
| Mobile Android Gate | [43646977622](https://github.com/expert10000/Math3D/actions/runs/43646977622) |
| Windows Source Smoke | [43646977642](https://github.com/expert10000/Math3D/actions/runs/43646977642) |
| Release 2.0 Flagship Source Evidence | [43646977620](https://github.com/expert10000/Math3D/actions/runs/43646977620) |
| Docs Pages | [43646977603](https://github.com/expert10000/Math3D/actions/runs/43646977603) |
| Projects Installed Engine Acceptance | [43646977643](https://github.com/expert10000/Math3D/actions/runs/43646977643) |
| Linux Package Smoke | [43646977580](https://github.com/expert10000/Math3D/actions/runs/43646977580) |
| CI Build and Worker Smoke | [43646977590](https://github.com/expert10000/Math3D/actions/runs/43646977590) |

The documentation-only `1b41be89` push started another five runs with `headSha = 1b41be899ad5cc25ec5b05c9951a853923f6bc39`: [Windows Source Smoke 43647147637](https://github.com/expert10000/Math3D/actions/runs/43647147637) **failed**, [Docs Pages 43647147633](https://github.com/expert10000/Math3D/actions/runs/43647147633) passed, and [CI Build and Worker Smoke 43647147623](https://github.com/expert10000/Math3D/actions/runs/43647147623), [Mobile Android Gate 43647147692](https://github.com/expert10000/Math3D/actions/runs/43647147692), and [Linux Package Smoke 43647147730](https://github.com/expert10000/Math3D/actions/runs/43647147730) were still in progress at this review. The earlier [Sage preflight 43646985315](https://github.com/expert10000/Math3D/actions/runs/43646985315) and [Projects Installed Engine Acceptance 43646977643](https://github.com/expert10000/Math3D/actions/runs/43646977643) passed at `3b518f15`; the new commit does not touch their inputs.

Windows Source Smoke failed in `renderer/src/graph2d/graph2dFormulaPreview.test.ts:126`: the `sqrt(-1)` inequality preview returned a diagram where the test expected a sampling error (1 failed, 2,931 passed, 1 skipped). The test and implementation files did not change between `f7258881` and `1b41be89`. The preview uses an 80 ms sampling deadline and can return an incomplete diagram when that limit is reached, so timing sensitivity is a possible explanation; it requires reproduction and disposition before a freeze. Do not count this run as a pass.

## Remaining #9 gate

The [RC1 source acceptance runner](RC1_ACCEPTANCE_GATE.md) now lists 15 checks. Before declaring a freeze, resolve the red Windows smoke result, create and independently review a manifest for the *then-current* clean `main` commit, run all 15 checks with that manifest, and attach its exact SHA-256 and acceptance JSON. Recheck the full CI matrix against that commit. The older `1e0726b9` RC1 receipt cannot qualify this snapshot. The separate 800-switch and two-hour memory gates remain with the memory workstream; a passing source CI matrix does not close them. Signed-candidate and installed-host gates also remain open.
