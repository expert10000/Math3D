# Saved document workbench delivery — 2026-10-08

Implementation commit: `3ac5ab75b1297c765ba1306e1ba7260e317063bd` on
`codex/gallery-performance-platform-baseline`, based on remote main `b4cffbf`.
Checkout: `C:\Users\janko\OneDrive\Dokumenty\Math3D`.

## Implemented and qualified scope

- Gallery Open, saved-copy Open and startup Resume use the same validated opening
  transaction. Project ownership and selected document activate together. Failed
  validation, resource import, storage writes and superseded preparation preserve
  the prior workspace. Input during preparation also protects unapplied source
  and Note text, which is absent from scientific capture. An untouched startup
  does not back up the automatically hydrated default workspace.
- Resume can be disabled. Startup then offers **Resume Project** without labeling
  the normal module as the saved Project. Stale selections choose an available,
  nonarchived document with an explicit explanation. Placement, camera, display
  and document selection remain outside scientific source hashes.
- Captured Graph revolutions, including Catenoid, and uncapped Graph extrusions
  have a typed native `ParamSurfaceViewer` binding. It uses saved expressions,
  variables, axis/orientation, profile endpoints and angular extent. Full turns
  wrap the angular seam. Source controls use existing adapter commands and
  undo/redo; no preset substitution or literal-source conversion occurs.
- **Surface / Sampled** changes presentation of the same owning Surface. The
  shared host provides Project, Source/Object and Tools in the left dock and
  Project, Inspector, Display and Results in the right dock. Middle/All Project
  placement covers the existing viewport while retaining its session. The old
  fixed `AdditionalProjectEditor` layer is retired.
- Saved Mesh opens its distinct verified buffers in existing `SurfaceViewer` Mesh
  mode. Saved K/H colors, legend, picking, paths and results use its generation.
  H selection survives reload. Numerical Mesh evidence remains qualified as such.
  Related links distinguish captured and current live generations. Project
  Back/Forward preserves document ownership and compatible presentation state.
- Top **Surfaces** and its family controls always open the normal module. Repeated
  clicks and returning from Mesh preserve this behavior. Saved documents reopen
  explicitly through Project's selector/tree or their related links.
- Build diagnostics identify commit, dirty source state, build time, renderer
  fingerprint, executable and profile. Identity is captured at process launch,
  so rebuilding the checkout cannot relabel an older running process.

Capped extrusions and other unqualified source families retain their explicitly
labeled sampled presentations. Specialized Graph, Volume, Topology, Complex and
independent module editors keep their existing qualified paths; this delivery
is not universal native-viewer parity. Surface parameter probes are cleared
when changing presentation and are not mapped to saved Mesh vertex IDs.
Comparison/overlay work, physical-device acceptance and installed compute-engine
qualification remain separate gates.

## Verification

| Gate | Result |
| --- | --- |
| `test:projects:contracts` | 196 renderer/Project + 96 mobile model tests; portable fixture TypeScript passed |
| Focused binding, history, resume, publication and adjacency tests | 33 passed across seven files |
| `typecheck:noemit` | Main, renderer and E2E passed |
| `build:core`, `build:web` | Passed; committed source rebuilt without source changes |
| Desktop flow/layout/navigation | Eight passed |
| Desktop Project integration | 19 passed: all eight mappings, resources, transfers, rollback, history and restart |
| Final native Surface/Mesh/resume/draft gate | Three passed, including a controlled digest pause and unapplied input during opening |
| `test:projects:web` | 20 passed across English/UTC and Polish/Auckland contexts |
| `check:kernel:boundaries` | Passed: 1138 modules, 2784 dependencies |
| Profile journey | Passed; opening and three exit/reopen cycles captured separately |

An earlier contract run timed out under concurrent build/test load. The unchanged
contract command passed in isolation without increasing test timeouts.
Logs remain local under `output/project-workbench-*.log`; test artifacts are under
`test-results/project-workbench-*`.

At 1600×1000, the Project dock, 920×807 viewport and independently scrolling
Inspector fit below the header. At 390×844 and Windows 175% scaling, the viewport
is approximately 310px tall and the Inspector has a 77px scrolling area. The
bottom-edge assertion permits only 0.001px of arithmetic rounding.

Screenshots: [native Surface after cold restart](native-surface.png),
[saved Mesh with H](native-mesh-H.png), [phone layout](native-phone.png).
Exact rectangles: [native layout](native-layout.json).

## Remaining navigation cost

| Unprofiled action | Initial dock repair | Integrated workbench |
| --- | --- | --- |
| Open starter | 3650ms | 3658ms |
| Exit cycle 1 / 2 / 3 | 1578 / 1682 / 1701ms | 1429 / 868 / 899ms |
| Reopen cycle 1 / 2 / 3 | 599 / 733 / 885ms | 545 / 717 / 805ms |

One run per configuration on the same computer; these are action-to-visible-canvas
measurements, not statistical benchmarks or GPU frame-rate measurements. The
new binding/layout also changes the rendering path, so wall-time differences
cannot be attributed solely to either cache.

The final mapped CPU profile spans 3.947 seconds for opening and 5.160 seconds
for the three navigation cycles. Artifact publication consumes 0.756 seconds
inclusive across those cycles, compared with 2.713 seconds before optimization.
Checksum work across all navigation callers is 1.084 seconds, previously 3.057
seconds. Inclusive times overlap. No adjacency-construction frames were sampled
in the final profiles; adjacency is now lazy and cached by immutable buffers.

