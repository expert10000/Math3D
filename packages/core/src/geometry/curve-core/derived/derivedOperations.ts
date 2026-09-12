import type { Vec2, Vec3 } from "../../../math";
import type { AnyCurve, Curve2D, Curve3D, CurvePoint } from "../model";
import { normalizeCurveDomain } from "../model";
import { derivative } from "../eval/derivative";
import { secondDerivative } from "../eval/secondDerivative";
import { buildArcLengthTable, invertArcLengthTable } from "../utils/reparameterization";
import { bboxFromCurve, type CurveBoundingBox } from "../utils/bbox";
import {
  addPoint,
  crossPoint3,
  distancePoint,
  dotPoint,
  isVec3Point,
  lengthPoint,
  normalizePoint,
  scalePoint,
  subPoint,
} from "../utils/vector";

export type DerivedCurveOperation =
  | "offset"
  | "evolute"
  | "involute"
  | "normal"
  | "tangent-indicatrix"
  | "curvature-indicatrix"
  | "projection-plane"
  | "projection-surface"
  | "transform"
  | "trim"
  | "reverse"
  | "split"
  | "join"
  | "reparameterize";

export type DerivedCurveSource = {
  curve: AnyCurve;
  curveId: string;
  revision: number;
};

export type PlaneDefinition = {
  origin: Vec3;
  normal: Vec3;
};

export type DerivedCurveParameters = {
  distance?: number;
  scale?: number;
  startParameter?: number;
  parameter?: number;
  interval?: readonly [number, number];
  targetDomain?: readonly [number, number];
  plane?: PlaneDefinition;
  referenceNormal?: Vec3;
  matrix?: readonly number[];
  tolerance?: number;
  branch?: number;
  surfaceId?: string;
};

export type DerivedCurveWarningCode =
  | "cusp"
  | "offset-singularity"
  | "ambiguous-join"
  | "incompatible-dimension"
  | "backend-unavailable"
  | "degenerate-input";

export type DerivedCurveWarning = {
  code: DerivedCurveWarningCode;
  message: string;
  parameter?: number;
};

export type DerivedCurveLineage = {
  operation: DerivedCurveOperation;
  sourceCurves: ReadonlyArray<{ curveId: string; revision: number }>;
  parameters: Readonly<DerivedCurveParameters>;
  branch: number;
  correspondenceId: string;
  createdAt: number;
  warnings: readonly DerivedCurveWarning[];
};

export type DerivedCurve = AnyCurve & {
  derived: DerivedCurveLineage;
};

export type DerivedCurveResultCollection = {
  id: string;
  operation: DerivedCurveOperation;
  status: "ready" | "warning" | "error" | "capability-required";
  branches: DerivedCurve[];
  warnings: DerivedCurveWarning[];
  sourceCurves: ReadonlyArray<{ curveId: string; revision: number }>;
};

export type DerivedCurvePreview = DerivedCurveResultCollection & {
  phase: "preview";
  request: DerivedCurveRequest;
};

export type DerivedCurveRequest = {
  id: string;
  name?: string;
  operation: DerivedCurveOperation;
  sources: readonly DerivedCurveSource[];
  parameters?: DerivedCurveParameters;
  now?: number;
};

const EPS = 1e-10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const point3 = (point: CurvePoint): Vec3 => ({ x: point.x, y: point.y, z: isVec3Point(point) ? point.z : 0 });
const from3 = (point: Vec3, dimension: 2 | 3): CurvePoint => dimension === 2 ? { x: point.x, y: point.y } : point;
const stableId = (request: DerivedCurveRequest, branch: number) => `${request.id}:branch-${branch}`;

const curveWithEval = (
  request: DerivedCurveRequest,
  source: AnyCurve,
  branch: number,
  domain: AnyCurve["domain"],
  evaluate: (t: number) => CurvePoint,
  warnings: DerivedCurveWarning[]
): DerivedCurve => {
  const base = {
    id: stableId(request, branch),
    name: request.name ?? `${request.operation} of ${request.sources.map((entry) => entry.curve.name).join(", ")}`,
    kind: "custom" as const,
    family: "parametric" as const,
    subtype: source.dimension === 2 ? "2d" as const : "3d" as const,
    domain,
    dimension: source.dimension,
    eval: evaluate,
    derived: {
      operation: request.operation,
      sourceCurves: request.sources.map(({ curveId, revision }) => ({ curveId, revision })),
      parameters: { ...(request.parameters ?? {}) },
      branch,
      correspondenceId: `${request.id}:${request.operation}:${request.sources.map((entry) => `${entry.curveId}@${entry.revision}`).join("+")}:${branch}`,
      createdAt: request.now ?? Date.now(),
      warnings: [...warnings],
    },
  };
  return base as DerivedCurve;
};

