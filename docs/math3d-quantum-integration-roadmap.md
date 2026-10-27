# MATH3D Quantum Integration Roadmap

## Status and authority

**Status:** M3D-Q01–Q03 have bounded read-only desktop paths. M3D-Q04 has open 2D/3D lattice inspection and derived supercell preview; periodic/1D lattice metadata remains open. M3D-Q05 is complete for supplied canonical 1D SSH, square, honeycomb and simple-cubic reciprocal geometry, plus QWZ; v1 remains strict and SSH uses the versioned v2 extension. M3D-Q06 is complete for verified SSH/QWZ band selection and bounded 2D display LOD. M3D-Q07 is complete for verified QWZ curvature and contract-declared vector objects. M3D-Q08 retains its frozen v0.1 QWZ/SSH set and now also has bounded post-v0.1 producer-backed BHZ, BBH and Kitaev views. BBH has a separate nested-Wilson diagnostic scene with a conditional quadrupole; Kitaev has a separate producer-backed Pfaffian/winding diagnostic scene. The broader multi-family milestone remains Partial for families without independently verified producer scenes; bounded Weyl, nodal, Landau-level, Hofstadter and Rice–Mele pump scenes are now admitted individually. Rice–Mele has separate ideal-cycle and finite-speed, source-linked read-only fixtures; the finite-speed charge is not labelled quantized. M3D-Q09 is complete for its desktop `.qscene` file-handoff routes. M3D-Q10 is complete for the scoped v0.1 QWZ/SSH release profile, desktop/browser matrix and recorded CI/two-app evidence.

See the [Q08 fixture audit](math3d-q08-fixture-audit.md) and
[v0.1 release profile](math3d-quantum-v0.1-freeze.md) for the exact supported
set, frozen interchange, capability matrix and remaining sign-off gates.

**Post-v0.1 update (2026-10-27):** Q08 now also has a separately verified
Rice–Mele filled-band pump scene. Theory Lab supplies the closed-cycle bands,
plaquette phases, polarization winding and conditional Chern; Math3D only
displays and re-verifies exact samples. The frozen QWZ/SSH v0.1 set is
unchanged. See the dated admission in the Q08 fixture audit.

For the exact Theory Lab export and Math3D inspection workflow, see the
[M3D-Q04 lattice usage guide](quantum-lattice-usage.md).

For a producer-neutral extension beyond quantum scenes, see the additive
[Scientific Scene Runtime roadmap](scientific-scene-runtime-roadmap.md) and its
[SSR-00 compatibility map](scientific-scene-compatibility-map.md). SSR-00 is an
inventory only; it does not alter M3D-Q statuses or the `quantum-scene/v1|v2`
import boundary. The first generic proof must cover one existing quantum bundle
and one non-quantum fixture before any Python provider work.

**Type:** interoperability and scientific-visualization program

**Executable sequence:** `M3D-Q01` through `M3D-Q10`

**Upstream dependency:** portable `quantum-scene/v1` and `quantum-scene/v2` contracts from the Quantum
Visualization (`QVIS`) program

This roadmap defines how MATH3D becomes an advanced geometry and field viewer for
Quantum Lab results. It is the MATH3D-side execution plan derived from the
post-QLAB program proposal. The proposal remains product context; this document owns
the concrete MATH3D delivery sequence, repository boundaries, acceptance criteria,
and release gate.

The integration is deliberately contract-first:

```text
Quantum Lab / another producer
              |
              v
        QuantumResult
              |
              v
      quantum-scene/v1
       JSON metadata + verified binary artifacts
              |
              v
       MATH3D import adapter
              |
              v
  MATH3D documents, artifacts, relations, and viewers
```

