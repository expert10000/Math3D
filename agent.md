# agent.md

Goals
- Implement PR3/4/5: implicit baker, worker/progress/caching, and mesh export + weld.
- Implement Workbook UX PRs A-D: workbook scaffolding, visualize blocks, compute blocks, and teaching polish.

Work Notes
- Implicit baker worker: `renderer/src/workers/implicitBakeWorker.ts`.
- UI wiring: `renderer/src/App.tsx` SurfaceMesh panel and implicit baker controls.
- Mesh export helpers: `renderer/src/mesh/meshExport.ts`.
- Weld vertices: `renderer/src/mesh/surfaceMesh.ts`.
- Workbook UI: `renderer/src/components/WorkbookPanel.tsx` + `renderer/src/workbook/workbookModel.ts`.
- Viewer snapshots: capture/apply in `renderer/src/App.tsx` using camera override hooks.

Manual Checks
1. In implicit viewer, run the implicit baker at a higher resolution and confirm progress + mesh switch.
2. In SurfaceMesh viewer, export `GLB` and `OBJ` and confirm files open.
3. Run weld vertices with a small tolerance and verify counts change.
4. Open Workbook tab, add a Visualize block, capture current view, and jump back to it.
5. Export/import workbooks as JSON and confirm blocks persist.
