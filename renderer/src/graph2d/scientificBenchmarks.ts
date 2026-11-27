import { analyzeGraph2DIntegral, applyGraph2DAuthoring, createGraph2DDocument,
  createGraph2DPreset, sampleGraph2DScene, type Graph2DAuthoringAction, type Graph2DPreset } from "@math3d/core";

export type BenchmarkId = "sinc" | "circle" | "lemniscate" | "cusp" | "reciprocal" | "area" |
  "revolution" | "surface-section" | "rotational-field" | "mesh-curvature";
export type BenchmarkResult = { status: "pass" | "fail"; detail: string };
export type BenchmarkCase = Readonly<{ id: BenchmarkId; title: string; expected: string;
  method: string; automated: boolean; workspace: string }>;

export const scientificBenchmarks: readonly BenchmarkCase[] = [
  { id: "sinc", title: "sin(x)/x", expected: "Undefined at x = 0; zeros at nonzero integer multiples of π.", method: "Check sampled branches and zero proximity on [−10, 10].", automated: true, workspace: "Graphs" },
  { id: "circle", title: "Implicit circle", expected: "x² + y² = 4: one closed radius-2 contour.", method: "Check sampled contour residual and all four quadrants.", automated: true, workspace: "Graphs" },
  { id: "lemniscate", title: "Gerono lemniscate", expected: "Two lobes meeting at the origin for x = sin(t), y = sin(t)cos(t).", method: "Check sampled parameter points and both lobes.", automated: true, workspace: "Graphs" },
  { id: "cusp", title: "Semicubical cusp", expected: "x = t², y = t³: y² = x³ and x ≥ 0.", method: "Check sampled equation residual and both sides of the cusp.", automated: true, workspace: "Graphs" },
  { id: "reciprocal", title: "Reciprocal asymptote", expected: "y = 1/x has two branches and no segment crossing x = 0.", method: "Check undefined diagnostic and sampled branch separation.", automated: true, workspace: "Graphs" },
  { id: "area", title: "Area under y = x", expected: "Signed area on [0, 1] is 1/2.", method: "Run Graphs' numerical integral and compare to 0.5.", automated: true, workspace: "Graphs" },
  { id: "revolution", title: "Cone by revolution", expected: "Revolving y = x on [0, 1] about x gives volume π/3.", method: "Open the revolution workflow; compare geometry and a computed volume when available.", automated: false, workspace: "Surface / Projects" },
  { id: "surface-section", title: "Paraboloid section", expected: "z = 5 − x² − y² at z = 1 has radius 2; z > 5 has no section.", method: "Inspect the Surface slice and its 2D inset; saved Graph handoff remains planned.", automated: false, workspace: "Surface" },
  { id: "rotational-field", title: "Rotational vector field", expected: "F = (−y, x, 0): F(1,0,0) = (0,1,0), divergence 0, z-curl 2.", method: "Inspect glyph direction and numerical diagnostics in Field Explorer.", automated: false, workspace: "Field Explorer" },
  { id: "mesh-curvature", title: "Plane, sphere, invalid mesh", expected: "Plane interior curvature 0; sphere curvature follows radius/sign convention; invalid triangles are diagnosed.", method: "Inspect Mesh analysis and backend provenance; native worker validation is scoped separately.", automated: false, workspace: "Mesh" },
];

const domain = (min: number, max: number) => ({ min, max, includeMin: true, includeMax: true });
const style = { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true };
type Recipe = { title: string; action: Graph2DAuthoringAction; view: [number, number, number, number]; category: Graph2DPreset["category"] };
const recipes: Partial<Record<BenchmarkId, Recipe>> = {
  sinc: { title: "Benchmark: sin(x)/x", action: { type: "create", draft: { label: "sin(x)/x", expression: "sin(x)/x", domain: domain(-10, 10), style } }, view: [-10, 10, -1.5, 1.5], category: "Trigonometry" },
  circle: { title: "Benchmark: radius-2 circle", action: { type: "create-implicit", draft: { label: "x² + y² = 4", expression: "x^2+y^2-4", domain: domain(-2.5, 2.5), yDomain: domain(-2.5, 2.5), style } }, view: [-2.5, 2.5, -2.5, 2.5], category: "Implicit and regions" },
  lemniscate: { title: "Benchmark: Gerono lemniscate", action: { type: "create-parametric", draft: { label: "Gerono lemniscate", xExpression: "sin(t)", yExpression: "sin(t)*cos(t)", domain: domain(0, 2 * Math.PI), style } }, view: [-1.25, 1.25, -.75, .75], category: "Parametric" },
  cusp: { title: "Benchmark: semicubical cusp", action: { type: "create-parametric", draft: { label: "Semicubical cusp", xExpression: "t^2", yExpression: "t^3", domain: domain(-1, 1), style } }, view: [-.15, 1.15, -1.15, 1.15], category: "Parametric" },
  reciprocal: { title: "Benchmark: reciprocal asymptote", action: { type: "create", draft: { label: "1/x", expression: "1/x", domain: domain(-4, 4), style } }, view: [-4, 4, -4, 4], category: "Algebra" },
  area: { title: "Benchmark: area under y = x", action: { type: "create", draft: { label: "y = x", expression: "x", domain: domain(0, 1), style } }, view: [-.2, 1.2, -.2, 1.2], category: "Calculus" },
};
const cache = new Map<BenchmarkId, Graph2DPreset>();
export function benchmarkPreset(id: BenchmarkId): Graph2DPreset | null {
  const recipe = recipes[id];
  if (!recipe) return null;
  const existing = cache.get(id);
  if (existing) return existing;
  let document = createGraph2DDocument({ stableKey: ["benchmark", id], source: { objects: [], variables: [], assumptions: [] } });
  document = createGraph2DDocument({ ...applyGraph2DAuthoring(document, recipe.action), stableKey: ["benchmark", id], title: recipe.title });
  document = createGraph2DDocument({ ...document, stableKey: ["benchmark", id], title: recipe.title,
    display: { ...document.display, viewport: { xMin: recipe.view[0], xMax: recipe.view[1], yMin: recipe.view[2], yMax: recipe.view[3], aspect: "equal" },
      sampling: { maxSamples: 4000, maxDepth: 12, tolerancePx: .75 } } });
  const preset = createGraph2DPreset({ id: `benchmark-${id}`, version: 1, title: recipe.title,
    description: scientificBenchmarks.find(item => item.id === id)!.expected, category: recipe.category,
    tags: ["scientific", "benchmark"], difficulty: "intermediate", learningGoals: ["Compare the plotted result with its analytical oracle."],
    featuredOrder: null, costClass: "starter", template: document, sidecars: [],
    attribution: { author: "Math3D", source: "Original canonical mathematical example", license: "GPL-3.0-or-later" } });
  cache.set(id, preset);
  return preset;
}

