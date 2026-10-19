import type { Graph2DDocument, Graph2DObjectKind } from "./graph2dDocument";

const sourceName: Record<Graph2DObjectKind, string> = {
  "explicit-cartesian": "Cartesian function",
  parametric: "Parametric curve",
  polar: "Polar curve",
  implicit: "Implicit curve",
  inequality: "Inequality region",
  "point-series": "Point series",
  piecewise: "Piecewise function",
  "slope-field": "Slope field",
  trajectory: "Solution trajectory",
  "phase-portrait": "Phase portrait",
  "time-ode": "Time-dependent ODE",
};

/** Describes source objects and display coordinates without relying on the active module's default scene. */
export function graph2DSceneStatusLabel(document: Graph2DDocument): string {
  const grid = (document.display.axes.gridMode ?? "cartesian") === "polar" ? "polar" : "Cartesian";
  const objects = document.source.objects;
  if (objects.length === 0) return `Empty ${grid} graph scene`;
  if (objects.length === 1) {
    const object = objects[0]!;
    const hidden = document.display.objects.find(style => style.objectId === object.id)?.visible === false ? " (hidden)" : "";
    return `${sourceName[object.kind]}${hidden} · ${grid} grid`;
  }
  return `${objects.length} graph objects · ${grid} grid`;
}
