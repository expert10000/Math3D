/** Versioned, bounded p-adic studies pinned to an exact ZZ or QQ Project parent. */
import { canonicalJsonStringify, isStableDocumentId, isStructuralHash,
  type StableDocumentId, type StructuralHash } from "./documentIdentity";
import type { AlgebraObjectRef } from "./algebraObjects";
import type { Math3DProject } from "./math3dProject";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";

export const SAGE_PADIC_FORMAT = "math3d.sage-padic-workspace" as const;
export const SAGE_PADIC_RESULT_FORMAT = "math3d.sage-padic-workspace-result" as const;
export type PadicRational = Readonly<{ numerator: string; denominator: string }>;
export type SagePadicInput = Readonly<{ format: typeof SAGE_PADIC_FORMAT; schemaVersion: 1;
  projectId: StableDocumentId; target: AlgebraObjectRef; targetHash: StructuralHash;
  domain: "Zp" | "Qp"; prime: number; precision: number;
  a: PadicRational; b: PadicRational;
  hensel: Readonly<{ coefficients: readonly string[]; seed: number }> | null }>;
export type SagePadicEntry = Readonly<{ source: PadicRational; text: string;
  zeroStatus: "known-nonzero" | "undetermined" | "exact-zero";
  valuation: number | null; absolutePrecision: number | null; relativePrecision: number;
  digits: readonly number[]; precisionLost: boolean }>;
export type SagePadicResult = Readonly<{ format: typeof SAGE_PADIC_RESULT_FORMAT; schemaVersion: 1;
  target: AlgebraObjectRef; targetHash: StructuralHash; domain: "Zp" | "Qp";
  prime: number; precision: number;
  entries: Readonly<{ a: SagePadicEntry; b: SagePadicEntry; sum: SagePadicEntry; product: SagePadicEntry }>;
  hensel: Readonly<{ coefficients: readonly string[]; seed: number; rootResidue: string; modulus: string;
    absolutePrecision: number; relativePrecision: number; zeroStatus: "known-nonzero" | "undetermined";
    text: string }> | null }>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const same = (a: unknown, b: unknown) => canonicalJsonStringify(a) === canonicalJsonStringify(b);
const signed = (value: unknown, digits: number): value is string => typeof value === "string" &&
  new RegExp(`^(?:0|-?[1-9][0-9]{0,${digits - 1}})$`).test(value);
const positive = (value: unknown, digits: number): value is string => typeof value === "string" &&
  new RegExp(`^[1-9][0-9]{0,${digits - 1}}$`).test(value);
const abs = (value: bigint) => value < 0n ? -value : value;
const gcd = (a: bigint, b: bigint): bigint => { let x = abs(a), y = abs(b);
  while (y) [x, y] = [y, x % y]; return x; };
const fraction = (n: bigint, d: bigint): PadicRational => {
  if (d <= 0n) throw new TypeError("p-adic denominator must be positive.");
  const divisor = gcd(n, d);
  return { numerator: String(n / divisor), denominator: String(d / divisor) };
};
const rational = (value: unknown, digits: number, integral = false): PadicRational => {
  if (!object(value) || !exact(value, ["numerator", "denominator"]) ||
      !signed(value.numerator, digits) || !positive(value.denominator, digits))
    throw new TypeError("p-adic operands require bounded canonical rational pairs.");
  const checked = fraction(BigInt(value.numerator), BigInt(value.denominator));
  if (!same(value, checked) || (integral && checked.denominator !== "1"))
    throw new TypeError("p-adic operands must be reduced and integral for Zp.");
  return checked;
};
const primes = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31]);
const polynomial = (value: unknown, p: number) => {
  if (value === null) return null;
  if (!object(value) || !exact(value, ["coefficients", "seed"]) ||
      !Array.isArray(value.coefficients) || value.coefficients.length < 2 || value.coefficients.length > 5 ||
      !value.coefficients.every((item) => signed(item, 6)) || value.coefficients.at(-1) === "0" ||
      !Number.isSafeInteger(value.seed) || (value.seed as number) < 0 || (value.seed as number) >= p)
    throw new TypeError("Hensel input requires a bounded polynomial and residue seed.");
  const coefficients = value.coefficients.map((item: string) => BigInt(item));
  const seed = BigInt(value.seed as number), prime = BigInt(p);
  const evaluate = (derivative: boolean) => coefficients.reduce((total: bigint, item: bigint, index: number) =>
    total + (derivative ? index === 0 ? 0n : BigInt(index) * item * seed ** BigInt(index - 1)
      : item * seed ** BigInt(index)), 0n);
  if (evaluate(false) % prime !== 0n || evaluate(true) % prime === 0n)
    throw new TypeError("Hensel seed must be a simple root modulo p.");
  return { coefficients: [...value.coefficients] as string[], seed: value.seed as number };
};