The current desktop slice opens a regular `.qscene` folder through **File → Open
verified quantum scene** or the command palette. Electron verifies the manifest,
schema and every binary dataset before a bounded preview appears. Point clouds,
polylines, segments and meshes use Math3D's GeometryViewer. Mesh objects retain their
supplied colors; band lines and surfaces can be picked to inspect an exact verified
`bands.coordinates` and energy dataset sample, stable band/sample IDs, k and energy
units, bulk gap and source run. The 31×31 display uses deterministic LOD without
changing binary source arrays or source sample IDs. Crossing markers and eigenstates
are not inferred. Supported field slices, density surfaces and Volume views remain
read-only; Q07 maps bounded source-declared vector glyphs with exact inspection,
while unsupported or over-budget objects are deferred. Four real Theory Lab SSH/QWZ standard and band handoffs are
pinned in `tests/fixtures/quantum-scene` and checked by
`npm run test:quantum-scene:import`. **File → Reopen recent quantum scene** remembers
the last verified folder across app restarts and checks the complete bundle and
source fingerprint before displaying it again. **File → Verified quantum examples**
opens one of nine pinned SSH/QWZ/hydrogenic bundles shipped with the desktop app;
the same full bundle validation and a catalog fingerprint check apply. Theory Lab's **Open in Math3D**
action can launch a built local Math3D checkout with a newly verified handoff
folder; Math3D validates it independently before previewing. Saving a `.math3d`
workspace retains the verified scene's absolute folder and source fingerprint.
Opening that workspace checks the complete `.qscene` again and displays the
read-only preview only if the source still matches. The workspace holds a
reference, so moving or changing the source requires reopening it explicitly.
Named Math3D Projects can retain a hashed, read-only external reference to a
verified scene. The link can be admitted explicitly as a compact native
`math3d.quantum-scene-document` in the mixed-workspace graph. Its scientific
identity covers the source scene ID, schema, producer, run/result provenance,
coordinate conventions, dataset descriptors, object list and fingerprint; its
local folder is a separate location. Neither the Project nor this document
embeds binary arrays or becomes an editable Geometry/Volume. Project contents
open the document through the existing verified scene viewer; saving and opening
the Project re-verify the complete external bundle. Missing, changed, or
descriptor-mismatched sources refuse Project activation before workspace commit.
Relinking requires an exact fingerprint match and changes the link and document
location together while retaining scientific document identity. Cancellation,
mismatch, corruption, or save failure leaves the saved Project unchanged.
On desktop, **File → Open workspace** uses a native file picker for the saved
`.math3d` file. **File → Open verified quantum scene** selects a `.qscene` folder.
The preview is not yet an editable Geometry or Volume document. A bounded M3D-Q02
slice now displays a verified scalar or complex field plane (real, imaginary,
derived density or phase), with exact grid-sample inspection, source coordinates
and units. Electron retains the verified arrays; only a maximum 49×49 RGBA
plane and one requested value cross to the renderer. Phase is explicitly
undefined at near-zero amplitude. Real Theory Lab 1s and 2p bundles are pinned
and checked for stored quantum numbers, central density/node, and units. A
read-only density isosurface preview now derives bounded triangles from verified
amplitudes in Electron main, without transferring the full grid. The 1s, 2s,
2p, 3p and 3d fixtures verify phase and real-component sign bins on those
surfaces. Verified point-cloud sites and endpoint-pair links now have bounded,
pickable 3D markers with portable object IDs, deterministic dataset-sample
indices, declared coordinates and units, plus supplied short annotations and a
selection label. The original bundle can be located only after re-verification.
An explicit **Open source run in Theory Lab** action re-verifies the active
bundle, starts a locally selected Theory Lab checkout with only its source run
ID and expected result hash, and lets Lab verify its own saved run before
opening the appropriate laboratory. Missing, changed or corrupt runs are
refused by Lab; Math3D never reads Lab's private store or calls its worker.
This requires the matching run in the selected Lab profile and starts a Lab
process rather than focusing an existing window. The scene hash identifies a
claimed source result, not the publisher's identity or proof that every scene
value was derived from that run. M3D-Q03 additionally converts verified scalar
and complex `f64le` field components to Math3D's x-fastest float32 Volume grid,
with explicit axes, position and value units, source dataset hashes, and a
compact read-only Volume source document. The Volume viewer supplies slices and
threshold isosurfaces for non-phase quantities. Density and phase are derived from the supplied
real/imaginary components; near-zero phase nodes carry a separate mask and a
labelled zero display placeholder, not a measured phase. Phase is slice-only:
an isosurface through the undefined-node placeholder or the ±π wrap would be
misleading. Conversion can be
cancelled. Field, quantity, slice and threshold changes request a fresh source
verification; Electron re-reads and hashes the bundle before and after derivation
and refuses a changed or superseded source. Voxel values and derived surfaces
remain transient, not command-history entries or editable Project Volume
resources. The current scene schema admits planar separate real and imaginary
`f64le` components; no other complex encoding is silently assumed. The
renderer does not infer element species, bond order, or orbital quantum numbers
absent from source metadata. M3D-Q04 now adds verified site-to-cell/basis
inspection, declared translation guides, and a bounded, re-verified supercell
preview containing basis-mapped sites and primitive-cell edges only. Source
bonds are not expanded. A 1D chain and SSH remain supplied Geometry views,
without invented lattice metadata; 2D square/honeycomb and 3D simple-cubic
open fixtures exercise the lattice adapter. The v1 lattice contract permits
only dimensions 2 or 3 and `boundary: "open"`; it has no periodic-wrap bond
identity. Math3D therefore labels periodic wraps unavailable rather than
deriving them. Full Q04 periodic and 1D metadata acceptance needs a separately
versioned producer contract. M3D-Q05 adds a separate reciprocal-space Geometry
view for supplied primitive-zone boundaries, high-symmetry points/paths and
basis vectors. Clicks and inspector buttons select exact verified point IDs or
path segments; selection re-verifies the active bundle and refuses changed
bytes. Direct and reciprocal units are shown separately, and Math3D performs
no zone construction, physics calculation or coordinate conversion. Square,
honeycomb and simple-cubic fixtures plus real QWZ handoffs are checked. The
frozen v1 reciprocal block is 2D/3D only, so a native 1D reciprocal fixture
and its full acceptance remain gated on a separately versioned producer
contract. M3D-Q06 is complete for the bounded supplied-band path; M3D-Q07 is complete for the bounded supplied-curvature/vector path. M3D-Q08 is Partial, M3D-Q09 is complete for desktop file handoff, and M3D-Q10 is complete for the scoped v0.1 profile.

