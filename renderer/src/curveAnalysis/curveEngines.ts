import type { CanonicalCurveDefinition } from "./contracts";

export type CurveEngineId = "math3d-native" | "vtk" | "cgal";
export type CurveEngineOperation =
  | "analytical-evaluation"
  | "resample"
  | "smooth"
  | "spline-filter"
  | "tube"
  | "ribbon"
  | "visualization-dataset"
  | "robust-2d-intersections"
  | "polyline-simplify"
  | "arrangement"
  | "project-intersect"
  | "feature-polyline";

export type CurveEnginePoint = { x: number; y: number; z: number };
export type CurveEngineAvailability = {
  engine: CurveEngineId;
  available: boolean;
  version: string;
  detail: string;
};
export type CurveEngineCapability = {
  operation: CurveEngineOperation;
  engines: readonly CurveEngineId[];
  nativeFallback: boolean;
  exactAuthority: boolean;
};
export type CurveEngineRequest = {
  requestId: string;
  operation: CurveEngineOperation;
  definition: CanonicalCurveDefinition;
  points: readonly CurveEnginePoint[];
  parameters?: Readonly<Record<string, number | string | boolean>>;
  tolerance: number;
  preferredEngine?: CurveEngineId | "auto";
  explicitBackendComparison?: boolean;
};
export type CurveEngineRawResult = {
  points: CurveEnginePoint[];
  sourceIndices?: Uint32Array;
  warnings?: string[];
};
export type CurveEngineAdapter = {
  id: CurveEngineId;
  availability: () => CurveEngineAvailability;
  capabilities: ReadonlySet<CurveEngineOperation>;
  execute: (request: CurveEngineRequest) => Promise<CurveEngineRawResult>;
};
export type CurveEngineExecution = {
  requestId: string;
  state: "success" | "fallback" | "unavailable" | "unsupported" | "failed";
  backend: CurveEngineId;
  backendVersion: string;
  requestedBackend: CurveEngineId | "auto";
  operation: CurveEngineOperation;
  inputCount: number;
  outputCount: number;
  tolerance: number;
  runtimeMs: number;
  warnings: string[];
  fallback: { used: boolean; reason: string | null };
  validation: { finite: boolean; sourceMapping: "complete" | "partial" | "unavailable"; maximumParityDeviation: number | null; parityWithinTolerance: boolean | null };
  provenance: { curveId: string; curveRevision: number; dependencyFingerprint: string; correspondence: string };
  points: CurveEnginePoint[];
  sourceIndices: Uint32Array;
};

export const CURVE_ENGINE_CAPABILITIES: readonly CurveEngineCapability[] = [
  { operation: "analytical-evaluation", engines: ["math3d-native"], nativeFallback: true, exactAuthority: true },
  { operation: "resample", engines: ["math3d-native", "vtk"], nativeFallback: true, exactAuthority: false },
  { operation: "smooth", engines: ["math3d-native", "vtk"], nativeFallback: true, exactAuthority: false },
  { operation: "spline-filter", engines: ["vtk"], nativeFallback: false, exactAuthority: false },
  { operation: "tube", engines: ["vtk"], nativeFallback: false, exactAuthority: false },
  { operation: "ribbon", engines: ["vtk"], nativeFallback: false, exactAuthority: false },
  { operation: "visualization-dataset", engines: ["vtk"], nativeFallback: false, exactAuthority: false },
  { operation: "robust-2d-intersections", engines: ["math3d-native", "cgal"], nativeFallback: true, exactAuthority: false },
  { operation: "polyline-simplify", engines: ["math3d-native", "cgal"], nativeFallback: true, exactAuthority: false },
  { operation: "arrangement", engines: ["cgal"], nativeFallback: false, exactAuthority: false },
  { operation: "project-intersect", engines: ["cgal"], nativeFallback: false, exactAuthority: false },
  { operation: "feature-polyline", engines: ["cgal"], nativeFallback: false, exactAuthority: false },
];

const dependencyFingerprint = (definition: CanonicalCurveDefinition) => {
  const value = JSON.stringify({ curve: definition.identity.curveId, revision: definition.identity.curveRevision, fingerprint: definition.fingerprint, dependencies: definition.dependencies });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
};
const distance = (a: CurveEnginePoint, b: CurveEnginePoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const interpolate = (a: CurveEnginePoint, b: CurveEnginePoint, u: number): CurveEnginePoint => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u });

