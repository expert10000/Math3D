import { describe, expect, it } from "vitest";
import { createConstructionGraph, getAffectedConstructionGraphNodeIds } from "@math3d/core";
import { applyGeometryObjectGraphCommand } from "./constructionGraphBuilder";
import {
  getGeometryClaimSources,
  isGeometryAnalysisNodeData,
  isGeometryClaimNodeData,
  synchronizeGeometryClaimGraph,
} from "./constructionGraphAnalysisClaims";
import { geometryParameterNodeId, setGeometryParameterExpression } from "./constructionGraphParameters";
import { createGeometryObject } from "./proceduralObjects";

describe("construction graph analysis and claims", () => {
  it("derives analysis nodes from graph geometry and parameters", () => {
    const box = { ...createGeometryObject("box", "box"), name: "box", params: { ...createGeometryObject("box", "box").params, width: 4, height: 3, depth: 2 } };
    const graph = applyGeometryObjectGraphCommand(createConstructionGraph(), { type: "create", object: box });
    const volume = graph.nodes.find((node) => node.id === "analysis:box:volume");
    const width = graph.nodes.find((node) => node.id === "analysis:box:bounds.width");

    expect(isGeometryAnalysisNodeData(volume?.data) && volume.data.value).toBe(24);
    expect(isGeometryAnalysisNodeData(width?.data) && width.data.value).toBe(4);
    expect(graph.edges.some((edge) => edge.sourceId === "object:box" && edge.targetId === "analysis:box:volume" && edge.relation === "analyzes")).toBe(true);
  });

  it("evaluates verified, failed, and unresolved claims", () => {
    const box = { ...createGeometryObject("box", "box"), name: "box", params: { ...createGeometryObject("box", "box").params, width: 4, height: 3, depth: 2 } };
    let graph = applyGeometryObjectGraphCommand(createConstructionGraph(), { type: "create", object: box });
    graph = synchronizeGeometryClaimGraph(graph, [
      "claim box.height = box.width * 0.75",
      "claim box.volume > 30",
      "claim missing.volume > 1",
    ]);
    const results = graph.nodes
      .filter((node) => node.kind === "claim")
      .map((node) => isGeometryClaimNodeData(node.data) ? node.data.result : null);

    expect(results).toEqual(["verified", "failed", "unresolved"]);
    expect(getGeometryClaimSources(graph)).toHaveLength(3);
    expect(graph.edges.some((edge) => edge.sourceId === "analysis:box:volume" && edge.targetId === "claim:2" && edge.relation === "verifies")).toBe(true);
  });

  it("recomputes affected analyses and claims after a parameter expression changes", () => {
    const box = { ...createGeometryObject("box", "box"), name: "box", params: { ...createGeometryObject("box", "box").params, width: 4, height: 1, depth: 2 } };
    let graph = applyGeometryObjectGraphCommand(createConstructionGraph(), { type: "create", object: box });
    graph = synchronizeGeometryClaimGraph(graph, ["claim box.volume > 20"]);
    graph = setGeometryParameterExpression(graph, geometryParameterNodeId("box", "params.height"), "box.width * 0.75");

    const claim = graph.nodes.find((node) => node.id === "claim:1");
    expect(isGeometryClaimNodeData(claim?.data) && claim.data.result).toBe("verified");
    expect(getAffectedConstructionGraphNodeIds(graph, [geometryParameterNodeId("box", "params.width")])).toContain("analysis:box:volume");
    expect(getAffectedConstructionGraphNodeIds(graph, [geometryParameterNodeId("box", "params.width")])).toContain("claim:1");
  });

  it("preserves unaffected analysis nodes during parameter recomputation", () => {
    const box = { ...createGeometryObject("box", "box"), name: "box" };
    const sphere = { ...createGeometryObject("sphere", "sphere"), name: "sphere" };
    let graph = applyGeometryObjectGraphCommand(createConstructionGraph(), { type: "replace", objects: [box, sphere] });
    const sphereVolume = graph.nodes.find((node) => node.id === "analysis:sphere:volume");
    graph = applyGeometryObjectGraphCommand(graph, {
      type: "update",
      objectId: "box",
      update: (object) => ({ ...object, params: { ...object.params, width: 5 } }),
    });

    expect(graph.nodes.find((node) => node.id === "analysis:sphere:volume")).toBe(sphereVolume);
  });
});
