import { expect, it } from "vitest";
import { analyzeGraph2DRegression, graph2DStudentTCritical95, createEmptyGraph2DDocument, applyGraph2DAuthoring, createGraph2DDocument,
  Graph2DPointTableStore, graph2DPointDomain, isGraph2DRegressionCurrent, createGraph2DPublication, graph2DRegressionResidualTable,
  graph2DPublicationAnalysisTable, renderGraph2DPublicationArtifact, type Graph2DPointRow } from "@math3d/core";
const dataset = (ys: (number | null)[], xs = ys.map((_, i) => i)) => {
  const rows = ys.map((y, i) => ({ id: `row_${i + 1}`, x: xs[i], y })), store = new Graph2DPointTableStore(), table = store.publish(rows);
  const base = createEmptyGraph2DDocument("fit-test", "Measured data"), edit = applyGraph2DAuthoring(base, { type: "create-point-series",
    draft: { label: "Measured", table, domain: graph2DPointDomain(rows), mode: "points", style: { color: "#2255cc", lineStyle: "solid", lineWidth: 2, visible: true } } });
  return { rows, document: createGraph2DDocument({ ...edit, stableKey: "fit-test" }), store };
};
it.each([[1, 12.7062047364], [2, 4.3026527299], [5, 2.5705818356], [10, 2.2281388520], [30, 2.0422724563], [1000, 1.9623390808], [9997, 1.960201]] as const)("Student-t .975 quantile df=%s matches reference", (df, expected) => {
  expect(graph2DStudentTCritical95(df)).toBeCloseTo(expected, df === 9997 ? 5 : 8);
});
it("linear fit matches independent centered sums, residual orthogonality and distinct interval semantics", () => {
  const { document, rows } = dataset([1, 3, 4, 7, 8, 12]);
  const fit = analyzeGraph2DRegression({ document, objectId: document.source.objects[0].id, rows, model: "linear" });
  const meanX = 2.5, meanY = 35 / 6, sxx = 17.5, slope = rows.reduce((n, r) => n + (r.x - meanX) * (r.y! - meanY), 0) / sxx;
  expect(fit.coefficients[0]).toBeCloseTo(meanY, 10); expect(fit.coefficients[1] / fit.scale).toBeCloseTo(slope, 10);
  expect(fit.residuals.reduce((n, r) => n + r.residual, 0)).toBeCloseTo(0, 10);
  expect(fit.residuals.reduce((n, r) => n + r.x * r.residual, 0)).toBeCloseTo(0, 10);
  const p = fit.curve[64], se = fit.residualSD * Math.sqrt(1 / 6 + (p.x - meanX) ** 2 / sxx);
  expect(p.meanHigh - p.y).toBeCloseTo(fit.tCritical * se, 10);
  expect(p.predictionHigh - p.y).toBeGreaterThan(p.meanHigh - p.y);
  expect(Object.isFrozen(fit)).toBe(true); expect(Object.isFrozen(fit.residuals)).toBe(true);
});
it("quadratic exact recovery is stable with large x offsets", () => {
  const xs = [-3, -2, -1, 0, 1, 2, 3].map(x => 1e12 + x), { document, rows } = dataset(xs.map(x => 5 + 2 * (x - 1e12) + .5 * (x - 1e12) ** 2), xs);
  const fit = analyzeGraph2DRegression({ document, objectId: document.source.objects[0].id, rows, model: "quadratic" });
  expect(fit.center).toBe(1e12); expect(fit.coefficients[0]).toBeCloseTo(5, 10); expect(fit.coefficients[1] / fit.scale).toBeCloseTo(2, 10);
  expect(fit.coefficients[2] / fit.scale ** 2).toBeCloseTo(.5, 10); expect(fit.sse).toBeLessThan(1e-20); expect(fit.rSquared).toBeCloseTo(1);
});
it("missing rows are excluded, never imputed; constants have undefined R²; source checksum is retained", () => {
  const { document, rows } = dataset([7, null, 7, 7, 7]);
  const fit = analyzeGraph2DRegression({ document, objectId: document.source.objects[0].id, rows, model: "linear" });
  expect(fit.n).toBe(4); expect(fit.excluded).toBe(1); expect(fit.rSquared).toBeNull(); expect(fit.sse).toBe(0);
  expect(fit.residuals.map(r => r.rowId)).toEqual(["row_1", "row_3", "row_4", "row_5"]);
  expect(fit.publication.provenance.operation.parameters.table).toEqual(fit.table);
});
it.each(["missing", "checksum", "insufficient", "singular", "quadratic-rank"])("rejects %s input without returning a plausible fit", kind => {
  const { document, rows } = dataset(kind === "insufficient" ? [1, 2] : [1, 2, 3, 4], kind === "singular" ? [1, 1, 1, 1] : kind === "quadratic-rank" ? [0, 1, 0, 1] : undefined);
  expect(() => analyzeGraph2DRegression({ document, objectId: document.source.objects[0].id,
    rows: kind === "missing" ? null : kind === "checksum" ? rows.map(r => ({ ...r, y: 99 })) : rows, model: kind === "quadratic-rank" ? "quadratic" : "linear" })).toThrow();
});
it("is view independent, source bound, no extrapolation and export tables retain assumptions/row IDs", () => {
  const { document, rows } = dataset([1, 3, 4, 7, 8, 12]), objectId = document.source.objects[0].id;
  const fit = analyzeGraph2DRegression({ document, objectId, rows, model: "linear" });
  const logDocument = createGraph2DDocument({ ...document, stableKey: "fit-test", display: { ...document.display,
    viewport: { xMin: .1, xMax: 100, yMin: .1, yMax: 100, aspect: "free", xScale: "log10", continuation: true } } });
  const again = analyzeGraph2DRegression({ document: logDocument, objectId, rows, model: "linear" });
  expect(again.coefficients).toEqual(fit.coefficients); expect(again.resultId).toBe(fit.resultId); expect(isGraph2DRegressionCurrent(fit, logDocument)).toBe(true);
  const edit = applyGraph2DAuthoring(document, { type: "delete", objectId });
  expect(isGraph2DRegressionCurrent(fit, createGraph2DDocument({ ...edit, stableKey: "fit-test" }))).toBe(false);
  expect(fit.curve[0].x).toBe(0); expect(fit.curve.at(-1)!.x).toBe(5);
  const publication = createGraph2DPublication({ document, size: { width: 320, height: 240 }, pointTables: { [fit.table.id]: rows },
    analyses: [graph2DPublicationAnalysisTable({ publication: fit.publication }), graph2DRegressionResidualTable(fit)], deterministic: true });
  const html = new TextDecoder().decode(renderGraph2DPublicationArtifact(publication, "html").bytes);
  expect(html).toContain("pointwise"); expect(html).toContain("row_1"); expect(html).toContain(fit.table.checksum);
});
it("handles the bounded 10,000-row limit with deterministic coefficients", () => {
  const { document, rows } = dataset(Array.from({ length: 10000 }, (_, i) => 1 + i * .25));
  const fit = analyzeGraph2DRegression({ document, objectId: document.source.objects[0].id, rows, model: "linear" });
  expect(fit.n).toBe(10000); expect(fit.degreesOfFreedom).toBe(9998); expect(fit.curve).toHaveLength(129);
  expect(fit.coefficients[1] / fit.scale).toBeCloseTo(.25, 10); expect(fit.residuals).toHaveLength(10000);
  expect(graph2DRegressionResidualTable(fit).rows).toHaveLength(2048);
});
