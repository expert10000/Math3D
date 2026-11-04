import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, createAlgebraObjectRecord, createAlgebraRecipeGraph,
  createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraObjectId,
  parseMath3DProject, serializeMath3DProject, startAlgebraRecipeRun,
  upsertMath3DProjectAlgebraObject, upsertMath3DProjectAlgebraRecipe } from "../../packages/core/src/index";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [],
    artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-b07", title: "Algebra recipes" });
  const z = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Z"),
    revision: 1, label: "Z", definition: { kind: "integer-ring" } });
  project = upsertMath3DProjectAlgebraObject(project, z);
  const target = { objectId: z.id, revision: 1 };
  const schema = "sage.numberTheory.gcd/result-v1";
  const stage = (id: string, values: string[], dependsOn: { stageId: string; outputSchema: string }[] = []) =>
    ({ id, operation: "sage.numberTheory.gcd" as const, backend: "docker" as const, target,
      args: { values }, dependsOn });
  const recipe = createAlgebraRecipeGraph(project, "gcd-chain", "GCD chain", [
    stage("third", ["12", "8"], [{ stageId: "second", outputSchema: schema }]),
    stage("independent", ["9", "6"]),
    stage("second", ["10", "4"], [{ stageId: "first", outputSchema: schema }]),
    stage("first", ["84", "30"]),
  ]);
  return { project, z, recipe, stage, schema };
};

