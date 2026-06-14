# Construction Graph Architecture

Math3D's durable workspace model is a `ConstructionGraph`. Geometry, inspector,
dependency, script, claims, and analysis views are projections of that graph.

```text
Core construction engine
        |
ConstructionGraph
        |
  +-----+------+--------+--------+----------+
  |            |        |        |          |
Geometry   Inspector  Script   Claims    Analysis
```

## Core contract

The graph contract lives in `packages/core/src/constructionGraph.ts`.

- Nodes represent parameters, geometry, constructions, scripts, claims, and
  analysis results.
- Directed edges express dependencies and semantic relationships.
- `indexConstructionGraph` validates references and computes topological order.
- `projectConstructionGraph` creates view-specific projections without copying
  or owning a second model.
- `getAffectedConstructionGraphNodeIds` supplies the recomputation frontier
  after a source node changes.

The graph is optional in the version 1 `SceneDocument` extension, so existing
projects remain readable while graph-backed projects can persist one shared
model.

## Migration path

`buildConstructionGraphFromDerivedConstructions` adapts the existing core
derived-construction engine into the shared graph. New features should add
nodes and edges to the same graph, then expose a projection:

- Definition Editor: construction and parameter nodes.
- Parameter Manager: parameter nodes plus dependent constructions.
- Construction History: graph mutations or command envelopes.
- Theorem Verification: claim nodes depending on construction nodes.
- Geometry to Analysis Bridge: analysis nodes depending on geometry nodes.
- Geometry to Script Synchronization: script nodes connected by `defines`
  edges to the nodes they own.

During migration, renderer-specific state may continue to exist, but it should
be treated as a view cache derived from the graph rather than an independent
source of truth.

## Live script ownership

The first live synchronization path is Script to Geometry:

- `renderer/src/geometry/constructionGraphBuilder.ts` merges graph additions,
  assigns stable edge IDs, and reconciles geometry objects with graph nodes.
- A successful procedural-script execution updates the geometry view state and
  the shared graph in one transaction.
- Every executed script has a `script` node. Objects created by that script are
  connected to it by `defines` edges.
- Failed script executions do not mutate either the scene or the graph.
- The Dependency View projects the shared graph and displays script ownership.
- Workspace export stores the graph in the SceneDocument extension; workspace
  import restores it before views are projected.

The geometry renderer still consumes its existing object state during this
incremental migration. That state is synchronized with the graph and should be
considered a rendering cache, not a separate ownership model.
