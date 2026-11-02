import { structuralHash, type Graph2DDocument } from "@math3d/core";
import type { WorkbookSageEvidence } from "@math3d/workbook";

/** Fingerprints the graph expression and the source values that can change its meaning. */
export function graphSageSource(document: Graph2DDocument, objectId: string): WorkbookSageEvidence["source"] | null {
  const object = document.source.objects.find((item) => item.id === objectId);
  if (object?.kind !== "explicit-cartesian") return null;
  const expression = object.expression.source;
  return { module: "graphs", id: `${document.identity.id}:${object.id}`, revision: 0,
    expression, fingerprint: structuralHash({ expression,
      variables: document.source.variables, assumptions: document.source.assumptions }) };
}
