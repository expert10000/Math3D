import type { Graph2DDocument } from "./graph2dDocument";

export const GRAPH2D_TOOLS = [
  { id: "move", label: "Move/select", hint: "Drag to move; click a curve to select." },
  { id: "probe", label: "Point/probe", hint: "Click a curve to inspect a source-linked observation." },
  { id: "slider", label: "Slider", hint: "Edit shared parameters; playback starts only when requested." },
  { id: "roots", label: "Roots", hint: "Inspect bounded numerical zero candidates." },
  { id: "extrema", label: "Extrema", hint: "Inspect bounded numerical minimum and maximum candidates." },
  { id: "intersections", label: "Intersections", hint: "Choose a pair and interval, then request a scan." },
  { id: "tangent", label: "Tangent", hint: "Inspect tangent, normal, and curvature for the selected curve." },
  { id: "regression", label: "Regression", hint: "Fit original checked point rows; choose a model and run." },
] as const;
export type Graph2DTool = typeof GRAPH2D_TOOLS[number]["id"];

/** Cartesian interval kernels accept only explicit y(x) sources. */
export function graph2DIntervalAnalysisUnavailable(document: Graph2DDocument, objectId: string | null,
  operation: "area" | "arc-length"): string | null {
  const object = document.source.objects.find(entry => entry.id === objectId);
  if (object?.kind === "explicit-cartesian") return null;
  if (object?.kind === "polar") return operation === "area" ?
    "Use polar swept area with angular bounds in the Polar measurements panel." :
    "Use polar arc length with angular bounds in the Polar measurements panel.";
  return operation === "area" ?
    "Interval area currently requires an explicit y(x) function." :
    "Arc length currently requires an explicit y(x) function.";
}

/** Shared route prerequisites. Opening a tool never evaluates or edits source. */
export function graph2DToolUnavailable(document: Graph2DDocument, tool: Graph2DTool, rowsAvailable = true): string | null {
  const selected = document.source.objects.find(o => o.id === document.selection.objectId);
  if (tool === "move" || tool === "probe" || tool === "slider") return null;
  if (tool === "regression") return selected?.kind !== "point-series" ? "Select a point series with original data." :
    rowsAvailable ? null : "Import the original checked data sidecar first.";
  if (tool === "tangent") {
    if (selected?.kind !== "explicit-cartesian" && selected?.kind !== "polar" && selected?.kind !== "parametric")
      return "Select an explicit, polar, or parametric curve.";
    return document.selection.probe?.objectId === selected.id ? null : "Commit a probe on the selected curve first.";
  }
  if (selected?.kind !== "explicit-cartesian") return "Select an explicit y(x) function.";
  if (tool === "intersections" && !document.source.objects.some(o => o.kind === "explicit-cartesian" && o.id !== selected.id))
    return "Add a second explicit function.";
  return null;
}
