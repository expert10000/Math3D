import { describe, expect, it } from "vitest";
import { createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraObjectId, parseMath3DProject, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "@math3d/core";
import { createStructureStarter, resolveStructureSelection, selectedStructure, structureDisplay } from "./sageStructuresModel";

const empty = () => createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
  results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-a06-model", title: "Algebra experiments" });

describe("SAGE-A06 Project structure explorer model", () => {
  it("creates Q and QQ[x,y], then reselects the exact saved revision after restart", () => {
    let project = empty();
    const q = createStructureStarter(project, { kind: "rational-field", label: "Q" }, "Q");
    project = upsertMath3DProjectAlgebraObject(project, q);
    const r = createStructureStarter(project, { kind: "polynomial-ring", label: "R",
      coefficientDomain: { objectId: q.id, revision: 1 }, variables: "x, y", monomialOrder: "degrevlex" }, "R");
    project = upsertMath3DProjectAlgebraObject(project, r);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const selection = resolveStructureSelection(reopened, JSON.parse(JSON.stringify({ objectId: r.id, revision: 1 })));
    expect(selection).toEqual({ objectId: r.id, revision: 1 });
    expect(selectedStructure(reopened, selection)?.record).toEqual(r);
    expect(structureDisplay(r, reopened)).toBe("Q[x,y]");
    expect(selectedStructure(reopened, { objectId: r.id, revision: 1 })?.record.dependencies)
      .toEqual([{ objectId: q.id, revision: 1 }]);
  });

  it("rejects ambiguous names, missing or old parents, and invalid variables", () => {
    let project = empty();
    const q = createStructureStarter(project, { kind: "rational-field", label: "Q" }, "Q");
    project = upsertMath3DProjectAlgebraObject(project, q);
    expect(() => createStructureStarter(project, { kind: "integer-ring", label: "q" }, "duplicate"))
      .toThrow(/unique structure name/);
    expect(() => createStructureStarter(project, { kind: "polynomial-ring", label: "R",
      coefficientDomain: { objectId: createProjectAlgebraObjectId(project.identity.id, "missing"), revision: 1 },
      variables: "x" }, "missing-parent")).toThrow(/unavailable/);
    project = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({ id: q.id, label: "Q",
      revision: 2, definition: { kind: "rational-field" } }));
    expect(() => createStructureStarter(project, { kind: "polynomial-ring", label: "R",
      coefficientDomain: { objectId: q.id, revision: 1 }, variables: "x" }, "old-parent"))
      .toThrow(/current fresh revision/);
    expect(() => createStructureStarter(project, { kind: "polynomial-ring", label: "R",
      coefficientDomain: { objectId: q.id, revision: 2 }, variables: "x, x" }, "bad-variables"))
      .toThrow(/distinct/);
    expect(resolveStructureSelection(project, { objectId: q.id, revision: 100 })).toEqual({ objectId: q.id, revision: 2 });
  });
});