const unitTangent = (curve: AnyCurve, t: number): CurvePoint => normalizePoint(derivative(curve as Curve2D, t));

const normalAt = (curve: AnyCurve, t: number, referenceNormal?: Vec3): CurvePoint | null => {
  const tangent = unitTangent(curve, t);
  if (lengthPoint(tangent) <= EPS) return null;
  if (curve.dimension === 2) return { x: -tangent.y, y: tangent.x };
  const reference = normalizePoint(referenceNormal ?? { x: 0, y: 0, z: 1 });
  let normal = crossPoint3(reference, tangent);
  if (lengthPoint(normal) <= EPS) normal = crossPoint3({ x: 0, y: 1, z: 0 }, tangent);
  return lengthPoint(normal) <= EPS ? null : normalizePoint(normal);
};

const curvatureVector = (curve: AnyCurve, t: number): CurvePoint | null => {
  const d1 = derivative(curve as Curve2D, t);
  const d2 = secondDerivative(curve as Curve2D, t);
  const speed2 = dotPoint(d1, d1);
  if (speed2 <= EPS) return null;
  return subPoint(d2, scalePoint(d1, dotPoint(d1, d2) / speed2));
};

const projectToPlane = (point: CurvePoint, plane: PlaneDefinition): CurvePoint => {
  const n = normalizePoint(plane.normal);
  const p = point3(point);
  const originToPoint = subPoint(p, plane.origin);
  return from3(subPoint(p, scalePoint(n, dotPoint(originToPoint, n))), isVec3Point(point) ? 3 : 2);
};

const transformPoint = (point: CurvePoint, matrix: readonly number[]): CurvePoint => {
  if (matrix.length !== 16) throw new Error("A transform requires a column-major 4x4 matrix.");
  const p = point3(point);
  const w = matrix[3] * p.x + matrix[7] * p.y + matrix[11] * p.z + matrix[15];
  const divisor = Math.abs(w) > EPS ? w : 1;
  const result = {
    x: (matrix[0] * p.x + matrix[4] * p.y + matrix[8] * p.z + matrix[12]) / divisor,
    y: (matrix[1] * p.x + matrix[5] * p.y + matrix[9] * p.z + matrix[13]) / divisor,
    z: (matrix[2] * p.x + matrix[6] * p.y + matrix[10] * p.z + matrix[14]) / divisor,
  };
  return from3(result, isVec3Point(point) ? 3 : 2);
};

const result = (
  request: DerivedCurveRequest,
  branches: DerivedCurve[],
  warnings: DerivedCurveWarning[],
  status?: DerivedCurveResultCollection["status"]
): DerivedCurveResultCollection => ({
  id: request.id,
  operation: request.operation,
  status: status ?? (warnings.length ? "warning" : "ready"),
  branches,
  warnings,
  sourceCurves: request.sources.map(({ curveId, revision }) => ({ curveId, revision })),
});

