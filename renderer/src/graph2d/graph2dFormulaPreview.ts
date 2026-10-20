import { evaluateGraph2DExpression, parseGraph2DExpression, sampleGraph2DImplicit,
  sampleGraph2DInequality, sampleGraph2DSlopeField, sampleGraph2DPhasePortrait,
  sampleGraph2DTimeOde } from "@math3d/core";

export type FormulaRange = Readonly<{ min: number; max: number }>;
export type FormulaPreview =
  | Readonly<{ kind: "error"; message: string; start: number; end: number; source: "parser" | "sampling" }>
  | Readonly<{ kind: "curve"; axis: string; range: FormulaRange; points: readonly (number | null)[];
      midpoint: number | null; min: number; max: number; invalidSamples: number }>
  | Readonly<{ kind: "field"; axes: readonly [string, string]; ranges: readonly [FormulaRange, FormulaRange];
      cells: readonly (readonly (number | null)[])[]; midpoint: number | null; maxAbs: number; invalidSamples: number }>
  | Readonly<{ kind: "contour"; axes: readonly [string, string]; ranges: readonly [FormulaRange, FormulaRange];
      segments: readonly (readonly Readonly<{ x: number; y: number }>[])[]; invalidSamples: number;
      incomplete: boolean; samplesEvaluated: number }>
  | Readonly<{ kind: "diagram"; mode: "slope-field" | "inequality" | "time-ode" | "phase-portrait";
      axes: readonly [string, string]; ranges: readonly [FormulaRange, FormulaRange];
      segments: readonly (readonly Readonly<{ x: number; y: number }>[])[];
      fieldSegments: readonly (readonly Readonly<{ x: number; y: number }>[])[];
      strictSegments: readonly (readonly Readonly<{ x: number; y: number }>[])[];
      fills: readonly Readonly<{ xMin: number; xMax: number; yMin: number; yMax: number }>[];
      seeds: readonly Readonly<{ x: number; y: number }>[];
      invalidSamples: number; incomplete: boolean; samplesEvaluated: number; note?: string }>;
export type FormulaPreviewMode = "values" | "implicit" | "slope-field" | "inequality" | "time-ode" | "phase-portrait";
export type FormulaPreviewContext = Readonly<{
  region?: Readonly<{ clauses: readonly Readonly<{ expression: string; comparator: "<" | "<=" | ">" | ">=" }>[];
    operator: "all" | "any"; editingIndex: number }>;
  timeOde?: Readonly<{ seed: Readonly<{ t: number; x: number }> }>;
  phasePortrait?: Readonly<{ xDerivative: string; yDerivative: string; editing: "x" | "y";
    seeds: readonly Readonly<{ x: number; y: number }>[]; timeSpan: number }>;
}>;

const defaultRange: FormulaRange = { min: -3, max: 3 };
const invalidRange = (range?: FormulaRange) => range !== undefined &&
  (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min >= range.max);
const sample = (range: FormulaRange, index: number, count: number) => range.min + (range.max - range.min) * index / (count - 1);

