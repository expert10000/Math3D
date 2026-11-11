# M3D20-10 performance and resilience gate

## Scope and reference host

The source-checkout gate was measured on 2026-11-11 on Windows 10.0.26200 x64, a 12th Gen Intel Core i9-12900K (24 logical CPUs), and 127.7 GiB RAM. The final source build is `92c7e063b1f1d1ffb734da7e2e840dc85bedc4b8`, renderer SHA-256 `807c0fa5e9c356b25ea775f7dea812c9132d12095ca61fdc555a17e6e7218941`, `dirty: false`, application version 1.7.0. This is a source-built Electron run, **not an installed 2.0 candidate**.

Three independent [performance receipts](evidence/m3d20-10-source-baseline.json) were collected at baseline, [after the worker/cache change](evidence/m3d20-10-source-after-worker.json), and [after the final runtime change](evidence/m3d20-10-source-final.json). Only the last has a clean build identity and includes the final cancellation UI change. The earlier two preserve their true `dirty: true` identities and cannot certify a release build. Each profile has three observations. The nearest-rank p95 with three observations is the maximum observed value, not a statistically stable population percentile. Startup launches use fresh and reused profiles; they do not clear the OS file cache. The first Gallery and Project opens are fresh UI routes; the remaining two are warm copies. Memory is sampled process-tree RSS every 750 ms, excluding GPU allocations.

| Profile | Dataset and stop condition | Final p50 / p95 | Highest observed p95 across three runs | Source limit |
| --- | --- | ---: | ---: | ---: |
| Cold startup | Fresh profile to visible Math3D heading | 1,632 / 1,636 ms | 1,636 ms | 2,000 ms |
| Warm startup | Reused profile to visible heading | 1,647 / 1,826 ms | 1,826 ms | 2,200 ms |
| First Gallery Study | Catenary Study, first fresh then two warm copies | 675 / 5,041 ms | 5,041 ms | 6,100 ms; warm copy ≤850 ms |
| Mesh load | 12,192,750-byte `12_dragon_medium.obj`, SHA-256 `69f109fb8ae354684d63a1604ced08a94382aa9a130119fa6fafbdf1e23ad33c` | 7,451 / 7,805 ms | 7,805 ms | 9,400 ms |
| Volume extraction | 128³ cells, full isosurface result | 14,372 / 14,455 ms | 15,075 ms | 18,100 ms |
| Result-rich Project | `mesh-comparison-study`, three saved results, first fresh then two warm copies | 621 / 16,608 ms | 16,608 ms | 20,000 ms; warm copy ≤800 ms |

The final profile's peak sampled process-tree RSS was **1,196 MiB**, against a **1,500 MiB** source limit. The baseline and after-worker peaks were 1,220 and 1,246 MiB respectively; these short runs do not establish a memory reduction. Per-profile RSS limits and the exact datasets are in [the machine-readable budgets](PERFORMANCE_BUDGETS.json). Limits are the highest observed p95 or RSS across the three runs plus 20%, rounded up to a practical 50 or 100 unit boundary. They are regression thresholds for this host and dataset, not product-wide targets.

## Stress and recovery receipts

- [100 module switches](evidence/m3d20-10-navigation-100.json): Graphs, Surfaces, Mesh, Volume, and Projects repeated 20 times. Each route remained visible, no page errors were observed, and sampled RSS rose from 881 MiB to a peak of 1,187 MiB. Five seconds idle ended at 1,132 MiB. This passes the 1,450 MiB **100-switch ceiling**; the rising series does **not** establish a long-run plateau. A longer installed soak remains open.
- [Volume failure recovery](evidence/m3d20-10-volume-failures.json): actual `WEBGL_lose_context` loss and restore, cancellation of a 128³ extraction, source edit to 127×128×128, and a newer completed extraction. The older result did not replace the newer result. The unit [worker storm test](../../../renderer/src/volume/workerCoordinator.stress.test.ts) cancels 99 superseded requests, ignores late messages, refuses stale revisions, and fails in-flight work on worker exit before retry.
- [Four-pane restart](evidence/m3d20-10-quad-restart.json): a saved quad Study retained four panes through a graceful desktop close/relaunch. Its combined Geometry pane explicitly withheld an unavailable read-only preview. The existing `project-startup-resume.spec.ts` restore and decline cases both passed, for **5/5 desktop stress cases** together with the three new cases.
- Exploratory **hard process termination remains unqualified**: after an immediate forced exit of the test app, the just-saved Project was not found on relaunch. The test profile and persistence mechanism need investigation before treating hard-crash recovery as passed. This observation is separate from the passing startup autosave prompt tests.

