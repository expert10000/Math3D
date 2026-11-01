# Module map gate sweep — 2026-11-01

The source baseline was clean commit `c7048030bc042d8ef69d2080516ed241c3c10392` in the isolated Android acceptance worktree. This sweep follows the [mobile roadmap](../mobile-roadmap.md), [Graph2D desktop/mobile roadmap](../math3d-graph2d-desktop-mobile-roadmap.md), [Topology map](../topology-existing-functionality-map.md) and [scientific-scene compatibility map](../scientific-scene-compatibility-map.md). Those maps define different platform scopes. Passing a desktop or shared-core gate does not attest a physical mobile workflow.

## Automated gates

| Area | Gate and observed result |
| --- | --- |
| Type and build | `npm run typecheck:noemit`, `npm --prefix apps/mobile run typecheck` and `npm run build:core` passed. The build identity reported baseline commit `c7048030`. Mobile typecheck was repeated after the producer-version fix and passed. |
| Shared boundaries | `npm run check:kernel:boundaries` passed: 1,449 modules, 3,043 dependencies, no violations. |
| Geometry, Mesh, Surface Analysis, Curves, Volume, Topology, Complex Analysis, Graph2D, Vector Fields and Quantum | One renderer Vitest sweep over `src/geometry src/mesh src/surfaceAnalysis src/curveAnalysis src/volume src/topology src/math/complex src/graph2d src/vectorfield3d src/quantum`: 257 files, 1,589 tests passed. This is shared/desktop module coverage, not a physical mobile test of every module. |
| Projects | `npm run test:projects:contracts` passed its two sets: 47 files/239 tests and 18 files/102 tests (341 total). Native device, installed engine and editor restoration still require their own gates. |
| Mobile Graph and projects | `npm run test:graph2d:mobile:unit` passed 70 files/417 tests on the baseline and 70 files/418 tests after the producer-version regression test. |
| Platform baseline | `npm run test:platform:baseline:unit` passed 3 files/28 tests. The rebuilt Electron app passed `npm run test:platform:baseline:desktop` with 2 Topology/Complex navigation tests. |
| Graph fixture transfer | `node scripts/graph2d-release-test-pack.mjs` passed integrity, canonical import/serialization, seven graph kinds, two CSV sidecars, linear-regression reference and future-version rejection. Physical TP08 is recorded separately. |
| Scientific scenes and quantum import | `npm run test:scientific-scene` passed fixture checks, generic validation/view/exact sample and tamper refusal. `node scripts/test-quantum-scene-import.mjs` passed frozen QWZ/SSH and other quantum bundles, volume/lattice/reciprocal mappings and tamper refusal. This does not complete every later quantum roadmap item. |
| Desktop module acceptance | A 9-file Playwright sweep passed 87 tests spanning Geometry, Graph2D, Mesh Analysis, Surface Analysis, Curves, Volume, Topology, Complex Analysis and unified Projects. It used `MATH3D_PYTHON=C:\Users\janko\OneDrive\Dokumenty\Math3D\.venv-worker\Scripts\python.exe` for the optional Mesh/CGAL worker; without that environment, the clean worktree's worker-backed Mesh test failed to launch its backend. |
| Scientific, Vector Field and Quantum UI | Three selected Playwright checks passed for a verified non-quantum scientific sample and the docked/built-in Vector Field scenes. One Quantum bundled-example check passed after making its catalog-size assertion accept the current 36 entries rather than requiring the old count of 9. The full 55-test set for these three specs was not run. |

## Samsung baseline

After rebasing onto remote `main` at `f2f91687`, `npm run typecheck:noemit`, mobile typecheck, `npm run build:core` and all 418 mobile unit tests passed again. Projects contracts expanded with upstream work to 47 files/241 tests and 18 files/103 tests (344 total); all passed. The two newly affected Projects Playwright checks for compute center and mesh generation passed with the configured Python worker. The 87-test desktop module sweep above was run before that rebase. The rebased Notes Check APK was installed on Samsung and its native handoff export again reported mobile producer version `1.6.0` with an eight-row table reference.

The independent Notes Check package on Samsung SM-A566B/Android 16 has exact-APK supplemental passes for TP01, TP03, TP04, TP05, TP06, TP08, TP13 and TP14. The [TP08 transfer record](mobile-android-tp08-transfer-2026-11-01.json) verifies exact Graph and CSV files through Android Download, missing-sidecar refusal, CSV import, eight original rows, future-version rejection, native handoff export and another independent editable copy. The exported JSON retains an external table reference and does not embed row bytes. [TP14 regression](mobile-android-tp14-regression-2026-11-01.json) verifies the eight-row fit, residuals, visual interval distinction and an explicit stale result after an in-app data edit. Numerical interval export remains TP11 work.

The maps' full physical matrix is still open: interrupted pinch/rotation semantics, tablet layout, spoken TalkBack, publication formats, scale matrix, another Android class, iPhone/iPad, long workload calibration and the intermittent Graph-opening stall. The original internal signing key is unavailable; this Samsung evidence concerns the independent debug-signed app only.

## Source follow-up from TP08

The TP08-tested APK wrote producer version `1.5.1` into its exported handoff while its mobile package version is `1.6.0`. Source now reads the mobile package version for project handoffs and mobile object envelopes. Mobile typecheck and the focused scene and Graph export tests passed. The corrected independent APK was built, signed, installed in place and exported a new handoff reporting producer version `1.6.0`; see its [exact-build record](mobile-android-producer-version-2026-11-01.json). The full TP08/TP14 walkthroughs were on the preceding APK.
