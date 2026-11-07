import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, createAlgebraObjectRecord, createGcdParameterSweepRecipe,
  createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraObjectId,
  isGcdParameterSweepRecipe, parseMath3DProject, serializeMath3DProject, startAlgebraRecipeRun,
  upsertMath3DProjectAlgebraObject, upsertMath3DProjectAlgebraRecipe } from "../../packages/core/src/index";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-h05", title: "GCD sweep" });
  const z = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Z"),
    revision: 1, label: "Z", definition: { kind: "integer-ring" } });
  project = upsertMath3DProjectAlgebraObject(project, z);
  return { project, target: { objectId: z.id, revision: 1 } };
};

describe("SAGE-H05 bounded parameter sweep", () => {
  it("roundtrips repeatable exact parameters and saved per-run evidence", async () => {
    const { project, target } = setup();
    const recipe = createGcdParameterSweepRecipe(project, target, [["84", "30"], ["35", "15"], ["17", "13"]], "docker");
    expect(isGcdParameterSweepRecipe(recipe)).toBe(true);
    expect(createGcdParameterSweepRecipe(project, target, [["84", "30"], ["35", "15"], ["17", "13"]], "docker").id)
      .toBe(recipe.id);
    const imported = parseMath3DProject(serializeMath3DProject(upsertMath3DProjectAlgebraRecipe(project, recipe)));
    expect(imported.algebraRecipes?.[0]).toEqual(recipe);
    const run = startAlgebraRecipeRun(imported, recipe, (request) => {
      const values = request.params.values as string[];
      const result = values[0] === "84" ? "6" : values[0] === "35" ? "5" : "1";
      return { jobId: `h05-${values[0]}`, cancel: () => {}, promise: Promise.resolve({
        success: true, engine: "sagemath", engineVersion: "10.10", operation: request.operation,
        result: { value: result }, warnings: [], elapsedMs: 3 }) };
    }, addMath3DProjectAlgebraEvidence, undefined, { globalWallTimeMs: 30_000 });
    const complete = await run.promise;
    expect(complete.progress.status).toBe("complete");
    const results = parseMath3DProject(serializeMath3DProject(complete.project)).algebraEvidence
      ?.map((item) => [(item.request.params.values as string[])[0], (item.result as { value: string }).value]);
    expect(results?.sort()).toEqual([["17", "1"], ["35", "5"], ["84", "6"]]);
  });

  it("rejects oversized or noncanonical sweeps and cancels on a shared budget", async () => {
    const { project, target } = setup();
    expect(() => createGcdParameterSweepRecipe(project, target, Array(9).fill(["2", "4"]), "docker")).toThrow();
    expect(() => createGcdParameterSweepRecipe(project, target, [["02", "4"]], "docker")).toThrow();
    const recipe = createGcdParameterSweepRecipe(project, target, [["84", "30"], ["35", "15"]], "docker");
    let cancelled = false;
    const run = startAlgebraRecipeRun(project, recipe, (request) => {
      let resolve!: (value: { success: boolean; engine: string; engineVersion: string; operation: string;
        result: unknown; warnings: string[] }) => void;
      const promise = new Promise<Parameters<typeof resolve>[0]>((done) => { resolve = done; });
      return { jobId: "h05-slow", promise, cancel: () => { cancelled = true; resolve({ success: false,
        engine: "sagemath", engineVersion: "10.10", operation: request.operation,
        result: {}, warnings: [] }); } };
    }, addMath3DProjectAlgebraEvidence, undefined, { globalWallTimeMs: 5 });
    const result = await run.promise;
    expect(cancelled).toBe(true);
    expect(result.progress.status).toBe("cancelled");
    expect(result.progress.stages.every((stage) => stage.reason === "Global operation budget exhausted.")).toBe(true);
    expect(result.project.algebraEvidence ?? []).toHaveLength(0);
  });
});
