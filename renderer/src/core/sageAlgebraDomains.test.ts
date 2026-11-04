import { describe, expect, it } from "vitest";
import { buildSageAlgebraDomainInput, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, parseSageAlgebraDomainInput,
  parseSageAlgebraDomainResult, structuralHash, upsertMath3DProjectAlgebraObject } from "@math3d/core";

const fixture = () => {
  const workspace = createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [], artifacts: [],
    relations: [], committedSelection: null, constructions: [] });
  let project = createMath3DProject(workspace, { stableKey: "sage-a05-domains" });
  const q = createProjectAlgebraObjectId(project.identity.id, "Q");
  const r = createProjectAlgebraObjectId(project.identity.id, "R");
  const qRecord = createAlgebraObjectRecord({ id: q, label: "Q", revision: 1,
    definition: { kind: "rational-field" } });
  const rRecord = createAlgebraObjectRecord({ id: r, label: "R", revision: 1,
    definition: { kind: "polynomial-ring", coefficientDomain: { objectId: q, revision: 1 },
      variables: ["x", "y"], monomialOrder: "degrevlex" } });
  project = upsertMath3DProjectAlgebraObject(project, qRecord);
  project = upsertMath3DProjectAlgebraObject(project, rRecord);
  return { project, q, r, qRecord, rRecord };
};

describe("SAGE-A05 bounded domain contracts", () => {
  it("pins both revisions and rejects mixed projects or executable input", () => {
    const { project, q, r } = fixture();
    const input = buildSageAlgebraDomainInput(project, { objectId: q, revision: 1 }, { objectId: r, revision: 1 });
    expect(input.left.objects.map((item) => item.id)).toEqual([q]);
    expect(input.right.objects.map((item) => item.id)).toEqual([q, r]);
    expect(parseSageAlgebraDomainInput(JSON.parse(JSON.stringify(input)))).toEqual(input);
    expect(() => parseSageAlgebraDomainInput({ ...input, code: "print(1)" })).toThrow(/envelope/);
    expect(() => parseSageAlgebraDomainInput({ ...input, right: { ...input.right,
      projectId: "math3d:project:" + "f".repeat(32) } })).toThrow(/same Project/);
    expect(() => parseSageAlgebraDomainInput({ ...input, left: { ...input.left,
      objects: [{ ...input.left.objects[0], python: "import os" }] } })).toThrow(/unknown fields/);
    const conflicting = createAlgebraObjectRecord({ id: q, label: "Q", revision: 1,
      definition: { kind: "integer-ring" } });
    expect(() => parseSageAlgebraDomainInput({ ...input, right: { ...input.right,
      objects: [conflicting, input.right.objects[1]] } })).toThrow(/Conflicting Sage algebra definition/);
  });

  it("validates pinned parent metadata, directional map identity and typed incompatibility", () => {
    const { project, q, r, qRecord, rRecord } = fixture();
    const input = buildSageAlgebraDomainInput(project, { objectId: q, revision: 1 }, { objectId: r, revision: 1 });
    const left = { ref: { objectId: q, revision: 1 }, definitionHash: qRecord.contentHash,
      kind: "rational-field", text: "Rational Field", characteristic: "0", isField: true,
      isCommutative: true, isExact: true, coefficientDomain: null, variables: [], monomialOrder: null };
    const right = { ref: { objectId: r, revision: 1 }, definitionHash: rRecord.contentHash,
      kind: "polynomial-ring", text: "Multivariate Polynomial Ring", characteristic: "0", isField: false,
      isCommutative: true, isExact: true, coefficientDomain: { objectId: q, revision: 1 },
      variables: ["x", "y"], monomialOrder: "degrevlex" };
    const leftToRight = { source: left.ref, target: right.ref, sourceHash: left.definitionHash,
      targetHash: right.definitionHash, status: "canonical", mapId: structuralHash({ schemaVersion: 1,
        source: { ...left.ref, definitionHash: left.definitionHash },
        target: { ...right.ref, definitionHash: right.definitionHash } }), error: null };
    const rightToLeft = { source: right.ref, target: left.ref, sourceHash: right.definitionHash,
      targetHash: left.definitionHash, status: "incompatible", mapId: null,
      error: { code: "NO_CANONICAL_COERCION", message: "Choose a compatible parent.",
        sourceCharacteristic: "0", targetCharacteristic: "0" } };
    const result = { format: "math3d.sage-algebra-domain-inspection-result", schemaVersion: 1,
      left, right, leftToRight, rightToLeft };
    expect(parseSageAlgebraDomainResult(result, input)).toEqual(result);
    expect(() => parseSageAlgebraDomainResult({ ...result, right: { ...right,
      coefficientDomain: { objectId: r, revision: 1 } } }, input)).toThrow(/descriptor/);
    expect(() => parseSageAlgebraDomainResult({ ...result, leftToRight: { ...leftToRight,
      mapId: "sha256:" + "0".repeat(64) } }, input)).toThrow(/coercion/);
    expect(() => parseSageAlgebraDomainResult({ ...result, rightToLeft: { ...rightToLeft,
      error: { ...rightToLeft.error, sourceCharacteristic: "5" } } }, input)).toThrow(/coercion/);
    expect(parseSageAlgebraDomainResult({ ...result, rightToLeft: { ...rightToLeft,
      status: "failed", error: { ...rightToLeft.error, code: "COERCION_CHECK_FAILED" } } }, input)
      .rightToLeft.status).toBe("failed");
  });
});
