import { describe, expect, it } from "vitest";
import { analyzeGraph2DPolarMeasurement, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, isGraph2DPolarMeasurementCurrent, type Graph2DDomain } from "@math3d/core";

const domain = (min: number, max: number, includeMin = true, includeMax = true): Graph2DDomain =>
  ({ min, max, includeMin, includeMax });
const documentFor = (expression: string, sourceDomain: Graph2DDomain) => {
  const stableKey = `polar-measure:${expression}:${sourceDomain.min}:${sourceDomain.max}`;
  const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument(stableKey), { type: "create-polar", draft: {
    label: "r", rExpression: expression, domain: sourceDomain,
    style: { color: "#7c3aed", lineWidth: 2, lineStyle: "solid", visible: true } } });
  return createGraph2DDocument({ source: scene.source, display: scene.display, stableKey });
};
const measure = (expression: string, sourceDomain: Graph2DDomain, kind: "swept-area" | "arc-length",
  interval = { min: sourceDomain.min, max: sourceDomain.max }, options: { maxEvaluations?: number; signal?: AbortSignal } = {}) =>
  analyzeGraph2DPolarMeasurement({ document: documentFor(expression, sourceDomain), objectId: "polar_1",
    kind, interval, ...options });

describe("Graph2D polar measurements", () => {
  it("measures the circle once and reports traversal multiplicity", () => {
    const sourceDomain = domain(0, 2 * Math.PI);
    const document = documentFor("2*cos(theta)", sourceDomain);
    const once = { min: 0, max: Math.PI };
    const area = analyzeGraph2DPolarMeasurement({ document, objectId: "polar_1", kind: "swept-area", interval: once });
    const length = analyzeGraph2DPolarMeasurement({ document, objectId: "polar_1", kind: "arc-length", interval: once });
    expect(area.status).toBe("complete");
    expect(area.value).toBeCloseTo(Math.PI, 6);
    expect(length.value).toBeCloseTo(2 * Math.PI, 6);
    expect(length.method).toBe("symbolic-slope");
    expect(area.publication.warnings).toContain("Swept area counts repeated traversal; it is not geometric union area.");
    expect(area.publication.provenance.operation.parameters.angleUnit).toBe("radian");
    expect(area.publication.provenance.source.structuralHash).toBe(document.identity.structuralHash);
    expect(isGraph2DPolarMeasurementCurrent(area, document)).toBe(true);
    expect(measure("2*cos(theta)", sourceDomain, "swept-area").value).toBeCloseTo(2 * Math.PI, 6);
    expect(measure("2*cos(theta)", sourceDomain, "arc-length").value).toBeCloseTo(4 * Math.PI, 6);
  });

  it("keeps signed radius and pole crossings valid", () => {
    const turn = domain(0, 2 * Math.PI);
    expect(measure("-2", turn, "swept-area").value).toBeCloseTo(4 * Math.PI, 6);
    expect(measure("-2", turn, "arc-length").value).toBeCloseTo(4 * Math.PI, 6);
    const crossing = domain(-1, 1);
    expect(measure("theta", crossing, "swept-area").value).toBeCloseTo(1 / 3, 6);
    expect(measure("theta", crossing, "arc-length").value).toBeCloseTo(Math.SQRT2 + Math.asinh(1), 6);
  });

  it("withholds a full result for singularities, open endpoints, limited work and cancellation", () => {
    const sourceDomain = domain(-1, 1);
    for (const kind of ["swept-area", "arc-length"] as const) {
      const singular = measure("1/theta", sourceDomain, kind);
      expect(singular.value).toBeNull();
      expect(singular.unresolvedCells).toBeGreaterThan(0);
      expect(singular.errorEstimate).toBeNull();
      expect(measure("1", domain(0, 1, false, false), kind).status).toBe("incomplete");
      const limited = measure("1", sourceDomain, kind, undefined, { maxEvaluations: 20 });
      expect(limited.value).toBeNull();
      expect(limited.evaluations).toBeLessThanOrEqual(20);
      const controller = new AbortController(); controller.abort();
      const cancelled = measure("1", sourceDomain, kind, undefined, { signal: controller.signal });
      expect(cancelled.cancelled).toBe(true);
      expect(cancelled.value).toBeNull();
    }
  });

  it("uses bounded finite differences when symbolic differentiation is unavailable", () => {
    const result = measure("abs(theta)+1", domain(-1, 1), "arc-length");
    expect(result.method).toBe("finite-difference-slope");
    expect(result.status).toBe("incomplete");
  });

  it("tracks exact source generation without staling on selection changes", () => {
    const sourceDomain = domain(0, Math.PI);
    const document = documentFor("2*cos(theta)", sourceDomain);
    const result = analyzeGraph2DPolarMeasurement({ document, objectId: "polar_1", kind: "swept-area",
      interval: { min: 0, max: Math.PI } });
    expect(isGraph2DPolarMeasurementCurrent(result, { ...document,
      selection: { objectId: "polar_1", probe: null } })).toBe(true);
    const edited = applyGraph2DAuthoring(document, { type: "edit-polar", objectId: "polar_1", draft: {
      label: "r", rExpression: "3*cos(theta)", domain: sourceDomain,
      style: { color: "#7c3aed", lineWidth: 2, lineStyle: "solid", visible: true } } });
    const changed = createGraph2DDocument({ stableKey: `polar-measure:2*cos(theta):${sourceDomain.min}:${sourceDomain.max}`,
      source: edited.source, display: edited.display });
    expect(isGraph2DPolarMeasurementCurrent(result, changed)).toBe(false);
  });

  it("rejects invalid angular bounds and tolerances", () => {
    const document = documentFor("1", domain(0, Math.PI));
    for (const interval of [{ min: -1, max: 1 }, { min: 1, max: 0 }, { min: 0, max: Math.PI + 1 }])
      expect(() => analyzeGraph2DPolarMeasurement({ document, objectId: "polar_1", kind: "swept-area", interval })).toThrow();
    expect(() => analyzeGraph2DPolarMeasurement({ document, objectId: "polar_1", kind: "arc-length",
      interval: { min: 0, max: 1 }, tolerance: 0 })).toThrow();
  });
});
