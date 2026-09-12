import type { AnyCurve, CurveDifferentialField } from "@math3d/core";
import type {
  CurveDiagnosticCategory,
  CurveDiagnosticEntry,
  CurveDiagnosticMethod,
  CurveDiagnosticSeverity,
  CurveIdentity,
} from "./contracts";

type Point3 = { x: number; y: number; z: number };

export type CurveContinuityEvidence = {
  parameter: number;
  c0: boolean;
  c1: boolean;
  c2: boolean;
  g1: boolean;
  g2: boolean;
  positionError: number;
  firstDerivativeError: number;
  secondDerivativeError: number;
  tangentAngle: number | null;
  curvatureError: number | null;
};

export type CurveIntersectionEvidence = {
  kind: "2d-crossing" | "2d-near" | "3d-proximity";
  parameterA: number;
  parameterB: number;
  point: readonly [number, number, number];
  distance: number;
  tolerance: number;
  exact: boolean;
};

export type CurveDiagnosticReport = {
  identity: CurveIdentity;
  status: CurveDiagnosticSeverity;
  entries: CurveDiagnosticEntry[];
  continuity: CurveContinuityEvidence[];
  intersections: CurveIntersectionEvidence[];
  summaries: Record<CurveDiagnosticCategory, number>;
  warningCount: number;
  fingerprint: string;
};

export type AnalyzeCurveDiagnosticsInput = {
  identity: CurveIdentity;
  curve: AnyCurve | null;
  field: CurveDifferentialField | null;
  samplingDiagnostics?: readonly string[];
  breakpoints?: readonly number[];
  tolerance?: number;
  extremeCurvature?: number;
};

