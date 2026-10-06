import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, instantiateMath3DProjectTemplate, replaceMath3DProjectWorkspace } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createNotebookReference, inspectNotebookReference } from "@math3d/workbook";
import { appendSavedMeshAnalysis } from "../projects/savedMeshAnalysis";
import { notebookRerunSupported, rerunNotebookAnalysis } from "./notebookRerun";
import { instantiateNotebookStarter } from "../projects/notebookStarters";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";

const fixture = () => {
  let project = instantiateMath3DProjectTemplate("derivative-study", "rerun");
  const previous = project.workspace.results[0]!, reference = createNotebookReference(project, "result", previous.resultId);
  const entry = project.workspace.entries.find(item => item.module === "graph2d")!;
  if (entry.checkpoint.format !== "math3d.graph2d-document") throw new Error("Graph missing");
  const adapter = new Graph2DCommandAdapter(entry.checkpoint);
  const change = (remove = false) => {
    const before = adapter.document();
    const next = adapter.commitScene({ source: { ...before.source, objects: remove ? [] : before.source.objects, variables: [{ name: "a", value: before.identity.revision }] }, display: remove ? { ...before.display, objects: [] } : before.display, selection: remove ? { objectId: null, probe: null } : before.selection }, "edit");
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map(item => item.expected.id === next.identity.id ? { ...item, checkpoint: next, expected: next.identity } : item) }));
  };
  change();
  return { read: () => ({ project, live: true }), change, previous, reference, publish: (result: Parameters<typeof appendSavedMeshAnalysis>[1]) => { project = replaceMath3DProjectWorkspace(project, appendSavedMeshAnalysis(project.workspace, result)); } };
};
describe("NOTE05 guarded reruns", () => {
  it("publishes through existing analysis, retaining the historical result and citation", async () => {
    const f = fixture(), next = await rerunNotebookAnalysis(f.reference, new AbortController().signal, f.read, () => undefined, f.publish);
    expect(next.targetId).not.toBe(f.reference.targetId);
    expect(inspectNotebookReference(f.read().project, next).status).toBe("current");
    expect(inspectNotebookReference(f.read().project, f.reference).status).toBe("stale");
    expect(f.read().project.workspace.results).toContainEqual(f.previous);
  });
  it("cancellation and source changes do not publish or overwrite prior evidence", async () => {
    for (const mode of ["cancel", "change"]) {
      const f = fixture(), controller = new AbortController(); let published = false;
      const work = rerunNotebookAnalysis(f.reference, controller.signal, f.read, () => undefined, () => { published = true; });
      if (mode === "cancel") controller.abort(); else f.change();
      await expect(work).rejects.toThrow(mode === "cancel" ? /cancelled/ : /Source changed/);
      expect(published).toBe(false); expect(f.read().project.workspace.results).toEqual([f.previous]);
    }
  });
  it("checks cancellation after calculation and preserves evidence on operation failure", async () => {
    const f = fixture(), controller = new AbortController();
    const work = rerunNotebookAnalysis(f.reference, controller.signal, f.read, () => undefined, f.publish);
    setTimeout(() => controller.abort(), 0);
    await expect(work).rejects.toThrow(/cancelled/);
    expect(f.read().project.workspace.results).toEqual([f.previous]);
    const failed = fixture(); failed.change(true);
    await expect(rerunNotebookAnalysis(failed.reference, new AbortController().signal, failed.read, () => undefined, failed.publish)).rejects.toThrow();
    expect(failed.read().project.workspace.results).toEqual([failed.previous]);
  });
  it("rejects unavailable exact Mesh bytes without publishing", async () => {
    const made = instantiateNotebookStarter("edge-path-evidence", "missing-rerun"), entry = made.project.workspace.entries.find(item => item.module === "mesh")!;
    if (entry.checkpoint.format !== "math3d.mesh-document") throw new Error("Mesh missing");
    const result = made.project.workspace.results.find(item => item.provenance.operation.type === "mesh.saved.edge-path")!, reference = createNotebookReference(made.project, "result", result.resultId);
    const adapter = new MeshDocumentAdapter(entry.checkpoint, made.resources.meshStore(made.project)), mesh = adapter.mesh();
    adapter.replaceMesh({ ...mesh, positions: mesh.positions.map(value => value * 2) }, "object-edit", { scale: 2 });
    const document = adapter.document(), project = replaceMath3DProjectWorkspace(made.project, createMixedWorkspaceDocument({ ...made.project.workspace, entries: made.project.workspace.entries.map(item => item === entry ? { ...item, checkpoint: document, expected: document.identity } : item) }));
    let published = false;
    await expect(rerunNotebookAnalysis(reference, new AbortController().signal, () => ({ project, live: true }), () => undefined, () => { published = true; })).rejects.toThrow(/Mesh source bytes/);
    expect(published).toBe(false); expect(project.workspace.results).toEqual(made.project.workspace.results);
  });
  it("rejects unsupported methods and saved previews", async () => {
    const f = fixture(); expect(notebookRerunSupported({ ...f.previous, provenance: { ...f.previous.provenance, operation: { ...f.previous.provenance.operation, algorithmVersion: "unknown" } } })).toBe(false);
    await expect(rerunNotebookAnalysis(f.reference, new AbortController().signal, () => ({ ...f.read(), live: false }), () => undefined, f.publish)).rejects.toThrow(/supported stale/);
  });
});
