import { canonicalJsonStringify, isStableDocumentId, isStructuralHash,
  type StableDocumentId, type StructuralHash } from "./documentIdentity";
import type { ValidationResult } from "./validation";

export const SCIENTIFIC_SELECTION_FORMAT = "math3d.scientific-selection" as const;
export const SCIENTIFIC_SELECTION_SCHEMA_VERSION = 1 as const;
export const SCIENTIFIC_SELECTION_MAX_BYTES = 4096;

/** A legacy slot is an address in a saved document, not a newly minted selection ID. */
export type ScientificLegacySelectionSlot = Readonly<{ kind: "legacy-slot";
  ownerDocumentId: StableDocumentId; path: string; objectId?: string }>;
export type ScientificSelectionIdentity =
  | Readonly<{ kind: "authored"; id: StableDocumentId;
      migratedFrom?: ScientificLegacySelectionSlot }>
  | ScientificLegacySelectionSlot;
export type ScientificSelectionSource =
  | Readonly<{ kind: "document"; documentId: StableDocumentId;
      /** Null means the selection itself did not save a source-generation pin. */
      checkpoint: Readonly<{ revision: number; structuralHash: StructuralHash }> | null }>
  | Readonly<{ kind: "dataset"; sceneId: string; datasetId: string;
      sceneFingerprint: string; resourceSha256: string }>;
export type ScientificSelectionFrame = Readonly<{ kind: "cartesian";
  axes: readonly Readonly<{ name: string | null; unit: string | null }>[] }>;
export type ScientificSelectionGeometry =
  | Readonly<{ kind: "point"; position: readonly number[] }>
  | Readonly<{ kind: "axis-line"; varyingAxis: number;
      fixedCoordinates: readonly (number | null)[];
      extent: readonly [number, number] }>
  | Readonly<{ kind: "orthogonal-plane"; normalAxis: 0 | 1 | 2;
      coordinate: number; bounds: readonly [readonly [number, number], readonly [number, number]] }>
  | Readonly<{ kind: "plane-region"; normalAxis: 0 | 1 | 2;
      coordinate: number; bounds: readonly [readonly [number, number], readonly [number, number]];
      /** Present only when a Graph profile saved a row/column sampling axis. */
      sampleAxis?: 0 | 1 | 2 }>;
export type ScientificSelection = Readonly<{
  format: typeof SCIENTIFIC_SELECTION_FORMAT;
  schemaVersion: typeof SCIENTIFIC_SELECTION_SCHEMA_VERSION;
  identity: ScientificSelectionIdentity;
  role: "probe" | "view" | "analysis";
  source: ScientificSelectionSource | null;
  frame: ScientificSelectionFrame;
  geometry: ScientificSelectionGeometry;
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) =>
  required.every(key => Object.prototype.hasOwnProperty.call(value, key)) &&
  Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const label = (value: unknown, max = 160): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max &&
  value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const axis = (value: unknown, count: number): value is number =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) < count;
const bounds = (value: unknown): value is readonly [readonly [number, number], readonly [number, number]] =>
  Array.isArray(value) && value.length === 2 && value.every(pair =>
    Array.isArray(pair) && pair.length === 2 && finite(pair[0]) && finite(pair[1]) && pair[0] < pair[1]);
const legacySlot = (value: unknown): value is ScientificLegacySelectionSlot =>
  record(value) && value.kind === "legacy-slot" &&
  exact(value, ["kind", "ownerDocumentId", "path"], ["objectId"]) &&
  isStableDocumentId(value.ownerDocumentId) && label(value.path, 512) &&
  (value.objectId === undefined || label(value.objectId, 80));

