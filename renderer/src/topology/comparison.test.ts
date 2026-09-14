import { describe, expect, it } from "vitest";
import { compareTopologyBuildResults } from "./comparison";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { buildQuotientPipeline } from "./quotientBuilder";

const buildPreset = (id: string) => buildQuotientPipeline(TOPOLOGY_PRESET_BY_ID.get(id)!.buildDiagram());

describe("topology invariant comparison", () => {
  it("distinguishes objects when exact homology differs", () => {
    const report = compareTopologyBuildResults(buildPreset("torus_square"), buildPreset("klein_bottle_square"));
    expect(report.outcome).toBe("distinguished");
    expect(report.witnesses.some((row) => row.id === "homology-z-1")).toBe(true);
    expect(report.rows.find((row) => row.id === "pi1-presentation")?.distinguishes).toBe(false);
  });

  it("uses certified surface evidence when basic homology agrees", () => {
    const report = compareTopologyBuildResults(buildPreset("cylinder"), buildPreset("mobius_from_rectangle"));
    expect(report.outcome).toBe("distinguished");
    expect(report.witnesses.some((row) => row.id === "surface-orientability")).toBe(true);
    expect(report.witnesses.some((row) => row.id === "surface-boundary")).toBe(true);
  });

  it("reports matching computed evidence as inconclusive, never equivalent", () => {
    const left = buildPreset("torus_square");
    const right = buildPreset("torus_square");
    const report = compareTopologyBuildResults(left, right);
    expect(report.outcome).toBe("inconclusive");
    expect(report.witnesses).toHaveLength(0);
    expect(report.summary).toMatch(/unproved/i);
    expect(report.disclaimer).toMatch(/do not prove/i);
  });

  it("never treats R3 display or presentation text as a distinguishing witness", () => {
    const left = buildPreset("torus_square");
    const right = structuredClone(left);
    right.realizations[0]!.kind = left.realizations[0]!.kind === "embedded" ? "schematic" : "embedded";
    right.fundamentalGroup.value!.presentation = "⟨alternate | presentation⟩";
    const report = compareTopologyBuildResults(left, right);
    expect(report.outcome).toBe("inconclusive");
    expect(report.rows.find((row) => row.id === "realization-kind")?.status).toBe("different");
    expect(report.rows.find((row) => row.id === "realization-kind")?.distinguishes).toBe(false);
    expect(report.rows.find((row) => row.id === "pi1-presentation")?.distinguishes).toBe(false);
  });
});
