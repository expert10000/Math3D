import { VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE,
  VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE, structuralHash,
  type AnalysisResultEnvelope, type Graph2DDocument, type Graph2DPointRow,
  type Graph2DPointSeriesObject } from "@math3d/core";
import { pointTableStore } from "../graph2d/pointTableStore";
import type { SavedRegionSourceStatus, SingleRegionSourceStatus } from
  "../vectorfield3d/checkSavedRegionResultSources";

export type ScientificProfile = Readonly<{ xName: string; xUnit: string;
  yUnit: string; rowsSha256: string; rows: readonly Graph2DPointRow[] }>;
export type ScientificChartField = Readonly<{ key: string; label: string;
  status: SingleRegionSourceStatus; column?: ScientificProfile;
  row?: ScientificProfile }>;
export type ScientificSubrectangleChart = Readonly<{ resultId: string;
  sourceHash: string; bounds: readonly [readonly [number, number],
    readonly [number, number]]; fields: readonly ScientificChartField[] }>;

const vectorFields = [
  ["vector", "Vector speed", "vector"],
  ["divergence", "Divergence", "divergence"],
  ["curlMagnitude", "Curl magnitude", "curl-magnitude"],
] as const;
const combinedFields = [
  ["vector", "Vector speed", "vector"],
  ["scalar", "Scalar Q", "scalar"],
  ["complexMagnitude", "Complex magnitude", "complex-magnitude"],
  ["complexPhase", "Complex phase", "complex-phase"],
  ["divergence", "Divergence", "divergence"],
  ["curlMagnitude", "Curl magnitude", "curl-magnitude"],
] as const;

const fieldStatus = (status: SavedRegionSourceStatus, key: string):
  SingleRegionSourceStatus => typeof status === "string" ? status :
    key in status ? (status as unknown as Record<string, SingleRegionSourceStatus>)[key]! :
      "changed";

/** Resolve only rows whose saved hash and freshly checked source are current. */
export function scientificSubrectangleProfileChart(result: AnalysisResultEnvelope,
  graphs: readonly Graph2DDocument[], status: SavedRegionSourceStatus):
  ScientificSubrectangleChart {
  const combined = result.provenance.operation.type ===
    VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE;
  if (!combined && result.provenance.operation.type !==
      VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE)
    throw new TypeError("A published scientific subrectangle is required.");
  const parameters = result.provenance.operation.parameters;
  const profiles = parameters.profiles as { columnPairId?: string;
    rowPairId?: string; columnRowsSha256?: readonly string[];
    rowRowsSha256?: readonly string[] } | undefined;
  const bounds = parameters.bounds as ScientificSubrectangleChart["bounds"];
  if (!profiles?.columnPairId || !profiles.rowPairId || !Array.isArray(bounds) ||
      bounds.length !== 2) throw new TypeError("Saved profile references are incomplete.");
  const fields = combined ? combinedFields : vectorFields;
  const graph = graphs.find(document => [profiles.columnPairId,
    profiles.rowPairId].every(pairId => document.source.objects.some(object =>
      object.kind === "point-series" && object.linkedOrigin?.pairId === pairId)));
  const resolve = (series: string, axis: 0 | 1, index: number):
    ScientificProfile | undefined => {
    const pairId = axis === 0 ? profiles.columnPairId : profiles.rowPairId;
    const expectedHash = (axis === 0 ? profiles.columnRowsSha256 :
      profiles.rowRowsSha256)?.[index];
    const kind = combined ? axis === 0 ?
      "vector-scalar-complex-curl-linked-region/v4" :
      "vector-scalar-complex-curl-row-linked-region/v5" :
      "vector-derived-linked-region/v1";
    const matches = graph?.source.objects.filter((object): object is
      Graph2DPointSeriesObject => object.kind === "point-series" &&
      object.linkedOrigin?.kind === kind && object.linkedOrigin.pairId === pairId &&
      object.linkedOrigin.series === series &&
      (object.linkedOrigin.profileAxis ?? 0) === axis) ?? [];
    if (matches.length !== 1 || !expectedHash) return undefined;
    const object = matches[0]!;
    const origin = object.linkedOrigin!;
    const rows = pointTableStore.resolve(object.table);
    if (!rows || rows.length !== 17 || origin.rowsSha256 !== expectedHash ||
        structuralHash(rows) !== expectedHash || !origin.xName || !origin.xUnit ||
        !origin.yUnit || rows.some(row => !Number.isFinite(row.x) ||
          row.y !== null && !Number.isFinite(row.y))) return undefined;
    return { xName: origin.xName, xUnit: origin.xUnit,
      yUnit: origin.yUnit, rowsSha256: expectedHash, rows };
  };
  return { resultId: result.resultId,
    sourceHash: result.provenance.source.structuralHash, bounds,
    fields: fields.map(([key, label, series], index) => {
      const checked = fieldStatus(status, key);
      if (checked !== "source-current") return { key, label, status: checked };
      const column = resolve(series, 0, index), row = resolve(series, 1, index);
      return column && row && column.yUnit === row.yUnit ?
        { key, label, status: checked, column, row } :
        { key, label, status: "changed" as const };
    }) };
}

