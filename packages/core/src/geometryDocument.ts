import {
  advanceDocumentIdentity,
  canonicalJsonStringify,
  createDocumentIdentity,
  createStableDocumentId,
  defineDocumentFieldPolicy,
  isDocumentIdentity,
  type CanonicalJsonValue,
  type DocumentIdentity,
} from "./documentIdentity";
import type { DerivedConstructionObjectDefinition, ConstructionRelationshipDefinition } from "./geometry/constructionObjects";
import type { SceneDocument, CameraPreset, OverlayDefinition, SurfaceDefinition } from "./sceneDocument";
import type { GeometryObject, GeometryObjectMaterial, GeometryObjectTransform, GeometryObjectType, GeometryScene } from "./sceneObjects";
import type { ValidationResult } from "./validation";

export const GEOMETRY_DOCUMENT_FORMAT = "math3d.geometry-document" as const;
export const GEOMETRY_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const LEGACY_DERIVED_CONSTRUCTIONS_EXTENSION = "math3d.geometry.derivedConstructions.v1" as const;
export const LEGACY_CONSTRUCTION_RELATIONSHIPS_EXTENSION = "math3d.geometry.constructionRelationships.v1" as const;

export type GeometrySourceObject = Readonly<{
  id: string;
  type: GeometryObjectType;
  params: Readonly<Record<string, number | boolean | string>>;
  transform: GeometryObjectTransform;
}>;

export type GeometryConstructionSource = Readonly<Omit<DerivedConstructionObjectDefinition, "name" | "visible" | "createdAt">>;
export type GeometryRelationshipSource = Readonly<Omit<ConstructionRelationshipDefinition, "createdAt">>;

export type GeometryDocumentSource = Readonly<{
  geometry: GeometryScene | null;
  objects: readonly GeometrySourceObject[];
  surfaces: readonly SurfaceDefinition[];
  constructions: readonly GeometryConstructionSource[];
  relationships: readonly GeometryRelationshipSource[];
  parameters: Readonly<Record<string, CanonicalJsonValue>>;
  extensions: Readonly<Record<string, CanonicalJsonValue>>;
}>;

export type GeometryObjectPresentation = Readonly<{
  name: string;
  visible: boolean;
  material: GeometryObjectMaterial;
  group?: string;
}>;

export type GeometryConstructionPresentation = Readonly<{
  name?: string;
  visible?: boolean;
  createdAt?: number;
}>;

export type GeometryDocumentMetadata = Readonly<{
  title: string;
  createdAt: number;
  updatedAt: number;
  custom: Readonly<Record<string, string | number | boolean | null>>;
  constructionCreatedAt: Readonly<Record<string, number>>;
  relationshipCreatedAt: Readonly<Record<string, number>>;
}>;

export type GeometryDocumentDisplay = Readonly<{
  objects: Readonly<Record<string, GeometryObjectPresentation>>;
  constructions: Readonly<Record<string, GeometryConstructionPresentation>>;
  overlays: readonly OverlayDefinition[];
  cameras: readonly CameraPreset[];
  activeCameraId: string | null;
}>;

export type GeometryDocumentProvenance = Readonly<{
  origin: "native" | "legacy-scene-adapter";
  sourceFormat: string;
  sourceVersion: number;
  sourceSceneId: string | null;
  diagnostics: readonly string[];
}>;

export type GeometryDocument = Readonly<{
  format: typeof GEOMETRY_DOCUMENT_FORMAT;
  schemaVersion: typeof GEOMETRY_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  source: GeometryDocumentSource;
  metadata: GeometryDocumentMetadata;
  display: GeometryDocumentDisplay;
  provenance: GeometryDocumentProvenance;
}>;

/** Viewer interaction belongs beside the adapter, never in its canonical document. */
export type GeometryTransientViewState = Readonly<{
  hoveredEntityId: string | null;
  dragPreview: CanonicalJsonValue | null;
  cameraInteractionActive: boolean;
  temporaryPickIds: readonly string[];
}>;

