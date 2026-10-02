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
| Curve: implicit / polar | Verified preview | Representation-specific definitions | Native expression/domain mapping and history parity |
| Curve: Bézier / B-spline / NURBS | Verified preview | Control points, knots and weights in definition | Native spline mapping, conventions, edit/history/restart oracles |
| Curve: polyline / curve-on-surface / derived | Verified preview outside qualified Graph promotions | Sampled points or source document generations | Exact sampled/dependent restore and source-selection/history contract |
| Surface: nonperiodic literal parametric | Native source edit/history/save/reopen (PRJ10) | None | No source IDs or mesh ID; finite u/v domains |
| Surface: Graph revolution / extrusion | Existing qualified Graph opener | Parent Graph and any checked point table | Exact current promotion lineage required |
| Surface: periodic parametric / explicit / implicit | Verified preview | Representation-specific formulas/domains | Native domain/seam mapping, unchanged-open and edit/history parity |
| Surface: spline / constructed / Weierstrass | Verified preview outside qualified Graph promotions | Control data or dependent sources | Exact construction/control mapping and native editor parity |
| Surface: mesh-backed | Verified preview | Referenced Mesh source and checked buffers | Surface-to-Mesh identity, display and editing contract |
| Geometry: procedural objects + bounded live-derived constructions | Native opening/parameter edit/save/reopen (PRJ11) | Object IDs and construction inputs retained in source | Up to 80 supported live-derived constructions; mount cache enrichment is transient |
| Geometry: point/scene primitives, canonical constructions/relationships | Verified preview | Scene/construction definitions | Native scene/construction editor mapping and history parity |
| Geometry: embedded surfaces, cameras or overlays | Verified preview | Surface/display definitions | Exact native display and source restoration |
| Volume: analytic/custom scalar recipes | Native expression/parameter/grid edit/history/restart (PRJ14) | Cache bytes optional when recipe regenerates samples | Qualified compiling recipe, positive spacing, identity direction, 2–128 samples per axis, no dependencies |
| Volume: dense scalar grid / dense-grid recipe | Native checked sampling + spatial edit/history/export/restart (first PRJ16 slice) | Required verified scalar payload including retained undo/redo sources | One component; eight little-endian scalar types; positive spacing, identity direction, 2–128 samples per axis; fixed dimensions/bytes; no dependencies |
| Volume: other imported recipes / oriented grids | Verified preview | Checked payload | Recipe semantics or native index-to-world mapping not qualified |
| Volume: dense vector / distance field / binary mask / label map | Verified preview | Payload and source generations as required | Vector/component, SDF or segmentation editor/sampler and provenance contracts |
| Topology: fundamental diagram | Native diagram edit/history/restart (PRJ13) | Diagram model retained in source | Bounded editor model; mathematical diagnostics are retained |
| Topology: other source kinds | Verified preview | Canonical/model definitions | Native source-specific editor and canonical realization mapping |
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

Further PRJ16 adapters are still pending, especially sampled/dependent Curve/Surface
sources. Each enabled row needs independent restore/edit/undo/redo/save/export and
restart evidence. PRJ17 physical-device/installed-engine checks and PRJ18 combined
cross-module freeze remain separate. See the [delivery roadmap](unified-projects-roadmap.md)
and [acceptance record](unified-projects-acceptance.md).
