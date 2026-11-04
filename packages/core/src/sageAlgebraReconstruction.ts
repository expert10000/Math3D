import { parseAlgebraObjectRecord, type AlgebraObjectRecord, type AlgebraObjectRef } from "./algebraObjects";
import { canonicalJsonStringify, isStableDocumentId, type StableDocumentId } from "./documentIdentity";
import { analyzeQuadraticNumberField } from "./quadraticNumberField";
import type { Math3DProject } from "./math3dProject";
import { validateProjectAlgebraRegistry } from "./projectAlgebraRegistry";
import { canonicalJsonByteLength } from "./scientificJobs";

export const SAGE_ALGEBRA_RECONSTRUCTION_FORMAT = "math3d.sage-algebra-reconstruction" as const;
export const SAGE_ALGEBRA_RECONSTRUCTION_SCHEMA_VERSION = 1 as const;
export const MAX_SAGE_ALGEBRA_OBJECTS = 32;
export const MAX_SAGE_ALGEBRA_INPUT_BYTES = 32 * 1024;

export type SageAlgebraReconstructionInput = Readonly<{
  format: typeof SAGE_ALGEBRA_RECONSTRUCTION_FORMAT;
  schemaVersion: typeof SAGE_ALGEBRA_RECONSTRUCTION_SCHEMA_VERSION;
  projectId: StableDocumentId;
  target: AlgebraObjectRef;
  objects: readonly AlgebraObjectRecord[];
}>;

