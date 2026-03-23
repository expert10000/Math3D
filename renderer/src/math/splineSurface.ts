import type { ParamSurfaceId } from "@math3d/core";

export type SplineSurfacePoint = { x: number; y: number; z: number };
export type SplineSurfaceSettings = {
  bezierControlGridText?: string;
  bSplineControlGridText?: string;
  bSplineDegreeU?: number;
  bSplineDegreeV?: number;
  bSplineKnotUText?: string;
  bSplineKnotVText?: string;
  nurbsControlGridText?: string;
  nurbsDegreeU?: number;
  nurbsDegreeV?: number;
  nurbsKnotUText?: string;
  nurbsKnotVText?: string;
  nurbsWeightsText?: string;
};

type ControlGrid = SplineSurfacePoint[][];
type WeightGrid = number[][];

type SplinePatchId = "bezierSurface" | "bSplineSurface" | "nurbsSurface";

const SPLINE_PATCH_IDS = new Set<ParamSurfaceId>([
  "bezierSurface",
  "bSplineSurface",
  "nurbsSurface",
]);

const clamp = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const isValidPoint = (point: SplineSurfacePoint): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);

const cloneGrid = (grid: ControlGrid): ControlGrid =>
  grid.map((row) => row.map((p) => ({ x: p.x, y: p.y, z: p.z })));

const normalizeControlGrid = (grid: ControlGrid): ControlGrid | null => {
  if (!Array.isArray(grid) || grid.length < 2) return null;
  const width = grid[0]?.length ?? 0;
  if (width < 2) return null;
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i];
    if (!Array.isArray(row) || row.length !== width) return null;
    for (let j = 0; j < row.length; j++) {
      if (!isValidPoint(row[j])) return null;
    }
  }
  return cloneGrid(grid);
};

const normalizeWeights = (weights: WeightGrid, rows: number, cols: number): WeightGrid | null => {
  if (!Array.isArray(weights) || weights.length !== rows) return null;
  const out: WeightGrid = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const row = weights[i];
    if (!Array.isArray(row) || row.length !== cols) return null;
    const nextRow = new Array<number>(cols);
    for (let j = 0; j < cols; j++) {
      const w = row[j];
      if (!Number.isFinite(w) || w <= 0) return null;
      nextRow[j] = w;
    }
    out[i] = nextRow;
  }
  return out;
};

const makeDefaultBezierGrid = (): ControlGrid => [
  [
    { x: -1.6, y: -1.6, z: -0.4 },
    { x: -0.55, y: -1.6, z: -0.05 },
    { x: 0.55, y: -1.6, z: 0.15 },
    { x: 1.6, y: -1.6, z: -0.25 },
  ],
  [
    { x: -1.6, y: -0.55, z: -0.1 },
    { x: -0.55, y: -0.55, z: 0.95 },
    { x: 0.55, y: -0.55, z: 0.75 },
    { x: 1.6, y: -0.55, z: 0.05 },
  ],
  [
    { x: -1.6, y: 0.55, z: -0.2 },
    { x: -0.55, y: 0.55, z: 0.8 },
    { x: 0.55, y: 0.55, z: 0.9 },
    { x: 1.6, y: 0.55, z: 0.1 },
  ],
  [
    { x: -1.6, y: 1.6, z: -0.3 },
    { x: -0.55, y: 1.6, z: 0.1 },
    { x: 0.55, y: 1.6, z: -0.05 },
    { x: 1.6, y: 1.6, z: -0.35 },
  ],
];

const makeDefaultBSplineGrid = (): ControlGrid => {
  const points: ControlGrid = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0;
    const x = -2 + 4 * u;
    const row: SplineSurfacePoint[] = [];
    for (let j = 0; j < n; j++) {
      const v = n > 1 ? j / (n - 1) : 0;
      const y = -2 + 4 * v;
      const z = 0.55 * Math.sin(1.5 * x) * Math.cos(1.2 * y) + 0.08 * x;
      row.push({ x, y, z });
    }
    points.push(row);
  }
  return points;
};

