import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, structuralHash } from "@math3d/core";
import { createDefaultWorkbook, inspectWorkbookSavedMeshTrendReference, normalizeWorkbookSavedMeshTrendReference } from "@math3d/workbook";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { analyzeSavedMesh } from "./savedMeshAnalysis";
import { transformWithRetainedMeshSnapshot } from "./retainedMeshGeneration";
import { captureProjectResources, exportProjectPackage, parseProjectPackage } from "./projectResources";
import { prepareProjectWorkbook, readProjectWorkbook } from "./projectWorkbookBinding";
import { createWorkbookSavedMeshTrendReference, inspectWorkbookSavedMeshTrend } from "./projectSavedMeshWorkbookTrend";
import { createPortableNotebookPublication, inspectPortableNotebookPublication, notebookPublicationManifest,
  notebookPublicationManifestHtml, notebookPublicationMarkdown } from "../workbook/notebookPublication";

const fixture = () => {
  const adapter = MeshDocumentAdapter.fromMesh({ label: "Trend", source: { kind: "import" as const, format: "obj" as const,
    filename: "trend.obj", math3dCoordinateFrame: { format: "math3d.coordinate-frame/v1", frame: "local", unit: "m",
      axes: ["x", "y", "z"], handedness: "right" } },
    positions: Float32Array.from([0,0,0,1,0,0,0,1,0]), indices: Uint32Array.from([0,1,2]) });
  const first = analyzeSavedMesh(adapter, "quality");
  transformWithRetainedMeshSnapshot(adapter, [0, 0, 0], 2);
  const second = analyzeSavedMesh(adapter, "quality");
  const replay = adapter.replayBundle();
  const workspace = createMixedWorkspaceDocument({ entries: [{ module: "mesh", checkpoint: replay.checkpoint.document,
    expected: adapter.document().identity, replay: { format: "math3d.mesh-replay.v1", payload: replay as never } }],
    activeDocumentIds: [adapter.document().identity.id], constructions: [], results: [first, second], relations: [], artifacts: [], committedSelection: null });
  const project = createMath3DProject(workspace, { stableKey: "pc15" });
  const resources = captureProjectResources(project, item => adapter.resources.bytes(item.reference as never));
  return { project, resources, first, second };
};

describe("PC15 Workbook saved Mesh trend reference", () => {
  it("stores exact result/source hashes and survives a portable Project and Workbook restart", () => {
    const { project, resources, first, second } = fixture();
    const ref = createWorkbookSavedMeshTrendReference(project, first.resultId, "faceCount", item => resources.bytes(item));
    expect(inspectWorkbookSavedMeshTrendReference(project, ref)).toBe("current");
    expect(ref.results.map(item => item.resultId)).toEqual([first.resultId, second.resultId]);
    expect(ref.results.map(item => item.sourceHash)).toEqual([first, second].map(item => item.provenance.source.structuralHash));
    let n = 0; const workbook = createDefaultWorkbook(() => `pc15-${++n}`);
    workbook.stages[2]!.blocks[0]!.visualize = { live: false, savedMeshTrend: ref };
    const bound = prepareProjectWorkbook(project, workbook, "pc15");
    const restoredWorkbook = readProjectWorkbook(bound.bytes, bound.reference);
    expect(restoredWorkbook.stages[2]!.blocks[0]!.visualize?.savedMeshTrend).toEqual(ref);
    const portable = parseProjectPackage(exportProjectPackage(project, resources));
    const inspection = inspectWorkbookSavedMeshTrend(portable.project, ref, item => portable.resources.bytes(item));
    expect(inspection.status).toBe("current");
    expect(inspection.study?.rows.filter(row => row.status === "available")).toHaveLength(2);
    expect(JSON.stringify(ref)).not.toContain("positions");
  });
  it("refuses malformed, missing, altered, and extra saved result evidence", () => {
    const { project, resources, first } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const ref = createWorkbookSavedMeshTrendReference(project, first.resultId, "faceCount", read);
    expect(() => normalizeWorkbookSavedMeshTrendReference({ ...ref, results: [...ref.results, ref.results[0]] })).toThrow();
    expect(inspectWorkbookSavedMeshTrend(project, ref, () => null).status).toBe("missing");
    expect(inspectWorkbookSavedMeshTrend(project, { ...ref, results: [{ ...ref.results[0]!, resultHash: structuralHash("changed") }, ...ref.results.slice(1)] }, read).status).toBe("stale");
    const changed = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace, results: [first] }), { stableKey: "pc15" });
    expect(inspectWorkbookSavedMeshTrendReference(changed, ref)).toBe("missing");
    expect(inspectWorkbookSavedMeshTrend(changed, ref, read).status).toBe("stale");
    expect(inspectWorkbookSavedMeshTrend(project, ref, item => { const bytes = read(item); if (!bytes) return null;
      const copy = bytes.slice(); copy[0] ^= 1; return copy; }).status).toBe("missing");
  });
  it("exports checked Workbook evidence and re-verifies a portable publication", () => {
    const { project, resources, first, second } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const ref = createWorkbookSavedMeshTrendReference(project, first.resultId, "faceCount", read);
    let n = 0; const workbook = createDefaultWorkbook(() => `pc15-export-${++n}`);
    workbook.stages[2]!.blocks[0]!.visualize = { live: false, savedMeshTrend: ref };
    const manifest = notebookPublicationManifest([workbook], project, undefined, undefined, read);
    expect(manifest.blocks.some(block => block.savedMeshTrend?.rows.length === 2)).toBe(true);
    const html = notebookPublicationManifestHtml(manifest), markdown = notebookPublicationMarkdown(manifest);
    expect(html).toContain("data-saved-mesh-trend");
    for (const result of [first, second]) { expect(html).toContain(result.resultId); expect(markdown).toContain(result.provenance.source.structuralHash); }
    const portable = createPortableNotebookPublication(project, [workbook], resources, undefined, read);
    expect(inspectPortableNotebookPublication(portable).project.identity.id).toBe(project.identity.id);
    expect(() => notebookPublicationManifest([workbook], project, undefined, undefined, () => null)).toThrow(/trend/);
    const changed = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace, results: [first] }), { stableKey: "pc15" });
    expect(() => notebookPublicationManifest([workbook], changed, undefined, undefined, read)).toThrow(/trend/);
  });
});
