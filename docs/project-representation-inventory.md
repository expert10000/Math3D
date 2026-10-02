# Projects representation inventory — PRJ16

Inventory of the native host adapters on `codex/projects-prj16`, based on `main`
`243bae5` (October 2, 2026). Replay validation and source-byte transfer are separate
from native editor qualification. A verified preview retains the source but cannot
activate an unrelated editor or substitute a preset. Any unsupported document in a
project keeps whole-project opening disabled; compatible documents remain inspectable.

| Module / representation | Current desktop/web support | External inputs | Missing contract or restriction |
| --- | --- | --- | --- |
| Graph2D | Native opening/editing; at most one Graph per project | Checked point tables when present | Multi-Graph editor sessions remain unqualified |
| Curve: literal parametric / explicit, 2D or 3D | Native source edit/history/save/reopen (PRJ10) | None | No source dependencies or source IDs; expressions must compile |
| Curve: Graph promotions | Existing qualified Graph opener | Parent Graph and any checked point table | Exact current promotion lineage required |
| Curve: planar implicit / polar | Native source edit/history; numerical contours/polar samples | Saved bounds/formula or radius/angle convention | Independent planar definitions; complete finite bounds; radians/degrees retained |
| Curve: Bézier / B-spline / NURBS | Native source edit/history; numerical spline evaluation | Complete saved control points, degree, knots and positive weights | Nonperiodic active knot interval equals saved domain; degree ≤32; ≤4096 controls; no dependencies |
| Curve: polyline / curve-on-surface / derived | Native source edit/history for stored samples or qualified chart links | Stored points or exact saved Surface revision | ≤4096 finite points; sampled snapshots retain approximation; chart link needs compilable u/v and a qualified Surface; recipes without samples stay previews |
| Surface: nonperiodic literal parametric | Native source edit/history/save/reopen (PRJ10) | None | No source IDs or mesh ID; finite u/v domains |
| Surface: Graph revolution / extrusion | Existing qualified Graph opener | Parent Graph and any checked point table | Exact current promotion lineage required |
| Surface: periodic parametric / explicit / implicit | Native source edit/history; numerical patch/contour evaluation | Complete saved formulas and finite domains | 33² patch or 33³ implicit sampling; periodic endpoints sampled, no topology/seam-welding claim; branch policies remain unqualified |
| Surface: spline / constructed / Weierstrass | Native source edit/history for complete spline grids, six existing Curve constructions and literal Weierstrass | Complete control grid/knots/weights or exact parent generations | Spline grid ≤32²; normalized construction domain; bounded resolutions; existing construction evaluator inputs only; Weierstrass integration remains numerical |
| Surface: mesh-backed | Native source edit/history; original checked Mesh coordinates | Referenced Mesh and verified buffers | Stable resource ID or explicit exact Mesh generation; no implicit remeshing |
| Geometry: procedural objects + bounded live-derived constructions | Native opening/parameter edit/save/reopen (PRJ11) | Object IDs and construction inputs retained in source | Up to 80 supported live-derived constructions; mount cache enrichment is transient |
| Geometry: point/scene primitives, canonical constructions/relationships | Native source edit/history; saved primitive/construction view | Saved scene and construction definitions | ≤512 primitives, ≤256 constructions, ≤512 relationships; inputs must resolve; numerical circle display |
| Geometry: embedded surfaces, cameras or overlays | Verified preview | Surface/display definitions | Exact native display and source restoration |
| Volume: analytic/custom scalar recipes | Native expression/parameter/grid edit/history/restart (PRJ14) | Cache bytes optional when recipe regenerates samples | Qualified compiling recipe, positive spacing, identity direction, 2–128 samples per axis, no dependencies |
| Volume: dense scalar grid / dense-grid recipe | Native checked sampling + spatial edit/history/export/restart (first PRJ16 slice) | Required verified scalar payload including retained undo/redo sources | One component; eight little-endian scalar types; positive spacing, identity direction, 2–128 samples per axis; fixed dimensions/bytes; no dependencies |
| Volume: other imported recipes / oriented grids | Verified preview | Checked payload | Recipe semantics or native index-to-world mapping not qualified |
| Volume: dense vector / distance field / binary mask / label map | Verified preview | Payload and source generations as required | Vector/component, SDF or segmentation editor/sampler and provenance contracts |
| Topology: fundamental diagram | Native diagram edit/history/restart (PRJ13) | Diagram model retained in source | Bounded editor model; mathematical diagnostics are retained |
| Topology: CW / simplicial finite-2D source | Native source edit/history; canonical incidence with schematic layout | Complete declared vertices, edges and attachments/triangles | ≤256 vertices, ≤1000 edges, ≤512 faces; layout is illustrative; other snapshot kinds remain preview-only |
| Complex: supported Function Explorer | Native expression/domain/grid/branch/contour edit/history/restart (PRJ13) | Saved AST and contour definitions | Uniform grid ≤256 per axis; no parameters, exclusions, covering or Mobius recipe; supported cuts only |
| Complex: parameters, exclusions, alternative cuts/sampling, covering or Mobius | Verified preview | Structural source definitions | Dedicated editor/evaluation mapping and branch/contour oracles |
| Mesh: recognized resource-backed sources | Native coordinate transform, selection/history/restart (PRJ15) | Verified current and historical positions/indices/normals/UVs | Bounded native resource codec and supported origin; bytes cannot be regenerated from a preset |

The mobile named-project editor still supports the qualified single-Graph model
with checkpointed Curve/Surface companions. Desktop/web qualification in this
inventory does not establish native mobile editing for other representations.

## First PRJ16 delivery: dense scalar grids

The adapter consumes the package/archive's verified bytes and decodes x-fastest,
little-endian scalar samples. Source identity, payload handle/type, original byte
encoding, recipe annotations, spatial metadata and provenance remain unchanged on
open/save. The viewer receives Float32 samples; the scientific Volume object retains
the original scalar type and values. NaN remains missing data; infinities and finite
values outside the Float32 viewer range reject activation. The adapter does not infer
mask/label/sentinel semantics from opaque recipe annotations.

**Projects → Open saved project** opens a qualified package. The saved Volume bar
shows its scalar type and byte length. **Parameters and grid → Grid and units →
Apply source** edits origin, positive spacing, centering and unit metadata. Dimensions,
direction and sample bytes are bounded by the qualified source; changing dimensions
requires a separately qualified resampling operation. Undo/redo use the existing
Volume adapter, and **Export with resources** transfers the original authoritative
bytes to another host. All retained replay sources are checked before opening, so
undo cannot reveal a missing or unsupported payload.

PRJ16 now delivers the enabled rows above. Formats outside their bounds remain
explicit previews; they are not enabled merely because their JSON or bytes transfer. PRJ17 physical-device/installed-engine checks and PRJ18 combined
cross-module freeze remain separate. See the [delivery roadmap](unified-projects-roadmap.md)
and [acceptance record](unified-projects-acceptance.md).

## Additional source editors

Open a supported saved project, select its document in **Projects**, then expand
**Edit source definition**. The measured view reports sample bounds or canonical
incidence counts; **Apply source**, **Undo document**, **Redo document** and
**Projects → Save project / Export project** use the normal module replay. Stored
polyline vertices remain exact rather than being replaced by a new sample grid.
Rejected edits preserve both the live source and redo. On a missing/stale dependency,
the editor shows the reason and retains the saved definition.

Desktop/web evidence covers these controls, independent import and restart/reload.
No additional Complex recipe, oriented/vector/segmentation Volume sampler, embedded
Geometry surface/camera/overlay editor or physical mobile editing is implied.
