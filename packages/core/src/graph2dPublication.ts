import { normalizeAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { parseGraph2DDocument, type Graph2DDocument } from "./graph2dDocument";
import { Graph2DPointTableStore, type Graph2DPointRow } from "./graph2dPointSeries";
import { sampleGraph2DScene } from "./graph2dSceneSampling";
import { isGraph2DViewport, resolveGraph2DViewport, type Graph2DScreenSize, type Graph2DViewport } from "./graph2dViewport";
import { projectGraph2DPublicationGeometry } from "./graph2dPublicationGeometry";
import type { Graph2DPiecewiseArtifact } from "./graph2dPiecewise";

export type Graph2DPublicationCell = string | number | null;
export type Graph2DPublicationTable = Readonly<{ publication: AnalysisResultEnvelope; columns: readonly string[]; rows: readonly (readonly Graph2DPublicationCell[])[] }>;
/** Lossless scalar projection of an existing result, without geometry or another result's envelope. */
export const graph2DPublicationAnalysisTable = (result: { publication: AnalysisResultEnvelope }): Graph2DPublicationTable => {
  const rows: Graph2DPublicationCell[][] = [];
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 12 || rows.length >= 4096) throw new TypeError("Analysis projection exceeds its table budget.");
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      rows.push([path, typeof value === "boolean" ? String(value) : typeof value === "number" && !Number.isFinite(value) ? null : typeof value === "string" ? checkedText(value, 2048) : value]);
    } else if (Array.isArray(value)) value.forEach((entry, i) => visit(entry, `${path}[${i}]`, depth + 1));
    else if (typeof value === "object") for (const [key, entry] of Object.entries(value)) {
      if (["publication", "overlays", "fillSegments", "derivatives"].includes(key)) continue;
      visit(entry, path ? `${path}.${key}` : key, depth + 1);
    }
  };
  visit(result, "", 0);
  return { publication: result.publication, columns: ["Field", "Value"], rows };
};
/** Keeps export usable when a current result exceeds publication (not analysis) limits. */
export const graph2DPublicationAnalysisTables = (results: readonly { publication: AnalysisResultEnvelope }[]) => {
  const analyses: Graph2DPublicationTable[] = [], analysisNotes: string[] = [];
  let rows = 0, bytes = 2;
  for (const result of results) {
    try {
      const table = graph2DPublicationAnalysisTable(result), length = new TextEncoder().encode(JSON.stringify(table)).length;
      if (analyses.length >= 16 || rows + table.rows.length > 4096 || bytes + length + 1 > 512 * 1024) throw new TypeError("budget");
      analyses.push(table); rows += table.rows.length; bytes += length + 1;
    } catch { analysisNotes.push(`${result.publication.provenance.operation.type.slice(0, 160)}: table omitted by publication budget; existing analysis is unchanged.`); }
  }
  return { analyses, analysisNotes: analysisNotes.slice(0, 16) };
};
export type Graph2DPublicationRequest = Readonly<{ document: Graph2DDocument; size: Graph2DScreenSize; viewport?: Graph2DViewport;
  units?: Readonly<{ x: string; y: string }>; pointTables?: Readonly<Record<string, readonly Graph2DPointRow[] | null>>;
  analyses?: readonly Graph2DPublicationTable[]; analysisNotes?: readonly string[]; deterministic?: boolean }>;
export const GRAPH2D_PUBLICATION_LIMITS = Object.freeze({ maxSamples: 4096, maxPixels: 1200000, maxDimension: 1600,
  maxBytes: 8 * 1024 * 1024, maxTables: 16, maxTableRows: 4096 });
const utf8 = (text: string) => new TextEncoder().encode(text);
export const escapeGraph2DPublicationText = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff]/gu, "\ufffd")
  .replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!));
const checkedText = (text: string, max: number) => {
  if (typeof text !== "string" || text.length > max) throw new TypeError("Publication text exceeds its limit.");
  return text;
};
const freezeSnapshot = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeSnapshot); Object.freeze(value);
  }
  return value;
};
export const graph2DPublicationTableAllowance = (document: Graph2DDocument) => Math.max(32, Math.floor(Math.min(document.display.sampling.maxSamples,
  GRAPH2D_PUBLICATION_LIMITS.maxSamples) / Math.max(1, document.display.objects.filter((s) => s.visible).length)));