export const GEOMETRY_DOCUMENT_FIELD_POLICY = defineDocumentFieldPolicy({
  format: "persistent-metadata",
  schemaVersion: "persistent-metadata",
  identity: "persistent-metadata",
  source: "structural",
  metadata: "persistent-metadata",
  display: "persistent-display",
  provenance: "persistent-metadata",
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const clone = <Value>(value: Value): Value => JSON.parse(canonicalJsonStringify(value)) as Value;

const immutable = <Value>(value: Value): Value => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
  return value;
};

const canonical = <Value>(value: Value): Value => immutable(clone(value));
const validId = (value: unknown): value is string => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 160;
const finiteNonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const exactFields = (value: Record<string, unknown>, expected: readonly string[], path: string, errors: string[]): void => {
  const extra = Object.keys(value).filter((field) => !expected.includes(field));
  const missing = expected.filter((field) => !Object.prototype.hasOwnProperty.call(value, field));
  if (extra.length) errors.push(`${path} contains unknown fields: ${extra.sort().join(", ")}.`);
  if (missing.length) errors.push(`${path} is missing fields: ${missing.sort().join(", ")}.`);
};
const validVec3 = (value: unknown): boolean => isRecord(value) &&
  [value.x, value.y, value.z].every((entry) => typeof entry === "number" && Number.isFinite(entry));
const GEOMETRY_OBJECT_TYPES: readonly GeometryObjectType[] = ["sphere", "box", "cylinder", "cone", "torus", "plane", "polyhedron"];

const validateSource = (source: unknown, errors: string[]): source is GeometryDocumentSource => {
  if (!isRecord(source)) { errors.push("geometry.source must be an object."); return false; }
  exactFields(source, ["geometry", "objects", "surfaces", "constructions", "relationships", "parameters", "extensions"], "geometry.source", errors);
  try { canonicalJsonStringify(source); } catch (error) { errors.push(`geometry.source must be canonical JSON: ${String((error as Error).message ?? error)}`); return false; }
  for (const field of ["objects", "surfaces", "constructions", "relationships"] as const) {
    if (!Array.isArray(source[field])) errors.push(`geometry.source.${field} must be an array.`);
  }
  if (source.geometry !== null && !isRecord(source.geometry)) errors.push("geometry.source.geometry must be an object or null.");
  if (!isRecord(source.parameters)) errors.push("geometry.source.parameters must be an object.");
  if (!isRecord(source.extensions)) errors.push("geometry.source.extensions must be an object.");
  const ids = new Set<string>();
  for (const [index, object] of (Array.isArray(source.objects) ? source.objects : []).entries()) {
    if (!isRecord(object) || !validId(object.id) || !GEOMETRY_OBJECT_TYPES.includes(object.type as GeometryObjectType) || !isRecord(object.params) || !isRecord(object.transform) ||
        !validVec3(object.transform.position) || !validVec3(object.transform.rotation) || !validVec3(object.transform.scale) ||
        Object.values(isRecord(object.params) ? object.params : {}).some((entry) => !["number", "boolean", "string"].includes(typeof entry))) {
      errors.push(`geometry.source.objects[${index}] is invalid.`); continue;
    }
    if (ids.has(object.id)) errors.push(`geometry source ID '${object.id}' is duplicated.`);
    ids.add(object.id);
  }
  for (const [field, entries] of [["constructions", source.constructions], ["relationships", source.relationships]] as const) {
    for (const [index, entry] of (Array.isArray(entries) ? entries : []).entries()) {
      if (!isRecord(entry) || !validId(entry.id)) { errors.push(`geometry.source.${field}[${index}] requires an ID.`); continue; }
      if (ids.has(entry.id)) errors.push(`geometry source ID '${entry.id}' is duplicated.`);
      ids.add(entry.id);
    }
  }
  return errors.length === 0;
};

export const normalizeGeometryDocument = (value: unknown): ValidationResult<GeometryDocument> => {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["Geometry document must be an object."] };
  exactFields(value, ["format", "schemaVersion", "identity", "source", "metadata", "display", "provenance"], "geometry", errors);
  try { canonicalJsonStringify(value); } catch (error) { return { ok: false, errors: [`Geometry document must be canonical JSON: ${String((error as Error).message ?? error)}`] }; }
  if (value.format !== GEOMETRY_DOCUMENT_FORMAT) errors.push(`geometry.format must be '${GEOMETRY_DOCUMENT_FORMAT}'.`);
  if (value.schemaVersion !== GEOMETRY_DOCUMENT_SCHEMA_VERSION) errors.push(`geometry.schemaVersion must be ${GEOMETRY_DOCUMENT_SCHEMA_VERSION}.`);
  if (!isDocumentIdentity(value.identity)) errors.push("geometry.identity is invalid.");
  validateSource(value.source, errors);
  if (!isRecord(value.metadata) || typeof value.metadata.title !== "string" ||
      !finiteNonNegative(value.metadata.createdAt) || !finiteNonNegative(value.metadata.updatedAt) ||
      !isRecord(value.metadata.custom) || !isRecord(value.metadata.constructionCreatedAt) || !isRecord(value.metadata.relationshipCreatedAt)) {
    errors.push("geometry.metadata is invalid.");
  }
  if (isRecord(value.metadata)) exactFields(value.metadata, ["title", "createdAt", "updatedAt", "custom", "constructionCreatedAt", "relationshipCreatedAt"], "geometry.metadata", errors);
  if (!isRecord(value.display) || !isRecord(value.display.objects) || !isRecord(value.display.constructions) ||
      !Array.isArray(value.display.overlays) || !Array.isArray(value.display.cameras) ||
      !(value.display.activeCameraId === null || typeof value.display.activeCameraId === "string")) {
    errors.push("geometry.display is invalid.");
  }
  if (isRecord(value.display)) exactFields(value.display, ["objects", "constructions", "overlays", "cameras", "activeCameraId"], "geometry.display", errors);
  if (!isRecord(value.provenance) || !["native", "legacy-scene-adapter"].includes(String(value.provenance.origin)) ||
      typeof value.provenance.sourceFormat !== "string" || !Number.isSafeInteger(value.provenance.sourceVersion) ||
      !(value.provenance.sourceSceneId === null || typeof value.provenance.sourceSceneId === "string") || !Array.isArray(value.provenance.diagnostics)) {
    errors.push("geometry.provenance is invalid.");
  }
  if (isRecord(value.provenance)) exactFields(value.provenance, ["origin", "sourceFormat", "sourceVersion", "sourceSceneId", "diagnostics"], "geometry.provenance", errors);
  if (errors.length > 0) return { ok: false, errors };
  const document = canonical(value) as unknown as GeometryDocument;
  if (document.identity.structuralHash !== createDocumentIdentity(document.identity.id, document.source, document.identity.revision).structuralHash) {
    return { ok: false, errors: ["geometry.identity.structuralHash does not match geometry.source."] };
  }
  return { ok: true, value: document };
};