export function runScientificBenchmark(id: BenchmarkId): BenchmarkResult {
  const preset = benchmarkPreset(id);
  if (!preset) return { status: "fail", detail: "This case requires guided verification in its workspace." };
  const document = preset.template;
  if (id === "area") {
    const result = analyzeGraph2DIntegral({ document, objectId: document.source.objects[0]!.id,
      interval: { min: 0, max: 1 }, mode: "signed", tolerance: 1e-6 });
    const pass = result.status === "complete" && result.value !== null && Math.abs(result.value - .5) <= 1e-5;
    return { status: pass ? "pass" : "fail", detail: `Integral ${result.value ?? "incomplete"}; expected 0.5 ± 0.00001 (${result.evaluations} evaluations).` };
  }
  const artifact = sampleGraph2DScene({ document, viewport: document.display.viewport, width: 800, height: 600,
    interaction: false, deterministic: true })[0]?.artifact;
  if (!artifact) return { status: "fail", detail: "No sampled artifact was produced." };
  const segments = artifact.segments;
  const points = segments.flatMap(segment => segment.points);
  const bothSigns = (values: number[], threshold = .01) => values.some(x => x < -threshold) && values.some(x => x > threshold);
  let pass = artifact.converged && points.length > 20;
  let check = "";
  if (id === "sinc") {
    pass &&= segments.length >= 2 && segments.every(s => s.points[0]!.x * s.points.at(-1)!.x >= 0) &&
      artifact.diagnostics.some(d => d.code === "invalid-sample") &&
      [-2, -1, 1, 2].every(n => points.some(p => Math.abs(p.x - n * Math.PI) < .08 && Math.abs(p.y) < .04));
    check = "two separated branches, undefined origin, zeros near ±π and ±2π";
  } else if (id === "circle") {
    const first = segments[0]?.points[0], last = segments[0]?.points.at(-1);
    pass &&= segments.length === 1 && !!first && !!last && Math.hypot(first.x - last.x, first.y - last.y) < .08 &&
      points.every(p => Math.abs(p.x * p.x + p.y * p.y - 4) < .08) &&
      bothSigns(points.map(p => p.x), 1.8) && bothSigns(points.map(p => p.y), 1.8);
    check = "one closed contour; radius-2 residual < 0.08 in all quadrants";
  } else if (id === "lemniscate") {
    pass &&= bothSigns(points.map(p => p.x), .8) && bothSigns(points.map(p => p.y), .3) &&
      points.every(p => p.parameter !== undefined && Math.abs(p.x - Math.sin(p.parameter)) < .02 &&
        Math.abs(p.y - Math.sin(p.parameter) * Math.cos(p.parameter)) < .02);
    check = "both lobes and parametric residual < 0.02";
  } else if (id === "cusp") {
    pass &&= bothSigns(points.map(p => p.y), .5) && points.some(p => p.x < .001) &&
      points.every(p => p.x >= -1e-8 && Math.abs(p.y * p.y - p.x ** 3) < .02);
    check = "both cusp arms and y² = x³ residual < 0.02";
  } else if (id === "reciprocal") {
    pass &&= segments.length >= 2 && segments.every(s => s.points[0]!.x * s.points.at(-1)!.x >= 0) &&
      artifact.diagnostics.some(d => d.code === "invalid-sample");
    check = "separate branches and undefined origin";
  }
  return { status: pass ? "pass" : "fail",
    detail: `${check}; ${points.length} points, ${segments.length} segments, ${artifact.samplesEvaluated} evaluations${artifact.converged ? "" : "; sampling incomplete"}.` };
}
