import type { Curve2D, Curve3D } from "@math3d/core";

export type ExactCurveVec3 = readonly [number, number, number];

export type GeometryCurveDerivativeCapabilities = {
  position: "exact";
  first: "exact" | "sampled" | "unavailable";
  second: "exact" | "sampled" | "unavailable";
  third: "exact" | "sampled" | "unavailable";
  arcLength: "closed-form" | "quadrature";
};

export type GeometryAnalyticCurveDefinition = {
  id: string;
  label: string;
  dimension: 2 | 3;
  parameter: string;
  domain: { min: number; max: number; closed: boolean };
  units: { parameter: string; position: string };
  revision: number;
  orientation: string;
  formula: readonly [string, string, string];
  capabilities: GeometryCurveDerivativeCapabilities;
  evaluate: (t: number) => ExactCurveVec3;
  derivative1: (t: number) => ExactCurveVec3;
  derivative2: (t: number) => ExactCurveVec3;
  derivative3: (t: number) => ExactCurveVec3;
  exactArcLength?: (a: number, b: number) => number;
  breakpoints?: readonly number[];
};

export type ExactCurveFrame = {
  t: number;
  position: ExactCurveVec3;
  derivative1: ExactCurveVec3;
  derivative2: ExactCurveVec3;
  derivative3: ExactCurveVec3;
  speed: number;
  tangent: ExactCurveVec3 | null;
  normal: ExactCurveVec3 | null;
  binormal: ExactCurveVec3 | null;
  curvature: number | null;
  radiusOfCurvature: number | null;
  torsion: number | null;
  stationary: boolean;
  degenerate: boolean;
  inflection: boolean;
};

export type ExactCurveDetectedEvent = {
  kind: "stationary" | "degenerate" | "inflection" | "curvature-extremum" | "torsion-extremum" | "piecewise-transition";
  t: number;
  value: number | null;
  uncertainty: number;
  message: string;
};

export type ExactCurvePlotSample = {
  t: number;
  speed: number;
  curvature: number | null;
  torsion: number | null;
};

export type ExactCurveAnalysisResult = {
  definition: {
    id: string;
    label: string;
    dimension: 2 | 3;
    parameter: string;
    domain: { min: number; max: number; closed: boolean };
    units: { parameter: string; position: string };
    revision: number;
    orientation: string;
    formula: readonly [string, string, string];
    capabilities: GeometryCurveDerivativeCapabilities;
  };
  point: ExactCurveFrame;
  samples: ExactCurveFrame[];
  arcLength: {
    value: number;
    method: "closed-form" | "adaptive-simpson";
    uncertainty: number;
  };
  events: ExactCurveDetectedEvent[];
  extrema: {
    curvature: { min: number | null; max: number | null };
    torsion: { min: number | null; max: number | null };
  };
  visualization: {
    curve: ExactCurveVec3[];
    frenetFrames: Array<Pick<ExactCurveFrame, "t" | "position" | "tangent" | "normal" | "binormal">>;
    curvatureComb: Array<{ t: number; start: ExactCurveVec3; end: ExactCurveVec3; curvature: number }>;
    osculatingCircle: { center: ExactCurveVec3; radius: number; normal: ExactCurveVec3 } | null;
    osculatingPlane: { origin: ExactCurveVec3; normal: ExactCurveVec3 } | null;
    plot: ExactCurvePlotSample[];
  };
  tolerance: number;
  uncertainty: number;
  warnings: string[];
};

