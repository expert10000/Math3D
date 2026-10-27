import { advanceDocumentIdentity, canonicalJsonStringify, createDocumentIdentity, createStableDocumentId,
  isDocumentIdentity, structuralHash, type CanonicalJsonValue, type DocumentIdentity } from "./documentIdentity";
import { isGraph2DVectorFieldReference, type Graph2DVectorFieldReference } from "./graph2dVectorFieldReference";
import type { ValidationResult } from "./validation";

export const VECTOR_FIELD2D_DOCUMENT_FORMAT = "math3d.vector-field2d-document" as const;
export const VECTOR_FIELD2D_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const VECTOR_FIELD2D_MAX_DOCUMENT_BYTES = 128 * 1024;
export type VectorField2DSource = Readonly<{
  reference: Graph2DVectorFieldReference;
  quantity: Readonly<{ name: string; unit: string }>;
  display: Readonly<{ density: readonly [number, number]; maxGlyphs: number; magnitudeScale: number }>;
}>;
export type VectorField2DDocument = Readonly<{
  format: typeof VECTOR_FIELD2D_DOCUMENT_FORMAT;
  schemaVersion: typeof VECTOR_FIELD2D_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  source: VectorField2DSource;
  metadata: Readonly<{ title: string }>;
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, fields: readonly string[]) =>
  Object.keys(value).length === fields.length && fields.every(field => Object.prototype.hasOwnProperty.call(value, field));
const text = (value: unknown, max = 160): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value &&
  !/[\x00-\x1f\x7f]/.test(value);
const integer = (value: unknown, min: number, max: number) =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const validSource = (value: unknown): value is VectorField2DSource =>
  record(value) && exact(value, ["reference", "quantity", "display"]) &&
  isGraph2DVectorFieldReference(value.reference) &&
  record(value.quantity) && exact(value.quantity, ["name", "unit"]) &&
  text(value.quantity.name) && text(value.quantity.unit, 80) &&
  record(value.display) && exact(value.display, ["density", "maxGlyphs", "magnitudeScale"]) &&
  Array.isArray(value.display.density) && value.display.density.length === 2 &&
  value.display.density.every((count: unknown) => integer(count, 1, 64)) &&
  integer(value.display.maxGlyphs, 1, 512) &&
  typeof value.display.magnitudeScale === "number" && Number.isFinite(value.display.magnitudeScale) &&
  value.display.magnitudeScale >= 0.1 && value.display.magnitudeScale <= 4;

export function normalizeVectorField2DDocument(value: unknown): ValidationResult<VectorField2DDocument> {
  if (!record(value) || value.format !== VECTOR_FIELD2D_DOCUMENT_FORMAT ||
      value.schemaVersion !== VECTOR_FIELD2D_DOCUMENT_SCHEMA_VERSION)
    return { ok: false, errors: ["Unsupported 2D vector-field document format or version."] };
  if (!exact(value, ["format", "schemaVersion", "identity", "source", "metadata"]) ||
      !isDocumentIdentity(value.identity) || !value.identity.id.startsWith("math3d:vector-field2d:") ||
      !validSource(value.source) || !record(value.metadata) ||
      !exact(value.metadata, ["title"]) || !text(value.metadata.title))
    return { ok: false, errors: ["Invalid 2D vector-field document source, identity or metadata."] };
  try {
    const serialized = canonicalJsonStringify(value);
    if (new TextEncoder().encode(serialized).length > VECTOR_FIELD2D_MAX_DOCUMENT_BYTES)
      return { ok: false, errors: ["2D vector-field document exceeds size limit."] };
    const document = JSON.parse(serialized) as VectorField2DDocument;
    if (document.identity.structuralHash !== structuralHash(document.source))
      return { ok: false, errors: ["2D vector-field structural hash does not match source."] };
    return { ok: true, value: document };
  } catch (error) { return { ok: false, errors: [(error as Error).message] }; }
}

export function createVectorField2DDocument(source: VectorField2DSource,
  options: Readonly<{ stableKey: CanonicalJsonValue; title?: string; identity?: DocumentIdentity }>): VectorField2DDocument {
  const checked = JSON.parse(canonicalJsonStringify(source)) as VectorField2DSource;
  const candidate = { format: VECTOR_FIELD2D_DOCUMENT_FORMAT, schemaVersion: VECTOR_FIELD2D_DOCUMENT_SCHEMA_VERSION,
    identity: options.identity ?? createDocumentIdentity(createStableDocumentId("vector-field2d", options.stableKey), checked),
    source: checked, metadata: { title: options.title ?? "2D vector field" } };
  const normalized = normalizeVectorField2DDocument(candidate);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
}

export function reviseVectorField2DDocument(document: VectorField2DDocument,
  source: VectorField2DSource): VectorField2DDocument {
  const checked = normalizeVectorField2DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const next = JSON.parse(canonicalJsonStringify(source)) as VectorField2DSource;
  return createVectorField2DDocument(next, { stableKey: checked.value.identity.id,
    title: checked.value.metadata.title, identity: advanceDocumentIdentity(checked.value.identity, next) });
}

export function serializeVectorField2DDocument(document: VectorField2DDocument): string {
  const checked = normalizeVectorField2DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return canonicalJsonStringify(checked.value);
}

export function parseVectorField2DDocument(serialized: string): VectorField2DDocument {
  if (new TextEncoder().encode(serialized).length > VECTOR_FIELD2D_MAX_DOCUMENT_BYTES)
    throw new TypeError("2D vector-field document exceeds size limit.");
  const checked = normalizeVectorField2DDocument(JSON.parse(serialized));
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
}
