# Project comparison and composition (PC01–PC20)

This is a read-only view of two documents or explicitly retained generations
already saved in one Math3D Project. A
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

## PC08 · Exportable comparison evidence

Status: **Complete** for the current saved Mesh, Geometry and bounded Surface
comparison adapters. PC03 and PC05 retain the partial boundaries below.

Open either built-in comparison starter under **Projects → Starter projects**, then
**Compare saved documents → Saved composition**. The **Exportable comparison
evidence** section shows A/B titles, exact source revisions and complete hashes,
the alignment qualification, and a picked local coordinate (plus stored `(u,v)`
for a compatible Surface chart). **Export checked HTML report with views**
captures the existing one- or two-pane viewer and downloads a standalone HTML
report with those images and a machine-readable evidence record. The captured
images are display illustrations, not scientific source arrays. The report
re-verifies both exact generations and any Mesh sidecars before and after
capture; a changed, missing, mismatched or tampered source refuses export.

The same control appears inside **Workbook → Visualize → Saved Project
comparison → Show embedded comparison**. A selected Workbook publication
(Markdown, HTML, print/PDF, or portable) also includes a checked A/B evidence
section with revisions, hashes, units and qualification. The publication does
not claim a transient viewer selection or image was saved in the Workbook:
export a selected/captured view from the open comparison control. Portable
publication verifies its embedded Project and the same source references on
reopen. No second renderer, copied scientific buffers or worker calculation is
introduced.

Checks: `npx vitest run tests/unit/projectComparisonEvidence.test.ts` and
`npx playwright test tests/e2e/project-comparison-evidence.spec.ts --reporter=list`.
PC03 remains **Partial** for legacy sources without coordinate declarations;
PC05 remains **Partial** for unretained generations and unrelated-model
selection mapping. PC08 does not reinterpret those limitations as verified.

## PC09 · Observations across two saved documents

Status: **Complete** for the saved Mesh, Geometry and bounded Surface comparisons
supported by PC08. Open a named Project (save a starter first), then choose
**Compare saved documents → Saved composition**. Select the exact saved
comparison, enter an observation title and text, and choose **Save observation**.
The Note records the saved composition hash, both exact document revisions and
hashes, and whether alignment is source-declared, operator-asserted, or not
applicable. It never changes either source.

Open **Notes → Comparison → Open target** to return to the verified comparison.
The action refuses a missing, changed or tampered composition or source; it
does not substitute a newer generation. The HTML comparison report and Workbook
publication include current authored observations with their Note hashes and
explicitly distinguish them from scientific measurements. Export refuses stale
observations. PC03 and PC05 remain **Partial** for the boundaries above; PC10
is the broader acceptance gate below.

Checks: `npx vitest run tests/unit/projectComparisonNotes.test.ts` and
`npx playwright test tests/e2e/project-comparison-observations.spec.ts --reporter=list`.

## PC10 · Bounded comparison acceptance

Status: **Complete for the supported adapters** on desktop. Run the repeatable
gate with `npm run test:projects:pc10`. It typechecks and builds the app, runs
the composition, template, Note, Workbook and report contract tests, then
exercises the saved comparison flows in Electron.

| Evidence | Accepted scope |
| --- | --- |
| Ownership and revisions | Mesh, Geometry and bounded parametric Surface remain in their owning Project documents. A view saves references to exact source revisions and hashes. A retained Surface checkpoint is shown only when its replay is present. |
| Units and alignment | Matching source-declared Mesh/Geometry frames qualify an overlay. Missing declarations remain an operator assertion; mismatched declarations refuse overlay. Surface and heterogeneous sources use separate panes. |
| Selection and appearance | A picked Surface sample retains its exact source revision and shares stored `(u,v)` only with the compatible second generation. Other picks remain source-local; appearance does not edit either source. |
| Notes and export | Comparison Notes, Workbook Visualize references, HTML reports and portable publications retain exact A/B provenance. Restart reopens checked links. Missing or changed generations, composition hashes and Mesh sidecar bytes are refused. |
| Viewer lifetime | Closing Geometry overlay, Mesh/Geometry panes or retained/current Surface panes detaches their canvases and releases their WebGL contexts. The saved workspace remains unchanged. |

