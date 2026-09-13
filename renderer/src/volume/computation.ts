import { marchingCubesVolume } from "../math/marchingCubes";
import type { VolumeGrid } from "../scene/datasets";
import type { VolumeDependency, VolumeObject } from "./contracts";

export type VolumeJobOperation =
  | "sampleField"
  | "sliceVolume"
  | "resampleVolume"
  | "histogram"
  | "gradientVolume"
  | "marchingCubes"
  | "voxelizeMesh"
  | "distanceTransform"
  | "connectedComponents";

export type VolumeJobLifecycle =
  | "queued"
  | "running"
  | "progressive"
  | "complete"
  | "cancelled"
  | "stale"
  | "failed";

export type VolumeJobBackend = "native-worker" | "vtk-worker" | "cpu-fallback";

export type VolumeJobParameters = Readonly<Record<string, number | string | boolean>>;

export type VolumeJobRequest = {
  requestId: string;
  operation: VolumeJobOperation;
  volumeId: string;
  volumeRevision: number;
  sampledGridRevision: number;
  volumeFingerprint: string;
  dependencies: readonly VolumeDependency[];
  algorithmVersion: string;
  backend: VolumeJobBackend;
  dimensions: [number, number, number];
  origin: [number, number, number];
  spacing: [number, number, number];
  scalars: Float32Array;
  parameters: VolumeJobParameters;
  meshPositions?: Float32Array;
  meshIndices?: Uint32Array;
};

export type VolumeJobOutput = {
  values?: Float32Array;
  positions?: Float32Array;
  indices?: Uint32Array;
  normals?: Float32Array;
  labels?: Uint32Array;
  histogram?: Uint32Array;
  dimensions?: [number, number, number];
};

export type VolumeJobProfile = {
  wallTimeMs: number;
  peakWorkingSetBytes: number;
  transferredBytes: number;
  cacheHit: boolean;
  backend: VolumeJobBackend;
};

export type VolumeComputeDiagnostics = {
  lifecycle: VolumeJobLifecycle | "idle";
  operation: VolumeJobOperation | null;
  backend: VolumeJobBackend;
  progress: number;
  memoryPlan: VolumeMemoryPlan;
  cacheEntries: number;
  cacheHits: number;
  lastProfile: VolumeJobProfile | null;
  message: string;
};

export type VolumeJobFailure = {
  code: "CANCELLED" | "TIMEOUT" | "STALE_REVISION" | "MEMORY_LIMIT" | "WORKER_FAILURE" | "UNSUPPORTED_INPUT";
  message: string;
  retryable: boolean;
};

export type VolumeJobArtifact = {
  artifactId: string;
  cacheKey: string;
  state: Extract<VolumeJobLifecycle, "complete" | "cancelled" | "stale" | "failed">;
  operation: VolumeJobOperation;
  volumeId: string;
  volumeRevision: number;
  sampledGridRevision: number;
  output: VolumeJobOutput;
  profile: VolumeJobProfile;
  warnings: string[];
  failure?: VolumeJobFailure;
  createdAt: number;
};

export type VolumeJobProgress = {
  type: "progress";
  requestId: string;
  volumeRevision: number;
  sampledGridRevision: number;
  progress: number;
  phase: string;
};

export type VolumeJobResultMessage = {
  type: "result";
  requestId: string;
  volumeRevision: number;
  sampledGridRevision: number;
  output: VolumeJobOutput;
  wallTimeMs: number;
  peakWorkingSetBytes: number;
  warnings: string[];
};

export type VolumeJobErrorMessage = {
  type: "error";
  requestId: string;
  volumeRevision: number;
  sampledGridRevision: number;
  code: VolumeJobFailure["code"];
  message: string;
  retryable: boolean;
};

export type VolumeWorkerInbound = { type: "run"; request: VolumeJobRequest } | { type: "cancel"; requestId: string };
export type VolumeWorkerOutbound = VolumeJobProgress | VolumeJobResultMessage | VolumeJobErrorMessage;

