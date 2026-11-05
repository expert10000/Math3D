import { describe, expect, it } from "vitest";
import fixture from "../fixtures/sage-galois-x4-minus-2-sage95.json";
import cubicFixture from "../fixtures/sage-galois-x3-minus-2-sage95.json";
import partialFixture from "../fixtures/sage-galois-a4-partial-sage95.json";
import { addMath3DProjectAlgebraEvidence, algebraOperationsFor, buildAlgebraOperationRequest,
  createAlgebraObjectRecord, createGaloisGroupObject, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraEvidence, createProjectAlgebraObjectId, parseMath3DProject,
  inspectProjectAlgebraFreshness, parseSageGaloisResult, sageGaloisCovers, serializeMath3DProject,
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
  it("reopens a pinned finite group and marks it stale when the source ring advances", () => {
    const { project, q, r, request } = setup();
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, fixture,
      { engine: "sagemath", version: "9.5", backend: "docker", jobId: "d06-group", elapsedMs: 1, warnings: [] });
    let saved = addMath3DProjectAlgebraEvidence(project, evidence);
    const group = createGaloisGroupObject(saved, evidence);
    expect(group.definition).toMatchObject({ kind: "finite-group", representation: "permutation", degree: 8,
      source: { evidenceId: evidence.id, ring: { objectId: r.id, revision: 1 } } });
    expect(group.dependencies).toEqual([{ objectId: r.id, revision: 1 }]);
    saved = upsertMath3DProjectAlgebraObject(saved, group);
    const reopened = parseMath3DProject(serializeMath3DProject(saved));
    expect(reopened.algebraObjects?.find((item) => item.id === group.id)?.revisions[0]).toEqual(group);
    const gapRequest = buildAlgebraOperationRequest(reopened, { objectId: group.id, revision: 1 },
      "sage.group.dossier", "docker", {});
    expect(gapRequest.params).toMatchObject({ target: { objectId: group.id, revision: 1 },
      definition: { source: { evidenceId: evidence.id } } });
    const revised = upsertMath3DProjectAlgebraObject(reopened, createAlgebraObjectRecord({ id: r.id,
      revision: 2, label: "R", definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: q.id, revision: 1 }, variables: ["t"], monomialOrder: "lex" } }));
    expect(inspectProjectAlgebraFreshness(revised).find((item) => item.objectId === group.id)?.status).toBe("stale");
    expect(() => buildAlgebraOperationRequest(revised, { objectId: group.id, revision: 1 },
      "sage.group.dossier", "docker", {})).toThrow(/stale/);
  });
  it("marks the order-twelve quartic correspondence partial and rejects a forged complete claim", () => {
    const { project, target } = setup();
    const request = buildAlgebraOperationRequest(project, target, "sage.galois.analyze", "docker",
      { polynomial: "x^4-3*x^3+3*x^2+2*x+1" });
    const result = parseSageGaloisResult(partialFixture, request.params as never);
    expect(result).toMatchObject({ complete: false, omittedCount: 2, group: { order: 12 } });
    expect(result.subgroups.map((item) => item.order * item.fixedField.degree))
      .toEqual(Array(result.subgroups.length).fill(12));
    expect(() => parseSageGaloisResult({ ...partialFixture, complete: true },
      request.params as never)).toThrow(/schema|bound/);
  });
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
