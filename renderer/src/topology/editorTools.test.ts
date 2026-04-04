import { describe, expect, it } from "vitest";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import {
  addEdgeToDiagram,
  addVertexToDiagram,
  moveVertexInDiagram,
  removeEdgeFromDiagram,
  removeVertexFromDiagram,
} from "./editorTools";

describe("topology editor tools", () => {
  it("adds vertex/edge and regenerates face boundary word", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("dunce_cap");
    expect(preset).toBeTruthy();
    const base = preset!.buildDiagram();

    const withVertex = addVertexToDiagram(base, 0.15, -0.2);
    expect(withVertex.vertices.length).toBe(base.vertices.length + 1);

    const newVertexId = withVertex.vertices[withVertex.vertices.length - 1]?.id ?? "";
    const firstVertexId = withVertex.vertices[0]?.id ?? "";
    const withEdge = addEdgeToDiagram(withVertex, firstVertexId, newVertexId, true);
    const newEdgeId = withEdge.edges[withEdge.edges.length - 1]?.id ?? "";

    expect(withEdge.edges.length).toBe(withVertex.edges.length + 1);
    expect(withEdge.faceBoundaryWords[withEdge.faces[0].id]).toContain(newEdgeId);
  });

  it("supports move/remove interactions while maintaining consistency", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("dunce_cap");
    expect(preset).toBeTruthy();
    const base = preset!.buildDiagram();
    const firstVertexId = base.vertices[0]?.id ?? "";

    const moved = moveVertexInDiagram(base, firstVertexId, 4.0, -4.0);
    const movedVertex = moved.vertices.find((entry) => entry.id === firstVertexId);
    expect(movedVertex?.x).toBeLessThanOrEqual(2.6);
    expect(movedVertex?.y).toBeGreaterThanOrEqual(-2.0);

    const edgeId = moved.edges[0]?.id ?? "";
    const removedEdge = removeEdgeFromDiagram(moved, edgeId);
    expect(removedEdge.edges.some((edge) => edge.id === edgeId)).toBe(false);
    expect((removedEdge.edgePairings[edgeId] ?? []).length).toBe(0);

    const removedVertex = removeVertexFromDiagram(moved, firstVertexId);
    expect(removedVertex.vertices.some((entry) => entry.id === firstVertexId)).toBe(false);
    expect(removedVertex.edges.every((edge) => edge.from !== firstVertexId && edge.to !== firstVertexId)).toBe(true);
  });
});
