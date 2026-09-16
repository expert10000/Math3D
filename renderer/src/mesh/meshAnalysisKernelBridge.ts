import {
  createAnalysisResultEnvelope, matchesScientificSourceGeneration, sha256Checksum, structuralHash,
  type AnalysisResultEnvelope, type CanonicalJsonValue, type ScientificSourceGeneration,
} from "@math3d/core";
import { createInMemoryArtifactRegistry } from "@math3d/kernel";
import {
  getMeshAnalysisResult as localGet,
  getMeshAnalysisResultForParameters as localGetForParameters,
  upsertMeshAnalysisResult as localUpsert,
  type MeshAnalysisMeshIdentity, type MeshAnalysisResult, type MeshAnalysisResultKind,
  type MeshAnalysisResultStore, type MeshAnalysisParameters, type UpsertMeshAnalysisResultOptions,
} from "./analysisResultStore";
import type { MeshDocumentAdapter } from "./meshDocumentAdapter";

const ENCODING = "math3d.mesh-analysis-payload.v1";
const OWNER = "mesh-analysis";
const MAX_BYTES = 512 * 1024 * 1024;
const MAX_CACHED_ARTIFACTS = 24;
const MARKER = "$math3dArtifact";
const TYPED = "$math3dTyped";
type Typed = Float32Array | Float64Array | Int32Array | Uint32Array | Int16Array | Uint16Array | Int8Array | Uint8Array;
type Descriptor = { [TYPED]: string; offset: number; length: number };
type Marker = { [MARKER]: string };
const typedConstructors = { Float32Array, Float64Array, Int32Array, Uint32Array, Int16Array, Uint16Array, Int8Array, Uint8Array };
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isMarker = (value: unknown): value is Marker => isRecord(value) && typeof value[MARKER] === "string";

/** Portable container: length-prefixed JSON shape plus raw typed-array bytes. */
export const encodeMeshAnalysisPayload = (payload: unknown): Uint8Array => {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const visit = (value: unknown): unknown => {
    if (ArrayBuffer.isView(value)) {
      if (value instanceof DataView || !(value.constructor.name in typedConstructors)) throw new TypeError("Unsupported Mesh analysis buffer type.");
      const typed = value as Typed;
      const chunk = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
      chunks.push(chunk);
      const descriptor: Descriptor = { [TYPED]: typed.constructor.name, offset, length: typed.length };
      offset += chunk.byteLength;
      return descriptor;
    }
    if (typeof value === "number" && !Number.isFinite(value)) return { $math3dNumber: String(value) };
    if (Array.isArray(value)) return value.map(visit);
    if (isRecord(value)) return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key, visit(child)]));
    if (value === undefined) return null;
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
    throw new TypeError("Mesh analysis payload must be structured data.");
  };
  const shape = new TextEncoder().encode(JSON.stringify(visit(payload)));
  const bytes = new Uint8Array(4 + shape.byteLength + offset);
  new DataView(bytes.buffer).setUint32(0, shape.byteLength, true);
  bytes.set(shape, 4);
  let cursor = 4 + shape.byteLength;
  for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.byteLength; }
  return bytes;
};

export const decodeMeshAnalysisPayload = (bytes: Uint8Array): unknown => {
  if (bytes.byteLength < 4) throw new TypeError("Mesh analysis artifact is truncated.");
  const shapeLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  if (shapeLength > bytes.byteLength - 4) throw new TypeError("Mesh analysis artifact shape is truncated.");
  const shape = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + shapeLength))) as unknown;
  const dataOffset = 4 + shapeLength;
  const revive = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(revive);
    if (!isRecord(value)) return value;
    if (typeof value.$math3dNumber === "string") {
      if (value.$math3dNumber === "NaN") return Number.NaN;
      if (value.$math3dNumber === "Infinity") return Number.POSITIVE_INFINITY;
      if (value.$math3dNumber === "-Infinity") return Number.NEGATIVE_INFINITY;
      throw new TypeError("Invalid non-finite Mesh analysis value.");
    }
    if (typeof value[TYPED] === "string") {
      const name = value[TYPED] as keyof typeof typedConstructors;
      const Constructor = typedConstructors[name];
      if (!Constructor || !Number.isSafeInteger(value.offset) || !Number.isSafeInteger(value.length) || Number(value.offset) < 0 || Number(value.length) < 0) throw new TypeError("Invalid Mesh analysis typed-array descriptor.");
      const start = dataOffset + Number(value.offset);
      const end = start + Number(value.length) * Constructor.BYTES_PER_ELEMENT;
      if (end > bytes.byteLength) throw new TypeError("Mesh analysis typed-array bytes are truncated.");
      return new Constructor(bytes.slice(start, end).buffer);
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, revive(child)]));
  };
  return revive(shape);
};

