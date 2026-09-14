import { describe, expect, it } from "vitest";
import { TOPOLOGY_PRESETS } from "../presets";
import { buildQuotientPipeline } from "../quotientBuilder";
import { computeEulerHomologyConsistency } from "./algebraicConsistency";

describe("Euler–homology consistency", () => {
  it("passes over Z and Z/2Z for every shipped canonical fixture", () => {
    for (const preset of TOPOLOGY_PRESETS) {
      const result = buildQuotientPipeline(preset.buildDiagram());
      const check = result.algebraicConsistency;
      expect(check.status, preset.id).toBe("exact");
      expect(check.value?.holds, preset.id).toBe(true);
      expect(check.value?.coefficientChecks.map((entry) => entry.holds), preset.id).toEqual([true, true]);
      expect(check.value?.cellularEulerCharacteristic, preset.id).toBe(
        result.topologyObject.canonical.vertices.length -
          result.topologyObject.canonical.edges.length +
          result.topologyObject.canonical.faces.length
      );
    }
  });

  it("reports a failed exact cross-check when a Betti cache is inconsistent", () => {
    const built = buildQuotientPipeline(
      TOPOLOGY_PRESETS.find((preset) => preset.id === "torus_square")!.buildDiagram()
    );
    const inconsistentHomology = structuredClone(built.homology);
    inconsistentHomology.value!.integer.groups[1].bettiNumber += 1;
    const check = computeEulerHomologyConsistency(built.topologyObject, inconsistentHomology);

    expect(check.status).toBe("failed");
    expect(check.value?.holds).toBe(false);
    expect(check.value?.coefficientChecks[0].holds).toBe(false);
    expect(check.value?.coefficientChecks[1].holds).toBe(true);
    expect(check.diagnostics[0]?.code).toBe("algebra/euler-homology-mismatch");
  });

  it("withholds the check when exact homology is unavailable", () => {
    const built = buildQuotientPipeline(TOPOLOGY_PRESETS[0].buildDiagram());
    const check = computeEulerHomologyConsistency(built.topologyObject, {
      ...built.homology,
      status: "unsupported",
      value: undefined,
    });
    expect(check.status).toBe("unsupported");
    expect(check).not.toHaveProperty("value");
  });
});