Quantum Lab must not call MATH3D internals, and MATH3D must not reproduce Quantum
Lab's physics engines. Both applications meet at the portable, versioned scene
contract.

## Program decisions

1. Use `M3D-Q01` through `M3D-Q10` as the only executable identifiers for this
   program. `QVIS-*` and `QLAB-*` identify upstream work and are not MATH3D commits.
2. Import `quantum-scene/v1`; do not invent a MATH3D-only quantum interchange
   format or accept an unversioned scene payload.
3. Keep JSON as the control plane. Dense scalar/complex grids, large meshes, band
   surfaces, and time sequences remain binary artifacts referenced by metadata.
4. Reuse the existing MATH3D document identity, structural hash, provenance,
   artifact registry, dependency relation, scientific job, selection, and viewer
   inspection contracts. Quantum integration must not create a parallel lifecycle
   framework.
5. Preserve generic object families. Atoms, orbitals, lattices, bands, and topology
   are compositions or semantic profiles over points, bonds, vectors, meshes,
   scalar fields, complex fields, isosurfaces, and reciprocal-lattice primitives.
6. Treat imported scientific values as supplied data. MATH3D may derive display
   geometry, slices, contours, and bounded inspection summaries, but it must not
   silently infer a topological invariant or claim a physics result.
7. Make import atomic. Unsupported versions, invalid references, hash mismatches,
   unsafe paths, incompatible dimensions, or budget violations publish no partial
   workspace state.
8. Preserve source provenance and units through every adapter and derived view.
   Visual conversion never upgrades a numerical result to exact or certified.

## Scope

### In scope

- Validation and import of `quantum-scene/v1` metadata and artifact references.
- Stable mapping into MATH3D documents, managed artifacts, dependency relations,
  selection, Viewer, and Inspector.
- Atomic/orbital, scalar/complex field, lattice, reciprocal-space, Brillouin-zone,
  band-surface, Berry-field, and topological-Hamiltonian scenes.
- Local file handoff and an explicit **Open in MATH3D** flow based on the same
  serialized payload.
- Desktop and browser-compatible rendering where runtime capabilities and artifact
  budgets permit it.
- Deterministic fixtures, migration policy, performance budgets, and a frozen v0.1
  compatibility matrix.

### Out of scope for v0.1

- Solving Hamiltonians, diagonalizing models, computing wavefunctions, or running
  time evolution inside the import layer.
- Inferring Berry curvature, Chern numbers, winding numbers, phases, Weyl nodes, or
  other topological claims from visual data.
- A general crystallography package, materials database, or electronic-structure
  code.
- An embedded Quantum Lab runtime or direct imports from Quantum Lab source modules.
- Embedding unbounded numerical arrays in JSON or workspace history.
- Live collaborative streaming. Chunked/local streaming and progressive display are
  allowed; multi-user transport is a later concern.

## Existing MATH3D foundations to reuse

The integration starts from established platform contracts rather than a blank
viewer:

| Foundation | Repository boundary | Quantum use |
| --- | --- | --- |
| Document identity and structural hashes | `packages/core/src/documentIdentity.ts` | Stable imported scene identity, revisions, and deterministic replay. |
| Scientific result/provenance envelopes | `packages/core/src/analysisResults.ts` | Preserve producer, operation, engine, precision, tolerance, warnings, and epistemic status. |
| Managed binary artifacts | `packages/kernel/src/artifactRegistry.ts` | Store and verify grids, meshes, vector fields, and other large arrays outside JSON. |
| Cross-document dependency graph | `packages/kernel/src/dependencyGraph.ts` | Relate imported scenes, field documents, derived meshes, and visual realizations. |
| Volume documents and infrastructure | `packages/core/src/volumeDocument.ts`, `renderer/src/volume/` | Dense scalar/vector grids, spatial metadata, slices, and isosurface derivation. |
| Scene-object transfer | `packages/core/src/sceneObjectTransfer.ts` | Reuse safe transfer conventions without collapsing the richer quantum scene into one mesh envelope. |
| Viewer provenance | `packages/core/src/viewerProvenance.ts` | Inspect source generation, operation, engine, and stale/current status. |
| Geometry, Mesh, Surface, Volume, and selection adapters | `renderer/src/` | Render generic imported primitives and preserve existing interaction patterns. |

`quantum-scene/v1` remains a distinct external contract. Existing scene-object
transfer can inform hashing, safety, and migration rules, but it cannot substitute
for a multi-object scene with datasets, coordinate systems, selections, and
annotations.

## Required contract boundary

M3D-Q01 must consume the reviewed upstream schema rather than reconstructing it from
examples. At minimum, the imported root records:

```text
scene
├── schema and version
├── stable scene identity
├── metadata
├── provenance/source generation
├── coordinate system and units
├── camera (optional presentation hint)
├── objects[]
├── datasets[]
├── selections
├── annotations
└── artifact references
```

