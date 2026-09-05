import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { createUnifiedSelectionManagerState, selectionResultFromMeshTopology } from "./unifiedSelection";
import { buildSelectionHighlightOverlays, buildSelectionManagerHighlightOverlays } from "./selectionHighlighting";

const stripMesh: SurfaceMeshData = {
  label: "Strip",
  positions: Float32Array.from([
    0, 0, 0,
    1, 0, 0,
    2, 0, 0,
    0, 1, 0,
    1, 1, 0,
    2, 1, 0,
  ]),
  indices: Uint32Array.from([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4]),
  normals: null,
  uvs: null,
  source: { kind: "proceduralObjects" },
  adjacency: null,
  meanEdgeLength: null,
  validation: null,
};

describe("selectionHighlighting", () => {
  it("tints neighboring faces for face selections", () => {
    const selection = selectionResultFromMeshTopology({
      mode: "face",
      objectLabel: "Strip",
      mesh: stripMesh,
      faceIndex: 0,
      valid: true,
    });

    const overlays = buildSelectionHighlightOverlays(selection, stripMesh);

    expect(overlays.meshGroups.length).toBeGreaterThanOrEqual(2);
    expect(overlays.meshGroups[0].indices?.length).toBeGreaterThan(0);
    expect(overlays.polylineGroups.length).toBe(1);
  });

  it("keeps edge selections distinct from face selections", () => {
    const selection = selectionResultFromMeshTopology({
      mode: "edge",
      objectLabel: "Strip",
      mesh: stripMesh,
      edgeVertices: [1, 4],
      valid: true,
    });

    const overlays = buildSelectionHighlightOverlays(selection, stripMesh);

    expect(overlays.meshGroups).toHaveLength(0);
    expect(overlays.polylineGroups.length).toBe(1);
    expect(overlays.pointSets).toHaveLength(1);
    expect(overlays.pointSets[0].points).toHaveLength(2);
  });

  it("shows connected edges and adjacent faces for vertex selections", () => {
    const selection = selectionResultFromMeshTopology({
      mode: "vertex",
      objectLabel: "Strip",
      mesh: stripMesh,
      vertexIndex: 1,
      valid: true,
    });

    const overlays = buildSelectionHighlightOverlays(selection, stripMesh);

    expect(overlays.meshGroups.length).toBe(1);
    expect(overlays.polylineGroups.length).toBe(1);
    expect(overlays.pointSets.length).toBe(2);
  });

  it("builds overlays for every selected result in a manager snapshot", () => {
    const first = selectionResultFromMeshTopology({
      mode: "edge",
      objectLabel: "Strip",
      mesh: stripMesh,
      edgeVertices: [0, 1],
      valid: true,
    });
    const second = selectionResultFromMeshTopology({
      mode: "edge",
      objectLabel: "Strip",
      mesh: stripMesh,
      edgeVertices: [1, 4],
      valid: true,
    });
    const manager = createUnifiedSelectionManagerState([first, second]);

    const overlays = buildSelectionManagerHighlightOverlays(manager, () => stripMesh);

    expect(overlays.polylineGroups.length).toBeGreaterThanOrEqual(2);
  });
});
