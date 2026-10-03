import { createCurveDocument, evaluateGraph2DExpression, parseGraph2DExpression, type CurveDocument, type CurveDocumentSource } from "@math3d/core";
import type { CurveCommandAdapter } from "@math3d/kernel";

/** Bounded literal 2D/3D recipes; dependencies and other representations stay previews. */
export const sampleMobileCurve = (source: CurveDocumentSource): readonly (readonly number[])[] => {
  if (!["parametric", "explicit"].includes(source.representation) || source.domain.periodic || source.definition.sourceIds?.length ||
      (source.dependencies as unknown[]).length || source.definition.surfaceLink)
    throw new TypeError("Mobile Curve editing supports independent, nonperiodic explicit and parametric sources.");
  const f = source.definition.expressions ?? {}, parameter = source.domain.parameter;
  const explicit = source.representation === "explicit" && !f.x;
  if (explicit && source.dimension !== 2) throw new TypeError("Explicit formula Curves must be planar.");
  const variable = explicit ? f.independentVariable ?? parameter : parameter;
  const formulas = explicit ? [variable, f.formula, "0"] : [f.x, f.y, source.dimension === 3 ? f.z : "0"];
  const asts = formulas.map(formula => {
    if (!formula || formula.length > 4096) throw new TypeError("Complete Curve expressions of at most 4096 characters are required.");
    const result = parseGraph2DExpression(formula, [variable]);
    if (!result.ok) throw new TypeError("Invalid Curve expression.");
    return result.ast;
  });
  const points = Array.from({ length: 257 }, (_, index) => {
    const t = source.domain.min + (source.domain.max - source.domain.min) * index / 256;
    return asts.map(ast => {
      const result = evaluateGraph2DExpression(ast, { [variable]: t });
      if (!result.ok) throw new TypeError("Curve expression is undefined in the saved domain.");
      return result.value;
    });
  });
  if (points.some(point => point.some(value => !Number.isFinite(value)))) throw new TypeError("Curve sampling must produce finite points across the saved domain.");
  return points;
};
export const mobileCurveUnavailableReason = (document: CurveDocument): string | null => {
  try { sampleMobileCurve(document.source); return null; } catch (error) { return (error as Error).message; }
};
export const commitMobileCurveSource = (adapter: CurveCommandAdapter, source: CurveDocumentSource): CurveDocument => {
  createCurveDocument({ source }); sampleMobileCurve(source);
  return adapter.commitSource(source);
};