The v1 object vocabulary expected by the complete program is:

```text
point-cloud        bonds              vectors
polyline           mesh               scalar-field
complex-field      isosurface         reciprocal-lattice
```

### Import invariants

- Every object and dataset has a stable, scene-unique ID.
- References resolve within the scene or to an admitted artifact descriptor.
- Coordinate handedness, axes, origin, position units, reciprocal units, value
  units, grid centering, shape, strides/order, and complex-number encoding are
  explicit.
- Artifact descriptors declare media type, byte length, cryptographic hash, numeric
  element type, endianness, shape, and encoding/compression where applicable.
- Imported bytes are verified before becoming available to a renderer.
- The importer rejects traversal paths, device paths, network fetches outside the
  configured policy, unknown executable content, non-finite required values, and
  decompression or allocation beyond declared limits.
- Optional camera, style, label, and visibility fields are presentation hints. They
  do not alter the structural identity of supplied scientific datasets unless the
  upstream schema explicitly classifies them as structural.
- Unknown required object kinds fail import. Unknown optional presentation fields
  are diagnosed and ignored only when the schema permits forward compatibility.
- Failed import leaves documents, artifacts, relations, history, and selection
  unchanged.

## MATH3D target model

The adapter maps one portable scene into a small graph, not a monolithic React
object:

```text
Quantum scene document
   |
   +-- owns compact object/dataset descriptors
   +-- references admitted binary artifacts
   +-- relates to generic MATH3D documents and realizations
   |
   +--> point/bond/vector realization
   +--> Volume field document
   +--> Mesh/Surface isosurface realization
   +--> reciprocal-space realization
   +--> band-surface realization
   +--> annotations and committed selection
```

The imported quantum-scene document is authoritative for the supplied scene.
Display meshes, slices, glyphs, color buffers, and level-of-detail products are
revision-bound derived artifacts. Editing or replacing the source scene marks those
derivations stale; it does not mutate promoted independent documents silently.

### Semantic mapping

| Quantum scene concept | MATH3D destination |
| --- | --- |
| Point cloud / sites | Stable point entities plus attributes and selection IDs. |
| Bonds / polylines | Indexed line realizations with source-object locate-back. |
| Vectors / textures | Vector-field or glyph artifacts with explicit basis and units. |
| Mesh / isosurface | Mesh/Surface realization related to its source field and threshold. |
| Scalar field | Volume source plus verified typed-array artifact and spatial metadata. |
| Complex field | Paired or interleaved verified components with named derived displays: real, imaginary, magnitude, density, and phase. |
| Reciprocal lattice | Geometry document/realization carrying reciprocal basis and coordinate semantics. |
| Bands | Curve or Surface realizations backed by energy datasets and band/k-point IDs. |
| Selection | Stable source IDs mapped through every realization; hover stays transient. |
| Annotation | Non-authoritative presentation metadata linked to stable source IDs. |

## Delivery order

```text
upstream QVIS-001 contract + compatibility fixtures
                    |
                    v
M3D-Q01 -> M3D-Q02 -> M3D-Q03 -> M3D-Q04 -> M3D-Q05
   -> M3D-Q06 -> M3D-Q07 -> M3D-Q08 -> M3D-Q09 -> M3D-Q10
```

QVIS renderer work may proceed in parallel after the schema is reviewed. M3D-Q01
does not depend on all QVIS rendering features, only on a stable contract,
cross-language fixtures, and artifact rules.

## Executable commit ledger

### M3D-Q01 — `arch(math3d-quantum): define quantum scene importer`

**Status: Complete.** Strict bundle validation, pinned fixture parity, compact
read-only Project document, exact-source re-verification on save/open/navigation,
relink with stable scientific identity, portable JSON import, restart, tamper
refusal and rollback are covered by unit and desktop acceptance. The source
bundle remains external; portability requires that same verified `.qscene`
folder or an explicit exact-fingerprint relink. This read-only path admits
artifact *descriptors* to the Project graph and verifies the external binary
artifacts before activation; it does not copy them into Math3D's editable
Geometry/Volume resource registry.

**Scope.** Add the external `quantum-scene/v1` TypeScript representation, strict
runtime validation, normalization, compatibility fixtures, import diagnostics, and
an atomic adapter boundary. Define a compact quantum-scene document in core and map
artifact descriptors to staged artifact-registry admission. Record source scene ID,
schema version, producer, source generation, and content hashes.

**Repository direction.** Put serializable contracts and pure validators in
`packages/core`. Put lifecycle/admission orchestration in `packages/kernel` or a
thin renderer integration adapter. UI, Three.js, Electron, and filesystem APIs must
not enter core.

**Fixtures.** Establish at least:

```text
bloch-vector.scene.json
orbital-field.scene.json
ssh-chain.scene.json
brillouin-zone.scene.json
band-surface.scene.json
berry-field.scene.json
```

Each fixture includes deterministic valid data plus targeted invalid variants for
version, reference, units, shape, size, and hash failures.

**Acceptance.** TypeScript accepts the same canonical fixtures as the upstream
Python validator; canonical serialization and hashes are stable; valid imports
produce one transaction; any failed validation or artifact admission produces none.

