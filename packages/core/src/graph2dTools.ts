import type { Graph2DDocument } from "./graph2dDocument";

export const GRAPH2D_TOOLS = [
  { id: "move", label: "Move/select", hint: "Drag to move; click a curve to select." },
  { id: "probe", label: "Point/probe", hint: "Click a curve to inspect a source-linked observation." },
  { id: "slider", label: "Slider", hint: "Edit shared parameters; playback starts only when requested." },
  { id: "roots", label: "Roots", hint: "Inspect bounded numerical zero candidates." },
  { id: "extrema", label: "Extrema", hint: "Inspect bounded numerical minimum and maximum candidates." },
  { id: "intersections", label: "Intersections", hint: "Choose a pair and interval, then request a scan." },
  { id: "tangent", label: "Tangent", hint: "Inspect the tangent at the committed explicit-function probe." },
  { id: "regression", label: "Regression", hint: "Fit original checked point rows; choose a model and run." },
] as const;
export type Graph2DTool = typeof GRAPH2D_TOOLS[number]["id"];

/** Shared route prerequisites. Opening a tool never evaluates or edits source. */
export function graph2DToolUnavailable(document: Graph2DDocument, tool: Graph2DTool, rowsAvailable = true): string | null {
  const selected = document.source.objects.find(o => o.id === document.selection.objectId);
  if (tool === "move" || tool === "probe" || tool === "slider") return null;
  if (tool === "regression") return selected?.kind !== "point-series" ? "Select a point series with original data." :
    rowsAvailable ? null : "Import the original checked data sidecar first.";
  if (selected?.kind !== "explicit-cartesian") return "Select an explicit y(x) function.";
  if (tool === "tangent" && document.selection.probe?.objectId !== selected.id) return "Commit a probe on the selected function first.";
  if (tool === "intersections" && !document.source.objects.some(o => o.kind === "explicit-cartesian" && o.id !== selected.id))
    return "Add a second explicit function.";
  return null;
}
