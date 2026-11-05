/** Pinned, bounded finite-field arithmetic and independent result verification. */
import { canonicalJsonStringify, type StructuralHash } from "./documentIdentity";
import { type AlgebraObjectRef } from "./algebraObjects";
import { buildSageAlgebraReconstructionInput, parseSageAlgebraReconstructionInput,
  type SageAlgebraReconstructionInput } from "./sageAlgebraReconstruction";
import type { Math3DProject } from "./math3dProject";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";

export const SAGE_FINITE_FIELD_FORMAT = "math3d.sage-finite-field-explorer" as const;
export const SAGE_FINITE_FIELD_RESULT_FORMAT = "math3d.sage-finite-field-explorer-result" as const;
export type SageFiniteFieldInput = Readonly<{ format: typeof SAGE_FINITE_FIELD_FORMAT; schemaVersion: 1;
  algebra: SageAlgebraReconstructionInput; element: readonly number[] }>;
export type SageFiniteFieldResult = Readonly<{
  format: typeof SAGE_FINITE_FIELD_RESULT_FORMAT; schemaVersion: 1; target: AlgebraObjectRef;
  targetHash: StructuralHash; characteristic: number; degree: number; order: number;
  generator: string; construction: "canonical"; definingPolynomial: readonly number[] | null;
  selected: Readonly<{ coefficients: readonly number[]; text: string;
    frobeniusOrbit: readonly (readonly number[])[]; trace: string; norm: string;
    minimalPolynomial: readonly number[]; multiplicativeOrder: number | null; primitive: boolean }>;
  elements: readonly Readonly<{ coefficients: readonly number[]; text: string }>[];
  primitiveElements: readonly (readonly number[])[];
  multiplicationTable: Readonly<{ status: "complete"; cells: readonly (readonly number[])[] }> |
    Readonly<{ status: "unavailable"; reason: string }>;
}>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" &&
  !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const same = (a: unknown, b: unknown) => canonicalJsonStringify(a) === canonicalJsonStringify(b);
const vector = (value: unknown, n: number, p: number): value is number[] =>
  Array.isArray(value) && value.length === n && value.every((item) => Number.isSafeInteger(item) && item >= 0 && item < p);

export const parseSageFiniteFieldInput = (value: unknown): SageFiniteFieldInput => {
  if (!object(value) || !exact(value, ["format", "schemaVersion", "algebra", "element"]) ||
      value.format !== SAGE_FINITE_FIELD_FORMAT || value.schemaVersion !== 1)
    throw new TypeError("Invalid versioned finite-field explorer input.");
  const algebra = parseSageAlgebraReconstructionInput(value.algebra);
  const record = algebra.objects.at(-1)!;
  if (record.definition.kind !== "finite-field") throw new TypeError("Finite-field explorer requires a pinned finite field.");
  const { characteristic: p, degree: n } = record.definition;
  if (p ** n > 64) throw new TypeError("Finite-field explorer supports at most 64 elements.");
  if (!vector(value.element, n, p)) throw new TypeError("Element coefficients must be a canonical base-p vector of the field degree.");
  return { format: SAGE_FINITE_FIELD_FORMAT, schemaVersion: 1, algebra, element: [...value.element] };
};

export const buildSageFiniteFieldInput = (project: Math3DProject, target: AlgebraObjectRef,
  element: readonly number[]): SageFiniteFieldInput => parseSageFiniteFieldInput({
    format: SAGE_FINITE_FIELD_FORMAT, schemaVersion: 1,
    algebra: buildSageAlgebraReconstructionInput(project, target), element,
  });

export const validateSageFiniteFieldSnapshot = (value: unknown, projectId: string,
  objects: readonly ProjectAlgebraObjectEntry[]): SageFiniteFieldInput => {
  const input = parseSageFiniteFieldInput(value);
  const record = input.algebra.objects.at(-1)!;
  const saved = objects.find((item) => item.id === record.id)?.revisions[record.revision - 1];
  if (input.algebra.projectId !== projectId || !saved || !same(saved, record))
    throw new TypeError("Finite-field explorer input differs from its pinned Project field.");
  return input;
};

