# Mobile Phase 5 Gate Report

Generated: 2026-05-15T17:41:36.756Z
Commit SHA: 44bff9778ab17b6dae6ed1da56b9403bef7e8f29

## Gate Checks

| Check | Status | Detail |
| --- | --- | --- |
| Mobile dev script exists | PASS | apps/mobile script: expo start |
| Mobile dependency versions are pinned | PASS | All dependency versions are exact. |
| apps/mobile lockfile exists | PASS | apps\mobile\package-lock.json |
| Mobile service layer uses shared packages/api-client backend | PASS | createHttpMeshBackend import and usage found. |
| Phase 5 checklist document exists | PASS | docs\mobile-phase5-stability-checklist.md |
| Capture tested commit SHA | PASS | 44bff9778ab17b6dae6ed1da56b9403bef7e8f29 |

Summary: 6 passed, 0 failed.

## Artifact Hashes

| Path | SHA256 | Status |
| --- | --- | --- |
| docs\mobile-phase5-stability-checklist.md | 61f33315f724f06d13b680af0507414936bb939912854fae4d9c7dec4b99f8c2 | OK |
| output\logs\mobile-dev-launch.err.log | d7a87d0e7d93bac82ee5ec4a055def22cf5710c088c15f5cedf89c0431804ef7 | OK |
| output\logs\mobile-dev-launch.log | 51a18d3fba35f3e98650e82011ca8bb4ef15bf89f6216dd6573e2c5c9467d189 | OK |
| output\logs\web-worker-proxy.log | 686cbfa0360373e5bbd65de865ae1b39bd43fcc3dbfbe864b405ed67dc3895cd | OK |

