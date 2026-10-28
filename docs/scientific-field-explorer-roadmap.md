# MATH3D — Scientific Field Explorer, Dataset Runtime & Cross-Module Integration

> **Repository reconciliation, 25 October 2026.** This proposal is retained as a future-facing design plan. Its “current implementation baseline” reflects screenshots and is not a completion audit. The [Graphs field roadmap](graph2d-fields-fitting-fourier-complex-roadmap.md), [3D vector-field contract](graph3d-vector-field-contract.md), and [GRA-17 mapping record](graph2d-gra17-complex-mapping.md) are the status records for existing work. In particular, desktop verified 2D/3D previews, native Project field references, 3D vector glyphs and bounded trajectories, paired 3D complex-field lines, Graphs-to-Complex mapping, and verified relinking of a moved saved 3D complex pair already exist. SCI-01 should audit and tighten their coordinate and unit behavior; SCI-02 and SCI-03 remain the main new architecture work, not a reason to reimplement those delivered slices. SCI-04/05/07/12/18 have partial foundations and require a gap audit against their detailed acceptance criteria. The Android physical-device work and mobile trajectories remain deferred. The immediate critical path is an auditable SCI-01 correctness pass, then a scoped SCI-02/SCI-03 explorer and dataset contract, then the linked-view and regression gates.

### Implementation checkpoint

| Milestone | Delivered desktop slice | Remaining scope |
| --- | --- | --- |
| SCI-01 | Shared regular-grid index/coordinate and finite-domain validation now runs in Graph line previews/imports, saved paired-field validation, vector seeds and trajectories. Unit tests distinguish index 10 from its physical coordinate and reject out-of-range and nonuniform selections. | The `.sscene/v1` source contract supports regular axes only. Coordinate-array support, locale-aware physical-coordinate entry and broader dimensional analysis require separate schema/UI work. |
| SCI-03 | A deterministic immutable dataset link groups verified component references; line, glyph and bounded slice specs bind to its source hash without embedding field values. Existing Project documents reconstruct those links on reopen. Bounded session caches cover verified 3D vector slices and derived Graph lines, saved scalar derivatives and scalar/complex Graph line previews by document generation, source hash, recipe and verified transfer identity. Each lookup follows fresh transfer verification. Newly imported scalar and paired complex Graph rows retain the saved field revision and source hash; an edited, relinked or missing field marks them stale after Project reopen. Graphs can now reopen the saved source, compare stored rows and provenance, and explicitly refresh a scalar line or both complex components in one undoable edit after a second verification. | The caches are not persisted. Earlier unbound Graph rows retain their existing provenance without inferred field revision. A general cross-module dependency graph and remaining module adapters are open. |
| SCI-02 | The 3D vector field has an in-app three-pane Explorer with a layer list, contextual slice Inspector, viewer-focus layout, session retention, and a direct saved-Project entry. Selected layer, physical slice coordinates and layout round-trip with the Project document; values are not persisted. The Explorer dataset library offers five built-in 3D scenes directly and can browse another `.sscene` bundle. It saves a searchable, metadata-only list of scene references in the Project, verifies each source on reopen, and distinguishes missing or changed sources. Scene vector choices switch the active Explorer source; scalar and complex choices render bounded, freshly verified samples in the shared viewer with a route to their detailed controls. A cross-layer physical point survives source switching and Project reopen, shows values from freshly verified bounded samples, and withholds values outside a layer's domain or across incompatible coordinate units. Saved fields remain available after scene close. A raw scalar field can now supply a verified heatmap under vector glyphs on XY/XZ/YZ slices; the saved recipe keeps its source reference, visibility and opacity, and both sources are reverified on Project reopen. A linked line through the shared physical probe compares scalar and vector profiles at the same coordinates and sends them to Graphs as an aligned, atomic pair. Graphs saves physical coordinates, separate units, source references, verified sample hashes and checked point tables; it withholds both plots until both sources reverify on Project reopen. A saved physical rectangle summarizes aligned scalar and vector samples, follows scalar and complex layers, and supports editable physical bounds. Verified complex magnitude or phase can now color XY/XZ/YZ vector slices, preserving probe and rectangle alignment with explicit domain gaps and source hashes. A verified 17×17 scalar or complex rectangle summary can be published as a compact Project result with physical bounds, vector and overlay source references, sample hashes and an analysis relation. Project reopen verifies the full pinned source resources and saved result identity; missing or changed sources are labelled and numerical values are withheld. Current sources allow the saved summary to be viewed, while Explorer can independently recalculate the region. The same verified rectangle can send aligned 17-point column-mean vector and scalar or complex profiles to Graphs, preserving separate units and domain gaps; Graphs checks pinned sources, row hashes and both recomputed series on Project reopen. | Additional combined overlays and broader linked region operations, broader cross-field selection, freely adjustable docks and full screen-reader spoken-output acceptance remain open. |
| SCI-04 | The desktop Explorer shows a 3D domain box and XY/XZ/YZ component or magnitude maps. Slice coordinates use the bounded verified transfer lattice; every scientific preview verifies the bytes it displays from all three components. A saved display clipping box hides arrows and dims slice cells without changing sampled values; saved camera presets provide perspective and XY/XZ/YZ orientations. The 3D glyph view draws a deterministic, at-most-192-position overview during camera interaction and restores the full authored density after idle. Scientific arrows render from a smaller verified transfer before the full bounded lattice arrives. V2 bundles pin contiguous chunk hashes; v3 bundles pin spatial tile hashes so XY/XZ/YZ slices read only the tiles they touch. V1 bundles retain full-file verification. The view reports transfer and chunk/tile coverage provenance. | Other scientific operations still use full-file reads. Advanced clipping shapes and physical-device performance remain open. |
| SCI-05 | The bounded integrator offers persisted RK4 step doubling or Dormand–Prince RK45, with distinct physical-time trajectories (`dx/dt = F`) and normalized steady field lines (`dx/ds = F/|F|`). Eight-point ring and nine-point plane seed presets and per-seed worker progress are available. The Inspector reports units, tolerances, error estimates, and explicit stop reasons. Exploratory, balanced and precise tolerance presets supplement custom values. Constant, vortex, stationary, boundary and cancellation oracles cover both modes; the [80³ golden fixture](scientific-field-numerical-golden.md) checks physical-time and normalized-line endpoints. | Time-dependent pathlines require a time-varying source contract. Advanced seed placement remains open. |
| SCI-06 | Probe analysis and XY/XZ/YZ derived maps support divergence, signed curl components and magnitude, plus gradient and Laplacian of the vector magnitude `|F|`. A local Jacobian and rotation-versus-strain norm classification appear at the probe. Independent 2D/3D scalar-field Project documents now retain gradient-component, gradient-magnitude or Laplacian recipes beside the source document; each preview re-verifies the manifest and source transfer, then computes bounded finite differences in physical coordinates. Derived values are not stored in the Project. V3 derived slices use immediate source-grid stencils at bounded display cells; other paths retain their existing transfer lattices. Full-volume slices, probes and local calculus now expose checked sample digests and tile/chunk or full-resource coverage. | Derived Graph profiles reverify after Project reopen; standalone point calculus still uses bounded samples. Mixed-axis units prohibit a combined magnitude or Laplacian; local norm classification is not a stability proof. |
| SCI-08 | Desktop Explorer has a visible header shortcut to a cancellable 5×5×5 seeded equilibrium search with a 40,000-evaluation and 32-candidate cap. Analytic expressions and complete reverified 3D component bundles are supported; sampled bundles use bounded trilinear interpolation. Candidates report residual, Jacobian condition estimate and full real or complex eigenvalues. Local classifications distinguish source, sink, saddle, spiral source, spiral sink and spiral saddle when units, conditioning and eigenvalue separation pass; near-zero and ill-conditioned cases remain uncertain. Search coverage is always labelled incomplete. Validated candidates can be saved as source-linked Project constructions (32 maximum), with source verification repeated before saving. | The search does not certify all equilibria or smoothness of sampled fields. Broader equilibrium fixtures remain open. |
| SCI-09 | Field Explorer extracts a bounded speed isosurface inside the physical clipping box with a cancellable worker, a 64,000-cell lattice and a saved triangle budget. V3 reads verified tiles through the 64 MiB cache; v1/v2 retain verified bounded volumes. Shared edge vertices form an indexed mesh with smoothed normals, bounds, connected-component and boundary/nonmanifold-edge counts, and an explicit open-at-clip label. A self-contained indexed glTF exports physical coordinates, mesh quality metrics, source references and verified tile hashes. The indexed mesh can be promoted into a source-linked Project Mesh resource with recipe and topology. On reopen, required tiles are reverified before the Mesh is labelled current; a changed tile marks it stale. Mesh can rerun its saved recipe against the verified source, publish a new revision with updated topology and tile provenance, and retain the previous revision. | Other scalar channels, isolines, Surfaces promotion and adaptive extraction remain open. |
| SCI-07 | One physical-point probe persists with the field workspace and can drive XY/XZ/YZ planes in split or quad views. A saved link toggle lets planes keep independent fixed coordinates. The 3D camera orbit/target/zoom and each 2D pane's pan/zoom survive Project reopen independently. Scientific-bundle Graph lines retain selected component and fixed coordinates; authored expression-field line profiles now send bounded samples to Graphs with source expressions, hash, revision and physical fixed coordinates. | Mouse/touch drag panning and broader cross-module linked selection remain open. |
| SCI-12 | Analytic constant, vortex and saddle oracles check numerical values and trajectory results. A verified three-component bundle fixture checks independently known P/Q/R values at the same physical point in XY, XZ and YZ, rejects missing/changed components and axis-order errors, and checks stationary, boundary, step-limit and cancellation stop reasons. The committed [80³ numerical golden fixture](scientific-field-numerical-golden.md) checks divergence, signed curl, speed gradient and Laplacian with explicit interior/boundary limits, all three derived plane orientations and both trajectory modes. A [measured Burgers vortex treatment](scientific-burgers-measured-curation.md) now exercises verified grid orientation, unit conversion, three-plane/probe parity, tamper rejection and first-view measurements. Tests protect source-data invariance under display clipping and workspace migration. | Broader reference families, cross-runtime comparison and variance-aware CPU/memory gates remain open. |

