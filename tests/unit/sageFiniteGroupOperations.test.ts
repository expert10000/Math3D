import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, algebraOperationsFor, buildAlgebraOperationRequest,
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraEvidence, createProjectAlgebraObjectId, FINITE_GROUP_PRESETS,
  parseMath3DProject, parseProjectAlgebraEvidence, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";
import d4Result from "../fixtures/sage-group-d4-sage95.json";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-e02", title: "Finite group dossier" });
  const preset = FINITE_GROUP_PRESETS.find((item) => item.id === "D4")!;
  const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "D4"),
    revision: 1, label: "D4", definition: preset.definition });
  project = upsertMath3DProjectAlgebraObject(project, record);
  const target = { objectId: record.id, revision: 1 };
  const request = buildAlgebraOperationRequest(project, target, "sage.group.dossier", "docker", {});
  return { project, record, target, request };
};

describe("SAGE-E02 GAP group dossier", () => {
  it("checks D4's complete invariants and independently reopens pinned Project evidence", () => {
    const { project, record, request } = setup();
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, d4Result,
      { engine: "sagemath", version: "9.5", backend: "docker", jobId: "sage-e02-d4",
        elapsedMs: 1, warnings: [] });
    const reopened = parseMath3DProject(serializeMath3DProject(addMath3DProjectAlgebraEvidence(project, evidence)));
    expect(reopened.algebraObjects?.[0].revisions[0]).toEqual(record);
    expect(reopened.algebraEvidence?.[0].result).toEqual(d4Result);
    expect(reopened.algebraEvidence?.[0].request.params.targetHash).toBe(record.contentHash);
    expect(reopened.algebraEvidence?.[0].certificate?.runtime).toMatchObject({
      subsystem: "GAP", subsystemVersion: d4Result.gapVersion, algorithm: null });
    expect((reopened.algebraEvidence?.[0].result as typeof d4Result).subgroups).toHaveLength(10);
  });

  it("rejects a forged center, subgroup, source definition, and unavailable runtime", () => {
    const { project, record, target, request } = setup();
    const runtime = { engine: "sagemath" as const, version: "9.5", backend: "docker" as const,
      jobId: "sage-e02-forged", elapsedMs: 1, warnings: [] };
    expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { ...d4Result, center: [0] }, runtime)).toThrow(/disagrees/);
    expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { ...d4Result, subgroups: d4Result.subgroups.slice(0, -1) }, runtime)).toThrow(/disagrees/);
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, d4Result, runtime);
    expect(() => parseProjectAlgebraEvidence({ ...evidence, request: { ...request,
      params: { ...request.params, definition: FINITE_GROUP_PRESETS[0].definition } } },
    project.identity.id, project.algebraObjects!)).toThrow();
    const offline = algebraOperationsFor(project, target, [{ backend: "docker", available: true,
      operations: ["algebra.reconstruct"] }]).find((item) => item.definition.id === "sage.group.dossier")!;
    expect(offline.readyBackend).toBeNull();
    expect(offline.runtimeReason).toContain("group.dossier");
    expect(request.params.targetHash).toBe(record.contentHash);
  });

  it("marks oversized E01 groups ineligible before runtime dispatch", () => {
    let project = setup().project;
    const definition = { kind: "finite-group" as const, representation: "abelian" as const,
      invariantFactors: [4, 8], generators: ["a", "b"] };
    const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "large"),
      revision: 1, label: "C4 × C8", definition });
    project = upsertMath3DProjectAlgebraObject(project, record);
    const target = { objectId: record.id, revision: 1 };
    const gate = algebraOperationsFor(project, target, [{ backend: "docker", available: true,
      operations: ["group.dossier"] }]).find((item) => item.definition.id === "sage.group.dossier")!;
    expect(gate.reason).toContain("order at most 16");
    expect(() => buildAlgebraOperationRequest(project, target, "sage.group.dossier", "docker", {})).toThrow();
  });
});
