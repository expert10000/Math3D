import { describe, expect, it } from "vitest";
import type { MeshQualityReport } from "./meshQualityReport";
import { MESH_FIELD_CALCULUS_CONVENTIONS, MESH_FIELD_CALCULUS_VERSION } from "./meshSurfaceFieldCalculus";
import {
  MESH_QUALITY_METRIC_OPTIONS,
  selectMeshActiveAnalysisResult,
  summarizeMeshScalarField,
  type MeshActiveAnalysisResultInput,
  type MeshQualityMetricKey,
} from "./activeAnalysisResult";

const qualityReport: MeshQualityReport = {
  generatedAt: "2026-09-08T12:00:00.000Z",
  vertexCount: 4,
  faceCount: 2,
  metrics: {
    edgeLength: { min: 1, avg: 2, max: 3 },
    triangleArea: { min: 4, avg: 5, max: 6 },
    aspectRatio: { min: 7, avg: 8, max: 9 },
    edgeRatio: { min: 1, avg: 1.5, max: 2 },
    minimumAngleDeg: { min: 20, avg: 40, max: 60 },
    maximumAngleDeg: { min: 60, avg: 90, max: 120 },
    radiusRatio: { min: 1, avg: 2, max: 3 },
    scaledJacobian: { min: 0.2, avg: 0.6, max: 1 },
    vertexValence: { min: 10, avg: 11, max: 12 },
    dihedralAngleDeg: { min: 13, avg: 14, max: 15 },
  },
  fields: {
    face: {
      triangleArea: Float64Array.from([4, 6]),
      aspectRatio: Float64Array.from([7, 9]),
      edgeRatio: Float64Array.from([1, 2]),
      minimumAngleDeg: Float64Array.from([20, 60]),
      maximumAngleDeg: Float64Array.from([60, 120]),
      radiusRatio: Float64Array.from([1, 3]),
      scaledJacobian: Float64Array.from([0.2, 1]),
    },
    faceValidMask: Uint8Array.from([1, 1]),
    faceCentroids: Float32Array.from([0, 0, 0, 1, 1, 1]),
    vertexValence: Float64Array.from([10, 11, 11, 12]),
    edgeLength: Float64Array.from([1, 1.5, 2, 2.5, 3]),
    dihedralAngleDeg: Float64Array.from([13, 13.5, 14, 14.5, 15]),
  },
  conventions: {
    backend: "Math3D VTK/Verdict-compatible",
    domain: "triangle faces",
    invalidValue: "NaN",
    idealEquilateral: "aspect ratio = edge ratio = radius ratio = scaled Jacobian = 1; angles = 60 deg",
  },
  topology: { boundaryEdgeCount: 0, nonManifoldEdgeCount: 0, degenerateFaceCount: 1 },
  defects: {
    degenerateFaces: [],
    highAspectFaces: [
      { faceIndex: 1, centroid: { x: 0, y: 0, z: 0 }, area: 1, aspectRatio: 9 },
    ],
    nonManifoldEdges: [],
  },
};

const baseInput = (overrides: Partial<MeshActiveAnalysisResultInput> = {}): MeshActiveAnalysisResultInput => ({
  section: "differential-geometry",
  deferred: false,
  qualityMetric: "aspectRatio",
  qualityReport: null,
  qualityBusy: false,
  qualityThreshold: 8,
  qualityCacheHit: false,
  qualityUpdatedAt: null,
  qualityEdgeCount: 5,
  geodesicBusy: false,
  geodesicLength: null,
  geodesicUseContinuous: false,
  geodesicMethod: "graph",
  geodesicSourceMode: "selected-vertex",
  geodesicHasStart: false,
  geodesicHasEnd: false,
  diagnostics: null,
  diagnosticsMode: "none",
  diagnosticsUpdatedAt: null,
  vectorMagnitudeRange: null,
  showGaussMap: false,
  calculusActiveVectorField: "",
  calculusScalarSource: "none",
  calculusVectorSource: "",
  calculusLastResult: null,
  calculusCacheHit: false,
  calculusUpdatedAt: null,
  showRidges: false,
  showValleys: false,
  showCurvatureLines: false,
  surfaceFeatures: null,
  surfaceFeatureClass: "elliptic",
  surfaceFeatureCacheHit: false,
  surfaceFeatureUpdatedAt: null,
  curvatureLineField: "d1",
  curvatureSeedSource: "global",
  curvatureMaxSteps: 120,
  curvatureField: null,
  curvatureFieldLabel: null,
  curvatureStats: null,
  curvatureRangeSource: "whole mesh",
  curvatureClampRange: null,
  curvaturePalette: "blue-red",
  curvaturePaletteInverted: false,
  curvatureCacheReady: false,
  curvatureUpdatedAt: null,
  curvatureComputationMs: null,
  sphereSanity: null,
  meshStats: { vertCount: 4, triCount: 2 },
  meshLabel: "Fixture",
  formatTimestamp: (value) => (value == null ? "Current session" : `timestamp:${value}`),
  ...overrides,
});

