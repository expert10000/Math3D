# Project handoff contract

## Scene handoff — version 1

`math3d.project-handoff` version 1 wraps a validated `math3d.scene-project` v1 document. Its manifest records producer platform/name/version, stable project ID, a SHA-256 revision of the scene, an optional base revision, a scene content hash, required capability IDs, and result descriptors. Result descriptors identify external results; they do not imply that result bytes are embedded.

`deserializeProjectHandoff` accepts old scene-project v1 files by migrating them into a legacy handoff with no base revision. It does not invent ancestry. Imports reject mismatched IDs, content hashes, malformed revisions, and unknown handoff versions. `serializeProjectHandoff` writes canonical JSON for repeatable exchange.

The revision is a content hash of the full scene, including its metadata and update time. A host must compare an incoming base revision against its current project revision before replacing an existing project. A mismatch is a conflict; it must not be silently overwritten.

## Graph mixed-workspace handoff — version 2

G2D33 extends the same `math3d.project-handoff` envelope with version 2. Its `project` is a normal `math3d.mixed-workspace` v1 document containing exactly one Graph and checkpointed companion documents (`replay: null`). Desktop verifies replay before exporting checkpoints. Graph transfer selects the Graph, its direct promotion targets, their relations/results and referenced artifact descriptors; unrelated desktop tabs are excluded.

| Field | Version 2 contract |
| --- | --- |
| `producer` | Platform, bounded name and version |
| `projectId` | Graph document ID |
| `projectRevision` | Structural SHA-256 of the complete checkpoint workspace |
| `baseRevision` | Previously imported project revision, or `null` without ancestry |
| `contentHashes.workspace` | Same verified complete-workspace hash |
| `requiredCapabilities` | Computed workspace module and Graph capabilities |
| `project` | Validated mixed-workspace checkpoint |

`createWorkspaceProjectHandoff`, `parseWorkspaceProjectHandoff` and `serializeWorkspaceProjectHandoff` own this version in `packages/core/src/workspaceProjectHandoff.ts`. Validation checks exact envelope keys, producer, capabilities, IDs, content hashes, revision syntax and workspace size/structure. The existing scene `deserializeProjectHandoff` reader retains its v1 boundary; callers dispatch by version rather than treating a workspace as a scene. Unknown versions/capabilities and corrupt inputs fail closed.

Mobile retains the incoming `projectRevision` as its next export base. Desktop checks a same-ID return against the **live** full checkpoint immediately before replacement, including source, viewport, styles, selection/pins and retained result/companion descriptors. A missing or different base is a conflict and preserves local work. Opening another project backs up the previous workspace locally. Accepted checkpoints and ancestry persist for reopen; undo history remains session-local.

The workspace revision differs from the Graph mathematical source hash: display/result changes can cause handoff divergence without changing mathematical generation. Retained stale analysis envelopes remain inspectable and are not silently rerun. Artifact descriptors do not embed result bytes; point-table sidecars transfer separately. Hashes detect mismatches and do not authenticate a sender.

Legacy raw Graph/mixed imports have no invented ancestry. Graph-only identity collisions import copies and clear ancestry; rich collisions require a desktop identity fork rather than silently losing companions.

See the [G2D33 regression record](graph2d-g33-round-trip-acceptance.md) and [G2D35 architecture/parity guide](graph2d-architecture-schema-algorithms-parity.md). Automated transfer evidence is implemented; full native release acceptance remains pending [MOB-G13](mobile-graphs-g11-g13-acceptance.md).
