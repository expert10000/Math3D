import { describe, expect, it } from "vitest";
import { MATH3D_PLATFORM_DISCOVERY, validateDiscoveryJsonValue,
  type ScientificOperationDescriptor } from "@math3d/core";
import { computeVertexNormals, meshVertexNormalsOperation } from "./meshOps";

describe("registered Mesh vertex normals", () => {
  it("runs the existing Mesh implementation through the registered contract", () => {
    const descriptor = MATH3D_PLATFORM_DISCOVERY.get("scientific-operations",
      "mesh.normals.compute") as ScientificOperationDescriptor;
    const mesh = { label: "triangle", positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]), source: { kind: "detachedMesh" as const } };
    expect(descriptor.schemaCompleteness).toBe("complete");
    expect(meshVertexNormalsOperation.definition.capabilityIds).toEqual(["mesh.normals"]);
    expect(validateDiscoveryJsonValue(descriptor.inputSchema,
      { mesh: { positions: [...mesh.positions], indices: [...mesh.indices] } })).toBe(true);
    const result = computeVertexNormals(mesh);
    expect([...result.normals!]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(validateDiscoveryJsonValue(descriptor.outputSchema, {
      positions: [...result.positions], indices: [...result.indices!], normals: [...result.normals!],
    })).toBe(true);
  });
});
