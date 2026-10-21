import { expect, it } from "vitest";
import { analyzeGraph2DFourier, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, createGraph2DPublication, Graph2DPointTableStore, graph2DPointDomain,
  renderGraph2DPublicationArtifact } from "@math3d/core";
import { isMobileGraphAnalysisCurrent, mobileGraphAnalysisDraft, runMobileGraphAnalysis } from
  "../../apps/mobile/src/models/mobileGraphAnalysis";
import { mobileGraphPublicationRequest } from "../../apps/mobile/src/models/mobileGraphPublication";

it("GRA-16 mobile and desktop use the same checked spectrum and source-linked publication", () => {
  const rows = Array.from({ length: 128 }, (_, i) => ({ id: `row_${i + 1}`, x: i / 128,
    y: 2 * Math.cos(2 * Math.PI * 8 * i / 128) }));
  const tables = new Graph2DPointTableStore(), table = tables.publish(rows);
  const source = applyGraph2DAuthoring(createEmptyGraph2DDocument("mobile-fourier"), { type: "create-point-series",
    draft: { label: "Eight hertz", table, domain: graph2DPointDomain(rows), mode: "line",
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
  const document = createGraph2DDocument({ ...source, stableKey: "mobile-fourier" });
  const objectId = document.source.objects[0]!.id;
  const draft = { ...mobileGraphAnalysisDraft(document), kind: "fourier" as const, objectId,
    fourierWindow: "rectangular" as const, fourierNormalization: "peak" as const,
    fourierDetrend: "mean" as const, xUnit: "s" };
  const mobile = runMobileGraphAnalysis(document, draft, rows);
  const direct = analyzeGraph2DFourier({ document, objectId, rows, options: {
    window: "rectangular", normalization: "peak", detrend: "mean", xUnit: "s" } });
  expect(mobile.fourier?.bins).toEqual(direct.bins);
  expect(mobile.fourier?.bins[8]!.amplitude).toBeCloseTo(2, 10);
  expect(mobile.publicationTables?.at(-1)?.columns).toEqual(["Frequency", "Amplitude", "Phase radians"]);
  expect(isMobileGraphAnalysisCurrent(mobile, document, draft)).toBe(true);
  expect(isMobileGraphAnalysisCurrent(mobile, document, { ...draft, xUnit: "ms" })).toBe(false);
  const publication = createGraph2DPublication({ ...mobileGraphPublicationRequest(document, tables, mobile, draft,
    { width: 320, height: 240 }, { x: "s", y: "y" }), deterministic: true });
  const html = new TextDecoder().decode(renderGraph2DPublicationArtifact(publication, "html").bytes);
  expect(html).toContain("cycles/s");
  expect(html).toContain(direct.table.checksum);
  expect(() => runMobileGraphAnalysis(document, draft, null)).toThrow(/original checked/);
});
