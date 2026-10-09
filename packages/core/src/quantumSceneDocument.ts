import { canonicalJsonStringify, createDocumentIdentity, createStableDocumentId, isDocumentIdentity, structuralHash,
  type DocumentIdentity } from "./documentIdentity";
import { canonicalJsonByteLength } from "./scientificJobs";
import type { ValidationResult } from "./validation";

export const QUANTUM_SCENE_DOCUMENT_FORMAT = "math3d.quantum-scene-document" as const;
export const QUANTUM_SCENE_DOCUMENT_SCHEMA_VERSION = 1 as const;
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown, limit = 160): value is string => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= limit;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");

export type QuantumSceneDocumentSource = Readonly<{
  sceneSchema: "quantum-scene/v1";
  sceneId: string;
  sceneFingerprint: string;
  provenance: Readonly<{ runId: string; model: string; resultSha256: string; engine: string; engineVersion: string; adapter: string }>;
  coordinates: Readonly<{ axes: readonly [string, string, string]; units: readonly [string, string, string]; handedness: "right" | "left" }>;
  datasets: readonly Readonly<{ id: string; sha256: string; count: number; components: number; unit: string; bytes: number }>[];
  objects: readonly Readonly<{ id: string; kind: string; label: string }>[];
}>;
export type QuantumSceneDocument = Readonly<{
  format: typeof QUANTUM_SCENE_DOCUMENT_FORMAT;
  schemaVersion: typeof QUANTUM_SCENE_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  source: QuantumSceneDocumentSource;
  location: Readonly<{ directory: string }>;
  metadata: Readonly<{ title: string }>;
}>;

const validSource = (value: unknown): value is QuantumSceneDocumentSource => {
  if (!record(value) || !exact(value, ["sceneSchema", "sceneId", "sceneFingerprint", "provenance", "coordinates", "datasets", "objects"]) ||
    value.sceneSchema !== "quantum-scene/v1" ||
    !text(value.sceneId, 256) || !sha(value.sceneFingerprint) || !record(value.provenance) ||
    !exact(value.provenance, ["runId", "model", "resultSha256", "engine", "engineVersion", "adapter"]) ||
    !text(value.provenance.runId, 256) || !text(value.provenance.model, 128) || !sha(value.provenance.resultSha256) ||
    !text(value.provenance.engine, 128) || !text(value.provenance.engineVersion, 128) || !text(value.provenance.adapter, 128) || !record(value.coordinates) ||
    !exact(value.coordinates, ["axes", "units", "handedness"]) ||
    !["right", "left"].includes(String(value.coordinates.handedness))) return false;
  for (const key of ["axes", "units"] as const) {
    const values = value.coordinates[key];
    if (!Array.isArray(values) || values.length !== 3 || !values.every((item) => text(item, 80))) return false;
  }
  if (!Array.isArray(value.datasets) || value.datasets.length > 128 || !value.datasets.every((item: unknown) =>
    record(item) && exact(item, ["id", "sha256", "count", "components", "unit", "bytes"]) && text(item.id, 128) &&
    sha(item.sha256) && Number.isSafeInteger(item.count) && Number(item.count) >= 0 &&
    Number.isSafeInteger(item.components) && Number(item.components) >= 1 && Number(item.components) <= 16 &&
    text(item.unit, 80) && Number.isSafeInteger(item.bytes) && Number(item.bytes) >= 0)) return false;
  if (new Set(value.datasets.map((item: { id: string }) => item.id)).size !== value.datasets.length) return false;
  if (!Array.isArray(value.objects) || value.objects.length > 512 || !value.objects.every((item: unknown) =>
    record(item) && exact(item, ["id", "kind", "label"]) && text(item.id, 128) && text(item.kind, 80) && text(item.label, 160))) return false;
  return new Set(value.objects.map((item: { id: string }) => item.id)).size === value.objects.length;
};

export const normalizeQuantumSceneDocument = (value: unknown): ValidationResult<QuantumSceneDocument> => {
  try {
    if (canonicalJsonByteLength(value) > 256 * 1024 || !record(value) ||
      !exact(value, ["format", "schemaVersion", "identity", "source", "location", "metadata"]) ||
      value.format !== QUANTUM_SCENE_DOCUMENT_FORMAT || value.schemaVersion !== QUANTUM_SCENE_DOCUMENT_SCHEMA_VERSION ||
      !isDocumentIdentity(value.identity) || !value.identity.id.startsWith("math3d:quantum-scene:") ||
      !validSource(value.source) || !record(value.location) || !exact(value.location, ["directory"]) ||
      !text(value.location.directory, 2048) || /[\x00-\x1f]/.test(value.location.directory) ||
      !record(value.metadata) || !exact(value.metadata, ["title"]) || !text(value.metadata.title))
      return { ok: false, errors: ["Invalid quantum-scene document."] };
    if (value.identity.id !== createStableDocumentId("quantum-scene", { sceneFingerprint: value.source.sceneFingerprint }) ||
      value.identity.structuralHash !== structuralHash(value.source))
      return { ok: false, errors: ["Quantum-scene source identity hash changed."] };
    return { ok: true, value: JSON.parse(canonicalJsonStringify(value)) as QuantumSceneDocument };
  } catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
};

export const createQuantumSceneDocument = (source: QuantumSceneDocumentSource, directory: string, title: string): QuantumSceneDocument => {
  const candidate = { format: QUANTUM_SCENE_DOCUMENT_FORMAT, schemaVersion: QUANTUM_SCENE_DOCUMENT_SCHEMA_VERSION,
    identity: createDocumentIdentity(createStableDocumentId("quantum-scene", { sceneFingerprint: source.sceneFingerprint }), source),
    source, location: { directory }, metadata: { title } };
  const checked = normalizeQuantumSceneDocument(candidate);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
};

export const relocateQuantumSceneDocument = (document: QuantumSceneDocument, directory: string): QuantumSceneDocument => {
  const checked = normalizeQuantumSceneDocument({ ...document, location: { directory } });
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
};
