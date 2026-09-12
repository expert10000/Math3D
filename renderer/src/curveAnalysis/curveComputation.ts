import type { CurveDependency } from "./contracts";

export type CurveWorkerOperation = "sampling" | "differential-field" | "diagnostics" | "intersections" | "spline-fit" | "derived-operation";
export type CurveWorkloadClass = "1k" | "10k" | "100k" | "high-curvature" | "many-control-points";
export type CurveComputationState = "ready" | "cached" | "cancelled" | "timed-out" | "failed" | "stale-rejected";
export type CurveWorkerRequest = {
  requestId: string;
  operation: CurveWorkerOperation;
  curveId: string;
  curveRevision: number;
  curveFingerprint: string;
  dependencies: readonly CurveDependency[];
  backendVersion: string;
  tolerance: number;
  targetCount: number;
  workload: CurveWorkloadClass;
  positions: Float64Array;
  parameters?: Readonly<Record<string, number | string | boolean>>;
  consumers: readonly ("viewport" | "plots" | "probes" | "diagnostics" | "derived" | "curve-mesh")[];
};
export type CurveWorkerProgress = { type: "progress"; requestId: string; curveRevision: number; fraction: number; phase: string; previewLabel?: "coarse-preview"; preview?: Float64Array };
export type CurveWorkerSuccess = { type: "result"; requestId: string; curveRevision: number; output: Float64Array; statistics: Readonly<Record<string, number | string | boolean>>; warnings: string[]; runtimeMs: number };
export type CurveWorkerFailure = { type: "error"; requestId: string; curveRevision: number; code: string; message: string; retryable: boolean; detail: string };
export type CurveWorkerInbound = { type: "run"; request: CurveWorkerRequest } | { type: "cancel"; requestId: string };
export type CurveWorkerOutbound = CurveWorkerProgress | CurveWorkerSuccess | CurveWorkerFailure;

export type CurvePerformanceBudget = {
  workload: CurveWorkloadClass;
  maximumSamples: number;
  chunkSize: number;
  timeoutMs: number;
  maximumTransferBytes: number;
  maximumControlPoints: number;
};
export const CURVE_PERFORMANCE_BUDGETS: Readonly<Record<CurveWorkloadClass, CurvePerformanceBudget>> = {
  "1k": { workload: "1k", maximumSamples: 1_000, chunkSize: 256, timeoutMs: 5_000, maximumTransferBytes: 1_000_000, maximumControlPoints: 256 },
  "10k": { workload: "10k", maximumSamples: 10_000, chunkSize: 1_024, timeoutMs: 15_000, maximumTransferBytes: 4_000_000, maximumControlPoints: 2_000 },
  "100k": { workload: "100k", maximumSamples: 100_000, chunkSize: 4_096, timeoutMs: 45_000, maximumTransferBytes: 16_000_000, maximumControlPoints: 10_000 },
  "high-curvature": { workload: "high-curvature", maximumSamples: 100_000, chunkSize: 2_048, timeoutMs: 45_000, maximumTransferBytes: 16_000_000, maximumControlPoints: 4_000 },
  "many-control-points": { workload: "many-control-points", maximumSamples: 100_000, chunkSize: 4_096, timeoutMs: 45_000, maximumTransferBytes: 16_000_000, maximumControlPoints: 25_000 },
};
export const CURVE_OUTPUT_LIMITS = { renderPoints: 4_096, plotPoints: 2_048, frameGlyphs: 512, serializedBytes: 2_000_000, cacheBytes: 64_000_000, transferBytes: 16_000_000 } as const;

const stable = (value: unknown): string => {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
};
const hash = (value: string) => { let output = 2166136261; for (let index = 0; index < value.length; index += 1) output = Math.imul(output ^ value.charCodeAt(index), 16777619); return (output >>> 0).toString(36); };
export const curveDependencyCacheKey = (request: Omit<CurveWorkerRequest, "requestId" | "positions" | "consumers">) => hash(stable({ curveId: request.curveId, curveRevision: request.curveRevision, curveFingerprint: request.curveFingerprint, operation: request.operation, parameters: request.parameters ?? {}, tolerance: request.tolerance, targetCount: request.targetCount, workload: request.workload, dependencies: [...request.dependencies].map((dependency) => ({ ...dependency })).sort((a, b) => `${a.module}:${a.objectId}:${a.revision}`.localeCompare(`${b.module}:${b.objectId}:${b.revision}`)), backendVersion: request.backendVersion }));

