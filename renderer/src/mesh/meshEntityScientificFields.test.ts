import { describe, expect, it } from "vitest";
import { computeMeshDifferentialGeometry } from "./meshDifferentialGeometry";
import { inspectMeshEntityScientificFields } from "./meshEntityScientificFields";
import type { MeshQualityReport } from "./meshQualityReport";
import type { SurfaceFeatureExtractionResult } from "./surfaceFeatureExtraction";
import type { SurfaceMeshData } from "./surfaceMesh";

const triangle: SurfaceMeshData = {
  label: "Scientific triangle",
  positions: Float32Array.from([0, 0, 0, 2, 0, 0, 0, 2, 0]),
  indices: Uint32Array.from([0, 1, 2]),
  normals: null,
  source: { kind: "proceduralObjects" },
};

const quality = {
  vertexCount: 3,
  faceCount: 1,
  fields: {
    face: {
      triangleArea: Float64Array.from([2]),
      aspectRatio: Float64Array.from([1.2]),
      edgeRatio: Float64Array.from([Math.SQRT2]),
      minimumAngleDeg: Float64Array.from([45]),
      maximumAngleDeg: Float64Array.from([90]),
      radiusRatio: Float64Array.from([1.1]),
      scaledJacobian: Float64Array.from([0.8]),
    },
  },
} as MeshQualityReport;

const features = {
  vertexMasks: {
    "high-curvature": Uint8Array.from([1, 1, 0]),
    elliptic: Uint8Array.from([1, 0, 0]),
    hyperbolic: Uint8Array.from([0, 0, 0]),
    parabolic: Uint8Array.from([0, 0, 0]),
    umbilic: Uint8Array.from([0, 0, 0]),
  },
  faceRegionMasks: {
    "high-curvature": Uint8Array.from([1]),
    elliptic: Uint8Array.from([0]),
    hyperbolic: Uint8Array.from([0]),
    parabolic: Uint8Array.from([0]),
    umbilic: Uint8Array.from([0]),
  },
  edgeSets: { feature: [[0, 1]] },
} as unknown as SurfaceFeatureExtractionResult;

describe("mesh entity scientific fields", () => {
  it("reports complete vertex scalar/vector values and direction validation", () => {
    const differential = computeMeshDifferentialGeometry(triangle)!;
    const result = inspectMeshEntityScientificFields({
      mesh: triangle,
      target: { kind: "vertex", vertexIndex: 0 },
      scalarFields: [{ name: "temperature", values: Float32Array.from([10, 20, 30]) }],
      vectorFields: [{ name: "velocity", values: Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]), itemSize: 3 }],
      differential,
      features,
    });

    expect(result.scalars).toContainEqual({ name: "temperature", value: 10, domain: "vertex" });
    expect(result.vectors).toContainEqual(expect.objectContaining({ name: "velocity", value: [1, 2, 3], domain: "vertex" }));
    expect(result.vectors[0].magnitude).toBeCloseTo(Math.sqrt(14));
    expect(result.featureMembership).toContain("elliptic");
    expect(result.principalDirectionsValidated).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/boundary/i);
  });

  it("maps vertex fields to an edge and reports edge quality and membership", () => {
    const result = inspectMeshEntityScientificFields({
      mesh: triangle,
      target: { kind: "edge", edge: [0, 1] },
      scalarFields: [{ name: "temperature", values: Float32Array.from([10, 20, 30]) }],
      vectorFields: [{ name: "velocity", values: Float32Array.from([1, 0, 0, 3, 0, 0, 0, 0, 0]), itemSize: 3 }],
      features,
    });

    expect(result.scalars).toContainEqual({ name: "temperature", value: 15, domain: "edge-mapped" });
    expect(result.vectors).toContainEqual({ name: "velocity", value: [2, 0, 0], magnitude: 2, domain: "edge-mapped" });
    expect(result.quality).toContainEqual({ name: "edgeLength", value: 2, domain: "edge" });
    expect(result.featureMembership).toContain("high-curvature");
  });

  it("maps vertex fields and native quality metrics to a face", () => {
    const result = inspectMeshEntityScientificFields({
      mesh: triangle,
      target: { kind: "face", faceIndex: 0 },
      scalarFields: [{ name: "temperature", values: Float32Array.from([10, 20, 30]) }],
      vectorFields: [{ name: "velocity", values: Float32Array.from([1, 0, 0, 2, 0, 0, 3, 0, 0]), itemSize: 3 }],
      quality,
      features,
    });

    expect(result.vertexIndices).toEqual([0, 1, 2]);
    expect(result.scalars).toContainEqual({ name: "temperature", value: 20, domain: "face-mapped" });
    expect(result.vectors).toContainEqual({ name: "velocity", value: [2, 0, 0], magnitude: 2, domain: "face-mapped" });
    expect(result.quality).toContainEqual({ name: "triangleArea", value: 2, domain: "face" });
    expect(result.featureMembership).toContain("high-curvature");
  });
});