### M3D-Q02 — `feat(math3d-quantum): import atomic and orbital scenes`

**Status:** Complete for bounded read-only quantum-scene/v1 imports — verified field slices, exact samples, and
bounded density isosurfaces with phase/sign coloring are implemented with real
1s, 2s, 2p, 3p and 3d cross-repository fixtures. Supplied point-cloud sites
and endpoint-pair links are mapped to bounded pickable geometry, with portable
object IDs, source sample positions, declared units, and short source labels.
The UI can reveal the re-verified source bundle by its active fingerprint and
ask a locally selected Theory Lab checkout to reopen the matching saved run by
its ID and exact result hash. Lab verifies the run, job, result and artifact
before the UI receives the saved result; absent, changed or corrupt runs stay
unavailable. Compact native Project document admission is complete under
M3D-Q01. No element species or bond-order interpretation is added where the
portable contract supplies none; native editable Geometry/Volume resources and
packaged-app discovery remain outside Q02.

**Scope.** Render atomic sites, bonds, labels, orbital isosurfaces, probability
density, sign/phase coloring, and field slices. Preserve atomic/orbital quantum
numbers and producer metadata as inspected attributes, not hard-coded renderer
branches. Keep object picking and selection keyed by portable IDs.

**Acceptance.** Representative `1s`, `2s`, `2p`, `3p`, and `3d` scenes load with
correct units, orientation, lobe sign/phase legends, source locate-back, and bounded
camera framing. Missing optional annotations do not prevent scientific geometry
from loading.

### M3D-Q03 — `feat(math3d-quantum): add scalar and complex quantum field rendering`

**Implemented (read-only scope).** Verified planar real/imaginary `f64le` grids
feed a compact Math3D Volume source and a transient x-fastest float32 dataset.
The Volume viewer supports scalar, real, imaginary, and density slices and
non-phase threshold isosurfaces; phase uses an explicit near-node mask and is
slice-only. Async grid conversion is cancellable, and source bytes are
re-verified before and after conversion. The five pinned hydrogenic orbital
bundles, synthetic scalar/complex conversion, tampering, cancellation, and
desktop Volume viewing are covered by acceptance tests. Editable Project
Volume admission and other complex encodings remain separate future work.

**Scope.** Adapt scalar and complex grids to Volume infrastructure. Support supplied
`psi(r)`, `|psi(r)|^2`, phase, real, and imaginary components; slices; thresholds;
and isosurface derivation. Define one canonical complex encoding per fixture and
explicit conversion for other schema-approved encodings. Derived values are
revision-bound artifacts, never embedded in command history.

**Acceptance.** Grid dimensions, coordinates, units, and complex encoding survive
import; phase handles the configured zero-magnitude policy; isosurface/slice jobs
are cancellable and stale results cannot publish after the source changes.

### M3D-Q04 — `feat(math3d-quantum): add lattice and crystal visualization`

**Implemented (bounded open-lattice scope).** Verified site samples retain exact
cell and basis indices in the source inspector; declared translations appear as
Geometry guides. A separately labelled supercell view deterministically
expands at most 512 sites and 2500 primitive-cell edges, links each instance to
its basis and to an original source sample where one exists, and re-verifies
the bundle before expansion. It does not extend supplied bond topology. A 1D
chain and SSH use supplied Geometry only. The frozen `quantum-scene/v1` lattice
block accepts only 2D/3D open boundaries, so 1D basis metadata and periodic
wrap-bond identity cannot be shown without a new producer contract. This is a
remaining acceptance gap, not an inferred Math3D feature.

**Scope.** Import sites, bonds, basis sites, unit cells, translation vectors,
supercells, and periodic-boundary metadata. Reuse Geometry/Viewer inspection and
selection. Supercell expansion, when requested, is a deterministic derived
realization with an explicit instance-to-basis mapping.

**Acceptance.** Fixtures for a 1D chain, SSH chain, square lattice, honeycomb
lattice, and simple cubic lattice render consistently; picking an instance locates
its basis site and source object; periodic wrap bonds are visually and semantically
distinguishable.

### M3D-Q05 — `feat(math3d-quantum): add reciprocal lattice and Brillouin zones`

**Implemented (canonical supplied-geometry scope).** A source-backed reciprocal view isolates
verified point, path and zone-boundary objects from other scene geometry;
declared basis vectors are drawn as labelled guides. Point and path picking
uses stable source IDs and sample/segment indices, retains reciprocal units,
and re-verifies the bundle before selection. Square, honeycomb, cubic and real
QWZ v1 scenes remain accepted. Theory Lab now exports saved SSH bands with a
`quantum-scene/v2` 1D basis, ±π zone endpoints and named path; Math3D verifies
and inspects those objects without loosening the v1 minimum of two dimensions.
The bundle container remains `quantum-scene-bundle/v1`. Project links, compact
documents, restart and source fingerprints preserve the scene version. No
eigenvector or k-state is claimed: current SSH band results save energies, not
Bloch eigenstates. Selection shows the supplied k-point or path segment only.

