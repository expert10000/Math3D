import type { Graph2DCriticalPointAnalysis } from "./graph2dCriticalPoints";
import type { Graph2DIntersectionAnalysis } from "./graph2dIntersections";

export type Graph2DNumericalAnalysis = Graph2DCriticalPointAnalysis | Graph2DIntersectionAnalysis;

/** Portable numerical evidence, separate from sampled render geometry or editable source. */
export const createGraph2DNumericalDataset = (analysis: Graph2DNumericalAnalysis) => {
  const source = analysis.publication.provenance.source;
  const critical = "objectId" in analysis;
  return {
    format: "math3d.graph2d-numerical.v1" as const,
    operation: critical ? "critical-points" as const : "intersections" as const,
    resultId: analysis.publication.resultId,
    source: { documentId: source.documentId, revision: source.revision,
      structuralHash: source.structuralHash },
    objectIds: critical ? [analysis.objectId] : [analysis.firstObjectId, analysis.secondObjectId],
    interval: analysis.interval,
    scan: { status: analysis.status, quality: analysis.quality, evaluations: analysis.evaluations,
      tolerance: analysis.publication.provenance.numericContext?.tolerance ?? null },
    candidates: analysis.candidates.map(candidate => critical ? {
      kind: (candidate as Graph2DCriticalPointAnalysis["candidates"][number]).kind,
      x: candidate.x, y: candidate.y, residual: candidate.residual, quality: candidate.quality,
      method: candidate.method, confidence: candidate.confidence,
      estimatedXError: (candidate as Graph2DCriticalPointAnalysis["candidates"][number]).estimatedXError,
    } : {
      kind: "intersection" as const, x: candidate.x, y: candidate.y,
      residual: candidate.residual, quality: candidate.quality, method: candidate.method,
      confidence: candidate.confidence,
      classification: (candidate as Graph2DIntersectionAnalysis["candidates"][number]).classification,
    }),
    diagnostics: analysis.publication.diagnostics,
    warnings: analysis.publication.warnings,
  };
};
