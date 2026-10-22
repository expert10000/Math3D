import { canonicalJsonStringify, sha256Checksum } from "./documentIdentity";
import type { Graph2DDomain, Graph2DPointSeriesObject, Graph2DPointTableReference } from "./graph2dDocument";
import { GRAPH2D_SAMPLER_VERSION, type Graph2DSamplePoint,
  type Graph2DSampleSegment, type Graph2DSamplingArtifact } from "./graph2dSampling";

export const GRAPH2D_POINT_TABLE_MAX_ROWS = 10000;
/** Optional per-job ceiling; analyses must never silently replace checked rows with display samples. */
export const assertGraph2DAnalysisRowBudget = (rowCount: number, maxRows: number | undefined, label: string): void => {
  if (maxRows === undefined) return;
  if (!Number.isSafeInteger(maxRows) || maxRows < 8 || maxRows > GRAPH2D_POINT_TABLE_MAX_ROWS)
    throw new TypeError(`${label} row budget must be 8–${GRAPH2D_POINT_TABLE_MAX_ROWS}.`);
  if (rowCount > maxRows)
    throw new TypeError(`${label} needs ${rowCount.toLocaleString("en-US")} checked rows; increase the analysis row budget to at least ${rowCount.toLocaleString("en-US")}. No rows were omitted.`);
};
export const GRAPH2D_POINT_TABLE_MAX_BYTES = 1024 * 1024;
export type Graph2DPointRow = Readonly<{ id: string; x: number; y: number | null }>;
export type Graph2DPointImportPreview = Readonly<{
  rows: readonly Graph2DPointRow[];
  errors: readonly string[];
  columns: readonly ["x", "y"];
  missingCount: number;
}>;
export type Graph2DPointTableBacking = Readonly<{
  read: (id: string) => string | null;
  write: (id: string, content: string) => void;
}>;
// A store only certifies its own frozen copy after checking the complete table.
// Consumers can reuse that proof without hashing 10,000 rows for every analysis.
const verifiedRows = new WeakMap<readonly Graph2DPointRow[], Graph2DPointTableReference>();
export const graph2DVerifiedPointTableReference = (rows: readonly Graph2DPointRow[]): Graph2DPointTableReference | null =>
  verifiedRows.get(rows) ?? null;

/** A certified frozen table can use its content checksum in sampling keys. */
export const graph2DPointTableSamplingInputs = (tables: Readonly<Record<string, readonly Graph2DPointRow[] | null>>) =>
  Object.fromEntries(Object.entries(tables).map(([id, rows]) => [id, rows ? graph2DVerifiedPointTableReference(rows) ?? rows : null]));

const validRows = (rows: readonly Graph2DPointRow[]): boolean => rows.length >= 1 &&
  rows.length <= GRAPH2D_POINT_TABLE_MAX_ROWS && rows.every((row, index) =>
    row.id === `row_${index + 1}` && Number.isFinite(row.x) &&
    (row.y === null || Number.isFinite(row.y)));

const cells = (line: string, delimiter: string): string[] | null => {
  const result: string[] = [];
  let value = "", quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { result.push(value.trim()); value = ""; }
    else value += char;
  }
  if (quoted) return null;
  result.push(value.trim());
  return result;
};

/** Preview never commits invalid or excess input. Empty/NA y values become explicit gaps. */
export const previewGraph2DPointImport = (text: string): Graph2DPointImportPreview => {
  const errors: string[] = [];
  if (new TextEncoder().encode(text).length > GRAPH2D_POINT_TABLE_MAX_BYTES)
    return { rows: [], errors: ["Point table exceeds 1 MiB."], columns: ["x", "y"], missingCount: 0 };
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim());
  if (!lines.length) return { rows: [], errors: ["Enter CSV or TSV rows with x and y columns."],
    columns: ["x", "y"], missingCount: 0 };
  const delimiter = lines[0]!.includes("\t") ? "\t" : ",";
  const first = cells(lines[0]!, delimiter);
  const header = first?.length === 2 && first[0]!.toLowerCase() === "x" && first[1]!.toLowerCase() === "y";
  const data = header ? lines.slice(1) : lines;
  if (data.length > GRAPH2D_POINT_TABLE_MAX_ROWS) errors.push("Point table exceeds 10,000 rows.");
  const rows: Graph2DPointRow[] = [];
  for (let index = 0; index < Math.min(data.length, GRAPH2D_POINT_TABLE_MAX_ROWS); index += 1) {
    const fields = cells(data[index]!, delimiter);
    if (!fields || fields.length !== 2) { errors.push(`Row ${index + 1}: expected exactly two columns.`); continue; }
    const x = Number(fields[0]);
    const missing = fields[1] === "" || fields[1]!.toLowerCase() === "na";
    const y = missing ? null : Number(fields[1]);
    if (fields[0] === "" || !Number.isFinite(x) || y !== null && !Number.isFinite(y)) {
      errors.push(`Row ${index + 1}: x and non-missing y must be finite numbers.`); continue;
    }
    rows.push({ id: `row_${index + 1}`, x, y });
  }
  if (!rows.length && !errors.length) errors.push("Point table contains no data rows.");
  return { rows, errors: errors.slice(0, 10), columns: ["x", "y"],
    missingCount: rows.filter((row) => row.y === null).length };
};

