import { describe, expect, it } from "vitest";
import { VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE,
  VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE,
  type AnalysisResultEnvelope, type VectorField3DOverlayRegion } from "@math3d/core";
import { summarizeVectorDerivedSubrectangle } from "../vectorfield3d/vectorDerivedSubrectangle";
import { scientificSubrectangleReportMarkdown, subrectangleSourcesCurrent } from
  "./scientificSubrectangleWorkbook";

describe("SCI-19 scientific Workbook report", () => {
  it("reports selected 80³ vortex oracle values, bounds, units and gaps", () => {
    const region: VectorField3DOverlayRegion = { normalAxis: 2,
      fixedCoordinate: 0, bounds: [[-4, 4], [-4, 4]],
      vectorChannel: "speed", visible: true };
    const x = (index: number) => -4 + index / 2;
    const values = Array.from({ length: 289 }, (_, index) => {
      const a = x(Math.floor(index / 17));
      const b = x(index % 17);
      const r2 = a * a + b * b;
      return { speed: Math.sqrt(r2) * 16 / (16 + r2),
        divergence: 0.25, curl: 512 / (16 + r2) ** 2 };
    });
    const summary = summarizeVectorDerivedSubrectangle(region,
      [[-0.25, 1.25], [-0.25, 1.25]],
      { cells: values.map(item => item.speed), unit: "m/s" } as never,
      { divergence: { cells: values.map(item => item.divergence), unit: "1/s" },
        curlMagnitude: { cells: values.map(item => item.curl), unit: "1/s" } } as never);
    const selected = [8, 9, 10].flatMap(i => [8, 9, 10].map(j => values[i * 17 + j]!));
    expect(summary.sampleCount).toBe(9);
    expect(summary.divergence).toEqual({ count: 9, gaps: 0,
      mean: 0.25, min: 0.25, max: 0.25 });
    expect(summary.vector.mean).toBeCloseTo(selected.reduce((sum, item) =>
      sum + item.speed, 0) / 9, 12);
    expect(summary.curlMagnitude.mean).toBeCloseTo(selected.reduce((sum, item) =>
      sum + item.curl, 0) / 9, 12);
    const result = { resultId: "oracle-result", provenance: {
      source: { documentId: "oracle", revision: 1, generation: 0,
        structuralHash: "sha256:source" }, operation: {
        type: VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE,
        algorithm: "vector-derived-selected-cells", algorithmVersion: "17x17-v1",
        parameters: { region, bounds: [[-0.25, 1.25], [-0.25, 1.25]], method: "bounded-finite-difference",
          profiles: { columnRowsSha256: ["hash"], rowRowsSha256: ["hash"] } } },
      engine: { name: "Math3D", version: "1" }, numericContext: {
        precision: { binaryBits: 53 } }, elapsedMs: 0 },
      summary, warnings: [] } as unknown as AnalysisResultEnvelope;
    const markdown = scientificSubrectangleReportMarkdown(result);
    expect(markdown).toContain("Selected bounds: [[-0.25,1.25],[-0.25,1.25]]");
    expect(markdown).toContain("| divergence | 1/s | 9 | 0 | 0.25");
    expect(markdown).toContain(String(summary.curlMagnitude.mean));
    expect(markdown).toContain("columnRowsSha256");
  });

  it("withholds any incomplete or changed Burgers source status", () => {
    expect(subrectangleSourcesCurrent({ kind: "vector-derived", vector: "source-current",
      divergence: "source-current", curlMagnitude: "changed" })).toBe(false);
    expect(subrectangleSourcesCurrent({ kind: "combined", vector: "source-current",
      scalar: "source-current", complex: "source-current",
      complexMagnitude: "source-current", complexPhase: "source-current",
      divergence: "source-current", curlMagnitude: "changed" })).toBe(false);
    expect(subrectangleSourcesCurrent("checking")).toBe(false);
  });

  it("keeps all six combined fields and their distinct units in the report", () => {
    const statistics = { count: 2, gaps: 1, mean: 3, min: 2, max: 4 };
    const result = { resultId: "combined", provenance: { source: {
      documentId: "field", revision: 1, generation: 0,
      structuralHash: "sha256:field" }, operation: {
      type: VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE,
      algorithm: "combined-selected-cells", algorithmVersion: "17x17-v1",
      parameters: { bounds: [[0, 1], [0, 1]], region: { normalAxis: 2 },
        scalarSampleSha256: "scalar-hash", realSampleSha256: "real-hash",
        imaginarySampleSha256: "imaginary-hash" } },
      engine: { name: "Math3D", version: "1" },
      numericContext: { precision: { binaryBits: 53 } }, elapsedMs: 0 },
      summary: { sampleCount: 3, vector: statistics, scalar: statistics,
        complexMagnitude: statistics, complexPhase: statistics,
        divergence: statistics, curlMagnitude: statistics,
        vectorUnit: "m/s", scalarUnit: "K", complexUnit: "Pa",
        divergenceUnit: "1/s", curlMagnitudeUnit: "1/s" },
      warnings: [] } as unknown as AnalysisResultEnvelope;
    const markdown = scientificSubrectangleReportMarkdown(result);
    expect(markdown).toContain("| scalar | K | 2 | 1 |");
    expect(markdown).toContain("| complexMagnitude | Pa | 2 | 1 |");
    expect(markdown).toContain("| complexPhase | rad | 2 | 1 |");
    expect(markdown).toContain("imaginary-hash");
  });
});
