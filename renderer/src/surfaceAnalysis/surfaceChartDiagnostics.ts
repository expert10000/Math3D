import type { CanonicalSurfaceDefinition, SurfaceAnalysisMethod, SurfaceAnalysisPayload, SurfaceAxisDomain, SurfaceChartPayload } from "./contracts";

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];

export type SurfaceChartSample = {
  parameter: Vec2;
  position: Vec3;
  normal?: Vec3 | null;
};

const finite2 = (value: Vec2) => value.every(Number.isFinite);
const finite3 = (value: Vec3) => value.every(Number.isFinite);
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (value: Vec3, amount: number): Vec3 => [value[0] * amount, value[1] * amount, value[2] * amount];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (value: Vec3) => Math.hypot(...value);
const quantized = (value: number) => Number.isFinite(value) ? value.toPrecision(12) : "invalid";
const median = (values: readonly number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) * 0.5;
};
const stats = (values: ArrayLike<number>, valid: ArrayLike<number>) => {
  let min = Infinity; let max = -Infinity; let sum = 0; let count = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    if (!valid[index] || !Number.isFinite(value)) continue;
    min = Math.min(min, value); max = Math.max(max, value); sum += value; count += 1;
  }
  return count ? { min, max, mean: sum / count, count } : null;
};
const indicesWhere = (mask: ArrayLike<number>) => Uint32Array.from(Array.from({ length: mask.length }, (_, index) => index).filter((index) => !!mask[index]));

const axisDomain = (definition: CanonicalSurfaceDefinition, axis: "u" | "v", samples: readonly SurfaceChartSample[]): SurfaceAxisDomain => {
  if (definition.domain.kind === "parameter") return definition.domain[axis];
  if (definition.domain.kind === "graph") return axis === "u" ? definition.domain.x : definition.domain.y;
  const component = axis === "u" ? 0 : 1;
  const values = samples.map((sample) => sample.parameter[component]).filter(Number.isFinite);
  return { min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 1, label: axis };
};

const derivatives = (samples: readonly SurfaceChartSample[]) => {
  const byU = new Map<string, number[]>();
  const byV = new Map<string, number[]>();
  samples.forEach((sample, index) => {
    const uKey = quantized(sample.parameter[0]); const vKey = quantized(sample.parameter[1]);
    byU.set(uKey, [...(byU.get(uKey) ?? []), index]);
    byV.set(vKey, [...(byV.get(vKey) ?? []), index]);
  });
  byU.forEach((row) => row.sort((a, b) => samples[a].parameter[1] - samples[b].parameter[1]));
  byV.forEach((row) => row.sort((a, b) => samples[a].parameter[0] - samples[b].parameter[0]));
  const derivative = (index: number, group: readonly number[], component: 0 | 1): Vec3 | null => {
    const at = group.indexOf(index);
    if (at < 0 || group.length < 2) return null;
    const before = at > 0 ? group[at - 1] : group[at];
    const after = at + 1 < group.length ? group[at + 1] : group[at];
    if (before === after) return null;
    const delta = samples[after].parameter[component] - samples[before].parameter[component];
    if (!Number.isFinite(delta) || Math.abs(delta) <= 1e-15) return null;
    return scale(subtract(samples[after].position, samples[before].position), 1 / delta);
  };
  return samples.map((sample, index) => ({
    du: derivative(index, byV.get(quantized(sample.parameter[1])) ?? [], 0),
    dv: derivative(index, byU.get(quantized(sample.parameter[0])) ?? [], 1),
  }));
};