The gate includes `tests/e2e/project-comparison-lifecycle.spec.ts` and the
existing PC01–PC09 focused suites. It passed on October 31, 2026: 26 unit
tests and 12 Electron tests, with TypeScript and the core build passing.
This records desktop acceptance for the stated adapters, not support for every
Project document family or arbitrary scientific alignment. PC03 remains
**Partial** for legacy sources without coordinate declarations. PC05 remains
**Partial** for historical generations without retained bytes and selection
between unrelated models.

## PC11 · Retained Mesh generation comparison

Status: **Complete for one bounded pre-subdivision Mesh generation**. Open a
saved Project containing a fresh Mesh, choose that Mesh in the Project navigator,
then choose **Saved studies → Retain before and subdivide once**. This creates
one edit with the original Mesh as its exact replay checkpoint. The action accepts
1–10,000 triangular faces and at most 20,000 source vertices; the subdivided
result must have at most 50,000 vertices. PC12 extends the action to a Mesh with
earlier edits, retaining its immediate pre-edit revision explicitly.

Choose **Projects → Compare saved documents**. Select the same Mesh for A and B,
set A's **Generation** to **retained checkpoint**, and leave B at **current**.
Each pane displays its own revision and structural hash. Source-declared units
are retained and shown; undeclared units remain undeclared. Mesh picks stay local
to their pane because subdivision changes vertex and face IDs. Choose **Save
composition**, then **Save project** to retain both exact binary sidecars. The
saved composition can be reopened after a Project restart. The HTML comparison
report includes both source hashes and viewer captures.

Checks: `npx vitest run renderer/src/projects/retainedMeshGeneration.test.ts
--maxWorkers=1` and `npx playwright test
tests/e2e/project-mesh-generation.spec.ts --reporter=list`. They cover retained
revisions, units, sidecars, missing and changed bytes, saved comparison and
export, restart, and WebGL viewer cleanup. PC03 remains **Partial** for legacy
sources without coordinate metadata. PC05 remains **Partial** for generations
that were never retained and for selection between unrelated models.

## PC12 · Multiple explicitly retained Mesh generations

Status: **Complete for up to eight explicitly retained Mesh generations**.
Choose a saved Mesh in the Project navigator and open **Saved studies**. Use
**Retain before and subdivide once**, or set `dx`, `dy`, `dz` and scale and use
**Retain before and apply transform**. Repeat either action on the current Mesh
as needed. Each action marks the exact pre-edit document revision and hash in
the replay log; its source units and binary sidecar remain attached. The same
bounds apply to each edit: at most 20,000 source vertices and 10,000 source
triangles, with at most 50,000 output vertices. A ninth retained generation is
refused before changing the Mesh. The original replay checkpoint remains
selectable when its bytes exist; ordinary *intermediate* edits without a
retention marker do not become selectable historical generations.

Choose **Projects → Compare saved documents**, select the same Mesh in both
source slots, then pick any *different* retained or current revisions from the
two **Generation** menus. The menu distinguishes the original replay checkpoint,
intermediate retained snapshots and current Mesh. Each pane shows its own exact
revision, hash and source-declared unit. Mesh vertex and face picks remain local
to that pane; no mapping between remeshed IDs is inferred. Save the composition
and Project to keep the selection and sidecars. Workbook and comparison Note
links continue to resolve the exact saved composition. Exported HTML evidence
records both selected generations and refuses missing or changed source bytes.

Run `npm run test:projects:pc12`. The gate covers marker and replay verification,
the eight-generation bound, declared units, package round-trip, missing and
tampered sidecars, an unavailable invented generation, two-pane export, restart,
and WebGL cleanup. PC03 remains **Partial** for legacy sources without coordinate
metadata; PC05 remains **Partial** for generations that were never retained and
selection between unrelated models.

