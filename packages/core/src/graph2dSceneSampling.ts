import type { Graph2DDocument, Graph2DViewport, Graph2DObjectDisplay } from "./index";
import type { Graph2DSamplingArtifact } from "./graph2dSampling";
import { sampleGraph2DExplicit } from "./graph2dSampling";
import { sampleGraph2DParametric } from "./graph2dParametric";
import { sampleGraph2DPolar } from "./graph2dPolar";
import { sampleGraph2DImplicit } from "./graph2dImplicit";
import { sampleGraph2DInequality } from "./graph2dInequality";
import { sampleGraph2DPointSeries, type Graph2DPointRow } from "./graph2dPointSeries";
import { sampleGraph2DPiecewise } from "./graph2dPiecewise";
import { resolveGraph2DViewport } from "./graph2dViewport";

export type Graph2DSceneSamplingRequest = Readonly<{
  document: Graph2DDocument; viewport: Graph2DViewport; width: number; height: number; interaction: boolean;
  pointTables?: Readonly<Record<string, readonly Graph2DPointRow[] | null>>;
}>;
export type Graph2DSampledSeries = Readonly<{ objectId: string; style: Graph2DObjectDisplay; artifact: Graph2DSamplingArtifact }>;

export const sampleGraph2DScene = (request: Graph2DSceneSamplingRequest): readonly Graph2DSampledSeries[] => {
  const { document, width, height } = request;
  const viewport = resolveGraph2DViewport(request.viewport, { width, height });
  const variables = Object.fromEntries(document.source.variables.map((entry) => [entry.name, entry.value]));
  const visibleCount = Math.max(1, document.display.objects.filter((style) => style.visible).length);
  const totalBudget = request.interaction ? Math.min(4000, document.display.sampling.maxSamples) : document.display.sampling.maxSamples;
  const policy = { ...document.display.sampling, maxSamples: Math.max(32, Math.floor(totalBudget / visibleCount)),
    maxDepth: request.interaction ? Math.min(8, document.display.sampling.maxDepth) : document.display.sampling.maxDepth,
    tolerancePx: request.interaction ? Math.max(2, document.display.sampling.tolerancePx) : document.display.sampling.tolerancePx };
  const deadlineMs = Date.now() + (request.interaction ? 250 : 1500);
  let remaining = totalBudget;
  return document.source.objects.flatMap((object, index) => {
    const style = document.display.objects[index];
    if (!style?.visible) return [];
    if (remaining < 32) return [{ objectId: object.id, style, artifact: { samplerVersion: 1 as const,
      segments: [], samplesEvaluated: 0, converged: false, diagnostics: [{ code: "sample-limit" as const, count: 1 }] } }];
    const common = { variables, viewport, width, height, policy: { ...policy, maxSamples: Math.min(remaining, policy.maxSamples) }, deadlineMs };
    const artifact = object.kind === "explicit-cartesian" ? sampleGraph2DExplicit({ ...common, ast: object.expression.ast, domain: object.domain }) :
      object.kind === "parametric" ? sampleGraph2DParametric({ ...common, object }) :
      object.kind === "polar" ? sampleGraph2DPolar({ ...common, object }) :
      object.kind === "implicit" ? sampleGraph2DImplicit({ ...common, object }) :
      object.kind === "inequality" ? sampleGraph2DInequality({ ...common, object }) :
      object.kind === "piecewise" ? sampleGraph2DPiecewise({ ...common, object }) :
      sampleGraph2DPointSeries(object, request.pointTables?.[object.table.id] ?? null, common.policy.maxSamples);
    remaining -= artifact.samplesEvaluated;
    return [{ objectId: object.id, style, artifact }];
  });
};
