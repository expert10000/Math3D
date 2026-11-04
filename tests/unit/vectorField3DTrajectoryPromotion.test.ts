import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, parseMath3DProject,
  prepareVectorField3DTrajectorySeeds, projectTrajectoryCurveStatus,
  promoteVectorField3DTrajectory, replaceMath3DProjectWorkspace,
  reviseVectorField3DDocument, serializeMath3DProject,
  trajectorySeedPositions, upsertProjectTrajectoryCurve,
  upsertProjectTrajectorySeedRecipe, vectorField3DExpression,
  type Math3DProject, type TrajectorySeedRecipe, type VectorField3DDocument } from "@math3d/core";

const fixture = new URL("../fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const load = () => parseMath3DProject(readFileSync(fixture, "utf8"));
const source = (project: Math3DProject) => project.workspace.entries.find(item =>
  item.module === "vector3d")!.checkpoint as VectorField3DDocument;

describe("GF-13 saved seed recipes and trajectory Curve promotion", () => {
  it("generates bounded point-set, line, ring and plane seeds from saved intent", () => {
    const recipes: TrajectorySeedRecipe[] = [
      { kind: "point-set", points: [[0, 0, 0], [1, 0, 0]] },
      { kind: "line", start: [0, 0, 0], end: [1, 0, 0], count: 5 },
      { kind: "ring", center: [0, 0, 0], normalAxis: 2, radius: 1, count: 8 },
      { kind: "plane", normalAxis: 2, coordinate: 0,
        bounds: [[-1, 1], [-1, 1]], counts: [3, 3] },
    ];
    expect(recipes.map(recipe => trajectorySeedPositions(recipe).length)).toEqual([2, 5, 8, 9]);
    for (const recipe of recipes) {
      const prepared = prepareVectorField3DTrajectorySeeds(source(load()), recipe, recipe.kind);
      expect(prepared.selection.geometry).toEqual({ kind: "trajectory-seed-recipe", recipe });
      expect(prepared.document.source.seeds.length).toBe(trajectorySeedPositions(recipe).length);
    }
    expect(() => prepareVectorField3DTrajectorySeeds(source(load()),
      { kind: "ring", center: [4, 0, 0], normalAxis: 2, radius: 1, count: 8 }, "outside"))
      .toThrow(/inside/);
  });

  it("round-trips a promoted time Curve, records solver stop, and marks changed source stale", () => {
    let project = load();
    const prior = source(project);
    const revised = reviseVectorField3DDocument(prior, { ...prior.source,
      field: { kind: "expressions", components: [
        vectorField3DExpression("1", "m/s"),
        vectorField3DExpression("0", "m/s"),
        vectorField3DExpression("0", "m/s")] } });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
      entries: project.workspace.entries.map(item => item.expected.id === prior.identity.id ?
        { ...item, checkpoint: revised, expected: revised.identity } : item) }));
    const prepared = prepareVectorField3DTrajectorySeeds(revised,
      { kind: "point-set", points: [[0, 0, 0]] }, "origin");
    project = upsertProjectTrajectorySeedRecipe(project, prepared.document, prepared.selection);
    const promotion = promoteVectorField3DTrajectory(prepared.document, prepared.selection, 0);
    expect(promotion.curve.source.definition.familyId).toBe("vector3d.trajectory");
    expect(promotion.curve.source.domain.parameter).toBe("t");
    expect(promotion.curve.source.units.parameter).toBe("s");
    expect(promotion.curve.source.definition.settings).toMatchObject({
      solverMode: "time-trajectory", seedId: promotion.seedId,
      stopReason: promotion.stopReason });
    project = upsertProjectTrajectoryCurve(project, promotion);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const curve = reopened.workspace.entries.find(item =>
      item.expected.id === promotion.curve.identity.id)!.checkpoint;
    expect(curve).toEqual(promotion.curve);
    expect(projectTrajectoryCurveStatus(reopened, promotion.curve))
      .toEqual({ status: "current", reason: null });
    const changed = reviseVectorField3DDocument(prepared.document, {
      ...prepared.document.source, solver: { ...prepared.document.source.solver,
        maxTime: prepared.document.source.solver.maxTime + 1 } });
    expect(projectTrajectoryCurveStatus(reopened, promotion.curve, changed))
      .toEqual({ status: "stale", reason: "source-changed" });
    const missing = replaceMath3DProjectWorkspace(reopened, createMixedWorkspaceDocument({
      ...reopened.workspace, scientificSelections: [] }));
    expect(projectTrajectoryCurveStatus(missing, promotion.curve))
      .toEqual({ status: "stale", reason: "recipe-missing" });
  });

  it("keeps normalized field-line distance distinct from physical time", () => {
    const original = source(load());
    const normalized = reviseVectorField3DDocument(original, { ...original.source,
      solver: { ...original.source.solver, mode: "normalized-field-line",
        maxLineLength: 1 }, field: { kind: "expressions", components: [
          vectorField3DExpression("1", "m/s"),
          vectorField3DExpression("0", "m/s"),
          vectorField3DExpression("0", "m/s")] } });
    const prepared = prepareVectorField3DTrajectorySeeds(normalized,
      { kind: "point-set", points: [[0, 0, 0]] }, "normalized");
    const promotion = promoteVectorField3DTrajectory(prepared.document, prepared.selection, 0);
    expect(promotion.curve.source.domain.parameter).toBe("s");
    expect(promotion.curve.source.units.parameter).toBe("m");
    expect(promotion.curve.source.definition.settings).toMatchObject({
      solverMode: "normalized-field-line", parameterUnit: "m" });
  });

  it("rejects a stationary single-point trajectory instead of saving a Curve", () => {
    const original = source(load());
    const zero = reviseVectorField3DDocument(original, { ...original.source,
      field: { kind: "expressions", components: [
        vectorField3DExpression("0", "m/s"),
        vectorField3DExpression("0", "m/s"),
        vectorField3DExpression("0", "m/s")] } });
    const prepared = prepareVectorField3DTrajectorySeeds(zero,
      { kind: "point-set", points: [[0, 0, 0]] }, "stationary");
    expect(() => promoteVectorField3DTrajectory(prepared.document, prepared.selection, 0))
      .toThrow(/stationary/);
  });
});
