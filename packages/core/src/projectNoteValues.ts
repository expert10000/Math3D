import { isStructuralHash, type StructuralHash } from "./documentIdentity";
import { isScientificSourceGeneration, matchesScientificSourceGeneration, type ScientificSourceGeneration } from "./scientificJobs";

export const PROJECT_NOTE_RESULT_VALUE_FIELDS = ["length", "gaussian.avg", "mean.avg", "counts.validVertexCount", "vertexCount", "faceCount", "topology.boundaryEdgeCount"] as const;
export type ProjectNoteValueBinding = Readonly<{ id: string; source: ScientificSourceGeneration } & (
  | { kind: "parameter"; parameterId: string }
  | { kind: "selection"; objectId: string; field: "position.x" | "position.y" | "position.z" }
  | { kind: "result"; resultId: string; resultHash: StructuralHash; field: typeof PROJECT_NOTE_RESULT_VALUE_FIELDS[number] }
)>;
export type ProjectNoteResolvedValue = Readonly<{ id: string; value: number | null; units: string; status: "current" | "stale" | "unavailable"; source: ScientificSourceGeneration | null }>;
export type ProjectNoteValueSnapshot = Readonly<{ capturedAt: number; values: readonly ProjectNoteResolvedValue[] }>;
export type ProjectNoteValueTarget = { [Kind in ProjectNoteValueBinding["kind"]]: Omit<Extract<ProjectNoteValueBinding, { kind: Kind }>, "id"> }[ProjectNoteValueBinding["kind"]];

const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value && !["__proto__", "constructor", "prototype"].includes(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const normalizeProjectNoteValueBindings = (value: unknown): readonly ProjectNoteValueBinding[] => {
  if (!Array.isArray(value) || value.length > 16) throw new TypeError("Notes support up to 16 value bindings.");
  const ids = new Set<string>();
  for (const binding of value) {
    if (!record(binding) || typeof binding.id !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(binding.id) || ids.has(binding.id) || !isScientificSourceGeneration(binding.source)) throw new TypeError("Invalid Note value identity or source.");
    ids.add(binding.id);
    const keys = binding.kind === "parameter" ? ["id", "source", "kind", "parameterId"] : binding.kind === "selection" ? ["id", "source", "kind", "objectId", "field"] : ["id", "source", "kind", "resultId", "resultHash", "field"];
    if (Object.keys(binding).sort().join("|") !== keys.sort().join("|")) throw new TypeError("Invalid Note value binding fields.");
    if (binding.kind === "parameter" ? !identifier(binding.parameterId) : binding.kind === "selection" ? !identifier(binding.objectId) || !["position.x", "position.y", "position.z"].includes(String(binding.field)) :
      binding.kind !== "result" || !identifier(binding.resultId) || !isStructuralHash(binding.resultHash) || !PROJECT_NOTE_RESULT_VALUE_FIELDS.includes(binding.field as typeof PROJECT_NOTE_RESULT_VALUE_FIELDS[number])) throw new TypeError("Unsupported Note value target.");
  }
  return JSON.parse(JSON.stringify(value)) as ProjectNoteValueBinding[];
};

export const normalizeProjectNoteValueSnapshot = (value: unknown, bindings: readonly ProjectNoteValueBinding[]): ProjectNoteValueSnapshot => {
  if (!record(value) || Object.keys(value).sort().join("|") !== "capturedAt|values" || !Number.isSafeInteger(value.capturedAt) || (value.capturedAt as number) < 0 || !Array.isArray(value.values) || value.values.length !== bindings.length)
    throw new TypeError("Invalid Note value snapshot.");
  for (const [index, item] of value.values.entries()) {
    if (!record(item) || Object.keys(item).sort().join("|") !== "id|source|status|units|value" || item.id !== bindings[index].id ||
        (item.value !== null && (typeof item.value !== "number" || !Number.isFinite(item.value))) || typeof item.units !== "string" || item.units.length > 80 ||
        !["current", "stale", "unavailable"].includes(String(item.status)) || (item.source !== null && !isScientificSourceGeneration(item.source)) ||
        (item.status === "unavailable" && item.value !== null) || (item.status !== "unavailable" && (item.value === null || item.source === null)) ||
        (item.source !== null && (item.source as ScientificSourceGeneration).documentId !== bindings[index].source.documentId) ||
        (item.status === "current" && !matchesScientificSourceGeneration(item.source as ScientificSourceGeneration, bindings[index].source))) throw new TypeError("Invalid frozen Note value.");
  }
  return JSON.parse(JSON.stringify(value)) as ProjectNoteValueSnapshot;
};

/** Unknown tokens stay literal. Resolving values never evaluates Note text. */
export const formatProjectNoteValueText = (body: string, values: readonly ProjectNoteResolvedValue[]) => body.replace(/\{\{value:([a-z][a-z0-9_-]{0,63})\}\}/g, (token, id: string) => {
  const value = values.find(item => item.id === id);
  if (!value) return token;
  return value.status === "unavailable" ? `${id}: unavailable` : `${value.value}${value.units ? ` ${value.units}` : ""}${value.status === "stale" ? " (stale)" : ""}`;
});
