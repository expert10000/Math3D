import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, buildAlgebraOperationRequest, createAlgebraObjectRecord,
  createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraEvidence, createProjectAlgebraObjectId,
  parseMath3DProject, serializeMath3DProject, upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [],
    artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-c02-c04", title: "Ideal computations" });
  const add = (key: string, definition: Parameters<typeof createAlgebraObjectRecord>[0]["definition"]) => {
    const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, key),
      revision: 1, label: key, definition });
    project = upsertMath3DProjectAlgebraObject(project, record);
    return record;
  };
  const q = add("Q", { kind: "rational-field" });
  const r = add("R", { kind: "polynomial-ring", coefficientDomain: { objectId: q.id, revision: 1 },
    variables: ["x", "y"], monomialOrder: "lex" });
  const ideal = add("I", { kind: "ideal", ambientRing: { objectId: r.id, revision: 1 },
    generators: ["x*y-1", "y-1"] });
  const quotient = add("R/I", { kind: "quotient-ring", ambientRing: { objectId: r.id, revision: 1 },
    ideal: { objectId: ideal.id, revision: 1 } });
  return { project, q, r, ideal, quotient, iref: { objectId: ideal.id, revision: 1 },
    qref: { objectId: quotient.id, revision: 1 } };
};
const result = (request: ReturnType<typeof buildAlgebraOperationRequest>, fields: Record<string, unknown>) => ({
  format: "math3d.sage-ideal-result", schemaVersion: 1, target: request.target,
  targetHash: request.params.targetHash, idealHash: request.params.idealHash, ...fields });
const runtime = (jobId: string) => ({ engine: "sagemath" as const, version: "9.5", backend: "docker" as const,
  jobId, elapsedMs: 1, warnings: [] });

describe("SAGE-C02–C04 typed saved ideal operations", () => {
  it("keeps quotient parent revisions and exact evidence after independent Project import", () => {
    let { project, r, ideal, quotient, iref, qref } = setup();
    const requests = [
      buildAlgebraOperationRequest(project, iref, "sage.ideal.groebner", "docker", {}),
      buildAlgebraOperationRequest(project, iref, "sage.ideal.eliminate", "docker", { eliminate: ["x"] }),
      buildAlgebraOperationRequest(project, iref, "sage.ideal.membership", "docker", { polynomial: "x-1" }),
      buildAlgebraOperationRequest(project, iref, "sage.ideal.membership", "docker", { polynomial: "x" }),
      buildAlgebraOperationRequest(project, qref, "sage.ideal.quotientDimension", "docker", {}),
    ];
    const outputs = [
      { basis: ["x - 1", "y - 1"] },
      { basis: ["y - 1"], eliminate: ["x"] },
      { basis: ["x - 1", "y - 1"], polynomial: "x-1", member: true, normalForm: "0" },
      { basis: ["x - 1", "y - 1"], polynomial: "x", member: false, normalForm: "1" },
      { dimension: 0, quotientPresentation: "Quotient of R by I" },
    ];
    requests.forEach((request, index) => {
      const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
        result(request, outputs[index]), runtime(`sagec0${index + 2}`));
      project = addMath3DProjectAlgebraEvidence(project, evidence);
    });
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    expect(reopened.algebraObjects?.find((item) => item.id === quotient.id)?.revisions[0].definition)
      .toEqual({ kind: "quotient-ring", ambientRing: { objectId: r.id, revision: 1 }, ideal: iref });
    expect(reopened.algebraEvidence).toHaveLength(5);
    const dimension = reopened.algebraEvidence?.find((item) => item.request.operation === "sage.ideal.quotientDimension");
    expect(dimension?.request.target).toEqual(qref);
    expect(dimension?.result).toMatchObject({ dimension: 0, idealHash: ideal.contentHash });
  });

  it("rejects incompatible quotient parents, invalid membership and altered saved ideal snapshots", () => {
    const { project, q, r, ideal, iref } = setup();
    expect(() => upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({
      id: createProjectAlgebraObjectId(project.identity.id, "bad-quotient"), revision: 1, label: "bad",
      definition: { kind: "quotient-ring", ambientRing: { objectId: q.id, revision: 1 }, ideal: iref } })))
      .toThrow(/pinned polynomial ambient ring/);
    expect(() => buildAlgebraOperationRequest(project, iref, "sage.ideal.membership", "docker",
      { polynomial: "z+1" })).toThrow(/outside the ambient ring/);
    expect(() => buildAlgebraOperationRequest(project, iref, "sage.ideal.eliminate", "docker",
      { eliminate: ["x", "y"] })).toThrow(/not all/);
    const request = buildAlgebraOperationRequest(project, iref, "sage.ideal.groebner", "docker", {});
    const forged = { ...request, params: { ...request.params, idealHash: `sha256:${"0".repeat(64)}` } };
    expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, forged,
      result(forged, { basis: ["x - 1", "y - 1"] }), runtime("forged"))).toThrow(/pinned Project definitions/);
    expect(r.kind).toBe("polynomial-ring");
    expect(ideal.kind).toBe("ideal");
  });
});
