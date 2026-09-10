import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createMeshAnalysisMeshIdentity,
  createMeshAnalysisResultStore,
  getMeshAnalysisResult,
  meshAnalysisResultKey,
  upsertMeshAnalysisResult,
} from "./analysisResultStore";
import { computeMeshDifferentialGeometry } from "./meshDifferentialGeometry";
import { loadSurfaceMeshFromFile, type SurfaceMeshData } from "./surfaceMesh";
import {
  DEFAULT_SURFACE_FEATURE_PARAMETERS,
  extractSurfaceFeatures,
  SURFACE_FEATURE_CLASSES,
  type SurfaceFeatureExtractionResult,
} from "./surfaceFeatureExtraction";

type Point = readonly [number, number, number];

const mesh = (label: string, positions: Point[], faces: readonly (readonly [number, number, number])[]): SurfaceMeshData => ({
  label,
  positions: Float32Array.from(positions.flat()),
  indices: Uint32Array.from(faces.flat()),
  normals: null,
  source: { kind: "proceduralObjects" },
});

const makeGrid = (
  label: string,
  uCount: number,
  vCount: number,
  point: (u: number, v: number) => Point,
  wrapU = false,
  wrapV = false
): SurfaceMeshData => {
  const positions: Point[] = [];
  const uVertices = wrapU ? uCount : uCount + 1;
  const vVertices = wrapV ? vCount : vCount + 1;
  for (let v = 0; v < vVertices; v += 1) {
    for (let u = 0; u < uVertices; u += 1) positions.push(point(u / uCount, v / vCount));
  }
  const index = (u: number, v: number) => ((v + vVertices) % vVertices) * uVertices + ((u + uVertices) % uVertices);
  const faces: [number, number, number][] = [];
  for (let v = 0; v < vCount; v += 1) {
    for (let u = 0; u < uCount; u += 1) {
      const a = index(u, v);
      const b = index(u + 1, v);
      const c = index(u, v + 1);
      const d = index(u + 1, v + 1);
      faces.push([a, b, d], [a, d, c]);
    }
  }
  return mesh(label, positions, faces);
};

const cube = (): SurfaceMeshData => mesh(
  "Cube",
  [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ],
  [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
  ]
);

const compute = (surface: SurfaceMeshData, parameters = {}) => {
  const differential = computeMeshDifferentialGeometry(surface);
  expect(differential).not.toBeNull();
  return extractSurfaceFeatures(surface, differential!, parameters);
};

