# Guided Study Gallery acceptance matrix

The Projects Gallery presents 15 curated journeys. Its metadata lives in `renderer/src/projects/curatedStudyCatalog.ts`; this page records how each route is qualified. A Gallery card is guidance, not evidence that a computation ran on the current host. Project Results, Study panes and published Workbooks still apply their own exact-source checks.

| Journey | Entry route | Saved Study on new guided copy | Current acceptance |
| --- | --- | --- | --- |
| Catenary and catenoid | Built-in Project | Graph + Surface; recorded derivative on Graph | Unit identities, desktop open and full restart |
| Geometry and topology | Built-in Project | Geometry + Topology | Unit save/reopen and member status |
| Geometry Note pins | Built-in Project | Geometry | Unit save/reopen; Note pin tests elsewhere |
| Derivative | Built-in Project | Graph + Curve; recorded derivative on Graph | Unit save/reopen and member status |
| Catenoid evidence | Built-in Project | None in this slice | Existing saved Mesh, Note and Workbook tests |
| Edge path evidence | Built-in Project | None in this slice | Existing exact path and publication tests |
| Graph derivative notebook | Built-in Project | Graph + Curve; recorded result on Graph | Unit save/reopen and Workbook preservation |
| Ripple wave | Built-in Project | Graph + Surface + Geometry | Unit layout creation; existing source-chain tests |
| Mesh comparison | Built-in Project | None in this slice | Existing retained-generation and trend tests |
| Mesh curvature | Built-in Project | None in this slice | Existing discrete-curvature tests |
| Surface/Geometry probe | Built-in Project | Surface + Geometry | Unit layout creation; existing comparison tests |
| QWZ | Desktop verified `.qscene` chooser | Created after two verified scenes are admitted | Existing QWZ Study and tampered-byte desktop tests |
| SSH | Desktop verified `.qscene` chooser | None in this slice | Import contract only; no bundled Study fixture |
| Hydrogen | Desktop verified `.qscene` chooser | None in this slice | Import contract only; no bundled Study fixture |
| Algebra structures | CAS / Algebra examples | Saved algebra objects in a named Project | Desktop Gallery route and saved GF(5) example |

## Source and platform rules

- Built-in Projects create independent identities. A guided copy receives a `curated-study-v1` tag; the ordinary Starter projects path and existing saved copies are left as they were. “New copy” creates another Project instead of overwriting an edited one.
- The three quantum cards contain no `.qscene` bytes. Scene import is enabled only when the desktop preload exposes the verified chooser. A local bundle can be reopened offline; producing one is separate work. The chooser verifies bundle integrity, while the card asks the user to select the corresponding model.
- The CAS card opens existing structural examples. Saving one needs a named Project. Its expected answers and failure cases describe validated definitions, not an independently verified Sage run.
- Asset sizes are described qualitatively because generated Mesh and producer-scene byte counts depend on resolution. No numeric download or memory budget is claimed yet.
- The existing SVG starter artwork is illustrative. It is not a screenshot of a release candidate and carries no producer or build provenance.

## Reproduce this slice

1. Run `npx vitest run renderer/src/projects/curatedStudyCatalog.test.ts renderer/src/projects/curatedStudyProject.test.ts renderer/src/components/ProjectTemplatesPanel.test.tsx`.
2. Run `npm run build:core` and `npx tsc -p renderer/tsconfig.app.json --noEmit`.
3. Run `npx playwright test tests/e2e/project-curated-gallery.spec.ts --reporter=list` in a source checkout with Electron available.
4. In Projects → Starter projects, switch to Guided Studies. Filter Quantum scene and confirm three external-source cards. Filter Algebra and open the CAS examples. Open the Catenary guided copy and confirm its saved two-pane Study after restarting the desktop app.

The 2.0 Gallery exit remains open until every advertised flagship journey has a complete accepted fixture, browser/mobile fallback is exercised, media provenance is captured and release-candidate asset budgets are measured.
