import { canonicalJsonStringify, createDocumentIdentity, createStableDocumentId, isDocumentIdentity,
  structuralHash, type DocumentIdentity } from "./documentIdentity";
import { createQuantumDerivationRecord, createQuantumSceneDocument, normalizeQuantumSceneDocument, type QuantumSceneDocumentSource,
  type QuantumDerivationRecord } from "./quantumSceneDocument";
import type { ValidationResult } from "./validation";

export const QUANTUM_FIELD_DOCUMENT_FORMAT = "math3d.quantum-field-document" as const;
export type QuantumFieldDocumentSource = Readonly<{
  scene: QuantumSceneDocumentSource;
  field: Readonly<{ id: string; label: string; kind: "scalar-field" | "complex-field";
    real: string; imaginary?: string;
    shape: readonly [number, number, number]; origin: readonly [number, number, number];
    spacing: readonly [number, number, number]; amplitudeUnit: string }>;
  mapping: Readonly<{ schema: "scientific-scene/v1"; coordinateSystemId: "field-grid";
    order: "last-axis-fastest"; axes: readonly [string, string, string];
    units: readonly [string, string, string] }>;
}>;
export type QuantumFieldDocument = Readonly<{
  format: typeof QUANTUM_FIELD_DOCUMENT_FORMAT; schemaVersion: 1;
  identity: DocumentIdentity; source: QuantumFieldDocumentSource;
  location: Readonly<{ directory: string }>;
  metadata: Readonly<{ title: string }>;
  derivations?: readonly QuantumDerivationRecord[];
  view: Readonly<{ normalAxis: 0 | 1 | 2; fixedIndex: number;
    quantity: "real" | "imaginary" | "density" | "phase" }>;
}>;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const text = (value: unknown, max = 256): value is string => typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value;
const tuple3 = (value: unknown, test: (item: unknown) => boolean): value is [unknown, unknown, unknown] =>
  Array.isArray(value) && value.length === 3 && value.every(test);