describe("SAGE-B07 reusable algebra recipe DAG", () => {
  it("roundtrips typed stages and rejects cycles, missing parents, mismatched schemas and duplicate IDs", () => {
    const { project, recipe, stage, schema } = setup();
    const saved = upsertMath3DProjectAlgebraRecipe(project, recipe);
    const reopened = parseMath3DProject(serializeMath3DProject(saved));
    expect(reopened.algebraRecipes).toEqual([recipe]);
    expect(recipe.stages.map((item) => item.id)).toEqual(["first", "second", "third", "independent"]);
    expect(upsertMath3DProjectAlgebraRecipe(saved, recipe)).toEqual(saved);
    const raw = JSON.parse(serializeMath3DProject(saved));
    for (const changed of [
      { ...recipe, stages: [...recipe.stages, recipe.stages[0]] },
      { ...recipe, stages: recipe.stages.map((item) => item.id === "first" ? { ...item,
        dependsOn: [{ stageId: "third", outputSchema: schema }] } : item) },
      { ...recipe, stages: recipe.stages.map((item) => item.id === "second" ? { ...item,
        dependsOn: [{ stageId: "missing", outputSchema: schema }] } : item) },
      { ...recipe, stages: recipe.stages.map((item) => item.id === "second" ? { ...item,
        dependsOn: [{ stageId: "first", outputSchema: "wrong/v1" }] } : item) },
      { ...recipe, stages: recipe.stages.map((item) => item.id === "first" ? { ...item,
        args: { values: ["01", "2"] } } : item) },
      { ...recipe, stages: recipe.stages.map((item) => item.id === "first" ? { ...item,
        requestHash: "sha256:" + "0".repeat(64) } : item) },
    ]) {
      expect(() => upsertMath3DProjectAlgebraRecipe(project, changed)).toThrow();
      expect(() => parseMath3DProject(JSON.stringify({ ...raw, algebraRecipes: [changed] }))).toThrow();
    }
    expect(() => createAlgebraRecipeGraph(project, "bad", "Invalid", [stage("bad", ["01", "2"])]))
      .toThrow(/canonical signed integers/);
    const revised = upsertMath3DProjectAlgebraObject(saved, createAlgebraObjectRecord({ id: recipe.stages[0].target.objectId,
      revision: 2, label: "Integers", definition: { kind: "integer-ring" } }));
    expect(parseMath3DProject(serializeMath3DProject(revised)).algebraRecipes?.[0]).toEqual(recipe);
  });

  it("keeps completed evidence, skips failed descendants and runs independent branches", async () => {
    const { project, recipe } = setup();
    const saved = upsertMath3DProjectAlgebraRecipe(project, recipe);
    let sequence = 0;
    const run = startAlgebraRecipeRun(saved, recipe, (request) => {
      const values = request.params.values as string[];
      const failure = values[0] === "10";
      return { jobId: `b07-${++sequence}`, cancel: () => {}, promise: Promise.resolve(failure
        ? { success: false, engine: "sagemath", engineVersion: "9.5", operation: request.operation,
            result: {}, warnings: [], error: "controlled second-stage failure" }
        : { success: true, engine: "sagemath", engineVersion: "9.5", operation: request.operation,
            result: { value: values[0] === "84" ? "6" : "3" }, warnings: [], elapsedMs: 4 }) };
    }, (base, evidence) => addMath3DProjectAlgebraEvidence(base, evidence));
    const { project: completed, progress } = await run.promise;
    expect(progress.status).toBe("partial");
    expect(progress.stages.map((item) => [item.stageId, item.status])).toEqual([
      ["first", "completed"], ["second", "failed"], ["third", "skipped"], ["independent", "completed"]]);
    expect(completed.algebraEvidence).toHaveLength(2);
    expect(parseMath3DProject(serializeMath3DProject(completed)).algebraEvidence?.map((item) => item.result))
      .toEqual([{ value: "6" }, { value: "3" }]);
  });

  it("cancels the active stage and retains evidence from earlier stages", async () => {
    const { project, recipe } = setup();
    const saved = upsertMath3DProjectAlgebraRecipe(project, recipe);
    let cancelActive = () => {};
    let run: ReturnType<typeof startAlgebraRecipeRun>;
    run = startAlgebraRecipeRun(saved, recipe, (request) => {
      const first = (request.params.values as string[])[0] === "84";
      if (first) return { jobId: "b07-first", cancel: () => {}, promise: Promise.resolve({
        success: true, engine: "sagemath", engineVersion: "9.5", operation: request.operation,
        result: { value: "6" }, warnings: [] }) };
      const promise = new Promise<{ success: boolean; engine: string; operation: string; result: object;
        warnings: string[]; error: string }>((resolve) => { cancelActive = () => resolve({ success: false,
        engine: "sagemath", operation: request.operation, result: {}, warnings: [], error: "cancelled" }); });
      return { jobId: "b07-active", cancel: () => cancelActive(), promise };
    }, (base, evidence) => addMath3DProjectAlgebraEvidence(base, evidence), (progress) => {
      if (progress.stages.some((item) => item.stageId === "second" && item.status === "running"))
        queueMicrotask(() => run.cancel());
    });
    const completed = await run.promise;
    expect(completed.progress.status).toBe("cancelled");
    expect(completed.project.algebraEvidence).toHaveLength(1);
    expect(completed.progress.stages.find((item) => item.stageId === "second")?.status).toBe("cancelled");
  });

  it("reuses a saved graph for complete runs with distinct evidence", async () => {
    const { project, recipe } = setup();
    let working = upsertMath3DProjectAlgebraRecipe(project, recipe), sequence = 0;
    const execute = (request: Parameters<typeof startAlgebraRecipeRun>[2] extends (input: infer R) => unknown ? R : never) => {
      const values = request.params.values as string[];
      const value = values[0] === "84" ? "6" : values[0] === "10" ? "2" :
        values[0] === "12" ? "4" : "3";
      return { jobId: `b07-repeat-${++sequence}`, cancel: () => {}, promise: Promise.resolve({
        success: true, engine: "sagemath", engineVersion: "9.5", operation: request.operation,
        result: { value }, warnings: [] }) };
    };
    for (const expected of [4, 8]) {
      const run = startAlgebraRecipeRun(working, recipe, execute,
        (base, evidence) => addMath3DProjectAlgebraEvidence(base, evidence));
      const completed = await run.promise;
      expect(completed.progress.status).toBe("complete");
      working = completed.project;
      expect(working.algebraEvidence).toHaveLength(expected);
    }
  });

  it("supports typed dependencies across two saved structure domains", async () => {
    const { project, z, schema } = setup();
    const modular = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Z12"),
      revision: 1, label: "Z12", definition: { kind: "modular-ring", modulus: "12" } });
    const withModular = upsertMath3DProjectAlgebraObject(project, modular);
    const graph = createAlgebraRecipeGraph(withModular, "two-domains", "Two domains", [
      { id: "gcd", operation: "sage.numberTheory.gcd", backend: "docker",
        target: { objectId: z.id, revision: 1 }, args: { values: ["84", "30"] }, dependsOn: [] },
      { id: "inverse", operation: "sage.numberTheory.modInverse", backend: "docker",
        target: { objectId: modular.id, revision: 1 }, args: { a: "5" },
        dependsOn: [{ stageId: "gcd", outputSchema: schema }] },
    ]);
    const saved = upsertMath3DProjectAlgebraRecipe(withModular, graph);
    const run = startAlgebraRecipeRun(saved, graph, (request) => ({ jobId: `b07-${request.operation.split(".").at(-1)}`,
      cancel: () => {}, promise: Promise.resolve({ success: true, engine: "sagemath", engineVersion: "9.5",
        operation: request.operation, result: request.operation === "sage.numberTheory.gcd"
          ? { value: "6" } : { value: "5", modulus: "12" }, warnings: [] }) }),
    (base, evidence) => addMath3DProjectAlgebraEvidence(base, evidence));
    const result = await run.promise;
    expect(result.progress.status).toBe("complete");
    expect(new Set(result.project.algebraEvidence?.map((item) => item.request.target.objectId)))
      .toEqual(new Set([z.id, modular.id]));
  });
});
