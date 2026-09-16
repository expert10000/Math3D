import {
  advanceDocumentIdentity, canonicalJsonStringify, createDocumentIdentity,
  createStableDocumentId, defineDocumentFieldPolicy, isDocumentIdentity,
  type CanonicalJsonValue, type DocumentIdentity,
} from "./documentIdentity";
import type { ValidationResult } from "./validation";

export const SURFACE_DOCUMENT_FORMAT = "math3d.surface-document" as const;
export const SURFACE_DOCUMENT_SCHEMA_VERSION = 1 as const;

/** Only mathematical input belongs here. Sampling density is an analysis setting, not a new surface. */
export type SurfaceDocumentSource = Readonly<{
  representation: "explicit" | "implicit" | "parametric" | "spline" | "constructed" | "weierstrass" | "mesh-backed";
  domain: CanonicalJsonValue;
  units: CanonicalJsonValue;
  orientation: CanonicalJsonValue;
  definition: Readonly<{
    familyId: string;
    expressions?: Readonly<Record<string, string>>;
    settings?: Readonly<Record<string, number | string | boolean | null>>;
    sourceIds?: readonly string[];
    meshId?: string;
  }>;
  parameters: Readonly<Record<string, CanonicalJsonValue>>;
  branchPolicy: CanonicalJsonValue | null;
}>;

export type SurfaceDocument = Readonly<{
  format: typeof SURFACE_DOCUMENT_FORMAT;
  schemaVersion: typeof SURFACE_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  source: SurfaceDocumentSource;
  metadata: Readonly<{ title: string; legacySurfaceId: string | null; analysisSettings: CanonicalJsonValue }>;
  display: Readonly<{ visible: boolean }>;
}>;

export const SURFACE_DOCUMENT_FIELD_POLICY = defineDocumentFieldPolicy({
  format: "persistent-metadata", schemaVersion: "persistent-metadata", identity: "persistent-metadata",
  source: "structural", metadata: "persistent-metadata", display: "persistent-display",
});

const clone = <T>(value: T): T => JSON.parse(canonicalJsonStringify(value)) as T;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const fields = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean =>
  required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
  Object.keys(value).every((key) => required.includes(key) || optional.includes(key));

export const normalizeSurfaceDocument = (value: unknown): ValidationResult<SurfaceDocument> => {
  const errors: string[] = [];
  if (!record(value) || value.format !== SURFACE_DOCUMENT_FORMAT || value.schemaVersion !== 1) return { ok: false, errors: ["Unsupported Surface document."] };
  if (!fields(value, ["format", "schemaVersion", "identity", "source", "metadata", "display"])) errors.push("Surface document contains unknown or missing fields.");
  if (!isDocumentIdentity(value.identity)) errors.push("Invalid Surface document identity.");
  if (!record(value.source) || !["explicit", "implicit", "parametric", "spline", "constructed", "weierstrass", "mesh-backed"].includes(String(value.source.representation)) ||
      !record(value.source.definition) || typeof value.source.definition.familyId !== "string" || !value.source.definition.familyId ||
      !record(value.source.domain) || typeof value.source.domain.kind !== "string" ||
      !record(value.source.units) || typeof value.source.units.length !== "string" ||
      !record(value.source.orientation) || !record(value.source.parameters) ||
      !fields(value.source, ["representation", "domain", "units", "orientation", "definition", "parameters", "branchPolicy"]) ||
      !fields(value.source.definition, ["familyId"], ["expressions", "settings", "sourceIds", "meshId"])) errors.push("Invalid Surface source.");
  if (!record(value.metadata) || typeof value.metadata.title !== "string" || !(value.metadata.legacySurfaceId === null || typeof value.metadata.legacySurfaceId === "string")) errors.push("Invalid Surface metadata.");
  if (record(value.metadata) && !fields(value.metadata, ["title", "legacySurfaceId", "analysisSettings"])) errors.push("Surface metadata contains unknown or missing fields.");
  if (!record(value.display) || typeof value.display.visible !== "boolean") errors.push("Invalid Surface display.");
  if (record(value.display) && !fields(value.display, ["visible"])) errors.push("Surface display contains unknown or missing fields.");
  if (errors.length) return { ok: false, errors };
  try {
    const document = clone(value) as SurfaceDocument;
    if (document.identity.structuralHash !== createDocumentIdentity(document.identity.id, document.source, document.identity.revision).structuralHash) errors.push("Surface structural hash does not match source.");
    return errors.length ? { ok: false, errors } : { ok: true, value: document };
  } catch (error) {
    return { ok: false, errors: [String((error as Error).message ?? error)] };
  }
};

export const createSurfaceDocument = (input: {
  source: SurfaceDocumentSource;
  identity?: DocumentIdentity;
  stableKey?: CanonicalJsonValue;
  metadata?: Partial<SurfaceDocument["metadata"]>;
  display?: Partial<SurfaceDocument["display"]>;
}): SurfaceDocument => {
  const source = clone(input.source);
  const candidate = {
    format: SURFACE_DOCUMENT_FORMAT, schemaVersion: SURFACE_DOCUMENT_SCHEMA_VERSION,
    identity: input.identity ?? createDocumentIdentity(createStableDocumentId("surface", input.stableKey ?? source), source),
    source,
    metadata: { title: input.metadata?.title ?? "Surface", legacySurfaceId: input.metadata?.legacySurfaceId ?? null, analysisSettings: input.metadata?.analysisSettings ?? {} },
    display: { visible: input.display?.visible ?? true },
  };
  const normalized = normalizeSurfaceDocument(candidate);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};

export const replaceSurfaceDocumentSource = (document: SurfaceDocument, source: SurfaceDocumentSource): SurfaceDocument =>
  createSurfaceDocument({ ...document, source, identity: advanceDocumentIdentity(document.identity, source) });

export const replaceSurfaceDocumentAnalysisSettings = (document: SurfaceDocument, analysisSettings: CanonicalJsonValue): SurfaceDocument =>
  createSurfaceDocument({ ...document, metadata: { ...document.metadata, analysisSettings } });

export const serializeSurfaceDocument = (document: SurfaceDocument): string => canonicalJsonStringify(document);
export const parseSurfaceDocument = (text: string): SurfaceDocument => {
  const result = normalizeSurfaceDocument(JSON.parse(text));
  if (!result.ok) throw new TypeError(result.errors.join(" "));
  return result.value;
};
