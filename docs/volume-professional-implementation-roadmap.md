# Volume professional implementation roadmap

Assessment date: 2026-09-13

Reviewed checkout: `5d4cf6c` — fix(workspace): preserve surface and volume contexts

Planning source: supplied `MATH3D_Volume_Module_Roadmap.md`, reconciled with the current renderer, shared worker contracts, VTK bridge, persistence model, and automated tests.

The numbered commits below are implementation plans, not claims that corresponding Git commits are complete. Existing Volume functionality is a substantial prototype and must be preserved while it is reorganized into a distinct, professional scalar-field and voxel workspace.

## Product boundary

**Volume owns sampled data over a three-dimensional domain. A derived level-set mesh is an output of the Volume, not the Volume itself.**

| Module | Primary object | Owns |
| --- | --- | --- |
| Geometry | Exact or constructed geometric object | Construction, constraints, exact measurements, dependencies |
| Surfaces | Smooth or represented 2-manifold | Differential geometry, charts, smooth curves and features |
| Mesh | Discrete polygonal geometry | Topology, quality, repair, remeshing, mesh fields |
| Volume | Scalar, vector, mask, or label samples in 3-D | Sampling, slicing, rendering, voxel analysis, segmentation, SDF operations |

The supported conversion graph is:

```text
Geometry ── voxelize / distance ──▶ Volume
Surface  ── sample / distance ────▶ Volume
Mesh     ── voxelize / SDF ───────▶ Volume

Volume ── level set / isosurface ─▶ derived SurfaceMesh ─▶ Mesh Analysis
Volume ── mask boundary ──────────▶ derived SurfaceMesh ─▶ Geometry scene
```

Volume may show compact statistics for derived surfaces, but detailed triangle topology, mesh quality, repair, remeshing, VTK mesh processing, and CGAL mesh processing remain in Mesh.

## Preservation rule

The professionalization is additive until parity is verified. The following working features remain reachable throughout the roadmap:

- Volume top-level navigation, workspace history, Gallery, New, Demo, and custom-field entry.
- Analytic/custom presets: sphere, ellipsoid, torus, capped cylinder, superquadric, gyroid, metaballs, noise, and Mandelbulb.
- Configurable dimensions, physical sampling bounds, spacing, crop box, and crop transform gizmo.
- XY, XZ, and YZ slices with a shared crosshair, world/index readout, trilinear values, and gradient-magnitude probes.
- Slice windowing, histograms, contours, opacity, and hover feedback.
- CPU and VTK slice paths, marching-cubes/VTK isosurfaces, smoothing, and iso-value controls.
- Vector-field presets and streamline overlays.
- VTK-backed mesh distance volumes and Geometry/Mesh-to-Volume entry points.
- Existing workspace recipe persistence, scene nodes, Workbook thumbnails, responsive drawers, and status-bar summaries.
- The current modern Volume preset gallery and the restored detailed compatibility controls beneath it.

Controls may be moved, renamed, merged, or retired only after the replacement covers the same workflow and a regression test proves parity. Dense arrays must never be copied into local storage merely to preserve UI compatibility.

## Current implementation assessment

The Volume module is already more than a placeholder:

- `DatasetKind` includes `volume`, and the workspace restores Volume locations independently even though the renderer currently reuses the broader Surfaces shell.
- `VolumeGrid` stores dimensions, scalar samples, spacing, and origin. `VolumeDataset` adds a small amount of label, note, distance-field, and source metadata.
- `volumePresets.ts` samples analytic and custom fields into `Float32Array` grids. Default datasets are `64³`; controls allow larger dimensions.
- `sliceVolume.ts` provides axis-aware extraction, physical slice planes, histograms, percentile windowing, grayscale images, contours, world-to-grid conversion, trilinear sampling, and finite-difference gradient magnitude.
- `VolumeViewer.tsx` renders slices, crosshairs, contours, crop bounds/gizmos, isosurfaces, and streamlines. It selects CPU or VTK paths according to grid size and backend availability.
- The workspace has three synchronized orthogonal panes in slice mode and a separate free-camera 3-D mode.
- `vtkVolumeClient.ts` and the shared desktop/backend contracts expose slice, isosurface, streamline, and distance-field jobs.
- Mesh distance fields can be unsigned or winding-number signed, use automatic or manual bounds, and return to the Volume workspace.
- Workspace recipes preserve the preset, parameters, dimensions, sampling, custom expression, iso state, view mode, and signed-distance preference.
- The latest navigation regression keeps Volume active across Gallery, New, Demo, preset selection, and workspace history.

The main gaps are structural and scientific:

- The active object is still sometimes described by the generic Inspector as a mesh. Volume identity, source, revision, sample layout, transform, and derived results are not one canonical contract.
- `VolumeGrid` does not record scalar type, component count, centering, direction/orientation matrix, units, missing-value policy, or storage strategy.
- Analytic definitions, sampled grids, imported grids, masks, labels, SDFs, and vector fields are not modeled as explicit representation variants.
- The three-slice layout creates three complete WebGL viewers and uses a horizontal three-column arrangement that wastes vertical space at common desktop aspect ratios.
- Slice navigation has a shared crosshair but lacks linked/unlinked state, wheel stepping, coarse stepping, voxel snapping, and explicit orientation conventions.
- Analytic sampling and several derived calculations still occur synchronously in the renderer; dimension limits are not governed by one memory policy.
- Isosurfaces are display state rather than revision-safe derived result objects with complete provenance, lifecycle, validation, and handoff history.
- Distance-volume generation exists, but occupancy voxelization, robust sign diagnostics, SDF Boolean/offset operations, and round-trip validation do not.
- There is no true ray-marched direct volume rendering, MIP, MinIP, average projection, or editable transfer function.
- Volume-wide statistics, gradient/Hessian/Laplacian fields, critical points, regions, and quantitative measurements are not published through the shared analysis result system.
- Masks, label maps, morphology, connected components, segmentation history, scientific file I/O, and Volume Compare are absent.
- Volume-specific unit and E2E coverage is minimal. The current navigation test protects entry and context but not numerical results, viewport geometry, workers, persistence, or performance.

## Baseline completed before Commit 1

The following foundation is complete at `5d4cf6c` and is not a substitute for any numbered commit:

- Volume is visibly identified as `Volume / Workspace` rather than `Surfaces / Volume`.
- Selecting Volume opens its own gallery and no longer routes primary actions back to a Surface family.
- Gallery, New, Demo, custom editing, and the More-menu Volume entry preserve Volume context.
- The modern gallery remains intact and the original detailed Volume controls are available below it.
- Surface-family New and Demo actions also preserve their active family.
- Typecheck, production renderer build, and the seven-test workspace-navigation suite pass.