The [source gate report](evidence/m3d20-10-source-gate.json) passes its host, dataset, build, timing, RSS, and three machine-readable stress checks. `--installed` fails closed because no installed-candidate budget or package receipt exists. Browser/mobile behavior, installed-host GPU memory, and long-duration memory plateau remain release work. **M3D20-10 release sign-off is open.**

The 2.0 source checkout now writes a disk-synced Project checkpoint before acknowledging Save. Recovery reconciles it before the first UI read, refuses corrupt or newer local state, and does not reconstruct missing resource bytes. Resource-backed Saves defer the checkpoint until the strict sidecar transaction completes. `npx playwright test tests/e2e/project-hard-exit-recovery.spec.ts --reporter=list` passed 2/2 on Windows after terminating the entire Electron process tree: one named Project and its library returned with exact bytes, and one resource-rich Project reopened with matching Mesh and Volume sidecars. This is a source-build crash/restart observation, not installed-package or power-loss evidence.

The [RC2 soak runner](RC2_SOAK_GATE.md) now includes that hard-exit test and a 120-minute, same-process navigation/memory observation. The [long-memory reviewer](../../../scripts/check-release20-long-memory.mjs) requires identified clean build bytes, at least two complete 100-action cycles, two elapsed hours, and no page errors. It reports peak RSS and late growth without qualifying a plateau; the 100-switch source ceiling is not a multi-hour budget. Installed memory requires its own candidate hash and frozen budget. Neither two-hour run nor installed memory measurement has been completed for this 2.0 checkout.

The [2.0 memory diagnostic summary](evidence/m3d20-candidate-memory-diagnostic.json) records 800 repeated module switches in one source Electron process over 19 minutes on the reference Windows host. All eight cycles remained responsive and the six-process tree stayed stable, but sampled RSS rose from 785.3 to 2,300.7 MiB, mostly in the renderer (cycle-end RSS 585.9 to 1,653.7 MiB). A separate three-cycle forced-GC comparison reduced renderer RSS by about 76–86 MiB at each checkpoint while post-GC renderer RSS still rose 510.8 → 682.6 → 853.5 MiB; DOM node count remained 666. Isolated 100-action pairs showed the largest short-run RSS increases on Mesh and Volume. These are diagnostic smokes from a source build with test-script edits, not a clean two-hour or installed-candidate gate. The retained native/renderer growth needs ownership and a bounded-memory fix or a justified measured plateau before M3D20-10 can close.

## Reproduce and decide

From the repository root in PowerShell on the reference host:

```powershell
npm ci
npm run build:core
$env:MATH3D_PERF_REPORT = 'docs/releases/2.0.0/evidence/m3d20-10-source-final.json'
npm run test:release20:perf
$env:MATH3D_STRESS_REPORT_DIR = 'docs/releases/2.0.0/evidence'
npm run test:release20:stress
npx vitest run renderer/src/volume/workerCoordinator.stress.test.ts --maxWorkers=1
npm run test:release20:perf:check
```

The checker writes `test-results/m3d20-10-gate.json` with an individual pass/fail decision for every metric. Use `--report`, `--budget`, `--stress-dir`, and `--output` to point it at a candidate's receipts. `node scripts/check-release20-performance.mjs --installed` deliberately fails until an installed 2.0 package hash, clean installed-host profile, separate frozen limits, and matching stress evidence are added. Keep the installed receipt distinct from these source-checkout files; do not relabel source measurements as package sign-off.