**Scope.** Render reciprocal basis vectors, Brillouin-zone geometry,
high-symmetry points and paths, k-points, and the selected k-state. Keep real-space
and reciprocal-space coordinates and units separate. Synchronize selection only
where the scene declares a stable relation.

**Acceptance.** Reciprocal geometry is correct for canonical 1D, square,
honeycomb/hexagonal, and simple-cubic fixtures; high-symmetry labels retain source
IDs; k-point selection updates inspection without rewriting scientific data.

### M3D-Q06 — `feat(math3d-quantum): add band surfaces`

**Status: Complete for the verified read-only SSH/QWZ band consumer.** The
inspector resolves each picked line endpoint or surface vertex against the original
verified `bands.coordinates` and per-band energy artifact, not rounded display
geometry. The scene fingerprint, source run/result hash, dataset IDs, and
stable band/sample IDs accompany each selection. Project and recent-scene reopen
reverify the bundle; changed source bytes refuse selection. The scene contract does
not currently supply crossing markers or eigenstates, so neither is fabricated.
The 31×31 acceptance fixture retains all 961 binary samples per band while mapping
900 display triangles rather than all 3,600, with original sample indices kept for
picking. This LOD is a visual derivative only.

**Scope.** Visualize supplied `E_n(k)` along 1D paths and as bounded 2D surfaces.
Provide band selection, surface inspection, energy/unit readouts, k-point picking,
and supplied gap/crossing markers. Use stable band and sample IDs so plot,
reciprocal scene, and Inspector selections agree.

**Acceptance.** 1D and 2D fixtures preserve band ordering metadata without assuming
that array index is a global physical band identity; picking reports the selected
band, k coordinate, energy, source generation, and status. Large surfaces use
bounded artifacts and level of detail rather than JSON expansion.

### M3D-Q07 — `feat(math3d-quantum): add Berry curvature and quantum vector fields`

**Status: Complete for the verified read-only scene-contract path.** Supplied QWZ
curvature is colored by a signed, zero-centered seven-step palette whose display
bins preserve sign even for asymmetric ranges. A clicked triangle resolves its
nearest source vertex to an exact `f64le` curvature sample through re-verified
IPC. Declared vector objects, including QWZ reciprocal basis vectors and any
contract-valid Berry connection or pseudospin objects, render as bounded arrows
with uniform display-only length and 16/64/128 glyph density choices. Every
arrow retains its original dataset index. The inspector reports source axes,
position and value units, conventions, dataset IDs, run/hash, and supplied
invariant status. No curvature, connection, pseudospin, or invariant is computed
in Math3D. The current scene contract has no per-sample undefined/singularity
mask: the UI says so instead of inventing a diagnosis. QWZ, unit, orientation,
sign, restart, Project, picking, and tamper tests cover this scope.

**Scope.** Render supplied Berry curvature, Berry connection where meaningful,
spin textures, pseudospin textures, and other quantum vector fields. Provide scalar
coloring, glyph density controls, legends, basis conventions, and singular/undefined
sample diagnostics.

**Acceptance.** Vector/glyph orientation and scalar sign are fixture-tested under
the declared coordinate system; downsampling is deterministic and preserves source
locate-back; the UI labels quantities as supplied or visual derivatives and makes no
unsourced topological claim.

### M3D-Q08 — `feat(math3d-quantum): add topological Hamiltonian visualization`

**Status: Partial overall; v0.1 supported set frozen to QWZ and SSH, with a bounded post-v0.1 BHZ producer-backed extension.** The
[fixture audit](math3d-q08-fixture-audit.md) records the actual producer
corpus and admission rule for later families. Open either pinned QWZ example
under **File → Verified quantum examples**, then choose **Link matching QWZ
views** in its source inspector. The existing scene viewer offers **Bands** and
**Berry curvature** views after both independently verified bundles declare the
same run ID, result SHA-256, engine, and model inputs. Switching re-verifies
the selected bundle. The profile shows the producer-supplied band labels and
bulk gap, Berry dataset and convention, and the structured Chern value/status/
method; exact band and curvature picks still use their existing source-backed
inspectors. Band inversion, edge/bulk classification, and nodes are marked
**not supplied**. No dataset is joined or computed in Math3D. A different QWZ
run cannot be paired with the pinned example merely by matching its model name.
The pinned SSH finite-chain and band-path examples offer the same source-backed
view switching through **Link matching SSH views**. The study displays only
producer-labeled bond and density objects, supplied band labels, the worker
bulk gap and structured winding result. It does not infer an edge/bulk phase
from the density view. Each switch re-verifies the target bundle, and mismatched
runs, hashes, inputs or changed bytes are refused. BHZ now has a separate
producer-computed, pinned four-band lattice fixture with exact stored-sample
inspection and a read-only source-attributed profile. Its `A=B=1`, `ε=0`
scope, two block Chern values, spin-conserved Z₂ status, and limitations are
recorded in the [fixture audit](math3d-q08-fixture-audit.md). It is not the
full Atlas continuum BHZ family. A later additive `bhz_general` producer now
supplies a paired continuum view and a=1 lattice/ribbon view with variable
A/B/C/D/M, optional R mixing, conditional inversion Z₂ and finite-edge
weights. Math3D pins both verified bundles and displays their exact samples;
it does not compute a BHZ invariant or classify the finite ribbon. The legacy
fixed BHZ fixture remains available. BBH and Kitaev now have separate verified
portable fixtures and bounded read-only profiles. BBH also has a later
nested-Wilson diagnostic fixture. Weyl, nodal and Landau/Hall remain pending.

