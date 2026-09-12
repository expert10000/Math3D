import type { AnyCurve } from "@math3d/core";
import type { GeometryAnalyticCurveDefinition } from "../geometry/exactCurveAnalysis";
import type {
  CanonicalCurveDefinition,
  CurveDependency,
  CurveIdentity,
  CurveRepresentation,
  CurveSamplingPolicy,
} from "./contracts";
import { adaptCurveDefinition } from "./infrastructure";

const representationForCoreCurve = (curve: AnyCurve): CurveRepresentation => {
  if (curve.kind === "bezier") return "bezier";
  if (curve.kind === "bspline") return "b-spline";
  if (curve.kind === "nurbs") return "nurbs";
  if (curve.kind === "polyline") return "polyline";
  if (curve.family === "explicit") return "explicit";
  if (curve.family === "implicit") return "implicit";
  return "parametric";
};

export const adaptCoreCurveDefinition = (
  curve: AnyCurve,
  options: {
    revision?: number;
    sourceModule?: CurveIdentity["sourceModule"];
    formulas?: { x: string; y: string; z?: string };
    sampling?: Partial<CurveSamplingPolicy>;
    dependencies?: readonly CurveDependency[];
    units?: { position: string; parameter: string };
  } = {}
): CanonicalCurveDefinition => {
  const representation = representationForCoreCurve(curve);
  const common = {
    id: curve.id,
    revision: options.revision ?? 1,
    label: curve.name,
    dimension: curve.dimension,
    domain: {
      parameter: "t",
      min: curve.domain.tMin,
      max: curve.domain.tMax,
      closed: Boolean(curve.domain.closed),
      periodic: Boolean(curve.domain.closed),
    },
    sampling: options.sampling,
    sourceModule: options.sourceModule ?? "curves" as const,
    dependencies: options.dependencies,
    units: options.units ? { ...options.units, angle: "rad" as const } : undefined,
    derivatives: {
      position: "provided" as const,
      first: curve.derivative ? "provided" as const : "sampled" as const,
      second: curve.secondDerivative ? "provided" as const : "sampled" as const,
      third: "sampled" as const,
      arcLength: curve.arcLength ? "closed-form" as const : "quadrature" as const,
    },
  };
  if (representation === "bezier") return adaptCurveDefinition({ ...common, representation, controlPoints: [], degree: undefined });
  if (representation === "b-spline") return adaptCurveDefinition({ ...common, representation, controlPoints: [], degree: 0, knots: [] });
  if (representation === "nurbs") return adaptCurveDefinition({ ...common, representation, controlPoints: [], degree: 0, knots: [], weights: [] });
  if (representation === "polyline") return adaptCurveDefinition({ ...common, representation, points: [], sourceLabel: curve.subtype ?? "polyline" });
  if (representation === "explicit") return adaptCurveDefinition({ ...common, representation, formula: options.formulas?.y ?? curve.subtype ?? "source evaluator" });
  if (representation === "implicit") return adaptCurveDefinition({ ...common, representation, formula: options.formulas?.y ?? curve.subtype ?? "source evaluator" });
  return adaptCurveDefinition({
    ...common,
    representation: "parametric",
    familyId: curve.subtype ?? curve.kind,
    expressions: options.formulas ?? { x: "source evaluator", y: "source evaluator", ...(curve.dimension === 3 ? { z: "source evaluator" } : {}) },
  });
};

export const adaptGeometryExactCurveDefinition = (
  definition: GeometryAnalyticCurveDefinition,
  options: { sourceModule?: CurveIdentity["sourceModule"]; dependencies?: readonly CurveDependency[] } = {}
): CanonicalCurveDefinition => adaptCurveDefinition({
  id: definition.id,
  revision: definition.revision,
  label: definition.label,
  representation: "parametric",
  dimension: definition.dimension,
  expressions: { x: definition.formula[0], y: definition.formula[1], z: definition.formula[2] },
  familyId: "geometry-exact",
  domain: {
    parameter: definition.parameter,
    min: definition.domain.min,
    max: definition.domain.max,
    closed: definition.domain.closed,
    periodic: definition.domain.closed,
  },
  units: { position: definition.units.position, parameter: definition.units.parameter, angle: "rad" },
  orientation: { convention: "source-defined", description: definition.orientation },
  derivatives: {
    position: "exact",
    first: definition.capabilities.first,
    second: definition.capabilities.second,
    third: definition.capabilities.third,
    arcLength: definition.capabilities.arcLength === "closed-form" ? "closed-form" : "quadrature",
  },
  sampling: { strategy: "adaptive", tolerance: 1e-9, minimumSamples: 16, maximumSamples: 4096, maximumDepth: 18 },
  sourceModule: options.sourceModule ?? "geometry",
  dependencies: options.dependencies,
  warnings: definition.breakpoints?.length ? ["Piecewise transitions require one-sided inspection."] : [],
});