export const normalizeScientificSelection = (value: unknown): ValidationResult<ScientificSelection> => {
  if (!record(value) || !exact(value, ["format", "schemaVersion", "identity", "role", "source", "frame", "geometry"]) ||
      value.format !== SCIENTIFIC_SELECTION_FORMAT || value.schemaVersion !== SCIENTIFIC_SELECTION_SCHEMA_VERSION ||
      !["probe", "view", "analysis"].includes(String(value.role)))
    return { ok: false, errors: ["Invalid scientific selection envelope."] };
  const identity = value.identity;
  if (!record(identity) || !(identity.kind === "authored" &&
      exact(identity, ["kind", "id"], ["migratedFrom"]) &&
      isStableDocumentId(identity.id) && identity.id.startsWith("math3d:scientific-selection:") &&
      (identity.migratedFrom === undefined || legacySlot(identity.migratedFrom)) ||
      legacySlot(identity)))
    return { ok: false, errors: ["Invalid scientific selection identity."] };
  const source = value.source;
  if (source !== null && (!record(source) || !(source.kind === "document" &&
        exact(source, ["kind", "documentId", "checkpoint"]) && isStableDocumentId(source.documentId) &&
        (source.checkpoint === null || record(source.checkpoint) &&
          exact(source.checkpoint, ["revision", "structuralHash"]) &&
          Number.isSafeInteger(source.checkpoint.revision) && Number(source.checkpoint.revision) >= 1 &&
          isStructuralHash(source.checkpoint.structuralHash)) ||
      source.kind === "dataset" && exact(source,
        ["kind", "sceneId", "datasetId", "sceneFingerprint", "resourceSha256"]) &&
        label(source.sceneId, 64) && label(source.datasetId, 64) &&
        hash(source.sceneFingerprint) && hash(source.resourceSha256))))
    return { ok: false, errors: ["Invalid scientific selection source."] };
  const frame = value.frame;
  if (!record(frame) || !exact(frame, ["kind", "axes"]) || frame.kind !== "cartesian" ||
      !Array.isArray(frame.axes) || ![2, 3].includes(frame.axes.length) ||
      frame.axes.some(item => !record(item) || !exact(item, ["name", "unit"]) ||
        item.name !== null && !label(item.name) || item.unit !== null && !label(item.unit, 80)))
    return { ok: false, errors: ["Invalid scientific selection coordinate frame."] };
  const count = frame.axes.length, geometry = value.geometry;
  if (!record(geometry) || !(geometry.kind === "point" && exact(geometry, ["kind", "position"]) &&
        Array.isArray(geometry.position) && geometry.position.length === count && geometry.position.every(finite) ||
      geometry.kind === "axis-line" && exact(geometry, ["kind", "varyingAxis", "fixedCoordinates", "extent"]) &&
        axis(geometry.varyingAxis, count) && Array.isArray(geometry.fixedCoordinates) &&
        geometry.fixedCoordinates.length === count &&
        geometry.fixedCoordinates.every((coordinate, index) => index === geometry.varyingAxis ?
          coordinate === null : finite(coordinate)) &&
        Array.isArray(geometry.extent) && geometry.extent.length === 2 &&
        finite(geometry.extent[0]) && finite(geometry.extent[1]) && geometry.extent[0] < geometry.extent[1] ||
      (geometry.kind === "orthogonal-plane" || geometry.kind === "plane-region") && count === 3 &&
        exact(geometry, ["kind", "normalAxis", "coordinate", "bounds"],
          geometry.kind === "plane-region" ? ["sampleAxis"] : []) &&
        axis(geometry.normalAxis, 3) && finite(geometry.coordinate) && bounds(geometry.bounds) &&
        (geometry.kind !== "plane-region" || geometry.sampleAxis === undefined ||
          axis(geometry.sampleAxis, 3) && geometry.sampleAxis !== geometry.normalAxis)))
    return { ok: false, errors: ["Invalid scientific selection geometry."] };
  try {
    const serialized = canonicalJsonStringify(value);
    if (new TextEncoder().encode(serialized).length > SCIENTIFIC_SELECTION_MAX_BYTES)
      return { ok: false, errors: ["Scientific selection exceeds size limit."] };
    return { ok: true, value: JSON.parse(serialized) as ScientificSelection };
  } catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
};

export const serializeScientificSelection = (selection: ScientificSelection): string => {
  const checked = normalizeScientificSelection(selection);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return canonicalJsonStringify(checked.value);
};
export const parseScientificSelection = (raw: string): ScientificSelection => {
  if (new TextEncoder().encode(raw).length > SCIENTIFIC_SELECTION_MAX_BYTES)
    throw new TypeError("Scientific selection exceeds size limit.");
  const checked = normalizeScientificSelection(JSON.parse(raw));
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
};