export const createDerivedCurveCollection = (request: DerivedCurveRequest): DerivedCurveResultCollection => {
  const source = request.sources[0]?.curve;
  if (!source) return result(request, [], [{ code: "degenerate-input", message: "At least one source curve is required." }], "error");
  const parameters = request.parameters ?? {};
  const warnings: DerivedCurveWarning[] = [];
  const domain = { ...source.domain };

  if (request.operation === "projection-surface") {
    return result(request, [], [{ code: "backend-unavailable", message: `Projection to Surface ${parameters.surfaceId ?? "(unselected)"} requires a surface projection backend.` }], "capability-required");
  }

  if (request.operation === "split") {
    const split = clamp(parameters.parameter ?? 0.5 * (domain.tMin + domain.tMax), domain.tMin, domain.tMax);
    if (split <= domain.tMin + EPS || split >= domain.tMax - EPS) {
      return result(request, [], [{ code: "degenerate-input", message: "Split parameter must lie strictly inside the curve domain.", parameter: split }], "error");
    }
    return result(request, [
      curveWithEval(request, source, 0, normalizeCurveDomain({ ...domain, tMax: split, closed: false, periodic: false }), (t) => source.eval(t), warnings),
      curveWithEval(request, source, 1, normalizeCurveDomain({ ...domain, tMin: split, closed: false, periodic: false }), (t) => source.eval(t), warnings),
    ], warnings);
  }

  if (request.operation === "join") {
    const second = request.sources[1]?.curve;
    if (!second) return result(request, [], [{ code: "degenerate-input", message: "Join requires two source curves." }], "error");
    if (second.dimension !== source.dimension) return result(request, [], [{ code: "incompatible-dimension", message: "Joined curves must have the same dimension." }], "error");
    const candidates = [
      { reverseA: false, reverseB: false, a: source.eval(source.domain.tMax), b: second.eval(second.domain.tMin) },
      { reverseA: false, reverseB: true, a: source.eval(source.domain.tMax), b: second.eval(second.domain.tMax) },
      { reverseA: true, reverseB: false, a: source.eval(source.domain.tMin), b: second.eval(second.domain.tMin) },
      { reverseA: true, reverseB: true, a: source.eval(source.domain.tMin), b: second.eval(second.domain.tMax) },
    ].map((candidate) => ({ ...candidate, distance: distancePoint(candidate.a, candidate.b) })).sort((a, b) => a.distance - b.distance);
    const tolerance = parameters.tolerance ?? 1e-5;
    if (candidates[1].distance - candidates[0].distance <= tolerance) warnings.push({ code: "ambiguous-join", message: "Multiple endpoint pairings are within the join tolerance." });
    const selected = candidates[parameters.branch == null ? 0 : clamp(Math.round(parameters.branch), 0, candidates.length - 1)];
    const joinedDomain = normalizeCurveDomain({ tMin: 0, tMax: 2, closed: false, periodic: false });
    const mapParameter = (curve: AnyCurve, u: number, reverse: boolean) => {
      const alpha = reverse ? 1 - u : u;
      return curve.domain.tMin + alpha * (curve.domain.tMax - curve.domain.tMin);
    };
    const joined = curveWithEval(request, source, 0, joinedDomain, (t) => t <= 1
      ? source.eval(mapParameter(source, t, selected.reverseA))
      : second.eval(mapParameter(second, t - 1, selected.reverseB)), warnings);
    return result(request, [joined], warnings);
  }

  let outputDomain = domain;
  let evaluate: (t: number) => CurvePoint;
  switch (request.operation) {
    case "offset": {
      const distance = parameters.distance ?? 0.25;
      evaluate = (t) => {
        const normal = normalAt(source, t, parameters.referenceNormal);
        if (!normal) return source.eval(t);
        return addPoint(source.eval(t), scalePoint(normal, distance));
      };
      for (let index = 0; index <= 64; index += 1) {
        const t = domain.tMin + (index / 64) * (domain.tMax - domain.tMin);
        if (lengthPoint(derivative(source as Curve2D, t)) <= 1e-8) warnings.push({ code: "cusp", message: "Offset is undefined at a source cusp; the source position is retained.", parameter: t });
        const cv = curvatureVector(source, t);
        if (cv && Math.abs(1 - Math.abs(distance) * lengthPoint(cv) / Math.max(EPS, dotPoint(derivative(source as Curve2D, t), derivative(source as Curve2D, t)))) < 1e-3) {
          warnings.push({ code: "offset-singularity", message: "Offset distance reaches the local radius of curvature.", parameter: t });
        }
      }
      break;
    }
    case "evolute":
      if (source.dimension !== 2) return result(request, [], [{ code: "incompatible-dimension", message: "Evolute currently requires a planar curve." }], "error");
      evaluate = (t) => {
        const d1 = derivative(source as Curve2D, t);
        const d2 = secondDerivative(source as Curve2D, t);
        const cross = d1.x * d2.y - d1.y * d2.x;
        if (Math.abs(cross) <= EPS) return { x: NaN, y: NaN };
        const factor = dotPoint(d1, d1) / cross;
        return addPoint(source.eval(t), scalePoint({ x: -d1.y, y: d1.x }, factor));
      };
      break;
    case "involute": {
      const table = buildArcLengthTable(source, 1024);
      const start = clamp(parameters.startParameter ?? domain.tMin, domain.tMin, domain.tMax);
      const startLength = (() => {
        let closest = 0;
        for (let index = 1; index < table.ts.length; index += 1) if (Math.abs(table.ts[index] - start) < Math.abs(table.ts[closest] - start)) closest = index;
        return table.lengths[closest];
      })();
      evaluate = (t) => {
        let closest = 0;
        for (let index = 1; index < table.ts.length; index += 1) if (Math.abs(table.ts[index] - t) < Math.abs(table.ts[closest] - t)) closest = index;
        return subPoint(source.eval(t), scalePoint(unitTangent(source, t), table.lengths[closest] - startLength));
      };
      break;
    }
    case "normal": evaluate = (t) => normalAt(source, t, parameters.referenceNormal) ?? scalePoint(source.eval(t), 0); break;
    case "tangent-indicatrix": evaluate = (t) => unitTangent(source, t); break;
    case "curvature-indicatrix": evaluate = (t) => curvatureVector(source, t) ?? scalePoint(source.eval(t), 0); break;
    case "projection-plane": {
      const plane = parameters.plane ?? { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } };
      if (lengthPoint(plane.normal) <= EPS) return result(request, [], [{ code: "degenerate-input", message: "Projection plane normal must be non-zero." }], "error");
      evaluate = (t) => projectToPlane(source.eval(t), plane);
      break;
    }
    case "transform": {
      const matrix = parameters.matrix ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      if (matrix.length !== 16 || matrix.some((value) => !Number.isFinite(value))) return result(request, [], [{ code: "degenerate-input", message: "Transform matrix must contain 16 finite values." }], "error");
      evaluate = (t) => transformPoint(source.eval(t), matrix);
      break;
    }
    case "trim": {
      const interval = parameters.interval ?? [domain.tMin, domain.tMax];
      const lo = clamp(Math.min(interval[0], interval[1]), domain.tMin, domain.tMax);
      const hi = clamp(Math.max(interval[0], interval[1]), domain.tMin, domain.tMax);
      if (hi - lo <= EPS) return result(request, [], [{ code: "degenerate-input", message: "Trim interval must have positive extent." }], "error");
      outputDomain = normalizeCurveDomain({ ...domain, tMin: lo, tMax: hi, closed: false, periodic: false });
      evaluate = (t) => source.eval(t);
      break;
    }
    case "reverse": evaluate = (t) => source.eval(domain.tMin + domain.tMax - t); break;
    case "reparameterize": {
      const target = parameters.targetDomain ?? [0, 1];
      if (!(target[1] > target[0])) return result(request, [], [{ code: "degenerate-input", message: "Target domain must have positive extent." }], "error");
      outputDomain = normalizeCurveDomain({ ...domain, tMin: target[0], tMax: target[1] });
      evaluate = (t) => source.eval(domain.tMin + ((t - target[0]) / (target[1] - target[0])) * (domain.tMax - domain.tMin));
      break;
    }
    default: return result(request, [], [{ code: "backend-unavailable", message: `Operation ${request.operation} is not available.` }], "capability-required");
  }
  return result(request, [curveWithEval(request, source, 0, outputDomain, evaluate, warnings)], warnings);
};

