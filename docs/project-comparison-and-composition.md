# Project comparison and composition (PC01–PC05)

This is a read-only view of two documents already saved in one Math3D Project. A
composition saves source IDs, exact document revisions and hashes, visibility,
supported appearance choices, and view mode. It does not copy, edit, or merge
the owning Surface, Mesh, or Geometry documents or their scientific buffers.

## Open a comparison

1. Open a saved Project with at least two supported documents.
2. In the Project navigator, choose **Compare saved documents**.
3. Choose sources **A** and **B**. Side by side accepts saved Mesh, Geometry, and
   bounded parametric/constructed Surface documents. Each pane identifies its
   exact source revision and hash. Click a rendered mesh to inspect its member
   and local coordinate; point/line overlays are not pickable in this view.
4. For a Mesh–Geometry overlay, choose **Overlay** and enter a common frame and
   unit. These are your alignment assertions: the existing source types do not
   independently prove that their coordinates are compatible. Surface overlays
   are refused; compare them in separate panes instead.
5. Adjust each member's visibility and opacity. Mesh/Geometry color is
   independent per member; Surface retains its own viewer palette.
6. Choose **Save composition** to retain the view recipe in the Project. Select
   it later from **Saved composition**. The source documents remain unchanged.

Missing, changed, or historical source revisions are shown explicitly and are
not silently replaced by current data. Mesh sidecar bytes are checked before
rendering; a missing or modified sidecar is refused. The preview is bounded to
500,000 mesh vertices. Unsupported Surface families show a refusal rather than
an invented rendering.

PC05's retained-historical-generation comparison and cross-pane selection
synchronization remain partial. Compatible camera synchronization is a separate
PC06 task. No physics worker or scientific recomputation is involved.

Focused checks: `npx vitest run tests/unit/projectComposition.test.ts` and
`npx playwright test tests/e2e/project-composition.spec.ts --reporter=list`.
