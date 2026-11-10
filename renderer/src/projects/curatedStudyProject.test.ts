import { describe, expect, it } from "vitest";
import { inspectProjectStudyMembers, instantiateMath3DProjectTemplate,
  parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { instantiateNotebookStarter } from "./notebookStarters";
import { curatedStudyHasLayout, prepareCuratedStudyBundle, prepareCuratedStudyProject } from "./curatedStudyProject";
import { exportProjectPackage, parseProjectPackage } from "./projectResources";
import { readProjectWorkbook } from "./projectWorkbookBinding";

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

  it("declares only supported layouts and refuses a mismatched Project", () => {
    expect(curatedStudyHasLayout("ripple-wave-study")).toBe(true);
    expect(curatedStudyHasLayout("mesh-curvature-study")).toBe(true);
    const project = instantiateMath3DProjectTemplate("catenary-study", "wrong");
    expect(() => prepareCuratedStudyProject(project, "derivative-study", "wrong")).toThrow(/identity/);
  });

  it.each(["catenoid-evidence", "edge-path-evidence", "mesh-comparison-study", "mesh-curvature-study"] as const)(
    "connects the %s guided Study, Note, Workbook and exact source after package import", id => {
      const ordinary = instantiateNotebookStarter(id, `guided-${id}`);
      const guided = prepareCuratedStudyBundle(ordinary, id, `guided-${id}`);
      const reopened = parseProjectPackage(exportProjectPackage(guided.project, guided.resources!));
      const study = reopened.project.workspace.studies![0]!;
      expect(study.paneReferences?.length).toBe(study.layout.panes.length);
      expect(study.members[0]!.resultId).toBeDefined();
      const note = reopened.project.notes!.find(item => item.title.endsWith("observation"))!;
      expect(note.anchor?.researchReference?.resources.length).toBeGreaterThan(0);
      const research = reopened.project.workbooks!.find(item => item.title === `${study.title} Research`)!;
      const book = readProjectWorkbook(reopened.resources.bytes({ kind: "workbook-payload", id: research.id })!, research);
      expect(book.stages[1]!.blocks[0]!.notebookReference?.targetId).toBe(study.id);
      expect(book.dependencies?.some(item => item.source.kind === "note" && item.source.noteId === note.identity.id)).toBe(true);
      expect(ordinary.project.workspace.studies).toBeUndefined();
    });
});
