// src/math/surfaceInvariants.ts
import type { SurfaceId } from "../components/SurfaceViewer";

export type CurvatureData = {
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
  const fxy = (xx: number, yy: number) => f(xx, yy);

  const fx =
    (fxy(x + h, y) - fxy(x - h, y)) / (2 * h);
  const fy =
    (fxy(x, y + h) - fxy(x, y - h)) / (2 * h);

  const fxx =
    (fxy(x + h, y) - 2 * fxy(x, y) + fxy(x - h, y)) /
    (h * h);
  const fyy =
    (fxy(x, y + h) - 2 * fxy(x, y) + fxy(x, y - h)) /
    (h * h);
  const f_xy =
    (fxy(x + h, y + h) -
      fxy(x + h, y - h) -
      fxy(x - h, y + h) +
      fxy(x - h, y - h)) /
    (4 * h * h);

  const E = 1 + fx * fx;
  const F = fx * fy;
  const G = 1 + fy * fy;

  const denom1 = Math.sqrt(1 + fx * fx + fy * fy);
  if (!isFinite(denom1) || denom1 === 0) return null;

  const e = fxx / denom1;
  const fcoef = f_xy / denom1;
  const g = fyy / denom1;

  const EGminusF2 = E * G - F * F;
  if (!isFinite(EGminusF2) || Math.abs(EGminusF2) < 1e-8) {
    return {
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

  return { E, F, G, e, f: fcoef, g, K, H, k1, k2 };
}

// small parser for z = f(x,y) (copy of what we use in SurfaceViewer)
function makeZFunction(expr: string | undefined): (x: number, y: number) => number {
  const fallback = () => 0;
  if (!expr || !expr.trim()) return fallback;

  try {
    const fn = new Function(
      "x",
      "y",
      "Math",
      "sin",
      "cos",
      "tan",
      "sqrt",
      "abs",
      "exp",
      "log",
      "pow",
      "PI",
      `return (${expr});`
    ) as (
      x: number,
      y: number,
      m: typeof Math,
      sin: (t: number) => number,
      cos: (t: number) => number,
      tan: (t: number) => number,
      sqrt: (t: number) => number,
      abs: (t: number) => number,
      exp: (t: number) => number,
      log: (t: number) => number,
      pow: (a: number, b: number) => number,
      PI: number
    ) => number;

    return (x, y) => {
      const z = fn(
        x,
        y,
        Math,
        Math.sin,
        Math.cos,
        Math.tan,
        Math.sqrt,
        Math.abs,
        Math.exp,
        Math.log,
        Math.pow,
        Math.PI
      );
      return Number.isFinite(z) ? z : 0;
    };
  } catch {
    return fallback;
  }
}

// get f(x,y) for the graph_* surfaces
function getGraphFunction(
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
