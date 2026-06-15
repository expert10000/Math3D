import { describe, expect, it } from "vitest";
import { createConstructionGraph, indexConstructionGraph } from "@math3d/core";
import { applyGeometryObjectGraphCommand, projectGeometryObjectsFromConstructionGraph } from "./constructionGraphBuilder";
import {
  geometryParameterNodeId,
  isGeometryParameterNodeData,
  setGeometryParameterExpression,
} from "./constructionGraphParameters";
import { createGeometryObject } from "./proceduralObjects";

describe("construction graph parameters", () => {
  it("creates parameter nodes and dependencies for object parameters and transforms", () => {
    const graph = applyGeometryObjectGraphCommand(createConstructionGraph(), {
      type: "create",
      object: createGeometryObject("box", "box"),
    });
    const widthId = geometryParameterNodeId("box", "params.width");
    const positionId = geometryParameterNodeId("box", "transform.position.x");
    const index = indexConstructionGraph(graph);

    expect(index.nodeById.get(widthId)).toMatchObject({ kind: "parameter", label: "Box.width" });
    expect(index.nodeById.get(positionId)).toMatchObject({ kind: "parameter", label: "Box.transform.position.x" });
    expect(index.outgoingById.get(widthId)?.some((edge) => edge.targetId === "object:box")).toBe(true);
  });

  it("persists expressions and recomputes downstream parameters in dependency order", () => {
    const box = { ...createGeometryObject("box", "box"), name: "box" };
    const sphere = { ...createGeometryObject("sphere", "sphere"), name: "sphere" };
    let graph = applyGeometryObjectGraphCommand(createConstructionGraph(), { type: "replace", objects: [box, sphere] });
    graph = setGeometryParameterExpression(graph, geometryParameterNodeId("box", "params.height"), "box.width * 0.75");
    graph = setGeometryParameterExpression(graph, geometryParameterNodeId("sphere", "params.radius"), "box.height / 2");
    graph = applyGeometryObjectGraphCommand(graph, {
      type: "update",
      objectId: "box",
      update: (object) => ({ ...object, params: { ...object.params, width: 4 } }),
    });

    const objects = projectGeometryObjectsFromConstructionGraph(graph);
    expect(objects.find((object) => object.id === "box")?.params.height).toBe(3);
    expect(objects.find((object) => object.id === "sphere")?.params.radius).toBe(1.5);
    const radiusNode = graph.nodes.find((node) => node.id === geometryParameterNodeId("sphere", "params.radius"));
    expect(isGeometryParameterNodeData(radiusNode?.data) && radiusNode.data.expression).toBe("box.height / 2");
    expect(
      graph.edges.some(
        (edge) =>
          edge.sourceId === geometryParameterNodeId("box", "params.height") &&
          edge.targetId === geometryParameterNodeId("sphere", "params.radius")
      )
    ).toBe(true);
  });

  it("marks cyclic expressions invalid", () => {
    const box = { ...createGeometryObject("box", "box"), name: "box" };
    let graph = applyGeometryObjectGraphCommand(createConstructionGraph(), { type: "create", object: box });
    graph = setGeometryParameterExpression(graph, geometryParameterNodeId("box", "params.width"), "box.height");
    graph = setGeometryParameterExpression(graph, geometryParameterNodeId("box", "params.height"), "box.width");

    expect(graph.nodes.find((node) => node.id === geometryParameterNodeId("box", "params.width"))?.status).toBe("invalid");
    expect(graph.nodes.find((node) => node.id === geometryParameterNodeId("box", "params.height"))?.status).toBe("invalid");
  });
});
