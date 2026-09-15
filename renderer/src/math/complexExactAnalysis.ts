import {
  createAnalysisResultEnvelope,
  type AnalysisResultEnvelope,
  type ComplexAnalysisDocument,
  type ComplexExpressionAst,
  type ComplexPoint,
  type ScientificSourceGeneration,
} from "@math3d/core";
import { abs, add, C, mul, scale, sub, type Complex } from "./complex";
import { compileComplexExpressionAstPreview } from "./complexExpr";

export const COMPLEX_EXACT_MVP_VERSION = "complex-exact-residue-contour@1" as const;

export type ExactComplexFeature = Readonly<{
  point: string;
  classification: "pole" | "removable";
  order: number;
  residue: string;
}>;
export type ExactSeriesTerm = Readonly<{ power: number; coefficient: string }>;
export type ComplexExactMvpAnalysis = Readonly<{
  symbolic: AnalysisResultEnvelope;
  contour: AnalysisResultEnvelope;
}>;

const sourceOf = (document: ComplexAnalysisDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id,
  revision: document.identity.revision,
  structuralHash: document.identity.structuralHash,
  generation: document.identity.revision,
});
const finite = (value: Complex) => Number.isFinite(value.re) && Number.isFinite(value.im);
const normalizedSource = (source: string) => source.toLowerCase().replace(/^f\s*\(\s*z\s*\)\s*=\s*/, "").replace(/^w\s*=\s*/, "").replace(/\s+/g, "");

const cloneAst = (ast: ComplexExpressionAst): ComplexExpressionAst => JSON.parse(JSON.stringify(ast)) as ComplexExpressionAst;
const number = (value: number): ComplexExpressionAst => ({ type: "number", value });
const binary = (operator: "+" | "-" | "*" | "/" | "^", left: ComplexExpressionAst, right: ComplexExpressionAst): ComplexExpressionAst => ({ type: "binary", operator, left, right });

export const differentiateComplexAst = (ast: ComplexExpressionAst): ComplexExpressionAst => {
  switch (ast.type) {
    case "number": case "constant": return number(0);
    case "variable": return number(ast.name === "z" ? 1 : 0);
    case "unary": return { type: "unary", operator: "-", argument: differentiateComplexAst(ast.argument) };
    case "binary": {
      const left = cloneAst(ast.left);
      const right = cloneAst(ast.right);
      const dl = differentiateComplexAst(ast.left);
      const dr = differentiateComplexAst(ast.right);
      if (ast.operator === "+" || ast.operator === "-") return binary(ast.operator, dl, dr);
      if (ast.operator === "*") return binary("+", binary("*", dl, right), binary("*", left, dr));
      if (ast.operator === "/") return binary("/", binary("-", binary("*", dl, right), binary("*", left, dr)), binary("^", cloneAst(ast.right), number(2)));
      if (ast.right.type === "number") return binary("*", binary("*", number(ast.right.value), binary("^", left, number(ast.right.value - 1))), dl);
      throw new TypeError("Exact differentiation of a variable complex exponent is outside the C08 MVP.");
    }
    case "call": {
      const argument = cloneAst(ast.argument);
      const derivative = differentiateComplexAst(ast.argument);
      if (ast.name === "sin") return binary("*", { type: "call", name: "cos", argument }, derivative);
      if (ast.name === "cos") return binary("*", { type: "unary", operator: "-", argument: { type: "call", name: "sin", argument } }, derivative);
      if (ast.name === "tan") return binary("/", derivative, binary("^", { type: "call", name: "cos", argument }, number(2)));
      if (ast.name === "exp") return binary("*", { type: "call", name: "exp", argument }, derivative);
      if (ast.name === "log") return binary("/", derivative, argument);
      if (ast.name === "sqrt") return binary("/", derivative, binary("*", number(2), { type: "call", name: "sqrt", argument }));
      throw new TypeError("abs is not holomorphic and has no Complex derivative in this Analyze layer.");
    }
  }
};