export const previewDerivedCurve = (request: DerivedCurveRequest): DerivedCurvePreview => ({
  ...createDerivedCurveCollection(request),
  phase: "preview",
  request,
});

export type CurvePointResult = { parameter: number; point: CurvePoint; distance?: number };
export type CurvePairResult = { parameterA: number; parameterB: number; pointA: CurvePoint; pointB: CurvePoint; distance: number };

const sampleParameters = (curve: AnyCurve, count: number) => Array.from({ length: Math.max(2, count) }, (_, index) => curve.domain.tMin + (index / (Math.max(2, count) - 1)) * (curve.domain.tMax - curve.domain.tMin));

export const closestPointOnCurve = (curve: AnyCurve, target: CurvePoint, samples = 512): CurvePointResult => {
  let bestT = curve.domain.tMin;
  let bestPoint = curve.eval(bestT);
  let bestDistance = distancePoint(bestPoint, target);
  for (const t of sampleParameters(curve, samples)) {
    const point = curve.eval(t);
    const distance = distancePoint(point, target);
    if (distance < bestDistance) { bestT = t; bestPoint = point; bestDistance = distance; }
  }
  let step = (curve.domain.tMax - curve.domain.tMin) / Math.max(2, samples);
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const candidates = [clamp(bestT - step, curve.domain.tMin, curve.domain.tMax), bestT, clamp(bestT + step, curve.domain.tMin, curve.domain.tMax)];
    for (const t of candidates) {
      const point = curve.eval(t);
      const distance = distancePoint(point, target);
      if (distance < bestDistance) { bestT = t; bestPoint = point; bestDistance = distance; }
    }
    step *= 0.5;
  }
  return { parameter: bestT, point: bestPoint, distance: bestDistance };
};

