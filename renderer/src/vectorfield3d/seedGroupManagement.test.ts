import { describe, expect, it } from "vitest";
import { createVectorField3DDocument, integrateVectorField3DTrajectories,
  reviseVectorField3DDocument,
  reviseVectorField3DWorkspace, vectorField3DExpression } from "@math3d/core";
import { captureSeedEdit, defaultSeedGroupColor, restoreSeedEdit,
  seedGroupColorRgb, seedGroupStyle } from "./seedGroupManagement";
import { trajectoryGroupGeometry } from "./trajectoryGroupGeometry";

const axes = (["x", "y", "z"] as const).map(role =>
  ({ role, label: role, unit: "m", min: -4, max: 4 })) as
  Parameters<typeof createVectorField3DDocument>[0]["axes"];
const createField = () => createVectorField3DDocument({ axes, timeUnit: "s",
  field: { kind: "expressions", components: ["-y", "x", "0"].map(source =>
    vectorField3DExpression(source, "m/s")) as unknown as
      Extract<Parameters<typeof createVectorField3DDocument>[0]["field"],
        { kind: "expressions" }>["components"] },
  seeds: [{ id: "seed-1", position: [1, 0, 0], group: "line-1" },
    { id: "seed-2", position: [0, 1, 0], group: "line-1" }],
  display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
  solver: { absoluteTolerance: 1e-6, relativeTolerance: 1e-6,
    maxSteps: 1000, maxTime: 1 } }, { stableKey: "seed-group-history" });

describe("SCI-13 seed group edits", () => {
  it("keeps display edits separate from source identity and converts group color for paths", () => {
    const base = createField();
    const styled = reviseVectorField3DWorkspace(base, { ...base.workspace!,
      hiddenSeedGroups: ["line-1"], seedGroupStyles: [
        { id: "line-1", name: "Swirl", color: "#ff3366" }] });
    expect(styled.identity).toEqual(base.identity);
    expect(seedGroupStyle(styled, "line-1")).toEqual({ name: "Swirl", color: "#ff3366" });
    const linearColor = seedGroupColorRgb("#ff3366");
    expect(linearColor[0]).toBe(1);
    expect(linearColor[1]).toBeCloseTo(0.03310477, 6);
    expect(linearColor[2]).toBeCloseTo(0.13286832, 6);
    expect(defaultSeedGroupColor("line-1")).toBe(defaultSeedGroupColor("line-1"));
    expect(seedGroupStyle(base, "manual").name).toBe("Manual");
    expect(restoreSeedEdit(styled, captureSeedEdit(base)).identity).toEqual(base.identity);
  });

  it("undoes a group deletion with exact coordinates, membership, style and visibility", () => {
    const base = createField();
    const styled = reviseVectorField3DWorkspace(base, { ...base.workspace!,
      hiddenSeedGroups: ["line-1"], seedGroupStyles: [
        { id: "line-1", name: "Swirl", color: "#ff3366" }] });
    const beforeDelete = captureSeedEdit(styled);
    const prepared = reviseVectorField3DWorkspace(styled, { ...styled.workspace!,
      hiddenSeedGroups: [], seedGroupStyles: [] });
    const deleted = reviseVectorField3DDocument(prepared, { ...prepared.source, seeds: [] });
    const restored = restoreSeedEdit(deleted, beforeDelete);
    expect(restored.source.seeds).toEqual(styled.source.seeds);
    expect(restored.workspace?.hiddenSeedGroups).toEqual(["line-1"]);
    expect(restored.workspace?.seedGroupStyles).toEqual(styled.workspace?.seedGroupStyles);
    expect(restored.identity.structuralHash).toBe(styled.identity.structuralHash);
    expect(restoreSeedEdit(restored, captureSeedEdit(deleted)).source.seeds).toEqual([]);
  });

  it("writes each group's color into the trajectory vertex buffer", () => {
    const base = createField();
    const grouped = reviseVectorField3DDocument(base, { ...base.source,
      seeds: [base.source.seeds[0]!, { ...base.source.seeds[1]!, group: "plane-1" }] });
    const styled = reviseVectorField3DWorkspace(grouped, { ...grouped.workspace!,
      seedGroupStyles: [{ id: "line-1", name: "Line", color: "#ff0000" },
        { id: "plane-1", name: "Plane", color: "#0000ff" }] });
    const traces = integrateVectorField3DTrajectories(styled);
    const clip = axes.map(axis => [axis.min, axis.max]) as
      Parameters<typeof trajectoryGroupGeometry>[2];
    const geometry = trajectoryGroupGeometry(styled, traces, clip);
    expect(geometry.positions.length).toBeGreaterThan(0);
    expect([...geometry.colors.slice(0, 3)]).toEqual([1, 0, 0]);
    const secondOffset = (traces.trajectories[0]!.points.length - 1) * 2 * 3;
    expect([...geometry.colors.slice(secondOffset, secondOffset + 3)]).toEqual([0, 0, 1]);
    expect(geometry.colors.length).toBe(geometry.positions.length);
  });
});
