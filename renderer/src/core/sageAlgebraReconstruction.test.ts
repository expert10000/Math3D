import { describe, expect, it } from "vitest";
import {
  buildSageAlgebraReconstructionInput, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, parseSageAlgebraReconstructionInput,
  parseSageAlgebraReconstructionResult,
  upsertMath3DProjectAlgebraObject,
} from "@math3d/core";

const fixture = () => {
  const workspace = createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [], artifacts: [],
    relations: [], committedSelection: null, constructions: [] });
  let project = createMath3DProject(workspace, { stableKey: "sage-a04-snapshot" });
  const q = createProjectAlgebraObjectId(project.identity.id, "Q");
  const f5 = createProjectAlgebraObjectId(project.identity.id, "F5");
  const r = createProjectAlgebraObjectId(project.identity.id, "R");
  project = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({ id: q, label: "Q", revision: 1,
    definition: { kind: "rational-field" } }));
  project = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({ id: f5, label: "F5", revision: 1,
    definition: { kind: "finite-field", characteristic: 5, degree: 1, generator: "a", construction: "canonical" } }));
  project = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({ id: r, label: "R", revision: 1,
    definition: { kind: "polynomial-ring", coefficientDomain: { objectId: q, revision: 1 },
      variables: ["x", "y"], monomialOrder: "degrevlex" } }));
  return { project, q, f5, r };
};

describe("SAGE-A04 bounded algebra reconstruction input", () => {
  it("captures only the exact parent-before-child closure for QQ[x,y]", () => {
    const { project, q, f5, r } = fixture();
    const input = buildSageAlgebraReconstructionInput(project, { objectId: r, revision: 1 });
    expect(input).toMatchObject({ format: "math3d.sage-algebra-reconstruction", schemaVersion: 1,
      projectId: project.identity.id, target: { objectId: r, revision: 1 } });
    expect(input.objects.map((item) => [item.id, item.revision])).toEqual([[q, 1], [r, 1]]);
    expect(input.objects.map((item) => item.id)).not.toContain(f5);
    expect(parseSageAlgebraReconstructionInput(JSON.parse(JSON.stringify(input)))).toEqual(input);
    expect(Object.isFrozen(input.objects)).toBe(true);
  });

  it("keeps historical R@1 pinned while R@2 reconstructs over GF(5)", () => {
    const { project, q, f5, r } = fixture();
    const changed = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({ id: r, label: "R",
      revision: 2, definition: { kind: "polynomial-ring", coefficientDomain: { objectId: f5, revision: 1 },
        variables: ["x", "y"], monomialOrder: "degrevlex" } }));
    expect(buildSageAlgebraReconstructionInput(changed, { objectId: r, revision: 1 }).objects.map((item) => item.id))
      .toEqual([q, r]);
    expect(buildSageAlgebraReconstructionInput(changed, { objectId: r, revision: 2 }).objects.map((item) => item.id))
      .toEqual([f5, r]);
  });

  it("rejects code fields, forged hashes, missing parents and unrelated records", () => {
    const { project, q, f5, r } = fixture();
    const input = buildSageAlgebraReconstructionInput(project, { objectId: r, revision: 1 });
    expect(() => parseSageAlgebraReconstructionInput({ ...input, code: "print(1)" })).toThrow(/envelope/);
    expect(() => parseSageAlgebraReconstructionInput({ ...input, objects: [input.objects[1], input.objects[0]] }))
      .toThrow(/parent|target/);
    expect(() => parseSageAlgebraReconstructionInput({ ...input, objects: [input.objects[1]] }))
      .toThrow(/parent/);
    const extra = buildSageAlgebraReconstructionInput(project, { objectId: f5, revision: 1 }).objects[0];
    expect(() => parseSageAlgebraReconstructionInput({ ...input, objects: [extra, ...input.objects] }))
      .toThrow(/unrelated/);
    expect(() => parseSageAlgebraReconstructionInput({ ...input, objects: [
      { ...input.objects[0], contentHash: "sha256:" + "0".repeat(64) }, input.objects[1],
    ] })).toThrow(/contentHash/);
    expect(() => buildSageAlgebraReconstructionInput(project, { objectId: q, revision: 2 })).toThrow(/Missing Sage algebra object/);
    expect(() => parseSageAlgebraReconstructionInput({ ...input, extra: "x".repeat(33 * 1024) })).toThrow(/32 KiB/);
  });

  it("accepts structured Sage metadata only for the exact requested revision and variables", () => {
    const { project, r } = fixture();
    const input = buildSageAlgebraReconstructionInput(project, { objectId: r, revision: 1 });
    const result = { format: "math3d.sage-algebra-reconstruction-result", schemaVersion: 1,
      target: input.target, kind: "polynomial-ring", definitionHash: input.objects[1].contentHash,
      text: "Multivariate Polynomial Ring in x, y over Rational Field", latex: "Q[x,y]",
      characteristic: "0", isField: false, baseRing: "Rational Field", variables: ["x", "y"] };
    expect(parseSageAlgebraReconstructionResult(result, input)).toEqual(result);
    expect(() => parseSageAlgebraReconstructionResult({ ...result, variables: ["y", "x"] }, input))
      .toThrow(/metadata/);
    expect(() => parseSageAlgebraReconstructionResult({ ...result, definitionHash: "sha256:" + "0".repeat(64) }, input))
      .toThrow(/mismatched/);
    expect(() => parseSageAlgebraReconstructionResult({ ...result, characteristic: "5" }, input))
      .toThrow(/mismatched/);
    expect(() => parseSageAlgebraReconstructionResult({ ...result, code: "print(1)" }, input))
      .toThrow(/mismatched/);
  });

  it("enforces the worker's numeric and variable limits before submission", () => {
    const { project, q } = fixture();
    const modularId = createProjectAlgebraObjectId(project.identity.id, "large-modulus");
    const modular = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({ id: modularId,
      label: "Large modulus", revision: 1, definition: { kind: "modular-ring", modulus: "9".repeat(129) } }));
    expect(() => buildSageAlgebraReconstructionInput(modular, { objectId: modularId, revision: 1 }))
      .toThrow(/128-digit/);
    const finiteId = createProjectAlgebraObjectId(project.identity.id, "large-field");
    const finite = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({ id: finiteId,
      label: "Large field", revision: 1, definition: { kind: "finite-field", characteristic: 65537,
        degree: 1, generator: "a", construction: "canonical" } }));
    expect(() => buildSageAlgebraReconstructionInput(finite, { objectId: finiteId, revision: 1 }))
      .toThrow(/65536/);
    const polyId = createProjectAlgebraObjectId(project.identity.id, "many-variables");
    const many = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({ id: polyId,
      label: "Many variables", revision: 1, definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: q, revision: 1 }, variables: Array.from({ length: 9 }, (_, index) => `x${index}`),
        monomialOrder: "lex" } }));
    expect(() => buildSageAlgebraReconstructionInput(many, { objectId: polyId, revision: 1 }))
      .toThrow(/eight variables/);
  });
});
