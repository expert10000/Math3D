import { describe, expect, it } from "vitest";
import { getGeometryExactCurvePreset } from "./exactCurveAnalysis";
import { getGeometryExactSurfacePreset } from "./exactSurfaceAnalysis";
import { analyzeCanonicalMeasurements, formatGeometryMeasurement } from "./canonicalMeasurements";

describe("canonical Geometry measurements", () => {
  it("registers exact sphere quantities with dimensional units", () => {
    const report = analyzeCanonicalMeasurements({ sourceId: "sphere-1", surface: getGeometryExactSurfacePreset("sphere"), curve: getGeometryExactCurvePreset("circle"), pointA: [0, 0, 0], pointB: [1, 0, 0], directionA: [1, 0, 0], directionB: [0, 1, 0], timestamp: "2026-01-01T00:00:00.000Z" });
    expect(report.measurements.find((entry) => entry.quantity === "area")).toMatchObject({ value: 4 * Math.PI, unit: "scene-unit²", method: "exact-analytic" });
    expect(report.measurements.find((entry) => entry.quantity === "volume")?.value).toBeCloseTo(4 * Math.PI / 3);
    expect(report.measurements.find((entry) => entry.quantity === "point-distance")?.value).toBe(1);
    expect(report.measurements.find((entry) => entry.quantity === "angle")?.value).toBeCloseTo(Math.PI / 2);
    expect(report.measurements.find((entry) => entry.quantity === "curve-length")?.value).toBeCloseTo(2 * Math.PI);
  });
  it("creates stable identities for all six section modes", () => {
    const report = analyzeCanonicalMeasurements({ sourceId: "torus", surface: getGeometryExactSurfacePreset("torus"), sectionParameter: 0.25 });
    expect(report.sections.map((entry) => entry.kind)).toEqual(["plane", "axis", "normal", "parameter", "iso-u", "iso-v"]);
    expect(new Set(report.sections.map((entry) => entry.id)).size).toBe(6);
    expect(report.sections.every((entry) => entry.id.includes(":0.250000"))).toBe(true);
  });
  it("labels sampled fallback and preserves report provenance", () => {
    const report = analyzeCanonicalMeasurements({ sourceId: "saddle", surface: getGeometryExactSurfacePreset("saddle"), notation: "engineering", absoluteTolerance: 1e-8, relativeTolerance: 1e-5 });
    expect(report.measurements.find((entry) => entry.quantity === "area")?.method).toBe("numerical-parametric");
    expect(report).toMatchObject({ source: { id: "saddle", revision: 1 }, precision: { notation: "engineering", absoluteTolerance: 1e-8, relativeTolerance: 1e-5 }, engine: "Geometry canonical measurement core" });
  });
  it("formats fixed, scientific and engineering notation", () => {
    expect(formatGeometryMeasurement(1234, 3, "fixed")).toBe("1234.000");
    expect(formatGeometryMeasurement(1234, 3, "scientific")).toBe("1.23e+3");
    expect(formatGeometryMeasurement(1234, 3, "engineering")).toBe("1.23e+3");
  });
});