export type VolumeMemoryPlan = {
  inputBytes: number;
  outputBytes: number;
  transferBytes: number;
  peakWorkingSetBytes: number;
  level: "safe" | "warning" | "rejected";
  message: string;
  brickLayout: VolumeBrickLayout | null;
};

export type VolumeBrickLayout = {
  brickDimensions: [number, number, number];
  brickCount: [number, number, number];
  halo: number;
  order: "x-fastest";
};

export const VOLUME_MEMORY_LIMITS = {
  softBytes: 384 * 1024 * 1024,
  hardBytes: 1024 * 1024 * 1024,
  brickThresholdBytes: 256 * 1024 * 1024,
  defaultTimeoutMs: 45_000,
} as const;

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stable(entry)]));
  }
  return value;
};

const hash = (value: string): string => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
};

export const volumeJobCacheKey = (request: Omit<VolumeJobRequest, "requestId" | "scalars" | "meshPositions" | "meshIndices">): string => {
  const dependencies = [...request.dependencies].sort((left, right) =>
    `${left.module}:${left.objectId}:${left.revision}:${left.relation}`.localeCompare(`${right.module}:${right.objectId}:${right.revision}:${right.relation}`)
  );
  return `volume-job:${hash(JSON.stringify(stable({ ...request, dependencies })))}`;
};

const outputElementFactor = (operation: VolumeJobOperation): number => {
  if (operation === "gradientVolume") return 3;
  if (operation === "marchingCubes") return 9;
  if (operation === "histogram") return 0;
  return 1;
};

export const createVolumeMemoryPlan = (
  operation: VolumeJobOperation,
  dimensions: readonly [number, number, number],
  inputBytes: number,
): VolumeMemoryPlan => {
  const samples = Math.max(0, dimensions[0] * dimensions[1] * dimensions[2]);
  const outputBytes = operation === "histogram" ? 256 * Uint32Array.BYTES_PER_ELEMENT : samples * Float32Array.BYTES_PER_ELEMENT * outputElementFactor(operation);
  const transferBytes = inputBytes + outputBytes;
  const peakWorkingSetBytes = inputBytes + outputBytes + Math.min(inputBytes, 64 * 1024 * 1024);
  const level = peakWorkingSetBytes > VOLUME_MEMORY_LIMITS.hardBytes
    ? "rejected"
    : peakWorkingSetBytes > VOLUME_MEMORY_LIMITS.softBytes
      ? "warning"
      : "safe";
  const brickLayout = peakWorkingSetBytes >= VOLUME_MEMORY_LIMITS.brickThresholdBytes
    ? {
        brickDimensions: [64, 64, 64] as [number, number, number],
        brickCount: dimensions.map((value) => Math.ceil(value / 64)) as [number, number, number],
        halo: operation === "gradientVolume" || operation === "marchingCubes" ? 1 : 0,
        order: "x-fastest" as const,
      }
    : null;
  return {
    inputBytes,
    outputBytes,
    transferBytes,
    peakWorkingSetBytes,
    level,
    message: level === "rejected"
      ? "Projected worker allocation exceeds the hard Volume memory limit."
      : level === "warning"
        ? "Projected worker allocation exceeds the soft Volume memory warning."
        : "Projected worker allocation is within the reviewed Volume memory envelope.",
    brickLayout,
  };
};

const artifactBytes = (artifact: VolumeJobArtifact): number => Object.values(artifact.output).reduce((total, value) => {
  if (ArrayBuffer.isView(value)) return total + value.byteLength;
  return total;
}, 0);

export class VolumeJobCache {
  private readonly entries = new Map<string, VolumeJobArtifact>();
  private bytes = 0;
  readonly maximumBytes: number;
  hits = 0;
  misses = 0;

  constructor(maximumBytes = 256 * 1024 * 1024) {
    this.maximumBytes = maximumBytes;
  }

