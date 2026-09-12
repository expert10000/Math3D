import type { Vec3 } from "../../../math";
import type { AnyCurve, CurvePoint } from "../model";
import { derivative, secondDerivative, thirdDerivative } from "../eval";
import { sampleCurveRobust, type RobustSamplingOptions } from "../sampling";
import {
  buildArcLengthTableFromSamples,
  parameterToArcLength,
  type ArcLengthTable,
} from "../utils/reparameterization";
import { crossPoint3, finitePoint } from "../utils/vector";

export type CurveDifferentialMethod = "exact" | "analytic" | "numerical" | "spline" | "polyline" | "backend";
export type CurveRegularity = "regular" | "zero-speed" | "invalid";
export type CurveConvexity = "convex" | "concave" | "flat";

export type CurvePlaneEvidence = {
  point: Vec3;
  normal: Vec3;
};

export type CurveDifferentialEvidence = {
  osculatingCircle: { center: Vec3; radius: number; normal: Vec3 } | null;
  osculatingPlane: CurvePlaneEvidence | null;
  normalPlane: CurvePlaneEvidence | null;
  rectifyingPlane: CurvePlaneEvidence | null;
  curvatureComb: readonly [Vec3, Vec3] | null;
  evolutePoint: Vec3 | null;
};

export type CurveDifferentialPoint = {
  t: number;
  normalizedParameter: number;
  arcLength: number;
  normalizedArcLength: number;
  position: Vec3;
  firstDerivative: Vec3 | null;
  secondDerivative: Vec3 | null;
  thirdDerivative: Vec3 | null;
  speed: number | null;
  tangent: Vec3 | null;
  frenetNormal: Vec3 | null;
  frenetBinormal: Vec3 | null;
  bishopNormal: Vec3 | null;
  bishopBinormal: Vec3 | null;
  curvature: number | null;
  signedCurvature: number | null;
  torsion: number | null;
  radiusOfCurvature: number | null;
  ambientCurvature: number | null;
  normalCurvature: number | null;
  geodesicCurvature: number | null;
  regularity: CurveRegularity;
  frenetDefined: boolean;
  bishopFallbackUsed: boolean;
  uncertain: boolean;
  evidence: CurveDifferentialEvidence;
};

export type CurveScalarStatistics = {
  minimum: number;
  maximum: number;
  average: number;
  minimumAt: number;
  maximumAt: number;
};

export type CurveSignedInterval = {
  tMin: number;
  tMax: number;
  classification: CurveConvexity;
};

export type CurveSurfaceContext = {
  dependency: { surfaceId: string; surfaceRevision: string | number };
  normalAt: (t: number, position: Vec3) => CurvePoint;
};

export type CurveDifferentialAnalysisOptions = {
  parameters?: readonly number[];
  sampleCount?: number;
  sampling?: RobustSamplingOptions;
  arcLengthTable?: ArcLengthTable;
  method?: CurveDifferentialMethod;
  units?: { position: string; parameter: string };
  regularityTolerance?: number;
  curvatureTolerance?: number;
  surfaceContext?: CurveSurfaceContext;
  curvatureCombScale?: number;
};

export type CurveDifferentialField = {
  kind: "curve-differential-field";
  points: CurveDifferentialPoint[];
  validityMask: Uint8Array;
  regularityMask: Uint8Array;
  uncertaintyMask: Uint8Array;
  statistics: {
    speed: CurveScalarStatistics | null;
    curvature: CurveScalarStatistics | null;
    signedCurvature: CurveScalarStatistics | null;
    torsion: CurveScalarStatistics | null;
  };
  inflectionParameters: number[];
  convexityIntervals: CurveSignedInterval[];
  totalTurningAngle: number | null;
  turningNumber: number | null;
  bishopHolonomy: number | null;
  warnings: string[];
  provenance: {
    method: CurveDifferentialMethod;
    derivativeSource: "provided" | "mixed" | "numerical";
    units: { position: string; parameter: string };
    surfaceDependency: CurveSurfaceContext["dependency"] | null;
    regularityTolerance: number;
    curvatureTolerance: number;
  };
};

const vec3 = (point: CurvePoint): Vec3 => ({ x: point.x, y: point.y, z: "z" in point ? point.z : 0 });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, factor: number): Vec3 => ({ x: a.x * factor, y: a.y * factor, z: a.z * factor });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => crossPoint3(a, b);
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec3): Vec3 | null => {
  const magnitude = length(a);
  return magnitude > 1e-14 && Number.isFinite(magnitude) ? scale(a, 1 / magnitude) : null;
};
const finiteVec3 = (value: Vec3 | null): value is Vec3 => !!value && finitePoint(value);

