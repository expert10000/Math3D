import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, instantiateMath3DProjectTemplate, replaceMath3DProjectWorkspace } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createNotebookReference, inspectNotebookReference } from "@math3d/workbook";
import { appendSavedMeshAnalysis } from "../projects/savedMeshAnalysis";
import { notebookRerunSupported, rerunNotebookAnalysis } from "./notebookRerun";

const fixture = () => {
  let project = instantiateMath3DProjectTemplate("derivative-study", "rerun");
  const previous = project.workspace.results[0]!, reference = createNotebookReference(project, "result", previous.resultId);
  const entry = project.workspace.entries.find(item => item.module === "graph2d")!;
  if (entry.checkpoint.format !== "math3d.graph2d-document") throw new Error("Graph missing");
  const adapter = new Graph2DCommandAdapter(entry.checkpoint);
  const change = () => {
    const before = adapter.document();
    const next = adapter.commitScene({ source: { ...before.source, variables: [{ name: "a", value: before.identity.revision }] }, display: before.display, selection: before.selection }, "edit");
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
  it("rejects unavailable Mesh bytes, unsupported methods and saved previews", async () => {
    const f = fixture(); expect(notebookRerunSupported({ ...f.previous, provenance: { ...f.previous.provenance, operation: { ...f.previous.provenance.operation, algorithmVersion: "unknown" } } })).toBe(false);
    await expect(rerunNotebookAnalysis(f.reference, new AbortController().signal, () => ({ ...f.read(), live: false }), () => undefined, f.publish)).rejects.toThrow(/supported stale/);
  });
});