**Full implementation roadmap | SCI-01–SCI-24 | October 2026**

**Scope:** Graphs · Curves · Surfaces · Geometry · Mesh · Volume · Projects · Theory Lab · Scientific Runtimes
**Status:** Proposed plan based on the current MATH3D Graphs screenshots and existing scientific dataset/vector-field workflows. This is a design roadmap, not a claim that every item is implemented.

---

## 0. Executive decision

MATH3D should evolve its current scientific-field presets, dataset import dialogs, 3D vector-field editor, verified slicing, and trajectory solver into a **Scientific Field Explorer** backed by a **first-class ScientificDataset contract**. Graphs remains an excellent entry point for scalar lines and slices, but 3D fields should have an independent editing/visualization workspace. The shared dataset and derivation model should allow the same source to feed Graphs, Curves, Surfaces, Volume, Mesh, Projects, Python/Theory Lab, and optional VTK processes **without copying and reparsing entire arrays into each document**.

### Non-negotiable outcomes

1. Accurate scientific semantics: axes, units, vector components, coordinate frames, time, domains and interpolation are explicit.
2. Responsive application: bounded initial preview; expensive operations move to cancelable workers or optional scientific runtimes.
3. Reproducible documents: deterministic dataset identity, derivation parameters, provenance, validation and invalidation.
4. Flexible 2D/3D exploration: slices, glyphs, magnitude maps, streamlines, stream tubes, isosurfaces and optional volume rendering.
5. Valid numerical reporting: distinguish approximation from mathematical certification; report solver tolerances, coverage and termination.
6. Shared project experience: select one document/view without destroying other documents or derived results.
7. Core app stays lean: no mandatory embedded Python/VTK/CGAL for routine graphs and previews.

### Recommended critical path

**SCI-01 → SCI-03 → SCI-02 → SCI-04 → SCI-07 → SCI-12**, with SCI-05 and SCI-06 following once the dataset/view boundary is stable. Complete the visible end-to-end vortex demo before adding many file formats or heavy volume rendering.

---

## 1. Current implementation baseline (visible in screenshots)

Treat this as the baseline to audit, not work to reimplement:

| Capability | Current indication | Next step |
|---|---|---|
| Graphs workspace | Graph list, fit/reset tools, compact toolbar, Inspector | Preserve and connect to Scientific Field Explorer |
| Scientific presets | Sine–cosine grid, thermal gradient, complex wave packet, planar vortex, 3D swirling field | Turn into golden-fixture test datasets |
| Verified scientific import | Component selector, sample shape, axis extents, slice direction, plane selector | Formalize validation and dataset model |
| Volume preview | Sampled 3D display for 21 × 21 × 17 field | Add accessible representation controls and bounding box |
| 3D vector editor | Density x/y/z, arrow scale, color by magnitude | Relocate to dedicated editor/workspace |
| Trajectory seeds | Editable 3D seed coordinates and seed count | Support list management, seeding patterns and selection |
| Adaptive trajectory solver | RK4 step doubling, step/time/length budgets, absolute/relative tolerance, stop reasons | Add solver abstractions, RK45, diagnostics, reproducibility |
| Send vector line to Graphs | Field component + plane + fixed coordinates + varying axis | Validate range/unit semantics and persist source link |
| Project/document capabilities | Existing mixed document/project architecture | Add ScientificDataset and derived-view references |
| Shared parser | Work underway in Graphs | Reuse typed expression AST for analytic fields when available |

### Screenshot-specific correctness issues

- **Out-of-domain line extraction**: screenshot shows a `Fixed y = 10 m` selector while the dataset's y-axis is `[-4, 4] m`. It must be blocked or explicitly handled by a documented extrapolation method; never silently pretend a sample exists.
- **Oversized modal**: a long 3D vector-field editor with nested scrolling harms visibility, discoverability and cancellation. Promote this editor to a docked full workspace.
- **Unclear representation**: dense point-cloud overview may hide flow direction and sampling structure; provide glyphs, streamlines, axes, clipping and magnitudes.
- **Component-only view**: users also need magnitude, orientation and derived scalar/vector fields.
- **Unclear use of `time`**: numerical streamline parameter, physical time, arc length and evolving flow must be distinguished.
- **Too many raw settings at once**: separate Basic / Advanced / Solver Diagnostics.
- **Provenance wording**: "verified" must say *what* was verified (hash, shape, units, finite values, bounds, etc.), never imply scientific truth of arbitrary input.

---

## 2. Product layout and workflows

### 2.1 Dedicated Scientific Field Explorer

Proposed navigation:

```text
MATH3D Project
  └─ Scientific Data
      ├─ Dataset Library
      ├─ Field Explorer
      │   ├─ Dataset
      │   ├─ Slice
      │   ├─ Vectors
      │   ├─ Streamlines
      │   ├─ Derived Fields
      │   ├─ Analysis
      │   └─ Provenance
      └─ Derived Documents
          ├─ Graphs
          ├─ Curves
          ├─ Surfaces / Volume
          └─ Mesh / Geometry
```

The Field Explorer should be launchable from Graphs (**Import scientific dataset**, **Open field explorer**) and from the Project dataset library. **Importing does not automatically create a giant new editor modal over Graphs.**

### 2.2 Suggested three-pane layout

- **Left — Dataset & layers**: source information, components, slices, streamlines, seed groups and visibility; expandable object tree.
- **Center — Viewer**: 2D/3D representation, pan/orbit/zoom, coordinate axes, scale, clipping, selection and hover probe; optional quad views.
- **Right — Inspector**: selected layer's property controls, derived operations, result values, units and diagnostics.
- **Top — concise toolbar**: Dataset / Slice / Vectors / Streamlines / Analysis / Export, with preset and camera options.
- **Bottom — status**: progress, sampling count, worker/runtime, cancellation and warnings.

Keep the primary controls stable; put infrequently used solver tolerances in an expandable section. Let the user switch between 2D and 3D without reimporting.

### 2.3 Basic vs Advanced controls

**Basic:** Representation, component, color, density preset, active slice, time, Run/Pause, Save.

**Advanced:** interpolation, numerical integration method, adaptive tolerance, seed generator, maximum path arc length, step limits, clipping, scaling law and worker budgets.

**Diagnostics:** validation result, hash, source version, solver statistics, warnings, content fingerprint, timestamps and method versions.

### 2.4 Modal policy

Short modal dialogs are suitable for choosing files, choosing presets and confirming creation. A full scientific session with seeds, plots and solver parameters belongs in a persistent document view or resizable panel. Avoid modal-in-modal workflows and long scrollable forms.

### 2.5 Empty states and accessible interaction

Empty-state actions: **Open a preset**, **Import dataset**, **Create analytic field**, **Return to Graphs**. Support keyboard navigation, high contrast, mouse and touch hit targets, screen-reader labels, unit-bearing fields, error descriptions near the control, and focus restoration after dialogs.

---

## 3. First-class ScientificDataset architecture

### 3.1 Data model

Use a separate immutable dataset resource (metadata + numerical buffers) and mutable view/derivation records. Suggested TypeScript-flavored interfaces (illustrative; adapt to repository contracts):

```ts
interface ScientificDataset {
  id: string;
  revision: number;
  schemaVersion: string;
  contentHash: string;            // canonical bytes / canonical dataset manifest
  name: string;
  source: DatasetSource;
  topology: 'structured' | 'rectilinear' | 'unstructured' | 'point-cloud';
  dimension: 1 | 2 | 3;
  axes: DatasetAxis[];
  components: DatasetComponent[];
  coordinateFrame: CoordinateFrame;
  timeAxis?: DatasetAxis;
  storage: DatasetStorageRef;
  validation: DatasetValidation;
  provenance: ProvenanceRecord;
}

interface DatasetAxis {
  id: string;
  name: string;
  unit: string;                    // canonical unit or validated unit string
  coordinateValues?: DatasetArrayRef;
  min: number;
  max: number;
  sampleCount: number;
  periodic?: boolean;
  strictlyMonotone?: boolean;
}

interface DatasetComponent {
  id: string;
  name: string;
  role: 'scalar' | 'vector-component' | 'complex-real' |
        'complex-imag' | 'tensor-component' | 'mask';
  unit: string;
  dtype: 'float32' | 'float64' | 'int32' | 'uint8';
  association: 'point' | 'cell';
  buffer: DatasetArrayRef;
  vectorGroupId?: string;
  componentAxis?: 'x' | 'y' | 'z';
}

interface ScientificDerivedView {
  id: string;
  sourceDatasetId: string;
  sourceRevision: number;
  kind: 'slice' | 'line' | 'glyphs' | 'streamlines' |
        'derived-field' | 'isosurface' | 'volume-render';
  specification: Record<string, unknown>; // use discriminated unions in final API
  state: 'ready' | 'stale' | 'computing' | 'failed';
  algorithmVersion: string;
  resultArtifactId?: string;
}
```

Do **not** ship `Record<string, unknown>` as the final public schema; define versioned discriminated unions with exhaustive runtime validation.

### 3.2 Important invariants

