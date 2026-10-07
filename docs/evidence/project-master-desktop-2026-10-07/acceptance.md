# Catenoid first-flow acceptance — 2026-10-07

Implementation source: `ba423d27b7b557f4a7c862d24f356673a1e0a080`.
Roadmap extension: `97bc15fb`.

## Accepted journey

Projects → Catenoid Evidence → retained Surface → Open Mesh → Open source
Surface → Save project → close Electron → launch Electron with the same isolated
profile → the same Surface/document generation. A second save/restart with Mesh
selected also resumes that Mesh. Surfaces and Mesh navigation highlights agree
with the selected document.

The Surface uses its saved `graph2d.revolution` source through the existing
GeometryViewer → SurfaceViewer path. Assertions compare document ID and source
hash, and check the captured Catenoid's three-dimensional bounds rather than
accepting any visible canvas. The sampled Mesh is linked to that Surface, and its
source-return button remains reachable with Project docked left.

The simple middle flip uses Project details → Return to document. The active
mathematical document remains selected; the same canvas element and an unapplied
source draft survive. This does not implement the later Workbook middle flip.

## Verification

- `npm run build:core`: passed; the final renderer rebuild also passed.
- Renderer and E2E TypeScript checks: passed.
- Resume and additional-representation unit suites: 37 tests passed.
- Catenoid-flow and Project-placement Electron suites: six tests passed,
  including Note drafts, source drafts, module navigation and narrow docking.
- Final committed-build Catenoid journey: passed with Mesh viewport size,
  exact identity/hash, Surface/Mesh module highlights and both cold restarts.
- `git diff --check`: passed.

The final journey's Project ID, Surface/Mesh IDs, revision/hash, geometry bounds,
opening path and viewport are recorded in [catenoid-evidence.json](catenoid-evidence.json).
Viewport: 1600 × 1000 CSS pixels; test device pixel ratio approximately 1.

These are Windows Electron observations automated through Playwright in isolated
temporary profiles, plus visual inspection of the captured Surface, Mesh and cold
resume images. The user's pre-existing desktop window was not controlled or
validated by these tests.

Executable: `C:\Math3D\node_modules\electron\dist\electron.exe`, launched with
`C:\Math3D` as the application/workspace. Build mode: compiled Electron main and
production Vite renderer loaded from `renderer/dist/index.html`.
No desktop shortcut was used in the acceptance run. Prior shortcut inventory:
`MATH3D Electron.lnk` targets `C:\Math3D\start-electron.bat`; the other Math3D
shortcuts target separate installed applications. Installed-app/launcher parity
remains a roadmap acceptance item.

## Screenshots

- [Opened retained Catenoid Surface](catenoid-surface.png)
- [Its retained sampled Mesh](catenoid-mesh.png)
- [Same Surface restored after cold restart](catenoid-cold-resume.png)

Local detailed logs: `output/project-flow-build.log`,
`output/project-flow-e2e.log`, `output/project-flow-final-e2e.log`, and
`output/project-flow-committed-e2e.log`. Large runner artifacts remain local in
`test-results/playwright`.

This report qualifies the requested first journey and simple flip. It does not
mark the complete PM01–PM10 foundation or later comparison/composition phase as
finished. Restart camera persistence and complete module-tool parity remain
separate roadmap work.
