import { canonicalJsonStringify, isStableDocumentId, isStructuralHash,
  type StableDocumentId, type StructuralHash } from "./documentIdentity";
import type { AlgebraObjectRef } from "./algebraObjects";
import type { Math3DProject } from "./math3dProject";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";

export const SAGE_GALOIS_FORMAT = "math3d.sage-galois-analysis";
export const SAGE_GALOIS_RESULT_FORMAT = "math3d.sage-galois-analysis-result";
export type SageGaloisInput = Readonly<{ format: typeof SAGE_GALOIS_FORMAT; schemaVersion: 1;
  projectId: StableDocumentId; target: AlgebraObjectRef; targetHash: StructuralHash;
  coefficientField: Readonly<AlgebraObjectRef & { contentHash: StructuralHash }>;
  variable: string; polynomial: string }>;
export type SageGaloisSubgroup = Readonly<{ id: string; members: readonly number[]; order: number; normal: boolean;
  fixedField: Readonly<{ degree: number; polynomial: string | null; generatorImage: string | null;
    relationVerified: true }> }>;
export type SageGaloisResult = Readonly<{ format: typeof SAGE_GALOIS_RESULT_FORMAT; schemaVersion: 1;
  sourcePolynomial: string; variable: string; coefficientDomain: "QQ"; irreducible: true; squareFree: true;
  splittingField: Readonly<{ degree: number; definingPolynomial: string }>;
  group: Readonly<{ order: number; regularDegree: number; transitiveId: string;
    classification: "D4" | "unclassified"; convention: string; solvable: boolean;
    elements: readonly (readonly number[])[]; generators: readonly number[] }>;
  subgroups: readonly SageGaloisSubgroup[]; complete: true }>;
export type SageGaloisCover = Readonly<{ lower: string; upper: string }>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value: Record<string, unknown>, fields: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...fields].sort().join("|");
const ref = (value: unknown): value is AlgebraObjectRef => object(value) && exact(value, ["objectId", "revision"]) &&
  isStableDocumentId(value.objectId) && Number.isSafeInteger(value.revision) && (value.revision as number) > 0;
const short = (value: unknown, limit = 4096): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= limit;
const permutation = (value: unknown, degree: number): value is number[] => Array.isArray(value) &&
  value.length === degree && value.every((item) => Number.isSafeInteger(item) && item >= 1 && item <= degree) &&
  new Set(value).size === degree;
const compose = (a: readonly number[], b: readonly number[]) => b.map((image) => a[image - 1]);
const permutationKey = (value: readonly number[]) => value.join(",");
const subset = (a: readonly number[], b: readonly number[]) => a.every((item) => b.includes(item));

/** The input pins the QQ[x] object and its exact QQ parent; no executable source is accepted. */
export const parseSageGaloisInput = (value: unknown): SageGaloisInput => {
  if (!object(value) || !exact(value, ["format", "schemaVersion", "projectId", "target", "targetHash",
    "coefficientField", "variable", "polynomial"]) || value.format !== SAGE_GALOIS_FORMAT ||
    value.schemaVersion !== 1 || !isStableDocumentId(value.projectId) || !ref(value.target) ||
    !isStructuralHash(value.targetHash) || !object(value.coefficientField) ||
    !exact(value.coefficientField, ["objectId", "revision", "contentHash"]) ||
    !ref({ objectId: value.coefficientField.objectId, revision: value.coefficientField.revision }) ||
    !isStructuralHash(value.coefficientField.contentHash) ||
    typeof value.variable !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value.variable) ||
    typeof value.polynomial !== "string" || value.polynomial.length > 120 ||
    !/^[A-Za-z0-9_+\-*/^()\s]+$/.test(value.polynomial) ||
    value.polynomial.includes("**") || /\^\s*(?:\(|-|\+)/.test(value.polynomial) ||
    [...value.polynomial.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].some((match) => match[0] !== value.variable) ||
    [...value.polynomial.matchAll(/[0-9]+/g)].some((match) => match[0].length > 6) ||
    [...value.polynomial.matchAll(/\^\s*([0-9]+)/g)].some((match) => Number(match[1]) > 4))
    throw new TypeError("Galois analysis requires a bounded polynomial in a pinned QQ[x] ring.");
  return JSON.parse(canonicalJsonStringify(value)) as SageGaloisInput;
};

