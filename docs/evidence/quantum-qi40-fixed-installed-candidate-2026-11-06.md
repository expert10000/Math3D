# QI-40 exact installed candidate: memory and installer replay · 2026-11-06

This check follows the [Geometry, workbook, and full-dump investigation](quantum-qi40-geometry-workbook-full-dump-2026-11-06.md). QI-40 remains open.

## 1. Exact candidate and installed workflow

The nonpublishing [two-app candidate workflow](https://github.com/expert10000/Math3D/actions/runs/42220709387) built Math3D commit `276a265bbfc6f884531e69e5a698c2bc332c1ec2` and Theory Lab commit `38842c8ca927720e9a0f39bd6a04f0e366073996`. Its build, installed handoff, rollback, and upgrade jobs passed. The Math3D installer SHA-256 was `284dc30f2c6a46cbc470c26b60b93894970adaf9eb460cfdee6bdf0cb2790e81`; the Theory Lab installer SHA-256 was `dcf48b6e1b6662155f0e30666187ee505a0ab718e035b34b434076aed56a6ccd`. The [installed probe](quantum-qi40-fixed-candidate-installer-42220709387.json) verified both downloaded hashes against the candidate manifest before installing Math3D. Passing this workflow does not replace the repeated-install reliability gate.

## 2. Installed memory budget

The [80-cycle installed run](https://github.com/expert10000/Math3D/actions/runs/42227743324) installed those exact Math3D bytes on a fresh Windows runner, then alternated Rice–Mele and hydrogen scene previews. Every close returned to the baseline canvas count of one. The final V8 snapshot held WebGL context wrappers at 1 → 1 and texture wrappers at 5 → 5. The [full bounded trace](quantum-qi40-fixed-candidate-installed-80-42220709387.json) and [budget result](quantum-qi40-fixed-candidate-installed-budget-42220709387.json) record a forced-GC closed-preview heap increase of **13,510,144 bytes** from cycle 20 to 80, above the provisional **2,097,152-byte** target; string self-size grew **17,453,532 bytes**. The CI job correctly failed the budget gate and uploaded its evidence.

This candidate predates the later lazy workbook serialization change. Subsequent minified **source** runs after that change measured 2,795,108 and 2,298,240 bytes of growth, both still above the provisional target. They are not installed-build evidence for this candidate or for a later installer.

## 3. Installer crash replay

The [12-attempt matrix](https://github.com/expert10000/Math3D/actions/runs/42227742024) used the same candidate manifest and installer hashes. Eleven probes passed; one both-app probe installed Math3D and then crashed while installing Theory Lab. The [sanitized failure record](quantum-qi40-fixed-candidate-installer-failure-42220709387.json) gives `0xC0000005` in NSIS `System.dll` at offset `00001581`, with CDB tokens `System!Store+0x4a0` and `System!Call+0x7f`. CDB also reported a stack-unwind problem, so those tokens do not establish an ordered call stack or the triggering arguments. The electron-builder NSIS `multiUser.nsh` template contains direct `System::Store` calls in its per-user install-mode macro; that is a candidate call site for a focused reproduction, not a proven cause.

The exact candidate passed the functional two-app gates, but **missed the installed memory target and reproduced the installer crash**. Neither QI-40 nor the release freeze can be marked complete. A new installed candidate must be built after the workbook change, and the intermittent NSIS fault still needs a causal diagnosis and a reliable-install gate.
