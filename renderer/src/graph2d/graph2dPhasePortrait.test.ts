import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  inspectGraph2DCompatibility, normalizeGraph2DDocument, sampleGraph2DPhasePortrait,
  sampleGraph2DScene, projectGraph2DPublicationGeometry, selectionForGraph2DObject,
  graph2DPhaseSeedAtScreen, graph2DPhaseSeedAction, graph2DPhaseSeedRemovalAction, previewGraph2DPhaseSeed, graph2DWorldToScreen,
  type Graph2DPhasePortraitDraft } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";

const bounds = { min: -4, max: 4, includeMin: true, includeMax: true };
const style = { color: "#7c3aed", lineWidth: 2, lineStyle: "solid" as const, visible: true };
const draft = (xDerivative = "y", yDerivative = "-x"): Graph2DPhasePortraitDraft => ({
  label: "phase", xDerivative, yDerivative, domain: bounds, yDomain: bounds,
  timeSpan: 2 * Math.PI, seeds: [{ x: 1, y: 0 }], style,
});
const create = (source = draft()) => createGraph2DDocument({
  ...applyGraph2DAuthoring(createEmptyGraph2DDocument("phase"), { type: "create-phase-portrait", draft: source }),
  stableKey: "phase",
});
const viewport = { xMin: -4, xMax: 4, yMin: -4, yMax: 4, aspect: "free" as const };
const solve = (document = create(), maxSamples = 12000) => {
  const object = document.source.objects[0]!;
  if (object.kind !== "phase-portrait") throw new Error("Expected phase portrait.");
  return sampleGraph2DPhasePortrait({ object, variables: {}, viewport, width: 640, height: 640, maxSamples });
};

