import { describe, expect, it } from "vitest";
import { exportProjectPackage, parseMath3DProject, serializeMath3DProject, structuralHash,
  updateProjectNote, upsertMath3DProjectNote } from "@math3d/core";
import { instantiateNotebookStarter } from "../../renderer/src/projects/notebookStarters";
import { importMobileProjectPreview } from "../../apps/mobile/src/models/mobileProjectPreview";
import { saveMobileProjectNote } from "../../apps/mobile/src/models/mobileProjectNotes";
import { buildMobileProjectExplorer } from "../../apps/mobile/src/models/mobileProjectExplorer";
import { serializeMobileProjectPackage } from "../../apps/mobile/src/models/mobileProjectResources";

const starter = () => {
  const { project, resources } = instantiateNotebookStarter("graph-derivative-notebook", "mobile-note-edit");
  return importMobileProjectPreview(exportProjectPackage(project, resources), [], "derivative.project-package.json", "imported", 1);
};

const workbookNote = () => {
  const original = starter();
  const workbook = buildMobileProjectExplorer(original.serializedProject, original.projectResources).workbooks[0]!;
  return saveMobileProjectNote(original, { title: "Definition", body: "Workbook evidence.",
    workbookBlock: { workbookId: workbook.id, blockId: workbook.stages[0]!.blocks[0]!.id } }, 5);
};

describe("mobile Project Note capture and editing", () => {
  it("adds a global Note, edits it and preserves Workbook bytes and document generations", () => {
    const original = starter(), before = parseMath3DProject(original.serializedProject);
    const added = saveMobileProjectNote(original, { title: "Observation", body: "Derivative checked at x = 1." }, 2);
    const addedProject = parseMath3DProject(added.serializedProject);
    expect(addedProject.notes).toHaveLength(2);
    expect(addedProject.workspace).toEqual(before.workspace);
    expect(addedProject.workbooks).toEqual(before.workbooks);
    expect(added.projectResources).toEqual(original.projectResources);
    const note = addedProject.notes!.find(item => item.title === "Observation")!;
    const edited = saveMobileProjectNote(added, { noteId: note.identity.id, title: "Observation", body: "Derivative checked after inspection." }, 3);
    const editedNote = parseMath3DProject(edited.serializedProject).notes!.find(item => item.identity.id === note.identity.id)!;
    expect(editedNote.identity.revision).toBe(note.identity.revision + 1);
    expect(editedNote.body).toContain("after inspection");
    const imported = importMobileProjectPreview(serializeMobileProjectPackage(edited), [], "roundtrip.json", "imported", 4);
    expect(buildMobileProjectExplorer(imported.serializedProject, imported.projectResources).notes.some(item => item.id === note.identity.id)).toBe(true);
  });

  it("anchors a new Note to a verified Workbook block and refuses missing payloads", () => {
    const original = starter(), explorer = buildMobileProjectExplorer(original.serializedProject, original.projectResources);
    const workbook = explorer.workbooks[0]!, block = workbook.stages[0]!.blocks[0]!;
    const input = { title: "Definition", body: "This block defines the investigation.", workbookBlock: { workbookId: workbook.id, blockId: block.id } };
    const saved = saveMobileProjectNote(original, input, 5);
    const note = buildMobileProjectExplorer(saved.serializedProject, saved.projectResources).notes.find(item => item.title === "Definition")!;
    expect(note.status).toBe("current");
    expect(note.anchor).toMatchObject({ kind: "workbook-block", workbookId: workbook.id, blockId: block.id });
    expect(note.anchor?.researchReference).toBeUndefined();
    const roundtrip = importMobileProjectPreview(serializeMobileProjectPackage(saved), [], "roundtrip.json", "imported", 6);
    const reopened = buildMobileProjectExplorer(roundtrip.serializedProject, roundtrip.projectResources).notes.find(item => item.id === note.id)!;
    expect(reopened).toEqual(note);
    const edited = saveMobileProjectNote(roundtrip, { noteId: note.id, title: "Definition", body: "Edited explanation." }, 7);
    const editedNote = buildMobileProjectExplorer(edited.serializedProject, edited.projectResources).notes.find(item => item.id === note.id)!;
    expect(editedNote.anchor).toEqual(note.anchor);
    expect(editedNote.status).toBe("current");
    expect(() => saveMobileProjectNote({ ...original, projectResources: [] }, input, 5)).toThrow(/Import the Workbook resource/);
    expect(() => saveMobileProjectNote(original, { title: " ", body: "text" }, 6)).toThrow(/title and body/);
  });

  it("withholds Workbook notes when their sidecar is missing and rejects corrupt bytes", () => {
    const saved = workbookNote(), before = JSON.stringify(saved);
    const withoutWorkbook = saved.projectResources!.filter(item => item.kind !== "workbook-payload");
    const missing = buildMobileProjectExplorer(saved.serializedProject, withoutWorkbook).notes.find(item => item.title === "Definition")!;
    expect(missing.status).toBe("missing");
    expect(missing.reason).toContain("Workbook block is unavailable");
    const corrupt = saved.projectResources!.map(item => item.kind === "workbook-payload" ?
      { ...item, data: (item.data[0] === "A" ? "B" : "A") + item.data.slice(1) } : item);
    expect(() => buildMobileProjectExplorer(saved.serializedProject, corrupt)).toThrow(/checksum/);
    expect(JSON.stringify(saved)).toBe(before);
  });

  it.each(["revision", "block hash"])("keeps a mismatched Workbook %s pin stale", mismatch => {
    const saved = workbookNote(), project = parseMath3DProject(saved.serializedProject);
    const note = project.notes!.find(item => item.title === "Definition")!;
    if (note.anchor?.kind !== "workbook-block") throw new Error("Missing Workbook anchor");
    const anchor = mismatch === "revision" ? { ...note.anchor, workbookRevision: note.anchor.workbookRevision + 1 } :
      { ...note.anchor, blockHash: structuralHash("a different block generation") };
    const changed = upsertMath3DProjectNote(project, updateProjectNote(note, { anchor }, 6));
    const inspected = buildMobileProjectExplorer(serializeMath3DProject(changed), saved.projectResources).notes.find(item => item.id === note.identity.id)!;
    expect(inspected.status).toBe("stale");
  });

  it("does not upgrade document notes that lack their research resource pins", () => {
    const saved = starter(), project = parseMath3DProject(saved.serializedProject);
    const note = project.notes![0]!;
    if (!note.anchor || !("source" in note.anchor)) throw new Error("Missing document source anchor");
    const { researchReference: _pin, ...anchor } = note.anchor;
    const changed = upsertMath3DProjectNote(project, updateProjectNote(note, { anchor }, note.updatedAt + 1));
    const inspected = buildMobileProjectExplorer(serializeMath3DProject(changed), saved.projectResources).notes.find(item => item.id === note.identity.id)!;
    expect(inspected.status).toBe("unverified");
  });
});