const DEFAULT_BSPLINE_GRID = makeDefaultBSplineGrid();
const DEFAULT_BEZIER_GRID = makeDefaultBezierGrid();

const DEFAULT_NURBS_WEIGHTS: WeightGrid = [
  [1, 1, 1, 1, 1],
  [1, 1.3, 1.7, 1.3, 1],
  [1, 1.8, 2.4, 1.8, 1],
  [1, 1.3, 1.7, 1.3, 1],
  [1, 1, 1, 1, 1],
];

const formatControlGridText = (grid: ControlGrid): string =>
  grid
    .map((row) =>
      row
        .map((p) => `${p.x.toFixed(3).replace(/\.?0+$/, "")}, ${p.y.toFixed(3).replace(/\.?0+$/, "")}, ${p.z.toFixed(3).replace(/\.?0+$/, "")}`)
        .join("; ")
    )
    .join("\n");

const formatWeightGridText = (weights: WeightGrid): string =>
  weights
    .map((row) => row.map((w) => w.toFixed(3).replace(/\.?0+$/, "")).join("; "))
    .join("\n");

const formatKnotText = (knots: number[]): string => knots.map((k) => k.toFixed(6).replace(/\.?0+$/, "")).join(", ");

export const DEFAULT_BSPLINE_DEGREE_U = 3;
export const DEFAULT_BSPLINE_DEGREE_V = 3;
export const DEFAULT_NURBS_DEGREE_U = 3;
export const DEFAULT_NURBS_DEGREE_V = 3;
export const DEFAULT_BEZIER_CONTROL_GRID_TEXT = formatControlGridText(DEFAULT_BEZIER_GRID);
export const DEFAULT_BSPLINE_CONTROL_GRID_TEXT = formatControlGridText(DEFAULT_BSPLINE_GRID);
export const DEFAULT_NURBS_CONTROL_GRID_TEXT = formatControlGridText(DEFAULT_BSPLINE_GRID);
export const DEFAULT_BSPLINE_KNOT_U_TEXT = formatKnotText(
  buildOpenUniformKnots(DEFAULT_BSPLINE_GRID.length, DEFAULT_BSPLINE_DEGREE_U)
);
export const DEFAULT_BSPLINE_KNOT_V_TEXT = formatKnotText(
  buildOpenUniformKnots(DEFAULT_BSPLINE_GRID[0].length, DEFAULT_BSPLINE_DEGREE_V)
);
export const DEFAULT_NURBS_KNOT_U_TEXT = formatKnotText(
  buildOpenUniformKnots(DEFAULT_BSPLINE_GRID.length, DEFAULT_NURBS_DEGREE_U)
);
export const DEFAULT_NURBS_KNOT_V_TEXT = formatKnotText(
  buildOpenUniformKnots(DEFAULT_BSPLINE_GRID[0].length, DEFAULT_NURBS_DEGREE_V)
);
export const DEFAULT_NURBS_WEIGHTS_TEXT = formatWeightGridText(DEFAULT_NURBS_WEIGHTS);

const parsePointFromUnknown = (value: unknown): SplineSurfacePoint | null => {
  if (Array.isArray(value) && value.length >= 3) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    const z = Number(value[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x, y, z };
  }
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const x = Number(rec.x);
    const y = Number(rec.y);
    const z = Number(rec.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x, y, z };
  }
  return null;
};

