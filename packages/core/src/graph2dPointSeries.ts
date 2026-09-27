import { canonicalJsonStringify, sha256Checksum } from "./documentIdentity";
import type { Graph2DDomain, Graph2DPointSeriesObject, Graph2DPointTableReference } from "./graph2dDocument";
import { GRAPH2D_SAMPLER_VERSION, type Graph2DSamplePoint,
  type Graph2DSampleSegment, type Graph2DSamplingArtifact } from "./graph2dSampling";

export const GRAPH2D_POINT_TABLE_MAX_ROWS = 10000;
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
  readonly backing?: Graph2DPointTableBacking;
  constructor(backing?: Graph2DPointTableBacking) { this.backing = backing; }

  publish(rows: readonly Graph2DPointRow[]): Graph2DPointTableReference {
    if (!validRows(rows)) throw new TypeError("Point table rows or row IDs are invalid.");
    const content = canonicalJsonStringify(rows);
    const bytes = new TextEncoder().encode(content);
    if (bytes.length > GRAPH2D_POINT_TABLE_MAX_BYTES) throw new TypeError("Point table exceeds 1 MiB.");
    const checksum = sha256Checksum(bytes);
    const reference: Graph2DPointTableReference = { id: `graph2d-table:${checksum.slice(7, 39)}`,
      checksum, rowCount: rows.length, encoding: "math3d.graph2d-point-table.v1" };
    this.backing?.write(reference.id, content);
    this.#tables.set(reference.id, JSON.parse(content) as Graph2DPointRow[]);
    return reference;
  }

  resolve(reference: Graph2DPointTableReference): readonly Graph2DPointRow[] | null {
    let rows = this.#tables.get(reference.id);
    if (!rows) {
      const content = this.backing?.read(reference.id);
      if (content === null || content === undefined) return null;
      try {
        const parsed = JSON.parse(content) as Graph2DPointRow[];
        if (!Array.isArray(parsed) || !validRows(parsed) ||
          sha256Checksum(new TextEncoder().encode(canonicalJsonStringify(parsed))) !== reference.checksum) return null;
        rows = parsed;
        this.#tables.set(reference.id, rows);
      } catch { return null; }
    }
    return rows.length === reference.rowCount &&
      sha256Checksum(new TextEncoder().encode(canonicalJsonStringify(rows))) === reference.checksum ? rows : null;
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
  state: "ready" | "missing-table" | "complexity-limit";
  points: readonly Graph2DSamplePoint[];
}>;

export const sampleGraph2DPointSeries = (object: Graph2DPointSeriesObject,
  rows: readonly Graph2DPointRow[] | null, maxSamples: number): Graph2DPointSeriesArtifact => {
  const empty = (state: Graph2DPointSeriesArtifact["state"]): Graph2DPointSeriesArtifact => ({
    kind: "point-series", mode: object.mode, state, points: [], segments: [], samplerVersion: GRAPH2D_SAMPLER_VERSION,
    samplesEvaluated: 0, converged: state === "ready",
    diagnostics: state === "ready" ? [] : [{ code: state === "missing-table" ? "missing-table" : "sample-limit", count: 1 }],
  });
  if (!rows || !validRows(rows) || rows.length !== object.table.rowCount) return empty("missing-table");
  if (!Number.isSafeInteger(maxSamples) || maxSamples < rows.length) return empty("complexity-limit");
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
