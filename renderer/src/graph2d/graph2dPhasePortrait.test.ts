import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  inspectGraph2DCompatibility, normalizeGraph2DDocument, sampleGraph2DPhasePortrait,
  sampleGraph2DScene, projectGraph2DPublicationGeometry, selectionForGraph2DObject,
  type Graph2DPhasePortraitDraft } from "@math3d/core";

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

describe("GRA-11.3 planar phase portraits", () => {
  it("returns to the unit circle for x′=y, y′=-x in both time directions", () => {
    const result = solve();
    expect(result.fieldSegments.length).toBeGreaterThan(50);
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

  it("publishes orbit curves, arrowheads, and saved initial-point markers", () => {
    const document = create();
    const size = { width: 640, height: 640 };
    const series = sampleGraph2DScene({ document, viewport, ...size, interaction: false });
    const geometry = projectGraph2DPublicationGeometry(document, series, size);
    const colored = geometry.primitives.filter(item => "color" in item && item.color === style.color);
    expect(colored.filter(item => item.kind === "line").length).toBeGreaterThan(50);
    expect(colored.filter(item => item.kind === "circle").length).toBe(1);
    expect(geometry.omitted).toBe(0);
  });
});