describe("selectMeshActiveAnalysisResult", () => {
  it("selects each mesh quality metric with its own values and metadata", () => {
    const expected: Record<MeshQualityMetricKey, { label: string; min: string; samples: string }> = {
      aspectRatio: { label: "Aspect ratio", min: "7.0000", samples: "2" },
      triangleArea: { label: "Triangle area", min: "4.0000", samples: "2" },
      edgeRatio: { label: "Edge ratio", min: "1.0000", samples: "2" },
      minimumAngleDeg: { label: "Minimum angle", min: "20.0000", samples: "2" },
      maximumAngleDeg: { label: "Maximum angle", min: "60.0000", samples: "2" },
      radiusRatio: { label: "Radius ratio", min: "1.0000", samples: "2" },
      scaledJacobian: { label: "Scaled Jacobian", min: "0.2000", samples: "2" },
      edgeLength: { label: "Edge length", min: "1.0000", samples: "5" },
      vertexValence: { label: "Vertex valence", min: "10.0000", samples: "4" },
      dihedralAngleDeg: { label: "Dihedral angle", min: "13.0000", samples: "5" },
    };

    for (const option of MESH_QUALITY_METRIC_OPTIONS) {
      const result = selectMeshActiveAnalysisResult(baseInput({
        section: "mesh-quality",
        qualityMetric: option.id,
        qualityReport,
        qualityCacheHit: true,
        qualityUpdatedAt: 42,
      }));
      expect(result.category).toBe("Mesh Quality");
      expect(result.result).toBe(expected[option.id].label);
      expect(result.state).toBe("Ready");
      expect(result.statistics).toContainEqual({ label: "Minimum", value: expected[option.id].min });
      expect(result.statistics).toContainEqual({ label: "Samples", value: expected[option.id].samples });
      expect(result.histogram).toHaveLength(12);
      expect(result.extrema).toHaveLength(2);
      expect(result.metadata).toContainEqual({ label: "Cache", value: "Cached result" });
      expect(result.metadata).toContainEqual({ label: "Computed", value: "timestamp:42" });
    }
  });

  it("returns curvature statistics and computation context", () => {
    const curvatureStats = summarizeMeshScalarField(Float32Array.from([-1, 0, 1, 2]), null, 4);
    const result = selectMeshActiveAnalysisResult(baseInput({
      curvatureField: "K",
      curvatureFieldLabel: "Gaussian curvature K",
      curvatureStats,
      curvatureClampRange: { min: -0.5, max: 1.5 },
      curvatureCacheReady: true,
      curvatureUpdatedAt: 99,
      curvatureComputationMs: 1.25,
    }));

    expect(result).toMatchObject({
      category: "Differential Geometry",
      result: "Gaussian curvature K",
      state: "Ready",
      method: "Angle defect",
      domain: "4 vertices",
    });
    expect(result.statistics).toContainEqual({ label: "Median", value: "0.5000" });
    expect(result.statistics).toContainEqual({ label: "σ (sigma)", value: "1.1180" });
    expect(result.extrema).toEqual([
      { label: "Minimum", value: "Vertex 0" },
      { label: "Maximum", value: "Vertex 3" },
    ]);
    expect(result.histogram).toHaveLength(4);
    expect(result.metadata).toContainEqual({ label: "Display range", value: "-0.5000 to 1.5000 (clamped)" });
    expect(result.metadata).toContainEqual({ label: "Backend", value: "Renderer CPU" });
    expect(result.metadata).toContainEqual({ label: "Time", value: "1.25 ms" });
    expect(result.metadata).toContainEqual({ label: "Cached", value: "Yes" });
    expect(result.metadata).toContainEqual({ label: "Computed", value: "timestamp:99" });
  });

  it("reports canonical field-calculus conventions and cache state", () => {
    const result = selectMeshActiveAnalysisResult(baseInput({
      section: "vector-calculus",
      calculusLastResult: {
        version: MESH_FIELD_CALCULUS_VERSION,
        operator: "laplacian",
        source: "x",
        domain: "vertex",
        itemSize: 1,
        values: Float64Array.from([-2, 0, 2, 0]),
        validMask: Uint8Array.from([1, 1, 1, 0]),
        validCount: 3,
        conventions: MESH_FIELD_CALCULUS_CONVENTIONS,
      },
      calculusCacheHit: true,
      calculusUpdatedAt: 7,
    }));
    expect(result).toMatchObject({
      category: "Vector Calculus",
      result: "laplacian(x)",
      state: "Ready",
      method: "Cotangent Laplace-Beltrami",
      domain: "3 / 4 vertices",
    });
    expect(result.metadata).toContainEqual({ label: "Cache", value: "Cached result" });
    expect(result.metadata).toContainEqual({ label: "Computed", value: "timestamp:7" });
  });

  it("keeps graph, CGAL surface, and heat geodesic semantics distinct", () => {
    const graph = selectMeshActiveAnalysisResult(baseInput({
      section: "geodesics",
      geodesicMethod: "graph",
      geodesicSourceMode: "selection-set",
      geodesicLength: 2,
      geodesicHasStart: true,
      geodesicHasEnd: true,
    }));
    expect(graph.metadata).toContainEqual({ label: "Method", value: "Approximate edge-graph routing" });
    expect(graph.metadata).toContainEqual({ label: "Source semantics", value: "selection set" });

    const surface = selectMeshActiveAnalysisResult(baseInput({
      section: "geodesics",
      geodesicMethod: "surface",
      geodesicSourceMode: "selected-point",
      geodesicLength: Math.PI,
      geodesicHasStart: true,
      geodesicHasEnd: true,
    }));
    expect(surface.metadata).toContainEqual({
      label: "Method",
      value: "CGAL triangulated-surface shortest path",
    });
    expect(surface.metadata).toContainEqual({ label: "Source semantics", value: "selected point" });

    const heat = selectMeshActiveAnalysisResult(baseInput({
      section: "geodesics",
      geodesicMethod: "heat",
      geodesicUseContinuous: false,
    }));
    expect(heat.metadata).toContainEqual({ label: "Method", value: "Heat distance (experimental)" });
  });

  it("summarizes a selected scalar domain with stable extrema indices and histogram counts", () => {
    const result = summarizeMeshScalarField(
      Float32Array.from([8, Number.NaN, 2, 6, 4]),
      Uint8Array.from([0, 1, 1, 1, 1]),
      2
    );

    expect(result).toMatchObject({
      min: 2,
      max: 6,
      mean: 4,
      median: 4,
      count: 3,
      minIndex: 2,
      maxIndex: 3,
    });
    expect(result?.histogram.map((bin) => bin.count)).toEqual([1, 2]);
  });

  it("falls back to a ready mesh overview when no result is selected", () => {
    expect(selectMeshActiveAnalysisResult(baseInput())).toEqual({
      category: null,
      result: "Overview",
      state: "Ready",
      statistics: [
        { label: "Vertices", value: "4" },
        { label: "Faces", value: "2" },
      ],
      metadata: [{ label: "Mesh", value: "Fixture" }],
    });
  });
});
