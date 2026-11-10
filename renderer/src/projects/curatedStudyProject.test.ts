import { describe, expect, it } from "vitest";
import { inspectProjectStudyMembers, instantiateMath3DProjectTemplate,
  parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { instantiateNotebookStarter } from "./notebookStarters";
import { curatedStudyHasLayout, prepareCuratedStudyProject } from "./curatedStudyProject";

describe("guided Gallery Project Study copies", () => {
  it.each(["catenary-study", "derivative-study", "scene-topology-study", "geometry-note-pins"] as const)(
    "adds an exact %s Study only to the guided copy", id => {
      const ordinary = instantiateMath3DProjectTemplate(id, "same-source");
      expect(ordinary.workspace.studies).toBeUndefined();
      const guided = prepareCuratedStudyProject(ordinary, id, "same-source");
      const reopened = parseMath3DProject(serializeMath3DProject(guided));
      expect(reopened.workspace.entries).toEqual(ordinary.workspace.entries);
      expect(reopened.workspace.studies).toHaveLength(1);
      expect(reopened.metadata.tags).toContain("curated-study-v1");
      expect(inspectProjectStudyMembers(reopened, reopened.workspace.studies![0]!).map(member => member.status))
        .toEqual(reopened.workspace.studies![0]!.members.map(() => "current-reference"));
      expect(prepareCuratedStudyProject(instantiateMath3DProjectTemplate(id, "other-source"), id,
        "other-source").workspace.studies![0]!.id).not.toBe(reopened.workspace.studies![0]!.id);
      expect(() => prepareCuratedStudyProject(guided, id, "same-source")).toThrow(/already/);
    });

  it("records the exact source result for the two derivative journeys", () => {
    for (const id of ["catenary-study", "derivative-study"] as const) {
      const project = prepareCuratedStudyProject(instantiateMath3DProjectTemplate(id, "result"), id, "result");
      expect(project.workspace.studies![0]!.members[0]!.resultId).toBe(project.workspace.results[0]!.resultId);
    }
  });

  it("adds a replayable Graph–Curve Study to a Workbook starter without altering its Workbook", () => {
    const bundle = instantiateNotebookStarter("graph-derivative-notebook", "notebook-study");
    const guided = prepareCuratedStudyProject(bundle.project, "graph-derivative-notebook", "notebook-study");
    const reopened = parseMath3DProject(serializeMath3DProject(guided));
    expect(reopened.workbooks).toEqual(bundle.project.workbooks);
    expect(reopened.workspace.studies![0]!.members.map(member =>
      reopened.workspace.entries.find(entry => entry.expected.id === member.documentId)?.module))
      .toEqual(["graph2d", "curve"]);
    expect(reopened.workspace.studies![0]!.members[0]!.resultId).toBeDefined();
  });

  it("binds the Catenoid guided Study to its saved Mesh curvature result and preserves its Workbook", () => {
    const bundle = instantiateNotebookStarter("catenoid-evidence", "catenoid-flagship");
    const guided = prepareCuratedStudyProject(bundle.project, "catenoid-evidence", "catenoid-flagship");
    const reopened = parseMath3DProject(serializeMath3DProject(guided));
    const study = reopened.workspace.studies![0]!;
    expect(study.members.map(member => reopened.workspace.entries.find(entry =>
      entry.expected.id === member.documentId)?.module)).toEqual(["surface", "mesh"]);
    expect(study.members[0]!.resultId).toBeUndefined();
    expect(study.members[1]!.resultId).toBe(reopened.workspace.results.find(result =>
      result.provenance.source.documentId === study.members[1]!.documentId)?.resultId);
    expect(reopened.workbooks).toEqual(bundle.project.workbooks);
    expect(inspectProjectStudyMembers(reopened, study).map(member => member.status))
      .toEqual(["current-reference", "current-reference"]);
  });

  it("declares only supported layouts and refuses a mismatched Project", () => {
    expect(curatedStudyHasLayout("ripple-wave-study")).toBe(true);
    expect(curatedStudyHasLayout("catenoid-evidence")).toBe(true);
    expect(curatedStudyHasLayout("mesh-curvature-study")).toBe(false);
    const project = instantiateMath3DProjectTemplate("catenary-study", "wrong");
    expect(() => prepareCuratedStudyProject(project, "derivative-study", "wrong")).toThrow(/identity/);
  });
});
