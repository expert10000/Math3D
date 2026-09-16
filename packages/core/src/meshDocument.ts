import {
  advanceDocumentIdentity,
  canonicalJsonStringify,
  createDocumentIdentity,
  createStableDocumentId,
  defineDocumentFieldPolicy,
  isDocumentIdentity,
  isStructuralHash,
  type CanonicalJsonValue,
  type DocumentIdentity,
  type StructuralHash,
} from "./documentIdentity";
import type { ValidationResult } from "./validation";

export const MESH_DOCUMENT_FORMAT = "math3d.mesh-document" as const;
export const MESH_DOCUMENT_SCHEMA_VERSION = 1 as const;

/** The buffer lives in an artifact store, never in the source or command log. */
export type MeshResourceReference = Readonly<{
  id: string;
  checksum: StructuralHash;
  vertexCount: number;
  indexCount: number;
  hasNormals: boolean;
  hasUvs: boolean;
  encoding: "math3d.mesh-buffers.v1";
}>;

export type MeshDocumentSource = Readonly<{
  objectId: string;
  resource: MeshResourceReference;
  origin: CanonicalJsonValue;
}>;

export type MeshDocument = Readonly<{
  format: typeof MESH_DOCUMENT_FORMAT;
  schemaVersion: typeof MESH_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  source: MeshDocumentSource;
  metadata: Readonly<{ label: string; importedFrom: string | null }>;
  display: Readonly<{ visible: boolean }>;
}>;

export const MESH_DOCUMENT_FIELD_POLICY = defineDocumentFieldPolicy({
  format: "persistent-metadata",
  schemaVersion: "persistent-metadata",
  identity: "persistent-metadata",
  source: "structural",
  metadata: "persistent-metadata",
  display: "persistent-display",
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const safeId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const clone = <T>(value: T): T => JSON.parse(canonicalJsonStringify(value)) as T;
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};
const canonical = <T>(value: T): T => freeze(clone(value));

export const normalizeMeshDocument = (value: unknown): ValidationResult<MeshDocument> => {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["Mesh document must be an object."] };
  try { canonicalJsonStringify(value); } catch { return { ok: false, errors: ["Mesh document must contain only canonical JSON."] }; }
  if (value.format !== MESH_DOCUMENT_FORMAT || value.schemaVersion !== MESH_DOCUMENT_SCHEMA_VERSION) errors.push("Mesh format or schema version is unsupported.");
  if (!isDocumentIdentity(value.identity)) errors.push("Mesh identity is invalid.");
  if (!isRecord(value.source) || !safeId(value.source.objectId) || !isRecord(value.source.resource)) {
    errors.push("Mesh source requires an object ID and resource reference.");
  } else {
    const resource = value.source.resource;
    if (!safeId(resource.id) || !isStructuralHash(resource.checksum) || !count(resource.vertexCount) || !count(resource.indexCount) ||
        typeof resource.hasNormals !== "boolean" || typeof resource.hasUvs !== "boolean" || resource.encoding !== "math3d.mesh-buffers.v1") {
      errors.push("Mesh resource reference is invalid.");
    }
    if (value.source.origin === undefined) errors.push("Mesh source origin is required.");
  }
  if (!isRecord(value.metadata) || typeof value.metadata.label !== "string" ||
      !(value.metadata.importedFrom === null || typeof value.metadata.importedFrom === "string")) errors.push("Mesh metadata is invalid.");
  if (!isRecord(value.display) || typeof value.display.visible !== "boolean") errors.push("Mesh display is invalid.");
  if (errors.length) return { ok: false, errors };
  const document = canonical(value) as MeshDocument;
  if (document.identity.structuralHash !== createDocumentIdentity(document.identity.id, document.source, document.identity.revision).structuralHash) {
    return { ok: false, errors: ["Mesh structural hash does not match its source."] };
  }
  return { ok: true, value: document };
};

export const createMeshDocument = (input: {
  source: MeshDocumentSource;
  stableKey?: CanonicalJsonValue;
  identity?: DocumentIdentity;
  label: string;
  importedFrom?: string | null;
  visible?: boolean;
}): MeshDocument => {
  const source = canonical(input.source);
  const identity = input.identity ?? createDocumentIdentity(createStableDocumentId("mesh", input.stableKey ?? source), source);
  const candidate = {
    format: MESH_DOCUMENT_FORMAT,
    schemaVersion: MESH_DOCUMENT_SCHEMA_VERSION,
    identity,
    source,
    metadata: { label: input.label, importedFrom: input.importedFrom ?? null },
    display: { visible: input.visible ?? true },
  };
  const normalized = normalizeMeshDocument(candidate);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};

export const replaceMeshDocumentSource = (document: MeshDocument, source: MeshDocumentSource): MeshDocument =>
  createMeshDocument({
    source,
    identity: advanceDocumentIdentity(document.identity, source),
    label: document.metadata.label,
    importedFrom: document.metadata.importedFrom,
    visible: document.display.visible,
  });

export const renameMeshDocument = (document: MeshDocument, label: string): MeshDocument =>
  createMeshDocument({ source: document.source, identity: document.identity, label, importedFrom: document.metadata.importedFrom, visible: document.display.visible });
