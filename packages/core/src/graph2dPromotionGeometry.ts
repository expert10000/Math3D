import type { CurveDocument } from "./curveDocument";
import type { SurfaceDocument } from "./surfaceDocument";
import { evaluateGraph2DExpression, parseGraph2DExpression } from "./graph2dExpression";
import { validateGraph2DCapProfile } from "./graph2dInterop";

export type PromotionGeometry = Readonly<{
  positions: readonly number[];
  indices: readonly number[];
  kind: "curve" | "surface";
  /** Derived regular sampling topology, not mathematical document source. */
  grid?: Readonly<{ profileCount: number; sweepCount: number }>;
}>;

/** Exact captured Graph profile evaluator shared by sampling and native presentation.
 * u is the saved profile parameter; v is the sweep fraction in [0,1]. */
export function createGraph2DSurfacePointEvaluator(document: SurfaceDocument) {
  const { definition, parameters } = document.source;
  const expressions = definition.expressions;
  if (!expressions?.x || !expressions.y) throw new TypeError("This document has no profile expressions.");
  if (!["graph2d.revolution", "graph2d.extrusion"].includes(definition.familyId)) throw new TypeError("Unsupported procedural Surface family.");
  const variables = (parameters.variables ?? {}) as Record<string, number>;
  const parameter = String(parameters.parameter ?? "x");
  const x = parseGraph2DExpression(expressions.x, [parameter, ...Object.keys(variables)]);
  const y = parseGraph2DExpression(expressions.y, [parameter, ...Object.keys(variables)]);
  if (!x.ok || !y.ok) throw new TypeError("Profile expressions are invalid.");
  return (u: number, v: number): readonly [number, number, number] => {
    const bindings = { ...variables, [parameter]: u };
    const px = evaluateGraph2DExpression(x.ast, bindings), py = evaluateGraph2DExpression(y.ast, bindings);
    if (!px.ok || !py.ok) throw new TypeError("Profile is undefined. Restrict its domain.");
    let point: readonly [number, number, number];
    if (definition.familyId === "graph2d.revolution") {
      const sign = definition.settings?.orientation === "negative" ? -1 : 1;
      const angle = sign * (Number(parameters.angleMin) + v * (Number(parameters.angleMax) - Number(parameters.angleMin)));
      point = parameters.axis === "x" ? [px.value, py.value * Math.cos(angle), py.value * Math.sin(angle)]
        : [px.value * Math.cos(angle), py.value, px.value * Math.sin(angle)];
    } else {
      const direction = parameters.direction as number[], distance = v * Number(parameters.length);
      point = [px.value + direction[0]! * distance, py.value + direction[1]! * distance, direction[2]! * distance];
    }
    if (!point.every(Number.isFinite)) throw new TypeError("Non-finite promoted geometry.");
    return point;
  };
}

/** Evaluates ordinary Curve/Surface documents; derived geometry never enters their source. */
export const evaluateGraph2DPromotionGeometry = (document: CurveDocument | SurfaceDocument): PromotionGeometry => {
  const source = document.source, expressions = source.definition.expressions;
  if (!expressions?.x || !expressions.y) throw new TypeError("This document has no profile expressions.");
  const surface = document.format === "math3d.surface-document" ? document : null;
  const curve = document.format === "math3d.curve-document" ? document : null;
  const parameters = surface?.source.parameters ?? {};
  const variables: Record<string, number> = curve ? Object.fromEntries((curve.source.dependencies as
    { name: string; value: number }[]).map((entry) => [entry.name, entry.value])) :
    (parameters.variables ?? {}) as Record<string, number>;
  const domain = curve ? curve.source.domain : (surface!.source.domain as unknown as {
    profile: { min: number; max: number; includeMin: boolean; includeMax: boolean } }).profile;
  const parameterName = curve?.source.domain.parameter ?? String(parameters.parameter ?? "x");
  const x = parseGraph2DExpression(expressions.x, [parameterName, ...Object.keys(variables)]);
  const y = parseGraph2DExpression(expressions.y, [parameterName, ...Object.keys(variables)]);
  if (!x.ok || !y.ok) throw new TypeError("Profile expressions are invalid.");
  const positions: number[] = [], indices: number[] = [];
  const profileCount = curve ? 256 : 128, sweepCount = curve ? 0 : 48;
  const surfacePoint = surface ? createGraph2DSurfacePointEvaluator(surface) : null;
  for (let i = 0; i <= profileCount; i += 1) {
    const settings = source.definition.settings;
    const includeMin = curve ? settings?.includeMin !== false : "includeMin" in domain && domain.includeMin;
    const includeMax = curve ? settings?.includeMax !== false : "includeMax" in domain && domain.includeMax;
    const fraction = i === 0 && !includeMin ? 1e-8 : i === profileCount && !includeMax ? 1 - 1e-8 : i / profileCount;
    const parameter = domain.min + (domain.max - domain.min) * fraction;
    const bindings = { ...variables, [parameterName]: parameter };
    const px = evaluateGraph2DExpression(x.ast, bindings), py = evaluateGraph2DExpression(y.ast, bindings);
    if (!px.ok || !py.ok) throw new TypeError("Profile is undefined. Restrict its domain.");
    for (let j = 0; j <= sweepCount; j += 1) {
      if (curve) { positions.push(px.value, py.value, 0); continue; }
      const fractionV = j / sweepCount;
      positions.push(...surfacePoint!(parameter, fractionV));
      if (i > 0 && j > 0) {
        const a = (i - 1) * (sweepCount + 1) + j - 1, b = a + sweepCount + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  if (surface) {
    const profile = Array.from({ length: profileCount + 1 }, (_, index) => {
      const base = index * (sweepCount + 1) * 3;
      // Extrusion starts at the original profile. Revolution may start at a nonzero angle,
      // so distances still preserve the 2D profile norm.
      return [positions[base]!, positions[base + 1]!, positions[base + 2]!] as const;
    });
    const steps = profile.slice(1).map((point, index) => Math.hypot(...point.map((value, axis) => value - profile[index]![axis]!)));
    const median = [...steps].sort((a, b) => a - b)[steps.length >> 1]!;
    if (Math.max(...steps) > Math.max(1e-8, median * 1000))
      throw new TypeError("Profile contains a suspected discontinuity. Restrict its domain.");
    if (source.definition.familyId === "graph2d.extrusion" && parameters.capPolicy !== "none") {
      if (!("includeMin" in domain && domain.includeMin && "includeMax" in domain && domain.includeMax))
        throw new TypeError("Caps require a closed profile with included endpoints.");
      validateGraph2DCapProfile(profile.map(([x, y]) => ({ x, y })));
    }
  }
  if (surface && source.definition.familyId === "graph2d.extrusion" && parameters.capPolicy !== "none") {
    for (const side of [0, sweepCount]) {
      if (side === 0 && parameters.capPolicy === "end" || side !== 0 && parameters.capPolicy === "start") continue;
      // Construction validates convex closed profiles, so a fan is well-defined.
      for (let i = 1; i < profileCount - 1; i += 1) {
        const a = side, b = i * (sweepCount + 1) + side, c = (i + 1) * (sweepCount + 1) + side;
        indices.push(...(side === 0 ? [a, c, b] : [a, b, c]));
      }
    }
  }
  if (positions.some((value) => !Number.isFinite(value))) throw new TypeError("Non-finite promoted geometry.");
  return { positions, indices, kind: curve ? "curve" : "surface", ...(surface ? { grid: { profileCount, sweepCount } } : {}) };
};
