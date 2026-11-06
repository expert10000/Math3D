import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, algebraOperationsFor, buildAlgebraOperationRequest,
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraEvidence, createProjectAlgebraObjectId, parseMath3DProject,
  parseProjectAlgebraEvidence, serializeMath3DProject, upsertMath3DProjectAlgebraObject,
} from "../../packages/core/src/index";
import inert from "../fixtures/sage-local-x2minus5-p3-sage95.json";
import ramified from "../fixtures/sage-local-x2minus5-p5-sage95.json";
import split from "../fixtures/sage-local-x2minus5-p11-sage95.json";

const setup = (constant = "-5") => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: `sage-g03-${constant}`, title: "Local quadratic models" });
  const q = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Q"),
    revision: 1, label: "Q", definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, q);
  const k = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "K"),
    revision: 1, label: "K", definition: { kind: "number-field", baseField: { objectId: q.id, revision: 1 },
      definingPolynomial: [constant, "0", "1"], generator: "a" } });
  project = upsertMath3DProjectAlgebraObject(project, k);
  return { project, q, k, target: { objectId: k.id, revision: 1 } };
};

describe("SAGE-G03 quadratic local extensions", () => {
  for (const [prime, fixture, splitting, degrees] of [
    [3, inert, "inert", [[1, 2]]],
    [5, ramified, "ramified", [[2, 1]]],
    [11, split, "split", [[1, 1], [1, 1]]],
  ] as const) it(`checks ${splitting} p=${prime} and independently reopens its evidence`, () => {
    const { project, q, k, target } = setup();
    const request = buildAlgebraOperationRequest(project, target, "sage.numberField.localExtensions", "docker",
      { prime, precision: 8 });
    const result = { ...fixture, target, targetHash: k.contentHash };
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, result,
      { engine: "sagemath", version: "9.5", backend: "docker", jobId: `sage-g03-p${prime}`,
        elapsedMs: 1, warnings: [] });
    const reopened = parseMath3DProject(serializeMath3DProject(addMath3DProjectAlgebraEvidence(project, evidence)));
    expect(reopened.algebraObjects?.find((entry) => entry.id === q.id)?.revisions[0]).toEqual(q);
    expect(reopened.algebraObjects?.find((entry) => entry.id === k.id)?.revisions[0]).toEqual(k);
    expect(reopened.algebraEvidence?.[0].result).toEqual(result);
    expect(reopened.algebraEvidence?.[0].certificate?.runtime.sageVersion).toBe("9.5");
    expect(result.branches.map((branch) => [branch.ramificationIndex, branch.residueDegree])).toEqual(degrees);
    expect(result.branches.reduce((sum, branch) => sum + branch.localDegree, 0)).toBe(2);
  });

  it("rejects forged e/f, residue order, split root, pinned field and unsupported primes", () => {
    const { project, k, target } = setup();
    const request = buildAlgebraOperationRequest(project, target, "sage.numberField.localExtensions", "docker",
      { prime: 11, precision: 8 });
    const result = { ...split, target, targetHash: k.contentHash };
    const runtime = { engine: "sagemath" as const, version: "9.5", backend: "docker" as const,
      jobId: "sage-g03-forged", elapsedMs: 1, warnings: [] };
    const forged = (branch: Record<string, unknown>) => ({ ...result,
      branches: [{ ...result.branches[0], ...branch }, result.branches[1]] });
    for (const branch of [{ ramificationIndex: 2 }, { residueOrder: 121 }, { rootResidue: "4" }])
      expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
        forged(branch), runtime)).toThrow();
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, result, runtime);
    expect(() => parseProjectAlgebraEvidence({ ...evidence, request: { ...request,
      params: { ...request.params, prime: 5 } } }, project.identity.id, project.algebraObjects!)).toThrow();
    for (const prime of [2, 9, 37])
      expect(() => buildAlgebraOperationRequest(project, target, "sage.numberField.localExtensions", "docker",
        { prime, precision: 8 })).toThrow(/odd prime/);
    const indexed = setup("-45");
    expect(() => buildAlgebraOperationRequest(indexed.project, indexed.target,
      "sage.numberField.localExtensions", "docker", { prime: 3, precision: 8 })).toThrow();
    const gate = algebraOperationsFor(project, target, [{ backend: "docker", available: true,
      operations: ["number-field.prime-decomposition"] }])
      .find((item) => item.definition.id === "sage.numberField.localExtensions")!;
    expect(gate.readyBackend).toBeNull();
    expect(gate.runtimeReason).toContain("number-field.local-extensions");
  });
});
