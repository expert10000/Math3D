import { describe, expect, it } from "vitest";
import { createSurfaceDocument, evaluateGraph2DPromotionGeometry, instantiateMath3DProjectTemplate, type SurfaceDocument } from "@math3d/core";
import { surfaceDocumentBinding } from "./surfaceDocumentBinding";
import { sourceFromSurfaceFormulaFields, surfaceFormulaFields } from "../projects/surfaceFormulaFields";

describe("captured Graph Surface binding", () => {
  const saved = instantiateMath3DProjectTemplate("catenary-study", "native-binding").workspace.entries.find(entry => entry.module === "surface")!.checkpoint as SurfaceDocument;
  it("has the Catenoid's unit neck and cosh profile, independently of the sampler", () => {
    const binding = surfaceDocumentBinding(saved)!;
    expect(binding.point(0, 0)).toEqual([0, 1, 0]);
    expect(binding.point(1, 0)[1]).toBeCloseTo(Math.cosh(1), 12);
    const quarter = binding.point(0, 0.25);
    expect(quarter[1]).toBeCloseTo(0, 12); expect(quarter[2]).toBeCloseTo(1, 12);
  });
  for (const axis of ["x", "y"]) for (const orientation of ["positive", "negative"]) for (const full of [true, false]) {
    it(`matches saved samples and normals for ${axis}/${orientation}/${full ? "full" : "partial"} turn`, () => {
      const fields = Object.fromEntries(surfaceFormulaFields(saved).map(field => [field.id, field.value]));
      const source = sourceFromSurfaceFormulaFields(saved, { ...fields, axis, orientation, angleMin: "0.3", angleMax: String(0.3 + (full ? 2 * Math.PI : Math.PI)) });
      const document = createSurfaceDocument({ source, stableKey: `binding-${axis}-${orientation}-${full}` });
      const binding = surfaceDocumentBinding(document)!, geometry = evaluateGraph2DPromotionGeometry(document);
      expect(binding.generation).toBe(document.identity); expect(binding.wrapU).toBe(false); expect(binding.wrapV).toBe(full);
      for (const i of [0, 17, 64, 128]) for (const j of [0, 13, 48]) {
        const u = binding.domain.uMin + (binding.domain.uMax - binding.domain.uMin) * i / 128;
        const base = (i * 49 + j) * 3;
        expect(binding.point(u, j / 48)).toEqual(geometry.positions.slice(base, base + 3));
      }
      const du = binding.point(0.5001, 0.5).map((value, axis) => value - binding.point(0.5, 0.5)[axis]!);
      const dv = binding.point(0.5, 0.5001).map((value, axis) => value - binding.point(0.5, 0.5)[axis]!);
      expect(Math.hypot(du[1]! * dv[2]! - du[2]! * dv[1]!, du[2]! * dv[0]! - du[0]! * dv[2]!, du[0]! * dv[1]! - du[1]! * dv[0]!)).toBeGreaterThan(0);
      expect(document.source.definition.sourceIds).toEqual(saved.source.definition.sourceIds);
    });
  }
  it("evaluates captured variables and excluded endpoints without modifying the source", () => {
    const source = structuredClone(saved.source) as any;
    source.parameters.parameter = "x"; source.parameters.variables = { a: 2 }; source.definition.expressions = { x: "a*(exp(x/a)+exp(-x/a))/2", y: "x" };
    source.domain.profile.includeMin = false; source.domain.profile.includeMax = false;
    const document = createSurfaceDocument({ source, stableKey: "captured-variables" }), before = JSON.stringify(document);
    const binding = surfaceDocumentBinding(document)!;
    const geometry = evaluateGraph2DPromotionGeometry(document);
    expect(binding.point(binding.domain.uMin, 0)).toEqual(geometry.positions.slice(0, 3));
    expect(binding.point(0, 0)[0]).toBe(2); expect(JSON.stringify(document)).toBe(before);
  });
});