export class MeshAnalysisKernelBridge {
  readonly #adapter: () => MeshDocumentAdapter | null;
  readonly #artifacts = createInMemoryArtifactRegistry({
    resolveSource: (id) => {
      const current = this.#adapter()?.sourceGeneration();
      return current?.documentId === id ? current : null;
    },
    maxArtifactBytes: MAX_BYTES,
  });
  readonly #payloadCache = new Map<string, unknown>();
  readonly #artifactBytes = new Map<string, number>();
  readonly #results = new Map<string, AnalysisResultEnvelope>();

  constructor(adapter: () => MeshDocumentAdapter | null) { this.#adapter = adapter; }
  source(): ScientificSourceGeneration | null { return this.#adapter()?.sourceGeneration() ?? null; }
  artifactRegistry() { return this.#artifacts; }
  result(resultId: string): AnalysisResultEnvelope | null { return this.#results.get(resultId) ?? null; }
  results(): readonly AnalysisResultEnvelope[] { return [...this.#results.values()]; }

  invalidateCurrentSource(): void {
    const source = this.source();
    if (source) this.#artifacts.invalidateDocumentSource(source);
    for (const metadata of this.#artifacts.listMetadata()) {
      if (!source || !matchesScientificSourceGeneration(metadata.source, source)) {
        this.#artifacts.remove(metadata.handle.artifactId, OWNER);
        this.#payloadCache.delete(metadata.handle.artifactId);
        this.#artifactBytes.delete(metadata.handle.artifactId);
      }
    }
    for (const [id, result] of this.#results) {
      if (!source || !matchesScientificSourceGeneration(result.provenance.source, source)) {
        this.#results.delete(id);
        for (const handle of result.artifacts) {
          this.#payloadCache.delete(handle.artifactId);
          this.#artifactBytes.delete(handle.artifactId);
        }
      }
    }
  }

  upsert = <TPayload>(store: MeshAnalysisResultStore, options: UpsertMeshAnalysisResultOptions<TPayload>): MeshAnalysisResultStore => {
    if ((options.state != null && options.state !== "ready") || options.payload == null) return localUpsert(store, options);
    const source = this.source();
    const existingId = source ? this.#artifactId(source, options.kind, options.variant ?? "default", options.parameters ?? {}) : null;
    const artifactId = existingId && this.#payloadCache.get(existingId) === options.payload &&
      this.#artifacts.resolve({ artifactId: existingId, kind: "binary", role: `${options.kind}-field` }, source!).ok
      ? existingId : this.publishDense(options);
    return localUpsert(store, { ...options, payload: { [MARKER]: artifactId } as TPayload });
  };

  beginDense(source: ScientificSourceGeneration, kind: MeshAnalysisResultKind, variant: string, parameters: MeshAnalysisParameters): string {
    const artifactId = this.#artifactId(source, kind, variant, parameters);
    this.#artifacts.declare({ handle: { artifactId, kind: "binary", role: `${kind}-field` }, source, ownerId: OWNER, encoding: ENCODING });
    this.#artifacts.beginComputation(artifactId, OWNER, source);
    return artifactId;
  }

  failDense(artifactId: string, source: ScientificSourceGeneration, code: string, message: string): void {
    this.#artifacts.fail({ artifactId, ownerId: OWNER, source, failure: { code, message } });
  }

  invalidateDense(artifactId: string): void { this.#artifacts.invalidateArtifacts([artifactId]); }

  #artifactId(source: ScientificSourceGeneration, kind: MeshAnalysisResultKind, variant: string, parameters: MeshAnalysisParameters): string {
    return `mesh-analysis:${structuralHash({ source, kind, variant, parameters }).slice(7, 47)}`;
  }

  publishDense<TPayload>(options: UpsertMeshAnalysisResultOptions<TPayload>): string {
    if (options.payload == null) throw new TypeError("Dense Mesh analysis publication requires a payload.");
    const source = this.source();
    if (!source) throw new TypeError("Mesh Analyze requires an active kernel MeshDocument.");
    const bytes = encodeMeshAnalysisPayload(options.payload);
    if (bytes.byteLength > MAX_BYTES) throw new RangeError("Mesh analysis output exceeds the artifact memory limit.");
    const key = structuralHash({ source, kind: options.kind, variant: options.variant ?? "default", parameters: options.parameters ?? {} });
    const artifactId = this.#artifactId(source, options.kind, options.variant ?? "default", options.parameters ?? {});
    const handle = { artifactId, kind: "binary" as const, role: `${options.kind}-field` };
    this.#artifacts.declare({ handle, source, ownerId: OWNER, encoding: ENCODING });
    this.#artifacts.beginComputation(artifactId, OWNER, source);
    this.#artifacts.publish({ artifactId, ownerId: OWNER, source, bytes });
    this.#payloadCache.set(artifactId, options.payload);
    const status = options.kind === "quality" || options.kind === "diagnostics" ? "heuristic" : "numerical";
    const parameters = (options.parameters ?? {}) as Record<string, CanonicalJsonValue>;
    const resultId = `mesh-result:${key.slice(7, 47)}`;
    const result = createAnalysisResultEnvelope({
      resultId, status,
      provenance: {
        source,
        operation: { type: `mesh.analyze.${options.kind}`, algorithm: options.variant ?? options.kind, algorithmVersion: options.variant?.match(/(?:^|-)v(\d+)$/)?.[1] ?? "1", parameters },
        ...(status === "numerical" ? { numericContext: { tolerance: { absolute: 0 } } } : {}),
        engine: { name: options.backend ?? "Math3D Mesh Analyze", version: "1" },
        elapsedMs: options.computeTimeMs ?? 0,
      },
      summary: { kind: options.kind, variant: options.variant ?? "default", vertexCount: options.mesh.vertexCount, faceCount: options.mesh.faceCount, byteLength: bytes.byteLength, checksum: sha256Checksum(bytes) },
      warnings: [], diagnostics: [], artifacts: [handle],
    });
    this.#results.set(resultId, result);
    this.#artifactBytes.delete(artifactId);
    this.#artifactBytes.set(artifactId, bytes.byteLength);
    while (this.#artifactBytes.size > MAX_CACHED_ARTIFACTS ||
      [...this.#artifactBytes.values()].reduce((total, size) => total + size, 0) > MAX_BYTES) {
      const oldest = this.#artifactBytes.keys().next().value;
      if (!oldest || oldest === artifactId) break;
      this.#artifactBytes.delete(oldest);
      this.#payloadCache.delete(oldest);
      this.#artifacts.remove(oldest, OWNER);
      for (const [id, entry] of this.#results) {
        if (entry.artifacts.some((handle) => handle.artifactId === oldest)) this.#results.delete(id);
      }
    }
    return artifactId;
  }

  resolveDense(artifactId: string, source: ScientificSourceGeneration): unknown | null {
    const envelope = [...this.#results.values()].find((entry) => entry.artifacts.some((handle) => handle.artifactId === artifactId));
    const handle = envelope?.artifacts[0];
    if (!handle) return null;
    const resolved = this.#artifacts.resolve(handle, source);
    if (!resolved.ok) return null;
    let payload = this.#payloadCache.get(artifactId);
    if (payload === undefined) {
      payload = decodeMeshAnalysisPayload(resolved.bytes);
      this.#payloadCache.set(artifactId, payload);
    }
    return payload;
  }

  get = <TPayload = unknown>(store: MeshAnalysisResultStore, mesh: MeshAnalysisMeshIdentity | null | undefined, kind: MeshAnalysisResultKind, variant = "default"): MeshAnalysisResult<TPayload> | null =>
    this.#hydrate<TPayload>(localGet(store, mesh, kind, variant));

  getForParameters = <TPayload = unknown>(store: MeshAnalysisResultStore, mesh: MeshAnalysisMeshIdentity | null | undefined, kind: MeshAnalysisResultKind, parameters: MeshAnalysisParameters, variant = "default"): MeshAnalysisResult<TPayload> | null =>
    this.#hydrate<TPayload>(localGetForParameters(store, mesh, kind, parameters, variant));

  #hydrate<TPayload>(result: MeshAnalysisResult<unknown> | null): MeshAnalysisResult<TPayload> | null {
    if (!result) return null;
    if (!isMarker(result.payload)) return result as MeshAnalysisResult<TPayload>;
    const artifactId = result.payload[MARKER];
    const envelope = [...this.#results.values()].find((entry) => entry.artifacts.some((handle) => handle.artifactId === artifactId));
    const source = envelope?.provenance.source;
    if (!source) return { ...result, state: "stale", payload: null } as MeshAnalysisResult<TPayload>;
    const handle = envelope.artifacts[0]!;
    const resolved = this.#artifacts.resolve(handle, source);
    if (!resolved.ok) return { ...result, state: "stale", payload: null } as MeshAnalysisResult<TPayload>;
    let payload = this.#payloadCache.get(artifactId);
    if (payload === undefined) {
      payload = decodeMeshAnalysisPayload(resolved.bytes);
      this.#payloadCache.set(artifactId, payload);
    }
    return { ...result, payload: payload as TPayload };
  }
}
