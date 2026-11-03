import { parseAlgebraObjectRecord, type AlgebraObjectRecord } from "./algebraObjects";
import { createStableDocumentId, isStableDocumentId, type CanonicalJsonValue, type StableDocumentId } from "./documentIdentity";

export const MAX_PROJECT_ALGEBRA_OBJECTS = 128;
export const MAX_ALGEBRA_REVISIONS_PER_OBJECT = 32;

/** One project-local identity, with immutable definition snapshots and a recoverable archive state. */
export type ProjectAlgebraObjectEntry = Readonly<{
  id: StableDocumentId;
  revisions: readonly AlgebraObjectRecord[];
  archived: boolean;
}>;

export const createProjectAlgebraObjectId = (projectId: StableDocumentId, stableKey: CanonicalJsonValue): StableDocumentId => {
  if (!isStableDocumentId(projectId) || !projectId.startsWith("math3d:project:")) {
    throw new TypeError("Algebra object ID requires a stable Project ID.");
  }
  return createStableDocumentId("algebra", { projectId, stableKey });
};

const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");

/** Validates all revision identities and every saved parent edge, including cycles. */
export const validateProjectAlgebraRegistry = (input: unknown): readonly ProjectAlgebraObjectEntry[] => {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_PROJECT_ALGEBRA_OBJECTS) {
    throw new TypeError(`Project algebra registry must contain 1 to ${MAX_PROJECT_ALGEBRA_OBJECTS} objects.`);
  }
  const entries: ProjectAlgebraObjectEntry[] = input.map((value: unknown, index: number) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || !exact(value as Record<string, unknown>, ["id", "revisions", "archived"])) {
      throw new TypeError(`Invalid algebra registry entry at index ${index}.`);
    }
    const entry = value as Record<string, unknown>;
    if (!isStableDocumentId(entry.id) || !entry.id.startsWith("math3d:algebra:")) {
      throw new TypeError(`Invalid algebra object ID at registry index ${index}.`);
    }
    if (typeof entry.archived !== "boolean") throw new TypeError(`Invalid archive state for ${entry.id}.`);
    if (!Array.isArray(entry.revisions) || entry.revisions.length < 1 || entry.revisions.length > MAX_ALGEBRA_REVISIONS_PER_OBJECT) {
      throw new TypeError(`Invalid revision history for ${entry.id}.`);
    }
    const revisions = entry.revisions.map(parseAlgebraObjectRecord);
    revisions.forEach((record, offset) => {
      if (record.id !== entry.id || record.revision !== offset + 1 || record.kind !== revisions[0].kind) {
        throw new TypeError(`Invalid or duplicate revision in algebra object ${entry.id}; expected revision ${offset + 1}.`);
      }
    });
    return Object.freeze({ id: entry.id, revisions: Object.freeze(revisions), archived: entry.archived });
  });
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new TypeError("Duplicate algebra object IDs in Project registry.");
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (record: AlgebraObjectRecord): void => {
    const key = `${record.id}@${record.revision}`;
    if (visiting.has(key)) throw new TypeError(`Cyclic algebra object dependency at ${key}.`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const ref of record.dependencies) {
      const parent = byId.get(ref.objectId)?.revisions[ref.revision - 1];
      if (!parent || parent.revision !== ref.revision) {
        throw new TypeError(`Missing algebra parent ${ref.objectId}@${ref.revision} for ${key}.`);
      }
      visit(parent);
    }
    visiting.delete(key);
    visited.add(key);
  };
  for (const entry of entries) for (const record of entry.revisions) visit(record);
  return Object.freeze(entries.sort((a, b) => a.id.localeCompare(b.id)));
};