const canonicalNumber = (value: number): number => Object.is(value, -0) ? 0 : value;
const add = (a: ExactCurveVec3, b: ExactCurveVec3): ExactCurveVec3 => [
  canonicalNumber(a[0] + b[0]),
  canonicalNumber(a[1] + b[1]),
  canonicalNumber(a[2] + b[2]),
];
const scale = (a: ExactCurveVec3, s: number): ExactCurveVec3 => [
  canonicalNumber(a[0] * s),
  canonicalNumber(a[1] * s),
  canonicalNumber(a[2] * s),
];
const dot = (a: ExactCurveVec3, b: ExactCurveVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: ExactCurveVec3, b: ExactCurveVec3): ExactCurveVec3 => [
  canonicalNumber(a[1] * b[2] - a[2] * b[1]),
  canonicalNumber(a[2] * b[0] - a[0] * b[2]),
  canonicalNumber(a[0] * b[1] - a[1] * b[0]),
];
const magnitude = (a: ExactCurveVec3): number => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: ExactCurveVec3, tolerance: number): ExactCurveVec3 | null => {
  const length = magnitude(a);
  return length <= tolerance ? null : scale(a, 1 / length);
};
const finiteVec = (value: ExactCurveVec3): boolean => value.every(Number.isFinite);
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const stableNormal = (tangent: ExactCurveVec3, tolerance: number): ExactCurveVec3 | null => {
  const reference: ExactCurveVec3 = Math.abs(tangent[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const binormal = normalize(cross(tangent, reference), tolerance);
  return binormal ? normalize(cross(binormal, tangent), tolerance) : null;
};

export const evaluateExactCurveFrame = (
  definition: GeometryAnalyticCurveDefinition,
  parameter: number,
  tolerance = 1e-9
): ExactCurveFrame => {
  const t = clamp(parameter, definition.domain.min, definition.domain.max);
  const position = definition.evaluate(t);
  const derivative1 = definition.derivative1(t);
  const derivative2 = definition.derivative2(t);
  const derivative3 = definition.derivative3(t);
  if (![position, derivative1, derivative2, derivative3].every(finiteVec)) {
    throw new Error(`Curve ${definition.label} returned a non-finite analytic derivative at ${definition.parameter}=${t}.`);
  }
  const speed = magnitude(derivative1);
  const stationary = speed <= tolerance;
  const tangent = stationary ? null : normalize(derivative1, tolerance);
  const cross12 = cross(derivative1, derivative2);
  const crossMagnitude = magnitude(cross12);
  const degenerate = stationary || crossMagnitude <= tolerance;
  const binormal = degenerate ? null : normalize(cross12, tolerance);
  const normal = tangent
    ? binormal
      ? normalize(cross(binormal, tangent), tolerance)
      : stableNormal(tangent, tolerance)
    : null;
  const curvature = stationary ? null : crossMagnitude / (speed * speed * speed);
  const radiusOfCurvature = curvature == null
    ? null
    : curvature <= tolerance
      ? Number.POSITIVE_INFINITY
      : 1 / curvature;
  const torsion = stationary
    ? null
    : crossMagnitude <= tolerance
      ? 0
      : dot(cross12, derivative3) / (crossMagnitude * crossMagnitude);
  const signedPlanarNumerator = derivative1[0] * derivative2[1] - derivative1[1] * derivative2[0];
  return {
    t,
    position,
    derivative1,
    derivative2,
    derivative3,
    speed,
    tangent,
    normal,
    binormal,
    curvature,
    radiusOfCurvature,
    torsion,
    stationary,
    degenerate,
    inflection: definition.dimension === 2 && Math.abs(signedPlanarNumerator) <= tolerance && !stationary,
  };
};

export const geometryAnalyticCurveToCoreCurve = (
  definition: GeometryAnalyticCurveDefinition
): Curve2D | Curve3D => {
  const common = {
    id: definition.id,
    name: definition.label,
    kind: "parametric" as const,
    family: "parametric" as const,
    domain: {
      tMin: definition.domain.min,
      tMax: definition.domain.max,
      closed: definition.domain.closed,
    },
  };
  if (definition.dimension === 2) {
    return {
      ...common,
      dimension: 2,
      subtype: "2d",
      eval: (t) => {
        const value = definition.evaluate(t);
        return { x: value[0], y: value[1] };
      },
      derivative: (t) => {
        const value = definition.derivative1(t);
        return { x: value[0], y: value[1] };
      },
      secondDerivative: (t) => {
        const value = definition.derivative2(t);
        return { x: value[0], y: value[1] };
      },
      ...(definition.exactArcLength ? { arcLength: definition.exactArcLength } : {}),
    };
  }
  return {
    ...common,
    dimension: 3,
    subtype: "3d",
    eval: (t) => {
      const value = definition.evaluate(t);
      return { x: value[0], y: value[1], z: value[2] };
    },
    derivative: (t) => {
      const value = definition.derivative1(t);
      return { x: value[0], y: value[1], z: value[2] };
    },
    secondDerivative: (t) => {
      const value = definition.derivative2(t);
      return { x: value[0], y: value[1], z: value[2] };
    },
    ...(definition.exactArcLength ? { arcLength: definition.exactArcLength } : {}),
  };
};

const simpson = (f: (t: number) => number, a: number, b: number): number => {
  const midpoint = (a + b) / 2;
  return ((b - a) / 6) * (f(a) + 4 * f(midpoint) + f(b));
};

const adaptiveSimpson = (
  f: (t: number) => number,
  a: number,
  b: number,
  tolerance: number,
  whole: number,
  depth: number
): { value: number; uncertainty: number } => {
  const midpoint = (a + b) / 2;
  const left = simpson(f, a, midpoint);
  const right = simpson(f, midpoint, b);
  const delta = left + right - whole;
  if (depth <= 0 || Math.abs(delta) <= 15 * tolerance) {
    return { value: left + right + delta / 15, uncertainty: Math.abs(delta / 15) };
  }
  const lhs = adaptiveSimpson(f, a, midpoint, tolerance / 2, left, depth - 1);
  const rhs = adaptiveSimpson(f, midpoint, b, tolerance / 2, right, depth - 1);
  return { value: lhs.value + rhs.value, uncertainty: lhs.uncertainty + rhs.uncertainty };
};

const numericExtrema = (values: Array<number | null>): { min: number | null; max: number | null } => {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  return finite.length ? { min: Math.min(...finite), max: Math.max(...finite) } : { min: null, max: null };
};

const localExtremaEvents = (
  samples: ExactCurveFrame[],
  key: "curvature" | "torsion",
  uncertainty: number,
  tolerance: number
): ExactCurveDetectedEvent[] => {
  const events: ExactCurveDetectedEvent[] = [];
  for (let index = 1; index < samples.length - 1; index += 1) {
    const previous = samples[index - 1][key];
    const current = samples[index][key];
    const next = samples[index + 1][key];
    if (previous == null || current == null || next == null) continue;
    const maximum = current > previous + tolerance && current >= next + tolerance;
    const minimum = current < previous - tolerance && current <= next - tolerance;
    if (!maximum && !minimum) continue;
    events.push({
      kind: key === "curvature" ? "curvature-extremum" : "torsion-extremum",
      t: samples[index].t,
      value: current,
      uncertainty,
      message: `${maximum ? "Local maximum" : "Local minimum"} of ${key}.`,
    });
  }
  return events;
};

export const analyzeExactCurve = (args: {
  definition: GeometryAnalyticCurveDefinition;
  parameter: number;
  sampleCount?: number;
  tolerance?: number;
}): ExactCurveAnalysisResult => {
  const { definition } = args;
  if (!Number.isFinite(definition.domain.min) || !Number.isFinite(definition.domain.max) || definition.domain.max <= definition.domain.min) {
    throw new Error(`Curve ${definition.label} requires a finite parameter domain with max > min.`);
  }
  const tolerance = Math.max(1e-12, args.tolerance ?? 1e-9);
  const sampleCount = Math.max(8, Math.min(2048, Math.floor(args.sampleCount ?? 96)));
  const span = definition.domain.max - definition.domain.min;
  const step = span / (sampleCount - 1);
  const samples = Array.from({ length: sampleCount }, (_, index) =>
    evaluateExactCurveFrame(definition, definition.domain.min + index * step, tolerance)
  );
  const point = evaluateExactCurveFrame(definition, args.parameter, tolerance);
  const speed = (t: number) => magnitude(definition.derivative1(t));
  const arcLength = definition.exactArcLength
    ? {
        value: definition.exactArcLength(definition.domain.min, definition.domain.max),
        method: "closed-form" as const,
        uncertainty: 0,
      }
    : (() => {
        const integrated = adaptiveSimpson(
          speed,
          definition.domain.min,
          definition.domain.max,
          tolerance,
          simpson(speed, definition.domain.min, definition.domain.max),
          18
        );
        return { value: integrated.value, method: "adaptive-simpson" as const, uncertainty: integrated.uncertainty };
      })();

  const events: ExactCurveDetectedEvent[] = [];
  const eventUncertainty = step / 2;
  for (const sample of samples) {
    if (sample.stationary) events.push({ kind: "stationary", t: sample.t, value: sample.speed, uncertainty: eventUncertainty, message: "Speed is below tolerance." });
    if (sample.degenerate && !sample.stationary) events.push({ kind: "degenerate", t: sample.t, value: sample.curvature, uncertainty: eventUncertainty, message: "First and second derivatives do not define a unique Frenet normal." });
  }
  if (definition.dimension === 2) {
    for (let index = 1; index < samples.length; index += 1) {
      const left = samples[index - 1];
      const right = samples[index];
      const leftSigned = left.derivative1[0] * left.derivative2[1] - left.derivative1[1] * left.derivative2[0];
      const rightSigned = right.derivative1[0] * right.derivative2[1] - right.derivative1[1] * right.derivative2[0];
      if (leftSigned * rightSigned < 0) {
        events.push({ kind: "inflection", t: (left.t + right.t) / 2, value: 0, uncertainty: eventUncertainty, message: "Signed planar curvature changes sign." });
      }
    }
    for (let index = 1; index < samples.length - 1; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      const next = samples[index + 1];
      const signed = (sample: ExactCurveFrame) => sample.derivative1[0] * sample.derivative2[1] - sample.derivative1[1] * sample.derivative2[0];
      if (Math.abs(signed(current)) <= tolerance && signed(previous) * signed(next) < 0) {
        events.push({ kind: "inflection", t: current.t, value: 0, uncertainty: eventUncertainty, message: "Signed planar curvature changes sign through zero." });
      }
    }
  }
  for (const breakpoint of definition.breakpoints ?? []) {
    if (breakpoint <= definition.domain.min || breakpoint >= definition.domain.max) continue;
    events.push({ kind: "piecewise-transition", t: breakpoint, value: null, uncertainty: 0, message: "Declared piecewise parameter transition." });
  }
  events.push(...localExtremaEvents(samples, "curvature", eventUncertainty, tolerance));
  events.push(...localExtremaEvents(samples, "torsion", eventUncertainty, tolerance));

  const frameStride = Math.max(1, Math.floor(sampleCount / 16));
  const curvatureComb = samples
    .filter((sample, index) => index % frameStride === 0 && sample.normal && sample.curvature != null && Number.isFinite(sample.curvature))
    .map((sample) => ({
      t: sample.t,
      start: sample.position,
      end: add(sample.position, scale(sample.normal!, Math.min(2, sample.curvature!))),
      curvature: sample.curvature!,
    }));
  const osculatingCircle = point.normal && point.binormal && point.radiusOfCurvature != null && Number.isFinite(point.radiusOfCurvature)
    ? {
        center: add(point.position, scale(point.normal, point.radiusOfCurvature)),
        radius: point.radiusOfCurvature,
        normal: point.binormal,
      }
    : null;
  const osculatingPlane = point.binormal ? { origin: point.position, normal: point.binormal } : null;
  const warnings: string[] = [];
  if (definition.capabilities.first !== "exact" || definition.capabilities.second !== "exact" || definition.capabilities.third !== "exact") {
    warnings.push("One or more derivatives use sampled fallback; exact differential guarantees do not apply to those quantities.");
  }
  if (point.stationary) warnings.push(`Stationary point at ${definition.parameter}=${point.t}; Frenet frame is undefined.`);
  else if (point.degenerate) warnings.push(`Degenerate Frenet frame at ${definition.parameter}=${point.t}; a stable display normal is used.`);
  if (definition.breakpoints?.length) warnings.push("Piecewise transitions are reported explicitly; inspect one-sided derivatives at each breakpoint.");

  return {
    definition: {
      id: definition.id,
      label: definition.label,
      dimension: definition.dimension,
      parameter: definition.parameter,
      domain: definition.domain,
      units: definition.units,
      revision: definition.revision,
      orientation: definition.orientation,
      formula: definition.formula,
      capabilities: definition.capabilities,
    },
    point,
    samples,
    arcLength,
    events,
    extrema: {
      curvature: numericExtrema(samples.map((sample) => sample.curvature)),
      torsion: numericExtrema(samples.map((sample) => sample.torsion)),
    },
    visualization: {
      curve: samples.map((sample) => sample.position),
      frenetFrames: samples
        .filter((_, index) => index % frameStride === 0)
        .map(({ t, position, tangent, normal, binormal }) => ({ t, position, tangent, normal, binormal })),
      curvatureComb,
      osculatingCircle,
      osculatingPlane,
      plot: samples.map(({ t, speed, curvature, torsion }) => ({ t, speed, curvature, torsion })),
    },
    tolerance,
    uncertainty: Math.max(eventUncertainty, arcLength.uncertainty),
    warnings,
  };
};

const exactCapabilities: GeometryCurveDerivativeCapabilities = {
  position: "exact",
  first: "exact",
  second: "exact",
  third: "exact",
  arcLength: "closed-form",
};

export type GeometryExactCurvePresetId = "line" | "circle" | "helix" | "piecewise-v";

export const GEOMETRY_EXACT_CURVE_PRESETS: readonly GeometryAnalyticCurveDefinition[] = [
  {
    id: "line",
    label: "Exact line",
    dimension: 3,
    parameter: "t",
    domain: { min: -2, max: 2, closed: false },
    units: { parameter: "scene-unit", position: "scene-unit" },
    revision: 1,
    orientation: "increasing t along +X",
    formula: ["t", "0", "0"],
    capabilities: exactCapabilities,
    evaluate: (t) => [t, 0, 0],
    derivative1: () => [1, 0, 0],
    derivative2: () => [0, 0, 0],
    derivative3: () => [0, 0, 0],
    exactArcLength: (a, b) => Math.abs(b - a),
  },
  {
    id: "circle",
    label: "Exact unit circle",
    dimension: 2,
    parameter: "t",
    domain: { min: 0, max: Math.PI * 2, closed: true },
    units: { parameter: "rad", position: "scene-unit" },
    revision: 1,
    orientation: "counter-clockwise in XY viewed from +Z",
    formula: ["cos(t)", "sin(t)", "0"],
    capabilities: exactCapabilities,
    evaluate: (t) => [Math.cos(t), Math.sin(t), 0],
    derivative1: (t) => [-Math.sin(t), Math.cos(t), 0],
    derivative2: (t) => [-Math.cos(t), -Math.sin(t), 0],
    derivative3: (t) => [Math.sin(t), -Math.cos(t), 0],
    exactArcLength: (a, b) => Math.abs(b - a),
  },
  {
    id: "helix",
    label: "Exact circular helix",
    dimension: 3,
    parameter: "t",
    domain: { min: 0, max: Math.PI * 4, closed: false },
    units: { parameter: "rad", position: "scene-unit" },
    revision: 1,
    orientation: "counter-clockwise about +Z with increasing height",
    formula: ["cos(t)", "sin(t)", "0.2t"],
    capabilities: exactCapabilities,
    evaluate: (t) => [Math.cos(t), Math.sin(t), 0.2 * t],
    derivative1: (t) => [-Math.sin(t), Math.cos(t), 0.2],
    derivative2: (t) => [-Math.cos(t), -Math.sin(t), 0],
    derivative3: (t) => [Math.sin(t), -Math.cos(t), 0],
    exactArcLength: (a, b) => Math.abs(b - a) * Math.sqrt(1.04),
  },
  {
    id: "piecewise-v",
    label: "Exact piecewise V",
    dimension: 2,
    parameter: "t",
    domain: { min: -1, max: 1, closed: false },
    units: { parameter: "scene-unit", position: "scene-unit" },
    revision: 1,
    orientation: "increasing t from left branch to right branch",
    formula: ["t", "|t|", "0"],
    capabilities: exactCapabilities,
    evaluate: (t) => [t, Math.abs(t), 0],
    derivative1: (t) => [1, t < 0 ? -1 : 1, 0],
    derivative2: () => [0, 0, 0],
    derivative3: () => [0, 0, 0],
    exactArcLength: (a, b) => Math.abs(b - a) * Math.SQRT2,
    breakpoints: [0],
  },
];

const GEOMETRY_EXACT_CURVE_PRESET_BY_ID = new Map(GEOMETRY_EXACT_CURVE_PRESETS.map((definition) => [definition.id, definition]));

export const getGeometryExactCurvePreset = (id: GeometryExactCurvePresetId | string): GeometryAnalyticCurveDefinition =>
  GEOMETRY_EXACT_CURVE_PRESET_BY_ID.get(id) ?? GEOMETRY_EXACT_CURVE_PRESETS[0];
