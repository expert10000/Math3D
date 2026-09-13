import type { VolumeGrid } from "../scene/datasets";
import type {
  VolumeSdfMetadata,
  VolumeSdfOperation,
  VolumeSdfSignDiagnostics,
  VolumeSdfSourceDescriptor,
} from "./contracts";

export type SdfOperationOptions = {
  amount?: number;
  smoothness?: number;
  reinitializeIterations?: number;
};

const edgeKey = (a: number, b: number): string => a < b ? `${a}:${b}` : `${b}:${a}`;

export const analyzeMeshForSignedDistance = (
  positions: Float32Array,
  indices: Uint32Array | null | undefined,
): VolumeSdfSignDiagnostics => {
  const vertexCount = Math.floor(positions.length / 3);
  const triangleIndices = indices?.length
    ? indices
    : Uint32Array.from({ length: vertexCount }, (_, index) => index);
  if (vertexCount < 3 || triangleIndices.length < 3) {
    return {
      reliable: false,
      confidence: "unavailable",
      watertight: false,
      orientation: "unknown",
      boundaryEdgeCount: 0,
      nonManifoldEdgeCount: 0,
      signedVolume: null,
      message: "A triangle mesh is required for signed-distance classification.",
    };
  }

  const edges = new Map<string, number>();
  const canonicalByPosition = new Map<string, number>();
  const canonical = new Uint32Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const key = `${Math.round(positions[vertex * 3] * 1e7)}:${Math.round(positions[vertex * 3 + 1] * 1e7)}:${Math.round(positions[vertex * 3 + 2] * 1e7)}`;
    let id = canonicalByPosition.get(key);
    if (id == null) {
      id = canonicalByPosition.size;
      canonicalByPosition.set(key, id);
    }
    canonical[vertex] = id;
  }
  let signedVolume = 0;
  const triangleCount = Math.floor(triangleIndices.length / 3);
  for (let face = 0; face < triangleCount; face += 1) {
    const ia = triangleIndices[face * 3];
    const ib = triangleIndices[face * 3 + 1];
    const ic = triangleIndices[face * 3 + 2];
    if (ia >= vertexCount || ib >= vertexCount || ic >= vertexCount) continue;
    const ca = canonical[ia]; const cb = canonical[ib]; const cc = canonical[ic];
    edges.set(edgeKey(ca, cb), (edges.get(edgeKey(ca, cb)) ?? 0) + 1);
    edges.set(edgeKey(cb, cc), (edges.get(edgeKey(cb, cc)) ?? 0) + 1);
    edges.set(edgeKey(cc, ca), (edges.get(edgeKey(cc, ca)) ?? 0) + 1);
    const ax = positions[ia * 3]; const ay = positions[ia * 3 + 1]; const az = positions[ia * 3 + 2];
    const bx = positions[ib * 3]; const by = positions[ib * 3 + 1]; const bz = positions[ib * 3 + 2];
    const cx = positions[ic * 3]; const cy = positions[ic * 3 + 1]; const cz = positions[ic * 3 + 2];
    signedVolume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  for (const count of edges.values()) {
    if (count === 1) boundaryEdgeCount += 1;
    else if (count > 2) nonManifoldEdgeCount += 1;
  }
  const watertight = boundaryEdgeCount === 0 && nonManifoldEdgeCount === 0 && edges.size > 0;
  const scale = positions.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
  const volumeTolerance = Math.max(1e-12, scale ** 3 * 1e-9);
  const orientation = !watertight
    ? "unknown"
    : Math.abs(signedVolume) <= volumeTolerance
      ? "degenerate"
      : signedVolume > 0 ? "outward" : "inward";
  const reliable = watertight && orientation !== "degenerate";
  const blockers = [
    boundaryEdgeCount ? `${boundaryEdgeCount} boundary edges` : "",
    nonManifoldEdgeCount ? `${nonManifoldEdgeCount} non-manifold edges` : "",
    orientation === "degenerate" ? "degenerate oriented volume" : "",
  ].filter(Boolean);
  return {
    reliable,
    confidence: reliable ? "high" : "low",
    watertight,
    orientation,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    signedVolume: Number.isFinite(signedVolume) ? signedVolume : null,
    message: reliable
      ? `Reliable winding classification (${orientation} orientation).`
      : `Signed distance is not reliable: ${blockers.join(", ") || "mesh validation failed"}.`,
  };
};

const assertCompatible = (left: VolumeGrid, right: VolumeGrid): void => {
  if (left.dims.some((value, axis) => value !== right.dims[axis])) throw new Error("SDF inputs must have identical dimensions.");
  const leftOrigin = left.origin ?? [0, 0, 0];
  const rightOrigin = right.origin ?? [0, 0, 0];
  const leftSpacing = left.spacing ?? [1, 1, 1];
  const rightSpacing = right.spacing ?? [1, 1, 1];
  if (leftOrigin.some((value, axis) => Math.abs(value - rightOrigin[axis]) > 1e-9) ||
      leftSpacing.some((value, axis) => Math.abs(value - rightSpacing[axis]) > 1e-9)) {
    throw new Error("SDF inputs must share origin and spacing.");
  }
};

