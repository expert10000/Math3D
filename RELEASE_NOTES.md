# Math3D 1.4.8

## Type
Memory-profile and release-readiness release.

## Added
- Added Playwright memory profiling for desktop Electron runs.
- Added scenario comparison for navigation, canvas, module sweep, mixed workflows, per-module clicks, one-session module chains, and full Surfaces gallery walks.
- Added process-tree RSS reporting with per-role peaks, renderer heap snapshots, Three.js diagnostics, and white-screen event detection.
- Added release-friendly summary tooling for recent memory profile reports.

## Improved
- Memory profiling now keeps one app session open for deep Surfaces gallery coverage across Explicit, Implicit, Parametric, Spline, and Constructed families.
- Surface-gallery profiling avoids the More/Less overflow and records real gallery card clicks rather than idle tab switches.
- Memory-profile runs now save useful partial data if the app window closes mid-run.
- Release metadata is bumped across the root package, workspaces, renderer package, and lockfiles.

## Fixed
- Fixed process-tree RSS sampling so unrelated Windows child processes are not included in Math3D memory totals.
- Fixed Surfaces gallery profiling to use the visible family buttons when duplicate hidden controls exist.

## Verified
- TypeScript check: `npx tsc --noEmit --pretty false`
- Full Surfaces gallery memory profile: 65 gallery card clicks in one app session with 5 seconds between clicks.
- Latest full gallery profile: peak RSS 10,989.4 MiB, final RSS 2,218.1 MiB, renderer peak 10,421.4 MiB, 0 white-screen events.

## Known limitations
- Peak renderer RSS is still high during early Surfaces gallery warmup; reducing the maximum peak is the next priority after release artifacts are created.
- Deep Three.js viewer lifetime cleanup remains the main follow-up area.