export const validateSageGaloisSnapshot = (input: SageGaloisInput, projectId: StableDocumentId,
  objects: readonly ProjectAlgebraObjectEntry[]): SageGaloisInput => {
  const parsed = parseSageGaloisInput(input);
  const ring = objects.find((item) => item.id === parsed.target.objectId)
    ?.revisions[parsed.target.revision - 1];
  if (parsed.projectId !== projectId || ring?.definition.kind !== "polynomial-ring" ||
    ring.contentHash !== parsed.targetHash || ring.definition.variables.length !== 1 ||
    ring.definition.variables[0] !== parsed.variable ||
    ring.definition.coefficientDomain.objectId !== parsed.coefficientField.objectId ||
    ring.definition.coefficientDomain.revision !== parsed.coefficientField.revision)
    throw new TypeError("Galois request differs from its pinned QQ[x] ring.");
  const field = objects.find((item) => item.id === parsed.coefficientField.objectId)
    ?.revisions[parsed.coefficientField.revision - 1];
  if (field?.kind !== "rational-field" || field.contentHash !== parsed.coefficientField.contentHash)
    throw new TypeError("Galois request requires its pinned QQ coefficient field.");
  return parsed;
};

export const buildSageGaloisInput = (project: Math3DProject, target: AlgebraObjectRef,
  polynomial: string): SageGaloisInput => {
  const ring = project.algebraObjects?.find((item) => item.id === target.objectId)?.revisions[target.revision - 1];
  if (ring?.definition.kind !== "polynomial-ring" || ring.definition.variables.length !== 1)
    throw new TypeError("Galois analysis requires a saved univariate QQ polynomial ring.");
  const parent = ring.definition.coefficientDomain;
  const field = project.algebraObjects?.find((item) => item.id === parent.objectId)?.revisions[parent.revision - 1];
  if (field?.kind !== "rational-field") throw new TypeError("Galois analysis requires a direct QQ coefficient field.");
  return validateSageGaloisSnapshot({ format: SAGE_GALOIS_FORMAT, schemaVersion: 1,
    projectId: project.identity.id, target, targetHash: ring.contentHash,
    coefficientField: { ...parent, contentHash: field.contentHash },
    variable: ring.definition.variables[0], polynomial }, project.identity.id, project.algebraObjects ?? []);
};

