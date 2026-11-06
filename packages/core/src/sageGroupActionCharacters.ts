/** Bounded natural permutation representation and exact character checks for a saved finite group. */
import { canonicalJsonStringify, type StableDocumentId } from "./documentIdentity";
import type { AlgebraObjectRef } from "./algebraObjects";
import type { FiniteGroupDefinition } from "./finiteGroup";
import { buildSageFiniteGroupInput, finiteGroupAction, parseSageFiniteGroupInput,
  validateSageFiniteGroupSnapshot, type SageFiniteGroupInput } from "./sageFiniteGroupOperations";
import type { Math3DProject } from "./math3dProject";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";

export type SageGroupActionInput = SageFiniteGroupInput & Readonly<{ point: number }>;
export type SageGroupActionResult = Readonly<{ format: "math3d.sage-group-action-result"; schemaVersion: 1;
  order: number; actionDegree: number; point: number; gapVersion: string;
  orbit: readonly number[]; stabilizer: readonly number[];
  generatorMatrices: readonly (readonly (readonly number[])[])[];
  permutationCharacter: readonly number[]; conjugacyClasses: readonly (readonly number[])[];
  characterStatus: "integer-table" | "nonintegral-table";
  irreducibleCharacters: readonly (readonly number[])[] | null;
  multiplicities: readonly number[] | null }>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const same = (a: unknown, b: unknown) => canonicalJsonStringify(a) === canonicalJsonStringify(b);
const key = (value: readonly number[]) => value.join(",");
const compose = (a: readonly number[], b: readonly number[]) => b.map((image) => a[image - 1]);
const listCompare = (a: readonly number[], b: readonly number[]) => {
  if (a.length !== b.length) return a.length - b.length;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
};

const baseInput = (input: SageGroupActionInput): SageFiniteGroupInput => ({ format: input.format,
  schemaVersion: input.schemaVersion, projectId: input.projectId, target: input.target,
  targetHash: input.targetHash, definition: input.definition });

export const parseSageGroupActionInput = (value: unknown): SageGroupActionInput => {
  if (!object(value) || !exact(value, ["format", "schemaVersion", "projectId", "target", "targetHash", "definition", "point"]))
    throw new TypeError("Group action requires a versioned pinned group and selected point.");
  const base = parseSageFiniteGroupInput({ format: value.format, schemaVersion: value.schemaVersion,
    projectId: value.projectId, target: value.target, targetHash: value.targetHash,
    definition: value.definition });
  const degree = finiteGroupAction(base.definition).degree;
  if (!Number.isSafeInteger(value.point) || (value.point as number) < 1 || (value.point as number) > degree)
    throw new TypeError(`Choose an action point from 1 to ${degree}.`);
  return { ...base, point: value.point as number };
};

export const validateSageGroupActionSnapshot = (input: SageGroupActionInput,
  projectId: StableDocumentId, objects: readonly ProjectAlgebraObjectEntry[]): SageGroupActionInput => {
  const checked = parseSageGroupActionInput(input);
  validateSageFiniteGroupSnapshot(baseInput(checked), projectId, objects);
  return checked;
};

export const buildSageGroupActionInput = (project: Math3DProject, target: AlgebraObjectRef,
  point: number): SageGroupActionInput => parseSageGroupActionInput({
    ...buildSageFiniteGroupInput(project, target), point });

const generatorMatrices = (definition: FiniteGroupDefinition) => {
  const action = finiteGroupAction(definition);
  return action.generators.map((images) => Array.from({ length: action.degree }, (_, row) =>
    Array.from({ length: action.degree }, (_, column) => Number(images[column] === row + 1))));
};

