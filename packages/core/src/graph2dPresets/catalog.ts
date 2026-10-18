import { applyGraph2DAuthoring, type Graph2DAuthoringAction } from "../graph2dAuthoring";
import { createGraph2DDocument, type Graph2DDomain } from "../graph2dDocument";
import type { Graph2DViewport } from "../graph2dViewport";
import { createGraph2DPreset, createGraph2DPresetRegistry, type Graph2DPresetCategory } from "../graph2dPresets";
import { Graph2DPointTableStore, type Graph2DPointRow } from "../graph2dPointSeries";

const domain = (min: number, max: number): Graph2DDomain => ({ min, max, includeMin: true, includeMax: true });
const style = { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true };
const explicit = (label: string, expression: string, min = -4, max = 4): Graph2DAuthoringAction =>
  ({ type: "create", draft: { label, expression, domain: domain(min, max), style } });
const parametric = (label: string, xExpression: string, yExpression: string, max = 2 * Math.PI): Graph2DAuthoringAction =>
  ({ type: "create-parametric", draft: { label, xExpression, yExpression, domain: domain(0, max), style } });
const polar = (label: string, rExpression: string, max = 2 * Math.PI): Graph2DAuthoringAction =>
  ({ type: "create-polar", draft: { label, rExpression, domain: domain(0, max), style } });
const implicit = (label: string, expression: string): Graph2DAuthoringAction =>
  ({ type: "create-implicit", draft: { label, expression, domain: domain(-2.5, 2.5), yDomain: domain(-2.5, 2.5), style } });
const phase = (label: string, xDerivative: string, yDerivative: string, bounds: number,
  timeSpan: number, seed: { x: number; y: number }): Graph2DAuthoringAction =>
  ({ type: "create-phase-portrait", draft: { label, xDerivative, yDerivative,
    domain: domain(-bounds, bounds), yDomain: domain(-bounds, bounds), timeSpan, seeds: [seed],
    style: { ...style, color: "#7c3aed" } } });
const viewport = (xMin: number, xMax: number, yMin: number, yMax: number, aspect: "equal" | "free" = "free"): Graph2DViewport =>
  ({ xMin, xMax, yMin, yMax, aspect });
type Recipe = { id: string; title: string; category: Graph2DPresetCategory; description: string; goal: string;
  actions: Graph2DAuthoringAction[]; view: Graph2DViewport; featured?: number; tags?: string[];
  variables?: { name: string; value: number }[]; sidecars?: { id: string; rows: Graph2DPointRow[] }[];
  costClass?: "starter" | "complex"; difficulty?: "basic" | "intermediate" | "advanced" };

/** The catalog example and GRA-12.2 performance corpus use identical original rows. */
export const createGraph2DRegressionPresetRows = (): Graph2DPointRow[] => Array.from({ length: 10000 }, (_, i) => {
  const x = -1 + 2 * i / 9999;
  return { id: `row_${i + 1}`, x, y: 2 + x - .5 * x * x + .25 * x ** 3 + (i % 7 - 3) * .001 };
});

