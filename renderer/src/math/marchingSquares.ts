// src/math/marchingSquares.ts

export type Polyline2 = { x: number; y: number }[];

type MarchingSquaresOptions = {
  nx: number;
  ny: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  sample: (i: number, j: number) => number;
  level: number;
};

type Segment2 = { a: { x: number; y: number }; b: { x: number; y: number } };

// Marching-squares edges: 0=bottom, 1=right, 2=top, 3=left
const CASE_TO_SEGMENTS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[3, 0]],
  2: [[0, 1]],
  3: [[3, 1]],
  4: [[1, 2]],
  5: [[3, 2], [0, 1]],
  6: [[0, 2]],
  7: [[3, 2]],
  8: [[2, 3]],
  9: [[0, 2]],
  10: [[0, 3], [1, 2]],
  11: [[1, 2]],
  12: [[1, 3]],
  13: [[0, 1]],
  14: [[3, 0]],
  15: [],
};

function interpPoint(
  ax: number,
  ay: number,
  av: number,
  bx: number,
  by: number,
  bv: number,
  level: number
): { x: number; y: number } | null {
  const dv = bv - av;
  if (Math.abs(dv) < 1e-12) return null;
  const t = (level - av) / dv;
  if (t < 0 || t > 1) return null;
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
}

function stitchSegments(segments: Segment2[], eps: number): Polyline2[] {
  const polylines: Polyline2[] = [];
  const eps2 = eps * eps;

  const near = (p: { x: number; y: number }, q: { x: number; y: number }) => {
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    return dx * dx + dy * dy <= eps2;
  };

  const addPoint = (line: Polyline2, p: { x: number; y: number }, toStart: boolean) => {
    if (line.length === 0) {
      line.push({ x: p.x, y: p.y });
      return;
    }
    const existing = toStart ? line[0] : line[line.length - 1];
    if (near(existing, p)) return;
    if (toStart) line.unshift({ x: p.x, y: p.y });
    else line.push({ x: p.x, y: p.y });
  };

  for (const seg of segments) {
    const { a, b } = seg;

    let ia = -1;
    let ib = -1;
    let aAtStart = false;
    let bAtStart = false;

    for (let i = 0; i < polylines.length; i++) {
      const line = polylines[i];
      if (near(line[0], a)) {
        ia = i;
        aAtStart = true;
        break;
      }
      if (near(line[line.length - 1], a)) {
        ia = i;
        aAtStart = false;
        break;
      }
    }

    for (let i = 0; i < polylines.length; i++) {
      const line = polylines[i];
      if (near(line[0], b)) {
        ib = i;
        bAtStart = true;
        break;
      }
      if (near(line[line.length - 1], b)) {
        ib = i;
        bAtStart = false;
        break;
      }
    }

    if (ia === -1 && ib === -1) {
      polylines.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
      continue;
    }

    if (ia !== -1 && ib === -1) {
      const line = polylines[ia];
      addPoint(line, b, aAtStart);
      continue;
    }

    if (ia === -1 && ib !== -1) {
      const line = polylines[ib];
      addPoint(line, a, bAtStart);
      continue;
    }

    if (ia === ib) {
      continue;
    }

    const lineA = polylines[ia];
    const lineB = polylines[ib];

    if (aAtStart) lineA.reverse();
    if (!bAtStart) lineB.reverse();

    lineA.push(...lineB);
    polylines.splice(ib, 1);
  }

  return polylines;
}

export function marchingSquares(opts: MarchingSquaresOptions): Polyline2[] {
  const nx = Math.max(2, Math.floor(opts.nx));
  const ny = Math.max(2, Math.floor(opts.ny));

  const dx = (opts.xMax - opts.xMin) / (nx - 1);
  const dy = (opts.yMax - opts.yMin) / (ny - 1);

  const values = new Float32Array(nx * ny);
  const idx = (i: number, j: number) => j * nx + i;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      values[idx(i, j)] = opts.sample(i, j);
    }
  }

  const segments: Segment2[] = [];

  for (let j = 0; j < ny - 1; j++) {
    const y0 = opts.yMin + j * dy;
    const y1 = y0 + dy;

    for (let i = 0; i < nx - 1; i++) {
      const x0 = opts.xMin + i * dx;
      const x1 = x0 + dx;

      const zBL = values[idx(i, j)];
      const zBR = values[idx(i + 1, j)];
      const zTR = values[idx(i + 1, j + 1)];
      const zTL = values[idx(i, j + 1)];

      if (
        !Number.isFinite(zBL) ||
        !Number.isFinite(zBR) ||
        !Number.isFinite(zTR) ||
        !Number.isFinite(zTL)
      ) {
        continue;
      }

      const m =
        (zBL >= opts.level ? 1 : 0) |
        (zBR >= opts.level ? 2 : 0) |
        (zTR >= opts.level ? 4 : 0) |
        (zTL >= opts.level ? 8 : 0);

      const segs = CASE_TO_SEGMENTS[m];
      if (!segs || segs.length === 0) continue;

      const E: Array<{ x: number; y: number } | null> = [null, null, null, null];
      E[0] = interpPoint(x0, y0, zBL, x1, y0, zBR, opts.level);
      E[1] = interpPoint(x1, y0, zBR, x1, y1, zTR, opts.level);
      E[2] = interpPoint(x1, y1, zTR, x0, y1, zTL, opts.level);
      E[3] = interpPoint(x0, y1, zTL, x0, y0, zBL, opts.level);

      for (const [a, b] of segs) {
        const A = E[a];
        const B = E[b];
        if (!A || !B) continue;
        segments.push({ a: A, b: B });
      }
    }
  }

  if (segments.length === 0) return [];

  const eps = Math.max(Math.abs(dx), Math.abs(dy)) * 0.5 + 1e-6;
  return stitchSegments(segments, eps);
}
