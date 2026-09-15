import type { CommandDefinition, DeepReadonly } from "./commands";
import type { CanonicalJsonValue } from "./documentIdentity";
import {
  normalizeGeometryDocument,
  replaceGeometryDocumentDisplay,
  replaceGeometryDocumentSource,
  type GeometryDocument,
  type GeometryDocumentDisplay,
  type GeometryDocumentSource,
} from "./geometryDocument";
import type { ValidationResult } from "./validation";

export const GEOMETRY_COMMAND_TYPES = {
  replaceSource: "geometry.source.replace",
  replaceDisplay: "geometry.display.replace",
} as const;

export type GeometryCommandState = Readonly<{ document: GeometryDocument }>;

const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;

const validateCanonicalObject = (value: CanonicalJsonValue, label: string): ValidationResult<CanonicalJsonValue> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? { ok: true, value: clone(value) }
    : { ok: false, errors: [`${label} must be a canonical JSON object.`] };

const projectSource = (
  state: DeepReadonly<GeometryCommandState>,
  payload: CanonicalJsonValue
): GeometryCommandState => ({
  document: replaceGeometryDocumentSource(state.document as GeometryDocument, payload as unknown as GeometryDocumentSource),
});

const projectDisplay = (
  state: DeepReadonly<GeometryCommandState>,
  payload: CanonicalJsonValue
): GeometryCommandState => ({
  document: replaceGeometryDocumentDisplay(state.document as GeometryDocument, payload as unknown as GeometryDocumentDisplay),
});

export const geometryCommandDefinitions: readonly CommandDefinition<GeometryCommandState>[] = [
  { type: GEOMETRY_COMMAND_TYPES.replaceSource, validate: (value) => validateCanonicalObject(value, "Geometry source"), project: projectSource },
  { type: GEOMETRY_COMMAND_TYPES.replaceDisplay, validate: (value) => validateCanonicalObject(value, "Geometry display"), project: projectDisplay },
];

export const createGeometryCommandState = (document: GeometryDocument): GeometryCommandState => {
  const normalized = normalizeGeometryDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return { document: normalized.value };
};
