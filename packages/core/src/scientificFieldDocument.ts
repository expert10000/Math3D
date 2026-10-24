import { advanceDocumentIdentity, canonicalJsonStringify, createDocumentIdentity, createStableDocumentId,
  isDocumentIdentity, structuralHash, type CanonicalJsonValue, type DocumentIdentity } from "./documentIdentity";
import { isGraph2DFieldReference, type Graph2DFieldReference } from "./graph2dFieldReference";
import type { ValidationResult } from "./validation";

export const SCIENTIFIC_FIELD_DOCUMENT_FORMAT = "math3d.scientific-field-document" as const;
export const SCIENTIFIC_FIELD_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const SCIENTIFIC_FIELD_MAX_DOCUMENT_BYTES = 128 * 1024;
export type ScientificFieldTransfer = Readonly<
  { mode: "data" | "percentile" } | { mode: "manual"; min: number; max: number }
>;
export type ScientificFieldDisplay = Readonly<{
  view: "plane" | "volume";
  normalAxis: 0 | 1 | 2 | null;
  fixedIndex: number | null;
  transfer: ScientificFieldTransfer;
}>;
export type ScientificFieldSource = Readonly<{
  reference: Graph2DFieldReference;
  paired?: Readonly<{ imaginary: Graph2DFieldReference;
    line: Readonly<{ normalAxis: 0 | 1 | 2; planeFixedIndex: number;
      varyingAxis: 0 | 1 | 2; fixedIndex: number }> }>;
  quantity: Readonly<{ name: string; unit: string }>;
  display: ScientificFieldDisplay;
}>;
export type ScientificFieldDocument = Readonly<{
  format: typeof SCIENTIFIC_FIELD_DOCUMENT_FORMAT;
  schemaVersion: typeof SCIENTIFIC_FIELD_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  source: ScientificFieldSource;
  metadata: Readonly<{ title: string }>;
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, fields: readonly string[]) =>
  Object.keys(value).length === fields.length && fields.every(field => Object.prototype.hasOwnProperty.call(value, field));
const text = (value: unknown, max = 160): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value &&
  !/[\x00-\x1f\x7f]/.test(value);
const validTransfer = (value: unknown): value is ScientificFieldTransfer =>
  record(value) && (value.mode === "data" || value.mode === "percentile" ? exact(value, ["mode"]) :
    value.mode === "manual" && exact(value, ["mode", "min", "max"]) &&
    typeof value.min === "number" && typeof value.max === "number" &&
    Number.isFinite(value.min) && Number.isFinite(value.max) && value.min < value.max);
const validSource = (value: unknown): value is ScientificFieldSource => {
  if (!record(value) || !(exact(value, ["reference", "quantity", "display"]) ||
      exact(value, ["reference", "paired", "quantity", "display"])) ||
      !isGraph2DFieldReference(value.reference) || !record(value.quantity) ||
      !exact(value.quantity, ["name", "unit"]) || !text(value.quantity.name) || !text(value.quantity.unit, 80) ||
      !record(value.display) || !exact(value.display, ["view", "normalAxis", "fixedIndex", "transfer"]) ||
      !validTransfer(value.display.transfer)) return false;
  const { reference, display } = value as unknown as ScientificFieldSource;
  if (value.paired !== undefined) {
    const paired = value.paired;
    if (!record(paired) || !exact(paired, ["imaginary", "line"]) ||
        !isGraph2DFieldReference(paired.imaginary) || !record(paired.line) ||
        !exact(paired.line, ["normalAxis", "planeFixedIndex", "varyingAxis", "fixedIndex"])) return false;
    const imaginary = paired.imaginary as Graph2DFieldReference;
    const line = paired.line;
    const normal = line.normalAxis as number, varying = line.varyingAxis as number;
    const fixed = [0, 1, 2].find(axis => axis !== normal && axis !== varying);
    if (reference.semanticType !== "complex-scalar-field" || reference.component !== "real" ||
        reference.shape.length !== 3 || imaginary.semanticType !== "complex-scalar-field" ||
        imaginary.component !== "imaginary" ||
        reference.sceneFingerprint !== imaginary.sceneFingerprint ||
        reference.sceneId !== imaginary.sceneId || reference.datasetId !== imaginary.datasetId ||
        canonicalJsonStringify(reference.locator) !== canonicalJsonStringify(imaginary.locator) ||
        canonicalJsonStringify(reference.shape) !== canonicalJsonStringify(imaginary.shape) ||
        canonicalJsonStringify(reference.axes) !== canonicalJsonStringify(imaginary.axes) ||
        ![0, 1, 2].includes(normal) || ![0, 1, 2].includes(varying) ||
        normal === varying || fixed === undefined ||
        reference.shape[varying]! < 16 ||
        !Number.isSafeInteger(line.planeFixedIndex) || (line.planeFixedIndex as number) < 0 ||
        (line.planeFixedIndex as number) >= reference.shape[normal]! ||
        !Number.isSafeInteger(line.fixedIndex) || (line.fixedIndex as number) < 0 ||
        (line.fixedIndex as number) >= reference.shape[fixed]! ||
        display.view !== "plane" || display.normalAxis !== normal ||
        display.fixedIndex !== line.planeFixedIndex) return false;
  }
  return reference.shape.length === 2 ? display.view === "plane" && display.normalAxis === null &&
    display.fixedIndex === null :
    (display.view === "plane" || display.view === "volume") &&
    (display.normalAxis === 0 || display.normalAxis === 1 || display.normalAxis === 2) &&
    Number.isSafeInteger(display.fixedIndex) && display.fixedIndex! >= 0 &&
    display.fixedIndex! < reference.shape[display.normalAxis]!;
};

