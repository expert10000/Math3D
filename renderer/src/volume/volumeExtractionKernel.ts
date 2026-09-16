import {
  createAnalysisResultEnvelope, createCurrentDocumentRelation, createSurfaceDocument,
  matchesScientificSourceGeneration, normalizeDocumentRelation, normalizeSurfaceDocument,
  normalizeVolumeDocument, structuralHash,
  type AnalysisResultEnvelope, type CanonicalJsonValue, type DocumentRelation,
  type ScientificSourceGeneration, type SurfaceDocument, type VolumeDocument,
} from "@math3d/core";
import { createInMemoryArtifactRegistry } from "@math3d/kernel";
import type { VolumeIsosurfaceGeometry } from "./isosurface";
import type { VolumeJobArtifact, VolumeJobRequest } from "./computation";
import type { VolumeDocumentAdapter } from "./volumeDocumentAdapter";
import { nearestVolumeVoxel, volumeIndexInside, volumeWorldToGridIndex, type VolumeMatrix3, type VolumePoint3 } from "./spatial";

export type VolumeExtractionRecord = Readonly<{
  version: 1;
  recordId: string;
  derivedResultId: string;
  sourceDocument: VolumeDocument;
  source: ScientificSourceGeneration;
  legacyVolumeRevision: number;
  surface: SurfaceDocument;
  result: AnalysisResultEnvelope;
  relations: readonly DocumentRelation[];
  artifactId: string;
  byteLength: number;
  contentHash: string;
  parameters: Readonly<{ isoValue: number; smoothing: boolean; smoothingIterations: number }>;
  promoted: boolean;
}>;

