import {
  canonicalJsonStringify,
  isStructuralHash,
  structuralHash,
  type CanonicalJsonValue,
  type StructuralHash,
} from "./documentIdentity";
import { isFiniteNumber, isVec3, type Vec3 } from "./math";
import type { SurfaceDefinition } from "./sceneDocument";
import { canonicalJsonByteLength } from "./scientificJobs";

export const SCENE_OBJECT_FORMAT = "math3d.scene-object" as const;
export const SCENE_OBJECT_VERSION = 1 as const;
export const SCENE_OBJECT_SUPPORTED_KINDS = ["explicit", "parametric", "implicit", "weierstrass", "mesh"] as const;
export const MAX_SCENE_OBJECT_BYTES = 32 * 1024 * 1024;
export const MAX_SCENE_OBJECT_ANALYSIS_BYTES = 256 * 1024;
export const MAX_SCENE_OBJECT_VERTICES = 250_000;
export const MAX_SCENE_OBJECT_TRIANGLES = 500_000;

export type SceneObjectKind = (typeof SCENE_OBJECT_SUPPORTED_KINDS)[number];

export type SceneObjectTransform = Readonly<{
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}>;

export type SceneObjectStyle = Readonly<{
  color?: string;
  opacity?: number;
  wireframe?: boolean;
}>;

export type EmbeddedSceneObjectMesh = Readonly<{
  kind: "embedded-mesh";
  positions: readonly number[];
  indices: readonly number[];
  normals?: readonly number[];
}>;

export type ComputedSceneObjectReference = Readonly<{
  kind: "computed-result-reference";
  resultId: string;
  contentHash: StructuralHash;
}>;

export type SceneObjectGeometry = EmbeddedSceneObjectMesh | ComputedSceneObjectReference | null;

export type SceneObjectProducer = Readonly<{
  name: string;
  version: string;
  platform: string;
}>;

export type SceneObjectProvenance = Readonly<{
  sourceFormat: string;
  sourceProjectId: string | null;
  sourceObjectId: string;
  importedAt: number | null;
}>;

export type SceneObjectPayload = Readonly<{
  id: string;
  kind: SceneObjectKind;
  definition: SurfaceDefinition;
  transform: SceneObjectTransform;
  visible: boolean;
  style: SceneObjectStyle;
}>;

export type SceneObjectEnvelope = Readonly<{
  format: typeof SCENE_OBJECT_FORMAT;
  version: typeof SCENE_OBJECT_VERSION;
  producer: SceneObjectProducer;
  object: SceneObjectPayload;
  geometry: SceneObjectGeometry;
  provenance: SceneObjectProvenance;
  analysisMetadata: Readonly<Record<string, CanonicalJsonValue>>;
  contentHash: StructuralHash;
}>;

export type SceneObjectEnvelopeInput = Omit<SceneObjectEnvelope, "format" | "version" | "contentHash">;

export type SceneObjectReadResult =
  | { ok: true; value: SceneObjectEnvelope; migrated: boolean; sourceVersion: number }
  | { ok: false; errors: string[] };

type LegacySceneObjectEnvelopeV0 = {
  format: typeof SCENE_OBJECT_FORMAT;
  version: 0;
  producerVersion: string;
  surface: SurfaceDefinition;
  sourceProjectId?: string | null;
  analysisMetadata?: Record<string, CanonicalJsonValue>;
};

