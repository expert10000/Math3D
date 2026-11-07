import {
  canonicalJsonStringify, createDocumentIdentity, createStableDocumentId, isDocumentIdentity,
  type DocumentIdentity,
} from "./documentIdentity";
import type { ValidationResult } from "./validation";

export const TETRAHEDRAL_MESH_DOCUMENT_FORMAT = "math3d.tetrahedral-mesh-document" as const;
export const TETRAHEDRAL_MESH_DOCUMENT_VERSION = 1 as const;

export type TetrahedralMeshDocument = Readonly<{
  format: typeof TETRAHEDRAL_MESH_DOCUMENT_FORMAT;
  schemaVersion: typeof TETRAHEDRAL_MESH_DOCUMENT_VERSION;
  identity: DocumentIdentity;
  source: Readonly<{
    sourceMshSha256: string;
    resource: Readonly<{
      encoding: "math3d.tetmesh-buffers.v1";
      sha256: string;
      byteLength: number;
      pointCount: number;
      tetrahedronCount: number;
    }>;
  }>;
  metadata: Readonly<{ label: string }>;
  display: Readonly<{ visible: boolean }>;
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, fields: readonly string[]): boolean =>
  Object.keys(value).sort().join("|") === [...fields].sort().join("|");
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const count = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;

export const normalizeTetrahedralMeshDocument = (value: unknown): ValidationResult<TetrahedralMeshDocument> => {
  if (!record(value) || !exact(value, ["format", "schemaVersion", "identity", "source", "metadata", "display"])
      || value.format !== TETRAHEDRAL_MESH_DOCUMENT_FORMAT || value.schemaVersion !== 1
      || !isDocumentIdentity(value.identity) || !record(value.source)
      || !exact(value.source, ["sourceMshSha256", "resource"]) || !digest(value.source.sourceMshSha256)
      || !record(value.source.resource)
      || !exact(value.source.resource, ["encoding", "sha256", "byteLength", "pointCount", "tetrahedronCount"]))
    return { ok: false, errors: ["Invalid tetrahedral Mesh document."] };
  const resource = value.source.resource;
  if (resource.encoding !== "math3d.tetmesh-buffers.v1" || !digest(resource.sha256)
      || !count(resource.pointCount, 4, 200_000) || !count(resource.tetrahedronCount, 1, 400_000)
      || resource.byteLength !== 16 + 24 * Number(resource.pointCount) + 16 * Number(resource.tetrahedronCount)
      || !record(value.metadata) || !exact(value.metadata, ["label"])
      || typeof value.metadata.label !== "string" || value.metadata.label.length < 1 || value.metadata.label.length > 160
      || !record(value.display) || !exact(value.display, ["visible"])
      || typeof value.display.visible !== "boolean")
    return { ok: false, errors: ["Invalid tetrahedral Mesh source or metadata."] };
  try {
    const source = value.source as TetrahedralMeshDocument["source"];
    if (value.identity.structuralHash !== createDocumentIdentity(value.identity.id, source, value.identity.revision).structuralHash)
      return { ok: false, errors: ["Tetrahedral Mesh structural hash changed."] };
    return { ok: true, value: JSON.parse(canonicalJsonStringify(value)) as TetrahedralMeshDocument };
  } catch (error) { return { ok: false, errors: [String(error)] }; }
};

export const createTetrahedralMeshDocument = (source: TetrahedralMeshDocument["source"], label = "Tetrahedral Mesh"): TetrahedralMeshDocument => {
  const candidate = {
    format: TETRAHEDRAL_MESH_DOCUMENT_FORMAT, schemaVersion: TETRAHEDRAL_MESH_DOCUMENT_VERSION,
    identity: createDocumentIdentity(createStableDocumentId("tetmesh", source), source),
    source, metadata: { label }, display: { visible: true },
  };
  const result = normalizeTetrahedralMeshDocument(candidate);
  if (!result.ok) throw new TypeError(result.errors.join(" "));
  return result.value;
};

export const parseTetrahedralMeshDocument = (text: string): TetrahedralMeshDocument => {
  const result = normalizeTetrahedralMeshDocument(JSON.parse(text));
  if (!result.ok) throw new TypeError(result.errors.join(" "));
  return result.value;
};
