/** Exact structure-theorem evidence for a saved ZZ module presentation. */
import { canonicalJsonStringify, isStableDocumentId, isStructuralHash,
  type StableDocumentId, type StructuralHash } from "./documentIdentity";
import type { AlgebraObjectRef } from "./algebraObjects";
import type { Math3DProject } from "./math3dProject";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";
import { parseSageIntegerMatrixFormsInput, parseSageIntegerMatrixFormsResult,
  type SageIntegerMatrixFormsResult } from "./sageIntegerMatrixForms";

export const SAGE_MODULE_FORMAT = "math3d.sage-module-invariant-factors";
export const SAGE_MODULE_RESULT_FORMAT = "math3d.sage-module-invariant-factors-result";
export type SageModuleInvariantInput = Readonly<{ format: typeof SAGE_MODULE_FORMAT; schemaVersion: 1;
  projectId: StableDocumentId; target: AlgebraObjectRef; targetHash: StructuralHash;
  baseRing: AlgebraObjectRef; baseRingHash: StructuralHash; ambientRank: number; relationRank: number;
  matrix: readonly (readonly string[])[] }>;
export type SageModuleInvariantResult = Readonly<{ format: typeof SAGE_MODULE_RESULT_FORMAT; schemaVersion: 1;
  coefficientDomain: "ZZ"; freeRank: number; torsionOrders: readonly string[];
  smith: SageIntegerMatrixFormsResult["smith"] | null }>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const ref = (value: unknown) => object(value) && exact(value, ["objectId", "revision"]) &&
  isStableDocumentId(value.objectId) && Number.isSafeInteger(value.revision) && (value.revision as number) > 0;

export const parseSageModuleInvariantInput = (value: unknown): SageModuleInvariantInput => {
  if (!object(value) || !exact(value, ["format", "schemaVersion", "projectId", "target", "targetHash",
    "baseRing", "baseRingHash", "ambientRank", "relationRank", "matrix"]) ||
    value.format !== SAGE_MODULE_FORMAT || value.schemaVersion !== 1 || !isStableDocumentId(value.projectId) ||
    !ref(value.target) || !isStructuralHash(value.targetHash) || !ref(value.baseRing) ||
    !isStructuralHash(value.baseRingHash) || !Number.isSafeInteger(value.ambientRank) ||
    (value.ambientRank as number) < 1 || (value.ambientRank as number) > 6 ||
    !Number.isSafeInteger(value.relationRank) || (value.relationRank as number) < 0 ||
    (value.relationRank as number) > 6 || !Array.isArray(value.matrix) ||
    value.matrix.length !== value.ambientRank || !value.matrix.every((row: unknown) => Array.isArray(row) &&
      row.length === value.relationRank && row.every((entry: unknown) => typeof entry === "string" &&
        /^(?:0|-?[1-9][0-9]{0,17})$/.test(entry))))
    throw new TypeError("Module invariant factors require a pinned 1–6 rank ZZ presentation with canonical integer relations.");
  return JSON.parse(canonicalJsonStringify(value)) as SageModuleInvariantInput;
};

export const validateSageModuleInvariantSnapshot = (value: unknown, projectId: StableDocumentId,
  objects: readonly ProjectAlgebraObjectEntry[]): SageModuleInvariantInput => {
  const input = parseSageModuleInvariantInput(value);
  const module = objects.find((item) => item.id === input.target.objectId)?.revisions[input.target.revision - 1];
  const ring = objects.find((item) => item.id === input.baseRing.objectId)?.revisions[input.baseRing.revision - 1];
  if (input.projectId !== projectId || module?.definition.kind !== "module" ||
    module.contentHash !== input.targetHash || ring?.definition.kind !== "integer-ring" ||
    ring.contentHash !== input.baseRingHash ||
    canonicalJsonStringify(module.definition.baseRing) !== canonicalJsonStringify(input.baseRing) ||
    module.definition.ambientRank !== input.ambientRank ||
    module.definition.relationMap.domainRank !== input.relationRank ||
    canonicalJsonStringify(module.definition.relationMap.matrix) !== canonicalJsonStringify(input.matrix))
    throw new TypeError("Module invariant-factor request differs from its pinned ZZ module and parent ring.");
  return input;
};

