# Project comparison and composition (PC01–PC05)

This is a read-only view of two documents already saved in one Math3D Project. A
composition saves source IDs, exact document revisions and hashes, visibility,
supported appearance choices, and view mode. It does not copy, edit, or merge
the owning Surface, Mesh, or Geometry documents or their scientific buffers.

## Open a comparison

1. Open a saved Project with at least two supported documents.
2. In the Project navigator, choose **Compare saved documents**.
3. Choose sources **A** and **B**. Side by side accepts saved Mesh, Geometry, and
   bounded parametric/constructed Surface documents. A source with a retained
   replay checkpoint also offers a **Generation** selector, so the same Surface
   document can be compared before and after an edit. Each pane identifies its
   exact source revision and hash. Click a rendered mesh to inspect its member
   and local coordinate; point/line overlays are not pickable in this view.
4. For a Mesh–Geometry overlay, choose **Overlay** and enter a common frame and
   unit. When both structural sources contain `math3dCoordinateFrame` metadata,
   the viewer checks frame, unit, axes and handedness independently and refuses
   a mismatch. Older sources without that metadata remain explicitly labeled
   as an **unverified operator assertion**; entering matching text does not turn
   it into scientific evidence. Surface overlays are refused; compare them in
   separate panes instead.
5. Adjust each member's visibility and opacity. Mesh/Geometry color is
   independent per member; Surface retains its own viewer palette.
6. Choose **Save composition** to retain the view recipe in the Project. Select
   it later from **Saved composition**. The source documents remain unchanged.

Missing or changed source revisions are shown explicitly and are not silently
replaced by current data. An exact retained checkpoint is available only when
the saved replay contains that checkpoint; other historical revisions are
refused. When two visible panes show the same Surface document with an identical
stored parameter domain, a picked parameter coordinate is linked across them.
This is a chart-coordinate comparison, not a claim that both surfaces have the
same physical point or state. All other cross-pane selections remain independent.
Mesh sidecar bytes are checked before
rendering; a missing or modified sidecar is refused. The preview is bounded to
500,000 mesh vertices. Unsupported Surface families show a refusal rather than
an invented rendering.

PC03 remains partial for legacy sources lacking coordinate metadata. PC05
supports exact retained checkpoints and same-chart Surface selection; arbitrary
historical generations and unrelated-model selection mapping remain partial.
Compatible camera synchronization is a separate PC06 task. No physics worker or
scientific recomputation is involved.

An optional source declaration uses the exact object
`{"format":"math3d.coordinate-frame/v1","frame":"laboratory xyz","unit":"mm","axes":["x","y","z"],"handedness":"right"}`.
The Mesh producer stores it at `source.origin.math3dCoordinateFrame`; the
Geometry producer stores it at `source.extensions.math3dCoordinateFrame`.
These fields are part of each document's structural source hash. The viewer
never adds them to an existing source merely to permit overlay.

Focused checks: `npx vitest run tests/unit/projectComposition.test.ts` and
`npx playwright test tests/e2e/project-composition.spec.ts --reporter=list`.
