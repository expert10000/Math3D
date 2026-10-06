import { describe, expect, it } from "vitest";
import { exportProjectPackage, parseMath3DProject } from "@math3d/core";
import { instantiateNotebookStarter } from "../../renderer/src/projects/notebookStarters";
import { importMobileProjectPreview } from "../../apps/mobile/src/models/mobileProjectPreview";
import { saveMobileProjectNote } from "../../apps/mobile/src/models/mobileProjectNotes";
import { buildMobileProjectExplorer } from "../../apps/mobile/src/models/mobileProjectExplorer";
import { serializeMobileProjectPackage } from "../../apps/mobile/src/models/mobileProjectResources";

const starter = () => {
  const { project, resources } = instantiateNotebookStarter("graph-derivative-notebook", "mobile-note-edit");
  return importMobileProjectPreview(exportProjectPackage(project, resources), [], "derivative.project-package.json", "imported", 1);
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
    expect(() => saveMobileProjectNote({ ...original, projectResources: [] }, input, 5)).toThrow(/Import the Workbook resource/);
    expect(() => saveMobileProjectNote(original, { title: " ", body: "text" }, 6)).toThrow(/title and body/);
  });
});
