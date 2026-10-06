import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, instantiateMath3DProjectTemplate, replaceMath3DProjectWorkspace, sha256Checksum } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createNotebookReference, inspectNotebookProvenance } from "@math3d/workbook";
describe("NOTE04 provenance", () => {
  it("retains historical result details and qualifies relations after source edits", () => {
    const project = instantiateMath3DProjectTemplate("catenary-study", "provenance"), result = project.workspace.results[0]!;
    const citation = createNotebookReference(project, "result", result.resultId);
    const entry = project.workspace.entries.find(item => item.expected.id === result.provenance.source.documentId)!;
    if (entry.checkpoint.format !== "math3d.graph2d-document") throw new Error("Expected graph");
    const graph = entry.checkpoint, next = new Graph2DCommandAdapter(graph).commitScene({ source: { ...graph.source, objects: [] }, display: { ...graph.display, objects: [] }, selection: { objectId: null, probe: null } }, "delete");
    const edited = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map(item => item === entry ? { ...entry, expected: next.identity, checkpoint: next } : item) }));
    const historical = inspectNotebookProvenance(edited, citation);
    expect(historical.inspection?.status).toBe("stale"); expect(historical.result).toEqual(result);
    expect(historical.relations.length).toBeGreaterThan(0); expect(historical.relations.some(item => item.status === "stale")).toBe(true);
  });
  it("requires exact bytes, a checksum and byte count; metadata never implies availability", () => {
    const base = instantiateMath3DProjectTemplate("catenary-study", "artifact"), bytes = new Uint8Array([1,2,3]), handle = { artifactId: "notebook-artifact", kind: "binary" as const, role: "test-field" };
    const result = { ...base.workspace.results[0]!, artifacts: [handle] };
    const project = replaceMath3DProjectWorkspace(base, createMixedWorkspaceDocument({ ...base.workspace, results: [result], artifacts: [{ handle, contentHash: sha256Checksum(bytes), byteLength: bytes.length }] }));
    const citation = createNotebookReference(project, "result", result.resultId);
    expect(inspectNotebookProvenance(project, citation).artifacts[0]?.status).toBe("unverified");
    expect(inspectNotebookProvenance(project, citation, () => null).artifacts[0]?.status).toBe("unavailable");
    expect(inspectNotebookProvenance(project, citation, () => new Uint8Array([3,2,1])).artifacts[0]?.status).toBe("unavailable");
    expect(inspectNotebookProvenance(project, citation, () => bytes).artifacts[0]?.status).toBe("verified");
  });
  it("does not resolve a result in another Project or substitute modified summary evidence", () => {
    const project = instantiateMath3DProjectTemplate("catenary-study", "exact"), reference = createNotebookReference(project, "result", project.workspace.results[0]!.resultId);
    expect(inspectNotebookProvenance(instantiateMath3DProjectTemplate("catenary-study", "different"), reference).result).toBeUndefined();
    const changed = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace, results: project.workspace.results.map(item => ({ ...item, summary: { length: 999 } })) }));
    expect(inspectNotebookProvenance(changed, reference).result).toBeUndefined();
  });
});