export const buildSageModuleInvariantInput = (project: Math3DProject,
  target: AlgebraObjectRef): SageModuleInvariantInput => {
  const module = project.algebraObjects?.find((item) => item.id === target.objectId)?.revisions[target.revision - 1];
  if (module?.definition.kind !== "module") throw new TypeError("Select a saved ZZ module presentation.");
  const baseRing = module.definition.baseRing;
  const ring = project.algebraObjects?.find((item) => item.id === baseRing.objectId)?.revisions[baseRing.revision - 1];
  if (ring?.definition.kind !== "integer-ring") throw new TypeError("Invariant factors require a pinned ZZ parent ring.");
  return validateSageModuleInvariantSnapshot({ format: SAGE_MODULE_FORMAT, schemaVersion: 1,
    projectId: project.identity.id, target, targetHash: module.contentHash, baseRing,
    baseRingHash: ring.contentHash, ambientRank: module.definition.ambientRank,
    relationRank: module.definition.relationMap.domainRank, matrix: module.definition.relationMap.matrix },
  project.identity.id, project.algebraObjects ?? []);
};

export const parseSageModuleInvariantResult = (value: unknown,
  input: SageModuleInvariantInput): SageModuleInvariantResult => {
  const checked = parseSageModuleInvariantInput(input);
  if (!object(value) || !exact(value, ["format", "schemaVersion", "coefficientDomain", "freeRank",
    "torsionOrders", "smith"]) || value.format !== SAGE_MODULE_RESULT_FORMAT || value.schemaVersion !== 1 ||
    value.coefficientDomain !== "ZZ" || !Number.isSafeInteger(value.freeRank) ||
    !Array.isArray(value.torsionOrders) || !value.torsionOrders.every((item: unknown) =>
      typeof item === "string" && /^[1-9][0-9]{0,127}$/.test(item) && BigInt(item) > 1n))
    throw new TypeError("Invalid exact ZZ module invariant-factor result.");
  if (checked.relationRank === 0) {
    if (value.smith !== null || value.freeRank !== checked.ambientRank || value.torsionOrders.length)
      throw new TypeError("Free ZZ module has no Smith relations or torsion.");
    return { format: SAGE_MODULE_RESULT_FORMAT, schemaVersion: 1, coefficientDomain: "ZZ",
      freeRank: checked.ambientRank, torsionOrders: [], smith: null };
  }
  const formsInput = parseSageIntegerMatrixFormsInput({ format: "math3d.sage-integer-matrix-forms", schemaVersion: 1,
    matrix: checked.matrix });
  // The shared exact parser requires the complete forms envelope, including a verified Smith witness.
  const forms = parseSageIntegerMatrixFormsResult({
    format: "math3d.sage-integer-matrix-forms-result", schemaVersion: 1, coefficientDomain: "ZZ",
    sourceMatrix: checked.matrix, inputShape: [checked.ambientRank, checked.relationRank],
    rank: (value.smith as Record<string, unknown> | null)?.diagonal &&
      Array.isArray((value.smith as Record<string, unknown>).diagonal)
      ? ((value.smith as Record<string, unknown>).diagonal as unknown[]).filter((item) => item !== "0").length : -1,
    smith: value.smith, hermite: { form: checked.matrix, transformation: { status: "unavailable", reason: "Not requested for module classification." } },
    cokernel: { freeRank: value.freeRank, torsionOrders: value.torsionOrders },
  }, formsInput);
  if (forms.smith.transformations.status !== "verified")
    throw new TypeError("Module invariant factors require verified unimodular Smith transformations.");
  return { format: SAGE_MODULE_RESULT_FORMAT, schemaVersion: 1, coefficientDomain: "ZZ",
    freeRank: forms.cokernel.freeRank, torsionOrders: forms.cokernel.torsionOrders, smith: forms.smith };
};
