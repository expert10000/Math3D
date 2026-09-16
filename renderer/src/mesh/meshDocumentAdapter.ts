import {
  createMeshDocument,
  normalizeMeshDocument,
  replaceMeshDocumentSource,
  type CanonicalJsonValue,
  type MeshDocument,
  type MeshDocumentSource,
} from "@math3d/core";
import type { SurfaceMeshData, SurfaceMeshSource } from "./surfaceMesh";
import { MeshResourceStore } from "./meshResourceStore";

export type MeshDocumentPackage = Readonly<{
  document: MeshDocument;
  /** Binary sidecar, intentionally separate from the JSON document and command log. */
  resourceBytes: Uint8Array;
}>;

const canonicalOrigin = (source: SurfaceMeshSource): CanonicalJsonValue =>
  JSON.parse(JSON.stringify(source)) as CanonicalJsonValue;

export class MeshDocumentAdapter {
  readonly resources: MeshResourceStore;
  #document: MeshDocument;

  constructor(document: MeshDocument, resources: MeshResourceStore) {
    const normalized = normalizeMeshDocument(document);
    if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
    if (!resources.resolve(normalized.value.source.resource)) throw new TypeError("Mesh source buffer artifact is unavailable.");
    this.#document = normalized.value;
    this.resources = resources;
  }

  static fromMesh(mesh: SurfaceMeshData, resources = new MeshResourceStore()): MeshDocumentAdapter {
    const resource = resources.publish(mesh);
    const stableKey = { resourceChecksum: resource.checksum, origin: canonicalOrigin(mesh.source) };
    const objectId = `mesh-object:${resource.checksum.slice(7, 39)}`;
    const importedFrom = mesh.source.kind === "import" ? mesh.source.filename ?? null : null;
    return new MeshDocumentAdapter(createMeshDocument({
      source: { objectId, resource, origin: canonicalOrigin(mesh.source) },
      stableKey,
      label: mesh.label,
      importedFrom,
    }), resources);
  }

  document(): MeshDocument { return this.#document; }

  mesh(): SurfaceMeshData {
    const buffers = this.resources.resolve(this.#document.source.resource);
    if (!buffers) throw new TypeError("Mesh source buffer artifact is unavailable.");
    return { ...buffers, label: this.#document.metadata.label, source: this.#document.source.origin as SurfaceMeshSource };
  }

  /** Structural edits keep document/object IDs but advance revision and source hash. */
  replaceMesh(mesh: SurfaceMeshData): MeshDocument {
    const resource = this.resources.publish(mesh);
    const source: MeshDocumentSource = {
      objectId: this.#document.source.objectId,
      resource,
      origin: canonicalOrigin(mesh.source),
    };
    this.#document = replaceMeshDocumentSource(this.#document, source);
    if (this.#document.metadata.label !== mesh.label) {
      this.#document = createMeshDocument({
        source: this.#document.source,
        identity: this.#document.identity,
        label: mesh.label,
        importedFrom: this.#document.metadata.importedFrom,
        visible: this.#document.display.visible,
      });
    }
    return this.#document;
  }

  exportPackage(): MeshDocumentPackage {
    const resourceBytes = this.resources.bytes(this.#document.source.resource);
    if (!resourceBytes) throw new TypeError("Mesh source buffer artifact is unavailable.");
    return { document: this.#document, resourceBytes };
  }

  static restore(pkg: MeshDocumentPackage, resources = new MeshResourceStore()): MeshDocumentAdapter {
    const normalized = normalizeMeshDocument(pkg.document);
    if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
    resources.import(normalized.value.source.resource, pkg.resourceBytes);
    return new MeshDocumentAdapter(normalized.value, resources);
  }
}
