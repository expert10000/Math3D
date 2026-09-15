import type { CommandDefinition, DeepReadonly } from "./commands";
import type { CanonicalJsonValue } from "./documentIdentity";
import {
  normalizeGeometryDocument,
  replaceGeometryDocumentDisplay,
  replaceGeometryDocumentSource,
  type GeometryConstructionPresentation,
  type GeometryConstructionSource,
  type GeometryDocument,
  type GeometryDocumentDisplay,
  type GeometryDocumentSource,
  type GeometryObjectPresentation,
  type GeometryRelationshipSource,
  type GeometrySourceObject,
} from "./geometryDocument";
import type { ValidationResult } from "./validation";

export const GEOMETRY_COMMAND_TYPES = {
  replaceSource: "geometry.source.replace",
  replaceDisplay: "geometry.display.replace",
  clearScene: "geometry.scene.clear",
  upsertObject: "geometry.object.upsert",
  removeObject: "geometry.object.remove",
  setVisibility: "geometry.object.visibility-set",
  upsertConstruction: "geometry.construction.upsert",
  removeConstruction: "geometry.construction.remove",
  upsertRelationship: "geometry.relationship.upsert",
  removeRelationship: "geometry.relationship.remove",
  setParameters: "geometry.parameters.set",
  appendTopologyEdit: "geometry.topology-edit.append",
  replaceScratchGraph: "geometry.scratch.replace",
  commitSelection: "geometry.selection.commit",
} as const;

export type GeometryCommittedSelection = Readonly<{ entityIds: readonly string[] }>;
export type GeometryCommandState = Readonly<{
  document: GeometryDocument;
  committedSelection: GeometryCommittedSelection;
}>;

const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;
const isRecord = (value: unknown): value is Record<string, CanonicalJsonValue> => !!value && typeof value === "object" && !Array.isArray(value);
const idSafe = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value);
const exact = (value: Record<string, CanonicalJsonValue>, fields: readonly string[]) => {
  const actual = Object.keys(value).sort(); const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
};
const okObject = (value: CanonicalJsonValue, label: string): ValidationResult<CanonicalJsonValue> =>
  isRecord(value) ? { ok: true, value: clone(value) } : { ok: false, errors: [`${label} must be a canonical JSON object.`] };
const validateId = (value: CanonicalJsonValue, label: string): ValidationResult<CanonicalJsonValue> =>
  isRecord(value) && exact(value, [label]) && idSafe(value[label])
    ? { ok: true, value: { [label]: value[label] } }
    : { ok: false, errors: [`${label} must be the only field and must be ID-safe.`] };
const withSource = (document: GeometryDocument, source: GeometryDocumentSource): GeometryDocument => replaceGeometryDocumentSource(document, source);
const withDisplay = (document: GeometryDocument, display: GeometryDocumentDisplay): GeometryDocument => replaceGeometryDocumentDisplay(document, display);
const withSourceAndDisplay = (document: GeometryDocument, source: GeometryDocumentSource, display: GeometryDocumentDisplay): GeometryDocument =>
  withDisplay(withSource(document, source), display);
const definition = (type: string, validate: CommandDefinition<GeometryCommandState>["validate"], project: CommandDefinition<GeometryCommandState>["project"]): CommandDefinition<GeometryCommandState> => ({ type, validate, project });

