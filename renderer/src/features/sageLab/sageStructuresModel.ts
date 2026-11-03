import { createAlgebraObjectRecord, createProjectAlgebraObjectId, inspectProjectAlgebraFreshness,
  type AlgebraObjectDefinition, type AlgebraObjectRecord, type AlgebraObjectRef,
  type Math3DProject, type ProjectAlgebraObjectEntry } from "@math3d/core";

export type StructureStarterKind = "integer-ring" | "rational-field" | "polynomial-ring";
export type StructureDraft = Readonly<{
  kind: StructureStarterKind;
  label: string;
  coefficientDomain?: AlgebraObjectRef;
  variables?: string;
  monomialOrder?: "lex" | "deglex" | "degrevlex";
}>;

export const structureSelectionKey = (projectId: string) => `math3d.sage-structures.selection.v1.${projectId}`;

export const resolveStructureSelection = (project: Math3DProject | null, value: unknown): AlgebraObjectRef | null => {
  if (!project?.algebraObjects?.length) return null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const ref = value as Record<string, unknown>;
    if (Object.keys(ref).sort().join("|") === "objectId|revision" && typeof ref.objectId === "string" &&
        Number.isSafeInteger(ref.revision) && (ref.revision as number) >= 1 &&
        project.algebraObjects.some((entry) => entry.id === ref.objectId && entry.revisions[Number(ref.revision) - 1])) {
      return { objectId: ref.objectId as AlgebraObjectRef["objectId"], revision: Number(ref.revision) };
    }
  }
  const first = project.algebraObjects.find((entry) => !entry.archived) ?? project.algebraObjects[0];
  return first ? { objectId: first.id, revision: first.revisions[first.revisions.length - 1].revision } : null;
};

export const selectedStructure = (project: Math3DProject | null, ref: AlgebraObjectRef | null):
  { entry: ProjectAlgebraObjectEntry; record: AlgebraObjectRecord } | null => {
  if (!project || !ref) return null;
  const entry = project.algebraObjects?.find((item) => item.id === ref.objectId);
  const record = entry?.revisions[ref.revision - 1];
  return entry && record ? { entry, record } : null;
};

export const structureDisplay = (record: AlgebraObjectRecord, project: Math3DProject): string => {
  const definition = record.definition;
  if (definition.kind === "integer-ring") return "ZZ";
  if (definition.kind === "rational-field") return "QQ";
  if (definition.kind === "modular-ring") return `Z/${definition.modulus}Z`;
  if (definition.kind === "finite-field") return `GF(${definition.characteristic}${definition.degree > 1 ? `^${definition.degree}` : ""})`;
  const parent = selectedStructure(project, definition.coefficientDomain)?.record;
  return `${parent ? parent.label : definition.coefficientDomain.objectId}[${definition.variables.join(",")}]`;
};

export const createStructureStarter = (project: Math3DProject, draft: StructureDraft,
  stableKey: string): AlgebraObjectRecord => {
  const label = draft.label.trim();
  if (!label || label.length > 120 || project.algebraObjects?.some((entry) => !entry.archived &&
      entry.revisions[entry.revisions.length - 1].label.toLocaleLowerCase() === label.toLocaleLowerCase())) {
    throw new TypeError("Choose a unique structure name of 1–120 characters in this Project.");
  }
  let definition: AlgebraObjectDefinition;
  if (draft.kind === "integer-ring" || draft.kind === "rational-field") definition = { kind: draft.kind };
  else {
    if (!draft.coefficientDomain) throw new TypeError("Select an existing coefficient domain.");
    const parent = selectedStructure(project, draft.coefficientDomain);
    if (!parent || parent.entry.archived) throw new TypeError("The coefficient domain is unavailable in this Project.");
    const freshness = inspectProjectAlgebraFreshness(project).find((item) => item.objectId === parent.entry.id);
    if (freshness?.status === "stale" || parent.record.revision !== parent.entry.revisions[parent.entry.revisions.length - 1].revision) {
      throw new TypeError("Select the current fresh revision of the coefficient domain.");
    }
    definition = { kind: "polynomial-ring", coefficientDomain: draft.coefficientDomain,
      variables: (draft.variables ?? "").split(",").map((item) => item.trim()),
      monomialOrder: draft.monomialOrder ?? "degrevlex" };
  }
  return createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, stableKey),
    label, revision: 1, definition });
};