describe("GRA-11.6 interactive initial points", () => {
  it("places inside the authored domain and clamps a drag to its boundary", () => {
    const document = create();
    const size = { width: 640, height: 640 };
    const screen = graph2DWorldToScreen(viewport, size, { x: 2, y: -1 });
    expect(graph2DPhaseSeedAtScreen(document, "phase_portrait_1", viewport, size, screen, "place"))
      .toEqual({ x: 2, y: -1 });
    const outside = graph2DWorldToScreen(viewport, size, { x: 5, y: -5 });
    expect(graph2DPhaseSeedAtScreen(document, "phase_portrait_1", viewport, size, outside, "place")).toBeNull();
    expect(graph2DPhaseSeedAtScreen(document, "phase_portrait_1", viewport, size, outside, "drag"))
      .toEqual({ x: 4, y: -4 });
    expect(graph2DPhaseSeedAtScreen(document, "phase_portrait_1", { ...viewport, xScale: "log10" }, size,
      screen, "drag")).toBeNull();
  });

  it("previews changed trajectories without mutating the source, then commits one undo step", () => {
    const adapter = new Graph2DCommandAdapter(create());
    const original = adapter.document();
    const moved = { x: 0, y: 2 };
    const preview = previewGraph2DPhaseSeed(original, "phase_portrait_1", 0, moved);
    expect(preview.identity.structuralHash).not.toBe(original.identity.structuralHash);
    expect(preview.identity.revision).toBe(original.identity.revision);
    expect(original.source.objects[0]?.kind === "phase-portrait" && original.source.objects[0].seeds[0])
      .toEqual({ x: 1, y: 0 });
    const orbit = sampleGraph2DScene({ document: preview, viewport, width: 640, height: 640, interaction: true })[0]!.artifact;
    expect("kind" in orbit && orbit.kind === "phase-portrait" && orbit.orbits[0]?.seed).toEqual(moved);
    adapter.commitScene(applyGraph2DAuthoring(original,
      graph2DPhaseSeedAction(original, "phase_portrait_1", 0, moved)), "edit-phase-portrait");
    expect(adapter.history().undoDepth).toBe(1);
    expect(adapter.document().source.objects[0]?.kind === "phase-portrait" &&
      adapter.document().source.objects[0].seeds[0]).toEqual(moved);
    adapter.undo();
    expect(adapter.document().source.objects[0]?.kind === "phase-portrait" &&
      adapter.document().source.objects[0].seeds[0]).toEqual({ x: 1, y: 0 });
  });

  it("adds at most eight initial points and leaves other source fields intact", () => {
    const document = create();
    const first = graph2DPhaseSeedAction(document, "phase_portrait_1", null, { x: -1, y: 2 });
    const next = createGraph2DDocument({ ...applyGraph2DAuthoring(document, first), stableKey: "phase" });
    const source = next.source.objects[0];
    expect(source?.kind === "phase-portrait" && source.seeds).toHaveLength(2);
    expect(source?.kind === "phase-portrait" && source.xDerivative.source).toBe("y");
    const full = create({ ...draft(), seeds: Array.from({ length: 8 }, (_, index) => ({ x: index / 4, y: 0 })) });
    expect(() => graph2DPhaseSeedAction(full, "phase_portrait_1", null, { x: 0, y: 0 }))
      .toThrow(/at most eight/);
  });

  it("removes and clears seeds in one undoable edit while retaining the system", () => {
    const adapter = new Graph2DCommandAdapter(create({ ...draft(), seeds: [{ x: 1, y: 0 }, { x: 0, y: 2 }] }));
    const original = adapter.document();
    adapter.commitScene(applyGraph2DAuthoring(original,
      graph2DPhaseSeedRemovalAction(original, "phase_portrait_1", 0)), "edit-phase-portrait");
    expect(adapter.document().source.objects[0]?.kind === "phase-portrait" &&
      adapter.document().source.objects[0].seeds).toEqual([{ x: 0, y: 2 }]);
    adapter.undo();
    expect(adapter.document().source).toEqual(original.source);
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(),
      graph2DPhaseSeedRemovalAction(adapter.document(), "phase_portrait_1", null)), "edit-phase-portrait");
    const cleared = adapter.document();
    const object = cleared.source.objects[0];
    expect(object?.kind === "phase-portrait" && object.seeds).toEqual([]);
    expect(object?.kind === "phase-portrait" && object.xDerivative.source).toBe("y");
    expect(normalizeGraph2DDocument(cleared).ok).toBe(true);
    expect(solve(cleared).orbits).toHaveLength(0);
    adapter.undo();
    expect(adapter.document().source).toEqual(original.source);
    expect(() => graph2DPhaseSeedRemovalAction(original, "phase_portrait_1", 4)).toThrow(/unavailable/);
  });
});
describe("GRA-11.3 planar phase portraits", () => {
  it("returns to the unit circle for x′=y, y′=-x in both time directions", () => {
    const result = solve();
    expect(result.fieldSegments.length).toBeGreaterThan(50);
    expect(result.nullclines.x.length).toBeGreaterThan(0);
    expect(result.nullclines.y.length).toBeGreaterThan(0);
    expect(result.analysis.status).toBe("complete");
    expect(result.equilibria).toHaveLength(1);
    expect(Math.hypot(result.equilibria[0]!.x, result.equilibria[0]!.y)).toBeLessThan(1e-6);
    expect(result.equilibria[0]!.residual).toBeLessThan(1e-7);
    expect(result.equilibria[0]!.linearization).toMatchObject({ kind: "linear-center", status: "inconclusive",
      stability: "undetermined", trace: 0, determinant: 1 });
    expect(result.equilibria[0]!.linearization.eigenvalues?.[0].imaginary).toBeCloseTo(1, 5);
    expect(result.orbits[0]).toMatchObject({ backward: "time-horizon", forward: "time-horizon" });
    expect(result.converged).toBe(true);
    const points = result.segments[0]!.points;
    expect(points.length).toBeGreaterThan(30);
    for (const point of points) expect(Math.abs(Math.hypot(point.x, point.y) - 1)).toBeLessThan(3e-5);
    expect(Math.hypot(points[0]!.x - 1, points[0]!.y)).toBeLessThan(3e-5);
    expect(Math.hypot(points.at(-1)!.x - 1, points.at(-1)!.y)).toBeLessThan(3e-5);
  });

  it("handles a saddle, equilibrium, and domain exits with explicit stop reasons", () => {
    const saddle = solve(create({ ...draft("x", "-y"), timeSpan: 2, seeds: [{ x: 1, y: 1 }, { x: 0, y: 0 }] }));
    expect(saddle.orbits[0]?.forward).toBe("domain-boundary");
    expect(saddle.orbits[1]).toMatchObject({ backward: "equilibrium", forward: "equilibrium" });
    expect(saddle.segments[0]!.points.some(point => Math.abs(point.x * point.y - 1) < 1e-4)).toBe(true);
    expect(saddle.orbits).toHaveLength(2);
    expect(saddle.equilibria[0]?.linearization).toMatchObject({ kind: "saddle", status: "classified", stability: "unstable" });
  });

  it("resolves three isolated equilibria in a cubic bistable system", () => {
    const result = solve(create({ ...draft("x-x^3", "-y"), timeSpan: 2,
      seeds: [{ x: 0.5, y: 1 }] }));
    expect(result.analysis.status).toBe("complete");
    expect(result.equilibria).toHaveLength(3);
    const xs = result.equilibria.map(point => point.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-1, 5);
    expect(xs[1]).toBeCloseTo(0, 5);
    expect(xs[2]).toBeCloseTo(1, 5);
    expect(result.equilibria.every(point => Math.abs(point.y) < 1e-6 && point.residual < 1e-7)).toBe(true);
    const ordered = result.equilibria.slice().sort((a, b) => a.x - b.x);
    expect(ordered.map(point => point.linearization.kind))
      .toEqual(["stable-node", "saddle", "stable-node"]);
    expect(ordered[0]!.linearization.jacobian?.[0]).toBeCloseTo(-2, 4);
    expect(ordered[1]!.linearization.jacobian?.[0]).toBeCloseTo(1, 4);
    expect(ordered[2]!.linearization.jacobian?.[3]).toBeCloseTo(-1, 4);
  });

  it("distinguishes stable and unstable spirals, and labels a nonhyperbolic point inconclusive", () => {
    const sink = solve(create({ ...draft("-x-y", "x-y"), timeSpan: 2 }));
    expect(sink.equilibria[0]?.linearization).toMatchObject({ kind: "stable-spiral", stability: "stable" });
    const source = solve(create({ ...draft("x-y", "x+y"), timeSpan: 1 }));
    expect(source.equilibria[0]?.linearization).toMatchObject({ kind: "unstable-spiral", stability: "unstable" });
    const degenerate = solve(create({ ...draft("-x^3", "-y"), timeSpan: 1 }));
    expect(degenerate.equilibria[0]?.linearization).toMatchObject({ kind: "nonhyperbolic",
      status: "inconclusive", stability: "undetermined" });
    const corner = solve(create({ ...draft("abs(x)+y", "-y"), timeSpan: 1 }));
    expect(corner.equilibria[0]?.linearization).toMatchObject({ kind: "unresolved",
      status: "inconclusive", stability: "undetermined" });
    const stiff = solve(create({ ...draft("-1000000000*x", "-y"), timeSpan: 1, seeds: [{ x: 0, y: 0 }] }));
    expect(stiff.equilibria).toHaveLength(1);
    expect(stiff.equilibria[0]!.linearization.kind).toBe("unresolved");
    expect([sink, source, degenerate].every(result => result.samplesEvaluated <= 12000)).toBe(true);
  });

  it("labels a singular initial field and refuses logarithmic axes", () => {
    const singular = solve(create({ ...draft("1/(x-1)", "0"), seeds: [{ x: 1, y: 0 }] }));
    expect(singular.orbits[0]).toMatchObject({ backward: "singular", forward: "singular" });
    expect(singular.converged).toBe(false);
    const document = create();
    const object = document.source.objects[0];
    if (object?.kind !== "phase-portrait") throw new Error("Expected phase portrait.");
    const log = sampleGraph2DPhasePortrait({ object, variables: {},
      viewport: { ...viewport, xScale: "log10" }, width: 640, height: 640, maxSamples: 12000 });
    expect(log.diagnostics).toContainEqual({ code: "unsupported-scale", count: 1 });
    expect(log.segments).toHaveLength(0);
  });

  it("keeps finite work limits, rejects invalid seeds, and persists a non-probeable source", () => {
    const document = create();
    expect(document.requiredCapabilities).toContain("graph2d.phase-portrait.v1");
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
    expect(normalizeGraph2DDocument(document).ok).toBe(true);
    expect(normalizeGraph2DDocument({ ...document, selection: { objectId: "phase_portrait_1",
      probe: { objectId: "phase_portrait_1", x: 1, y: 0 } } }).ok).toBe(false);
    expect(() => create({ ...draft(), seeds: [{ x: 5, y: 0 }] })).toThrow(/initial point/i);
    const limited = solve(document, 64);
    expect(limited.samplesEvaluated).toBeLessThanOrEqual(64);
    expect(limited.converged).toBe(false);
    const sampled = sampleGraph2DScene({ document, viewport, width: 640, height: 640, interaction: false });
    expect(selectionForGraph2DObject(document, sampled, "phase_portrait_1"))
      .toEqual({ objectId: "phase_portrait_1", probe: null });
  });

  it("publishes orbit curves, arrowheads, nullclines and equilibrium markers", () => {
    const document = create();
    const size = { width: 640, height: 640 };
    const series = sampleGraph2DScene({ document, viewport, ...size, interaction: false });
    const geometry = projectGraph2DPublicationGeometry(document, series, size);
    const colored = geometry.primitives.filter(item => "color" in item && item.color === style.color);
    expect(colored.filter(item => item.kind === "line").length).toBeGreaterThan(50);
    expect(colored.filter(item => item.kind === "circle").length).toBe(1);
    expect(geometry.primitives.some(item => item.kind === "line" && item.color === "#ea580c")).toBe(true);
    expect(geometry.primitives.some(item => item.kind === "line" && item.color === "#0891b2")).toBe(true);
    expect(geometry.primitives.some(item => item.kind === "circle" && item.color === "#111827")).toBe(true);
    expect(geometry.omitted).toBe(0);
  });
});

