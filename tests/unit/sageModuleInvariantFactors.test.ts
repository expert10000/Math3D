import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, algebraOperationsFor, buildAlgebraOperationRequest,
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraEvidence, createProjectAlgebraObjectId, parseMath3DProject,
  parseProjectAlgebraEvidence, serializeMath3DProject, upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const setup = (matrix: string[][]) => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-e05", title: "ZZ module invariant factors" });
  const zz = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "ZZ"),
    revision: 1, label: "ZZ", definition: { kind: "integer-ring" } });
  project = upsertMath3DProjectAlgebraObject(project, zz);
  const module = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "M"),
    revision: 1, label: "M", definition: { kind: "module", baseRing: { objectId: zz.id, revision: 1 },
      ambientRank: matrix.length, generators: matrix.map((_, index) => `e${index + 1}`),
      relationMap: { domainRank: matrix[0].length, codomainRank: matrix.length, matrix } } });
  project = upsertMath3DProjectAlgebraObject(project, module);
  const target = { objectId: module.id, revision: 1 };
  const request = buildAlgebraOperationRequest(project, target, "sage.module.invariantFactors", "docker", {});
  return { project, module, target, request };
};

const diagonalResult = (matrix: string[][], freeRank: number, torsionOrders: string[]) => {
  const n = matrix.length, m = matrix[0].length;
  return { format: "math3d.sage-module-invariant-factors-result", schemaVersion: 1,
    coefficientDomain: "ZZ", freeRank, torsionOrders, smith: m === 0 ? null : {
      form: matrix, diagonal: Array.from({ length: Math.min(n, m) }, (_, i) => matrix[i][i]),
      transformations: { status: "verified", left: Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => i === j ? "1" : "0")),
      right: Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => i === j ? "1" : "0")) } } };
};
const runtime = { engine: "sagemath" as const, version: "9.5", backend: "docker" as const,
  jobId: "sage-e05-diagonal", elapsedMs: 2, warnings: [] };

describe("SAGE-E05 ZZ module invariant factors", () => {
  it("saves and independently reopens exact torsion invariant factors and pinned revisions", () => {
    const matrix = [["2", "0"], ["0", "6"]], { project, module, request } = setup(matrix);
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      diagonalResult(matrix, 0, ["2", "6"]), runtime);
    const reopened = parseMath3DProject(serializeMath3DProject(addMath3DProjectAlgebraEvidence(project, evidence)));
    expect(reopened.algebraEvidence?.[0].result).toEqual(evidence.result);
    expect(reopened.algebraEvidence?.[0].request.params.targetHash).toBe(module.contentHash);
    expect((reopened.algebraEvidence?.[0].result as typeof evidence.result & { torsionOrders: string[] }).torsionOrders)
      .toEqual(["2", "6"]);
  });

  it("classifies a free summand, a free module and the zero module", () => {
    for (const [matrix, freeRank, torsion] of [
      [[["2"], ["0"]], 1, ["2"]], [[[], []], 2, []], [[["1"]], 0, []],
    ] as [string[][], number, string[]][]) {
      const { project, request } = setup(matrix);
      expect(createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
        diagonalResult(matrix, freeRank, torsion), runtime).result).toMatchObject({ freeRank, torsionOrders: torsion });
    }
  });

  it("rejects false torsion, invalid witnesses, altered relation snapshots and unavailable routes", () => {
    const matrix = [["2", "0"], ["0", "6"]], { project, target, request } = setup(matrix);
    const correct = diagonalResult(matrix, 0, ["2", "6"]);
    expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { ...correct, torsionOrders: ["3", "4"] }, runtime)).toThrow();
    expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { ...correct, smith: { ...correct.smith!, transformations: { ...correct.smith!.transformations,
        left: [["1", "1"], ["0", "1"]] } } }, runtime)).toThrow();
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, correct, runtime);
    expect(() => parseProjectAlgebraEvidence({ ...evidence, request: { ...request,
      params: { ...request.params, matrix: [["2", "0"], ["0", "8"]] } } },
    project.identity.id, project.algebraObjects!)).toThrow(/differs/);
    const gate = algebraOperationsFor(project, target, [{ backend: "docker", available: false,
      operations: [], reason: "unavailable" }]).find((item) => item.definition.id === "sage.module.invariantFactors")!;
    expect(gate.readyBackend).toBeNull();
    expect(gate.runtimeReason).toContain("unavailable");
  });
});
