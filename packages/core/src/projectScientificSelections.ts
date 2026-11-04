import { canonicalJsonStringify, createStableDocumentId } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument, type KernelWorkspaceDocument } from "./mixedWorkspace";
import { normalizeScientificSelection, type ScientificLegacySelectionSlot,
  type ScientificSelection } from "./scientificSelection";
import { readScientificSelectionsFromProject } from "./scientificSelectionLegacy";

export const PROJECT_SCIENTIFIC_SELECTIONS_CAPABILITY = "project.scientific-selections.v1" as const;

const requireProject = (project: Math3DProject) => parseMath3DProject(serializeMath3DProject(project));
const migratedId = (projectId: string, slot: ScientificLegacySelectionSlot) =>
  createStableDocumentId("scientific-selection", { projectId,
    ownerDocumentId: slot.ownerDocumentId, path: slot.path,
    objectId: slot.objectId ?? null });
const promote = (projectId: string, legacy: ScientificSelection): ScientificSelection => {
  if (legacy.identity.kind !== "legacy-slot") throw new TypeError("Expected a legacy scientific selection slot.");
  const checked = normalizeScientificSelection({ ...legacy,
    identity: { kind: "authored", id: migratedId(projectId, legacy.identity),
      migratedFrom: legacy.identity } });
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
};

/** Return the Project objects, or a deterministic read-only preview for a legacy Project.
 * Both Graphs and Field Explorer use this same collection. */
export const listProjectScientificSelections = (project: Math3DProject,
  resolved?: ReadonlyMap<string, KernelWorkspaceDocument>): readonly ScientificSelection[] => {
  const current = requireProject(project);
  if (current.workspace.scientificSelections !== undefined) return current.workspace.scientificSelections;
  return readScientificSelectionsFromProject(current, resolved).map(item => promote(current.identity.id, item));
};

/** The same Project collection is addressable from either its owner editor or source document. */
export const projectScientificSelectionsForDocument = (project: Math3DProject, documentId: string,
  resolved?: ReadonlyMap<string, KernelWorkspaceDocument>): readonly ScientificSelection[] =>
  listProjectScientificSelections(project, resolved).filter(item =>
    item.identity.kind === "authored" && item.identity.migratedFrom?.ownerDocumentId === documentId ||
    item.source?.kind === "document" && item.source.documentId === documentId);

/** Materialize existing saved slots into Project-owned objects. Matching slots retain their IDs
 * when the Explorer layout changes or a source document receives a new revision. */
export const migrateProjectScientificSelections = (project: Math3DProject,
  resolved?: ReadonlyMap<string, KernelWorkspaceDocument>): Math3DProject => {
  const current = requireProject(project);
  const old = current.workspace.scientificSelections ?? [];
  const byOrigin = new Map(old.flatMap(item => item.identity.kind === "authored" &&
    item.identity.migratedFrom ? [[canonicalJsonStringify(item.identity.migratedFrom), item] as const] : []));
  const projected = readScientificSelectionsFromProject(current, resolved).map(legacy => {
    const promoted = promote(current.identity.id, legacy);
    if (promoted.identity.kind !== "authored") throw new TypeError("Expected authored selection identity.");
    const key = canonicalJsonStringify(promoted.identity.migratedFrom);
    const prior = byOrigin.get(key);
    if (prior && prior.identity.kind === "authored" && prior.identity.id !== promoted.identity.id)
      throw new TypeError("Migrated scientific selection identity changed.");
    return prior ? { ...promoted, identity: prior.identity } : promoted;
  });
  const projectedOrigins = new Set(projected.flatMap(item => item.identity.kind === "authored" &&
    item.identity.migratedFrom ? [canonicalJsonStringify(item.identity.migratedFrom)] : []));
  const retained = old.filter(item => item.identity.kind !== "authored" ||
    !item.identity.migratedFrom || !projectedOrigins.has(canonicalJsonStringify(item.identity.migratedFrom)));
  const selections = [...retained, ...projected].sort((a, b) => {
    const left = a.identity.kind === "authored" ? a.identity.id : "";
    const right = b.identity.kind === "authored" ? b.identity.id : "";
    return left.localeCompare(right);
  });
  if (current.workspace.scientificSelections !== undefined &&
      canonicalJsonStringify(current.workspace.scientificSelections) === canonicalJsonStringify(selections)) return current;
  if (!selections.length) return current;
  return replaceMath3DProjectWorkspace(current,
    createMixedWorkspaceDocument({ ...current.workspace, scientificSelections: selections }));
};

/** Save a newly authored or updated selection without changing its stable ID. */
export const upsertProjectScientificSelection = (project: Math3DProject,
  selection: ScientificSelection): Math3DProject => {
  const current = requireProject(project), checked = normalizeScientificSelection(selection);
  if (!checked.ok || checked.value.identity.kind !== "authored")
    throw new TypeError(checked.ok ? "Project selections require authored IDs." : checked.errors.join(" "));
  const id = checked.value.identity.id, previous = current.workspace.scientificSelections ?? [];
  const existing = previous.find(item => item.identity.kind === "authored" && item.identity.id === id);
  if (existing && canonicalJsonStringify(existing.identity) !== canonicalJsonStringify(checked.value.identity))
    throw new TypeError("Scientific selection identity or migration origin cannot change.");
  const next = [...previous.filter(item => item.identity.kind !== "authored" || item.identity.id !== id),
    checked.value].sort((a, b) => (a.identity.kind === "authored" ? a.identity.id : "")
      .localeCompare(b.identity.kind === "authored" ? b.identity.id : ""));
  if (canonicalJsonStringify(previous) === canonicalJsonStringify(next)) return current;
  return replaceMath3DProjectWorkspace(current,
    createMixedWorkspaceDocument({ ...current.workspace, scientificSelections: next }));
};
