import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, buildAlgebraOperationRequest, captureProjectResources,
  exportProjectPackage, parseProjectPackage, createAlgebraObjectRecord,
  createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraEvidence,
  createProjectAlgebraObjectId, parseMath3DProject, serializeMath3DProject,
  parseProjectAlgebraEvidence,
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

  it("certifies exact Q[x,y] source revisions and rejects forged execution claims on independent import", () => {
    let { project } = setup();
    const q = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Q"),
      revision: 1, label: "Q", definition: { kind: "rational-field" } });
    project = upsertMath3DProjectAlgebraObject(project, q);
    const ring = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "R"),
      revision: 1, label: "R", definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: q.id, revision: 1 }, variables: ["x", "y"],
        monomialOrder: "degrevlex" } });
    project = upsertMath3DProjectAlgebraObject(project, ring);
    const request = buildAlgebraOperationRequest(project, { objectId: ring.id, revision: 1 },
      "sage.algebra.reconstruct", "docker", {});
    const result = { format: "math3d.sage-algebra-reconstruction-result", schemaVersion: 1,
      target: request.target, kind: "polynomial-ring", definitionHash: ring.contentHash,
      text: "Multivariate Polynomial Ring in x, y over Rational Field", latex: "Q[x,y]",
      characteristic: "0", isField: false, baseRing: "Rational Field", variables: ["x", "y"] };
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      result, { engine: "sagemath", version: "10.10", backend: "docker", jobId: "f05-ring",
        elapsedMs: 23, warnings: [] });
    expect(evidence.certificate).toMatchObject({ schemaVersion: 1,
      operation: { id: request.operation, inputSchema: "math3d.sage-algebra-reconstruction/v1" },
      runtime: { route: "docker", sageVersion: "10.10", algorithm: null, proofMode: null,
        peakMemoryBytes: null }, verifier: { level: "schema-and-binding", mathematicalProof: false } });
    expect(evidence.certificate?.sources).toEqual([
      { objectId: q.id, revision: 1, contentHash: q.contentHash },
      { objectId: ring.id, revision: 1, contentHash: ring.contentHash },
    ].sort((a, b) => a.objectId.localeCompare(b.objectId)));
    const saved = addMath3DProjectAlgebraEvidence(project, evidence);
    const packageText = exportProjectPackage(saved, captureProjectResources(saved, () => null, true));
    expect(parseProjectPackage(packageText).project.algebraEvidence![0].certificate).toEqual(evidence.certificate);
    for (const certificate of [
      { ...evidence.certificate!, runtime: { ...evidence.certificate!.runtime, algorithm: "Buchberger" } },
      { ...evidence.certificate!, sources: evidence.certificate!.sources.slice(1) },
      { ...evidence.certificate!, verifier: { ...evidence.certificate!.verifier, mathematicalProof: true } },
    ]) {
      expect(() => parseProjectAlgebraEvidence({ ...evidence, certificate },
        project.identity.id, project.algebraObjects!)).toThrow(/certificate/);
      const changed = JSON.parse(packageText);
      changed.project.algebraEvidence[0].certificate = certificate;
      expect(() => parseProjectPackage(JSON.stringify(changed))).toThrow();
    }
    const { certificate: _certificate, ...legacyEvidence } = evidence;
    const legacyProject = addMath3DProjectAlgebraEvidence(project, legacyEvidence);
    const legacyPackage = exportProjectPackage(legacyProject,
      captureProjectResources(legacyProject, () => null, true));
    expect(parseProjectPackage(legacyPackage).project.algebraEvidence![0].certificate).toBeUndefined();
  });
});
