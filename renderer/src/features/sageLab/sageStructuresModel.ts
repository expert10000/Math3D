import { createAlgebraObjectRecord, createProjectAlgebraObjectId, inspectProjectAlgebraFreshness, parseIdealGenerator,
  analyzeQuadraticNumberField, buildSageAlgebraReconstructionInput, upsertMath3DProjectAlgebraObject,
  analyzeBiquadraticExtensionFromDefinition,
  analyzeFiniteGroup,
  modulePresentationLabel,
  chainComplexLabel,
  type AlgebraObjectDefinition, type AlgebraObjectRecord, type AlgebraObjectRef,
  type Math3DProject, type ProjectAlgebraObjectEntry } from "@math3d/core";

export type StructureStarterKind = "integer-ring" | "rational-field" | "modular-ring" | "finite-field" |
  "polynomial-ring" | "number-field" | "field-extension";
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
  quadraticConstant?: string;
  quadraticLinear?: string;
  towerRadicand?: string;
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
  if (definition.kind === "number-field") {
    const facts = analyzeQuadraticNumberField(definition.definingPolynomial, definition.generator);
    const base = selectedStructure(project, definition.baseField)?.record;
    return `${base?.label ?? "QQ"}(${definition.generator}), ${facts.definingPolynomial}=0`;
  }
  if (definition.kind === "field-extension") {
    const base = selectedStructure(project, definition.baseField)?.record;
    return `${base?.label ?? definition.baseField.objectId}(${definition.generator}), ${definition.generator}^2=${definition.radicand}`;
  }
  if (definition.kind === "elliptic-curve") {
    const base = selectedStructure(project, definition.baseField)?.record;
    return `y²=x³+(${definition.a})x+(${definition.b}) over ${base?.label ?? definition.baseField.objectId}`;
  }
  if (definition.kind === "finite-group") {
    const facts = analyzeFiniteGroup(definition);
    return `${facts.presentation}, order ${facts.order}`;
  }
  if (definition.kind === "module") {
    const ring = selectedStructure(project, definition.baseRing)?.record;
    return modulePresentationLabel(definition, ring ? structureDisplay(ring, project) : "R");
  }
  if (definition.kind === "module-map") {
    const source = selectedStructure(project, definition.sourceModule)?.record;
    const target = selectedStructure(project, definition.targetModule)?.record;
    return `${source?.label ?? "M"} → ${target?.label ?? "N"} · ${definition.codomainRank}×${definition.domainRank} matrix`;
  }
  if (definition.kind === "chain-complex") return chainComplexLabel(definition, project.algebraObjects ?? []);
  if (definition.kind === "ideal") {
    const ambient = selectedStructure(project, definition.ambientRing)?.record;
    return `⟨${definition.generators.join(", ")}⟩ ⊂ ${ambient?.label ?? definition.ambientRing.objectId}`;
  }
  if (definition.kind === "quotient-ring") {
    const ambient = selectedStructure(project, definition.ambientRing)?.record;
    const ideal = selectedStructure(project, definition.ideal)?.record;
    return `${ambient?.label ?? "R"}/${ideal?.label ?? "I"}`;
  }
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
  if (definition.kind === "number-field") return { presentation, characteristic: "0", field: "yes",
    exact: true, cardinality: null, zeroDivisors: "no", coefficientDomain: definition.baseField };
  if (definition.kind === "field-extension") return { presentation, characteristic: "0", field: "yes",
    exact: true, cardinality: null, zeroDivisors: "no", coefficientDomain: definition.baseField };
  if (definition.kind === "elliptic-curve" || definition.kind === "ideal" || definition.kind === "quotient-ring" || definition.kind === "finite-group" ||
      definition.kind === "module" || definition.kind === "module-map" || definition.kind === "chain-complex")
    throw new TypeError("Ideal, quotient and finite-group objects need dedicated exact analysis.");
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
  else if (draft.kind === "number-field") {
    if (!draft.coefficientDomain) throw new TypeError("Select a saved QQ base field.");
    const base = selectedStructure(project, draft.coefficientDomain);
    if (!base || base.entry.archived || base.record.kind !== "rational-field" ||
        base.record.revision !== base.entry.revisions.length ||
        inspectProjectAlgebraFreshness(project).find((item) => item.objectId === base.entry.id)?.status !== "fresh")
      throw new TypeError("Select a current, fresh QQ base field.");
    definition = { kind: "number-field", baseField: draft.coefficientDomain,
      definingPolynomial: [draft.quadraticConstant?.trim() ?? "", draft.quadraticLinear?.trim() ?? "", "1"] as const,
      generator: draft.generator?.trim() ?? "" };
  }
  else if (draft.kind === "field-extension") {
    if (!draft.coefficientDomain) throw new TypeError("Select a saved quadratic base field.");
    const base = selectedStructure(project, draft.coefficientDomain);
    if (!base || base.entry.archived || base.record.definition.kind !== "number-field" ||
        base.record.revision !== base.entry.revisions.length ||
        inspectProjectAlgebraFreshness(project).find((item) => item.objectId === base.entry.id)?.status !== "fresh")
      throw new TypeError("Select a current, fresh quadratic base field.");
    const radicand = draft.towerRadicand?.trim() ?? "", generator = draft.generator?.trim() ?? "";
    analyzeBiquadraticExtensionFromDefinition(base.record.definition.definingPolynomial,
      base.record.definition.generator, radicand, generator);
    definition = { kind: "field-extension", baseField: draft.coefficientDomain, radicand, generator };
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

/** C01 saves syntax-checked generators in a pinned, current QQ polynomial ring. */
export const createIdealStarter = (project: Math3DProject, label: string, ambientRing: AlgebraObjectRef,
  generatorLines: string, stableKey: string): AlgebraObjectRecord => {
  const name = label.trim();
  if (!name || name.length > 120 || project.algebraObjects?.some((entry) => !entry.archived &&
      entry.revisions.at(-1)?.label.toLocaleLowerCase() === name.toLocaleLowerCase()))
    throw new TypeError("Choose a unique ideal name of 1–120 characters in this Project.");
  const ambient = selectedStructure(project, ambientRing);
  if (!ambient || ambient.entry.archived ||
      ambient.record.revision !== ambient.entry.revisions.length ||
      inspectProjectAlgebraFreshness(project).find((item) => item.objectId === ambient.entry.id)?.status !== "fresh")
    throw new TypeError("Select a current, fresh polynomial ambient ring.");
  const ring = ambient.record.definition;
  if (ring.kind !== "polynomial-ring") throw new TypeError("Select a polynomial ambient ring.");
  const coefficient = selectedStructure(project, ring.coefficientDomain)?.record;
  if (coefficient?.kind !== "rational-field")
    throw new TypeError("C01 ideals require a polynomial ambient ring directly over QQ.");
  const lines = generatorLines.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (!lines.length || lines.length > 8) throw new TypeError("Enter 1 to 8 generators, one per line.");
  const generators = lines.map((item) => parseIdealGenerator(item, ring.variables));
  const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, stableKey),
    label: name, revision: 1, definition: { kind: "ideal", ambientRing, generators } });
  upsertMath3DProjectAlgebraObject(project, record);
  return record;
};

export const createQuotientStarter = (project: Math3DProject, label: string, idealRef: AlgebraObjectRef,
  stableKey: string): AlgebraObjectRecord => {
  const name = label.trim();
  if (!name || name.length > 120 || project.algebraObjects?.some((entry) => !entry.archived &&
      entry.revisions.at(-1)?.label.toLocaleLowerCase() === name.toLocaleLowerCase()))
    throw new TypeError("Choose a unique quotient name of 1–120 characters.");
  const ideal = selectedStructure(project, idealRef);
  if (!ideal || ideal.entry.archived || ideal.record.definition.kind !== "ideal" ||
      ideal.record.revision !== ideal.entry.revisions.length ||
      inspectProjectAlgebraFreshness(project).find((item) => item.objectId === ideal.entry.id)?.status !== "fresh")
    throw new TypeError("Select a current fresh ideal for its quotient ring.");
  const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, stableKey),
    revision: 1, label: name, definition: { kind: "quotient-ring", ideal: idealRef,
      ambientRing: ideal.record.definition.ambientRing } });
  upsertMath3DProjectAlgebraObject(project, record);
  return record;
};
