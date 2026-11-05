import { describe, expect, it } from "vitest";
import fixture from "../fixtures/sage-galois-x4-minus-2-sage95.json";
import cubicFixture from "../fixtures/sage-galois-x3-minus-2-sage95.json";
import { addMath3DProjectAlgebraEvidence, algebraOperationsFor, buildAlgebraOperationRequest,
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraEvidence, createProjectAlgebraObjectId, parseMath3DProject,
  parseSageGaloisResult, sageGaloisCovers, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-d06", title: "Galois correspondence" });
  const q = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Q"),
    revision: 1, label: "Q", definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, q);
  const r = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "R"),
    revision: 1, label: "R", definition: { kind: "polynomial-ring",
      coefficientDomain: { objectId: q.id, revision: 1 }, variables: ["x"], monomialOrder: "lex" } });
  project = upsertMath3DProjectAlgebraObject(project, r);
  const target = { objectId: r.id, revision: 1 };
  const request = buildAlgebraOperationRequest(project, target, "sage.galois.analyze", "docker", { polynomial: "x^4-2" });
  return { project, q, r, target, request };
};

describe("SAGE-D06 bounded Galois analysis", () => {
  it("checks a distinct cubic S3 correspondence without a D4 label", () => {
    const { project, target } = setup();
    const request = buildAlgebraOperationRequest(project, target, "sage.galois.analyze", "docker", { polynomial: "x^3-2" });
    const result = parseSageGaloisResult(cubicFixture, request.params as never);
    expect(result.group).toMatchObject({ order: 6, transitiveId: "3T2", classification: "unclassified" });
    expect(result.subgroups).toHaveLength(6);
    expect(result.subgroups.map((item) => item.order * item.fixedField.degree)).toEqual([6, 6, 6, 6, 6, 6]);
  });

  it("checks the real Sage 9.5 D4 fixture, complete subgroup lattice, and independent Project reopen", () => {
    const { project, r, request, target } = setup();
    const parsed = parseSageGaloisResult(fixture, request.params as never);
    expect(parsed.group).toMatchObject({ order: 8, regularDegree: 8, transitiveId: "4T3", classification: "D4" });
    expect(parsed.subgroups).toHaveLength(10);
    expect(sageGaloisCovers(parsed)).toHaveLength(15);
    expect(parsed.subgroups.find((item) => item.order === 8)?.fixedField.degree).toBe(1);
    expect(parsed.subgroups.find((item) => item.order === 1)?.fixedField.degree).toBe(8);
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, fixture,
      { engine: "sagemath", version: "9.5", backend: "docker", jobId: "d06-fixture", elapsedMs: 1, warnings: [] });
    const reopened = parseMath3DProject(serializeMath3DProject(addMath3DProjectAlgebraEvidence(project, evidence)));
    expect(reopened.algebraEvidence?.[0]).toEqual(evidence);
    expect(reopened.algebraEvidence?.[0].request.target).toEqual(target);
    expect(reopened.algebraObjects?.find((item) => item.id === r.id)?.revisions[0].contentHash).toBe(r.contentHash);
    expect(algebraOperationsFor(project, target, [{ backend: "docker", available: true, operations: ["galois.analyze"] }])
      .find((item) => item.definition.id === "sage.galois.analyze")?.readyBackend).toBe("docker");
  });

  it("rejects forged permutation, missing subgroup, wrong fixed degree, bad parent and historical ring", () => {
    const { project, q, r, request, target } = setup();
    const altered = structuredClone(fixture);
    altered.group.elements[1][0] = 1;
    expect(() => parseSageGaloisResult(altered, request.params as never)).toThrow(/permutation/);
    const missing = { ...fixture, subgroups: fixture.subgroups.slice(1) };
    expect(() => parseSageGaloisResult(missing, request.params as never)).toThrow(/subgroup/);
    const degree = structuredClone(fixture);
    degree.subgroups[1].fixedField.degree = 3;
    expect(() => parseSageGaloisResult(degree, request.params as never)).toThrow(/fixed-field degree/);
    expect(() => buildAlgebraOperationRequest(project, target, "sage.galois.analyze", "docker",
      { polynomial: "y^4-2" })).toThrow(/pinned QQ\[x\]/);
    const changed = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({ id: r.id,
      revision: 2, label: "R", definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: q.id, revision: 1 }, variables: ["t"], monomialOrder: "lex" } }));
    expect(() => buildAlgebraOperationRequest(changed, target, "sage.galois.analyze", "docker",
      { polynomial: "x^4-2" })).toThrow(/current object revision/);
    expect(() => buildAlgebraOperationRequest(project, { objectId: q.id, revision: 1 },
      "sage.galois.analyze", "docker", { polynomial: "x^4-2" })).toThrow(/does not accept/);
    expect(r.kind).toBe("polynomial-ring");
  });
});
