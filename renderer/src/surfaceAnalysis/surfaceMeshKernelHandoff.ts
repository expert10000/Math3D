import {
  canonicalJsonStringify, createCurrentDocumentRelation, createMeshDocument, evaluateDocumentRelationStatus,
  sha256Checksum, structuralHash, type AnalysisArtifactHandle, type DocumentRelation,
  withDocumentRelationStatus, type MeshDocument, type ScientificSourceGeneration, type StableDocumentId,
  type SurfaceDocument,
} from "@math3d/core";
import { createInMemoryArtifactRegistry } from "@math3d/kernel";
import type { DerivedSurfaceMeshRecord } from "./derivedSurfaceMesh";
import type { SurfaceDerivedMeshPayload } from "./contracts";
import type { SurfaceMeshGeometry } from "./surfaceMeshHandoff";

export type SurfaceMeshKernelHandoffRecord = Readonly<{
  version: 1;
  meshId: string;
  handle: AnalysisArtifactHandle;
  mappingHandle?: AnalysisArtifactHandle;
  source: ScientificSourceGeneration;
  relations: readonly DocumentRelation[];
  meshDocument: MeshDocument | null;
  vertexCount: number;
  indexCount: number;
  encoding: "math3d.mesh-buffers.v1";
}>;

const sourceOf = (document: SurfaceDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id, revision: document.identity.revision,
  structuralHash: document.identity.structuralHash, generation: document.identity.revision,
});

const packGeometry = (geometry: SurfaceMeshGeometry): Uint8Array => {
  const positions = Float32Array.from(geometry.positions);
  const indices = geometry.indices ? Uint32Array.from(geometry.indices) : new Uint32Array();
  if (positions.length % 3 || indices.length % 3 || positions.some((value) => !Number.isFinite(value))) throw new TypeError("Invalid Surface tessellation buffers.");
  for (let index = 0; index < indices.length; index += 1) {
    if (indices[index]! >= positions.length / 3 || Number(geometry.indices![index]) !== indices[index]) throw new TypeError("Surface tessellation contains an invalid vertex index.");
  }
  const bytes = new Uint8Array(8 + positions.byteLength + indices.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, positions.length, true);
  view.setUint32(4, indices.length, true);
  bytes.set(new Uint8Array(positions.buffer), 8);
  bytes.set(new Uint8Array(indices.buffer), 8 + positions.byteLength);
  return bytes;
};

const packCorrespondence = (payload: SurfaceDerivedMeshPayload): Uint8Array => {
  const mapping = payload.correspondence;
  const parts = [
    mapping.sourceSampleIndices ?? new Uint32Array(),
    mapping.parameterCoordinates ?? new Float64Array(),
    mapping.sourceCells ?? new Int32Array(),
    mapping.residuals ?? new Float32Array(),
    mapping.confidence ?? new Float32Array(),
  ];
  const bytes = new Uint8Array(20 + parts.reduce((sum, part) => sum + part.byteLength, 0));
  const header = new DataView(bytes.buffer);
  let offset = 20;
  parts.forEach((part, index) => {
    header.setUint32(index * 4, part.length, true);
    bytes.set(new Uint8Array(part.buffer, part.byteOffset, part.byteLength), offset);
    offset += part.byteLength;
  });
  return bytes;
};