export const createGeometryDocument = (input: {
  source: GeometryDocumentSource;
  identity?: DocumentIdentity;
  stableKey?: CanonicalJsonValue;
  metadata?: Partial<GeometryDocumentMetadata>;
  display?: Partial<GeometryDocumentDisplay>;
  provenance?: Partial<GeometryDocumentProvenance>;
}): GeometryDocument => {
  const source = canonical(input.source);
  const identity = input.identity ?? createDocumentIdentity(createStableDocumentId("geometry", input.stableKey ?? { source }), source);
  const candidate = {
    format: GEOMETRY_DOCUMENT_FORMAT,
    schemaVersion: GEOMETRY_DOCUMENT_SCHEMA_VERSION,
    identity,
    source,
    metadata: {
      title: input.metadata?.title ?? "Geometry scene",
      createdAt: input.metadata?.createdAt ?? 0,
      updatedAt: input.metadata?.updatedAt ?? input.metadata?.createdAt ?? 0,
      custom: input.metadata?.custom ?? {},
      constructionCreatedAt: input.metadata?.constructionCreatedAt ?? {},
      relationshipCreatedAt: input.metadata?.relationshipCreatedAt ?? {},
    },
    display: {
      objects: input.display?.objects ?? {}, constructions: input.display?.constructions ?? {},
      overlays: input.display?.overlays ?? [], cameras: input.display?.cameras ?? [],
      activeCameraId: input.display?.activeCameraId ?? null,
    },
    provenance: {
      origin: input.provenance?.origin ?? "native",
      sourceFormat: input.provenance?.sourceFormat ?? GEOMETRY_DOCUMENT_FORMAT,
      sourceVersion: input.provenance?.sourceVersion ?? GEOMETRY_DOCUMENT_SCHEMA_VERSION,
      sourceSceneId: input.provenance?.sourceSceneId ?? null,
      diagnostics: input.provenance?.diagnostics ?? [],
    },
  };
  const normalized = normalizeGeometryDocument(candidate);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};

export const replaceGeometryDocumentSource = (document: GeometryDocument, source: GeometryDocumentSource): GeometryDocument =>
  createGeometryDocument({ ...document, source, identity: advanceDocumentIdentity(document.identity, source) });

export const replaceGeometryDocumentDisplay = (document: GeometryDocument, display: GeometryDocumentDisplay): GeometryDocument =>
  createGeometryDocument({ ...document, source: document.source, display, identity: document.identity });

export const serializeGeometryDocument = (document: GeometryDocument): string => {
  const normalized = normalizeGeometryDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return canonicalJsonStringify(normalized.value);
};

export const deserializeGeometryDocument = (text: string): ValidationResult<GeometryDocument> => {
  try { return normalizeGeometryDocument(JSON.parse(text)); }
  catch (error) { return { ok: false, errors: [`Geometry document JSON is invalid: ${String((error as Error).message ?? error)}`] }; }
};

const constructionSource = (entry: DerivedConstructionObjectDefinition): GeometryConstructionSource => {
  const { name: _name, visible: _visible, createdAt: _createdAt, ...source } = entry;
  return source;
};
const relationshipSource = (entry: ConstructionRelationshipDefinition): GeometryRelationshipSource => {
  const { createdAt: _createdAt, ...source } = entry;
  return source;
};

