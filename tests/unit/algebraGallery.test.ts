import { describe, expect, it } from "vitest";
import { ALGEBRA_GALLERY_EXAMPLES, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, installAlgebraGalleryExample, parseMath3DProject,
  serializeMath3DProject, upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const empty = () => createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
  results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
{ stableKey: "sage-h04", title: "Algebra gallery" });

describe("SAGE-H04 curated algebra gallery", () => {
  it.each(ALGEBRA_GALLERY_EXAMPLES)("saves and independently reopens $id with pinned parents", ({ id }) => {
    const installed = installAlgebraGalleryExample(empty(), id);
    const reopened = parseMath3DProject(serializeMath3DProject(installed.project));
    const primary = reopened.algebraObjects?.find((entry) => entry.id === installed.primary.objectId)
      ?.revisions[installed.primary.revision - 1];
    expect(primary).toBeDefined();
    expect(installed.records).toBe(id === "nilpotent-ideal" ? 3 : id === "z6-module" ? 2 : 1);
    expect(installAlgebraGalleryExample(reopened, id).records).toBe(0);
    if (id === "gf5") expect(primary?.definition).toMatchObject({ characteristic: 5, degree: 1 });
    if (id === "c4") expect(primary?.definition).toMatchObject({ kind: "finite-group" });
    if (id === "nilpotent-ideal") expect(primary?.definition).toMatchObject({
      kind: "ideal", generators: ["x^2", "y"] });
    if (id === "z6-module") expect(primary?.definition).toMatchObject({
      kind: "module", relationMap: { matrix: [["6"]] } });
    for (const dependency of primary?.dependencies ?? [])
      expect(reopened.algebraObjects?.some((entry) => entry.id === dependency.objectId &&
        !!entry.revisions[dependency.revision - 1])).toBe(true);
  });

  it("rejects an occupied gallery ID with a different definition", () => {
    const project = empty();
    const expected = installAlgebraGalleryExample(project, "gf5");
    const record = expected.project.algebraObjects![0].revisions[0];
    const occupied = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({
      id: record.id, revision: 1, label: "Different", definition: { kind: "integer-ring" } }));
    expect(() => installAlgebraGalleryExample(occupied, "gf5")).toThrow(/saved ID was changed/);
  });
});