An optional source declaration uses the exact object
`{"format":"math3d.coordinate-frame/v1","frame":"laboratory xyz","unit":"mm","axes":["x","y","z"],"handedness":"right"}`.
The Mesh producer stores it at `source.origin.math3dCoordinateFrame`; the
Geometry producer stores it at `source.extensions.math3dCoordinateFrame`.
These fields are part of each document's structural source hash. The viewer
never adds them to an existing source merely to permit overlay.

Focused checks: `npx vitest run tests/unit/projectComposition.test.ts` and
`npx playwright test tests/e2e/project-composition.spec.ts --reporter=list`.

## PC13 · Compare immutable saved Mesh analysis results

Status: **Complete for stored Mesh quality and discrete curvature summaries**.
In the Mesh workspace, open **Saved studies** and choose **Save mesh quality** or
**Save discrete curvature** for two source generations. Choose **Projects → Save
project**, then **Compare saved results** in the Project comparison section.
Select A and B from the saved result menus. This is a result comparison, separate
from the PC11–PC12 two-viewer Mesh generation comparison.

Each selected envelope is validated and tied to its exact Mesh document ID,
revision, structural hash and retained or current generation. Its binary source
sidecar is checked before display and again before HTML export. Missing results,
unretained or changed generations, and missing or altered bytes are refused.
The report records both complete stored summaries, algorithms, versions, engines,
result hashes and source hashes. It never reruns Mesh analysis.

Only the same operation, algorithm, algorithm version and result status can
produce differences. Each scalar difference is **B − A** and requires matching,
known units for that metric. Dimensionless ratios, counts and angle degrees can
be compared even when source length units are undeclared. Length, area and
curvature values remain side by side but have no difference without matching
source-declared length units. A changed unit suppresses only its dependent
metrics. Vertex and face IDs are not aligned across generations.

Run `npm run test:projects:pc13` for saved-result compatibility, unit rules,
source verification, tamper refusal, HTML export and Electron restart. PC03
remains **Partial** for legacy sources without coordinate metadata. PC05 remains
**Partial** for unretained historical generations and unrelated-model selection.

## PC14 · Saved Mesh analysis trends

Status: **Complete for stored Mesh quality and discrete curvature scalars**.
In the Mesh workspace, open **Saved studies** and save the same analysis on
successive explicitly retained Mesh generations. Save the Project, then choose
**Projects → Compare saved documents → View saved result trend**. Pick the Mesh
method and a recorded scalar metric. The chart draws one independent dot per
verified saved result; it never connects or interpolates points. Selecting a dot
shows that result's exact ID and hash, Mesh revision and source hash.

The view includes all current, checkpoint and explicitly retained revisions of
the selected Mesh. A retained revision with no saved result appears as **not
recorded**. A saved result with missing, changed or unretained source bytes
appears as **unavailable**, without displaying an unverified value. Only one
Mesh document, operation, algorithm, version and result status enters a trend.
Units are checked per metric. Counts, ratios and degrees can be displayed with
undeclared source length units; area, length and curvature need compatible
declared length units. The HTML report is regenerated from verified saved data
at export and refuses any unavailable saved result. Gaps without a saved result
remain explicit in the report.

Run `npm run test:projects:pc14`. Its unit cases cover three retained revisions,
method grouping, missing result gaps, source bytes, portable Project package
import and report refusal. The Electron case covers exact point selection,
export and restart. PC03 and PC05 retain their existing **Partial** boundaries.

## PC15 · Saved Mesh trend in Workbook

Status: **Complete for the PC14 saved quality and curvature trend scope**.
Save compatible Mesh analysis results on explicitly retained generations and
save the Project. Open **Workbook → 3 Visualize → Saved Mesh trend**, select a
Mesh method and scalar, then choose **Link verified trend**. The Visualize block
stores the Project and Mesh IDs, method, algorithm version, metric, and each
exact result ID, result hash, source revision and source hash. Save the Workbook
in Projects to retain the link with the Project. Source arrays stay in Project
resources.

