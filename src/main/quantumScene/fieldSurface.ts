import type { ImportedQuantumScene } from "./importer";

export type FieldSurfaceRequest = { fingerprint: string; fieldId: string; level: 0.01 | 0.05 | 0.1 | 0.2 };
export type FieldSurface = { fieldId: string; level: number; threshold: number; maximum: number;
  unit: string; coordinateUnits: [string, string, string]; sampledShape: [number, number, number];
  positions: Float32Array; normals: Float32Array; indices: Uint32Array; triangleCount: number;
  phaseBins: Uint8Array; realSignBins: Uint8Array };

const MAX_TRIANGLES = 20_000;
const CORNERS: readonly [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
const TETRAHEDRA: readonly [number, number, number, number][] = [
  [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
  [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6],
];
type Point = [number, number, number];
type Vertex = { point: Point; real: number; imaginary: number };

function sampleAxes(shape: [number, number, number]): [number[], number[], number[]] {
  const step = Math.max(1, Math.ceil(Math.max(...shape.map(n => n - 1)) / 24));
  return shape.map(n => {
    const samples: number[] = [];
    for (let i = 0; i < n - 1; i += step) samples.push(i);
    samples.push(n - 1);
    return samples;
  }) as [number[], number[], number[]];
}

/** Preview-only density surface from verified amplitudes; no physics is recomputed. */
export function deriveVerifiedFieldSurface(imported: ImportedQuantumScene, request: FieldSurfaceRequest): FieldSurface {
  if (![0.01, 0.05, 0.1, 0.2].includes(request.level)) throw new RangeError("Unsupported density threshold");
  const field = imported.source.fields?.find(entry => entry.id === request.fieldId);
  if (!field || field.kind !== "complex-field") throw new TypeError("Verified complex field unavailable");
  const real = imported.arrays.get(field.real), imaginary = imported.arrays.get(field.imaginary!);
  if (!real || !imaginary || real.length !== imaginary.length) throw new TypeError("Verified amplitudes unavailable");
  const realUnit = imported.source.datasets.find(entry => entry.id === field.real)?.unit;
  if (!realUnit || imported.source.datasets.find(entry => entry.id === field.imaginary)?.unit !== realUnit)
    throw new TypeError("Complex field components have different units");
  const unit = realUnit === "a0^-3/2" ? "a0^-3" : realUnit === "dimensionless" ? realUnit : `(${realUnit})²`;
  const shape = field.grid.shape;
  const density = new Float64Array(real.length);
  let maximum = 0;
  for (let i = 0; i < real.length; i++) {
    const value = real[i] * real[i] + imaginary[i] * imaginary[i];
    density[i] = value; maximum = Math.max(maximum, value);
  }
  const threshold = maximum * request.level;
  const axes = sampleAxes(shape);
  const sampledShape = axes.map(axis => axis.length) as [number, number, number];
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const phaseBins: number[] = [], realSignBins: number[] = [];
  if (maximum === 0) return { fieldId: field.id, level: request.level, threshold, maximum, unit,
    coordinateUnits: imported.source.coordinates.units, sampledShape,
    positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), triangleCount: 0,
    phaseBins: new Uint8Array(), realSignBins: new Uint8Array() };
  const flat = (i: number, j: number, k: number) => (i * shape[1] + j) * shape[2] + k;
  const interpolate = (a: Vertex & { value: number }, b: Vertex & { value: number }): Vertex => {
    const av = a.value, bv = b.value;
    const t = av === bv ? 0.5 : (threshold - av) / (bv - av);
    return { point: [0, 1, 2].map(axis => a.point[axis] + t * (b.point[axis] - a.point[axis])) as Point,
      real: a.real + t * (b.real - a.real), imaginary: a.imaginary + t * (b.imaginary - a.imaginary) };
  };
  const triangle = (a: Vertex, b: Vertex, c: Vertex, outward: Point) => {
    if (indices.length / 3 >= MAX_TRIANGLES) throw new RangeError("Quantum surface exceeds preview triangle budget");
    const ab: Point = [b.point[0] - a.point[0], b.point[1] - a.point[1], b.point[2] - a.point[2]];
    const ac: Point = [c.point[0] - a.point[0], c.point[1] - a.point[1], c.point[2] - a.point[2]];
    const cross: Point = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const second = cross.reduce((sum, value, axis) => sum + value * outward[axis], 0) < 0 ? c : b;
    const third = second === c ? b : c;
    const length = Math.hypot(...cross) || 1;
    const sign = second === c ? -1 : 1;
    for (const point of [a, second, third]) {
      positions.push(...point.point); normals.push(...cross.map(value => sign * value / length));
      indices.push(indices.length);
    }
    const averageReal = (a.real + b.real + c.real) / 3;
    const averageImaginary = (a.imaginary + b.imaginary + c.imaginary) / 3;
    const nearNode = averageReal ** 2 + averageImaginary ** 2 <= maximum * 1e-12;
    const phase = Math.atan2(averageImaginary, averageReal);
    phaseBins.push(nearNode ? 8 : Math.floor(((phase + Math.PI) / (2 * Math.PI)) * 8) % 8);
    realSignBins.push(Math.abs(averageReal) <= Math.sqrt(maximum) * 1e-6 ? 2 : averageReal < 0 ? 0 : 1);
  };
  for (let x = 0; x < axes[0].length - 1; x++) for (let y = 0; y < axes[1].length - 1; y++)
    for (let z = 0; z < axes[2].length - 1; z++) {
      const points = CORNERS.map(([dx, dy, dz]) => {
        const grid: Point = [axes[0][x + dx], axes[1][y + dy], axes[2][z + dz]];
        const point = grid.map((index, axis) => field.grid.origin[axis] + index * field.grid.spacing[axis]) as Point;
        const index = flat(...grid);
        return { point, value: density[index], real: real[index], imaginary: imaginary[index] };
      });
      for (const tetra of TETRAHEDRA) {
        const high = tetra.filter(index => points[index].value >= threshold);
        const low = tetra.filter(index => points[index].value < threshold);
        if (!high.length || !low.length) continue;
        const highCenter = [0, 1, 2].map(axis => high.reduce((sum, index) => sum + points[index].point[axis], 0) / high.length);
        const lowCenter = [0, 1, 2].map(axis => low.reduce((sum, index) => sum + points[index].point[axis], 0) / low.length);
        const outward = lowCenter.map((value, axis) => value - highCenter[axis]) as Point;
        const edge = (a: number, b: number) => interpolate(points[a], points[b]);
        if (high.length === 1) {
          triangle(edge(high[0], low[0]), edge(high[0], low[1]), edge(high[0], low[2]), outward);
        } else if (low.length === 1) {
          triangle(edge(low[0], high[0]), edge(low[0], high[1]), edge(low[0], high[2]), outward);
        } else {
          const a = edge(high[0], low[0]), b = edge(high[0], low[1]);
          const c = edge(high[1], low[1]), d = edge(high[1], low[0]);
          triangle(a, b, c, outward); triangle(a, c, d, outward);
        }
      }
    }
  return { fieldId: field.id, level: request.level, threshold, maximum, unit,
    coordinateUnits: imported.source.coordinates.units, sampledShape,
    positions: Float32Array.from(positions), normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices), triangleCount: indices.length / 3,
    phaseBins: Uint8Array.from(phaseBins), realSignBins: Uint8Array.from(realSignBins) };
}
