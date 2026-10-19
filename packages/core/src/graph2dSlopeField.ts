import { evaluateGraph2DExpression } from "./graph2dExpression";
import type { Graph2DSlopeFieldObject } from "./graph2dDocument";
import type { Graph2DViewport } from "./graph2dViewport";
import type { Graph2DSamplingArtifact, Graph2DSamplingDiagnostic } from "./graph2dSampling";

export type Graph2DSlopeFieldRequest = Readonly<{
  object: Graph2DSlopeFieldObject;
  variables: Readonly<Record<string, number>>;
  viewport: Graph2DViewport;
  width: number;
  height: number;
  maxSamples: number;
  deadlineMs?: number;
}>;

/** Bounded direction glyphs for dy/dx = f(x,y). No trajectory or solution is inferred. */
export const sampleGraph2DSlopeField = (request: Graph2DSlopeFieldRequest): Graph2DSamplingArtifact => {
  const { object, viewport, width, height, maxSamples, deadlineMs } = request;
  if (![width, height].every(value => Number.isFinite(value) && value > 0) ||
      !Number.isSafeInteger(maxSamples) || maxSamples < 1 || maxSamples > 200000)
    throw new TypeError("Invalid slope-field sampling request.");
  if (viewport.xScale === "log10" || viewport.yScale === "log10") return {
    samplerVersion: 1, segments: [], samplesEvaluated: 0, converged: false,
    diagnostics: [{ code: "unsupported-scale", count: 1 }],
  };
  const xMin = Math.max(viewport.xMin, object.domain.min), xMax = Math.min(viewport.xMax, object.domain.max);
  const yMin = Math.max(viewport.yMin, object.yDomain.min), yMax = Math.min(viewport.yMax, object.yDomain.max);
  if (!(xMin < xMax && yMin < yMax)) return { samplerVersion: 1, segments: [], samplesEvaluated: 0,
    converged: true, diagnostics: [{ code: "empty-domain", count: 1 }] };

  // Screen-space density is stable under zoom and capped independently of a large scene budget.
  let columns = Math.max(1, Math.min(25, Math.floor(width / 48)));
  let rows = Math.max(1, Math.min(25, Math.floor(height / 48)));
  const budget = Math.min(400, maxSamples);
  while (columns * rows > budget) {
    if (columns >= rows && columns > 1) columns -= 1;
    else rows -= 1;
  }
  const pxPerX = width / (viewport.xMax - viewport.xMin);
  const pxPerY = height / (viewport.yMax - viewport.yMin);
  const lengthPx = Math.min(26, 0.44 * Math.min(width / columns, height / rows));
  const segments: Graph2DSamplingArtifact["segments"][number][] = [];
  let samplesEvaluated = 0, invalid = 0, timedOut = false;
  for (let row = 0; row < rows && !timedOut; row += 1) for (let column = 0; column < columns; column += 1) {
    if (deadlineMs !== undefined && Date.now() > deadlineMs) { timedOut = true; break; }
    const x = xMin + (column + 0.5) * (xMax - xMin) / columns;
    const y = yMin + (row + 0.5) * (yMax - yMin) / rows;
    const evaluated = evaluateGraph2DExpression(object.expression.ast, { ...request.variables, x, y }, { deadlineMs });
    samplesEvaluated += 1;
    if (!evaluated.ok) { invalid += 1; continue; }
    const slope = evaluated.value;
    const pixelNorm = Math.hypot(pxPerX, slope * pxPerY);
    if (!Number.isFinite(pixelNorm) || pixelNorm === 0) { invalid += 1; continue; }
    const halfX = lengthPx / (2 * pixelNorm), halfY = slope * halfX;
    if (![x - halfX, x + halfX, y - halfY, y + halfY].every(Number.isFinite)) { invalid += 1; continue; }
    segments.push({ points: [{ x: x - halfX, y: y - halfY }, { x: x + halfX, y: y + halfY }],
      openStart: false, openEnd: false });
  }
  const diagnostics: Graph2DSamplingDiagnostic[] = [];
  if (invalid) diagnostics.push({ code: "invalid-sample", count: invalid });
  if (timedOut) diagnostics.push({ code: "deadline", count: 1 });
  return { samplerVersion: 1, segments, samplesEvaluated, converged: !timedOut, diagnostics };
};