Choose **Show embedded trend** to verify the exact sources and display one
independent point per stored result. A retained generation without a saved
result is an explicit gap. Selecting a dot shows its recorded value and hashes.
Closing the view releases the plot. Changed result sets, missing generations,
missing sidecars or tampered bytes refuse the embedded view. Relink deliberately
when adding a new saved result to the trend. After restarting Math3D, reopen
the saved Project so its checked source resources are available, then open the
Workbook trend.

Workbook Markdown, HTML and portable publication export include the stored
values, revisions and hashes after re-verification. Export refuses stale or
unavailable linked evidence. `npm run test:projects:pc15` covers contract and
portable import, export refusal, Electron selection, restart and viewer cleanup.
No Mesh analysis runs in the Workbook. PC03 and PC05 remain **Partial** for
legacy sources and history that was never retained.

## PC16 · Open a trend point's exact saved result

Status: **Complete for verified PC14 and PC15 Mesh trend points**.
In **Projects → Compare saved documents → View saved result trend**, select a
recorded dot and choose **Open saved result**. The same action appears under
**Workbook → 3 Visualize → Show embedded trend**. Math3D checks the exact
result ID and hash, Mesh revision and hash, and source sidecar before taking
you to **Projects → Results and artifacts**. The inspector shows the stored
method and summary. **Show exact Mesh generation** opens a read-only view of
the checked source, including a retained generation; **Return to saved result**
closes that view and releases its renderer. Picks remain local to that Mesh
revision.

If the retained generation or sidecar is absent or changed, the saved result
inspector explains why the source cannot open and does not substitute the
current Mesh. The plot action itself refuses an unverified point. Restart and
portable import require reopening the Project and its resources. No Mesh
analysis runs on this navigation path. PC03 and PC05 remain **Partial** for
legacy coordinate metadata and generations that were never retained.

## PC17 · Compare two saved trend points

Status: **Complete for the verified PC14 and PC15 Mesh trend scope**.
Open the saved result trend from Projects or its embedded Workbook Visualize
block. Select one recorded dot and choose **Pin selected as A**; select a
different dot and choose **Pin selected as B**. **Compare pinned results**
rechecks both exact result IDs and hashes, Mesh revisions and hashes, and
source sidecars before opening the existing PC13 A/B inspector. **Return to
trend** preserves the plot, pins and selection. The A/B view shows stored
inputs, methods, provenance and scalar values. It calculates B − A only for
matching operations, algorithm versions and metric units; incompatible values
remain source-local with an explicit reason.

Missing or changed evidence refuses the comparison and report export. A
restart requires reopening the saved Project and checked Workbook resources;
pins are temporary UI choices and are made again after reopening. No Mesh
analysis or interpolation runs on this path. PC03 and PC05 remain **Partial**
for legacy coordinate metadata and unretained history.

## PC18 · Save a pinned Mesh A/B comparison

Status: **Complete for two compatible, verified points in one saved Mesh trend**.
In **Projects → Compare saved documents → View saved result trend**, pin A and B,
then choose **Compare pinned results → Save pinned comparison**. Give the pair
a name. It appears under **Saved pinned comparisons** in the same Project and
reopens after restart. The Project stores only the exact result IDs and hashes,
Mesh IDs, revisions, source hashes, and selected metric. It does not copy or
recompute the result or Mesh arrays.

Opening the saved pair and exporting its HTML report reverify both result
envelopes and their exact Mesh generations and sidecars. Missing, changed, or
tampered evidence refuses the view or export. A portable Project package must
include the required sidecars. PC03 and PC05 remain **Partial** for legacy
coordinates and history that was never retained.

## PC19 · Present a saved Mesh comparison in a Workbook

