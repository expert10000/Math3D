# Unified Projects: post-1.6.0 delivery phase

Unified Projects is the next product phase after the kernel-backed documents and
the [continuation fixes](post-1.6.0-upgrade-regressions.md). The project becomes the
named container users browse; documents, results, artifacts and relations continue
to use the existing mixed-workspace contracts. No module-local persistence format
is replaced until its round-trip parity gate passes.

This plan adapts the supplied project-explorer proposal to the audited code. The
kernel already owns identities, replay and relations; Graph2D participates in mixed
workspaces and mobile has a library. Desktop opening now restores the supported
Graph/promotion workflows, independent literal Curve and nonperiodic parametric Surface sources,
procedural Geometry with bounded live-derived constructions, fundamental-diagram
Topology, supported Complex Function Explorer sources and self-contained scalar
Volume recipes, plus qualified resource-backed Mesh sources. PRJ16 adds verified dense scalar Volume samples, additional Curve/Surface source editors, scene constructions and finite Topology sources. Other source types
remain saved previews until their native editor adapters pass round-trip acceptance.

## Current delivery status (2026-10-03)

PRJ01–PRJ12 are integrated into `main` at `766776a27c6601e50d513a2217e3a4bf513c8e0d`.
The main Projects workflow passed in
[CI 36892375601](https://github.com/expert10000/Math3D/actions/runs/36892375601).
PRJ13 is merged into `main` at `9d9b013d0e058c366d9d306c2a1af4e7ad52f341` through
[PR #15](https://github.com/expert10000/Math3D/pull/15). Its
[main Projects CI](https://github.com/expert10000/Math3D/actions/runs/36898400691)
passed. PRJ14 is merged through [PR #16](https://github.com/expert10000/Math3D/pull/16)
at `486ff179aaab5d831d0f1e32dd4c1b57819117ac`; its [main Projects CI](https://github.com/expert10000/Math3D/actions/runs/36930839068) passed.
PRJ15 is merged into `main` through [PR #17](https://github.com/expert10000/Math3D/pull/17)
at `f7f401f`, with implementation `e8adffe` and final acceptance fix `805542c`.
Its [pull-request Projects CI](https://github.com/expert10000/Math3D/actions/runs/36937980364)
and [branch Projects CI](https://github.com/expert10000/Math3D/actions/runs/36937974514)
passed, including all 19 Electron/six browser journeys and the embedded Android bundle.
PRJ16 merged at `b76ec6d` through [PR #18](https://github.com/expert10000/Math3D/pull/18),
starting from main `243bae5`, for its published desktop/web qualification matrix.
Its clean-checkout Projects CI passed all 22 Electron and 12 browser journeys,
477 audit tests, the released Graph test pack and embedded Android bundle.
The inventory explicitly retains
preview-only formats whose source or native evaluation contract is incomplete. On October 1 this
checkout integrated published 1.6.0 source tag `8e30e85190599467e3839e1b1e4b5b9bc708916f`
and final release-maintainer `main` commit `a6a4f197df343630c26f58ecfd4a685b5f3230ab`
with merge `b180ed7fa47797104b4361dbf67aaa157373de15`. This preserves the
original delivery commits and includes the release's Surface restart fix.
The release remains immutable; Projects is a subsequent development phase.
PRJ06/PRJ08 retain the obligations below and in
[the acceptance matrix](unified-projects-acceptance.md).

| Item | Delivered behavior | Commit / status |
| --- | --- | --- |
| PRJ01 | Named project envelope and strict identity/replay validation | `28807ad` — implemented |
| PRJ02 | Unified live document explorer and saved previews | `721cf99` — implemented |
| PRJ03 | Local library, metadata, thumbnails, favorites and activity | `0f7d4e4` — implemented |
| PRJ04 | Saved-document duplicate, rename, archive, guarded delete and undo/redo | `e30d1f4` — implemented |
| PRJ05 | Lineage, freshness, provenance and artifact availability inspection | `2cc6f26` — implemented |
| PRJ06 | Verified import/export, compatibility preview and supported native opening | `b691f8c`, extended by PRJ10/PRJ11 — implemented slice; full restoration remains open |
| PRJ07 | Independent scientific starter projects | `856eda2` — implemented |
| Mobile transfer | Preserve named projects through the mobile Graph model | `bb29c40` — implemented; physical-device acceptance remains open |
| PRJ08 | Desktop/browser/mobile-model round-trip gates | `b18b7a9`, extended by PRJ10/PRJ11 — automated slice passed; device/engine/signing gates remain open |
| PRJ09 | Projects as the first main-navigation entry; explicit workspace/preview modes | `70ca027` — implemented |
| PRJ10 | Independent Curve/Surface native editing, history, save and reopen | `2a93c1b` — implemented for supported representations |
| PRJ11 | Procedural Geometry and bounded construction native editing, save and reopen | `11b2cb3` — implemented for supported representations |
| PRJ12 | Reconcile released baseline and add a repeatable Projects CI gate | `b180ed7`, `a5c4c5c`, `8510fcc` — integration software gate passed locally and in clean-checkout CI |
| PRJ13 | Native Topology/Complex restoration with retained identity, source, branch/contours and replay history | Implemented for bounded fundamental diagrams and the supported Function Explorer subset; software acceptance below |
| PRJ14 | Native scalar Volume restoration, source/grid edits, history and restart | Merged at `486ff17`; main software CI passed for qualified self-contained analytic/custom recipes |
| PRJ15 | Verified Mesh/Volume/Graph source-resource packages and native Mesh restoration | Merged at `f7f401f` through PR #17; complete Projects software CI passed for bounded, verified source buffers and native Mesh history |
| PRJ16 | Representation inventory and additional native source adapters | Merged at `b76ec6d` through PR #18; verified dense Volume; additional Curve/Surface source editors; scene constructions; CW/simplicial Topology; three starter workflows; clean-checkout software acceptance passed |

In the UI, use **Projects → Open saved project** to restore a compatible saved
container, then select its document in the explorer or its module in main navigation.
**View saved project** shows a stored preview; **Manage saved project** enables the
saved-document operations. Compatibility preview explains unsupported opening.

## Example workflow

Project: Minimal Surface Study

| Group | Documents/results |
| --- | --- |
| Graph | catenary-profile |
| Curve | catenary-curve |
| Surface | catenoid |
| Mesh | catenoid-remesh |
| Analysis | curvature, geodesic-path |

Relations: Graph → Curve → Surface → Mesh → Analysis. These are recorded lineage
links, not an inferred live coupling or an automatic recomputation promise.

## Commit sequence

| Commit | Deliverable | Acceptance gate |
| --- | --- | --- |
| PRJ01 `feat(projects): establish project as the first-class Math3D workspace container` | Strict named envelope over the existing mixed workspace, stable project identity, title and content revision; explicit legacy-workspace adoption | Named round-trip preserves all document IDs, replay, results, relations and artifact refs; metadata edits leave mathematical identities unchanged; unknown/future schemas and tampered content fail before mutation |
| PRJ02 `feat(projects): add unified document explorer across mathematical modules` | Project header and groups for Graph, Geometry, Curve, Surface, Mesh, Volume, Topology, Complex and Analysis; document title/revision and safe navigation | Explorer represents every entry including multiple documents per module; saved-preview navigation cannot open unrelated current editor state; existing Graph/kernel flows remain usable |
| PRJ03 `feat(projects): add thumbnails metadata tags favorites and recent activity` | Host-local library indexes referencing project IDs; bounded descriptions/tags and optional external thumbnails | Metadata survives restart without changing source hashes; corrupt indexes cannot delete project payloads; missing thumbnails have a clear fallback |
| PRJ04 `feat(projects): add cross-document duplicate rename archive and safe delete` | Explicit identity fork/remap, title edits, archive and dependency-aware deletion | No source/result/relation points to an accidentally reused ID; delete previews affected dependents; undo/reopen parity proves the chosen operation semantics |
| PRJ05 `feat(projects): expose relations dependencies and stale descendants` | Locate-back and dependency inspection with source-generation, result authority and artifact availability | Edited sources stale the correct descendants; snapshots remain qualified; missing artifacts and unresolved links are never shown as current |
| PRJ06 `feat(projects): add project-level import export and compatibility preview` | Validate before opening; optional engines/capabilities and external sidecars visible; host adapters restore all supported document types | A failed/future/unsupported import leaves current work intact; exact IDs, replay and lineage round-trip; incomplete host restore is preview-only |
| PRJ07 `feat(projects): add project templates and starter scientific workflows` | Bounded templates with explicit sources and independent instance identities, starting with the catenary study | Template instances share no mutable source; derived steps retain lineage and qualified numerical/exact evidence; absent engines remain explicit |
| PRJ08 `test(projects): freeze desktop web mobile project round-trip` | Reopen/replay/edit/undo/redo/upgrade acceptance across supported hosts, including external resources and installed-engine/device checks | Equivalent supported workflows preserve hashes and provenance; browser/worker limits and exact-build mobile evidence are recorded separately |

## Scope of the first implementation commits

PRJ01 adds a core envelope without changing mixed-workspace v1 or existing Graph
handoff formats. PRJ02 starts with a live explorer and saved preview; it makes the
current document containers visible without adding a second mutation/history route.
Full host restoration is a PRJ06/PRJ08 obligation. PRJ03 adds host-local library
metadata and previews; dependency editing and template execution remain later work.

Work stays on `codex/post-1.6.0-audit`. The confirmed release and final `main`
changes are now merged here. Keep existing 1.6.0 signed-build evidence separate
from this changed mobile runtime; future signing/device evidence must identify
the exact integration build.

## Implementation record

PRJ01–PRJ08 below record their original delivery scopes and evidence. The editor
restoration continuation extends the original PRJ06 Graph-only opener; the current
status above and the latest acceptance matrix describe the combined branch.

- PRJ01: core envelope implemented. Seven focused contract tests pass, covering
  named/legacy round-trip, retained results/lineage/artifact references, independent
  title/content revisions, strict validation and caller-state isolation.
- PRJ02: first explorer slice implemented. The Projects panel lists live documents
  and historical Analysis records, saves the named container, previews saved or
  legacy workspace content, and navigates only exact currently supported document
  IDs. Saved previews disable navigation and editing; full restore remains PRJ06.
  Two grouping/replay-query tests and two Electron project journeys pass, including
  cold restart, corrupt-store protection and phone-width containment. Desktop and
  phone screenshots were visually checked. Existing Graph Gallery and kernel
  journeys remain green (eight Electron journeys total).
- PRJ03: local library implemented, with independent project payloads, bounded
  descriptions (2000 characters), up to 16 unique tags (40 characters each),
  favorites, saved/viewed activity, and search by title/tag. The index supports
  64 entries and fails before replacing data if unsupported or corrupt. Project
  metadata leaves workspace hashes, document identities and source generations
  unchanged; existing title-only project envelopes remain readable without
  silently adding metadata. PNG/JPEG thumbnails up to 128 KiB are separate local
  sidecars; missing, unreadable or undecodable thumbnails show a clear fallback.
  Seven library tests cover restart semantics, independent payloads, ordering,
  bounds, corruption, missing/foreign refs and storage-quota rollback. The third
  Electron project journey covers metadata, thumbnails, favorites and activity
  across restart, safe preview/current-workspace switching, search, missing
  thumbnails, corrupt-index preservation and phone containment. Desktop and
  phone library screenshots were visually checked. No payload is pruned from an
  index; storage rollback is best effort because localStorage has no multi-key
  transaction. Interrupted saves can leave a recoverable unindexed payload.
- PRJ04: saved-project document operations implemented. Manage saved project
  enables bounded per-document names and archive flags across all module groups,
  source duplication with a fresh identity and explicit snapshot/parent lineage,
  and dependency-reviewed deletion. Duplicate checkpoints use verified current
  replay state, drop derived output references and retain the original result
  records. Delete blocks dependent documents/results/artifacts, opaque extension
  references and saved constructions; isolated deletion removes owned result
  records/selection and preserves external artifact manifests/bytes. Operations
  use the existing shared kernel with ten session-local undo/redo transactions;
  saved snapshots reopen exactly, while undo stacks do not survive restart.
  Managed saves leave the live workspace and active project snapshot intact;
  concurrent saved edits and later live overwrites are rejected. Five operation
  tests and an additional library conflict test cover these contracts. The fourth
  project Electron journey exercises duplication across captured modules, rename,
  archive/restore, blocked/isolated delete, undo/redo, save and restart.
- PRJ05: dependency/provenance inspection implemented with the existing kernel
  dependency graph. Project-wide and selected-document views expose recorded
  parents/targets, source revision/generation/hash, stale descendants, independent
  snapshot qualification and historical analysis authority/engine versions.
  Locate-back selects the exact saved source inside the inspector; it never
  navigates an unrelated live editor from a saved preview. Artifact availability
  requires a matching manifest checksum and affirmative host-store lookup; absent
  checksums, missing targets and lookup failures cannot appear current. Source
  freshness and artifact availability remain separate from mathematical authority.
  Four dependency tests cover stale chains/unrelated documents, unresolved links,
  missing/unverified artifacts and regenerated targets that retain historical
  stale relations. The fifth project Electron journey verifies
  stale lineage, locate-back, recorded analysis authority and missing sidecars.
  Desktop and phone inspection screenshots were visually checked.
- PRJ06: import/export and compatibility preview implemented. Named project JSON
  exports exact identities, replay, results and lineage; imports verify every
  module's replay before any write. Legacy mixed workspaces and Graph handoff v2
  require explicit adoption. Future/tampered/oversized files fail without replacing
  current work. Previews list required Graph capabilities, recorded engine versions
  (execution availability remains unverified), and external resources with source
  requirements/checksums/host availability. Project JSON carries resource references;
  sidecar bytes and library thumbnails must transfer separately.
  Import into library preserves the active workspace. Same-ID conflicts reject
  replacement. Explicit Open Graph workspace is enabled only for one Graph and
  its fully supported Curve/Surface promotions, without missing source resources
  or unsupported construction state. Opening saves the previous workspace locally;
  storage writes roll back if the host callback fails. Subsequent live saves retain
  imported historical analysis/companions/relations while preserving current replay.
  All other editor combinations remain verified saved previews: complete native
  cross-module restoration is still a PRJ06/PRJ08 acceptance obligation.
  Six transfer tests and the sixth project Electron journey cover export fidelity,
  replay compatibility, resource requirements, cancel/rejection, library import,
  guarded Graph opening, backup, retained records and same-ID conflict protection.
  Desktop and phone import screenshots were visually checked.
- PRJ07: built-in scientific starters implemented. Minimal Surface Study creates
  a bounded catenary Graph, a normal Curve snapshot, a catenoid revolution Surface,
  numerical derivative evidence and recorded source/result lineage. Derivative
  Study provides a parabola, its Curve and a numerical derivative. Each preview
  uses a fresh instance token for independent project/document/result identities;
  templates contain ordinary validated sources, with no executable template input.
  Preview/cancel leaves storage and live work intact; library import and Graph
  opening reuse PRJ06 compatibility and backup guards. Meshing, curvature and
  geodesics remain explicit follow-up steps; no unavailable engine or proof of
  minimality is implied. Three scientific template tests, the seventh Electron
  project journey, renderer typecheck and the production build pass. The phone
  starter screenshot was visually checked.
- PRJ08: automated acceptance slice implemented. The same real Projects UI journey
  runs in Electron and two Chromium locale/time-zone configurations, passes exported
  checkpoint JSON through the actual mobile Graph edit/undo/redo/save/export model,
  and checks independent destination import/restart plus saved-project history.
  Original project/document identities, metadata, companions, analysis and lineage
  survive transfer; version conflicts protect the source library and historical
  numerical analysis remains qualified as stale. Repeatable contract/desktop/browser/
  combined commands are recorded in [the acceptance matrix](unified-projects-acceptance.md).
  Full native cross-module restoration, external byte/device and installed-engine
  sign-off remain separate acceptance obligations, not completed PRJ08 claims.

### Named-project mobile transfer continuation

The mobile Graph library now retains the named envelope, project identity, title,
description/tags/document overrides, checkpointed Curve/Surface companions and
historical results/relations. Graph editing advances the container content revision;
renaming the project leaves scientific source generations intact. Export/share uses
the original named format and `.math3d.project.json` extension. Raw Graph and legacy
handoff behavior remains available. Import planning retains unsaved current work
before one storage write and editor activation; failures keep the current editor.

Named mobile imports require one Graph, checkpoint-only Graph/Curve/Surface entries,
no archived documents or saved scripts, and available checksum-verified point-table
inputs. Unsupported combinations and identity collisions reject without overwriting
local projects. Named duplication is deferred to desktop rather than dropping
metadata or incorrectly reusing companion identities. Historical engine records do
not establish execution availability. Desktop offers explicit checkpoint JSON export,
which resolves verified replay without transferring an undo stack or sidecar bytes.
Four transfer/storage-model tests and 41 existing mobile Graph/storage/transfer
regression tests pass. Mobile TypeScript passes using the checkout's core/kernel/API source
paths; native device/file-picker acceptance remains unrun.

The repeatable `node scripts/post160-roadmap-audit.mjs --run` gate includes both
project suites and passes 414 tests across 66 files. Renderer/E2E/mobile/fixture
TypeScript, main/renderer/web production builds and dependency boundaries pass.
This phase has ten passing Project Electron journeys plus six Graph Gallery/kernel
regression journeys (sixteen total), plus two Chromium project interchange journeys.
Electron downloads use the native session download hook
in the transfer test; the test also verifies the resulting file before import.
It has not run a native-mobile device or full cross-module restore acceptance gate.

## Editor restoration continuation

- PRJ09 (`70ca027`, implemented): Projects is the first entry in the main module
  navigation. The explorer identifies Current workspace, Saved project preview and Managing saved project
  explicitly; opening the library does not replace the active editors.
- PRJ10 (`2a93c1b`, implemented): independent parametric/explicit Curve sources
  (2D/3D, literal expressions, no external dependencies) and nonperiodic parametric Surface sources reopen in
  the existing native editors, without requiring a Graph. Multiple saved documents
  retain their original identities and untouched mathematical fields. The library's
  Open saved project action reuses compatibility preview and the before-open backup.
  Opening leaves source hashes and generations unchanged. Native edits advance the
  source generation; session undo/redo, project save, replay and explicit reopen
  retain the edited source and its identity. Cursor visits rebase the replay
  starting generation so repeated undo/redo cannot restore an older identity.
  Other source representations remain preview-only until an equivalent host adapter
  exists; promoted Graph Curve/Surface workflows retain their existing opener.
- PRJ11 (`11b2cb3`, implemented): procedural Geometry objects and their bounded
  live-derived constructions reopen in the existing Geometry editor. Object IDs, parameters, transforms,
  presentation, construction inputs and opaque source fields survive save/replay.
  Scratch/workbook seed records and stored scene script are retained and restored;
  importing never executes stored script. Mount-time topology cache enrichment does
  not become a mathematical source edit. A native parameter edit advances the same
  saved document, and explicit reopen retains the edited source and construction
  records. Three contracts and an Electron edit/save/reopen journey cover this path.
  Point/scene primitives, separate canonical construction graphs, embedded surfaces,
  cameras and overlays still require different host adapters and remain preview-only.

## Remaining delivery and integration gates

The integrated main software slice is PRJ01–PRJ15, including resources and Mesh restoration.
Full PRJ06/PRJ08 closure requires
the remaining measured deliveries below; delivered rows retain their explicit
representation limits. Each adapter must validate the entire saved representation before
activation and leave source generation unchanged on open.

| Order | Milestone | Deliverable | Required evidence |
| --- | --- | --- | --- |
| 1 | PRJ13: Topology and Complex native restoration | Delivered for fundamental diagrams and supported Function Explorer sources; existing command adapters retain source, branch/contour choices, results and provenance | Seven source/replay contracts and a real UI journey with two documents of each module, unchanged opening, edit, undo/redo, save, process restart/reopen, branch/contour edits and invalid-contour rollback |
| 2 | PRJ14: Volume restoration | Delivered for qualified analytic/custom scalar recipes, retaining spatial metadata and per-document history; source bytes transfer through PRJ15; additional samplers require PRJ16 | Six source/replay contracts and two distinct Volume documents in Electron: actual sample values, unchanged open/save, source/grid edit, undo/redo, process restart, continued editing, stale provenance and resource rejection |
| 3 | PRJ15: Verified resource transfer and Mesh restoration | Delivered: source-resource packages and transactional archive; native Mesh coordinate edits/history/selection; imported Volume bytes remain independently qualified | Byte/checksum/shape/ownership validation, historical-resource availability, corrupt/missing sidecars, storage rollback, independent-host transfer and real process restart |
| 4 | PRJ16: Additional source representations | Delivered for the qualified source matrix: dense Volume, sampled/dependent/spline Curve, additional Surface forms, scene constructions and finite Topology | Source-preserving restore/edit/history/save/export evidence for each enabled row; independent transfer, Electron restart and browser reload passed; unsupported formats remain explicit previews |
| 5 | PRJ17: Device and installed-engine acceptance | Native mobile file picker/share/upgrade/restart and required installed scientific backends, against exact build/engine versions | Device/build/signature hashes, independent numerical/exact oracles and failed/cancelled/stale publication checks; existing model coverage remains separate |
| 6 | PRJ18: Full cross-module freeze | Combine the enabled adapters and verified external resources into independent desktop/web/mobile round trips | Published supported-host matrix, all relevant software gates and exact native-build signoff; reconcile remaining PRJ06/PRJ08 obligations explicitly |

The full roadmap stays open until those gates pass. GGL18 and new mathematical
features are separate decisions; they do not replace Projects restoration work.

## Release-baseline integration evidence

The merge includes all ten release-maintainer commits that were missing from the
original Projects branch, without changing release versions or signing identities.
The mapped continuation audit passed **414 tests / 66 files** after integration.
The two 100-edit Topology stress cases use explicit 30-second limits: they passed
alone, while their former five-second limits expired during the parallel audit.
No assertion or replay bound was removed.

`.github/workflows/unified-projects.yml` runs the audit, combined Projects
acceptance, released Graph test pack and Android embedded-bundle compilation on
this branch, relevant main pushes and pull requests. Software artifacts are retained
for inspection; this workflow does not attest physical-device or installed-engine
acceptance. See the [current acceptance record](unified-projects-acceptance.md).

[Clean-checkout CI 36890458229](https://github.com/expert10000/Math3D/actions/runs/36890458229)
passed every step on `8510fcc`, including all 16 Electron/two browser journeys and
the embedded Android bundle. The initial CI run exposed a whole-storage comparison
racing unrelated workbook autosave; the corrected test still verifies every
named-project payload, library entry, sidecar and backup remains byte-identical
after a rejected same-ID import. PRJ12 software integration is complete.
The subsequent sections record PRJ13–PRJ18 implementation and qualified software
acceptance. The supported Samsung Android workflow has current exact-build
observations. Damaged-store protection is fixed; the signed Android emulator and
Samsung A56 both passed 11 recovery cases. Actual local external-app share delivery
also passed with an exact received-file browser round-trip. Native iOS acceptance remains unverified.
Full PRJ17 native signoff and PRJ18 combined native readiness remain open for
those specifically recorded conditions.

## PRJ13 supported native restoration

Topology restores the saved fundamental-diagram adapter before the native screen
mounts. A checkpoint-only project retains its saved identity and provenance; a
replay project also restores undo/redo. Switching documents or leaving the module
keeps each adapter. Opening does not regenerate the saved source or replace its
identity with a preset. Explicit preset changes edit the restored document.

Complex opens in Function Explorer with the saved adapter. Initial preview does
not change the AST variable list, contours, branch profile, sampling settings or
source generation. Expression/domain/grid edits alter represented fields while
retaining other source fields. The saved-document controls expose branch policy
and all contours; the existing path viewer displays the first saved contour.
Analysis actions use the explicitly selected native path. Historical analysis
and provenance remain in the project and are qualified against current source;
source edits do not make prior results current again.

The enabled Complex subset uses a preview-compilable AST, no parameters,
domain exclusions, covering or Mobius recipe, a uniform grid of at most 256 samples
per axis, and principal/negative-axis/positive-axis/radial cuts. Other Complex
recipes and non-diagram Topology sources stay preview-only. Their dedicated
adapters belong in the PRJ16 representation inventory. PRJ15 supplies verified
external source bytes; native device/installed-engine acceptance remains a PRJ17 gate.

Complex replay now retains live revisions after undo/redo and a pruned redo
branch, continues command IDs after reopen, and bounds replay to the native
100-edit history window. Irreversible selection/analysis intents checkpoint
their actual state and cleared history. Entire source candidates are validated
before any ordered field edit is committed.

## PRJ14 supported native Volume restoration

Projects opens saved analytic/custom scalar recipes in the Volume workspace.
Each document retains its own `VolumeDocumentAdapter`, identity and replay.
The saved-document bar above the viewport exposes expression edits, **Apply
source**, undo/redo, and expandable parameter/grid JSON controls. Whole source
candidates are validated before a commit. Opening, inspecting, sampling and
saving unchanged work never synchronize a replacement legacy preset into the
saved source. New/gallery actions retain the previous project documents;
legacy-ID collisions receive a separate identity, and newly saved Volume
documents remain reachable in the explorer.

The qualified subset has an `analytic-preset` or `custom-field` recipe with a
compilable expression and finite numeric parameters, no source dependencies,
2–128 samples per axis, positive spacing and identity direction. Optional `F =`
notation is normalized only for evaluation; saved source text and opaque recipe
annotations are retained. Both point and cell centering use the saved first-sample
origin and spacing. Dimensions, coordinate-system metadata and position/value
units remain unchanged. Descriptive/non-compilable presets, other directions,
dense/vector grids, distance/SDF/mask/label sources stay preview-only.

Procedural cache references remain unchanged and explicitly unverified on open.
Their bytes are optional because the qualified recipe regenerates the samples.
Actual source edits discard the obsolete cache reference atomically. Imported
payload bytes are never replaced by a fallback preset: unsupported sources or
missing required resources reject activation before project replacement.
PRJ15 delivers resource checksums/transfer; PRJ16 qualifies dense scalar samples. Other samplers remain explicitly outside the enabled matrix.

Replay preserves the live source revision after undo/redo and pruned redo
branches, retains redo after rejected edits, continues command IDs after reopen,
and folds the native 100-edit window into a checkpoint. Bounded legacy exports
with longer logs are folded into that same window. Exported replay snapshots
cannot mutate the adapter's private history. Historical results and their engine
provenance remain saved, and source edits leave them stale.

See the [PRJ14 software evidence](unified-projects-acceptance.md#prj14-native-volume-restoration--october-1).
Native mobile restoration, physical-device and installed-engine signoff remain
separate gates; the published 1.6.0 release is unchanged.

## PRJ15 verified resources and native Mesh restoration


**Projects → Export with resources** produces a versioned `math3d.project-package`
JSON container. Its project envelope and replay retain their original identities;
binary source bytes live in a separate base64 sidecar section. Plain project and
checkpoint exports continue to carry references only. The package is limited to
112 MiB, with at most 1,024 resources and 64 MiB of decoded source bytes per project.
Each descriptor records its resource ID, SHA-256 checksum, byte length, encoding,
shape/component counts and sorted owning document IDs. Shared inputs are deduplicated
within the project. Resources needed by every retained Mesh undo/redo transaction
are authoritative inputs, even when they are not the current visible mesh.

The inventory distinguishes Mesh positions/indices/normals/UVs, canonical Graph
point tables, imported Volume typed payloads, optional procedural Volume caches,
and optional historical analysis artifacts. Mesh and Graph bytes must match their
saved reference hashes and counts. Mesh checks require finite xyz/normals/UVs,
matching components, triangle indices and valid index ranges. Volume bytes must
match positive integer dimensions, components, scalar type and declared length;
the transfer descriptor supplies their byte checksum because the existing Volume
reference has no checksum field. This does not change the saved Volume source hash
or establish a native sampler. Unsupported Volume representations remain previews.

Preview validates the whole supplied resource set without writing. Missing source
or historical buffers remain explicit and disable opening. Resource-backed Mesh
sources with recognized origins restore through `MeshResourceStore` and
`MeshDocumentAdapter`; opening consumes saved coordinates rather than regenerating
an originating preset. Identity, stable object ID, opaque source/transform provenance,
normals, UVs and committed entity selections survive unchanged opening and saving.
The saved Mesh bar exposes translation/positive uniform scale, undo/redo and saved
selection controls. Transforms commit coordinate changes and record parameters in
history; origin/transform provenance remains intact. New Mesh imports avoid reusing
an already restored document/object identity. Switching documents retains adapters.

The host persists checked sidecars in IndexedDB, separately from the small
localStorage project/library JSON. The complete resource transaction stays open
while library writes and host restoration run. A failed library write or activation
aborts resource writes; a failed resource commit restores the project namespace and
host. The before-open backup also owns checked resource bytes in one bounded archive
slot. This provides handled-failure rollback across both stores; an abrupt process
termination between distinct storage systems is not a cross-store atomicity promise.
Optional unavailable inputs in a saved preview are preserved as missing rather than
invented. Resource exports require all authoritative inputs.

Mesh replay verifies inverse source/selection restoration, preserves revisions after
undo/redo or a pruned redo branch, continues command IDs after reopen, and folds the
native 100-edit window into a checkpoint. Exports are detached immutable JSON. Surface
promotion snapshots now use the same 24-byte-header Mesh codec that their references
advertise. The separate core M3D transport codec is not treated as interchangeable.
Production builds put core/kernel definitions in shared chunks so feature-store
initialization cannot run before their document classes are initialized.

See the [PRJ15 software evidence](unified-projects-acceptance.md#prj15-verified-resources-and-native-mesh--october-2).
Published 1.6.0 release artifacts and signing configuration are unchanged.

## PRJ16 additional source representations — delivered qualified scope

The [representation inventory](project-representation-inventory.md) is the authoritative
support matrix. PRJ16 completes its desktop/web implementation and software evidence;
qualification remains bounded rather than asserting support for every schema value.

- Verified dense scalar Volume samples retain all eight little-endian encodings,
  original source bytes, spatial metadata and replay, as recorded in the first slice.
- **Projects → document → Edit source definition** adds an editor over existing
  module commands. It displays measured numerical samples or canonical incidence,
  applies validated source JSON, and provides document undo/redo. It preserves the
  original identity, opaque source fields, metadata, display and saved results.
- Curve qualification includes planar implicit/polar definitions, nonperiodic
  Bézier/B-spline/NURBS with complete control data, exact stored polylines/derived
  snapshots, and Curve-on-Surface with an exact saved Surface generation.
- Surface qualification includes explicit/implicit and periodic parameter patches,
  complete spline patches, literal Weierstrass definitions, six existing Curve
  constructions (extrusion, revolution, ruled, loft, sweep and tube), and checked
  Mesh-backed sources. Constructions reuse the existing tessellator and require exact
  parent generations; resource-backed Surfaces require a stable resource reference
  or an explicit Mesh generation.
- Geometry qualification adds bounded saved scene primitives and canonical
  constructions/relationships, including circles. CW/simplicial Topology sources
  use the existing Topology command log and canonical finite-2D adapter. The layout
  is schematic; incidence counts are authoritative within that declared model.
- Every retained additional source is qualified before activation. Incomplete
  expressions/control data, missing or stale parents, missing buffers, unsupported
  branch/domain contracts and coordinates outside the viewer range stay explicit.
  Editing a parent does not silently regenerate a dependent document.
- Curve/Surface/Geometry history now keeps a 100-edit window, preserves generations
  after undo/redo and a pruned redo branch, exports detached data and continues command
  IDs after reopening. Bounded older Curve/Surface logs are folded into that window;
  rejected edits preserve redo.

The source matrix has 27 document fixtures and independent coordinate/incidence
oracles, plus Mesh-backed buffer and history/resource rejection checks. Real UI
journeys edit seven additional sources, save/export them to a fresh Electron profile,
close/relaunch the process and exercise restored history. Chromium repeats editing,
reload/save and restored history in both locale/time-zone configurations.

**Projects → Starter workflow** also exposes three independent, engine-free
presets: **Spline and Surface Lab**, **Curve Construction Study**, and
**Scene and Topology Study**. Their ordinary documents include complete spline
controls, an implicit sphere, a sampled profile with exact-generation revolution/
extrusion links, a Curve on a parameter chart, scene constructions, and CW/simplicial
sources. Preview/cancel preserves the current project; opening creates fresh
identities. The source editor supports editing, undo/redo and saved replay.

The [acceptance record](unified-projects-acceptance.md) records the complete local
software run. Oriented/vector/SDF/mask/label Volume, additional Complex branch/covering
semantics, incomplete dependent recipes and combined Geometry display forms remain
preview-only in the inventory. PRJ17 exact device/installed-engine/signed-build
acceptance and PRJ18 combined release readiness remain separate gates, detailed below.

### PRJ17 / PRJ18 qualified acceptance continuation

PRJ17 now has a real installed-Sage acceptance job, using the ordinary structured
Complex and canonical Topology adapters through F05 execution/F06 publication.
Installed testing exposed and repaired the unreachable integer-homology handler,
the additive homology API mismatch and incomplete Complex pole/series output.
The adapter rejects ignored assumptions and invalid finite inputs; numeric AST
constants and evaluation points retain exact decimal rational values. Actual Sage
version, tested checkout, container and exported project/matrix fingerprints are
captured by the gate. Existing VTK/CGAL reference probes remain separately qualified.

PRJ18 combines all eight enabled desktop/web adapters into one 17-document study
with three source-generation dependencies and verified Graph/Mesh/Volume resources.
It reuses all three PRJ16 source starters and the Graph data-gap preset. The real
Electron freeze passed independent-profile import, process restart and restored
history; Chromium passed its independent-profile/reload journey in both configured
locale/time-zone combinations. Resource coordinates, scalar samples, histories,
metadata, generations and historical analysis qualification are checked explicitly.
The supported mobile Graph/Curve/Surface slice is exercised through its real model;
the complete desktop replay container remains rejected by native mobile preflight.

The [host qualification and native test pack](projects-host-qualification.md)
publishes the supported-host matrix and reconciles PRJ06/PRJ08 obligations.
**PRJ17's supported Samsung Android workflow passed physical acceptance on
October 3.** Clean source `e1298a7` was installed as a same-certificate internal
update, retaining all 20 user projects with exact before/after export comparisons.
Native picker import/export, Graph editing/undo/redo, pan/pinch, rename, cold
restart, share chooser/cancel and malformed/unsupported/cancelled imports passed.
Unsaved source survived rejection and cancellation. Only the acceptance project
was deleted and recovered through its exported JSON, then cold-restarted again.
The initial export opens in a fresh browser; the edited project round-trips
exactly through its qualified saved preview, with historical companions/results
explicitly stale. [Device evidence and returned files](evidence/projects-samsung-2026-10-03/acceptance.json)
record the APK/source/certificate hashes. The subsequent signed `9772384` build
passed Samsung damaged-store recovery and actual local external-app share delivery,
as recorded below. Native iOS acceptance remains unverified, so full PRJ17/PRJ18 native release
readiness is still open. Published 1.6.0 release signoff remains unchanged.

### Damaged mobile store recovery — October 3

Implemented in `220f67c` and `9772384`: independent primary/backup reads keep a
valid copy available after a read error; recovery and saves share one queue;
unrecoverable, unsupported and blank existing stores reject writes instead of
overwriting data or reseeding the library. Cleanup failures preserve the original
write error, and failed repair leaves recovered projects available from backup.

The complete mobile suite passed **339 tests in 59 files**, plus mobile typecheck
and identity checks. [Signed Android CI 37075667848](https://github.com/expert10000/Math3D/actions/runs/37075667848)
passed Workspace/lifecycle/layout checks and **11 real-file recovery cases**,
including force-stop/relaunch and persistent primary repair. The native diagnostic
uses the production storage service in an isolated private directory and checks
the normal library's before/after fingerprints. It never damages user projects.
[Evidence](evidence/projects-storage-recovery-2026-10-03/acceptance.json) and the
[repeatable procedure](mobile-storage-recovery-checks.md) identify the exact
source, APK and certificate. **The same signed APK passed all 11 checks on the
Samsung A56 / Android 16.** The runner confirmed process termination and a new
process after relaunch; the detailed report was exported through the native
picker. All four normal-library file fingerprints matched before/after the
diagnostic, all 21 saved projects remained present, and the existing acceptance
project exported byte-identically before/after the same-signer upgrade. No user
project was deliberately damaged, and app data was neither cleared nor uninstalled.
The app is left running. The Android damaged-store gate is complete for this
declared fixture/service scope. The continuation below closes local external-app
share delivery; physical iOS acceptance remains open.

### Actual local share recipient delivery — October 3

The signed Samsung APK from clean source `9772384` delivered the existing
**PRJ17-Minimal-Study** through Math3D's saved-project **Share** action and the
native Android chooser to **Math3D Local Receiver**, a separate local acceptance
app. Distinct Android UIDs and installed APK hashes were verified. The recipient
read the granted content URI through `ContentResolver`, saved 8,207 bytes in its
own private storage and recorded the receipt. The file matched the original
export byte-for-byte, SHA-256
`8938b0bfc2c2653b7ddc38f5991c42548cfed40449688e777d3f58c5ef35c2fc`.

The actual received file was imported into a fresh Chromium context. Complete
identity, metadata, source generations, relations and historical results survived
library import, export and reload; both browser exports were byte-identical.
The edited Graph's unchanged Surface remains a qualified saved preview with full
opening disabled. The Samsung library still contained 21 projects on return;
its post-share export was byte-identical. Only the receiver fixture was removed
after collecting evidence, and Math3D remained running.

[Structured evidence, receipt and returned files](evidence/projects-local-share-2026-10-03/acceptance.json)
and a [repeatable recipient fixture](../tests/fixtures/android-share-receiver/README.md)
are recorded. This closes the actual external-recipient handoff gate for the
user-selected local delivery scope. Email, messenger, nearby transport and another
physical device were not tested. Physical iOS acceptance remains open; published
1.6.0 release approval is unchanged.

## PRJ19–PRJ21 continuation — started October 3

Development continues on `codex/projects-prj19-21` from main `8a1ee6f`.
These milestones extend the supported Projects workflow. Their first deliveries
do not replace PRJ17/PRJ18's outstanding physical signed iOS acceptance.

| Milestone | First implementation | Completion gate / remaining work |
| --- | --- | --- |
| PRJ19 — Multiple Graph documents | Desktop/web project opening creates a separate Graph command adapter for every document. Explorer switching preserves each session. Validated Graph replay retains bounded undo/redo across save and transfer, including historical point-table resources. Promotion compatibility resolves the actual parent Graph | First desktop/web slice passed real editing/switching, independent-profile import, Electron restart and browser reload in both configured locales. Native mobile editing still requires one checkpointed Graph |
| PRJ20 — Explicit dependency refresh | Manage saved project → Relations and availability → Create refreshed copy rebuilds supported Graph-derived companions and six Curve-to-Surface construction families. Five Graph analysis families publish new records with current provenance. Original documents, relations and historical analysis remain intact; project undo/redo reverses additions | Requested local adapters delivered and passed desktop/browser UI checks; see [support matrix](projects-refresh-support.md). Missing sources and duplicate copies/publications reject without mutation. Further external-engine adapters remain future work; no automatic scientific recomputation |
| PRJ21 — Unified mobile explorer | Projects → Documents and relations displays checkpointed named-project documents grouped by module, their revisions, archive/preview limits, dependency freshness and analysis provenance. Broader mixed projects are imported and retained as complete saved previews | Requested preview scope delivered. Exact signed-build Samsung acceptance passed all eight modules, relations/results, restart, byte-exact export and fresh-browser return. All 21 original library IDs were retained. Per-document mobile editors and physical iOS acceptance remain future work |

The **initial delivery** had software acceptance before broader preview retention
and signed handset testing. Those requested follow-ups are now completed below.
Initially, two Electron journeys passed, including real process restart;
four Chromium journeys passed in en-US/UTC and pl-PL/Auckland, including independent
storage and reload. Contracts retain exact Graph identities/history, historical
companions/results and point-table inputs present only in undo/redo. Mobile
inspection contracts and typecheck passed; the Android Hermes bundle exported
successfully. Those initial checks provided software evidence; the separate signed
Samsung completion below qualifies the subsequent PRJ21 build.
See [the continuation acceptance record](unified-projects-acceptance.md#prj19prj21-first-deliveries--october-3).

### Additional PRJ20/PRJ21 delivery — October 3

The follow-up implements the requested remaining software slices:

- **PRJ21 broader preview retention** (`66a963d`): checkpointed named projects,
  raw mixed-workspaces and v2 workspace handoffs are retained in schema-3 storage.
  All eight modules, archived documents, scripts, relations, analysis and external
  references remain together. Named JSON exports byte-for-byte. Schema-2 migration,
  atomic backup recovery and startup/editor separation are covered by contracts.
- **PRJ20 more refresh adapters** (`6201e2c`): six Curve-to-Surface constructions
  (extrusion, revolution, ruled surface, loft, sweep, tube), plus Graph integral,
  arc length, critical points and intersections alongside the earlier derivative.
  Ordered current source generations and recorded numerical parameters are used;
  historical targets/results remain intact. Desktop and both browser locales passed.

[Supported operations and UI paths](projects-refresh-support.md) define this
delivery. Further mobile editors, external-engine refresh adapters, source sidecar
transfer on mobile and physical iOS acceptance remain separate future work.

### Signed Samsung completion — October 3

The shared-key internal APK from clean source `6201e2c` was installed as an update
on Samsung SM-A566B (Android 16 / API 36). **Documents and relations** passed for
the existing catenary project and a broader named preview with 17 documents across
all eight modules, three current relations and two recorded analysis results.
The original edited Graph stayed active. The preview survived process restart;
its 23,234-byte native export and fresh-browser exports matched the input exactly.
All 21 original library identities remained present; only the new acceptance
preview was added. The original catenary project also exported unchanged.

The damaged-store runner now verifies the installed APK SHA-256 on-device and
handles retained scroll position. Samsung passed **10/10 preparation checks and
11/11 restart checks**, with the real library unchanged. [Acceptance details and
public fixture evidence](unified-projects-acceptance.md#prj20prj21-completion--october-3)
close the three requested follow-up items. This continuation is independent of
published 1.6.0 approval and wider device/editor acceptance.

## PRJ22–PRJ24 continuation — October 3

Development starts from main `bbd818c` on `codex/projects-prj22-24`. The previous
corrected Android workflow completed successfully; its result closes the CI
runner follow-up without changing the exact Samsung build recorded above.

| Milestone | Scope | Acceptance gate |
| --- | --- | --- |
| PRJ22 — Mobile project resources | Import desktop packages, retain checked Graph tables, Mesh and Volume source bytes, attach resources to the matching saved workspace, expose missing-resource status, and export retained bytes | Shared resource validation and schema-4 atomic retention; corruption/version/conflict rejection; real Samsung import/restart/export and desktop return |
| PRJ23 — Graph editing within mixed projects | Choose an unarchived Graph in Documents and relations; independent bounded history per Graph; save current Graph generations while retaining other modules, metadata, scripts, relations, resources and historical results | Missing data blocks the affected Graph; switching preserves drafts/history; undo/redo, save/restart and returned package validation |
| PRJ24 — Complete mobile project round trip | Public all-eight-module package with two Graphs and real source resources; desktop → Samsung → desktop/browser, including edits, undo, restart, export and rejected conflicts | Exact module/resource retention and expected scientific source generations; unchanged unrelated Samsung projects; signed-build evidence and reproducible acceptance runner |

PRJ22 software implements the shared desktop package format and resource codecs.
Mobile schema 4 retains JSON and sidecars together in the existing atomic backup
writer; schemas 1–3 migrate. Package import/export is bounded to 25 MiB on mobile.
Missing bytes remain explicit, and attaching resources requires the same saved
workspace version. PRJ22/23 native acceptance and PRJ24 completion are recorded
below; additional non-Graph mobile editors and physical iOS acceptance remain
separate work.

### PRJ23 software delivery

Mixed-project cards now expose **Edit Graph** beside each unarchived Graph in
Documents and relations. Separate shared Graph command adapters retain bounded
undo/redo across document switching, save, restart and desktop return. Only Graph
history is replayed on mobile; other modules must be checkpointed. Active document
selection is retained in schema 4. Missing current or historical point tables
block the affected Graph, and unsupported/archived documents remain inspectable.

Saving captures newly authored tables and all historical table inputs alongside
retained Mesh/Volume bytes. Other documents, metadata, scripts, relations and
historical results are preserved. Creating/importing another project preserves
the enclosing mixed container instead of saving an orphan Graph. The isolated
native recovery fixture now includes two Graphs, resources and saved Graph replay.
Signed Samsung round-trip acceptance is recorded with PRJ24 after installation.

### PRJ24 acceptance tooling

The [mixed-project acceptance runner](projects-mobile-roundtrip.md) generates a
public 19-document package with two Graphs and five source sidecars. Electron UI
import/export and fresh-browser byte-exact resource export/reload have passed.
The return verifier checks unchanged non-Graph documents and resource bytes,
retained Graph edits and restored independent history. Signed Samsung delivery
and the actual returned-file run are recorded below.

### PRJ22–PRJ24 signed Samsung completion

**PRJ22, PRJ23 and PRJ24 are delivered for the declared Android/desktop/browser
scope.** The shared-key internal APK from clean source `bdbe5a9` passed
[Android CI](https://github.com/expert10000/Math3D/actions/runs/37126566735) and was
installed as an update on Samsung SM-A566B / API 36.

The public 19-document package passed native missing-table qualification,
corrupt-resource rejection, same-version attachment and verification of all five
source resources. Before edits, Samsung's export matched the desktop delivery
byte-for-byte. The data Graph's pan and the explicit Graph's `x*x+2` edit survived
switching, independent undo/redo, save and cold restart. The 38,161-byte returned
package retains every non-Graph entry, metadata, script, relation, historical
result and original source resource. Electron restored both Graph histories;
a fresh browser retained exact package bytes through export and reload.

Older-workspace resource attachment and duplicate-identity import rejected;
the edited export remained byte-identical. Samsung also passed **10/10 recovery
preparation checks and 11/11 restart checks**, including isolated mixed-project
resource/history retention, with the real library unchanged.

All 22 pre-existing library identities remain present; only the acceptance
project was added. The original 8,207-byte project also exported unchanged.

The final resource-action guard was qualified on clean signed source `4fb0c97`
from [Android CI](https://github.com/expert10000/Math3D/actions/runs/37129330126).
Samsung confirmed that legacy Graph cards hide resource attachment while mixed
projects retain it, all five resources survived the update, the saved `x*x+2`
Graph reopened, and native export remained byte-identical to the accepted return.
Recovery again passed 10/10 preparation and 11/11 restart checks with the real
library unchanged. Main's subsequent desktop changes through `6f0abf9` were
merged; the combined build, type checks, both Electron delivery/return runs and
fresh-browser export/reload passed. Mobile/core source is identical to this APK.

[Public packages, verification results and screenshots](evidence/projects-prj24-samsung-2026-10-03/acceptance.json)
record the exact tested build. This continuation does not expand mobile editing
to non-Graph modules or establish physical iOS/release signoff.

## PRJ25–PRJ27 continuation — October 3

Development continues from main `482acbe` on `codex/projects-prj25-27`.

| Milestone | Scope | Acceptance gate / status |
| --- | --- | --- |
| PRJ25 — Mobile Curve editing | Documents and relations opens independent nonperiodic explicit/parametric 2D and 3D Curves. Shared bounded Curve history, expression/domain edits, undo/redo, complete-project save and selected-document restart | Delivered: shared replay/preservation contracts and signed Samsung expression editing, invalid-source rejection, independent history, 3D projection, switching and cold restart passed. Unsupported/dependent Curve representations remain qualified previews |
| PRJ26 — Mobile Graph→Curve refresh | Explicitly create a new companion from the current supported Graph source, preserving historical documents, relations, analysis and resources | Delivered: desktop-parity contracts and actual Samsung creation passed; the original companion remains, duplicate refresh is disabled with its reason, and all five source resources remain verified |
| PRJ27 — Samsung Graph/Curve round trip | Graph edit → refreshed Curve → Curve edit/undo/redo → save/restart → native export → independent desktop/browser return | Delivered: actual signed Samsung export verified, Electron restored both histories, fresh-browser export/reload remained byte-exact, recovery passed 10/10 and 11/11, and all 23 original library identities and the baseline export remain unchanged |

PRJ25 moves the desktop Curve command adapter into the shared kernel while keeping
the established `math3d.curve-replay.v1` format. Mobile schema 5 retains one active
Graph or Curve and migrates schemas 1–4. Curve samples are bounded previews of
saved literal expressions; invalid drafts leave the source/history unchanged.

PRJ26 exposes **Create refreshed Curve** under supported Graph→Curve relations.
The explorer reflects committed unsaved Graph/Curve changes in the active project;
refresh persists the complete enclosing container before replacing its sessions.
No scientific operation runs automatically. Current, missing, archived, dependent
or already-refreshed sources show the reason the action is unavailable.

Desktop opening now restores a promoted literal Curve with saved replay into its
own native editor/history. The model-only Electron return preflight checks both
Graph and Curve undo/redo. The
[acceptance runbook](projects-mobile-curves.md) covers the actual native returned
package, exact signed build and unchanged existing library.

### PRJ25–PRJ27 signed Samsung completion — October 4

**PRJ25, PRJ26 and PRJ27 are delivered for the declared Android/desktop/browser
scope.** Clean signed source `12f8e1e` passed [Android CI, attempt 2](https://github.com/expert10000/Math3D/actions/runs/37156743806)
after a transient Electron-download HTTP 503 on the first attempt. Its shared-key
APK was verified and installed as an update on Samsung SM-A566B / API 36.

The 20-document input exported unchanged before editing. Native Graph `x*x+4`
undo/redo, an explicit refreshed Curve, Curve `x*x+5` edit/undo/redo, invalid-expression
rejection, document switching and selected-Curve cold restart passed. The returned
40,534-byte package contains 21 documents, six relations and all five original
source resources. Original documents except the edited Graph, metadata, scripts
and historical results remain unchanged; the new Curve has exact captured lineage.
Electron restored independent Graph/Curve undo/redo, and a fresh browser retained
the exact returned package through export and reload.

Exact-installed-build damaged-store checks passed **10/10 preparation and 11/11
restart checks**, including retained Graph/Curve replay and the selected Curve.
The normal library remained unchanged during recovery, and the acceptance export
after recovery matched exactly. All 23 original library identities remain present;
only PRJ27 was added. The original 8,207-byte baseline also exported unchanged.

[Public packages, verification results, build identity and screenshots](evidence/projects-prj27-samsung-2026-10-04/acceptance.json)
record the actual device workflow. Subsequent documentation/fixture changes do not
change the APK's mobile or kernel source. Other Curve representations, the other
six mobile editors, broader mobile refresh and physical iOS/release signoff remain
separate work.


### PRJ28–PRJ30 mobile Surface continuation — October 4

| Commit | Scope | Status |
| --- | --- | --- |
| PRJ28 | Shared bounded Surface replay; mobile independent nonperiodic literal parametric x(u,v), y(u,v), z(u,v) editor, domain controls, undo/redo/save and cold restart in the complete mixed project | Delivered for Android/desktop/browser; signed Samsung Surface editing, rejection, independent history and cold restart passed |
| PRJ29 | Explicit fork refresh for Graph→Surface revolution/extrusion and qualified literal Curve→Surface revolution/extrusion; retained historical targets/results/resources and disabled reasons | Delivered; all four adapters match desktop fork/lineage; Graph and Curve extrusion passed on Samsung with duplicate blocking |
| PRJ30 | Signed Samsung Graph/Curve/Surface editing, rejection, switching, refresh, cold restart, damaged-store recovery and actual package return to desktop/browser | Delivered; clean signed `99363f9`, actual 27-document/five-resource return, Electron and both browser locale checks, 10/10 + 11/11 recovery and all 24 original identities preserved |

Constructed and procedural Surface targets remain saved previews on mobile;
editing is qualified only for independent literal parametric sources and their
retained undo/redo recipes. Other representations, editors and physical iOS
release acceptance remain separate work.

The [acceptance runbook](projects-mobile-surfaces.md) and
[exact-build evidence](evidence/projects-prj30-samsung-2026-10-04/acceptance.json)
record the actual Samsung continuation. The 54,077-byte return retains 11 relations,
all eight modules, historical results, metadata, scripts and original resource bytes.
The post-recovery export and original 40,534-byte PRJ27 baseline are byte-identical
to their recorded counterparts. Device testing found and fixed cross-project editor
transition guards; host visual verification also fixed selection of the reopened
Surface in the inspector. Physical revolution testing is not claimed: the four
refresh adapters have model parity, with the two extrusion paths exercised natively.

Desktop preview follow-up (October 4): fixed blank saved-source drawings caused
by unstable optional Curve overlays repeatedly rebuilding WebGL contexts. Curve
cleanup now releases its context, the saved-source editor pauses the covered
module workspace, and its camera fits the document bounds. Regression checks
cover stable Curve canvases and visible saved Curve/Surface/Geometry/Topology
drawings in Electron and both browser locales, including transfer and restart.

Project-opening follow-up: the explorer keeps Open saved project visible while
scrolling, explains why saved-preview document buttons are disabled, and brings
the compatibility preview into view. A saved project can also be opened directly
from the current-workspace view after a desktop restart.
