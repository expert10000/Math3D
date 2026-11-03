# SAGE-A03 algebra dependency freshness — 2026-11-03

## Contract

`inspectProjectAlgebraFreshness` derives a status for each current Project algebra object from its saved revision graph. It reports direct dependencies, direct dependents, `fresh` or `stale`, and the pinned and current revisions responsible for staleness. The Project stores immutable object histories; freshness is recalculated from canonical definition hashes, so stale markers cannot drift from the saved mathematics.

An exact parent reference remains pinned to its historical revision. If the latest parent definition has a different hash, its child is stale. Staleness propagates through pinned ancestors to downstream objects. A rename or archive that leaves the mathematical definition unchanged does not stale its descendants. Rebuilding a child against the new parent requires an explicit child revision; downstream objects stay stale until they are likewise rebuilt. No Sage code runs as part of freshness inspection.

## Acceptance gate

The gate saves `Q`, `GF(5)`, `R = QQ[x,y]`, `S = R[t]` and `T = S[u]`. After `R@2` changes its coefficient field to `GF(5)`, `S@1` and `T@1` report stale with `R@1 → R@2` as their cause. `Q`, `GF(5)` and `R@2` remain fresh. `R@1`, `S@1` and their exact dependency references remain in the Project history. Independently exporting and importing the `.math3d` Project reproduces the same status and causes.

Other checks cover label-only revisions, archive state, explicit `S@2` and `T@2` rebuilds, and invalid empty registry input. A03 does not yet add a Structures UI or Sage reconstruction; those are A06 and A04 respectively.

## Verification

- A03, A02 and A01 focused tests — passing.
- Repository TypeScript check and `build:core` — final gates for this change.