const parsePointToken = (tokenRaw: string): SplineSurfacePoint | null => {
  const token = tokenRaw.trim();
  if (!token) return null;
  try {
    const parsed = JSON.parse(token);
    return parsePointFromUnknown(parsed);
  } catch {
    // no-op
  }
  const cleaned = token.replace(/[()[\]{}]/g, " ").trim();
  const parts = cleaned.split(/[\s,]+/).map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length < 3) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  const z = Number(parts[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
};

const parseControlGridText = (text: string | undefined): ControlGrid | null => {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const out: ControlGrid = [];
      for (const row of parsed) {
        if (!Array.isArray(row)) return null;
        const next: SplineSurfacePoint[] = [];
        for (const entry of row) {
          const point = parsePointFromUnknown(entry);
          if (!point) return null;
          next.push(point);
        }
        out.push(next);
      }
      return normalizeControlGrid(out);
    }
  } catch {
    // fall through to line parser
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return null;
  const rows: ControlGrid = [];
  for (const line of lines) {
    const tokens = line
      .split(";")
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    if (tokens.length < 2) return null;
    const row: SplineSurfacePoint[] = [];
    for (const token of tokens) {
      const point = parsePointToken(token);
      if (!point) return null;
      row.push(point);
    }
    rows.push(row);
  }
  return normalizeControlGrid(rows);
};

const parseKnotListText = (text: string | undefined): number[] | null => {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const out = parsed.map((v) => Number(v));
      if (out.every((v) => Number.isFinite(v))) return out;
      return null;
    }
  } catch {
    // no-op
  }
  const parts = trimmed
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (!parts.length) return null;
  const out = parts.map((p) => Number(p));
  if (!out.every((v) => Number.isFinite(v))) return null;
  return out;
};

const parseWeightGridText = (text: string | undefined): WeightGrid | null => {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const rows: WeightGrid = [];
      for (const row of parsed) {
        if (!Array.isArray(row)) return null;
        const next = row.map((v) => Number(v));
        if (!next.every((v) => Number.isFinite(v) && v > 0)) return null;
        rows.push(next);
      }
      return rows;
    }
  } catch {
    // no-op
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (!lines.length) return null;
  const rows: WeightGrid = [];
  for (const line of lines) {
    const values = line
      .split(/[;,]+/)
      .map((token) => Number(token.trim()))
      .filter((v) => Number.isFinite(v));
    if (!values.length || values.some((v) => v <= 0)) return null;
    rows.push(values);
  }
  return rows;
};

const sanitizeDegree = (value: number | undefined, controlCount: number, fallback: number): number => {
  const rounded = Number.isFinite(value) ? Math.round(value as number) : fallback;
  return Math.max(1, Math.min(controlCount - 1, rounded));
};

const buildDefaultWeights = (rows: number, cols: number): WeightGrid => {
  const out: WeightGrid = new Array(rows);
  const ci = (rows - 1) * 0.5;
  const cj = (cols - 1) * 0.5;
  const maxR = Math.max(1e-9, Math.hypot(ci, cj));
  for (let i = 0; i < rows; i++) {
    const row: number[] = new Array(cols);
    for (let j = 0; j < cols; j++) {
      const r = Math.hypot(i - ci, j - cj) / maxR;
      row[j] = 1 + 1.4 * (1 - r);
    }
    out[i] = row;
  }
  return out;
};

const binomial = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let out = 1;
  for (let i = 1; i <= kk; i++) {
    out = (out * (n - kk + i)) / i;
  }
  return out;
};

const bernstein = (i: number, degree: number, tRaw: number): number => {
  const t = clamp(tRaw, 0, 1);
  return binomial(degree, i) * Math.pow(t, i) * Math.pow(1 - t, degree - i);
};

function buildOpenUniformKnots(controlCount: number, degree: number): number[] {
  const p = Math.max(1, Math.min(degree, controlCount - 1));
  const size = controlCount + p + 1;
  const knots = new Array<number>(size);
  const interior = controlCount - p - 1;
  for (let i = 0; i < size; i++) {
    if (i <= p) {
      knots[i] = 0;
    } else if (i >= controlCount) {
      knots[i] = 1;
    } else if (interior > 0) {
      knots[i] = (i - p) / (interior + 1);
    } else {
      knots[i] = 0;
    }
  }
  return knots;
}

