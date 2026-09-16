import { describe, expect, it } from "vitest";
import { normalizeMeshDocument } from "@math3d/core";
import { MeshDocumentAdapter } from "./meshDocumentAdapter";
import type { SurfaceMeshData } from "./surfaceMesh";

const triangle = (): SurfaceMeshData => ({
  label: "Imported triangle",
  source: { kind: "import", format: "obj", filename: "triangle.obj" },
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
});

describe("GK07 MeshDocument adapter", () => {
  it("keeps imported buffers in a binary artifact and round-trips identity", () => {
    const adapter = MeshDocumentAdapter.fromMesh(triangle());
    const first = adapter.document();
    const json = JSON.stringify(first);
    expect(json).not.toContain("positions");
    expect(json).not.toContain("indices");
    expect(first.source.resource.vertexCount).toBe(3);
    const pkg = adapter.exportPackage();
    const reopened = MeshDocumentAdapter.restore({ document: JSON.parse(json), resourceBytes: pkg.resourceBytes });
    expect(reopened.document()).toEqual(first);
    expect(Array.from(reopened.mesh().positions)).toEqual(Array.from(triangle().positions));
    expect(Array.from(reopened.mesh().indices ?? [])).toEqual([0, 1, 2]);
  });

  it("keeps IDs stable and advances revision only for structural changes", () => {
    const adapter = MeshDocumentAdapter.fromMesh(triangle());
    const before = adapter.document();
    adapter.replaceMesh({ ...triangle(), label: "Renamed" });
    expect(adapter.document().identity).toEqual(before.identity);
    const edited = triangle();
    edited.positions[3] = 2;
    adapter.replaceMesh(edited);
    expect(adapter.document().identity.id).toBe(before.identity.id);
    expect(adapter.document().source.objectId).toBe(before.source.objectId);
    expect(adapter.document().identity.revision).toBe(before.identity.revision + 1);
    expect(adapter.document().identity.structuralHash).not.toBe(before.identity.structuralHash);
    expect(adapter.sourceGeneration()).toMatchObject({
      documentId: before.identity.id,
      revision: before.identity.revision + 1,
      generation: before.identity.revision + 1,
    });
  });

  it("rejects corrupt binary sidecars", () => {
    const pkg = MeshDocumentAdapter.fromMesh(triangle()).exportPackage();
    const corrupted = pkg.resourceBytes.slice();
    corrupted[corrupted.length - 1] ^= 1;
    expect(() => MeshDocumentAdapter.restore({ document: pkg.document, resourceBytes: corrupted })).toThrow(/checksum/);
  });

  it("rejects accidental bulk arrays embedded in document JSON", () => {
    const document = MeshDocumentAdapter.fromMesh(triangle()).document();
    expect(normalizeMeshDocument({ ...document, positions: [0, 1, 2] }).ok).toBe(false);
    expect(normalizeMeshDocument({ ...document, source: { ...document.source, indices: [0, 1, 2] } }).ok).toBe(false);
  });

  it("retains invalid imported indices for Mesh Health instead of rejecting the document", () => {
    const malformed = triangle();
    malformed.indices = new Uint32Array([0, 1, 99]);
    const reopened = MeshDocumentAdapter.restore(MeshDocumentAdapter.fromMesh(malformed).exportPackage());
    expect(Array.from(reopened.mesh().indices ?? [])).toEqual([0, 1, 99]);
  });

  it("commits edits and selection atomically, replays, and undoes without buffer JSON", () => {
    const adapter = MeshDocumentAdapter.fromMesh(triangle());
    const first = adapter.document();
    const edited = triangle();
    edited.positions[3] = 2;
    adapter.replaceMesh(edited, "vertex-edit", { vertexIndex: 1 });
    adapter.commitSelection([adapter.document().source.objectId]);
    expect(adapter.document().identity.revision).toBe(first.identity.revision + 1);
    const replay = adapter.exportReplay();
    expect(JSON.stringify(replay.transactions)).not.toContain("positions");
    expect(JSON.stringify(replay.transactions)).not.toContain("indices");
    const restored = MeshDocumentAdapter.restoreReplay(replay);
    expect(restored.document()).toEqual(adapter.document());
    expect(restored.selection()).toEqual(adapter.selection());
    expect(Array.from(restored.mesh().positions)).toEqual(Array.from(edited.positions));
    expect(restored.undo()).not.toBeNull(); // selection
    expect(restored.selection()).toEqual([]);
    expect(restored.undo()).not.toBeNull(); // vertex edit
    expect(Array.from(restored.mesh().positions)).toEqual(Array.from(triangle().positions));
    expect(restored.redo()).not.toBeNull();
    expect(Array.from(restored.mesh().positions)).toEqual(Array.from(edited.positions));
  });
});
