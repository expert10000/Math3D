/** Pinned quadratic prime ideals and finite-precision Qp local models. */
import { canonicalJsonStringify, type StructuralHash } from "./documentIdentity";
import type { AlgebraObjectRef } from "./algebraObjects";
import { analyzeQuadraticNumberField } from "./quadraticNumberField";
import { quadraticPrimeSplitting } from "./sageNumberFieldOperations";
import { buildSageAlgebraReconstructionInput, parseSageAlgebraReconstructionInput,
  type SageAlgebraReconstructionInput } from "./sageAlgebraReconstruction";
import type { Math3DProject } from "./math3dProject";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";

export const SAGE_LOCAL_EXTENSION_FORMAT = "math3d.sage-local-extension" as const;
export const SAGE_LOCAL_EXTENSION_RESULT_FORMAT = "math3d.sage-local-extension-result" as const;
export type SageLocalExtensionInput = Readonly<{ format: typeof SAGE_LOCAL_EXTENSION_FORMAT; schemaVersion: 1;
  field: SageAlgebraReconstructionInput; prime: number; precision: number }>;
export type SageLocalExtensionBranch = Readonly<{
  ideal: string; idealNorm: string; ramificationIndex: number; residueDegree: number;
  localDegree: number; residueOrder: number; generatorResidue: string;
  model: "base" | "quadratic-extension"; localField: string; uniformizer: string;
  uniformizerValuation: 1; basePrimeValuation: number;
  rootResidue: string | null; rootPrecision: number | null;
}>;
export type SageLocalExtensionResult = Readonly<{ format: typeof SAGE_LOCAL_EXTENSION_RESULT_FORMAT;
  schemaVersion: 1; target: AlgebraObjectRef; targetHash: StructuralHash;
  prime: number; precision: number; fieldDiscriminant: string;
  polynomial: readonly [string, string, "1"];
  splitting: "split" | "inert" | "ramified"; branches: readonly SageLocalExtensionBranch[];
  degreeCheck: 2 }>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const same = (a: unknown, b: unknown) => canonicalJsonStringify(a) === canonicalJsonStringify(b);
const primes = new Set([3, 5, 7, 11, 13, 17, 19, 23, 29, 31]);
const decimal = (value: unknown): value is string => typeof value === "string" && /^(?:0|[1-9][0-9]{0,31})$/.test(value);
const targetDefinition = (field: SageAlgebraReconstructionInput) => {
  const target = field.objects.at(-1)!;
  if (target.definition.kind !== "number-field") throw new TypeError("Choose a pinned quadratic number field.");
  const definition = target.definition;
  const parent = field.objects.find((item) => item.id === definition.baseField.objectId &&
    item.revision === definition.baseField.revision);
  if (parent?.kind !== "rational-field") throw new TypeError("Local extension requires a pinned QQ parent.");
  return { target, definition, facts: analyzeQuadraticNumberField(definition.definingPolynomial, definition.generator) };
};

export const parseSageLocalExtensionInput = (value: unknown): SageLocalExtensionInput => {
  if (!object(value) || !exact(value, ["format", "schemaVersion", "field", "prime", "precision"]) ||
      value.format !== SAGE_LOCAL_EXTENSION_FORMAT || value.schemaVersion !== 1 ||
      !primes.has(value.prime as number) || !Number.isSafeInteger(value.precision) ||
      (value.precision as number) < 2 || (value.precision as number) > 16)
    throw new TypeError("Local extension requires an odd prime at most 31 and precision 2–16.");
  const field = parseSageAlgebraReconstructionInput(value.field);
  const { facts } = targetDefinition(field), p = BigInt(value.prime as number);
  const polynomialDiscriminant = BigInt(facts.polynomialDiscriminant),
    fieldDiscriminant = BigInt(facts.fieldDiscriminant);
  if (fieldDiscriminant === 0n || polynomialDiscriminant % fieldDiscriminant !== 0n ||
      (polynomialDiscriminant / fieldDiscriminant) % p === 0n)
    throw new TypeError("Local model requires a prime away from the defining power-basis index.");
  return { format: SAGE_LOCAL_EXTENSION_FORMAT, schemaVersion: 1,
    field, prime: value.prime as number, precision: value.precision as number };
};

export const buildSageLocalExtensionInput = (project: Math3DProject, target: AlgebraObjectRef,
  prime: number, precision: number): SageLocalExtensionInput => parseSageLocalExtensionInput({
    format: SAGE_LOCAL_EXTENSION_FORMAT, schemaVersion: 1,
    field: buildSageAlgebraReconstructionInput(project, target), prime, precision,
  });

