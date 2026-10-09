import {
  createStableDocumentId,
  sha256Checksum,
  type MeshResourceReference,
  type ScientificSourceGeneration,
  type StableDocumentId,
} from "@math3d/core";
import { createInMemoryArtifactRegistry, type InMemoryArtifactRegistry } from "@math3d/kernel";
import type { SurfaceMeshData } from "./surfaceMesh";
import { encodeMeshBuffers, decodeMeshBuffers } from "@math3d/core";
export { encodeMeshBuffers, decodeMeshBuffers } from "@math3d/core";
const ENCODING = "math3d.mesh-buffers.v1" as const;

export class MeshResourceStore {
  readonly #sources = new Map<StableDocumentId, ScientificSourceGeneration>();
  readonly #registry: InMemoryArtifactRegistry;

  constructor() {
    this.#registry = createInMemoryArtifactRegistry({
      resolveSource: (documentId) => this.#sources.get(documentId) ?? null,
      maxArtifactBytes: 1024 * 1024 * 1024,
    });
  }

  registry(): InMemoryArtifactRegistry { return this.#registry; }

  publish(mesh: SurfaceMeshData): MeshResourceReference {
    const bytes = encodeMeshBuffers(mesh);
    const checksum = sha256Checksum(bytes);
    const id = `mesh-resource:${checksum.slice(7, 39)}`;
    const reference: MeshResourceReference = {
      id, checksum, vertexCount: Math.floor(mesh.positions.length / 3), indexCount: mesh.indices?.length ?? 0,
      hasNormals: !!mesh.normals?.length, hasUvs: !!mesh.uvs?.length, encoding: ENCODING,
    };
    this.import(reference, bytes);
    return reference;
  }

  import(reference: MeshResourceReference, bytes: Uint8Array): void {
    if (sha256Checksum(bytes) !== reference.checksum) throw new TypeError("Mesh sidecar checksum does not match its reference.");
    const decoded = decodeMeshBuffers(bytes);
    if (Math.floor(decoded.positions.length / 3) !== reference.vertexCount || (decoded.indices?.length ?? 0) !== reference.indexCount ||
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
    // The registry owns a private copy and computed this checksum at publish.
    // resolve returns another copy, so callers cannot change the verified bytes.
    return resolved.ok && resolved.metadata.checksum === reference.checksum ? resolved.bytes : null;
  }

  resolve(reference: MeshResourceReference): Pick<SurfaceMeshData, "positions" | "indices" | "normals" | "uvs"> | null {
    const bytes = this.bytes(reference);
    return bytes ? decodeMeshBuffers(bytes) : null;
  }
}