const deterministicNormal = (tangent: Vec3): Vec3 => {
  const axes: Vec3[] = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];
  axes.sort((left, right) => Math.abs(dot(left, tangent)) - Math.abs(dot(right, tangent)));
  return unit(sub(axes[0], scale(tangent, dot(axes[0], tangent)))) ?? { x: 0, y: 1, z: 0 };
};

const rotateAroundAxis = (value: Vec3, axis: Vec3, angle: number): Vec3 => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(add(scale(value, cosine), scale(cross(axis, value), sine)), scale(axis, dot(axis, value) * (1 - cosine)));
};

const transportNormal = (normal: Vec3, previousTangent: Vec3, tangent: Vec3): Vec3 => {
  const axisVector = cross(previousTangent, tangent);
  const sine = length(axisVector);
  const cosine = Math.max(-1, Math.min(1, dot(previousTangent, tangent)));
  let transported = normal;
  if (sine > 1e-12) transported = rotateAroundAxis(normal, scale(axisVector, 1 / sine), Math.atan2(sine, cosine));
  else if (cosine < 0) transported = deterministicNormal(tangent);
  return unit(sub(transported, scale(tangent, dot(transported, tangent)))) ?? deterministicNormal(tangent);
};

const statistics = (rows: Array<{ t: number; value: number | null }>): CurveScalarStatistics | null => {
  const finite = rows.filter((row): row is { t: number; value: number } => row.value != null && Number.isFinite(row.value));
  if (!finite.length) return null;
  let minimum = finite[0];
  let maximum = finite[0];
  let sum = 0;
  for (const row of finite) {
    if (row.value < minimum.value) minimum = row;
    if (row.value > maximum.value) maximum = row;
    sum += row.value;
  }
  return { minimum: minimum.value, maximum: maximum.value, average: sum / finite.length, minimumAt: minimum.t, maximumAt: maximum.t };
};

const safeEvaluate = <T>(callback: () => T): T | null => {
  try { return callback(); } catch { return null; }
};

const uniqueParameters = (curve: AnyCurve, parameters: readonly number[]): number[] => {
  const output = parameters
    .filter(Number.isFinite)
    .map((value) => Math.max(curve.domain.tMin, Math.min(curve.domain.tMax, value)))
    .sort((left, right) => left - right);
  return output.filter((value, index) => index === 0 || Math.abs(value - output[index - 1]) > 1e-14);
};

const classifySigned = (value: number | null, tolerance: number): CurveConvexity =>
  value == null || Math.abs(value) <= tolerance ? "flat" : value > 0 ? "convex" : "concave";

