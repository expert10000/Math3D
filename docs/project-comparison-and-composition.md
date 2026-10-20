# Project comparison and composition (PC01–PC05)

This is a read-only view of two documents already saved in one Math3D Project. A
composition saves source IDs, exact document revisions and hashes, visibility,
supported appearance choices, and view mode. It does not copy, edit, or merge
the owning Surface, Mesh, or Geometry documents or their scientific buffers.

## Ready-to-open test starters

In Math3D choose **Projects → Starter projects** and open one of these built-in
Projects. Each creates an independent saved copy; **New copy** creates another.
Then open **Compare saved documents** in the Project navigator and choose the
named entry under **Saved composition**.

| Starter | Saved comparison | What to check |
| --- | --- | --- |
| **Coordinate Overlay Verification** | **Verified A/B overlay** | The two source-declared `laboratory xyz` / `mm` frames, axes and handedness match; the banner identifies a source-declared match. |
| Same starter | **Unverified A/D overlay** | D has no coordinate declaration, so the banner says the alignment is an operator assertion. |
| Same starter | Choose **C · mismatched cm box** as source B while in Overlay mode | The viewer refuses the `mm`/`cm` mismatch instead of drawing it as aligned. |
| **Surface Generation Comparison** | **Before / after · linked u,v** | A is the retained bowl checkpoint (r1); B is the current saddle (r2). Select a Surface point to link its stored parameter coordinate across panes. |

For a compatible side-by-side pair, turn on **Synchronize cameras** and choose
**A → B** or **B → A**. The leader's orbit, pan, and zoom pose is applied to the
other viewer; either pane can remain independent when the switch is off. The
control is disabled for unmatched or undeclared coordinate frames and for
Surfaces without the same saved parameter domain, x/y axes, and length unit.
Saving the composition retains the camera-link preference and leader, but not a
transient camera pose. Reopening rechecks source compatibility before linking;
it never uses a saved preference as proof that two frames match.

Save the Project, restart Math3D, and reopen the comparison to check that the
same source revisions still verify. The test starters add no worker, derived
physics, or editable copy of a source inside a composition. An overlay banner
checks declarations supplied by the sources; it cannot prove that a producer's
coordinate declaration was scientifically correct.

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
PC06 provides opt-in, one-way camera-pose linking only for compatible pairs; no
arbitrary cross-frame camera transform is inferred. No physics worker or
scientific recomputation is involved.

## PC07 · Workbook Visualize comparison

Open a saved Project containing a saved composition, then open a Workbook's
**Visualize** stage. In a Visualize block, choose that composition under
**Saved Project comparison**. The block records the Project ID, composition ID,
and exact composition hash; it does not copy either document or its buffers.
Choose **Show embedded comparison** to render the saved two-pane or overlay
view inside the block. Closing it releases the mounted viewers. The same link
appears in Workbook document mode and in a saved Project Workbook.

The embedded view replays and checks both source generations and Mesh sidecars
before display. If the composition changes, a member goes missing, or a
generation is no longer retained, the block says stale or missing and refuses
the preview. It does not follow a changed composition implicitly. The existing
same-chart `(u,v)` selection and qualified camera preference are reused where
applicable; neither creates new physics or alters the active document. Legacy
overlay alignment remains an operator assertion when source metadata is absent.

Focused checks: `npx vitest run tests/unit/workbookProjectComparison.test.ts`
and `npx playwright test tests/e2e/workbook-comparison.spec.ts --reporter=list`.

An optional source declaration uses the exact object
`{"format":"math3d.coordinate-frame/v1","frame":"laboratory xyz","unit":"mm","axes":["x","y","z"],"handedness":"right"}`.
The Mesh producer stores it at `source.origin.math3dCoordinateFrame`; the
Geometry producer stores it at `source.extensions.math3dCoordinateFrame`.
These fields are part of each document's structural source hash. The viewer
never adds them to an existing source merely to permit overlay.

Focused checks: `npx vitest run tests/unit/projectComposition.test.ts` and
`npx playwright test tests/e2e/project-composition.spec.ts --reporter=list`.
