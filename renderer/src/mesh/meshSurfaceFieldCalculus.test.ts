import { describe, expect, it } from "vitest";
import {
  computeMeshFieldDivergence,
  computeMeshFieldGradient,
  computeMeshFieldLaplacian,
  computeMeshFieldNormalCurl,
  createMeshFieldSourceRegistry,
  prepareMeshFieldCalculus,
} from "./meshSurfaceFieldCalculus";

const grid = (size: number, transform: (x: number, y: number) => [number, number, number] = (x, y) => [x, y, 0]) => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= size; y += 1) for (let x = 0; x <= size; x += 1) positions.push(...transform(x / size, y / size));
  const vertex = (x: number, y: number) => y * (size + 1) + x;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const a = vertex(x, y), b = vertex(x + 1, y), c = vertex(x + 1, y + 1), d = vertex(x, y + 1);
    indices.push(a, b, c, a, c, d);
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
};

const interiorValues = (values: ArrayLike<number>, prepared: ReturnType<typeof prepareMeshFieldCalculus>) =>
  Array.from(values).filter((value, index) => !prepared.vertexBoundaryMask[index] && Number.isFinite(value));

const sphere = (levels: number) => {
  let vertices: Array<[number, number, number]> = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  let faces: Array<[number, number, number]> = [[0,2,4],[2,1,4],[1,3,4],[3,0,4],[2,0,5],[1,2,5],[3,1,5],[0,3,5]];
  for (let level = 0; level < levels; level += 1) {
    const midpoint = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const cached = midpoint.get(key);
      if (cached != null) return cached;
      const p = vertices[a], q = vertices[b];
      const v: [number, number, number] = [(p[0]+q[0])/2,(p[1]+q[1])/2,(p[2]+q[2])/2];
      const length = Math.hypot(...v);
      v[0] /= length; v[1] /= length; v[2] /= length;
      const index = vertices.length; vertices.push(v); midpoint.set(key, index); return index;
    };
    const next: Array<[number, number, number]> = [];
    for (const [a,b,c] of faces) {
      const ab=mid(a,b), bc=mid(b,c), ca=mid(c,a);
      next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);
    }
    faces = next;
  }
  return { positions: Float32Array.from(vertices.flat()), indices: Uint32Array.from(faces.flat()) };
};

describe("canonical mesh surface field calculus", () => {
  it("recovers a linear plane gradient and annihilates constants", () => {
    const prepared = prepareMeshFieldCalculus(grid(8));
    const linear = Float64Array.from({ length: prepared.vertexCount }, (_, i) => prepared.positions[i * 3] + 2 * prepared.positions[i * 3 + 1]);
    const gradient = computeMeshFieldGradient(prepared, linear, "x+2y");
    const constant = computeMeshFieldLaplacian(prepared, new Float64Array(prepared.vertexCount).fill(7), "7");
    for (let vertex = 0; vertex < prepared.vertexCount; vertex += 1) {
      expect(gradient.values[vertex * 3]).toBeCloseTo(1, 10);
      expect(gradient.values[vertex * 3 + 1]).toBeCloseTo(2, 10);
      expect(gradient.values[vertex * 3 + 2]).toBeCloseTo(0, 10);
    }
    expect(interiorValues(constant.values, prepared).every((value) => Math.abs(value) < 1e-12)).toBe(true);
  });

  it("computes divergence and oriented normal-curl without a global tangent frame", () => {
    const transform = (u: number, v: number): [number, number, number] => [u, v / Math.sqrt(2), v / Math.sqrt(2)];
    const prepared = prepareMeshFieldCalculus(grid(12, transform));
    const divergenceField = new Float64Array(prepared.vertexCount * 3);
    const rotationField = new Float64Array(prepared.vertexCount * 3);
    const tangentV: [number, number, number] = [0, 1 / Math.sqrt(2), 1 / Math.sqrt(2)];
    for (let i = 0; i < prepared.vertexCount; i += 1) {
      const u = prepared.positions[i * 3];
      const v = prepared.positions[i * 3 + 1] * Math.sqrt(2);
      divergenceField.set([u, v * tangentV[1], v * tangentV[2]], i * 3);
      rotationField.set([-v, u * tangentV[1], u * tangentV[2]], i * 3);
    }
    const divergence = interiorValues(computeMeshFieldDivergence(prepared, divergenceField).values, prepared);
    const curl = interiorValues(computeMeshFieldNormalCurl(prepared, rotationField).values, prepared);
    expect(divergence.length).toBeGreaterThan(0);
    expect(Math.max(...divergence.map((value) => Math.abs(value - 2)))).toBeLessThan(1e-10);
    expect(Math.max(...curl.map((value) => Math.abs(value - 2)))).toBeLessThan(1e-10);
  });

  it("converges toward Delta x = -2x on the unit sphere", () => {
    const error = (levels: number) => {
      const prepared = prepareMeshFieldCalculus(sphere(levels));
      const x = Float64Array.from({ length: prepared.vertexCount }, (_, vertex) => prepared.positions[vertex * 3]);
      const result = computeMeshFieldLaplacian(prepared, x, "x");
      let sum = 0;
      for (let vertex = 0; vertex < prepared.vertexCount; vertex += 1) sum += Math.abs(result.values[vertex] + 2 * x[vertex]);
      return sum / prepared.vertexCount;
    };
    const coarse = error(1);
    const fine = error(3);
    expect(fine).toBeLessThan(coarse);
    expect(fine).toBeLessThan(0.08);
  });

  it("registers coordinate, distance, area, valence, curvature, quality, normal, principal, imported, and derived sources", () => {
    const prepared = prepareMeshFieldCalculus(grid(2));
    const count = prepared.vertexCount;
    const faceCount = prepared.faceCount;
    const curvature = {
      K: new Float64Array(count), H: new Float64Array(count), k1: new Float64Array(count), k2: new Float64Array(count),
      shapeIndex: new Float64Array(count), curvedness: new Float64Array(count), d1: new Float64Array(count * 3), d2: new Float64Array(count * 3),
      directionValidMask: new Uint8Array(count).fill(1),
    } as any;
    const face = new Float64Array(faceCount).fill(1);
    const quality = { faceCount, fields: { face: { triangleArea: face, aspectRatio: face, edgeRatio: face, minimumAngleDeg: face, maximumAngleDeg: face, radiusRatio: face, scaledJacobian: face }, faceValidMask: new Uint8Array(faceCount).fill(1) } } as any;
    const registry = createMeshFieldSourceRegistry(prepared, {
      curvature,
      quality,
      importedScalars: [{ name: "temperature", values: new Float64Array(count) }],
      importedVectors: [{ name: "velocity", values: new Float64Array(count * 3), itemSize: 3 }],
      derivedScalars: [{ name: "distance(seed)", values: new Float64Array(count) }],
      derivedVectors: [{ name: "grad(K)", values: new Float64Array(count * 3), itemSize: 3 }],
    });
    for (const source of ["x", "y", "z", "radius", "vertex-area", "vertex-valence", "K", "quality.minimumAngleDeg", "temperature", "distance(seed)"]) {
      expect(registry.scalars.has(source), source).toBe(true);
    }
    for (const source of ["normals", "principal-d1", "principal-d2", "velocity", "grad(K)"]) {
      expect(registry.vectors.has(source), source).toBe(true);
    }
  });
});