1. Every component has shape, dtype, unit, association and axis order.
2. Index order and memory layout are explicitly recorded; never infer “last axis varies fastest” without a schema guarantee.
3. Physical coordinates differ from grid indices: index `8` is not a length without the axis-coordinate lookup.
4. Array references specify encoding/endianness/chunking; typed buffers are loaded only when needed.
5. Vector components form an explicit group; their coordinates, shape, association and frames must be compatible.
6. Missing/NaN data handling is configured and reported; do not interpolate through undefined voxels silently.
7. Source dataset identity persists when switching viewers.
8. Views and derived data identify exactly which dataset revision produced them.
9. Project saving includes references, visibility, camera and selected slice, not duplicate full numerical arrays.
10. Import and conversion are bounded; malformed files cannot force unlimited allocations.

### 3.3 Identity, hashing and provenance

Separate **source file digest**, **canonical dataset digest**, **view specification hash**, and **derived result digest**. Source file digest changes on repackaging; canonical dataset digest should reflect normalized semantics/data. Record import adapter version, interpolation/solver version and runtime (JS worker / Python / VTK). "Verified" statuses should distinguish integrity, schema, numerical sanity, reproducibility and scientific validation.

Example provenance pipeline:

```text
source file / analytic expression / Theory Lab artifact
      ↓ import adapter + source validation
ScientificDataset (immutable revision, schema, units, buffers)
      ↓ derived recipe (slice coordinates, operation, tolerances)
Derived View or Data Product (linked source, hash, method version)
      ↓ projection into module document
Graphs / Curves / 3D Field / Surface / Mesh / Workbook
```

### 3.4 Incremental updates

On dataset revision change: mark derived views stale, retain prior results for inspection if appropriate, offer recompute, and ensure viewer never displays stale results without a label. Preserve user camera and visual styling where possible.

### 3.5 Large data

Provide lazy array access, chunked binary data, bounded LRU caches, cancellation, memory quotas, progressive loading, local file-backed access in Electron and backend streaming where available. Avoid serializing large float arrays through React state or repeatedly across worker messages; transfer or share appropriate buffers subject to platform capabilities.

---

## 4. Scientific visualization capabilities

### 4.1 Representation matrix

| Representation | Input | Main output | Priority | Notes |
|---|---|---|---|---|
| Point samples | Scalar/vector samples | Dots at valid locations | P0 | Debug geometry and grid extent |
| Vector arrows (glyphs) | Vector field | Scaled/oriented arrows | P0 | Density, normalization, magnitude legend |
| Orthogonal slices | 3D field | XY/XZ/YZ scalar plane | P0 | Exact plane coordinate shown |
| Scalar heatmap | Scalar/magnitude | 2D colormap | P0 | Colorbar with units |
| Streamlines | Steady vector field | Integrated curves | P1 | Seeds, stop reasons, numerical tolerance |
| 3D stream tubes | Streamlines | Tubular curves | P2 | Rendering/visibility aid |
| Isolines/contours | 2D scalar field | `f=c` curves | P1 | Derived contour topology warnings |
| Isosurfaces | 3D scalar field | `f=c` surface mesh | P2 | Optional VTK acceleration |
| Volume rendering | 3D scalar field | Transfer-function ray/texture view | P2 | Capability gated |
| Pathlines | Time-dependent field | Physical particle trajectories | P2 | Time interpolation and time bounds |
| Tensor glyphs | Tensor field | Principal directions/ellipsoids | P3 | Later specialization |

### 4.2 View coordination

A synchronized probe/crosshair should map between:

- 3D spatial point `(x,y,z)`;
- selected XY/XZ/YZ planes;
- profile line in Graphs;
- component value, magnitude and vector direction;
- derived result (divergence, curl, etc.);
- selected project/document objects.

Make 3D selection update the profile location only when linking is enabled. Preserve separate per-view cameras.

### 4.3 Visualization quality controls

- Camera: Fit domain, Fit selection, XY/XZ/YZ orthographic, perspective, orientation cube.
- Grid: domain bounding box, ticks, axis labels and units, slice plane guides.
- Glyph scaling: constant size vs magnitude vs normalized; avoid glyph overlap; sampling density budget with target max glyph count.
- Color maps: continuous/sequential/diverging/cyclic as appropriate; report actual min/max, clipping/percentiles and missing values.
- Colormap transparency: explicit alpha transfer function for volume rendering.
- Streamlines: seeds visible/toggleable; color by speed, integration time, arclength, component, or termination class.
- Clipping: planes, slabs, ROI boxes and masks; distinguish hiding from cropping data.
- Performance: progressive quality levels and cancelation under camera interaction.
- Export: image + underlying numeric slice/profile, never image only.

### 4.4 Avoid deceptive visualization

Do not imply vectors are normalized if they are not. Do not imply a vector field has physical velocity units without component-unit and semantic confirmation. Show “sample grid” separate from “interpolated continuous field.” Mark excluded/missing cells and extrapolated regions visually.

---

## 5. Numerical field mathematics and derived operations

Let `F(x,y,z) = (Fx,Fy,Fz)` and `u(x,y,z)` be a scalar field.

### 5.1 Baseline operators

| Operator | Definition | Result | Validation fixture |
|---|---|---|---|
| Magnitude | `sqrt(Fx² + Fy² + Fz²)` | Scalar field | Constant vector `(3,4,0)` → `5` |
| Scalar gradient | `∇u` | Vector field | `u=x²+y²+z²` → `(2x,2y,2z)` |
| Divergence | `∂x Fx+∂y Fy+∂z Fz` | Scalar field | `(-y,x,0)` → `0` |
| Curl | `(∂y Fz−∂z Fy, ∂z Fx−∂x Fz, ∂x Fy−∂y Fx)` | Vector field | `(-y,x,0)` → `(0,0,2)` |
| Jacobian | `[∂j Fi]` | Matrix/tensor | Affine field → constant matrix |
| Laplacian | `∇²u` | Scalar field | Quadratic sphere potential → `6` |
| Directional derivative | `dF/ds` along direction | Scalar/vector | Linear fixture |
| Flux | `∫S F·n dS` | Scalar result | Constant field through oriented plane |
| Circulation | `∮C F·dr` | Scalar result | Rotational field along circle |
| Critical point | `F(x)=0` | Points + residuals | Linear saddle/source/vortex |
| Field-line integral | `dr/ds = F(r)` or normalized variant | Curve | Rotational field → circles |

Flux/circulation require defined oriented integration geometries and quadrature policies; they are **not** automatic consequences of a vector grid.

### 5.2 Derivative backend

- Analytic expression fields: leverage shared parser AST and symbolic/automatic differentiation where supported.
- Sampled structured grids: finite differences with explicit stencil, spacing, boundary strategy, missing-data behavior and error estimates where available.
- Rectilinear grids: use physical nonuniform spacings, not uniform-index formulas.
- Unstructured meshes: use topology-aware reconstructed gradients, element interpolation or optional VTK operators.
- Complex field: distinguish complex magnitude, real/imaginary parts and phase; phase unwrap is a separate operation.
- Numerical metadata: derivative order, stencil order, boundary one-sided scheme, mask count, calculation duration.

### 5.3 Critical-point classifications

For a found equilibrium `F(x*)=0`, inspect the Jacobian eigenvalues; present candidate class (source, sink, saddle, spiral etc.) only when supported by assumptions (steady autonomous field, smoothness, local linearization). Degenerate or poorly conditioned cases remain “unclassified/uncertain.” Do not present sampled estimates as proofs of global topology.

### 5.4 Derived field documents

Treat `magnitude`, `divergence`, `curl`, `gradient`, `vorticity magnitude`, `Laplacian` etc. as versioned derived operations that can be visualized, sampled and sent to other modules. Cache by source revision and operation specification.

---

## 6. Streamlines, trajectories and adaptive numerical solvers

### 6.1 Correct terms

- **Streamline:** tangent to the velocity field at a fixed instant; for a steady field this is the familiar integrated flow curve.
- **Pathline:** actual trajectory `dx/dt = v(x,t)` for a moving particle.
- **Streakline:** locus of particles released from a fixed injection point over time.
- **Normalized field line:** integrates `dx/ds = F/|F|`; parameter is geometric distance rather than physical time.

Streamline, pathline and streakline may agree for steady flow, but generally differ in time-varying flow. Do not label all three “trajectory” with no qualification.

### 6.2 Solver interface

```ts
interface IntegrationSpec {
  mode: 'streamline' | 'pathline' | 'normalized-field-line';
  method: 'rk4-step-doubling' | 'rk45';
  direction: 'forward' | 'backward' | 'both';
  seed: [number, number, number];
  initialTime?: number;
  maxTime?: number;
  maxArcLength?: number;
  maxSteps: number;
  absoluteTolerance: number;
  relativeTolerance: number;
  minStep?: number;
  maxStep?: number;
  stopAtDomainBoundary: boolean;
  stopAtInvalidSample: boolean;
  stagnationThreshold?: number;
}
```

Use discriminated types so invalid parameter combinations cannot pass validation (e.g., pathline without a time interpretation).

### 6.3 Numerical features

1. Preserve existing RK4 step-doubling as baseline and regression comparator.
2. Add embedded RK45 (`Dormand–Prince`-style 5(4), or another documented embedded scheme).
3. Adaptive steps should use scaling in units; avoid naive absolute tolerance across kilometer and millimeter axes.
4. Interpolate vector data in physical coordinates; define time interpolation explicitly.
5. Detect invalid vectors, NaNs, boundary exits, near-zero speed, maximum steps, maximum parameter time and maximum arc length.
6. Report each integrated curve's accepted/rejected steps, error estimate, elapsed runtime, interpolation method and stop reason.
7. Support explicit backward and both directions where mathematically meaningful.
8. Provide seed selection directly in 3D, manual numeric inputs, grids/lines/planes/spheres and deterministic random seeds.
9. Allow batch cancellation, progress, budgets and per-seed isolation (failure of one seed should not discard all).
10. Clarify that local integration tolerances are not global error guarantees or topology proofs.

