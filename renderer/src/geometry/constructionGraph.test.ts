import { describe, expect, it } from "vitest";
import {
  buildConstructionGraphFromDerivedConstructions,
  createConstructionGraph,
  getAffectedConstructionGraphNodeIds,
  indexConstructionGraph,
  projectConstructionGraph,
  validateSceneDocument,
  withSceneDocumentConstructionGraph,
} from "@math3d/core";

describe("construction graph", () => {
  it("adapts derived constructions into one dependency model", () => {
    const graph = buildConstructionGraphFromDerivedConstructions([
      { id: "AB", type: "line", sourceObjectIds: ["A", "B"] },
      { id: "M", type: "midpoint", sourceObjectIds: ["A", "B"] },
      { id: "p", type: "parallel", sourceObjectIds: ["M"], sourceConstructionId: "AB" },
    ]);
    const index = indexConstructionGraph(graph);

    expect(index.errors).toEqual([]);
    expect(index.topologicalNodeIds.indexOf("AB")).toBeLessThan(index.topologicalNodeIds.indexOf("p"));
    expect(getAffectedConstructionGraphNodeIds(graph, ["A"])).toEqual(["AB", "M", "p"]);
  });

  it("builds view projections from the same graph", () => {
    const graph = createConstructionGraph(
      [
        { id: "A", kind: "geometry", type: "point" },
        { id: "line", kind: "construction", type: "line" },
        { id: "script", kind: "script", type: "scene-script" },
        { id: "claim", kind: "claim", type: "parallel" },
        { id: "analysis", kind: "analysis", type: "distance" },
      ],
      [
        { id: "e1", sourceId: "A", targetId: "line", relation: "depends-on" },
        { id: "e2", sourceId: "script", targetId: "line", relation: "defines" },
        { id: "e3", sourceId: "line", targetId: "claim", relation: "verifies" },
        { id: "e4", sourceId: "line", targetId: "analysis", relation: "analyzes" },
      ]
    );

    const claimsView = projectConstructionGraph(graph, {
      nodeKinds: ["claim"],
      includeDependencies: true,
    });
    const analysisView = projectConstructionGraph(graph, {
      nodeKinds: ["analysis"],
      includeDependencies: true,
    });

    expect(claimsView.nodes.map((node) => node.id)).toEqual(["A", "line", "script", "claim"]);
    expect(analysisView.nodes.map((node) => node.id)).toEqual(["A", "line", "script", "analysis"]);
  });

  it("persists and validates the graph through SceneDocument", () => {
    const graph = createConstructionGraph([{ id: "A", kind: "geometry", type: "point" }]);
    const scene = withSceneDocumentConstructionGraph(
      { id: "scene", title: "Shared model", createdAt: 1, updatedAt: 1 },
      graph
    );

    expect(validateSceneDocument(scene)).toEqual({ ok: true, value: scene });
  });

  it("reports broken graph references during scene validation", () => {
    const scene = withSceneDocumentConstructionGraph(
      { id: "scene", title: "Broken model", createdAt: 1, updatedAt: 1 },
      createConstructionGraph([], [{ id: "missing", sourceId: "A", targetId: "B", relation: "depends-on" }])
    );
    const result = validateSceneDocument(scene);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toContain("missing source 'A'");
    expect(result.errors.join(" ")).toContain("missing target 'B'");
  });
});
