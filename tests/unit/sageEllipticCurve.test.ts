import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, buildAlgebraOperationRequest, createAlgebraObjectRecord,
  createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraEvidence,
  createProjectAlgebraObjectId, ellipticCurveFacts, ellipticDouble, parseMath3DProject,
  serializeMath3DProject, upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const setup = (finite = false) => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: `sage-g04-${finite}`, title: "Exact elliptic curves" });
  const field = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "base"),
    revision: 1, label: finite ? "F5" : "Q", definition: finite ?
      { kind: "finite-field", characteristic: 5, degree: 1, generator: "a", construction: "canonical" } :
      { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, field);
  const curve = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "curve"),
    revision: 1, label: "E", definition: { kind: "elliptic-curve",
      baseField: { objectId: field.id, revision: 1 }, model: "short-weierstrass",
      a: finite ? "1" : "-1", b: "1" } });
  project = upsertMath3DProjectAlgebraObject(project, curve);
  return { project, field, curve, target: { objectId: curve.id, revision: 1 } };
};

describe("SAGE-G04 elliptic curve objects", () => {
  for (const [finite, discriminant, j, doubled] of [
    [false, "-368", "-6912/23", ["1/4", "-7/8"]],
    [true, "4", "2", ["4", "2"]],
  ] as const) it(`roundtrips ${finite ? "GF(5)" : "QQ"} curve and exact doubling`, () => {
    const { project, field, curve, target } = setup(finite);
    const request = buildAlgebraOperationRequest(project, target, "sage.ellipticCurve.dossier", "docker",
      { point: ["0", "1"] });
    const result = { format: "math3d.sage-elliptic-curve-result", schemaVersion: 1,
      target, targetHash: curve.contentHash, baseField: { objectId: field.id, revision: 1 },
      characteristic: finite ? 5 : 0, discriminant, jInvariant: j, singular: false,
      point: ["0", "1"], doublePoint: doubled };
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, result,
      { engine: "sagemath", version: "9.5", backend: "docker", jobId: "sage-g04-fixture",
        elapsedMs: 1, warnings: [] });
    const reopened = parseMath3DProject(serializeMath3DProject(addMath3DProjectAlgebraEvidence(project, evidence)));
    expect(reopened.algebraObjects?.find((entry) => entry.id === curve.id)?.revisions[0]).toEqual(curve);
    expect(reopened.algebraObjects?.find((entry) => entry.id === field.id)?.revisions[0]).toEqual(field);
    expect(reopened.algebraEvidence?.[0].result).toEqual(result);
    expect(reopened.algebraEvidence?.[0].certificate?.runtime.sageVersion).toBe("9.5");
    expect(ellipticDouble(curve.definition.kind === "elliptic-curve" ? curve.definition.a : "",
      "1", finite ? 5 : 0, ["0", "1"])).toEqual(doubled);
  });

  it("rejects singular models, unsupported characteristics, off-curve points and forged invariants", () => {
    expect(() => ellipticCurveFacts("0", "0")).toThrow(/Singular/);
    expect(() => ellipticCurveFacts("3", "1", 5)).toThrow(/Singular/);
    expect(() => ellipticCurveFacts("1", "1", 3)).toThrow(/require QQ/);
    expect(() => ellipticCurveFacts("1", "1", 9)).toThrow(/prime/);
    expect(ellipticDouble("-1", "0", 0, ["0", "0"])).toBeNull();
    const { project, field, curve, target } = setup();
    expect(() => buildAlgebraOperationRequest(project, target, "sage.ellipticCurve.dossier", "docker",
      { point: ["1", "2"] })).toThrow(/not on/);
    const request = buildAlgebraOperationRequest(project, target, "sage.ellipticCurve.dossier", "docker",
      { point: ["0", "1"] });
    const base = { format: "math3d.sage-elliptic-curve-result", schemaVersion: 1,
      target, targetHash: curve.contentHash, baseField: { objectId: field.id, revision: 1 },
      characteristic: 0, discriminant: "-368", jInvariant: "-6912/23", singular: false,
      point: ["0", "1"], doublePoint: ["1/4", "-7/8"] };
    const runtime = { engine: "sagemath" as const, version: "9.5", backend: "docker" as const,
      jobId: "sage-g04-forged", elapsedMs: 1, warnings: [] };
    for (const result of [{ ...base, discriminant: "-367" }, { ...base, jInvariant: "0" },
      { ...base, doublePoint: ["1/4", "7/8"] }])
      expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
        result, runtime)).toThrow();
  });
});
