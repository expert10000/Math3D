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
  sceneSchema: "quantum-scene/v1" | "quantum-scene/v2";
  sceneId: string;
  sceneFingerprint: string;
  provenance: Readonly<{ runId: string; model: string; resultSha256: string; engine: string; engineVersion: string; adapter: "qvis/1" }>;
  coordinates: Readonly<{ axes: readonly [string, string, string]; units: readonly [string, string, string]; handedness: "right" }>;
  datasets: readonly Readonly<{ id: string; sha256: string; count: number; components: number; unit: string; bytes: number }>[];
  objects: readonly Readonly<{ id: string; kind: string; label: string }>[];
}>;
export type QuantumSceneLinkedView = Readonly<{
  relation: "same-result"; sceneFingerprint: string; role: "curvature" | "bands" | "other";
}>;
export type QuantumSceneViewState = Readonly<{
  selectedObjectId?: string; sampleIndex?: number;
  camera?: Readonly<{ position: readonly [number, number, number]; target: readonly [number, number, number]; up: readonly [number, number, number] }>;
  opacity?: number;
}>;
export type QuantumDerivationRecord = Readonly<{
  id: string;
  sourceDatasets: readonly Readonly<{ id: string; sha256: string }>[];
  algorithm: string;
  version: string;
  algorithmVersionHash: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  recipeHash: string;
}>;
export const createQuantumDerivationRecord = (source: QuantumSceneDocumentSource, id: string,
  datasetIds: readonly string[], algorithm: string, version: string,
  parameters: QuantumDerivationRecord["parameters"]): QuantumDerivationRecord => {
  const sourceDatasets = [...new Set(datasetIds)].sort().map(datasetId => {
    const dataset = source.datasets.find(item => item.id === datasetId);
    if (!dataset) throw new TypeError(`Unknown quantum source dataset: ${datasetId}`);
    return { id: dataset.id, sha256: dataset.sha256 };
  });
  if (!sourceDatasets.length) throw new TypeError("A quantum derivation needs source datasets.");
  const algorithmVersionHash = structuralHash({ algorithm, version });
  return { id, sourceDatasets, algorithm, version, algorithmVersionHash, parameters,
    recipeHash: structuralHash({ sourceDatasets, algorithmVersionHash, parameters }) };
};
export type QuantumSceneDocument = Readonly<{
  format: typeof QUANTUM_SCENE_DOCUMENT_FORMAT;
  schemaVersion: typeof QUANTUM_SCENE_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  source: QuantumSceneDocumentSource;
  location: Readonly<{ directory: string }>;
  metadata: Readonly<{ title: string }>;
  linkedViews?: readonly QuantumSceneLinkedView[];
  derivations?: readonly QuantumDerivationRecord[];
  view?: QuantumSceneViewState;
}>;

export const quantumSceneRole = (source: QuantumSceneDocumentSource): QuantumSceneLinkedView["role"] =>
  source.objects.some(object => object.id === "berry-curvature") ? "curvature" :
    source.objects.some(object => object.id === "band-0") ? "bands" : "other";