const ROOT_FIELDS = new Set(["format", "version", "producer", "object", "geometry", "provenance", "analysisMetadata", "contentHash"]);
const PRODUCER_FIELDS = new Set(["name", "version", "platform"]);
const OBJECT_FIELDS = new Set(["id", "kind", "definition", "transform", "visible", "style"]);
const TRANSFORM_FIELDS = new Set(["position", "rotation", "scale"]);
const STYLE_FIELDS = new Set(["color", "opacity", "wireframe"]);
const PROVENANCE_FIELDS = new Set(["sourceFormat", "sourceProjectId", "sourceObjectId", "importedAt"]);
const EMBEDDED_MESH_FIELDS = new Set(["kind", "positions", "indices", "normals"]);
const RESULT_REFERENCE_FIELDS = new Set(["kind", "resultId", "contentHash"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const EXTERNAL_SOURCE = /^(?:[a-z]+:\/\/|[a-zA-Z]:[\\/]|\\\\|\/)/;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const exactFields = (value: Record<string, unknown>, allowed: Set<string>, path: string, errors: string[]) => {
  const unexpected = Object.keys(value).filter((field) => !allowed.has(field));
  if (unexpected.length > 0) errors.push(`${path} contains unsupported fields: ${unexpected.sort().join(", ")}.`);
  const missing = [...allowed].filter((field) => !Object.prototype.hasOwnProperty.call(value, field));
  if (missing.length > 0) errors.push(`${path} is missing fields: ${missing.sort().join(", ")}.`);
};

const optionalFields = (value: Record<string, unknown>, allowed: Set<string>, path: string, errors: string[]) => {
  const unexpected = Object.keys(value).filter((field) => !allowed.has(field));
  if (unexpected.length > 0) errors.push(`${path} contains unsupported fields: ${unexpected.sort().join(", ")}.`);
};

const stringValue = (value: unknown, path: string, errors: string[], max = 160) => {
  if (typeof value !== "string" || value.length === 0 || value.length > max) errors.push(`${path} must be a non-empty string of at most ${max} characters.`);
};

const safeId = (value: unknown, path: string, errors: string[]) => {
  if (typeof value !== "string" || !SAFE_ID.test(value)) errors.push(`${path} must be a portable identifier.`);
};

const cloneCanonical = <T>(value: T): T => JSON.parse(canonicalJsonStringify(value)) as T;

const validateDomain = (
  value: unknown,
  requiredFields: readonly string[],
  path: string,
  errors: string[],
  optionalFieldsList: readonly string[] = []
) => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  optionalFields(value, new Set([...requiredFields, ...optionalFieldsList]), path, errors);
  for (const field of requiredFields) {
    if (!isFiniteNumber(value[field])) errors.push(`${path}.${field} must be finite.`);
  }
  for (const field of optionalFieldsList) {
    if (value[field] !== undefined && !isFiniteNumber(value[field])) errors.push(`${path}.${field} must be finite when provided.`);
  }
};

const validateDefinition = (value: unknown, expectedId: string, expectedKind: SceneObjectKind, errors: string[]): value is SurfaceDefinition => {
  if (!isRecord(value)) {
    errors.push("object.definition must be an object.");
    return false;
  }
  if (value.id !== expectedId) errors.push("object.definition.id must match object.id.");
  if (value.kind !== expectedKind) errors.push("object.definition.kind must match object.kind.");
  const expression = (field: string) => stringValue(value[field], `object.definition.${field}`, errors, 10_000);
  const resolution = () => {
    if (value.resolution !== undefined && (!Number.isSafeInteger(value.resolution) || Number(value.resolution) < 12 || Number(value.resolution) > 4096)) {
      errors.push("object.definition.resolution must be an integer from 12 to 4096.");
    }
  };

  if (expectedKind === "explicit") {
    optionalFields(value, new Set(["id", "kind", "expression", "domain", "resolution"]), "object.definition", errors);
    expression("expression");
    if (value.domain !== undefined) validateDomain(value.domain, ["xSpan", "ySpan"], "object.definition.domain", errors);
    resolution();
  } else if (expectedKind === "implicit") {
    optionalFields(value, new Set(["id", "kind", "expression", "domain", "resolution"]), "object.definition", errors);
    expression("expression");
    if (value.domain !== undefined) validateDomain(value.domain, ["xSpan", "ySpan"], "object.definition.domain", errors, ["zSpan"]);
    resolution();
  } else if (expectedKind === "parametric") {
    optionalFields(value, new Set(["id", "kind", "xExpr", "yExpr", "zExpr", "domain", "resolution"]), "object.definition", errors);
    expression("xExpr"); expression("yExpr"); expression("zExpr");
    if (value.domain !== undefined) validateDomain(value.domain, ["uMin", "uMax", "vMin", "vMax"], "object.definition.domain", errors);
    resolution();
  } else if (expectedKind === "weierstrass") {
    optionalFields(value, new Set(["id", "kind", "gExpr", "phiExpr", "recenter", "domain", "resolution"]), "object.definition", errors);
    expression("gExpr"); expression("phiExpr");
    if (value.recenter !== undefined && typeof value.recenter !== "boolean") errors.push("object.definition.recenter must be boolean.");
    if (value.domain !== undefined) validateDomain(value.domain, ["uMin", "uMax", "vMin", "vMax"], "object.definition.domain", errors);
    resolution();
  } else {
    optionalFields(value, new Set(["id", "kind", "source", "meshToken"]), "object.definition", errors);
    stringValue(value.source, "object.definition.source", errors, 512);
    if (typeof value.source === "string" && (EXTERNAL_SOURCE.test(value.source) || value.source.includes(".."))) {
      errors.push("object.definition.source cannot contain an external URI or device path.");
    }
    if (value.meshToken !== undefined) safeId(value.meshToken, "object.definition.meshToken", errors);
  }
  return errors.length === 0;
};

const validateTransform = (value: unknown, errors: string[]): value is SceneObjectTransform => {
  if (!isRecord(value)) {
    errors.push("object.transform must be an object.");
    return false;
  }
  exactFields(value, TRANSFORM_FIELDS, "object.transform", errors);
  if (!isVec3(value.position)) errors.push("object.transform.position must be a finite Vec3.");
  if (!isVec3(value.rotation)) errors.push("object.transform.rotation must be a finite Vec3.");
  if (!isVec3(value.scale) || (isVec3(value.scale) && (value.scale.x === 0 || value.scale.y === 0 || value.scale.z === 0))) {
    errors.push("object.transform.scale must be a finite non-zero Vec3.");
  }
  return errors.length === 0;
};

const validateStyle = (value: unknown, errors: string[]): value is SceneObjectStyle => {
  if (!isRecord(value)) {
    errors.push("object.style must be an object.");
    return false;
  }
  optionalFields(value, STYLE_FIELDS, "object.style", errors);
  if (value.color !== undefined && (typeof value.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value.color))) errors.push("object.style.color must be a six-digit hex color.");
  if (value.opacity !== undefined && (!isFiniteNumber(value.opacity) || value.opacity < 0 || value.opacity > 1)) errors.push("object.style.opacity must be between 0 and 1.");
  if (value.wireframe !== undefined && typeof value.wireframe !== "boolean") errors.push("object.style.wireframe must be boolean.");
  return errors.length === 0;
};