### 6.4 Physical units and time

For a velocity field measured in m/s, solving `dx/dt=v` uses physical seconds. For normalized field lines, `s` is arclength in meters under the chosen coordinate metric. For a generic vector field lacking physical velocity semantics, label the integration parameter abstractly, not “seconds.”

### 6.5 Validation fixtures

- `F=(1,0,0)`: straight lines, constant velocity.
- `F=(-y,x,0)`: circles at constant radius, divergence zero and curl `(0,0,2)`.
- `F=(x,y,0)`: outward radial source with analytically known trajectories.
- `F=(x,-y,0)`: saddle; stable/unstable axes.
- `F=(0,0,0)`: stagnation/stop, not divide by zero.
- Time dependent `v=(cos(t),sin(t),0)`: compare numerical pathline to integrated analytic expression.
- Boundary/missing-data tests: clear terminal status and no infinite loops.

---

## 7. Import adapters and external interoperability

### 7.1 Layered import strategy

```text
External format / analytic field / generated scientific scene
             ↓ reader/adapter (optional runtime)
Verified normalized dataset manifest
             ↓ units + shape + coordinate + integrity checks
Shared ScientificDataset buffers and metadata
             ↓ typed operations
Field Explorer / Graphs / Curves / Surfaces / Mesh / Project
```

**Phase A:** CSV, JSON and NumPy NPY/NPZ. **Phase B:** selected VTK formats. **Phase C:** NetCDF/HDF5 through optional backend as justified by actual dataset needs.

### 7.2 Format mapping

| Format | Expected use | Adapter considerations |
|---|---|---|
| CSV | Sampled lines, tabular series, simple grids | Schema/map axes; missing values; delimiter/locale; units supplied separately |
| JSON | Small arrays and metadata-bearing samples | Strict schema, size/depth limits |
| NPY | Numeric ndarray | Shape, dtype, endianness, storage order; axis metadata separate |
| NPZ | Bundled ndarray components | Named arrays plus manifest; memory/zip-bomb limits |
| VTI | Image/regular grid data | Cell vs point association, spacing, origin |
| VTR | Rectilinear structured coordinates | Nonuniform coordinate arrays |
| VTS | Structured grids | Curvilinear geometry and coordinate mapping |
| VTU | Unstructured grids | Cell types, connectivity, association |
| VTP | Polygonal lines/surfaces | Trajectory and mesh-like datasets |
| NetCDF | Climate/atmospheric/oceanic datasets | Units, dimension names, fill values, calendars, coordinate reference |
| HDF5 | Large hierarchical scientific datasets | Dataset paths, chunking, metadata, optional backend |
| Theory Lab artifact | Native production and exchange | Versioned manifest, source reproducibility, capability metadata |

Do not claim that one adapter can handle every variant of these formats. Maintain a supported-subset matrix and explicit unsupported-feature errors.

### 7.3 Security and resource limits

Validate file size and decompression expansion; cap array dimensions, element counts, allocations, recursion depth and metadata lengths. Parse untrusted inputs in isolated workers/processes when possible. No arbitrary Python/JavaScript execution through dataset metadata. Handle external paths and embedded references via allowlists/sandbox policies.

### 7.4 Python API contract

A Python producer should write arrays and a manifest rather than render pixels. A minimal conceptual workflow:

```python
# Illustrative producer-side concept, not a current MATH3D API.
# NumPy data shape: (nz, ny, nx) or another *explicit* order.
artifact = {
    "schemaVersion": "1.0",
    "kind": "structured-vector-field",
    "axisOrder": ["z", "y", "x"],
    "axes": [
        {"name": "x", "unit": "m", "values": "x.npy"},
        {"name": "y", "unit": "m", "values": "y.npy"},
        {"name": "z", "unit": "m", "values": "z.npy"},
    ],
    "components": [
        {"name": "east", "unit": "m/s", "file": "u.npy"},
        {"name": "north", "unit": "m/s", "file": "v.npy"},
        {"name": "up", "unit": "m/s", "file": "w.npy"},
    ],
}
```

Use a format manifest or container rather than `pickle` or arbitrary executable serialization. Record time, coordinate reference, units, masks and data provenance.

### 7.5 Cross-module exports

- **Field → Graphs:** sample component/magnitude along a precise physical line, preserving units and source recipe.
- **Field → Curves:** promote validated integration paths as parametric curves with optional times/arclength samples.
- **Scalar field → Surfaces:** extract iso-contour/iso-surface or height representation with derived mesh provenance.
- **Field → Volume:** render full 3D field or derived scalar volume; avoid data copies when possible.
- **Field → Mesh:** export iso-surface or sampled geometry, mark mesh as derived result.
- **Field → Workbook/Notes:** create report and numerical summary with linked figures and assumptions.
- **Theory Lab ↔ MATH3D:** reproduce the same artifact via stable manifest and hashes.

---

## 8. Runtime division: lightweight app vs optional scientific engines

| Layer | Owns | Does not own |
|---|---|---|
| Shared MATH3D core | Contracts, AST handles, datasets, document refs, serialization, provenance | Heavy backend file format parsing |
| Browser/TypeScript worker | Small/medium grids, simple interpolation, previews, basic RK integration | Huge volume pipelines |
| GPU viewer | Interactive rendering, picking, camera, clipping and color maps | Scientific claims/validation of computed results |
| VTK runtime (optional) | Heavy slices, contours/isosurfaces, stream tracing, volume-oriented operations | Exact constructive solid predicates |
| CGAL runtime (optional) | Geometry robustness, predicates, mesh Boolean/topology operations | General scientific array ingestion |
| Python/NumPy/SciPy runtime (optional) | External simulation and array analysis; numerical pipelines | Viewer/UI responsibilities |
| Runtime/job service | Capability registry, job queues, lifecycle, cancellation, budgets and worker provenance | Module-specific visual controls |

### 8.1 Capability negotiation

Operations ask for capabilities (`structured-slice`, `rk45-streamlines`, `isosurface`, `netcdf-import`, `volume-render`) rather than hard-coding a backend name. Route small jobs locally; select optional backends for large grids/advanced operations. Expose missing capabilities with a helpful error, not a silent failure.

### 8.2 Performance and stability

Adopt job budgets for CPU time, memory, total samples, glyph count, seeds, integrated points and rendered primitives. Throttle previews while dragging; preserve last valid result. Avoid blocking Electron renderer/UI thread. Log enough context to diagnose failures but do not log raw sensitive datasets by default.

### 8.3 Consistency

Use the same normalized data contract and numerical test fixtures across TypeScript and backend runtimes. Compare reference results within stated error bounds. Backend substitution should not unexpectedly change units, sign, axis order or data association.

---

## 9. Graphs, parser and mathematical construction integration

This roadmap builds on the existing Graphs formula parser and construction work. Do not create a second expression interpreter inside the field editor.

- Analytic vector field creation: let users define `Fx(x,y,z,t)`, `Fy(...)`, `Fz(...)` via the shared typed AST and validator.
- Support scalar expressions `u(x,y,z,t)` as fields; expression domains and singularities must be tracked.
- Sampled fields use dataset interpolation rather than evaluating symbolic expressions.
- Derivative computation may use analytic AST, automatic differentiation, or finite differences, with the chosen method reported.
- Promote sampled line profiles into Graphs with a reference back to the field and a physical path definition.
- Promote streamlines into Curves and give them a persistent dependency relationship; if the source changes, mark them stale.
- Construction objects (probes, tangents, normals, critical points) should refer to the **source mathematical object and coordinates**, not merely a raster/pixel position.

### 9.1 Coordinate-based line extraction

Line extraction must define:

1. selected field/component or derived scalar;
2. plane or arbitrary line geometry;
3. varying physical coordinate and fixed physical coordinates;
4. interpolation method and treatment of missing samples;
5. endpoint range and sample count/tolerance;
6. units for independent and dependent axes;
7. source dataset revision and method version.

If fixed `y=10 m` exceeds the dataset's `[-4,4] m` bounds, show a clear error and nearest valid coordinate suggestion. A future extrapolation mode should be opt-in and prominently labeled.

### 9.2 Units and coordinates

Treat coordinate frames explicitly (Cartesian, rotated, geographical when supported), including transformation definitions. Avoid mixing grid-frame vector components with world-frame glyph orientation. Convert compatible units and block incompatible units rather than accepting every numerical field as meters or seconds.

---

## 10. Detailed numbered implementation roadmap

Each numbered commit is a scoped unit; large tasks may require subcommits. Priorities are relative, and codebase naming should be adapted to existing package layout.

### Track A — Safety, dataset contract and workspace (P0)

#### SCI-01 — Domain, units and bounds correctness

**Deliver:** Validate every coordinate and component selection before preview, extraction or integration.

Implementation:

- Central `DatasetCoordinateValidator`: index→coordinate conversion, bounds, periodic axes, monotonicity and missing data.
- Reject default out-of-domain values; offer snap-to-nearest valid sample as an explicit user action.
- Show units beside each numeric input; validate physical-time semantics for velocity trajectories.
- Normalize decimal parsing to application locale without corrupting serialized canonical values.
- Differentiate "invalid", "outside domain", "unsupported interpolation" and "missing samples".

Acceptance:

- A line at `y=10 m` for bounds `[-4,4] m` cannot create a misleading valid Graphs line.
- A valid in-range line previews and preserves its physical coordinate on save/reopen.
- Non-monotonic coordinate arrays and mismatched vector-component grids generate actionable errors.

#### SCI-02 — Full Scientific Field Explorer workspace

**Deliver:** Replace the oversize 3D-field modal with a persistent multi-pane workspace.

Implementation:

- Navigation from Graphs and Projects; document identity and back/forward behavior.
- Layer tree, viewer, Inspector, compact toolbar, job status, Basic/Advanced settings.
- Contextual right panel: dataset vs slice vs streamline vs arrow layer.
- Save state, reopen, reset docks, accessible focus/keyboard behavior.

Acceptance:

- No inner modal scrollbar is needed for core 3D interaction.
- Users can inspect/render while changing settings and retain state across module switches.
- Viewer works with narrow desktop windows without horizontal toolbar scrolling.

#### SCI-03 — ScientificDataset + derived-view references

**Deliver:** Stable, versioned dataset and derived-result contracts.

Implementation:

- Source and normalized-data identities, axes, units, component grouping, storage refs, validation, provenance.
- Typed derived specs: slice, line, glyph, trajectory, field operator, surface.
- Project serialization and migrations; stale-result handling and cache keys.
- Unit tests for shapes, endianness, ordering, missing data and schema migration.

Acceptance:

- One dataset feeds multiple derived views without copying full arrays into each document.
- Saved project round-trips dataset links, active slice and view settings.
- Source revision changes invalidate dependent results deterministically.

#### SCI-04 — 3D glyphs, scalar maps and slice controls

**Deliver:** Readable, accurate 3D field navigation.

Implementation:

- Vector arrows oriented correctly, density and magnitude-scale options, color legend and domain box.
- Orthogonal XY/XZ/YZ slices with physical coordinates, optional clipping, sample probes.
- Camera presets, Fit domain/selection, keyboard shortcuts.
- Preview budgets and progressive refinement.

Acceptance:

- Constant-vector fixture produces parallel arrows of expected orientation and size.
- Orthogonal slices are consistent at their intersections.
- Zoom/orbit never changes data values; performance stays bounded by the configured glyph budget.

### Track B — Numerical computation and linked views (P1)

#### SCI-05 — Solver abstraction, RK45 and diagnostics

**Deliver:** A physically meaningful adaptive integration API.

Implementation:

- RK4 step-doubling remains baseline; add embedded RK45 and named tolerance modes.
- Separate steady streamlines, normalized field lines and time-dependent pathlines.
- Seed generator UI, forward/backward, stop reasons, job cancellation and progress.
- Per-trajectory results: steps, error indicators, bounds exit, invalid samples, arclength.

Acceptance:

- Constant-flow and vortex fixtures agree with analytical references within stated tolerances.
- Zero field terminates safely; every interrupted trace reports the correct reason.
- A 32-seed batch can be canceled without freezing the viewer.

#### SCI-06 — Gradient, divergence, curl and Jacobian

**Deliver:** Derived field analysis with method metadata.

Implementation:

- Scalar gradient and Laplacian; vector divergence, curl, magnitude and Jacobian.
- Analytic-expression and sampled-grid pathways; boundary and missing-data diagnostics.
- Derived-layer picker and graph profile export.
- Reference tests for constant, linear, quadratic and rotational fields.

Acceptance:

- `F=(-y,x,0)` gives numerical divergence near 0 and curl near `(0,0,2)` in validated interior regions.
- Method, stencil and units appear in the Inspector.
- Errors near boundaries are not presented as exact values.

#### SCI-07 — Linked orthogonal views and spatial probes

**Deliver:** Synchronized multi-view exploration.

Implementation:

- 3D viewer + 2D XY/XZ/YZ planes, with optional split/quad layout.
- Linked crosshairs, selected sample coordinates, component values and units.
- Cross-module Graphs line profile from selected point/axis.
- Toggle link mode and preserve independent cameras.

Acceptance:

- Moving one probe updates all linked representations to the same physical point.
- Grid index and world coordinate never silently interchange.
- Profiles identify their exact source field revision and extraction parameters.

#### SCI-08 — Critical points and Jacobian classification

**Deliver:** Numerical equilibria with diagnostics and candidate local types.

Implementation:

- Seeded root solving on vector fields, residual and Jacobian condition estimates.
- Classification from eigenstructure where assumptions hold.
- Deduplication, domain inclusion and uncertain/degenerate cases.
- Save validated candidates as linked constructions.

Acceptance:

- Test fixtures report source, sink, saddle and degenerate cases appropriately.
- No claim of exhaustive critical-point coverage without justified search/certification.

#### SCI-09 — Derived scalar representations and isosurfaces

**Deliver:** Isolines, isosurfaces, legends and exportable geometry.

Implementation:

- Isoline levels in 2D, iso-surface extraction in 3D via capability-gated backend.
- Normals, mesh bounds, topology and numerical quality warnings.
- Export to Surfaces/Mesh with derivation metadata and original dataset reference.

Acceptance:

- Analytic sphere iso-surface has expected approximate radius and normals.
- Any clipped/incomplete surfaces are labeled; large work is cancellable.

### Track C — Formats and interoperability (P1–P2)

#### SCI-10 — NumPy, CSV and JSON adapters

**Deliver:** Import/export common scientific data without arbitrary code execution.

Implementation:

- Reader/writer mappings to the normalized ScientificDataset contract.
- NPY/NPZ dtype, shape, byte order, axis-order and metadata manifest support.
- CSV schema mapping and numeric parse/reporting.
- Comprehensive malformed, oversized and missing metadata tests.

Acceptance:

- Python-generated vortex arrays import without component/axis permutations.
- Export/reimport preserves numerical values and metadata within defined precision.

#### SCI-11 — VTK/NetCDF/HDF5 optional adapters

**Deliver:** Advanced import via optional workers/backend services.

Implementation:

- Choose supported VTI/VTR/VTS/VTU/VTP cases deliberately.
- Add NetCDF/HDF5 adapters for project-relevant datasets; preserve dimension names, units and masks.
- Capability discovery and crisp unsupported-format errors.
- Backend version/provenance and resource limits.

Acceptance:

- Representative fixtures are correctly imported and mapped to world coordinates.
- Lack of an optional backend does not prevent normal MATH3D startup or Graphs usage.

#### SCI-12 — Scientific correctness and performance suite

**Deliver:** Golden fixtures, numerical oracles, cross-runtime comparisons and UI regression.

Implementation:

- Reference datasets: constant field, vortex, source, sink, saddle, thermal gradient, complex wave packet, time-varying flow.
- Unit/bounds/axis-order and missing-data tests; physical dimensions.
- Solver time/error/stopping regression; interpolation invariants.
- Progressive performance tiers: tiny, standard, large/stress; budget enforcement.
- Snapshot/API schema migration tests and save/reload round-trip.

Acceptance:

- Every numerical feature states test tolerances and applicable domain.
- CPU/memory budgets are checked automatically on reference hardware, with variance-aware thresholds.
- No renderer-only test is mistaken for scientific correctness.

### Track D — Product-quality extensions (P1–P2)

#### SCI-13 — Streamline seeding and management

- Seed list, groups, hide/show, color, rename and delete.
- Seed patterns: grid, line, plane, sphere/shell, deterministic random.
- Click-to-seed in 3D and place on slices with valid-coordinate feedback.
- Batch computation with independent per-seed errors and undo/redo.

#### SCI-14 — Vector analysis Inspector

- Display value/magnitude, unit, Jacobian, curl/divergence and selected derivative method.
- Support matrix/eigenvalue panels where meaningful.
- Link to provenance and result graph; compact default with expandable detail.

#### SCI-15 — Time-dependent field playback

- Time axis browsing and interpolation with missing-frame checks.
- Animation transport: play/pause/speed/loop/frame scrub.
- Pathline vs streamline selection; no mixing spatial and temporal axes.
- Cache limited frames and provide memory budget.

#### SCI-16 — Stream tubes and line quality

- Radius/color styling with measured or normalized magnitude mapping.
- Geometry decimation and quality controls independent of integration accuracy.
- Export curve centerline separately from tube mesh.

#### SCI-17 — Volume visualization

- Scalar transfer function, opacity thresholds, clipping and slicing.
- GPU/VTK capability gating, progressive preview and image export.
- Exact source/derived scalar displayed in legend and Inspector.

#### SCI-18 — Project-level dataset library

- Search by source, field type, units, time and tags.
- Deduplicate content, manage storage, preview thumbnails and linked documents.
- Identify stale or missing backing buffers; repair/relink workflow.

#### SCI-19 — Analysis report and Workbook integration

- Persist charts, numerical summaries, units, methods, solver stats and warnings.
- Export an audit-friendly report with source references and reproducibility metadata.
- Support repeatable analysis recipe reruns.

#### SCI-20 — Theory Lab artifact round-trip

- Import native scientific scene/dataset manifests from Theory Lab.
- Produce derived scene and profiles usable by Theory Lab/Python.
- Retain shared artifact IDs, algorithm versions and hashes.
- Golden demonstration tested across export, edit, reimport and reopen.

#### SCI-21 — Runtime capabilities and fallback policy

- Advertise supported operations and limits per platform/runtime.
- Worker orchestration, cancellation, progress, memory reporting and recovery.
- Desktop/Browser/mobile capability policy, especially for heavy volume operations.

#### SCI-22 — Field-to-Geometry / Mesh bridge

- Transfer isosurfaces/streamlines/critical points as derived geometric objects.
- Preserve source link, invalidation status and editable-copy option.
- Distinguish sampled approximation from geometric exactness.

#### SCI-23 — UX/accessibility and mobile viewer subset

- Touch-friendly controls, compact layer switching and responsive Inspector.
- Phone/tablet: lightweight slice, profile and limited glyph previews.
- Desktop remains primary for heavy field editing; do not promise mobile parity for unavailable runtimes.

#### SCI-24 — Field Explorer release audit

- Verify documentation, schema migration, resource limits, numerical fixtures, error semantics and accessibility.
- End-to-end project open/save/reopen and run on Windows/Linux/browser.
- Freeze benchmark datasets and record known limitations.

