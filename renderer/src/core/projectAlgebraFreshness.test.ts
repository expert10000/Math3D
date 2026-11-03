import { describe, expect, it } from "vitest";
import {
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraObjectId,
  inspectProjectAlgebraFreshness, parseMath3DProject, renameMath3DProjectAlgebraObject,
  serializeMath3DProject, setMath3DProjectAlgebraObjectArchived, upsertMath3DProjectAlgebraObject,
  type Math3DProject, type StableDocumentId,
} from "@math3d/core";
import { exportProjectFile, previewProjectImport } from "../projects/projectTransfer";

const workspace = createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [], artifacts: [],
  relations: [], committedSelection: null, constructions: [] });

const chain = () => {
  let project = createMath3DProject(workspace, { stableKey: "sage-a03-gate", title: "Algebra dependency gate" });
  const id = (label: string) => createProjectAlgebraObjectId(project.identity.id, label);
  const ids = { q: id("Q"), f5: id("F5"), r: id("R"), s: id("S"), t: id("T") };
  const add = (record: ReturnType<typeof createAlgebraObjectRecord>) => { project = upsertMath3DProjectAlgebraObject(project, record); };
  add(createAlgebraObjectRecord({ id: ids.q, label: "Q", revision: 1, definition: { kind: "rational-field" } }));
  add(createAlgebraObjectRecord({ id: ids.f5, label: "F5", revision: 1,
    definition: { kind: "finite-field", characteristic: 5, degree: 1, generator: "a", construction: "canonical" } }));
  const rDefinition = { kind: "polynomial-ring" as const, coefficientDomain: { objectId: ids.q, revision: 1 },
    variables: ["x", "y"], monomialOrder: "degrevlex" as const };
  add(createAlgebraObjectRecord({ id: ids.r, label: "R", revision: 1, definition: rDefinition }));
  add(createAlgebraObjectRecord({ id: ids.s, label: "S", revision: 1,
    definition: { kind: "polynomial-ring", coefficientDomain: { objectId: ids.r, revision: 1 },
      variables: ["t"], monomialOrder: "lex" } }));
  add(createAlgebraObjectRecord({ id: ids.t, label: "T", revision: 1,
    definition: { kind: "polynomial-ring", coefficientDomain: { objectId: ids.s, revision: 1 },
      variables: ["u"], monomialOrder: "lex" } }));
  return { project, ids, rDefinition };
};

const byId = (project: Math3DProject) => new Map(inspectProjectAlgebraFreshness(project).map((item) => [item.objectId, item]));
const status = (project: Math3DProject, id: StableDocumentId) => byId(project).get(id)!;

describe("SAGE-A03 algebra dependency freshness", () => {
  it("marks direct and transitive descendants stale when QQ[x,y] changes to GF(5)[x,y]", () => {
    const { project, ids, rDefinition } = chain();
    expect(inspectProjectAlgebraFreshness(project).map((item) => item.status)).toEqual([
      "fresh", "fresh", "fresh", "fresh", "fresh",
    ]);
    const r2 = createAlgebraObjectRecord({ id: ids.r, label: "R", revision: 2,
      definition: { ...rDefinition, coefficientDomain: { objectId: ids.f5, revision: 1 } } });
    const changed = upsertMath3DProjectAlgebraObject(project, r2);
    expect(status(changed, ids.r).status).toBe("fresh");
    expect(status(changed, ids.q).status).toBe("fresh");
    expect(status(changed, ids.f5).status).toBe("fresh");
    expect(status(changed, ids.s)).toMatchObject({ status: "stale", revision: 1,
      causes: [{ objectId: ids.r, pinnedRevision: 1, currentRevision: 2 }] });
    expect(status(changed, ids.t)).toMatchObject({ status: "stale", revision: 1,
      causes: [{ objectId: ids.r, pinnedRevision: 1, currentRevision: 2 }] });
    expect(status(changed, ids.r).directDependents).toEqual([ids.s]);
    expect(status(changed, ids.s).directDependents).toEqual([ids.t]);
    expect(changed.algebraObjects?.find((entry) => entry.id === ids.r)?.revisions[0].definition).toEqual(rDefinition);
    expect(changed.algebraObjects?.find((entry) => entry.id === ids.s)?.revisions[0].dependencies)
      .toEqual([{ objectId: ids.r, revision: 1 }]);
  });

  it("keeps descendants fresh for label-only revisions and archive state", () => {
    const { project, ids } = chain();
    const renamed = renameMath3DProjectAlgebraObject(project, ids.r, "Ring of two variables");
    expect(status(renamed, ids.s).status).toBe("fresh");
    expect(status(renamed, ids.t).status).toBe("fresh");
    const archived = setMath3DProjectAlgebraObjectArchived(renamed, ids.r, true);
    expect(status(archived, ids.r).archived).toBe(true);
    expect(status(archived, ids.s).status).toBe("fresh");
  });

  it("clears staleness only after explicit descendant revisions pin the new parent", () => {
    const { project, ids, rDefinition } = chain();
    const changed = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({ id: ids.r,
      label: "R", revision: 2, definition: { ...rDefinition, coefficientDomain: { objectId: ids.f5, revision: 1 } } }));
    const rebasedS = upsertMath3DProjectAlgebraObject(changed, createAlgebraObjectRecord({ id: ids.s,
      label: "S", revision: 2, definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: ids.r, revision: 2 }, variables: ["t"], monomialOrder: "lex" } }));
    expect(status(rebasedS, ids.s).status).toBe("fresh");
    expect(status(rebasedS, ids.t)).toMatchObject({ status: "stale",
      causes: [{ objectId: ids.s, pinnedRevision: 1, currentRevision: 2 }] });
    const rebasedT = upsertMath3DProjectAlgebraObject(rebasedS, createAlgebraObjectRecord({ id: ids.t,
      label: "T", revision: 2, definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: ids.s, revision: 2 }, variables: ["u"], monomialOrder: "lex" } }));
    expect(status(rebasedT, ids.t).status).toBe("fresh");
    expect(rebasedT.algebraObjects?.find((entry) => entry.id === ids.t)?.revisions).toHaveLength(2);
  });

  it("derives the same stale causes after independent .math3d import", () => {
    const { project, ids, rDefinition } = chain();
    const changed = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({ id: ids.r,
      label: "R", revision: 2, definition: { ...rDefinition, coefficientDomain: { objectId: ids.f5, revision: 1 } } }));
    const bytes = new TextEncoder().encode(exportProjectFile(changed));
    const reopened = previewProjectImport(new TextDecoder().decode(new Uint8Array(bytes))).project;
    expect(reopened).toEqual(parseMath3DProject(serializeMath3DProject(changed)));
    expect(inspectProjectAlgebraFreshness(reopened)).toEqual(inspectProjectAlgebraFreshness(changed));
    expect(status(reopened, ids.t).status).toBe("stale");
    expect(inspectProjectAlgebraFreshness({})).toEqual([]);
    expect(() => inspectProjectAlgebraFreshness({ algebraObjects: [] })).toThrow(/registry/);
  });
});
