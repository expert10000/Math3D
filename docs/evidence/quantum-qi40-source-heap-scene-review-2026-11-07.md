# QI-40 source heap and saved-scene review · 2026-11-07

This is a source-checkout check. No application was installed or replaced. QI-40 and the release freeze remain **Partial**; an installed candidate needs its own exact-binary test.

## Remaining heap growth

After lazy workbook serialization, two minified 80-cycle traces grew 2,795,108 and 2,298,240 bytes between cycles 20 and 80, above the provisional 2,097,152-byte target. A new heap-path trace found large Geometry/Mesh arrays retained through `window.__MATH3D_E2E_GEOMETRY_PICK__` and its `commitGeometryPick` closure. That hook exists only in the E2E runtime. The source stress harness now clears the E2E-only Geometry/Mesh hooks before each measured sample, while leaving the regular scene and workbook paths active. The Windows source gate checks that the ablation is active and fails when the provisional target is missed.

Two controlled local 80-cycle runs with the test-only hooks cleared measured 1,675,160 and 1,882,048 bytes of late growth. After the Rice–Mele selection fix, the rebuilt Windows source checkout measured **1,282,972 bytes** over cycles 20–80. WebGL contexts were 1→1, textures 5→5, and all 80 closed-preview canvas counts matched baseline. The remaining large-array path includes the live Geometry double-click handler; this result does not prove zero retained heap or establish an installed-app budget.

## Saved Lab → `.qscene` → Math3D review

- The pinned v1/v2 release matrix verified all **39** bundle fingerprints and dataset hashes. QWZ baseline, QEC baseline, and scene importer checks passed, including signed QWZ samples, orbital coordinates and units, and changed-byte refusal.
- Three fresh Theory Lab producer runs (BBH finite density, Rice–Mele periodic bands, Landau level fan) were exported to `.qscene` and imported by Math3D. For each, run ID, exact result SHA-256, model inputs, sample count, coordinate and dataset units, and first/middle/last values matched. Altering one dataset byte was refused.
- Targeted Electron scene checks covered QWZ, QEC, hydrogenic fields, and Rice–Mele exact-sample selection, restart, and tamper refusal. The review found one mismatch in behavior: the Rice–Mele bulk–chain view requested seven samples concurrently, but the verified scalar-selection IPC invalidates earlier requests when a new one starts. The view now reads the seven samples sequentially and still verifies the run ID, result hash, scene fingerprint, and shared saved time. All eight Rice–Mele Electron tests pass after the change.

These are bundle integrity and representative exact-value checks, not an independent recalculation of every model's physics. The 39-fixture matrix does not imply that every archived Lab run is present in the current user profile.

## Windows source gate

[Run 42308882693](https://github.com/expert10000/Math3D/actions/runs/42308882693), pinned to Math3D `35b9dc40` with `focus=source`, passed the 80-cycle source job. Its uploaded artifact reports **1,924,848 bytes** of late growth against the 2,097,152-byte provisional target, `targetMet: true`, contexts 1→1, textures 5→5, and zero closed-preview canvas mismatches. All installer-related jobs were skipped. The source result is close to the threshold and is not evidence for an installed candidate.
