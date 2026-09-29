import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import frozenDigests from "../../../tests/fixtures/graph2dProfessionalExports.json";
import { createEmptyGraph2DDocument, applyGraph2DAuthoring, createGraph2DDocument, Graph2DPointTableStore, graph2DPointDomain,
  analyzeGraph2DRegression, createGraph2DPublication, GRAPH2D_PUBLICATION_FORMATS, renderGraph2DPublicationArtifact,
  graph2DPublicationAnalysisTable, graph2DRegressionResidualTable, graph2DRegressionCurveTable } from "@math3d/core";

it.each(["linear", "log10"] as const)("G2D40 freezes byte-identical %s publications with original data, assumptions and interval tables", scale => {
  const rows = [1, 3, 4, 7, 8, 12].map((y, i) => ({ id: `row_${i + 1}`, x: i + 1, y }));
  const store = new Graph2DPointTableStore(), table = store.publish(rows);
  const edit = applyGraph2DAuthoring(createEmptyGraph2DDocument("professional", "Professional report"), { type: "create-point-series",
    draft: { label: "Original data", table, domain: graph2DPointDomain(rows), mode: "points", style: { color: "#2255cc", lineStyle: "solid", lineWidth: 2, visible: true } } });
  const document = createGraph2DDocument({ ...edit, stableKey: "professional", display: { ...edit.display,
    viewport: { xMin: .1, xMax: 10, yMin: .1, yMax: 100, aspect: "free", xScale: scale, yScale: scale, continuation: true } } });
  const before = JSON.stringify(document), measured = analyzeGraph2DRegression({ document, rows, model: "linear", objectId: document.source.objects[0].id });
  // Only this frozen fixture normalizes measured timing; real exports preserve the actual envelope.
  const fit = { ...measured, publication: { ...measured.publication, provenance: { ...measured.publication.provenance, elapsedMs: 0 } } };
  const request = { document, size: { width: 320, height: 240 }, deterministic: true, pointTables: { [table.id]: rows },
    analyses: [graph2DPublicationAnalysisTable({ publication: fit.publication }), graph2DRegressionResidualTable(fit), graph2DRegressionCurveTable(fit)] };
  const first = createGraph2DPublication(request), second = createGraph2DPublication(request);
  expect(first.metadata.canonicalSource).toEqual(document.source); expect(first.series.every(s => !s.continuation)).toBe(true);
  expect(first.analyses).toHaveLength(3); expect(JSON.stringify(document)).toBe(before);
  const digests = Object.fromEntries(GRAPH2D_PUBLICATION_FORMATS.map(format => {
    const bytes = renderGraph2DPublicationArtifact(first, format).bytes;
    expect(bytes).toEqual(renderGraph2DPublicationArtifact(second, format).bytes);
    return [format, createHash("sha256").update(bytes).digest("hex")];
  }));
  expect(digests).toEqual(frozenDigests[scale]);
  const html = new TextDecoder().decode(renderGraph2DPublicationArtifact(first, "html").bytes);
  for (const text of ["pointwise", "95% prediction", table.checksum, "row_1", "@media print", "default-src 'none'"]) expect(html).toContain(text);
  expect(html).not.toMatch(/<script\b|\bNaN\b|\bInfinity\b/);
});
