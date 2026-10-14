import { describe, expect, it } from "vitest";
import { analyzeGraph2DParametricLocalDifferential, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, evaluateGraph2DParametric, isGraph2DParametricLocalDifferentialCurrent,
  type Graph2DDocument } from "@math3d/core";

const documentFor = (xExpression: string, yExpression: string, parameter: number) => {
  const stableKey = `parametric-differential:${xExpression}:${yExpression}`;
  const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument(stableKey), {
    type: "create-parametric", draft: { label: "p", xExpression, yExpression,
      domain: { min: -2 * Math.PI, max: 2 * Math.PI, includeMin: true, includeMax: true },
      style: { color: "#e11d48", lineWidth: 2, lineStyle: "solid", visible: true } } });
  const object = scene.source.objects.find(entry => entry.kind === "parametric")!;
  const point = evaluateGraph2DParametric(object, {}, parameter);
  return createGraph2DDocument({ source: scene.source, display: scene.display, stableKey,
    selection: { objectId: object.id, probe: point ? { objectId: object.id, x: point.x, y: point.y, parameter } :
      { objectId: object.id, x: 0, y: 0, parameter } } });
};

describe("parametric local differential", () => {
  it("reports orientation and perpendicular overlays for regular circles", () => {
    for (const [yExpression, sign] of [["sin(t)", 1], ["-sin(t)", -1]] as const) {
      for (const parameter of [0, Math.PI / 2, Math.PI]) {
        const document = documentFor("cos(t)", yExpression, parameter);
        const result = analyzeGraph2DParametricLocalDifferential(document)!;
        expect(result.state).toBe("regular");
        expect(result.curvature).toBeCloseTo(sign, 10);
        expect(result.curvatureMethod).toBe("symbolic-rules");
        expect(result.publication.summary.curvatureConvention).toBe("signed-for-increasing-t");
        expect(result.overlays.map(entry => entry.kind)).toEqual(["tangent", "normal"]);
        expect(result.overlays[0]!.direction.x * result.overlays[1]!.direction.x +
          result.overlays[0]!.direction.y * result.overlays[1]!.direction.y).toBeCloseTo(0);
        expect(isGraph2DParametricLocalDifferentialCurrent(result, document)).toBe(true);
      }
    }
  });
  it("uses the authored parameter at vertical tangents and withholds zero-speed geometry", () => {
    const parabola = analyzeGraph2DParametricLocalDifferential(documentFor("t", "t^2", 0))!;
    expect(parabola.curvature).toBeCloseTo(2, 10);
    const vertical = analyzeGraph2DParametricLocalDifferential(documentFor("t^2", "t", 0))!;
    expect(vertical.curvature).toBeCloseTo(-2, 10);
    expect(vertical.overlays[0]?.direction.x).toBe(0);
    const cusp = analyzeGraph2DParametricLocalDifferential(documentFor("t^2", "t^3", 0))!;
    expect(cusp.state).toBe("singular");
    expect(cusp.curvature).toBeNull();
    expect(cusp.overlays).toHaveLength(0);
  });
  it("rejects stale and out-of-domain probes and derivative jumps", () => {
    const document = documentFor("cos(t)", "sin(t)", 1);
    const changed: Graph2DDocument = { ...document, selection: { ...document.selection,
      probe: { ...document.selection.probe!, x: document.selection.probe!.x + 0.1 } } };
    expect(analyzeGraph2DParametricLocalDifferential(changed)?.diagnostics[0]?.code).toBe("stale-probe");
    expect(isGraph2DParametricLocalDifferentialCurrent(analyzeGraph2DParametricLocalDifferential(document)!, changed)).toBe(false);
    const outside = analyzeGraph2DParametricLocalDifferential({ ...document,
      selection: { objectId: document.selection.objectId,
        probe: { objectId: document.selection.objectId!, x: 0, y: 0, parameter: 10 } } })!;
    expect(outside.state).toBe("undefined");
    expect(outside.overlays).toHaveLength(0);
    const jump = analyzeGraph2DParametricLocalDifferential(documentFor("t", "t*abs(t)", 0))!;
    expect(jump.state).toBe("regular");
    expect(jump.curvature).toBeNull();
    expect(jump.overlays).toHaveLength(2);
  });
});