const finitePoint = (point: Point3): boolean => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
const point3 = (point: { x: number; y: number; z?: number }): Point3 => ({ x: point.x, y: point.y, z: point.z ?? 0 });
const sub = (a: Point3, b: Point3): Point3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (value: Point3): number => Math.hypot(value.x, value.y, value.z);
const distance = (a: Point3, b: Point3): number => length(sub(a, b));
const dot = (a: Point3, b: Point3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const unit = (value: Point3): Point3 | null => {
  const magnitude = length(value);
  return magnitude > 1e-14 ? { x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude } : null;
};
const severityRank: Record<CurveDiagnosticSeverity, number> = { ok: 0, info: 1, warning: 2, error: 3 };

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

const segmentIntersection2d = (a: Point3, b: Point3, c: Point3, d: Point3, tolerance: number) => {
  const r = sub(b, a);
  const s = sub(d, c);
  const cross = (u: Point3, v: Point3) => u.x * v.y - u.y * v.x;
  const denominator = cross(r, s);
  if (Math.abs(denominator) <= tolerance * 1e-3) return null;
  const ca = sub(c, a);
  const u = cross(ca, r) / denominator;
  const t = cross(ca, s) / denominator;
  if (t <= tolerance || t >= 1 - tolerance || u <= tolerance || u >= 1 - tolerance) return null;
  return { t, u, point: { x: a.x + t * r.x, y: a.y + t * r.y, z: a.z + t * r.z } };
};

const evaluate = (curve: AnyCurve, t: number): Point3 | null => {
  try {
    const value = point3(curve.eval(t));
    return finitePoint(value) ? value : null;
  } catch {
    return null;
  }
};

const continuityAt = (curve: AnyCurve, parameter: number, tolerance: number): CurveContinuityEvidence | null => {
  const span = curve.domain.tMax - curve.domain.tMin;
  const h = Math.max(1e-8, span * 1e-5);
  const [pLL, pL, p0, pR, pRR] = [-2, -1, 0, 1, 2].map((offset) => evaluate(curve, parameter + offset * h));
  if (!pLL || !pL || !p0 || !pR || !pRR) return null;
  const dL = { x: (p0.x - pL.x) / h, y: (p0.y - pL.y) / h, z: (p0.z - pL.z) / h };
  const dR = { x: (pR.x - p0.x) / h, y: (pR.y - p0.y) / h, z: (pR.z - p0.z) / h };
  const d2L = { x: (p0.x - 2 * pL.x + pLL.x) / (h * h), y: (p0.y - 2 * pL.y + pLL.y) / (h * h), z: (p0.z - 2 * pL.z + pLL.z) / (h * h) };
  const d2R = { x: (pRR.x - 2 * pR.x + p0.x) / (h * h), y: (pRR.y - 2 * pR.y + p0.y) / (h * h), z: (pRR.z - 2 * pR.z + p0.z) / (h * h) };
  const positionError = Math.max(distance(pL, p0), distance(p0, pR));
  const firstDerivativeError = distance(dL, dR);
  const secondDerivativeError = distance(d2L, d2R);
  const uL = unit(dL);
  const uR = unit(dR);
  const tangentAngle = uL && uR ? Math.acos(Math.max(-1, Math.min(1, dot(uL, uR)))) : null;
  const curvature = (first: Point3, second: Point3) => {
    const cross = { x: first.y * second.z - first.z * second.y, y: first.z * second.x - first.x * second.z, z: first.x * second.y - first.y * second.x };
    const speed = length(first);
    return speed > 1e-12 ? length(cross) / Math.pow(speed, 3) : null;
  };
  const kL = curvature(dL, d2L);
  const kR = curvature(dR, d2R);
  const curvatureError = kL == null || kR == null ? null : Math.abs(kL - kR);
  const scale = Math.max(1, length(p0));
  return {
    parameter,
    c0: positionError <= Math.max(tolerance, 4 * h * scale),
    c1: firstDerivativeError <= tolerance * scale * 20,
    c2: secondDerivativeError <= tolerance * scale * 200,
    g1: tangentAngle != null && tangentAngle <= Math.sqrt(tolerance) * 4,
    g2: curvatureError != null && curvatureError <= Math.sqrt(tolerance) * 4,
    positionError,
    firstDerivativeError,
    secondDerivativeError,
    tangentAngle,
    curvatureError,
  };
};

export const analyzeCurveDiagnostics = (input: AnalyzeCurveDiagnosticsInput): CurveDiagnosticReport => {
  const tolerance = Math.max(1e-9, input.tolerance ?? 1e-5);
  const extremeCurvature = input.extremeCurvature ?? 1e3;
  const entries: CurveDiagnosticEntry[] = [];
  const add = (category: CurveDiagnosticCategory, severity: CurveDiagnosticSeverity, code: string, message: string, interval: readonly [number, number], evidence: CurveDiagnosticEntry["evidence"], method: CurveDiagnosticMethod, distinction: CurveDiagnosticEntry["distinction"], suggestedAction: string, uncertainty: number | null = null) => {
    entries.push({ id: `${input.identity.key}:${category}:${code}:${entries.length}`, identity: input.identity, category, severity, code, message, parameterInterval: interval, evidence, method, distinction, suggestedAction, uncertainty });
  };

  const points = input.field?.points ?? [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const interval: readonly [number, number] = [points[Math.max(0, index - 1)]?.t ?? point.t, points[Math.min(points.length - 1, index + 1)]?.t ?? point.t];
    if (point.regularity === "invalid" || !finitePoint(point.position)) add("geometry", "error", "invalid-evaluation", "Curve evaluation or derivative is NaN/Infinity.", interval, { parameter: point.t }, "analytic", "mathematical", "Inspect the formula and domain around this parameter.");
    if (point.regularity === "zero-speed") add("singularity", "warning", "zero-speed", "Zero-speed derivative singularity; Frenet quantities are undefined.", interval, { parameter: point.t, speed: point.speed }, "analytic", "mathematical", "Inspect as a cusp/stationary point or reparameterize the curve.", input.field?.provenance.regularityTolerance ?? tolerance);
    if (point.curvature != null && point.curvature > extremeCurvature) add("singularity", "warning", "extreme-curvature", "Curvature exceeds the configured extreme-curvature threshold.", interval, { parameter: point.t, curvature: point.curvature, threshold: extremeCurvature }, "analytic", "mathematical", "Zoom the local probe and refine sampling.");
    const previousTangent = index > 0 ? points[index - 1].tangent : null;
    if (point.tangent && previousTangent) {
      const alignment = dot(point.tangent, previousTangent);
      if (alignment < -0.25) add("singularity", "warning", "cusp-candidate", "Abrupt tangent reversal indicates a cusp candidate.", interval, { alignment }, "numerical", "tolerance-candidate", "Refine derivatives and inspect the shared probe.", tolerance);
    }
  }

  const steps = points.slice(1).map((point, index) => distance(point.position, points[index].position)).filter(Number.isFinite);
  const typicalStep = median(steps.filter((value) => value > tolerance));
  for (let index = 1; index < points.length; index += 1) {
    const step = distance(points[index - 1].position, points[index].position);
    const interval: readonly [number, number] = [points[index - 1].t, points[index].t];
    if (step <= tolerance) add("geometry", "warning", "duplicate-or-degenerate", "Duplicate points or a degenerate sampled segment were detected.", interval, { distance: step, tolerance }, "sampling", "tessellation", "Remove duplicate control data or refine the source span.", tolerance);
    else if (typicalStep > 0 && step > typicalStep * 8) add("geometry", "warning", "discontinuity-candidate", "A sampled jump is inconsistent with neighboring segment lengths.", interval, { distance: step, medianStep: typicalStep }, "sampling", "tolerance-candidate", "Check one-sided limits before treating this as a mathematical discontinuity.", typicalStep);
  }

  for (const message of input.samplingDiagnostics ?? []) {
    const severity: CurveDiagnosticSeverity = /error|invalid/i.test(message) ? "error" : /warn|max|depth|budget|coarse|under/i.test(message) ? "warning" : "info";
    add("sampling", severity, /max|depth|budget|under/i.test(message) ? "sampling-under-resolution" : "sampling-diagnostic", message, [input.curve?.domain.tMin ?? 0, input.curve?.domain.tMax ?? 1], { tolerance }, "sampling", "tessellation", "Refine the sampling tolerance or evaluation budget.", tolerance);
  }

  const intersections: CurveIntersectionEvidence[] = [];
  const closed = Boolean(input.curve?.domain.closed);
  for (let i = 0; i < points.length - 1 && intersections.length < 24; i += 1) {
    for (let j = i + 2; j < points.length - 1 && intersections.length < 24; j += 1) {
      if (closed && i === 0 && j === points.length - 2) continue;
      const a = points[i].position;
      const b = points[i + 1].position;
      const c = points[j].position;
      const d = points[j + 1].position;
      if (input.curve?.dimension === 2) {
        const endpointDistance = distance(a, c);
        if (endpointDistance <= tolerance) {
          intersections.push({ kind: "2d-near", parameterA: points[i].t, parameterB: points[j].t, point: [(a.x + c.x) / 2, (a.y + c.y) / 2, 0], distance: endpointDistance, tolerance, exact: endpointDistance <= Number.EPSILON * 16 });
          continue;
        }
        const hit = segmentIntersection2d(a, b, c, d, tolerance);
        if (!hit) continue;
        const parameterA = points[i].t + hit.t * (points[i + 1].t - points[i].t);
        const parameterB = points[j].t + hit.u * (points[j + 1].t - points[j].t);
        intersections.push({ kind: "2d-crossing", parameterA, parameterB, point: [hit.point.x, hit.point.y, hit.point.z], distance: 0, tolerance, exact: false });
      } else {
        const proximity = distance(a, c);
        if (proximity > tolerance * 5) continue;
        intersections.push({ kind: "3d-proximity", parameterA: points[i].t, parameterB: points[j].t, point: [(a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2], distance: proximity, tolerance: tolerance * 5, exact: false });
      }
    }
  }
  intersections.forEach((hit) => add("intersection", "warning", hit.kind, hit.kind === "2d-crossing" ? "Robust sampled 2D self-intersection detected." : hit.kind === "2d-near" ? "Exact or tolerance-matched 2D self-intersection detected." : "Sampled 3D near self-intersection candidate detected.", [Math.min(hit.parameterA, hit.parameterB), Math.max(hit.parameterA, hit.parameterB)], { parameterA: hit.parameterA, parameterB: hit.parameterB, distance: hit.distance, tolerance: hit.tolerance, exact: hit.exact }, hit.exact ? "exact" : hit.kind === "2d-crossing" ? "tolerance-robust" : "proximity-candidate", hit.exact ? "mathematical" : "tolerance-candidate", "Navigate to the evidence and confirm at a tighter tolerance.", hit.exact ? 0 : hit.tolerance));

  const continuity = input.curve
    ? (input.breakpoints ?? input.curve.domain.breakpoints ?? []).filter((value) => value > input.curve!.domain.tMin && value < input.curve!.domain.tMax).map((value) => continuityAt(input.curve!, value, tolerance)).filter((value): value is CurveContinuityEvidence => value != null)
    : [];
  continuity.forEach((row) => add("continuity", row.c0 && row.g1 ? "info" : "warning", row.c0 ? "join-continuity" : "mathematical-discontinuity", `Join is ${row.c0 ? "C0" : "not C0"}, ${row.c1 ? "C1" : "not C1"}, ${row.c2 ? "C2" : "not C2"}, ${row.g1 ? "G1" : "not G1"}, and ${row.g2 ? "G2" : "not G2"}.`, [row.parameter, row.parameter], { c0: row.c0, c1: row.c1, c2: row.c2, g1: row.g1, g2: row.g2, positionError: row.positionError, firstDerivativeError: row.firstDerivativeError, secondDerivativeError: row.secondDerivativeError, tangentAngle: row.tangentAngle, curvatureError: row.curvatureError }, "numerical", "mathematical", "Inspect one-sided derivative evidence at the join.", tolerance));

  if (!entries.length) add("geometry", "ok", "ready", "No geometry, sampling, continuity, singularity, or intersection issues detected.", [input.curve?.domain.tMin ?? 0, input.curve?.domain.tMax ?? 1], { sampleCount: points.length }, "analytic", "mathematical", "No action required.");
  const status = entries.reduce<CurveDiagnosticSeverity>((worst, entry) => severityRank[entry.severity] > severityRank[worst] ? entry.severity : worst, "ok");
  const summaries: Record<CurveDiagnosticCategory, number> = { geometry: 0, sampling: 0, continuity: 0, singularity: 0, intersection: 0 };
  entries.forEach((entry) => { summaries[entry.category] += 1; });
  const fingerprint = entries.map((entry) => `${entry.code}:${entry.parameterInterval.join(":")}:${entry.severity}`).join("|");
  return { identity: input.identity, status, entries, continuity, intersections, summaries, warningCount: entries.filter((entry) => entry.severity === "warning" || entry.severity === "error").length, fingerprint };
};

export const curveDiagnosticReportToCsv = (report: CurveDiagnosticReport): string => [
  "id,curveId,revision,category,severity,code,tMin,tMax,method,uncertainty,distinction,message,suggestedAction",
  ...report.entries.map((entry) => [entry.id, entry.identity.curveId, entry.identity.curveRevision, entry.category, entry.severity, entry.code, ...entry.parameterInterval, entry.method, entry.uncertainty ?? "", entry.distinction, entry.message, entry.suggestedAction].map((value) => JSON.stringify(value)).join(",")),
].join("\n");

export const compareCurveDiagnosticReports = (left: CurveDiagnosticReport, right: CurveDiagnosticReport) => ({
  added: right.entries.filter((entry) => !left.entries.some((candidate) => candidate.code === entry.code)).map((entry) => entry.code),
  resolved: left.entries.filter((entry) => !right.entries.some((candidate) => candidate.code === entry.code)).map((entry) => entry.code),
  warningDelta: right.warningCount - left.warningCount,
  changed: left.fingerprint !== right.fingerprint,
});
