import { describe, expect, it } from "vitest";
import { assessWorkbookClaim, inspectNotebookReference, updateWorkbookNamedParameter, workbookParameterAffectedBlocks } from "@math3d/workbook";
import { instantiateNotebookStarter, NOTEBOOK_STARTERS } from "./notebookStarters";
import { exportProjectPackage, parseProjectPackage } from "./projectResources";
import { readProjectWorkbook } from "./projectWorkbookBinding";
import { projectNoteRenderedBody } from "./projectNoteValues";
import { inspectProjectCompatibility } from "./projectTransfer";
import { selectProjectDocument } from "./projectResume";

describe("ready-to-open evidence notebooks", () => {
  it("Ripple Wave links its four native documents and portable Mesh bytes", () => {
    const made = instantiateNotebookStarter("ripple-wave-study", "example");
    const reopened = parseProjectPackage(exportProjectPackage(made.project, made.resources));
    const entries = reopened.project.workspace.entries;
    expect(entries.map(entry => entry.module)).toEqual(["graph2d", "surface", "mesh", "geometry"]);
    const [graph, surface, mesh, geometry] = entries;
    expect(surface!.checkpoint.format).toBe("math3d.surface-document");
    if (surface!.checkpoint.format !== "math3d.surface-document") throw new Error("Ripple Surface missing");
    expect(surface!.checkpoint.source.definition.familyId).toBe("graph2d.extrusion");
    if (geometry!.checkpoint.format !== "math3d.geometry-document") throw new Error("Ripple Geometry missing");
    expect(geometry!.checkpoint.source.objects).toHaveLength(4);
    for (const marker of geometry!.checkpoint.source.objects) {
      const x = marker.transform.position.x;
      expect(marker.transform.position.y).toBeCloseTo(Math.sin(2 * x) / (1 + 0.1 * x * x));
    }
    expect(reopened.project.workspace.relations.map(relation => [relation.sources[0]?.documentId,
      relation.target.type === "document" ? relation.target.generation.documentId : null])).toEqual([
      [graph!.expected.id, surface!.expected.id], [surface!.expected.id, mesh!.expected.id], [surface!.expected.id, geometry!.expected.id],
    ]);
    expect(selectProjectDocument(reopened.project, null).selected.expected.id).toBe(surface!.expected.id);
    expect(inspectProjectCompatibility(reopened.project, { resources: reopened.resources }).canOpenWorkspace).toBe(true);
    expect(reopened.resources.meshStore(reopened.project)).toBeTruthy();
    expect(instantiateNotebookStarter("ripple-wave-study", "other").project.identity.id).not.toBe(made.project.identity.id);
  });

  for (const recipe of NOTEBOOK_STARTERS.filter(item => item.id === "catenoid-evidence" || item.id === "edge-path-evidence")) it(`${recipe.title} retains real source resources, live Notes, bindings and exact claims`, () => {
    const made = instantiateNotebookStarter(recipe.id, "example"), reopened = parseProjectPackage(exportProjectPackage(made.project, made.resources));
    const ref = reopened.project.workbooks![0]!, bytes = reopened.resources.bytes({ kind: "workbook-payload", id: ref.id })!;
    const book = readProjectWorkbook(bytes, ref), blocks = book.stages.flatMap(stage => stage.blocks), result = blocks.find(block => block.notebookReference)!;
    expect(inspectNotebookReference(reopened.project, result.notebookReference!).status).toBe("current");
    expect(assessWorkbookClaim(blocks.find(block => block.claim)!.claim!, book, reopened.project).status).toBe("supported");
    expect(workbookParameterAffectedBlocks(updateWorkbookNamedParameter(book, "resolution", { value: 65 }), "resolution")).toEqual([`${recipe.id}-grid`]);
    const note = reopened.project.notes!.find(item => item.title === "Measured evidence")!;
    expect(projectNoteRenderedBody(note, reopened.project.workspace)).not.toContain("{{value:");
    expect(reopened.resources.meshStore(reopened.project)).toBeTruthy();
    expect(instantiateNotebookStarter(recipe.id, "other").project.identity.id).not.toBe(made.project.identity.id);
  });

  for (const id of ["graph-derivative-notebook", "curve-construction-notebook"] as const) it(`${id} keeps ordinary source documents and a Project Workbook through export`, () => {
    const made = instantiateNotebookStarter(id, "example"), reopened = parseProjectPackage(exportProjectPackage(made.project, made.resources));
    const ref = reopened.project.workbooks![0]!, bytes = reopened.resources.bytes({ kind: "workbook-payload", id: ref.id })!;
    const book = readProjectWorkbook(bytes, ref), citations = book.stages.flatMap(stage => stage.blocks).filter(block => block.notebookReference);
    expect(citations).toHaveLength(3);
    expect(citations.map(block => inspectNotebookReference(reopened.project, block.notebookReference!).status)).toEqual(["current", "current", "current"]);
    expect(reopened.project.notes).toHaveLength(1);
    expect(reopened.project.notes![0]!.anchor?.kind).toBe("document");
    expect(reopened.project.workspace.results).toHaveLength(id === "graph-derivative-notebook" ? 1 : 0);
    expect(book.stages[3]!.blocks.some(block => block.claim)).toBe(false);
    expect(instantiateNotebookStarter(id, "other").project.identity.id).not.toBe(made.project.identity.id);
  });
});
