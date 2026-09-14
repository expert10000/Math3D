import { describe, expect, it } from "vitest";
import { TOPOLOGY_PRESETS } from "../presets";
import { buildQuotientPipeline } from "../quotientBuilder";
import { computeExactHomology } from "./homology";

const buildPreset = (id: string) =>
  buildQuotientPipeline(TOPOLOGY_PRESETS.find((preset) => preset.id === id)!.buildDiagram());

describe("exact cellular homology", () => {
  it.each([
    ["torus_square", ["Z", "Z^2", "Z"], [1, 2, 1]],
    ["projective_plane", ["Z", "Z/2Z", "0"], [1, 1, 1]],
    ["klein_bottle_square", ["Z", "Z ⊕ Z/2Z", "0"], [1, 2, 1]],
    ["cylinder", ["Z", "Z", "0"], [1, 1, 0]],
  ])("computes the audited Z and Z/2Z groups for %s", (presetId, integral, mod2) => {
    const result = buildPreset(presetId as string);
    expect(result.homology.status).toBe("exact");
    expect(result.homology.value?.integer.groups.map((group) => group.notation)).toEqual(integral);
    expect(result.homology.value?.mod2.groups.map((group) => group.dimension)).toEqual(mod2);
  });

  it("retains cell-linked representatives and exact torsion orders", () => {
    const result = buildPreset("projective_plane");
    const h1 = result.homology.value!.integer.groups[1];
    expect(h1.torsionCoefficients).toEqual(["2"]);
    expect(h1.generators).toHaveLength(1);
    expect(h1.generators[0]).toMatchObject({ kind: "torsion", order: "2" });
    expect(h1.generators[0].representative.coefficients.length).toBeGreaterThan(0);
    for (const coefficient of h1.generators[0].representative.coefficients) {
      expect(result.cellularBoundaryOperators.value!.chainCellIds.c1).toContain(coefficient.cellId);
      expect(() => BigInt(coefficient.coefficient)).not.toThrow();
    }
  });

  it("runs Z/2Z as an independent exact finite-field computation", () => {
    const projective = buildPreset("projective_plane");
    expect(projective.homology.value?.integer.groups[2].bettiNumber).toBe(0);
    expect(projective.homology.value?.mod2.groups[2].dimension).toBe(1);
    expect(projective.homology.value?.mod2.groups[2].generators[0].representative.coefficients).toEqual([
      { cellId: "qF0", coefficient: "1" },
    ]);
  });

  it("withholds homology when the exact chain complex is unavailable", () => {
    const result = buildPreset("torus_square");
    const unsupported = computeExactHomology(result.topologyObject, {
      ...result.cellularBoundaryOperators,
      status: "failed",
    });
    expect(unsupported.status).toBe("unsupported");
    expect(unsupported).not.toHaveProperty("value");
    expect(unsupported.diagnostics[0]?.code).toBe("homology/exact-boundaries-unavailable");
  });

  it("serializes without bigint values while preserving SNF reduction maps", () => {
    const result = buildPreset("klein_bottle_square");
    const serialized = JSON.stringify(result.homology);
    expect(serialized).toContain('"boundary2OnKernelBoundary1"');
    expect(serialized).toContain('"rightTransformInverse"');
    expect(JSON.parse(serialized).value.integer.groups[1].torsionCoefficients).toEqual(["2"]);
  });
});
