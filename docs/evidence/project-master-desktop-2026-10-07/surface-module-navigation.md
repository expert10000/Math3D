# Saved Catenoid and global Surfaces navigation

Verified on 2026-10-07 in Windows Electron, using the compiled repository app
from `C:\Math3D` and an isolated temporary profile at 1600 × 1000 CSS pixels.

The saved-source viewport previously remained over family changes. At this
window width its fixed 96px offset also covered the wrapped family-navigation
row. Family changes now leave that viewport, and its position follows the actual
header height when the saved source is shown.

## Accepted checks

- Saved Catenoid → Implicit opens the visible normal module workspace.
- The already active Surfaces button and Back to module open the module gallery.
- Parametric → Catenoid opens the global preset through the existing module
  viewer. The global preset is a distinct source from the saved Graph revolution.
- Reopening the saved document preserves its ID, source hash, undo state and
  unapplied Advanced JSON text. Saved Project bytes remain unchanged.
- The Catenoid → Mesh → Surface → save → cold restart journey and the middle
  flip retaining its canvas/draft pass on the same production renderer build.

Renderer build and renderer/E2E typechecks passed. The 37 additional-document
and resume unit tests passed. Both existing Catenoid journey tests passed in
`output/project-surface-navigation-final-e2e.log`; the final navigation test passed
in `output/project-surface-navigation-complete-e2e.log`.

Earlier navigation-test runs exposed the fixed-offset obstruction and corrected
the test's mistaken preset path and card-only selector. The final navigation test
uses the module's Parametric preset button.

## Screenshots

- [Visible Implicit module after leaving the saved Catenoid](global-implicit-after-catenoid.png)
- [Global Catenoid in the existing Surfaces module](global-catenoid-module.png)
- [Saved Catenoid reopened with its unapplied draft](retained-catenoid-reopened-draft.png)

This fixes module access. PM04's same-document native Surface/Sampled binding
remains planned. The user's pre-existing window and installed application copies
were not validated or restarted during this acceptance run.