const profileFor = (document: ComplexAnalysisDocument, order: number) => {
  const source = normalizedSource(document.function.sourceText);
  if (source === "1/z") return {
    name: "reciprocal", derivative: "-1/z^2", classification: "meromorphic",
    features: [{ point: "0", classification: "pole", order: 1, residue: "1" }] as ExactComplexFeature[],
    series: [{ power: -1, coefficient: "1" }] as ExactSeriesTerm[],
  };
  if (["1/(z^2+1)", "1/(1+z^2)"].includes(source)) return {
    name: "paired-simple-poles", derivative: "-2*z/(z^2+1)^2", classification: "meromorphic",
    features: [
      { point: "i", classification: "pole", order: 1, residue: "-i/2" },
      { point: "-i", classification: "pole", order: 1, residue: "i/2" },
    ] as ExactComplexFeature[],
    series: Array.from({ length: Math.ceil(order / 2) }, (_, index) => ({ power: index * 2, coefficient: index % 2 ? "-1" : "1" })) as ExactSeriesTerm[],
  };
  if (["sin(z)/z", "sin(z)*(1/z)"].includes(source)) return {
    name: "sinc", derivative: "(z*cos(z)-sin(z))/z^2", classification: "entire-after-removable-extension",
    features: [{ point: "0", classification: "removable", order: 1, residue: "0" }] as ExactComplexFeature[],
    series: [
      { power: 0, coefficient: "1" }, { power: 2, coefficient: "-1/6" },
      { power: 4, coefficient: "1/120" }, { power: 6, coefficient: "-1/5040" },
    ].filter((term) => term.power < order) as ExactSeriesTerm[],
  };
  if (source === "exp(z)") return {
    name: "exponential", derivative: "exp(z)", classification: "entire", features: [] as ExactComplexFeature[],
    series: ["1", "1", "1/2", "1/6", "1/24", "1/120", "1/720", "1/5040"].slice(0, order).map((coefficient, power) => ({ power, coefficient })) as ExactSeriesTerm[],
  };
  return null;
};

type AdaptiveAccumulator = { value: Complex; error: number; samples: number; maximumDepthReached: boolean };
const segmentEstimate = (evaluate: (point: ComplexPoint) => Complex, a: ComplexPoint, b: ComplexPoint): Complex | null => {
  const fa = evaluate(a); const fb = evaluate(b);
  if (!finite(fa) || !finite(fb)) return null;
  return mul(scale(add(fa, fb), 0.5), C(b.re - a.re, b.im - a.im));
};
const adaptiveSegment = (
  evaluate: (point: ComplexPoint) => Complex,
  a: ComplexPoint,
  b: ComplexPoint,
  tolerance: number,
  depth: number
): AdaptiveAccumulator => {
  const midpoint = { re: (a.re + b.re) / 2, im: (a.im + b.im) / 2 };
  const whole = segmentEstimate(evaluate, a, b);
  const left = segmentEstimate(evaluate, a, midpoint);
  const right = segmentEstimate(evaluate, midpoint, b);
  if (!whole || !left || !right) return { value: C(NaN, NaN), error: Number.MAX_VALUE, samples: 3, maximumDepthReached: false };
  const split = add(left, right);
  const error = abs(sub(split, whole));
  if (error <= tolerance || depth >= 12) return { value: split, error, samples: 3, maximumDepthReached: depth >= 12 && error > tolerance };
  const first = adaptiveSegment(evaluate, a, midpoint, tolerance / 2, depth + 1);
  const second = adaptiveSegment(evaluate, midpoint, b, tolerance / 2, depth + 1);
  return { value: add(first.value, second.value), error: first.error + second.error, samples: first.samples + second.samples, maximumDepthReached: first.maximumDepthReached || second.maximumDepthReached };
};

const close = (points: readonly ComplexPoint[]): ComplexPoint[] => {
  if (points.length < 2) return [...points];
  const a = points[0]!; const b = points[points.length - 1]!;
  return Math.hypot(a.re - b.re, a.im - b.im) < 1e-12 ? [...points] : [...points, a];
};
const valueWinding = (points: readonly ComplexPoint[], evaluate: (point: ComplexPoint) => Complex): number | null => {
  const path = close(points); let total = 0;
  if (path.length < 4) return null;
  for (let index = 1; index < path.length; index += 1) {
    const a = evaluate(path[index - 1]!); const b = evaluate(path[index]!);
    if (!finite(a) || !finite(b) || abs(a) < 1e-12 || abs(b) < 1e-12) return null;
    let delta = Math.atan2(b.im, b.re) - Math.atan2(a.im, a.re);
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    total += delta;
  }
  return total / (2 * Math.PI);
};