/** A bounded local preview. Sampling failures become gaps; only parse errors block the preview. */
export function previewGraph2DFormula(source: string, variables: readonly string[],
  axes: readonly [string] | readonly [string, string], parameterValues: Readonly<Record<string, number>> = {},
  ranges: readonly [FormulaRange, FormulaRange?] = [defaultRange], mode: FormulaPreviewMode = "values",
  context: FormulaPreviewContext = {}): FormulaPreview {
  const parsed = parseGraph2DExpression(source, variables);
  if (!parsed.ok) {
    const diagnostic = parsed.diagnostics[0]!;
    return { kind: "error", message: diagnostic.message, start: diagnostic.span.start, end: diagnostic.span.end,
      source: "parser" };
  }
  if (invalidRange(ranges[0]) || axes.length === 2 && invalidRange(ranges[1]))
    return { kind: "error", source: "sampling", start: 0, end: 0,
      message: "Preview domain is invalid. Set each minimum below its maximum." };
  const baseline = Object.fromEntries(variables.map(name => [name, parameterValues[name] ?? 0]));
  const deadlineMs = Date.now() + 50;
  let invalidSamples = 0;
  let workLimitReached = false;
  const evaluate = (values: Readonly<Record<string, number>>) => {
    const result = evaluateGraph2DExpression(parsed.ast, { ...baseline, ...values }, { maxEvaluations: 2048, deadlineMs });
    if (result.ok && Number.isFinite(result.value)) return result.value;
    if (!result.ok && result.diagnostic.code === "limit") workLimitReached = true;
    invalidSamples += 1;
    return null;
  };
  const first = ranges[0] ?? defaultRange;
  if (axes.length === 1) {
    const axis = axes[0];
    const points = Array.from({ length: 61 }, (_, index) => evaluate({ [axis]: sample(first, index, 61) }));
    const finite = points.filter((value): value is number => value !== null);
    if (!finite.length) return { kind: "error", source: "sampling", start: 0, end: 0,
      message: workLimitReached ? "Preview reached its work limit before finding finite values." :
        "No finite values in this preview range. Check the formula and its domain." };
    const midpoint = evaluate({ [axis]: sample(first, 1, 3) });
    return { kind: "curve", axis, range: first, points, midpoint,
      min: Math.min(...finite), max: Math.max(...finite), invalidSamples };
  }
  const second = ranges[1] ?? defaultRange;
  const [horizontal, vertical] = axes;
  const domain = (range: FormulaRange) => ({ ...range, includeMin: true, includeMax: true });
  const viewport = { xMin: first.min, xMax: first.max, yMin: second.min, yMax: second.max, aspect: "free" as const };
  const points = (segments: readonly Readonly<{ points: readonly Readonly<{ x: number; y: number }>[] }>[]) =>
    segments.map(segment => segment.points);
  const count = (diagnostics: readonly Readonly<{ code: string; count: number }>[], code: string) =>
    diagnostics.filter(item => item.code === code).reduce((total, item) => total + item.count, 0);
  const limited = (diagnostics: readonly Readonly<{ code: string; count: number }>[]) =>
    diagnostics.some(item => item.code === "deadline" || item.code === "sample-limit" || item.code === "segment-limit");
  const diagram = (kind: "slope-field" | "inequality" | "time-ode" | "phase-portrait",
    artifact: Readonly<{ segments: readonly Readonly<{ points: readonly Readonly<{ x: number; y: number }>[] }>[];
      samplesEvaluated: number; diagnostics: readonly Readonly<{ code: string; count: number }>[] }>,
    extra: Partial<Extract<FormulaPreview, { kind: "diagram" }>> = {}): FormulaPreview => {
    const invalid = count(artifact.diagnostics, "invalid-sample");
    const visible = (extra.segments ?? artifact.segments).length + (extra.fieldSegments?.length ?? 0) +
      (extra.fills?.length ?? 0) + (extra.strictSegments?.length ?? 0);
    if (!visible && invalid > 0 && !limited(artifact.diagnostics))
      return { kind: "error", source: "sampling", start: 0, end: 0,
        message: "The formula parses, but is undefined throughout this preview range." };
    return { kind: "diagram", mode: kind, axes: [horizontal, vertical], ranges: [first, second],
      segments: points(artifact.segments), fieldSegments: [], strictSegments: [], fills: [], seeds: [],
      invalidSamples: invalid, incomplete: limited(artifact.diagnostics), samplesEvaluated: artifact.samplesEvaluated,
      ...extra };
  };
  if (mode === "implicit") {
    // Use the same bounded contour sampler as the Graph canvas; the preview never mutates the draft.
    const contour = sampleGraph2DImplicit({
      object: { id: "formula-preview", kind: "implicit", label: "Preview",
        expression: { source, variable: "xy", ast: parsed.ast }, domain: domain(first), yDomain: domain(second) },
      variables: baseline,
      viewport,
      width: 360, height: 190, policy: { maxSamples: 2400, maxDepth: 8, tolerancePx: 1.5 },
      deadlineMs: Date.now() + 80,
    });
    const invalid = count(contour.diagnostics, "invalid-sample");
    const incomplete = limited(contour.diagnostics);
    if (contour.samplesEvaluated > 0 && invalid === contour.samplesEvaluated)
      return { kind: "error", source: "sampling", start: 0, end: 0,
        message: "The formula parses, but is undefined throughout this preview range." };
    return { kind: "contour", axes: [horizontal, vertical], ranges: [first, second],
      segments: contour.segments.map(segment => segment.points), invalidSamples: invalid,
      incomplete, samplesEvaluated: contour.samplesEvaluated };
  }
  if (mode === "slope-field") {
    const artifact = sampleGraph2DSlopeField({ object: { id: "formula-preview", kind: "slope-field", label: "Preview",
      expression: { source, variable: "xy", ast: parsed.ast }, domain: domain(first), yDomain: domain(second) },
      variables: baseline, viewport, width: 360, height: 190, maxSamples: 100, deadlineMs: Date.now() + 60 });
    return diagram(mode, artifact, { note: "Local slopes only; solution trajectories require an initial point." });
  }
  if (mode === "inequality") {
    const region = context.region;
    if (!region || region.editingIndex < 0 || region.editingIndex >= region.clauses.length)
      return { kind: "error", source: "sampling", start: 0, end: 0, message: "Region preview settings are unavailable." };
    const clauses = [];
    for (const [index, clause] of region.clauses.entries()) {
      const clauseSource = index === region.editingIndex ? source : clause.expression;
      const clauseParsed = index === region.editingIndex ? parsed : parseGraph2DExpression(clauseSource, variables);
      if (!clauseParsed.ok) return { kind: "error", source: "sampling", start: 0, end: 0,
        message: `Condition ${index + 1} is invalid; correct it to preview the combined region.` };
      clauses.push({ source: clauseSource, variable: "xy" as const, ast: clauseParsed.ast,
        comparator: clause.comparator });
    }
    const artifact = sampleGraph2DInequality({ object: { id: "formula-preview", kind: "inequality", label: "Preview",
      clauses, operator: region.operator, domain: domain(first), yDomain: domain(second) },
      variables: baseline, viewport, width: 360, height: 190,
      policy: { maxSamples: 2400, maxDepth: 8, tolerancePx: 1.5 }, deadlineMs: Date.now() + 80 });
    const strictSegments = artifact.boundaries.filter(boundary => boundary.strict).flatMap(boundary => points(boundary.segments));
    const solidSegments = artifact.boundaries.filter(boundary => !boundary.strict).flatMap(boundary => points(boundary.segments));
    return diagram(mode, { ...artifact, segments: artifact.segments }, {
      segments: solidSegments, strictSegments, fills: artifact.fills,
      incomplete: artifact.state !== "resolved", note: clauses.length === 1 ? "Region from one condition." :
        `${region.operator === "all" ? "Intersection" : "Union"} of ${clauses.length} conditions.` });
  }
  if (mode === "time-ode") {
    const seed = context.timeOde?.seed;
    if (!seed || !Number.isFinite(seed.t) || !Number.isFinite(seed.x) || seed.t < first.min || seed.t > first.max ||
        seed.x < second.min || seed.x > second.max)
      return { kind: "error", source: "sampling", start: 0, end: 0,
        message: "Set a finite initial time and value inside the preview domain." };
    const artifact = sampleGraph2DTimeOde({ object: { id: "formula-preview", kind: "time-ode", label: "Preview",
      expression: { source, variable: "tx", ast: parsed.ast }, domain: domain(first), stateDomain: domain(second), seed },
      variables: baseline, viewport, maxSamples: 1200, deadlineMs: Date.now() + 60 });
    return diagram(mode, artifact, { seeds: [{ x: seed.t, y: seed.x }],
      note: `Backward: ${artifact.backward?.stop ?? "unavailable"}; forward: ${artifact.forward?.stop ?? "unavailable"}.` });
  }
  if (mode === "phase-portrait") {
    const phase = context.phasePortrait;
    if (!phase || !Number.isFinite(phase.timeSpan) || phase.timeSpan <= 0 ||
        phase.seeds.some(seed => !Number.isFinite(seed.x) || !Number.isFinite(seed.y) ||
          seed.x < first.min || seed.x > first.max || seed.y < second.min || seed.y > second.max))
      return { kind: "error", source: "sampling", start: 0, end: 0,
        message: "Set a positive time horizon and initial points inside the preview domain." };
    const xSource = phase.editing === "x" ? source : phase.xDerivative;
    const ySource = phase.editing === "y" ? source : phase.yDerivative;
    const xParsed = phase.editing === "x" ? parsed : parseGraph2DExpression(xSource, variables);
    const yParsed = phase.editing === "y" ? parsed : parseGraph2DExpression(ySource, variables);
    if (!xParsed.ok || !yParsed.ok) return { kind: "error", source: "sampling", start: 0, end: 0,
      message: `The other derivative is invalid; correct it to preview the combined phase portrait.` };
    const artifact = sampleGraph2DPhasePortrait({ object: { id: "formula-preview", kind: "phase-portrait", label: "Preview",
      xDerivative: { source: xSource, variable: "xy", ast: xParsed.ast },
      yDerivative: { source: ySource, variable: "xy", ast: yParsed.ast },
      domain: domain(first), yDomain: domain(second), seeds: phase.seeds, timeSpan: phase.timeSpan },
      variables: baseline, viewport, width: 360, height: 190, maxSamples: 1500, deadlineMs: Date.now() + 80 });
    return diagram(mode, artifact, { fieldSegments: points(artifact.fieldSegments), seeds: phase.seeds,
      note: `${artifact.orbits.length} orbit(s) from current initial point(s).` });
  }
  const cells = Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, column) =>
    evaluate({ [horizontal]: sample(first, column, 5), [vertical]: sample(second, 4 - row, 5) })));
  const finite = cells.flat().filter((value): value is number => value !== null);
  if (!finite.length) return { kind: "error", source: "sampling", start: 0, end: 0,
    message: workLimitReached ? "Preview reached its work limit before finding finite values." :
      "No finite values in this preview range. Check the formula and its domain." };
  const midpoint = evaluate({ [horizontal]: sample(first, 1, 3), [vertical]: sample(second, 1, 3) });
  return { kind: "field", axes: [horizontal, vertical], ranges: [first, second], cells,
    midpoint, maxAbs: Math.max(...finite.map(Math.abs)), invalidSamples };
}
