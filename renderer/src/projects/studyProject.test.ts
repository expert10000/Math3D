import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, createStableDocumentId, createStudyRecordV1,
  instantiateMath3DProjectTemplate, normalizeMath3DProject, parseMath3DProject,
  replaceMath3DProjectWorkspace, serializeMath3DProject } from "@math3d/core";

const project = instantiateMath3DProjectTemplate("derivative-study", "study-project-roundtrip");
const entry = project.workspace.entries[0]!;
const study = createStudyRecordV1(project.identity.id, "first", { title: "First Study",
  members: [{ memberId: "primary", documentId: entry.expected.id, expected: entry.expected, role: "source" }],
  layout: { mode: "single", panes: [{ paneId: "main", memberId: "primary" }] },
  links: [], pinnedSelectionIds: [] });

describe("Project-owned Study persistence", () => {
  it("round-trips a reference-only Study through the existing Project format", () => {
    const saved = replaceMath3DProjectWorkspace(project,
      createMixedWorkspaceDocument({ ...project.workspace, studies: [study] }));
    const reopened = parseMath3DProject(serializeMath3DProject(saved));
    expect(reopened.workspace.studies).toEqual([study]);
    expect(reopened.identity.revision).toBe(project.identity.revision + 1);
    expect(reopened.workspace.entries).toEqual(project.workspace.entries);
    expect(parseMath3DProject(serializeMath3DProject(project)).workspace.studies).toBeUndefined();
  });
  it("rejects a Study attached to another Project or edited without a new Project hash", () => {
    const alien = createStudyRecordV1(createStableDocumentId("project", "other"), "first", { ...study,
      title: "Alien" });
    expect(() => replaceMath3DProjectWorkspace(project,
      createMixedWorkspaceDocument({ ...project.workspace, studies: [alien] }))).toThrow(/owner/);
    const saved = replaceMath3DProjectWorkspace(project,
      createMixedWorkspaceDocument({ ...project.workspace, studies: [study] }));
    expect(normalizeMath3DProject({ ...saved, workspace: { ...saved.workspace, studies: [] } }).ok).toBe(false);
  });
});
