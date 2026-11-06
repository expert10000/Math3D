# QI-40 promoted Geometry, workbook retention, and full installer dumps · 2026-11-06

QI-40 remains open. These three checks follow the [Geometry, autosave and debugger report](quantum-qi40-geometry-autosave-debugger-2026-11-06.md).

## 1. Promoted Geometry in the current app

The QWZ promoted Geometry copy contains about 800 scene triangles, above the general 512-primitive Project source-editor limit. Current Math3D now accepts up to 5,000 primitives **only** for a standalone Geometry document with verified `quantum.promotion/v1` provenance and no procedural objects or relationships. That independent copy no longer counts as a second procedural Geometry target when the Project also has global constructions. The general bound and the single procedural Geometry rule remain in force for other documents.

Focused unit coverage passed (39 tests), and the [QI-21 UI regression](../../tests/e2e/quantum-qi21-native-promotion.spec.ts) passed save, reload, saved Project open, and navigation to the promoted Geometry document. The pinned pre-QEC installer still treats that expanded Project as a compatibility preview; this source change cannot repair the older installed binary. The promotion message now states that distinction.

## 2. Workbook-shaped retained strings

An [unminified 40-cycle snapshot](quantum-qi40-readable-retainers-before-40-2026-11-06.json) resolved a large workbook bundle string through editor callbacks. Removing all four global E2E hooks during a matched diagnostic did not remove the string accumulation; a React editor handler then became the shortest root path. This rules out those hooks as the sole cause. The session JSON was also held across callback chains.

The renderer now computes the autosave session hash without keeping its full JSON in a render binding, and serializes the `.math3d` bundle only on an explicit save or export. Save/export callbacks read the latest committed payload from a stable ref. A [UI export regression](../../tests/e2e/quantum-qi40-workbook-export.spec.ts) passed and parsed the emitted bundle. TypeScript and the production renderer build passed.

Two fresh 80-cycle **minified source** runs left only two large strings (neither a workbook JSON group) in the final heap snapshots. Their [first budget](quantum-qi40-workbook-lazy-minified-budget-2026-11-06.json) recorded **2,795,108 bytes** of closed-preview heap growth from cycles 20 to 80; the [repeat budget](quantum-qi40-workbook-lazy-minified-repeat-budget-2026-11-06.json) recorded **2,298,240 bytes**. Both improve substantially on the prior roughly 9.8–10.9 MB matched Windows autosave runs, but **both still exceed the provisional 2,097,152-byte limit**. The [first full trace](quantum-qi40-workbook-lazy-minified-80-2026-11-06.json) and [repeat full trace](quantum-qi40-workbook-lazy-minified-repeat-80-2026-11-06.json) preserve cycle samples and heap composition. These local source measurements do not certify the installed build. Residual array/object growth needs attribution before setting a release budget.

## 3. Full WER dump installer replay

The probe now selects [WER `DumpType=2` full user-mode dumps](https://learn.microsoft.com/en-us/windows/win32/wer/collecting-user-mode-dumps) in the `installer-full` workflow focus. It runs CDB against crashes and uploads only bounded metadata, hashes, module tokens and exception codes; raw process dumps stay on the temporary Windows runner. CDB [supports full user-mode dump analysis](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/analyzing-a-user-mode-dump-file).

The [first matrix](https://github.com/expert10000/Math3D/actions/runs/42227276451) and [second matrix](https://github.com/expert10000/Math3D/actions/runs/42227787158) each passed all 12 exact-hash installer probes. The [third matrix](https://github.com/expert10000/Math3D/actions/runs/42228944569) passed 10 and reproduced **two Theory Lab `0xC0000005` crashes**, once [Lab-only](quantum-qi40-installer-full-theory-lab-only-42228944569.json) and once [after Math3D installed](quantum-qi40-installer-full-both-apps-42228944569.json). Both full dumps were captured at about 59 MB; both Application Error events name `System.dll` offset `00001581`, and CDB again found `System!Store+0x4a0` and `System!Call+0x7f` tokens. Both analyses reported an unwind warning and **no parsed ordered stack**. The full dump confirms repeatability and narrows the shared fault site, but still does not establish the caller input or trigger. The 34/36 pass count is a probe result, not a reliability estimate for release.

The release freeze remains withheld. Remaining gates include the pinned pre-QEC promoted Geometry rollback gap, a reproducible source and installed heap budget, an installer fault diagnosis and reliable install, and the broader visual/scientific signoff already listed in QI-40.
