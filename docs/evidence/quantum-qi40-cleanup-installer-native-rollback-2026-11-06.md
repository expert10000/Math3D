# QI-40 cleanup, installer diagnostics and native rollback · 2026-11-06

These three checks continue the [retainer and six-scene rollback report](quantum-qi40-retainers-dumps-six-scene-2026-11-06.md). The archived installer identities are unchanged. A fresh source build contains the renderer cleanup; the archived installed Math3D binary does not.

## 1. Retained WebGL objects

The V8 retainer trace identified two independent routes after a quantum preview closed: a document key listener retained `OrbitControls`, and a module-wide Three.js fallback texture retained each renderer's `dispose` listener. `SurfaceViewer` now removes its key handlers from the root captured when the canvas was attached. The renderer build applies a guarded Three 0.181.2 transform that removes each renderer's texture listeners during `WebGLRenderer.dispose()`. The transform fails the build if the pinned library layout changes.

The [80-cycle source report](quantum-qi40-source-cleanup-80-2026-11-06.json) alternated Rice–Mele bands and hydrogen 2p previews. After forced GC, `WebGL2RenderingContext` wrappers were **2 → 2** and `WebGLTexture` wrappers were **10 → 10**; all 80 closes returned to the baseline canvas count. The control-only ablation retained 12 extra contexts and 60 extra textures after 12 cycles. The texture-only 40-cycle test retained 40 extra contexts. Thus both cleanup paths were necessary for this source scenario.

The same 80-cycle source report still shows renderer heap growth of 10,998,548 bytes. Context and texture wrapper stability is narrower than a complete memory budget: string and other heap growth needs a separate threshold and installed-build check. The Windows workflow reruns the exact wrapper checks from current source.

## 2. Theory Lab installer fault

The [first Windows matrix](https://github.com/expert10000/Math3D/actions/runs/42213434013) found two more installer faults with the exact archived hashes. A [Math3D-only install](quantum-qi40-math3d-installer-crash-42213434013.json) and a [Math3D-then-Lab install](quantum-qi40-theorylab-installer-crash-42213434013.json) each exited `0xC0000005`; Application Error 1000 named `System.dll` offset `00001581` in both cases. The Theory Lab probe captured a 2,861,787-byte WER mini dump, recorded by name and SHA-256 in its evidence JSON. Raw process memory was not uploaded. This demonstrates that the fault affects both setup executables and is still intermittent. The other eleven installer matrix jobs passed.

The probe now records process ID and UTC start/end time alongside Application Error 1000, matching Windows Error Reporting 1001 event identifiers when present, and per-app mini-dump metadata. Crash-dump capture is now configured for whichever archived installers the probe will launch, including Math3D-only and both-app sequences. A repeat matrix will check that diagnostic path. The shared fault location is evidence of a common failure mode, not a root-cause explanation.

## 3. Installed native Project rollback

The rollback test now promotes the saved QWZ curvature scene into a native Geometry document before uninstalling the archived QEC candidate. After installing the pinned pre-QEC Math3D, it checks the Project and Geometry document IDs, `quantum.promote-geometry` relation, native document format, and opening that document in Geometry, in addition to reopening all six exact-fingerprint scene references. The first Windows attempt reached candidate Project seeding but failed a new test lookup that assumed the relation target ID exactly matched the saved entry. The lookup now identifies the new Geometry entry against the pre-promotion Project and passes that ID into the rollback phase. The installed result remains pending a repeat run.

The first Windows source job stopped before building the renderer because `npm ci` at the repository root does not install its separate `renderer` package; the workflow now installs both lockfiles. QI-40 release freeze remains open. The source cleanup does not retroactively certify the archived installer, the broader heap budget is unset, and the installer access violation lacks a root cause.
