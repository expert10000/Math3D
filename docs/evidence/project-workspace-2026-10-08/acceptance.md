# Project workspace clarity — 2026-10-08

Verified using the compiled repository app from `C:\Math3D`, Windows Electron
and isolated temporary profiles at 1600 × 1000 CSS pixels.

## Changes checked

- The open Project panel shows a compact document tree above Workbooks and Notes.
  Catenoid is visible under Surface and the active owning document is highlighted.
- Selecting its Mesh and returning to Catenoid through the tree preserves the
  document ID/source hash. Closing and reopening Project restores the selector.
- The saved Surface toolbar says **catenoid · Project Surface** and its exit is
  labelled **Back to normal Surfaces**. The unrelated global Surface action toolbar is
  hidden while this saved document is active.
- Desktop Project controls, the contextual Project toggle and saved Surface/Mesh
  controls use the global navigation font size/padding. Gallery controls remain
  larger. The test compares computed font sizes and rendered button heights.
- The existing Surface → Mesh → Surface → save → cold restart and middle-flip
  journeys still pass. Global Surfaces access retains the saved-source draft.

## Responsiveness

The CPU profile found repeated SHA-256/replay verification from the linked-Mesh
list during App renders. The list and Mesh source links now use already qualified
live sessions, with memoized results. Selecting an existing Project member changes
active-document order without rebuilding/validating every document. Opening a
Project constructs each saved-source session once; unchanged sampled views are
cached with source/dependency/resource invalidation.

Import, command commits and save retain validation. Historical Mesh/source
qualification is unchanged and tested with both resolving paths.

| Measurement | Before | After |
| --- | --- | --- |
| Open Catenoid to visible canvas | 7.917 s | 7.312 s |
| Leave/reopen, cycle 1 | 5.153 s | 4.612 s |
| Leave/reopen, cycle 2 | 5.413 s | 5.327 s |
| Leave/reopen, cycle 3 | 6.515 s | 5.834 s |

These are one baseline run and one final run on the same computer, measured from
Playwright actions to a visible canvas. They include global-workspace exit and
viewer creation; they are not frame-rate measurements or a statistically robust
benchmark. The latency remains too high. Further profiling of the remaining
validation/render creation path is required; this work does not claim that all
slowness is fixed. Raw timings: [before](navigation-before.json),
[after](navigation-after.json). The CPU profile remains local in
`output/project-clarity-before-links-profile.json`.

## Verification

- Renderer production build and renderer/E2E typechecks passed.
- 41 focused unit tests passed, including cache invalidation and historical links.
- Three final flow/navigation Electron tests passed in
  `output/project-clarity-final-flow.log`.
- Final layout/tree/gallery/button/timing Electron test passed in
  `output/project-clarity-final-layout.log`.

Screenshots: [saved Catenoid](catenoid-surface.png), [retained Mesh](catenoid-mesh.png).
The existing Mesh workbench still has its own tools and layout; fully shared
Project/Source/Tools panels and same-document native Surface/Sampled bindings
remain roadmap work. The user's pre-existing desktop window and installed
application copies were not restarted or validated during this run.

## Exit navigation follow-up

The top **Surfaces** button now always opens the normal module gallery, including
repeated clicks and returning from a saved Mesh. Previously a second click could
select the first retained Surface again because the button also served as an
implicit Project-document shortcut. Reopening the saved Catenoid is explicit
through Project's tree or selector. The toolbar exit and top navigation use the
same action; Project sessions and unapplied source text are retained.

Regression coverage checks repeated Surfaces clicks, Mesh → normal Surfaces,
the explicit exit label, reopening the original ID/hash/draft and unchanged
saved Project bytes. The compact-control test checks the updated label and
document tree. Results are recorded in `output/project-exit-final-e2e.log`;
build and renderer typecheck logs are `output/project-exit-build.log` and
`output/project-exit-typecheck.log`. This correction does not resolve the
previously measured opening/switching latency.

## Local layout repair and navigation profile — 2026-10-08

Verified the production build in `C:\Users\janko\OneDrive\Dokumenty\Math3D`
against base commit `b4cffbf` plus the local layout changes. Electron tests used
isolated temporary profiles, 175% Windows display scaling and the existing
software GPU/jitless E2E defaults.

The docked viewer initially began at 213px. The saved-document header now omits
the unused global controls and their trailing spacing, while retaining module
family navigation. The viewer begins at 190px, measures 860 × 810px and stays
beside the independently scrolling Inspector. At 390 × 844, the narrower
container reserves three quarters of the remaining document area for the canvas:
the viewer is 325px tall and the Inspector retains a 108px scrolling area.
The desktop position/size thresholds remain unchanged. The viewport-bottom
assertion permits only 0.001px of arithmetic rounding because the fractional
display scale reports `844.00006` for the 844px bottom edge.

Screenshots: [docked viewer](catenoid-viewer-docked-local.png) and
[phone viewer](catenoid-viewer-phone-local.png). Raw rectangles:
[layout measurements](catenoid-viewer-layout-local.json).

Renderer production build, full main/renderer/E2E typecheck, and the final E2E
typecheck passed. Seven flow/navigation/clarity tests passed on the final compiled
app; the layout test passed on rerun after the rounding correction. This includes
Catenoid save/cold restart, Mesh/source return, middle flip, docking, unapplied
drafts, repeated normal Surfaces navigation and Inspector scrolling. The local
layout rerun log is `output/project-layout-final-e2e.log`.

The profiling flag `MATH3D_PROFILE_PROJECT=1` now captures opening separately
from three leave/reopen cycles and records each exit/reopen wall time. Source
maps were enabled for those production builds. The later run without profiling
measured 3.650s to open the starter, 1.578–1.701s to leave, and 0.599–0.885s to
reopen. These measurements diagnose the remaining delay; the layout repair does
not claim a performance improvement.

The mapped CPU profile identifies two next optimization targets:

- The automatic live Surface tessellation handoff effect in `App.tsx` republishes
  mesh and correspondence artifacts during navigation. `artifactRegistry.publish`
  accounted for 2.713s across the three cycles' 8.540s sampling interval;
  `sha256Checksum` accounted for 3.057s across all callers. These inclusive
  timings overlap. Reuse a current immutable publication by source generation,
  tessellation settings and geometry identity; retain checksum verification at
  changed-byte/import/command/save boundaries.
- Geodesic adjacency construction accounted for 0.940s across those cycles.
  Build it when its tools need it, or retain its qualified cache across navigation.

Opening the built-in starter also spends substantial time in resource capture,
verification and compatibility inspection: `sha256Checksum` accounted for 2.914s
of its 4.430s sampling interval. Existing saved-project opening should be profiled
separately from first starter creation before changing those validation paths.

The [mapped profile summary](navigation-profile-summary.json) records call sites,
timings, environment and limitations. Raw profiles remain local under
`output/project-navigation-profile-2026-10-08`. Two instrumented runs with three
cycles each are diagnostic samples, not a statistically robust benchmark or GPU
frame-rate measurement. No performance optimization was applied in this repair.

## Integrated workbench delivery — later October 8 qualification

The initial layout/profile above records the earlier baseline. The subsequent
committed implementation `3ac5ab75` adds native captured-source Surface binding,
the shared document host, exact saved Mesh display, unified Open/Resume and
navigation publication/adjacency reuse. The [final delivery report](workbench-delivery.md)
supersedes that stage's dimensions and remaining optimization targets, with final
test results, mapped timings and actual current-build desktop launch evidence.
First opening still takes about 3.6 seconds. Physical devices, installed engines,
remote integration and installer delivery remain separate gates.