const sanitizeKnots = (knots: number[], controlCount: number, degree: number): number[] => {
  const expected = controlCount + degree + 1;
  if (!Array.isArray(knots) || knots.length !== expected) {
    return buildOpenUniformKnots(controlCount, degree);
  }
  for (let i = 0; i < knots.length; i++) {
    if (!Number.isFinite(knots[i])) return buildOpenUniformKnots(controlCount, degree);
    if (i > 0 && knots[i] < knots[i - 1]) return buildOpenUniformKnots(controlCount, degree);
  }
  if (knots[knots.length - 1] === knots[0]) {
    return buildOpenUniformKnots(controlCount, degree);
  }
  return [...knots];
};

const basis0 = (i: number, t: number, knots: number[], lastKnot: number): number => {
  const a = knots[i];
  const b = knots[i + 1];
  if (a <= t && t < b) return 1;
  if (t === lastKnot && b === lastKnot && t >= a) return 1;
  return 0;
};

const bsplineBasis = (
  i: number,
  degree: number,
  t: number,
  knots: number[],
  memo: Map<string, number>,
  lastKnot: number
): number => {
  const key = `${i}:${degree}`;
  const cached = memo.get(key);
  if (cached != null) return cached;

  let out = 0;
  if (degree === 0) {
    out = basis0(i, t, knots, lastKnot);
  } else {
    const leftDen = knots[i + degree] - knots[i];
    const rightDen = knots[i + degree + 1] - knots[i + 1];
    const left =
      leftDen > 0 ? ((t - knots[i]) / leftDen) * bsplineBasis(i, degree - 1, t, knots, memo, lastKnot) : 0;
    const right =
      rightDen > 0
        ? ((knots[i + degree + 1] - t) / rightDen) *
          bsplineBasis(i + 1, degree - 1, t, knots, memo, lastKnot)
        : 0;
    out = left + right;
  }

  memo.set(key, out);
  return out;
};

const evaluateBezierSurface = (uRaw: number, vRaw: number, grid: ControlGrid): SplineSurfacePoint => {
  const u = clamp(uRaw, 0, 1);
  const v = clamp(vRaw, 0, 1);
  const degU = grid.length - 1;
  const degV = grid[0].length - 1;

  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i <= degU; i++) {
    const bu = bernstein(i, degU, u);
    if (bu === 0) continue;
    for (let j = 0; j <= degV; j++) {
      const bv = bernstein(j, degV, v);
      const w = bu * bv;
      if (w === 0) continue;
      const p = grid[i][j];
      x += w * p.x;
      y += w * p.y;
      z += w * p.z;
    }
  }

  return { x, y, z };
};

const mapUnitToSplineDomain = (tRaw: number, knots: number[], degree: number, controlCount: number): number => {
  const t = clamp(tRaw, 0, 1);
  const min = knots[degree];
  const max = knots[controlCount];
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return min;
  return t === 1 ? max : min + t * (max - min);
};

const evaluateBSplineSurface = (options: {
  u: number;
  v: number;
  grid: ControlGrid;
  degreeU: number;
  degreeV: number;
  knotsU: number[];
  knotsV: number[];
  weights?: WeightGrid | null;
}): SplineSurfacePoint => {
  const { u, v, grid, degreeU, degreeV, knotsU, knotsV, weights } = options;
  const countU = grid.length;
  const countV = grid[0].length;
  const uu = mapUnitToSplineDomain(u, knotsU, degreeU, countU);
  const vv = mapUnitToSplineDomain(v, knotsV, degreeV, countV);
  const uMemo = new Map<string, number>();
  const vMemo = new Map<string, number>();
  const lastU = knotsU[knotsU.length - 1];
  const lastV = knotsV[knotsV.length - 1];

  let sx = 0;
  let sy = 0;
  let sz = 0;
  let wsum = 0;

  for (let i = 0; i < countU; i++) {
    const nu = bsplineBasis(i, degreeU, uu, knotsU, uMemo, lastU);
    if (nu === 0) continue;
    for (let j = 0; j < countV; j++) {
      const nv = bsplineBasis(j, degreeV, vv, knotsV, vMemo, lastV);
      if (nv === 0) continue;
      const p = grid[i][j];
      const basis = nu * nv;
      const ww = weights ? basis * weights[i][j] : basis;
      sx += ww * p.x;
      sy += ww * p.y;
      sz += ww * p.z;
      wsum += weights ? ww : basis;
    }
  }

  if (weights) {
    if (!Number.isFinite(wsum) || Math.abs(wsum) < 1e-12) return { x: 0, y: 0, z: 0 };
    return { x: sx / wsum, y: sy / wsum, z: sz / wsum };
  }
  return { x: sx, y: sy, z: sz };
};

