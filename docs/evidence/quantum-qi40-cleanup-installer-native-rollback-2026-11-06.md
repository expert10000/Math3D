# QI-40 cleanup, installer diagnostics and native rollback · 2026-11-06

These three checks continue the [retainer and six-scene rollback report](quantum-qi40-retainers-dumps-six-scene-2026-11-06.md). The archived installer identities are unchanged. A fresh source build contains the renderer cleanup; the archived installed Math3D binary does not.

## 1. Retained WebGL objects

The V8 retainer trace identified two independent routes after a quantum preview closed: a document key listener retained `OrbitControls`, and a module-wide Three.js fallback texture retained each renderer's `dispose` listener. `SurfaceViewer` now removes its key handlers from the root captured when the canvas was attached. The renderer build applies a guarded Three 0.181.2 transform that removes each renderer's texture listeners during `WebGLRenderer.dispose()`. The transform fails the build if the pinned library layout changes.

The [80-cycle source report](quantum-qi40-source-cleanup-80-2026-11-06.json) alternated Rice–Mele bands and hydrogen 2p previews. After forced GC, `WebGL2RenderingContext` wrappers were **2 → 2** and `WebGLTexture` wrappers were **10 → 10**; all 80 closes returned to the baseline canvas count. The control-only ablation retained 12 extra contexts and 60 extra textures after 12 cycles. The texture-only 40-cycle test retained 40 extra contexts. Thus both cleanup paths were necessary for this source scenario.

The same 80-cycle source report still shows renderer heap growth of 10,998,548 bytes. Context and texture wrapper stability is narrower than a complete memory budget: string and other heap growth needs a separate threshold and installed-build check. The Windows workflow reruns the exact wrapper checks from current source.

## 2. Theory Lab installer fault

The installer probe now records process ID and UTC start/end time alongside Application Error 1000, matching Windows Error Reporting 1001 event identifiers, and per-app mini-dump metadata if the archived Theory Lab setup fails again. The Windows matrix covers six Lab-only and six Math3D-then-Lab fresh runners, with the same exact archived installer hashes. The prior intermittent `0xC0000005` in `System.dll` remains unexplained until a fault is captured with useful diagnostic evidence; a clean matrix alone cannot close this gate.

## 3. Installed native Project rollback

The rollback test now promotes the saved QWZ curvature scene into a native Geometry document before uninstalling the archived QEC candidate. After installing the pinned pre-QEC Math3D, it checks the Project and Geometry document IDs, `quantum.promote-geometry` relation, native document format, and opening that document in Geometry, in addition to reopening all six exact-fingerprint scene references. The Windows workflow will supply the installed pass/fail artifact.

QI-40 release freeze remains open. The source cleanup does not retroactively certify the archived installer, the broader heap budget is unset, and the Theory Lab installer access violation lacks a root cause.