Opening still consumes about 3.6 seconds. Its 2.760 seconds of inclusive checksum
work includes starter construction, resources and compatibility verification.
Navigation still includes changed artifact publication and native viewer
construction. Validation remains at changed-byte, import, command and save
boundaries. The implementation reuses unchanged owned publications and validates
mutable-byte changes before reuse.

[Mapped profiles and timings](navigation-workbench-profile.json) record these
measurements; full raw profiles and all mapped frames remain local under
`output/project-navigation-profile-2026-10-08/workbench` and
`output/project-workbench-all-frames.json`.

## Desktop launch evidence

The chosen **Math3D Projects (current build).lnk** runs the checked-out compiled
app through `C:\Users\janko\.math3d\Launchers\Math3DProjectsLauncher.exe` and
its `projects-desktop-profile`. Verification uses the launcher's existing
`--verify` option for one launch; the shortcut's original arguments are restored.
That existing launcher sets `MATH3D_E2E=1`, so this proof qualifies the visible
Project rendering and ownership, not installed worker engines.

The maintained repository launcher is `scripts/launch-current-build.ps1`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/launch-current-build.ps1 -Build
```

It uses this checkout and the same profile, clears development-server/Electron
Node flags, checks required build files and avoids duplicate profile processes.
The existing **Math3D Dev (this repo).lnk** runs `npm run dev`. **Math3D.lnk**
points to the separately installed 1.5.0 executable in
`C:\Users\janko\AppData\Local\Programs\Math3D`. Installed executables and
profiles were preserved; rebuilding source does not update that installed copy.

Actual launch verification and screenshots are recorded in
[launch identity](launch-identity.json), [native Catenoid](launch-catenoid.png) and
[saved Mesh H](launch-mesh-H.png). The visible window runs source `3ac5ab75`,
clean at build time `2026-10-08T10:51:35.666Z`, with renderer fingerprint
`7825865854cbbf63a8106f9c99fd1dc11fdc223161c282d19a05f605443c00c8`.
Its actual viewport is 1087×688 at device-pixel ratio 1.75; the final left Project
dock leaves a 407×495 Surface viewport and a scrolling right Inspector.

The existing saved copy is Project
`math3d:project:85e8d6ce0d043b30b135c339d2ff4e00`. Its native Surface
`math3d:surface:55be04e00411d66d8cd44fe178eaa62a`, revision 1, retained hash
`sha256:cee167c7412ecb50934ce34b053912fa0939ef8de52eba3ca85ed78fccf33bb7`
through Save Project and renderer reload. Its saved Mesh is separately identified
in the record, with the H legend bound to the exact Mesh generation. The native
Workbook autosave recovery prompt was accepted on launch and reload. After
recovery, the same Project/Surface resumed and was inspected in the visible
window. Automated isolated-profile cold Electron restarts are a separate gate.

This is local committed, built and launched
delivery. It has not been pushed, merged or packaged as an installer release.

## Geometry close/freeze follow-up

The reported Geometry Notes and Pins close/freeze remains unconfirmed as a root
cause or fix. A focused regression opens that starter, closes and reopens the
Project panel in all four placements, returns through the Gallery, checks retained
Project bytes and document selection, navigates Surfaces/Geometry, and closes the
Electron window. It passed on the current compiled implementation; E2E TypeScript
also passed. The running desktop's Gallery Close control was separately clicked
and the panel disappeared. Its process remained responsive. These observations
do not disprove the reported intermittent freeze. The exact triggering action
and whether the failed control is the Project Close button or the native window
close button are still needed for reproduction.

Regression: `tests/e2e/project-panel-close.spec.ts`; local artifacts:
`test-results/project-panel-close`. No runtime fix is claimed by this follow-up.

## Saved Surface Inspector follow-up

The Project remains docked on the left. The center now exposes the native
ParamSurfaceViewer's view gizmo, fit/orbit, slice-plane and geodesic tools.
The right Inspector uses the same lighting/material, probe-result and analysis
overlay components as the normal Surfaces module, bound to the saved Surface's
captured evaluator. Its parameter picker is the module's ParamDomainPreview.
Summary, Selection, Geometry, Analysis, Diagnostics, Provenance and History
show the owning document rather than the normal module's independent preset.

Resolution, lighting, material, wireframe and overlay settings are local document
presentation preferences. They survive navigation and cold restart without
changing the scientific source or command history. Probe selections and local
curvature are cleared when the source changes. Profile edits still use the
existing owning adapter and Undo/Redo commands. Sampled and Mesh presentations
retain their separate workflows. This adds shared native controls for captured
Graph revolutions and open extrusions; it does not claim every global Surfaces
computation/export workflow is available inside a saved document Inspector.

Validation: main/renderer/E2E TypeScript passed, renderer production build passed,
16 binding/formula tests passed, and dependency boundaries passed. Eight distinct
Electron checks passed: the three native-workbench tests, Geometry Close,
desktop/phone Catenoid layout, the new saved-Surface Inspector flow, and two
normal Surfaces flows (viewport/Gauss controls and canonical local probe/Euler).
The new Inspector flow checks actual rendered material changes, unchanged saved
Project bytes, exact source ownership, K approximately -1 and H approximately 0
at the unit Catenoid neck, K approximately -0.25 after a radius-two profile edit,
stale-probe clearing, Undo, Close and persisted display preferences after cold
restart. The existing camera test now targets the main viewer canvas explicitly,
since the enabled native orientation gizmo has its own canvas.

Regression: `tests/e2e/project-surface-inspector.spec.ts`. Screenshots:
[Project/Surface/Inspector layout](surface-inspector-layout.png) and
[local Surface analysis](surface-inspector-analysis.png).
