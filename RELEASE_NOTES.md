# Math3D 1.4.6-beta.6

## Type
Beta build for Linux renderer memory stability.

## Added
- Added a `MATH3D_NO_WEBGL=1` launch path that opens packaged/dev builds with 3D viewers paused.
- Added no-WebGL fallback panels for renderer-heavy viewers to isolate CPU-side leaks from GPU/WebGL issues.

## Improved
- Improved surface viewer scene lifecycle stability by keeping long-lived Three.js handlers independent from changing callback identities.
- Reduced parent sample-state churn during surface viewer cleanup/rebuild paths.
- Disabled hidden surface performance telemetry unless the Performance tab is visible.
- Reduced idle render frequency in VM-safe graphics mode to avoid repeatedly poking stalled/software GPU paths.

## Fixed
- Fixed a renderer-side churn path that could repeatedly rebuild surface viewer state and grow memory during startup/interaction.
- Kept Linux VM-safe graphics behavior while adding a stronger diagnostic mode for white-screen/freezing reports.
- Avoided default startup React re-renders from renderer performance snapshots.

## Known limitations
- `MATH3D_NO_WEBGL=1` is diagnostic mode; 3D viewer canvases are intentionally paused.
- Some geometry/dependency inspector features remain experimental.
