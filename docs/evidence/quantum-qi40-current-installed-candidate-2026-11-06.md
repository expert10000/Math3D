# QI-40 current installed candidate and installer-mode replay · 2026-11-06

QI-40 and release sign-off remain open. This follows the [prior exact-candidate check](quantum-qi40-fixed-installed-candidate-2026-11-06.md) and uses a candidate built after lazy workbook serialization landed on `main`.

## Exact candidate and two-app sign-off

The nonpublishing [two-app candidate run](https://github.com/expert10000/Math3D/actions/runs/42232023714) built Math3D `ffc4f4a6832cd765947c0786f9b3f025c512cc19` and Theory Lab `38842c8ca927720e9a0f39bd6a04f0e366073996`. The build job passed and uploaded the exact candidate manifest and installers. The Math3D installer SHA-256 is `c157d9aeeabe141290f5c7420efed86c0dd4b5b0ae9a3eff78057c61e1b06bf0`; Theory Lab's is `800005a71d993e45d49cd6b36ed032c7464c65620d7ecca372700457365f8154`.

The [installed sign-off record](quantum-qi40-current-candidate-signoff-42232023714.json) verified those bytes, then Theory Lab setup exited `0xC0000005`. The Application Error event again named `System.dll`. Installed UI and QEC roundtrips did not run. The [rollback record](quantum-qi40-current-candidate-rollback-42232023714.json) shows the current candidate installed, seeded its profile, ran QEC, and uninstalled; the pinned pre-QEC installer then exceeded 180 seconds, leaving rollback readers untested. These are separate installer failures, not a passing two-app sign-off.

## New installed memory run

The [first 80-cycle installed check](https://github.com/expert10000/Math3D/actions/runs/42250651296) downloaded the exact run-`42232023714` candidate. Its [installer probe](quantum-qi40-current-candidate-installer-42250651296.json) verified the manifest, both installer hashes and Math3D's installed worker before stress. All closed previews returned to one canvas; WebGL context wrappers stayed 1 → 1 and textures 5 → 5 in the [full trace](quantum-qi40-current-candidate-installed-80-42250651296.json).

The [budget result](quantum-qi40-current-candidate-installed-budget-42250651296.json) measured **2,217,528 bytes** of forced-GC closed-preview heap growth from cycle 20 to 80, **120,376 bytes above** the provisional **2,097,152-byte** limit. It is much lower than the prior candidate's 13,510,144 bytes, but the gate still failed. Samples rose from 25,086,060 bytes at cycle 20 to 27,303,588 at cycle 80; the remaining growth needs attribution. The provisional target has not been relaxed.

A [second installed run](https://github.com/expert10000/Math3D/actions/runs/42251549387) on the same candidate also failed. Its [budget](quantum-qi40-current-candidate-installed-repeat-budget-42251549387.json) measured **3,308,844 bytes** from cycle 20 to 80. The [repeat trace](quantum-qi40-current-candidate-installed-repeat-80-42251549387.json) again returned every closed preview to one canvas, with WebGL contexts 1 → 1 and textures 5 → 5. The two independent installed measurements establish that this candidate has not met the provisional memory gate; they do not identify the remaining retainer. The largest final-snapshot count/size growth is in generic arrays and objects, which needs a more specific root-path investigation before a source fix can be claimed.

## Installer-mode comparison

The [current-user full-dump matrix](https://github.com/expert10000/Math3D/actions/runs/42250682164) passed all 12 exact-hash probes, six Theory Lab-only and six after Math3D. A separate [all-users full-dump matrix](https://github.com/expert10000/Math3D/actions/runs/42251176000) also passed all 12 with the same installer hashes. The latter used an explicit `/ALLUSERS` probe mode on [the diagnostic branch](https://github.com/expert10000/Math3D/tree/codex/qi40-hardening-m3d20-inventory-20261106); the release installer itself was not rebuilt or changed. The runs only show no crash in these samples. They do not distinguish install mode as the cause, since the exact Theory Lab installer crashed in sign-off and earlier current-user full-dump matrices also varied between clean runs and crashes.

The next reliable-install diagnosis must capture the triggering NSIS per-user call state or otherwise reproduce the fault with a controlled installer change, then repeat the exact installed sign-off and rollback gates. Until then, no release freeze or QI-40 completion claim is supported.
