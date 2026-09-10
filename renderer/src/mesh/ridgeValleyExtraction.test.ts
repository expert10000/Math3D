import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeMeshDifferentialGeometry } from "./meshDifferentialGeometry";
import {
  DEFAULT_RIDGE_VALLEY_PARAMETERS,
  extractRidgesAndValleys,
  type RidgeValleyExtractionParameters,
} from "./ridgeValleyExtraction";
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

const makeIcosphere = (subdivisions: number): SurfaceMeshData => {
  const t = (1 + Math.sqrt(5)) / 2;
  let positions: Point[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => {
    const length = Math.hypot(x, y, z);
    return [x / length, y / length, z / length] as Point;
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
      const result = positions.length;
      positions.push([raw[0] / length, raw[1] / length, raw[2] / length]);
      midpoints.set(key, result);
      return result;
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

const parameters = (overrides: Partial<RidgeValleyExtractionParameters> = {}): RidgeValleyExtractionParameters => ({
  ...DEFAULT_RIDGE_VALLEY_PARAMETERS,
  minAbsCurvature: 0,
  minDirectionalContrast: 0.001,
  minDirectionCos: 0.15,
  maxCurves: 1000,
  decimateSpacing: 0,
  ...overrides,
});

const assertCandidatesAreValidated = (
  result: ReturnType<typeof extractRidgesAndValleys>,
  directionValidMask: Uint8Array
) => {
  for (let vertex = 0; vertex < result.summary.vertexCount; vertex += 1) {
    if (!result.candidateMasks.ridge[vertex] && !result.candidateMasks.valley[vertex]) continue;
    expect(directionValidMask[vertex]).toBe(1);
    expect(result.uncertaintyMask[vertex]).toBe(0);
  }
};

describe("principal-curvature ridge and valley extraction", () => {
  it("extracts the two quantitative k2 extremum bands of a torus", () => {
    const uCount = 64;
    const vCount = 32;
    const torus = makeGrid("Torus", uCount, vCount, (u, v) => {
      const theta = 2 * Math.PI * u;
      const phi = 2 * Math.PI * v;
      const radius = 2 + 0.5 * Math.cos(phi);
      return [radius * Math.cos(theta), radius * Math.sin(theta), 0.5 * Math.sin(phi)];
    }, true, true);
    const differential = computeMeshDifferentialGeometry(torus)!;
    const result = extractRidgesAndValleys(torus, differential, parameters({ ridgeFamily: "k2", valleyFamily: "k2" }));

    expect(result.summary.ready).toBe(true);
    expect(result.summary.ridgeCandidateCount).toBeGreaterThanOrEqual(uCount * 0.5);
    expect(result.summary.ridgeCandidateCount).toBeLessThanOrEqual(uCount * 3);
    expect(result.summary.valleyCandidateCount).toBeGreaterThanOrEqual(uCount * 0.5);
    expect(result.summary.valleyCandidateCount).toBeLessThanOrEqual(uCount * 3);
    expect(result.summary.ridgeTotalLength + result.summary.valleyTotalLength).toBeGreaterThan(1);
    assertCandidatesAreValidated(result, differential.directionValidMask);
  });

  it("finds directional extrema on a sampled saddle without using boundary directions", () => {
    const saddle = makeGrid("Saddle", 48, 48, (u, v) => {
      const x = 3 * (u - 0.5);
      const y = 3 * (v - 0.5);
      return [x, y, 0.45 * (x * x - y * y)];
    });
    const differential = computeMeshDifferentialGeometry(saddle)!;
    const result = extractRidgesAndValleys(saddle, differential, parameters({ neighborhoodRings: 2, smoothingIterations: 1 }));
    const candidates = result.summary.ridgeCandidateCount + result.summary.valleyCandidateCount;

    expect(result.summary.ready).toBe(true);
    expect(candidates).toBeGreaterThan(8);
    expect(candidates).toBeLessThan(result.summary.validDirectionVertexCount * 0.25);
    assertCandidatesAreValidated(result, differential.directionValidMask);
  });

  it("is a smooth-sphere negative and records umbilic uncertainty", () => {
    const sphere = makeIcosphere(3);
    const differential = computeMeshDifferentialGeometry(sphere)!;
    const result = extractRidgesAndValleys(sphere, differential, parameters({ minDirectionalContrast: 0 }));

    expect(result.summary.ridgeCandidateCount).toBe(0);
    expect(result.summary.valleyCandidateCount).toBe(0);
    expect(result.summary.ridgeLineCount).toBe(0);
    expect(result.summary.valleyLineCount).toBe(0);
    expect(result.summary.uncertainVertexCount).toBeGreaterThan(result.summary.vertexCount * 0.8);
  });

  it("applies minimum line length after tracing and preserves provenance", () => {
    const torus = makeGrid("Torus", 48, 24, (u, v) => {
      const theta = 2 * Math.PI * u;
      const phi = 2 * Math.PI * v;
      const radius = 2 + 0.5 * Math.cos(phi);
      return [radius * Math.cos(theta), radius * Math.sin(theta), 0.5 * Math.sin(phi)];
    }, true, true);
    const differential = computeMeshDifferentialGeometry(torus)!;
    const baseline = extractRidgesAndValleys(torus, differential, parameters({ ridgeFamily: "k2", valleyFamily: "k2" }));
    const filtered = extractRidgesAndValleys(torus, differential, parameters({ ridgeFamily: "k2", valleyFamily: "k2", minLineLength: 100 }));

    expect(baseline.summary.ridgeLineCount + baseline.summary.valleyLineCount).toBeGreaterThan(0);
    expect(filtered.summary.ridgeLineCount + filtered.summary.valleyLineCount).toBe(0);
    expect(filtered.provenance.dependencies).toEqual(["normals", "curvature", "principal-directions"]);
    expect(filtered.parameters.minLineLength).toBe(100);
  });
});

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

describe("real-mesh ridge and valley extraction", () => {
  it.each([
    ["Fandisk", "07_fandisk.obj", 10],
    ["Stanford Bunny", "08_stanford_bunny.obj", 25],
  ])("produces bounded validated candidates for %s", async (_label, fileName, minimumCandidates) => {
    const absolutePath = path.join(repoRoot, "tests", "assets", "meshes", "standard", fileName);
    const bytes = await readFile(absolutePath);
    const loaded = await loadSurfaceMeshFromFile([new File([bytes], fileName)], { mergeVertices: true });
    const differential = computeMeshDifferentialGeometry(loaded)!;
    const result = extractRidgesAndValleys(loaded, differential, parameters({
      minDirectionalContrast: 0,
      neighborhoodRings: 2,
      smoothingIterations: 1,
    }));
    const candidates = result.summary.ridgeCandidateCount + result.summary.valleyCandidateCount;

    expect(result.summary.ready).toBe(true);
    expect(candidates).toBeGreaterThanOrEqual(minimumCandidates);
    expect(candidates).toBeLessThan(result.summary.validDirectionVertexCount * 0.7);
    expect(result.summary.ridgeLineCount + result.summary.valleyLineCount).toBeGreaterThan(0);
    assertCandidatesAreValidated(result, differential.directionValidMask);
  }, 60_000);
});
