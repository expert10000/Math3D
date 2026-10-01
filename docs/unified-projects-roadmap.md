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
  Three dependency tests cover stale chains/unrelated documents, unresolved links,
  and missing/unverified artifacts. The fifth project Electron journey verifies
  stale lineage, locate-back, recorded analysis authority and missing sidecars.
  Desktop and phone inspection screenshots were visually checked.
- PRJ06–PRJ08: planned, subject to the preceding gates.

The repeatable `node scripts/post160-roadmap-audit.mjs --run` gate includes both
project suites and passes 394 tests across 61 files. Renderer/E2E TypeScript,
main/renderer production builds and dependency boundaries pass. This phase has
five passing Project Electron journeys; the preceding Graph Gallery and kernel
journeys are separate regression checks.
It has not run a native-mobile device or full cross-module restore acceptance gate.