export const closestPointsBetweenCurves = (a: AnyCurve, b: AnyCurve, samples = 256): CurvePairResult => {
  if (a.dimension !== b.dimension) throw new Error("Closest-point curves must have the same dimension.");
  let best: CurvePairResult | null = null;
  for (const ta of sampleParameters(a, samples)) {
    const pa = a.eval(ta);
    const onB = closestPointOnCurve(b, pa, samples);
    if (!best || (onB.distance ?? Infinity) < best.distance) best = { parameterA: ta, parameterB: onB.parameter, pointA: pa, pointB: onB.point, distance: onB.distance ?? Infinity };
  }
  return best!;
};

export const intersectCurveWithPlane = (curve: Curve3D, plane: PlaneDefinition, samples = 512, tolerance = 1e-8): CurvePointResult[] => {
  const n = normalizePoint(plane.normal);
  if (lengthPoint(n) <= EPS) throw new Error("Plane normal must be non-zero.");
  const signed = (t: number) => dotPoint(subPoint(curve.eval(t), plane.origin), n);
  const ts = sampleParameters(curve, samples);
  const hits: CurvePointResult[] = [];
  for (let index = 1; index < ts.length; index += 1) {
    let a = ts[index - 1]; let b = ts[index]; let fa = signed(a); let fb = signed(b);
    if (Math.abs(fa) <= tolerance) hits.push({ parameter: a, point: curve.eval(a) });
    if (fa * fb > 0) continue;
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const mid = 0.5 * (a + b); const fm = signed(mid);
      if (fa * fm <= 0) { b = mid; fb = fm; } else { a = mid; fa = fm; }
    }
    const t = 0.5 * (a + b);
    if (!hits.some((hit) => Math.abs(hit.parameter - t) <= tolerance * 10)) hits.push({ parameter: t, point: curve.eval(t) });
  }
  return hits;
};

const segmentIntersection2D = (a: Vec2, b: Vec2, c: Vec2, d: Vec2, tolerance: number): { u: number; v: number; point: Vec2 } | null => {
  const r = subPoint(b, a); const s = subPoint(d, c);
  const denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) <= tolerance) return null;
  const ca = subPoint(c, a);
  const u = (ca.x * s.y - ca.y * s.x) / denominator;
  const v = (ca.x * r.y - ca.y * r.x) / denominator;
  if (u < -tolerance || u > 1 + tolerance || v < -tolerance || v > 1 + tolerance) return null;
  return { u, v, point: addPoint(a, scalePoint(r, u)) };
};

export const intersectPlanarCurves = (a: Curve2D, b: Curve2D, samples = 512, tolerance = 1e-7): CurvePairResult[] => {
  const ta = sampleParameters(a, samples); const tb = sampleParameters(b, samples);
  const hits: CurvePairResult[] = [];
  for (let i = 1; i < ta.length; i += 1) for (let j = 1; j < tb.length; j += 1) {
    const hit = segmentIntersection2D(a.eval(ta[i - 1]), a.eval(ta[i]), b.eval(tb[j - 1]), b.eval(tb[j]), tolerance);
    if (!hit) continue;
    const parameterA = ta[i - 1] + hit.u * (ta[i] - ta[i - 1]);
    const parameterB = tb[j - 1] + hit.v * (tb[j] - tb[j - 1]);
    if (!hits.some((entry) => Math.abs(entry.parameterA - parameterA) < 1e-5 && Math.abs(entry.parameterB - parameterB) < 1e-5)) {
      hits.push({ parameterA, parameterB, pointA: hit.point, pointB: hit.point, distance: 0 });
    }
  }
  return hits;
};

