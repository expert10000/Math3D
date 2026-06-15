import { describe, expect, it } from "vitest";
import { createConstructionGraph } from "@math3d/core";
import {
  applyGeometryObjectGraphCommand,
  commitConstructionGraphHistory,
  createConstructionGraphCommandHistory,
  createConstructionGraphBuilder,
  projectGeometryObjectsFromConstructionGraph,
  redoConstructionGraphHistory,
  replaceGeometryObjectsInConstructionGraph,
  synchronizeGeometryObjectGraph,
  synchronizeScriptOwnershipGraph,
  undoConstructionGraphHistory,
} from "./constructionGraphBuilder";
import { createGeometryObject } from "./proceduralObjects";

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
    const box = createGeometryObject("box", "box1");
    const sphere = createGeometryObject("sphere", "sphere1");
    const initial = synchronizeScriptOwnershipGraph({
      graph: createConstructionGraph(),
      scriptId: "geometry-procedural",
      scriptTitle: "Geometry procedural script",
      scriptSource: "add box as box1",
      objects: [box],
      createdObjectIds: ["box1"],
      deletedObjectIds: [],
    });
    const next = synchronizeScriptOwnershipGraph({
      graph: initial,
      scriptId: "geometry-procedural",
      scriptTitle: "Geometry procedural script",
      scriptSource: "delete box1\nadd sphere as sphere1",
      objects: [sphere],
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
    const object = { ...createGeometryObject("box", "new"), name: "New Box" };
    const next = synchronizeGeometryObjectGraph(graph, [object]);

    expect(next.nodes.slice(0, 2).map((node) => node.id)).toEqual(["script:main", "object:new"]);
    expect(next.nodes.some((node) => node.id === "parameter:new:params.width")).toBe(true);
    expect(next.edges.some((edge) => edge.sourceId === "parameter:new:params.width" && edge.targetId === "object:new")).toBe(true);
    expect(next.nodes[1]?.label).toBe("New Box");
    expect(next.nodes[1]?.data).toEqual(object);
  });

  it("uses graph commands as the geometry object source of truth", () => {
    const box = createGeometryObject("box", "box");
    const created = applyGeometryObjectGraphCommand(createConstructionGraph(), { type: "create", object: box });
    const updated = applyGeometryObjectGraphCommand(created, {
      type: "update",
      objectId: "box",
      update: (object) => ({ ...object, name: "Graph Box", visible: false }),
    });

    expect(projectGeometryObjectsFromConstructionGraph(updated)).toEqual([
      { ...box, name: "Graph Box", visible: false },
    ]);
    expect(updated.nodes[0]).toMatchObject({
      id: "object:box",
      label: "Graph Box",
      visible: false,
    });

    const replaced = replaceGeometryObjectsInConstructionGraph(updated, [createGeometryObject("sphere", "sphere")]);
    expect(projectGeometryObjectsFromConstructionGraph(replaced).map((object) => object.id)).toEqual(["sphere"]);
  });

  it("undoes and redoes graph commands as complete snapshots", () => {
    const initial = applyGeometryObjectGraphCommand(createConstructionGraph(), {
      type: "create",
      object: createGeometryObject("box", "box"),
    });
    const next = applyGeometryObjectGraphCommand(initial, {
      type: "create",
      object: createGeometryObject("sphere", "sphere"),
    });
    const committed = commitConstructionGraphHistory(createConstructionGraphCommandHistory(), initial);
    const undone = undoConstructionGraphHistory(next, committed);
    const redone = redoConstructionGraphHistory(undone.graph, undone.history);

    expect(projectGeometryObjectsFromConstructionGraph(undone.graph).map((object) => object.id)).toEqual(["box"]);
    expect(projectGeometryObjectsFromConstructionGraph(redone.graph).map((object) => object.id)).toEqual(["sphere", "box"]);
  });
});
