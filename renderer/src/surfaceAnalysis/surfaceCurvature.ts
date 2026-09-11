import { summarizeAnalysisScalarField } from "../analysis/statistics";
import type {
  CanonicalSurfaceDefinition,
  SurfaceAnalysisMethod,
  SurfaceAnalysisPayload,
  SurfaceCurvatureClass,
  SurfaceCurvatureFieldPayload,
  SurfaceCurvatureStatistics,
} from "./contracts";
import type { SurfaceDifferentialPoint, SurfaceDifferentialVec3 } from "./differentialGeometry";

export const SURFACE_CURVATURE_CLASSES: readonly SurfaceCurvatureClass[] = [
  "invalid", "flat", "elliptic", "hyperbolic", "parabolic", "umbilic",
];

const CLASS_CODE = new Map(SURFACE_CURVATURE_CLASSES.map((classification, index) => [classification, index]));

export type SurfaceCurvatureFieldSource = {
  sampleCount: number;
  parameters?: ArrayLike<number>;
  positions?: ArrayLike<number>;
  K: ArrayLike<number>;
  H: ArrayLike<number>;
  k1: ArrayLike<number>;
  k2: ArrayLike<number>;
  d1?: ArrayLike<number>;
  d2?: ArrayLike<number>;
  validityMask?: ArrayLike<number | boolean>;
  uncertaintyMask?: ArrayLike<number | boolean>;
  degeneracyMask?: ArrayLike<number | boolean>;
  singularityMask?: ArrayLike<number | boolean>;
  umbilicMask?: ArrayLike<number | boolean>;
  directionValidityMask?: ArrayLike<number | boolean>;
};

export type SurfaceCurvatureOptions = {
  absoluteTolerance?: number;
  relativeTolerance?: number;
  histogramBins?: number;
  palette?: string;
  inverted?: boolean;
  rangeMode?: "automatic" | "manual" | "percentile" | "symmetric";
  range?: { min: number; max: number } | null;
  percentileRange?: readonly [number, number];
  lengthUnit?: string;
};

const finite = (value: number) => Number.isFinite(value);
const read = (values: ArrayLike<number>, index: number) => Number(values[index]);
const maskAt = (mask: ArrayLike<number | boolean> | undefined, index: number, fallback: boolean) => mask ? Boolean(mask[index]) : fallback;
const finiteDirection = (values: ArrayLike<number> | undefined, index: number) => !!values &&
  finite(read(values, index * 3)) && finite(read(values, index * 3 + 1)) && finite(read(values, index * 3 + 2));

export const classifySurfaceCurvature = (args: {
  k1: number;
  k2: number;
  valid?: boolean;
  umbilic?: boolean;
  absoluteTolerance?: number;
  relativeTolerance?: number;
}): SurfaceCurvatureClass => {
  if (args.valid === false || !finite(args.k1) || !finite(args.k2)) return "invalid";
  const absoluteTolerance = Math.max(0, args.absoluteTolerance ?? 1e-9);
  const relativeTolerance = Math.max(0, args.relativeTolerance ?? 1e-5);
  const curvatureScale = Math.max(Math.abs(args.k1), Math.abs(args.k2));
  const tolerance = Math.max(absoluteTolerance, relativeTolerance * curvatureScale);
  const difference = Math.abs(args.k1 - args.k2);
  if (Math.abs(args.k1) <= tolerance && Math.abs(args.k2) <= tolerance) return "flat";
  if (args.umbilic || (curvatureScale > tolerance && difference <= tolerance)) return "umbilic";
  if (Math.abs(args.k1 * args.k2) <= tolerance * Math.max(tolerance, curvatureScale)) return "parabolic";
  return args.k1 * args.k2 > 0 ? "elliptic" : "hyperbolic";
};

const statistic = (
  values: Float64Array,
  valid: Uint8Array,
  bins: number
): SurfaceCurvatureStatistics | null => {
  const summary = summarizeAnalysisScalarField(values, valid, bins);
  if (!summary) return null;
  let sumSquares = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (valid[index] && finite(values[index])) sumSquares += values[index] * values[index];
  }
  return { ...summary, rms: Math.sqrt(sumSquares / summary.count) };
};

const copyVector = (target: Float64Array, targetOffset: number, source: ArrayLike<number> | undefined, sourceOffset: number) => {
  target[targetOffset] = source ? read(source, sourceOffset) : Number.NaN;
  target[targetOffset + 1] = source ? read(source, sourceOffset + 1) : Number.NaN;
  target[targetOffset + 2] = source ? read(source, sourceOffset + 2) : Number.NaN;
};

