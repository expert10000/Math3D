import {
  advanceDocumentIdentity, canonicalJsonStringify, createDocumentIdentity,
  createStableDocumentId, defineDocumentFieldPolicy, isDocumentIdentity,
  type CanonicalJsonValue, type DocumentIdentity,
} from "./documentIdentity";
import { canonicalJsonByteLength } from "./scientificJobs";
import type { ValidationResult } from "./validation";

export const VOLUME_DOCUMENT_FORMAT = "math3d.volume-document" as const;
export const VOLUME_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const MAX_VOLUME_SOURCE_BYTES = 64 * 1024;

/** Compact recipe and resource identity only; voxel arrays and preview slices are artifacts. */
export type VolumeDocumentSource = Readonly<{
  representation: "analytic-scalar-field" | "custom-scalar-field" | "dense-scalar-grid" | "dense-vector-grid" | "distance-field" | "binary-mask" | "label-map";
  recipe: Readonly<Record<string, CanonicalJsonValue>>;
  spatial: Readonly<{
    dimensions: readonly [number, number, number];
    origin: readonly [number, number, number];
    spacing: readonly [number, number, number];
    direction: readonly number[];
    centering: "point" | "cell";
    coordinateSystem: string;
    positionUnits: string;
    valueUnits: string;
  }>;
  dependencies: readonly Readonly<{ module: string; objectId: string; revision: number; relation: string }>[];
  payload: Readonly<{ handle: string; byteLength: number; scalarType: string; components: number }> | null;
}>;

export type VolumeDocument = Readonly<{
  format: typeof VOLUME_DOCUMENT_FORMAT;
  schemaVersion: typeof VOLUME_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  source: VolumeDocumentSource;
  metadata: Readonly<{ title: string; legacyVolumeId: string | null; analysisSettings: CanonicalJsonValue }>;
  display: Readonly<{ visible: boolean }>;
}>;

export const VOLUME_DOCUMENT_FIELD_POLICY = defineDocumentFieldPolicy({
  format: "persistent-metadata", schemaVersion: "persistent-metadata", identity: "persistent-metadata",
  source: "structural", metadata: "persistent-metadata", display: "persistent-display",
});

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const fields = (value: Record<string, unknown>, required: readonly string[]): boolean =>
  required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) && Object.keys(value).every((key) => required.includes(key));
const clone = <T>(value: T): T => JSON.parse(canonicalJsonStringify(value)) as T;
const tuple = (value: unknown, length: number, positive = false): boolean =>
  Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === "number" && Number.isFinite(entry) && (!positive || entry > 0));

