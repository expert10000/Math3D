import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument } from "./graph2dDocument";
import { differentiateGraph2DExpression } from "./graph2dDerivatives";
import { formatGraph2DExpressionAst } from "./graph2dExpression";
import { sampleGraph2DExplicit, type Graph2DSamplingArtifact } from "./graph2dSampling";
import type { Graph2DScreenSize } from "./graph2dViewport";

export type Graph2DDerivativeCurve = Readonly<{
  resultId: string;
  objectId: string;
  sourceHash: string;
  status: "approximate" | "incomplete" | "unavailable";
  formula: string | null;
  artifact: Graph2DSamplingArtifact | null;
  reason: string | null;
}>;

/** Transient first-derivative plot. It uses a separate bounded sampling budget from the source rendering. */
export const sampleGraph2DDerivativeCurve = (document: Graph2DDocument, objectId: string,
  size: Graph2DScreenSize): Graph2DDerivativeCurve => {
  const object = document.source.objects.find(entry => entry.id === objectId);
  if (!object || object.kind !== "explicit-cartesian") throw new TypeError("Graph2D explicit function does not exist.");
  const resultId = `graph2d.derivative-curve.${structuralHash({ source: document.identity, objectId,
    viewport: document.display.viewport, size, version: 1 }).slice(7)}`;
  const base = { resultId, objectId, sourceHash: document.identity.structuralHash };
  const derivative = differentiateGraph2DExpression(object.expression.ast, 1);
  if (!derivative.ok) return { ...base, status: "unavailable", formula: null, artifact: null,
    reason: derivative.reason === "unsupported-rule" ? "No supported symbolic derivative rule for this formula." :
      "Derivative expression exceeds the symbolic work limit." };
  const policy = { maxSamples: Math.min(2048, Math.max(256, document.display.sampling.maxSamples)),
    maxDepth: Math.min(12, document.display.sampling.maxDepth),
    tolerancePx: Math.max(0.5, document.display.sampling.tolerancePx) };
  const artifact = sampleGraph2DExplicit({ ast: derivative.ast, domain: object.domain,
    variables: Object.fromEntries(document.source.variables.map(entry => [entry.name, entry.value])),
    viewport: document.display.viewport, width: size.width, height: size.height, policy });
  return { ...base, status: artifact.converged ? "approximate" : "incomplete",
    formula: formatGraph2DExpressionAst(derivative.ast), artifact, reason: null };
};
