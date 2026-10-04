import { describe, expect, it } from "vitest";
import { captureProjectResources, createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject, createProjectNote,
  createStableDocumentId, exportProjectPackage, parseMath3DProject, parseProjectPackage, serializeMath3DProject, upsertMath3DProjectNote } from "@math3d/core";

const fixture = () => createMath3DProject(createGraph2DWorkspaceProject(createEmptyGraph2DDocument("notes-project")), { stableKey: "notes-project", title: "Notes study" });

describe("NTS02 named Project Notes", () => {
  it("retains legacy Project bytes and round-trips a Note with its stable identity", () => {
    const project = fixture(), legacy = serializeMath3DProject(project);
    expect(project.notes).toBeUndefined();
    expect(parseMath3DProject(legacy)).toEqual(project);
    const note = createProjectNote({ projectId: project.identity.id, stableKey: "observation", kind: "text", title: "Observation",
      body: "Inspect the tangent.", createdAt: 100 });
    const saved = upsertMath3DProjectNote(project, note);
    expect(saved.identity.id).toBe(project.identity.id);
    expect(saved.identity.revision).toBe(project.identity.revision + 1);
    expect(parseMath3DProject(serializeMath3DProject(saved)).notes).toEqual([note]);
    const portable = parseProjectPackage(exportProjectPackage(saved, captureProjectResources(saved, () => null, true)));
    expect(portable.project.notes).toEqual([note]);
    expect(upsertMath3DProjectNote(saved, note)).toEqual(saved);
    expect(serializeMath3DProject(project)).toBe(legacy);
  });

  it("rejects foreign Notes and tampered Project Notes", () => {
    const project = fixture();
    const note = createProjectNote({ projectId: createStableDocumentId("project", "other"), stableKey: "foreign", kind: "text",
      title: "Foreign", body: "Belongs elsewhere.", createdAt: 100 });
    expect(() => upsertMath3DProjectNote(project, note)).toThrow("does not belong");
    expect(() => parseMath3DProject(JSON.stringify({ ...project, notes: [note] }))).toThrow();
    const local = createProjectNote({ projectId: project.identity.id, stableKey: "local", kind: "text", title: "Local", body: "A note.", createdAt: 100 });
    const saved = upsertMath3DProjectNote(project, local);
    expect(() => parseMath3DProject(JSON.stringify({ ...saved, notes: [{ ...local, body: "Forged" }] }))).toThrow();
  });
});
