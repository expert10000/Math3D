import { describe, expect, it } from "vitest";
import {
  MESH_OPERATION_CAPABILITIES,
  computeMeshMetrics,
  resolveMeshOperationEngine,
  runMeshOperation,
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

  it("keeps the established Electron and proxy VTK bridge protocol behind the execution facade", async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const calls: any[] = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        vtkMesh: {
          cleanNormals: async (request: any) => {
            calls.push(request);
            return {
              ok: true,
              positions: request.positions.buffer,
              indices: request.indices.buffer,
              normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]).buffer,
              vertexCount: 3,
              triCount: 1,
            };
          },
        },
      },
    });
    try {
      const result = await runMeshOperation({
        operation: "clean-normals", inputs: ["fixture"], engine: "vtk", parameters: { computeNormals: true }, outputMode: "replace",
      }, {
        primaryMesh: {
          label: "Triangle", positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]),
        },
      });
      expect(result.status).toBe("success");
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ options: { computeNormals: true } });
      expect(calls[0].jobId).toEqual(expect.any(String));
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
      else delete (globalThis as { window?: unknown }).window;
    }
  });

  it("rejects unsafe open boolean operands before calling native VTK", async () => {
    const request: MeshOperationRequest = {
      operation: "boolean-union",
      inputs: ["open-a", "closed-b"],
      engine: "vtk",
      parameters: {},
      outputMode: "new-object",
    };

    const result = await runMeshOperation(request, {
      primaryMesh: {
        label: "Open operand",
        positions: new Float32Array([
          0, 0, 0,
          1, 0, 0,
          1, 1, 0,
          0, 1, 0,
        ]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      },
      secondaryMesh: {
        label: "Closed tetra",
        positions: new Float32Array([
          0, 0, 0,
          1, 0, 0,
          0, 1, 0,
          0, 0, 1,
        ]),
        indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]),
      },
    });

    expect(result.status).toBe("error");
    expect(result.errors[0]?.code).toBe("unsafe-boolean-input");
    expect(result.errors[0]?.message).toContain("not a closed watertight manifold mesh");
  });
});