  get(key: string): VolumeJobArtifact | null {
    const found = this.entries.get(key);
    if (!found) {
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    this.entries.delete(key);
    this.entries.set(key, found);
    return {
      ...found,
      profile: { ...found.profile, cacheHit: true, wallTimeMs: 0, transferredBytes: 0 },
      warnings: [...found.warnings],
    };
  }

  set(key: string, artifact: VolumeJobArtifact): void {
    const previous = this.entries.get(key);
    if (previous) this.bytes -= artifactBytes(previous);
    this.entries.set(key, artifact);
    this.bytes += artifactBytes(artifact);
    while (this.bytes > this.maximumBytes && this.entries.size > 1) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      const removed = this.entries.get(oldest);
      this.entries.delete(oldest);
      if (removed) this.bytes -= artifactBytes(removed);
    }
  }

  clearVolume(volumeId: string): void {
    for (const [key, artifact] of this.entries) {
      if (artifact.volumeId !== volumeId) continue;
      this.entries.delete(key);
      this.bytes -= artifactBytes(artifact);
    }
  }

  summary() {
    return { entries: this.entries.size, byteLength: this.bytes, hits: this.hits, misses: this.misses };
  }
}

const at = (values: Float32Array, dims: readonly [number, number, number], x: number, y: number, z: number) =>
  values[Math.max(0, Math.min(dims[0] - 1, x)) + dims[0] * (Math.max(0, Math.min(dims[1] - 1, y)) + dims[1] * Math.max(0, Math.min(dims[2] - 1, z)))] ?? 0;

const checkpoint = (cancelled: () => boolean): void => {
  if (cancelled()) throw new DOMException("Volume job cancelled.", "AbortError");
};

const resampleNearest = (request: VolumeJobRequest, target: [number, number, number], cancelled: () => boolean): Float32Array => {
  const [sx, sy, sz] = request.dimensions;
  const [tx, ty, tz] = target;
  const output = new Float32Array(tx * ty * tz);
  for (let z = 0; z < tz; z += 1) {
    checkpoint(cancelled);
    const iz = Math.round((z / Math.max(1, tz - 1)) * (sz - 1));
    for (let y = 0; y < ty; y += 1) {
      const iy = Math.round((y / Math.max(1, ty - 1)) * (sy - 1));
      for (let x = 0; x < tx; x += 1) {
        const ix = Math.round((x / Math.max(1, tx - 1)) * (sx - 1));
        output[x + tx * (y + ty * z)] = at(request.scalars, request.dimensions, ix, iy, iz);
      }
    }
  }
  return output;
};

const computeConnectedComponents = (request: VolumeJobRequest, cancelled: () => boolean): { labels: Uint32Array; count: number } => {
  const [nx, ny, nz] = request.dimensions;
  const threshold = Number(request.parameters.threshold ?? 0);
  const labels = new Uint32Array(request.scalars.length);
  const queue = new Uint32Array(request.scalars.length);
  let count = 0;
  const neighbors = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]] as const;
  for (let seed = 0; seed < request.scalars.length; seed += 1) {
    if ((request.scalars[seed] ?? 0) < threshold || labels[seed] !== 0) continue;
    checkpoint(cancelled);
    count += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    labels[seed] = count;
    while (head < tail) {
      const current = queue[head++];
      const z = Math.floor(current / (nx * ny));
      const rest = current - z * nx * ny;
      const y = Math.floor(rest / nx);
      const x = rest - y * nx;
      for (const [dx, dy, dz] of neighbors) {
        const xx = x + dx; const yy = y + dy; const zz = z + dz;
        if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
        const next = xx + nx * (yy + ny * zz);
        if (labels[next] !== 0 || (request.scalars[next] ?? 0) < threshold) continue;
        labels[next] = count;
        queue[tail++] = next;
      }
    }
  }
  return { labels, count };
};