export const geometryCommandDefinitions: readonly CommandDefinition<GeometryCommandState>[] = [
  definition(GEOMETRY_COMMAND_TYPES.replaceSource, (value) => okObject(value, "Geometry source"), (state, value) => ({ ...clone(state), document: withSource(state.document as GeometryDocument, value as unknown as GeometryDocumentSource) })),
  definition(GEOMETRY_COMMAND_TYPES.replaceDisplay, (value) => okObject(value, "Geometry display"), (state, value) => ({ ...clone(state), document: withDisplay(state.document as GeometryDocument, value as unknown as GeometryDocumentDisplay) })),
  definition(GEOMETRY_COMMAND_TYPES.clearScene, (value) => isRecord(value) && exact(value, []) ? { ok: true, value: {} } : { ok: false, errors: ["geometry.scene.clear takes no fields."] }, (state) => {
    const document = state.document as GeometryDocument;
    const source = { ...document.source, objects: [], constructions: [], relationships: [] };
    return { document: withSourceAndDisplay(document, source, { ...document.display, objects: {}, constructions: {} }), committedSelection: { entityIds: [] } };
  }),
  definition(GEOMETRY_COMMAND_TYPES.upsertObject, (value) => isRecord(value) && exact(value, ["object", "presentation"]) && isRecord(value.object) && idSafe(value.object.id) && isRecord(value.presentation)
    ? { ok: true, value: clone(value) } : { ok: false, errors: ["Object upsert requires object and presentation with a stable object ID."] }, (state, value) => {
      const record = value as Record<string, CanonicalJsonValue>; const object = record.object as unknown as GeometrySourceObject; const presentation = record.presentation as unknown as GeometryObjectPresentation;
      const document = state.document as GeometryDocument; const objects = [...document.source.objects.filter((entry) => entry.id !== object.id), clone(object)];
      return { ...clone(state), document: withSourceAndDisplay(document, { ...document.source, objects }, { ...document.display, objects: { ...document.display.objects, [object.id]: clone(presentation) } }) };
    }),
  definition(GEOMETRY_COMMAND_TYPES.removeObject, (value) => validateId(value, "objectId"), (state, value) => {
    const objectId = (value as Record<string, CanonicalJsonValue>).objectId as string; const document = state.document as GeometryDocument;
    const objects = document.source.objects.filter((entry) => entry.id !== objectId); const presentations = { ...document.display.objects }; delete presentations[objectId];
    return { document: withSourceAndDisplay(document, { ...document.source, objects }, { ...document.display, objects: presentations }), committedSelection: { entityIds: state.committedSelection.entityIds.filter((id) => id !== objectId) } };
  }),
  definition(GEOMETRY_COMMAND_TYPES.setVisibility, (value) => isRecord(value) && exact(value, ["objectId", "visible"]) && idSafe(value.objectId) && typeof value.visible === "boolean"
    ? { ok: true, value: clone(value) } : { ok: false, errors: ["Visibility requires objectId and visible."] }, (state, value) => {
      const { objectId, visible } = value as unknown as { objectId: string; visible: boolean }; const document = state.document as GeometryDocument;
      const current = document.display.objects[objectId]; if (!current) throw new TypeError(`Geometry object '${objectId}' does not exist.`);
      return { ...clone(state), document: withDisplay(document, { ...document.display, objects: { ...document.display.objects, [objectId]: { ...current, visible } } }) };
    }),
  definition(GEOMETRY_COMMAND_TYPES.upsertConstruction, (value) => isRecord(value) && exact(value, ["construction", "presentation"]) && isRecord(value.construction) && idSafe(value.construction.id) && isRecord(value.presentation)
    ? { ok: true, value: clone(value) } : { ok: false, errors: ["Construction upsert requires construction and presentation."] }, (state, value) => {
      const { construction, presentation } = value as unknown as { construction: GeometryConstructionSource; presentation: GeometryConstructionPresentation }; const document = state.document as GeometryDocument;
      const constructions = [...document.source.constructions.filter((entry) => entry.id !== construction.id), clone(construction)];
      return { ...clone(state), document: withSourceAndDisplay(document, { ...document.source, constructions }, { ...document.display, constructions: { ...document.display.constructions, [construction.id]: clone(presentation) } }) };
    }),
  definition(GEOMETRY_COMMAND_TYPES.removeConstruction, (value) => validateId(value, "constructionId"), (state, value) => {
    const id = (value as Record<string, CanonicalJsonValue>).constructionId as string; const document = state.document as GeometryDocument;
    const constructions = document.source.constructions.filter((entry) => entry.id !== id); const presentations = { ...document.display.constructions }; delete presentations[id];
    const relationships = document.source.relationships.filter((entry) => entry.sourceId !== id && entry.targetId !== id);
    return { document: withSourceAndDisplay(document, { ...document.source, constructions, relationships }, { ...document.display, constructions: presentations }), committedSelection: { entityIds: state.committedSelection.entityIds.filter((entry) => entry !== id) } };
  }),
  definition(GEOMETRY_COMMAND_TYPES.upsertRelationship, (value) => isRecord(value) && exact(value, ["relationship"]) && isRecord(value.relationship) && idSafe(value.relationship.id)
    ? { ok: true, value: clone(value) } : { ok: false, errors: ["Relationship upsert requires a relationship with a stable ID."] }, (state, value) => {
      const relationship = (value as Record<string, CanonicalJsonValue>).relationship as unknown as GeometryRelationshipSource; const document = state.document as GeometryDocument;
      const relationships = [...document.source.relationships.filter((entry) => entry.id !== relationship.id), clone(relationship)];
      return { ...clone(state), document: withSource(document, { ...document.source, relationships }) };
    }),
  definition(GEOMETRY_COMMAND_TYPES.removeRelationship, (value) => validateId(value, "relationshipId"), (state, value) => {
    const id = (value as Record<string, CanonicalJsonValue>).relationshipId as string; const document = state.document as GeometryDocument;
    return { ...clone(state), document: withSource(document, { ...document.source, relationships: document.source.relationships.filter((entry) => entry.id !== id) }) };
  }),
  definition(GEOMETRY_COMMAND_TYPES.setParameters, (value) => isRecord(value) && exact(value, ["parameters"]) && isRecord(value.parameters)
    ? { ok: true, value: clone(value) } : { ok: false, errors: ["Parameters command requires a parameters object."] }, (state, value) => {
      const document = state.document as GeometryDocument; return { ...clone(state), document: withSource(document, { ...document.source, parameters: clone((value as Record<string, CanonicalJsonValue>).parameters as Record<string, CanonicalJsonValue>) }) };
    }),
  definition(GEOMETRY_COMMAND_TYPES.appendTopologyEdit, (value) => isRecord(value) && exact(value, ["operationId", "definition"]) && idSafe(value.operationId)
    ? { ok: true, value: clone(value) } : { ok: false, errors: ["Topology edit requires operationId and definition."] }, (state, value) => {
      const document = state.document as GeometryDocument; const key = "math3d.geometry.topologyOperations.v1"; const current = document.source.extensions[key];
      const operations = Array.isArray(current) ? [...current] : []; operations.push(clone(value));
      return { ...clone(state), document: withSource(document, { ...document.source, extensions: { ...document.source.extensions, [key]: operations } }) };
    }),
  definition(GEOMETRY_COMMAND_TYPES.replaceScratchGraph, (value) => isRecord(value) && exact(value, ["graph"]) && isRecord(value.graph)
    ? { ok: true, value: clone(value) } : { ok: false, errors: ["Scratch replacement requires a canonical graph object."] }, (state, value) => {
      const document = state.document as GeometryDocument; const key = "math3d.geometry.scratch.v1";
      return { ...clone(state), document: withSource(document, { ...document.source, extensions: { ...document.source.extensions, [key]: clone((value as Record<string, CanonicalJsonValue>).graph) } }) };
    }),
  definition(GEOMETRY_COMMAND_TYPES.commitSelection, (value) => isRecord(value) && exact(value, ["entityIds"]) && Array.isArray(value.entityIds) && value.entityIds.every(idSafe) && new Set(value.entityIds).size === value.entityIds.length
    ? { ok: true, value: { entityIds: [...value.entityIds] } } : { ok: false, errors: ["Committed selection requires unique ID-safe entityIds."] }, (state, value) => ({ document: state.document as GeometryDocument, committedSelection: clone(value) as unknown as GeometryCommittedSelection })),
];

export const createGeometryCommandState = (document: GeometryDocument, committedSelection: GeometryCommittedSelection = { entityIds: [] }): GeometryCommandState => {
  const normalized = normalizeGeometryDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return { document: normalized.value, committedSelection: clone(committedSelection) };
};
