import { structuralHash, viewerSourceFromDocument,
  type Graph2DDocument, type GeometryDocument, type KernelWorkspaceDocument, type MeshDocument,
  type MixedWorkspaceDocument, type ProjectNoteAnchor, type ProjectNoteAnchorResolver, type StableDocumentId } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

export type NoteSelectionDescriptor = Readonly<{
  module: "geometry" | "mesh" | "graph2d"; documentId: string; objectId: string;
  entityKind?: "object" | "face" | "edge" | "vertex"; entityId?: string;
  localPosition?: readonly [number, number, number] | null;
  probe?: Readonly<{ x: number; y: number; parameter?: number; rowId?: string }> | null;
}>;

export const geometryObjectShape = (document: GeometryDocument, id: string) => {
  const object = document.source.objects.find((item) => item.id === id);
  return object ? structuralHash({ type: object.type, params: object.params, geometry: document.source.geometry,
    constructions: document.source.constructions, relationships: document.source.relationships }) : null;
};
const meshShape = (document: MeshDocument, id: string) => id === document.source.objectId ? document.source.resource.checksum : null;
const objectShape = (document: KernelWorkspaceDocument | undefined, id: string) =>
  document?.format === "math3d.geometry-document" ? geometryObjectShape(document, id) :
    document?.format === "math3d.mesh-document" ? meshShape(document, id) : null;

/** Resolve a committed UI selection to a source-owned ID, never a list index or display label. */
export const createProjectNoteSelectionAnchor = (workspace: MixedWorkspaceDocument, selected: NoteSelectionDescriptor): ProjectNoteAnchor => {
  const entry = workspace.entries.find((item) => item.expected.id === selected.documentId && item.module === selected.module);
  if (!entry) throw new TypeError("Selected source document is not in this workspace.");
  const document = verifyMixedWorkspaceReplay(workspace).get(entry.expected.id);
  const source = viewerSourceFromDocument({ identity: entry.expected });
  if (selected.module === "graph2d") {
    if (document?.format !== "math3d.graph2d-document") throw new TypeError("Graph selection has no Graph source.");
    const object = document.source.objects.find((item) => item.id === selected.objectId);
    if (!object) throw new TypeError("Selected Graph object is unavailable.");
    return { kind: "graph-selection", source, objectId: object.id, objectHash: structuralHash(object),
      ...(selected.probe ? { probe: selected.probe } : {}) };
  }
  const shape = objectShape(document, selected.objectId);
  if (!shape) throw new TypeError("Selected scene object is unavailable.");
  if (selected.entityKind && selected.entityKind !== "object") {
    if (!selected.entityId) throw new TypeError("Selected subentity has no stable ID.");
    return { kind: "entity-selection", source, objectId: selected.objectId, entityKind: selected.entityKind,
      entityId: selected.entityId, topologyHash: shape };
  }
  const position = selected.localPosition ?? [0, 0, 0];
  if (position.length !== 3 || position.some((value) => !Number.isFinite(value))) throw new TypeError("Invalid object-local selection point.");
  return { kind: "object-local", source, objectId: selected.objectId, localPosition: position as readonly [number, number, number], shapeHash: shape };
};

/** Source-backed resolver used when the Notes sidebar reopens a Project. */
export const projectNoteSourceResolver = (projectId: StableDocumentId, workspace: MixedWorkspaceDocument): ProjectNoteAnchorResolver => {
  const documents = verifyMixedWorkspaceReplay(workspace);
  const sources = new Map(workspace.entries.map((entry) => [entry.expected.id, viewerSourceFromDocument({ identity: entry.expected })]));
  return {
    projectId,
    source: (id) => sources.get(id) ?? null,
    objectShape: (id, objectId) => objectShape(documents.get(id), objectId),
    subentityTopology: (id, objectId, kind, entityId) => {
      const document = documents.get(id), shape = objectShape(document, objectId);
      if (!shape) return null;
      if (document?.format === "math3d.mesh-document" && (kind === "face" || kind === "vertex")) {
        const index = Number(entityId);
        const count = kind === "face" ? (document.source.resource.indexCount || document.source.resource.vertexCount) / 3 : document.source.resource.vertexCount;
        if (!Number.isSafeInteger(index) || index < 0 || index >= count) return null;
      }
      return shape;
    },
    graphObject: (id, objectId) => {
      const document = documents.get(id);
      if (document?.format !== "math3d.graph2d-document") return null;
      const object = (document as Graph2DDocument).source.objects.find((item) => item.id === objectId);
      return object ? structuralHash(object) : null;
    },
    result: (id) => { const result = workspace.results.find((entry) => entry.resultId === id); return result ? { source: result.provenance.source, hash: structuralHash(result) } : null; },
  };
};
