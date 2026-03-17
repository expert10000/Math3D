import type { SurfaceId } from "../components/SurfaceViewer";
import { compileExpression } from "./expression";

export type GraphGeodesicDomain = { xSpan: number; ySpan: number };

export type ContinuousGraphGeodesicOptions = {
  surfaceId: SurfaceId;
  graphExpr?: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  domain: GraphGeodesicDomain;
  stepSize?: number;
  maxSteps?: number;
  angleSamples?: number;
  refinePasses?: number;
};

export type ContinuousGraphGeodesicResult =
  | { ok: true; polyline: { x: number; y: number; z: number }[]; length: number; bestError: number }
  | { ok: false; error: string };

type Derivs = {
  fx: number;
  fy: number;
  fxx: number;
  fxy: number;
  fyy: number;
};

type Metric = {
  E: number;
  F: number;
  G: number;
  gamma: number[][][];
};

function makeCustomGraphFunction(expr?: string): { f: (x: number, y: number) => number; error?: string } {
  const src = (expr ?? "").trim();
  if (!src) {
    return { f: (x, y) => x * x - y * y };
  }

  const r = compileExpression(src, ["x", "y"]);
  if (r.error || !r.fn) {
    const msg = r.error ? `${r.error.message} (col ${r.error.col})` : "Unknown parse error";
    return { f: (x, y) => x * x - y * y, error: msg };
  }

  const fn = r.fn;
  return {
    f: (x, y) => {
      const v = fn({ x, y });
      if (!Number.isFinite(v)) return 0;
      const LIM = 1e4;
      if (v > LIM) return LIM;
      if (v < -LIM) return -LIM;
      return v;
    },
  };
}

function getGraphFunction(
  surfaceId: SurfaceId,
  graphExpr?: string
): { f: (x: number, y: number) => number; error?: string } | null {
  switch (surfaceId) {
    case "graph_saddle":
      return { f: (x, y) => 0.4 * (x * x - y * y) };
    case "graph_rotatedSaddle":
      return { f: (x, y) => 0.8 * x * y };
    case "graph_monkey":
      return { f: (x, y) => 0.2 * (x * x * x - 3 * x * y * y) };
    case "graph_wave":
      return { f: (x, y) => 0.6 * Math.sin(x * 1.3) * Math.cos(y * 1.3) };
    case "graph_paraboloid":
      return { f: (x, y) => 0.3 * (x * x + y * y) };
    case "graph_gaussian":
      return { f: (x, y) => Math.exp(-0.7 * (x * x + y * y)) };
    case "graph_ripple":
      return {
        f: (x, y) => {
          const r = Math.sqrt(x * x + y * y);
          return r < 1e-4 ? 1 : Math.sin(3 * r) / (3 * r);
        },
      };
    case "graph_mexican":
      return {
        f: (x, y) => {
          const r2 = x * x + y * y;
          return (1 - r2) * Math.exp(-0.5 * r2);
        },
      };
    case "graph_sinSum":
      return { f: (x, y) => 0.45 * (Math.sin(x) + Math.cos(y)) };
    case "graph_sinc":
      return {
        f: (x, y) => {
          const r = Math.sqrt(x * x + y * y);
          return r < 1e-4 ? 1 : Math.sin(r) / r;
        },
      };
    case "graph_sinc2":
      return {
        f: (x, y) => {
          const r = Math.sqrt(x * x + y * y);
          return Math.sin(2 * r) / (1 + r * r);
        },
      };
    case "graph_custom":
      return makeCustomGraphFunction(graphExpr);
    default:
      return null;
  }
}

function finiteOrNull(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}

