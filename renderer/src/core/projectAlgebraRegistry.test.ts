import { describe, expect, it } from "vitest";
import {
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraObjectId,
  createStableDocumentId, structuralHash, upsertMath3DProjectWorkbook,
  forkMath3DProjectAlgebraObject, parseMath3DProject, renameMath3DProjectAlgebraObject,
  replaceMath3DProjectWorkspace, serializeMath3DProject, setMath3DProjectAlgebraObjectArchived,
  upsertMath3DProjectAlgebraObject, type Math3DProject,
} from "@math3d/core";
import { exportProjectFile, previewProjectImport } from "../projects/projectTransfer";

const workspace = createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [], artifacts: [],
  relations: [], committedSelection: null, constructions: [] });
const newProject = () => createMath3DProject(workspace, { stableKey: "sage-a02-gate", title: "Algebra evidence" });

const withQandR = () => {
  let project = newProject();
  const qId = createProjectAlgebraObjectId(project.identity.id, "Q");
  const rId = createProjectAlgebraObjectId(project.identity.id, "R");
  const q = createAlgebraObjectRecord({ id: qId, label: "Q", revision: 1, definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, q);
  const r = createAlgebraObjectRecord({ id: rId, label: "R", revision: 1,
    definition: { kind: "polynomial-ring", coefficientDomain: { objectId: qId, revision: 1 },
      variables: ["x", "y"], monomialOrder: "degrevlex" } });
  project = upsertMath3DProjectAlgebraObject(project, r);
  return { project, q, r, qId, rId };
};

describe("SAGE-A02 Project algebra registry", () => {
  it("exports Q and R = QQ[x,y] to .math3d bytes and independently imports exact records", () => {
    const { project, q, r, qId, rId } = withQandR();
    const bytes = new TextEncoder().encode(exportProjectFile(project));
    const independentCopy = previewProjectImport(new TextDecoder().decode(new Uint8Array(bytes)));
    expect(independentCopy.inputKind).toBe("Named project");
    expect(independentCopy.canOpenWorkspace).toBe(false);
    expect(independentCopy.reasons).toContain("The project has no documents to open.");
    expect(independentCopy.project.identity).toEqual(project.identity);
    expect(independentCopy.project.algebraObjects).toEqual([
      { id: qId, revisions: [q], archived: false },
      { id: rId, revisions: [r], archived: false },
    ].sort((a, b) => a.id.localeCompare(b.id)));
    expect(independentCopy.project.algebraObjects?.find((entry) => entry.id === rId)?.revisions[0].dependencies)
      .toEqual([{ objectId: qId, revision: 1 }]);
    expect(exportProjectFile(independentCopy.project)).toBe(new TextDecoder().decode(bytes));
  });

  it("retains revision history through rename, fork, archive and recovery", () => {
    const { project, r, rId } = withQandR();
    const renamed = renameMath3DProjectAlgebraObject(project, rId, "Polynomial ring R");
    const history = renamed.algebraObjects?.find((entry) => entry.id === rId)?.revisions;
    expect(history?.map((item) => item.revision)).toEqual([1, 2]);
    expect(history?.[0]).toEqual(r);
    expect(history?.[1].contentHash).toBe(r.contentHash);
    expect(renamed.identity.revision).toBe(project.identity.revision + 1);

    const forked = forkMath3DProjectAlgebraObject(renamed, rId, "R-copy", "R copy");
    const forkId = createProjectAlgebraObjectId(project.identity.id, "R-copy");
    expect(forked.algebraObjects?.find((entry) => entry.id === forkId)?.revisions[0].definition).toEqual(r.definition);
    const archived = setMath3DProjectAlgebraObjectArchived(forked, rId, true);
    expect(archived.algebraObjects?.find((entry) => entry.id === rId)?.archived).toBe(true);
    expect(() => renameMath3DProjectAlgebraObject(archived, rId, "Forbidden")).toThrow(/Active algebra object/);
    const recovered = setMath3DProjectAlgebraObjectArchived(archived, rId, false);
    expect(parseMath3DProject(serializeMath3DProject(recovered)).algebraObjects).toEqual(recovered.algebraObjects);
    expect(replaceMath3DProjectWorkspace(recovered, workspace).algebraObjects).toEqual(recovered.algebraObjects);
  });

  it("keeps an existing polynomial parent pinned when Q gains a new revision", () => {
    const { project, qId, rId } = withQandR();
    const renamedQ = renameMath3DProjectAlgebraObject(project, qId, "Rational coefficients");
    expect(renamedQ.algebraObjects?.find((entry) => entry.id === qId)?.revisions.map((item) => item.revision))
      .toEqual([1, 2]);
    expect(renamedQ.algebraObjects?.find((entry) => entry.id === rId)?.revisions[0].dependencies)
      .toEqual([{ objectId: qId, revision: 1 }]);
    expect(parseMath3DProject(serializeMath3DProject(renamedQ)).algebraObjects).toEqual(renamedQ.algebraObjects);
  });

  it("rejects duplicate IDs/revisions and missing parent revisions before accepting imported bytes", () => {
    const { project, q, r, qId, rId } = withQandR();
    const qEntry = project.algebraObjects!.find((entry) => entry.id === qId)!;
    const duplicateId = { ...project, algebraObjects: [...project.algebraObjects!, qEntry] };
    expect(() => parseMath3DProject(JSON.stringify(duplicateId))).toThrow(/Duplicate algebra object IDs/);
    const duplicateRevision = { ...project, algebraObjects: project.algebraObjects!.map((entry) =>
      entry.id === rId ? { ...entry, revisions: [r, r] } : entry) };
    expect(() => parseMath3DProject(JSON.stringify(duplicateRevision))).toThrow(/duplicate revision/);
    const missingParent = { ...project, algebraObjects: project.algebraObjects!.filter((entry) => entry.id !== qId) };
    expect(() => previewProjectImport(JSON.stringify(missingParent))).toThrow(/Missing algebra parent/);

    expect(() => upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({
      id: rId, label: "Conflicting R", revision: 1, definition: r.definition,
    }))).toThrow(/Duplicate algebra object ID and revision/);
    const dangling = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "S"),
      label: "S", revision: 1, definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: createProjectAlgebraObjectId(project.identity.id, "absent"), revision: 1 },
        variables: ["t"], monomialOrder: "lex" } });
    expect(() => upsertMath3DProjectAlgebraObject(project, dangling)).toThrow(/Missing algebra parent/);
    expect(upsertMath3DProjectAlgebraObject(project, q)).toEqual(project);
  });

  it("rejects a dependency cycle in imported histories", () => {
    const project = newProject();
    const aId = createProjectAlgebraObjectId(project.identity.id, "A");
    const bId = createProjectAlgebraObjectId(project.identity.id, "B");
    const a = createAlgebraObjectRecord({ id: aId, label: "A", revision: 1,
      definition: { kind: "polynomial-ring", coefficientDomain: { objectId: bId, revision: 1 },
        variables: ["x"], monomialOrder: "lex" } });
    const b = createAlgebraObjectRecord({ id: bId, label: "B", revision: 1,
      definition: { kind: "polynomial-ring", coefficientDomain: { objectId: aId, revision: 1 },
        variables: ["y"], monomialOrder: "lex" } });
    expect(() => parseMath3DProject(JSON.stringify({ ...project, algebraObjects: [
      { id: aId, revisions: [a], archived: false }, { id: bId, revisions: [b], archived: false },
    ] }))).toThrow(/Cyclic algebra object dependency/);
  });

  it("keeps older Projects without an algebra registry byte-compatible", () => {
    const project: Math3DProject = newProject();
    const bytes = serializeMath3DProject(project);
    expect(bytes).not.toContain("algebraObjects");
    expect(parseMath3DProject(bytes)).toEqual(project);
  });

  it("retains algebra history when another Project section changes", () => {
    const { project } = withQandR();
    const next = upsertMath3DProjectWorkbook(project, { id: createStableDocumentId("workbook", "a02"),
      title: "Calculations", revision: 1, checksum: structuralHash("workbook bytes"), byteLength: 14 });
    expect(next.identity.revision).toBe(project.identity.revision + 1);
    expect(parseMath3DProject(serializeMath3DProject(next)).algebraObjects).toEqual(project.algebraObjects);
    expect(() => parseMath3DProject(JSON.stringify({ ...next,
      algebraObjects: next.algebraObjects?.map((entry) => ({ ...entry, archived: !entry.archived })) })))
      .toThrow(/content hash/);
  });
});