const buildBezierEvaluator = (settings?: SplineSurfaceSettings) => {
  const parsedGrid = parseControlGridText(settings?.bezierControlGridText);
  const grid = normalizeControlGrid(parsedGrid ?? DEFAULT_BEZIER_GRID);
  if (!grid) return null;
  return (u: number, v: number): SplineSurfacePoint => evaluateBezierSurface(u, v, grid);
};

const buildBSplineEvaluator = (nurbs: boolean, settings?: SplineSurfaceSettings) => {
  const controlGridText = nurbs ? settings?.nurbsControlGridText : settings?.bSplineControlGridText;
  const parsedGrid = parseControlGridText(controlGridText);
  const grid = normalizeControlGrid(parsedGrid ?? DEFAULT_BSPLINE_GRID);
  if (!grid) return null;
  const countU = grid.length;
  const countV = grid[0].length;
  const fallbackDegreeU = Math.min(nurbs ? DEFAULT_NURBS_DEGREE_U : DEFAULT_BSPLINE_DEGREE_U, countU - 1);
  const fallbackDegreeV = Math.min(nurbs ? DEFAULT_NURBS_DEGREE_V : DEFAULT_BSPLINE_DEGREE_V, countV - 1);
  const degreeU = sanitizeDegree(nurbs ? settings?.nurbsDegreeU : settings?.bSplineDegreeU, countU, fallbackDegreeU);
  const degreeV = sanitizeDegree(nurbs ? settings?.nurbsDegreeV : settings?.bSplineDegreeV, countV, fallbackDegreeV);
  const parsedKnotU = parseKnotListText(nurbs ? settings?.nurbsKnotUText : settings?.bSplineKnotUText);
  const parsedKnotV = parseKnotListText(nurbs ? settings?.nurbsKnotVText : settings?.bSplineKnotVText);
  const knotsU = sanitizeKnots(parsedKnotU ?? buildOpenUniformKnots(countU, degreeU), countU, degreeU);
  const knotsV = sanitizeKnots(parsedKnotV ?? buildOpenUniformKnots(countV, degreeV), countV, degreeV);
  const defaultWeights = buildDefaultWeights(countU, countV);
  const parsedWeights = parseWeightGridText(settings?.nurbsWeightsText);
  const weights = nurbs ? normalizeWeights(parsedWeights ?? defaultWeights, countU, countV) : null;
  if (nurbs && !weights) return null;

  return (u: number, v: number): SplineSurfacePoint =>
    evaluateBSplineSurface({
      u,
      v,
      grid,
      degreeU,
      degreeV,
      knotsU,
      knotsV,
      weights,
    });
};

const asSplinePatchId = (surfaceId: ParamSurfaceId): SplinePatchId | null => {
  if (!SPLINE_PATCH_IDS.has(surfaceId)) return null;
  return surfaceId as SplinePatchId;
};

export const isSplinePatchSurfaceId = (surfaceId: ParamSurfaceId): boolean => SPLINE_PATCH_IDS.has(surfaceId);

export const buildSplineSurfacePointEvaluator = (
  surfaceId: ParamSurfaceId,
  settings?: SplineSurfaceSettings
): ((u: number, v: number) => SplineSurfacePoint) | null => {
  const patchId = asSplinePatchId(surfaceId);
  if (!patchId) return null;
  if (patchId === "bezierSurface") return buildBezierEvaluator(settings);
  if (patchId === "bSplineSurface") return buildBSplineEvaluator(false, settings);
  return buildBSplineEvaluator(true, settings);
};