export const parsePadicRationalText = (value: string): PadicRational => {
  const parts = value.trim().split("/").map((item) => item.trim());
  if (parts.length > 2) throw new TypeError("Enter an integer or reduced rational a/b.");
  return rational({ numerator: parts[0], denominator: parts[1] ?? "1" }, 15);
};

export const parseSagePadicInput = (value: unknown): SagePadicInput => {
  if (!object(value) || !exact(value, ["format", "schemaVersion", "projectId", "target", "targetHash",
    "domain", "prime", "precision", "a", "b", "hensel"]) || value.format !== SAGE_PADIC_FORMAT ||
    value.schemaVersion !== 1 || !isStableDocumentId(value.projectId) ||
    !object(value.target) || !exact(value.target, ["objectId", "revision"]) ||
    !isStableDocumentId(value.target.objectId) || !Number.isSafeInteger(value.target.revision) ||
    (value.target.revision as number) < 1 || !isStructuralHash(value.targetHash) ||
    (value.domain !== "Zp" && value.domain !== "Qp") || !primes.has(value.prime as number) ||
    !Number.isSafeInteger(value.precision) || (value.precision as number) < 2 || (value.precision as number) > 16)
    throw new TypeError("Invalid versioned pinned p-adic workspace input (p ≤ 31, precision 2–16).");
  const domain = value.domain as "Zp" | "Qp", prime = value.prime as number;
  const a = rational(value.a, 15, domain === "Zp"), b = rational(value.b, 15, domain === "Zp");
  const hensel = polynomial(value.hensel, prime);
  return { format: SAGE_PADIC_FORMAT, schemaVersion: 1, projectId: value.projectId as StableDocumentId,
    target: value.target as AlgebraObjectRef, targetHash: value.targetHash as StructuralHash,
    domain, prime, precision: value.precision as number, a, b, hensel };
};

export const validateSagePadicSnapshot = (value: unknown, projectId: StableDocumentId,
  objects: readonly ProjectAlgebraObjectEntry[]): SagePadicInput => {
  const input = parseSagePadicInput(value);
  const record = objects.find((item) => item.id === input.target.objectId)?.revisions[input.target.revision - 1];
  if (input.projectId !== projectId || record?.contentHash !== input.targetHash ||
      record.kind !== (input.domain === "Zp" ? "integer-ring" : "rational-field"))
    throw new TypeError("p-adic request differs from its pinned ZZ or QQ Project parent.");
  return input;
};

export const buildSagePadicInput = (project: Math3DProject, target: AlgebraObjectRef,
  args: Pick<SagePadicInput, "prime" | "precision" | "a" | "b" | "hensel">): SagePadicInput => {
  const record = project.algebraObjects?.find((item) => item.id === target.objectId)?.revisions[target.revision - 1];
  if (!record || (record.kind !== "integer-ring" && record.kind !== "rational-field"))
    throw new TypeError("Select a saved ZZ or QQ parent for p-adic exploration.");
  return validateSagePadicSnapshot({ format: SAGE_PADIC_FORMAT, schemaVersion: 1,
    projectId: project.identity.id, target, targetHash: record.contentHash,
    domain: record.kind === "integer-ring" ? "Zp" : "Qp", ...args },
  project.identity.id, project.algebraObjects ?? []);
};

const add = (a: PadicRational, b: PadicRational) => fraction(BigInt(a.numerator) * BigInt(b.denominator) +
  BigInt(b.numerator) * BigInt(a.denominator), BigInt(a.denominator) * BigInt(b.denominator));
const multiply = (a: PadicRational, b: PadicRational) => fraction(BigInt(a.numerator) * BigInt(b.numerator),
  BigInt(a.denominator) * BigInt(b.denominator));
const valuation = (value: bigint, prime: bigint) => { let item = abs(value), count = 0;
  while (item && item % prime === 0n) { item /= prime; count += 1; } return count; };
const modulo = (value: bigint, modulus: bigint) => (value % modulus + modulus) % modulus;
const inverse = (value: bigint, modulus: bigint) => { let a = modulo(value, modulus), b = modulus;
  let x = 1n, y = 0n;
  while (b) { const quotient = a / b; [a, b] = [b, a % b]; [x, y] = [y, x - quotient * y]; }
  if (a !== 1n) throw new TypeError("p-adic unit denominator is not invertible.");
  return modulo(x, modulus);
};

