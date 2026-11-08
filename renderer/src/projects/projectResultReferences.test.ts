import { describe, expect, it } from "vitest";
import { createEmptyGraph2DDocument, structuralHash, viewerSourceFromDocument,
  type AnalysisResultEnvelope, type Math3DProject } from "@math3d/core";
import { resultNoteReferences, resultStudyReferences, resultWorkbookReferences } from "./projectResultReferences";
import { instantiateNotebookStarter } from "./notebookStarters";
import { exportProjectPackage, parseProjectPackage } from "./projectResources";

const noteDocument = createEmptyGraph2DDocument("result-note-source");
const source = viewerSourceFromDocument(noteDocument);
const result = { resultId: "saved", provenance: { source }, summary: { mean: 3 } } as unknown as AnalysisResultEnvelope;
const anchor = { kind: "result", source, resultId: "saved", resultHash: structuralHash(result) };
const project = { notes: [
  { identity: { id: "exact" }, projectId: "project", title: "Exact Note", anchor },
  { identity: { id: "older" }, projectId: "project", title: "Older Note", anchor: { ...anchor, resultHash: "sha256:old" } },
  { identity: { id: "other" }, projectId: "project", title: "Unrelated", anchor: { ...anchor, resultId: "another" } },
  { identity: { id: "foreign" }, projectId: "another", title: "Foreign", anchor },
  { identity: { id: "value" }, projectId: "project", title: "Value Note", anchor: null,
    valueBindings: [{ kind: "result", resultId: "saved", resultHash: structuralHash(result), source }] },
], identity: { id: "project" }, workspace: { entries: [{ expected: noteDocument.identity }] } } as unknown as Math3DProject;

describe("Project Result Note references", () => {
  it("finds exact anchors and structured value bindings without reading prose", () => {
    expect(resultNoteReferences(project, result).map(item => [item.id, item.status]))
      .toEqual([["exact", "current"], ["older", "historical"], ["value", "current"]]);
  });
  it("marks a changed source generation historical even with the same result ID and hash", () => {
    const changed = { ...result, provenance: { source: { ...source, revision: 2 } } } as AnalysisResultEnvelope;
    expect(resultNoteReferences(project, changed).filter(item => item.id === "exact")[0]?.status)
      .toBe("historical");
  });
  it("keeps an exact saved Note historical after the current Project source advances", () => {
    const advanced = { ...project, workspace: { ...project.workspace,
      entries: [{ expected: { ...noteDocument.identity, revision: noteDocument.identity.revision + 1 } }] } } as Math3DProject;
    expect(resultNoteReferences(advanced, result).find(item => item.id === "exact")?.status)
      .toBe("historical");
  });
});

describe("Project Result Study references", () => {
  it("distinguishes a current member from a historical or foreign Study", () => {
    const document = createEmptyGraph2DDocument("result-source");
    const recorded = viewerSourceFromDocument(document);
    const saved = { ...result, provenance: { source: recorded } } as AnalysisResultEnvelope;
    const member = { memberId: "analysis", documentId: document.identity.id,
      expected: document.identity, resultId: saved.resultId, role: "analysis" };
    const current = { id: "study-current", projectId: "project", title: "Current Study", members: [member] };
    const historical = { id: "study-old", projectId: "project", title: "Old Study",
      members: [{ ...member, documentId: "math3d:graph2d:other" }] };
    const foreign = { ...current, id: "foreign", projectId: "another" };
    const workspace = { entries: [{ expected: document.identity }], studies: [current, historical, foreign] };
    const currentProject = { identity: { id: "project" }, workspace } as unknown as Math3DProject;
    expect(resultStudyReferences(currentProject, saved).map(item => [item.id, item.status]))
      .toEqual([["study-current", "current"], ["study-old", "historical"]]);
  });
});

describe("Project Result Workbook references", () => {
  it("reads exact citations only from checksum-qualified Workbook payloads", () => {
    const made = instantiateNotebookStarter("catenoid-evidence", "result-backlinks");
    const project = made.project, saved = project.workbooks![0]!;
    const read = (id: string) => made.resources.bytes({ kind: "workbook-payload", id });
    const links = project.workspace.results.flatMap(item => resultWorkbookReferences(project, item, read));
    expect(links.length).toBeGreaterThan(0);
    expect(links.every(item => item.kind === "workbook" && item.status === "current" && item.blockId)).toBe(true);
    const changed = (id: string) => {
      const bytes = read(id);
      if (!bytes) return null;
      const copy = Uint8Array.from(bytes); copy[0] ^= 1; return copy;
    };
    expect(project.workspace.results.flatMap(item => resultWorkbookReferences(project, item, changed)))
      .toEqual([]);
    expect(resultWorkbookReferences(project, project.workspace.results[0]!, () => null)).toEqual([]);
    expect(saved.id).toBeTruthy();
  });
  it("retains exact reverse citations after an independent Project resource-package import", () => {
    const made = instantiateNotebookStarter("catenoid-evidence", "portable-result-links");
    const reopened = parseProjectPackage(exportProjectPackage(made.project, made.resources));
    const anchor = reopened.project.notes?.find(note => note.anchor?.kind === "result")?.anchor;
    const result = reopened.project.workspace.results.find(item =>
      anchor?.kind === "result" && item.resultId === anchor.resultId)!;
    const notes = resultNoteReferences(reopened.project, result);
    const books = resultWorkbookReferences(reopened.project, result,
      id => reopened.resources.bytes({ kind: "workbook-payload", id }));
    expect(notes.some(item => item.status === "current")).toBe(true);
    expect(books.some(item => item.status === "current")).toBe(true);
    expect(resultWorkbookReferences(reopened.project, result, () => null)).toEqual([]);
  });
});
