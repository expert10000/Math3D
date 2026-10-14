import { graph2DToolUnavailable, type Graph2DDocument, type Graph2DTool } from "@math3d/core";
import type { MobileGraphAnalysisDraft } from "./mobileGraphAnalysis";

/** Mobile tangent analysis accepts a chosen coordinate, even before a graph probe is committed. */
export function mobileGraphToolUnavailable(document: Graph2DDocument, tool: Graph2DTool, rowsAvailable = true): string | null {
  if (tool !== "tangent") return graph2DToolUnavailable(document, tool, rowsAvailable);
  const selected = document.source.objects.find(object => object.id === document.selection.objectId);
  return selected?.kind === "explicit-cartesian" || selected?.kind === "polar" || selected?.kind === "parametric" ?
    null : "Select an explicit, polar, or parametric curve.";
}

export function mobileGraphTangentDraft(document: Graph2DDocument, draft: MobileGraphAnalysisDraft): MobileGraphAnalysisDraft {
  const selected = document.source.objects.find(object => object.id === document.selection.objectId);
  if (!selected || (selected.kind !== "explicit-cartesian" && selected.kind !== "polar" && selected.kind !== "parametric"))
    throw new TypeError("Select an explicit, polar, or parametric curve.");
  const probe = document.selection.probe?.objectId === selected.id ? document.selection.probe : null;
  const parameter = selected.kind === "polar" || selected.kind === "parametric" ?
    probe?.parameter ?? (selected.domain.includeMin ? selected.domain.min : (selected.domain.min + selected.domain.max) / 2) :
    probe?.x ?? 0;
  return { ...draft, kind: selected.kind === "polar" ? "polar-tangent" :
    selected.kind === "parametric" ? "parametric-tangent" : "tangent",
    objectId: selected.id, x: String(parameter) };
}
