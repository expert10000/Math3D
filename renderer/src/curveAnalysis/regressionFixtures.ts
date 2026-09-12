import { buildSplineCurve, DEFAULT_BEZIER_CURVE, DEFAULT_BSPLINE_CURVE, RATIONAL_NURBS_CIRCLE, type AnyCurve, type Curve2D, type Curve3D } from "@math3d/core";

const curve2 = (id: string, domain: Curve2D["domain"], evalFn: Curve2D["eval"], derivatives: Partial<Pick<Curve2D, "derivative" | "secondDerivative" | "thirdDerivative">> = {}): Curve2D => ({ id, name: id, kind: "parametric", family: "parametric", dimension: 2, domain, eval: evalFn, ...derivatives });
const curve3 = (id: string, domain: Curve3D["domain"], evalFn: Curve3D["eval"], derivatives: Partial<Pick<Curve3D, "derivative" | "secondDerivative" | "thirdDerivative">> = {}): Curve3D => ({ id, name: id, kind: "parametric", family: "parametric", dimension: 3, domain, eval: evalFn, ...derivatives });
const interval = (min: number, max: number, closed = false) => ({ tMin: min, tMax: max, closed, periodic: closed });

const clothoidPoint = (t: number) => {
  const steps = 128, h = t / steps; let x = 0, y = 0;
  for (let index = 0; index < steps; index++) { const u = (index + 0.5) * h; x += Math.cos(0.5 * Math.PI * u * u) * h; y += Math.sin(0.5 * Math.PI * u * u) * h; }
  return { x, y };
};

export const CANONICAL_CURVE_FIXTURES: Readonly<Record<string, AnyCurve>> = {
  line: curve2("line", interval(-2, 2), (t) => ({ x: t, y: 2 * t }), { derivative: () => ({ x: 1, y: 2 }), secondDerivative: () => ({ x: 0, y: 0 }), thirdDerivative: () => ({ x: 0, y: 0 }) }),
  circle: curve2("circle", interval(0, Math.PI * 2, true), (t) => ({ x: Math.cos(t), y: Math.sin(t) }), { derivative: (t) => ({ x: -Math.sin(t), y: Math.cos(t) }), secondDerivative: (t) => ({ x: -Math.cos(t), y: -Math.sin(t) }), thirdDerivative: (t) => ({ x: Math.sin(t), y: -Math.cos(t) }) }),
  ellipse: curve2("ellipse", interval(0, Math.PI * 2, true), (t) => ({ x: 2 * Math.cos(t), y: Math.sin(t) }), { derivative: (t) => ({ x: -2 * Math.sin(t), y: Math.cos(t) }), secondDerivative: (t) => ({ x: -2 * Math.cos(t), y: -Math.sin(t) }), thirdDerivative: (t) => ({ x: 2 * Math.sin(t), y: -Math.cos(t) }) }),
  parabola: curve2("parabola", interval(-2, 2), (t) => ({ x: t, y: t * t }), { derivative: (t) => ({ x: 1, y: 2 * t }), secondDerivative: () => ({ x: 0, y: 2 }), thirdDerivative: () => ({ x: 0, y: 0 }) }),
  hyperbola: curve2("hyperbola", interval(-1.5, 1.5), (t) => ({ x: Math.cosh(t), y: Math.sinh(t) }), { derivative: (t) => ({ x: Math.sinh(t), y: Math.cosh(t) }), secondDerivative: (t) => ({ x: Math.cosh(t), y: Math.sinh(t) }), thirdDerivative: (t) => ({ x: Math.sinh(t), y: Math.cosh(t) }) }),
  helix: curve3("helix", interval(0, Math.PI * 4), (t) => ({ x: Math.cos(t), y: Math.sin(t), z: 0.5 * t }), { derivative: (t) => ({ x: -Math.sin(t), y: Math.cos(t), z: 0.5 }), secondDerivative: (t) => ({ x: -Math.cos(t), y: -Math.sin(t), z: 0 }), thirdDerivative: (t) => ({ x: Math.sin(t), y: -Math.cos(t), z: 0 }) }),
  clothoid: curve2("clothoid", interval(-2, 2), clothoidPoint),
  catenary: curve2("catenary", interval(-2, 2), (t) => ({ x: t, y: Math.cosh(t) }), { derivative: (t) => ({ x: 1, y: Math.sinh(t) }), secondDerivative: (t) => ({ x: 0, y: Math.cosh(t) }), thirdDerivative: (t) => ({ x: 0, y: Math.sinh(t) }) }),
  lissajous: curve2("lissajous", interval(0, Math.PI * 2, true), (t) => ({ x: Math.sin(3 * t), y: Math.sin(2 * t) })),
  hypotrochoid: curve2("hypotrochoid", interval(0, Math.PI * 2, true), (t) => ({ x: 3 * Math.cos(t) + 2 * Math.cos(3 * t), y: 3 * Math.sin(t) - 2 * Math.sin(3 * t) })),
  bezier: buildSplineCurve(DEFAULT_BEZIER_CURVE),
  "b-spline": buildSplineCurve(DEFAULT_BSPLINE_CURVE),
  "rational-nurbs-circle": buildSplineCurve(RATIONAL_NURBS_CIRCLE),
};