export const occupancyFromDistance = (values: Float32Array, signed: boolean): Float32Array =>
  Float32Array.from(values, (value) => signed ? (value <= 0 ? 1 : 0) : (value === 0 ? 1 : 0));

export const reinitializeSignedDistance = (
  values: Float32Array,
  dims: readonly [number, number, number],
  spacing: readonly [number, number, number],
  iterations = 4,
): Float32Array => {
  const [nx, ny, nz] = dims;
  const distances = new Float32Array(values.length);
  distances.fill(Number.POSITIVE_INFINITY);
  const offsets = [
    [-1, 0, 0, spacing[0]], [1, 0, 0, spacing[0]],
    [0, -1, 0, spacing[1]], [0, 1, 0, spacing[1]],
    [0, 0, -1, spacing[2]], [0, 0, 1, spacing[2]],
  ] as const;
  const indexOf = (x: number, y: number, z: number) => x + nx * (y + ny * z);
  for (let z = 0; z < nz; z += 1) for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) {
    const index = indexOf(x, y, z);
    const negative = values[index] <= 0;
    if (Math.abs(values[index]) <= 1e-12) distances[index] = 0;
    for (const [dx, dy, dz, weight] of offsets) {
      const xx = x + dx; const yy = y + dy; const zz = z + dz;
      if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
      const neighbor = values[indexOf(xx, yy, zz)];
      if ((neighbor <= 0) !== negative) {
        const magnitude = Math.abs(values[index]);
        const denominator = magnitude + Math.abs(neighbor);
        distances[index] = Math.min(distances[index], denominator > 1e-12 ? Math.abs(weight) * magnitude / denominator : 0);
      }
    }
  }
  const sweep = (reverse: boolean) => {
    const start = reverse ? values.length - 1 : 0;
    const end = reverse ? -1 : values.length;
    const step = reverse ? -1 : 1;
    for (let index = start; index !== end; index += step) {
      const z = Math.floor(index / (nx * ny));
      const remainder = index - z * nx * ny;
      const y = Math.floor(remainder / nx);
      const x = remainder - y * nx;
      let best = distances[index];
      for (const [dx, dy, dz, weight] of offsets) {
        const xx = x + dx; const yy = y + dy; const zz = z + dz;
        if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
        best = Math.min(best, distances[indexOf(xx, yy, zz)] + Math.abs(weight));
      }
      distances[index] = best;
    }
  };
  for (let pass = 0; pass < Math.max(1, iterations); pass += 1) {
    sweep(false);
    sweep(true);
  }
  return Float32Array.from(distances, (distance, index) => (values[index] <= 0 ? -distance : distance));
};

export const applySdfOperation = (
  primary: VolumeGrid,
  operation: VolumeSdfOperation,
  secondary?: VolumeGrid | null,
  options: SdfOperationOptions = {},
): Float32Array => {
  const binary = operation === "union" || operation === "intersection" || operation === "subtraction" || operation === "smooth-union";
  if (binary && !secondary) throw new Error(`${operation} requires a secondary SDF.`);
  if (secondary) assertCompatible(primary, secondary);
  if (operation === "reinitialize") {
    return reinitializeSignedDistance(primary.scalars, primary.dims, primary.spacing ?? [1, 1, 1], options.reinitializeIterations);
  }
  if (operation === "occupancy") return occupancyFromDistance(primary.scalars, true);
  const amount = Number.isFinite(options.amount) ? Number(options.amount) : 0.1;
  const smoothness = Math.max(1e-9, Number.isFinite(options.smoothness) ? Number(options.smoothness) : 0.2);
  return Float32Array.from(primary.scalars, (left, index) => {
    const right = secondary?.scalars[index] ?? 0;
    if (operation === "union") return Math.min(left, right);
    if (operation === "intersection") return Math.max(left, right);
    if (operation === "subtraction") return Math.max(left, -right);
    if (operation === "offset") return left - amount;
    if (operation === "shell") return Math.abs(left) - Math.abs(amount) * 0.5;
    if (operation === "smooth-union") {
      const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (right - left) / smoothness));
      return right * (1 - h) + left * h - smoothness * h * (1 - h);
    }
    return left;
  });
};

export const createSdfMetadata = (args: {
  grid: VolumeGrid;
  output: VolumeSdfMetadata["output"];
  operation: VolumeSdfOperation;
  parameters?: Readonly<Record<string, number>>;
  sources: readonly VolumeSdfSourceDescriptor[];
  sign: VolumeSdfSignDiagnostics;
  backend: string;
  backendVersion?: string;
  warnings?: readonly string[];
  now?: number;
}): VolumeSdfMetadata => ({
  output: args.output,
  operation: args.operation,
  parameters: { ...(args.parameters ?? {}) },
  sources: args.sources.map((source) => ({ ...source, transform: [...source.transform] })),
  sign: { ...args.sign },
  sampling: {
    dimensions: [...args.grid.dims],
    origin: [...(args.grid.origin ?? [0, 0, 0])],
    spacing: [...(args.grid.spacing ?? [1, 1, 1])],
    centering: args.grid.centering ?? "point",
  },
  backend: args.backend,
  backendVersion: args.backendVersion ?? "1",
  warnings: [...(args.warnings ?? [])],
  createdAt: args.now ?? Date.now(),
});
