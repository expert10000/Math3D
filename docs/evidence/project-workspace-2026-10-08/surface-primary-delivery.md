# Full Surfaces module as the primary Project view

Date: 2026-10-08. Checkout: `C:\Math3D`, based on main `0e6ead75`.

## Delivered behavior

- Selecting the saved Catenoid Surface opens the existing resizable Surfaces
  workspace: native left controls, middle `ParamSurfaceViewer`, and right module
  Inspector. The Project tree shares the left dock. **Surface controls** exposes
  the module controls; **Project** brings the document tree back.
- **Surface** and **Custom** explicitly select different workspaces. Custom keeps
  the separate document host and its Surface/Sampled rendering choice. Repeated
  selection is stable. Both retain the owning saved source, history and draft.
- Document activation and cold resume default to Surface for qualified captured
  Graph revolutions and open extrusions. Related Graph/Mesh links select their
  own documents. **Exit project view** exits the saved document view.
- The gallery identifies the saved Surface and shows its construction family
  without highlighting an unrelated global preset. **Edit saved Surface** and
  **Edit profile** open the owning Object controls.
- The Surface Inspector reports its actual display tessellation. An unrelated
  Mesh's document identity, counts and diagnostics are absent. Saved Mesh
  studies remain available through their own document and linked study controls.
- Middle/All Project placement retains the existing viewer session beneath the
  Project content. Normal modules retain their existing workspace structure.

## Verification

Five distinct Electron flows passed across the focused runs:

1. Surface/Custom, unapplied draft and camera, related Graph/Mesh navigation,
   sampled choice, saved Mesh fields and cold restart.
2. Disabled resume and explicit recovery from a stale document selection.
3. Draft input during resource preparation prevents replacing the active workspace.
4. Full native layout, exactly one viewer, explicit/repeated view selection,
   honest gallery selection, owned display counts, Graph/Mesh return, Project
   save, cold restart, remembered Custom rendering and exit to normal Surfaces.
5. Native curvature and local probe/Euler analysis, profile editing and Undo,
   Project/Inspector dock switching without reading the saved Project again.

One earlier run failed because its test still selected the retired custom-shell
Source/Object tab. The test now selects the native Object panel; its final rerun
passed. The final two-flow rerun passed in 2.6 minutes.

Fifteen dock switches measured 802–1098 ms, passing the existing 1500 ms gate.
This is a focused desktop measurement, not a general performance qualification.
The renderer build and renderer/E2E type checks passed. The desktop shortcut
`MATH3D Electron.lnk` targets `C:\Math3D\start-electron.bat`, which runs the dev app.
Tests used temporary profiles; the user's running window was not restarted.

## Screenshots

Primary module view:

![Native Surfaces workspace](surface-primary-full-module.png)

Explicit Custom view with Sampled rendering:

![Separate Custom workspace](surface-explicit-custom.png)

## Correction: Project hidden inside collapsed docks

The initial checks used visible docks. The user's later screenshot exposed a
missing case: the explorer was embedded inside a collapsed left dock. Some saved
Project Open paths also closed the explorer after restoring the workspace.

Explicit Project Open now selects left placement and shows the document tree.
Saved Surface activation restores both docks, exits Focus/preview mode, and
selects Inspector while retaining dock widths. The floating Project button
reveals an explorer hidden in its dock. Explicit placement changes also reveal
the selected dock.

The complete Surface/Custom save/restart flow passed again. A new regression
began with both docks collapsed and Focus enabled, recovered through the floating
button after hiding the left dock and enabling Focus, then reopened the active
starter and saved Project after choosing right placement. All checks passed in
36.6 seconds. An initial test selector matched both global Left and Project Left;
it now identifies the global dock control directly.

Renderer build and renderer/E2E type checks passed. The native analysis and dock
switching flow passed again after the correction; its fifteen switches measured
869–1054 ms, within the existing 1500 ms limit.

![Project tree on the left after opening from hidden docks](project-left-after-hidden-docks.png)

## Correction: return to the owning Catenoid

The previous **Back to normal Surfaces** action left the saved document and
restored the independent global workspace. That could show an earlier Helicoid,
as in the user's screenshot.

Custom now offers **Back to catenoid**, which selects the same saved Surface in
the full native Surfaces workspace. Its saved Mesh offers the same action and
resolves the owning Surface through the recorded Mesh source relation. The
Project document title supplies the label. Archived sources cannot be opened.
**Exit project view** explicitly leaves the saved document for the independent
global workspace. Both workspaces retain their existing renderers.

The expanded Electron flow passed in 3.6 minutes. It starts with global Helicoid,
opens the saved Catenoid, returns from its Mesh using the recorded Surface link,
saves and cold-restarts, then returns from Custom to the same native Surface.
Document ID and source hash are checked throughout; explicit exit is checked
separately. No page errors were reported. Renderer build and renderer/E2E type
checks passed.

Earlier attempts exceeded the original three-minute overall test deadline, with
no failed assertions. The trace showed successful Mesh return and, after grouping
repeated layout checks into one renderer query, successful save/cold restore.
The expanded two-launch flow now has a four-minute overall limit; individual
action timeouts are unchanged. This functional check does not establish a new
interactive performance result.
