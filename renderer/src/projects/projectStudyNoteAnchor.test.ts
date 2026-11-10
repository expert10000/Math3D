import { describe, expect, it } from "vitest";
import { createProjectNote, createProjectStudyFromDocuments, inspectProjectNoteAnchor,
  instantiateMath3DProjectTemplate, normalizeProjectNoteAnchor, parseMath3DProject, createStableDocumentId,
  renameProjectStudy, serializeMath3DProject, upsertMath3DProjectNote, upsertProjectStudy,
  upsertProjectScientificSelection } from "@math3d/core";
import { projectNoteSourceResolver } from "./projectNoteTargets";
import { createProjectStudySelectionNoteAnchor, pinProjectStudyScientificSelection } from "./projectStudyNoteAnchor";

const fixture = () => {
  let project = instantiateMath3DProjectTemplate("catenary-study", "study-note-anchor");
  project = createProjectStudyFromDocuments(project, "study-note", "Pinned question",
    [project.workspace.entries[0]!.expected.id]);
  const study = project.workspace.studies![0]!;
  project = upsertProjectStudy(project, { ...study, pinnedSelectionIds: ["graph:point-7"] });
  const anchor = createProjectStudySelectionNoteAnchor(project, study.id, study.members[0]!.memberId,
    "graph:point-7");
  const note = createProjectNote({ projectId: project.identity.id, stableKey: "pinned-point", kind: "text",
    title: "Pinned point", body: "Observe the selected parameter.", anchor, createdAt: 1 });
  project = upsertMath3DProjectNote(project, note);
  return { project, study, note, anchor };
};

describe("exact Study selection Note anchors", () => {
  it("survives Project save and reopen and becomes historical after Study edit", () => {
    const { project, study, note } = fixture();
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const inspect = (source: typeof project) => inspectProjectNoteAnchor(note,
      projectNoteSourceResolver(source.identity.id, source.workspace));
    expect(inspect(reopened).status).toBe("current");
    expect(inspect(renameProjectStudy(reopened, study.id, "Changed question")).status).toBe("stale");
    const unpinned = upsertProjectStudy(reopened, { ...reopened.workspace.studies![0]!, pinnedSelectionIds: [] });
    expect(inspect(unpinned).status).toBe("missing");
  });

  it("rejects foreign and malformed pins instead of displaying them as exact selections", () => {
    const { project, study, note, anchor } = fixture();
    expect(() => createProjectStudySelectionNoteAnchor(project, study.id, study.members[0]!.memberId,
      "graph:absent")).toThrow(/unavailable/);
    const foreign = upsertProjectStudy(project, { ...project.workspace.studies![0]!,
      pinnedSelectionIds: [`qwz:band-0:${"f".repeat(64)}:7`] });
    expect(() => createProjectStudySelectionNoteAnchor(foreign, study.id, study.members[0]!.memberId,
      `qwz:band-0:${"f".repeat(64)}:7`)).toThrow(/does not belong/);
    expect(normalizeProjectNoteAnchor({ ...anchor, selectionId: "" })).toBeNull();
    expect(normalizeProjectNoteAnchor({ ...anchor, copiedValue: 42 })).toBeNull();
    expect(inspectProjectNoteAnchor(note, projectNoteSourceResolver(
      instantiateMath3DProjectTemplate("catenary-study", "foreign-project").identity.id,
      project.workspace)).status).toBe("different-project");
  });

  it("pins an authored scientific point and refuses a changed or removed selection", () => {
    const initial = fixture();
    const entry = initial.project.workspace.entries[0]!;
    const selectionId = createStableDocumentId("scientific-selection", "study-point");
    const selection = { format: "math3d.scientific-selection" as const, schemaVersion: 1 as const,
      identity: { kind: "authored" as const, id: selectionId }, role: "probe" as const,
      source: { kind: "document" as const, documentId: entry.expected.id,
        checkpoint: { revision: entry.expected.revision, structuralHash: entry.expected.structuralHash } },
      frame: { kind: "cartesian" as const, axes: [{ name: "x", unit: null }, { name: "y", unit: null }] },
      geometry: { kind: "point" as const, position: [1, 2] } };
    const withSelection = upsertProjectScientificSelection(initial.project, selection);
    const pinned = pinProjectStudyScientificSelection(withSelection, initial.study.id, selectionId);
    const study = pinned.workspace.studies![0]!;
    const pin = study.pinnedSelectionIds.find(id => id.startsWith("selection:"))!;
    const anchor = createProjectStudySelectionNoteAnchor(pinned, study.id, study.members[0]!.memberId, pin);
    const note = createProjectNote({ projectId: pinned.identity.id, stableKey: "point-note", kind: "text",
      title: "Point", body: "Observation", anchor, createdAt: 2 });
    const inspect = (project: typeof pinned) => inspectProjectNoteAnchor(note,
      projectNoteSourceResolver(project.identity.id, project.workspace));
    expect(inspect(parseMath3DProject(serializeMath3DProject(pinned))).status).toBe("current");
    const changed = upsertProjectScientificSelection(pinned, { ...selection,
      geometry: { kind: "point", position: [3, 4] } });
    expect(inspect(changed).status).toBe("missing");
    expect(() => createProjectStudySelectionNoteAnchor(changed, study.id, study.members[0]!.memberId, pin))
      .toThrow(/missing/);
  });
});