/** Explicit legacy read adapter. It never mutates or rewrites the supplied SceneDocument. */
export const geometryDocumentFromSceneDocument = (scene: SceneDocument): GeometryDocument => {
  const legacy = canonical(scene);
  const rawConstructions = legacy.extensions?.[LEGACY_DERIVED_CONSTRUCTIONS_EXTENSION];
  const rawRelationships = legacy.extensions?.[LEGACY_CONSTRUCTION_RELATIONSHIPS_EXTENSION];
  const constructions = (Array.isArray(rawConstructions) ? rawConstructions : []) as DerivedConstructionObjectDefinition[];
  const relationships = (Array.isArray(rawRelationships) ? rawRelationships : []) as ConstructionRelationshipDefinition[];
  const extensions = Object.fromEntries(Object.entries(legacy.extensions ?? {}).filter(([key]) =>
    key !== LEGACY_DERIVED_CONSTRUCTIONS_EXTENSION && key !== LEGACY_CONSTRUCTION_RELATIONSHIPS_EXTENSION
  )) as Record<string, CanonicalJsonValue>;
  const objects = legacy.objects ?? [];
  return createGeometryDocument({
    stableKey: { legacySceneId: legacy.id },
    source: {
      geometry: legacy.geometry ?? null,
      objects: objects.map(({ id, type, params, transform }) => ({ id, type, params, transform })),
      surfaces: legacy.surfaces ?? [], constructions: constructions.map(constructionSource),
      relationships: relationships.map(relationshipSource), parameters: {}, extensions,
    },
    metadata: {
      title: legacy.title, createdAt: legacy.createdAt, updatedAt: legacy.updatedAt,
      custom: legacy.metadata ?? {},
      constructionCreatedAt: Object.fromEntries(constructions.filter((entry) => entry.createdAt !== undefined).map((entry) => [entry.id, entry.createdAt!])),
      relationshipCreatedAt: Object.fromEntries(relationships.filter((entry) => entry.createdAt !== undefined).map((entry) => [entry.id, entry.createdAt!])),
    },
    display: {
      objects: Object.fromEntries(objects.map((object) => [object.id, { name: object.name, visible: object.visible, material: object.material, ...(object.group ? { group: object.group } : {}) }])),
      constructions: Object.fromEntries(constructions.map((entry) => [entry.id, { ...(entry.name ? { name: entry.name } : {}), ...(entry.visible === undefined ? {} : { visible: entry.visible }), ...(entry.createdAt === undefined ? {} : { createdAt: entry.createdAt }) }])),
      overlays: legacy.overlays ?? [], cameras: legacy.cameras ?? [], activeCameraId: legacy.activeCameraId ?? null,
    },
    provenance: { origin: "legacy-scene-adapter", sourceFormat: "math3d.scene-document", sourceVersion: 1, sourceSceneId: legacy.id, diagnostics: [] },
  });
};

/** User-controlled compatibility export; opening a legacy project never calls this implicitly. */
export const geometryDocumentToSceneDocument = (document: GeometryDocument): SceneDocument => {
  const normalized = normalizeGeometryDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  const value = normalized.value;
  const objects: GeometryObject[] = value.source.objects.map((object) => {
    const presentation = value.display.objects[object.id] ?? { name: object.id, visible: true, material: {} };
    return { ...clone(object), name: presentation.name, visible: presentation.visible, material: clone(presentation.material), ...(presentation.group ? { group: presentation.group } : {}) };
  });
  const constructions: DerivedConstructionObjectDefinition[] = value.source.constructions.map((entry) => ({
    ...clone(entry), ...clone(value.display.constructions[entry.id] ?? {}),
    ...(value.metadata.constructionCreatedAt[entry.id] === undefined ? {} : { createdAt: value.metadata.constructionCreatedAt[entry.id] }),
  }));
  const relationships: ConstructionRelationshipDefinition[] = value.source.relationships.map((entry) => ({
    ...clone(entry), ...(value.metadata.relationshipCreatedAt[entry.id] === undefined ? {} : { createdAt: value.metadata.relationshipCreatedAt[entry.id] }),
  }));
  return canonical({
    identity: value.identity,
    id: value.provenance.sourceSceneId ?? value.identity.id,
    title: value.metadata.title, createdAt: value.metadata.createdAt, updatedAt: value.metadata.updatedAt,
    ...(value.source.geometry ? { geometry: value.source.geometry } : {}), objects,
    surfaces: [...clone(value.source.surfaces)], overlays: [...clone(value.display.overlays)], cameras: [...clone(value.display.cameras)],
    activeCameraId: value.display.activeCameraId, metadata: value.metadata.custom,
    extensions: {
      ...value.source.extensions,
      ...(constructions.length ? { [LEGACY_DERIVED_CONSTRUCTIONS_EXTENSION]: constructions } : {}),
      ...(relationships.length ? { [LEGACY_CONSTRUCTION_RELATIONSHIPS_EXTENSION]: relationships } : {}),
    },
  });
};
