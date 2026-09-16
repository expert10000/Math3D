import {
  createStableDocumentId,
  sha256Checksum,
  type MeshResourceReference,
  type ScientificSourceGeneration,
  type StableDocumentId,
} from "@math3d/core";
import { createInMemoryArtifactRegistry, type InMemoryArtifactRegistry } from "@math3d/kernel";
import type { SurfaceMeshData } from "./surfaceMesh";

const MAGIC = 0x4d33444d; // M3DM
const HEADER_BYTES = 24;
const ENCODING = "math3d.mesh-buffers.v1" as const;

const bytesOf = (array: Float32Array | Uint32Array): Uint8Array =>
  new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

/** A deterministic binary sidecar; no vertex/index arrays enter document or command JSON. */
export const encodeMeshBuffers = (mesh: SurfaceMeshData): Uint8Array => {
  const positions = mesh.positions;
  const indices = mesh.indices;
  const normals = mesh.normals ?? null;
  const uvs = mesh.uvs ?? null;
  if (positions.length % 3 || (indices && indices.length % 3) ||
      (normals && normals.length !== positions.length) ||
      (uvs && uvs.length !== (positions.length / 3) * 2)) {
    throw new TypeError("Mesh buffers have incompatible component counts.");
  }
  for (const value of positions) if (!Number.isFinite(value)) throw new TypeError("Mesh positions must be finite.");
  const lengths = [positions.length, indices?.length ?? 0, normals?.length ?? 0, uvs?.length ?? 0];
  const size = HEADER_BYTES + lengths.reduce((total, length) => total + length * 4, 0);
  const bytes = new Uint8Array(size);
  const header = new DataView(bytes.buffer);
  [MAGIC, 1, ...lengths].forEach((value, index) => header.setUint32(index * 4, value, true));
  let offset = HEADER_BYTES;
  for (const array of [positions, indices, normals, uvs]) {
    if (!array) continue;
    bytes.set(bytesOf(array), offset);
    offset += array.byteLength;
  }
  return bytes;
};

export const decodeMeshBuffers = (bytes: Uint8Array): Pick<SurfaceMeshData, "positions" | "indices" | "normals" | "uvs"> => {
  if (bytes.length < HEADER_BYTES) throw new TypeError("Mesh sidecar is truncated.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== 1) throw new TypeError("Mesh sidecar header is invalid.");
  const lengths = [8, 12, 16, 20].map((offset) => view.getUint32(offset, true));
  if (HEADER_BYTES + lengths.reduce((sum, length) => sum + length * 4, 0) !== bytes.length ||
      lengths[0]! % 3 || lengths[1]! % 3 || (lengths[2] !== 0 && lengths[2] !== lengths[0]) ||
      (lengths[3] !== 0 && lengths[3] !== (lengths[0]! / 3) * 2)) {
    throw new TypeError("Mesh sidecar lengths are invalid.");
  }
  let offset = HEADER_BYTES;
  const read = (length: number, kind: "float" | "uint"): Float32Array | Uint32Array => {
    const copy = bytes.slice(offset, offset + length * 4);
    offset += length * 4;
    return kind === "float" ? new Float32Array(copy.buffer) : new Uint32Array(copy.buffer);
  };
  const positions = read(lengths[0]!, "float") as Float32Array;
  const indices = lengths[1] ? read(lengths[1], "uint") as Uint32Array : null;
  const normals = lengths[2] ? read(lengths[2], "float") as Float32Array : null;
  const uvs = lengths[3] ? read(lengths[3], "float") as Float32Array : null;
  for (const value of positions) if (!Number.isFinite(value)) throw new TypeError("Mesh sidecar contains non-finite positions.");
  if (indices) for (const index of indices) if (index >= positions.length / 3) throw new TypeError("Mesh sidecar contains an out-of-range index.");
  return { positions, indices, normals, uvs };
};

export class MeshResourceStore {
  readonly #sources = new Map<StableDocumentId, ScientificSourceGeneration>();
  readonly #registry: InMemoryArtifactRegistry;

  constructor() {
    this.#registry = createInMemoryArtifactRegistry({ resolveSource: (documentId) => this.#sources.get(documentId) ?? null });
  }

  registry(): InMemoryArtifactRegistry { return this.#registry; }

  publish(mesh: SurfaceMeshData): MeshResourceReference {
    const bytes = encodeMeshBuffers(mesh);
    const checksum = sha256Checksum(bytes);
    const id = `mesh-resource:${checksum.slice(7, 39)}`;
    const reference: MeshResourceReference = {
      id, checksum, vertexCount: mesh.positions.length / 3, indexCount: mesh.indices?.length ?? 0,
      hasNormals: !!mesh.normals?.length, hasUvs: !!mesh.uvs?.length, encoding: ENCODING,
    };
    this.import(reference, bytes);
    return reference;
  }

  import(reference: MeshResourceReference, bytes: Uint8Array): void {
    if (sha256Checksum(bytes) !== reference.checksum) throw new TypeError("Mesh sidecar checksum does not match its reference.");
    const decoded = decodeMeshBuffers(bytes);
    if (decoded.positions.length / 3 !== reference.vertexCount || (decoded.indices?.length ?? 0) !== reference.indexCount ||
        !!decoded.normals?.length !== reference.hasNormals || !!decoded.uvs?.length !== reference.hasUvs) {
      throw new TypeError("Mesh sidecar counts do not match its reference.");
    }
    const documentId = createStableDocumentId("mesh-resource", { checksum: reference.checksum });
    const source: ScientificSourceGeneration = { documentId, revision: 1, structuralHash: reference.checksum, generation: 1 };
    this.#sources.set(documentId, source);
    const handle = { artifactId: reference.id, kind: "mesh" as const, role: "source-buffers" };
    this.#registry.declare({ handle, source, ownerId: "mesh-resource-store", encoding: ENCODING });
    this.#registry.publish({ artifactId: reference.id, source, ownerId: "mesh-resource-store", bytes });
  }

  bytes(reference: MeshResourceReference): Uint8Array | null {
    const documentId = createStableDocumentId("mesh-resource", { checksum: reference.checksum });
    const source = this.#sources.get(documentId);
    if (!source) return null;
    const resolved = this.#registry.resolve({ artifactId: reference.id, kind: "mesh", role: "source-buffers" }, source);
    return resolved.ok && sha256Checksum(resolved.bytes) === reference.checksum ? resolved.bytes : null;
  }

  resolve(reference: MeshResourceReference): Pick<SurfaceMeshData, "positions" | "indices" | "normals" | "uvs"> | null {
    const bytes = this.bytes(reference);
    return bytes ? decodeMeshBuffers(bytes) : null;
  }
}
