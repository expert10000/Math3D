import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { analyzeGraph2DCriticalPoints, analyzeGraph2DIntersections, analyzeGraph2DIntervals,
  applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  type Graph2DPhasePortraitArtifact } from "@math3d/core";
import { Graph2DCriticalResultsPanel } from "./Graph2DCriticalResultsPanel";
import { Graph2DIntersectionResultsTable } from "./Graph2DIntersectionResultsTable";
import { Graph2DIntervalResultsPanel } from "./Graph2DIntervalResultsPanel";
import { Graph2DPhaseEquilibriaTable } from "./Graph2DPhaseEquilibriaTable";
import { Graph2DNumericalResultsTable } from "./Graph2DNumericalResultsTable";
import { graph2DNumericalRows } from "./graph2dNumericalRows";
import { Graph2DPlot } from "./Graph2DPlot";

const scene = () => {
  let document = createEmptyGraph2DDocument("numerical-browser");
  for (const expression of ["x^2-1", "0"]) {
    const next = applyGraph2DAuthoring(document, { type: "create", draft: { label: expression,
      expression, domain: { min: -3, max: 3, includeMin: true, includeMax: true },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
    document = createGraph2DDocument({ stableKey: "numerical-browser", source: next.source, display: next.display });
  }
  return document;
};

describe("shared Graphs numerical result browser", () => {
  it("filters and sorts source rows without mutating them", () => {
    const items = [{ id: "b", x: 2, kind: "target" }, { id: "a", x: -1, kind: "target" },
      { id: "c", x: 0, kind: "other" }];
    const rows = graph2DNumericalRows(items, { query: "TARGET", descending: true,
      include: () => true, searchText: item => item.kind, getX: item => item.x, getId: item => item.id });
    expect(rows.map(item => item.id)).toEqual(["b", "a"]);
    expect(items.map(item => item.id)).toEqual(["b", "a", "c"]);
  });

  it("bounds large tables to one page while keeping the total visible", () => {
    const items = Array.from({ length: 120 }, (_, index) => ({ id: `row-${index}`, x: index }));
    const markup = renderToStaticMarkup(<Graph2DNumericalResultsTable resultKey="large"
      tableLabel="Large numerical results" controlsLabel="Filter large results" searchLabel="Search large results"
      sortLabel="Sort large results" items={items} filters={[{ id: "all", label: "All", include: () => true }]}
      columns={[]} getId={item => item.id} getX={item => item.x} getKind={() => "Sample"}
      getSearchText={item => item.id} emptyText="No samples." />);
    expect(markup).toContain('data-result-row-id="row-49"');
    expect(markup).not.toContain('data-result-row-id="row-50"');
    expect(markup).toContain("Rows 1–50 of 120");
    expect(markup).toContain("Next");
  });

  it("uses the shared table for critical points, intersections and intervals", () => {
    const document = scene();
    const critical = analyzeGraph2DCriticalPoints({ document, objectId: "function_1",
      interval: { min: -2, max: 2 } });
    const intersections = analyzeGraph2DIntersections({ document, firstObjectId: "function_1",
      secondObjectId: "function_2", interval: { min: -2, max: 2 } });
    const intervals = analyzeGraph2DIntervals({ document, objectId: "function_1",
      interval: { min: -2, max: 2 }, criticalPoints: critical });
    const criticalMarkup = renderToStaticMarkup(<Graph2DCriticalResultsPanel analysis={critical}
      document={document} analysisBudget={12000} onAnalysisBudgetChange={() => {}} />);
    const intersectionMarkup = renderToStaticMarkup(<Graph2DIntersectionResultsTable analysis={intersections}
      document={document} canSave onSave={() => {}} onSaveBatch={() => {}} />);
    const intervalMarkup = renderToStaticMarkup(<Graph2DIntervalResultsPanel analysis={intervals}
      document={document} focusedId={intervals.partitions[0]?.intervalId ?? null} onFocus={() => {}} />);
    for (const markup of [criticalMarkup, intersectionMarkup, intervalMarkup]) {
      expect(markup).toContain('class="graph2d-numerical-results"');
      expect(markup).toContain("Export results");
      expect(markup).toContain("Export numerical JSON");
    }
    expect(intersectionMarkup).toContain("Save selected");
    expect(intervalMarkup).toContain("Highlight interval");
    const plot = renderToStaticMarkup(<Graph2DPlot display={document.display} size={{ width: 400, height: 240 }}
      series={[]} intervals={intervals} focusedIntervalId={intervals.partitions[0]?.intervalId} />);
    expect(plot).toContain('data-focused-interval-id="');
  });

  it("shows equilibrium summary and disables export for transient previews", () => {
    const document = scene();
    const artifact = { equilibria: [{ x: 0, y: 0, residual: 1e-9,
      linearization: { kind: "stable-node", stability: "stable", status: "classified",
        jacobian: [-1, 0, 0, -2], eigenvalues: null, reason: null } }],
    analysis: { status: "complete", unresolved: 0, candidates: 1, evaluations: 10, gridScale: 0.1 } } as unknown as Graph2DPhasePortraitArtifact;
    const markup = renderToStaticMarkup(<Graph2DPhaseEquilibriaTable artifact={artifact}
      document={document} objectId="function_1" />);
    expect(markup).toContain("Approximate equilibria");
    expect(markup).toContain("Export results");
    const preview = renderToStaticMarkup(<Graph2DPhaseEquilibriaTable artifact={artifact}
      document={document} objectId="function_1" readOnlyPreview />);
    expect(preview).toContain("Transient equilibria preview");
    expect(preview).not.toContain("Export results");
  });
});