export const normalizeVolumeDocument = (value: unknown): ValidationResult<VolumeDocument> => {
  const errors: string[] = [];
  if (!record(value) || value.format !== VOLUME_DOCUMENT_FORMAT || value.schemaVersion !== 1) return { ok: false, errors: ["Unsupported Volume document."] };
  if (!fields(value, ["format", "schemaVersion", "identity", "source", "metadata", "display"])) errors.push("Volume document contains unknown or missing fields.");
  if (!isDocumentIdentity(value.identity)) errors.push("Invalid Volume document identity.");
  const source = value.source;
  if (!record(source) || !fields(source, ["representation", "recipe", "spatial", "dependencies", "payload"]) ||
      !["analytic-scalar-field", "custom-scalar-field", "dense-scalar-grid", "dense-vector-grid", "distance-field", "binary-mask", "label-map"].includes(String(source.representation)) ||
      !record(source.recipe) || !record(source.spatial) ||
      !fields(source.spatial, ["dimensions", "origin", "spacing", "direction", "centering", "coordinateSystem", "positionUnits", "valueUnits"]) ||
      !tuple(source.spatial.dimensions, 3, true) || !tuple(source.spatial.origin, 3) || !tuple(source.spatial.spacing, 3) ||
      !tuple(source.spatial.direction, 9) || !["point", "cell"].includes(String(source.spatial.centering)) ||
      typeof source.spatial.coordinateSystem !== "string" || typeof source.spatial.positionUnits !== "string" || typeof source.spatial.valueUnits !== "string" ||
      !Array.isArray(source.dependencies) || source.dependencies.some((entry: unknown) => !record(entry) || !fields(entry, ["module", "objectId", "revision", "relation"]) || typeof entry.module !== "string" || typeof entry.objectId !== "string" || !Number.isSafeInteger(entry.revision) || typeof entry.relation !== "string") ||
      (source.payload !== null && (!record(source.payload) || !fields(source.payload, ["handle", "byteLength", "scalarType", "components"]) || typeof source.payload.handle !== "string" || !source.payload.handle || !Number.isSafeInteger(source.payload.byteLength) || Number(source.payload.byteLength) < 0 || typeof source.payload.scalarType !== "string" || !Number.isSafeInteger(source.payload.components) || Number(source.payload.components) < 1))) errors.push("Invalid Volume source.");
  if (record(source) && canonicalJsonByteLength(source as CanonicalJsonValue) > MAX_VOLUME_SOURCE_BYTES) errors.push("Volume source is too large; store dense values as an artifact.");
  if (!record(value.metadata) || !fields(value.metadata, ["title", "legacyVolumeId", "analysisSettings"]) || typeof value.metadata.title !== "string" || !(value.metadata.legacyVolumeId === null || typeof value.metadata.legacyVolumeId === "string") || !record(value.metadata.analysisSettings)) errors.push("Invalid Volume metadata.");
  if (!record(value.display) || !fields(value.display, ["visible"]) || typeof value.display.visible !== "boolean") errors.push("Invalid Volume display.");
  if (errors.length) return { ok: false, errors };
  try {
    const document = clone(value) as VolumeDocument;
    if (document.identity.structuralHash !== createDocumentIdentity(document.identity.id, document.source, document.identity.revision).structuralHash) errors.push("Volume structural hash does not match source.");
    return errors.length ? { ok: false, errors } : { ok: true, value: document };
  } catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
};

export const createVolumeDocument = (input: {
  source: VolumeDocumentSource; identity?: DocumentIdentity; stableKey?: CanonicalJsonValue;
  metadata?: Partial<VolumeDocument["metadata"]>; display?: Partial<VolumeDocument["display"]>;
}): VolumeDocument => {
  const source = clone(input.source);
  const candidate = {
    format: VOLUME_DOCUMENT_FORMAT, schemaVersion: VOLUME_DOCUMENT_SCHEMA_VERSION,
    identity: input.identity ?? createDocumentIdentity(createStableDocumentId("volume", input.stableKey ?? source), source),
    source,
    metadata: { title: input.metadata?.title ?? "Volume", legacyVolumeId: input.metadata?.legacyVolumeId ?? null, analysisSettings: input.metadata?.analysisSettings ?? {} },
    display: { visible: input.display?.visible ?? true },
  };
  const normalized = normalizeVolumeDocument(candidate);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
export const replaceVolumeDocumentSource = (document: VolumeDocument, source: VolumeDocumentSource): VolumeDocument =>
  createVolumeDocument({ ...document, source, identity: advanceDocumentIdentity(document.identity, source) });
export const replaceVolumeDocumentAnalysisSettings = (document: VolumeDocument, analysisSettings: CanonicalJsonValue): VolumeDocument =>
  createVolumeDocument({ ...document, metadata: { ...document.metadata, analysisSettings } });
export const replaceVolumeDocumentDisplay = (document: VolumeDocument, visible: boolean): VolumeDocument =>
  createVolumeDocument({ ...document, display: { visible } });
export const serializeVolumeDocument = (document: VolumeDocument): string => canonicalJsonStringify(document);
export const parseVolumeDocument = (text: string): VolumeDocument => {
  const normalized = normalizeVolumeDocument(JSON.parse(text));
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