export const executeVolumeJobRequest = async (
  request: VolumeJobRequest,
  progress: (message: VolumeJobProgress) => void = () => undefined,
  cancelled: () => boolean = () => false,
): Promise<VolumeJobResultMessage> => {
  const startedAt = performance.now();
  const plan = createVolumeMemoryPlan(request.operation, request.dimensions, request.scalars.byteLength);
  if (plan.level === "rejected") throw new Error(plan.message);
  checkpoint(cancelled);
  progress({ type: "progress", requestId: request.requestId, volumeRevision: request.volumeRevision, sampledGridRevision: request.sampledGridRevision, progress: 0.05, phase: "validated" });
  let output: VolumeJobOutput;

  if (request.operation === "sampleField") {
    output = { values: new Float32Array(request.scalars), dimensions: [...request.dimensions] };
  } else if (request.operation === "sliceVolume") {
    const axis = String(request.parameters.axis ?? "z") as "x" | "y" | "z";
    const dim = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    const sliceIndex = Math.max(0, Math.min(request.dimensions[dim] - 1, Math.round(Number(request.parameters.index ?? 0))));
    const width = axis === "x" ? request.dimensions[1] : request.dimensions[0];
    const height = axis === "z" ? request.dimensions[1] : request.dimensions[2];
    const values = new Float32Array(width * height);
    for (let v = 0; v < height; v += 1) for (let u = 0; u < width; u += 1) {
      const x = axis === "x" ? sliceIndex : u;
      const y = axis === "y" ? sliceIndex : axis === "x" ? u : v;
      const z = axis === "z" ? sliceIndex : v;
      values[u + width * v] = at(request.scalars, request.dimensions, x, y, z);
    }
    output = { values, dimensions: [width, height, 1] };
  } else if (request.operation === "resampleVolume") {
    const target = ["x", "y", "z"].map((axis, index) => Math.max(2, Math.round(Number(request.parameters[`n${axis}`] ?? request.dimensions[index])))) as [number, number, number];
    output = { values: resampleNearest(request, target, cancelled), dimensions: target };
  } else if (request.operation === "histogram") {
    const bins = Math.max(2, Math.min(4096, Math.round(Number(request.parameters.bins ?? 256))));
    const histogram = new Uint32Array(bins);
    let min = Infinity; let max = -Infinity;
    for (const value of request.scalars) if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value); }
    const scale = max > min ? (bins - 1) / (max - min) : 0;
    for (const value of request.scalars) if (Number.isFinite(value)) histogram[Math.max(0, Math.min(bins - 1, Math.round((value - min) * scale)))] += 1;
    output = { histogram };
  } else if (request.operation === "gradientVolume") {
    const [nx, ny, nz] = request.dimensions;
    const values = new Float32Array(request.scalars.length * 3);
    for (let z = 0; z < nz; z += 1) {
      checkpoint(cancelled);
      for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) {
        const index = x + nx * (y + ny * z);
        values[index * 3] = (at(request.scalars, request.dimensions, x + 1, y, z) - at(request.scalars, request.dimensions, x - 1, y, z)) / (2 * request.spacing[0]);
        values[index * 3 + 1] = (at(request.scalars, request.dimensions, x, y + 1, z) - at(request.scalars, request.dimensions, x, y - 1, z)) / (2 * request.spacing[1]);
        values[index * 3 + 2] = (at(request.scalars, request.dimensions, x, y, z + 1) - at(request.scalars, request.dimensions, x, y, z - 1)) / (2 * request.spacing[2]);
      }
    }
    output = { values, dimensions: [...request.dimensions] };
  } else if (request.operation === "marchingCubes") {
    const grid: VolumeGrid = { dims: request.dimensions, origin: request.origin, spacing: request.spacing, scalars: request.scalars };
    const mesh = marchingCubesVolume(grid, Number(request.parameters.isoValue ?? 0));
    output = mesh ? { positions: mesh.positions, indices: mesh.indices } : { positions: new Float32Array(), indices: new Uint32Array() };
  } else if (request.operation === "voxelizeMesh") {
    if (!request.meshPositions?.length) throw new Error("voxelizeMesh requires mesh positions.");
    const values = new Float32Array(request.scalars.length);
    for (let index = 0; index < request.meshPositions.length; index += 3) {
      const x = Math.round((request.meshPositions[index] - request.origin[0]) / request.spacing[0]);
      const y = Math.round((request.meshPositions[index + 1] - request.origin[1]) / request.spacing[1]);
      const z = Math.round((request.meshPositions[index + 2] - request.origin[2]) / request.spacing[2]);
      if (x >= 0 && y >= 0 && z >= 0 && x < request.dimensions[0] && y < request.dimensions[1] && z < request.dimensions[2]) values[x + request.dimensions[0] * (y + request.dimensions[1] * z)] = 1;
    }
    output = { values, dimensions: [...request.dimensions] };
  } else if (request.operation === "distanceTransform") {
    const values = new Float32Array(request.scalars.length);
    const threshold = Number(request.parameters.threshold ?? 0);
    const occupied: number[] = [];
    for (let index = 0; index < request.scalars.length; index += 1) if ((request.scalars[index] ?? 0) >= threshold) occupied.push(index);
    if (!occupied.length) values.fill(Number.POSITIVE_INFINITY);
    else {
      const [nx, ny] = request.dimensions;
      for (let index = 0; index < values.length; index += 1) {
        if ((index & 4095) === 0) checkpoint(cancelled);
        const z = Math.floor(index / (nx * ny)); const rest = index - z * nx * ny; const y = Math.floor(rest / nx); const x = rest - y * nx;
        let best = Infinity;
        for (const candidate of occupied) {
          const cz = Math.floor(candidate / (nx * ny)); const crest = candidate - cz * nx * ny; const cy = Math.floor(crest / nx); const cx = crest - cy * nx;
          best = Math.min(best, Math.hypot((x - cx) * request.spacing[0], (y - cy) * request.spacing[1], (z - cz) * request.spacing[2]));
        }
        values[index] = best;
      }
    }
    output = { values, dimensions: [...request.dimensions] };
  } else {
    const components = computeConnectedComponents(request, cancelled);
    output = { labels: components.labels, dimensions: [...request.dimensions], values: Float32Array.of(components.count) };
  }

  checkpoint(cancelled);
  progress({ type: "progress", requestId: request.requestId, volumeRevision: request.volumeRevision, sampledGridRevision: request.sampledGridRevision, progress: 1, phase: "complete" });
  return {
    type: "result",
    requestId: request.requestId,
    volumeRevision: request.volumeRevision,
    sampledGridRevision: request.sampledGridRevision,
    output,
    wallTimeMs: performance.now() - startedAt,
    peakWorkingSetBytes: plan.peakWorkingSetBytes,
    warnings: plan.level === "warning" ? [plan.message] : [],
  };
};