export const PATHOLOGICAL_CURVE_FIXTURES: Readonly<Record<string, AnyCurve>> = {
  cusp: curve2("cusp", interval(-1, 1), (t) => ({ x: t * t, y: t * t * t })),
  inflection: curve2("inflection", interval(-1, 1), (t) => ({ x: t, y: t ** 3 }), { derivative: (t) => ({ x: 1, y: 3 * t * t }), secondDerivative: (t) => ({ x: 0, y: 6 * t }), thirdDerivative: () => ({ x: 0, y: 6 }) }),
  "almost-straight": curve2("almost-straight", interval(-1, 1), (t) => ({ x: t, y: 1e-12 * t * t })),
  "derivative-singularity": curve2("derivative-singularity", { ...interval(-1, 1), breakpoints: [0] }, (t) => ({ x: t, y: Math.cbrt(t) })),
  discontinuity: curve2("discontinuity", { ...interval(-1, 1), breakpoints: [0] }, (t) => ({ x: t, y: t < 0 ? 0 : 1 })),
  "self-intersection": curve2("self-intersection", interval(0, Math.PI * 2, true), (t) => ({ x: Math.sin(t), y: Math.sin(2 * t) })),
  "near-intersection": curve2("near-intersection", interval(0, 1), (t) => t < 0.5 ? ({ x: 4 * t, y: 0 }) : ({ x: 4 * (1 - t), y: 1e-7 })),
  oscillation: curve2("oscillation", interval(0, 1), (t) => ({ x: t, y: Math.sin(80 * Math.PI * t) })),
  "tiny-loop": curve2("tiny-loop", interval(0, Math.PI * 2, true), (t) => ({ x: 1e-9 * Math.cos(t), y: 1e-9 * Math.sin(t) })),
  "repeated-points": curve2("repeated-points", { ...interval(0, 1), breakpoints: [0.5] }, (t) => t < 0.5 ? ({ x: t, y: 0 }) : ({ x: 0.5, y: 0 })),
  "degenerate-spline-span": curve2("degenerate-spline-span", { ...interval(0, 1), breakpoints: [0.4, 0.6] }, (t) => t < 0.4 ? ({ x: t, y: t }) : t <= 0.6 ? ({ x: 0.4, y: 0.4 }) : ({ x: t - 0.2, y: t - 0.2 })),
  "large-coordinate-range": curve3("large-coordinate-range", interval(-1, 1), (t) => ({ x: 1e12 + t * 1e6, y: -1e12 + t * t * 1e6, z: t * 1e-6 })),
};

export const scaleAwareTolerance = (scale: number, relative = 1e-7, absolute = 1e-10): number => Math.max(absolute, Math.abs(scale) * relative);