## Implementation progress

| Plan | Status | Existing foundation | Main work remaining |
| --- | --- | --- | --- |
| 1 — Professional workspace and Inspector correction | Complete | Volume-first selection and Inspector, balanced responsive slice workspace, runtime states, compatibility controls | — |
| 2 — Canonical Volume model and provenance | Complete | Canonical contracts, representation adapters, revision/provenance tracking, managed typed-array handles and stale derived-result records | — |
| 3 — Orthogonal navigation and probe | Complete | Direction-aware shared probe, independent pane positions, wheel/drag/keyboard navigation, orientation conventions, pinned probe lifecycle | — |
| 4 — Sampling, resampling and allocation planning | Complete | Dimension presets, draft/apply recipes, centering/interpolation/boundary policies, estimates, limits, resampling and non-finite diagnostics | — |
| 5 — Quad layout and spatial 3-D context | Complete | Quad default, six layout presets, embedded slice planes, focus, clipping and persistent deterministic camera state | — |
| 6 — Worker, cache and memory foundation | Planned | VTK worker bridge and CPU fallbacks | Shared job lifecycle, cancellation, progress, dependency keys and memory guard |
| 7 — Derived isosurface workflow | Planned | CPU/VTK extraction, smoothing, displayed mesh | First-class result, preview/apply, metrics, lifecycle and Mesh/Geometry handoff |
| 8 — Voxelization and signed-distance workflow | Planned | VTK mesh distance field, signed option, auto bounds | Occupancy, sign confidence, SDF operations, provenance and round-trip validation |
| 9 — Transfer functions and volume rendering | Planned | Grayscale slices, opacity and windowing | MIP/MinIP/average/DVR, editable color/opacity transfer functions and ray controls |
| 10 — Volume analysis results | Complete | Revision-safe shared result history, managed derivative fields, quantitative regions, critical points and iso statistics | — |
| 11 — Masks, labels and segmentation | Complete | Typed categorical masks/labels, thresholding, connectivity, morphology, editable metadata and reversible previews | — |
| 12 — Scientific import and export | Complete | RAW+metadata, NPY and VTI staged adapters, metadata preview, guarded import and atomic desktop export | — |
| 13 — Volume comparison and difference | Planned | Generic Compare infrastructure for other modules | Alignment policy, A/B/difference views, norms, correlation and changed-voxel selection |
| 14 — Persistence, history and Workbook round trip | Planned | Partial recipe restore, scene graph and thumbnails | Dense-data policy, undo/redo, derived results, external references and full round trips |
| 15 — Regression matrix and performance gates | Planned | Navigation regression and general memory profiles | Canonical datasets, numerical hashes/tolerances, cancellation and volume budgets |
| 16 — Professional Volume workflow freeze | Planned | Existing module freeze conventions | Final UI contract, docs, screenshots, acceptance command and release evidence |

Progress entries receive a Git hash only after focused tests, typecheck, production build, required E2E/backend checks, and roadmap updates pass.

## Target architecture

```text
Volume definition/source
├── analytic scalar field F(x,y,z)
├── dense sampled scalar/vector grid
├── signed/unsigned distance field
├── binary mask or integer label map
└── imported volume with spatial metadata
            │
            ▼
Canonical Volume object + identity + revision
            │
            ├───────────────┬──────────────────┬─────────────────┐
            ▼               ▼                  ▼                 ▼
       Sampling         Visualization       Analysis       Derived products
       /resampling      slices / DVR        fields/regions  isosurfaces/masks
            │               │                  │                 │
            └───────────────┴──────────────────┴─────────────────┘
                                    │
                                    ▼
                         worker/cache/result lifecycle
                                    │
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
               Inspector/history             Module handoff
                                               Mesh/Geometry
```

The React workspace should hold identities, parameters, lightweight summaries, and view state. Large typed arrays and expensive derived products belong in managed data/result stores with explicit ownership and disposal.

## Canonical contracts

Commit 2 should extend shared dataset and result infrastructure rather than create an unrelated second store.

```ts
type VolumeRepresentation =
  | "analytic-field"
  | "dense-grid"
  | "vector-grid"
  | "signed-distance-field"
  | "unsigned-distance-field"
  | "binary-mask"
  | "label-map"
  | "imported-volume";

type VolumeScalarType =
  | "uint8"
  | "int16"
  | "uint16"
  | "int32"
  | "float32"
  | "float64";

type VolumeSpatialMetadata = {
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  direction: [number, number, number, number, number, number, number, number, number];
  centering: "point" | "cell";
  axisLabels: [string, string, string];
  spatialUnit: string | null;
};

type VolumeObject = {
  id: string;
  revision: number;
  name: string;
  representation: VolumeRepresentation;
  source: VolumeSource;
  spatial: VolumeSpatialMetadata;
  scalarType: VolumeScalarType;
  components: number;
  componentNames: string[];
  valueUnit: string | null;
  valueRange: [number, number] | null;
  transform: number[];
  storage: VolumeStorageRef;
  derivedResultIds: string[];
  provenance: VolumeProvenance;
};
```

Every result records the Volume ID and revision, parameters, engine, method, units, timing, warnings, dependency revisions, cache state, and payload. Results from an obsolete revision become stale; they are never silently presented as current.

## Sampling and numerical conventions to freeze

- Array order is `x + nx * (y + ny * z)` unless a conversion layer explicitly records a different source order.
- Spatial coordinates use `p(i,j,k) = origin + direction · (spacing ⊙ indexOffset)`, where `indexOffset` depends on point- versus cell-centered data.
- Spacing must be finite and strictly positive. Direction must be finite and nonsingular; orthonormal direction is preferred but imported affine metadata must not be silently discarded.
- Trilinear interpolation is the default continuous probe for scalar grids. Nearest-neighbor is mandatory for labels. Cubic interpolation may be added only with boundary behavior and overshoot documented.
- Finite differences use physical spacing, one-sided stencils at boundaries, and explicit validity masks for non-finite samples.
- SDF sign and units are meaningful only when provenance identifies the sign method and source surface validity. An unsigned distance field must never be labeled signed.
- Iso extraction uses the same physical transform as slices. Vertex/face counts are not stable across algorithm changes unless the algorithm/version is included in the regression key.
- Label maps are integer categorical data. Interpolation, filtering, difference metrics, and rendering must preserve that distinction.
- NaN, positive infinity, negative infinity, missing samples, and out-of-domain probes have explicit policies and diagnostics.

## UI responsibility target

