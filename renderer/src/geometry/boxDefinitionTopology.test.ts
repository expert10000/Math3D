import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { boxDefinitionBoundaryTopology } from "./boxDefinitionTopology";
import { interpretTopologyByExactPosition } from "./exactPositionTopology";

describe("box definition boundary topology", () => {
  it.each([
    [1, 1, 1, 8, 18, 12],
    [2, 3, 4, 54, 156, 104],
  ])("derives the %i × %i × %i face-grid boundary independently of render indices", (nx, ny, nz, vertices, edges, faces) => {
    const definition = boxDefinitionBoundaryTopology({
      type: "box",
      params: { width: 2, height: 3, depth: 4, widthSegments: nx, heightSegments: ny, depthSegments: nz },
    });
    expect(definition).toMatchObject({
      method: "parametric-box-boundary",
      vertexCount: vertices,
      edgeCount: edges,
      faceCount: faces,
      eulerCharacteristic: 2,
      connectedComponentCount: 1,
      boundaryEdgeCount: 0,
    });

    const geometry = new THREE.BoxGeometry(2, 3, 4, nx, ny, nz);
    const displayMesh: SurfaceMeshData = {
      label: "Box",
      positions: Float32Array.from(geometry.getAttribute("position").array),
      indices: Uint32Array.from(geometry.index!.array),
      source: { kind: "proceduralObjects" },
    };
    expect(interpretTopologyByExactPosition(displayMesh)?.topology).toMatchObject({
      vertexCount: vertices,
      edgeCount: edges,
      faceCount: faces,
      eulerCharacteristic: 2,
    });
    geometry.dispose();
  });

  it("withholds the definition claim for another type or invalid dimensions", () => {
    expect(boxDefinitionBoundaryTopology({ type: "sphere", params: {} })).toBeNull();
    expect(boxDefinitionBoundaryTopology({ type: "box", params: { width: 0 } })).toBeNull();
    expect(boxDefinitionBoundaryTopology({ type: "box", params: { width: Number.NaN } })).toBeNull();
  });
});