/** Content-addressed sidecar. The Graph2D document stores only its checked reference. */
export class Graph2DPointTableStore {
  readonly #tables = new Map<string, readonly Graph2DPointRow[]>();
  readonly #sizes = new Map<string, number>();
  readonly #checksums = new Map<string, string>();
  readonly backing?: Graph2DPointTableBacking;
  readonly maxCacheBytes: number;
  constructor(backing?: Graph2DPointTableBacking, maxCacheBytes = Infinity) {
    if (maxCacheBytes !== Infinity && (!Number.isSafeInteger(maxCacheBytes) || maxCacheBytes < 0)) throw new TypeError("Invalid point table cache budget.");
    this.backing = backing; this.maxCacheBytes = maxCacheBytes;
  }
  clearCache() { this.#tables.clear(); this.#sizes.clear(); this.#checksums.clear(); }
  get cachedBytes() { return [...this.#sizes.values()].reduce((sum, bytes) => sum + bytes, 0); }
  #remember(id: string, rows: readonly Graph2DPointRow[], bytes: number, checksum: string) {
    this.#tables.delete(id); this.#sizes.delete(id); this.#checksums.delete(id);
    if (bytes > this.maxCacheBytes) return;
    while (this.cachedBytes + bytes > this.maxCacheBytes && this.#tables.size) {
      const oldest = this.#tables.keys().next().value!; this.#tables.delete(oldest); this.#sizes.delete(oldest); this.#checksums.delete(oldest);
    }
    this.#tables.set(id, rows); this.#sizes.set(id, bytes); this.#checksums.set(id, checksum);
  }

  publish(rows: readonly Graph2DPointRow[]): Graph2DPointTableReference {
    if (!validRows(rows)) throw new TypeError("Point table rows or row IDs are invalid.");
    const content = canonicalJsonStringify(rows);
    const bytes = new TextEncoder().encode(content);
    if (bytes.length > GRAPH2D_POINT_TABLE_MAX_BYTES) throw new TypeError("Point table exceeds 1 MiB.");
    const checksum = sha256Checksum(bytes);
    const reference: Graph2DPointTableReference = { id: `graph2d-table:${checksum.slice(7, 39)}`,
      checksum, rowCount: rows.length, encoding: "math3d.graph2d-point-table.v1" };
    this.backing?.write(reference.id, content);
    const stored = JSON.parse(content) as Graph2DPointRow[];
    stored.forEach(Object.freeze); Object.freeze(stored);
    verifiedRows.set(stored, Object.freeze({ ...reference }));
    this.#remember(reference.id, stored, bytes.length, checksum);
    return reference;
  }

  resolve(reference: Graph2DPointTableReference): readonly Graph2DPointRow[] | null {
    let rows = this.#tables.get(reference.id);
    if (rows) return rows.length === reference.rowCount && this.#checksums.get(reference.id) === reference.checksum ? rows : null;
    if (!rows) {
      const content = this.backing?.read(reference.id);
      if (content === null || content === undefined) return null;
      try {
        const parsed = JSON.parse(content) as Graph2DPointRow[];
        if (!Array.isArray(parsed) || !validRows(parsed) ||
          sha256Checksum(new TextEncoder().encode(canonicalJsonStringify(parsed))) !== reference.checksum ||
          parsed.length !== reference.rowCount) return null;
        parsed.forEach(Object.freeze); Object.freeze(parsed);
        rows = parsed;
        verifiedRows.set(rows, Object.freeze({ ...reference }));
        this.#remember(reference.id, rows, new TextEncoder().encode(content).length, reference.checksum);
      } catch { return null; }
    }
    return rows;
  }
}

export const graph2DPointDomain = (rows: readonly Graph2DPointRow[]): Graph2DDomain => {
  if (!validRows(rows)) throw new TypeError("Point table rows are invalid.");
  const xs = rows.map((row) => row.x);
  const min = Math.min(...xs), max = Math.max(...xs);
  const pad = min === max ? Math.max(1, Math.abs(min) * 0.1) : 0;
  return { min: min - pad, max: max + pad, includeMin: true, includeMax: true };
};

export type Graph2DPointSeriesArtifact = Graph2DSamplingArtifact & Readonly<{
  kind: "point-series";
  mode: "points" | "line";
  state: "ready" | "downsampled" | "missing-table" | "complexity-limit";
  points: readonly Graph2DSamplePoint[];
}>;

export const sampleGraph2DPointSeries = (object: Graph2DPointSeriesObject,
  rows: readonly Graph2DPointRow[] | null, maxSamples: number): Graph2DPointSeriesArtifact => {
  const empty = (state: Graph2DPointSeriesArtifact["state"]): Graph2DPointSeriesArtifact => ({
    kind: "point-series", mode: object.mode, state, points: [], segments: [], samplerVersion: GRAPH2D_SAMPLER_VERSION,
    samplesEvaluated: 0, converged: state === "ready",
    diagnostics: state === "ready" ? [] : [{ code: state === "missing-table" ? "missing-table" : "sample-limit", count: 1 }],
  });
  const downsampled = Number.isSafeInteger(maxSamples) && maxSamples >= 32 && object.mode === "line" &&
    object.table.rowCount > 128 && maxSamples < object.table.rowCount;
  if (!Number.isSafeInteger(maxSamples) || maxSamples < object.table.rowCount && !downsampled) return empty("complexity-limit");
  if (!rows || !validRows(rows) || rows.length !== object.table.rowCount) return empty("missing-table");
  if (downsampled) {
    const missingPrefix = new Uint32Array(rows.length + 1);
    for (let i = 0; i < rows.length; i++) missingPrefix[i + 1] = missingPrefix[i]! + (rows[i]!.y === null ? 1 : 0);
    const points: Graph2DSamplePoint[] = [], segments: Graph2DSampleSegment[] = [];
    let chain: Graph2DSamplePoint[] = [], previous = -1;
    const flush = () => { if (chain.length >= 2) segments.push({ points: chain, openStart: false, openEnd: false }); chain = []; };
    for (let sample = 0; sample < maxSamples; sample++) {
      const index = Math.round(sample * (rows.length - 1) / (maxSamples - 1)), row = rows[index]!;
      if (row.y === null) { flush(); previous = index; continue; }
      if (previous >= 0 && missingPrefix[index]! > missingPrefix[previous + 1]!) flush();
      const point = { x: row.x, y: row.y, rowId: row.id };
      points.push(point); chain.push(point); previous = index;
    }
    flush();
    return { kind: "point-series", mode: object.mode, state: "downsampled", points, segments,
      samplerVersion: GRAPH2D_SAMPLER_VERSION, samplesEvaluated: maxSamples, converged: false,
      diagnostics: [{ code: "sample-limit", count: 1 }] };
  }
  const points = rows.filter((row) => row.y !== null).map((row) => ({ x: row.x, y: row.y!, rowId: row.id }));
  const segments: Graph2DSampleSegment[] = [];
  if (object.mode === "points") for (const point of points)
    segments.push({ points: [point], openStart: false, openEnd: false });
  else {
    let chain: Graph2DSamplePoint[] = [];
    const flush = () => { if (chain.length >= 2) segments.push({ points: chain, openStart: false, openEnd: false }); chain = []; };
    for (const row of rows) {
      if (row.y === null) { flush(); continue; }
      chain.push({ x: row.x, y: row.y, rowId: row.id });
    }
    flush();
  }
  return { kind: "point-series", mode: object.mode, state: "ready", points, segments,
    samplerVersion: GRAPH2D_SAMPLER_VERSION, samplesEvaluated: rows.length,
    converged: true, diagnostics: [] };
};