export function normalizeScientificFieldDocument(value: unknown): ValidationResult<ScientificFieldDocument> {
  if (!record(value) || value.format !== SCIENTIFIC_FIELD_DOCUMENT_FORMAT ||
      value.schemaVersion !== SCIENTIFIC_FIELD_DOCUMENT_SCHEMA_VERSION)
    return { ok: false, errors: ["Unsupported scientific field document format or version."] };
  if (!exact(value, ["format", "schemaVersion", "identity", "source", "metadata"]) ||
      !isDocumentIdentity(value.identity) || !value.identity.id.startsWith("math3d:scientific-field:") ||
      !validSource(value.source) || !record(value.metadata) ||
      !exact(value.metadata, ["title"]) || !text(value.metadata.title))
    return { ok: false, errors: ["Invalid scientific field document source, identity or metadata."] };
  try {
    const serialized = canonicalJsonStringify(value);
    if (new TextEncoder().encode(serialized).length > SCIENTIFIC_FIELD_MAX_DOCUMENT_BYTES)
      return { ok: false, errors: ["Scientific field document exceeds size limit."] };
    const document = JSON.parse(serialized) as ScientificFieldDocument;
    if (document.identity.structuralHash !== structuralHash(document.source))
      return { ok: false, errors: ["Scientific field structural hash does not match source."] };
    return { ok: true, value: document };
  } catch (error) { return { ok: false, errors: [(error as Error).message] }; }
}

export function createScientificFieldDocument(source: ScientificFieldSource,
  options: Readonly<{ stableKey: CanonicalJsonValue; title?: string; identity?: DocumentIdentity }>): ScientificFieldDocument {
  const checked = JSON.parse(canonicalJsonStringify(source)) as ScientificFieldSource;
  const candidate = { format: SCIENTIFIC_FIELD_DOCUMENT_FORMAT, schemaVersion: SCIENTIFIC_FIELD_DOCUMENT_SCHEMA_VERSION,
    identity: options.identity ?? createDocumentIdentity(createStableDocumentId("scientific-field", options.stableKey), checked),
    source: checked, metadata: { title: options.title ?? "Scientific field" } };
  const normalized = normalizeScientificFieldDocument(candidate);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
}

export function reviseScientificFieldDocument(document: ScientificFieldDocument,
  source: ScientificFieldSource): ScientificFieldDocument {
  const checked = normalizeScientificFieldDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const next = JSON.parse(canonicalJsonStringify(source)) as ScientificFieldSource;
  return createScientificFieldDocument(next, { stableKey: checked.value.identity.id,
    title: checked.value.metadata.title, identity: advanceDocumentIdentity(checked.value.identity, next) });
}

export function serializeScientificFieldDocument(document: ScientificFieldDocument): string {
  const checked = normalizeScientificFieldDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return canonicalJsonStringify(checked.value);
}

export function parseScientificFieldDocument(serialized: string): ScientificFieldDocument {
  if (new TextEncoder().encode(serialized).length > SCIENTIFIC_FIELD_MAX_DOCUMENT_BYTES)
    throw new TypeError("Scientific field document exceeds size limit.");
  const checked = normalizeScientificFieldDocument(JSON.parse(serialized));
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
}