function evalDerivatives(
  f: (x: number, y: number) => number,
  x: number,
  y: number,
  h: number
): Derivs | null {
  const f0 = finiteOrNull(f(x, y));
  if (f0 == null) return null;

  const fxp = finiteOrNull(f(x + h, y));
  const fxm = finiteOrNull(f(x - h, y));
  const fyp = finiteOrNull(f(x, y + h));
  const fym = finiteOrNull(f(x, y - h));
  const fxpyp = finiteOrNull(f(x + h, y + h));
  const fxpym = finiteOrNull(f(x + h, y - h));
  const fxmyp = finiteOrNull(f(x - h, y + h));
  const fxmym = finiteOrNull(f(x - h, y - h));

  if (
    fxp == null ||
    fxm == null ||
    fyp == null ||
    fym == null ||
    fxpyp == null ||
    fxpym == null ||
    fxmyp == null ||
    fxmym == null
  ) {
    return null;
  }

  const fx = (fxp - fxm) / (2 * h);
  const fy = (fyp - fym) / (2 * h);
  const fxx = (fxp - 2 * f0 + fxm) / (h * h);
  const fyy = (fyp - 2 * f0 + fym) / (h * h);
  const fxy = (fxpyp - fxpym - fxmyp + fxmym) / (4 * h * h);

  if (![fx, fy, fxx, fxy, fyy].every((v) => Number.isFinite(v))) return null;
  return { fx, fy, fxx, fxy, fyy };
}

function computeMetric(
  f: (x: number, y: number) => number,
  x: number,
  y: number,
  h: number
): Metric | null {
  const d = evalDerivatives(f, x, y, h);
  if (!d) return null;

  const { fx, fy, fxx, fxy, fyy } = d;
  const E = 1 + fx * fx;
  const F = fx * fy;
  const G = 1 + fy * fy;
  const delta = E * G - F * F;
  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-12) return null;

  const inv = [
    [G / delta, -F / delta],
    [-F / delta, E / delta],
  ];

  const Ex = 2 * fx * fxx;
  const Ey = 2 * fx * fxy;
  const Fx = fxx * fy + fx * fxy;
  const Fy = fxy * fy + fx * fyy;
  const Gx = 2 * fy * fxy;
  const Gy = 2 * fy * fyy;

  const dGdx = [
    [Ex, Fx],
    [Fx, Gx],
  ];
  const dGdy = [
    [Ey, Fy],
    [Fy, Gy],
  ];
  const dG = [dGdx, dGdy];

  const gamma = [
    [
      [0, 0],
      [0, 0],
    ],
    [
      [0, 0],
      [0, 0],
    ],
  ];

  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        let sum = 0;
        for (let l = 0; l < 2; l++) {
          const dGi = dG[i][j][l];
          const dGj = dG[j][i][l];
          const dGl = dG[l][i][j];
          sum += inv[k][l] * (dGi + dGj - dGl);
        }
        gamma[k][i][j] = 0.5 * sum;
      }
    }
  }

  return { E, F, G, gamma };
}

function clampDomain(value: number, span: number): number {
  return Math.max(-span, Math.min(span, value));
}

function pathLength3D(points: { x: number; y: number; z: number }[]): number {
  if (points.length < 2) return 0;
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    len += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return len;
}

