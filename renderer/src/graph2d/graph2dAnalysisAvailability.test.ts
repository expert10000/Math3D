import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  Graph2DPointTableStore, graph2DPointDomain, previewGraph2DPointImport,
  graph2DIntervalAnalysisUnavailable, graph2DSceneStatusLabel,
  type Graph2DAuthoringAction, type Graph2DDocument } from "@math3d/core";

const domain = { min: -2, max: 2, includeMin: true, includeMax: true };
const style = { visible: true, color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const };
const rows = previewGraph2DPointImport("x,y\n0,0\n1,1").rows;
const table = new Graph2DPointTableStore({ read: () => null, write: () => {} }).publish(rows);
const cases: readonly [string, Graph2DAuthoringAction, string][] = [
  ["explicit-cartesian", { type: "create", draft: { label: "f", expression: "x", domain, style } }, "Cartesian function"],
  ["parametric", { type: "create-parametric", draft: { label: "p", xExpression: "t", yExpression: "t^2", domain, style } }, "Parametric curve"],
  ["polar", { type: "create-polar", draft: { label: "r", rExpression: "2*cos(theta)", domain, style } }, "Polar curve"],
  ["implicit", { type: "create-implicit", draft: { label: "c", expression: "x^2+y^2-1", domain, yDomain: domain, style } }, "Implicit curve"],
  ["inequality", { type: "create-inequality", draft: { label: "region", clauses: [{ expression: "x", comparator: ">=" }],
    operator: "all", domain, yDomain: domain, style } }, "Inequality region"],
  ["point-series", { type: "create-point-series", draft: { label: "data", table, mode: "points", domain: graph2DPointDomain(rows), style } }, "Point series"],
  ["piecewise", { type: "create-piecewise", draft: { label: "piece", pieces: [{ expression: "x", domain }], style } }, "Piecewise function"],
];

function selectedDocument(key: string, action: Graph2DAuthoringAction): Graph2DDocument {
  const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument(`availability:${key}`), action);
  return createGraph2DDocument({ stableKey: `availability:${key}`, source: scene.source, display: scene.display,
    selection: { objectId: scene.source.objects[0]!.id, probe: null } });
}

describe("Graph2D analysis action and scene status", () => {
  it.each(cases)("gates x-interval measurements for %s", (kind, action, label) => {
    const document = selectedDocument(kind, action);
    const objectId = document.selection.objectId;
    expect(graph2DSceneStatusLabel(document)).toBe(`${label} · Cartesian grid`);
    for (const operation of ["area", "arc-length"] as const) {
      const reason = graph2DIntervalAnalysisUnavailable(document, objectId, operation);
      if (kind === "explicit-cartesian") expect(reason).toBeNull();
      else expect(reason).toMatch(kind === "polar" ? /Polar measurements panel/ : /explicit y\(x\)/);
    }
  });

  it("reports the actual source and grid state", () => {
    const empty = createEmptyGraph2DDocument("availability:empty");
    expect(graph2DSceneStatusLabel(empty)).toBe("Empty Cartesian graph scene");
    const polar = selectedDocument("polar-grid", cases[2]![1]);
    const polarGrid = { ...polar, display: { ...polar.display, axes: { ...polar.display.axes, gridMode: "polar" as const } } };
    expect(graph2DSceneStatusLabel(polarGrid)).toBe("Polar curve · polar grid");
    expect(graph2DSceneStatusLabel({ ...polarGrid, source: empty.source, display: { ...polarGrid.display, objects: [] } }))
      .toBe("Empty polar graph scene");
  });
});