/** Independent finite-permutation and subgroup checks before retaining Sage's fixed-field claims. */
export const parseSageGaloisResult = (value: unknown, input: SageGaloisInput): SageGaloisResult => {
  const source = parseSageGaloisInput(input);
  if (!object(value) || !exact(value, ["format", "schemaVersion", "sourcePolynomial", "variable",
    "coefficientDomain", "irreducible", "squareFree", "splittingField", "group", "subgroups", "complete"]) ||
    value.format !== SAGE_GALOIS_RESULT_FORMAT || value.schemaVersion !== 1 ||
    value.sourcePolynomial !== source.polynomial || value.variable !== source.variable ||
    value.coefficientDomain !== "QQ" || value.irreducible !== true || value.squareFree !== true ||
    value.complete !== true || !object(value.splittingField) ||
    !exact(value.splittingField, ["degree", "definingPolynomial"]) ||
    !short(value.splittingField.definingPolynomial) || !object(value.group) ||
    !exact(value.group, ["order", "regularDegree", "transitiveId", "classification", "convention",
      "solvable", "elements", "generators"])) throw new TypeError("Invalid bounded Galois result schema.");
  const group = value.group;
  const n = group.order;
  if (!Number.isSafeInteger(n) || (n as number) < 2 || (n as number) > 8 ||
    group.regularDegree !== n || value.splittingField.degree !== n ||
    typeof group.transitiveId !== "string" || !/^[2-4]T[1-9][0-9]?$/.test(group.transitiveId) ||
    !["D4", "unclassified"].includes(String(group.classification)) ||
    typeof group.convention !== "string" || group.convention.length > 200 ||
    group.solvable !== true || !Array.isArray(group.elements) || group.elements.length !== n ||
    !group.elements.every((item) => permutation(item, n as number)) ||
    !Array.isArray(group.generators) || !group.generators.length || group.generators.length > 4 ||
    !group.generators.every((item) => Number.isSafeInteger(item) && item >= 0 && item < (n as number)))
    throw new TypeError("Galois group exceeds the bounded permutation contract.");
  const elements = group.elements as number[][];
  const keys = elements.map(permutationKey), lookup = new Map(keys.map((key, index) => [key, index]));
  if (lookup.size !== n || keys[0] !== Array.from({ length: n as number }, (_, index) => index + 1).join(","))
    throw new TypeError("Galois group must list distinct permutations beginning with identity.");
  for (const a of elements) for (const b of elements)
    if (!lookup.has(permutationKey(compose(a, b)))) throw new TypeError("Galois permutations are not closed under composition.");
  const closure = (generators: readonly number[]): number[] => {
    const found = new Set<number>([0]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const a of [...found]) for (const b of generators) {
        const index = lookup.get(permutationKey(compose(elements[a], elements[b])))!;
        if (!found.has(index)) { found.add(index); changed = true; }
      }
    }
    return [...found].sort((a, b) => a - b);
  };
  if (closure(group.generators as number[]).length !== n)
    throw new TypeError("Galois generators do not generate the reported group.");
  const orderOf = (element: number[]): number => {
    let power = elements[0], count = 0;
    do { power = compose(power, element); count += 1; } while (permutationKey(power) !== keys[0] && count <= 8);
    return count;
  };
  const isD4 = n === 8 && elements.filter((item) => orderOf(item) === 2).length === 5 &&
    elements.filter((item) => orderOf(item) === 4).length === 2;
  if ((group.classification === "D4") !== isD4 ||
      group.convention !== (isD4 ? "D4 = symmetries of a square, order 8" : ""))
    throw new TypeError("Galois group classification or D4 convention differs from its permutations.");
  if (!Array.isArray(value.subgroups) || value.subgroups.length < 2 || value.subgroups.length > 16)
    throw new TypeError("Galois subgroup list is outside the reviewed bound.");
  const subgroups = value.subgroups as Record<string, unknown>[];
  const sets: number[][] = [];
  for (const [index, subgroup] of subgroups.entries()) {
    if (!object(subgroup) || !exact(subgroup, ["id", "members", "order", "normal", "fixedField"]) ||
      subgroup.id !== `H${index}` || !Array.isArray(subgroup.members) ||
      !subgroup.members.length || subgroup.members.length > (n as number) ||
      !subgroup.members.every((item) => Number.isSafeInteger(item) && item >= 0 && item < (n as number)) ||
      new Set(subgroup.members).size !== subgroup.members.length ||
      subgroup.members[0] !== 0 || !subgroup.members.every((item, i) => i === 0 || item > (subgroup.members as number[])[i - 1]) ||
      subgroup.order !== subgroup.members.length || (n as number) % (subgroup.order as number) !== 0 ||
      typeof subgroup.normal !== "boolean" || !object(subgroup.fixedField) ||
      !exact(subgroup.fixedField, ["degree", "polynomial", "generatorImage", "relationVerified"]) ||
      subgroup.fixedField.degree !== (n as number) / (subgroup.order as number) ||
      subgroup.fixedField.relationVerified !== true ||
      (subgroup.fixedField.degree === 1
        ? subgroup.fixedField.polynomial !== null || subgroup.fixedField.generatorImage !== null
        : !short(subgroup.fixedField.polynomial) || !short(subgroup.fixedField.generatorImage)))
      throw new TypeError("Galois subgroup or fixed-field degree is invalid.");
    const members = subgroup.members as number[];
    for (const a of members) for (const b of members)
      if (!members.includes(lookup.get(permutationKey(compose(elements[a], elements[b])))!))
        throw new TypeError("Galois subgroup is not closed.");
    const normal = elements.every((g) => members.every((h) => {
      const inverse = elements.findIndex((candidate) =>
        permutationKey(compose(g, candidate)) === keys[0]);
      const conjugate = compose(compose(g, elements[h]), elements[inverse]);
      return members.includes(lookup.get(permutationKey(conjugate))!);
    }));
    if (subgroup.normal !== normal) throw new TypeError("Galois subgroup normality does not match its permutations.");
    sets.push(members);
  }
  const all = new Set<string>();
  for (let mask = 1; mask < (1 << (n as number)); mask += 1) {
    if (!(mask & 1)) continue;
    const members = Array.from({ length: n as number }, (_, index) => index).filter((index) => mask & (1 << index));
    if (members.every((a) => members.every((b) =>
      members.includes(lookup.get(permutationKey(compose(elements[a], elements[b])))!)))) all.add(members.join(","));
  }
  if (all.size !== sets.length || new Set(sets.map((item) => item.join(","))).size !== all.size ||
      sets.some((item) => !all.has(item.join(","))))
    throw new TypeError("Galois subgroup enumeration is incomplete or duplicated.");
  return JSON.parse(canonicalJsonStringify(value)) as SageGaloisResult;
};

/** Covers reverse under the Galois correspondence: H⊂J means L^J⊂L^H. */
export const sageGaloisCovers = (result: SageGaloisResult): readonly SageGaloisCover[] => {
  const subgroups = result.subgroups;
  return subgroups.flatMap((lower) => subgroups.filter((upper) => lower.order < upper.order &&
    subset(lower.members, upper.members) && !subgroups.some((middle) => lower.order < middle.order &&
      middle.order < upper.order && subset(lower.members, middle.members) && subset(middle.members, upper.members)))
    .map((upper) => ({ lower: lower.id, upper: upper.id })));
};