describe("GRA-14 authored planar field controls", () => {
  it("persists density and units, varies arrow length with speed, and keeps orbit stops", () => {
    const source = create({ ...draft("x+2", "0"), fieldDensity: 20,
      fieldUnits: { x: "m", y: "m", time: "s" }, seeds: [{ x: 1, y: 0 }] });
    const normalized = normalizeGraph2DDocument(JSON.parse(JSON.stringify(source)));
    expect(normalized.ok).toBe(true);
    const object = source.source.objects[0];
    expect(object?.kind === "phase-portrait" && object.fieldUnits).toEqual({ x: "m", y: "m", time: "s" });
    const dense = solve(source);
    const sparse = solve(create({ ...draft("x+2", "0"), fieldDensity: 4 }));
    expect(dense.fieldSegments.length).toBeGreaterThan(sparse.fieldSegments.length);
    expect(dense.fieldMagnitudes).toHaveLength(dense.fieldSegments.length);
    const slow = dense.fieldMagnitudes.findIndex(speed => speed > 0 && speed < 1);
    const fast = dense.fieldMagnitudes.findIndex(speed => speed > 4);
    expect(slow).toBeGreaterThanOrEqual(0);
    expect(fast).toBeGreaterThanOrEqual(0);
    const length = (index: number) => {
      const [a, b] = dense.fieldSegments[index]!.points;
      return Math.hypot(b!.x - a!.x, b!.y - a!.y);
    };
    expect(length(fast)).toBeGreaterThan(length(slow));
    expect(dense.orbits[0]?.forward).toBe("domain-boundary");
    expect(dense.samplesEvaluated).toBeLessThanOrEqual(12000);
    const adapter = new Graph2DCommandAdapter(source);
    adapter.commitScene(applyGraph2DAuthoring(source,
      graph2DPhaseSeedAction(source, "phase_portrait_1", 0, { x: 0, y: 1 })), "edit-phase-portrait");
    const edited = adapter.document().source.objects[0];
    expect(edited?.kind === "phase-portrait" && edited.fieldDensity).toBe(20);
    expect(edited?.kind === "phase-portrait" && edited.fieldUnits?.time).toBe("s");
    adapter.undo();
    expect(adapter.document().source).toEqual(source.source);
  });

  it("accepts legacy phase documents and rejects out-of-range density or malformed units", () => {
    expect(normalizeGraph2DDocument(create()).ok).toBe(true);
    expect(() => create({ ...draft(), fieldDensity: 25 })).toThrow(/density/i);
    expect(() => create({ ...draft(), fieldUnits: { x: " m", y: "m", time: "s" } })).toThrow(/units/i);
  });
});