/** Recomputes exact rational sources, unit digits and Hensel congruence on Project import. */
export const parseSagePadicResult = (value: unknown, rawInput: SagePadicInput): SagePadicResult => {
  const input = parseSagePadicInput(rawInput), p = BigInt(input.prime), n = input.precision;
  if (!object(value) || !exact(value, ["format", "schemaVersion", "target", "targetHash", "domain",
    "prime", "precision", "entries", "hensel"]) || value.format !== SAGE_PADIC_RESULT_FORMAT ||
    value.schemaVersion !== 1 || !same(value.target, input.target) || value.targetHash !== input.targetHash ||
    value.domain !== input.domain || value.prime !== input.prime || value.precision !== n ||
    !object(value.entries) || !exact(value.entries, ["a", "b", "sum", "product"]))
    throw new TypeError("p-adic result does not match its pinned request.");
  const expected = { a: input.a, b: input.b, sum: add(input.a, input.b), product: multiply(input.a, input.b) };
  for (const key of ["a", "b", "sum", "product"] as const) {
    const entry = value.entries[key], source = expected[key];
    if (!object(entry) || !exact(entry, ["source", "text", "zeroStatus", "valuation", "absolutePrecision",
      "relativePrecision", "digits", "precisionLost"]) || !same(entry.source, source) ||
      typeof entry.text !== "string" || !entry.text || entry.text.length > 512 ||
      !Number.isSafeInteger(entry.relativePrecision) || (entry.relativePrecision as number) < 0 ||
      (entry.relativePrecision as number) > n || !Array.isArray(entry.digits) ||
      !entry.digits.every((digit) => Number.isSafeInteger(digit) && digit >= 0 && digit < input.prime) ||
      typeof entry.precisionLost !== "boolean")
      throw new TypeError(`Invalid exact p-adic ${key} result.`);
    const numerator = BigInt(source.numerator), denominator = BigInt(source.denominator);
    const exactValuation = numerator === 0n ? null : valuation(numerator, p) - valuation(denominator, p);
    const relative = entry.relativePrecision as number, digits = entry.digits as number[];
    if (entry.zeroStatus === "known-nonzero") {
      if (exactValuation === null || entry.valuation !== exactValuation || relative < 1 ||
          entry.absolutePrecision !== exactValuation + relative || digits.length !== relative || digits[0] === 0 ||
          entry.precisionLost !== (relative < n)) throw new TypeError(`Invalid p-adic ${key} precision labels.`);
      const numeratorUnit = numerator / p ** BigInt(valuation(numerator, p));
      const denominatorUnit = denominator / p ** BigInt(valuation(denominator, p));
      const modulus = p ** BigInt(relative);
      let residue = modulo(numeratorUnit * inverse(denominatorUnit, modulus), modulus);
      const expectedDigits = Array.from({ length: relative }, () => { const digit = Number(residue % p);
        residue /= p; return digit; });
      if (!same(digits, expectedDigits)) throw new TypeError(`p-adic ${key} unit digits disagree with exact arithmetic.`);
    } else if (entry.zeroStatus === "undetermined") {
      const absolute = entry.absolutePrecision;
      if (!Number.isSafeInteger(absolute) || (absolute as number) < -64 || (absolute as number) > 128 ||
          relative !== 0 || digits.length !== 0 || entry.valuation !== null || entry.precisionLost !== true ||
          (exactValuation !== null && exactValuation < (absolute as number)))
        throw new TypeError(`p-adic ${key} incorrectly claims zero at its finite precision.`);
    } else if (entry.zeroStatus === "exact-zero") {
      if (numerator !== 0n || entry.absolutePrecision !== null || entry.valuation !== null ||
          relative !== 0 || digits.length !== 0 || entry.precisionLost !== false)
        throw new TypeError(`p-adic ${key} exact-zero label is unsupported.`);
    } else throw new TypeError(`Unknown p-adic ${key} zero status.`);
  }
  const lifted = value.hensel;
  if (input.hensel === null) { if (lifted !== null) throw new TypeError("Unexpected Hensel result."); }
  else {
    if (!object(lifted) || !exact(lifted, ["coefficients", "seed", "rootResidue", "modulus",
      "absolutePrecision", "relativePrecision", "zeroStatus", "text"]) ||
      !same(lifted.coefficients, input.hensel.coefficients) || lifted.seed !== input.hensel.seed ||
      lifted.modulus !== String(p ** BigInt(n)) || !positive(lifted.rootResidue, 32) && lifted.rootResidue !== "0" ||
      lifted.absolutePrecision !== n || !Number.isSafeInteger(lifted.relativePrecision) ||
      (lifted.relativePrecision as number) < 0 || (lifted.relativePrecision as number) > n ||
      typeof lifted.text !== "string" || !lifted.text || lifted.text.length > 512)
      throw new TypeError("Invalid precision-explicit Hensel result.");
    const root = BigInt(lifted.rootResidue as string), modulus = p ** BigInt(n);
    const rootValuation = root === 0n ? n : valuation(root, p);
    const polynomialValue = input.hensel.coefficients.reduce((total, item, index) =>
      total + BigInt(item) * root ** BigInt(index), 0n);
    if (root < 0n || root >= modulus || modulo(root, p) !== BigInt(input.hensel.seed) ||
        modulo(polynomialValue, modulus) !== 0n ||
        lifted.relativePrecision !== (root === 0n ? 0 : n - rootValuation) ||
        lifted.zeroStatus !== (root === 0n ? "undetermined" : "known-nonzero"))
      throw new TypeError("Hensel root or precision labels do not satisfy the exact lifting conditions.");
  }
  return JSON.parse(canonicalJsonStringify(value)) as SagePadicResult;
};