const xml = (value: unknown) => String(value).replace(/&/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");
const number = (value: number) => Number.isFinite(value) ?
  Number(value.toPrecision(4)).toString() : "gap";
const colors = ["#2563eb", "#0d9488", "#9333ea", "#ea580c", "#be123c", "#475569"];

function profilePanel(profile: ScientificProfile, axis: 0 | 1,
  bounds: ScientificSubrectangleChart["bounds"], x: number, y: number,
  color: string): string {
  const left = x + 46, right = x + 414, top = y + 31, bottom = y + 128;
  const xMin = profile.rows[0]!.x, xMax = profile.rows.at(-1)!.x;
  const values = profile.rows.flatMap(row => row.y === null ? [] : [row.y]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const padding = max === min ? Math.max(1, Math.abs(max) * .05) : (max - min) * .08;
  const yMin = min - padding, yMax = max + padding;
  const px = (value: number) => left + (value - xMin) /
    (xMax - xMin || 1) * (right - left);
  const py = (value: number) => bottom - (value - yMin) /
    (yMax - yMin) * (bottom - top);
  const shadeStart = Math.max(left, Math.min(right, px(bounds[axis][0])));
  const shadeEnd = Math.max(left, Math.min(right, px(bounds[axis][1])));
  const paths: string[] = [];
  let run: string[] = [];
  for (const row of profile.rows) {
    if (row.y === null) { if (run.length) paths.push(run.join(" "));
      run = []; continue; }
    run.push(`${run.length ? "L" : "M"}${px(row.x).toFixed(2)},${py(row.y).toFixed(2)}`);
  }
  if (run.length) paths.push(run.join(" "));
  const gaps = profile.rows.filter(row => row.y === null).length;
  const title = axis === 0 ? "Column means" : "Row means";
  return `<g><text x="${x + 8}" y="${y + 15}" font-size="13" font-weight="600" fill="#0f172a">${title} · ${xml(profile.yUnit)} · ${gaps} gaps</text>` +
    `<rect x="${shadeStart.toFixed(2)}" y="${top}" width="${Math.max(0, shadeEnd - shadeStart).toFixed(2)}" height="${bottom - top}" fill="#dbeafe"/>` +
    `<path d="M${left},${top} V${bottom} H${right}" fill="none" stroke="#64748b"/>` +
    `<text x="${left - 6}" y="${top + 4}" text-anchor="end" font-size="10" fill="#334155">${xml(number(max))}</text>` +
    `<text x="${left - 6}" y="${bottom + 4}" text-anchor="end" font-size="10" fill="#334155">${xml(number(min))}</text>` +
    paths.map(path => `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.2"/>`).join("") +
    profile.rows.map(row => row.y === null ?
      `<text x="${px(row.x).toFixed(2)}" y="${bottom - 5}" text-anchor="middle" font-size="12" fill="#b45309">×</text>` :
      `<circle cx="${px(row.x).toFixed(2)}" cy="${py(row.y).toFixed(2)}" r="2.5" fill="${color}"/>`).join("") +
    (!values.length ? `<text x="${(left + right) / 2}" y="${(top + bottom) / 2}" text-anchor="middle" fill="#475569">No covered values</text>` : "") +
    `<text x="${left}" y="${bottom + 17}" font-size="10" fill="#334155">${xml(number(xMin))}</text>` +
    `<text x="${right}" y="${bottom + 17}" text-anchor="end" font-size="10" fill="#334155">${xml(number(xMax))}</text>` +
    `<text x="${(left + right) / 2}" y="${bottom + 31}" text-anchor="middle" font-size="11" fill="#0f172a">${xml(profile.xName)} (${xml(profile.xUnit)})</text></g>`;
}

/** The same self-contained SVG is shown in the Workbook and exported after recheck. */
export function scientificSubrectangleChartSvg(chart: ScientificSubrectangleChart): string {
  const height = 70 + chart.fields.length * 172;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Verified scientific subrectangle profile chart" viewBox="0 0 920 ${height}" width="920" height="${height}">` +
    `<title>Scientific subrectangle profiles</title><desc>Result ${xml(chart.resultId)}; source ${xml(chart.sourceHash)}. Blue shading marks the selected physical interval; orange crosses mark coverage gaps. Current source and saved profile rows were checked before rendering.</desc>` +
    `<rect width="920" height="${height}" fill="#fff"/>` +
    `<text x="14" y="25" font-size="18" font-weight="700" fill="#0f172a">Verified subrectangle profiles</text>` +
    `<text x="14" y="44" font-size="11" fill="#475569">Selected physical intervals shaded · × = coverage gap · each field has its own unit and scale</text>` +
    chart.fields.map((field, index) => {
      const y = 58 + index * 172;
      const header = `<text x="14" y="${y + 14}" font-size="14" font-weight="700" fill="#0f172a">${xml(field.label)}${field.column ? ` (${xml(field.column.yUnit)})` : ""}</text>`;
      if (field.status !== "source-current" || !field.column || !field.row)
        return `<g>${header}<rect x="14" y="${y + 25}" width="892" height="125" fill="#f1f5f9"/><text x="28" y="${y + 86}" fill="#9a3412">Values withheld: ${xml(field.status)}</text></g>`;
      return `<g>${header}${profilePanel(field.column, 0, chart.bounds, 14, y + 21, colors[index % colors.length]!)}${profilePanel(field.row, 1, chart.bounds, 464, y + 21, colors[index % colors.length]!)}</g>`;
    }).join("") + `</svg>`;
}