---

## 11. Suggested implementation batches and dependencies

| Batch | Commits | Deliverable | Exit criterion |
|---|---|---|---|
| 1: Correctness gate | SCI-01, SCI-03 | Dataset bounds, typed refs, provenance | No misleading out-of-bounds extraction; save/reopen passes |
| 2: Workspace | SCI-02, SCI-04 | Persistent Field Explorer with glyphs and slices | Can interact with same verified dataset across 2D/3D |
| 3: Connected views | SCI-07, SCI-12 | Linked probes and golden numerical fixtures | Spatial values agree across views, CI protects semantics |
| 4: Field calculus | SCI-05, SCI-06, SCI-08 | Streamline solver, derived fields, equilibria | Analytic fixtures match within tolerances |
| 5: Interoperability | SCI-10, SCI-20, SCI-18 | NumPy/Theory Lab/project round-trip | Dataset import→analysis→project reopening validated |
| 6: Advanced visualization | SCI-09, SCI-13, SCI-14, SCI-16 | Iso, managed seeds, richer Inspector | Stable under defined mesh/seed budgets |
| 7: Optional engines | SCI-11, SCI-17, SCI-21, SCI-22 | Advanced formats/rendering/bridges | Backends optional and capability-gated |
| 8: Polish & release | SCI-15, SCI-19, SCI-23, SCI-24 | Playback, reports, responsive slice viewer, audit | Cross-platform test matrix accepted |

Where code already implements part of a commitment, convert the task into **audit → refactor → test**, not reimplementation.

---

## 12. End-to-end showcase: the verified vortex project

### Goal

A single verified `F=(-y,x,0)` dataset should be able to produce a linked 3D vector view, XY slice, streamline layer and extracted Graphs component profile. Later variants can incorporate a genuine 3D vortex and time-varying field.

### Demo flow

1. In Graphs choose **Import scientific dataset → Planar vortex** or a verified 3D swirling field.
2. Inspect axes, units, shape, component grouping and dataset hash.
3. Open Field Explorer in the same Project.
4. Display arrows (magnitude coloring) and XY slice at `z=0`.
5. Place a probe at `(1,0,0)` and show `F=(0,1,0)` for the analytic vortex fixture.
6. Seed a streamline at `(1,0,0)`; solver returns an approximately circular curve; radius stays near 1 within numerical tolerance.
7. Derive divergence and curl; show divergence ≈0 and z-curl ≈2, with method and error context.
8. Select the component `Fy=x` on the line `y=0,z=0`; send it to Graphs with linked source recipe.
9. Promote the streamline into Curves; open both views without losing their linked identity.
10. Save the Project, close and reopen, preserving view/camera/seed/derivation state.
11. Modify underlying dataset revision; both linked views become stale or recompute according to policy.
12. Export an analysis report and reproducibility manifest.

### Expected reference mathematics

For `F=(-y,x,0)`:

```text
magnitude       sqrt(x² + y²)
divergence      0
curl            (0,0,2)
flow invariant  x² + y² = constant
critical point  (0,0) in the planar field
```

With `x(0)=1,y(0)=0`, physical-time evolution for this particular dimensionally consistent velocity fixture is `x(t)=cos(t), y(t)=sin(t)` after appropriate unit-scaled interpretation. The general visualization should keep an explicit time and unit model rather than assuming all vector fields are velocities.

### Demo acceptance

- Every displayed entity is derived from the **same source revision**, not separate hardcoded demos.
- Linked probes and profile values agree at common physical coordinates.
- The selected fixed coordinates are within bounds.
- The curve geometry and analysis output pass numerical regression tests.
- A missing optional VTK/Python runtime does not break the baseline small-dataset demo.
- Rendering and solver timings are measured separately.

---

## 13. Test matrix and performance gates

### 13.1 Mathematical fixtures

| Dataset | Expected invariant/result | Detects |
|---|---|---|
| Uniform vector `(3,4,0)` | Norm `5`, zero curl/divergence | Unit, component, derivative errors |
| Rotational `(-y,x,0)` | Curl `(0,0,2)`, divergence zero | Orientation/sign errors |
| Radial `(x,y,0)` | Divergence `2` in 2D or matching 3D extension | Dimension convention errors |
| Saddle `(x,-y,0)` | Divergence zero, saddle equilibrium | Classification errors |
| Scalar `x²+y²+z²` | Gradient `(2x,2y,2z)`, Laplacian `6` | Stencil/coordinate errors |
| Complex plane wave | Known amplitude/phase | Complex grouping and phase errors |
| Nonuniform rectilinear axes | Correct physical interpolation | Index/coordinate confusion |
| Missing-value slab | No invented crossings | NaN interpolation errors |
| Rotated frame | Correct world vector direction | Frame transform errors |
| Time-varying velocity | Analytic/known pathline | Time dimension mistakes |

### 13.2 Failure and edge cases

- Empty/zero-sized grid and degenerate axes.
- One-cell thick volumes and 2D slabs in 3D containers.
- Nonuniform or descending axes; duplicate coordinates if forbidden.
- NaN, ±Infinity, masked and extremely large/small floating values.
- Disconnected sampling regions and periodic boundaries.
- Singular vector magnitudes, zero speed, boundary grazing and trajectories leaving the domain.
- Corrupted manifest, truncated binary arrays, wrong dtype, wrong endianness, decompression bomb.
- Worker cancel and document close while a job runs.
- Stale revision plus same display name but new underlying content hash.
- Huge glyph count requested: clear cap and adaptive downsampling.

### 13.3 Performance budgets

Define **measurement-based** budgets rather than fabricated universal millisecond promises:

- UI responsive during import and integration.
- Interactive preview limited by configurable glyph/sample/texture budgets.
- Memory/CPU monitoring warns and cancels or downgrades jobs under pressure.
- Separate reports for import, parse, interpolation, integration, mesh generation and rendering.
- Benchmark at three classes: small (~20³ structured samples), moderate (~100³), large/stress (hardware-dependent).
- Compare browser/Electron/Linux and optional backend results with normalized accuracy metrics.

### 13.4 Release gates

1. Type/schema validation and migration tests green.
2. Mathematical golden fixtures green.
3. Save/reload, cross-module identity and invalidation tests green.
4. Import fuzz/negative tests green.
5. Cancellation/memory protection verified.
6. Keyboard focus, readable unit fields and contrast reviewed.
7. Runtime absence/degraded mode documented and tested.

---

## 14. Engineering practices and recommended file boundaries

Proposed conceptual package boundaries (use existing MATH3D packages wherever they already fit):

```text
packages/contracts/scientific/
    scientific-dataset.schema.ts
    dataset-axis.schema.ts
    scientific-derived-view.schema.ts
    runtime-capabilities.schema.ts

packages/core/scientific/
    units.ts
    frames.ts
    interpolation.ts
    derivations.ts
    validation.ts
    provenance.ts

packages/workspace/scientific/
    scientific-field-explorer-state.ts
    project-dataset-links.ts

packages/ui/scientific/
    FieldExplorer.tsx
    FieldLayerTree.tsx
    FieldInspector.tsx
    FieldViewer.tsx
    SliceControls.tsx
    StreamlineControls.tsx

workers/scientific/
    field-import.worker.ts
    field-derived.worker.ts
    trajectory.worker.ts

adapters/scientific/
    csv-json/
    numpy/
    vtk-optional/
    netcdf-hdf5-optional/
    theory-lab/

tests/assets/scientific-fields/
    constant/
    vortex/
    saddle/
    thermal/
    complex/
    invalid/
```

Prefer shared domain contracts, not a second monolithic scientific app with its own parser, selection model, worker scheduler and persistence format.

### Engineering implementation principles

- Reuse existing MATH3D project/document identity and selection/picking conventions.
- Reuse existing worker pool/capability system where possible.
- Do not add an always-running backend merely to render small preview datasets.
- Make every heavy operation asynchronous and cancellable.
- Move data by reference/transfer where safe; avoid deep React-state copies.
- Keep canonical hashes separate from presentation settings.
- Do not call a result "certified" unless a method establishes a defensible guarantee.
- Document units and coordinate assumptions at the API boundary.
- Add migration/versioning tests before expanding the persisted format.

---

## 15. Decisions to settle early (with defaults)

| Decision | Recommended default | Reason |
|---|---|---|
| Is 3D editing a Graphs feature? | Separate Field Explorer; Graphs launches it | Clear module ownership |
| How are datasets stored? | Immutable resource + view recipes | Reuse and cacheability |
| Who parses field expressions? | Shared typed expression AST | Avoid parser divergence |
| Small-data compute? | TypeScript workers | Fast startup/no mandatory backend |
| Heavy compute? | Optional VTK/Python capability | Keeps app lean |
| Array axis order? | Explicit in manifest | Avoid silent transpose bugs |
| Floating data type? | Support f32/f64; preserve source precision | Scientific provenance |
| Missing-data policy? | Propagate/mark unless configured | Avoid invented data |
| Coordinate outside bounds? | Error by default | Avoid silent extrapolation |
| How to label trajectories? | Streamline/pathline/field line distinguished | Physical correctness |
| Default view? | 2D slice + modest vector glyphs | Clear and performant |
| What triggers recompute? | Source revision or algorithm/recipe change | Reproducibility |
| Export to other modules? | Linked derivation by default, detached copy optional | Stable workflows |
| Mobile scope? | Slice/profile and light glyphs first | Bounded performance |

---

## 16. Definition of done for the full initiative

The Scientific Field Explorer initiative can be considered mature when:

- MATH3D imports real verified arrays/fields, not only presets.
- A user can inspect a complete dataset's metadata, units, axes, spatial frame and validation status.
- A 3D field can be explored through vector glyphs, selected planes, profiles and streamlines in the same persistent workspace.
- The application computes basic field calculus with validated numerical metadata.
- The integrator handles steady/time-dependent distinctions and records stop reasons.
- Data products can be promoted to Graphs, Curves, Surfaces/Volume and Project results without hidden data duplication.
- Python/Theory Lab artifacts move through documented normalized contracts.
- VTK/CGAL capabilities are optional and do not inflate the baseline viewer/runtime.
- Golden fixtures guard axis orientation, sign conventions, numerical accuracy and interpolation.
- Projects reopen with source references, derived recipes, results/provenance and stale-state handling.
- A single end-to-end vortex demo proves the system rather than separate visually convincing but disconnected examples.

---

## 17. Immediate actionable handoff for Codex

**First assignment: SCI-01 correctness, then the SCI-03 minimum contract.** The desktop slices in the implementation checkpoint have been delivered; extend their acceptance coverage before broadening the schema.

1. Locate current scientific preset definition, verification manifest, vector field import modal, 3D editor, Graphs line-extraction code and Project document contracts.
2. Inventory existing types/workers/serialization rather than creating parallel structures.
3. Reproduce the screenshot's out-of-range `Fixed y` case (`y=10 m` for `[-4,4] m`).
4. Implement domain/unit validation and descriptive UI errors with tests.
5. Define the minimum immutable dataset + typed derived-line/slice references compatible with current documents.
6. Add persistence/migration tests and demonstrate one source feeding two derived views.
7. Show exact changed files, unit test results, integration screenshots and any remaining risks.

**SCI-04 preview, progressive transfer and tiled v3 source reads delivered.** The bounded SCI-08 equilibrium search and independent scalar-field gradient/Laplacian Project documents are delivered on desktop. Scientific arrows first use a smaller verified transfer, then refine from the full bounded transfer. [V2 chunks](scientific-scene-chunked-v2.md) and [v3 tiles with an optional verified overview](scientific-scene-tiled-v3.md) let the first 3D preview, all three orthogonal slices (including derived colors), and point probes verify only the bytes their samples use; v1 bundles continue through full-file verification. V3 improves XY/XZ slice reads on the measured fixture, and its overview restores a fast first arrow view without reading every tile. A generated 80³ vortex scene exercises the larger-data path; a [measured horizontal Burgers vortex treatment](scientific-burgers-measured-curation.md) tests a real PIV source and its reproducible v3 curation. Divergence, signed curl, speed-gradient components, and speed Laplacian slice profiles now transfer to Graphs with their physical line coordinates, operation, units, source reference, verified sample hashes, and a reopen-time reverify action. The 80³ oracle checks the exported numerical values, and the measured scene checks Project provenance and tamper rejection. V3 derived slices, Graph profiles, and point calculus use verified source-grid stencils; see [accuracy and first-result measurements](scientific-source-grid-stencils.md). V1 and v2 point calculus retain their previous paths. Packaged desktop Narrator spoken-output review remains a human release gate; Android device acceptance remains deferred.

**Third assignment: SCI-12 + SCI-05 + SCI-06.** Implement mathematical golden fixtures before expanding solver methods and derived operations; report explicit tolerances and stopping behavior.

