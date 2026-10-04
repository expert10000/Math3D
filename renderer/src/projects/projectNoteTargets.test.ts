import { describe, expect, it } from "vitest";
import { createMath3DProject, createMeshDocument, createMixedWorkspaceDocument, createProjectNote, geometryDocumentFromSceneDocument,
  inspectProjectNoteAnchor, replaceGeometryDocumentSource, replaceMeshDocumentSource, structuralHash } from "@math3d/core";
import { createProjectNoteSelectionAnchor, projectNoteSourceResolver } from "./projectNoteTargets";

const scene = () => geometryDocumentFromSceneDocument({ id: "notes-geometry", title: "Box", createdAt: 0, updatedAt: 0,
  objects: [{ id: "box", type: "box", name: "Box", params: { width: 2, height: 3, depth: 4 }, visible: true,
    material: { color: 0x3366ff, opacity: 1 }, transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }] });
const workspace = (document = scene()) => createMixedWorkspaceDocument({ entries: [{ module: "geometry" as const, checkpoint: document,
  expected: document.identity, replay: null }], activeDocumentIds: [document.identity.id], constructions: [], results: [], relations: [],
  artifacts: [], committedSelection: null });

describe("NTS03 exact scene targets", () => {
  it("keeps object and face IDs through Project save, reopen, transform, and shape edits", () => {
    const initial = scene(), original = workspace(initial);
    const project = createMath3DProject(original, { stableKey: "selection-notes", title: "Selection study" });
    const object = createProjectNoteSelectionAnchor(original, { module: "geometry", documentId: initial.identity.id, objectId: "box" });
    const face = createProjectNoteSelectionAnchor(original, { module: "geometry", documentId: initial.identity.id, objectId: "box",
      entityKind: "face", entityId: "face:front" });
    expect(object.kind).toBe("object-local");
    expect(face.kind).toBe("entity-selection");
    const objectNote = createProjectNote({ projectId: project.identity.id, stableKey: "box", kind: "text", title: "Box", body: "Object.", anchor: object, createdAt: 1 });
    const faceNote = createProjectNote({ projectId: project.identity.id, stableKey: "face", kind: "text", title: "Face", body: "Front face.", anchor: face, createdAt: 1 });
    const status = (document: ReturnType<typeof scene>) => [objectNote, faceNote].map((note) =>
      inspectProjectNoteAnchor(note, projectNoteSourceResolver(project.identity.id, workspace(document))).status);
    expect(status(initial)).toEqual(["current", "current"]);
    const moved = replaceGeometryDocumentSource(initial, { ...initial.source, objects: [{ ...initial.source.objects[0]!,
      transform: { ...initial.source.objects[0]!.transform, position: { x: 3, y: 0, z: 0 } } }] });
    expect(status(moved)).toEqual(["current", "current"]);
    const resized = replaceGeometryDocumentSource(moved, { ...moved.source, objects: [{ ...moved.source.objects[0]!, params: { width: 5, height: 3, depth: 4 } }] });
    expect(status(resized)).toEqual(["stale", "stale"]);
    const removed = replaceGeometryDocumentSource(resized, { ...resized.source, objects: [] });
    expect(status(removed)).toEqual(["missing", "missing"]);
  });

  it("identifies a Mesh face by object, index, and resource checksum", () => {
    const mesh = createMeshDocument({ stableKey: "note-mesh", label: "Triangle", source: {
      objectId: "triangle", resource: { id: "triangle-resource", checksum: structuralHash("triangle-v1"), vertexCount: 3, indexCount: 3,
        hasNormals: false, hasUvs: false, encoding: "math3d.mesh-buffers.v1" }, origin: {},
    } });
    const meshWorkspace = (document = mesh) => createMixedWorkspaceDocument({ entries: [{ module: "mesh" as const, checkpoint: document,
      expected: document.identity, replay: null }], activeDocumentIds: [document.identity.id], constructions: [], results: [],
      relations: [], artifacts: [], committedSelection: null });
    const project = createMath3DProject(meshWorkspace(), { stableKey: "mesh-note", title: "Mesh study" });
    const anchor = createProjectNoteSelectionAnchor(meshWorkspace(), { module: "mesh", documentId: mesh.identity.id,
      objectId: "triangle", entityKind: "face", entityId: "0" });
    const note = createProjectNote({ projectId: project.identity.id, stableKey: "mesh-face", kind: "text", title: "Face", body: "Triangle face.",
      anchor, createdAt: 1 });
    const status = (document: typeof mesh) => inspectProjectNoteAnchor(note, projectNoteSourceResolver(project.identity.id, meshWorkspace(document))).status;
    expect(status(mesh)).toBe("current");
    const updated = replaceMeshDocumentSource(mesh, { ...mesh.source, resource: { ...mesh.source.resource, checksum: structuralHash("triangle-v2") } });
    expect(status(updated)).toBe("stale");
  });
});