const recipes = (): Recipe[] => {
  const rows = [-2, -1, 0, 1, 2].map((x, i) => ({ id: `row_${i + 1}`, x, y: x === 0 ? null : x / 2 }));
  const table = new Graph2DPointTableStore().publish(rows);
  const regressionRows = createGraph2DRegressionPresetRows();
  const regressionTable = new Graph2DPointTableStore().publish(regressionRows);
  return [
    { id: "line-comparison", title: "Two slopes", category: "Algebra", description: "Compare y = x and y = a*x+b, with a = 2 and b = 1. Named values are editable source; slider controls arrive later.", goal: "Edit an expression and compare slope and intercept.",
      actions: [explicit("Unit slope", "x"), explicit("Steeper line", "a*x+b")], variables: [{ name: "a", value: 2 }, { name: "b", value: 1 }], view: viewport(-3, 3, -4, 6), tags: ["linear", "beginner"] },
    { id: "translated-quadratic", title: "Moving a parabola", category: "Algebra", description: "Compare x^2 with (x-1)^2-1. Translation moves the vertex without changing the shape.", goal: "Change the horizontal and vertical offsets.",
      actions: [explicit("Original", "x^2"), explicit("Translated", "(x-1)^2-1")], view: viewport(-3, 4, -2, 8) },
    { id: "cubic-extrema", title: "Cubic turning points", category: "Algebra", description: "x^3-3*x has two turning points and three roots. Select the curve, then use Analyze to inspect numerical candidates.", goal: "Locate extrema and compare their function values.",
      actions: [explicit("Cubic", "x^3-3*x")], view: viewport(-2.5, 2.5, -6, 6), tags: ["extrema", "roots"] },
    { id: "repeated-root", title: "A root that touches", category: "Algebra", description: "(x-1)^2*(x+2) touches the axis at a repeated root and crosses at a simple root. A numerical scan is not a proof of multiplicity.", goal: "Compare touching and crossing near the zeros.",
      actions: [explicit("Repeated root", "(x-1)^2*(x+2)")], view: viewport(-3, 3, -5, 8), tags: ["polynomial", "roots"] },
    { id: "reciprocal-pole", title: "Across an asymptote", category: "Algebra", description: "1/x is undefined at zero. Two restricted domains show its branches separately, excluding the interval [-0.125,0.125] from this bounded example.", goal: "Zoom around zero and inspect the restricted domains.",
      actions: [explicit("Negative branch", "1/x", -4, -.125), explicit("Positive branch", "1/x", .125, 4)], view: viewport(-4, 4, -4, 4), tags: ["rational", "asymptote"] },
    { id: "exponential-log", title: "Exponential and logarithm", category: "Algebra", description: "exp(x) and ln(x) are inverse functions on their valid domains. The dashed diagonal helps compare their reflection.", goal: "Probe positive x values and compare the two curves.",
      actions: [explicit("Exponential", "exp(x)", -3, 2), explicit("Natural logarithm", "ln(x)", 0.02, 7), explicit("Diagonal", "x", -3, 7)], view: viewport(-3, 7, -3, 7, "equal"), tags: ["exponential", "logarithm"] },
    { id: "sine-cosine", title: "Sine and cosine", category: "Trigonometry", description: "Two periodic waves differ by a quarter-cycle phase shift. Angles are in radians.", goal: "Find crossings and compare peaks.",
      actions: [explicit("Sine", "sin(x)", -10, 10), explicit("Cosine", "cos(x)", -10, 10)], view: viewport(-7, 7, -1.5, 1.5), tags: ["periodic", "phase"] },
    { id: "damped-wave", title: "Damped oscillation", category: "Trigonometry", description: "exp(-0.2*x)*sin(3*x) oscillates inside a shrinking exponential envelope for x ≥ 0.", goal: "Compare the wave with its upper and lower envelopes.",
      actions: [explicit("Wave", "exp(-0.2*x)*sin(3*x)", 0, 15), explicit("Upper envelope", "exp(-0.2*x)", 0, 15), explicit("Lower envelope", "-exp(-0.2*x)", 0, 15)], view: viewport(0, 15, -1.2, 1.2), tags: ["oscillation", "exponential"] },
    { id: "wave-beats", title: "Beating waves", category: "Trigonometry", description: "sin(4*x)+sin(4.5*x) produces a slowly varying amplitude from two nearby frequencies. The envelope is a static comparison.", goal: "Edit a frequency to change the beat spacing.", featured: 0,
      actions: [explicit("Combined wave", "sin(4*x)+sin(4.5*x)", 0, 12), explicit("Envelope", "2*cos(0.25*x)", 0, 12)], view: viewport(0, 12, -2.4, 2.4), tags: ["periodic", "interference", "showcase"] },
    { id: "sine-derivative", title: "A wave and its derivative", category: "Calculus", description: "sin(x) and its explicitly authored derivative cos(x). The second expression is a normal editable curve, not a live linked analysis result.", goal: "Compare slope signs with the derivative curve.",
      actions: [explicit("Function", "sin(x)", -7, 7), explicit("Derivative comparison", "cos(x)", -7, 7)], view: viewport(-7, 7, -1.5, 1.5), tags: ["derivative", "periodic"] },
    { id: "parabola-tangent", title: "A tangent at x = 1", category: "Calculus", description: "The line 2*x-1 is tangent to x^2 at (1,1). This is a fixed authored line; changing the parabola does not automatically regenerate it.", goal: "Probe x = 1 and request a fresh tangent in Analyze.", featured: 1,
      actions: [explicit("Parabola", "x^2", -2, 3), explicit("Fixed tangent", "2*x-1", -2, 3)], view: viewport(-2, 3, -2, 6), tags: ["tangent", "derivative"] },
    { id: "circle-ellipse", title: "Circle and ellipse", category: "Parametric", description: "cos(t),sin(t) and 2*cos(t),sin(t), for a complete turn. Equal scale preserves the distinction between a circle and an ellipse.", goal: "Edit the x amplitude and inspect the parameter at a probe.",
      actions: [parametric("Circle", "cos(t)", "sin(t)"), parametric("Ellipse", "2*cos(t)", "sin(t)")], view: viewport(-2.5, 2.5, -1.5, 1.5, "equal"), tags: ["closed", "ellipse"] },
    { id: "lissajous", title: "Lissajous loops", category: "Parametric", description: "sin(3*t),sin(2*t) traces a closed pattern from two harmonic motions. Self-crossings are part of the curve.", goal: "Change a frequency to explore another pattern.", featured: 2,
      actions: [parametric("Lissajous", "sin(3*t)", "sin(2*t)")], view: viewport(-1.3, 1.3, -1.3, 1.3, "equal"), tags: ["harmonic", "showcase"] },
    { id: "cycloid", title: "A rolling circle's trace", category: "Parametric", description: "t-sin(t),1-cos(t) describes two cycloid arches. Cusps are singular points, so sampling is an approximation.", goal: "Probe near an arch and compare parameter and x.",
      actions: [parametric("Cycloid", "t-sin(t)", "1-cos(t)", 4 * Math.PI)], view: viewport(-0.5, 13, -0.3, 2.5), tags: ["cycloid", "cusp"] },
    { id: "polar-rose", title: "A three-petal rose", category: "Polar", description: "r = sin(3*theta) uses signed radius and radians. Negative radii are retained in the source rather than clipped away.", goal: "Try another integer in the angular expression.", featured: 3,
      actions: [polar("Rose", "sin(3*theta)")], view: viewport(-1.25, 1.25, -1.25, 1.25, "equal"), tags: ["rose", "signed radius", "showcase"] },
    { id: "archimedean-spiral", title: "An Archimedean spiral", category: "Polar", description: "r = theta/4 winds through three turns. Radius grows linearly with angle.", goal: "Change the radial growth rate and inspect a parameter probe.",
      actions: [polar("Spiral", "theta/4", 6 * Math.PI)], view: viewport(-5, 5, -5, 5, "equal"), tags: ["spiral", "showcase"] },
    { id: "cardioid", title: "A cardioid", category: "Polar", description: "r = 1+cos(theta) makes a heart-like polar curve with a cusp at the origin. Equal scale preserves its geometry.", goal: "Replace the constant 1 to explore a limaçon.", featured: 4,
      actions: [polar("Cardioid", "1+cos(theta)")], view: viewport(-0.8, 2.3, -1.8, 1.8, "equal"), tags: ["cardioid", "cusp", "showcase"] },
    { id: "implicit-conics", title: "Implicit conics", category: "Implicit and regions", description: "Residuals x^2+y^2-1 and x^2-y^2-1 define a circle and hyperbola. Contours are bounded numerical approximations, not topology proofs.", goal: "Compare closed and open contours.", featured: 5,
      actions: [implicit("Circle", "x^2+y^2-1"), implicit("Hyperbola", "x^2-y^2-1")], view: viewport(-2.5, 2.5, -2.5, 2.5, "equal"), tags: ["implicit", "conics", "showcase"] },
    { id: "strict-disk", title: "Inside, excluding the boundary", category: "Implicit and regions", description: "x^2+y^2-1 < 0 includes the disk interior but excludes its dashed boundary. Cell fills approximate the mathematical region.", goal: "Change < to ≤ in the editor and compare boundary styling.",
      actions: [{ type: "create-inequality", draft: { label: "Open disk", clauses: [{ expression: "x^2+y^2-1", comparator: "<" }], operator: "all", domain: domain(-1.5, 1.5), yDomain: domain(-1.5, 1.5), style } }], view: viewport(-1.5, 1.5, -1.5, 1.5, "equal"), tags: ["inequality", "strict"] },
    { id: "piecewise-data-gaps", title: "Endpoints and missing data", category: "Piecewise and data", description: "Two constant pieces jump at zero, with an open left endpoint. A small measured series has a missing row at zero: neither line bridges that gap.", goal: "Inspect open endpoints and edit a piece without fabricating missing values.",
      actions: [{ type: "create-piecewise", draft: { label: "Jump", pieces: [{ expression: "-1", domain: { ...domain(-2, 0), includeMax: false } }, { expression: "1", domain: domain(0, 2) }], style } },
        { type: "create-point-series", draft: { label: "Measured series", table, mode: "line", domain: domain(-2, 2), style } }], sidecars: [{ id: table.id, rows }], view: viewport(-2.5, 2.5, -1.5, 1.5), tags: ["piecewise", "data", "gaps"] },
    { id: "regression-10000", title: "10,000-point regression", category: "Piecewise and data",
      description: "A full-size deterministic measured series with cubic trend and small patterned noise. The plot is sampled for display; regression uses all 10,000 original checked rows. Select the series, choose a model in Inspector, and fit it.",
      goal: "Compare linear, quadratic, cubic and quartic fits at the point-table limit, then cancel and repeat a fit.",
      actions: [{ type: "create-point-series", draft: { label: "10,000 measurements", table: regressionTable, mode: "line", domain: domain(-1, 1), style } }],
      sidecars: [{ id: regressionTable.id, rows: regressionRows }], view: viewport(-1.2, 1.2, 0, 3),
      tags: ["regression", "10000", "performance", "data"], costClass: "complex", difficulty: "advanced" },
    { id: "phase-center", title: "Circular flow", category: "Differential equations",
      description: "x′=y, y′=-x has concentric circular orbits and one equilibrium at the origin. The orange x′ nullcline is y=0; the cyan y′ nullcline is x=0.",
      goal: "Compare a closed orbit with the two nullclines and their equilibrium crossing.",
      actions: [phase("Circular flow", "y", "-x", 2.5, 2 * Math.PI, { x: 1, y: 0 })],
      view: viewport(-2.5, 2.5, -2.5, 2.5, "equal"), featured: 6,
      tags: ["phase portrait", "center", "closed orbit", "equilibrium"], difficulty: "intermediate" },
    { id: "phase-saddle", title: "Saddle flow", category: "Differential equations",
      description: "x′=x, y′=-y has a saddle equilibrium at the origin. Away from the axes, xy stays constant along a trajectory until the plot boundary.",
      goal: "Compare the two zero-derivative axes and the diverging forward orbit.",
      actions: [phase("Saddle flow", "x", "-y", 3, 2, { x: 1, y: 1 })],
      view: viewport(-3, 3, -3, 3, "equal"),
      tags: ["phase portrait", "saddle", "nullclines", "equilibrium"], difficulty: "intermediate" },
    { id: "phase-bistable", title: "Three equilibria", category: "Differential equations",
      description: "x′=x-x^3, y′=-y has equilibria at (-1,0), (0,0), and (1,0). The cubic x′ nullcline has three branches.",
      goal: "Locate the three numerical equilibrium candidates and edit the initial point.",
      actions: [phase("Bistable flow", "x-x^3", "-y", 2, 3, { x: 0.5, y: 1 })],
      view: viewport(-2, 2, -2, 2, "equal"),
      tags: ["phase portrait", "nonlinear", "three equilibria", "nullclines"], difficulty: "advanced" },
  ];
};
let catalog: ReturnType<typeof createGraph2DPresetRegistry> | undefined;
/** Lazy initialization: importing core into a sampling worker does not instantiate the catalog. */
export const getGraph2DPresetCatalog = () => catalog ??= createGraph2DPresetRegistry(recipes().map((recipe) => {
  let document = createGraph2DDocument({ stableKey: ["preset", recipe.id],
    source: { objects: [], variables: recipe.variables ?? [], assumptions: [] } });
  for (const action of recipe.actions) document = createGraph2DDocument({ ...applyGraph2DAuthoring(document, action), stableKey: ["preset", recipe.id] });
  const colors = ["#2563eb", "#be185d", "#047857"];
  document = createGraph2DDocument({ ...document, stableKey: ["preset", recipe.id], title: recipe.title,
    display: { ...document.display, viewport: recipe.view,
      axes: { x: true, y: true, labels: true, grid: true, gridMode: recipe.category === "Polar" ? "polar" : "cartesian" },
      objects: document.display.objects.map((item, i) => ({ ...item, color: colors[i % colors.length]!, lineStyle: i ? "dashed" : "solid" })),
      sampling: { maxSamples: recipe.costClass === "complex" ? 1024 : 4000, maxDepth: 12, tolerancePx: 0.75 } } });
  return createGraph2DPreset({ id: recipe.id, version: 1, title: recipe.title, description: recipe.description,
    category: recipe.category, tags: recipe.tags ?? [recipe.category.toLowerCase()], difficulty: recipe.difficulty ?? (recipe.category === "Algebra" ? "basic" : "intermediate"),
    learningGoals: [recipe.goal], featuredOrder: recipe.featured ?? null, costClass: recipe.costClass ?? "starter", template: document, sidecars: recipe.sidecars ?? [],
    attribution: { author: "Math3D", source: "Original curated mathematical example", license: "GPL-3.0-or-later" } });
}));