**Scope.** Compose the prior generic primitives into reviewed scenes for QWZ, BHZ,
BBH, Kitaev, Weyl, nodal, and Landau/Hall families. Support supplied band inversion,
edge/bulk classifications, Weyl nodes, Berry-flux structures, and parameter-sweep
frames. Model-specific profiles configure views and annotations; they do not create
an alternative scene contract.

**Acceptance.** At least one fixture from each supported family opens without a
model-specific data parser; parameter sweeps retain frame/parameter identity;
edge/bulk and node labels are visibly attributed to the producing computation.

### M3D-Q09 — `feat(math3d-quantum): add Quantum Lab to Math3D round trip`

**Status: Complete for the supported desktop `.qscene` folder handoff.** A live
Windows two-app test starts Theory Lab, computes and saves a Rabi run, clicks
**Open in Math3D**, and confirms that the independently launched Math3D imports
the exact Lab-created bytes and preserves source run, result hash and scene
fingerprint. It also exercises the Lab export/import/open path and verifies that
both Math3D startup and native-picker imports produce the same canonical scene
graph. Pinned QWZ route parity, visible malformed-launch refusal, missing or
modified source refusal without Project mutation, saved-Project restart and
exact-hash relinking pass independently. No private Lab state or Math3D physics
worker is used. The recent-scene shortcut remains independent of a Project
relink. See `docs/quantum-scene-project-links.md` for the UI and test path.
This implementation uses an absolute folder argument, not an OS file association
or URL/deep link; those conditional transports are not claimed.

**Scope.** Add file/URL-policy-safe handoff and an **Open in MATH3D** entry point:

```text
QLab result -> QuantumScene -> serialized scene + artifacts
            -> MATH3D admission -> import -> inspect
```

Desktop deep-link or file association handling, if used, carries a reference to the
same portable payload rather than private application state. Reopening an imported
scene preserves provenance, stable IDs, and missing/stale artifact diagnostics.

**Acceptance.** Export/import and Open-in-MATH3D routes produce the same canonical
MATH3D scene graph; malformed external invocations are rejected safely; save,
reopen, and replay preserve hashes and provenance; no hidden Quantum Lab-specific
mutation is required.

### M3D-Q10 — `release(math3d-quantum): freeze QLab Math3D integration v0.1`

