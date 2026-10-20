import type {
  Graph2DFunctionDraft, Graph2DParametricDraft, Graph2DPolarDraft, Graph2DImplicitDraft,
  Graph2DSlopeFieldDraft, Graph2DPhasePortraitDraft, Graph2DTimeOdeDraft,
  Graph2DInequalityDraft, Graph2DPiecewiseDraft, Graph2DPointSeriesDraft,
} from "@math3d/core";

export type PointDraftState = { label: string; mode: "points" | "line";
  style: Graph2DPointSeriesDraft["style"]; text: string };
type Preset<T> = Readonly<{ id: string; title: string; detail: string; draft: () => T }>;
type Catalog = Readonly<{
  explicit: readonly Preset<Graph2DFunctionDraft>[];
  parametric: readonly Preset<Graph2DParametricDraft>[];
  polar: readonly Preset<Graph2DPolarDraft>[];
  implicit: readonly Preset<Graph2DImplicitDraft>[];
  "slope-field": readonly Preset<Graph2DSlopeFieldDraft>[];
  "phase-portrait": readonly Preset<Graph2DPhasePortraitDraft>[];
  "time-ode": readonly Preset<Graph2DTimeOdeDraft>[];
  inequality: readonly Preset<Graph2DInequalityDraft>[];
  piecewise: readonly Preset<Graph2DPiecewiseDraft>[];
  "point-series": readonly Preset<PointDraftState>[];
}>;

const domain = (min: number, max: number, includeMin = true, includeMax = true) =>
  ({ min, max, includeMin, includeMax });
const style = (color: string, lineWidth = 2, lineStyle: "solid" | "dashed" | "dotted" = "solid") =>
  ({ visible: true, color, lineWidth, lineStyle });

