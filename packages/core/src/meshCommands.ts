import type { CommandDefinition } from "./commands";
import type { CanonicalJsonValue } from "./documentIdentity";
import {
  createMeshDocument,
  normalizeMeshDocument,
  replaceMeshDocumentSource,
  type MeshDocument,
  type MeshDocumentSource,
} from "./meshDocument";
import type { ValidationResult } from "./validation";

export const MESH_COMMAND_TYPES = {
  commitResource: "mesh.resource.commit",
  commitSelection: "mesh.selection.commit",
  rename: "mesh.metadata.rename",
  setVisibility: "mesh.display.visibility-set",
} as const;

export const MESH_EDIT_KINDS = [
  "import", "generate", "object-edit", "face-edit", "edge-edit", "vertex-edit",
  "split", "offset", "subdivide", "repair", "smooth", "remesh", "replace",
] as const;
export type MeshEditKind = (typeof MESH_EDIT_KINDS)[number];

export type MeshCommittedSelection = Readonly<{ entityIds: readonly string[] }>;
export type MeshCommandState = Readonly<{
  document: MeshDocument;
  committedSelection: MeshCommittedSelection;
}>;

const record = (value: unknown): value is Record<string, CanonicalJsonValue> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, CanonicalJsonValue>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const idSafe = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const success = (value: CanonicalJsonValue): ValidationResult<CanonicalJsonValue> => ({ ok: true, value: clone(value) });
const failure = (message: string): ValidationResult<CanonicalJsonValue> => ({ ok: false, errors: [message] });
const definition = (type: string, validate: CommandDefinition<MeshCommandState>["validate"], project: CommandDefinition<MeshCommandState>["project"]): CommandDefinition<MeshCommandState> => ({ type, validate, project });

export const meshCommandDefinitions: readonly CommandDefinition<MeshCommandState>[] = [
  definition(MESH_COMMAND_TYPES.commitResource, (value) =>
    record(value) && exact(value, ["source", "operation", "parameters"]) && record(value.source) &&
    (MESH_EDIT_KINDS as readonly unknown[]).includes(value.operation) && record(value.parameters)
      ? success(value) : failure("Mesh resource commit requires source, typed operation, and parameters."),
  (state, value) => {
    const payload = value as { source: MeshDocumentSource; operation: MeshEditKind; parameters: CanonicalJsonValue };
    if (payload.source.objectId !== state.document.source.objectId) throw new TypeError("Mesh edit cannot change the stable object ID.");
    return { ...state, document: replaceMeshDocumentSource(state.document as MeshDocument, payload.source) };
  }),
  definition(MESH_COMMAND_TYPES.commitSelection, (value) =>
    record(value) && exact(value, ["entityIds"]) && Array.isArray(value.entityIds) &&
    value.entityIds.every(idSafe) && new Set(value.entityIds).size === value.entityIds.length
      ? success(value) : failure("Mesh selection requires unique stable entity IDs."),
  (state, value) => ({ ...state, committedSelection: clone(value) as MeshCommittedSelection })),
  definition(MESH_COMMAND_TYPES.rename, (value) =>
    record(value) && exact(value, ["label"]) && typeof value.label === "string" && value.label.length <= 240
      ? success(value) : failure("Mesh rename requires a bounded label."),
  (state, value) => {
    const label = (value as { label: string }).label;
    const document = state.document as MeshDocument;
    return { ...state, document: createMeshDocument({ source: document.source, identity: document.identity, label, importedFrom: document.metadata.importedFrom, visible: document.display.visible }) };
  }),
  definition(MESH_COMMAND_TYPES.setVisibility, (value) =>
    record(value) && exact(value, ["visible"]) && typeof value.visible === "boolean"
      ? success(value) : failure("Mesh visibility command requires a boolean."),
  (state, value) => {
    const document = state.document as MeshDocument;
    return { ...state, document: createMeshDocument({ source: document.source, identity: document.identity, label: document.metadata.label, importedFrom: document.metadata.importedFrom, visible: (value as { visible: boolean }).visible }) };
  }),
];

export const createMeshCommandState = (document: MeshDocument, committedSelection: MeshCommittedSelection = { entityIds: [] }): MeshCommandState => {
  const normalized = normalizeMeshDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  if (!committedSelection.entityIds.every(idSafe) || new Set(committedSelection.entityIds).size !== committedSelection.entityIds.length) {
    throw new TypeError("Mesh committed selection is invalid.");
  }
  return { document: normalized.value, committedSelection: clone(committedSelection) };
};
