import { describe, expect, it } from "vitest";
import { COMPLEX_COMMAND_TYPES } from "@math3d/core";
import corpus from "../../../tests/fixtures/post-1.6.0/mathematical-regressions.json";
import { ComplexFunctionPreviewSession } from "./complexPreviewArtifacts";
import { contourRecordFromPoints, publishComplexNumericalAnalysis } from "./complexNumericalAnalysis";

describe("post-1.6.0 production contour publication oracles", () => {
  it.each(corpus.complex)("checks $id without upgrading numerical authority", (fixture) => {
    const session = new ComplexFunctionPreviewSession({
      inputMode: "fz", fExpr: fixture.expression, reExpr: "u", imExpr: "v",
      uMin: -3, uMax: 3, vMin: -3, vMax: 3, nu: 16, nv: 16,
      mapMode: "standard", sheetCount: 1, sheetIndex: 0, branchCutAngle: Math.PI,
    });
    const points = Array.from({ length: fixture.samples + 1 }, (_, index) => {
      const angle = fixture.winding * 2 * Math.PI * index / fixture.samples;
      return { re: fixture.center[0]! + fixture.radius * Math.cos(angle), im: fixture.center[1]! + fixture.radius * Math.sin(angle) };
    });
    session.commands.commit(COMPLEX_COMMAND_TYPES.setContours, [contourRecordFromPoints(fixture.id, "circle", points)]);
    const document = session.commands.document();
    const result = publishComplexNumericalAnalysis({ document, probe: { re: 3, im: 1 }, now: 1 });
    const contour = result.summary.contour as { integral: { re: number; im: number }; windingAroundOrigin: number };
    expect(Math.abs(contour.integral.re - fixture.expectedIntegral[0]!)).toBeLessThan(fixture.tolerance);
    expect(Math.abs(contour.integral.im - fixture.expectedIntegral[1]!)).toBeLessThan(fixture.tolerance);
    expect(contour.windingAroundOrigin).toBeCloseTo(fixture.id === "pole-outside-offset-contour" ? 0 : fixture.winding, 8);
    expect(result.status).toBe(fixture.status);
    expect(result.summary.evidence).toBe("numerical-not-proof");
    expect(result.provenance.source).toMatchObject({ revision: document.identity.revision, structuralHash: document.identity.structuralHash });
  });
});