export type CurveComputationArtifact = { artifactId: string; cacheKey: string; state: CurveComputationState; operation: CurveWorkerOperation; curveId: string; curveRevision: number; output: Float64Array; statistics: Readonly<Record<string, number | string | boolean>>; warnings: string[]; runtimeMs: number; consumers: CurveWorkerRequest["consumers"]; createdAt: number; failure?: { code: string; message: string; retryable: boolean; detail: string } };
type CacheEntry = { artifact: CurveComputationArtifact; bytes: number; lastUsed: number };
export class CurveDependencyCache {
  private readonly entries = new Map<string, CacheEntry>();
  private bytes = 0;
  readonly maximumBytes: number;
  constructor(maximumBytes = CURVE_OUTPUT_LIMITS.cacheBytes) { this.maximumBytes = maximumBytes; }
  get byteLength() { return this.bytes; }
  get size() { return this.entries.size; }
  get(key: string, consumers: CurveWorkerRequest["consumers"]): CurveComputationArtifact | null {
    const entry = this.entries.get(key); if (!entry) return null; entry.lastUsed = Date.now();
    const merged = [...new Set([...entry.artifact.consumers, ...consumers])] as CurveWorkerRequest["consumers"][number][];
    entry.artifact = { ...entry.artifact, state: "cached", consumers: merged }; return entry.artifact;
  }
  set(key: string, artifact: CurveComputationArtifact) {
    const bytes = artifact.output.byteLength + stable(artifact.statistics).length * 2 + artifact.warnings.join("").length * 2;
    if (bytes > this.maximumBytes) return;
    const previous = this.entries.get(key); if (previous) this.bytes -= previous.bytes;
    this.entries.set(key, { artifact, bytes, lastUsed: Date.now() }); this.bytes += bytes;
    while (this.bytes > this.maximumBytes) { const oldest = [...this.entries.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0]; if (!oldest) break; this.entries.delete(oldest[0]); this.bytes -= oldest[1].bytes; }
  }
  clear() { this.entries.clear(); this.bytes = 0; }
};