```text
Volume
├── Panel: Scene | Object | View | Analysis | Services | Theory
├── Actions: Gallery | New | Demo | Compare | More
└── Tools: Sample | Slice | Render | Analyze | Segment | Export

left   = source, grid, sampling, operation parameters and result catalog
center = slices/3-D view, crosshair, crop, overlays and interaction
right  = Volume/Slice/Render/Analysis/Probe/History inspection
```

The primary Inspector must never show `Mesh Details` for the selected Volume. Its default object card should report representation, source, domain, dimensions, sample count, scalar type, spacing, value range, units, memory, revision, and current iso value. Derived mesh statistics belong under a separate `Derived Surfaces` section.

## Commit 1 — Professional workspace, Inspector semantics and slice sizing

Planned message: `fix(volume): establish volume-first workspace and inspector semantics`

**Status: complete (2026-09-13, `7fce781`).**

Delivered:

- Volume entry and source changes select the active Volume dataset semantically.
- The right panel now exposes Volume Details, Field, Sampling, Slice, Derived Surfaces, Diagnostics, and History without a primary Mesh Details card.
- The default Volume card reports identity, representation, source, physical domain, dimensions, sample count, scalar type, spacing, range, units, payload, revision, view, and current isovalue.
- Orthogonal views use a balanced responsive grid with a fourth live overview tile; pane labels stay anchored to their own viewport.
- Slice viewers expose loading, empty, invalid-grid, unsupported-size, VTK-failure/CPU-fallback, and ready states.
- The focused E2E test verifies Volume ownership, panel content, derived-surface empty state, and valid XY/XZ/YZ bounds across ten alternating resizes.

Existing foundation:

- Distinct Volume navigation and breadcrumb.
- Modern preset gallery plus preserved detailed controls.
- Three slice panes and a free-camera 3-D view.

Implementation:

- Make the selected `VolumeObject` the default semantic selection on entry and after preset/source changes.
- Replace mesh-first Inspector content with Volume Details, Field, Sampling, Slice, Derived Surfaces, Diagnostics, and History sections.
- Move mesh vertex/face/watertight statistics into the derived-isosurface section only.
- Give every slice pane a measured content box; fit the physical plane aspect ratio without unused lower regions or clipped contours.
- Add explicit loading, empty, invalid-grid, backend-failure, and unsupported-size states.
- Keep pane labels and orientation markers pinned consistently during resize.
- Verify left/right sidebar resizing, L1–L4 layouts, desktop, laptop, tablet, phone landscape, and device-pixel-ratio changes.
- Keep the detailed compatibility controls until the professional controls pass parity.

Acceptance:

- Entering Volume cannot expose a Surface breadcrumb or primary Mesh Details card.
- XY/XZ/YZ canvas bounds use the available pane space and remain valid after ten sidebar/layout resizes.
- Derived mesh statistics appear only when an isosurface result exists.
- E2E covers Volume entry, Inspector identity, empty/error states, panel ordering, and responsive slice geometry.

## Commit 2 — Canonical Volume object, revision and provenance

Planned message: `refactor(volume): introduce canonical volume object and provenance contract`

**Status: complete (2026-09-13, `20bec9e`).**

Delivered:

- Added representation-aware `VolumeObject`, `VolumeSpatialMetadata`, `VolumeSource`, `VolumeStorageRef`, `VolumeProvenance`, dependency, and derived-result contracts.
- Added adapters for analytic presets, custom scalar fields, dense/imported grids, vector grids, and VTK distance fields.
- Definition, sampled-grid, and aggregate Volume revisions use separate deterministic fingerprints; one semantic edit advances the aggregate revision once, while view-only replay leaves all revisions unchanged.
- Spatial metadata records dimensions, origin, spacing, direction matrix, point/cell centering, scalar type, components/layout, coordinate system, units, missing-value policy, sample/element counts, and byte size.
- Typed arrays are bound to deterministic handles in a managed in-memory store with owner replacement, explicit release, and full cleanup; serialized workspace state retains the canonical handle and summary, not the payload.
- Scene nodes, unified selection, status bar, workbook dataset references, Volume Inspector, vector overlays, and isosurface records now consume canonical identity and provenance.
- Derived isosurface records retain their source revision and parameters; source or parameter changes keep the previous record visibly stale until explicit deletion.
- Volume unit tests cover every adapter, exact revision behavior, oriented spatial-metadata serialization, managed storage round trips/release, and derived-result stale/detach/delete transitions.

Where to see Commit 2 in the UI:

1. Select **Volume** in the top module bar. The breadcrumb remains Volume-owned and the right panel opens the Volume Inspector.
2. Open **Volume Details** in the right Inspector to see canonical identity, representation, source, dimensions, scalar type, payload size, and the separate `Volume / definition / grid` revision counters.
3. Open **Sampling** to inspect origin, spacing, storage layout, point/cell centering, direction matrix, and the managed storage handle.
4. Open **Diagnostics** to inspect the producing engine/version, missing-value policy, dependency count, and backend state; open **History** to see the canonical object key, timestamps, derived-result count, and retained-stale count.
5. In the left panel, scroll below the preset gallery to **Detailed Volume controls**, find **Isosurface**, and enable **Show**. Then open **Derived Surfaces** in the right Inspector to see the current result and its source/grid revisions.
6. Change the iso slider or one sampling dimension. **Derived Surfaces** keeps the superseded result marked `stale` beside the new current result; it remains inspectable until **Delete** is pressed.
7. The bottom status bar also reports the active canonical Volume revision, grid revision, scalar type, and payload size. Switching only between **Slices** and **3D** leaves those revisions unchanged.

Implementation:

- Introduce representation-aware `VolumeObject`, `VolumeSpatialMetadata`, `VolumeSource`, `VolumeStorageRef`, and `VolumeProvenance` contracts.
- Migrate analytic presets, custom fields, dense grids, vector grids, and VTK distance results through adapters.
- Separate the analytic definition from its sampled-grid revision and both from derived isosurfaces.
- Add stable IDs, source revision, dependency revisions, created/updated timestamps, engine/version, and stale-state rules.
- Record point/cell centering, scalar type, components, direction matrix, units, missing-value policy, and byte size.
- Add a managed in-memory store for typed arrays with deterministic release; React/local storage keeps only handles and summaries.
- Update scene nodes, unified selection, status bar, and Inspector to use canonical identities.

Acceptance:

- Changing definition, domain, sampling, or imported data advances the correct revision exactly once.
- View-only changes do not invalidate data or analysis.
- Old derived results become visibly stale and remain inspectable until deleted.
- Unit tests cover all representation adapters and spatial metadata round trips.

## Commit 3 — Synchronized orthogonal navigation and professional probe

Planned message: `feat(volume): complete synchronized orthogonal navigation and probing`

**Status: complete (2026-09-13, `763e50b`).**

