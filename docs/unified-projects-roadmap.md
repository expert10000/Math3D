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
Full host restoration is a PRJ06/PRJ08 obligation. Rich library actions, inferred
dependency editing and template execution do not enter the first commits.

Work stays on `codex/post-1.6.0-audit`. Rebase on the confirmed release commit
before integration; keep existing release scope and signed-build evidence separate.

## Implementation record

- PRJ01: in progress.
- PRJ02: in progress.
- PRJ03–PRJ08: planned, subject to the preceding gates.
