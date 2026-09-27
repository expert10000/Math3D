import { describe, expect, it } from "vitest";
import { analyzeGraph2DLocalDifferential, applyGraph2DAuthoring, clipGraph2DLineOverlay,
  createEmptyGraph2DDocument, createGraph2DDocument, isGraph2DLocalDifferentialCurrent,
  type Graph2DDocument } from "@math3d/core";

const documentFor = (expression: string, x: number, y: number) => {
  const empty = createEmptyGraph2DDocument("local-differential:" + expression);
  const scene = applyGraph2DAuthoring(empty, { type: "create", draft: { label: "f", expression,
    domain: { min: -10, max: 10, includeMin: true, includeMax: true },
    style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
  return createGraph2DDocument({ source: scene.source, display: scene.display, stableKey: "local-differential:" + expression,
    selection: { objectId: "function_1", probe: { objectId: "function_1", x, y } } });
};

describe("Graph2D local differentials", () => {
  it("publishes perpendicular tangent and normal overlays tied to source and probe", () => {
    const document = documentFor("x^2", 2, 4);
    const analysis = analyzeGraph2DLocalDifferential(document)!;
    expect(analysis.state).toBe("differentiable");
    expect(analysis.slope).toBeCloseTo(4);
    expect(analysis.tangent?.equation).toContain("4(x - (2))");
    expect(analysis.normal?.slope).toBeCloseTo(-0.25);
    expect(analysis.publication.status).toBe("numerical");
    expect(analysis.overlays.map((entry) => entry.kind)).toEqual(["tangent", "normal"]);
    const [tangent, normal] = analysis.overlays;
    expect(tangent!.direction.x * normal!.direction.x + tangent!.direction.y * normal!.direction.y).toBeCloseTo(0);
    expect(tangent?.source.structuralHash).toBe(document.identity.structuralHash);
    expect(tangent?.probeGeneration).toBe(analysis.probeGeneration);
    const segment = clipGraph2DLineOverlay(tangent!, document.display.viewport, { width: 800, height: 600 });
    expect(segment).not.toBeNull();
    for (const point of segment!) expect(point.y).toBeCloseTo(4 + 4 * (point.x - 2), 7);
    expect(isGraph2DLocalDifferentialCurrent(analysis, document)).toBe(true);
    const changedProbe: Graph2DDocument = { ...document,
      selection: { objectId: "function_1", probe: { objectId: "function_1", x: 3, y: 9 } } };
    expect(isGraph2DLocalDifferentialCurrent(analysis, changedProbe)).toBe(false);
    const movedViewport: Graph2DDocument = { ...document, display: { ...document.display,
      viewport: { ...document.display.viewport, xMin: -5, xMax: 15 } } };
    expect(isGraph2DLocalDifferentialCurrent(analysis, movedViewport)).toBe(true);
    const newerSource: Graph2DDocument = { ...document, identity: { ...document.identity,
      revision: document.identity.revision + 1 } };
    expect(isGraph2DLocalDifferentialCurrent(analysis, newerSource)).toBe(false);
    const hiddenDisplay: Graph2DDocument = { ...document, display: { ...document.display,
      objects: [{ ...document.display.objects[0]!, visible: false }] } };
    expect(isGraph2DLocalDifferentialCurrent(analysis, hiddenDisplay)).toBe(false);
  });

  it("uses a vertical normal at a horizontal tangent", () => {
    const document = documentFor("x^2", 0, 0);
    const analysis = analyzeGraph2DLocalDifferential(document)!;
    expect(analysis.slope).toBe(0);
    expect(analysis.normal?.equation).toBe("x = 0");
    const normal = analysis.overlays.find((entry) => entry.kind === "normal")!;
    const segment = clipGraph2DLineOverlay(normal, document.display.viewport, { width: 800, height: 600 });
    expect(segment?.[0].x).toBe(0);
    expect(segment?.[1].x).toBe(0);
  });

  it("withholds overlays at cusps, undefined points, and stale probes", () => {
    const cusp = analyzeGraph2DLocalDifferential(documentFor("abs(x)", 0, 0))!;
    expect(cusp.state).toBe("nondifferentiable");
    expect(cusp.overlays).toHaveLength(0);
    const undefinedPoint = analyzeGraph2DLocalDifferential(documentFor("sqrt(x)", -1, 0))!;
    expect(undefinedPoint.state).toBe("undefined");
    expect(undefinedPoint.overlays).toHaveLength(0);
    const stale = analyzeGraph2DLocalDifferential(documentFor("x^2", 2, 5))!;
    expect(stale.state).toBe("unresolved");
    expect(stale.diagnostics[0]?.code).toBe("stale-probe");
    expect(stale.overlays).toHaveLength(0);
    const visible = documentFor("x^2", 2, 4);
    const hidden: Graph2DDocument = { ...visible, display: { ...visible.display,
      objects: [{ ...visible.display.objects[0]!, visible: false }] } };
    const hiddenAnalysis = analyzeGraph2DLocalDifferential(hidden)!;
    expect(hiddenAnalysis.state).toBe("differentiable");
    expect(hiddenAnalysis.overlays).toHaveLength(0);
  });
});
