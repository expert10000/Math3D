import { canonicalJsonStringify, type StructuralHash } from "./documentIdentity";
import { type AlgebraObjectRef } from "./algebraObjects";
import { type Math3DProject } from "./math3dProject";
import { type ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";
import { analyzeQuadraticNumberField } from "./quadraticNumberField";
import { buildSageAlgebraReconstructionInput, parseSageAlgebraReconstructionInput,
  type SageAlgebraReconstructionInput } from "./sageAlgebraReconstruction";
import { canonicalJsonByteLength } from "./scientificJobs";

export type SageNumberFieldOperation = "sage.numberField.elementDossier" | "sage.numberField.primeDecomposition";
export type SageNumberFieldInput = Readonly<{
  format: "math3d.sage-number-field-operation"; schemaVersion: 1;
  field: SageAlgebraReconstructionInput;
  element?: readonly [string, string]; prime?: number;
}>;
export type SageNumberFieldElementResult = Readonly<{
  format: "math3d.sage-number-field-result"; schemaVersion: 1; operation: "sage.numberField.elementDossier";
  target: AlgebraObjectRef; definitionHash: StructuralHash;
  element: readonly [string, string]; norm: string; trace: string;
  baseDegree: 1; relativeDegree: 2; absoluteDegree: 2; basis: readonly ["1", string];
  embeddings: readonly [Readonly<{ index: 0; generatorImage: string; elementImage: string }>,
    Readonly<{ index: 1; generatorImage: string; elementImage: string }>];
}>;
export type SageNumberFieldPrimeResult = Readonly<{
  format: "math3d.sage-number-field-result"; schemaVersion: 1; operation: "sage.numberField.primeDecomposition";
  target: AlgebraObjectRef; definitionHash: StructuralHash; prime: number;
  splitting: "split" | "inert" | "ramified";
  factors: readonly Readonly<{ ideal: string; ramificationIndex: number; residueDegree: number; norm: string }>[];
  degreeCheck: 2;
}>;
export type SageNumberFieldResult = SageNumberFieldElementResult | SageNumberFieldPrimeResult;

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const integer = (value: unknown): value is string => typeof value === "string" &&
  /^(?:0|-?[1-9][0-9]{0,3})$/.test(value) && BigInt(value) >= -4096n && BigInt(value) <= 4096n;
const prime = (value: unknown): value is number => {
  if (!Number.isSafeInteger(value) || (value as number) < 2 || (value as number) > 97) return false;
  for (let divisor = 2; divisor * divisor <= (value as number); divisor += 1)
    if ((value as number) % divisor === 0) return false;
  return true;
};
const targetDefinition = (field: SageAlgebraReconstructionInput) => {
  const target = field.objects.at(-1)!;
  const definition = target.definition;
  if (definition.kind !== "number-field") throw new TypeError("Choose a pinned number-field object.");
  const parent = field.objects.find((item) => item.id === definition.baseField.objectId &&
    item.revision === definition.baseField.revision);
  if (parent?.kind !== "rational-field") throw new TypeError("Number field requires a pinned QQ base field.");
  return { target, definition,
    facts: analyzeQuadraticNumberField(definition.definingPolynomial, definition.generator) };
};
const image = (constant: string, coefficient: string, root: string): string => {
  const u = BigInt(constant), v = BigInt(coefficient);
  if (v === 0n) return constant;
  const term = v === 1n ? root : v === -1n ? `-(${root})` : `${v}*(${root})`;
  return u === 0n ? term : term.startsWith("-") ? `${constant} - ${term.slice(1)}` : `${constant} + ${term}`;
};
const modPower = (base: bigint, exponent: bigint, modulus: bigint): bigint => {
  let result = 1n, value = ((base % modulus) + modulus) % modulus, power = exponent;
  while (power > 0n) { if (power & 1n) result = result * value % modulus;
    value = value * value % modulus; power >>= 1n; }
  return result;
};
export const quadraticPrimeSplitting = (fieldDiscriminant: string, rationalPrime: number):
  "split" | "inert" | "ramified" => {
  if (!prime(rationalPrime)) throw new TypeError("Prime decomposition requires a prime from 2 to 97.");
  const p = BigInt(rationalPrime), d = BigInt(fieldDiscriminant);
  if (d % p === 0n) return "ramified";
  if (p === 2n) return ((d % 8n) + 8n) % 8n === 1n ? "split" : "inert";
  return modPower(d, (p - 1n) / 2n, p) === 1n ? "split" : "inert";
};

export const parseSageNumberFieldInput = (value: unknown, operation: SageNumberFieldOperation): SageNumberFieldInput => {
  if (canonicalJsonByteLength(value) > 36 * 1024 || !record(value) ||
      !exact(value, ["format", "schemaVersion", "field", ...(operation === "sage.numberField.elementDossier" ? ["element"] : ["prime"])]) ||
      value.format !== "math3d.sage-number-field-operation" || value.schemaVersion !== 1)
    throw new TypeError("Invalid bounded number-field operation envelope.");
  const field = parseSageAlgebraReconstructionInput(value.field);
  targetDefinition(field);
  if (operation === "sage.numberField.elementDossier") {
    if (!Array.isArray(value.element) || value.element.length !== 2 || !value.element.every(integer))
      throw new TypeError("Element requires two canonical integer basis coefficients from -4096 to 4096.");
  } else if (!prime(value.prime)) throw new TypeError("Prime decomposition requires a prime from 2 to 97.");
  return JSON.parse(canonicalJsonStringify(value)) as SageNumberFieldInput;
};

export const buildSageNumberFieldInput = (project: Math3DProject, target: AlgebraObjectRef,
  operation: SageNumberFieldOperation, argument: readonly [string, string] | number): SageNumberFieldInput =>
  parseSageNumberFieldInput({ format: "math3d.sage-number-field-operation", schemaVersion: 1,
    field: buildSageAlgebraReconstructionInput(project, target),
    ...(operation === "sage.numberField.elementDossier" ? { element: argument } : { prime: argument }) }, operation);

export const validateSageNumberFieldSnapshot = (input: SageNumberFieldInput,
  objects: readonly ProjectAlgebraObjectEntry[]): void => {
  for (const record of input.field.objects) {
    const saved = objects.find((entry) => entry.id === record.id)?.revisions[record.revision - 1];
    if (!saved || canonicalJsonStringify(saved) !== canonicalJsonStringify(record))
      throw new TypeError("Number-field evidence has a mismatched pinned Project object snapshot.");
  }
};

export const parseSageNumberFieldResult = (value: unknown, input: SageNumberFieldInput,
  operation: SageNumberFieldOperation): SageNumberFieldResult => {
  const { target, definition, facts } = targetDefinition(input.field);
  const base = ["format", "schemaVersion", "operation", "target", "definitionHash"];
  if (!record(value) || !exact(value, [...base, ...(operation === "sage.numberField.elementDossier"
    ? ["element", "norm", "trace", "baseDegree", "relativeDegree", "absoluteDegree", "basis", "embeddings"]
    : ["prime", "splitting", "factors", "degreeCheck"])]) ||
    value.format !== "math3d.sage-number-field-result" || value.schemaVersion !== 1 || value.operation !== operation ||
    !record(value.target) || !exact(value.target, ["objectId", "revision"]) ||
    value.target.objectId !== target.id || value.target.revision !== target.revision ||
    value.definitionHash !== target.contentHash) throw new TypeError("Number-field result identity does not match its pinned object.");
  if (operation === "sage.numberField.elementDossier") {
    const element = input.element!, u = BigInt(element[0]), v = BigInt(element[1]);
    const b = BigInt(definition.definingPolynomial[1]), c = BigInt(definition.definingPolynomial[0]);
    const norm = (u * u - b * u * v + c * v * v).toString();
    const trace = (2n * u - b * v).toString();
    const embeddings = facts.embeddingImages.map((root, index) => ({ index, generatorImage: root,
      elementImage: image(element[0], element[1], root) }));
    if (canonicalJsonStringify(value.element) !== canonicalJsonStringify(element) || value.norm !== norm ||
        value.trace !== trace || value.baseDegree !== 1 || value.relativeDegree !== 2 || value.absoluteDegree !== 2 ||
        canonicalJsonStringify(value.basis) !== canonicalJsonStringify(facts.powerBasis) ||
        canonicalJsonStringify(value.embeddings) !== canonicalJsonStringify(embeddings))
      throw new TypeError("Number-field norm, trace or embeddings disagree with the pinned definition.");
  } else {
    const expected = quadraticPrimeSplitting(facts.fieldDiscriminant, input.prime!);
    const factors = value.factors;
    if (value.prime !== input.prime || value.splitting !== expected || value.degreeCheck !== 2 ||
        !Array.isArray(factors) || factors.length !== (expected === "split" ? 2 : 1) ||
        !factors.every((factor) => record(factor) && exact(factor, ["ideal", "ramificationIndex", "residueDegree", "norm"]) &&
          typeof factor.ideal === "string" && factor.ideal.length > 0 && factor.ideal.length <= 512 &&
          Number.isSafeInteger(factor.ramificationIndex) && Number.isSafeInteger(factor.residueDegree) &&
          ((expected === "split" && factor.ramificationIndex === 1 && factor.residueDegree === 1) ||
            (expected === "inert" && factor.ramificationIndex === 1 && factor.residueDegree === 2) ||
            (expected === "ramified" && factor.ramificationIndex === 2 && factor.residueDegree === 1)) &&
          factor.norm === String(input.prime! ** (factor.residueDegree as number))) ||
        new Set(factors.map((factor) => (factor as Record<string, unknown>).ideal)).size !== factors.length)
      throw new TypeError("Prime-ideal factors do not match the field discriminant and degree.");
  }
  return Object.freeze(JSON.parse(canonicalJsonStringify(value)) as SageNumberFieldResult);
};