const validSource = (value: unknown): value is QuantumSceneDocumentSource => {
  if (!record(value) || !exact(value, ["sceneSchema", "sceneId", "sceneFingerprint", "provenance", "coordinates", "datasets", "objects"]) ||
    !["quantum-scene/v1", "quantum-scene/v2"].includes(String(value.sceneSchema)) ||
    !text(value.sceneId, 256) || !sha(value.sceneFingerprint) || !record(value.provenance) ||
    !exact(value.provenance, ["runId", "model", "resultSha256", "engine", "engineVersion", "adapter"]) ||
    !text(value.provenance.runId, 256) || !text(value.provenance.model, 128) || !sha(value.provenance.resultSha256) ||
    !text(value.provenance.engine, 128) || !text(value.provenance.engineVersion, 128) || value.provenance.adapter !== "qvis/1" || !record(value.coordinates) ||
    !exact(value.coordinates, ["axes", "units", "handedness"]) ||
    value.coordinates.handedness !== "right") return false;
  for (const key of ["axes", "units"] as const) {
    const values = value.coordinates[key];
    if (!Array.isArray(values) || values.length !== 3 || !values.every((item) => text(item, 80))) return false;
  }
  if (!Array.isArray(value.datasets) || value.datasets.length < 1 || value.datasets.length > 64 || !value.datasets.every((item: unknown) =>
    record(item) && exact(item, ["id", "sha256", "count", "components", "unit", "bytes"]) && text(item.id, 128) &&
    sha(item.sha256) && Number.isSafeInteger(item.count) && Number(item.count) >= 1 && Number(item.count) <= 300000 &&
    [1, 3].includes(Number(item.components)) &&
    text(item.unit, 80) && Number.isSafeInteger(item.bytes) && Number(item.bytes) === Number(item.count) * Number(item.components) * 8 && Number(item.bytes) <= 16777216)) return false;
  if (new Set(value.datasets.map((item: { id: string }) => item.id)).size !== value.datasets.length) return false;
  if (!Array.isArray(value.objects) || value.objects.length > 64 || !value.objects.every((item: unknown) =>
    record(item) && exact(item, ["id", "kind", "label"]) && text(item.id, 128) &&
    ["point-cloud", "polyline", "segments", "vectors", "mesh"].includes(String(item.kind)) && text(item.label, 160))) return false;
  return new Set(value.objects.map((item: { id: string }) => item.id)).size === value.objects.length;
};