Delivered:

- Added direction-aware index/world transforms for anisotropic spacing, non-zero origins, non-cubic grids, and row-major direction matrices; slices, picking, gradients, bounds, and camera framing share the same physical transform.
- Slice panes support pointer drag, wheel stepping, modifier/Page-key coarse stepping, Arrow-key stepping, Home-to-center, linked navigation, independent unlinked slice positions, and optional voxel-center snapping.
- Scientific and radiological view conventions have explicit selectors, camera-side behavior, and unambiguous positive/negative orientation labels on every orthogonal pane.
- The Slice Inspector reports continuous `(i,j,k)`, nearest voxel, world `(x,y,z)`, component values, full gradient and magnitude, analytic versus numerical method, slice coordinates, pane positions, and domain status.
- Sphere, ellipsoid, torus, cylinder, superquadric, gyroid, and metaball presets expose analytic gradients; custom/noise/imported grids use direction- and spacing-aware finite differences with one-sided boundary stencils.
- Probes can be named, pinned against a Volume/grid revision, replayed, copied, selected in pairs for comparison, exported to CSV, deleted, serialized, and restored. Source changes retain them with a visible stale-revision state.
- Added accessible pane labels, focusable keyboard navigation, and a polite live announcement for navigation and probe lifecycle changes.
- Unit truth tests cover translated, anisotropic, rotated grids, numerical/analytic gradients, revision-safe probe restore, comparison, and export; E2E covers wheel, drag, keyboard, linked/unlinked state, reset, pinning, comparison, orientation, and stale retention.

Where to see Commit 3 in the UI:

1. Select **Volume**, keep **Slices** active, and use any XY/XZ/YZ pane: drag to move the shared probe, use the wheel or Arrow keys for one slice, Shift+wheel or Page Up/Down for the configured coarse step, and Home to reset.
2. In the right **Inspector**, open **Slice**. Navigation controls, full probe values, gradient method, pane positions, announcements, and the pinned-probe workflow are together in this card.
3. Clear **Link orthogonal panes** to move one pane independently, or clear **Snap probe to voxel center** for continuous in-plane coordinates.
4. Pin two named probes and select **Compare** on both to see physical distance and value/gradient deltas. Change the Volume definition or sampling to see retained probes labeled **stale revision**.

Existing foundation:

- Shared three-index crosshair, click-to-place, world conversion, trilinear sample, gradient magnitude, and slice hover.

Implementation:

- Add crosshair drag and wheel stepping on each pane; modifier-wheel performs a configurable coarse jump.
- Add linked/unlinked pane navigation, voxel-center snapping, and reset-to-center.
- Display `(i,j,k)`, world `(x,y,z)`, component values, `|∇F|`, slice coordinate, and inside/outside-domain state.
- Freeze axis orientation and radiological/scientific display conventions; show unambiguous positive-axis labels.
- Add keyboard navigation and accessible announcements.
- Allow probes to be pinned, named, compared, replayed, copied, exported, and restored against a Volume revision.
- For analytic fields, expose exact/analytic gradient where available and label numerical fallback explicitly.

Acceptance:

- A pick in any pane updates the other two panes to the same physical point.
- Anisotropic spacing, non-zero origin, direction matrices, and non-cubic grids pass truth tests.
- Linked/unlinked, wheel, drag, keyboard, and probe persistence are covered by E2E.

## Commit 4 — Sampling, resampling and allocation planning

Planned message: `feat(volume): add controlled sampling resampling and allocation planning`

**Status: complete (2026-09-13, `30662c7`).**

Delivered:

- Added `32³`, `64³`, `128³`, `256³`, and Custom sampling choices while retaining independent X/Y/Z dimensions.
- Added point- and cell-centered spacing conventions, nearest/linear/cubic resampling, clamp/zero/mirror boundary policies, and optional isotropic-spacing locking.
- Sampling controls now edit a draft recipe. The current Volume and its revision remain unchanged until Apply succeeds; a rejected allocation or resampling failure preserves the current grid.
- Added a pre-allocation plan with exact sample/element counts, scalar/component metadata, CPU/GPU byte estimates, execution path, and centralized warning policy.
- Added resample-to-spacing, resample-to-dimensions/Apply, crop-to-current-box, reset-bounds, and restore-original-grid operations.
- Added explicit finite/non-finite/missing sample reporting with affected index bounds.
- Workspace recipes preserve draft/applied sampling and policy state without embedding dense arrays.
- Added deterministic tests for byte estimates, centering conventions, analytic sphere/ellipsoid values, linear-field resampling bounds, and non-finite diagnostics.

Where in the UI:

- Open **Volume**, then use the preserved detailed controls below the preset gallery.
- In **Volume grid**, choose a cubic dimension preset or edit `Nx`, `Ny`, and `Nz` independently.
- The centering, interpolation, boundary, isotropic-lock, and allocation-plan controls are immediately below the dimensions.
- Edit the sampling box and confirm the amber draft message, then choose **Apply sampling** or **Crop to current box**. The green state confirms the live grid was replaced.
- Use **Resample to spacing** for physical target spacing and **Restore original grid** to return to the source grid.

Existing foundation:

- Dimensions, physical bounds, spacing, crop controls, analytic/custom samplers, and `Float32Array` grids.

Implementation:

- Add `32³`, `64³`, `128³`, `256³`, and Custom dimension presets with independent axes.
- Add point/cell centering, nearest/linear/cubic interpolation choices, boundary mode, and optional isotropic-spacing lock.
- Distinguish changing a sampling recipe from applying a sampled-grid result.
- Before allocation, show sample count, scalar type, component count, estimated CPU/GPU bytes, worker/backend path, and warning level.
- Centralize hard/soft dimension and memory limits; remove inconsistent limits between sampling helpers and preset builders.
- Add resample-to-spacing, resample-to-dimensions, crop-to-current-box, and restore-original-grid operations.
- Validate non-finite samples and publish counts/bounds rather than silently coercing scientific data.

Acceptance:

- Estimates match allocated bytes for every supported scalar type/component count.
- Cancelled or rejected allocations do not replace the current Volume.
- Analytic sphere/ellipsoid values and resampled bounds pass deterministic numerical tests.

## Commit 5 — Quad layout and 3-D spatial context

Planned message: `feat(volume): add quad slice and spatial 3d workspace layouts`

**Status: complete (2026-09-13, `6643f0a`).**

Delivered:

- Added Quad, Slices, 3D, XY, XZ, and YZ layouts; Quad is the professional default.
- Replaced the former text-only overview tile with a live free-camera 3-D spatial context containing the active XY/XZ/YZ planes, physical crosshair and probe marker, crop box/gizmo, streamlines, and current isosurface.
- Each pane can be focused/maximized and restored without changing the underlying Volume revision.
- Added independent XY/XZ/YZ plane visibility, crop clipping, Fit volume, Fit crop, and deterministic camera reset controls.
- The three spatial planes share one 3-D scene. Plane textures, geometries, clipping state, controls, animation frames, and WebGL resources are explicitly disposed when the dataset or layout changes.
- Workspace recipes preserve the layout, focused pane, plane visibility, clipping choice, and camera position/target/up independently of sampled-grid revisions.
- Extended the desktop regression to exercise all six layouts, alternating resizes, focus/restore, plane visibility, camera actions, non-zero pane bounds, and revision stability.
- Stabilized the spatial camera after delivery: each newly selected dataset or extracted isosurface is framed once with a full-object safety margin, restored/user camera states remain authoritative, echoed Orbit state is ignored, and intersecting transparent slice planes use deterministic draw order to prevent flicker while rotating.

Where in the UI:

- Open **Volume** and scroll to **View** in the detailed controls beneath the gallery.
- Choose **Quad** to see XY, XZ, YZ, and the live **3-D spatial context** together; choose Slices, 3D, XY, XZ, or YZ for dedicated layouts.
- Use **Focus** in the upper-right of any pane to maximize it and **Restore** to return to the selected layout.
- The **3-D spatial context** card contains the three plane-visibility switches, **Clip to crop**, **Fit volume**, **Fit crop**, and **Reset 3D camera**.

Implementation:

- Add layout presets: Quad, Slices, 3D, XY, XZ, and YZ.
- Make Quad the professional default: XY, XZ, YZ, and 3-D spatial context.
- Display the three active slice planes, crop box, crosshair, probe, and derived isosurface in the 3-D pane.
- Add plane visibility, clipping, focus/maximize, fit-volume, fit-crop, and camera reset.
- Share render resources where practical instead of creating redundant full scenes for every slice pane.
- Persist layout and camera state without treating camera changes as Volume-data revisions.

Acceptance:

- All layouts survive resize and restore with no zero-size canvas or clipped pane.
- Plane/crosshair positions agree across 2-D and 3-D views under anisotropic spacing.
- Camera drag/zoom remains stable without parent-state snap-back, and changing Volume presets leaves the complete grid or derived isosurface visible.
- GPU resources are disposed when layouts or datasets change; memory profile shows no monotonic leak.

### Post-Commit 5 gallery presentation update

**Status: complete (2026-09-13, `d0cf527`).**

- Added dedicated rendered thumbnails for all nine Volume presets: Sphere, Ellipsoid, Torus, Cylinder, Superquadric, Gyroid, Metaballs, Noise field, and Mandelbulb density.
- Every Rendered card now uses an authentic capture from the live Volume 3-D isosurface workspace. Volume no longer borrows similarly named Surface images or falls back to sketch-style SVGs in Rendered mode.
- Preserved **Diagram** as the explicit technical alternate view rather than mixing diagrams into the Rendered gallery.
- Added the reproducible `npm run capture:gallery:volume` capture workflow and a per-gallery manifest under `gallery-images/captured/volume/`.
- Added E2E coverage that verifies all nine gallery cards resolve to loadable Volume capture assets.

Where in the UI:

1. Select **Volume** in the top module bar. The module opens in **Gallery** mode.
2. Keep **Rendered** selected above the card grid to see the nine live 3-D isosurface captures.
3. Select **Diagram** only when a schematic/formula-oriented thumbnail is preferred.

## Commit 6 — Worker, cache, cancellation and memory foundation

Planned message: `perf(volume): add revision-safe workers cache and memory guards`

**Status: complete (2026-09-13, `3cf4f5a`).**

Delivered:

- Added one typed worker protocol for field sampling, slicing, resampling, histograms, gradient volumes, marching cubes, mesh voxelization, distance transforms, and connected components.
- Added queued, running, progressive, complete, cancelled, stale, and failed lifecycle handling with progress callbacks, cancellation, timeouts, retryable errors, and injected-failure recovery.
- Added revision and latest-request guards so superseded responses cannot replace the last valid artifact.
- Added deterministic cache keys over Volume identity/revision, operation, parameters, algorithm/backend version, and dependency revisions, plus bounded LRU accounting and cache-hit profiles.
- Added pre-transfer soft/hard memory enforcement, transferable typed-array payloads, and 64³ brick/halo contracts for large computations.
- Added wall-time, peak-working-set, transferred-byte, backend, and cache-hit diagnostics, including deterministic 128³ and 256³ allocation profiles.
- Added a native module worker and retained the existing reviewed CPU/VTK routes as explicit backend choices.

Where in the UI:

1. Select **Volume**, open the right **Inspector**, then choose **Diagnostics**.
2. The card shows the selected compute backend, lifecycle, operation, progress, guarded peak allocation, cache totals, and brick contract when the current job needs one.
3. The detailed controls remain available below the Volume gallery; selecting a larger sampling recipe updates the guarded allocation before work is submitted.

Implementation:

- Define shared jobs for `sampleField`, `sliceVolume`, `resampleVolume`, `histogram`, `gradientVolume`, `marchingCubes`, `voxelizeMesh`, `distanceTransform`, and `connectedComponents`.
- Use the common lifecycle: queued, running, progressive, complete, cancelled, stale, failed.
- Add progress, cancellation, timeouts, failure recovery, backend diagnostics, and request/revision guards.
- Cache by Volume ID/revision, operation, parameters, algorithm/backend version, and dependencies.
- Enforce soft memory warnings and hard allocation limits before transfer or worker execution.
- Prefer transferable buffers; introduce chunked/bricked storage contracts for data that should not be duplicated contiguously.
- Retain reviewed CPU fallbacks for small deterministic jobs and make backend choice visible.

Acceptance:

- Stale worker responses cannot overwrite newer Volume revisions.
- Cancellation and injected failure preserve the last valid result and recover without reload.
- `128³` and `256³` profiles record wall time, peak working set, transferred bytes, and cache behavior.

## Commit 7 — First-class isosurface result and Mesh/Geometry handoff

Planned message: `feat(volume): promote isosurfaces to provenance-linked derived results`

**Status: complete (2026-09-13).**

Delivered:

- Separated the continuously updated viewport preview from explicit **Apply full isosurface** execution through the revision-safe Volume worker.
- Published mesh-bearing isosurface records with source Volume/grid revisions, iso value, input transform, algorithm/backend version, timings, memory/transfer profile, warnings, and grid correspondence identity.
- Added gradient-derived normals for analytic and sampled fields with a documented face-average fallback when a gradient is undefined.
- Added vertices, faces, bounds, connected components, boundary/non-manifold edges, surface area, enclosed volume, and watertight diagnostics.
- Added regenerate, bake snapshot, detach, delete, Send to Mesh, Send to Geometry, and Open in Mesh Analysis actions. Baked snapshots retain independent geometry and ignore later source revisions.
- Added a Volume-derived `SurfaceMesh` source contract so Mesh and Geometry retain the originating Volume ID/revision, sampled-grid revision, iso value, algorithm, backend, and correspondence ID.
- Added camera and nearest-selection transfer into Mesh Analysis plus **Return to Volume source** navigation that restores the Volume layout, focused pane, crosshair, camera, and gallery/work mode.
- Added sphere, ellipsoid, torus, gyroid, and signed-distance fixtures for bounds, topology, area/volume and watertight tolerances, together with an Electron Apply → Mesh Analysis → Return regression.

Where in the UI:

1. Select **Volume**, show an isosurface, and use **Apply full isosurface** in the detailed **Isosurface** controls. The nearby lifecycle label distinguishes the live preview from the applied full result.
2. In the right **Inspector**, choose **Derived Surfaces** to inspect mesh counts, topology, area, enclosed volume, watertight status, normal method, timing, transfer size, warnings, and source revisions.
3. Use **Regenerate**, **Bake snapshot**, **Detach**, or **Delete** on an individual result.
4. Use **Send to Mesh**, **Send to Geometry**, or **Open in Mesh Analysis**. Mesh Analysis shows **Return to Volume source** in its context strip.

Existing foundation:

- CPU marching cubes, VTK extraction for larger grids, optional smoothing, iso controls, and displayed meshes.

Implementation:

- Publish an isosurface as a revision-bound derived result with algorithm, backend, iso value, input transform, timings, warnings, and correspondence metadata.
- Separate low-resolution live preview from explicit full-resolution Apply.
- Compute gradient-derived normals where valid and document fallback normals.
- Report vertices, faces, bounds, connected components, boundary/non-manifold counts, area, enclosed volume when valid, and watertight status.
- Add live, snapshot/bake, regenerate, detach, delete, and stale lifecycle actions.
- Add `Send to Mesh`, `Send to Geometry`, and `Open in Mesh Analysis` with source-return navigation.
- Keep optional Surface Nets, Dual Contouring, and Flying Edges as later algorithms behind the same result contract.

Acceptance:

- Sphere, ellipsoid, torus, gyroid, and SDF fixtures meet bounds/topology/area tolerances.
- Handoffs preserve source Volume ID/revision, iso value, camera, selection, and algorithm provenance.
- Editing the source Volume marks the derived surface stale but does not mutate a baked snapshot.

## Commit 8 — Mesh/Geometry voxelization and signed-distance workflow

Planned message: `feat(volume): complete voxelization signed-distance and sdf operations`

**Status: complete.** Implemented in `renderer/src/volume/sdf.ts`, the canonical Volume/SDF contracts and adapters, the Volume Inspector SDF workspace, and deterministic Volume unit/Electron coverage.

Delivered:

- Added explicit occupancy, unsigned-distance, and signed-distance outputs with shared sampling metadata and source-aware Volume objects.
- Added welded-edge closedness/non-manifold validation, oriented-volume checks, sign confidence, and a hard guard that prevents an open or invalid mesh from silently producing a reliable signed field.
- Added deterministic union, intersection, subtraction, offset, shell, smooth union, and signed-distance reinitialization operations.
- Added a non-destructive preview/apply/discard workflow. Boolean previews sample the current analytic preset as a second operand and preserve every source in multi-source provenance.
- Preserved source module/object IDs, revisions, transforms, units, sampling recipe, backend/version, parameters, warnings, and sign diagnostics on distance and SDF-derived datasets.
- Added round-trip tests for closed/open mesh sign classification, SDF truth cases, reinitialization, iso-zero extraction bounds/volume, and exact multi-source sampling/provenance.

Where in the UI:

1. From a Surface or Mesh, open **Analysis → Surface → Volume**, choose signed or unsigned distance, and use **Surface → Volume (distance)**.
2. In Volume, open the right **Inspector → SDF** tab to inspect output type, backend, source revisions, sampling, watertightness, orientation, boundary/non-manifold edges, and sign confidence.
3. Choose an SDF operation and use **Preview**, then **Apply** or **Discard preview**. The spatial isosurface updates without overwriting the applied source until Apply.

Existing foundation:

- VTK mesh distance job, signed/unsigned option, winding-number request, automatic bounds, and Geometry/Mesh entry points.

Implementation:

- Add occupancy voxelization and explicit unsigned/signed distance outputs.
- Validate closedness/orientation prerequisites and publish sign-confidence/winding diagnostics.
- Preserve source object IDs, revisions, transforms, units, sampling recipe, backend, and warnings.
- Add SDF union, intersection, subtraction, offset, shell, smooth union, and reinitialization under a non-destructive preview/apply workflow.
- Add Surface/Geometry-to-Volume sampling adapters and multi-source provenance.
- Provide deterministic round trip: source mesh → SDF → iso 0 → derived mesh → compare with source.

Acceptance:

- Closed canonical meshes have the expected sign at known interior/exterior probes.
- Open/non-manifold inputs cannot silently claim a reliable signed field.
- Boolean and offset truth cases meet Hausdorff/bounds/volume tolerances after extraction.

## Commit 9 — Transfer functions and true volume rendering

Planned message: `feat(volume): add transfer functions and direct volume rendering`

**Status: complete.** Implemented in `renderer/src/volume/transferFunction.ts`, the WebGL2/CPU rendering paths in `VolumeViewer`, the Volume Inspector Rendering workspace, and deterministic unit/Electron regression coverage.

Delivered:

- Added Slice, Isosurface, MIP, MinIP, Average, and front-to-back DVR modes. The direct modes ray march a normalized 3-D texture and coexist with embedded orthogonal slice planes.
- Added deterministic Grayscale, Fire, Cool-to-warm, and Signed-distance transfer presets plus editable color and opacity control points with exact normalized serialization/restoration.
- Added normalized window low/high controls, scalar-component identity, gradient opacity, gradient shading, early ray termination, and crop-volume clipping.
- Added nearest/linear texture sampling, Fast/Balanced/Full ray-step presets, and automatic interaction LOD while orbiting the camera.
- Added WebGL2 and maximum-3-D-texture capability checks, a reviewed 128 MB upload budget, direct/bricked upload plans, and deterministic CPU projection fallback instead of a blank viewport.
- Added context-loss reporting and automatic resource recreation after context restoration. Runtime status identifies ready, fallback, unsupported, and context-lost states.
- Added stable CPU projection baselines for MIP, MinIP, Average, and DVR; transfer-function round-trip tests; GPU-plan tests; and an Electron WebGL shader/error regression.

