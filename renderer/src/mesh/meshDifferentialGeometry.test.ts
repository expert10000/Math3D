import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MESH_CURVATURE_WARNING,
  compareVtkCurvatureReference,
  computeMeshDifferentialGeometry,
  readMeshDifferentialGeometryProbe,
} from "./meshDifferentialGeometry";
import { loadSurfaceMeshFromFile, type SurfaceMeshData } from "./surfaceMesh";

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

const makeIcosphere = (subdivisions: number, noise = 0): SurfaceMeshData => {
  const t = (1 + Math.sqrt(5)) / 2;
  let positions: Point[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z], index) => {
    const length = Math.hypot(x, y, z);
    const radialNoise = noise ? noise * Math.sin(index * 12.9898) : 0;
    return [(x / length) * (1 + radialNoise), (y / length) * (1 + radialNoise), (z / length) * (1 + radialNoise)] as Point;
  });
  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let level = 0; level < subdivisions; level += 1) {
    const midpoints = new Map<string, number>();
    const midpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const cached = midpoints.get(key);
      if (cached != null) return cached;
      const pa = positions[a];
      const pb = positions[b];
      const raw: Point = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
      const length = Math.hypot(...raw);
      const index = positions.length;
      const radialNoise = noise ? noise * Math.sin(index * 12.9898) : 0;
      positions.push([(raw[0] / length) * (1 + radialNoise), (raw[1] / length) * (1 + radialNoise), (raw[2] / length) * (1 + radialNoise)]);
      midpoints.set(key, index);
      return index;
    };
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return mesh(`Icosphere L${subdivisions}`, positions, faces);
};

const finiteValues = (values: Float32Array): number[] => Array.from(values).filter(Number.isFinite);
const meanAbsoluteError = (values: Float32Array, expected: number, mask?: Uint8Array): number => {
  let sum = 0;
  let count = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (mask && !mask[index]) continue;
    if (!Number.isFinite(values[index])) continue;
    sum += Math.abs(values[index] - expected);
    count += 1;
  }
  return count ? sum / count : Infinity;
};

