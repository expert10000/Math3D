import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { GeometryAnalysisInspectorRecord } from "../geometry/analysisResultWorkflow";
import { GeometryAnalysisInspectorPanel } from "./GeometryAnalysisInspectorPanel";

const record: GeometryAnalysisInspectorRecord = {
  id: "analysis-1", resultKey: "geometry:shape@2", name: "Shape analysis", kind: "surface-analysis",
  sourceObjectId: "shape", sourceObjectName: "Shape", sourceRevision: 2, resultVersion: 3,
  lifecycle: "saved", domain: "surface", quantity: "Mean curvature", method: "sampled curvature",
  units: "1/m", precision: "double", sampling: "mesh samples", parameters: {},
  requestedOutputs: [], statistics: { secretStatistic: 42 }, warnings: [], engine: "Geometry core",
  computeTimeMs: 5, createdAt: 1, updatedAt: 2, savedAt: 2, payload: null,
};

const show = (currentSourceRevision: number | null, lifecycle = record.lifecycle) =>
  renderToStaticMarkup(<GeometryAnalysisInspectorPanel result={{ ...record, lifecycle }} savedResults={[]}
    compareResult={null} currentSourceRevision={currentSourceRevision} onSelectSaved={() => {}}
    onSave={() => {}} onRename={() => {}} onCompare={() => {}} onDuplicateSettings={() => {}}
    onRecompute={() => {}} onOpenSource={() => {}} onOpenDerivative={() => {}}
    onPromoteOverlay={() => {}} onExport={() => {}} />);

describe("Geometry analysis Inspector authority", () => {
  it("shows completed values with a bounded claim and check scope", () => {
    const html = show(2);
    expect(html).toContain('data-qualification="current"');
    expect(html).toContain("secretStatistic");
    expect(html).toContain("None recorded for this result");
  });

  it("withholds values and current-source actions for changed and missing objects", () => {
    for (const sourceRevision of [3, null]) {
      const html = show(sourceRevision);
      expect(html).not.toContain("secretStatistic");
      expect(html).toContain("Values withheld");
      expect(html).toMatch(/disabled=""[^>]*>Open source</);
      expect(html).toMatch(/disabled=""[^>]*>Open derivative</);
    }
  });

  it("withholds preview and failed statistics even on a matching revision", () => {
    for (const lifecycle of ["preview", "failed"] as const) {
      const html = show(2, lifecycle);
      expect(html).toContain('data-qualification="incomplete"');
      expect(html).not.toContain("secretStatistic");
    }
  });
});
