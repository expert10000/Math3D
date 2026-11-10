# Guided Study Gallery acceptance matrix

The Projects Gallery presents 15 curated journeys. Its metadata lives in `renderer/src/projects/curatedStudyCatalog.ts`; this page records how each route is qualified. A Gallery card is guidance, not evidence that a computation ran on the current host. Project Results, Study panes and published Workbooks apply exact-source checks.

All 11 built-in Project routes now create a guided copy with saved Study pane pins, a source-bound Note and a Workbook citing the Study. The four Mesh evidence/comparison routes gained their first saved Study. Ordinary Starter copies retain their previous contents. The renderer matrix test exercises every guided route through package save/reopen, source revision change, narrative export, verified independent import preview and a removed Workbook payload. It checks that changed citations become historical, changed Note anchors lose current status, and missing Workbook bytes prevent import. Where a journey has other pre-existing Notes with legacy anchors, the narrative export lists those as omissions instead of presenting their text as current.

| Journey | Entry route | Saved Study on new guided copy | Verified research path / host limit |
| --- | --- | --- | --- |
| Catenary and catenoid | Built-in Project | Graph + Surface; recorded derivative on Graph | Narrative matrix; desktop Gallery open and restart |
| Geometry and topology | Built-in Project | Geometry + Topology | Narrative matrix; no installed-host restart fixture |
| Geometry Note pins | Built-in Project | Geometry | Narrative matrix; existing local pin behaviour has separate tests |
| Derivative | Built-in Project | Graph + Curve; recorded derivative on Graph | Narrative matrix; no installed-host restart fixture |
| Catenoid evidence | Built-in Project | Mesh + Surface; saved curvature result on Mesh | Narrative matrix with retained Mesh sidecar; desktop only |
| Edge path evidence | Built-in Project | Mesh + Surface; saved path result on Mesh | Narrative matrix with retained Mesh sidecar; desktop only |
| Graph derivative notebook | Built-in Project | Graph + Curve; recorded result on Graph | Narrative matrix; existing Workbook retained alongside guided Workbook |
| Ripple wave | Built-in Project | Graph + Surface + Geometry | Narrative matrix with retained Mesh sidecar; desktop only |
| Mesh comparison | Built-in Project | Latest retained Mesh generation and quality result | Narrative matrix; earlier generations remain separate saved results; desktop only |
| Mesh curvature | Built-in Project | Latest retained Mesh generation and curvature result | Narrative matrix; earlier generations remain separate saved results; desktop only |
| Surface/Geometry probe | Built-in Project | Surface + Geometry | Narrative matrix; no installed-host restart fixture |
| QWZ | Desktop verified `.qscene` chooser | Created after two verified scenes are admitted | Existing QWZ Study and tampered-byte desktop tests; external scenes required |
| SSH | Desktop verified `.qscene` chooser | No bundled Study | Import contract only; no verified producer fixture |
| Hydrogen | Desktop verified `.qscene` chooser | No bundled Study | Import contract only; no verified producer fixture |
| Algebra structures | CAS / Algebra examples | Saved algebra objects in a named Project | Desktop Gallery route and saved GF(5) example |

## Source and platform rules

- Built-in Projects create independent identities. A guided copy receives a `curated-study-v1` tag; the ordinary Starter projects path and existing saved copies are left as they were. “New copy” creates another Project instead of overwriting an edited one.
- Research narrative JSON is checksum-verified, then its citations, Note status and omissions are recomputed from the enclosed Project package before the import preview. The UI lists all three and the host's document/resource compatibility. Import refuses an ID already in the library or active workspace; it never overwrites that Project. To keep two copies on one host, create and export a new guided Project copy with a fresh identity.
- Study panes, Workbook citations and new source-bound Note selections save their exact source generation and resource descriptors. Older references retain their saved source revision and are marked legacy-unpinned; migration never borrows descriptors from a later live source.
- The three quantum cards contain no `.qscene` bytes. Scene import is enabled only when the desktop preload exposes the verified chooser. A local bundle can be reopened offline; producing one is separate work. The chooser verifies bundle integrity, while the card asks the user to select the corresponding model.
- The CAS card opens existing structural examples. Saving one needs a named Project. Its expected answers and failure cases describe validated definitions, not an independently verified Sage run.
- Asset sizes are described qualitatively because generated Mesh and producer-scene byte counts depend on resolution. No numeric download or memory budget is claimed yet.
- The existing SVG starter artwork is illustrative. It is not a screenshot of a release candidate and carries no producer or build provenance.

## Reproduce this slice

1. Run `npx vitest run renderer/src/projects/flagshipNarrativeMatrix.test.ts renderer/src/projects/projectResearchNarrativeImport.test.ts renderer/src/projects/curatedStudyCatalog.test.ts renderer/src/projects/curatedStudyProject.test.ts`.
2. Run `npm run build:core` and `npx tsc -p renderer/tsconfig.app.json --noEmit`.
3. Run `npx playwright test tests/e2e/project-curated-gallery.spec.ts --reporter=list` in a source checkout with Electron available.
4. In Projects → Starter projects, switch to Guided Studies. Filter Quantum scene and confirm three external-source cards. Filter Algebra and open the CAS examples. Open the Catenary guided copy and confirm its saved two-pane Study after restarting the desktop app.

The M3D20-07 built-in research narrative exit has an automated renderer-host matrix. External QWZ/SSH/hydrogen journeys remain conditional on independently verified producer scenes. The broader M3D20-08 Gallery exit remains open for installed-host coverage of every route, browser/mobile fallback, media provenance and release-candidate asset budgets.