**Tile-backed solver checkpoint, 26 October 2026.** V3 trajectories and the bounded equilibrium search use the same manifest-pinned, 64 MiB verified tile cache; v1/v2 keep bounded volumes. The [tile-solver measurements](scientific-source-grid-stencils.md#tile-backed-trajectories-and-equilibrium-search) show a faster first trajectory on the 80³ and measured Burgers fixtures. Equilibrium search batches missing corner tiles and now resumes within the interrupted Newton iteration, retaining prior sampled stencil values. It matches seed-level resume and full restart candidates and evaluation counts. The observed time change is small and varies by run; domain-wide seeds still touch every tile and the tile path remains slower than bounded-volume search.

**Adaptive equilibrium prefetch.** Broad v3 searches whose predicted seed coverage spans most tiles and whose complete tile set fits in 64 MiB now fetch verified tiles in batches of up to 32. Smaller searches retain on-demand reads. [Measurements](scientific-source-grid-stencils.md#adaptive-equilibrium-tile-prefetch) show fewer host calls and faster first results on both 80³ and measured Burgers, with the same candidates and evaluation counts. Both still touch every tile and remain slower than bounded-volume search.

**Equilibrium sampler profile.** [Phase measurements](scientific-source-grid-stencils.md#equilibrium-sampler-profile) separate host transfer, verified cache admission, and search calculation. Reusing interpolation corner locations cuts calculation time on both fixtures while preserving candidate hashes, but tile admission and transfer dominate first-result latency.

**Electron equilibrium transfer profile.** [Full desktop measurements](scientific-source-grid-stencils.md#electron-equilibrium-tile-transfer-and-admission) include IPC, worker admission, calculation, first-result time, and renderer working-set change. V3 now transfers verified f64 tile bytes and uses native SHA-256 for the worker's independent hash check. In one Electron run, the vortex first result fell from 7.9 s to 0.45 s and measured Burgers from 3.1 s to 0.33 s. Candidate hashes, evaluation counts, provenance, tamper rejection, cancellation, and the 64 MiB cache limit are covered; v1/v2 keep their prior paths.

**SCI-13 bounded seed batches.** [Line, plane, and ring batches](scientific-source-grid-stencils.md#bounded-seed-batches) now have stable groups and saved view-only visibility. V3 runs each seed against a shared verified tile cache and retains completed seed results as later seeds request tiles. The 80³ oracle checks line endpoints; the measured Burgers desktop test covers group visibility, provenance, cancellation, and Project reopen. The document remains limited to 32 seeds and the worker cache to 64 MiB.

**SCI-13 slice seed placement.** [Verified slice click-to-seed](scientific-source-grid-stencils.md#slice-click-to-seed) converts XY/XZ/YZ clicks into physical coordinates, uses the displayed plane's fixed coordinate, and previews the point before a group is selected and the seed is committed. The 80³ orientation tests and measured Burgers Project round trip cover bounds, provenance, and saved placement.

**SCI-13 3D seed placement.** [3D click-to-seed](scientific-source-grid-stencils.md#3d-click-to-seed) casts the current camera ray onto an explicitly selected XY/XZ/YZ plane. The proposed physical coordinate and marker are shown before group admission; stale sources, invalid intersections, and the 32-seed cap are rejected. The 80³ camera-orientation checks and measured Burgers Project round trip cover placement and provenance.

**SCI-13 group management.** [Saved group names, colors, visibility, deletion, and bounded undo/redo](scientific-source-grid-stencils.md#seed-group-management) now cover seed and group edits. View-only changes retain verified source identity and live trajectories; group deletion changes the source and clears stale results. The 80³ field checks trajectory colors, and measured Burgers checks exact undo restoration, provenance, and Project reopen.

**SCI-13 spatial patterns.** [Bounded sphere, shell, and seeded random patterns](scientific-source-grid-stencils.md#spatial-seed-patterns) use physical center/radius controls, reject incomplete or out-of-bounds batches before admission, and keep the 32-seed document cap. The 80³ fixture checks coordinates and repeatability; measured Burgers checks undo/redo, source provenance, and Project reopen.

**SCI-14 point Inspector Jacobian detail.** The [expandable Jacobian and eigenvalue panel](scientific-source-grid-stencils.md#sci-14-jacobian-and-eigenvalue-detail) reuses the verified point stencil and shows matrix units, derivative method, real or complex eigenvalues, and uncertainty labels. The compact value, magnitude, divergence and curl remain visible. The 80³ oracle checks eigenvalues; the measured Burgers desktop check covers verified tile provenance, tamper rejection and Project reopen.

**SCI-14 Project result graph.** [Saved point calculus results](scientific-source-grid-stencils.md#sci-14-saved-point-results-and-project-lineage) now carry coordinates, source reference, method, verified sample hashes, Jacobian, eigenvalues, units, and confidence in a compact analysis envelope with an `analysis-of` relation. The Project browser links to the source and withholds stored numerical values; Field Explorer verifies the source stencil before displaying them. The 80³ oracle checks the saved numerical summary and link; measured Burgers checks persistence, provenance and changed-tile rejection after reopen.

**SCI-08 equilibrium eigenstructure.** [Full equilibrium eigenvalues and spiral classifications](scientific-source-grid-stencils.md#sci-08-equilibrium-eigenstructure) reuse each candidate's existing Jacobian and the Inspector eigenvalue calculation. The search reads no additional source samples. Analytic source, sink, saddle, spiral and degenerate fields check the labels; pinned 80³ and Burgers candidate geometry and evaluation counts check search parity. Burgers desktop checks retain verified tile provenance and changed-tile rejection.

**SCI-09 bounded speed isosurface.** [Field Explorer extraction and glTF export](scientific-speed-isosurface.md) use a physical clipping box, verified v3 tiles, a mesh budget and a saved regeneration recipe. The analytic sphere checks radius, normals and clipping; measured Burgers checks provenance, tamper rejection, cancellation and Project reopen.

**SCI-09 indexed mesh quality.** The [speed isosurface mesh](scientific-speed-isosurface.md) now stitches shared source-grid edge vertices and reports connected components, boundary edges and nonmanifold edges. The analytic sphere is watertight with outward normals; a clipped sphere and measured Burgers surface expose open clip-plane boundaries. The indexed glTF carries the same topology counts and verified tile provenance.

**SCI-09 Project Mesh promotion and rebuild.** Field Explorer can publish the indexed speed isosurface as a Mesh document and binary resource. The Project relation and Mesh origin retain the exact field generation, extraction recipe, source references, verified tile hashes, and topology metrics. Reopening rechecks required source tiles before declaring the Mesh current; changed tiles mark the saved Mesh stale. Mesh can rebuild with the saved level, clip, and budget through the verified extraction worker. A successful rebuild adds a revision and a current source relation while retaining the old resource in replay; cancellation or a failed required tile blocks publication and identifies the source to repair or relink.

**SCI-02 dataset choice.** The Graphs scientific import dialog lists every 3D dataset in the opened scene with shape, units, and an explicit Field Explorer eligibility result. Compatible three-component Cartesian velocity grids can be selected and opened directly. The dialog also shows the three bundled Explorer examples as separate scenes and can switch between them without returning to the preset menu. The preset picker offers a 3D Field Explorer filter with the small swirling example, the generated 80³ vortex, and the measured 47 × 85 × 55 Burgers treatment; the latter carries BCO-DMO CC BY 4.0 attribution. Reopening the Explorer in the same Graphs session keeps the last opened dataset as its source.

**SCI-04 automatic source check.** Opening a manifest-linked field in Explorer now starts the verified arrow preview automatically. The status names the scene and dataset and distinguishes verification in progress, checked preview samples, and a failed source. A changed first-preview overview leaves the 3D view empty; repairing the source and pressing **Verify & render arrows** retries. Reopening a saved field performs the same check.

**SCI-02 dataset library and linked field layers.** The Explorer left pane can browse another `.sscene` bundle and lists its compatible 3D datasets plus saved Project fields by kind, shape, unit and source. It can switch scene vector sources and show scalar or paired complex bounded volumes in the shared Explorer viewer; each entry reopens and verifies its saved source components before displaying values. Detailed field controls remain available from the selected layer. Multiple scene references now persist as a searchable metadata-only Project catalog, with source verification on Project reopen and explicit missing or changed states. Field arrays remain in external scene bundles. Combined overlays and linked cross-field selection remain open.

**SCI-02 built-in example scenes.** Five 3D choices—small swirling flow, quadratic scalar potential, paired complex wave, generated 80³ vortex and measured Burgers vortex—now open directly from the Explorer library without a folder picker. Portable copies of the three small examples live in `examples/scientific-scenes`; the development preset resolver and packaged desktop resources use those folders. The deterministic generator checks that they match the test fixtures. The larger examples retain their separately pinned generated and measured sources.

**SCI-02 linked physical probe.** Explorer keeps one physical point while switching vector, scalar and paired complex layers. Each displayed value comes from a fresh verified bounded transfer and is explicitly labelled as trilinear interpolation on that transfer; source IDs and checked sample hashes accompany it. Out-of-domain or unit-incompatible layers show no value. The point is saved as vector Explorer workspace state without changing source identity. The three small scenes and generated 80³ oracle check placement, value and domain behavior; measured Burgers checks the verified Project round trip.

**SCI-02 first combined overlay.** Explorer can place a raw scalar-field heatmap beneath planar vector arrows on XY/XZ/YZ slices. A vector pointing only through a plane has a signed normal-component marker. Scalar samples are interpolated at the vector slice's physical coordinates from a separately verified bounded transfer; incompatible axes or units and nonoverlapping domains withhold the overlay. The vector workspace saves the scalar source reference, visibility and opacity, not sample arrays. On Project reopen, the vector preview closes before the scalar source is opened and reverified. The small scalar/vector scenes and generated 80³ vortex check placement; a measured Burgers Project round trip checks provenance and rejects a changed vector tile.

**SCI-02 linked overlay line.** On any XY/XZ/YZ vector slice, a line through the shared physical probe compares a selected vector component or speed with a raw scalar field at the same physical coordinates. The bounded vector plane and scalar transfer remain in memory only after verification; separate units, sample hashes and domain gaps accompany the two profiles. The Project keeps the normal and varying axes, fixed physical point, vector quantity and visibility. Reopening re-verifies both sources before displaying either series. Small scenes and the 80³ analytic field check alignment; the Burgers Project round trip checks provenance and rejects changed source bytes.

**SCI-02 linked Graphs pair.** Field Explorer sends the verified scalar and vector line to Graphs as two point series in one edit, using the same physical x coordinates and explicit gaps. Each Graph series keeps its own unit and row hash and shares a pair ID, source document, scalar reference, physical line recipe, and both sets of verified sample hashes. Graphs rechecks both sources and tables, recomputes both rows, and withholds the pair until they match after Project reopen; a changed resource leaves the pair withheld with an Inspector explanation. Small-scene and 80³ values check alignment; the measured Burgers Project round trip checks provenance and tile tampering.

**SCI-02 linked physical rectangle.** On an XY/XZ/YZ combined slice, two clicks select opposite corners in physical coordinates. The saved Project recipe keeps the plane, rectangle, vector quantity and visibility; it stores no sample arrays. A fixed 17 × 17 lattice summarizes vector and scalar values at the same valid positions with separate units, availability counts and the fraction of selected area beyond the scalar domain. The summary appears only after the vector plane and scalar volume are freshly verified. The small scenes and 80³ field check coordinate placement; the measured Burgers Project round trip checks source links and withholds the summary when either source changes.

**SCI-02 rectangle across field layers.** The saved physical rectangle stays in the Explorer Inspector when a scalar or paired complex layer is selected. Its four planar bounds can be edited in physical units, including beyond the vector or selected field domain. Each freshly verified scalar or complex component reports its own mean, range, sample count, unit, source and verified sample hash on the same 17 × 17 positions; incompatible axes or coordinate units withhold values. Domain coverage and empty regions remain explicit. Reopening a Project retains the rectangle recipe and re-verifies the selected source before any layer summary appears.

**SCI-02 complex slice overlay.** A verified paired 3D complex field can supply magnitude or signed phase beneath planar vector arrows on XY/XZ/YZ slices. Both components are checked against the saved scene reference before the heatmap appears; phase uses a cyclic color scale and radians, while magnitude retains the field unit. The shared physical probe and rectangle remain on the same vector slice, and incomplete domain overlap leaves explicit gaps. Project saves only the complex pair references, mode, opacity and visibility. Reopening verifies the vector plane and both complex components before drawing or reporting aligned region values.

**SCI-02 complex linked line.** The overlay's saved physical line now compares vector speed or a selected component with complex magnitude or signed phase at the same XY/XZ/YZ positions. It shows separate units, domain gaps and checked hashes for the vector plane and both complex components. Phase discontinuities break the drawn line at the wrap. The Project keeps the line coordinates and display settings with the complex overlay recipe, then reverifies all three sources before showing the line on reopen.

**SCI-02 complex linked Graphs pair.** Field Explorer can now send that vector line and complex magnitude or signed phase to Graphs as two aligned series in one edit. A phase branch cut becomes a gap in the Graphs line. The saved Graphs origins carry the physical line, mode, separate units, vector source references and checked slice hashes, plus both complex component references and sample hashes. Project reopen recomputes the line after checking all three sources and the saved point tables; either plot and its analysis stay withheld when a source, row, or pairing changes. Existing scalar linked pairs retain their v1 format and verification path.

**SCI-02 linked region Graphs pair.** Field Explorer reduces each of the 17 physical columns in the saved rectangle over positions where both fields have valid samples. It sends vector and scalar or complex column means as two aligned Graphs point series in one edit. Empty columns and phase wraps remain gaps. The origin records physical bounds, separate units, source references, verified sample hashes and row hashes. On Project reopen, Graphs checks the full pinned resources and recomputes both profiles before showing either plot; a missing or changed source or point table withholds the pair.

**Do not start with SCI-11/SCI-17** (huge importer/backend and volume-rendering expansion). First stabilize dataset contracts and demonstrate cross-module coherence.

---

## 18. Future research / optional extensions

These are valuable after the core and release gates, not prerequisites:

- **Stream surfaces and streak surfaces:** seeded surfaces advected through velocity fields.
- **Topological field analysis:** separatrices, invariant manifolds and structurally stable classifications with qualified numerical confidence.
- **Adaptive mesh refinement:** multiresolution tiles/bricks and error-targeted field exploration.
- **Curvilinear and geospatial coordinates:** CRS, geographic projections and basis transforms for vector data.
- **Tensor fields:** eigenvector tracking, anisotropy and ellipsoid glyphs.
- **Uncertainty fields:** ensemble mean/variance, confidence bands and uncertainty-aware glyphs/streamlines.
- **Simulation comparison:** two field revisions, difference maps, RMS metrics and overlay reports.
- **Time-series analytics:** probes over time and field evolution animations.
- **Finite-element association:** node/cell fields with mesh topology, interpolation and conservation diagnostics.
- **Notebook/Workbook publishing:** export reproducible visual analyses and mathematical explanations.
- **Multi-resolution remote computation:** server-side data reduction and selective 3D streaming for very large volumes.
- **Shader-based advanced rendering:** optional GPU streamlines and accelerated volume techniques, with fidelity cross-checks against CPU references.

---

## 19. Final milestone recommendation

- **Milestone M1 (correctness):** SCI-01, SCI-03 and schema/oracle tests.
- **Milestone M2 (visible product):** SCI-02, SCI-04, SCI-07 and a fully linked vortex field demonstration.
- **Milestone M3 (mathematics):** SCI-05, SCI-06, SCI-08, SCI-12 with documented tolerances.
- **Milestone M4 (interoperability):** SCI-10, SCI-18, SCI-20 for Python/Theory Lab/project round-trip.
- **Milestone M5 (advanced backend):** SCI-09, SCI-11, SCI-17, SCI-21 and SCI-22 as optional capabilities.
- **Milestone M6 (release):** SCI-13–SCI-16, SCI-19, SCI-23, SCI-24 as relevant and appropriately staged.

**Guiding principle:** one source dataset, many mathematically consistent views and derived results, with verifiable numerical methods and no unnecessary application bloat.