export function normalizeQuantumFieldDocument(value: unknown): ValidationResult<QuantumFieldDocument> {
  try {
    if (!record(value) || value.format !== QUANTUM_FIELD_DOCUMENT_FORMAT || value.schemaVersion !== 1 ||
        !["format", "schemaVersion", "identity", "source", "location", "metadata", "view"].every(key => key in value) ||
        Object.keys(value).some(key => !["format", "schemaVersion", "identity", "source", "location", "metadata", "derivations", "view"].includes(key)) ||
        !isDocumentIdentity(value.identity) || !value.identity.id.startsWith("math3d:quantum-field:") ||
        !record(value.source) || !exact(value.source, ["scene", "field", "mapping"]) ||
        !record(value.source.scene) || !record(value.source.field) || !record(value.source.mapping) ||
        !record(value.location) || !exact(value.location, ["directory"]) || !text(value.location.directory, 2048) ||
        !record(value.metadata) || !exact(value.metadata, ["title"]) || !text(value.metadata.title) ||
        !record(value.view) || !exact(value.view, ["normalAxis", "fixedIndex", "quantity"]))
      return { ok: false, errors: ["Invalid quantum field document envelope."] };
    const source = value.source as QuantumFieldDocumentSource;
    const field = source.field, map = source.mapping;
    createQuantumSceneDocument(source.scene, value.location.directory as string, value.metadata.title as string);
    if (!exact(field as Record<string, unknown>, field.kind === "complex-field" ?
      ["id", "label", "kind", "real", "imaginary", "shape", "origin", "spacing", "amplitudeUnit"] :
      ["id", "label", "kind", "real", "shape", "origin", "spacing", "amplitudeUnit"]) ||
        !exact(map as Record<string, unknown>, ["schema", "coordinateSystemId", "order", "axes", "units"]) ||
        !text(field.id) || !text(field.label) || !["scalar-field", "complex-field"].includes(field.kind) ||
        !text(field.real) || !text(field.amplitudeUnit) ||
        !tuple3(field.shape, item => Number.isSafeInteger(item) && Number(item) >= 2 && Number(item) <= 128) ||
        !tuple3(field.origin, item => typeof item === "number" && Number.isFinite(item)) ||
        !tuple3(field.spacing, item => typeof item === "number" && Number.isFinite(item) && item > 0) ||
        field.kind === "complex-field" && !text(field.imaginary) ||
        field.kind === "scalar-field" && field.imaginary !== undefined ||
        map.schema !== "scientific-scene/v1" || map.coordinateSystemId !== "field-grid" ||
        map.order !== "last-axis-fastest" || canonicalJsonStringify(map.axes) !== canonicalJsonStringify(source.scene.coordinates.axes) ||
        canonicalJsonStringify(map.units) !== canonicalJsonStringify(source.scene.coordinates.units))
      return { ok: false, errors: ["Invalid quantum field to SSR mapping."] };
    const count = field.shape[0] * field.shape[1] * field.shape[2];
    if ([field.real, ...(field.imaginary ? [field.imaginary] : [])].some(id => !source.scene.datasets.some(dataset =>
      dataset.id === id && dataset.components === 1 && dataset.count === count && dataset.unit === field.amplitudeUnit)))
      return { ok: false, errors: ["Quantum field source datasets changed."] };
    if (![0, 1, 2].includes(value.view.normalAxis as number) || !Number.isSafeInteger(value.view.fixedIndex) ||
        Number(value.view.fixedIndex) < 0 || Number(value.view.fixedIndex) >= field.shape[value.view.normalAxis as 0 | 1 | 2] ||
        !["real", "imaginary", "density", "phase"].includes(String(value.view.quantity)) ||
        field.kind === "scalar-field" && value.view.quantity !== "real")
      return { ok: false, errors: ["Invalid quantum field display state."] };
    if (value.identity.id !== createStableDocumentId("quantum-field", { sceneFingerprint: source.scene.sceneFingerprint, fieldId: field.id }) ||
        value.identity.structuralHash !== structuralHash(source))
      return { ok: false, errors: ["Quantum field source identity changed."] };
    if (value.derivations !== undefined) {
      const sceneDocument = createQuantumSceneDocument(source.scene, value.location.directory as string, value.metadata.title as string);
      const checked = normalizeQuantumSceneDocument({ ...sceneDocument, derivations: value.derivations });
      if (!checked.ok) return { ok: false, errors: checked.errors };
    }
    const normalized = canonicalJsonStringify(value);
    if (new TextEncoder().encode(normalized).length > 256 * 1024)
      return { ok: false, errors: ["Quantum field document exceeds size limit."] };
    return { ok: true, value: JSON.parse(normalized) as QuantumFieldDocument };
  } catch (error) { return { ok: false, errors: [String((error as Error).message)] }; }
}

export function createQuantumFieldDocument(source: QuantumFieldDocumentSource, directory: string,
  title: string): QuantumFieldDocument {
  const candidate = { format: QUANTUM_FIELD_DOCUMENT_FORMAT, schemaVersion: 1,
    identity: createDocumentIdentity(createStableDocumentId("quantum-field", {
      sceneFingerprint: source.scene.sceneFingerprint, fieldId: source.field.id }), source),
    source, location: { directory }, metadata: { title },
    ...(source.field.kind === "complex-field" ? { derivations: [createQuantumDerivationRecord(source.scene,
      `${source.field.id}:density`, [source.field.real, source.field.imaginary!],
      "complex-density", "1", { expression: "real^2+imaginary^2" })] } : {}),
    view: { normalAxis: 2, fixedIndex: Math.floor(source.field.shape[2] / 2),
      quantity: source.field.kind === "complex-field" ? "density" : "real" } };
  const checked = normalizeQuantumFieldDocument(candidate);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
}

export function relocateQuantumFieldDocument(document: QuantumFieldDocument, directory: string): QuantumFieldDocument {
  const checked = normalizeQuantumFieldDocument({ ...document, location: { directory } });
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
}

export function addQuantumFieldDerivation(document: QuantumFieldDocument, derivation: QuantumDerivationRecord): QuantumFieldDocument {
  const checked = normalizeQuantumFieldDocument({ ...document,
    derivations: [...(document.derivations ?? []).filter(item => item.id !== derivation.id), derivation]
      .sort((a, b) => a.id.localeCompare(b.id)) });
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
}

export function updateQuantumFieldView(document: QuantumFieldDocument, view: QuantumFieldDocument["view"]): QuantumFieldDocument {
  const checked = normalizeQuantumFieldDocument({ ...document, view });
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
}
