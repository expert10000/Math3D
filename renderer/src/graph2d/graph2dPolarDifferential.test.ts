import { describe, expect, it } from "vitest";
import { analyzeGraph2DPolarLocalDifferential, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, evaluateGraph2DPolar, isGraph2DPolarLocalDifferentialCurrent,
  type Graph2DDocument } from "@math3d/core";

const documentFor = (expression: string, theta: number, domain = { min: 0, max: 2 * Math.PI, includeMin: true, includeMax: true }) => {
  const empty = createEmptyGraph2DDocument("polar-differential:" + expression);
  const scene = applyGraph2DAuthoring(empty, { type: "create-polar", draft: { label: "r", rExpression: expression,
    domain, style: { color: "#7c3aed", lineWidth: 2, lineStyle: "solid", visible: true } } });
  const object = scene.source.objects.find(entry => entry.kind === "polar")!;
  const point = evaluateGraph2DPolar(object, {}, theta);
  return createGraph2DDocument({ source: scene.source, display: scene.display,
    stableKey: "polar-differential:" + expression,
    selection: { objectId: object.id, probe: point ? { objectId: object.id, x: point.x, y: point.y, parameter: theta } :
      { objectId: object.id, x: 0, y: 0, parameter: theta } } });
};

describe("polar local differential", () => {
  it("reports curvature one on the twice traversed 2cos θ circle, including its pole crossing", () => {
    for (const theta of [0, Math.PI / 4, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
      const document = documentFor("2*cos(theta)", theta);
      const result = analyzeGraph2DPolarLocalDifferential(document)!;
      expect(result.state).toBe("regular");
      expect(result.curvature).toBeCloseTo(1, 10);
      expect(result.curvatureMethod).toBe("symbolic-rules");
      expect(result.overlays.map(entry => entry.kind)).toEqual(["tangent", "normal"]);
      expect(result.overlays[0]!.direction.x * result.overlays[1]!.direction.x +
        result.overlays[0]!.direction.y * result.overlays[1]!.direction.y).toBeCloseTo(0);
      expect(result.publication.summary.curvatureConvention).toBe("signed-for-increasing-theta");
      expect(isGraph2DPolarLocalDifferentialCurrent(result, document)).toBe(true);
    }
  });
  it("keeps signed radius and rejects singular, stale, and invalid probes", () => {
    const negative = analyzeGraph2DPolarLocalDifferential(documentFor("-2", 1))!;
    expect(negative.signedRadius).toBe(-2);
    expect(negative.curvature).toBeCloseTo(0.5, 10);
    const zero = analyzeGraph2DPolarLocalDifferential(documentFor("0", 1))!;
    expect(zero.state).toBe("singular");
    expect(zero.curvature).toBeNull();
    expect(zero.overlays).toHaveLength(0);
    const document = documentFor("2*cos(theta)", 1);
    const changed: Graph2DDocument = { ...document, selection: { ...document.selection,
      probe: { ...document.selection.probe!, x: document.selection.probe!.x + 0.1 } } };
    expect(analyzeGraph2DPolarLocalDifferential(changed)?.diagnostics[0]?.code).toBe("stale-probe");
    expect(isGraph2DPolarLocalDifferentialCurrent(analyzeGraph2DPolarLocalDifferential(document)!, changed)).toBe(false);
    const valid = documentFor("1", 1);
    const outside = analyzeGraph2DPolarLocalDifferential({ ...valid,
      selection: { objectId: valid.selection.objectId,
        probe: { objectId: valid.selection.objectId!, x: 0, y: 0, parameter: -1 } } })!;
    expect(outside.state).toBe("undefined");
    expect(outside.overlays).toHaveLength(0);
  });
  it("does not invent curvature across a radius derivative discontinuity", () => {
    const cusp = analyzeGraph2DPolarLocalDifferential(documentFor("abs(theta-1)", 1))!;
    expect(cusp.curvature).toBeNull();
    expect(cusp.overlays).toHaveLength(0);
  });
});
