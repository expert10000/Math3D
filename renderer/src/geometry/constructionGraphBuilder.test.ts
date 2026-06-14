import { describe, expect, it } from "vitest";
import { createConstructionGraph } from "@math3d/core";
import {
  createConstructionGraphBuilder,
  synchronizeGeometryObjectGraph,
  synchronizeScriptOwnershipGraph,
} from "./constructionGraphBuilder";

describe("construction graph builder", () => {
  it("merges live and projected graph entries with stable edge ids", () => {
    const builder = createConstructionGraphBuilder(
      createConstructionGraph([{ id: "script:main", kind: "script", type: "scene-script" }])
    );
    builder.addNode({ id: "object:box", kind: "geometry", type: "geometry-object", label: "Box" });
    builder.addEdge({ sourceId: "script:main", targetId: "object:box", relation: "defines" });
    builder.addEdge({ sourceId: "script:main", targetId: "object:box", relation: "defines" });

    const result = builder.build();
    expect(result.errors).toEqual([]);
    expect(result.graph.nodes.map((node) => node.id)).toEqual(["script:main", "object:box"]);
    expect(result.graph.edges).toEqual([
      {
        id: "dependency:script:main:object:box:defines",
        sourceId: "script:main",
        targetId: "object:box",
        relation: "defines",
      },
    ]);
  });

  it("synchronizes script ownership for created and deleted objects", () => {
    const initial = synchronizeScriptOwnershipGraph({
      graph: createConstructionGraph(),
      scriptId: "geometry-procedural",
      scriptTitle: "Geometry procedural script",
      scriptSource: "add box as box1",
      objects: [{ id: "box1", name: "Box", type: "box" }],
      createdObjectIds: ["box1"],
      deletedObjectIds: [],
    });
    const next = synchronizeScriptOwnershipGraph({
      graph: initial,
      scriptId: "geometry-procedural",
      scriptTitle: "Geometry procedural script",
      scriptSource: "delete box1\nadd sphere as sphere1",
      objects: [{ id: "sphere1", name: "Sphere", type: "sphere" }],
      createdObjectIds: ["sphere1"],
      deletedObjectIds: ["box1"],
    });

    expect(next.nodes.map((node) => node.id)).toEqual(["script:geometry-procedural", "object:sphere1"]);
    expect(next.edges.map((edge) => [edge.sourceId, edge.targetId, edge.relation])).toEqual([
      ["script:geometry-procedural", "object:sphere1", "defines"],
    ]);
  });

  it("reconciles live geometry nodes while preserving script ownership", () => {
    const graph = createConstructionGraph(
      [
        { id: "script:main", kind: "script", type: "scene-script" },
        { id: "object:old", kind: "geometry", type: "geometry-object" },
      ],
      [{ id: "defines-old", sourceId: "script:main", targetId: "object:old", relation: "defines" }]
    );
    const next = synchronizeGeometryObjectGraph(graph, [{ id: "new", name: "New Box", type: "box" }]);

    expect(next.nodes.map((node) => node.id)).toEqual(["script:main", "object:new"]);
    expect(next.edges).toEqual([]);
    expect(next.nodes[1]?.label).toBe("New Box");
  });
});