const generation = (document: SurfaceDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id, revision: document.identity.revision,
  structuralHash: document.identity.structuralHash, generation: document.identity.revision,
});
const bytesFor = (geometry: VolumeIsosurfaceGeometry): Uint8Array => {
  const positions = new Uint8Array(geometry.positions.buffer, geometry.positions.byteOffset, geometry.positions.byteLength);
  const indices = new Uint8Array(geometry.indices.buffer, geometry.indices.byteOffset, geometry.indices.byteLength);
  const normals = new Uint8Array(geometry.normals.buffer, geometry.normals.byteOffset, geometry.normals.byteLength);
  const bytes = new Uint8Array(12 + positions.length + indices.length + normals.length);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, positions.length, true); header.setUint32(4, indices.length, true); header.setUint32(8, normals.length, true);
  bytes.set(positions, 12); bytes.set(indices, 12 + positions.length); bytes.set(normals, 12 + positions.length + indices.length);
  return bytes;
};
const hashBytes = (bytes: Uint8Array): string => {
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const volumeExtractionStatus = (record: VolumeExtractionRecord, current: ScientificSourceGeneration | null, artifactAvailable = true): "current" | "stale" | "snapshot" | "unavailable" =>
  record.promoted ? "snapshot" : !current || !matchesScientificSourceGeneration(record.source, current) ? "stale" : artifactAvailable ? "current" : "unavailable";
export const locateVolumeExtractionVertex = (record: VolumeExtractionRecord, geometry: VolumeIsosurfaceGeometry, vertexIndex: number) => {
  if (!Number.isSafeInteger(vertexIndex) || vertexIndex < 0 || vertexIndex * 3 + 2 >= geometry.positions.length) return null;
  const base = vertexIndex * 3;
  const world: VolumePoint3 = [geometry.positions[base], geometry.positions[base + 1], geometry.positions[base + 2]];
  const spatial = record.sourceDocument.source.spatial;
  const grid = { origin: [...spatial.origin] as VolumePoint3, spacing: [...spatial.spacing] as VolumePoint3, direction: [...spatial.direction] as VolumeMatrix3 };
  const fractionalIndex = volumeWorldToGridIndex(grid, world);
  const dimensions = [...spatial.dimensions] as VolumePoint3;
  return { source: record.source, world, fractionalIndex, voxel: nearestVolumeVoxel(dimensions, fractionalIndex),
    state: volumeIndexInside(dimensions, fractionalIndex) ? "mapped" as const : "outside" as const };
};
export const promoteVolumeExtraction = (record: VolumeExtractionRecord, derivedResultId: string): VolumeExtractionRecord =>
  ({ ...record, recordId: `${record.recordId}:snapshot:${derivedResultId}`, derivedResultId, promoted: true });
export const serializeVolumeExtraction = (record: VolumeExtractionRecord): string => JSON.stringify(record);
export const parseVolumeExtraction = (serialized: string): VolumeExtractionRecord => {
  const record = JSON.parse(serialized) as VolumeExtractionRecord;
  const source = normalizeVolumeDocument(record?.sourceDocument);
  const surface = normalizeSurfaceDocument(record?.surface);
  if (record?.version !== 1 || !record.recordId || !record.derivedResultId || !source.ok || !surface.ok || !record.result || !Array.isArray(record.relations) ||
      !record.relations.every((relation) => normalizeDocumentRelation(relation).ok) || !record.artifactId ||
      !Number.isFinite(record.parameters?.isoValue) || typeof record.promoted !== "boolean" ||
      !Number.isSafeInteger(record.legacyVolumeRevision) || record.legacyVolumeRevision < 1 ||
      !Number.isSafeInteger(record.byteLength) || record.byteLength < 0 || !record.contentHash ||
      record.source.documentId !== source.value.identity.id || record.source.structuralHash !== source.value.identity.structuralHash) {
    throw new TypeError("Invalid Volume extraction record.");
  }
  return record;
};

/** F06/F07 publication and GK01 lineage for a full, revision-bound Volume extraction. */
export class VolumeExtractionKernelBridge {
  readonly #adapter: () => VolumeDocumentAdapter | null;
  readonly #artifacts = createInMemoryArtifactRegistry({
    resolveSource: (id) => {
      const current = this.source();
      return current?.documentId === id ? current : null;
    },
    maxArtifactBytes: 1024 * 1024 * 1024,
  });
  readonly #records = new Map<string, VolumeExtractionRecord>();
  constructor(adapter: () => VolumeDocumentAdapter | null) { this.#adapter = adapter; }
  source(): ScientificSourceGeneration | null { return this.#adapter()?.sourceGeneration() ?? null; }
  artifacts() { return this.#artifacts; }
  records(): readonly VolumeExtractionRecord[] { return [...this.#records.values()]; }
  invalidate() { const source = this.source(); if (source) this.#artifacts.invalidateDocumentSource(source); }

  publish(request: VolumeJobRequest, artifact: VolumeJobArtifact, geometry: VolumeIsosurfaceGeometry, submittedSource: ScientificSourceGeneration, derivedResultId: string): VolumeExtractionRecord | null {
    const adapter = this.#adapter();
    const current = this.source();
    if (!adapter || !current || !matchesScientificSourceGeneration(submittedSource, current) || artifact.state !== "complete" ||
        artifact.volumeId !== request.volumeId || artifact.volumeRevision !== request.volumeRevision || artifact.sampledGridRevision !== request.sampledGridRevision) return null;
    const parameters = { isoValue: Number(request.parameters.isoValue ?? 0), smoothing: Boolean(request.parameters.smoothing ?? false), smoothingIterations: Number(request.parameters.smoothingIterations ?? 0) };
    const artifactId = `volume-surface:${structuralHash({ source: current, cacheKey: artifact.cacheKey }).slice(7, 47)}`;
    const handle = { artifactId, kind: "binary" as const, role: "volume-boundary-surface" };
    const bytes = bytesFor(geometry);
    if (!this.#records.has(artifactId)) {
      this.#artifacts.declare({ handle, source: current, ownerId: "volume-extraction", encoding: "math3d.triangle-surface.v1" });
      this.#artifacts.beginComputation(artifactId, "volume-extraction", current);
      this.#artifacts.publish({ artifactId, ownerId: "volume-extraction", source: current, bytes });
    }
    const result = createAnalysisResultEnvelope({
      resultId: `volume-extraction-result:${structuralHash({ source: current, artifactId }).slice(7, 47)}`,
      status: "numerical",
      provenance: {
        source: current,
        operation: { type: "volume.extract.isosurface", algorithm: "marching-cubes", algorithmVersion: request.algorithmVersion, parameters: parameters as Record<string, CanonicalJsonValue> },
        numericContext: { tolerance: { absolute: 0 } }, engine: { name: request.backend, version: request.algorithmVersion }, elapsedMs: artifact.profile.wallTimeMs,
      },
      summary: { vertexCount: geometry.positions.length / 3, faceCount: geometry.indices.length / 3, backend: request.backend },
      warnings: artifact.warnings, diagnostics: [], artifacts: [handle],
    });
    const sourceDocument = adapter.document();
    const surface = createSurfaceDocument({
      stableKey: { volume: current, operation: "isosurface", parameters },
      source: {
        representation: "mesh-backed", domain: { kind: "volume-boundary", isoValue: parameters.isoValue },
        units: { length: sourceDocument.source.spatial.positionUnits }, orientation: { convention: "extracted-boundary" },
        definition: { familyId: "volume-isosurface", meshId: artifactId, sourceIds: [current.documentId] },
        parameters, branchPolicy: null,
      },
      metadata: { title: `${sourceDocument.metadata.title} iso ${parameters.isoValue}`, legacySurfaceId: null, analysisSettings: {} },
    });
    const resolveSource = (id: ScientificSourceGeneration["documentId"]) => id === current.documentId ? current : null;
    const relationBase = { sources: [current], sourceOrder: "ordered" as const, operation: "volume.extract.isosurface", parameters,
      producer: { jobId: request.requestId, resultIds: [result.resultId] }, tool: { name: request.backend, version: request.algorithmVersion } };
    const relations = [
      createCurrentDocumentRelation({ ...relationBase, kind: "analysis-of", target: { type: "result", resultId: result.resultId, resultType: "volume-isosurface" } }, resolveSource),
      createCurrentDocumentRelation({ ...relationBase, kind: "generated-by", target: { type: "artifact", artifactId, artifactKind: "binary", role: handle.role } }, resolveSource),
      createCurrentDocumentRelation({ ...relationBase, kind: "derived-from", target: { type: "document", generation: generation(surface) } }, resolveSource),
    ];
    const record: VolumeExtractionRecord = { version: 1, recordId: `volume-extraction:${derivedResultId}`, derivedResultId, sourceDocument, source: current, legacyVolumeRevision: request.volumeRevision, surface, result, relations, artifactId, byteLength: bytes.byteLength, contentHash: hashBytes(bytes), parameters, promoted: false };
    this.#records.set(artifactId, record);
    return record;
  }
}
