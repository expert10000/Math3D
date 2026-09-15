# Topology revisioned Mesh snapshot handoff

**Status:** T12 implemented
**Ownership:** Mesh owns polygonal geometry; Topology owns the captured finite incidence complex and its derived results.

## Contract

`createRevisionedMeshTopologyHandoff` captures a complete indexed triangle Mesh as a
read-only `MeshTopologySnapshot`. The capture records the source Mesh ID and content
revision, a deterministic snapshot hash, and stable vertex, edge, and triangle IDs.
The snapshot contains incidence only; later edits to live Mesh buffers cannot rewrite
it.

Every source element has a revision-qualified locate reference of the form:

```text
<source-mesh-id>@<source-mesh-revision>/<cell-id>
```

Canonical cells retain source references, so a selected canonical vertex, edge, or
face can be resolved to its originating Mesh snapshot element. Locate in Mesh is
enabled only while the current Mesh ID and revision match the captured source.

## Lifecycle

- `current`: source Mesh ID and revision match; analysis and locate-back are current.
- `stale`: the same Mesh advanced to another revision; the captured snapshot and old
  results remain unchanged and a new explicit analysis is offered.
- `source-unavailable`: another Mesh is active, or no Mesh is available; the snapshot
  remains inspectable but cannot be located into the unrelated live Mesh.

There is no live coupling. Re-analysis creates a new handoff rather than mutating the
old source or silently relabeling old results as current.

## User interface

Open **Topology → Mesh / Geometry interoperability**, then choose **Analyze current
Mesh**. The result card shows the source Mesh ID/revision, snapshot hash, stable cell
counts, and current/stale state. Choose any canonical vertex, edge, or face and use
**Locate … in originating Mesh snapshot** while the source revision is current.

The application retains the captured handoff across Topology ↔ Mesh workspace
navigation. Returning after a Mesh mutation exposes the stale state instead of
reanalyzing or replacing the snapshot automatically.
