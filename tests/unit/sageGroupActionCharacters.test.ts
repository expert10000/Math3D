import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, algebraOperationsFor, buildAlgebraOperationRequest,
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraEvidence, createProjectAlgebraObjectId, parseMath3DProject,
  serializeMath3DProject, upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const setup = (factor: 2 | 3 = 2) => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: `sage-g07-c${factor}`, title: "Group action" });
  const group = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "G"),
    label: "G", revision: 1, definition: { kind: "finite-group", representation: "abelian",
      invariantFactors: [factor], generators: ["a"] } });
  project = upsertMath3DProjectAlgebraObject(project, group);
  return { project, group, ref: { objectId: group.id, revision: 1 } };
};
const result = (factor: 2 | 3, point: number) => factor === 2 ? {
  format: "math3d.sage-group-action-result", schemaVersion: 1, order: 2, actionDegree: 2,
  point, gapVersion: "4.11.1", orbit: [1, 2], stabilizer: [0],
  generatorMatrices: [[[0, 1], [1, 0]]], permutationCharacter: [2, 0],
  conjugacyClasses: [[0], [1]], characterStatus: "integer-table",
  irreducibleCharacters: [[1, -1], [1, 1]], multiplicities: [1, 1],
} : {
  format: "math3d.sage-group-action-result", schemaVersion: 1, order: 3, actionDegree: 3,
  point, gapVersion: "4.11.1", orbit: [1, 2, 3], stabilizer: [0],
  generatorMatrices: [[[0, 0, 1], [1, 0, 0], [0, 1, 0]]], permutationCharacter: [3, 0, 0],
  conjugacyClasses: [[0], [1], [2]], characterStatus: "nonintegral-table",
  irreducibleCharacters: null, multiplicities: null,
};

describe("SAGE-G07 pinned group actions and characters", () => {
  it("checks exact C2 representation, saves evidence and independently reopens it", () => {
    let { project, group, ref } = setup();
    const request = buildAlgebraOperationRequest(project, ref, "sage.group.actionCharacters", "docker", { point: 1 });
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, result(2, 1),
      { engine: "sagemath", version: "9.5", backend: "docker", jobId: "sageg07-c2", elapsedMs: 1, warnings: [] });
    project = addMath3DProjectAlgebraEvidence(project, evidence);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    expect(reopened.algebraEvidence?.[0].request.target).toEqual(ref);
    expect(reopened.algebraEvidence?.[0].targetHash).toBe(group.contentHash);
    expect(reopened.algebraEvidence?.[0].result).toMatchObject({ orbit: [1, 2], stabilizer: [0],
      multiplicities: [1, 1] });
  });

  it("keeps exact C3 action while explicitly withholding its nonintegral irreducible table", () => {
    const { project, ref } = setup(3);
    const request = buildAlgebraOperationRequest(project, ref, "sage.group.actionCharacters", "docker", { point: 2 });
    expect(createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, result(3, 2),
      { engine: "sagemath", version: "9.5", backend: "docker", jobId: "sageg07-c3", elapsedMs: 1, warnings: [] }).result)
      .toMatchObject({ characterStatus: "nonintegral-table", irreducibleCharacters: null });
  });

  it("rejects forged action data, invalid points and unavailable routes", () => {
    const { project, ref } = setup();
    expect(() => buildAlgebraOperationRequest(project, ref, "sage.group.actionCharacters", "docker", { point: 3 }))
      .toThrow(/point from 1 to 2/);
    const request = buildAlgebraOperationRequest(project, ref, "sage.group.actionCharacters", "docker", { point: 1 });
    const runtime = { engine: "sagemath" as const, version: "9.5", backend: "docker" as const,
      jobId: "sageg07-invalid", elapsedMs: 1, warnings: [] };
    for (const forged of [
      { ...result(2, 1), orbit: [1] },
      { ...result(2, 1), generatorMatrices: [[[1, 0], [0, 1]]] },
      { ...result(2, 1), irreducibleCharacters: [[1, 1], [1, 1]] },
      { ...result(2, 1), characterStatus: "nonintegral-table", irreducibleCharacters: null, multiplicities: null },
    ]) expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      forged, runtime)).toThrow();
    const unavailable = algebraOperationsFor(project, ref, [{ backend: "docker", available: true,
      operations: ["group.dossier"] }]).find((item) => item.definition.id === "sage.group.actionCharacters");
    expect(unavailable?.readyBackend).toBeNull();
  });
});