/** Owns a checked source/view/result snapshot; never serializes a transient screen or reparses/evaluates host code. */
export const createGraph2DPublication = (request: Graph2DPublicationRequest) => {
  const { width, height } = request.size;
  if (![width, height].every((n) => Number.isSafeInteger(n) && n >= 128 && n <= GRAPH2D_PUBLICATION_LIMITS.maxDimension) || width * height > GRAPH2D_PUBLICATION_LIMITS.maxPixels)
    throw new TypeError("Publication size must be 128–1600 pixels per axis and at most 1,200,000 pixels.");
  const document = parseGraph2DDocument(JSON.stringify(request.document));
  const viewport = request.viewport ?? document.display.viewport;
  if (!isGraph2DViewport(viewport)) throw new TypeError("Invalid publication viewport.");
  const units = { x: checkedText(request.units?.x ?? "unspecified", 64).trim() || "unspecified", y: checkedText(request.units?.y ?? "unspecified", 64).trim() || "unspecified" };
  if (request.analysisNotes && (!Array.isArray(request.analysisNotes) || request.analysisNotes.length > 16)) throw new TypeError("Invalid analysis omission notes.");
  const analysisNotes = (request.analysisNotes ?? []).map((note: string) => checkedText(note, 256));
  const savedSampling = document.display.sampling;
  const sampling = { ...savedSampling, maxSamples: Math.min(savedSampling.maxSamples, GRAPH2D_PUBLICATION_LIMITS.maxSamples), maxDepth: Math.min(savedSampling.maxDepth, 16) };
  const pointTables: Record<string, readonly Graph2DPointRow[] | null> = {}, checkedTables = new Graph2DPointTableStore();
  const allowance = graph2DPublicationTableAllowance(document);
  for (const object of document.source.objects) if (object.kind === "point-series" && document.display.objects.some((s) => s.objectId === object.id && s.visible) && object.table.rowCount <= allowance) {
    const rows = request.pointTables?.[object.table.id] ?? null;
    if (rows) {
      const reference = checkedTables.publish(rows);
      if (reference.id !== object.table.id || reference.checksum !== object.table.checksum || reference.rowCount !== object.table.rowCount)
        throw new TypeError("Publication point sidecar differs from its checksum reference.");
      pointTables[object.table.id] = checkedTables.resolve(reference);
    } else pointTables[object.table.id] = null;
  }
  const tables = request.analyses ?? [];
  if (!Array.isArray(tables) || tables.length > GRAPH2D_PUBLICATION_LIMITS.maxTables || utf8(JSON.stringify(tables)).length > 512 * 1024) throw new TypeError("Publication analysis tables exceed their budget.");
  let tableRows = 0;
  const analyses = tables.map((table: Graph2DPublicationTable): Graph2DPublicationTable => {
    const normalized = normalizeAnalysisResultEnvelope(table.publication);
    if (!normalized.ok) throw new TypeError("Invalid publication analysis provenance.");
    const publication = normalized.value, source = publication.provenance.source;
    if (source.documentId !== document.identity.id || source.revision !== document.identity.revision || source.structuralHash !== document.identity.structuralHash)
      throw new TypeError("Publication analysis is stale; run the analysis again.");
    if (!Array.isArray(table.columns) || !table.columns.length || table.columns.length > 16 || !Array.isArray(table.rows)) throw new TypeError("Invalid publication analysis columns or rows.");
    const columns = table.columns.map((text: string) => checkedText(text, 160));
    if (new Set(columns).size !== columns.length) throw new TypeError("Publication analysis column names must be unique.");
    tableRows += table.rows.length;
    if (tableRows > GRAPH2D_PUBLICATION_LIMITS.maxTableRows) throw new TypeError("Publication analysis rows exceed their budget.");
    const rows = table.rows.map((row: readonly Graph2DPublicationCell[]) => {
      if (!Array.isArray(row) || row.length !== columns.length || row.some((cell) => cell !== null && typeof cell !== "string" && typeof cell !== "number" || typeof cell === "number" && !Number.isFinite(cell)))
        throw new TypeError("Invalid publication analysis cells.");
      return row.map((cell: Graph2DPublicationCell) => typeof cell === "string" ? checkedText(cell, 2048) : cell);
    });
    return { publication, columns, rows };
  });
  const exportDocument = { ...document, display: { ...document.display, viewport: { ...viewport }, sampling } };
  const series = sampleGraph2DScene({ document: exportDocument, viewport: { ...viewport, continuation: false }, width, height, interaction: false, pointTables, timeBudgetMs: 1500, deterministic: request.deterministic === true });
  const geometry = projectGraph2DPublicationGeometry(exportDocument, series, { width, height });
  const warnings = ["Static publication, not an editable Graph checkpoint. Use the existing Graph/handoff export to retain portable editing.",
    "Sampled floating-point geometry is approximate; convergence is not proof of continuity or absence of narrow features.",
    "Publication excludes transient selection, hover, analysis overlays and mixed-workspace companion geometry. Analysis tables carry separate result provenance.",
    "Canonical source metadata includes hidden objects; plotted geometry contains visible objects only.",
    "CSV contains bounded sampled geometry, not the original dataset; gaps and region fills are described explicitly.",
    "Unit labels are user declarations, not dimensional validation or conversion; unspecified units remain unspecified.",
    "PNG uses a deterministic pixel raster and compact numeric tick font; use SVG/HTML for full text and scalable presentation."];
  warnings.push(...analysisNotes.map(note => `Analysis projection: ${note}`));
  if (viewport.continuation) warnings.push("Visual-only continuation is excluded; exported geometry remains inside the authored domains.");
  if (viewport.xScale === "log10" || viewport.yScale === "log10") warnings.push("Base-10 display axes omit non-positive coordinates. Analysis tables and CSV coordinates remain authored world values, not logarithms.");
  if (series.some((s) => !s.artifact.converged)) warnings.push("Sampling is incomplete for one or more visible objects; consult per-object diagnostics.");
  if (geometry.omitted) warnings.push(`${geometry.omitted} primitives omitted by the publication geometry budget.`);
  const metadata = { format: "math3d.graph2d-publication.v1", recipeVersion: 1, title: document.metadata.title,
    source: document.identity, viewport: { ...viewport }, effectiveViewport: resolveGraph2DViewport(viewport, { width, height }),
    size: { width, height }, units, unitSemantics: "declared-labels-only", canonicalSource: document.source, axes: document.display.axes,
    savedSampling, sampling, method: "shared-graph2d-scene-sampler-v1",
    ...(request.deterministic === true ? { workPolicy: "bounded-evaluations-no-clock-truncation" } : {}),
    objects: series.map((s) => ({ objectId: s.objectId, kind: document.source.objects.find((o) => o.id === s.objectId)!.kind,
      label: document.source.objects.find((o) => o.id === s.objectId)!.label, style: s.style, samplesEvaluated: s.artifact.samplesEvaluated, converged: s.artifact.converged,
      diagnostics: s.artifact.diagnostics })), warnings, analyses: analyses.map((a) => a.publication) };
  const result = { snapshotId: structuralHash({ metadata, series, analyses }), metadata, document: exportDocument, series, analyses, geometry };
  if (utf8(JSON.stringify(result)).length > GRAPH2D_PUBLICATION_LIMITS.maxBytes) throw new TypeError("Publication snapshot exceeds 8 MiB.");
  return freezeSnapshot(result);
};
export type Graph2DPublication = ReturnType<typeof createGraph2DPublication>;
const bounded = (text: string) => { if (utf8(text).length > GRAPH2D_PUBLICATION_LIMITS.maxBytes) throw new TypeError("Publication output exceeds 8 MiB."); return text; };
const n = (value: number) => Number(value.toFixed(3));
export const renderGraph2DPublicationSVG = (publication: Graph2DPublication, idPrefix = "graph-publication"): string => {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(idPrefix)) throw new TypeError("Invalid publication SVG identifier prefix.");
  const { width, height } = publication.metadata.size, escape = escapeGraph2DPublicationText;
  const description = `Approximate graph. Source ${publication.metadata.source.structuralHash}. Units x: ${publication.metadata.units.x}; y: ${publication.metadata.units.y}. ${publication.metadata.warnings.join(" ")}`;
  const shapes = publication.geometry.primitives.map((p) => p.kind === "line" ? `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${p.color}" stroke-width="${p.width}"${p.dash === "solid" ? "" : ` stroke-dasharray="${p.dash === "dashed" ? "8 5" : "2 4"}" stroke-dashoffset="${n(-p.dashOffset)}"`}/>` :
    p.kind === "rect" ? `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.width)}" height="${n(p.height)}" fill="${p.color}" fill-opacity="${p.opacity}"/>` :
      p.kind === "circle" ? `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${p.radius}" fill="${p.open ? "#ffffff" : p.color}" stroke="${p.color}" stroke-width="1.5"/>` :
        `<text x="${n(p.x)}" y="${n(p.y)}" font-size="12" font-family="sans-serif" fill="#334155">${escape(p.text)}</text>`).join("");
  return bounded(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${idPrefix}-title ${idPrefix}-desc"><title id="${idPrefix}-title">${escape(publication.metadata.title)}</title><desc id="${idPrefix}-desc">${escape(description)}</desc><metadata>${escape(JSON.stringify({ snapshotId: publication.snapshotId, ...publication.metadata }))}</metadata><defs><clipPath id="${idPrefix}-clip"><rect width="${width}" height="${height}"/></clipPath></defs><rect width="${width}" height="${height}" fill="#ffffff"/><g clip-path="url(#${idPrefix}-clip)">${shapes}</g></svg>`);
};
/** Quotes every field; only untrusted strings receive spreadsheet formula protection, never numeric negatives. */
export const graph2DPublicationCSVCell = (cell: Graph2DPublicationCell) => {
  const raw = cell === null ? "" : typeof cell === "number" ? String(cell) : /^[\s\u0000-\u001f]*[=+@-]/.test(cell) ? `'${cell}` : cell;
  return `"${raw.replace(/"/g, '""')}"`;
};
export const renderGraph2DPublicationCSV = (publication: Graph2DPublication): string => {
  const rows: Graph2DPublicationCell[][] = [["record_type", "object_or_result_id", "label", "segment", "point", "x", "y", "parameter", "row_id", "open_start", "open_end", "status", "method", "metadata"]];
  rows.push(["metadata", publication.snapshotId, publication.metadata.title, null, null, null, null, null, null, null, null, "approximate", publication.metadata.method, JSON.stringify(publication.metadata)]);
  for (const item of publication.series) {
    const label = publication.metadata.objects.find((o) => o.objectId === item.objectId)!.label;
    rows.push(["object", item.objectId, label, null, null, null, null, null, null, null, null, item.artifact.converged ? "converged-within-policy" : "incomplete", publication.metadata.method, JSON.stringify(item.artifact.diagnostics)]);
    item.artifact.segments.forEach((segment, segmentId) => segment.points.forEach((p, pointId) => rows.push(["point", item.objectId, label, segmentId, pointId, p.x, p.y, p.parameter ?? null, p.rowId ?? null,
      segment.openStart ? "open" : null, segment.openEnd ? "open" : null, "sampled", publication.metadata.method, null])));
    if ("kind" in item.artifact && item.artifact.kind === "piecewise") for (const endpoint of (item.artifact as Graph2DPiecewiseArtifact).endpoints)
      rows.push(["endpoint", item.objectId, label, null, null, endpoint.x, endpoint.y, null, null, endpoint.open ? "open" : "included", null, "source-domain-endpoint", publication.metadata.method, JSON.stringify(endpoint)]);
    if ("kind" in item.artifact && item.artifact.kind === "inequality-region") rows.push(["region", item.objectId, label, null, null, null, null, null, null, null, null, "sampled-region", "bounded-contours-and-cell-fills", "CSV point rows describe contours, not filled membership; use SVG/report and the canonical source."]);
  }
  for (const table of publication.analyses) {
    rows.push(["analysis", table.publication.resultId, table.publication.provenance.operation.type, null, null, null, null, null, null, null, null, table.publication.status,
      table.publication.provenance.operation.algorithm, JSON.stringify(table.publication)]);
    table.rows.forEach((row, index) => rows.push(["analysis-row", table.publication.resultId, table.publication.provenance.operation.type, null, index, null, null, null, null, null, null, table.publication.status,
      table.publication.provenance.operation.algorithm, JSON.stringify(Object.fromEntries(table.columns.map((column, i) => [column, row[i]])))]));
  }
  return bounded(rows.map((row) => row.map(graph2DPublicationCSVCell).join(",")).join("\r\n") + "\r\n");
};
export const renderGraph2DPublicationReport = (publication: Graph2DPublication): string => {
  const escape = escapeGraph2DPublicationText, metadata = publication.metadata;
  const rows = publication.series.flatMap((item) => item.artifact.segments.flatMap((segment, id) => segment.points.map((p) => ({ objectId: item.objectId, segment: id, ...p }))));
  const table = (caption: string, columns: readonly string[], records: readonly (readonly Graph2DPublicationCell[])[]) => `<table><caption>${escape(caption)}</caption><thead><tr>${columns.map((c) => `<th scope="col">${escape(c)}</th>`).join("")}</tr></thead><tbody>${records.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell === null ? "Unavailable" : String(cell))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  return bounded(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>${escape(metadata.title)} — Graph publication</title><style>body{font:16px/1.5 system-ui,sans-serif;color:#172033;background:white;max-width:1000px;margin:auto;padding:24px}h1,h2{line-height:1.2}svg{max-width:100%;height:auto;border:1px solid #64748b}table{border-collapse:collapse;width:100%;margin:16px 0;overflow-wrap:anywhere}caption{text-align:left;font-weight:700}td,th{border:1px solid #64748b;padding:6px;text-align:left}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}dt{font-weight:700}dd{margin:0 0 8px}li{margin-bottom:6px}@media print{body{padding:0}tr,figure{break-inside:avoid}thead{display:table-header-group}}</style></head><body><main><h1>${escape(metadata.title)}</h1><p>Static, approximate mathematical publication — not an editable project.</p><section aria-labelledby="provenance"><h2 id="provenance">Provenance and recipe</h2><dl><dt>Snapshot</dt><dd>${publication.snapshotId}</dd><dt>Source document / revision</dt><dd>${escape(metadata.source.id)} / ${metadata.source.revision}</dd><dt>Source hash</dt><dd>${metadata.source.structuralHash}</dd><dt>Units (declared labels only)</dt><dd>x: ${escape(metadata.units.x)}; y: ${escape(metadata.units.y)}</dd><dt>Effective viewport</dt><dd>${escape(JSON.stringify(metadata.effectiveViewport))}</dd><dt>Method / sampling tolerance</dt><dd>${metadata.method} / ${metadata.sampling.tolerancePx} screen pixels; ${metadata.sampling.maxSamples} maximum samples</dd></dl></section><section aria-labelledby="warnings"><h2 id="warnings">Limits and semantics loss</h2><ul>${metadata.warnings.map((w) => `<li>${escape(w)}</li>`).join("")}</ul></section><figure>${renderGraph2DPublicationSVG(publication)}<figcaption>Sampled graph at ${metadata.size.width} × ${metadata.size.height} pixels. Segment gaps are retained. Polar grids are approximated polylines.</figcaption></figure><section aria-labelledby="objects"><h2 id="objects">Objects and sampling diagnostics</h2>${table("Visible objects", ["Object", "Kind", "Evaluations", "Sampling state", "Diagnostics"], metadata.objects.map((o) => [o.label, o.kind, o.samplesEvaluated, o.converged ? "Converged within policy, not certified" : "Incomplete", JSON.stringify(o.diagnostics)]))}</section><section aria-labelledby="analyses"><h2 id="analyses">Current analysis tables</h2>${publication.analyses.length ? publication.analyses.map((a) => `<h3>${escape(a.publication.provenance.operation.type)}</h3><p>${escape(a.publication.status)} · ${escape(a.publication.provenance.operation.algorithm)} v${escape(a.publication.provenance.operation.algorithmVersion)}</p><pre>${escape(JSON.stringify(a.publication, null, 2))}</pre>${table(a.publication.resultId, a.columns, a.rows)}`).join("") : "<p>No current analysis was supplied. Export does not run analysis automatically.</p>"}</section><section aria-labelledby="samples"><h2 id="samples">Sampled points</h2>${table(`First ${Math.min(200, rows.length)} of ${rows.length} sample rows; export CSV for all bounded rows`, ["Object", "Segment", "x", "y", "Parameter", "Data row"], rows.slice(0, 200).map((r) => [r.objectId, r.segment, r.x, r.y, r.parameter ?? null, r.rowId ?? null]))}</section><details><summary>Canonical mathematical source (for inspection, not import)</summary><pre>${escape(JSON.stringify(publication.document.source, null, 2))}</pre></details><details><summary>Full publication metadata</summary><pre>${escape(JSON.stringify({ snapshotId: publication.snapshotId, ...metadata }, null, 2))}</pre></details></main></body></html>`);
};
