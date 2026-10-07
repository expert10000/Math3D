# Open Project placement — October 7, 2026

The shared desktop/web Project panel now offers **Left**, **Middle**, **Right**,
and **All** when an active Project is displayed. Left is the initial placement.
Middle centers the overview; All expands the panel across the workspace.
On screens at least 1440 CSS pixels wide, Left/Right reserve space beside the
module workspace or saved source editor. On narrow screens they use compact
panels within the viewport.

The persistent **Project** toggle replaces Quick projects while a Project is
active. It remains reachable above the panel, hides it without closing the
Project, and restores the last placement in the current session. The header's
Projects entry continues to open the Gallery. Switching modules keeps the
Project panel and its placement; the viewer document follows available active
Project documents. Moving between placements keeps the same mounted panel,
including unsaved Note edits and editor inputs.

## Verification

- Renderer and E2E TypeScript checks passed.
- Desktop renderer and web production builds passed.
- Kernel dependency boundaries passed.
- Both `project-placement.spec.ts` journeys passed: all four placements,
  selected Graph/Curve, unsaved Note text, eight module navigation entries,
  clickable toggle, hide/reopen, 390-pixel viewport, and the separate saved
  source editor with an unsaved formula input.
- Five targeted Gallery/Notes regressions passed after the toggle layer fix:
  save/export/cold reopen, repeated Projects activation during resize, narrow
  Gallery/quick panel, Catenoid Notes, and Notes beside the viewer.

The initial full Gallery/detail run passed nine existing journeys and found that
the new right-hand panel could intercept clicks on Project. Rendering the toggle
through a body portal fixed that issue. The placement regression now checks the
actual element receiving a pointer at the toggle center, including All.

Evidence is local under `test-results/project-placement-final` and
`test-results/project-placement-regression`, including screenshots of each
placement. The initial defaults and scientific Project serialization are
unchanged by a placement action.