/** Independently checks the action and integer-valued character orthogonality before saving evidence. */
export const parseSageGroupActionResult = (value: unknown, input: SageGroupActionInput): SageGroupActionResult => {
  const checked = parseSageGroupActionInput(input);
  const action = finiteGroupAction(checked.definition), elements = action.elements, n = elements.length;
  const indexes = new Map(elements.map((element, index) => [key(element), index]));
  const identity = indexes.get(key(Array.from({ length: action.degree }, (_, index) => index + 1)))!;
  const product = elements.map((a) => elements.map((b) => indexes.get(key(compose(a, b)))!));
  const inverse = elements.map((_, index) => product[index].findIndex((item) => item === identity));
  const classes: number[][] = [];
  const remaining = new Set(elements.map((_, index) => index));
  while (remaining.size) {
    const representative = Math.min(...remaining);
    const members = [...new Set(elements.map((_, g) => product[product[g][representative]][inverse[g]]))]
      .sort((a, b) => a - b);
    classes.push(members);
    members.forEach((member) => remaining.delete(member));
  }
  classes.sort(listCompare);
  const orbit = [...new Set(elements.map((element) => element[checked.point - 1]))].sort((a, b) => a - b);
  const stabilizer = elements.map((element, index) => element[checked.point - 1] === checked.point ? index : -1)
    .filter((index) => index >= 0);
  const character = elements.map((element) => element.filter((image, index) => image === index + 1).length);
  const expected = { format: "math3d.sage-group-action-result", schemaVersion: 1,
    order: n, actionDegree: action.degree, point: checked.point, orbit, stabilizer,
    generatorMatrices: generatorMatrices(checked.definition), permutationCharacter: character,
    conjugacyClasses: classes };
  if (!object(value) || !exact(value, [...Object.keys(expected), "gapVersion", "characterStatus",
      "irreducibleCharacters", "multiplicities"]) ||
      Object.entries(expected).some(([name, item]) => !same(value[name], item)) ||
      typeof value.gapVersion !== "string" || !/^[0-9][A-Za-z0-9.+-]{0,39}$/.test(value.gapVersion) ||
      orbit.length * stabilizer.length !== n ||
      (value.characterStatus !== "integer-table" && value.characterStatus !== "nonintegral-table"))
    throw new TypeError("Group action result differs from the pinned exact permutation representation.");
  if (checked.definition.representation === "abelian" &&
      value.characterStatus !== (checked.definition.invariantFactors.every((factor) => factor === 2)
        ? "integer-table" : "nonintegral-table"))
    throw new TypeError("Abelian character-table status differs from its exact invariant factors.");
  if (value.characterStatus === "nonintegral-table") {
    if (value.irreducibleCharacters !== null || value.multiplicities !== null)
      throw new TypeError("Nonintegral character table must be explicitly unavailable.");
  } else {
    const rows = value.irreducibleCharacters, multiplicities = value.multiplicities;
    if (!Array.isArray(rows) || rows.length !== classes.length || !rows.every((row) => Array.isArray(row) &&
        row.length === classes.length && row.every((item) => Number.isSafeInteger(item) && Math.abs(item) <= n)) ||
        !Array.isArray(multiplicities) || multiplicities.length !== rows.length ||
        !multiplicities.every((item) => Number.isSafeInteger(item) && item >= 0 && item <= action.degree))
      throw new TypeError("Invalid bounded integer character table.");
    const typedRows = rows as number[][], typedMultiplicities = multiplicities as number[];
    const classCharacter = classes.map((members) => character[members[0]]);
    const weighted = (a: readonly number[], b: readonly number[]) =>
      a.reduce((sum, item, index) => sum + item * b[index] * classes[index].length, 0);
    const identityColumn = classes.findIndex((members) => members.includes(identity));
    if (!typedRows.some((row) => row.every((item) => item === 1)) ||
        typedRows.reduce((sum, row) => sum + row[identityColumn] ** 2, 0) !== n ||
        typedRows.some((row, index) => row[identityColumn] < 1 ||
          typedRows.some((other, j) => weighted(row, other) !== (index === j ? n : 0)) ||
          weighted(row, classCharacter) !== n * typedMultiplicities[index]) ||
        typedRows.reduce((sum, row, index) => sum + row[identityColumn] * typedMultiplicities[index], 0) !== action.degree ||
        typedMultiplicities[typedRows.findIndex((row) => row.every((item) => item === 1))] !==
          classCharacter.reduce((sum, item, index) => sum + item * classes[index].length, 0) / n)
      throw new TypeError("Character orthogonality or permutation decomposition differs from the exact action.");
  }
  const serialized = canonicalJsonStringify(value);
  if (new TextEncoder().encode(serialized).length > 16_384)
    throw new TypeError("Group action result exceeds the 16 KiB bound.");
  return JSON.parse(serialized) as SageGroupActionResult;
};
