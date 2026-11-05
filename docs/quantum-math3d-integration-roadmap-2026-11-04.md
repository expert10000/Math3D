# Quantum Hamiltonian Lab × Math3D
## Scientific Integration, Architecture and Development Roadmap

**Date:** 2026-11-04<br>
**Programme:** MATH3D-2026 / Theory Lab / Python Scientific Runtimes<br>
**Status:** reviewed candidate for future QI work; existing bounded QLAB/QVIS/M3D-Q/SSR delivery is recorded separately below<br>
**Scope:** standalone Quantum Hamiltonian Lab, Python backend, verified scientific artifacts, Math3D quantum scene handler, shared scientific workspace and future scientific-runtime integration<br>
**Review basis:** Math3D `origin/main` at `a5af9483`; Theory Lab `main` at `3c883fa4`; current source, project roadmaps and the SHA-256-checked visual review archive

**QI-04–06 QWZ implementation note (2026-11-04):** Theory Lab now has versioned QWZ scene recipes with byte-stable golden manifests. Math3D persists reciprocal same-result links for two scene documents and opens a relocated content-addressed `.qpack` through the Project panel. See [`qwz-scene-recipes.md`](https://github.com/expert10000/theory-lab/blob/main/docs/qwz-scene-recipes.md) and [`quantum-qi05-06-project-portability.md`](quantum-qi05-06-project-portability.md). Model-wide recipe admission, scientific-scene pack members and general artifact lifecycle remain later work.

---

## 0. Executive direction

Develop **one scientific workflow spanning independent applications**, not one oversized application:

1. **Quantum Hamiltonian Lab (Theory Lab)** owns physical models, parameter editing, experiments, solver choices, validation, scientific interpretation and immutable runs.
2. **Python scientific runtime** executes numerical work (NumPy, SciPy, QuTiP and specialized engines); it is not coupled to UI widgets.
3. **Result and artifact layer** preserves typed numerical arrays, units, basis conventions, provenance, validation results and immutable content hashes.
4. **Scene compiler** creates deterministic, versioned visual interpretations of results, independently of a particular renderer.
5. **Math3D** owns interactive spatial visualization, field/surface/curve/mesh tools, scene composition, workspaces, cameras, picking, presentation and project persistence.
6. **DevShell / scientific runtime manager**, optionally later, handles environment setup, diagnostics, runtime discovery, command execution and test harnesses—not physical meaning or rendering.

**Primary principle:** results are scientific facts produced by a particular calculation; scenes are reproducible projections of those results; views are mutable presentation state. Never conflate these layers.

```text
Quantum Hamiltonian Lab (authoritative science UI)
  ModelSpec → ExperimentSpec → RunRequest
                         │
                         ▼
       Python Scientific Runtime / Job Manager
       NumPy · SciPy · QuTiP · optional engines
                         │
                         ▼
               quantum-run/v2
               quantum-result/v2
               immutable artifact blobs
               validation + provenance
                         │
                         ▼
                 Scene Compiler
        recipe + datasets + coordinates + units
                         │
                         ▼
         existing quantum-scene/v1|v2
       future version only by contract decision
                         │
            ┌────────────┴──────────────┐
            ▼                           ▼
     Theory Lab previews         Math3D scene registry
                                 field / lattice / band /
                                 curve / volume / topology
                                         │
                                         ▼
                                  Math3D Project
                               QuantumSceneDocument
                               QuantumStudyDocument
                               linked Field/Surface/etc.
```

**Do not:** make Math3D a second QuTiP host; put numerical scientific algorithms in React components; bind Python services to particular Three.js panels; silently alter source data on import; equate UI changes with scientific derivations; break verified `quantum-scene/v1|v2` imports during migration.

### 0.1 Baseline grounded in the 2026-11-04 review

The supplied review archive describes **58 direct Electron Theory Lab screenshots** (source `3c883fa`) and **46 direct Electron Math3D screenshots** (source `12366f6c`): 36 pinned scenes and 10 orbital view variants. Its manifest records screenshot SHA-256 hashes. This is *visual and smoke-run evidence*, not a substitute for a repository audit or fresh numerical certification.

Features represented in the screenshots/review and previous integration include existing compute/run workflows, a Python-backed desktop application, saved run exploration, compare/linked-science workflows, verified read-only scene consumption, provenance inspection, and examples including QWZ, SSH, Rice–Mele, BHZ, BBH, Kitaev, Weyl/nodal rings, Landau levels, Hofstadter and hydrogenic orbitals. Keep these screen states as visual references, map each to an executable fixture where possible, and confirm exact APIs and schema details in source before migration.

### 0.1.1 Source reconciliation and remaining delta

The 2026-11-04 source check used Math3D `a5af9483` and Theory Lab `3c883fa4`, not screenshots alone. The supplied review ZIP has 58 Lab and 46 Math3D PNGs; all 104 image files match their manifest hashes. The archive's Math3D revision label `12366f6c` is not present in the fetched Math3D history used for this audit, so the archive proves the captured pixels and labels, while the current repository establishes implementation status. These QI IDs describe **new deltas** and do not reopen completed, bounded M3D-Q, QLAB-UI, QVIS or SSR milestones.

| Boundary | Observed in source or current program record | Remaining QI work |
|---|---|---|
| Scene interchange | Theory Lab owns strict `quantum-scene/v1` and the existing **narrow** `v2` 1D reciprocal extension in `packages/quantum-scene`; Math3D admits both read-only with independent checks. | Freeze parity before any new scene major. Do not reuse the existing `v2` name for the broad scene design in §4.3. |
| Saved results | Theory Lab has operation-specific `quantum-result/v1` contracts and verified saved runs. Its QLAB-UI-1–8 linked workspaces and QVIS-014–022 cover declared bounded operations. | Design a dataset-oriented `quantum-result/v2` as an additive producer contract with explicit `v1` adapters and exact-output comparisons. |
| Math3D project | `math3d.quantum-scene-document` schema version 1 already admits compact, read-only external scene references. `QuantumSceneDocument` separates source fingerprint from local directory and re-verifies before activation. | Extend the existing type and project graph for multiple scenes, links and view state; migrate only with an explicit versioned adapter. |
| Two-app handoff | QVIS-023 and M3D-Q09 already open a verified `.qscene` in Math3D and reopen its exact source run in a selected local Lab checkout. The current transport is a folder and one-use run identity. | Add installed-app discovery, study opening and an explicit fork/new-run protocol. A URL scheme or broker is a later decision. |
| Generic science path | Math3D's `scientific-scene/v1` SSR proof, standalone Python publisher, bounded desktop import and Project link already exist. Field Explorer is a separate native scientific workspace. | Reuse the quantum verifier and native field tools; align with SSR contracts where mappings are explicit. Prove a quantum-to-field adapter for one real source without creating a second generic importer or promising editable source data. |
| Portability | Current Math3D quantum Project references retain a local `.qscene` directory and exact fingerprint; relinking accepts an exact-hash copy. | Add content-addressed resolution or a portable Project pack. Moving an existing link alone is not yet portable opening. |

Evidence: [Math3D quantum program](math3d-quantum-integration-roadmap.md), [v0.1 freeze](math3d-quantum-v0.1-freeze.md), [Project links](quantum-scene-project-links.md), [SSR program](scientific-scene-runtime-roadmap.md), and Theory Lab's [scene contract](https://github.com/expert10000/theory-lab/blob/main/docs/QUANTUM_SCENE.md), [handoff](https://github.com/expert10000/theory-lab/blob/main/docs/SCENE_HANDOFF.md) and [linked workspace roadmap](https://github.com/expert10000/theory-lab/blob/main/docs/QLAB_LINKED_WORKSPACE_ROADMAP.md). Verify an upstream API against its versioned source and executable tests when implementing it; the cross-repository design below is still a proposal.

### 0.1.2 First new vertical slice and stop conditions

1. Pin one existing QWZ run and its bands/curvature pair, recording exact `quantum-result/v1` identity, `quantum-scene/v1` bytes and accepted numerical checks. This is an inventory/parity gate, not a new renderer.
2. In Theory Lab, produce a proposed `quantum-result/v2` descriptor or sidecar for that same run. Assert values, units, axes, ordering and source hashes against `v1`; do not regenerate a missing observable.
3. Compile the two views from one immutable result identity and compare their scientific samples with the pinned scenes. If the existing scene schema can express them, emit the existing schema; request a new scene version only for a demonstrated incompatible field.
4. In Math3D, attach both through the existing read-only `QuantumSceneDocument` path, preserve their separate scene fingerprints, and save/reopen them beside one native document. A missing or changed source must still fail closed.
5. Stop this slice if Lab and Math3D disagree on a coordinate, unit, source hash or validation status. Record the mismatch before adding field promotion, cross-app cursors, remote execution or a broker.

The exit artifact is a small fixture/contract matrix with the producer commit, consumer commit, hashes, schema versions, numerical assertions, source-open behavior and Project reopen result. This narrows the first integration gate without changing the longer QI-01–QI-40 plan.

### 0.2 Success criteria

- One immutable numerical run can generate several scene recipes and many mutable views without recomputation.
- Opening any scene in Math3D exposes its source run, dataset hashes, coordinates, units, numerical conventions and validation state.
- One project can contain quantum scenes, generic fields, geometry, curves, meshes, notes and workbooks while retaining relationships.
- Math3D can request *new work* through Theory Lab without becoming a numerical authority.
- A scene can be re-opened on another installation without relying on the originating Windows drive letter.
- Links between plots, time frames, spatial points, eigenstates and bands are scientific-coordinate aware.
- Preview/incomplete output is never represented as verified data.
- Every model- or renderer-specific extension uses stable contracts, tests and explicit compatibility rules.

---

# Part I — Boundaries, domain model and shared contracts

## 1. Formal responsibilities and forbidden dependencies

| Component | Owns | Must not own |
|---|---|---|
| Theory Lab | Hamiltonian catalog, parameters, run history, experiment orchestration, physical interpretation, diagnostics | Math3D renderer internals |
| Python worker | Solvers, observables, numerical validations, deterministic data generation | Camera state, React/Electron menus, project layout |
| Artifact store | Content hashes, manifests, blob lookup, deduplication, portable export | Solver semantics, UI state |
| Scene compiler | Dataset-to-geometry mappings, scene recipes, coordinate/semantic normalization | Interactive camera/panel state, eigenvalue calculation |
| Math3D | Viewers, 3D composition, picking, clipping, project graph, generic geometry/field tools | Quantum model authority, hidden numerical recomputation |
| DevShell | Environment installation, runtime diagnostics, provisioning and reproducible test execution | Scientific truth, application-specific visual semantics |

Define dependency tests prohibiting e.g. `Math3D/ui → qutip` or `backend/models → three.js`. Keep shared contracts free of Electron, Python process APIs and renderer types.

## 2. Core entity graph: model → run → result → recipe → scene → view

Distinguish:

- **ModelDefinition:** versioned scientific model, parameter schema, operator construction and basis conventions.
- **ExperimentSpec:** solver configuration, sweep/time grid, requested observables and convergence plan.
- **Run:** immutable execution identity, parameters, environment, outcome and error/status record.
- **Result:** immutable typed datasets and physical observables; one run may yield many datasets.
- **DerivedArtifact:** deterministic scientific transform (for example ψ → |ψ|², eigenvectors → localization metric), with algorithm/version/parameters.
- **SceneRecipe:** declarative mapping from source/derived datasets to semantic renderables.
- **SceneBundle:** portable/versioned compiled scene plus references to immutable data.
- **ViewState:** mutable camera, selected slice, colormap, opacity and visibility settings.
- **Study:** related runs, scenes and synchronized selections, usually for one scientific question.
- **Link:** typed provenance or association edges connecting documents and entities.

Relationships must be many-to-many where scientifically needed. A run can produce several scene bundles; a scene may refer to multiple datasets; a study can contain multiple runs; a generic FieldDocument can be derived from a quantum result without copying its meaning into the geometry model.

## 3. `packages/quantum-contracts`

Suggested structure (adapt names to existing monorepos; a published package or generated schema is acceptable across repositories):

```text
packages/quantum-contracts/
  src/
    ids.ts
    schemas/
      run.v2.schema.json
      result.v2.schema.json
      scene.v2.schema.json
      link.v1.schema.json
      study.v1.schema.json
      cursor.v1.schema.json
    types/
      models.ts
      datasets.ts
      units.ts
      coordinates.ts
      jobs.ts
      provenance.ts
    validators/
    migrations/
    canonicalization/
    fixtures/
  python/
    generated_models/
    validation/
  tests/
    contract/
    cross_language/
```

The Lab already owns `packages/quantum-scene` and `packages/contracts`; Math3D has its own independent scene validator and Project document. The suggested new package is a distribution option for **new** run/result/link/study contracts, not a relocation or rewrite of the frozen scene schemas. Decide ownership, generation and publication in ADR 1 before creating it.

Prefer JSON Schema (or another single source of truth) with generated TypeScript/Python models. Compare semantic canonicalization and hashes across runtimes. **Do not hash ordinary pretty-printed JSON**: define canonical property ordering, stable numeric encoding, Unicode normalization, special floating-point handling, endian conventions and blob-level hash rules.

## 4. Proposed versioned contracts

### 4.1 `quantum-run/v2`

This would extend the Lab's existing `quantum-result/v1` saved-run identity; it is a proposed contract, not the current run format. It must carry `runId`, `modelId`, `modelVersion`, parameters, parameter units, solver identity/version, requested outputs, numerical tolerances, grid, random seeds, timestamps, terminal outcome, parent run (if any), environment fingerprint and validation summary. Execution-state updates can remain mutable operational records, but once finalized, the scientific run manifest is immutable.

### 4.2 `quantum-result/v2`

Theory Lab currently stores operation-specific `quantum-result/v1` values. The proposed `v2` separates reusable typed datasets from scene presentation; an adapter must preserve all recorded `v1` values and identify unavailable data explicitly. Dataset descriptors should specify:

```ts
type QuantumDatasetRole =
  | 'scalar-field' | 'complex-field' | 'vector-field'
  | 'spectrum' | 'band-surface' | 'trajectory'
  | 'lattice-sites' | 'lattice-edges' | 'density'
  | 'operator' | 'time-series' | 'topological-invariant'
  | 'parameter-sweep' | 'probability-current'
  | 'correlation' | 'entanglement' | 'measurement-record';

interface DatasetDescriptor {
  id: string;
  role: QuantumDatasetRole;
  shape: number[];
  dtype: string;
  byteOrder: 'little' | 'big' | 'not-applicable';
  storage: { uri: string; sha256: string; format: string };
  axes: CoordinateAxis[];
  quantity: { name: string; unit?: string; semantics?: string };
  basis?: BasisConvention;
  normalization?: string;
  provenance: DerivationRef;
  validation?: ValidationRef[];
}
```

Define complex encoding explicitly (interleaved real/imaginary or paired arrays); never infer from shape. Clarify missing values, NaNs, infinities, sparse storage, eigenvector gauge ambiguities, ordering degeneracies and flattening order.

### 4.3 Future scene extension (version to be assigned)

`quantum-scene/v2` already exists as Theory Lab's narrow 1D reciprocal extension and is already read by Math3D. Do not repurpose that name or relax its meaning. A broader scene contract should first try a new recipe/manifest referencing existing `v1|v2` scenes. If a new scene schema is necessary, assign a new version after producer/consumer review and keep both current readers. The extension would reference dataset IDs, semantic renderable types, recipe version, optional derived artifacts, coordinate transforms and recommended initial camera. Camera interaction and UI panel state remain separate. Include required capabilities and graceful fallbacks; prove fixture-based parity before any migration.

### 4.4 `quantum-link/v1`

Support relations such as `derived-from`, `computed-by`, `rendered-from`, `belongs-to-study`, `compares-with`, `selected-from`, `opened-from`, `attached-to-project` and `forked-from-run`; preserve role-specific metadata, identifiers and hashes.

### 4.5 `quantum-study/v1` and `scientific-cursor/v1`

Studies group runs/observables, preferred layouts and synchronization domains. Cursor updates identify stable **scientific coordinates**, not only array indices; see Part V.

## 5. Source / Derived / Display policy

| Class | Example | Immutable? | Where computed? | Provenance |
|---|---|---|---|---|
| Source | eigenvectors, ψ grid, bands, Berry curvature, raw density matrix | yes | scientific runtime | run + dataset hash |
| Derived | isosurface, |ψ|², phase, localization metric, integrated field | yes once materialized | approved derive service or deterministic client algorithm | source hashes + algorithm/version/parameters |
| Display | camera, colormap, opacity, clips, visible layers, highlighted selection | no | Math3D | view-state revision |

**Important distinction:** a temporary GPU texture or transient render buffer is a cache, not an authoritative scientific derivation. An isosurface extracted from fixed data with a fixed algorithm and threshold is a derived artifact. A time slider changing which recorded frame is displayed is view state, not a new run.

## 6. Coordinates, units and basis conventions

Formalize both display-coordinate systems and scientific-coordinate systems:

- Real space: Cartesian, curvilinear, atomic units (Bohr radius), SI units or lattice coordinates.
- Reciprocal space: reciprocal basis vectors, normalized k-units, Brillouin-zone periodicity, Γ/high-symmetry points and orientation.
- Lattice/graph: site identities, unit cells, boundary conditions, sublattices and embedding coordinates.
- Quantum states: Hilbert-space dimension, tensor-factor order, spin basis, Nambu/BdG order, normalization and gauge conventions.
- Time: physical time unit, solver time grid, irregular samples and event timestamps.
- Energies: eV/J/normalized units, zero/reference energy and ℏ convention.
- Bloch conventions: Fourier sign, reciprocal basis ordering and gauge handling.

Validate unit compatibility before overlays/compares. Permit *dimensionless model units* but require an explicit explanation rather than a blank unit field. Reject silent conversion of `k/a` into `k` or real-space Å into Bohr without explicit scale factors.

---

# Part II — Artifact persistence, transport and reproducibility

## 7. Immutable, content-addressed artifacts

Introduce a logical URI such as `artifact://sha256/<digest>` and an application-independent resolver; the physical cache might use `objects/sha256/ab/cd...`. Never persist user-specific absolute paths as the sole artifact identity.

Support:

- **Thin bundle:** manifest referencing artifacts known to a shared local store.
- **Portable bundle:** manifest plus all required, verified blobs and license/attribution metadata where relevant.
- **Project pack:** Math3D project with selected quantum scenes and optional embedded portable artifacts.
- **Read-only import:** no source rewrite; verify each hash before marking trustworthy.
- **GC:** reference counting or mark-and-sweep over pinned runs, projects and snapshots; dry-run first, quarantine and recovery window.
- **Collision/corruption handling:** fail closed, do not silently replace bytes sharing an identifier.
- **Version-aware caches:** renderer cache separately from source dataset blob cache.

Bound download/scan size, enforce relative path normalization and defend portable importers against zip-slip, decompression bombs and malformed manifests. Validate every length/shape before allocating GPU buffers.

## 8. Streaming and transport

Use JSON or an equivalent compact control protocol for job commands, progress and manifest metadata. Keep large tensors in typed binary artifacts, chunked storage or explicit shared-memory channels. Candidate formats can include NPY/NPZ for simple typed arrays, HDF5 or Zarr-like chunking for large structured datasets, and Arrow where tabular access is appropriate. **Choose by actual requirements and benchmarks**, not by a premature commitment to one format.

A safe transfer should include `datasetId`, byte count, shape, dtype, hash, chunk index/count, compressed format, finalization marker and retry policy. Require backpressure, cancellation, chunk verification and bounded memory usage.

## 9. Reproducibility manifest

Record Python, NumPy, SciPy, QuTiP, solver/plugin versions, model commit, OS/architecture, BLAS/LAPACK, dtype, device, algorithm, tolerances, seeds, thread settings, relevant environment variables and optional GPU/driver details. Reproducible metadata does not guarantee bitwise reproducibility; label validation as **bitwise-identical**, **numerically equivalent within tolerance**, or **scientifically consistent**.

Job cache keys must include normalized scientific inputs *and* code/algorithm versions. Do not reuse an old cached result when a model convention or solver version has changed. Distinguish a cache hit from a newly executed run in UI and provenance.

## 10. Compatibility and migrations

- Preserve both existing `quantum-scene/v1` and narrow `v2` readers and pin the 104 reviewed screenshot bytes as visual references, with executable source fixtures separately inventoried.
- If a new scene major is approved, add explicit `v1|v2 → new-version` adapters with warnings for unavailable fields; never fabricate missing physical units or a verified hash.
- Maintain migration golden files and reverse-compatibility test matrix.
- Apply migrations to a **copy**, leaving original portable artifacts untouched.
- Set a minimum compatibility period before deprecating old formats.
- Add a diagnostic CLI: `inspect`, `verify`, `migrate --dry-run`, `pack`, `unpack`, `diff`, `doctor`.

---

# Part III — Math3D project and rendering architecture

## 11. Extend the existing `QuantumSceneDocument`

Math3D already has `math3d.quantum-scene-document` schema version 1 in `packages/core/src/quantumSceneDocument.ts`. It holds a read-only source descriptor, scene fingerprint, local directory and title, and Project activation re-verifies external bytes. Add relations and mutable views without changing that saved shape silently. One possible **separate Project record**, pending an ADR, is:

```ts
interface QuantumSceneProjectExtension {
  documentId: string;        // existing Math3D document identity
  studyIds: string[];        // optional grouping, not source ownership
  relationIds: string[];     // typed links to runs, results and other scenes
  viewStateId?: string;      // mutable Project display record
}
```

Add links and view state through a reviewed document version or separate Project records, preserving the schema-version-1 reader and exact-fingerprint relink. Integrate with the existing `Math3DProject`/`ProjectDocument`, document lifecycle, selection, rename/duplicate, reversible deletion, notes, workbooks, viewer routing and undo/redo rules. A project may hold multiple quantum scene documents and ordinary geometry/mesh/field documents together. Ensure saving/reopening restores source identity, layout and camera without mutating scientific data.

## 12. `QuantumStudyDocument`

A Study captures a scientific question spanning several runs/views, for example:

```text
Hofstadter Study
├── butterfly spectrum
├── magnetic bands
├── bulk Chern numbers
├── finite strip modes
├── edge-state tracking
├── Hall response
└── convergence + validation
```

Store study membership, scientific selections, cross-plot link rules, normalized comparison context and optional layout template. A study is **not** a new solver, and scenes should remain separately reusable outside the study.

Suggested study templates: QWZ topological transition; SSH bulk-boundary; Rice–Mele pumping; Hofstadter bulk-edge-Hall; hydrogen orbital anatomy; dissipative qubit; Jaynes–Cummings dynamics; surface-code syndrome history.

## 13. Modular semantic handler registry

```text
QuantumSceneHandler (orchestrator only)
  ├─ ScalarFieldHandler → Field Explorer
  ├─ ComplexFieldHandler → complex-field views
  ├─ VectorFieldHandler → arrows/streamlines
  ├─ DensityHandler → volume/slice/isosurface
  ├─ BandSurfaceHandler → Surface/Graph
  ├─ SpectrumHandler → Graph
  ├─ LatticeHandler → Geometry/Graph
  ├─ TrajectoryHandler → Curve
  ├─ CorrelationHandler → field/matrix plot
  ├─ TopologyOverlayHandler → integration geometry
  └─ TimeSeriesHandler → synchronized animation
```

Handler contract: `canHandle(dataset, scene, capabilities)`, `validate`, `createRenderPlan`, `applyView`, `pickToScientificCoordinate`, `dispose`. Separate data adaptation from GPU resource allocation. Use bounded caches, lifecycle diagnostics, stable selection IDs, and explicit graceful degradation for unsupported renderables.

## 14. Promote into native Math3D documents

Add reversible, provenance-preserving commands:

- `Promote to FieldDocument`: Berry curvature, |ψ|², complex ψ, probability current.
- `Promote to SurfaceDocument`: dispersion surfaces, isosurfaces and Berry-curvature height maps.
- `Promote to CurveDocument`: Bloch trajectories, Wilson-loop spectra, parameter traces.
- `Promote to GeometryDocument`: lattices, unit cells, Brillouin-zone geometry and nodes.
- `Promote to MeshDocument`: extracted spatial surfaces or sampled structures.
- `Promote to GraphDocument`: spectra, time series, response and convergence plots.

Original dataset and provenance edges remain intact; native document edits must not quietly rewrite the origin. Explicitly label whether editing changes only presentation geometry or creates a scientifically derived object. Reuse the existing Field Explorer rather than developing a competing “quantum field explorer”.

## 15. Composed scenes

Support more than one document visible in the same viewport:

```text
QWZ Berry curvature + Brillouin-zone mesh + k-path + integration region
Hydrogen |ψ|² volume + isosurface + nodal planes + spatial cursor
Weyl node + enclosing sphere + Berry flux arrows + path
Lattice geometry + edge-state amplitude + spectra selection
```

Composition requires coordinate transforms, units, collision-aware labels, z-fighting handling, shared clipping planes, per-layer visibility, depth rules and source-specific picking. Reject overlays whose coordinate systems are incompatible unless the user supplies a declared transform.

## 16. Math3D UI: quick viewer plus docked scientific workspace

Preserve fast open/import modal. When attached to a project, expose a docked inspector organized as:

**View** — representation, camera, slices, opacity, transfer function, surface threshold, timeline and layer visibility.<br>
**Data** — dataset list, dimensions, types, numeric ranges, resolution, sampling, coordinates and missing-value masks.<br>
**Science** — model, equations/parameters, selected band/state, physical interpretation, relevant invariants, convergence warnings.<br>
**Provenance** — source run, engine, environment, recipe version, manifest/blob hashes, validation results, export/open-source actions.

Offer compact and expanded modes; avoid flooding the main viewport with full SHA hashes. Make full hashes copyable. Persist panel layout as display state. Provide keyboard navigation, clear loading/error/empty states, GPU capability warnings and high-DPI testing.

---

# Part IV — Bidirectional workflows and runtime lifecycle

## 17. Theory Lab → Math3D

Commands:

```text
Open observable in Math3D
Open complete study in Math3D
Attach scene to existing Math3D Project
Create Math3D Project from run
Open selected view variant
Export portable scene
```

Keep the working verified `.qscene` folder handoff as the first path. A future deep link may carry an identifier only, e.g. `math3d://quantum/<scene-id>`; pass complex requests through an authenticated local IPC/broker and validate the target application identity. Detect installed app version/capability before sending. On failure, offer portable export with complete dependency data.

## 18. Math3D → Theory Lab

Commands:

```text
Open source run
Open corresponding observable
Fork run with modified inputs
Request recomputation
Compare against selected run
Reveal numerical validation
```

The existing **Open source run in Theory Lab** action already resolves an exact run ID and expected result hash through a selected local checkout. Extend that path for observables and explicit forks. Recompute is an orchestrated **new run**, never hidden mutation of old blobs. Link the new run to its parent and preserve the earlier scene. If Theory Lab is not running, opening the application or showing a portable fallback is better than silently failing.

## 19. Local Scientific Integration Bus

Consider this *after* stable file handoffs; add deep links only if a bounded use case needs them. Do not make a broker a prerequisite for portable files. Broker duties:

- application and runtime discovery; supported contract/capability negotiation;
- request/response for opening resources and submitting work;
- job progress, completion, cancellation and error events;
- artifact publication and lookup notifications;
- cross-app selection broadcast with loop prevention;
- health checks, tracing correlation IDs and diagnostics.

Do not let the broker own Hamiltonian code or scene rendering. Require local transport authorization, request provenance, payload size limits, allowlisted resource types, no arbitrary shell-command execution, explicit consent before running remote/untrusted workloads and no blind forwarding of untrusted deep links.

## 20. Python backend model registry

```text
ModelSpec
  parameters + constraints
  Hamiltonian builder
  basis/units/conventions
  supported solvers
  available observables
  validators
  result adapters
  default scene recipes
```

Introduce `EngineAdapter` implementations for NumPy, SciPy, QuTiP, sparse solvers and experimental acceleration. A model declares computational capabilities independently of its UI. Solver configuration should include exact tolerance semantics and state truncation/cutoffs where relevant. Distinguish model validity, solver convergence and visualization validity.

## 21. Worker API and states

Minimal commands: `startJob`, `getStatus`, `subscribeProgress`, `cancelJob`, `getResultManifest`, `getArtifact`, `shutdown`, optionally `pause` only for engines that truly support checkpointing.

State machine:

```text
created → queued → running → finalizing → verified → published
                 ↘ failed
                 ↘ cancelled
                            finalizing ↘ validation-failed
```

Preview may be published from running jobs, but only finalized, validated outputs may reach `verified`. Make cancellation cooperative with a watchdog for stuck workers. Use job IDs, monotonic sequence numbers, retries for idempotent commands, resource quotas and process-group cleanup.

## 22. DevShell integration

DevShell should provide scientific runtime profiles, WSL/Windows/Python environment discovery, QuTiP/NumPy/SciPy probes, dependency verification, benchmark scripts, job log inspection and artifact-store diagnostics. It should **not** become a required dependency for normal end-user startup. Support `doctor` reports and one-click diagnostic bundles with secrets and local user paths redacted.

## 23. Remote / WSL / Docker later

Abstract execution location separately from scientific job definition. Support local Windows Python first; then WSL, Docker and remote workers as adapters with the **same** contracts. Ensure cancellation, artifact synchronization, path normalization, network failure semantics and trusted-environment identification before claiming parity. Treat remote execution as an opt-in capability, not a prerequisite for the desktop app.

---

# Part V — Scientific interaction, studies and comparisons

## 24. Shared Scientific Cursor

```ts
interface ScientificCursor {
  studyId?: string;
  runId?: string;
  datasetId?: string;
  time?: { value: number; unit: string; sampleIndex?: number };
  reciprocalPoint?: { k: number[]; basisId: string; bandId?: string };
  spatialPoint?: { xyz: number[]; coordinateSystemId: string };
  latticeSiteId?: string;
  eigenstateId?: string;
  parameterPointId?: string;
  originViewId?: string;
  sequence?: number;
}
```

Indices alone are insufficient for comparisons involving different sample grids. Prefer physical coordinates and stable eigenstate/band matching identities. Where matching is ambiguous (crossings, degeneracies, Wilson-loop branch choices), expose uncertainty and a selection strategy instead of pretending exact correspondence.

Examples:

- click band point → synchronize (kx,ky), Berry curvature, Bloch vector and state inspector;
- choose Hofstadter strip level → highlight edge localization and related gap/response;
- click hydrogen volume → update orthogonal slices, ψ, |ψ|² and phase at that point;
- drag time → synchronize Bloch sphere, density matrix, populations, fields and drive waveform;
- select sweep parameter → update all study views and show whether their runs are comparable.

Implement cursor ownership, event origin, debouncing, no feedback loops, undo rules and coordinate conversion tests.

## 25. Run comparison and A/B science

Create a `ComparisonDocument` or Study comparison mode (whichever fits existing Math3D project patterns) with:

- side-by-side and overlay views;
- parameter and engine diffs;
- common-unit and common-grid checks;
- absolute/relative field differences, residual heat maps, extrema and norms;
- band alignment and degeneracy-aware matching;
- time-grid resampling with explicit interpolation method;
- uncertainty and validation summaries;
- provenance and comparable/non-comparable badges (not misleading visual color alone).

Do not subtract unaligned eigenvectors as if gauge-invariant. For phase-sensitive comparisons, require declared gauge alignment or use gauge-invariant observables/projectors.

## 26. Time-dependent scenes

Define an explicit time-axis schema (uniform/irregular, physical units, frame references, optional streaming). Viewer features: play/pause, speed, loop, scrub, keyframes, frame caching, adaptive resolution and synchronized plots. Separate **playback frame rate** from **solver sampling interval** and never interpolate a discontinuous measurement trajectory without declaring interpolation. Display a clear “solver output ended” indication for streams.

## 27. Preview versus verified

Use explicit lifecycle labels:

- **PREVIEW:** partial/unverified, lower resolution, may be replaced, not durable evidence;
- **VALIDATING:** computation ended, checks running;
- **VERIFIED:** final artifact integrity and defined validation gates passed;
- **FAILED/CANCELLED:** preserve diagnostics without promoting data as final.

`VERIFIED` means verified under stated checks, not that a physical model has been experimentally confirmed. Cache previews separately; promote to final only via an atomic manifest transition.

## 28. Parameter sweeps and phase diagrams

Make parameter sweeps a typed dataset rather than disconnected runs:

```text
parameter axes
points/runs
observable arrays
convergence mask
phase labels or invariants
uncertainty/error fields
source-run links
```

Provide 1D/2D interactive heatmaps, parameter-plane surfaces, slice controls, selected-point opening into full 3D state and adaptive sweep refinement. Example: QWZ mass vs Chern number/gap; SSH intracell/intercell ratio; Kitaev chemical potential; Hofstadter flux vs energy; Landau field vs level energies; Lindblad damping vs steady-state fidelity.

---

# Part VI — Scientific visualization expansion

## 29. Hydrogenic wavefunctions and complex volumetric fields

Extend existing 1s/2s/2p/3p/3d scene variants with:

1. GPU ray-marched volume rendering (capability-dependent fallback) and transfer-function editor.
2. Multiple simultaneous isosurfaces, clipping boxes and nested shells.
3. Signed amplitude: positive/negative lobes with a consistent diverging colormap and zero nodes.
4. Phase-colored surfaces: geometry based on |ψ| or density, hue from `arg(ψ)`; distinguish global arbitrary phase from physically meaningful relative phase.
5. Nodal surfaces/lines and radial/angular decomposition.
6. Orthogonal slice planes, crosshair and density probes.
7. Radial probability plots including proper Jacobian weighting and normalization checks.
8. Probability-current vectors for appropriate complex states.
9. Comparison between orbitals on a shared scale and coordinate system.
10. Resolution/accuracy controls, bounding box metadata and normalization error display.

Use hydrogen orbitals as generic Field Explorer certification fixtures, not a one-off renderer. Avoid asserting a physical phase interpretation when the state is real up to a global phase.

## 30. Topological and condensed-matter scenes

For QWZ, SSH, Rice–Mele, BHZ, BBH, Kitaev, Weyl/nodal, Landau and Hofstadter families, extend with:

- Brillouin-zone mesh, high-symmetry paths and reciprocal-lattice overlay;
- explicit gap-closing loci and phase-transition annotations;
- Berry-curvature distributions, integration cells and orientation arrows;
- Wilson-loop paths and phase evolution with branch/winding conventions;
- Weyl nodes, enclosing surfaces, Berry flux and surface charge;
- nodal rings and linked gap profiles;
- edge-state spatial amplitude plus spectrum selection;
- bulk-edge correspondence study layouts and warnings for finite-size effects;
- pump parameter evolution with polarization/center-of-mass overlays;
- Hofstadter gap labeling, edge mode tracking and convergence visualizations;
- symmetry markers where mathematically meaningful (TRS/PHS/chiral/inversion).

Treat topological invariants as **computed claims with conventions and convergence evidence**, not decorative labels. In gauge-dependent views, explain whether displayed vectors/states have been gauge-fixed.

## 31. Open quantum dynamics and QuTiP/QEC expansion

Leverage existing theory work by introducing recipes and studies for:

- Bloch trajectories, density matrices, purity/entropy and master-equation evolution;
- Jaynes–Cummings / Tavis–Cummings spectra, state populations and occupation distributions;
- driven cavity photon blockade and phase-space quasiprobability views;
- stochastic trajectories and ensemble uncertainty bands;
- continuous measurement records, filtering and feedback timing;
- qubit dissipation and decoherence channels;
- QEC syndrome-history heatmaps, logical failure vs rounds, decoder paths, surface-code patches and noise-model comparisons;
- finite-size scaling/pseudothreshold as linked plots with uncertainty;
- disorder-dependent localization and entanglement data where available.

Add careful semantics for stochastic seeds, trajectories vs ensemble averages, density-matrix Hermiticity/positivity, normalization/trace and decoder comparison protocols. Avoid inventing a spatial “3D” representation for inherently abstract quantities when linked graphs/matrices are more scientifically honest.

## 32. Beyond current models: roadmap candidates

Prioritize only after reusable infrastructure is stable:

- time-dependent Floquet quasienergy and micromotion;
- adiabatic pumping, quantum metric and geometric tensor;
- spin textures/skyrmion-like parameter-space maps;
- Wannier charge centers and polarization;
- tensor-network state observables and entanglement spectra;
- finite-temperature response and spectral functions;
- scattering and transport geometry;
- molecular orbitals and multi-electron densities from external quantum chemistry engines;
- cold-atom lattice dynamics;
- Landau/Hall many-body observables.

These are **candidate adapters and scientific studies**, not automatic reasons to expand the Math3D core. Each should demonstrate reusable dataset semantics and genuine visualization value before inclusion.

---

# Part VII — Performance, accessibility, portability and security

## 33. Large-field and animation performance

Implement shape/byte-budget validation before loading, progressive resolution, chunked 3D textures/bricks, LOD with provenance-aware downsampling, GPU/CPU memory budgets, offscreen resource cleanup, background prefetch and performance telemetry. Benchmark representative large volumes, dense band grids, lattice systems and multi-view timelines. Record timing, peak memory and correctness in automated regression reports.

Avoid claiming that every GPU supports every volume method; expose capability fallbacks. Preserve numeric source independently of lossy GPU display textures.

## 34. Cross-platform application lifecycle

Test native Windows/Electron first; then Linux, WSL-hosted workers and mobile/web consumption separately. Math3D mobile may consume previously computed portable scenes without running Python locally. Design offline read-only behavior, artifact-resolution warnings, graceful missing-capability UI and shared project portability. Do not couple opening an existing scene to availability of the Python backend.

## 35. Safety and trust boundaries

- Portable bundles and scene manifests are untrusted input; validate schema, sizes, hashes and paths.
- A deep link does not authorize executing arbitrary Python or shell code.
- Broker requests require origin checks, opt-in work execution and constrained command vocabulary.
- Remote workers require authenticated transport and explicit trusted environment identities.
- Never embed secrets or private absolute file paths in exported diagnostic bundles.
- Maintain clear provenance of imported external datasets and avoid automatically treating them as verified results.
- Display a warning if scientific integrity verification succeeds but numerical validation was never performed.

---

# Part VIII — Implementation plan as reviewable commits

The sequence below **retains all QI-01–QI-25 stages** and extends them through QI-40. Identifiers are planning labels, not existing Git commit IDs or replacements for delivered M3D-Q/QLAB/QVIS/SSR work. Treat an item as an extension when its first capability already exists; the acceptance text defines the new delta. Each stage should be implemented in small, reviewable commits with migration and test coverage.

## Wave A — Contracts and backwards compatibility (P0)

### QI-01 — Freeze the existing `quantum-scene/v1|v2` baseline

**Commit suggestion:** `test(quantum): pin current scene fixtures and render regressions`

- Inventory the existing `quantum-scene/v1|v2` corpus, linked run actions and view variants in both repositories.
- Map the review archive's 36 pinned Math3D scenes to actual source bundles and automated fixtures; screenshot count alone is not fixture coverage.
- Freeze importer negative tests, numerical samples, deterministic viewer references, performance and file sizes.

**Done when:** every supported existing v1/v2 fixture opens with verified provenance and numeric parity under a repeatable test harness, and any screenshot-only state is labelled as such.

### QI-02 — Shared quantum contracts package

**Commit:** `feat(contracts): introduce versioned quantum schemas and codegen`

- Add proposed run/result/link/study/cursor schemas and generated TS/Python types. Keep Lab-owned `packages/quantum-scene` v1/v2 intact and decide the new distribution boundary in ADR 1.
- Implement strict validation and readable errors across both languages.
- Enforce stable IDs and schema versions without silently rewriting old saved runs.

**Done when:** Python produces the **new** contracts that TypeScript accepts, while existing scene and saved-result fixtures still pass unchanged.

### QI-03 — Separate `quantum-result/v2` from scene data

**Commit:** `refactor(quantum): persist typed result datasets independently of scenes`

- Declare dataset roles, units, axes, storage and source hashes as an additive `quantum-result/v2` contract.
- Compare a `v1` saved run with its `v2` descriptor for exact recorded values and explicit unavailable fields.
- Ensure repeated views refer to the same immutable result and keep both existing scene readers.

**Done when:** one QWZ or hydrogen run can support multiple scenes without duplicating authoritative numerical arrays.

### QI-04 — Deterministic Scene Compiler

**Commit:** `feat(quantum): compile scene recipes from verified results`

- Start from Theory Lab's existing `packages/quantum-scene/from-result.ts` adapters; add a recipe registry with explicit compiler versions and capabilities.
- Stable manifest ordering, deterministic derived transforms and hashes; emit existing scene versions when their vocabulary suffices.
- Golden fixtures for QWZ first, then independently admitted Hofstadter, hydrogen and dynamics cases.

**Done when:** recompiling the same recipe/result reproduces equivalent canonical scene manifests and identical expected derived outputs under a defined numeric policy.

### QI-05 — Extend the existing `QuantumSceneDocument`

**Commit:** `feat(project): link multiple verified quantum scenes in Math3D projects`

- Extend the existing `math3d.quantum-scene-document` schema-version-1 path with reviewed link/view records or an explicit migration; do not add a duplicate type.
- Reuse existing exact-fingerprint admission, Project save/reopen and viewer routing while adding multi-scene relationships and independent mutable views.

**Done when:** two distinct verified scenes from one source run reopen beside a native mesh/geometry document, retain separate scene fingerprints plus a persisted typed relation to their shared run, and preserve the schema-version-1 reader.

### QI-06 — Content-addressed references

**Commit:** `feat(artifacts): resolve portable quantum blobs by SHA-256`

- Add artifact resolution independent of the current external-folder location while retaining existing exact-fingerprint Project links and relink behavior.
- Add thin/portable bundle resolution and storage diagnostics after the retention/ownership ADR.
- Validate integrity before publication or display; relocation must not turn a changed source into a valid one.

**Done when:** portable bundle opens on another drive/host without patching paths.

### QI-07 — Semantic handler registry

**Commit:** `refactor(viewer): register typed quantum render handlers`

- Inventory the existing field, band, lattice, trajectory and volume view paths before extracting common handler contracts.
- Add handler capability negotiation, resource lifecycle and error fallbacks, reusing SSR adapters and current viewers.

**Done when:** extending one new dataset handler does not require modifying a monolithic quantum scene switch.

### QI-08 — Extend Theory Lab `Open in Math3D`

**Commit:** `feat(integration): open study and Project targets from verified Lab scenes`

- Retain the existing `.qscene` folder handoff and independent Math3D verification. Add open-study and attach-to-project actions only after identity and capability contracts are defined.
- Add installed-app discovery and a portable fallback; keep checkout launch supported.

**Done when:** the existing exact-scene route still passes and a selected Lab study opens its declared scenes in the intended Math3D Project without substituting a similarly titled run.

### QI-09 — Extend exact source opening with explicit fork

**Commit:** `feat(integration): add verified fork requests to source-run handoff`

- Preserve the current Math3D **Open source run in Theory Lab** path and its run-ID/result-hash refusal behavior.
- Add a separately authorized fork request, new-run lineage and errors; no direct Python calls from Math3D UI.

**Done when:** exact source opening still passes, while a fork creates a new Lab run linked to the parent and leaves the old result and scene unchanged.

**Implementation note (2026-11-04):** QI-07–09 are delivered for the existing verified viewers and the saved QWZ two-view study slice. The handler registry routes the current field/geometry families; Lab writes an exact QWZ curvature/bands study handoff that Math3D independently verifies before Project admission; a separate fork launch requires an additional Lab click and uses saved-rerun lineage. See [QI-07–09 implementation details](quantum-qi07-09-handlers-study-fork.md). Broader Lab study sets remain future recipes.

### QI-10 — Source / Derived / Display semantics

**Commit:** `feat(provenance): classify immutable data, derivations and view state`

- Add derivation records and algorithm-version hashes.
- Persist view state independently.

**Done when:** changing camera or opacity cannot alter source hashes; a derived isosurface carries its recipe and threshold.

## Wave B — Shared scientific workspace (P1)

### QI-11 — Field Explorer bridge

**Commit:** `feat(field): promote quantum scalar and complex fields`

- Start with one source-backed QWZ curvature field or hydrogen ψ grid, using the existing quantum verifier and explicit SSR-compatible mapping before any generic promotion command.
- Bridge coordinate/units metadata to Field Explorer probes/slices and a native document with explicit derived-versus-display status.
- Add the second field family only after exact-sample, relink and missing-source tests pass.

**Done when:** imported quantum fields can use native probes/slices while tracing back to source data.

### QI-12 — Scientific Cursor

**Commit:** `feat(science): synchronize selections across quantum views`

- Coordinate-aware cursor model, event bus and projection adapters.
- Handle ambiguity and mismatched grids.

**Done when:** a QWZ k-point and a hydrogen spatial point synchronize all relevant views without feedback loops.

**Implementation note (2026-11-04):** QI-10–12 are delivered for the current quantum-scene source contract, the first approved hydrogen complex field bridge, and the paired QWZ/hydrogen cursor paths. See [QI-10–12 implementation details](quantum-qi10-12-provenance-field-cursor.md). Generic scalar promotion and wider study cursor adapters remain later extensions.

### QI-13 — Quantum Study documents

**Commit:** `feat(project): persist linked multi-view quantum studies`

- Build on Theory Lab's existing bounded study and linked-selection identities; define an additive Math3D study graph, layout, cross-panel selection and source links.
- Keep individual `QuantumSceneDocument`s reusable outside the study.

**Done when:** a Hofstadter study reopens with declared linked scene panels and selections intact, while each source scene can still be opened alone.

**Implementation note (2026-11-04):** The Project now persists a bounded `math3d.quantum-study/v1` graph with source identity, panel roles, layout, selection and link rule. The existing QWZ handoff remains supported; Theory Lab also produces a two-view Hofstadter handoff when one saved result contains both bulk and strip observations. Math3D verifies both bundles before admission, exposes standalone scene links, and checks shared kᵧ selections without inventing branch correspondence. See [QI-13–15 implementation details](quantum-qi13-15-study-comparison-time.md).

### QI-14 — A/B comparisons

**Commit:** `feat(quantum): compare runs with unit and gauge safeguards`

- Metadata diffs, aligned fields, residuals, convergence and warnings.

**Done when:** incompatible runs are flagged; compatible results have reproducible numeric difference metrics.

**Implementation note (2026-11-04):** Math3D compares independently reverified scene pairs, checks model, axes, units and exact grids, and reports aligned band residuals or gauge-invariant field density residuals. Different band grids can show a labeled two-resolution bulk-gap change, with a warning that this alone does not establish convergence. Unsupported or incompatible pairs return explicit reasons. See [QI-13–15 implementation details](quantum-qi13-15-study-comparison-time.md).

### QI-15 — Time-dependent scene contract

**Commit:** `feat(scene): add typed time frames and synchronized playback`

- Variable time grids, frame identity, playback and reference timelines.

**Done when:** a Bloch trajectory and expectation plot track the same physical time.

**Implementation note (2026-11-04):** The additive `quantum-scene/v2` time contract names a verified time dataset, exact frame identities, aligned tracks and playback bounds. Theory Lab emits Bloch and Pauli σz tracks from the same saved evolution rows; Math3D displays both at the same physical sample and rejects implicit interpolation. See [QI-13–15 implementation details](quantum-qi13-15-study-comparison-time.md).

### QI-16 — Preview/final lifecycle

**Commit:** `feat(runtime): distinguish ephemeral preview from verified scenes`

- Strict state transitions, atomic final publication, UI labels.

**Done when:** partial output cannot be mistaken for a verified result.

**Implementation note (2026-11-05):** Theory Lab writes saved runs and final `.qscene` bundles into hidden staging directories, verifies complete scene bundles, and publishes under the final name by one directory rename. Per-ID publication claims reject concurrent writers; preview IDs cannot be published as final scenes. The Scene Lab marks saved sources as verified final scenes. See [QI-16–18 implementation details](quantum-qi16-18-runtime-publication-bus-artifacts.md).

### QI-17 — Local Integration Bus

**Commit:** `feat(integration): add authenticated local scientific broker`

- Discovery, progress, artifact notices and safe app actions.
- Keep file and deep-link fallback.

**Done when:** a run submitted in Theory Lab can publish completion and Math3D can resolve its verified scene without polling an arbitrary directory.

**Implementation note (2026-11-05):** Theory Lab advertises a token-authenticated local pipe/socket, publishes bounded job progress and completion notices, and resolves an exact run ID plus result hash into a verified scene handoff. Math3D requests the latest completed run and independently verifies the returned bundle and provenance. Existing file and launch handoffs remain available. See [QI-16–18 implementation details](quantum-qi16-18-runtime-publication-bus-artifacts.md).

### QI-18 — Shared artifact store + GC

**Commit:** `feat(artifacts): support reference-aware retention and portable packs`

- Dedup, pinning, dry-run GC and portable project dependencies.

**Done when:** removing a temporary scene cannot delete blobs referenced by a saved project.

**Implementation note (2026-11-05):** Both apps use the same SHA-256 blob and pin format. Saved Lab runs pin their result bytes, and Math3D pins every verified source file of a Project before saving it. GC defaults to dry-run; explicit collection moves unpinned blobs to recoverable quarantine. Existing `.qpack` export embeds and verifies its dependencies for portable transport. See [QI-16–18 implementation details](quantum-qi16-18-runtime-publication-bus-artifacts.md).

### QI-19 — Large data LOD and chunking

**Status (2026-11-05): Partial.** Theory Lab progressively loads a 97³ field fixture with measured buffer bounds. Math3D now independently verifies stream bundles, opens the bounded preview level first, and can load or cancel a fuller verified level. It rejects a changed source revision and enforces per-level and total byte limits. Math3D Project pinning and portable packs for multi-level streams remain open.

**Commit:** `perf(viewer): progressively load and render large scientific fields`

- Chunked fields, preview LOD, bounded memory, verification at transport boundaries.

**Done when:** datasets over the chosen fixture size load progressively without unbounded main-thread memory spikes.

**Implementation note (2026-11-05):** Theory Lab's stream viewer opens a coarse field preview first, then loads verified chunks progressively. The loader yields between chunk batches, enforces a 4 MiB chunk cache and 16 MiB scene ceiling, and reports tracked peak resident buffer bytes. A 97³ field fixture verifies preview size, progressive events, byte equality at full resolution and buffer bounds. Math3D's scene and Study validators now admit up to one million samples; its independent viewer supports both complete verified scene bundles and bounded preview/full stream levels. See [QI-19–21 implementation details](quantum-qi19-21-large-scene-phase-promotion.md).

### QI-20 — Parameter sweeps

**Status (2026-11-05): Complete for the supported QWZ and Hofstadter producers.** QWZ saved phase diagrams pin each cell to a verified run and related scenes. A verified Hofstadter flux sweep has a linked flux–energy plot whose supplied points resolve to exact saved Lab run IDs and result hashes. Navigation re-verifies the source. Other model families need producer-backed adapters.

**Commit:** `feat(science): represent phase diagrams as linked sweep datasets`

- Grid/runs mapping, heatmap and point-to-run navigation.

**Done when:** selecting a phase-diagram point opens the exact source run and related scenes.

**Implementation note (2026-11-05):** Theory Lab can save a QWZ phase diagram from existing runs across mass and grid resolution. Each heatmap cell pins the run ID, result SHA-256, numerical checks and bands/curvature scene IDs. Selecting a cell re-verifies the source before opening its run or related scenes. Empty parameter combinations stay visibly unresolved. See [QI-19–21 implementation details](quantum-qi19-21-large-scene-phase-promotion.md).

### QI-21 — Native Math3D promotion commands

**Status (2026-11-05): Complete for supported mapped primitives.** A single verified regular 3D scalar or complex field promotes to a source-backed Field Explorer document, preserving its grid, units, and provenance while editing only its display state. Verified Project scenes can produce native Geometry, Curve, Graph2D, Mesh, and mesh-backed Surface copies with `derived-from` provenance. Unsupported primitives are refused.

**Commit:** `feat(project): promote quantum datasets to native documents`

- Field, Surface, Curve, Geometry, Mesh and Graph conversions with provenance.

**Done when:** promoted documents remain editable where appropriate without overwriting scientific inputs.

**Implementation note (2026-11-05):** Math3D can promote a verified Project quantum scene into native Geometry, Curve, Graph2D, Mesh or mesh-backed Surface copies, preserving a read-only quantum source and a `derived-from` provenance relation. Field promotion already exists in Field Explorer. Mesh byte resources are retained with the Project; graph point rows use its point-table sidecar. See [QI-19–21 implementation details](quantum-qi19-21-large-scene-phase-promotion.md).

## Wave C — Runtime maturity and advanced visualization (P2)

### QI-22 — Runtime capability negotiation

**Commit:** `feat(runtime): negotiate solver and viewer capabilities`

- Version-aware capabilities, unavailable-feature explanations and tested fallbacks.

**Implementation note (2026-11-05):** Theory Lab derives operation and engine decisions from its validated worker handshake, checks protocol 1 and worker 0.1.x, explains unavailable operations and suggests available alternative engines without switching jobs silently. The backend panel shows these decisions and the scene formats understood by its viewer. Every worker run/start request enforces the same decision. See [QI-22–24 implementation details](quantum-qi22-24-runtime-capabilities-transports-acceleration.md).

### QI-23 — WSL, Docker and remote adapters

**Commit:** `feat(runtime): execute scientific jobs through transport adapters`

- Same job semantics, explicit environment identity, secure artifacts and cancellation.

**Implementation note (2026-11-05):** Theory Lab now selects exactly one local, SSH, WSL or Docker worker transport. Each uses the same supervised JSON-RPC job and cancellation path, exposes its target identity, and checks artifact size and SHA-256 before publication. SSH remains authenticated with strict host-key checking. WSL handshake, health and resources passed on the verification host; its Python installation lacks the pinned worker dependencies, and Docker's daemon was unavailable there, so their full job acceptance commands remain to be run in provisioned environments. See [QI-22–24 implementation details](quantum-qi22-24-runtime-capabilities-transports-acceleration.md).

### QI-24 — GPU/accelerated engines

**Commit:** `feat(runtime): register optional accelerated numerical adapters`

- Benchmark correctness before speed; preserve deterministic and tolerance reporting.

**Implementation note (2026-11-05):** The optional Dynamiqs GPU engine now passes an analytic population/norm probe before registration. A fixed GPU-versus-native benchmark reports numerical and repeat-run errors at a declared tolerance, and gives a speed ratio only after those checks pass. The verification host has no Dynamiqs GPU stack, so the actual GPU benchmark reports unavailable. See [QI-22–24 implementation details](quantum-qi22-24-runtime-capabilities-transports-acceleration.md).

### QI-25 — Notebook/report export

**Commit:** `feat(reports): export reproducible quantum study summaries`

- Link inputs, figures, exact hashes, numerical settings and validation reports.

**Implementation note (2026-11-05):** Theory Lab exports a `.qreport` directory from a reopened verified run: exact input/result and optional artifact bytes, a full-sample SVG figure, numerical settings, source and file hashes, and a validation summary that marks unperformed checks as such. The Markdown report is portable and does not execute notebook code. See [QI-25–27 implementation details](quantum-qi25-27-reports-templates-complex-fields.md).

## Wave D — Extended integrations and product quality

### QI-26 — `QuantumStudyDocument` layout templates

**Commit:** `feat(studies): add reusable scientific comparison layouts`

- QWZ, SSH, Rice–Mele, Hofstadter and hydrogen templates.
- Validate layout is separate from scientific source.

**Implementation note (2026-11-05):** Math3D defines QWZ, SSH, Rice–Mele, Hofstadter and hydrogen Study layouts. A template binds only to admitted scene documents from the same run and result hash, and validates the required view roles. Hydrogen uses density and phase panels over one verified complex scene. Template choice, layout and selections remain separate from source datasets; existing Study documents still open. See [QI-25–27 implementation details](quantum-qi25-27-reports-templates-complex-fields.md).

### QI-27 — Generic complex-field renderer

**Commit:** `feat(field): render amplitude phase and complex-derived observables`

- Phase maps, signed amplitude, nodal surfaces, explicit arbitrary global-phase note.

**Implementation note (2026-11-05):** Theory Lab's verified complex-grid viewer now shows `|ψ|`, `|ψ|²`, signed real/imaginary components, cyclic phase, and separate zero surfaces for the two components. It masks phase near nodes and explains arbitrary global phase. Math3D Field Explorer also adds an independently derived amplitude slice and saves that view choice. See [QI-25–27 implementation details](quantum-qi25-27-reports-templates-complex-fields.md).

### QI-28 — Advanced volume pipeline

**Commit:** `feat(volume): add transfer functions, multi-isosurfaces and clipping`

- Fallback modes, bounding-box metadata and GPU capability tests.

**Implementation note (2026-11-05):** The verified quantum Volume view now exposes source-derived amplitude, transfer presets, direct volume and maximum projections, two simultaneous density thresholds, central clipping and physical grid bounds. Its renderer reports the actual GPU plan or CPU slice fallback. Display controls do not alter the saved source. See [QI-28–30 implementation details](quantum-qi28-30-volume-topology-dynamics.md).

### QI-29 — Topological geometry overlays

**Commit:** `feat(topology): render reciprocal geometry and integration objects`

- BZ, k-path, integration surfaces, Weyl charge and gap-closing markers.

**Implementation note (2026-11-05):** Math3D inventories verified BZ boundaries, k-paths, enclosing integration surfaces and node/gap markers as separately switchable geometry layers. It displays only producer-supplied charge or gap invariants and does not infer charge from a marker. See [QI-28–30 implementation details](quantum-qi28-30-volume-topology-dynamics.md).

### QI-30 — Quantum dynamics workspace

**Commit:** `feat(dynamics): link Bloch, density, spectra and observable panels`

- Record-aware time synchronization, solver-output termination and uncertainty.

**Implementation note (2026-11-05):** Theory Lab's saved-run plot, Bloch, density matrix and observable panels share one exact time sample. A Hann-windowed DFT of the stored P₁ series adds a clearly labeled sampled response spectrum. The workspace reports the completed stored interval, final-sample boundary and absent termination/uncertainty metadata without extrapolation. See [QI-28–30 implementation details](quantum-qi28-30-volume-topology-dynamics.md).

**Math3D consumer note (2026-11-05):** Typed scene time frames link the Bloch marker, σz plot, and an exact-frame inspector; clicking the plot selects a recorded sample without interpolation. Playback stops at the supplied endpoint. The exported scene does not contain the Lab's full density matrix or sampled response spectrum, so those panels remain unavailable in Math3D. This consumer extension is Partial until those records are supplied by a verified scene contract.

### QI-31 — QEC/syndrome and decoder visualizations

**Commit:** `feat(qec): represent syndrome histories and decoding evidence`

- Source-linked rounds, defects, correction chains and logical results.

**Status (2026-11-05): Partial.** Theory Lab has a pinned, source-checked repetition-code viewer in its Atlas and a bounded ideal three-data-bit example on its Backend page. The Python worker records exact flip, parity syndrome, temporal defects, final correction and logical outcome; Electron independently checks the trace and digest. The trace now persists as a hash-verified immutable run and exports a portable `.qscene` with exact syndrome, defect and data-bit arrays. Math3D independently opens and verifies that scene, shows its ideal-example scope and decoder record, and refuses changed scene bytes. Multiple-error ambiguity is explicit. A surface-code patch, circuit-level noisy decoding and comparison of scientifically independent decoders remain required for full QI-31.
See [QI-31–33 implementation details](quantum-qi31-33-qec-validation-alignment.md) and [saved QEC scene evidence](evidence/quantum-qi40-qec-saved-scene-2026-11-05.md).

### QI-32 — Numerical validation dashboard

**Commit:** `feat(validation): surface physical and solver checks in both apps`

- Hermiticity, normalization, trace, orthogonality, convergence, invariants and warnings.

**Status (2026-11-05): Partial.** Theory Lab's Runs provenance panel derives eigenstate norm/overlap, recorded evolution population, cavity norm, Lindblad trace/purity and stored damped-oscillator density Hermiticity checks from a hash-verified saved result and artifact. It surfaces producer topology validity and convergence flags; absent checks are explicitly unavailable. Math3D's scene inspector displays only supplied gap, invariant status and limitations alongside bundle verification. A versioned exported solver-check record is still needed for a complete cross-app dashboard; Math3D does not infer Hermiticity or solver accuracy from display geometry.
See [QI-31–33 implementation details](quantum-qi31-33-qec-validation-alignment.md).

### QI-33 — Scientific-data compare alignment

**Commit:** `feat(compare): add unit-aware resampling and eigenstate matching`

- Interpolation policy, gauge/degeneracy guards and uncertainty flags.

**Status (2026-11-05): Partial.** Theory Lab's saved-run A/B view offers opt-in unit-aware scalar alignment and phase/sign-invariant matching for stored, resolved two-level eigenstates; it refuses degenerate or ambiguous pairs. Math3D Projects comparison offers exact samples or explicitly selected linear interpolation of B onto A for monotone 1D band paths, with convertible eV/meV/µeV energy units. It refuses extrapolation, differing spatial frames/units, 2D surfaces and sampled degeneracies; the UI labels interpolation uncertainty. Existing `.qscene` bands do not generally supply eigenvectors, so cross-scene state overlap, gauge-safe matching and unsampled crossing certification remain unavailable. No state identity is inferred from band index.
See [QI-31–33 implementation details](quantum-qi31-33-qec-validation-alignment.md).

### QI-34 — Scene composition and cross-document overlays

**Commit:** `feat(viewer): compose quantum and native Math3D documents`

- Coordinate transform validation, multi-layer picking, clipping and source links.

**Implementation note (2026-11-05):** Project now offers a verified, read-only quantum/native Mesh or Geometry overlay with exact identity-frame validation, independent layers, shared Z clipping, source-local picks and source links. Non-identity transforms and persisted overlay state remain open. See [QI-34–36 evidence](quantum-qi34-36-overlay-runtime-portability.md).

### QI-35 — DevShell science-runtime diagnostics

**Commit:** `feat(devshell): expose quantum worker diagnostics and fixture tests`

- Version probe, health logs, reproducibility report and backend benchmarking.

**Implementation note (2026-11-05):** DevShell's desktop-five health check probes the worker protocol and repeatable native fixture; a CLI writes a JSON reproducibility report and optionally runs the guarded acceleration benchmark. See [QI-34–36 evidence](quantum-qi34-36-overlay-runtime-portability.md).

### QI-36 — Cross-platform portable opening

**Commit:** `feat(portability): verify project packs across Windows and Linux`

- Drive-letter independence, missing worker fallback, read-only mobile planning.

**Implementation note (2026-11-05):** A relocated two-scene `.qpack` reopens in Math3D with a missing worker path. Windows and Ubuntu/WSL independently verified and reconstructed its relative references and blobs with matching project hash. Native Linux Electron opening and read-only mobile consumption remain open. See [QI-34–36 evidence](quantum-qi34-36-overlay-runtime-portability.md).

### QI-37 — Full keyboard/panel/large-data UX pass

**Commit:** `fix(ux): improve quantum inspector accessibility and performance`

- View/Data/Science/Provenance inspector; keyboard focus; error and loading states.

**Implementation note (2026-11-05):** The quantum viewer now has keyboard-operated View/Data/Science/Provenance tabs, bounded dataset paging, dialog focus handling and a responsive inspector layout. Full installed-app keyboard and large-data certification remains in QI-40. See [QI-37–39 evidence](quantum-qi37-39-ux-observability-hardening.md).

### QI-38 — Operational observability

**Commit:** `feat(diagnostics): correlate job, result, scene and viewer traces`

- Correlation IDs, bounded logs, redacted support bundle, metric baselines.

**Implementation note (2026-11-05):** Theory Lab exports verified job/result identities and runtime duration; Math3D exports matching run/result/scene identities, bounded viewer events and observed import/preview metrics. The frozen scene contract has no job ID, so cross-app correlation uses run ID and result SHA-256. See [QI-37–39 evidence](quantum-qi37-39-ux-observability-hardening.md).

### QI-39 — Threat model and import hardening

**Commit:** `security(artifacts): harden bundles, links and broker requests`

- Path, size, schema, decompression, code execution and transport trust tests.

**Implementation note (2026-11-05):** Portable pack reads now verify file identity and reject a linked cache root; negative tests cover traversal, size, schema and changed blobs. Theory Lab adds explicit injected-path transport tests. The pack format has no decompressor or executable payload. See [QI-37–39 evidence](quantum-qi37-39-ux-observability-hardening.md).

### QI-40 — Integration certification + release freeze

**Commit:** `test(release): certify end-to-end Quantum Lab to Math3D workflow`

- Golden scene matrix, numerical/visual parity, migration, stress, cross-app navigation and portable export certification.

**Done when:** release evidence is generated, all P0 gates pass, known limitations are documented, and new result/scene adapters can be rolled back while both pinned `quantum-scene/v1|v2` readers remain available.

**Status (2026-11-05): In progress; release freeze withheld.** The [QI-40 certification candidate](evidence/quantum-qi40-certification-2026-11-05.md) pins 38 v1/v2 scenes and records passing QWZ, importer, Project, portable, inspector, worker and live two-app checks. The bounded ideal QEC example now has a verified saved run and portable scene, but surface-code science and full visual/stress, installer and rollback gates are outstanding. Do not interpret passing source-checkout tests as installer signoff.

### Cross-repository ownership and evidence for the first cut

| Deliverable | Owning repository | Required predecessor | Evidence to attach |
|---|---|---|---|
| `quantum-result/v2` and `v1` mapping | Theory Lab | QI-01 inventory and contract ADR | Cross-language schema fixtures, QWZ exact-value comparison, unavailable-field report |
| Recipe/compiler parity | Theory Lab | Result mapping | Two scene manifests from one immutable run; existing `.qscene` importer and negative tests unchanged |
| Existing-document multi-scene links | Math3D | Verified scene pair | Project save/reopen, exact-fingerprint relink, changed-source refusal, native-document coexistence |
| Field Explorer promotion | Math3D | Stable result/scene identity and unit mapping | Original source-sample pick, derived provenance, source-tamper refusal, Project reopen |
| Cross-app study/fork commands | Both apps | Identity and capability ADRs | Two-app exact-run tests, cancellation/refusal, new-run lineage; no hidden worker call |

The owner of a new shared package or artifact store remains an ADR decision. Do not close a cross-repository QI item using one repository's tests alone. Keep the frozen M3D-Q10 QWZ/SSH profile and current QVIS scene readers in every gate.

---

# Part IX — Concrete end-to-end acceptance scenarios

## 36. Golden scenario A: QWZ

1. Choose QWZ model and parameter set in Theory Lab.
2. Execute Python job; persist Hamiltonian conventions, eigenvalues/eigenstates, Berry curvature, gap and Chern estimate.
3. Verify result and compile bands + curvature scenes from the same result.
4. Open study in Math3D; select a band point at k.
5. Highlight the corresponding curvature value and linked eigenstate.
6. Promote curvature to FieldDocument; use native Field Explorer probe.
7. Save, close, reopen, export portable pack and reopen on a different filesystem location.
8. Verify source hashes unchanged and cursor mapping within sampling tolerance.

## 37. Golden scenario B: hydrogen 2p and 3d

1. Compute or load an explicitly normalized orbital grid with defined atomic units.
2. Compile slice, volume and density-isosurface recipes.
3. Render signed amplitude, phase where meaningful, and |ψ|².
4. Move spatial cursor in one representation; all others update consistently.
5. Derive a reproducible isosurface with recorded algorithm and threshold.
6. Confirm normalization, nodal structure and viewport fallback under constrained GPU capability.

## 38. Golden scenario C: Hofstadter

1. Compute bands, Chern data, strip eigenstates and edge localization under explicit flux/boundary conventions.
2. Group all scenes into a Study.
3. Select edge state and reflect spatial localization, energy and gap response.
4. Change flux via **Fork in Theory Lab**, producing a new run and study comparison rather than mutating the original.
5. Visualize finite-size convergence and flag ambiguous cross-run state matching.

## 39. Golden scenario D: Lindblad / QuTiP dynamics

1. Create master-equation run with Hamiltonian, collapse operators, initial state and solver tolerances.
2. Persist time samples and relevant observables.
3. Open Bloch and density-matrix/observable views synchronized by physical time.
4. Show trace, positivity/Hermiticity tolerance and solver warnings.
5. Compare numerical configuration changes without claiming bitwise equivalence where it is not warranted.

## 40. Golden scenario E: QEC

1. Run a documented surface-code or related circuit-level experiment.
2. Persist syndrome history, detector events, decoder choice, correction decisions and logical outcome.
3. Show linked temporal heatmap, lattice/patch map and decoding path.
4. Select a round/detection event and trace it to exact measurement records.
5. Compare decoders/noise models with data-split and seed documentation.

---

# Part X — Testing, governance, metrics and release gates

## 41. Test pyramid

| Level | Examples | Gate |
|---|---|---|
| Contract | TS↔Python round trip, missing fields, dtype/byte order, canonical hash | P0 |
| Scientific | analytic SSH, QWZ gap/invariant checks, hydrogen normalization, Lindblad trace | P0 for shipped models |
| Scene | deterministic recipes, dataset roles, unit conversion, compatible v1 import | P0 |
| Viewer | handler selection, linked selection, geometry orientation, device-loss cleanup | P0/P1 |
| Integration | deep links, safe broker handshake, worker cancellation, source reopening | P0/P1 |
| Persistence | save/reopen, portable pack, blob corruption, GC retention | P0 |
| Stress | large volume, many scenes, GPU fallback, job flooding | P1 |
| Security | zip-slip, malformed schemas, oversized arrays, unsafe deep link and broker request | P0 |
| UX | accessibility, keyboard, missing worker, long hash inspector, error recovery | P1 |

Use **numerical assertions first** and screenshots second. Visual snapshots cannot certify Berry curvature or eigenstates; numerical tests cannot certify a clipping UI. Both are required where applicable.

## 42. Quality/telemetry measures

Track: schema-validation failures, artifact-cache hit rate, import/verification time, scene compile time, time-to-first-preview, time-to-verified-view, peak renderer RAM/VRAM, active GPU resources after disposal, job cancellation latency, portable-open success, and percentage of scenes with complete unit/basis provenance. Establish thresholds from baseline benchmark measurements rather than invented targets.

## 43. Release gates

**Gate A — Contract freeze:** schemas versioned; cross-language validators and canonicalization tests pass.<br>
**Gate B — Source safety:** `v1` scene parity, immutable source, hash checks, no fabricated provenance.<br>
**Gate C — Project integration:** `QuantumSceneDocument` persists with native documents, links and reversible operations.<br>
**Gate D — Scientific correctness:** shipped models' analytic/numerical checks pass with documented tolerances.<br>
**Gate E — User workflows:** open both directions; source fork/compare; field promotion; linked selections.<br>
**Gate F — Portable delivery:** export/import on different path; corrupted/missing dependency handled clearly.<br>
**Gate G — Hardening:** size/path validation, secure launch/broker, teardown and resource budgets.<br>
**Gate H — Release:** deterministic evidence bundle, smoke suite, documented limitations, rollback.

No single screen capture or successful run should be labeled complete integration certification.

## 44. Decisions to record before implementation

Write short Architecture Decision Records (ADRs) for:

1. Shared-contract transport between independent repositories (published npm/PyPI artifacts, generated code or repository subtree).
2. Canonicalization/hashing specification for manifests and binary blobs.
3. Default artifact format for dense, sparse, large chunked and time-dependent data.
4. Which derived transforms run in Python vs deterministic Math3D worker.
5. Artifact-store ownership, retention, GC, portability and permission boundaries.
6. Deep-link protocol ownership and local broker authentication.
7. Whether `QuantumStudyDocument` is a dedicated project type or generic study composition.
8. How Math3D generic Field/Curve/Surface documents retain source semantics.
9. Renderer capability floor, GPU fallback and mobile/web read-only scope.
10. Definition of `verified`: cryptographic integrity vs numerical validation vs scientific confidence.

---

# Part XI — Recommended execution sequence and future vision

## 45. Sequencing without unnecessary platform expansion

**Milestone M1: stable contracts and project integration.** QI-01 through QI-07, QI-10. Freeze existing v1/v2 scene parity; add the proposed typed result contract, extend the existing Project document, and prove portable artifact identity before broad handler extraction.

**Milestone M2: visible cross-app integration.** QI-08, QI-09, QI-11, QI-12, QI-13. Extend the existing two-way source/scene handoff to studies and forks, then prove native Field Explorer promotion and a shared scientific cursor.

**Milestone M3: reproducible scientific workflows.** QI-14–QI-16, QI-20–QI-21, QI-26, QI-32–QI-34. Deliver comparisons, time-dependent views, previews, sweeps and composable documents.

**Milestone M4: runtime infrastructure and scaling.** QI-17–QI-19, QI-22–QI-24, QI-35–QI-39. Deliver broker, artifact lifecycle, LOD, environment/remote adapters, diagnostics and hardening.

**Milestone M5: expanded scientific atlas and certification.** QI-25, QI-27–QI-31, QI-40. Deliver reports, complex volumes, topological geometry, QuTiP dynamics and QEC studies with release evidence.

The sequence can be adjusted by dependencies: for instance, content-addressed artifact resolution is required before portable study distribution, but the broker is **not** required to ship robust deep-link and portable-file workflows.

## 46. Product positioning

Longer term, the division of labor should remain clear:

```text
Theory Lab = model, experiment, numerical authority
Python    = scientific execution and validation
Artifacts = reproducible data provenance
Math3D    = geometry, field analysis, linked spatial exploration
DevShell  = runtimes and developer diagnostics
```

The end product is not merely “QuTiP visualization in Math3D.” It is a **general scientific experiment-to-geometry platform** whose quantum integration provides the first particularly demanding reference implementation. The same contract/handler machinery can later support Sage algebraic geometry, VTK/CGAL mesh processing, field explorers, numerical PDEs, chemistry and other scientific applications—without forcing all of them into one executable.

## 47. Priority recommendations

If development capacity is limited, inventory the already delivered boundaries in **QI-01**, then implement the new deltas in **QI-02–QI-07 and QI-10**, followed by **QI-08/QI-09** extensions and **QI-11–QI-13**. This yields the most architectural benefit and the earliest visible improvement while avoiding premature complexity from a broker, remote execution or GPU solvers.

Specifically, prioritize:

1. **`quantum-result/v2` + deterministic Scene Compiler:** strongest defense against source/view duplication.
2. **Multi-scene links on the existing `QuantumSceneDocument` and a verified Field Explorer bridge:** strongest Math3D architectural integration.
3. **Bidirectional links and Scientific Cursor:** strongest improvement in daily scientific workflow.
4. **Study documents and compare mode:** most useful bridge from isolated attractive scenes to research workflows.
5. **Provenance/validation hardening and portable artifacts:** essential for long-term credibility and distribution.

---

## Appendix A — Proposed CLI examples (illustrative, not commands asserted to exist)

```bash
quantum-artifacts inspect run.qrun
quantum-artifacts verify scene.qscene
quantum-artifacts migrate scene.qscene --to <reviewed-new-scene-version> --dry-run
quantum-artifacts pack project.math3d --portable
quantum-artifacts doctor --json
quantum-runtime list-engines
quantum-runtime validate-environment
```

## Appendix B — Example study layout manifest (illustrative)

```json
{
  "schema": "quantum-study/v1",
  "id": "study-qwz-phase-transition",
  "title": "QWZ topology and band gap",
  "runs": ["run-a", "run-b"],
  "views": [
    { "id": "bands", "sceneId": "scene-bands", "role": "band-surface" },
    { "id": "berry", "sceneId": "scene-berry", "role": "scalar-field" },
    { "id": "gap", "sceneId": "scene-gap", "role": "spectrum" }
  ],
  "cursorDomain": ["reciprocal-point", "band"],
  "layoutId": "three-panel-scientific"
}
```

## Appendix C — Review evidence and limitations

Input: `Quantum-Math3D-Review-2026-11-04.zip`; its README reports 58 Theory Lab screenshots and 46 Math3D screenshots, including 36 pinned scenes and 10 orbital variants. All 104 PNG hashes matched the supplied manifest on 2026-11-04. The Theory Lab label `3c883fa` matches its current main; the Math3D label `12366f6c` was not found in the fetched Math3D history used here. Screenshots demonstrate captured UI states, not every code-level interface, numerical tolerance, cross-platform capability or future function. The source reconciliation above uses current Math3D `a5af9483` and Theory Lab `3c883fa4`; recheck both before implementation.

**Document convention:** all schema interfaces, paths, CLI examples, commit messages and feature descriptions marked proposed/illustrative are design targets, not claims about the current codebase.