const resamplePolyline = (points: readonly CurveEnginePoint[], count: number): CurveEngineRawResult => {
  if (points.length < 2) return { points: points.map((point) => ({ ...point })), sourceIndices: Uint32Array.from(points.map((_, index) => index)) };
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) cumulative.push(cumulative[index - 1] + distance(points[index - 1], points[index]));
  const total = cumulative.at(-1) ?? 0;
  const output: CurveEnginePoint[] = []; const mapping: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const target = total * index / Math.max(1, count - 1);
    let segment = 0; while (segment + 1 < cumulative.length - 1 && cumulative[segment + 1] < target) segment += 1;
    const span = cumulative[segment + 1] - cumulative[segment]; const u = span > 0 ? (target - cumulative[segment]) / span : 0;
    output.push(interpolate(points[segment], points[Math.min(points.length - 1, segment + 1)], u)); mapping.push(u < 0.5 ? segment : Math.min(points.length - 1, segment + 1));
  }
  return { points: output, sourceIndices: Uint32Array.from(mapping) };
};
const smoothPolyline = (points: readonly CurveEnginePoint[], iterations: number): CurveEngineRawResult => {
  let output = points.map((point) => ({ ...point }));
  for (let iteration = 0; iteration < iterations; iteration += 1) output = output.map((point, index) => index === 0 || index === output.length - 1 ? point : ({ x: (output[index - 1].x + 2 * point.x + output[index + 1].x) / 4, y: (output[index - 1].y + 2 * point.y + output[index + 1].y) / 4, z: (output[index - 1].z + 2 * point.z + output[index + 1].z) / 4 }));
  return { points: output, sourceIndices: Uint32Array.from(output.map((_, index) => index)) };
};
const pointLineDistance = (point: CurveEnginePoint, a: CurveEnginePoint, b: CurveEnginePoint) => {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }; const length2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  const u = length2 ? Math.max(0, Math.min(1, ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y + (point.z - a.z) * ab.z) / length2)) : 0;
  return distance(point, interpolate(a, b, u));
};
const simplifyIndices = (points: readonly CurveEnginePoint[], tolerance: number, offset = 0): number[] => {
  if (points.length <= 2) return points.map((_, index) => offset + index);
  let split = -1; let maximum = -1;
  for (let index = 1; index < points.length - 1; index += 1) { const error = pointLineDistance(points[index], points[0], points.at(-1)!); if (error > maximum) { maximum = error; split = index; } }
  if (maximum <= tolerance) return [offset, offset + points.length - 1];
  return [...simplifyIndices(points.slice(0, split + 1), tolerance, offset).slice(0, -1), ...simplifyIndices(points.slice(split), tolerance, offset + split)];
};
const polylineIntersections2D = (points: readonly CurveEnginePoint[], tolerance: number): CurveEngineRawResult => {
  const output: CurveEnginePoint[] = []; const mapping: number[] = [];
  for (let a = 0; a < points.length - 1; a += 1) for (let b = a + 2; b < points.length - 1; b += 1) {
    if (b === a + 1) continue;
    const p = points[a]; const r = { x: points[a + 1].x - p.x, y: points[a + 1].y - p.y }; const q = points[b]; const s = { x: points[b + 1].x - q.x, y: points[b + 1].y - q.y };
    const denominator = r.x * s.y - r.y * s.x; if (Math.abs(denominator) <= tolerance) continue;
    const qp = { x: q.x - p.x, y: q.y - p.y }; const u = (qp.x * s.y - qp.y * s.x) / denominator; const v = (qp.x * r.y - qp.y * r.x) / denominator;
    if (u >= -tolerance && u <= 1 + tolerance && v >= -tolerance && v <= 1 + tolerance) { output.push({ x: p.x + u * r.x, y: p.y + u * r.y, z: p.z + u * (points[a + 1].z - p.z) }); mapping.push(a); }
  }
  return { points: output, sourceIndices: Uint32Array.from(mapping) };
};

const nativeCapabilities = new Set<CurveEngineOperation>(CURVE_ENGINE_CAPABILITIES.filter((capability) => capability.engines.includes("math3d-native")).map((capability) => capability.operation));
export const createNativeCurveEngine = (): CurveEngineAdapter => ({
  id: "math3d-native", availability: () => ({ engine: "math3d-native", available: true, version: "curve-core-v1", detail: "Authoritative analytical Curve Core" }), capabilities: nativeCapabilities,
  execute: async (request) => {
    if (request.operation === "analytical-evaluation") return { points: request.points.map((point) => ({ ...point })), sourceIndices: Uint32Array.from(request.points.map((_, index) => index)) };
    if (request.operation === "resample") return resamplePolyline(request.points, Math.max(2, Math.round(Number(request.parameters?.sampleCount ?? request.points.length))));
    if (request.operation === "smooth") return smoothPolyline(request.points, Math.max(1, Math.round(Number(request.parameters?.iterations ?? 1))));
    if (request.operation === "polyline-simplify") { const indices = simplifyIndices(request.points, request.tolerance); return { points: indices.map((index) => ({ ...request.points[index] })), sourceIndices: Uint32Array.from(indices) }; }
    if (request.operation === "robust-2d-intersections") return polylineIntersections2D(request.points, request.tolerance);
    throw new Error(`Math3D native Curve Core does not support ${request.operation}.`);
  },
});

