import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, replaceMath3DProjectWorkspace, sha256Checksum } from "@math3d/core";
import { createNotebookReference } from "@math3d/workbook";
import { instantiateNotebookStarter } from "../projects/notebookStarters";
import { readProjectWorkbook } from "../projects/projectWorkbookBinding";
import { captureProjectResources } from "../projects/projectResources";
import { createPortableNotebookPublication, inspectPortableNotebookPublication, notebookPublicationManifest, portableNotebookPublicationHtml } from "./notebookPublication";

const fixture = () => {
  const made = instantiateNotebookStarter("edge-path-evidence", "publication"), ref = made.project.workbooks![0]!;
  return { ...made, book: readProjectWorkbook(made.resources.bytes({ kind: "workbook-payload", id: ref.id })!, ref) };
};
describe("NOTE06 publication", () => {
  it("selects report blocks, retains qualified exact citations and reopens an ordinary Project package", () => {
    const { project, resources, book } = fixture(), block = book.stages[1]!.blocks[0]!;
    const payload = createPortableNotebookPublication(project, [book], resources, undefined, undefined, [block.id]);
    expect(payload.manifest.blocks.map(item => item.blockId)).toEqual([block.id]);
    expect(payload.manifest.citations[0]!.status).toBe("current"); expect(payload.manifest.citations[0]!.result!.status).toBe("numerical");
    const reopened = inspectPortableNotebookPublication(payload);
    expect(reopened.project.identity.id).toBe(project.identity.id);
    expect(reopened.resources.meshStore(reopened.project)).toBeTruthy();
    expect(portableNotebookPublicationHtml("<html><body>Report</body></html>", payload)).toContain('type="application/json"');
    expect(() => inspectPortableNotebookPublication({ ...payload, packageJson: payload.packageJson.replace('"schemaVersion":1', '"schemaVersion":2') })).toThrow(/checksum/);
  });
  it("fails before export when source bytes are absent", () => {
    const { project, book } = fixture(), missing = captureProjectResources(project, () => null, true);
    expect(() => createPortableNotebookPublication(project, [book], missing)).toThrow(/Missing source resource/);
  });
  it("requires exact artifact bytes and fails when they disappear or are corrupted", () => {
    const { project: base, book, resources } = fixture(), bytes = new Uint8Array([1, 2, 3]), handle = { artifactId: "publication-field", kind: "binary" as const, role: "field" };
    const result = { ...base.workspace.results.find(item => item.provenance.operation.type === "mesh.saved.edge-path")!, artifacts: [handle] };
    const project = replaceMath3DProjectWorkspace(base, createMixedWorkspaceDocument({ ...base.workspace, results: base.workspace.results.map(item => item.resultId === result.resultId ? result : item), artifacts: [{ handle, contentHash: sha256Checksum(bytes), byteLength: bytes.length }] }));
    book.stages[1]!.blocks[0]!.notebookReference = createNotebookReference(project, "result", result.resultId);
    delete book.stages[3]!.blocks[1]!.claim;
    expect(() => createPortableNotebookPublication(project, [book], resources)).toThrow(/artifact bytes are unavailable/);
    expect(() => createPortableNotebookPublication(project, [book], resources, () => new Uint8Array([3, 2, 1]))).toThrow(/artifact bytes are unavailable/);
    const payload = createPortableNotebookPublication(project, [book], resources, () => bytes);
    expect(inspectPortableNotebookPublication(payload).project.identity.id).toBe(project.identity.id);
    expect(() => inspectPortableNotebookPublication({ ...payload, artifacts: [] })).toThrow(/artifact is missing/);
  });
  it("keeps stale and unavailable evidence qualified rather than claiming current support", () => {
    const { project, book } = fixture();
    const missing = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace, results: [] }));
    const manifest = notebookPublicationManifest([book], missing);
    expect(manifest.citations[0]!.status).toBe("missing");
    expect(manifest.blocks.find(block => block.claim)!.claim!.status).toBe("stale");
  });
});
