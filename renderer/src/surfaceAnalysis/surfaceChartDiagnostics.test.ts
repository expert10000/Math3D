import { describe, expect, it } from "vitest";
import { adaptSurfaceDefinition } from "./infrastructure";
import { createSurfaceChartDiagnostics, createSurfaceChartPayload } from "./surfaceChartDiagnostics";

const definition = adaptSurfaceDefinition({
  id: "plane", revision: 3, label: "Plane", representation: "parametric", familyId: "plane",
  expressions: { x: "u", y: "2v", z: "0" },
  domain: { kind: "parameter", u: { min: 0, max: 1, periodic: true }, v: { min: 0, max: 1 } },
});
const grid = (position: (u: number, v: number) => readonly [number, number, number]) => [0, 0.5, 1].flatMap((u) => [0, 0.5, 1].map((v) => ({ parameter: [u, v] as const, position: position(u, v), normal: [0, 0, 1] as const })));

describe("Surface chart diagnostics", () => {
  it("computes rank, metric determinant, area scale and documented distortions", () => {
    const result = createSurfaceChartDiagnostics({ definition, samples: grid((u, v) => [u, 2 * v, 0]) });
    expect(result.sampleCount).toBe(9);
    expect(Array.from(result.jacobianRank)).toEqual(new Array(9).fill(2));
    expect(Array.from(result.metricDeterminant)).toEqual(new Array(9).fill(4));
    expect(Array.from(result.areaScale)).toEqual(new Array(9).fill(2));
    expect(Array.from(result.areaDistortion)).toEqual(new Array(9).fill(1));
    expect(result.references.angle).toContain("π/2");
  });

  it("publishes periodic seams, domain boundaries and a future atlas contract", () => {
    const result = createSurfaceChartDiagnostics({ definition, samples: grid((u, v) => [u, v, 0]) });
    expect(result.domain.periodicSeams).toEqual(["u"]);
    expect(result.overlays.find((entry) => entry.kind === "boundary")?.surfacePolylines).toHaveLength(4);
    expect(result.overlays.find((entry) => entry.kind === "seam")?.parameterPolylines).toHaveLength(2);
    expect(result.atlas).toMatchObject({ version: 1, overlaps: [] });
  });

  it("detects scale-aware degeneracy and orientation reversal", () => {
    const collapsed = createSurfaceChartDiagnostics({ definition, samples: grid((u) => [u, 0, 0]) });
    expect(collapsed.regions.degenerate.length).toBe(9);
    const reversed = createSurfaceChartDiagnostics({ definition, samples: grid((u, v) => [u, -v, 0]) });
    expect(reversed.regions.orientationFlip.length).toBe(9);
  });

  it("wraps the chart in the canonical Surface result envelope", () => {
    const chart = createSurfaceChartDiagnostics({ definition, samples: grid((u, v) => [u, v, 0]) });
    const payload = createSurfaceChartPayload({ definition, method: "analytic", chart });
    expect(payload).toMatchObject({ surfaceRevision: 3, method: "analytic", data: { kind: "chart", sampleCount: 9 } });
  });
});