const validateFiniteArray = (value: unknown, path: string, multiple: number, maxLength: number, errors: string[]): value is number[] => {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return false;
  }
  if (value.length % multiple !== 0 || value.length > maxLength) errors.push(`${path} has an invalid length.`);
  if (value.some((entry) => !isFiniteNumber(entry))) errors.push(`${path} must contain only finite numbers.`);
  return errors.length === 0;
};

const validateGeometry = (value: unknown, objectKind: SceneObjectKind, errors: string[]): value is SceneObjectGeometry => {
  if (value === null) {
    if (objectKind === "mesh") errors.push("Mesh objects require embedded geometry or a computed-result reference.");
    return objectKind !== "mesh";
  }
  if (!isRecord(value)) {
    errors.push("geometry must be null or an object.");
    return false;
  }
  if (value.kind === "embedded-mesh") {
    optionalFields(value, EMBEDDED_MESH_FIELDS, "geometry", errors);
    validateFiniteArray(value.positions, "geometry.positions", 3, MAX_SCENE_OBJECT_VERTICES * 3, errors);
    validateFiniteArray(value.indices, "geometry.indices", 3, MAX_SCENE_OBJECT_TRIANGLES * 3, errors);
    if (value.normals !== undefined) validateFiniteArray(value.normals, "geometry.normals", 3, MAX_SCENE_OBJECT_VERTICES * 3, errors);
    if (Array.isArray(value.positions) && Array.isArray(value.indices)) {
      const vertexCount = value.positions.length / 3;
      if (value.indices.some((entry) => !Number.isSafeInteger(entry) || entry < 0 || entry >= vertexCount)) errors.push("geometry.indices contains an invalid vertex index.");
      if (Array.isArray(value.normals) && value.normals.length !== value.positions.length) errors.push("geometry.normals must match geometry.positions length.");
    }
  } else if (value.kind === "computed-result-reference") {
    exactFields(value, RESULT_REFERENCE_FIELDS, "geometry", errors);
    safeId(value.resultId, "geometry.resultId", errors);
    if (!isStructuralHash(value.contentHash)) errors.push("geometry.contentHash must be a SHA-256 structural hash.");
  } else {
    errors.push("geometry.kind is unsupported.");
  }
  return errors.length === 0;
};

