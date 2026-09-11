import type {
  CanonicalSurfaceDefinition,
  SurfaceAnalysisMethod,
  SurfaceAnalysisPayload,
  SurfaceCurvatureClass,
  SurfaceLocalProbePayload,
  SurfaceProbeDomainCoordinate,
} from "./contracts";
import type { SurfaceDifferentialPoint, SurfaceDifferentialVec3 } from "./differentialGeometry";
import { classifySurfaceCurvature } from "./surfaceCurvature";

type Vec3 = readonly [number, number, number];

export type SurfaceLocalProbeSource = {
  probeId: string;
  domainCoordinate: SurfaceProbeDomainCoordinate;
  position: Vec3;
  normal?: Vec3 | null;
  tangentBasis?: readonly [Vec3, Vec3] | null;
  firstFundamentalForm?: readonly [number, number, number] | null;
  secondFundamentalForm?: readonly [number, number, number] | null;
  gaussianCurvature?: number | null;
  meanCurvature?: number | null;
  principalCurvatures?: readonly [number, number] | null;
  principalDirections?: readonly [Vec3, Vec3] | null;
  valid?: boolean;
  uncertain?: boolean;
  umbilic?: boolean;
  mapping?: SurfaceLocalProbePayload["mapping"];
  missing?: Readonly<Record<string, string>>;
};

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const finiteVec = (value: Vec3 | null | undefined): value is Vec3 => !!value && value.every(Number.isFinite);
const normalize = (value: Vec3): Vec3 => {
  const length = Math.hypot(...value);
  return length > 1e-15 ? [value[0] / length, value[1] / length, value[2] / length] : [Number.NaN, Number.NaN, Number.NaN];
};
const cross = (left: Vec3, right: Vec3): Vec3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

export const deterministicTangentBasis = (normal: Vec3): readonly [Vec3, Vec3] | null => {
  const n = normalize(normal);
  if (!finiteVec(n)) return null;
  const reference: Vec3 = Math.abs(n[2]) < 0.85 ? [0, 0, 1] : [0, 1, 0];
  const first = normalize(cross(reference, n));
  const second = normalize(cross(n, first));
  return finiteVec(first) && finiteVec(second) ? [first, second] : null;
};

export const evaluateEulerNormalCurvature = (
  principalCurvatures: readonly [number, number] | null | undefined,
  principalDirections: readonly [Vec3, Vec3] | null | undefined,
  angleDeg: number
): SurfaceLocalProbePayload["normalCurvature"] => {
  const angle = Number.isFinite(angleDeg) ? angleDeg : 0;
  const radians = angle * Math.PI / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  if (!principalCurvatures || !principalCurvatures.every(Number.isFinite)) {
    return { angleDeg: angle, value: null, formula: "k_n(θ) = k1 cos²θ + k2 sin²θ", direction: null };
  }
  const direction = principalDirections && finiteVec(principalDirections[0]) && finiteVec(principalDirections[1])
    ? normalize([
      c * principalDirections[0][0] + s * principalDirections[1][0],
      c * principalDirections[0][1] + s * principalDirections[1][1],
      c * principalDirections[0][2] + s * principalDirections[1][2],
    ])
    : null;
  return {
    angleDeg: angle,
    value: principalCurvatures[0] * c * c + principalCurvatures[1] * s * s,
    formula: "k_n(θ) = k1 cos²θ + k2 sin²θ",
    direction,
  };
};

