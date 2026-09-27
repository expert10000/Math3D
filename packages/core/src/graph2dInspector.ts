import type { Graph2DDomain, Graph2DDocument, Graph2DObjectDisplay, Graph2DProbe } from "./graph2dDocument";
import type { Graph2DSamplingArtifact, Graph2DSamplingDiagnostic } from "./graph2dSampling";
import { evaluateGraph2DPolar } from "./graph2dPolar";
import type { Graph2DRegionArtifact } from "./graph2dInequality";

export type Graph2DInspectorSummary = Readonly<{
  objectId: string;
  kind: Graph2DDocument["source"]["objects"][number]["kind"];
  label: string;
  expression: string;
  domain: Graph2DDomain;
  style: Graph2DObjectDisplay;
  probe: Graph2DProbe | null;
  signedRadius: number | null;
  regionState: "resolved" | "unresolved" | "complexity-limit" | null;
  probeMethod: "direct-expression-floating-point" | "sampled-contour" | "unavailable";
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
  const variables = Object.fromEntries(document.source.variables.map((entry) => [entry.name, entry.value]));
  const selectedProbe = document.selection.probe?.objectId === object.id ? document.selection.probe : null;
  const signedRadius = object.kind === "polar" && selectedProbe?.parameter !== undefined ?
    evaluateGraph2DPolar(object, variables, selectedProbe.parameter)?.radius ?? null : null;
  return {
    objectId: object.id, kind: object.kind, label: object.label,
    expression: object.kind === "explicit-cartesian" ? object.expression.source :
      object.kind === "parametric" ? `x(t) = ${object.xExpression.source}, y(t) = ${object.yExpression.source}` :
      object.kind === "polar" ? `r(θ) = ${object.rExpression.source}` :
        object.kind === "implicit" ? `F(x,y) = ${object.expression.source} = 0` :
          object.clauses.map((clause) => `${clause.source} ${clause.comparator} 0`).join(object.operator === "all" ? " AND " : " OR "),
    domain: object.domain, style,
    probe: selectedProbe, signedRadius,
    regionState: visibleArtifact && "kind" in visibleArtifact && visibleArtifact.kind === "inequality-region" ?
      (visibleArtifact as unknown as Graph2DRegionArtifact).state : null,
    probeMethod: document.selection.probe?.objectId === object.id ?
      object.kind === "implicit" || object.kind === "inequality" ? "sampled-contour" :
        "direct-expression-floating-point" : "unavailable",
    sampling: {
      status: !visibleArtifact ? "unavailable" : visibleArtifact.converged ? "converged" : "incomplete",
      method: "adaptive-bounded-polyline", samplesEvaluated: visibleArtifact?.samplesEvaluated ?? null,
      segmentCount: visibleArtifact?.segments.length ?? null, policy: document.display.sampling, diagnostics,
      suspectedJumpCount: diagnostics.find((entry) => entry.code === "suspected-jump")?.count ?? 0,
      invalidSampleCount: diagnostics.find((entry) => entry.code === "invalid-sample")?.count ?? 0,
    },
    provenance: { documentId: document.identity.id, revision: document.identity.revision,
      structuralHash: document.identity.structuralHash,
      expressionAstVersion: object.kind === "explicit-cartesian" ? object.expression.ast.version :
        object.kind === "parametric" ? object.xExpression.ast.version :
          object.kind === "polar" ? object.rExpression.ast.version :
            object.kind === "implicit" ? object.expression.ast.version : object.clauses[0]!.ast.version,
      samplerVersion: visibleArtifact?.samplerVersion ?? null },
  };
};