const surfaceBoundaryLines = (samples: readonly SurfaceChartSample[], u: SurfaceAxisDomain, v: SurfaceAxisDomain) => {
  const uSpan = Math.max(1e-12, Math.abs(u.max - u.min)); const vSpan = Math.max(1e-12, Math.abs(v.max - v.min));
  const uTol = uSpan * 1e-7; const vTol = vSpan * 1e-7;
  const line = (filter: (sample: SurfaceChartSample) => boolean, component: 0 | 1) => samples.filter(filter).sort((a, b) => a.parameter[component] - b.parameter[component]).map((sample) => sample.position);
  return [
    line((sample) => Math.abs(sample.parameter[0] - u.min) <= uTol, 1),
    line((sample) => Math.abs(sample.parameter[0] - u.max) <= uTol, 1),
    line((sample) => Math.abs(sample.parameter[1] - v.min) <= vTol, 0),
    line((sample) => Math.abs(sample.parameter[1] - v.max) <= vTol, 0),
  ].filter((entry) => entry.length >= 2);
};

export const createSurfaceChartDiagnostics = (args: {
  definition: CanonicalSurfaceDefinition;
  samples: readonly SurfaceChartSample[];
  overlayVisibility?: Partial<Record<"boundary" | "seam" | "orientation-flip" | "degenerate", boolean>>;
}): SurfaceChartPayload => {
  const samples = args.samples.filter((sample) => finite2(sample.parameter) && finite3(sample.position));
  const count = samples.length;
  const parameterCoordinates = new Float64Array(count * 2); const positions = new Float64Array(count * 3);
  samples.forEach((sample, index) => { parameterCoordinates.set(sample.parameter, index * 2); positions.set(sample.position, index * 3); });
  const u = axisDomain(args.definition, "u", samples); const v = axisDomain(args.definition, "v", samples);
  const local = derivatives(samples);
  const raw = local.map(({ du, dv }) => du && dv ? Math.max(0, dot(du, du) * dot(dv, dv) - dot(du, dv) ** 2) : NaN);
  const positive = raw.filter((value) => Number.isFinite(value) && value > 0);
  const referenceDeterminant = median(positive) ?? 1;
  const determinantThreshold = Math.max(1e-18, referenceDeterminant * 1e-10);
  const nearDeterminant = determinantThreshold * 100;
  const metricDeterminant = Float64Array.from(raw); const areaScale = new Float64Array(count).fill(NaN);
  const jacobianRank = new Uint8Array(count); const orientationSign = new Int8Array(count);
  const validityMask = new Uint8Array(count); const degeneracyMask = new Uint8Array(count); const nearDegeneracyMask = new Uint8Array(count); const orientationFlipMask = new Uint8Array(count);
  const angleDistortion = new Float64Array(count).fill(NaN);
  local.forEach(({ du, dv }, index) => {
    if (!du || !dv) return;
    const E = dot(du, du); const F = dot(du, dv); const G = dot(dv, dv); const determinant = metricDeterminant[index];
    const rank = E <= determinantThreshold && G <= determinantThreshold ? 0 : determinant <= determinantThreshold ? 1 : 2;
    jacobianRank[index] = rank; degeneracyMask[index] = Number(rank < 2); nearDegeneracyMask[index] = Number(rank === 2 && determinant <= nearDeterminant);
    if (rank < 2) return;
    validityMask[index] = 1; areaScale[index] = Math.sqrt(determinant);
    const cosine = Math.max(-1, Math.min(1, F / Math.sqrt(E * G)));
    angleDistortion[index] = Math.abs(Math.acos(cosine) - Math.PI / 2);
    const normal = samples[index].normal;
    const signed = normal && finite3(normal) ? Math.sign(dot(cross(du, dv), normal)) : args.definition.orientation.sign;
    orientationSign[index] = signed;
    orientationFlipMask[index] = Number(signed !== 0 && signed !== args.definition.orientation.sign);
  });
  const areaReference = median(Array.from(areaScale).filter(Number.isFinite));
  const areaDistortion = Float64Array.from(areaScale, (value) => Number.isFinite(value) && areaReference ? value / areaReference : NaN);
  const invalidMask = Uint8Array.from(validityMask, (value) => Number(!value));
  const boundaryParameter: Vec2[][] = [
    [[u.min, v.min], [u.min, v.max]], [[u.max, v.min], [u.max, v.max]],
    [[u.min, v.min], [u.max, v.min]], [[u.min, v.max], [u.max, v.max]],
  ];
  const boundarySurface = surfaceBoundaryLines(samples, u, v);
  const seamParameter: Vec2[][] = [];
  if (u.periodic) seamParameter.push([[u.min, v.min], [u.min, v.max]], [[u.max, v.min], [u.max, v.max]]);
  if (v.periodic) seamParameter.push([[u.min, v.min], [u.max, v.min]], [[u.min, v.max], [u.max, v.max]]);
  const pointLines = (indices: Uint32Array): Vec3[][] => Array.from(indices, (index) => [samples[index].position, samples[index].position]);
  const visibility = { boundary: true, seam: true, "orientation-flip": true, degenerate: true, ...args.overlayVisibility };
  const flip = indicesWhere(orientationFlipMask); const degenerate = indicesWhere(degeneracyMask); const nearDegenerateIndices = indicesWhere(nearDegeneracyMask);
  const degenerateOverlayIndices = Uint32Array.from([...degenerate, ...nearDegenerateIndices]);
  return {
    kind: "chart", chartId: `${args.definition.identity.key}:chart:primary`, sampleCount: count, parameterCoordinates, positions,
    domain: { u, v, boundaryKinds: ["domain"], periodicSeams: [...(u.periodic ? ["u" as const] : []), ...(v.periodic ? ["v" as const] : [])] },
    jacobianRank, orientationSign, metricDeterminant, areaScale, areaDistortion, angleDistortion, validityMask, degeneracyMask, nearDegeneracyMask, orientationFlipMask,
    thresholds: { determinant: determinantThreshold, nearDeterminant },
    references: { area: "areaScale / median(valid areaScale)", angle: "|angle(∂u,∂v) - π/2| in radians", areaScaleMedian: areaReference },
    statistics: { metricDeterminant: stats(metricDeterminant, validityMask), areaScale: stats(areaScale, validityMask), areaDistortion: stats(areaDistortion, validityMask), angleDistortion: stats(angleDistortion, validityMask) },
    regions: { invalid: indicesWhere(invalidMask), degenerate, nearDegenerate: nearDegenerateIndices, orientationFlip: flip },
    overlays: [
      { kind: "boundary", label: "Chart boundary", visible: visibility.boundary, parameterPolylines: boundaryParameter, surfacePolylines: boundarySurface, sampleIndices: new Uint32Array() },
      { kind: "seam", label: "Periodic seams", visible: visibility.seam, parameterPolylines: seamParameter, surfacePolylines: (u.periodic || v.periodic) ? boundarySurface : [], sampleIndices: new Uint32Array() },
      { kind: "orientation-flip", label: "Orientation flips", visible: visibility["orientation-flip"], parameterPolylines: [], surfacePolylines: pointLines(flip), sampleIndices: flip },
      { kind: "degenerate", label: "Degenerate regions", visible: visibility.degenerate, parameterPolylines: [], surfacePolylines: pointLines(degenerateOverlayIndices), sampleIndices: degenerateOverlayIndices },
    ],
    atlas: { version: 1, charts: [{ chartId: `${args.definition.identity.key}:chart:primary`, domain: { u, v } }], overlaps: [] },
    quantity: "chart diagnostics", values: metricDeterminant,
    invalidRegions: Array.from(indicesWhere(invalidMask), (index) => [[samples[index].parameter[0], samples[index].parameter[1]]]),
  };
};

export const createSurfaceChartPayload = (args: { definition: CanonicalSurfaceDefinition; method: SurfaceAnalysisMethod; chart: SurfaceChartPayload }): SurfaceAnalysisPayload => ({
  version: 1,
  surfaceId: args.definition.identity.surfaceId,
  surfaceRevision: args.definition.identity.surfaceRevision,
  representation: args.definition.representation,
  method: args.definition.representation === "mesh-backed" ? "mesh-approximation" : args.method,
  units: args.definition.units,
  orientation: args.definition.orientation,
  warnings: args.chart.sampleCount ? [...args.definition.warnings] : [...args.definition.warnings, "No parameter-domain samples are available for this Surface representation."],
  data: args.chart,
});