export const sceneObjectContentHashInput = (
  value: Pick<SceneObjectEnvelope, "object" | "geometry" | "analysisMetadata">
): CanonicalJsonValue => cloneCanonical({
  object: value.object,
  geometry: value.geometry,
  analysisMetadata: value.analysisMetadata,
});

export const createSceneObjectEnvelope = (input: SceneObjectEnvelopeInput): SceneObjectEnvelope => {
  const base = cloneCanonical({
    format: SCENE_OBJECT_FORMAT,
    version: SCENE_OBJECT_VERSION,
    ...input,
  }) as Omit<SceneObjectEnvelope, "contentHash">;
  const candidate = { ...base, contentHash: structuralHash(sceneObjectContentHashInput(base)) } as SceneObjectEnvelope;
  const validated = validateSceneObjectEnvelope(candidate);
  if (!validated.ok) throw new TypeError(validated.errors.join(" "));
  return cloneCanonical(candidate);
};

export const validateSceneObjectEnvelope = (value: unknown): { ok: true; value: SceneObjectEnvelope } | { ok: false; errors: string[] } => {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["Scene object envelope must be an object."] };
  exactFields(value, ROOT_FIELDS, "envelope", errors);
  if (value.format !== SCENE_OBJECT_FORMAT) errors.push(`Envelope format must be '${SCENE_OBJECT_FORMAT}'.`);
  if (value.version !== SCENE_OBJECT_VERSION) errors.push(`Envelope version must be ${SCENE_OBJECT_VERSION}.`);

  if (!isRecord(value.producer)) errors.push("producer must be an object.");
  else {
    exactFields(value.producer, PRODUCER_FIELDS, "producer", errors);
    stringValue(value.producer.name, "producer.name", errors, 120);
    stringValue(value.producer.version, "producer.version", errors, 80);
    stringValue(value.producer.platform, "producer.platform", errors, 80);
  }

  let objectKind: SceneObjectKind | null = null;
  if (!isRecord(value.object)) errors.push("object must be an object.");
  else {
    exactFields(value.object, OBJECT_FIELDS, "object", errors);
    safeId(value.object.id, "object.id", errors);
    if (!(SCENE_OBJECT_SUPPORTED_KINDS as readonly unknown[]).includes(value.object.kind)) errors.push("object.kind is unsupported.");
    else objectKind = value.object.kind as SceneObjectKind;
    if (objectKind && typeof value.object.id === "string") validateDefinition(value.object.definition, value.object.id, objectKind, errors);
    validateTransform(value.object.transform, errors);
    if (typeof value.object.visible !== "boolean") errors.push("object.visible must be boolean.");
    validateStyle(value.object.style, errors);
  }
  if (objectKind) validateGeometry(value.geometry, objectKind, errors);

  if (!isRecord(value.provenance)) errors.push("provenance must be an object.");
  else {
    exactFields(value.provenance, PROVENANCE_FIELDS, "provenance", errors);
    stringValue(value.provenance.sourceFormat, "provenance.sourceFormat", errors, 120);
    if (typeof value.provenance.sourceFormat === "string" && EXTERNAL_SOURCE.test(value.provenance.sourceFormat)) errors.push("provenance.sourceFormat cannot be a URI or device path.");
    if (!(value.provenance.sourceProjectId === null || typeof value.provenance.sourceProjectId === "string")) errors.push("provenance.sourceProjectId must be a string or null.");
    safeId(value.provenance.sourceObjectId, "provenance.sourceObjectId", errors);
    if (!(value.provenance.importedAt === null || (isFiniteNumber(value.provenance.importedAt) && value.provenance.importedAt >= 0))) errors.push("provenance.importedAt must be a non-negative timestamp or null.");
  }

  if (!isRecord(value.analysisMetadata)) errors.push("analysisMetadata must be an object.");
  else {
    try {
      canonicalJsonStringify(value.analysisMetadata);
      if (canonicalJsonByteLength(value.analysisMetadata) > MAX_SCENE_OBJECT_ANALYSIS_BYTES) errors.push("analysisMetadata exceeds the size limit.");
    } catch (error) {
      errors.push(`analysisMetadata is not canonical JSON: ${String((error as Error).message ?? error)}`);
    }
  }
  if (!isStructuralHash(value.contentHash)) errors.push("contentHash must be a SHA-256 structural hash.");
  if (errors.length === 0) {
    const expected = structuralHash(sceneObjectContentHashInput(value as SceneObjectEnvelope));
    if (value.contentHash !== expected) errors.push("contentHash does not match the canonical object content.");
  }
  if (errors.length === 0) {
    try {
      if (canonicalJsonByteLength(value) > MAX_SCENE_OBJECT_BYTES) errors.push("Scene object envelope exceeds the size limit.");
    } catch (error) {
      errors.push(`Envelope is not canonical JSON: ${String((error as Error).message ?? error)}`);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: cloneCanonical(value) as SceneObjectEnvelope };
};