export const analyzeCurveDifferentialGeometry = (
  curve: AnyCurve,
  options: CurveDifferentialAnalysisOptions = {}
): CurveDifferentialField => {
  const regularityTolerance = Math.max(1e-14, options.regularityTolerance ?? 1e-7);
  const curvatureTolerance = Math.max(1e-14, options.curvatureTolerance ?? 1e-8);
  const method = options.method ?? (curve.derivative && curve.secondDerivative ? "analytic" : "numerical");
  const sampled = options.parameters
    ? null
    : sampleCurveRobust(curve, { mode: "hybrid", minimumSamples: Math.max(8, options.sampleCount ?? 96), ...options.sampling });
  const parameters = uniqueParameters(curve, options.parameters ?? sampled?.samples.map((row) => row.t) ?? []);
  const positions = parameters.map((t) => safeEvaluate(() => vec3(curve.eval(t))));
  const table = options.arcLengthTable ?? sampled?.arcLengthTable ?? buildArcLengthTableFromSamples(
    parameters.map((t, index) => ({ t, point: positions[index] ?? { x: NaN, y: NaN, z: NaN }, valid: finiteVec3(positions[index]) }))
  );
  const span = Math.max(1e-14, curve.domain.tMax - curve.domain.tMin);
  const warnings = [...(sampled?.diagnostics.map((diagnostic) => diagnostic.message) ?? [])];
  const preliminary = parameters.map((t, index) => {
    const position = positions[index];
    const d1Raw = safeEvaluate(() => derivative(curve as never, t) as CurvePoint);
    const d2Raw = safeEvaluate(() => secondDerivative(curve as never, t) as CurvePoint);
    const d3Raw = safeEvaluate(() => thirdDerivative(curve as never, t) as CurvePoint);
    const d1 = d1Raw && finitePoint(d1Raw) ? vec3(d1Raw) : null;
    const d2 = d2Raw && finitePoint(d2Raw) ? vec3(d2Raw) : null;
    const d3 = d3Raw && finitePoint(d3Raw) ? vec3(d3Raw) : null;
    const speed = d1 ? length(d1) : null;
    const valid = finiteVec3(position) && finiteVec3(d1) && finiteVec3(d2) && finiteVec3(d3);
    const regular = valid && speed != null && speed > regularityTolerance;
    const tangent = regular && d1 ? unit(d1) : null;
    const cross12 = regular && d1 && d2 ? cross(d1, d2) : null;
    const crossLength = cross12 ? length(cross12) : 0;
    const curvature = regular && speed && cross12 ? crossLength / Math.pow(speed, 3) : null;
    const signedCurvature = curve.dimension === 2 && regular && speed && d1 && d2
      ? (d1.x * d2.y - d1.y * d2.x) / Math.pow(speed, 3)
      : null;
    const frenetDefined = !!(tangent && curvature != null && curvature > curvatureTolerance && cross12 && crossLength > curvatureTolerance);
    const frenetBinormal = frenetDefined && cross12 ? unit(cross12) : null;
    const frenetNormal = tangent && frenetBinormal ? unit(cross(frenetBinormal, tangent)) : null;
    const torsion = curve.dimension === 2
      ? (regular ? 0 : null)
      : frenetDefined && cross12 && d3
        ? dot(cross12, d3) / Math.max(curvatureTolerance * curvatureTolerance, dot(cross12, cross12))
        : null;
    const radiusOfCurvature = curvature != null && curvature > curvatureTolerance ? 1 / curvature : null;
    return {
      t,
      normalizedParameter: (t - curve.domain.tMin) / span,
      arcLength: parameterToArcLength(table, t),
      normalizedArcLength: table.totalLength > 1e-14 ? parameterToArcLength(table, t) / table.totalLength : 0,
      position: position ?? { x: NaN, y: NaN, z: NaN },
      firstDerivative: d1,
      secondDerivative: d2,
      thirdDerivative: d3,
      speed,
      tangent,
      frenetNormal,
      frenetBinormal,
      curvature,
      signedCurvature,
      torsion,
      radiusOfCurvature,
      regularity: !finiteVec3(position) || !valid ? "invalid" as const : regular ? "regular" as const : "zero-speed" as const,
      frenetDefined,
    };
  });

  let previousTangent: Vec3 | null = null;
  let bishopNormal: Vec3 | null = null;
  const points: CurveDifferentialPoint[] = preliminary.map((row) => {
    if (row.tangent) {
      bishopNormal = !previousTangent || !bishopNormal
        ? deterministicNormal(row.tangent)
        : transportNormal(bishopNormal, previousTangent, row.tangent);
      previousTangent = row.tangent;
    }
    const bishopBinormal = row.tangent && bishopNormal ? unit(cross(row.tangent, bishopNormal)) : null;
    let normalCurvature: number | null = null;
    let geodesicCurvature: number | null = null;
    if (options.surfaceContext && row.frenetNormal && row.curvature != null && row.tangent) {
      const surfaceNormalRaw = safeEvaluate(() => options.surfaceContext!.normalAt(row.t, row.position));
      const surfaceNormal = surfaceNormalRaw && finitePoint(surfaceNormalRaw) ? unit(vec3(surfaceNormalRaw)) : null;
      if (surfaceNormal) {
        const curvatureVector = scale(row.frenetNormal, row.curvature);
        normalCurvature = dot(curvatureVector, surfaceNormal);
        geodesicCurvature = dot(curvatureVector, cross(surfaceNormal, row.tangent));
      }
    }
    const evidenceNormal = row.frenetNormal;
    const evolutePoint = evidenceNormal && row.radiusOfCurvature != null ? add(row.position, scale(evidenceNormal, row.radiusOfCurvature)) : null;
    const combTip = evidenceNormal && row.curvature != null
      ? add(row.position, scale(evidenceNormal, row.curvature * (options.curvatureCombScale ?? 0.25)))
      : null;
    return {
      ...row,
      bishopNormal,
      bishopBinormal,
      bishopFallbackUsed: !row.frenetDefined && !!bishopNormal,
      ambientCurvature: row.curvature,
      normalCurvature,
      geodesicCurvature,
      uncertain: method === "numerical" || !curve.derivative || !curve.secondDerivative || !curve.thirdDerivative,
      evidence: {
        osculatingCircle: evolutePoint && row.radiusOfCurvature != null && row.frenetBinormal
          ? { center: evolutePoint, radius: row.radiusOfCurvature, normal: row.frenetBinormal }
          : null,
        osculatingPlane: row.frenetBinormal ? { point: row.position, normal: row.frenetBinormal } : null,
        normalPlane: row.tangent ? { point: row.position, normal: row.tangent } : null,
        rectifyingPlane: row.frenetNormal ? { point: row.position, normal: row.frenetNormal } : null,
        curvatureComb: combTip ? [row.position, combTip] : null,
        evolutePoint,
      },
    };
  });

  const signedRows = points.map((point) => ({ t: point.t, value: point.signedCurvature }));
  const inflectionParameters: number[] = [];
  for (let index = 1; index < signedRows.length; index += 1) {
    const left = signedRows[index - 1];
    const right = signedRows[index];
    if (left.value == null || right.value == null) continue;
    if (left.value * right.value < 0) {
      const weight = Math.abs(left.value) / (Math.abs(left.value) + Math.abs(right.value));
      inflectionParameters.push(left.t + (right.t - left.t) * weight);
    } else if (Math.abs(right.value) <= curvatureTolerance && Math.abs(left.value) > curvatureTolerance) {
      inflectionParameters.push(right.t);
    }
  }
  const convexityIntervals: CurveSignedInterval[] = [];
  if (points.length) {
    let start = points[0].t;
    let classification = classifySigned(points[0].signedCurvature, curvatureTolerance);
    for (let index = 1; index < points.length; index += 1) {
      const next = classifySigned(points[index].signedCurvature, curvatureTolerance);
      if (next !== classification) {
        convexityIntervals.push({ tMin: start, tMax: points[index].t, classification });
        start = points[index].t;
        classification = next;
      }
    }
    convexityIntervals.push({ tMin: start, tMax: points.at(-1)!.t, classification });
  }

  let totalTurningAngle: number | null = curve.dimension === 2 ? 0 : null;
  if (curve.dimension === 2) {
    const tangents = points.map((point) => point.tangent).filter((value): value is Vec3 => value != null);
    const pairs = curve.domain.closed && tangents.length > 2 ? tangents.length : Math.max(0, tangents.length - 1);
    for (let index = 0; index < pairs; index += 1) {
      const left = tangents[index];
      const right = tangents[(index + 1) % tangents.length];
      totalTurningAngle! += Math.atan2(left.x * right.y - left.y * right.x, left.x * right.x + left.y * right.y);
    }
  }

  let bishopHolonomy: number | null = null;
  if ((curve.domain.closed || curve.domain.periodic) && points.length > 2) {
    const first = points.find((point) => point.tangent && point.bishopNormal);
    const last = [...points].reverse().find((point) => point.tangent && point.bishopNormal);
    if (first?.bishopNormal && first.tangent && last?.bishopNormal) {
      bishopHolonomy = Math.atan2(dot(first.tangent, cross(last.bishopNormal, first.bishopNormal)), dot(last.bishopNormal, first.bishopNormal));
    }
  }
  const invalidCount = points.filter((point) => point.regularity === "invalid").length;
  const zeroSpeedCount = points.filter((point) => point.regularity === "zero-speed").length;
  const fallbackCount = points.filter((point) => point.bishopFallbackUsed).length;
  if (invalidCount) warnings.push(`${invalidCount} differential sample(s) are invalid.`);
  if (zeroSpeedCount) warnings.push(`${zeroSpeedCount} sample(s) have zero or near-zero speed.`);
  if (fallbackCount) warnings.push(`Bishop fallback is used at ${fallbackCount} sample(s) where the Frenet frame is undefined.`);
  if (options.surfaceContext && points.every((point) => point.normalCurvature == null)) warnings.push("Surface context was supplied but no valid surface-normal curvature could be resolved.");

  return {
    kind: "curve-differential-field",
    points,
    validityMask: Uint8Array.from(points.map((point) => point.regularity === "invalid" ? 0 : 1)),
    regularityMask: Uint8Array.from(points.map((point) => point.regularity === "regular" ? 1 : 0)),
    uncertaintyMask: Uint8Array.from(points.map((point) => point.uncertain ? 1 : 0)),
    statistics: {
      speed: statistics(points.map((point) => ({ t: point.t, value: point.speed }))),
      curvature: statistics(points.map((point) => ({ t: point.t, value: point.curvature }))),
      signedCurvature: statistics(signedRows),
      torsion: statistics(points.map((point) => ({ t: point.t, value: point.torsion }))),
    },
    inflectionParameters,
    convexityIntervals,
    totalTurningAngle,
    turningNumber: totalTurningAngle == null ? null : totalTurningAngle / (Math.PI * 2),
    bishopHolonomy,
    warnings: Array.from(new Set(warnings)),
    provenance: {
      method,
      derivativeSource: curve.derivative && curve.secondDerivative && curve.thirdDerivative ? "provided" : curve.derivative || curve.secondDerivative || curve.thirdDerivative ? "mixed" : "numerical",
      units: options.units ?? { position: "scene-unit", parameter: "curve parameter" },
      surfaceDependency: options.surfaceContext?.dependency ?? null,
      regularityTolerance,
      curvatureTolerance,
    },
  };
};
