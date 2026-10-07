# Project workspace clarity — 2026-10-08

Verified using the compiled repository app from `C:\Math3D`, Windows Electron
and isolated temporary profiles at 1600 × 1000 CSS pixels.

## Changes checked

- The open Project panel shows a compact document tree above Workbooks and Notes.
  Catenoid is visible under Surface and the active owning document is highlighted.
- Selecting its Mesh and returning to Catenoid through the tree preserves the
  document ID/source hash. Closing and reopening Project restores the selector.
- The saved Surface toolbar says **catenoid · Project Surface** and its exit is
  labelled **Surfaces workspace**. The unrelated global Surface action toolbar is
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
