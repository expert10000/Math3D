import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, buildAlgebraOperationRequest,
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraEvidence, createProjectAlgebraObjectId, parseMath3DProject,
  parseProjectAlgebraEvidence, quadraticPrimeSplitting, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";
import { createSageRecipeStarter } from "../../renderer/src/features/sageLab/sageRecipeStarter";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [],
    artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-d02-d04", title: "Quadratic arithmetic" });
  const q = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Q"),
    revision: 1, label: "Q", definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, q);
  const k = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "K"),
    revision: 1, label: "K", definition: { kind: "number-field", baseField: { objectId: q.id, revision: 1 },
      definingPolynomial: ["-5", "0", "1"], generator: "a" } });
  project = upsertMath3DProjectAlgebraObject(project, k);
  return { project, q, k, target: { objectId: k.id, revision: 1 } as const };
};
const runtime = (jobId: string) => ({ engine: "sagemath" as const, version: "9.5", backend: "docker" as const,
  jobId, elapsedMs: 12, warnings: [] });

describe("SAGE-D02–D04 shared number-field operations", () => {
  it("checks exact norm, trace, embeddings, degree consistency and pinned evidence reopen", () => {
    const { project, k, target } = setup();
    const request = buildAlgebraOperationRequest(project, target, "sage.numberField.elementDossier", "docker",
      { element: ["1", "1"] });
    const result = { format: "math3d.sage-number-field-result", schemaVersion: 1,
      operation: "sage.numberField.elementDossier", target, definitionHash: k.contentHash,
      element: ["1", "1"], norm: "-4", trace: "2", baseDegree: 1, relativeDegree: 2,
      absoluteDegree: 2, basis: ["1", "a"], embeddings: [
        { index: 0, generatorImage: "√5", elementImage: "1 + √5" },
        { index: 1, generatorImage: "-√5", elementImage: "1 - √5" },
      ] };
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, result,
      runtime("d03-1"));
    const saved = addMath3DProjectAlgebraEvidence(project, evidence);
    const reopened = parseMath3DProject(serializeMath3DProject(saved));
    expect(reopened.algebraEvidence?.[0]).toEqual(evidence);
    expect(reopened.algebraObjects?.find((item) => item.id === k.id)?.revisions[0]).toEqual(k);
    expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { ...result, norm: "4" }, runtime("d03-forged"))).toThrow(/disagree/);
    const forged: any = structuredClone(evidence);
    forged.request.params.field.objects[0].definition.kind = "integer-ring";
    expect(() => parseProjectAlgebraEvidence(forged, project.identity.id, project.algebraObjects!)).toThrow();
    expect(() => buildAlgebraOperationRequest(project, target, "sage.numberField.elementDossier", "docker",
      { element: ["01", "1"] })).toThrow(/canonical/);
  });

  it("checks inert, ramified and split prime factors and rejects false decomposition", () => {
    const { project, k, target } = setup();
    const expected = [[2, "inert", [{ ideal: "(2)", ramificationIndex: 1, residueDegree: 2, norm: "4" }]],
      [5, "ramified", [{ ideal: "(a)", ramificationIndex: 2, residueDegree: 1, norm: "5" }]],
      [11, "split", [{ ideal: "P1", ramificationIndex: 1, residueDegree: 1, norm: "11" },
        { ideal: "P2", ramificationIndex: 1, residueDegree: 1, norm: "11" }]]] as const;
    for (const [prime, splitting, factors] of expected) {
      const request = buildAlgebraOperationRequest(project, target, "sage.numberField.primeDecomposition", "docker",
        { prime });
      const result = { format: "math3d.sage-number-field-result", schemaVersion: 1,
        operation: "sage.numberField.primeDecomposition", target, definitionHash: k.contentHash,
        prime, splitting, factors, degreeCheck: 2 };
      const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, result,
        runtime(`d04-${prime}`));
      expect(evidence.result).toEqual(result);
      expect(quadraticPrimeSplitting("5", prime)).toBe(splitting);
      expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
        { ...result, factors: [{ ...factors[0], norm: "1" }] }, runtime(`forged-${prime}`)))
        .toThrow(/Prime-ideal factors/);
    }
    expect(() => buildAlgebraOperationRequest(project, target, "sage.numberField.primeDecomposition", "docker",
      { prime: 9 })).toThrow(/prime from 2 to 97/);
  });

  it("creates a pinned reusable prime-decomposition recipe over the one Project field record", () => {
    const { project, k, target } = setup();
    const recipe = createSageRecipeStarter(project, target);
    expect(recipe.stages.map((item) => item.operation)).toEqual([
      "sage.algebra.reconstruct", "sage.numberField.elementDossier", "sage.numberField.primeDecomposition",
    ]);
    expect(recipe.stages[2].dependsOn).toEqual([{ stageId: "construct",
      outputSchema: "math3d.sage-algebra-reconstruction-result/v1" }]);
    expect(recipe.stages.every((item) => item.target.objectId === k.id && item.targetHash === k.contentHash)).toBe(true);
  });
});
