import type { VectorField3DIsosurface } from "@math3d/core";

export type ReindexedSurfaceMatch = Readonly<{
  status: "matched"; mapping: readonly number[]; maxDistance: number;
  rmsDistance: number; candidateChecks: number;
}> | Readonly<{ status: "unavailable"; reason: string }>;

/** Bounded physical vertex matching; triangle orientation must survive the remap. */
export function matchReindexedTemporalSurface(a: VectorField3DIsosurface,
  b: VectorField3DIsosurface): ReindexedSurfaceMatch {
  const unavailable = (reason: string): ReindexedSurfaceMatch =>
    ({ status: "unavailable", reason });
  const count = a.positions.length / 3;
  if (!Number.isSafeInteger(count) || count < 3 || count > 10_000 ||
      b.positions.length !== a.positions.length ||
      a.indices.length !== b.indices.length)
    return unavailable("Remapping needs equal bounded vertex and triangle counts.");
  let shortest = Infinity;
  for (let i = 0; i < a.indices.length; i += 3) {
    const ids = [a.indices[i]!, a.indices[i + 1]!, a.indices[i + 2]!];
    if (ids.some(id => id >= count)) return unavailable("Triangle index is out of range.");
    for (let edge = 0; edge < 3; edge++) {
      const p = ids[edge]! * 3, q = ids[(edge + 1) % 3]! * 3;
      shortest = Math.min(shortest, Math.hypot(a.positions[p]! - a.positions[q]!,
        a.positions[p + 1]! - a.positions[q + 1]!,
        a.positions[p + 2]! - a.positions[q + 2]!));
    }
  }
  if (!Number.isFinite(shortest) || shortest <= 1e-8)
    return unavailable("Source mesh has a degenerate edge.");
  const radius = shortest * .5;
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const cell = (buffer: Float32Array, index: number) => [0, 1, 2].map(axis =>
    Math.floor(buffer[index * 3 + axis]! / radius));
  const buckets = new Map<string, number[]>();
  for (let index = 0; index < count; index++) {
    const [x, y, z] = cell(b.positions, index);
    if (![x, y, z].every(Number.isFinite)) return unavailable("A vertex is nonfinite.");
    const id = key(x!, y!, z!);
    const bucket = buckets.get(id) ?? []; bucket.push(index); buckets.set(id, bucket);
  }
  const mapping: number[] = [], used = new Set<number>();
  let checks = 0, maxDistance = 0, squared = 0;
  for (let index = 0; index < count; index++) {
    const [x, y, z] = cell(a.positions, index);
    if (![x, y, z].every(Number.isFinite)) return unavailable("A vertex is nonfinite.");
    let best = -1, bestDistance = Infinity, secondDistance = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (const candidate of buckets.get(key(x! + dx, y! + dy, z! + dz)) ?? []) {
          if (++checks > 1_000_000) return unavailable("Correspondence work budget reached.");
          const p = index * 3, q = candidate * 3;
          const distance = Math.hypot(a.positions[p]! - b.positions[q]!,
            a.positions[p + 1]! - b.positions[q + 1]!,
            a.positions[p + 2]! - b.positions[q + 2]!);
          if (distance < bestDistance) {
            secondDistance = bestDistance; bestDistance = distance; best = candidate;
          } else secondDistance = Math.min(secondDistance, distance);
        }
    if (best < 0 || bestDistance > radius)
      return unavailable("No vertex lies within the geometric error limit.");
    if (secondDistance - bestDistance <= radius * 1e-4 || used.has(best))
      return unavailable("Vertex correspondence is ambiguous.");
    mapping.push(best); used.add(best);
    maxDistance = Math.max(maxDistance, bestDistance);
    squared += bestDistance ** 2;
  }
  if (used.size !== count) return unavailable("Vertex correspondence is incomplete.");
  const inverse = new Array<number>(count);
  mapping.forEach((bIndex, aIndex) => { inverse[bIndex] = aIndex; });
  const faceKey = (u: number, v: number, w: number) =>
    [[u, v, w], [v, w, u], [w, u, v]].map(face => face.join(","))
      .sort()[0]!;
  const faces = new Map<string, number>();
  for (let i = 0; i < a.indices.length; i += 3) {
    const face = faceKey(a.indices[i]!, a.indices[i + 1]!, a.indices[i + 2]!);
    faces.set(face, (faces.get(face) ?? 0) + 1);
  }
  for (let i = 0; i < b.indices.length; i += 3) {
    const ids = [b.indices[i]!, b.indices[i + 1]!, b.indices[i + 2]!];
    if (ids.some(id => id >= count)) return unavailable("Triangle index is out of range.");
    const face = faceKey(inverse[ids[0]!]!, inverse[ids[1]!]!, inverse[ids[2]!]!);
    const remaining = faces.get(face) ?? 0;
    if (!remaining) return unavailable("Oriented triangle correspondence changed.");
    faces.set(face, remaining - 1);
  }
  if ([...faces.values()].some(value => value !== 0))
    return unavailable("Oriented triangle correspondence is incomplete.");
  return { status: "matched", mapping, maxDistance,
    rmsDistance: Math.sqrt(squared / count), candidateChecks: checks };
}
