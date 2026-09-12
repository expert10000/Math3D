import { analyzeCurveDifferentialGeometry, type Curve2D, type Curve3D } from "@math3d/core";
import { describe, expect, it } from "vitest";
import { analyzeCurveDiagnostics, compareCurveDiagnosticReports, curveDiagnosticReportToCsv } from "./diagnostics";
import { adaptCurveDefinition } from "./infrastructure";

const identityFor = (curve: Curve2D | Curve3D) => adaptCurveDefinition({
  id: curve.id,
  revision: 1,
  label: curve.name,
  representation: "parametric",
  dimension: curve.dimension,
  expressions: { x: "fixture", y: "fixture", ...(curve.dimension === 3 ? { z: "fixture" } : {}) },
  domain: { parameter: "t", min: curve.domain.tMin, max: curve.domain.tMax, closed: curve.domain.closed, periodic: curve.domain.periodic },
}).identity;

const reportFor = (curve: Curve2D | Curve3D, parameters: number[], samplingDiagnostics: string[] = []) => analyzeCurveDiagnostics({
  identity: identityFor(curve),
  curve,
  field: analyzeCurveDifferentialGeometry(curve, { parameters, method: "analytic" }),
  samplingDiagnostics,
  breakpoints: curve.domain.breakpoints,
  tolerance: 1e-5,
});

describe("professional Curve diagnostics", () => {
  it("keeps a regular circle at OK status with a typed ready result", () => {
    const circle: Curve2D = {
      id: "circle", name: "Circle", kind: "parametric", dimension: 2,
      domain: { tMin: 0, tMax: Math.PI * 2, closed: true, periodic: true },
      eval: (t) => ({ x: Math.cos(t), y: Math.sin(t) }),
      derivative: (t) => ({ x: -Math.sin(t), y: Math.cos(t) }),
      secondDerivative: (t) => ({ x: -Math.cos(t), y: -Math.sin(t) }),
      thirdDerivative: (t) => ({ x: Math.sin(t), y: -Math.cos(t) }),
    };
    const report = reportFor(circle, [0, 1, 2, 3, 4, 5, Math.PI * 2]);
    expect(report.status).toBe("ok");
    expect(report.entries[0]).toMatchObject({ category: "geometry", severity: "ok", code: "ready", method: "analytic" });
  });

  it("finds an exact sampled figure-eight self-intersection with navigable parameters", () => {
    const figureEight: Curve2D = {
      id: "eight", name: "Figure eight", kind: "parametric", dimension: 2,
      domain: { tMin: -Math.PI / 2, tMax: Math.PI * 1.5 },
      eval: (t) => ({ x: Math.sin(t), y: Math.sin(2 * t) }),
    };
    const report = reportFor(figureEight, [-Math.PI / 2, 0, Math.PI / 2, Math.PI, Math.PI * 1.5]);
    expect(report.intersections.some((entry) => entry.kind === "2d-near" && entry.exact)).toBe(true);
    expect(report.entries.find((entry) => entry.category === "intersection")?.parameterInterval).toEqual([0, Math.PI]);
  });

  it("reports zero speed, duplicate spans, and sampling under-resolution separately", () => {
    const cusp: Curve2D = {
      id: "cusp", name: "Cusp", kind: "parametric", dimension: 2,
      domain: { tMin: -1, tMax: 1 },
      eval: (t) => ({ x: t * t, y: t * t * t }),
      derivative: (t) => ({ x: 2 * t, y: 3 * t * t }),
      secondDerivative: (t) => ({ x: 2, y: 6 * t }),
      thirdDerivative: () => ({ x: 0, y: 6 }),
    };
    const report = reportFor(cusp, [-1, -0.5, 0, 0, 0.5, 1], ["warning: maximum sampling depth reached"]);
    const plateau: Curve2D = { ...cusp, id: "plateau", name: "Plateau", eval: (t) => ({ x: t < 0 ? t : 0, y: 0 }) };
    const plateauReport = reportFor(plateau, [-1, -0.5, 0, 0.5, 1]);
    expect(report.entries.some((entry) => entry.code === "zero-speed" && entry.distinction === "mathematical")).toBe(true);
    expect(plateauReport.entries.some((entry) => entry.code === "duplicate-or-degenerate" && entry.distinction === "tessellation")).toBe(true);
    expect(report.entries.some((entry) => entry.code === "sampling-under-resolution" && entry.category === "sampling")).toBe(true);
  });

  it("classifies C and G continuity at a declared corner and a discontinuity", () => {
    const corner: Curve2D = {
      id: "corner", name: "Corner", kind: "parametric", dimension: 2,
      domain: { tMin: -1, tMax: 1, breakpoints: [0] },
      eval: (t) => ({ x: t, y: Math.abs(t) }),
    };
    const discontinuous: Curve2D = {
      ...corner, id: "jump", name: "Jump",
      eval: (t) => ({ x: t, y: t < 0 ? 0 : 2 }),
    };
    const cornerReport = reportFor(corner, [-1, -0.5, 0, 0.5, 1]);
    const jumpReport = reportFor(discontinuous, [-1, -0.5, 0, 0.5, 1]);
    expect(cornerReport.continuity[0]).toMatchObject({ c0: true, g1: false });
    expect(jumpReport.continuity[0].c0).toBe(false);
    expect(jumpReport.entries.some((entry) => entry.code === "mathematical-discontinuity" && entry.distinction === "mathematical")).toBe(true);
  });

  it("labels sampled 3D proximity as a tolerance candidate and supports compare/export", () => {
    const curve: Curve3D = {
      id: "near3d", name: "Near 3D", kind: "parametric", dimension: 3,
      domain: { tMin: 0, tMax: 3 },
      eval: (t) => t < 1.5 ? ({ x: t, y: 0, z: 0 }) : ({ x: 3 - t, y: 0, z: 1e-6 }),
    };
    const report = reportFor(curve, [0, 0.5, 1, 2, 2.5, 3]);
    expect(report.intersections.some((entry) => entry.kind === "3d-proximity")).toBe(true);
    expect(report.entries.find((entry) => entry.code === "3d-proximity")?.distinction).toBe("tolerance-candidate");
    expect(curveDiagnosticReportToCsv(report)).toContain("suggestedAction");
    expect(compareCurveDiagnosticReports(report, report)).toMatchObject({ changed: false, warningDelta: 0 });
  });
});