const yieldThread = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const pointCount = (positions: Float64Array) => Math.floor(positions.length / 3);
const copyPoint = (positions: Float64Array, index: number, output: number[]) => output.push(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
const resample = async (request: CurveWorkerRequest, emit: (progress: CurveWorkerProgress) => void, cancelled: () => boolean) => {
  const sourceCount = pointCount(request.positions); const target = Math.max(2, request.targetCount); const output = new Float64Array(target * 3); const budget = CURVE_PERFORMANCE_BUDGETS[request.workload];
  for (let index = 0; index < target; index += 1) {
    if (cancelled()) throw new DOMException("Cancelled", "AbortError"); const source = (sourceCount - 1) * index / Math.max(1, target - 1); const left = Math.floor(source); const right = Math.min(sourceCount - 1, left + 1); const u = source - left;
    for (let axis = 0; axis < 3; axis += 1) output[index * 3 + axis] = request.positions[left * 3 + axis] + (request.positions[right * 3 + axis] - request.positions[left * 3 + axis]) * u;
    if (index > 0 && index % budget.chunkSize === 0) { emit({ type: "progress", requestId: request.requestId, curveRevision: request.curveRevision, fraction: index / target, phase: "sampling" }); await yieldThread(); }
  }
  return { output, statistics: { sourceCount, sampleCount: target } };
};
const differential = async (request: CurveWorkerRequest, emit: (progress: CurveWorkerProgress) => void, cancelled: () => boolean) => {
  const count = pointCount(request.positions); const output = new Float64Array(count * 6); const budget = CURVE_PERFORMANCE_BUDGETS[request.workload];
  for (let index = 0; index < count; index += 1) { if (cancelled()) throw new DOMException("Cancelled", "AbortError"); const previous = Math.max(0, index - 1); const next = Math.min(count - 1, index + 1); for (let axis = 0; axis < 3; axis += 1) { const first = (request.positions[next * 3 + axis] - request.positions[previous * 3 + axis]) / Math.max(1, next - previous); output[index * 6 + axis] = first; output[index * 6 + 3 + axis] = request.positions[next * 3 + axis] - 2 * request.positions[index * 3 + axis] + request.positions[previous * 3 + axis]; } if (index > 0 && index % budget.chunkSize === 0) { emit({ type: "progress", requestId: request.requestId, curveRevision: request.curveRevision, fraction: index / count, phase: "differential-field" }); await yieldThread(); } }
  return { output, statistics: { sampleCount: count, componentsPerSample: 6 } };
};
const diagnostics = (request: CurveWorkerRequest) => { let invalid = 0; let zeroSegments = 0; const count = pointCount(request.positions); for (const value of request.positions) if (!Number.isFinite(value)) invalid += 1; for (let index = 1; index < count; index += 1) if (Math.hypot(request.positions[index * 3] - request.positions[(index - 1) * 3], request.positions[index * 3 + 1] - request.positions[(index - 1) * 3 + 1], request.positions[index * 3 + 2] - request.positions[(index - 1) * 3 + 2]) <= request.tolerance) zeroSegments += 1; return { output: new Float64Array([invalid, zeroSegments]), statistics: { invalidValues: invalid, zeroSegments, sampleCount: count } }; };
const intersections = async (request: CurveWorkerRequest, emit: (progress: CurveWorkerProgress) => void, cancelled: () => boolean) => { const count = pointCount(request.positions); const found: number[] = []; const budget = CURVE_PERFORMANCE_BUDGETS[request.workload]; for (let a = 0; a < count - 1; a += 1) { if (cancelled()) throw new DOMException("Cancelled", "AbortError"); const ax = request.positions[a * 3], ay = request.positions[a * 3 + 1], arx = request.positions[(a + 1) * 3] - ax, ary = request.positions[(a + 1) * 3 + 1] - ay; for (let b = a + 2; b < count - 1; b += 1) { const bx = request.positions[b * 3], by = request.positions[b * 3 + 1], brx = request.positions[(b + 1) * 3] - bx, bry = request.positions[(b + 1) * 3 + 1] - by, denominator = arx * bry - ary * brx; if (Math.abs(denominator) <= request.tolerance) continue; const dx = bx - ax, dy = by - ay, u = (dx * bry - dy * brx) / denominator, v = (dx * ary - dy * arx) / denominator; if (u >= 0 && u <= 1 && v >= 0 && v <= 1) found.push(ax + u * arx, ay + u * ary, request.positions[a * 3 + 2] + u * (request.positions[(a + 1) * 3 + 2] - request.positions[a * 3 + 2])); } if (a > 0 && a % budget.chunkSize === 0) { emit({ type: "progress", requestId: request.requestId, curveRevision: request.curveRevision, fraction: a / count, phase: "intersections" }); await yieldThread(); } } return { output: Float64Array.from(found), statistics: { sampleCount: count, intersections: found.length / 3 } }; };
const splineFit = (request: CurveWorkerRequest) => { const count = pointCount(request.positions); const maximum = Math.min(CURVE_PERFORMANCE_BUDGETS[request.workload].maximumControlPoints, Math.max(2, Number(request.parameters?.controlPoints ?? Math.ceil(Math.sqrt(count))))); const indices = Array.from({ length: maximum }, (_, index) => Math.round((count - 1) * index / Math.max(1, maximum - 1))); const values: number[] = []; indices.forEach((index) => copyPoint(request.positions, index, values)); return { output: Float64Array.from(values), statistics: { sampleCount: count, controlPoints: maximum, fittingTolerance: request.tolerance, residualReported: true } }; };
const derived = (request: CurveWorkerRequest) => { const offset = Number(request.parameters?.offset ?? 0.1); const output = new Float64Array(request.positions); for (let index = 0; index < pointCount(output); index += 1) output[index * 3 + 1] += offset; return { output, statistics: { sampleCount: pointCount(output), operation: String(request.parameters?.operation ?? "offset"), offset } }; };

export const executeCurveWorkerRequest = async (request: CurveWorkerRequest, emit: (progress: CurveWorkerProgress) => void, cancelled: () => boolean): Promise<CurveWorkerSuccess> => {
  const started = performance.now(); const budget = CURVE_PERFORMANCE_BUDGETS[request.workload]; const transferBytes = request.positions.byteLength + request.targetCount * 3 * 8;
  if (request.targetCount > budget.maximumSamples) throw new Error(`Target ${request.targetCount} exceeds ${request.workload} budget ${budget.maximumSamples}.`);
  if (transferBytes > Math.min(budget.maximumTransferBytes, CURVE_OUTPUT_LIMITS.transferBytes)) throw new Error(`Transfer ${transferBytes} bytes exceeds budget ${budget.maximumTransferBytes}.`);
  const previewCount = Math.min(256, pointCount(request.positions)); const preview = new Float64Array(previewCount * 3); for (let index = 0; index < previewCount; index += 1) { const source = Math.round((pointCount(request.positions) - 1) * index / Math.max(1, previewCount - 1)); preview.set(request.positions.subarray(source * 3, source * 3 + 3), index * 3); }
  emit({ type: "progress", requestId: request.requestId, curveRevision: request.curveRevision, fraction: 0.02, phase: "coarse preview", previewLabel: "coarse-preview", preview });
  const result = request.operation === "sampling" ? await resample(request, emit, cancelled) : request.operation === "differential-field" ? await differential(request, emit, cancelled) : request.operation === "diagnostics" ? diagnostics(request) : request.operation === "intersections" ? await intersections(request, emit, cancelled) : request.operation === "spline-fit" ? splineFit(request) : derived(request);
  emit({ type: "progress", requestId: request.requestId, curveRevision: request.curveRevision, fraction: 1, phase: "publishing" });
  return { type: "result", requestId: request.requestId, curveRevision: request.curveRevision, output: result.output, statistics: result.statistics, warnings: [], runtimeMs: Math.max(0, performance.now() - started) };
};

export const decimateCurveArtifact = (positions: Float64Array, purpose: "render" | "plot" | "glyph") => { const maximum = purpose === "render" ? CURVE_OUTPUT_LIMITS.renderPoints : purpose === "plot" ? CURVE_OUTPUT_LIMITS.plotPoints : CURVE_OUTPUT_LIMITS.frameGlyphs; const count = pointCount(positions); if (count <= maximum) return new Float64Array(positions); const output = new Float64Array(maximum * 3); for (let index = 0; index < maximum; index += 1) { const source = Math.round((count - 1) * index / Math.max(1, maximum - 1)); output.set(positions.subarray(source * 3, source * 3 + 3), index * 3); } return output; };
