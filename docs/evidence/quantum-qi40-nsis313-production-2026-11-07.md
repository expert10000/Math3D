# QI-40 NSIS 3.13 production build check · 2026-11-07

QI-40 and release sign-off remain open. This report checks the [production installer fix](https://github.com/expert10000/Math3D/pull/29) against exact nonpublishing Windows candidates. It follows the [matched old/new NSIS experiment](https://github.com/expert10000/Math3D/pull/27), in which both old-toolchain installers crashed intermittently in a shared `System.dll`, direct `System::Store` template removal did not suffice, and the pinned new-toolchain candidate passed 60/60 install probes on Windows latest and Windows 2022.

## Current-main candidate

The [combined build 42391732920](https://github.com/expert10000/Math3D/actions/runs/42391732920) includes current `main` through `65ed39de` and the release fix. Its Math3D installer SHA-256 is `8b547ab138159a92424889b551042d4941b82cead3b1e6fdd6b63f7a75da42fa`, and TheoryLab's is `72b57e346b68889775ac2d828be1054d68cac55ca341e48ef3b1f1bd50a01571`. The [component record](quantum-qi40-nsis313-current-main-components-2026-11-07.json) extracted the same 30,208-byte `System.dll` SHA-256 `1556ee1bf1cb477124e1269b534ed81653ba71994dab7903ee3782b75acc2810` from both installers. The build job enforced this identity before uploading the candidate.

The [Windows 2022 matrix](https://github.com/expert10000/Math3D/actions/runs/42392992165) and [Windows latest matrix](https://github.com/expert10000/Math3D/actions/runs/42392995581) each passed 18/18 exact-hash installs: six Math3D-only, six TheoryLab-only, and six two-app attempts per image. The [clean installed UI/QEC record](quantum-qi40-nsis313-current-main-signoff-2026-11-07.json) and [1.6.0 upgrade record](quantum-qi40-nsis313-current-main-upgrade-2026-11-07.json) passed on the same candidate.

The [rollback record](quantum-qi40-nsis313-current-main-rollback-failure-2026-11-07.json) failed **after the candidate installed**, during Project profile seeding. The failure trace shows a test click waiting for a hidden `project-save` button after graph promotion opened the compact Project companion. The test now opens full Project details before clicking Save; [rerun 42393464404](https://github.com/expert10000/Math3D/actions/runs/42393464404) is pending. This is a test navigation failure, so rollback remains unverified for the current-main candidate until the rerun passes.

## Remaining memory gate

The [installed 80-cycle run](https://github.com/expert10000/Math3D/actions/runs/42392998992) used the same Math3D installer with E2E-only hooks disabled. Its [budget](quantum-qi40-nsis313-current-main-memory-budget-2026-11-07.json) measured **2,832,516 bytes** late forced-GC heap growth versus the provisional **2,097,152-byte** target. Context and texture wrappers stayed 1→1 and 5→5. The separate source checkout had passed its budget, but this installed candidate did not; release sign-off remains open.