**Status: Complete for scoped v0.1.** The [v0.1 release profile](math3d-quantum-v0.1-freeze.md)
freezes the QWZ/SSH topological support set, schema/encoding/budget policy,
known limitations and desktop/browser capability matrix. The quantum corpus,
QWZ/SSH studies, Q09 desktop routes and browser desktop-only boundary passed
in [CI run 40032122253](https://github.com/expert10000/Math3D/actions/runs/40032122253)
at release code commit `5797fbdcbe9e3afc8beed90892de5c047f6bb85e`
(also on main); the real two-app Lab-button route passed separately on Windows.
This sign-off does not expand
the Q08 model set or claim a Math3D browser `.qscene` importer.

**Scope.** Freeze the supported schema/version matrix, object families, artifact
encodings, runtime capabilities, size budgets, fixture corpus, migration policy,
known limitations, and user documentation. Remove only adapters proven redundant by
parity tests; retain explicit compatibility readers with owners and removal gates.

**Acceptance.** All program gates below pass in maintained CI and the complete
QLab-to-MATH3D journey has recorded desktop evidence plus browser evidence for the
supported subset.

## Cross-cutting verification

### Contract and safety tests

- Canonical valid/invalid fixture parity between upstream Python and MATH3D
  TypeScript validators.
- Reject unknown schema major versions, duplicate IDs, dangling references,
  incompatible shapes, integer overflow, non-finite required values, unsupported
  dtypes/endianness, byte-length mismatch, and hash mismatch.
- Reject path traversal, unexpected network resolution, decompression bombs, and
  aggregate allocation above policy.
- Prove transaction rollback: no document, artifact, relation, selection, or
  history residue after every staged failure point.

### Scientific and visual tests

- Coordinate, unit, handedness, reciprocal-basis, grid-centering, and phase/color
  convention fixtures.
- Golden geometry/data assertions take precedence over screenshot similarity.
- Deterministic screenshot baselines cover orbital lobes, slices, lattices,
  Brillouin zones, band surfaces, and vector fields on supported renderers.
- Selection and locate-back tests cover object -> dataset -> artifact -> source
  generation across every realization.
- Inspector always shows quantity name, units, source, producer/engine, status,
  precision/tolerance when supplied, and warnings/limitations.

### Lifecycle and performance tests

- Source replacement invalidates all derived realizations and blocks late job
  publication.
- Save -> close -> reopen retains compact metadata and artifact availability state;
  missing external artifacts are diagnosed and can be reattached by verified hash.
- Cancellation and bounded-memory tests cover isosurfaces, slices, large band
  surfaces, vector glyphs, and time sequences.
- Progressive loading never presents incomplete data as a complete scientific
  result. LOD changes geometry density, not source values or provenance.
- Performance budgets are fixture-specific and recorded at M3D-Q10 rather than
  hidden in implementation constants.

## Milestone gates

### Gate Q1 — Contract admission (`M3D-Q01`)

```text
strict quantum-scene/v1 validation       PASS
cross-language fixture parity            PASS
artifact integrity and budget checks     PASS
atomic rollback                           PASS
provenance/source generation retained    PASS
```

No scientific renderer work merges before this gate is reproducible.

### Gate Q2 — Fields and structures (`M3D-Q05`)

```text
atomic/orbital scenes                     PASS
scalar and complex fields                 PASS
lattice/unit-cell/supercell scenes        PASS
reciprocal lattice and Brillouin zones    PASS
selection and locate-back                 PASS
```

### Gate Q3 — Bands and topology (`M3D-Q08`)

```text
band paths and surfaces                   PASS
Berry/vector fields                       PASS
topological model scene profiles          PASS
large-data/LOD behavior                    PASS
no silent physics inference               PASS
```

### Gate Q4 — Interoperability freeze (`M3D-Q10`)

```text
portable scene import                     PASS
artifact verification                     PASS
orbitals and scalar/complex fields        PASS
lattices and Brillouin zones              PASS
band surfaces and quantum vector fields   PASS
topological scenes                        PASS
QLab -> MATH3D handoff                    PASS
save/reopen/replay                         PASS
provenance retained                       PASS
desktop/browser capability matrix         FROZEN
```

## Release definition of done

The v0.1 integration is complete only when:

1. MATH3D imports reviewed `quantum-scene/v1` fixtures without depending on Quantum
   Lab source code or private runtime state.
2. Every imported object, dataset, artifact, and derived realization can be traced
   to its scene, stable ID, source generation, and producer provenance.
3. Large numerical arrays never enter JSON documents, React state, command history,
   or event payloads.
4. Units, coordinates, complex encoding, grid layout, and reciprocal-space
   conventions are explicit and fixture-tested.
5. Failed or cancelled work cannot publish partial/stale scenes, and source changes
   deterministically invalidate derived views.
6. Orbitals, fields, lattices, Brillouin zones, bands, Berry/vector fields, and the
   agreed topological scene profiles are inspectable with consistent selection.
7. MATH3D clearly distinguishes supplied computation from visualization-derived
   geometry and makes no unsupported scientific claim.
8. File import and Open-in-MATH3D handoff converge on one admission path and one
   canonical imported graph.
9. Desktop and browser capability differences are explicit, tested, and do not
   create separate scientific data models.
10. The supported schema, fixtures, limits, compatibility policy, and known
    limitations are frozen and documented for future `quantum-scene` versions.

## Numbering freeze

```text
QLAB-001 ... QLAB-025   Quantum Lab application/platform (upstream)
QVIS-001 ... QVIS-010   portable quantum visualization (upstream/shared)
M3D-Q01 ... M3D-Q10     MATH3D quantum integration (this roadmap)
```

New work after M3D-Q10 must use a new reviewed program/version or a maintenance
issue linked to this release. It must not extend the sequence indefinitely or mix
Quantum Lab computation responsibilities into MATH3D.

## Post-freeze extension: Rice–Mele saved-run convergence view (complete, 2026-10-27)

This bounded addition does not change the M3D-Q10 v0.1 release definition. Theory
Lab produces a `rice_mele_convergence_study` `.qscene` from five hash-verified
saved runs. Math3D admits that bundle through the existing strict import path and
offers the pinned **Rice–Mele · five-run convergence** example.

- The read-only profile has two distinct plots: periodic filled-band charge versus
  cycle duration (**electron charge / cell** against inverse hopping energy), and
  finite-chain central-bond charge versus open-chain width (**electron charge**
  against cells). The source scene's normalized 3D positions serve layout only;
  the plots use the producer's saved physical x labels and exact scalar datasets.
- Selecting a point re-verifies the bundle and shows its exact dataset value and
  index, producer-supplied source run ID and SHA-256, status, and diagnostics.
  Math3D verifies the `.qscene` bytes; the five original Theory Lab runs remain
  in Theory Lab and are not independently fetched or recomputed by Math3D.
- The pinned five-run fixture passes import, exact sample, restart, changed-byte,
  and missing-file refusal in both importer and Electron acceptance. Its reference
  study is `tests/fixtures/quantum-scene/rice-mele-convergence-producer-study.json`.

There is no fitted limit, extrapolation, shared-charge equality, or Math3D physics
calculation. The two observables remain separate; the original broader Q08
coverage status and the frozen Q10 profile are unchanged.