export const createVolumeJobRequest = (args: {
  requestId: string;
  operation: VolumeJobOperation;
  volume: VolumeObject;
  grid: VolumeGrid;
  parameters?: VolumeJobParameters;
  backend?: VolumeJobBackend;
  algorithmVersion?: string;
  meshPositions?: Float32Array;
  meshIndices?: Uint32Array;
}): VolumeJobRequest => ({
  requestId: args.requestId,
  operation: args.operation,
  volumeId: args.volume.identity.volumeId,
  volumeRevision: args.volume.identity.volumeRevision,
  sampledGridRevision: args.volume.identity.sampledGridRevision,
  volumeFingerprint: args.volume.provenance.sampledGridFingerprint,
  dependencies: args.volume.provenance.dependencies,
  algorithmVersion: args.algorithmVersion ?? "math3d-volume-worker-v1",
  backend: args.backend ?? "native-worker",
  dimensions: [...args.grid.dims],
  origin: [...(args.grid.origin ?? [0, 0, 0])],
  spacing: [...(args.grid.spacing ?? [1, 1, 1])],
  scalars: args.grid.scalars,
  parameters: args.parameters ?? {},
  meshPositions: args.meshPositions,
  meshIndices: args.meshIndices,
});

export const profileVolumeAllocation = (dimension: 128 | 256, operation: VolumeJobOperation = "marchingCubes") => {
  const samples = dimension ** 3;
  const plan = createVolumeMemoryPlan(operation, [dimension, dimension, dimension], samples * Float32Array.BYTES_PER_ELEMENT);
  return { dimension, operation, wallTimeMs: 0, peakWorkingSetBytes: plan.peakWorkingSetBytes, transferredBytes: plan.transferBytes, cacheBehavior: "cold-plan", memoryLevel: plan.level };
};
