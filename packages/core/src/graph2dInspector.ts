import type { Graph2DDomain, Graph2DDocument, Graph2DObjectDisplay, Graph2DProbe } from "./graph2dDocument";
import type { Graph2DSamplingArtifact, Graph2DSamplingDiagnostic } from "./graph2dSampling";

export type Graph2DInspectorSummary = Readonly<{
  objectId: string;
  label: string;
  expression: string;
  domain: Graph2DDomain;
  style: Graph2DObjectDisplay;
  probe: Graph2DProbe | null;
  probeMethod: "direct-expression-floating-point" | "unavailable";
  sampling: Readonly<{
    status: "converged" | "incomplete" | "unavailable";
    method: "adaptive-bounded-polyline";
    samplesEvaluated: number | null;
    segmentCount: number | null;
    policy: Graph2DDocument["display"]["sampling"];
    diagnostics: readonly Graph2DSamplingDiagnostic[];
    suspectedJumpCount: number;
    invalidSampleCount: number;
  }>;
  provenance: Readonly<{
    documentId: string;
    revision: number;
    structuralHash: string;
    expressionAstVersion: number;
    samplerVersion: number | null;
  }>;
}>;

/** The same inspector facts can be projected by desktop, web, or mobile clients. */
export const queryGraph2DInspector = (document: Graph2DDocument,
  observation?: Readonly<{ objectId: string; artifact: Graph2DSamplingArtifact }>): Graph2DInspectorSummary | null => {
  const object = document.source.objects.find((entry) => entry.id === document.selection.objectId);
  if (!object) return null;
  const style = document.display.objects.find((entry) => entry.objectId === object.id);
  if (!style) return null;
  const visibleArtifact = style.visible && observation?.objectId === object.id ? observation.artifact : undefined;
  const diagnostics = visibleArtifact?.diagnostics ?? [];
  return {
    objectId: object.id, label: object.label, expression: object.expression.source,
    domain: object.domain, style,
    probe: document.selection.probe?.objectId === object.id ? document.selection.probe : null,
    probeMethod: document.selection.probe?.objectId === object.id ? "direct-expression-floating-point" : "unavailable",
    sampling: {
      status: !visibleArtifact ? "unavailable" : visibleArtifact.converged ? "converged" : "incomplete",
      method: "adaptive-bounded-polyline", samplesEvaluated: visibleArtifact?.samplesEvaluated ?? null,
      segmentCount: visibleArtifact?.segments.length ?? null, policy: document.display.sampling, diagnostics,
      suspectedJumpCount: diagnostics.find((entry) => entry.code === "suspected-jump")?.count ?? 0,
      invalidSampleCount: diagnostics.find((entry) => entry.code === "invalid-sample")?.count ?? 0,
    },
    provenance: { documentId: document.identity.id, revision: document.identity.revision,
      structuralHash: document.identity.structuralHash, expressionAstVersion: object.expression.ast.version,
      samplerVersion: visibleArtifact?.samplerVersion ?? null },
  };
};
