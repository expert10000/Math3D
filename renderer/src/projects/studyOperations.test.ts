import { describe, expect, it } from "vitest";
import { configureProjectStudy, createProjectStudyFromDocuments, deleteProjectDocument, forkProjectStudy,
  inspectProjectDocumentDelete, inspectProjectStudyMembers, instantiateMath3DProjectTemplate,
  parseMath3DProject, renameProjectStudy, serializeMath3DProject } from "@math3d/core";

const project = instantiateMath3DProjectTemplate("derivative-study", "study-operations");
const ids = project.workspace.entries.slice(0, 2).map(entry => entry.expected.id);

describe("Project Study operations", () => {
  it("creates a two-pane Study with stable exact references and reopens it", () => {
    const saved = createProjectStudyFromDocuments(project, "pair", "Graph and Curve", ids);
    const study = saved.workspace.studies![0]!;
    expect(study.layout.mode).toBe("split-2");
    expect(study.members.map(member => member.documentId)).toEqual(ids);
    expect(inspectProjectStudyMembers(saved, study).map(member => member.status))
      .toEqual(["current-reference", "current-reference"]);
    expect(parseMath3DProject(serializeMath3DProject(saved)).workspace.studies).toEqual([study]);
    expect(() => createProjectStudyFromDocuments(saved, "pair", "Again", ids)).toThrow(/already exists/);
  });
  it("renames and forks without copying participating documents", () => {
    const saved = createProjectStudyFromDocuments(project, "pair", "Graph and Curve", ids);
    const first = saved.workspace.studies![0]!;
    const renamed = renameProjectStudy(saved, first.id, "Revised question");
    expect(renamed.workspace.studies![0]!.title).toBe("Revised question");
    const forked = forkProjectStudy(renamed, first.id, "fork", "Another question");
    expect(forked.workspace.studies).toHaveLength(2);
    expect(forked.workspace.entries).toEqual(project.workspace.entries);
    expect(new Set(forked.workspace.studies!.map(item => item.id)).size).toBe(2);
  });
  it("saves a question and reordered layout without changing source pins or pane identities", () => {
    const saved = createProjectStudyFromDocuments(project, "pair", "Graph and Curve", ids);
    const original = saved.workspace.studies![0]!;
    const configured = configureProjectStudy(saved, original.id, { description: "How does the curve follow the graph?",
      mode: "tabs", paneIds: ["pane-2", "pane-1"] });
    const reopened = parseMath3DProject(serializeMath3DProject(configured));
    const study = reopened.workspace.studies![0]!;
    expect(study.description).toBe("How does the curve follow the graph?");
    expect(study.layout).toEqual({ mode: "tabs", panes: [original.layout.panes[1], original.layout.panes[0]] });
    expect(study.members).toEqual(original.members);
    expect(reopened.workspace.entries).toEqual(project.workspace.entries);
    expect(() => configureProjectStudy(saved, original.id, { description: "", mode: "tabs",
      paneIds: ["pane-1", "pane-1"] })).toThrow(/retain every saved pane/);
    expect(() => configureProjectStudy(saved, original.id, { description: "", mode: "quad",
      paneIds: ["pane-1", "pane-2"] })).toThrow(/layout/);
  });
  it("classifies changed and missing members without rewriting their pinned identity", () => {
    const saved = createProjectStudyFromDocuments(project, "pair", "Graph and Curve", ids);
    const study = saved.workspace.studies![0]!;
    const changed = { ...saved, workspace: { ...saved.workspace, entries: saved.workspace.entries.map(entry =>
      entry.expected.id === ids[0] ? { ...entry, expected: { ...entry.expected,
        revision: entry.expected.revision + 1 } } : entry) } };
    expect(inspectProjectStudyMembers(changed, study)[0]!.status).toBe("changed");
    const missing = { ...saved, workspace: { ...saved.workspace, entries: saved.workspace.entries.filter(entry =>
      entry.expected.id !== ids[0]) } };
    expect(inspectProjectStudyMembers(missing, study)[0]!.status).toBe("missing-document");
    expect(study.members[0]!.expected).toEqual(project.workspace.entries[0]!.expected);
  });
  it("blocks deleting a document while a saved Study references it", () => {
    const saved = createProjectStudyFromDocuments(project, "pair", "Graph and Curve", ids);
    const study = saved.workspace.studies![0]!;
    expect(inspectProjectDocumentDelete(saved, ids[0]!).dependentStudyIds).toContain(study.id);
    expect(() => deleteProjectDocument(saved, ids[0]!)).toThrow(/Delete blocked/);
  });
});
