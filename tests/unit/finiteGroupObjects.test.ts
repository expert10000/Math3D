import { describe, expect, it } from "vitest";
import { FINITE_GROUP_PRESETS, analyzeFiniteGroup,
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraObjectId, parseFiniteGroupDefinition, parseMath3DProject,
  serializeMath3DProject, upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const project = () => createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
  results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
{ stableKey: "sage-e01", title: "Finite groups" });

describe("SAGE-E01 finite group objects", () => {
  it("retains stable small permutation and abelian groups after independent Project import", () => {
    let saved = project();
    const expected = { C4: [4, 1], V4: [4, 3], S3: [6, 3], D4: [8, 5], Q8: [8, 1] };
    for (const preset of FINITE_GROUP_PRESETS) {
      const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(saved.identity.id, preset.id),
        revision: 1, label: preset.id, definition: preset.definition });
      const facts = analyzeFiniteGroup(record.definition as typeof preset.definition);
      expect([facts.order, facts.involutionCount]).toEqual(expected[preset.id]);
      expect(record.dependencies).toEqual([]);
      saved = upsertMath3DProjectAlgebraObject(saved, record);
    }
    const reopened = parseMath3DProject(serializeMath3DProject(saved));
    expect(reopened.algebraObjects).toEqual(saved.algebraObjects);
    expect(reopened.algebraObjects?.map((item) => item.revisions[0].contentHash)).toEqual(
      saved.algebraObjects?.map((item) => item.revisions[0].contentHash));
    expect(reopened.algebraObjects?.find((item) => item.revisions[0].label === "D4")?.revisions[0].definition)
      .toEqual(FINITE_GROUP_PRESETS.find((item) => item.id === "D4")?.definition);
  });

  it("rejects nonpermutations, false relations, unbounded groups and invalid invariant factors", () => {
    const d4 = FINITE_GROUP_PRESETS.find((item) => item.id === "D4")!.definition;
    if (d4.representation !== "permutation") throw new Error("D4 fixture is not a permutation group.");
    expect(() => parseFiniteGroupDefinition({ ...d4, generators: [
      { name: "r", images: [2, 2, 4, 1] }] })).toThrow(/exact generators/);
    expect(() => parseFiniteGroupDefinition({ ...d4, relations: [
      { label: "r² = e", word: [{ generator: "r", exponent: 2 }] }] })).toThrow(/false/);
    expect(() => parseFiniteGroupDefinition({ kind: "finite-group", representation: "abelian",
      invariantFactors: [4, 2], generators: ["a", "b"] })).toThrow(/divisibility chain/);
    expect(() => parseFiniteGroupDefinition({ kind: "finite-group", representation: "abelian",
      invariantFactors: [64, 64], generators: ["a", "b"] })).toThrow(/order at most 256/);
    expect(() => parseFiniteGroupDefinition({ kind: "finite-group", representation: "permutation", degree: 8,
      generators: [{ name: "r", images: [2, 3, 4, 5, 6, 7, 8, 1] },
        { name: "s", images: [2, 1, 3, 4, 5, 6, 7, 8] }], relations: [] })).toThrow(/order exceeds/);
  });

  it("preserves IDs across revisions while rejecting duplicate IDs", () => {
    let saved = project();
    const preset = FINITE_GROUP_PRESETS.find((item) => item.id === "C4")!;
    const id = createProjectAlgebraObjectId(saved.identity.id, "C4");
    saved = upsertMath3DProjectAlgebraObject(saved, createAlgebraObjectRecord({ id, revision: 1,
      label: "C4", definition: preset.definition }));
    saved = upsertMath3DProjectAlgebraObject(saved, createAlgebraObjectRecord({ id, revision: 2,
      label: "C4 renamed", definition: preset.definition }));
    const reopened = parseMath3DProject(serializeMath3DProject(saved));
    expect(reopened.algebraObjects?.[0].revisions.map((item) => [item.id, item.revision])).toEqual([[id, 1], [id, 2]]);
    expect(() => upsertMath3DProjectAlgebraObject(saved, createAlgebraObjectRecord({ id, revision: 2,
      label: "duplicate", definition: preset.definition }))).toThrow(/Duplicate algebra object ID/);
  });
});
