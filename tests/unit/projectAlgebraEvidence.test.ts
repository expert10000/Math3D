import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, buildAlgebraOperationRequest, createAlgebraObjectRecord,
  createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraEvidence,
  createProjectAlgebraObjectId, parseMath3DProject, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-b05", title: "Sage evidence" });
  const z = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Z"),
    revision: 1, label: "Z", definition: { kind: "integer-ring" } });
  project = upsertMath3DProjectAlgebraObject(project, z);
  const request = buildAlgebraOperationRequest(project, { objectId: z.id, revision: 1 },
    "sage.numberTheory.gcd", "docker", { values: ["84", "30"] });
  const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
    { value: "6" }, { engine: "sagemath", version: "9.5", backend: "docker", jobId: "b05-gcd-1",
      elapsedMs: 12, warnings: [] });
  return { project, z, request, evidence };
};

describe("SAGE-B05 Project algebra evidence", () => {
  it("roundtrips exact result, request, object revision and runtime provenance", () => {
    const { project, z, evidence } = setup();
    const saved = addMath3DProjectAlgebraEvidence(project, evidence);
    const reopened = parseMath3DProject(serializeMath3DProject(saved));
    expect(reopened.algebraEvidence).toEqual([evidence]);
    expect(reopened.algebraEvidence![0].request.target).toEqual({ objectId: z.id, revision: 1 });
    expect(reopened.algebraEvidence![0].result).toEqual({ value: "6" });
    expect(reopened.algebraEvidence![0].runtime.version).toBe("9.5");
    expect(() => addMath3DProjectAlgebraEvidence(reopened, evidence)).toThrow(/Duplicate/);
  });

  it("retains prior evidence after an object revision advances", () => {
    const { project, z, evidence } = setup();
    const saved = addMath3DProjectAlgebraEvidence(project, evidence);
    const next = upsertMath3DProjectAlgebraObject(saved, createAlgebraObjectRecord({ id: z.id,
      revision: 2, label: "Integers", definition: { kind: "integer-ring" } }));
    expect(parseMath3DProject(serializeMath3DProject(next)).algebraEvidence![0]).toEqual(evidence);
  });

  it("rejects missing targets, changed results, invalid provenance and duplicate IDs on import", () => {
    const { project, evidence } = setup();
    expect(() => createProjectAlgebraEvidence(project.identity.id, [], evidence.request, { value: "6" },
      evidence.runtime)).toThrow(/target revision/);
    const saved = addMath3DProjectAlgebraEvidence(project, evidence);
    for (const changed of [
      { ...evidence, result: { value: "7" } },
      { ...evidence, runtime: { ...evidence.runtime, backend: "private" } },
      { ...evidence, targetHash: "sha256:" + "0".repeat(64) },
    ]) {
      const raw = JSON.parse(serializeMath3DProject(saved));
      raw.algebraEvidence = [changed];
      expect(() => parseMath3DProject(JSON.stringify(raw))).toThrow();
    }
    const duplicate = JSON.parse(serializeMath3DProject(saved));
    duplicate.algebraEvidence.push(evidence);
    expect(() => parseMath3DProject(JSON.stringify(duplicate))).toThrow(/Duplicate/);
  });
});