describe("mesh differential geometry", () => {
  it("uses the pi boundary defect and marks flat plane directions as uncertain", () => {
    const plane = makeGrid("Plane", 8, 8, (u, v) => [u * 2 - 1, v * 2 - 1, 0]);
    const result = computeMeshDifferentialGeometry(plane)!;
    const center = 4 * 9 + 4;

    expect(result.K[center]).toBeCloseTo(0, 5);
    expect(result.H[center]).toBeCloseTo(0, 5);
    expect(result.warningMask[center] & MESH_CURVATURE_WARNING.NEARLY_FLAT).not.toBe(0);
    expect(result.directionValidMask[center]).toBe(0);
    expect(result.summary.boundaryVertexCount).toBe(32);
    expect(result.conventions.boundaryAngle).toBe("pi");
  });

  it("recovers positive unit-sphere curvature and flags its umbilic directions", () => {
    const result = computeMeshDifferentialGeometry(makeIcosphere(3))!;
    expect(meanAbsoluteError(result.K, 1, result.validMask)).toBeLessThan(0.08);
    expect(meanAbsoluteError(result.H, 1, result.validMask)).toBeLessThan(0.04);
    expect(result.summary.orientationFlipped).toBe(false);
    expect(result.summary.umbilicVertexCount).toBeGreaterThan(result.summary.vertexCount * 0.8);
    expect(result.summary.maxMeanIdentityResidual).toBeLessThan(1e-6);
    const probe = readMeshDifferentialGeometryProbe(result, 0)!;
    expect(probe.shapeIndex).toBeGreaterThan(0.7);
    expect(probe.d1).toBeNull();
    expect(probe.warnings.join(" ")).toMatch(/Umbilic/i);
  });

  it("normalizes reversed closed-mesh winding to the outward-convex sign convention", () => {
    const sphere = makeIcosphere(2);
    const reversed = Uint32Array.from(sphere.indices!);
    for (let index = 0; index < reversed.length; index += 3) {
      [reversed[index + 1], reversed[index + 2]] = [reversed[index + 2], reversed[index + 1]];
    }
    const result = computeMeshDifferentialGeometry({ ...sphere, indices: reversed })!;
    expect(result.summary.orientationFlipped).toBe(true);
    expect(meanAbsoluteError(result.H, 1, result.validMask)).toBeLessThan(0.08);
  });

  it("marks degenerate, non-manifold, and inconsistent-winding neighborhoods explicitly", () => {
    const result = computeMeshDifferentialGeometry(
      mesh(
        "Problem neighborhoods",
        [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1]],
        [[0, 1, 2], [0, 1, 3], [1, 0, 4], [2, 2, 3]]
      )
    )!;
    expect(result.warningMask[0] & MESH_CURVATURE_WARNING.NON_MANIFOLD).not.toBe(0);
    expect(result.warningMask[0] & MESH_CURVATURE_WARNING.INCONSISTENT_ORIENTATION).not.toBe(0);
    expect(result.warningMask[2] & MESH_CURVATURE_WARNING.DEGENERATE).not.toBe(0);
    expect(result.summary.degenerateFaceCount + result.summary.invalidFaceCount).toBeGreaterThan(0);
  });

  it("fits the cylinder circumferential principal direction", () => {
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
    const result = computeMeshDifferentialGeometry(cylinder)!;
    const index = 4 * segments + 7;
    expect(result.K[index]).toBeCloseTo(0, 2);
    expect(result.H[index]).toBeCloseTo(0.5, 1);
    expect(result.directionValidMask[index]).toBe(1);
    const base = index * 3;
    const theta = 2 * Math.PI * (7 / segments);
    const circumferential: Point = [-Math.sin(theta), Math.cos(theta), 0];
    const alignment = Math.abs(result.d1[base] * circumferential[0] + result.d1[base + 1] * circumferential[1]);
    expect(alignment).toBeGreaterThan(0.9);
  });

  it("matches outer and inner torus curvature signs", () => {
    const major = 2;
    const minor = 0.5;
    const uCount = 64;
    const vCount = 32;
    const torus = makeGrid(
      "Torus",
      uCount,
      vCount,
      (u, v) => {
        const theta = 2 * Math.PI * u;
        const phi = 2 * Math.PI * v;
        const radius = major + minor * Math.cos(phi);
        return [radius * Math.cos(theta), radius * Math.sin(theta), minor * Math.sin(phi)];
      },
      true,
      true
    );
    const result = computeMeshDifferentialGeometry(torus)!;
    const outer = 0;
    const inner = (vCount / 2) * uCount;
    expect(result.K[outer]).toBeCloseTo(0.8, 1);
    expect(result.H[outer]).toBeCloseTo(1.2, 1);
    expect(result.K[inner]).toBeCloseTo(-4 / 3, 1);
    expect(result.H[inner]).toBeCloseTo(2 / 3, 1);
    expect(result.directionValidMask[outer]).toBe(1);
    expect(result.directionValidMask[inner]).toBe(1);
  });

  it("improves Gaussian curvature under sphere refinement", () => {
    const coarse = computeMeshDifferentialGeometry(makeIcosphere(1))!;
    const fine = computeMeshDifferentialGeometry(makeIcosphere(3))!;
    expect(meanAbsoluteError(fine.K, 1, fine.validMask)).toBeLessThan(meanAbsoluteError(coarse.K, 1, coarse.validMask));
  });

  it("keeps noisy-sphere outputs finite while exposing uncertainty", () => {
    const result = computeMeshDifferentialGeometry(makeIcosphere(3, 0.01))!;
    expect(finiteValues(result.K).length).toBeGreaterThan(result.summary.vertexCount * 0.95);
    expect(finiteValues(result.H).length).toBeGreaterThan(result.summary.vertexCount * 0.95);
    expect(result.summary.identityWarningVertexCount + result.summary.insufficientNeighborhoodVertexCount).toBeGreaterThan(0);
  });

  it("compares VTK arrays only with an explicit mean-curvature sign convention", () => {
    const result = computeMeshDifferentialGeometry(makeIcosphere(2))!;
    const vtkMean = Float32Array.from(result.H, (value) => -value);
    const comparison = compareVtkCurvatureReference(
      result,
      { gaussian: result.K, mean: vtkMean },
      { meanCurvatureSign: "opposite" }
    );
    expect(comparison.sampleCount).toBe(result.summary.validVertexCount);
    expect(comparison.gaussianRmse).toBe(0);
    expect(comparison.meanRmse).toBe(0);
  });
});

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

describe("real-mesh differential geometry", () => {
  it.each([
    ["Fandisk", "07_fandisk.obj"],
    ["Stanford Bunny", "08_stanford_bunny.obj"],
    ["Armadillo", "11_armadillo.obj"],
  ])("produces finite fields and explicit masks for %s", async (_label, fileName) => {
    const absolutePath = path.join(repoRoot, "tests", "assets", "meshes", "standard", fileName);
    const bytes = await readFile(absolutePath);
    const loaded = await loadSurfaceMeshFromFile([new File([bytes], fileName)], { mergeVertices: true });
    const result = computeMeshDifferentialGeometry(loaded);

    expect(result).not.toBeNull();
    expect(result!.K.length).toBe(Math.floor(loaded.positions.length / 3));
    expect(finiteValues(result!.K).length).toBeGreaterThan(result!.summary.vertexCount * 0.5);
    expect(finiteValues(result!.H).length).toBeGreaterThan(result!.summary.vertexCount * 0.5);
    expect(result!.summary.validVertexCount).toBeGreaterThan(0);
    expect(result!.summary.directionValidVertexCount).toBeGreaterThan(0);
    expect(result!.warningMask.length).toBe(result!.summary.vertexCount);
  }, 60_000);
});