export const createOptionalCurveEngine = (id: "vtk" | "cgal", options?: { available?: boolean; version?: string; execute?: CurveEngineAdapter["execute"] }): CurveEngineAdapter => {
  const capabilities = new Set<CurveEngineOperation>(CURVE_ENGINE_CAPABILITIES.filter((entry) => entry.engines.includes(id)).map((entry) => entry.operation));
  return { id, capabilities, availability: () => ({ engine: id, available: options?.available ?? false, version: options?.version ?? "not-installed", detail: options?.available ? `${id.toUpperCase()} Curve adapter ready` : `${id.toUpperCase()} Curve adapter unavailable; native Curve workflows remain available.` }), execute: options?.execute ?? (async () => { throw new Error(`${id.toUpperCase()} Curve adapter is unavailable.`); }) };
};

export class CurveEngineRegistry {
  private readonly engines = new Map<CurveEngineId, CurveEngineAdapter>();
  constructor(adapters: readonly CurveEngineAdapter[] = [createNativeCurveEngine(), createOptionalCurveEngine("vtk"), createOptionalCurveEngine("cgal")]) { adapters.forEach((adapter) => this.engines.set(adapter.id, adapter)); }
  listAvailability() { return (["math3d-native", "vtk", "cgal"] as const).map((id) => this.engines.get(id)?.availability() ?? { engine: id, available: false, version: "missing", detail: `${id} adapter is not registered.` }); }
  capability(operation: CurveEngineOperation) { return CURVE_ENGINE_CAPABILITIES.find((entry) => entry.operation === operation)!; }
  async execute(request: CurveEngineRequest): Promise<CurveEngineExecution> {
    const started = performance.now(); const requested = request.preferredEngine ?? "auto"; const capability = this.capability(request.operation);
    let target: CurveEngineId = requested === "auto" ? (capability.exactAuthority || capability.nativeFallback ? "math3d-native" : capability.engines.find((engine) => this.engines.get(engine)?.availability().available) ?? capability.engines[0]) : requested;
    const warnings: string[] = []; let fallbackReason: string | null = null;
    if (capability.exactAuthority && !request.explicitBackendComparison) { target = "math3d-native"; if (requested !== "auto" && requested !== target) warnings.push("Exact/analytic evaluation remains authoritative in the Math3D Curve Core."); }
    let adapter = this.engines.get(target); let unavailableState: "unavailable" | "unsupported" = "unavailable";
    if (!adapter?.capabilities.has(request.operation)) { fallbackReason = `${target} does not advertise ${request.operation}.`; unavailableState = "unsupported"; }
    else if (!adapter.availability().available) fallbackReason = adapter.availability().detail;
    if (fallbackReason && capability.nativeFallback && target !== "math3d-native") { adapter = this.engines.get("math3d-native"); target = "math3d-native"; warnings.push(`${fallbackReason} Used deterministic Math3D native fallback.`); }
    if (!adapter || !adapter.capabilities.has(request.operation) || !adapter.availability().available) return this.finish(request, target, adapter?.availability().version ?? "missing", unavailableState, started, { points: [] }, warnings, fallbackReason);
    try {
      const raw = await adapter.execute(request); const state = fallbackReason ? "fallback" : "success";
      return this.finish(request, target, adapter.availability().version, state, started, raw, [...warnings, ...(raw.warnings ?? [])], fallbackReason);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (target !== "math3d-native" && capability.nativeFallback) {
        const native = this.engines.get("math3d-native")!; const raw = await native.execute(request);
        return this.finish(request, "math3d-native", native.availability().version, "fallback", started, raw, [...warnings, `${target.toUpperCase()} failed: ${reason}. Used deterministic Math3D native fallback.`], reason);
      }
      return this.finish(request, target, adapter.availability().version, "failed", started, { points: [] }, [...warnings, reason], reason);
    }
  }
  private finish(request: CurveEngineRequest, backend: CurveEngineId, version: string, state: CurveEngineExecution["state"], started: number, raw: CurveEngineRawResult, warnings: string[], fallbackReason: string | null): CurveEngineExecution {
    const sourceIndices = raw.sourceIndices ?? new Uint32Array(); const finite = raw.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z));
    const comparable = raw.points.length === request.points.length; const maximumParityDeviation = comparable ? raw.points.reduce((maximum, point, index) => Math.max(maximum, distance(point, request.points[index])), 0) : null;
    const sourceMapping = raw.points.length === 0 ? "unavailable" : sourceIndices.length === raw.points.length ? "complete" : sourceIndices.length ? "partial" : "unavailable";
    return { requestId: request.requestId, state, backend, backendVersion: version, requestedBackend: request.preferredEngine ?? "auto", operation: request.operation, inputCount: request.points.length, outputCount: raw.points.length, tolerance: request.tolerance, runtimeMs: Math.max(0, performance.now() - started), warnings, fallback: { used: state === "fallback", reason: fallbackReason }, validation: { finite, sourceMapping, maximumParityDeviation, parityWithinTolerance: maximumParityDeviation == null ? null : maximumParityDeviation <= request.tolerance }, provenance: { curveId: request.definition.identity.curveId, curveRevision: request.definition.identity.curveRevision, dependencyFingerprint: dependencyFingerprint(request.definition), correspondence: sourceMapping === "complete" ? "source-index-per-output" : "none" }, points: raw.points, sourceIndices };
  }
}

export const defaultCurveEngineRegistry = new CurveEngineRegistry();