const migrateLegacyV0 = (value: Record<string, unknown>): SceneObjectReadResult => {
  if (!isRecord(value.surface)) return { ok: false, errors: ["Legacy scene object surface is required."] };
  const surface = value.surface as SurfaceDefinition;
  if (surface.kind === "mesh") return { ok: false, errors: ["Legacy mesh objects lack self-contained geometry and cannot be migrated."] };
  try {
    const envelope = createSceneObjectEnvelope({
      producer: { name: "Math3D legacy", version: typeof value.producerVersion === "string" ? value.producerVersion : "0", platform: "unknown" },
      object: {
        id: surface.id,
        kind: surface.kind,
        definition: surface,
        transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        visible: true,
        style: {},
      },
      geometry: null,
      provenance: {
        sourceFormat: SCENE_OBJECT_FORMAT,
        sourceProjectId: typeof value.sourceProjectId === "string" ? value.sourceProjectId : null,
        sourceObjectId: surface.id,
        importedAt: null,
      },
      analysisMetadata: isRecord(value.analysisMetadata) ? value.analysisMetadata as Record<string, CanonicalJsonValue> : {},
    });
    return { ok: true, value: envelope, migrated: true, sourceVersion: 0 };
  } catch (error) {
    return { ok: false, errors: [`Legacy scene object migration failed: ${String((error as Error).message ?? error)}`] };
  }
};

export const normalizeSceneObjectEnvelope = (value: unknown): SceneObjectReadResult => {
  if (!isRecord(value)) return { ok: false, errors: ["Scene object envelope must be an object."] };
  if (value.format !== SCENE_OBJECT_FORMAT) return { ok: false, errors: [`Unsupported format '${String(value.format ?? "unknown")}'.`] };
  if (value.version === 0) return migrateLegacyV0(value);
  if (value.version !== SCENE_OBJECT_VERSION) return { ok: false, errors: [`Unsupported scene object version '${String(value.version ?? "unknown")}'.`] };
  const validated = validateSceneObjectEnvelope(value);
  return validated.ok
    ? { ok: true, value: validated.value, migrated: false, sourceVersion: SCENE_OBJECT_VERSION }
    : validated;
};

export const serializeSceneObjectEnvelope = (value: SceneObjectEnvelope): string => {
  const validated = validateSceneObjectEnvelope(value);
  if (!validated.ok) throw new TypeError(validated.errors.join(" "));
  return canonicalJsonStringify(validated.value);
};

export const deserializeSceneObjectEnvelope = (serialized: string): SceneObjectReadResult => {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    return { ok: false, errors: [`Invalid JSON: ${String((error as Error).message ?? error)}`] };
  }
  return normalizeSceneObjectEnvelope(value);
};

export type { LegacySceneObjectEnvelopeV0 };
