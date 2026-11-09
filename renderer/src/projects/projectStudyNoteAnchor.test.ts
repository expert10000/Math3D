import { describe, expect, it } from "vitest";
import { createProjectNote, createProjectStudyFromDocuments, inspectProjectNoteAnchor,
  instantiateMath3DProjectTemplate, normalizeProjectNoteAnchor, parseMath3DProject,
  renameProjectStudy, serializeMath3DProject, upsertMath3DProjectNote, upsertProjectStudy } from "@math3d/core";
import { projectNoteSourceResolver } from "./projectNoteTargets";
import { createProjectStudySelectionNoteAnchor } from "./projectStudyNoteAnchor";

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
});
