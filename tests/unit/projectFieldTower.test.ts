import { describe, expect, it } from "vitest";
import { analyzeBiquadraticExtensionFromDefinition, buildProjectFieldTower,
  buildSageAlgebraReconstructionInput, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, inspectProjectAlgebraFreshness,
  parseMath3DProject, parseSageAlgebraReconstructionResult, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";
import { createStructureStarter } from "../../renderer/src/features/sageLab/sageStructuresModel";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [],
    artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-d05", title: "Field tower" });
  const q = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Q"),
    revision: 1, label: "Q", definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, q);
  const k = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "K"),
    revision: 1, label: "K", definition: { kind: "number-field", baseField: { objectId: q.id, revision: 1 },
      definingPolynomial: ["-2", "0", "1"], generator: "a" } });
  project = upsertMath3DProjectAlgebraObject(project, k);
  const l = createStructureStarter(project, { kind: "field-extension", label: "L",
    coefficientDomain: { objectId: k.id, revision: 1 }, towerRadicand: "3", generator: "b" }, "L");
  return { project, q, k, l };
};

describe("SAGE-D05 pinned extension towers", () => {
  it("draws Q→Q(√2)→Q(√2,√3) with exact inclusions and degree products after independent import", () => {
    const { project, q, k, l } = setup();
    const saved = upsertMath3DProjectAlgebraObject(project, l);
    const reopened = parseMath3DProject(serializeMath3DProject(saved));
    expect(reopened.algebraObjects?.find((item) => item.id === l.id)?.revisions[0]).toEqual(l);
    expect(l.dependencies).toEqual([{ objectId: k.id, revision: 1 }]);
    const tower = buildProjectFieldTower(reopened);
    expect(tower.nodes.map((node) => [node.label, node.absoluteDegree, node.depth])).toEqual([
      ["Q", 1, 0], ["K", 2, 1], ["L", 4, 2],
    ]);
    expect(tower.edges.map((edge) => edge.degreeProduct)).toEqual(["1 × 2 = 2", "2 × 2 = 4"]);
    const top = tower.edges.find((edge) => edge.extension.objectId === l.id)!;
    expect(top.base).toEqual({ objectId: k.id, revision: 1 });
    expect(top.embedding).toBe("a ↦ a");
    expect(top.composedInclusion).toEqual({ source: { objectId: q.id, revision: 1 }, embedding: "q ↦ q" });
    expect(top.basisCoordinates).toEqual(["0", "1", "0", "0"]);
    expect(top.relationChecks).toEqual(["a^2 - 2 = 0", "b^2 - 3 = 0"]);
    expect(analyzeBiquadraticExtensionFromDefinition(["-2", "0", "1"], "a", "3", "b").absoluteBasis)
      .toEqual(["1", "a", "b", "a*b"]);
    expect(tower.edges[0].base.objectId).toBe(q.id);
  });

  it("rejects unproven inclusions, wrong parents and tampered Sage degree metadata", () => {
    const { project, q, k, l } = setup();
    expect(() => createStructureStarter(project, { kind: "field-extension", label: "Same",
      coefficientDomain: { objectId: k.id, revision: 1 }, towerRadicand: "2", generator: "b" }, "same"))
      .toThrow(/already a square/);
    expect(() => createStructureStarter(project, { kind: "field-extension", label: "Wrong",
      coefficientDomain: { objectId: q.id, revision: 1 }, towerRadicand: "3", generator: "b" }, "wrong"))
      .toThrow(/quadratic base/);
    expect(() => createStructureStarter(project, { kind: "field-extension", label: "Bad",
      coefficientDomain: { objectId: k.id, revision: 1 }, towerRadicand: "4", generator: "b" }, "bad"))
      .toThrow(/squarefree/);
    const saved = upsertMath3DProjectAlgebraObject(project, l);
    const input = buildSageAlgebraReconstructionInput(saved, { objectId: l.id, revision: 1 });
    const result = { format: "math3d.sage-algebra-reconstruction-result", schemaVersion: 1,
      target: input.target, kind: "field-extension", definitionHash: l.contentHash,
      text: "Number Field in b", latex: "", characteristic: "0", isField: true,
      fieldExtension: { baseDegree: 2, relativeDegree: 2, absoluteDegree: 4,
        baseGeneratorImage: "a", extensionGenerator: "b", inclusionMapAvailable: true,
        baseRelationVerified: true, extensionRelationVerified: true } };
    expect(parseSageAlgebraReconstructionResult(result, input).fieldExtension?.absoluteDegree).toBe(4);
    expect(() => parseSageAlgebraReconstructionResult({ ...result,
      fieldExtension: { ...result.fieldExtension, absoluteDegree: 2 } }, input)).toThrow(/does not verify/);
  });

  it("keeps historical inclusions visible and marks the child stale after its base definition advances", () => {
    const { project, q, k, l } = setup();
    const saved = upsertMath3DProjectAlgebraObject(project, l);
    const changed = upsertMath3DProjectAlgebraObject(saved, createAlgebraObjectRecord({ id: k.id,
      revision: 2, label: "K", definition: { kind: "number-field", baseField: { objectId: q.id, revision: 1 },
        definingPolynomial: ["-3", "0", "1"], generator: "a" } }));
    expect(inspectProjectAlgebraFreshness(changed).find((item) => item.objectId === l.id)?.status).toBe("stale");
    const tower = buildProjectFieldTower(changed);
    expect(tower.nodes.find((node) => node.ref.objectId === l.id)?.status).toBe("stale");
    expect(tower.nodes.find((node) => node.ref.objectId === k.id && node.ref.revision === 1)?.status).toBe("historical");
    expect(tower.edges.find((edge) => edge.extension.objectId === l.id)?.base.revision).toBe(1);
  });
});