export function solveContinuousGraphGeodesic(
  opts: ContinuousGraphGeodesicOptions
): ContinuousGraphGeodesicResult {
  const { surfaceId, graphExpr, start, end, domain } = opts;
  const graphFn = getGraphFunction(surfaceId, graphExpr);
  if (!graphFn) {
    return { ok: false, error: "Unsupported surface for continuous geodesic." };
  }
  if (graphFn.error) {
    return { ok: false, error: `Graph expression error: ${graphFn.error}` };
  }

  const f = graphFn.f;
  const span = Math.max(1e-4, Math.max(domain.xSpan, domain.ySpan));
  const diffH = Math.max(1e-5, 1e-3 * span);
  const stepSize = opts.stepSize ?? Math.max(1e-4, 0.005 * Math.min(domain.xSpan, domain.ySpan));
  const maxSteps = opts.maxSteps ?? 2000;
  const angleSamples = opts.angleSamples ?? 36;
  const refinePasses = opts.refinePasses ?? 3;
  const tol2 = Math.pow(0.002 * span, 2);

  const integrateAngle = (angle: number) => {
    const metric0 = computeMetric(f, start.x, start.y, diffH);
    if (!metric0) return null;

    let vx = Math.cos(angle);
    let vy = Math.sin(angle);
    const speed2 = metric0.E * vx * vx + 2 * metric0.F * vx * vy + metric0.G * vy * vy;
    if (!Number.isFinite(speed2) || speed2 <= 1e-12) return null;
    const scale = 1 / Math.sqrt(speed2);
    vx *= scale;
    vy *= scale;

    let x = start.x;
    let y = start.y;
    const points: { x: number; y: number }[] = [];
    let bestDist = Infinity;
    let bestIndex = 0;

    for (let step = 0; step < maxSteps; step++) {
      points.push({ x, y });

      const dx = x - end.x;
      const dy = y - end.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        bestIndex = points.length - 1;
        if (d2 <= tol2) break;
      }

      if (Math.abs(x) > domain.xSpan || Math.abs(y) > domain.ySpan) break;

      const deriv = (sx: number, sy: number, svx: number, svy: number) => {
        const metric = computeMetric(f, sx, sy, diffH);
        if (!metric) return null;
        const { gamma } = metric;
        let dvx = 0;
        let dvy = 0;
        const v = [svx, svy];
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            dvx -= gamma[0][i][j] * v[i] * v[j];
            dvy -= gamma[1][i][j] * v[i] * v[j];
          }
        }
        return [svx, svy, dvx, dvy];
      };

      const k1 = deriv(x, y, vx, vy);
      if (!k1) break;
      const k2 = deriv(
        x + 0.5 * stepSize * k1[0],
        y + 0.5 * stepSize * k1[1],
        vx + 0.5 * stepSize * k1[2],
        vy + 0.5 * stepSize * k1[3]
      );
      if (!k2) break;
      const k3 = deriv(
        x + 0.5 * stepSize * k2[0],
        y + 0.5 * stepSize * k2[1],
        vx + 0.5 * stepSize * k2[2],
        vy + 0.5 * stepSize * k2[3]
      );
      if (!k3) break;
      const k4 = deriv(
        x + stepSize * k3[0],
        y + stepSize * k3[1],
        vx + stepSize * k3[2],
        vy + stepSize * k3[3]
      );
      if (!k4) break;

      x += (stepSize / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      y += (stepSize / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      vx += (stepSize / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
      vy += (stepSize / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(vx) || !Number.isFinite(vy)) break;
      x = clampDomain(x, domain.xSpan * 2);
      y = clampDomain(y, domain.ySpan * 2);
    }

    if (points.length < 2) return null;
    return { points: points.slice(0, bestIndex + 1), bestDist };
  };

  let best: { points: { x: number; y: number }[]; bestDist: number; angle: number } | null = null;
  const step = (Math.PI * 2) / Math.max(6, angleSamples);
  for (let i = 0; i < angleSamples; i++) {
    const angle = i * step;
    const res = integrateAngle(angle);
    if (!res) continue;
    if (!best || res.bestDist < best.bestDist) {
      best = { points: res.points, bestDist: res.bestDist, angle };
    }
  }

  if (!best) {
    return { ok: false, error: "Continuous solver failed to find a viable path." };
  }

  let window = step;
  for (let pass = 0; pass < refinePasses; pass++) {
    const center = best.angle;
    let localBest = best;
    const samples = 7;
    const half = (samples - 1) / 2;
    for (let i = 0; i < samples; i++) {
      const angle = center + ((i - half) / half) * window;
      const res = integrateAngle(angle);
      if (!res) continue;
      if (res.bestDist < localBest.bestDist) {
        localBest = { points: res.points, bestDist: res.bestDist, angle };
      }
    }
    best = localBest;
    window *= 0.4;
  }

  const polyline = best.points.map((p) => {
    const z = f(p.x, p.y);
    return { x: p.x, y: z, z: p.y };
  });
  if (polyline.some((p) => !Number.isFinite(p.y))) {
    return { ok: false, error: "Continuous solver produced non-finite heights." };
  }

  const length = pathLength3D(polyline);
  return { ok: true, polyline, length, bestError: Math.sqrt(best.bestDist) };
}