Status: **Complete for a compatible PC18 pair in one saved Project**. First save
the pair in **Projects → Compare saved documents → View saved result trend →
Compare pinned results → Save pinned comparison**. Then open a Workbook and
choose **3 Visualize → Saved Mesh A/B comparison**. Select the named pair and
save the Workbook in Projects to retain the reference. **Show embedded saved
Mesh comparison** displays the stored A and B scalar values, qualified
differences, exact result/source hashes, and links to each Project result.

The Workbook keeps the Project comparison ID, comparison hash, selected metric,
and both exact result and Mesh generation hashes. It owns no Mesh data and runs
no analysis. Opening the embedded view and exporting its HTML report reverify
the saved results and sidecars. Workbook publication and portable import also
refuse a missing, changed, or tampered source. Closing the embedded view releases
its display; the Project retains the pair. PC03 and PC05 remain **Partial** for
legacy coordinate metadata and Mesh generations that were never retained.

## PC20 · Observations on saved Mesh comparisons

Status: **Complete for a verified saved PC18 Mesh pair**. Open **Projects →
Compare saved documents → Saved pinned comparisons**, choose the pair, and use
**Save observation**. The same action appears in **Workbook → 3 Visualize →
Saved Mesh A/B comparison → Show embedded saved Mesh comparison**. The Note
anchors to the Project comparison ID and hash, its selected metric, both exact
result IDs and hashes, and both Mesh source revisions and hashes. It records
authored interpretation; no Mesh analysis is run.

Only Notes whose pair, results, and sidecars still verify display their text in
the comparison and Workbook. The Project Notes list marks unavailable anchors
and hides their text until evidence verifies. The checked HTML report and
Workbook publication include current observations with their Note IDs and
hashes, explicitly labeled as authored observations. Export refuses a stale or
missing linked Note or source; portable import rechecks the same references.
The Project package retains the Notes without copying Mesh bytes into them.

Acceptance covers Project and Workbook saving, restart, HTML export, portable
publication/import, missing sources, changed comparison references, and
tampered sidecars. PC03 remains **Partial** for legacy sources without coordinate
metadata. PC05 remains **Partial** for generations that were never retained.

### Ready-to-use Mesh comparison starter

Open **Projects → Starter projects → Saved Mesh Comparison Study → Open**.
The starter contains one square Mesh with coordinate units in metres, three
explicitly retained revisions, and one recorded quality result per revision.
Its mean triangle areas are 0.5, 1.125, and 2.53125 m². These are stored
measurements of the three supplied Meshes, not values calculated by the trend
viewer. Save the Project to retain the copy.

In the Project's **Compare saved documents → Saved Mesh analysis results**,
choose **View saved result trend**. Set **Stored scalar metric** to
`metrics.triangleArea.avg`, select the first dot and **Pin selected as A**,
then select the last dot and **Pin selected as B**. **Compare pinned results**
shows the checked 2.03125 m² B − A difference; **Return to trend** keeps the
plot. **Compare saved results** opens the same A/B inspector directly.

Three more starters are available in **Projects → Starter projects**:

| Starter | Saved evidence | First action |
| --- | --- | --- |
| **Retained Mesh Generation Study** | An octahedron, one retained subdivision, one retained transform, and quality results for all three revisions. | **Compare saved documents** and choose two generations of the same Mesh. |
| **Saved Mesh Curvature Study** | A closed triangulated sphere at three scales, with a discrete-curvature result saved at each revision. | **View saved result trend** and choose `mean.avg` or another recorded scalar. |
| **Mesh Trend With Missing Result** | Three retained square-Mesh revisions, with quality results only at the first and last. | **View saved result trend** to see the middle revision marked **not recorded**. |

All four starters preserve their source sidecars in a portable Project. Their
saved measurements are produced when the starter copy is created; comparison
and trend views only inspect those recorded results. Save the Project to retain
your own copy.

The [desktop acceptance record](evidence/mesh-starters-desktop-2026-11-03/README.md)
verifies the three additional starters' numeric trend values and the unrecorded
middle generation. Each Project was saved, exported with source resources,
imported into a separate fresh Electron profile, and reopened after an app
restart with the same values, statuses, result IDs, and source hashes.
