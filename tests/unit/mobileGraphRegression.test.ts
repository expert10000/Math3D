import { expect, it } from "vitest";
import { createEmptyGraph2DDocument, createGraph2DDocument, Graph2DPointTableStore, graph2DPointDomain, applyGraph2DAuthoring,
  analyzeGraph2DRegression, graph2DRegressionOverlaySeries, createGraph2DPublication, renderGraph2DPublicationArtifact, serializeGraph2DDocument } from "@math3d/core";
import { mobileGraphAnalysisDraft, runMobileGraphAnalysis, isMobileGraphAnalysisCurrent } from "../../apps/mobile/src/models/mobileGraphAnalysis";
import { mobileGraphPublicationRequest } from "../../apps/mobile/src/models/mobileGraphPublication";
import { projectMobileGraphLines } from "../../apps/mobile/src/viewer/mobileGraphProjection";
import { readMobileGraph, storeMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
const dataset = () => {
  const rows = [1, 3, 4, 7, 8, 12].map((y, i) => ({ id: `row_${i + 1}`, x: i, y })), tables = new Graph2DPointTableStore(), table = tables.publish(rows);
  const source = applyGraph2DAuthoring(createEmptyGraph2DDocument("native-fit", "Native measurements"), { type: "create-point-series",
    draft: { label: "Measurements", table, domain: graph2DPointDomain(rows), mode: "points", style: { visible: true, color: "#2563eb", lineWidth: 2, lineStyle: "solid" } } });
  const document = createGraph2DDocument({ ...source, stableKey: "native-fit" });
  return { document, rows, tables, objectId: document.source.objects[0].id };
};
it.each(["linear", "quadratic", "cubic", "quartic"] as const)("native %s fit matches shared results, keeps original source, renders bounded intervals and publishes checked residuals", model => {
  const { document, rows, tables, objectId } = dataset(), draft = { ...mobileGraphAnalysisDraft(document), objectId, kind: `regression-${model}` as const };
  const before = serializeGraph2DDocument(document), result = runMobileGraphAnalysis(document, draft, rows), fit = result.regression!;
  expect(fit.coefficients).toEqual(analyzeGraph2DRegression({ document, objectId, rows, model }).coefficients);
  expect(isMobileGraphAnalysisCurrent(result, document, draft)).toBe(true); expect(serializeGraph2DDocument(document)).toBe(before);
  expect(readMobileGraph(storeMobileGraph(document)).source).toEqual(document.source);
  const lines = projectMobileGraphLines(graph2DRegressionOverlaySeries(fit), document.display.viewport, { width: 320, height: 320 }, null, 512);
  expect(lines.length).toBeGreaterThan(0); expect(lines.length).toBeLessThanOrEqual(512);
  const pub = createGraph2DPublication({ ...mobileGraphPublicationRequest(document, tables, result, draft, { width: 320, height: 240 }, { x: "s", y: "m" }), deterministic: true });
  expect(pub.analyses).toHaveLength(3);
  const html = new TextDecoder().decode(renderGraph2DPublicationArtifact(pub, "html").bytes); expect(html).toContain("row_1"); expect(html).toContain("pointwise");
  expect(html).toContain(fit.table.checksum); expect(html).toContain("95% prediction");
  expect(isMobileGraphAnalysisCurrent(result, document, { ...draft, kind: model === "linear" ? "regression-quadratic" : "regression-linear" })).toBe(false);
  expect(mobileGraphPublicationRequest(document, tables, result, { ...draft, x: "44" }, { width: 320, height: 240 }, { x: "", y: "" }).analyses).toHaveLength(0);
});
it("G2D39 native missing sidecars fail explicitly; no fit of downsampled points", () => {
  const { document, objectId } = dataset(), draft = { ...mobileGraphAnalysisDraft(document), objectId, kind: "regression-linear" as const };
  expect(() => runMobileGraphAnalysis(document, draft)).toThrow(/original checked/);
});
it("native spline uses the shared checked source, respects λ, and publishes fitted samples without intervals", () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ id: `row_${i + 1}`, x: i / 79, y: Math.sin(i / 79 * 4) }));
  const tables = new Graph2DPointTableStore(), table = tables.publish(rows);
  const source = applyGraph2DAuthoring(createEmptyGraph2DDocument("native-spline"), { type: "create-point-series",
    draft: { label: "Sine data", table, domain: graph2DPointDomain(rows), mode: "points",
      style: { visible: true, color: "#2563eb", lineWidth: 2, lineStyle: "solid" } } });
  const document = createGraph2DDocument({ ...source, stableKey: "native-spline" }), objectId = document.source.objects[0]!.id;
  const draft = { ...mobileGraphAnalysisDraft(document), objectId, kind: "regression-spline" as const, smoothing: "0.01" };
  const result = runMobileGraphAnalysis(document, draft, rows), fit = result.regression!;
  expect(fit.model).toBe("spline"); expect(fit.curve).toHaveLength(129);
  expect(result.rows.some(row => row.detail.includes("No confidence or prediction intervals"))).toBe(true);
  expect(result.publicationTables?.at(-1)?.columns).toEqual(["x", "Fitted y"]);
  expect(isMobileGraphAnalysisCurrent(result, document, { ...draft, smoothing: "0.02" })).toBe(false);
  expect(() => runMobileGraphAnalysis(document, { ...draft, smoothing: "2" }, rows)).toThrow(/between 0 and 1/);
});
