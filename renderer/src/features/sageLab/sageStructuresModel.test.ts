import { describe, expect, it } from "vitest";
import { createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraObjectId, parseMath3DProject, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "@math3d/core";
import { createStructureStarter, describeStructure, resolveStructureSelection, selectedStructure, structureDisplay } from "./sageStructuresModel";

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

describe("SAGE-A07 Ring and Field Builder model", () => {
  it("classifies exact rings and fields and preserves them through a Project roundtrip", () => {
    let project = empty();
    const definitions = [
      { kind: "integer-ring" as const, label: "Z" },
      { kind: "rational-field" as const, label: "Q" },
      { kind: "modular-ring" as const, label: "Z12", modulus: "12" },
      { kind: "modular-ring" as const, label: "F13", modulus: "13" },
      { kind: "finite-field" as const, label: "F49", characteristic: "7", degree: "2", generator: "a" },
    ];
    for (const draft of definitions) project = upsertMath3DProjectAlgebraObject(project,
      createStructureStarter(project, draft, draft.label));
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const summaries = new Map(reopened.algebraObjects!.map((entry) => [entry.revisions[0].label,
      describeStructure(entry.revisions[0], reopened)]));
    expect(summaries.get("Z")).toMatchObject({ presentation: "ZZ", characteristic: "0", field: "no", zeroDivisors: "no" });
    expect(summaries.get("Q")).toMatchObject({ presentation: "QQ", characteristic: "0", field: "yes", zeroDivisors: "no" });
    expect(summaries.get("Z12")).toMatchObject({ presentation: "Z/12Z", characteristic: "12", field: "no", zeroDivisors: "yes", cardinality: "12" });
    expect(summaries.get("F13")).toMatchObject({ presentation: "Z/13Z", characteristic: "13", field: "yes", zeroDivisors: "no", cardinality: "13" });
    expect(summaries.get("F49")).toMatchObject({ presentation: "GF(7^2)", characteristic: "7", field: "yes", zeroDivisors: "no", cardinality: "49" });
    expect(reopened.algebraObjects!.find((entry) => entry.revisions[0].label === "F49")!.revisions[0].definition).toEqual({ kind: "finite-field",
      characteristic: 7, degree: 2, generator: "a", construction: "canonical" });
  });

  it("rejects invalid modulus, nonprime characteristic, oversized fields, and unsafe generators", () => {
    const project = empty();
    expect(() => createStructureStarter(project, { kind: "modular-ring", label: "Bad", modulus: "01" }, "bad-1"))
      .toThrow(/Modulus/);
    expect(() => createStructureStarter(project, { kind: "modular-ring", label: "Bad", modulus: "9".repeat(129) }, "bad-2"))
      .toThrow(/Modulus/);
    expect(() => createStructureStarter(project, { kind: "finite-field", label: "Bad",
      characteristic: "9", degree: "2", generator: "a" }, "bad-3")).toThrow(/prime/);
    expect(() => createStructureStarter(project, { kind: "finite-field", label: "Bad",
      characteristic: "7", degree: "6", generator: "a" }, "bad-4")).toThrow(/65536/);
    expect(() => createStructureStarter(project, { kind: "finite-field", label: "Bad",
      characteristic: "7", degree: "2", generator: "a;quit" }, "bad-5")).toThrow(/identifier/);
  });
});
