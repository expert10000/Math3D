import { describe, expect, it } from "vitest";
import { VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE,
  VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE, structuralHash,
  type AnalysisResultEnvelope, type VectorField3DOverlayRegion } from "@math3d/core";
import { pointTableStore } from "../graph2d/pointTableStore";
import { scientificSubrectangleChartSvg,
  scientificSubrectangleProfileChart } from "./scientificSubrectangleChart";
import { summarizeVectorDerivedSubrectangle } from "../vectorfield3d/vectorDerivedSubrectangle";
import { scientificSubrectangleDifferences, scientificSubrectangleReportMarkdown,
  subrectangleSourcesCurrent } from
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
    const revision = { ...result, resultId: "oracle-result/r1",
      summary: { ...result.summary, divergence: { ...summary.divergence,
        mean: 0.251 } } } as AnalysisResultEnvelope;
    const differences = scientificSubrectangleDifferences(result, revision);
    expect(differences).toContain("Compared with oracle-result");
    expect(differences).toContain(String(0.251 - 0.25));
    expect(scientificSubrectangleDifferences(result,
      { ...result, resultId: "oracle-result/r2" })).toContain("| divergence | 0 | 0 | 0 | 0 | 0 |");
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

  it("plots verified physical rows with gaps and withholds changed fields independently", () => {
    const series = ["vector", "scalar", "complex-magnitude", "complex-phase",
      "divergence", "curl-magnitude"];
    const rows = Array.from({ length: 17 }, (_, index) => ({ id: `row_${index + 1}`,
      x: -4 + index / 2, y: index === 7 ? null : index + 1 }));
    const hash = structuralHash(rows);
    const table = pointTableStore.publish(rows);
    const objects = [0, 1].flatMap(axis => series.map((name, index) => ({
      kind: "point-series", table, linkedOrigin: {
        kind: axis === 0 ? "vector-scalar-complex-curl-linked-region/v4" :
          "vector-scalar-complex-curl-row-linked-region/v5",
        pairId: axis === 0 ? "columns" : "rows", series: name,
        ...(axis === 1 ? { profileAxis: 1 } : {}),
        xName: axis === 0 ? "x" : "y", xUnit: "m",
        yUnit: ["m/s", "V", "Pa", "rad", "1/s", "1/s"][index],
        rowsSha256: hash } })));
    const result = { resultId: "chart-result", provenance: { source: {
      structuralHash: "source-hash" }, operation: {
        type: VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE,
        parameters: { bounds: [[-1, 1], [-2, 2]], profiles: {
          columnPairId: "columns", rowPairId: "rows",
          columnRowsSha256: Array(6).fill(hash),
          rowRowsSha256: Array(6).fill(hash) } } } } } as unknown as AnalysisResultEnvelope;
    const status = { kind: "combined" as const, vector: "source-current" as const,
      scalar: "changed" as const, complex: "source-current" as const,
      complexMagnitude: "source-current" as const,
      complexPhase: "source-current" as const,
      divergence: "source-current" as const,
      curlMagnitude: "source-current" as const };
    const graph = { source: { objects } } as never;
    const chart = scientificSubrectangleProfileChart(result, [graph], status);
    expect(chart.fields).toHaveLength(6);
    expect(chart.fields[0]?.column?.rows).toHaveLength(17);
    expect(chart.fields[1]).toMatchObject({ key: "scalar", status: "changed" });
    expect(chart.fields[2]?.column?.yUnit).toBe("Pa");
    const svg = scientificSubrectangleChartSvg(chart);
    expect(svg).toContain("x (m)");
    expect(svg).toContain("y (m)");
    expect(svg).toContain("1 gaps");
    expect(svg).toContain("Values withheld: changed");
    expect(svg).toContain("<path d=\"M");
    const altered = { ...result, provenance: { ...result.provenance,
      operation: { ...result.provenance.operation, parameters: {
        ...result.provenance.operation.parameters,
        profiles: { ...result.provenance.operation.parameters.profiles,
          rowRowsSha256: [hash, hash, hash, "bad-hash", hash, hash] } } } } } as AnalysisResultEnvelope;
    const badChart = scientificSubrectangleProfileChart(altered, [graph], status);
    expect(badChart.fields[3]).toMatchObject({ key: "complexPhase",
      status: "changed" });
    expect(badChart.fields[0]?.status).toBe("source-current");
  });
});