describe("cached surface-feature extraction", () => {
  it("extracts the twelve geometric crease edges of a triangulated cube", () => {
    const result = compute(cube(), { sharpEdgeAngleDeg: 35 });
    expect(result.edgeSets.sharp).toHaveLength(12);
    expect(result.edgeSets.boundary).toHaveLength(0);
    expect(result.edgeSets.feature).toHaveLength(12);
    expect(result.polylines.sharp).toHaveLength(12);
  });

  it("classifies the interior of a cylinder as parabolic/developable", () => {
    const segments = 48;
    const rings = 8;
    const cylinder = makeGrid(
      "Cylinder",
      segments,
      rings,
      (u, v) => [Math.cos(2 * Math.PI * u), Math.sin(2 * Math.PI * u), 2 * v - 1],
      true,
      false
    );
    const result = compute(cylinder, { gaussianZeroTolerance: 0.08 });
    let interiorParabolic = 0;
    for (let ring = 1; ring < rings; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        interiorParabolic += result.vertexMasks.parabolic[ring * segments + segment];
      }
    }
    expect(interiorParabolic).toBeGreaterThan(segments * (rings - 1) * 0.9);
    expect(result.edgeSets.boundary).toHaveLength(segments * 2);
    expect(result.summary.parabolicSegmentCount).toBe(0);
  });

  it("finds elliptic, hyperbolic, and parabolic candidates on a torus", () => {
    const major = 2;
    const minor = 0.5;
    const torus = makeGrid(
      "Torus",
      64,
      32,
      (u, v) => {
        const theta = 2 * Math.PI * u;
        const phi = 2 * Math.PI * v;
        const radius = major + minor * Math.cos(phi);
        return [radius * Math.cos(theta), radius * Math.sin(theta), minor * Math.sin(phi)];
      },
      true,
      true
    );
    const result = compute(torus, { gaussianZeroTolerance: 0.08 });
    expect(result.vertexSets.elliptic.length).toBeGreaterThan(0);
    expect(result.vertexSets.hyperbolic.length).toBeGreaterThan(0);
    expect(result.vertexSets.parabolic.length).toBeGreaterThan(0);
    expect(result.polylines.parabolic.length).toBeGreaterThan(0);
    expect(result.faceRegionMasks.elliptic.length).toBe(result.summary.faceCount);
  });

  it("stores all reusable domains, strengths, and explicit uncertainty", () => {
    const surface = cube();
    const result = compute(surface, { curvatureThreshold: 0.5, uncertaintyRelativeBand: 0.25 });
    for (const featureClass of SURFACE_FEATURE_CLASSES) {
      expect(result.vertexMasks[featureClass]).toHaveLength(8);
      expect(result.vertexSets[featureClass].length).toBe(result.summary.classCounts[featureClass]);
      expect(result.faceRegionMasks[featureClass]).toHaveLength(12);
    }
    expect(result.scalars.curvatureStrength).toHaveLength(8);
    expect(result.scalars.gaussianMagnitude).toHaveLength(8);
    expect(result.scalars.umbilicStrength).toHaveLength(8);
    expect(result.scalars.confidence).toHaveLength(8);
    expect(result.uncertaintyMask).toHaveLength(8);
  });

  it("becomes stale when its cached curvature dependency is replaced", () => {
    const surface = cube();
    const identity = createMeshAnalysisMeshIdentity(surface);
    const differential = computeMeshDifferentialGeometry(surface)!;
    let store = createMeshAnalysisResultStore();
    store = upsertMeshAnalysisResult(store, {
      kind: "normals",
      variant: "area-weighted-v1",
      mesh: identity,
      parameters: { method: "area-weighted-input-winding" },
      payload: { values: differential.normals, validMask: differential.validMask },
    });
    store = upsertMeshAnalysisResult(store, {
      kind: "curvature",
      variant: "discrete-differential-geometry-v2",
      mesh: identity,
      parameters: { version: 2 },
      payload: differential,
    });
    const normals = getMeshAnalysisResult(store, identity, "normals", "area-weighted-v1")!;
    const curvature = getMeshAnalysisResult(store, identity, "curvature", "discrete-differential-geometry-v2")!;
    store = upsertMeshAnalysisResult(store, {
      kind: "principal-directions",
      variant: "shape-operator-v2",
      mesh: identity,
      parameters: { ordering: "k1>=k2" },
      dependencies: [
        {
          kind: "normals",
          variant: "area-weighted-v1",
          state: "ready",
          key: meshAnalysisResultKey(identity, "normals", "area-weighted-v1"),
          resultVersion: normals.resultVersion,
        },
        {
          kind: "curvature",
          variant: "discrete-differential-geometry-v2",
          state: "ready",
          key: meshAnalysisResultKey(identity, "curvature", "discrete-differential-geometry-v2"),
          resultVersion: curvature.resultVersion,
        },
      ],
      payload: { d1: differential.d1, d2: differential.d2, validMask: differential.directionValidMask },
    });
    const directions = getMeshAnalysisResult(store, identity, "principal-directions", "shape-operator-v2")!;
    const features = extractSurfaceFeatures(surface, differential);
    store = upsertMeshAnalysisResult(store, {
      kind: "surface-features",
      variant: "classification-v1",
      mesh: identity,
      parameters: DEFAULT_SURFACE_FEATURE_PARAMETERS,
      dependencies: [
        {
          kind: "normals",
          variant: "area-weighted-v1",
          state: "ready",
          key: meshAnalysisResultKey(identity, "normals", "area-weighted-v1"),
          resultVersion: normals.resultVersion,
        },
        {
          kind: "curvature",
          variant: "discrete-differential-geometry-v2",
          state: "ready",
          key: meshAnalysisResultKey(identity, "curvature", "discrete-differential-geometry-v2"),
          resultVersion: curvature.resultVersion,
        },
        {
          kind: "principal-directions",
          variant: "shape-operator-v2",
          state: "ready",
          key: meshAnalysisResultKey(identity, "principal-directions", "shape-operator-v2"),
          resultVersion: directions.resultVersion,
        },
      ],
      payload: features,
    });
    expect(getMeshAnalysisResult(store, identity, "surface-features", "classification-v1")?.state).toBe("ready");

    store = upsertMeshAnalysisResult(store, {
      kind: "curvature",
      variant: "discrete-differential-geometry-v2",
      mesh: identity,
      parameters: { version: 2, rerun: true },
      payload: differential,
    });
    expect(getMeshAnalysisResult(store, identity, "surface-features", "classification-v1")?.state).toBe("stale");
  });
});

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

describe("real-mesh surface-feature extraction", () => {
  it.each([
    ["Fandisk", "07_fandisk.obj"],
    ["Stanford Bunny", "08_stanford_bunny.obj"],
  ])("produces reusable classifications for %s", async (_label, fileName) => {
    const absolutePath = path.join(repoRoot, "tests", "assets", "meshes", "standard", fileName);
    const bytes = await readFile(absolutePath);
    const loaded = await loadSurfaceMeshFromFile([new File([bytes], fileName)], { mergeVertices: true });
    const result: SurfaceFeatureExtractionResult = compute(loaded, {
      curvatureThreshold: 1,
      gaussianZeroTolerance: 0.05,
    });
    expect(result.summary.validVertexCount).toBeGreaterThan(0);
    expect(result.summary.classCounts.elliptic + result.summary.classCounts.hyperbolic + result.summary.classCounts.parabolic)
      .toBe(result.summary.validVertexCount);
    expect(result.summary.featureEdgeCount).toBeGreaterThan(0);
    expect(result.scalars.curvatureStrength.every((value) => Number.isFinite(value))).toBe(true);
    expect(result.uncertaintyMask.length).toBe(result.summary.vertexCount);
  }, 60_000);
});
