# G2D50 Graphs software acceptance

**Status — 2026-10-13:** Automated software acceptance for G2D44–49 is frozen by the cases below. The exact-build physical device and spoken screen-reader gates remain open under MOB-G13/G2D40; these automated results do not count as physical signoff.

The [physical-device addendum](graph2d-g2d50-device-checklist.md) specifies the G2D44–50 cases now required by the MOB-G13 evidence validator on each device. Its pending state does not alter this software acceptance result.

## Shared numerical and lifecycle corpus

| Case | Expected result | Evidence |
| --- | --- | --- |
| Polar circle, `r(θ)=2cos(θ)` on `[0,π]` | Swept area `π`, path length `2π`; mobile and shared core publish the same result ID, angular unit, and source hash when given the same tolerance. | `tests/unit/graph2dG2D50Acceptance.test.ts` and the existing polar measurement suite. |
| Out-of-domain polar bounds `[13,16.283185307]` for a `[0,2π]` source | Measurement is rejected with an authored-domain explanation. The Inspector leaves the entered values visible, visibly disables both actions, and offers **Use source angle range**. The inputs fit within the narrow right panel. | `tests/unit/graph2dG2D50Acceptance.test.ts` and `tests/e2e/graph2d-g2d50.spec.ts`. |
| Explicit `f(x)=x²−1`, `g(x)=0` on `[-2,2]` | Two roots and pair intersections near `−1` and `1`; desktop/core and mobile analysis expose the same candidate IDs. | `tests/unit/graph2dG2D50Acceptance.test.ts`. |
| Save a root and intersection, edit `f` to `x²+1`, undo | Both saved constructions resolve from source, become unavailable after the edit, and resolve again after undo. Save/reopen preserves intent and source generation; old artifacts fail the current-generation check. | `tests/unit/graph2dG2D50Acceptance.test.ts`, `renderer/src/graph2d/graph2dCandidateConstructions.test.tsx`, and `tests/e2e/graph2d-constructions.spec.ts`. |
| Thirty distinct saved candidate scans | The construction resolver counts no more than 12,000 source evaluations and marks later candidates unavailable when the shared budget is exhausted. Ambiguous local matches remain unavailable. | `renderer/src/graph2d/graph2dCandidateConstructions.test.tsx`. |
| Worker failure, cancellation, stale result | A failed sampling worker releases its job; one bounded host fallback can recover the graph. A settled failure shows its reason and **Retry sampling**, without an indefinite “Updating graph” message. Browser and task tests cover worker ownership and cancellation. | `renderer/src/graph2d/graph2dSamplingTask.test.ts`, `tests/e2e/graph2d-g2d50.spec.ts`, and `tests/graph2d-web/parity.spec.ts`. |

## Platform and interaction checks

| Gate | Result |
| --- | --- |
| Focused desktop unit tests | Nine Graph2D suites, 44 tests passed: kind-aware actions, polar measurements, critical points, intersections, construction intent/resolution, candidate matching/budgets, sampling task, and workspace shell. |
| Mobile model and portable corpus | Ten suites, 81 tests passed: mobile analysis, 13-fixture visual/numerical corpus, handoff, device-evidence gate logic, and the G2D50 shared corpus. The gate test rejects the pending physical-evidence template. |
| Chromium browser corpus | Both `en-US/UTC` and `pl-PL/Pacific-Auckland` worker/visual corpus runs passed. The browser test checks all seven graph kinds, source portability, finite geometry, and worker cleanup. |
| Electron journeys | G2D48–49 construction edit/undo flows, G2D50 invalid polar controls and worker recovery, plus existing narrow-layout, polar-grid, and worker-lifecycle journeys. |
| Accessibility | Named measurement inputs and buttons, a live invalid-bounds status, visibly disabled actions with a reason, a keyboard-reachable source-range action, and a named retry action are checked in the desktop flow. Existing G2D40 browser checks cover compact controls and forced colors. Spoken screen-reader signoff remains open. |

The source interval is authoritative for polar measurements. Angles outside it are not silently wrapped or clipped. Saved numerical candidates use a fixed, unique, same-kind local matching window; the correspondence remains numerical rather than a certified root identity under arbitrary source edits. Full physical performance calibration and iOS evidence remain part of MOB-G13, not this software gate.