export const createSurfaceLocalProbe = (
  source: SurfaceLocalProbeSource,
  angleDeg = 0
): SurfaceLocalProbePayload => {
  const missing: Record<string, string> = { ...(source.missing ?? {}) };
  const recordMissing = (key: string, available: boolean, reason: string) => { if (!available && !missing[key]) missing[key] = reason; };
  const valid = source.valid !== false && finiteVec(source.position);
  const normal = finiteVec(source.normal) ? normalize(source.normal) : null;
  const tangentBasis = source.tangentBasis && finiteVec(source.tangentBasis[0]) && finiteVec(source.tangentBasis[1])
    ? [normalize(source.tangentBasis[0]), normalize(source.tangentBasis[1])] as const
    : normal ? deterministicTangentBasis(normal) : null;
  const principalCurvatures = source.principalCurvatures?.every(Number.isFinite) ? source.principalCurvatures : null;
  const umbilic = !!source.umbilic || !!principalCurvatures && Math.abs(principalCurvatures[0] - principalCurvatures[1]) <= Math.max(1e-9, 1e-5 * Math.max(Math.abs(principalCurvatures[0]), Math.abs(principalCurvatures[1])));
  const principalDirections = !umbilic && !source.uncertain && source.principalDirections && finiteVec(source.principalDirections[0]) && finiteVec(source.principalDirections[1])
    ? [normalize(source.principalDirections[0]), normalize(source.principalDirections[1])] as const
    : null;
  const classification: SurfaceCurvatureClass = principalCurvatures
    ? classifySurfaceCurvature({ k1: principalCurvatures[0], k2: principalCurvatures[1], valid, umbilic })
    : valid ? "invalid" : "invalid";
  const K = finite(source.gaussianCurvature) ? source.gaussianCurvature : principalCurvatures ? principalCurvatures[0] * principalCurvatures[1] : null;
  const H = finite(source.meanCurvature) ? source.meanCurvature : principalCurvatures ? (principalCurvatures[0] + principalCurvatures[1]) / 2 : null;
  const shapeIndex = principalCurvatures && classification !== "flat"
    ? Math.abs(principalCurvatures[0] - principalCurvatures[1]) <= 1e-12
      ? Math.sign(principalCurvatures[0] + principalCurvatures[1])
      : (2 / Math.PI) * Math.atan((principalCurvatures[0] + principalCurvatures[1]) / (principalCurvatures[0] - principalCurvatures[1]))
    : classification === "flat" ? 0 : null;
  const curvedness = principalCurvatures ? Math.sqrt(0.5 * (principalCurvatures[0] ** 2 + principalCurvatures[1] ** 2)) : null;
  recordMissing("normal", !!normal, "No reliable oriented normal is available at this represented point.");
  recordMissing("tangentBasis", !!tangentBasis, "A tangent basis requires a reliable normal or source derivatives.");
  recordMissing("firstFundamentalForm", !!source.firstFundamentalForm, "The active represented source did not publish first-form coefficients.");
  recordMissing("secondFundamentalForm", !!source.secondFundamentalForm, "The active represented source did not publish second-form coefficients.");
  recordMissing("curvature", !!principalCurvatures && K != null && H != null, "Curvature is unavailable at this point or source revision.");
  recordMissing("principalDirections", !!principalDirections, umbilic ? "Principal directions are undefined at an umbilic." : source.uncertain ? "Principal directions are suppressed because this sample is uncertain." : "The source did not publish stable principal directions.");
  const normalCurvature = evaluateEulerNormalCurvature(principalCurvatures, principalDirections, angleDeg);
  return {
    kind: "local-probe",
    probeId: source.probeId,
    domainCoordinate: source.domainCoordinate,
    position: source.position,
    normal,
    tangentBasis,
    firstFundamentalForm: source.firstFundamentalForm ?? null,
    secondFundamentalForm: source.secondFundamentalForm ?? null,
    gaussianCurvature: K,
    meanCurvature: H,
    principalCurvatures,
    principalDirections,
    shapeIndex,
    curvedness,
    classification,
    normalCurvature,
    mapping: { ...(source.mapping ?? {}) },
    evidence: {
      tangentPlane: !!normal && !!tangentBasis,
      normal: !!normal,
      principalAxes: !!principalDirections,
      normalSection: !!normal && !!normalCurvature.direction,
      osculatingCircle: !!normal && !!normalCurvature.direction && finite(normalCurvature.value) && Math.abs(normalCurvature.value) > 1e-12,
    },
    missing,
    valid,
  };
};

export const createSurfaceLocalProbeFromDifferential = (
  probeId: string,
  point: SurfaceDifferentialPoint,
  angleDeg = 0
): SurfaceLocalProbePayload => createSurfaceLocalProbe({
  probeId,
  domainCoordinate: point.parameter ? { kind: "uv", u: point.parameter[0], v: point.parameter[1] } : { kind: "world" },
  position: point.jet?.position ?? [Number.NaN, Number.NaN, Number.NaN],
  normal: point.normal,
  tangentBasis: point.tangentBasis,
  firstFundamentalForm: point.firstFundamentalForm ? [point.firstFundamentalForm.E, point.firstFundamentalForm.F, point.firstFundamentalForm.G] : null,
  secondFundamentalForm: point.secondFundamentalForm ? [point.secondFundamentalForm.L, point.secondFundamentalForm.M, point.secondFundamentalForm.N] : null,
  gaussianCurvature: point.gaussianCurvature,
  meanCurvature: point.meanCurvature,
  principalCurvatures: point.principalCurvatures,
  principalDirections: point.principalDirections,
  valid: point.masks.valid,
  uncertain: point.masks.uncertain || point.masks.degenerate || point.masks.singular,
  umbilic: point.masks.umbilic,
}, angleDeg);

export const createSurfaceProbePayload = (args: {
  definition: CanonicalSurfaceDefinition;
  method: SurfaceAnalysisMethod;
  probe: SurfaceLocalProbePayload;
  warnings?: readonly string[];
}): SurfaceAnalysisPayload => ({
  version: 1,
  surfaceId: args.definition.identity.surfaceId,
  surfaceRevision: args.definition.identity.surfaceRevision,
  representation: args.definition.representation,
  method: args.definition.representation === "mesh-backed" ? "mesh-approximation" : args.method,
  units: args.definition.units,
  orientation: args.definition.orientation,
  warnings: [...new Set([...args.definition.warnings, ...(args.warnings ?? [])])],
  data: args.probe,
});

export const compareSurfaceLocalProbes = (left: SurfaceLocalProbePayload, right: SurfaceLocalProbePayload) => ({
  distance: Math.hypot(...left.position.map((value, index) => value - right.position[index])),
  gaussianCurvatureDelta: left.gaussianCurvature != null && right.gaussianCurvature != null ? right.gaussianCurvature - left.gaussianCurvature : null,
  meanCurvatureDelta: left.meanCurvature != null && right.meanCurvature != null ? right.meanCurvature - left.meanCurvature : null,
  classificationChanged: left.classification !== right.classification,
});