export const coordinateExtrema = (curve: AnyCurve, samples = 1024): Record<"x" | "y" | "z", { min: CurvePointResult; max: CurvePointResult } | null> => {
  const axes = ["x", "y", "z"] as const;
  const output = { x: null, y: null, z: null } as Record<typeof axes[number], { min: CurvePointResult; max: CurvePointResult } | null>;
  const ts = sampleParameters(curve, samples);
  for (const axis of axes) {
    if (axis === "z" && curve.dimension === 2) continue;
    let min: CurvePointResult | null = null; let max: CurvePointResult | null = null;
    for (const parameter of ts) {
      const point = curve.eval(parameter); const value = axis === "z" ? point3(point).z : point[axis];
      if (!min || value < (axis === "z" ? point3(min.point).z : min.point[axis])) min = { parameter, point };
      if (!max || value > (axis === "z" ? point3(max.point).z : max.point[axis])) max = { parameter, point };
    }
    output[axis] = min && max ? { min, max } : null;
  }
  return output;
};

export const curveBoundingBox = (curve: AnyCurve, samples = 512): CurveBoundingBox | null => bboxFromCurve(curve, samples);

export type DerivedCurveRecordState = "live" | "frozen-snapshot" | "detached" | "stale" | "error";
export type DerivedCurveRecord = {
  id: string;
  revision: number;
  state: DerivedCurveRecordState;
  request: DerivedCurveRequest;
  result: DerivedCurveResultCollection;
};

export class DerivedCurveWorkspace {
  private sources = new Map<string, DerivedCurveSource>();
  private records = new Map<string, DerivedCurveRecord>();

  registerSource(source: DerivedCurveSource): DerivedCurveRecord[] {
    this.sources.set(source.curveId, source);
    const changed: DerivedCurveRecord[] = [];
    for (const record of this.records.values()) {
      if (record.state !== "live" || !record.request.sources.some((entry) => entry.curveId === source.curveId)) continue;
      const sources = record.request.sources.map((entry) => this.sources.get(entry.curveId) ?? entry);
      const next = { ...record, revision: record.revision + 1, request: { ...record.request, sources } };
      next.result = createDerivedCurveCollection(next.request);
      next.state = next.result.status === "error" ? "error" : "live";
      this.records.set(next.id, next); changed.push(next);
    }
    return changed;
  }

  preview(request: DerivedCurveRequest): DerivedCurvePreview { return previewDerivedCurve(request); }

  commit(preview: DerivedCurvePreview): DerivedCurveRecord {
    const record: DerivedCurveRecord = { id: preview.id, revision: 1, state: preview.status === "error" ? "error" : "live", request: preview.request, result: { ...preview, branches: [...preview.branches] } };
    this.records.set(record.id, record);
    preview.request.sources.forEach((source) => this.sources.set(source.curveId, source));
    return record;
  }

  get(id: string): DerivedCurveRecord | null { return this.records.get(id) ?? null; }
  list(): DerivedCurveRecord[] { return [...this.records.values()]; }
  openSource(recordId: string, curveId?: string): DerivedCurveSource | null {
    const record = this.records.get(recordId);
    const id = curveId ?? record?.request.sources[0]?.curveId;
    return id ? this.sources.get(id) ?? null : null;
  }
  freeze(id: string): DerivedCurveRecord | null { return this.transition(id, "frozen-snapshot"); }
  detach(id: string): DerivedCurveRecord | null { return this.transition(id, "detached"); }
  regenerate(id: string): DerivedCurveRecord | null {
    const record = this.records.get(id); if (!record) return null;
    const sources = record.request.sources.map((entry) => this.sources.get(entry.curveId) ?? entry);
    const result = createDerivedCurveCollection({ ...record.request, sources });
    const next = { ...record, revision: record.revision + 1, state: result.status === "error" ? "error" as const : "live" as const, request: { ...record.request, sources }, result };
    this.records.set(id, next); return next;
  }
  delete(id: string): boolean { return this.records.delete(id); }
  private transition(id: string, state: DerivedCurveRecordState): DerivedCurveRecord | null {
    const record = this.records.get(id); if (!record) return null;
    const next = { ...record, revision: record.revision + 1, state };
    this.records.set(id, next); return next;
  }
}

export const parameterAtArcFraction = (curve: AnyCurve, fraction: number, samples = 512): number => {
  const table = buildArcLengthTable(curve, samples);
  return invertArcLengthTable(table, clamp(fraction, 0, 1) * table.totalLength);
};