/** Presets populate the editor only. Saving still uses the normal validation and authoring path. */
export const graph2DAuthoringPresets: Catalog = {
  explicit: [
    { id: "line", title: "Line", detail: "A simple y = x reference.",
      draft: () => ({ label: "f", expression: "x", domain: domain(-10, 10), style: style("#2563eb") }) },
    { id: "parabola", title: "Parabola", detail: "Roots at x = −2 and x = 2.",
      draft: () => ({ label: "Parabola", expression: "x^2-4", domain: domain(-4, 4), style: style("#7c3aed") }) },
    { id: "damped-wave", title: "Damped wave", detail: "A decaying oscillation on x ≥ 0.",
      draft: () => ({ label: "Damped wave", expression: "exp(-0.2*x)*sin(3*x)", domain: domain(0, 12), style: style("#e11d48") }) },
    { id: "sine", title: "Sine wave", detail: "A periodic wave across two cycles.",
      draft: () => ({ label: "Sine wave", expression: "sin(x)", domain: domain(-2 * Math.PI, 2 * Math.PI), style: style("#0d9488") }) },
    { id: "gaussian", title: "Gaussian bell", detail: "A smooth peak centered at the origin.",
      draft: () => ({ label: "Gaussian", expression: "exp(-x^2/2)", domain: domain(-4, 4), style: style("#b45309") }) },
  ],
  parametric: [
    { id: "circle", title: "Unit circle", detail: "Closed curve over one full turn.",
      draft: () => ({ label: "p", xExpression: "cos(t)", yExpression: "sin(t)", domain: domain(0, 2 * Math.PI), style: style("#e11d48") }) },
    { id: "ellipse", title: "Ellipse", detail: "A wider closed orbit.",
      draft: () => ({ label: "Ellipse", xExpression: "2*cos(t)", yExpression: "sin(t)", domain: domain(0, 2 * Math.PI), style: style("#2563eb") }) },
    { id: "lissajous", title: "Lissajous loops", detail: "Two frequencies trace a crossing curve.",
      draft: () => ({ label: "Lissajous", xExpression: "sin(3*t)", yExpression: "sin(2*t)", domain: domain(0, 2 * Math.PI), style: style("#7c3aed") }) },
    { id: "cycloid", title: "Cycloid", detail: "A rolling circle traces one arch.",
      draft: () => ({ label: "Cycloid", xExpression: "t-sin(t)", yExpression: "1-cos(t)", domain: domain(0, 2 * Math.PI), style: style("#0d9488") }) },
    { id: "spiral", title: "Expanding spiral", detail: "Radius grows with the parameter over two turns.",
      draft: () => ({ label: "Spiral", xExpression: "0.15*t*cos(t)", yExpression: "0.15*t*sin(t)", domain: domain(0, 4 * Math.PI), style: style("#b45309") }) },
  ],
  polar: [
    { id: "circle", title: "Polar circle", detail: "r = 2 cos θ makes a shifted circle.",
      draft: () => ({ label: "r", rExpression: "2*cos(theta)", domain: domain(0, 2 * Math.PI), style: style("#7c3aed") }) },
    { id: "rose", title: "Three-petal rose", detail: "A signed-radius polar curve.",
      draft: () => ({ label: "Rose", rExpression: "2*cos(3*theta)", domain: domain(0, 2 * Math.PI), style: style("#e11d48") }) },
    { id: "spiral", title: "Archimedean spiral", detail: "Radius increases through three turns.",
      draft: () => ({ label: "Spiral", rExpression: "0.2*theta", domain: domain(0, 6 * Math.PI), style: style("#0d9488") }) },
    { id: "cardioid", title: "Cardioid", detail: "A heart-shaped polar curve with a cusp.",
      draft: () => ({ label: "Cardioid", rExpression: "2*(1+cos(theta))", domain: domain(0, 2 * Math.PI), style: style("#2563eb") }) },
    { id: "lemniscate", title: "Figure-eight rose", detail: "Four signed-radius lobes from a second harmonic.",
      draft: () => ({ label: "Four-petal rose", rExpression: "2*cos(2*theta)", domain: domain(0, 2 * Math.PI), style: style("#b45309") }) },
  ],
  implicit: [
    { id: "circle", title: "Circle contour", detail: "F(x,y) = 0 outlines a radius-2 disk.",
      draft: () => ({ label: "contour", expression: "x^2+y^2-4", domain: domain(-10, 10), yDomain: domain(-10, 10), style: style("#059669") }) },
    { id: "ellipse", title: "Ellipse contour", detail: "Different scales on x and y.",
      draft: () => ({ label: "Ellipse contour", expression: "x^2/4+y^2-1", domain: domain(-4, 4), yDomain: domain(-3, 3), style: style("#2563eb") }) },
    { id: "hyperbola", title: "Hyperbola", detail: "Two open branches, x² − y² = 1.",
      draft: () => ({ label: "Hyperbola", expression: "x^2-y^2-1", domain: domain(-4, 4), yDomain: domain(-4, 4), style: style("#b45309") }) },
    { id: "saddle-level", title: "Saddle level set", detail: "The zero contour of xy − 1.",
      draft: () => ({ label: "Saddle level", expression: "x*y-1", domain: domain(-4, 4), yDomain: domain(-4, 4), style: style("#7c3aed") }) },
    { id: "sinusoidal", title: "Wavy contour", detail: "The implicit equation y = sin(x).",
      draft: () => ({ label: "Wavy contour", expression: "y-sin(x)", domain: domain(-7, 7), yDomain: domain(-2, 2), style: style("#e11d48") }) },
  ],
  "slope-field": [
    { id: "relaxation", title: "Relaxation", detail: "dy/dx = x − y approaches a moving balance.",
      draft: () => ({ label: "dy/dx", expression: "x-y", domain: domain(-10, 10), yDomain: domain(-10, 10), style: style("#0d9488", 1.5) }) },
    { id: "logistic", title: "Logistic growth", detail: "Equilibria at y = 0 and y = 1.",
      draft: () => ({ label: "Logistic field", expression: "y*(1-y)", domain: domain(-4, 4), yDomain: domain(-1, 2), style: style("#2563eb", 1.5) }) },
    { id: "forced", title: "Driven field", detail: "A sinusoidal forcing with damping.",
      draft: () => ({ label: "Driven field", expression: "sin(x)-y", domain: domain(-6, 6), yDomain: domain(-3, 3), style: style("#7c3aed", 1.5) }) },
    { id: "exponential", title: "Exponential growth", detail: "Slopes depend only on the current value y.",
      draft: () => ({ label: "Growth field", expression: "y", domain: domain(-4, 4), yDomain: domain(-3, 3), style: style("#b45309", 1.5) }) },
    { id: "nonlinear", title: "Nonlinear balance", detail: "The field y′ = x − y² curves around a parabola.",
      draft: () => ({ label: "Nonlinear field", expression: "x-y^2", domain: domain(-4, 4), yDomain: domain(-3, 3), style: style("#e11d48", 1.5) }) },
  ],
  "phase-portrait": [
    { id: "center", title: "Center", detail: "Circular trajectories around the origin.",
      draft: () => ({ label: "Phase portrait", xDerivative: "y", yDerivative: "-x", domain: domain(-4, 4), yDomain: domain(-4, 4), timeSpan: 2 * Math.PI, seeds: [{ x: 1, y: 0 }], style: style("#7c3aed") }) },
    { id: "saddle", title: "Saddle", detail: "One growing and one decaying direction.",
      draft: () => ({ label: "Saddle", xDerivative: "x", yDerivative: "-y", domain: domain(-4, 4), yDomain: domain(-4, 4), timeSpan: 4, seeds: [{ x: 1, y: 1 }, { x: -1, y: 1 }], style: style("#e11d48") }) },
    { id: "damped", title: "Damped spiral", detail: "Trajectories spiral toward the origin.",
      draft: () => ({ label: "Damped spiral", xDerivative: "y", yDerivative: "-x-0.3*y", domain: domain(-4, 4), yDomain: domain(-4, 4), timeSpan: 12, seeds: [{ x: 2, y: 0 }], style: style("#0d9488") }) },
    { id: "source", title: "Source", detail: "Orbits move outward from the origin.",
      draft: () => ({ label: "Source", xDerivative: "x", yDerivative: "y", domain: domain(-4, 4), yDomain: domain(-4, 4), timeSpan: 3, seeds: [{ x: 0.5, y: 0.5 }], style: style("#b45309") }) },
    { id: "stable-node", title: "Stable node", detail: "Both coordinates decay toward zero at different rates.",
      draft: () => ({ label: "Stable node", xDerivative: "-x", yDerivative: "-2*y", domain: domain(-4, 4), yDomain: domain(-4, 4), timeSpan: 5, seeds: [{ x: 2, y: 1 }], style: style("#2563eb") }) },
  ],
  "time-ode": [
    { id: "relaxation", title: "Tracking a ramp", detail: "x′ = t − x from x(0) = 1.",
      draft: () => ({ label: "Driven trajectory", expression: "t-x", domain: domain(-2, 4), stateDomain: domain(-1, 8), seed: { t: 0, x: 1 }, style: style("#7c3aed", 2.5) }) },
    { id: "decay", title: "Exponential decay", detail: "x′ = −x from x(0) = 3.",
      draft: () => ({ label: "Decay", expression: "-x", domain: domain(0, 6), stateDomain: domain(-1, 4), seed: { t: 0, x: 3 }, style: style("#2563eb", 2.5) }) },
    { id: "forced", title: "Forced response", detail: "Sinusoidal input with damping.",
      draft: () => ({ label: "Forced response", expression: "sin(t)-0.3*x", domain: domain(0, 15), stateDomain: domain(-4, 4), seed: { t: 0, x: 0 }, style: style("#e11d48", 2.5) }) },
    { id: "logistic", title: "Logistic trajectory", detail: "Growth slows near the carrying capacity x = 1.",
      draft: () => ({ label: "Logistic", expression: "x*(1-x)", domain: domain(0, 10), stateDomain: domain(-0.2, 1.5), seed: { t: 0, x: 0.1 }, style: style("#0d9488", 2.5) }) },
    { id: "cooling", title: "Cooling to equilibrium", detail: "The state approaches x = 2 from above.",
      draft: () => ({ label: "Cooling", expression: "2-x", domain: domain(0, 8), stateDomain: domain(0, 6), seed: { t: 0, x: 5 }, style: style("#b45309", 2.5) }) },
  ],
  inequality: [
    { id: "disk", title: "Filled disk", detail: "Interior of x² + y² ≤ 4.",
      draft: () => ({ label: "region", clauses: [{ expression: "x^2+y^2-4", comparator: "<=" }], operator: "all", domain: domain(-10, 10), yDomain: domain(-10, 10), style: style("#0d9488") }) },
    { id: "half-plane", title: "Half-plane", detail: "The region y ≤ x.",
      draft: () => ({ label: "Below diagonal", clauses: [{ expression: "y-x", comparator: "<=" }], operator: "all", domain: domain(-5, 5), yDomain: domain(-5, 5), style: style("#2563eb") }) },
    { id: "half-disk", title: "Upper half-disk", detail: "Intersection of a disk and y ≥ 0.",
      draft: () => ({ label: "Upper half-disk", clauses: [{ expression: "x^2+y^2-4", comparator: "<=" }, { expression: "y", comparator: ">=" }], operator: "all", domain: domain(-3, 3), yDomain: domain(-3, 3), style: style("#7c3aed") }) },
    { id: "annulus", title: "Annulus", detail: "The ring between circles of radius 1 and 3.",
      draft: () => ({ label: "Annulus", clauses: [{ expression: "x^2+y^2-1", comparator: ">=" }, { expression: "x^2+y^2-9", comparator: "<=" }], operator: "all", domain: domain(-4, 4), yDomain: domain(-4, 4), style: style("#e11d48") }) },
    { id: "strip", title: "Horizontal strip", detail: "The region between y = −1 and y = 1.",
      draft: () => ({ label: "Strip", clauses: [{ expression: "y+1", comparator: ">=" }, { expression: "y-1", comparator: "<=" }], operator: "all", domain: domain(-4, 4), yDomain: domain(-3, 3), style: style("#b45309") }) },
  ],
  piecewise: [
    { id: "absolute", title: "Absolute value", detail: "Two pieces meet at x = 0.",
      draft: () => ({ label: "piecewise", pieces: [
        { expression: "-x", domain: domain(-10, 0, true, false) },
        { expression: "x", domain: domain(0, 10) }], style: style("#9333ea") }) },
    { id: "step", title: "Step jump", detail: "A jump at x = 0 with one included endpoint.",
      draft: () => ({ label: "Step", pieces: [
        { expression: "-1", domain: domain(-5, 0, true, false) },
        { expression: "1", domain: domain(0, 5) }], style: style("#e11d48") }) },
    { id: "capped", title: "Capped parabola", detail: "A quadratic center with constant outer pieces.",
      draft: () => ({ label: "Capped parabola", pieces: [
        { expression: "2", domain: domain(-5, -2, true, false) },
        { expression: "x^2/2", domain: domain(-2, 2, true, false) },
        { expression: "2", domain: domain(2, 5) }], style: style("#2563eb") }) },
    { id: "rectified", title: "Rectified sine", detail: "A wave clipped to zero below the axis.",
      draft: () => ({ label: "Rectified sine", pieces: [
        { expression: "0", domain: domain(-Math.PI, 0, true, false) },
        { expression: "sin(x)", domain: domain(0, Math.PI) }], style: style("#0d9488") }) },
    { id: "three-step", title: "Three-level step", detail: "Two jumps divide the graph into three constant levels.",
      draft: () => ({ label: "Three-level step", pieces: [
        { expression: "-1", domain: domain(-5, 0, true, false) },
        { expression: "0", domain: domain(0, 1, true, false) },
        { expression: "1", domain: domain(1, 5) }], style: style("#b45309") }) },
  ],
  "point-series": [
    { id: "quadratic", title: "Quadratic samples", detail: "Three exact points for a quick scatter plot.",
      draft: () => ({ label: "data", mode: "points", text: "x,y\n0,0\n1,1\n2,4", style: style("#ea580c") }) },
    { id: "measurements", title: "Measured trend", detail: "Slightly noisy observations in a connected line.",
      draft: () => ({ label: "Measurements", mode: "line", text: "x,y\n-3,-2.8\n-2,-1.9\n-1,-0.7\n0,0.2\n1,1.2\n2,1.8\n3,3.1", style: style("#2563eb") }) },
    { id: "gaps", title: "Missing observation", detail: "A blank y value deliberately leaves a gap.",
      draft: () => ({ label: "With gap", mode: "line", text: "x,y\n0,1\n1,2\n2,\n3,2\n4,1", style: style("#0d9488") }) },
    { id: "sine-samples", title: "Wave samples", detail: "Sparse measurements of a periodic signal.",
      draft: () => ({ label: "Wave samples", mode: "line", text: "x,y\n0,0\n1,0.84\n2,0.91\n3,0.14\n4,-0.76\n5,-0.96\n6,-0.28", style: style("#7c3aed") }) },
    { id: "outlier", title: "Trend with outlier", detail: "A scatter set suited to fitting and residual inspection.",
      draft: () => ({ label: "Trend with outlier", mode: "points", text: "x,y\n0,1\n1,2\n2,3\n3,7\n4,5\n5,6", style: style("#b45309") }) },
  ],
};

export type Graph2DAuthoringPresetMode = keyof Catalog;
