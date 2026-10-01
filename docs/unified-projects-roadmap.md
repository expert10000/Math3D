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
Topology and supported Complex Function Explorer sources. Other source types
remain saved previews until their native editor adapters pass round-trip acceptance.

## Current delivery status (2026-10-01)

PRJ01–PRJ12 are integrated into `main` at `766776a27c6601e50d513a2217e3a4bf513c8e0d`.
The main Projects workflow passed in
[CI 36892375601](https://github.com/expert10000/Math3D/actions/runs/36892375601).
PRJ13 continues on `codex/projects-native-restoration`. On October 1 this
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

The integrated software slice is PRJ01–PRJ12, extended by the supported PRJ13
restoration adapters. Full PRJ06/PRJ08 closure requires the
following measured deliveries. These are pending work, not silently supported
imports. Each adapter must validate the entire saved representation before
activation and leave source generation unchanged on open.

| Order | Milestone | Deliverable | Required evidence |
| --- | --- | --- | --- |
| 1 | PRJ13: Topology and Complex native restoration | Delivered for fundamental diagrams and supported Function Explorer sources; existing command adapters retain source, branch/contour choices, results and provenance | Seven source/replay contracts and a real UI journey with two documents of each module, unchanged opening, edit, undo/redo, save, process restart/reopen, branch/contour edits and invalid-contour rollback |
| 2 | PRJ14: Volume restoration | Restore supported analytic/custom-field recipes and spatial metadata through the existing Volume adapter; externally backed datasets require PRJ15 | Unchanged source/spatial identity on open; edit/history/save/reopen plus explicit missing/unsupported payload rejection |
| 3 | PRJ15: Verified resource transfer and Mesh restoration | Transfer required Mesh/Volume/point-table bytes separately with bounds and verified references; restore Mesh through its resource store | Byte/checksum/shape validation before mutation, corrupt/missing sidecars, rollback, independent host transfer, native edit/history and restart |
| 4 | PRJ16: Additional source representations | Add one explicit Curve/Surface/Geometry host adapter at a time; keep incompatible representations as previews | A representation inventory with source-preserving restore/edit/history/save/replay evidence for each enabled row |
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
after a rejected same-ID import. PRJ12 software integration is complete;
PRJ14–PRJ18 remain the explicit next implementation/acceptance sequence.

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
adapters belong in the PRJ16 representation inventory. External bytes and native
device/installed-engine acceptance remain PRJ15/PRJ17 gates.

Complex replay now retains live revisions after undo/redo and a pruned redo
branch, continues command IDs after reopen, and bounds replay to the native
100-edit history window. Irreversible selection/analysis intents checkpoint
their actual state and cleared history. Entire source candidates are validated
before any ordered field edit is committed.
