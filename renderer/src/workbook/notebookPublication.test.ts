import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, replaceMath3DProjectWorkspace, sha256Checksum, structuralHash } from "@math3d/core";
import { createNotebookReference } from "@math3d/workbook";
import { instantiateNotebookStarter } from "../projects/notebookStarters";
import { readProjectWorkbook } from "../projects/projectWorkbookBinding";
import { captureProjectResources } from "../projects/projectResources";
import { createNotebookPublicationEvidenceSnapshot, createPortableNotebookPublication,
  inspectPortableNotebookPublication, notebookPublicationManifest,
  portableNotebookPublicationHtml, verifyNotebookPublicationEvidenceSnapshot } from "./notebookPublication";

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
    expect(manifest.citations[0]!.result).toBeNull();
    expect(manifest.citations[0]!.artifacts).toEqual([]);
  });
  it("freezes deterministic JSON evidence and lists each withheld citation and claim", () => {
    const { project, book } = fixture();
    const first = createNotebookPublicationEvidenceSnapshot([book], project);
    const second = createNotebookPublicationEvidenceSnapshot([book], project);
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.manifest.citations[0])).toBe(true);
    expect(verifyNotebookPublicationEvidenceSnapshot(first)).toBe(true);
    const missing = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, results: [],
    }));
    const withheld = createNotebookPublicationEvidenceSnapshot([book], missing);
    expect(withheld.omissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "citation", targetId: book.stages[1]!.blocks[0]!.notebookReference!.targetId }),
      expect.objectContaining({ kind: "claim" }),
    ]));
    expect(withheld.manifest.citations[0].result).toBeNull();
    expect(verifyNotebookPublicationEvidenceSnapshot(withheld)).toBe(true);
    const tampered = JSON.parse(JSON.stringify(withheld));
    tampered.omissions = [];
    const { contentHash: _old, ...changed } = tampered;
    tampered.contentHash = structuralHash(changed);
    expect(() => verifyNotebookPublicationEvidenceSnapshot(tampered)).toThrow(/omissions/);
    const exposed = JSON.parse(JSON.stringify(withheld));
    exposed.manifest.citations[0].result = project.workspace.results[0];
    const { contentHash: _previous, ...exposedContent } = exposed;
    exposed.contentHash = structuralHash(exposedContent);
    expect(() => verifyNotebookPublicationEvidenceSnapshot(exposed)).toThrow(/withheld/);
  });
});