export const normalizeQuantumSceneDocument = (value: unknown): ValidationResult<QuantumSceneDocument> => {
  try {
    if (canonicalJsonByteLength(value) > 256 * 1024 || !record(value) ||
      !["format", "schemaVersion", "identity", "source", "location", "metadata"].every(key => key in value) ||
      Object.keys(value).some(key => !["format", "schemaVersion", "identity", "source", "location", "metadata", "linkedViews", "derivations", "view"].includes(key)) ||
      value.format !== QUANTUM_SCENE_DOCUMENT_FORMAT || value.schemaVersion !== QUANTUM_SCENE_DOCUMENT_SCHEMA_VERSION ||
      !isDocumentIdentity(value.identity) || !value.identity.id.startsWith("math3d:quantum-scene:") ||
      !validSource(value.source) || !record(value.location) || !exact(value.location, ["directory"]) ||
      !text(value.location.directory, 2048) || /[\x00-\x1f]/.test(value.location.directory) ||
      !record(value.metadata) || !exact(value.metadata, ["title"]) || !text(value.metadata.title))
      return { ok: false, errors: ["Invalid quantum-scene document."] };
    if (value.linkedViews !== undefined && (!Array.isArray(value.linkedViews) || value.linkedViews.length < 1 || value.linkedViews.length > 15 ||
      value.linkedViews.some((link: unknown) => !record(link) || !exact(link, ["relation", "sceneFingerprint", "role"]) ||
        link.relation !== "same-result" || !sha(link.sceneFingerprint) || link.sceneFingerprint === (value.source as QuantumSceneDocumentSource).sceneFingerprint ||
        !["curvature", "bands", "other"].includes(String(link.role))) ||
      new Set(value.linkedViews.map((link: QuantumSceneLinkedView) => link.sceneFingerprint)).size !== value.linkedViews.length ||
      value.linkedViews.some((link: QuantumSceneLinkedView, index: number) => index > 0 &&
        (value.linkedViews as QuantumSceneLinkedView[])[index - 1].sceneFingerprint >= link.sceneFingerprint)))
      return { ok: false, errors: ["Invalid quantum-scene linked views."] };
    if (value.derivations !== undefined && (!Array.isArray(value.derivations) || value.derivations.length > 32 ||
      new Set(value.derivations.map((item: QuantumDerivationRecord) => item.id)).size !== value.derivations.length ||
      value.derivations.some((item: unknown) => {
        if (!record(item) || !exact(item, ["id", "sourceDatasets", "algorithm", "version", "algorithmVersionHash", "parameters", "recipeHash"]) ||
          !text(item.id, 128) || !text(item.algorithm, 128) || !text(item.version, 64) ||
          !Array.isArray(item.sourceDatasets) || !item.sourceDatasets.length || item.sourceDatasets.length > 8 ||
          !record(item.parameters) || Object.keys(item.parameters).length > 16 ||
          Object.values(item.parameters).some(parameter => typeof parameter !== "string" && typeof parameter !== "number" && typeof parameter !== "boolean" ||
            typeof parameter === "number" && !Number.isFinite(parameter))) return true;
        const inputs = item.sourceDatasets as { id: string; sha256: string }[];
        if (inputs.some(input => !record(input) || !exact(input, ["id", "sha256"]) ||
          !(value.source as QuantumSceneDocumentSource).datasets.some(dataset => dataset.id === input.id && dataset.sha256 === input.sha256)) ||
          inputs.some((input, index) => index > 0 && inputs[index - 1].id >= input.id)) return true;
        const versionHash = structuralHash({ algorithm: item.algorithm, version: item.version });
        return item.algorithmVersionHash !== versionHash ||
          item.recipeHash !== structuralHash({ sourceDatasets: inputs, algorithmVersionHash: versionHash, parameters: item.parameters });
      }))) return { ok: false, errors: ["Invalid quantum derivation record."] };
    if (value.view !== undefined && (!record(value.view) || Object.keys(value.view).some(key => !["selectedObjectId", "sampleIndex", "camera", "opacity"].includes(key)) ||
      (value.view.selectedObjectId !== undefined && (!text(value.view.selectedObjectId, 128) ||
        !(value.source as QuantumSceneDocumentSource).objects.some(object => object.id === (value.view as Record<string, unknown>).selectedObjectId))) ||
      (value.view.sampleIndex !== undefined && (!Number.isSafeInteger(value.view.sampleIndex) ||
        Number(value.view.sampleIndex) < 0 || Number(value.view.sampleIndex) > 300000)) ||
      (value.view.opacity !== undefined && (typeof value.view.opacity !== "number" || !Number.isFinite(value.view.opacity) || value.view.opacity < 0 || value.view.opacity > 1)) ||
      (value.view.camera !== undefined && (!record(value.view.camera) || !exact(value.view.camera, ["position", "target", "up"]) ||
        ["position", "target", "up"].some(key => !Array.isArray(((value.view as Record<string, unknown>).camera as Record<string, unknown>)[key]) ||
          (((value.view as Record<string, unknown>).camera as Record<string, unknown>)[key] as unknown[]).length !== 3 ||
          !(((value.view as Record<string, unknown>).camera as Record<string, unknown>)[key] as unknown[]).every(entry => typeof entry === "number" && Number.isFinite(entry)))))))
      return { ok: false, errors: ["Invalid quantum-scene view state."] };
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

export const updateQuantumSceneView = (document: QuantumSceneDocument, view: QuantumSceneViewState): QuantumSceneDocument => {
  const checked = normalizeQuantumSceneDocument({ ...document, view });
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
};

export const addQuantumSceneDerivation = (document: QuantumSceneDocument, derivation: QuantumDerivationRecord): QuantumSceneDocument => {
  const derivations = [...(document.derivations ?? []).filter(item => item.id !== derivation.id), derivation]
    .sort((a, b) => a.id.localeCompare(b.id));
  const checked = normalizeQuantumSceneDocument({ ...document, derivations });
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
};

/** Link only scenes with the same exact result identity; preserve each view and v1 document reader. */
export const linkQuantumSceneDocuments = (documents: readonly QuantumSceneDocument[]): QuantumSceneDocument[] =>
  documents.map(document => {
    const siblings = documents.filter(other => other.source.sceneFingerprint !== document.source.sceneFingerprint &&
      other.source.provenance.runId === document.source.provenance.runId &&
      other.source.provenance.resultSha256 === document.source.provenance.resultSha256 &&
      other.source.provenance.model === document.source.provenance.model);
    if (!siblings.length) {
      if (!document.linkedViews?.length) return document;
      const { linkedViews: _removed, ...unlinked } = document;
      const checked = normalizeQuantumSceneDocument(unlinked);
      if (!checked.ok) throw new TypeError(checked.errors.join(" "));
      return checked.value;
    }
    const linkedViews = siblings.map(other => ({ relation: "same-result" as const,
      sceneFingerprint: other.source.sceneFingerprint, role: quantumSceneRole(other.source) }))
      .sort((a, b) => a.sceneFingerprint.localeCompare(b.sceneFingerprint));
    const checked = normalizeQuantumSceneDocument({ ...document, linkedViews });
    if (!checked.ok) throw new TypeError(checked.errors.join(" "));
    return checked.value;
  });