export const createSurfaceCurvatureField = (
  source: SurfaceCurvatureFieldSource,
  options: SurfaceCurvatureOptions = {}
): SurfaceCurvatureFieldPayload => {
  const count = Math.max(0, Math.round(source.sampleCount));
  if (![source.K, source.H, source.k1, source.k2].every((values) => values.length === count)) {
    throw new Error("Curvature scalar arrays must match sampleCount.");
  }
  if (source.d1 && source.d1.length !== count * 3 || source.d2 && source.d2.length !== count * 3) {
    throw new Error("Principal-direction arrays must contain three components per sample.");
  }
  const parameters = new Float64Array(count * 2).fill(Number.NaN);
  const positions = new Float64Array(count * 3).fill(Number.NaN);
  const gaussianCurvature = new Float64Array(count).fill(Number.NaN);
  const meanCurvature = new Float64Array(count).fill(Number.NaN);
  const principalCurvatures = new Float64Array(count * 2).fill(Number.NaN);
  const principalDirections = new Float64Array(count * 6).fill(Number.NaN);
  const shapeIndex = new Float64Array(count).fill(Number.NaN);
  const curvedness = new Float64Array(count).fill(Number.NaN);
  const classificationCodes = new Uint8Array(count);
  const validityMask = new Uint8Array(count);
  const uncertaintyMask = new Uint8Array(count);
  const directionValidityMask = new Uint8Array(count);
  const regionLists = new Map(SURFACE_CURVATURE_CLASSES.map((classification) => [classification, [] as number[]]));
  const classificationCounts = Object.fromEntries(SURFACE_CURVATURE_CLASSES.map((classification) => [classification, 0])) as Record<SurfaceCurvatureClass, number>;
  for (let index = 0; index < count; index += 1) {
    if (source.parameters?.length === count * 2) {
      parameters[index * 2] = read(source.parameters, index * 2);
      parameters[index * 2 + 1] = read(source.parameters, index * 2 + 1);
    }
    copyVector(positions, index * 3, source.positions?.length === count * 3 ? source.positions : undefined, index * 3);
    const K = read(source.K, index);
    const H = read(source.H, index);
    const rawK1 = read(source.k1, index);
    const rawK2 = read(source.k2, index);
    const k1 = Math.max(rawK1, rawK2);
    const k2 = Math.min(rawK1, rawK2);
    const scalarsFinite = [K, H, k1, k2].every(finite);
    const valid = scalarsFinite && maskAt(source.validityMask, index, true) &&
      !maskAt(source.degeneracyMask, index, false) && !maskAt(source.singularityMask, index, false);
    const uncertain = maskAt(source.uncertaintyMask, index, false);
    const curvatureScale = Math.max(Math.abs(k1), Math.abs(k2));
    const tolerance = Math.max(options.absoluteTolerance ?? 1e-9, (options.relativeTolerance ?? 1e-5) * curvatureScale);
    const umbilic = valid && (maskAt(source.umbilicMask, index, false) || (curvatureScale > tolerance && Math.abs(k1 - k2) <= tolerance));
    const classification = classifySurfaceCurvature({ k1, k2, valid, umbilic, ...options });
    classificationCodes[index] = CLASS_CODE.get(classification) ?? 0;
    classificationCounts[classification] += 1;
    regionLists.get(classification)!.push(index);
    validityMask[index] = Number(valid);
    uncertaintyMask[index] = Number(uncertain);
    if (!valid) continue;
    gaussianCurvature[index] = K;
    meanCurvature[index] = H;
    principalCurvatures[index * 2] = k1;
    principalCurvatures[index * 2 + 1] = k2;
    const directionsValid = !umbilic && !uncertain &&
      maskAt(source.directionValidityMask, index, true) && finiteDirection(source.d1, index) && finiteDirection(source.d2, index);
    directionValidityMask[index] = Number(directionsValid);
    if (directionsValid) {
      copyVector(principalDirections, index * 6, source.d1, index * 3);
      copyVector(principalDirections, index * 6 + 3, source.d2, index * 3);
    }
    if (classification !== "flat") {
      const denominator = k1 - k2;
      shapeIndex[index] = Math.abs(denominator) <= tolerance
        ? Math.sign(k1 + k2)
        : (2 / Math.PI) * Math.atan((k1 + k2) / denominator);
    }
    curvedness[index] = Math.sqrt(0.5 * (k1 * k1 + k2 * k2));
  }
  const bins = options.histogramBins ?? 12;
  const k1Values = new Float64Array(count);
  const k2Values = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    k1Values[index] = principalCurvatures[index * 2];
    k2Values[index] = principalCurvatures[index * 2 + 1];
  }
  return {
    kind: "curvature",
    sampleCount: count,
    parameters,
    positions,
    gaussianCurvature,
    meanCurvature,
    principalCurvatures,
    principalDirections,
    shapeIndex,
    curvedness,
    classificationCodes,
    classificationLabels: SURFACE_CURVATURE_CLASSES,
    classificationCounts,
    regions: SURFACE_CURVATURE_CLASSES.map((classification) => ({ classification, indices: Uint32Array.from(regionLists.get(classification)!) })),
    validityMask,
    uncertaintyMask,
    directionValidityMask,
    validDomainCount: validityMask.reduce((sum, value) => sum + value, 0),
    units: {
      K: `${options.lengthUnit ?? "unit"}^-2`,
      H: `${options.lengthUnit ?? "unit"}^-1`,
      k1: `${options.lengthUnit ?? "unit"}^-1`,
      k2: `${options.lengthUnit ?? "unit"}^-1`,
      shapeIndex: "1",
      curvedness: `${options.lengthUnit ?? "unit"}^-1`,
      d1: "unit-vector",
      d2: "unit-vector",
    },
    statistics: {
      K: statistic(gaussianCurvature, validityMask, bins),
      H: statistic(meanCurvature, validityMask, bins),
      k1: statistic(k1Values, validityMask, bins),
      k2: statistic(k2Values, validityMask, bins),
      shapeIndex: statistic(shapeIndex, validityMask, bins),
      curvedness: statistic(curvedness, validityMask, bins),
    },
    display: {
      palette: options.palette ?? "blueRed",
      inverted: options.inverted ?? false,
      rangeMode: options.rangeMode ?? "automatic",
      range: options.range ?? null,
      percentileRange: options.percentileRange ?? [2, 98],
    },
  };
};

