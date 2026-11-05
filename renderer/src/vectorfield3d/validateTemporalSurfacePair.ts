import type { VectorField3DIsosurface } from "@math3d/core";
import { matchReindexedTemporalSurface } from "./matchReindexedTemporalSurface";

export type TemporalSurfacePairReview = Readonly<{ status: "compatible" | "unavailable";
  reason: string; maxDisplacement: number; rmsDisplacement?: number;
  correspondence?: "indexed" | "reindexed"; mapping?: readonly number[] }>;

/** A conservative vertex correspondence gate for deterministic extraction output. */
export function validateTemporalSurfacePair(a: VectorField3DIsosurface,
  b: VectorField3DIsosurface): TemporalSurfacePairReview {
  const unavailable = (reason: string): TemporalSurfacePairReview =>
    ({ status: "unavailable", reason, maxDisplacement: 0 });
  if (!a.complete || !b.complete || a.triangleCount < 1 || b.triangleCount < 1)
    return unavailable("A frame is incomplete or empty.");
  if (a.level !== b.level || a.unit !== b.unit ||
      JSON.stringify(a.clipBounds) !== JSON.stringify(b.clipBounds) ||
      JSON.stringify(a.coordinateAxes) !== JSON.stringify(b.coordinateAxes))
    return unavailable("Level, units, clipping, or physical axes changed.");
  if (!a.topology.watertight || !b.topology.watertight ||
      a.topology.nonManifoldEdgeCount || b.topology.nonManifoldEdgeCount)
    return unavailable("A frame has an open or nonmanifold surface.");
  if (JSON.stringify(a.topology) !== JSON.stringify(b.topology))
    return unavailable("Surface topology changed between frames.");
  if (a.positions.length !== b.positions.length || a.indices.length !== b.indices.length ||
      a.normals.length !== a.positions.length || b.normals.length !== b.positions.length)
    return unavailable("Vertex or triangle counts changed.");
  const sameIndexing = a.indices.every((index, i) => index === b.indices[i]);
  const match = sameIndexing ? null : matchReindexedTemporalSurface(a, b);
  if (match?.status === "unavailable") return unavailable(match.reason);
  const mapping = match?.status === "matched" ? match.mapping : undefined;
  const aligned = mapping ? { ...b, indices: a.indices,
    positions: Float32Array.from(a.positions, (_, i) =>
      b.positions[mapping[Math.floor(i / 3)]! * 3 + i % 3]!),
    normals: Float32Array.from(a.normals, (_, i) =>
      b.normals[mapping[Math.floor(i / 3)]! * 3 + i % 3]!) } : b;
  let shortestEdge = Infinity;
  for (let i = 0; i < a.indices.length; i += 3) {
    const ids = [a.indices[i]!, a.indices[i + 1]!, a.indices[i + 2]!];
    const face = (positions: Float32Array) => {
      const p = ids[0]! * 3, q = ids[1]! * 3, r = ids[2]! * 3;
      const u = [positions[q]! - positions[p]!, positions[q + 1]! -
        positions[p + 1]!, positions[q + 2]! - positions[p + 2]!];
      const v = [positions[r]! - positions[p]!, positions[r + 1]! -
        positions[p + 1]!, positions[r + 2]! - positions[p + 2]!];
      return [u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!] as const;
    };
    if (ids.some(id => id * 3 + 2 >= a.positions.length))
      return unavailable("Triangle indices are outside the vertex array.");
    const first = face(a.positions), second = face(aligned.positions);
    const areaA = Math.hypot(...first), areaB = Math.hypot(...second);
    if (!Number.isFinite(areaA) || !Number.isFinite(areaB) ||
        areaA <= 1e-12 || areaB <= 1e-12 ||
        first.reduce((sum, value, axis) => sum + value * second[axis]!, 0) <
          .8 * areaA * areaB)
      return unavailable("A triangle became degenerate or changed orientation.");
    for (let edge = 0; edge < 3; edge++) {
      const u = ids[edge]! * 3, v = ids[(edge + 1) % 3]! * 3;
      const length = Math.hypot(a.positions[u]! - a.positions[v]!,
        a.positions[u + 1]! - a.positions[v + 1]!,
        a.positions[u + 2]! - a.positions[v + 2]!);
      shortestEdge = Math.min(shortestEdge, length);
    }
  }
  if (!Number.isFinite(shortestEdge) || shortestEdge <= 1e-8)
    return unavailable("A triangle has a degenerate edge.");
  let maxDisplacement = 0, sumSquared = 0;
  for (let i = 0; i < a.positions.length; i += 3) {
    const distance = Math.hypot(a.positions[i]! - aligned.positions[i]!,
      a.positions[i + 1]! - aligned.positions[i + 1]!,
      a.positions[i + 2]! - aligned.positions[i + 2]!);
    if (!Number.isFinite(distance)) return unavailable("A vertex position is nonfinite.");
    maxDisplacement = Math.max(maxDisplacement, distance);
    sumSquared += distance * distance;
    const dot = a.normals[i]! * aligned.normals[i]! +
      a.normals[i + 1]! * aligned.normals[i + 1]! +
      a.normals[i + 2]! * aligned.normals[i + 2]!;
    if (!Number.isFinite(dot) || dot < 0.5)
      return unavailable("A surface normal changed orientation.");
  }
  if (maxDisplacement > shortestEdge * 0.5)
    return unavailable("Vertex motion exceeds half the shortest source edge.");
  const rmsDisplacement = Math.sqrt(sumSquared / (a.positions.length / 3));
  return { status: "compatible", reason: mapping ?
    `Validated reindexed triangles; max error ${maxDisplacement.toPrecision(3)}, ` +
      `RMS ${rmsDisplacement.toPrecision(3)}.` :
    "Matched indexed vertices and stable topology.",
    maxDisplacement, rmsDisplacement,
    correspondence: mapping ? "reindexed" : "indexed", mapping };
}

export function interpolateTemporalSurfacePair(a: VectorField3DIsosurface,
  b: VectorField3DIsosurface, fraction: number): VectorField3DIsosurface {
  const review = validateTemporalSurfacePair(a, b);
  if (review.status !== "compatible") throw new TypeError(review.reason);
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1)
    throw new RangeError("Interpolation fraction must be between the pinned times.");
  const positions = Float32Array.from(a.positions, (value, i) =>
    value + fraction * (b.positions[(review.mapping?.[Math.floor(i / 3)] ??
      Math.floor(i / 3)) * 3 + i % 3]! - value));
  const normals = Float32Array.from(a.normals, (value, i) =>
    value + fraction * (b.normals[(review.mapping?.[Math.floor(i / 3)] ??
      Math.floor(i / 3)) * 3 + i % 3]! - value));
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!);
    if (length <= 1e-8) throw new TypeError("Interpolated normal is undefined.");
    normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length;
  }
  return { ...a, positions, normals, indices: a.indices,
    sourceHash: null, sourceReferences: null, verifiedTiles: undefined };
}
