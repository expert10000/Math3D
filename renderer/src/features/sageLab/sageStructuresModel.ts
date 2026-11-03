import { createAlgebraObjectRecord, createProjectAlgebraObjectId, inspectProjectAlgebraFreshness,
  buildSageAlgebraReconstructionInput, upsertMath3DProjectAlgebraObject,
  type AlgebraObjectDefinition, type AlgebraObjectRecord, type AlgebraObjectRef,
  type Math3DProject, type ProjectAlgebraObjectEntry } from "@math3d/core";

export type StructureStarterKind = "integer-ring" | "rational-field" | "modular-ring" | "finite-field" | "polynomial-ring";
export type StructureDraft = Readonly<{
  kind: StructureStarterKind;
  label: string;
  coefficientDomain?: AlgebraObjectRef;
  variables?: string;
  monomialOrder?: "lex" | "deglex" | "degrevlex";
  modulus?: string;
  characteristic?: string;
  degree?: string;
  generator?: string;
}>;

export type StructureSummary = Readonly<{
  presentation: string;
  characteristic: string;
  field: "yes" | "no" | "requires Sage";
  exact: true;
  cardinality: string | null;
  zeroDivisors: "yes" | "no" | "requires Sage";
  coefficientDomain: AlgebraObjectRef | null;
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

const modularPrime = (modulus: string): boolean | null => {
  const n = BigInt(modulus);
  if (n > 1_000_000_000_000n) return null;
  if (n === 2n) return true;
  if (n % 2n === 0n) return false;
  for (let divisor = 3n; divisor * divisor <= n; divisor += 2n) if (n % divisor === 0n) return false;
  return true;
};

/** Exact facts derivable from the A01 definition; uncertain primality is left for Sage. */
export const describeStructure = (record: AlgebraObjectRecord, project: Math3DProject): StructureSummary => {
  const definition = record.definition;
  const presentation = structureDisplay(record, project);
  if (definition.kind === "integer-ring") return { presentation, characteristic: "0", field: "no",
    exact: true, cardinality: null, zeroDivisors: "no", coefficientDomain: null };
  if (definition.kind === "rational-field") return { presentation, characteristic: "0", field: "yes",
    exact: true, cardinality: null, zeroDivisors: "no", coefficientDomain: null };
  if (definition.kind === "modular-ring") {
    const prime = modularPrime(definition.modulus);
    return { presentation, characteristic: definition.modulus, field: prime === null ? "requires Sage" : prime ? "yes" : "no",
      exact: true, cardinality: definition.modulus, zeroDivisors: prime === null ? "requires Sage" : prime ? "no" : "yes",
      coefficientDomain: null };
  }
  if (definition.kind === "finite-field") return { presentation, characteristic: String(definition.characteristic),
    field: "yes", exact: true, cardinality: String(BigInt(definition.characteristic) ** BigInt(definition.degree)),
    zeroDivisors: "no", coefficientDomain: null };
  const parent = selectedStructure(project, definition.coefficientDomain)?.record;
  if (!parent) throw new TypeError("The polynomial coefficient domain is missing from the Project.");
  const base = describeStructure(parent, project);
  return { presentation, characteristic: base.characteristic, field: "no", exact: true, cardinality: null,
    zeroDivisors: base.zeroDivisors, coefficientDomain: definition.coefficientDomain };
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
  else if (draft.kind === "modular-ring") {
    const modulus = draft.modulus?.trim() ?? "";
    if (!/^[1-9][0-9]{0,127}$/.test(modulus) || BigInt(modulus) < 2n) {
      throw new TypeError("Modulus must be a canonical decimal integer from 2 with at most 128 digits.");
    }
    definition = { kind: "modular-ring", modulus };
  } else if (draft.kind === "finite-field") {
    const characteristic = draft.characteristic?.trim() ?? "", degree = draft.degree?.trim() ?? "";
    if (!/^[1-9][0-9]{0,9}$/.test(characteristic) || !/^[1-9][0-9]{0,2}$/.test(degree)) {
      throw new TypeError("Finite field characteristic and degree must be positive decimal integers.");
    }
    definition = { kind: "finite-field", characteristic: Number(characteristic), degree: Number(degree),
      generator: draft.generator?.trim() ?? "", construction: "canonical" };
  }
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
  const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, stableKey),
    label, revision: 1, definition });
  const candidate = upsertMath3DProjectAlgebraObject(project, record);
  buildSageAlgebraReconstructionInput(candidate, { objectId: record.id, revision: 1 });
  return record;
};
