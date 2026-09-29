import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { createGraph2DPublication, renderGraph2DPublicationSVG, renderGraph2DPublicationPNG, renderGraph2DPublicationCSV,
  renderGraph2DPublicationReport, graph2DPublicationCSVCell, graph2DPublicationAnalysisTable, graph2DPublicationAnalysisTables, GRAPH2D_PUBLICATION_FORMATS,
  renderGraph2DPublicationArtifact, getGraph2DPresetCatalog, instantiateGraph2DPreset, sampleGraph2DScene,
  analyzeGraph2DIntegral, applyGraph2DAuthoring, createGraph2DDocument, clipGraph2DPublicationLine } from "@math3d/core";

const scene = (id = "line-comparison") => instantiateGraph2DPreset(getGraph2DPresetCatalog().get(id)!, "publication-test");
const publication = (id = "line-comparison") => { const { document, sidecars } = scene(id);
  return createGraph2DPublication({ document, size: { width: 320, height: 240 }, pointTables: Object.fromEntries(sidecars.map(s => [s.id, s.rows])) }); };

// Independent PNG reader: validate every IEEE CRC and decompress through Node's zlib, not our encoder.
const readPNG = (bytes: Uint8Array) => {
  const buffer = Buffer.from(bytes), chunks: { type: string; data: Buffer }[] = [];
  expect([...buffer.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString("ascii", offset + 4, offset + 8), data = buffer.subarray(offset + 8, offset + 8 + length);
    let crc = 0xffffffff;
    for (const value of buffer.subarray(offset + 4, offset + 8 + length)) {
      crc ^= value; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    expect((crc ^ 0xffffffff) >>> 0).toBe(buffer.readUInt32BE(offset + 8 + length));
    chunks.push({ type, data }); offset += length + 12;
  }
  return { chunks, raw: inflateSync(Buffer.concat(chunks.filter(c => c.type === "IDAT").map(c => c.data))) };
};

describe("G2D36 portable publication recipe", () => {
  for (const preset of getGraph2DPresetCatalog().entries) it(`${preset.id}: matches shared live geometry and carries canonical source`, () => {
    const p = publication(preset.id), { document, sidecars } = scene(preset.id);
    const expected = sampleGraph2DScene({ document: p.document, viewport: document.display.viewport, width: 320, height: 240,
      interaction: false, timeBudgetMs: 1500, pointTables: Object.fromEntries(sidecars.map(s => [s.id, s.rows])) });
    expect(p.series).toEqual(expected); expect(p.metadata.canonicalSource).toEqual(document.source);
    expect(p.metadata.source).toEqual(document.identity); expect(p.metadata.units).toEqual({ x: "unspecified", y: "unspecified" });
    expect(p.series.reduce((n, s) => n + s.artifact.samplesEvaluated, 0)).toBeLessThanOrEqual(4096);
    expect(p.geometry.primitives.length).toBeLessThanOrEqual(16384);
    for (const primitive of p.geometry.primitives) if (primitive.kind === "line") for (const [value, max] of [[primitive.x1, 320], [primitive.x2, 320], [primitive.y1, 240], [primitive.y2, 240]]) {
      expect(value).toBeGreaterThanOrEqual(-1e-8); expect(value).toBeLessThanOrEqual(max + 1e-8);
    }
    expect(renderGraph2DPublicationSVG(p)).not.toMatch(/NaN|Infinity/);
    const image = readPNG(renderGraph2DPublicationPNG(p)); expect(image.raw.length).toBe(240 * (320 * 4 + 1));
    expect(image.raw.some((byte, index) => index % 1281 !== 0 && byte < 240)).toBe(true);
    expect(image.chunks.find(c => c.type === "IHDR")!.data.readUInt32BE(0)).toBe(320);
    const text = image.chunks.find(c => c.type === "iTXt")!.data.toString("utf8");
    expect(JSON.parse(text.slice(text.indexOf("\0") + 5)).snapshotId).toBe(p.snapshotId);
  });
  it("keeps source/display untouched, owns inputs, and reproduces byte-identical outputs", () => {
    const { document } = scene(), before = JSON.stringify(document), request = { document, size: { width: 128, height: 128 }, units: { x: "s", y: "m" } };
    const a = createGraph2DPublication(request), b = createGraph2DPublication(request);
    expect(JSON.stringify(document)).toBe(before); expect(a.snapshotId).toBe(b.snapshotId);
    expect(Object.isFrozen(a.metadata)).toBe(true); expect(Object.isFrozen(a.geometry.primitives)).toBe(true);
    request.units.x = "changed"; expect(a.metadata.units.x).toBe("s");
    for (const format of GRAPH2D_PUBLICATION_FORMATS) {
      const first = renderGraph2DPublicationArtifact(a, format), second = renderGraph2DPublicationArtifact(b, format);
      expect(first.bytes).toEqual(second.bytes); expect(first.snapshotId).toBe(a.snapshotId);
      expect(first.fileName).toMatch(/^[a-zA-Z0-9_-]+\.(svg|png|csv|html)$/);
    }
  });
  it("preserves piecewise endpoints, data gaps/row IDs, inequality fills and strict strokes", () => {
    const p = publication("piecewise-data-gaps"), svg = renderGraph2DPublicationSVG(p), csv = renderGraph2DPublicationCSV(p);
    expect(svg).toContain('fill="#ffffff" stroke='); expect(csv).toContain('"endpoint"'); expect(csv).toContain('"row_1"');
    expect(csv).not.toContain('"row_3"');
    for (const item of p.series) for (const segment of item.artifact.segments)
      expect(segment.points.some(p => p.x < 0) && segment.points.some(p => p.x > 0)).toBe(false);
    const region = publication("strict-disk");
    expect(region.geometry.primitives.some(p => p.kind === "rect")).toBe(true);
    expect(region.geometry.primitives.some(p => p.kind === "line" && p.color === region.series[0].style.color && p.dash === "dashed")).toBe(true);
    expect(renderGraph2DPublicationCSV(region)).toContain("not filled membership");
  });
  it("omits hidden geometry and never bridges point-only datasets", () => {
    const { document, sidecars } = scene("piecewise-data-gaps"), object = document.source.objects[1];
    const points = { ...document, source: { ...document.source, objects: document.source.objects.map(o => o.id === object.id && o.kind === "point-series" ? { ...o, mode: "points" as const } : o) } };
    const doc = createGraph2DDocument({ source: points.source, display: points.display, selection: points.selection, metadata: points.metadata, stableKey: "points-publication" });
    const hidden = { ...doc, display: { ...doc.display, axes: { ...doc.display.axes, x: false, y: false, grid: false, labels: false }, objects: doc.display.objects.map(s => ({ ...s, visible: s.objectId === object.id })) } };
    const p = createGraph2DPublication({ document: hidden, size: { width: 320, height: 240 }, pointTables: Object.fromEntries(sidecars.map(s => [s.id, s.rows])) });
    expect(p.series).toHaveLength(1); expect(p.geometry.primitives.every(p => p.kind === "circle")).toBe(true);
  });
  it("carries numeric analysis values, source, tolerance, confidence and algorithm; rejects stale results", () => {
    const { document } = scene(), result = analyzeGraph2DIntegral({ document, objectId: document.source.objects[0].id, interval: { min: -1, max: 2 }, mode: "signed", tolerance: 1e-6 });
    const table = graph2DPublicationAnalysisTable(result);
    expect(table.rows).toContainEqual(["value", 1.5]); expect(table.rows.some(row => String(row[0]).startsWith("fillSegments"))).toBe(false);
    const p = createGraph2DPublication({ document, size: { width: 320, height: 240 }, analyses: [table] });
    expect(p.analyses[0].publication).toEqual(result.publication);
    expect(renderGraph2DPublicationReport(p)).toContain("1.5"); expect(renderGraph2DPublicationCSV(p)).toContain("analysis-row");
    const edited = createGraph2DDocument({ ...applyGraph2DAuthoring(document, { type: "delete", objectId: document.source.objects[1].id }), stableKey: "new" });
    expect(() => createGraph2DPublication({ document: edited, size: { width: 320, height: 240 }, analyses: [table] })).toThrow(/stale/);
    expect(() => createGraph2DPublication({ document, size: { width: 320, height: 240 }, analyses: [{ ...table, columns: ["duplicate", "duplicate"] }] })).toThrow(/unique/);
  });
  it("escapes active markup and keeps reports offline and accessible", () => {
    const { document } = scene(); const p = createGraph2DPublication({ document: { ...document, metadata: { ...document.metadata, title: '<script>alert("x")</script> & 😀' } }, size: { width: 128, height: 128 }, units: { x: '<img onerror="x">', y: "m" } });
    const svg = renderGraph2DPublicationSVG(p), html = renderGraph2DPublicationReport(p);
    expect(svg).toContain("&lt;script&gt;"); expect(svg).toContain("😀"); expect(html).not.toContain("<script>"); expect(html).not.toContain("<img ");
    expect(html).toContain("default-src 'none'"); expect(html).toContain('<th scope="col">'); expect(svg).toContain('role="img"');
  });
  it("protects CSV string formulas without changing numeric negatives or decimal separators", () => {
    for (const text of ["=1+1", " +cmd", "\t@SUM(A1)", "-formula", "\r\n=2"]) expect(graph2DPublicationCSVCell(text)).toBe(`"'${text}"`);
    expect(graph2DPublicationCSVCell(-1.25)).toBe('"-1.25"'); expect(graph2DPublicationCSVCell('a,"b"\n')).toBe('"a,""b""\n"');
  });
  it("rejects sizes, invalid sources, wrong checksums and unbounded strings", () => {
    const { document, sidecars } = scene("piecewise-data-gaps");
    for (const size of [{ width: 127, height: 128 }, { width: 1600, height: 1600 }, { width: NaN, height: 128 }, { width: 128.5, height: 128 }])
      expect(() => createGraph2DPublication({ document, size })).toThrow(/size/);
    expect(() => createGraph2DPublication({ document, size: { width: 128, height: 128 }, units: { x: "x".repeat(65), y: "" } })).toThrow();
    expect(() => createGraph2DPublication({ document, size: { width: 128, height: 128 }, pointTables: { [sidecars[0].id]: sidecars[0].rows.map(row => ({ ...row, y: 9 })) } })).toThrow(/checksum/);
    const missing = createGraph2DPublication({ document, size: { width: 128, height: 128 } });
    expect(missing.metadata.warnings.join(" ")).toContain("incomplete");
  });
  it("clips offscreen lines and rejects overflow coordinates", () => {
    expect(clipGraph2DPublicationLine({ x: -10, y: 10 }, { x: 200, y: 10 }, { width: 100, height: 100 })).toEqual({ x1: 0, y1: 10, x2: 100, y2: 10 });
    expect(clipGraph2DPublicationLine({ x: -10, y: -10 }, { x: -20, y: -20 }, { width: 100, height: 100 })).toBeNull();
    expect(clipGraph2DPublicationLine({ x: -Number.MAX_VALUE, y: 0 }, { x: Number.MAX_VALUE, y: 0 }, { width: 100, height: 100 })).toBeNull();
  });
  it("clamps saved quality and retains omissions/incompleteness instead of certifying absent features", () => {
    const { document } = scene("strict-disk");
    const doc = { ...document, display: { ...document.display, sampling: { maxSamples: 200000, maxDepth: 24, tolerancePx: .1 } } };
    const p = createGraph2DPublication({ document: doc, size: { width: 128, height: 128 } });
    expect(p.metadata.savedSampling.maxSamples).toBe(200000); expect(p.metadata.sampling.maxSamples).toBe(4096); expect(p.metadata.sampling.maxDepth).toBe(16);
    expect(p.series.reduce((sum, item) => sum + item.artifact.samplesEvaluated, 0)).toBeLessThanOrEqual(4096);
    expect(p.metadata.warnings.join(" ")).toContain("not proof");
  });
  it("preserves dash phase across tessellated edges instead of turning strict boundaries solid", () => {
    const p = publication("strict-disk"), lines = p.geometry.primitives.filter(p => p.kind === "line" && p.dash === "dashed");
    expect(lines.length).toBeGreaterThan(5); expect(lines.some(p => p.kind === "line" && p.dashOffset >= 8)).toBe(true);
    expect(renderGraph2DPublicationSVG(p)).toContain("stroke-dashoffset=");
  });
  it("omits oversized individual/aggregate analysis projections explicitly without blocking plot export", () => {
    const { document } = scene(), result = analyzeGraph2DIntegral({ document, objectId: document.source.objects[0].id, interval: { min: -1, max: 2 }, mode: "signed" });
    const oversized = graph2DPublicationAnalysisTables([{ ...result, huge: Array(5000).fill(1) }, result]);
    expect(oversized.analyses).toHaveLength(1); expect(oversized.analysisNotes).toHaveLength(1);
    const many = graph2DPublicationAnalysisTables(Array(3).fill({ ...result, values: Array(2000).fill(1) }));
    expect(many.analyses).toHaveLength(2); expect(many.analysisNotes).toHaveLength(1);
    const p = createGraph2DPublication({ document, size: { width: 128, height: 128 }, ...oversized });
    for (const text of [renderGraph2DPublicationSVG(p), renderGraph2DPublicationCSV(p), renderGraph2DPublicationReport(p)]) expect(text).toContain("table omitted by publication budget");
    expect(readPNG(renderGraph2DPublicationPNG(p)).chunks.find(c => c.type === "iTXt")!.data.toString("utf8")).toContain("table omitted by publication budget");
  });
});