const flattenVectors = (samples: readonly SurfaceDifferentialPoint[], selector: (sample: SurfaceDifferentialPoint) => SurfaceDifferentialVec3 | null) => {
  const values = new Float64Array(samples.length * 3).fill(Number.NaN);
  samples.forEach((sample, index) => {
    const value = selector(sample);
    if (value) values.set(value, index * 3);
  });
  return values;
};

export const createSurfaceCurvatureFieldFromDifferential = (
  samples: readonly SurfaceDifferentialPoint[],
  options: SurfaceCurvatureOptions = {}
): SurfaceCurvatureFieldPayload => createSurfaceCurvatureField({
  sampleCount: samples.length,
  parameters: samples.flatMap((sample) => sample.parameter ?? [Number.NaN, Number.NaN]),
  positions: flattenVectors(samples, (sample) => sample.jet?.position ?? null),
  K: samples.map((sample) => sample.gaussianCurvature ?? Number.NaN),
  H: samples.map((sample) => sample.meanCurvature ?? Number.NaN),
  k1: samples.map((sample) => sample.principalCurvatures?.[0] ?? Number.NaN),
  k2: samples.map((sample) => sample.principalCurvatures?.[1] ?? Number.NaN),
  d1: flattenVectors(samples, (sample) => sample.principalDirections?.[0] ?? null),
  d2: flattenVectors(samples, (sample) => sample.principalDirections?.[1] ?? null),
  validityMask: samples.map((sample) => sample.masks.valid),
  uncertaintyMask: samples.map((sample) => sample.masks.uncertain),
  degeneracyMask: samples.map((sample) => sample.masks.degenerate),
  singularityMask: samples.map((sample) => sample.masks.singular),
  umbilicMask: samples.map((sample) => sample.masks.umbilic),
}, options);

export const createSurfaceCurvaturePayload = (args: {
  definition: CanonicalSurfaceDefinition;
  method: SurfaceAnalysisMethod;
  field: SurfaceCurvatureFieldPayload;
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
  data: {
    ...args.field,
    units: {
      K: `${args.definition.units.length}^-2`, H: `${args.definition.units.length}^-1`,
      k1: `${args.definition.units.length}^-1`, k2: `${args.definition.units.length}^-1`,
      shapeIndex: "1", curvedness: `${args.definition.units.length}^-1`, d1: "unit-vector", d2: "unit-vector",
    },
  },
});

export const surfaceCurvatureRegionIndices = (
  field: SurfaceCurvatureFieldPayload,
  classification: SurfaceCurvatureClass
): Uint32Array => field.regions.find((region) => region.classification === classification)?.indices ?? new Uint32Array();
