# Unified Projects: post-1.6.0 delivery phase

Unified Projects is the next product phase after the kernel-backed documents and
the [continuation fixes](post-1.6.0-upgrade-regressions.md). The project becomes the
named container users browse; documents, results, artifacts and relations continue
to use the existing mixed-workspace contracts. No module-local persistence format
is replaced until its round-trip parity gate passes.

This plan adapts the supplied project-explorer proposal to the audited code. The
kernel already owns identities, replay and relations; Graph2D participates in mixed
workspaces and mobile has a library. The current desktop reopen callback restores
Graph and its Curve/Surface promotions. It does not restore every module, so a
saved-project preview must not be presented as a completed full workspace restore.

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

Work stays on `codex/post-1.6.0-audit`. Rebase on the confirmed release commit
before integration; keep existing release scope and signed-build evidence separate.

## Implementation record

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
project suites and passes 408 tests across 64 files. Renderer/E2E/mobile/fixture
TypeScript, main/renderer/web production builds and dependency boundaries pass.
This phase has eight passing Project Electron journeys plus six Graph Gallery/kernel
regression journeys (fourteen total), plus two Chromium project interchange journeys.
Electron downloads use the native session download hook
in the transfer test; the test also verifies the resulting file before import.
It has not run a native-mobile device or full cross-module restore acceptance gate.

## Editor restoration continuation

- PRJ09: Projects is the first entry in the main module navigation. The explorer
  identifies Current workspace, Saved project preview and Managing saved project
  explicitly; opening the library does not replace the active editors.
- PRJ10 (planned): restore independently authored Curve/Surface documents with
  preserved identities, source editing and project save/restart coverage.
- PRJ11 (planned): restore Geometry documents and constructions with the existing
  Geometry editor and verify edit/save/restart behavior.