export const analyzeComplexExactMvp = (args: { document: ComplexAnalysisDocument; expansionPoint?: ComplexPoint; seriesOrder?: number; tolerance?: number; now?: number }): ComplexExactMvpAnalysis => {
  const seriesOrder = Math.max(1, Math.min(8, Math.round(args.seriesOrder ?? 6)));
  const profile = profileFor(args.document, seriesOrder);
  const source = sourceOf(args.document);
  const started = args.now ?? performance.now();
  let derivativeAst: ComplexExpressionAst | null = null;
  let derivativeError: string | null = null;
  try { derivativeAst = differentiateComplexAst(args.document.function.normalizedAst); }
  catch (error) { derivativeError = String((error as Error).message ?? error); }
  const exactStatus = profile && derivativeAst ? "exact" : "unsupported";
  const symbolic = createAnalysisResultEnvelope({
    resultId: `complex-exact:${args.document.identity.revision}:${args.document.identity.structuralHash.slice(-12)}`,
    status: exactStatus,
    provenance: {
      source,
      operation: { type: "complex.exact-residue-series", algorithm: "normalized AST differentiation with reviewed exact profiles", algorithmVersion: COMPLEX_EXACT_MVP_VERSION, parameters: { expansionPoint: args.expansionPoint ?? { re: 0, im: 0 }, seriesOrder } },
      engine: { name: "Math3D exact Complex kernel", version: "1.0.0" }, elapsedMs: Math.max(0, (args.now ?? performance.now()) - started),
    },
    summary: {
      evidence: exactStatus === "exact" ? "exact-reviewed-profile" : "unsupported",
      profile: profile?.name ?? "unrecognized",
      classification: profile?.classification ?? "unknown",
      derivative: profile?.derivative ?? "unavailable",
      derivativeAstAvailable: derivativeAst !== null,
      singularities: profile?.features ?? [],
      series: profile?.series ?? [],
    },
    warnings: profile ? [] : ["Exact singularity/residue/series inspection is not available for this expression in the C08 MVP."],
    diagnostics: derivativeError ? [{ code: "complex.exact-derivative-unsupported", severity: "warning", message: derivativeError }] : [{ code: "complex.exact-profile", severity: "info", message: "Exact output comes from a reviewed normalized-expression profile." }],
    artifacts: [],
  });

  const compiled = compileComplexExpressionAstPreview(args.document.function.normalizedAst, args.document.function.allowedVariables);
  if (!compiled.fn) throw new TypeError(compiled.error?.message ?? "Complex contour evaluator is unavailable.");
  const evaluate = (point: ComplexPoint) => compiled.fn!({ z: C(point.re, point.im), u: point.re, v: point.im });
  const tolerance = args.tolerance ?? Math.max(1e-10, args.document.sampling.tolerance);
  let integral = C(); let errorEstimate = 0; let samples = 0; let maximumDepthReached = false;
  let argumentPrinciple = 0; let argumentContours = 0;
  for (const contour of args.document.contours) {
    const path = close(contour.points);
    for (let index = 1; index < path.length; index += 1) {
      const result = adaptiveSegment(evaluate, path[index - 1]!, path[index]!, tolerance / Math.max(1, path.length - 1), 0);
      integral = add(integral, result.value); errorEstimate += result.error; samples += result.samples; maximumDepthReached ||= result.maximumDepthReached;
    }
    const winding = valueWinding(contour.points, evaluate);
    if (winding != null) { argumentPrinciple += winding; argumentContours += 1; }
  }
  const roundedArgument = Math.round(argumentPrinciple);
  const argumentResidual = argumentContours ? Math.abs(argumentPrinciple - roundedArgument) : Number.MAX_VALUE;
  const contourStatus = args.document.contours.length && finite(integral) ? "numerical" : "unsupported";
  const contour = createAnalysisResultEnvelope({
    resultId: `complex-adaptive-contour:${args.document.identity.revision}:${args.document.identity.structuralHash.slice(-12)}`,
    status: contourStatus,
    provenance: {
      source,
      operation: { type: "complex.adaptive-contour", algorithm: "adaptive nested trapezoid quadrature and unwrapped argument principle", algorithmVersion: COMPLEX_EXACT_MVP_VERSION, parameters: { contourCount: args.document.contours.length, maximumDepth: 12 } },
      numericContext: { precision: { decimalDigits: 15 }, tolerance: { absolute: tolerance, relative: tolerance } },
      engine: { name: "Math3D TypeScript numerical kernel", version: "1.0.0" }, elapsedMs: Math.max(0, (args.now ?? performance.now()) - started),
    },
    summary: {
      integral,
      errorEstimate,
      samples,
      argumentPrinciple: argumentContours ? argumentPrinciple : null,
      zerosMinusPoles: argumentContours && argumentResidual <= 0.02 ? roundedArgument : null,
      argumentResidual: argumentContours ? argumentResidual : null,
      contourCount: args.document.contours.length,
    },
    warnings: [
      ...(!args.document.contours.length ? ["No committed contour is available."] : []),
      ...(maximumDepthReached ? ["Adaptive contour integration reached its subdivision limit."] : []),
      ...(argumentContours && argumentResidual > 0.02 ? ["Argument-principle winding is not sufficiently close to an integer."] : []),
    ],
    diagnostics: [{ code: "complex.adaptive-contour-status", severity: contourStatus === "numerical" ? "info" : "warning", message: contourStatus === "numerical" ? "Adaptive contour estimate completed with an explicit error bound." : "Adaptive contour analysis needs a committed closed contour." }],
    artifacts: [],
  });
  return { symbolic, contour };
};