Where in the UI:

1. Open **Volume → Inspector → Rendering** and choose **Slice**, **Isosurface**, **MIP**, **MinIP**, **Average**, or **DVR**.
2. Select a transfer preset, edit its color/opacity points, set normalized window bounds, and choose rendering quality and nearest/linear sampling.
3. Enable gradient opacity or gradient shading for DVR. The status card reports the active GPU/CPU path and recovery/fallback state.

Implementation:

- Add Slice, Isosurface, MIP, MinIP, Average, and DVR render modes.
- Add editable scalar-to-color and scalar-to-opacity transfer functions with deterministic presets.
- Support component selection, window/level, gradient opacity, gradient shading, early ray termination, clipping, and embedded slice planes.
- Add nearest/linear texture sampling, step size, quality presets, interaction LOD, and GPU capability checks.
- Use bricked/streamed upload when the full volume exceeds reviewed GPU budgets.
- Provide a CPU/2-D fallback and explicit unsupported state instead of a blank viewport.

Acceptance:

- Canonical rendered images have stable perceptual baselines across reviewed GPU paths.
- Interaction remains responsive at the declared target sizes and recovers after context loss.
- Transfer functions round-trip with exact control points and component selection.

## Commit 10 — Volume analysis, derived fields and measurements

Planned message: `feat(volume): add revision-safe volume analysis results`

**Status: complete.** Implemented in `renderer/src/volume/analysis.ts`, the Volume Inspector Analysis workspace, managed field storage, and analytic numerical/result-lifecycle tests.

Existing foundation:

- Slice min/max/mean/std/histogram, percentile windowing, trilinear probes, and gradient magnitude.

Implementation:

- Publish Volume and slice statistics, histograms, percentiles, finite/missing counts, and component correlations.
- Add gradient vector, gradient magnitude, Hessian, Laplacian, threshold regions, critical-point candidates, and iso-value statistics.
- Add region volume, centroid, bounds, surface contact, connected-component statistics, and slice/ROI measurements.
- For analytic fields, preserve exact/analytic derivatives when available; label sampled finite differences and stencil order.
- Reuse the shared analysis request/result store, saved-result lifecycle, provenance, compare, replay, export, and stale states.
- Add overlays for derived scalar/vector fields without coupling visibility changes to recomputation.

Acceptance:

- Polynomial, sphere-SDF, Gaussian, ramp, and constant-field fixtures satisfy analytic tolerances.
- Boundary/non-finite masks and physical units are correct.
- Result history can compare methods and revisions without duplicating large arrays into UI state.

## Commit 11 — Masks, labels and segmentation operations

Planned message: `feat(volume): add masks labels and segmentation workflows`

**Status: complete.** Implemented in `renderer/src/volume/segmentation.ts`, the Volume Inspector Masks & Labels workspace, and deterministic connectivity, morphology, categorical persistence, and undo/redo tests.

Implementation:

- Add typed binary-mask and integer label-map representations with categorical rendering/interpolation rules.
- Add threshold, range threshold, invert, union, intersection, subtraction, connected components, and flood fill.
- Add dilate, erode, open, close, fill holes, distance transform, and remove-small-components.
- Provide non-destructive preview/apply, ROI restriction, undo/redo, cancellation, and result provenance.
- Add label palette, visibility/lock controls, per-label statistics, merge/split/relabel, and boundary-to-mesh extraction.
- Keep the scope general mathematical/scientific volume processing; medical workflow specialization is optional and later.

Acceptance:

- Binary morphology and connectivity match deterministic 6/18/26-neighborhood truth cases.
- Label IDs survive save/load/export exactly and never pass through interpolating resamplers.
- Undo/redo restores both label data and metadata without leaking buffers.

## Commit 12 — Scientific Volume import and export

Planned message: `feat(volume): add scientific volume import and export`

**Status: complete.** Implemented in `renderer/src/volume/scientificIO.ts`, the Volume Inspector Import / Export workspace, and the atomic desktop `volumeFiles` bridge with golden round-trip and malformed-input tests.

Staging:

1. RAW plus explicit metadata sidecar, NPY, and VTI.
2. NRRD and NIfTI, including orientation/affine handling.
3. Optional MHD/MHA and HDF5 adapters.
4. Optional DICOM series only after a separate privacy/metadata/dependency review.

Implementation:

- Add staged file probing, metadata preview, component/scalar-type selection, orientation confirmation, byte estimate, progress, cancellation, and validation.
- Preserve spacing, origin, direction/affine, units, scalar type, components, labels, and missing-value policy.
- Support selected-volume, derived-field, mask/label, slice-image, histogram/report, and isosurface exports.
- Use atomic output and explicit overwrite confirmation through existing desktop bridges.
- Keep adapters behind the canonical Volume contract so desktop and future web paths share semantics.

Acceptance:

- Golden files round-trip values and spatial metadata within format precision.
- Malformed headers, truncated payloads, endianness mismatch, unsupported compression, and oversized allocation fail safely.
- No file path or dense data is silently persisted into a workspace document contrary to policy.

## Commit 13 — Volume comparison and difference analysis

Planned message: `feat(volume): add aligned volume comparison and difference analysis`

**Status: planned.**

Implementation:

- Add A|B, A|Difference, overlay, checkerboard, and synchronized-probe views.
- Require an explicit alignment policy: exact-grid, world-space resample B→A, common target grid, or reject.
- Compute signed/absolute/relative difference, L1/L2/L∞ norms, RMSE, correlation, changed-voxel count, and thresholded change mask.
- For labels, add confusion matrix, overlap, Dice/Jaccard, and per-label change counts instead of scalar interpolation metrics.
- Preserve independent transfer functions with optional synchronized camera, slices, crosshair, crop, and window.
- Publish comparison as a result with both Volume revisions and resampling provenance.

Acceptance:

- Identity comparisons are numerically zero under exact-grid mode.
- Known offsets/scales and resampling fixtures meet analytic metrics.
- Comparison never silently aligns incompatible grids or categorical labels.

## Commit 14 — Persistence, history and Workbook round trip

Planned message: `feat(volume): complete persistence history and workbook round trips`

**Status: planned.**

Existing foundation:

- Lightweight Volume recipe persistence, scene nodes, workspace navigation, status summaries, and Workbook thumbnails.

Implementation:

- Persist canonical source recipes, spatial metadata, view/layout state, probes, transfer functions, result references, and operation history.
- Persist imported data by approved external reference/content-addressed artifact, never by accidental JSON expansion.
- Restore analytic, imported, distance, mask, label, derived-isosurface, and comparison sessions with missing-artifact diagnostics.
- Add revision-aware undo/redo for source, sampling, SDF, segmentation, and derived-result lifecycle actions.
- Add Workbook blocks for sample, slice, render, analyze, segment, compare, and export with compact previews and replayable parameters.
- Preserve Volume↔Mesh/Geometry source return, camera, selection, and provenance through save/load.

Acceptance:

- Golden workspaces round-trip all supported Volume representations and lightweight state.
- Missing or moved external artifacts produce recoverable relink UI.
- Undo/redo and Workbook replay cannot resurrect disposed arrays without a valid storage reference.

## Commit 15 — Canonical datasets, regression matrix and performance gates

Planned message: `test(volume): add canonical regression and performance gates`

**Status: planned.**

Deterministic matrix:

```text
analytic: sphere, ellipsoid, torus, gyroid, metaballs, Gaussian, ramp, constant
sdf: sphere, box, union, intersection, subtraction, offset, open-mesh warning
voxel: checker, impulse, two components, anisotropic grid, non-zero origin, rotated direction
labels: two labels, touching labels, disconnected labels, sparse IDs
pathological: NaN/Inf, empty, 1×N×N, zero range, invalid spacing, truncated import
stress: 128³, 256³, reviewed chunked/bricked case
```

Freeze:

- sample values and interpolation;
- histogram bins and percentiles;
- slice hashes and orientation;
- gradient/Hessian/Laplacian tolerances;
- isosurface bounds, topology summaries, area/volume ranges, and algorithm version;
- SDF sign probes and Boolean/offset metrics;
- mask/label connectivity and morphology;
- persistence/import/export round trips;
- cancellation, stale-result rejection, memory limits, buffer disposal, and backend fallback;
- desktop/tablet/phone layouts, keyboard/touch paths, and accessibility semantics.

Add maintained commands for Volume unit, E2E, backend, performance, screenshot, and aggregate acceptance suites.

Acceptance:

- No unexplained long-lived memory growth across repeated dataset, layout, worker, render-mode, and module transitions.
- Performance budgets list fixture, hardware class, backend, cold/warm cache, median, p95, and peak working set.
- Failures produce actionable diagnostics and artifacts.

## Commit 16 — Professional Volume workflow freeze

Planned message: `docs(volume): freeze professional volume workflow and acceptance evidence`

**Status: planned.**

Implementation:

- Remove or collapse compatibility controls only after parity tests demonstrate replacement coverage.
- Freeze module ownership, canonical contracts, numerical conventions, top-bar actions, panel responsibilities, Inspector semantics, layouts, handoffs, persistence, and backend fallback policy.
- Write the Volume v1 workflow guide, UI location guide, backend matrix, known limitations, and troubleshooting notes.
- Capture reviewed desktop, tablet, and phone screenshots for Gallery, Quad, 3-D render, Analysis, Segmentation, Compare, and derived-isosurface handoff.
- Record exact commit hashes, commands, fixture versions, tolerances, timings, peak memory, and produced artifacts.
- Add `test:volume:v1:acceptance` and make it the release gate.

Exit criteria:

- Scalar fields, vector fields, SDFs, masks, labels, and imported grids have correct Volume-first identity and Inspector semantics.
- All required slice, 3-D, analysis, segmentation, rendering, handoff, comparison, persistence, and export journeys pass.
- CPU/worker/VTK/GPU paths and limitations are explicit; missing optional backends degrade honestly.
- The compatibility Volume panel can be retired without removing a reachable capability.
- The roadmap progress table and a separate Volume v1 freeze document contain reproducible evidence.

## Delivery order and dependencies

```text
Commit 1  visible correctness and layout
    │
    ▼
Commit 2  canonical identity/revision/provenance
    │
    ├──▶ Commit 3  navigation/probe
    ├──▶ Commit 4  sampling/resampling
    └──▶ Commit 5  quad/3-D spatial context
                 │
                 ▼
Commit 6  workers/cache/memory
    │
    ├──▶ Commit 7  isosurfaces/handoff
    ├──▶ Commit 8  voxelization/SDF
    ├──▶ Commit 9  volume rendering
    ├──▶ Commit 10 analysis
    └──▶ Commit 11 masks/labels
                 │
                 ▼
Commit 12 I/O ──▶ Commit 13 compare ──▶ Commit 14 persistence/history
                                             │
                                             ▼
                                  Commit 15 regression/performance
                                             │
                                             ▼
                                      Commit 16 freeze
```

Commits remain independently reviewable. A later commit may extend a contract introduced earlier, but it must not quietly change established units, indexing, orientation, revision, or ownership rules.

## Validation commands to establish

```text
npm run test:volume:v1:unit
npm run test:volume:v1:e2e
npm run verify:volume:v1:backends
npm run profile:volume:v1
npm run capture:volume:v1:screenshots
npm run test:volume:v1:acceptance
```

Until those commands exist, every Volume commit runs at minimum:

```text
npm run typecheck:noemit
npm run build:core
npx playwright test tests/e2e/workspace-navigation.spec.ts --reporter=list
```

Each commit additionally runs its focused unit/E2E/backend/performance checks. Worker-related commits include failure injection and cancellation. Rendering/layout commits include screenshot and responsive checks. Persistence/I/O commits include golden round trips.

## Main implementation references

- `renderer/src/App.tsx`
- `renderer/src/components/VolumeViewer.tsx`
- `renderer/src/scene/datasets.ts`
- `renderer/src/scene/volume/volumePresets.ts`
- `renderer/src/scene/volume/volumeSampling.ts`
- `renderer/src/scene/volume/sliceVolume.ts`
- `renderer/src/scene/volume/vectorPresets.ts`
- `renderer/src/scene/volume/streamlines.ts`
- `renderer/src/math/marchingCubes.ts`
- `renderer/src/services/vtkVolumeClient.ts`
- `packages/core/src/viewerTypes.ts`
- `packages/core/src/workerContracts.ts`
- `packages/api-client/src/meshBackend.ts`
- `src/main/python/pythonWorker.ts`
- `src/main/ipc/vtkMeshIpc.ts`
- `tests/e2e/workspace-navigation.spec.ts`

## Definition of complete

The Volume module is professionally complete only when it can load or define a Volume, inspect its spatial/data semantics, navigate and probe it correctly, sample/resample safely, visualize it with slices and true volume rendering, publish revision-safe analyses and segmentations, create provenance-linked derived surfaces, round-trip through Mesh/Geometry/Workbook, compare aligned volumes, import/export reviewed scientific formats, recover from worker/backend failures, stay inside declared memory/performance budgets, and reproduce all of that through one maintained acceptance command.
