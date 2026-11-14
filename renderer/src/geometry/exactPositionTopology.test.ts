import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { computeMeshTopologyInspector } from "../mesh/topologyInspector";
import { interpretTopologyByExactPosition } from "./exactPositionTopology";

const renderBox = (): SurfaceMeshData => {
  const geometry = new THREE.BoxGeometry(2, 3, 4);
  const mesh: SurfaceMeshData = {
    label: "Box",
    positions: Float32Array.from(geometry.getAttribute("position").array),
    indices: Uint32Array.from(geometry.index!.array),
    source: { kind: "proceduralObjects" },
  };
  geometry.dispose();
  return mesh;
};

describe("exact-position topology interpretation", () => {
  it("keeps the six indexed box patches distinct until explicitly interpreted", () => {
    const mesh = renderBox();
    const raw = computeMeshTopologyInspector(mesh);
    expect(raw).toMatchObject({
      vertexCount: 24,
      edgeCount: 30,
      faceCount: 12,
      eulerCharacteristic: 6,
      connectedComponentCount: 6,
      boundaryEdgeCount: 24,
    });

    const interpreted = interpretTopologyByExactPosition(mesh);
    expect(interpreted).toMatchObject({
      method: "exact-position-identification",
      inputVertexCount: 24,
      identifiedVertexCount: 8,
      mergedVertexCount: 16,
      collapsedTriangleCount: 0,
      topology: {
        vertexCount: 8,
        edgeCount: 18,
        faceCount: 12,
        eulerCharacteristic: 2,
        connectedComponentCount: 1,
        boundaryEdgeCount: 0,
        nonManifoldEdgeCount: 0,
      },
    });
    expect(computeMeshTopologyInspector(mesh)).toEqual(raw);
  });

  it("does not claim coincident disconnected sheets are connected by default", () => {
    const mesh: SurfaceMeshData = {
      label: "Coincident triangles",
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint32Array.from([0, 1, 2, 3, 4, 5]),
      source: { kind: "detachedMesh" },
    };
    expect(computeMeshTopologyInspector(mesh)?.connectedComponentCount).toBe(2);
    expect(interpretTopologyByExactPosition(mesh)?.topology?.connectedComponentCount).toBe(1);
  });
});
