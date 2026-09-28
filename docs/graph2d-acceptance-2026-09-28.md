# Graph2D integration acceptance — 2026-09-28

Scope: desktop promotion/lifecycle integration after G2D25–32, and the first native mobile slice MOB-G01–04. This report does not declare the complete Graph2D desktop/mobile release gate finished.

## Delivered behavior

Desktop users can preview/cancel and create Curve, revolution and extrusion targets from explicit or parametric profiles. Targets use the ordinary core Curve/Surface document formats and render from captured expressions/domains/parameters. Named parameters are captured. Locate-back, source-generation comparison, stale/unavailable status, independent target edits, explicit regeneration/fork, repeated creation without overwrite, and mixed-workspace save/reopen are connected to the UI.

Sampling uses actual Web Workers, not only stale-publication checks. Jobs terminate on replacement, completion, error, timeout and unmount. Tests exercise both the worker transport and an instrumented Electron session. Budgets cover whole scenes and piecewise endpoint evaluations; path samplers observe deadlines. Display/selection-only changes do not change mathematical source identity.

Native mobile uses the existing project library/storage/backup/export services. Storage v2 accepts and migrates existing v1 scene libraries. Graph identity collisions import copies rather than replacing local work. Graph exports retain canonical source and never save sampled geometry. The native screen has graph-first layout, safe-area containment, horizontal touch-sized controls and overlay sheets. Pointer transitions, anchored pinch, cancel/background/unmount, one history step per gesture, tap picking, overlap cycling and empty-space clear use shared mathematical contracts and kernel history.

## Reproducible checks

```powershell
npm run test:graph2d:desktop:acceptance
npm run test:graph2d:mobile:unit
npm --prefix apps/mobile run typecheck
# From apps/mobile:
npx expo export --platform android --output-dir ../../output/graph2d-mobile-bundle
```

The desktop acceptance command runs focused graph/schema/replay tests, Node/renderer/E2E TypeScript checks, the production renderer build, and the Electron graph scenarios. The mobile unit command also runs existing scene/project regressions to check the new project discriminator and storage migration.

Verification results are reported with the delivered commit. Generated bundles/screenshots are local QA artifacts in `output`, not published installers or committed source truth.

Verified on this Windows checkout: 97 focused desktop/core/replay tests; 18 Electron graph scenarios (including actual geometry draw and worker lifecycle); 155 mobile model/service/regression tests; Node, renderer, E2E and mobile TypeScript checks; production renderer build; Android Metro/Hermes export (811 modules, approximately 5.8 MB). The renderer build still reports the existing large-chunk warning.

## Remaining gates and limitations

- No connected Android device or emulator was available (`adb devices` was empty). Real-device gesture/accessibility, short-screen layout, lifecycle/memory and performance validation is still required for MOB-G13. A successful Android bundle is not a device signoff.
- MOB-G01–04 are explicit-function open/view/probe/save. Advanced graph definitions remain intact but are not rendered/edited on this initial mobile screen. Full editors, analysis and advanced-kind UI follow in MOB-G05–12.
- Native line presentation is initially solid; source colors, widths, visibility and original style policy are preserved for round trip. Professional presentation/export work is separate.
- Surface continuity checks are bounded numerical screening. Undefined/suspected discontinuous profiles are rejected; caps currently require a closed nondegenerate convex profile. Preview errors remain inspectable rather than crashing the workspace.
- G2D33–35 desktop/mobile round-trip release gates and G2D36–40 export, axis scales, sliders/animation and regression extensions are not complete.
- Release packaging, publishing, and the public-license release gate are separate from this code verification. No installer/APK was published by this task.