export type SageAlgebraReconstructionResult = Readonly<{
  format: "math3d.sage-algebra-reconstruction-result";
  schemaVersion: 1;
  target: AlgebraObjectRef;
  kind: AlgebraObjectRecord["kind"];
  definitionHash: AlgebraObjectRecord["contentHash"];
  text: string;
  latex: string;
  characteristic: string;
  isField: boolean;
  baseRing?: string;
  variables?: readonly string[];
  numberField?: Readonly<{ degree: 2; signature: readonly [number, number];
    polynomialDiscriminant: string; fieldDiscriminant: string;
    powerBasis: readonly [string, string]; integralBasis: readonly [string, string];
    embeddingCount: 2 }>;
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const keyOf = (ref: AlgebraObjectRef) => `${ref.objectId}@${ref.revision}`;

/** Rejects extra records, out-of-order parents, forged hashes and executable payload fields. */
export const parseSageAlgebraReconstructionInput = (value: unknown): SageAlgebraReconstructionInput => {
  if (canonicalJsonByteLength(value) > MAX_SAGE_ALGEBRA_INPUT_BYTES) throw new TypeError("Sage algebra input exceeds 32 KiB.");
  if (!record(value) || !exact(value, ["format", "schemaVersion", "projectId", "target", "objects"]) ||
      value.format !== SAGE_ALGEBRA_RECONSTRUCTION_FORMAT || value.schemaVersion !== SAGE_ALGEBRA_RECONSTRUCTION_SCHEMA_VERSION) {
    throw new TypeError("Invalid Sage algebra reconstruction envelope.");
  }
  if (!isStableDocumentId(value.projectId) || !value.projectId.startsWith("math3d:project:")) {
    throw new TypeError("Sage algebra reconstruction requires a Project ID.");
  }
  if (!record(value.target) || !exact(value.target, ["objectId", "revision"]) ||
      !isStableDocumentId(value.target.objectId) || !value.target.objectId.startsWith("math3d:algebra:") ||
      !Number.isSafeInteger(value.target.revision) || (value.target.revision as number) < 1) {
    throw new TypeError("Invalid Sage algebra target reference.");
  }
  if (!Array.isArray(value.objects) || value.objects.length < 1 || value.objects.length > MAX_SAGE_ALGEBRA_OBJECTS) {
    throw new TypeError(`Sage algebra reconstruction requires 1 to ${MAX_SAGE_ALGEBRA_OBJECTS} objects.`);
  }
  const objects = value.objects.map(parseAlgebraObjectRecord);
  for (const object of objects) {
    const definition = object.definition;
    if (definition.kind === "ideal" || definition.kind === "quotient-ring")
      throw new TypeError("Ideal and quotient objects require separate bounded Sage operations.");
    if (definition.kind === "modular-ring" && definition.modulus.length > 128) {
      throw new TypeError("Sage algebra modulus exceeds the 128-digit reconstruction limit.");
    }
    if (definition.kind === "polynomial-ring" && definition.variables.length > 8) {
      throw new TypeError("Sage algebra polynomial rings support at most eight variables.");
    }
    if (definition.kind === "finite-field") {
      let cardinality = 1;
      for (let degree = 0; degree < definition.degree && cardinality <= 65536; degree += 1) {
        cardinality *= definition.characteristic;
      }
      if (cardinality > 65536) throw new TypeError("Sage finite-field cardinality exceeds 65536.");
    }
  }
  const seen = new Map<string, AlgebraObjectRecord>();
  for (const object of objects) {
    const key = keyOf({ objectId: object.id, revision: object.revision });
    if (seen.has(key)) throw new TypeError(`Duplicate Sage algebra object ${key}.`);
    for (const dependency of object.dependencies) {
      if (!seen.has(keyOf(dependency))) throw new TypeError(`Sage algebra parent ${keyOf(dependency)} must precede ${key}.`);
    }
    seen.set(key, object);
  }
  const target = { objectId: value.target.objectId, revision: value.target.revision } as AlgebraObjectRef;
  if (keyOf(target) !== keyOf({ objectId: objects[objects.length - 1].id, revision: objects[objects.length - 1].revision })) {
    throw new TypeError("Sage algebra target must be the last reconstructed object.");
  }
  const reachable = new Set<string>();
  const visit = (ref: AlgebraObjectRef): void => {
    const key = keyOf(ref);
    if (reachable.has(key)) return;
    reachable.add(key);
    for (const dependency of seen.get(key)!.dependencies) visit(dependency);
  };
  visit(target);
  if (reachable.size !== objects.length) throw new TypeError("Sage algebra input contains unrelated objects.");
  return Object.freeze({ format: SAGE_ALGEBRA_RECONSTRUCTION_FORMAT,
    schemaVersion: SAGE_ALGEBRA_RECONSTRUCTION_SCHEMA_VERSION, projectId: value.projectId,
    target: Object.freeze(target), objects: Object.freeze(objects) });
};

/** Captures the exact pinned closure in deterministic parent-before-child order. */
export const buildSageAlgebraReconstructionInput = (project: Math3DProject,
  target: AlgebraObjectRef): SageAlgebraReconstructionInput => {
  if (!isStableDocumentId(project.identity?.id) || !project.identity.id.startsWith("math3d:project:")) {
    throw new TypeError("Sage algebra reconstruction requires a valid Project.");
  }
  const entries = validateProjectAlgebraRegistry(project.algebraObjects);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const objects: AlgebraObjectRecord[] = [], visited = new Set<string>();
  const visit = (ref: AlgebraObjectRef): void => {
    const item = byId.get(ref.objectId)?.revisions[ref.revision - 1];
    if (!item || item.revision !== ref.revision) throw new TypeError(`Missing Sage algebra object ${keyOf(ref)}.`);
    const key = keyOf(ref);
    if (visited.has(key)) return;
    visited.add(key);
    for (const dependency of item.dependencies) visit(dependency);
    objects.push(item);
  };
  visit(target);
  return parseSageAlgebraReconstructionInput({ format: SAGE_ALGEBRA_RECONSTRUCTION_FORMAT,
    schemaVersion: SAGE_ALGEBRA_RECONSTRUCTION_SCHEMA_VERSION, projectId: project.identity.id,
    target, objects: JSON.parse(canonicalJsonStringify(objects)) });
};

/** Checks the worker's structured metadata against the exact requested target. */
export const parseSageAlgebraReconstructionResult = (value: unknown,
  input: SageAlgebraReconstructionInput): SageAlgebraReconstructionResult => {
  const targetRecord = input.objects[input.objects.length - 1];
  const polynomial = targetRecord.kind === "polynomial-ring";
  const numberField = targetRecord.definition.kind === "number-field"
    ? analyzeQuadraticNumberField(targetRecord.definition.definingPolynomial, targetRecord.definition.generator) : null;
  const characteristicByRef = new Map<string, string>();
  for (const object of input.objects) {
    const definition = object.definition;
    const characteristic = definition.kind === "modular-ring" ? definition.modulus
      : definition.kind === "finite-field" ? String(definition.characteristic)
      : definition.kind === "polynomial-ring" ? characteristicByRef.get(keyOf(definition.coefficientDomain))
      : "0";
    if (characteristic === undefined) throw new TypeError("Sage algebra result has an unresolved coefficient domain.");
    characteristicByRef.set(keyOf({ objectId: object.id, revision: object.revision }), characteristic);
  }
  const expectedCharacteristic = characteristicByRef.get(keyOf(input.target));
  if (!record(value) || !exact(value, ["format", "schemaVersion", "target", "kind", "definitionHash",
    "text", "latex", "characteristic", "isField", ...(polynomial ? ["baseRing", "variables"] : []),
    ...(numberField ? ["numberField"] : [])]) ||
    value.format !== "math3d.sage-algebra-reconstruction-result" || value.schemaVersion !== 1 ||
    !record(value.target) || !exact(value.target, ["objectId", "revision"]) ||
    value.target.objectId !== input.target.objectId || value.target.revision !== input.target.revision ||
    value.kind !== targetRecord.kind || value.definitionHash !== targetRecord.contentHash ||
    typeof value.text !== "string" || !value.text || value.text.length > 4096 ||
    typeof value.latex !== "string" || value.latex.length > 4096 ||
    typeof value.characteristic !== "string" || !/^(?:0|[1-9][0-9]{0,127})$/.test(value.characteristic) ||
    value.characteristic !== expectedCharacteristic ||
    typeof value.isField !== "boolean") {
    throw new TypeError("Invalid or mismatched Sage algebra reconstruction result.");
  }
  if (polynomial && (typeof value.baseRing !== "string" || !value.baseRing || value.baseRing.length > 1024 ||
    !Array.isArray(value.variables) || canonicalJsonStringify(value.variables) !==
      canonicalJsonStringify(targetRecord.definition.kind === "polynomial-ring" ? targetRecord.definition.variables : []))) {
    throw new TypeError("Sage algebra polynomial metadata does not match its definition.");
  }
  if (numberField) {
    const facts = value.numberField;
    if (!record(facts) || !exact(facts, ["degree", "signature", "polynomialDiscriminant",
      "fieldDiscriminant", "powerBasis", "integralBasis", "embeddingCount"]) ||
      facts.degree !== 2 || facts.embeddingCount !== 2 ||
      canonicalJsonStringify(facts.signature) !== canonicalJsonStringify(numberField.signature) ||
      facts.polynomialDiscriminant !== numberField.polynomialDiscriminant ||
      facts.fieldDiscriminant !== numberField.fieldDiscriminant ||
      canonicalJsonStringify(facts.powerBasis) !== canonicalJsonStringify(numberField.powerBasis) ||
      !Array.isArray(facts.integralBasis) || facts.integralBasis.length !== 2 ||
      !facts.integralBasis.every((item) => typeof item === "string" && item.length > 0 && item.length <= 256) ||
      value.isField !== true)
      throw new TypeError("Sage number field metadata differs from the pinned quadratic definition.");
  }
  return Object.freeze(JSON.parse(canonicalJsonStringify(value)) as SageAlgebraReconstructionResult);
};
