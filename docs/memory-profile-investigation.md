# Math3D Memory Profile Investigation

## Current Signal

The strongest current baseline is the full Surfaces gallery run:

- Report: `output/memory-profiles/math3d-memory-profile-1.4.7-surface-gallery-chain-2026-07-01T15-13-24-715Z.json`
- Coverage: 65 gallery card clicks in one app session, 5 seconds between clicks.
- Families: Explicit 12, Implicit 13, Parametric 14, Spline 4, Constructed 22.
- Peak RSS: 10,989.4 MiB; final RSS: 2,218.1 MiB.
- Renderer peak: 10,421.4 MiB; white-screen events: 0.
- Peak appears very early, closest to `explicit card 2 (surface-preset-card-graph_rotatedSaddle)`.

Treat early Surfaces gallery warmup and renderer-side native/WebGL allocation as the first target when reducing the maximum peak.

## 1. Compare Scenarios

Use the comparison runner to generate reports for `navigation`, `canvas`, `module-sweep`, and `mixed` with a 3-second delay between actions:

```powershell
npm run test:app:e2e:memory-profile:compare
```

For slower settling between actions:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-memory-profile-comparison.ps1 -Actions 30 -ActionDelayMs 5000
```

Read the recent-report table with:

```powershell
npm run test:app:e2e:memory-profile:summary
```

## 2. Locate Module Jumps

Run only the module sweep when narrowing a section-specific jump:

```powershell
$env:MATH3D_MEMORY_PROFILE_SCENARIO = "module-sweep"
$env:MATH3D_MEMORY_PROFILE_ACTION_DELAY_MS = "3000"
npm run test:app:e2e:memory-profile
```

The report's `scenarioResult.checkpoints` array records RSS, renderer heap, and Three.js diagnostics after each major section.

## 2b. Repeat Clicks Inside A Module

After a module sweep identifies a suspicious transition, run repeated clicks inside one or more modules. This checks whether the spike is a one-time module-entry warmup or recurring interaction pressure.

```powershell
npm run test:app:e2e:memory-profile:module-clicks
```

The default run covers `Surfaces`, `Mesh`, `Volume`, and `Curves` with 20 clicks and 5 seconds between clicks. To target one module:

```powershell
$env:MATH3D_MEMORY_PROFILE_SCENARIO = "module-repeat"
$env:MATH3D_MEMORY_PROFILE_MODULE = "Mesh"
$env:MATH3D_MEMORY_PROFILE_ACTIONS = "20"
$env:MATH3D_MEMORY_PROFILE_ACTION_DELAY_MS = "5000"
npm run test:app:e2e:memory-profile
```

The report's `scenarioResult.checkpoints` array records memory after each click.

To check whether memory accumulates across modules in one app session, run the chained version:

```powershell
npm run test:app:e2e:memory-profile:module-chain
```

This opens the app once, then runs `Surfaces -> Mesh -> Volume -> Curves`, with 20 clicks and 5 seconds between clicks in each module.

## 2c. Walk Surface Galleries In One App Session

When Surfaces needs deeper coverage than module tab clicks, run the gallery walker:

```powershell
npm run test:app:e2e:memory-profile:surface-gallery
```

This opens one app session, switches Surfaces to gallery mode, walks Explicit, Implicit, Parametric, Spline, and Constructed, and clicks every visible gallery card with 5 seconds between clicks. It does not open the More/Less surface-family overflow. If the window closes mid-run, the scenario reports the last completed checkpoint and marks the run as aborted.

## 3. Inspect Three.js Diagnostics

Check these fields in each JSON report:

- `threeDiagnosticsAfterScenario`
- `threeDiagnosticsAfterIdle`
- `scenarioResult.checkpoints[].threeDiagnostics` for module sweeps

Look for viewer counts, geometry/material/texture counts, or event history that grows after section changes and does not settle after idle.

## 4. Cleanup Targets To Inspect First

Start with viewer lifecycle and unmount cleanup in:

- `renderer/src/components/SurfaceViewer.tsx`
- `renderer/src/components/ParamSurfaceViewer.tsx`
- `renderer/src/components/VolumeViewer.tsx`
- `renderer/src/screens/TopologyScreen.tsx`
- `renderer/src/components/GeometryViewer.tsx`
- `renderer/src/components/GaussMapPanel.tsx`
- `renderer/src/components/RiemannSpherePlot.tsx`

For each retained viewer path, verify:

- `WebGLRenderer.dispose()` runs on unmount.
- Controls and transform controls are disposed.
- Geometries, materials, textures, render targets, and overlays are disposed.
- Animation frames and event listeners are cancelled.
- Large mesh or surface arrays are not retained in React state, refs, caches, or diagnostics after the viewer unmounts.
