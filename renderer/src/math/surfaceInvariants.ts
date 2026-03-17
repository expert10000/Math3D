// src/math/surfaceInvariants.ts
import type { SurfaceId } from "../components/SurfaceViewer";
import { compileExpression } from "./expression";

export type CurvatureData = {
  fx: number;
  fy: number;
  fxx: number;
  fyy: number;
  fxy: number;
  E: number;
  F: number;
  G: number;
  e: number;
  f: number;
  g: number;
  K: number;   // Gaussian
  H: number;   // mean curvature
  k1: number;  // principal curvatures
  k2: number;
};

// numeric partials for z = f(x,y)
function numericGraphInvariants(
  f: (x: number, y: number) => number,
  x: number,
  y: number,
  h = 1e-2
): CurvatureData | null {
  const fVal = (xx: number, yy: number) => f(xx, yy);

  const fx =
    (fVal(x + h, y) - fVal(x - h, y)) / (2 * h);
  const fy =
    (fVal(x, y + h) - fVal(x, y - h)) / (2 * h);

  const fxx =
    (fVal(x + h, y) - 2 * fVal(x, y) + fVal(x - h, y)) /
    (h * h);
  const fyy =
    (fVal(x, y + h) - 2 * fVal(x, y) + fVal(x, y - h)) /
    (h * h);
  const fxy =
    (fVal(x + h, y + h) -
      fVal(x + h, y - h) -
      fVal(x - h, y + h) +
      fVal(x - h, y - h)) /
    (4 * h * h);

  const E = 1 + fx * fx;
  const F = fx * fy;
  const G = 1 + fy * fy;

  const denom1 = Math.sqrt(1 + fx * fx + fy * fy);
  if (!isFinite(denom1) || denom1 === 0) return null;

  const e = fxx / denom1;
  const fcoef = fxy / denom1;
  const g = fyy / denom1;

  const EGminusF2 = E * G - F * F;
  if (!isFinite(EGminusF2) || Math.abs(EGminusF2) < 1e-8) {
    return {
      fx,
      fy,
      fxx,
      fyy,
      fxy,
      E,
      F,
      G,
      e,
      f: fcoef,
      g,
      K: NaN,
      H: NaN,
      k1: NaN,
      k2: NaN,
    };
  }

  const K = (e * g - fcoef * fcoef) / EGminusF2;
  const H =
    (E * g - 2 * F * fcoef + G * e) /
    (2 * EGminusF2);

  const disc = H * H - K;
  let k1 = NaN;
  let k2 = NaN;
  if (disc >= 0) {
    const root = Math.sqrt(disc);
    k1 = H + root;
    k2 = H - root;
  }

  return { fx, fy, fxx, fyy, fxy, E, F, G, e, f: fcoef, g, K, H, k1, k2 };
}

// small parser for z = f(x,y) (copy of what we use in SurfaceViewer)
function makeZFunction(expr: string | undefined): (x: number, y: number) => number {
  const fallback = () => 0;
  if (!expr || !expr.trim()) return fallback;

  const compiled = compileExpression(expr, ["x", "y"]);
  if (compiled.error || !compiled.fn) {
    return fallback;
  }
  const fn = compiled.fn;
  return (x, y) => {
    const z = fn({ x, y });
    if (!Number.isFinite(z)) return 0;
    const LIM = 1e4;
    if (z > LIM) return LIM;
    if (z < -LIM) return -LIM;
    return z;
  };
}

// get f(x,y) for the graph_* surfaces
export function getGraphFunction(
  surfaceId: SurfaceId,
  graphExpr?: string
): ((x: number, y: number) => number) | null {
  switch (surfaceId) {
    case "graph_saddle":
      return (x, y) => 0.4 * (x * x - y * y);
    case "graph_rotatedSaddle":
      return (x, y) => 0.4 * (x * x + y * y - 2 * x * y);
    case "graph_monkey":
      return (x, y) => 0.2 * (x * x * x - 3 * x * y * y);
    case "graph_wave":
      return (x, y) =>
        0.6 * Math.sin(1.3 * x) * Math.cos(1.3 * y);
    case "graph_paraboloid":
      return (x, y) => 0.3 * (x * x + y * y);
    case "graph_gaussian":
      return (x, y) => Math.exp(-0.7 * (x * x + y * y));
    case "graph_ripple":
      return (x, y) => {
        const r = Math.sqrt(x * x + y * y);
        return r < 1e-4 ? 1 : Math.sin(3 * r) / (3 * r);
      };
    case "graph_mexican":
      return (x, y) => {
        const r2 = x * x + y * y;
        return (1 - r2) * Math.exp(-0.5 * r2);
      };
    case "graph_sinSum":
      return (x, y) => 0.45 * (Math.sin(x) + Math.cos(y));
    case "graph_sinc":
      return (x, y) => {
        const r = Math.sqrt(x * x + y * y);
        return r < 1e-4 ? 1 : Math.sin(r) / r;
      };
    case "graph_sinc2":
      return (x, y) => {
        const r = Math.sqrt(x * x + y * y);
        return Math.sin(2 * r) / (1 + r * r);
      };
    case "graph_custom":
      return makeZFunction(
        graphExpr || "x*x - y*y"
      );
    default:
      return null;
  }
}

/**
 * Compute E,F,G, e,f,g, K, H, k1, k2 for graph-type surfaces,
 * given the world-space probe point.
 *
 * The graph viewer uses world coordinates (x, y=z(x,y), z=y),
 * so the underlying graph coordinates are:
 *   x_graph = X_world
 *   y_graph = Z_world
 */
export function computeGraphInvariantsFromProbe(
  surfaceId: SurfaceId,
  graphExpr: string | undefined,
  probePoint: { x: number; y: number; z: number }
): CurvatureData | null {
  const f = getGraphFunction(surfaceId, graphExpr);
  if (!f) return null;

  const x = probePoint.x;
  const y = probePoint.z;

  return numericGraphInvariants(f, x, y);
}