export const validateSageLocalExtensionSnapshot = (value: unknown, projectId: string,
  objects: readonly ProjectAlgebraObjectEntry[]): SageLocalExtensionInput => {
  const input = parseSageLocalExtensionInput(value);
  if (input.field.projectId !== projectId || input.field.objects.some((record) => {
    const saved = objects.find((entry) => entry.id === record.id)?.revisions[record.revision - 1];
    return !saved || !same(saved, record);
  })) throw new TypeError("Local-extension request differs from its pinned Project field.");
  return input;
};

/** Checks e·f, ideal norms, residue orders, valuations and split roots against the exact source. */
export const parseSageLocalExtensionResult = (value: unknown,
  rawInput: SageLocalExtensionInput): SageLocalExtensionResult => {
  const input = parseSageLocalExtensionInput(rawInput);
  const { target, definition, facts } = targetDefinition(input.field);
  const { prime: p, precision: n } = input;
  const expected = quadraticPrimeSplitting(facts.fieldDiscriminant, p);
  if (!object(value) || !exact(value, ["format", "schemaVersion", "target", "targetHash", "prime",
    "precision", "fieldDiscriminant", "polynomial", "splitting", "branches", "degreeCheck"]) ||
    value.format !== SAGE_LOCAL_EXTENSION_RESULT_FORMAT || value.schemaVersion !== 1 ||
    !same(value.target, input.field.target) || value.targetHash !== target.contentHash ||
    value.prime !== p || value.precision !== n || value.fieldDiscriminant !== facts.fieldDiscriminant ||
    !same(value.polynomial, definition.definingPolynomial) || value.splitting !== expected ||
    value.degreeCheck !== 2 || !Array.isArray(value.branches) ||
    value.branches.length !== (expected === "split" ? 2 : 1))
    throw new TypeError("Local-extension result does not match the pinned quadratic field.");
  const roots: number[] = [], ideals = new Set<string>();
  for (const branch of value.branches) {
    if (!object(branch) || !exact(branch, ["ideal", "idealNorm", "ramificationIndex", "residueDegree",
      "localDegree", "residueOrder", "generatorResidue", "model", "localField", "uniformizer",
      "uniformizerValuation", "basePrimeValuation", "rootResidue", "rootPrecision"]) ||
      typeof branch.ideal !== "string" || !branch.ideal || branch.ideal.length > 512 ||
      typeof branch.localField !== "string" || !branch.localField || branch.localField.length > 512 ||
      typeof branch.uniformizer !== "string" || !branch.uniformizer || branch.uniformizer.length > 512 ||
      typeof branch.generatorResidue !== "string" || !branch.generatorResidue || branch.generatorResidue.length > 120)
      throw new TypeError("Invalid local prime-ideal branch.");
    if (ideals.has(branch.ideal)) throw new TypeError("Duplicate local prime ideal.");
    ideals.add(branch.ideal);
    const e = expected === "ramified" ? 2 : 1, f = expected === "inert" ? 2 : 1;
    if (branch.ramificationIndex !== e || branch.residueDegree !== f || branch.localDegree !== e * f ||
        branch.residueOrder !== p ** f || branch.idealNorm !== String(p ** f) ||
        branch.uniformizerValuation !== 1 || branch.basePrimeValuation !== e ||
        branch.model !== (expected === "split" ? "base" : "quadratic-extension"))
      throw new TypeError("Local ramification, residue degree or uniformizer data disagree with the field.");
    if (expected === "split") {
      if (!decimal(branch.rootResidue) || !decimal(branch.generatorResidue) || branch.rootPrecision !== n)
        throw new TypeError("Split local root has invalid precision or residue.");
      const root = BigInt(branch.rootResidue), modulus = BigInt(p) ** BigInt(n);
      const residue = Number(root % BigInt(p));
      const [c, b] = definition.definingPolynomial;
      if (root >= modulus || residue !== Number(branch.generatorResidue) ||
          (root * root + BigInt(b) * root + BigInt(c)) % modulus !== 0n)
        throw new TypeError("Split local root does not satisfy the pinned polynomial modulo p^N.");
      roots.push(residue);
    } else if (branch.rootResidue !== null || branch.rootPrecision !== null)
      throw new TypeError("Nonsplit local model cannot report a Qp root.");
  }
  if (expected === "split" && (roots[0] >= roots[1] || roots[0] === roots[1]))
    throw new TypeError("Split local roots must be distinct and ordered by residue.");
  return JSON.parse(canonicalJsonStringify(value)) as SageLocalExtensionResult;
};
