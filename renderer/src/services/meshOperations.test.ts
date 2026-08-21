import { describe, expect, it } from "vitest";
import {
  MESH_OPERATION_CAPABILITIES,
  computeMeshMetrics,
  resolveMeshOperationEngine,
  type MeshOperationRequest,
} from "./meshOperations";

describe("mesh operation model", () => {
  it("reports canonical mesh metrics from typed arrays", () => {
    const metrics = computeMeshMetrics({
      positions: new Float32Array(12),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      normals: new Float32Array(12),
    });

    expect(metrics.vertexCount).toBe(4);
    expect(metrics.faceCount).toBe(2);
    expect(metrics.memoryBytes).toBe(120);
  });

  it("resolves auto engine from registered capabilities", () => {
    const request: MeshOperationRequest = {
      operation: "implicit-mesh",
      inputs: ["implicit"],
      engine: "auto",
      parameters: {},
      outputMode: "new-object",
    };

    expect(resolveMeshOperationEngine(request)).toBe("cgal");
  });

  it("registers VTK and CGAL behind one capability list", () => {
    expect(MESH_OPERATION_CAPABILITIES.some((entry) => entry.operation === "smooth" && entry.engines.includes("vtk"))).toBe(true);
    expect(MESH_OPERATION_CAPABILITIES.some((entry) => entry.operation === "implicit-mesh" && entry.engines.includes("cgal"))).toBe(true);
  });
});