export class SurfaceMeshKernelHandoff {
  #documents = new Map<StableDocumentId, SurfaceDocument>();
  #records = new Map<string, SurfaceMeshKernelHandoffRecord>();
  #meshDocuments = new Map<StableDocumentId, MeshDocument>();
  #artifacts = createInMemoryArtifactRegistry({ resolveSource: (id) => this.#documents.has(id) ? sourceOf(this.#documents.get(id)!) : null });
  #snapshots = createInMemoryArtifactRegistry({ resolveSource: (id) => {
    const mesh = this.#meshDocuments.get(id);
    return mesh ? { documentId: mesh.identity.id, revision: mesh.identity.revision, structuralHash: mesh.identity.structuralHash, generation: mesh.identity.revision } : null;
  } });

  constructor(documents: readonly SurfaceDocument[] = [], records: readonly SurfaceMeshKernelHandoffRecord[] = []) {
    for (const document of documents) this.setSource(document);
    for (const record of records) {
      this.#records.set(record.meshId, record);
      if (record.meshDocument) this.#meshDocuments.set(record.meshDocument.identity.id, record.meshDocument);
    }
  }

  setSource(document: SurfaceDocument): void {
    const previous = this.#documents.get(document.identity.id);
    const changed = previous && (previous.identity.structuralHash !== document.identity.structuralHash ||
      canonicalJsonStringify(previous.metadata.analysisSettings) !== canonicalJsonStringify(document.metadata.analysisSettings));
    this.#documents.set(document.identity.id, document);
    this.#artifacts.invalidateDocumentSource(sourceOf(document));
    if (changed) {
      for (const [meshId, record] of this.#records) {
        if (!record.relations.some((relation) => relation.sources.some((source) => source.documentId === document.identity.id))) continue;
        this.#artifacts.remove(record.handle.artifactId, "surface-mesh-handoff");
        if (record.mappingHandle) this.#artifacts.remove(record.mappingHandle.artifactId, "surface-mesh-handoff");
        this.#records.set(meshId, { ...record, relations: record.relations.map((relation) => withDocumentRelationStatus(relation, "stale")) });
      }
    }
  }

  publish(input: { record: DerivedSurfaceMeshRecord; geometry: SurfaceMeshGeometry; sources: readonly SurfaceDocument[]; payload?: SurfaceDerivedMeshPayload }): SurfaceMeshKernelHandoffRecord {
    if (!input.sources.length) throw new TypeError("Surface tessellation requires a source.");
    if (input.record.identity.state === "stale") throw new TypeError("Cannot publish stale Surface tessellation.");
    if (input.sources[0]!.metadata.legacySurfaceId !== input.record.identity.source.surfaceId) throw new TypeError("Surface tessellation source does not match its recorded Surface ID.");
    for (const document of input.sources) this.setSource(document);
    const sources = input.sources.map(sourceOf);
    const source = sources[0]!;
    const fingerprint = structuralHash({ meshId: input.record.identity.meshId, meshRevision: input.record.identity.meshRevision, sources });
    const handle: AnalysisArtifactHandle = { artifactId: `surface-mesh:${fingerprint.slice(7, 47)}`, kind: "mesh", role: "surface-tessellation" };
    const ownerId = "surface-mesh-handoff";
    const bytes = packGeometry(input.geometry);
    const mappingBytes = input.payload ? packCorrespondence(input.payload) : null;
    if (bytes.byteLength > 256 * 1024 * 1024 || (mappingBytes && mappingBytes.byteLength > 256 * 1024 * 1024)) throw new RangeError("Surface tessellation artifact exceeds the managed cache limit.");
    this.#artifacts.declare({ handle, source, ownerId, encoding: "math3d.mesh-buffers.v1" });
    this.#artifacts.beginComputation(handle.artifactId, ownerId, source);
    this.#artifacts.publish({ artifactId: handle.artifactId, source, ownerId, bytes });
    const parameters = {
      meshId: input.record.identity.meshId,
      meshRevision: input.record.identity.meshRevision,
      surfaceId: input.record.identity.source.surfaceId,
      legacySurfaceRevision: input.record.identity.source.surfaceRevision,
      method: input.record.identity.tessellation.method,
      settings: input.record.identity.tessellation.settings,
      correspondenceId: input.record.correspondence.correspondenceId,
      correspondenceKind: input.record.correspondence.kind,
      mappedVertexCount: input.record.correspondence.mappedVertexCount,
    };
    const tool = { name: input.record.identity.backend.id, version: input.record.identity.backend.version ?? "unknown" };
    const relation = createCurrentDocumentRelation({
      kind: "generated-by", sources, sourceOrder: "ordered",
      target: { type: "artifact", artifactId: handle.artifactId, artifactKind: "mesh", role: handle.role },
      operation: "surface.tessellate", parameters, tool,
    }, (id) => this.#documents.has(id) ? sourceOf(this.#documents.get(id)!) : null);
    let mappingHandle: AnalysisArtifactHandle | undefined;
    let mappingRelation: DocumentRelation | undefined;
    if (mappingBytes) {
      mappingHandle = { artifactId: `surface-map:${fingerprint.slice(7, 47)}`, kind: "table", role: "surface-mesh-locate-back" };
      this.#artifacts.declare({ handle: mappingHandle, source, ownerId, encoding: "math3d.surface-mesh-correspondence.v1" });
      this.#artifacts.beginComputation(mappingHandle.artifactId, ownerId, source);
      this.#artifacts.publish({ artifactId: mappingHandle.artifactId, source, ownerId, bytes: mappingBytes });
      mappingRelation = createCurrentDocumentRelation({
        kind: "generated-by", sources, sourceOrder: "ordered",
        target: { type: "artifact", artifactId: mappingHandle.artifactId, artifactKind: "table", role: mappingHandle.role },
        operation: "surface.tessellate.locate-back", parameters, tool,
      }, (id) => this.#documents.has(id) ? sourceOf(this.#documents.get(id)!) : null);
    }
    const next: SurfaceMeshKernelHandoffRecord = {
      version: 1, meshId: input.record.identity.meshId, handle, ...(mappingHandle ? { mappingHandle } : {}), source,
      relations: [relation, ...(mappingRelation ? [mappingRelation] : [])],
      meshDocument: null, vertexCount: input.record.vertexCount,
      indexCount: input.geometry.indices?.length ?? 0, encoding: "math3d.mesh-buffers.v1",
    };
    this.#records.set(next.meshId, next);
    return next;
  }

  promote(meshId: string, label: string): SurfaceMeshKernelHandoffRecord {
    const previous = this.#records.get(meshId);
    if (!previous) throw new TypeError("Unknown Surface mesh handoff.");
    if (previous.meshDocument) return previous;
    const resolved = this.resolve(meshId);
    if (!resolved.ok) throw new TypeError(`Surface mesh artifact is ${resolved.reason}; regenerate before promotion.`);
    const checksum = sha256Checksum(resolved.bytes);
    const meshDocument = createMeshDocument({
      stableKey: { surfaceMeshId: meshId }, label,
      source: {
        objectId: `surface-mesh:${structuralHash(meshId).slice(7, 31)}`,
        resource: { id: `surface-snapshot:${structuralHash(meshId).slice(7, 47)}`, checksum, vertexCount: previous.vertexCount, indexCount: previous.indexCount, hasNormals: false, hasUvs: false, encoding: "math3d.mesh-buffers.v1" },
        origin: { kind: "surface-tessellation", meshId, artifactId: previous.handle.artifactId, source: previous.source },
      },
    });
    const meshSource: ScientificSourceGeneration = {
      documentId: meshDocument.identity.id, revision: meshDocument.identity.revision,
      structuralHash: meshDocument.identity.structuralHash, generation: meshDocument.identity.revision,
    };
    this.#meshDocuments.set(meshDocument.identity.id, meshDocument);
    const snapshotHandle: AnalysisArtifactHandle = { artifactId: meshDocument.source.resource.id, kind: "mesh", role: "promoted-surface-snapshot" };
    this.#snapshots.declare({ handle: snapshotHandle, source: meshSource, ownerId: "surface-mesh-snapshot", encoding: "math3d.mesh-buffers.v1" });
    this.#snapshots.beginComputation(snapshotHandle.artifactId, "surface-mesh-snapshot", meshSource);
    this.#snapshots.publish({ artifactId: snapshotHandle.artifactId, source: meshSource, ownerId: "surface-mesh-snapshot", bytes: resolved.bytes });
    const target = { type: "document" as const, generation: {
      documentId: meshDocument.identity.id, revision: meshDocument.identity.revision,
      structuralHash: meshDocument.identity.structuralHash, generation: meshDocument.identity.revision,
    } };
    const generated = previous.relations[0]!;
    const promoted = createCurrentDocumentRelation({
      kind: "promoted-from", sources: generated.sources, sourceOrder: "ordered", target,
      operation: "surface.tessellate.promote", parameters: generated.parameters, tool: generated.tool,
    }, (id) => this.#documents.has(id) ? sourceOf(this.#documents.get(id)!) : null);
    const next = { ...previous, meshDocument, relations: [...previous.relations, promoted] };
    this.#records.set(meshId, next);
    return next;
  }

  /** Promoted snapshots own their bytes for this session; reopening without a binary cache is explicit unavailability. */
  resolvePromoted(meshId: string): Uint8Array | null {
    const document = this.#records.get(meshId)?.meshDocument;
    if (!document) return null;
    const source: ScientificSourceGeneration = {
      documentId: document.identity.id, revision: document.identity.revision,
      structuralHash: document.identity.structuralHash, generation: document.identity.revision,
    };
    const resolved = this.#snapshots.resolve({ artifactId: document.source.resource.id, kind: "mesh", role: "promoted-surface-snapshot" }, source);
    return resolved.ok ? resolved.bytes : null;
  }

  resolve(meshId: string): ReturnType<ReturnType<typeof createInMemoryArtifactRegistry>["resolve"]> {
    const record = this.#records.get(meshId);
    if (!record) throw new TypeError("Unknown Surface mesh handoff.");
    const status = evaluateDocumentRelationStatus(record.relations[0]!, (id) => this.#documents.has(id) ? sourceOf(this.#documents.get(id)!) : null);
    if (status !== "current") {
      return { ok: false, availability: "unavailable", handle: record.handle, source: record.source, reason: "stale-source", metadata: null };
    }
    return this.#artifacts.resolve(record.handle, record.source);
  }
  record(meshId: string): SurfaceMeshKernelHandoffRecord | null { return this.#records.get(meshId) ?? null; }
  records(): readonly SurfaceMeshKernelHandoffRecord[] { return [...this.#records.values()]; }
  resolveMapping(meshId: string) {
    const record = this.#records.get(meshId);
    if (!record?.mappingHandle) return null;
    if (evaluateDocumentRelationStatus(record.relations[1]!, (id) => this.#documents.has(id) ? sourceOf(this.#documents.get(id)!) : null) !== "current") return null;
    return this.#artifacts.resolve(record.mappingHandle, record.source);
  }
  remove(meshId: string): void {
    const record = this.#records.get(meshId);
    if (!record) return;
    if (record.meshDocument) {
      this.#snapshots.remove(record.meshDocument.source.resource.id, "surface-mesh-snapshot");
      this.#meshDocuments.delete(record.meshDocument.identity.id);
    }
    this.#artifacts.remove(record.handle.artifactId, "surface-mesh-handoff");
    if (record.mappingHandle) this.#artifacts.remove(record.mappingHandle.artifactId, "surface-mesh-handoff");
    this.#records.delete(meshId);
  }
}
