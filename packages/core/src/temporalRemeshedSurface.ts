import type { VectorField3DIsosurface } from "./vectorField3DIsosurface";

type Vec = readonly [number, number, number];
const point = (values: Float32Array, id: number): Vec =>
  [values[id * 3]!, values[id * 3 + 1]!, values[id * 3 + 2]!];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a: Vec, b: Vec, t: number): Vec =>
  [a[0] + b[0] * t, a[1] + b[1] * t, a[2] + b[2] * t];
const distance2 = (a: Vec, b: Vec) => dot(sub(a, b), sub(a, b));

/** Closest physical point on a triangle, including edges and vertices. */
function closest(p: Vec, a: Vec, b: Vec, c: Vec): Vec {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0)
    return add(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const denom = 1 / (va + vb + vc);
  return add(add(a, ab, vb * denom), ac, vc * denom);
}

export type RemeshedSurfaceMatch = Readonly<{ status: "matched"; maxError: number;
  rmsError: number; targetPositions: Float32Array; targetNormals: Float32Array }> |
  Readonly<{ status: "unavailable"; reason: string }>;

/** Bounded, bidirectional geometric gate. It makes no material-point claim. */
export function matchRemeshedTemporalSurface(a: VectorField3DIsosurface,
  b: VectorField3DIsosurface): RemeshedSurfaceMatch {
  const unavailable = (reason: string): RemeshedSurfaceMatch =>
    ({ status: "unavailable", reason });
  if (a.triangleCount > 2048 || b.triangleCount > 2048 ||
      a.positions.length > 3072 || b.positions.length > 3072)
    return unavailable("Remeshed correspondence exceeds the 2048-triangle or 1024-vertex budget.");
  if (a.indices.length !== a.triangleCount * 3 ||
      b.indices.length !== b.triangleCount * 3 ||
      a.indices.some(id => id * 3 + 2 >= a.positions.length) ||
      b.indices.some(id => id * 3 + 2 >= b.positions.length))
    return unavailable("Remeshed triangle indices are invalid.");
  const project = (from: VectorField3DIsosurface, to: VectorField3DIsosurface) => {
    const positions = new Float32Array(from.positions.length);
    const normals = new Float32Array(from.positions.length);
    let max2 = 0, sum2 = 0, ambiguous = false;
    for (let i = 0; i < from.positions.length / 3; i++) {
      const p = point(from.positions, i);
      let best = Infinity, bestPoint: Vec | null = null, bestNormal: Vec | null = null;
      for (let t = 0; t < to.indices.length; t += 3) {
        const ids = [to.indices[t]!, to.indices[t + 1]!, to.indices[t + 2]!];
        const q = closest(p, point(to.positions, ids[0]!),
          point(to.positions, ids[1]!), point(to.positions, ids[2]!));
        const d = distance2(p, q);
        if (!Number.isFinite(d)) return null;
        const n: Vec = [ids.reduce((s, id) => s + to.normals[id * 3]!, 0),
          ids.reduce((s, id) => s + to.normals[id * 3 + 1]!, 0),
          ids.reduce((s, id) => s + to.normals[id * 3 + 2]!, 0)];
        const length = Math.hypot(...n);
        if (length < 1e-8) return null;
        const unit: Vec = [n[0] / length, n[1] / length, n[2] / length];
        if (d < best - 1e-10) {
          best = d; bestPoint = q; bestNormal = unit; ambiguous = false;
        } else if (Math.abs(d - best) <= 1e-10 && bestPoint &&
            distance2(q, bestPoint) > 1e-8) ambiguous = true;
      }
      if (!bestPoint || !bestNormal || ambiguous) return null;
      const sourceNormal = point(from.normals, i);
      if (dot(sourceNormal, bestNormal) < .5) return null;
      positions.set(bestPoint, i * 3); normals.set(bestNormal, i * 3);
      max2 = Math.max(max2, best); sum2 += best;
    }
    return { positions, normals, maxError: Math.sqrt(max2),
      rmsError: Math.sqrt(sum2 / (from.positions.length / 3)) };
  };
  const forward = project(a, b), reverse = project(b, a);
  if (!forward || !reverse)
    return unavailable("Remeshed matching is ambiguous, nonfinite, or changes normal orientation.");
  const signedVolume = (surface: VectorField3DIsosurface) => {
    let volume = 0;
    for (let t = 0; t < surface.indices.length; t += 3) {
      const p = point(surface.positions, surface.indices[t]!);
      const q = point(surface.positions, surface.indices[t + 1]!);
      const r = point(surface.positions, surface.indices[t + 2]!);
      volume += dot(p, cross(q, r)) / 6;
    }
    return volume;
  };
  const volumeA = signedVolume(a), volumeB = signedVolume(b);
  if (!Number.isFinite(volumeA) || !Number.isFinite(volumeB) ||
      Math.abs(volumeA) < 1e-12 || Math.abs(volumeB) < 1e-12 ||
      Math.sign(volumeA) !== Math.sign(volumeB))
    return unavailable("Remeshed closed surfaces changed orientation or became degenerate.");
  for (let t = 0; t < a.indices.length; t += 3) {
    const ids = [a.indices[t]!, a.indices[t + 1]!, a.indices[t + 2]!];
    const faceNormal = (positions: Float32Array) => cross(
      sub(point(positions, ids[1]!), point(positions, ids[0]!)),
      sub(point(positions, ids[2]!), point(positions, ids[0]!)));
    const first = faceNormal(a.positions), second = faceNormal(forward.positions);
    if (Math.hypot(...first) < 1e-12 || Math.hypot(...second) < 1e-12 ||
        dot(first, second) < .8 * Math.hypot(...first) * Math.hypot(...second))
      return unavailable("Remeshed projection folded or reversed a triangle.");
  }
  let shortest = Infinity;
  for (const surface of [a, b]) for (let t = 0; t < surface.indices.length; t += 3) {
    const ids = [surface.indices[t]!, surface.indices[t + 1]!, surface.indices[t + 2]!];
    for (let e = 0; e < 3; e++) shortest = Math.min(shortest,
      Math.sqrt(distance2(point(surface.positions, ids[e]!),
        point(surface.positions, ids[(e + 1) % 3]!))));
  }
  const maxError = Math.max(forward.maxError, reverse.maxError);
  if (!Number.isFinite(shortest) || shortest <= 1e-8 || maxError > shortest * .25)
    return unavailable("Remeshed geometric error exceeds a quarter of the shortest edge.");
  return { status: "matched", maxError,
    rmsError: Math.max(forward.rmsError, reverse.rmsError),
    targetPositions: forward.positions, targetNormals: forward.normals };
}