/** Checks every reported small-field operation using polynomial arithmetic modulo Sage's reported modulus. */
export const parseSageFiniteFieldResult = (value: unknown, rawInput: SageFiniteFieldInput): SageFiniteFieldResult => {
  const input = parseSageFiniteFieldInput(rawInput);
  const source = input.algebra.objects.at(-1)!;
  if (source.definition.kind !== "finite-field") throw new TypeError("Invalid finite-field source.");
  const { characteristic: p, degree: n, generator } = source.definition, q = p ** n;
  if (!object(value) || !exact(value, ["format", "schemaVersion", "target", "targetHash", "characteristic",
    "degree", "order", "generator", "construction", "definingPolynomial", "selected", "elements",
    "primitiveElements", "multiplicationTable"]) || value.format !== SAGE_FINITE_FIELD_RESULT_FORMAT ||
    value.schemaVersion !== 1 || !same(value.target, input.algebra.target) ||
    value.targetHash !== source.contentHash || value.characteristic !== p || value.degree !== n ||
    value.order !== q || value.generator !== generator || value.construction !== "canonical")
    throw new TypeError("Finite-field result does not match its pinned definition.");
  const modulus = value.definingPolynomial;
  if (n === 1 ? modulus !== null : !Array.isArray(modulus) || modulus.length !== n + 1 ||
      modulus[n] !== 1 || !modulus.every((item) => Number.isSafeInteger(item) && item >= 0 && item < p))
    throw new TypeError("Invalid finite-field defining polynomial.");
  const mod = (x: number) => ((x % p) + p) % p;
  const zero = Array<number>(n).fill(0), one = [1, ...Array<number>(n - 1).fill(0)];
  const add = (a: readonly number[], b: readonly number[]) => a.map((item, i) => mod(item + b[i]));
  const mul = (a: readonly number[], b: readonly number[]) => {
    const product = Array<number>(2 * n - 1).fill(0);
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) product[i + j] = mod(product[i + j] + a[i] * b[j]);
    if (n > 1) for (let degree = product.length - 1; degree >= n; degree -= 1) {
      const coefficient = product[degree];
      for (let i = 0; i < n; i += 1) product[degree - n + i] = mod(product[degree - n + i] - coefficient * (modulus as number[])[i]);
    }
    return product.slice(0, n);
  };
  const power = (a: readonly number[], exponent: number) => {
    let result = one, base = [...a], remaining = exponent;
    while (remaining) { if (remaining % 2) result = mul(result, base); base = mul(base, base); remaining = Math.floor(remaining / 2); }
    return result;
  };
  const vectors = Array.from({ length: q }, (_, index) => {
    const coefficients = Array<number>(n).fill(0); let remaining = index;
    for (let i = n - 1; i >= 0; i -= 1) { coefficients[i] = remaining % p; remaining = Math.floor(remaining / p); }
    return coefficients;
  });
  const indexOf = (a: readonly number[]) => a.reduce((index, item) => index * p + item, 0);
  const orderOf = (a: readonly number[]) => {
    if (same(a, zero)) return null;
    let current = one;
    for (let exponent = 1; exponent <= q - 1; exponent += 1) {
      current = mul(current, a);
      if (same(current, one)) return exponent;
    }
    throw new TypeError("Reported defining polynomial does not produce a finite field.");
  };
  const orders = vectors.map(orderOf);
  if (!Array.isArray(value.elements) || value.elements.length !== q ||
      value.elements.some((item, i) => !object(item) || !exact(item, ["coefficients", "text"]) ||
        !same(item.coefficients, vectors[i]) || typeof item.text !== "string" || !item.text || item.text.length > 120))
    throw new TypeError("Finite-field element enumeration is incomplete or out of order.");
  const primitive = vectors.filter((_, i) => orders[i] === q - 1);
  if (!same(value.primitiveElements, primitive)) throw new TypeError("Finite-field primitive elements disagree with exact multiplication.");
  const selected = value.selected, chosen = input.element;
  if (!object(selected) || !exact(selected, ["coefficients", "text", "frobeniusOrbit", "trace", "norm",
    "minimalPolynomial", "multiplicativeOrder", "primitive"]) || !same(selected.coefficients, chosen) ||
    selected.text !== (value.elements[indexOf(chosen)] as Record<string, unknown>).text ||
    selected.multiplicativeOrder !== orders[indexOf(chosen)] || selected.primitive !== (orders[indexOf(chosen)] === q - 1))
    throw new TypeError("Selected finite-field element differs from the exact field.");
  const orbit: number[][] = [], seen = new Set<number>(); let conjugate = [...chosen];
  while (!seen.has(indexOf(conjugate))) { seen.add(indexOf(conjugate)); orbit.push(conjugate); conjugate = power(conjugate, p); }
  if (!same(conjugate, chosen) || !same(selected.frobeniusOrbit, orbit) || n % orbit.length)
    throw new TypeError("Finite-field Frobenius orbit is incorrect.");
  let trace = zero, norm = one, current = [...chosen];
  for (let i = 0; i < n; i += 1) { trace = add(trace, current); norm = mul(norm, current); current = power(current, p); }
  if (trace.some((item, i) => i > 0 && item !== 0) || norm.some((item, i) => i > 0 && item !== 0) ||
      selected.trace !== String(trace[0]) || selected.norm !== String(norm[0]))
    throw new TypeError("Finite-field trace or norm is incorrect.");
  const minimal = selected.minimalPolynomial;
  if (!Array.isArray(minimal) || minimal.length !== orbit.length + 1 || minimal.at(-1) !== 1 ||
      !minimal.every((item) => Number.isSafeInteger(item) && item >= 0 && item < p))
    throw new TypeError("Finite-field minimal polynomial is malformed.");
  let evaluation = zero;
  for (let i = minimal.length - 1; i >= 0; i -= 1) evaluation = add(mul(evaluation, chosen), [minimal[i], ...zero.slice(1)]);
  if (!same(evaluation, zero)) throw new TypeError("Finite-field minimal polynomial does not annihilate the selected element.");
  const table = value.multiplicationTable;
  if (!object(table) || (q <= 16 ? !exact(table, ["status", "cells"]) || table.status !== "complete" ||
      !same(table.cells, vectors.map((a) => vectors.map((b) => indexOf(mul(a, b))))) :
    !exact(table, ["status", "reason"]) || table.status !== "unavailable" ||
      typeof table.reason !== "string" || !table.reason.includes("16 elements")))
    throw new TypeError("Finite-field multiplication table does not match its declared bound or products.");
  return JSON.parse(canonicalJsonStringify(value)) as SageFiniteFieldResult;
};
