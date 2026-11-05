/** Complete, bounded GAP dossier for an immutable E01 finite-group revision. */
import { canonicalJsonStringify, isStableDocumentId, isStructuralHash,
  type StableDocumentId, type StructuralHash } from "./documentIdentity";
import type { AlgebraObjectRef } from "./algebraObjects";
import { analyzeFiniteGroup, parseFiniteGroupDefinition, type FiniteGroupDefinition } from "./finiteGroup";
import type { Math3DProject } from "./math3dProject";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";

export const SAGE_GROUP_FORMAT = "math3d.sage-finite-group-operation";
export const SAGE_GROUP_RESULT_FORMAT = "math3d.sage-finite-group-result";
export type SageFiniteGroupInput = Readonly<{ format: typeof SAGE_GROUP_FORMAT; schemaVersion: 1;
  projectId: StableDocumentId; target: AlgebraObjectRef; targetHash: StructuralHash;
  definition: FiniteGroupDefinition }>;
export type SageFiniteGroupResult = Readonly<{ format: typeof SAGE_GROUP_RESULT_FORMAT; schemaVersion: 1;
  order: number; actionDegree: number; gapVersion: string; elements: readonly (readonly number[])[];
  center: readonly number[]; conjugacyClasses: readonly (readonly number[])[];
  subgroups: readonly Readonly<{ members: readonly number[]; normal: boolean }>[]; complete: true }>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" &&
  !Array.isArray(value);
const exact = (value: Record<string, unknown>, fields: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...fields].sort().join("|");
const key = (value: readonly number[]) => value.join(",");
const compose = (a: readonly number[], b: readonly number[]) => b.map((image) => a[image - 1]);
const listCompare = (a: readonly number[], b: readonly number[]) => {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

export const finiteGroupAction = (definition: FiniteGroupDefinition): Readonly<{
  degree: number; generators: readonly (readonly number[])[]; elements: readonly (readonly number[])[] }> => {
  const checked = parseFiniteGroupDefinition(definition);
  const order = analyzeFiniteGroup(checked).order;
  const degree = checked.representation === "permutation" ? checked.degree :
    checked.invariantFactors.reduce((sum, factor) => sum + factor, 0);
  if (order > 16 || degree > 8)
    throw new TypeError("GAP group dossier requires order at most 16 and permutation action degree at most 8.");
  const generators = checked.representation === "permutation" ? checked.generators.map((item) => item.images) :
    checked.invariantFactors.map((factor, index) => {
      const offset = checked.invariantFactors.slice(0, index).reduce((sum, item) => sum + item, 0);
      return Array.from({ length: degree }, (_, position) => position >= offset && position < offset + factor
        ? offset + ((position - offset + 1) % factor) + 1 : position + 1);
    });
  const identity = Array.from({ length: degree }, (_, index) => index + 1);
  const elements = new Map<string, number[]>([[key(identity), identity]]), queue = [identity];
  while (queue.length) {
    const current = queue.shift()!;
    for (const generator of generators) {
      const next = compose(current, generator);
      if (!elements.has(key(next))) { elements.set(key(next), next); queue.push(next); }
    }
  }
  if (elements.size !== order) throw new TypeError("Group action does not match its saved order.");
  return { degree, generators, elements: [...elements.values()].sort((a, b) => {
    for (let i = 0; i < degree; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  }) };
};

export const parseSageFiniteGroupInput = (value: unknown): SageFiniteGroupInput => {
  if (!object(value) || !exact(value, ["format", "schemaVersion", "projectId", "target", "targetHash", "definition"]) ||
      value.format !== SAGE_GROUP_FORMAT || value.schemaVersion !== 1 || !isStableDocumentId(value.projectId) ||
      !object(value.target) || !exact(value.target, ["objectId", "revision"]) ||
      !isStableDocumentId(value.target.objectId) || !Number.isSafeInteger(value.target.revision) ||
      (value.target.revision as number) < 1 || !isStructuralHash(value.targetHash))
    throw new TypeError("Invalid pinned finite-group operation input.");
  const definition = parseFiniteGroupDefinition(value.definition);
  finiteGroupAction(definition);
  return JSON.parse(canonicalJsonStringify(value)) as SageFiniteGroupInput;
};

export const validateSageFiniteGroupSnapshot = (input: SageFiniteGroupInput, projectId: StableDocumentId,
  objects: readonly ProjectAlgebraObjectEntry[]): SageFiniteGroupInput => {
  const parsed = parseSageFiniteGroupInput(input);
  const record = objects.find((item) => item.id === parsed.target.objectId)?.revisions[parsed.target.revision - 1];
  if (parsed.projectId !== projectId || record?.kind !== "finite-group" || record.contentHash !== parsed.targetHash ||
      canonicalJsonStringify(record.definition) !== canonicalJsonStringify(parsed.definition))
    throw new TypeError("GAP request differs from its pinned finite-group definition.");
  return parsed;
};

export const buildSageFiniteGroupInput = (project: Math3DProject,
  target: AlgebraObjectRef): SageFiniteGroupInput => {
  const record = project.algebraObjects?.find((item) => item.id === target.objectId)?.revisions[target.revision - 1];
  if (record?.kind !== "finite-group" || record.definition.kind !== "finite-group")
    throw new TypeError("Select a saved finite group.");
  return validateSageFiniteGroupSnapshot({ format: SAGE_GROUP_FORMAT, schemaVersion: 1,
    projectId: project.identity.id, target, targetHash: record.contentHash, definition: record.definition },
  project.identity.id, project.algebraObjects ?? []);
};

/** Rebuilds the complete bounded subgroup lattice and conjugacy partition independently of Sage. */
export const parseSageFiniteGroupResult = (value: unknown, input: SageFiniteGroupInput): SageFiniteGroupResult => {
  const action = finiteGroupAction(parseSageFiniteGroupInput(input).definition), elements = action.elements;
  const n = elements.length, indexes = new Map(elements.map((element, index) => [key(element), index]));
  const product = elements.map((a) => elements.map((b) => indexes.get(key(compose(a, b)))!));
  const identity = indexes.get(key(Array.from({ length: action.degree }, (_, i) => i + 1)))!;
  const inverse = elements.map((_, i) => product[i].findIndex((item) => item === identity));
  const conjugate = (g: number, h: number) => product[product[g][h]][inverse[g]];
  const center = elements.map((_, i) => i).filter((i) => elements.every((_, j) => product[i][j] === product[j][i]));
  const remaining = new Set(elements.map((_, i) => i)), classes: number[][] = [];
  while (remaining.size) {
    const h = Math.min(...remaining), members = [...new Set(elements.map((_, g) => conjugate(g, h)))].sort((a, b) => a - b);
    classes.push(members); members.forEach((item) => remaining.delete(item));
  }
  classes.sort(listCompare);
  const closure = (seeds: readonly number[]) => {
    const members = new Set([identity, ...seeds]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const a of [...members]) for (const b of [...members]) {
        const c = product[a][b];
        if (!members.has(c)) { members.add(c); changed = true; }
      }
    }
    return [...members].sort((a, b) => a - b);
  };
  const seen = new Map<string, number[]>(), queue = [closure([])];
  seen.set(key(queue[0]), queue[0]);
  while (queue.length) {
    const subgroup = queue.shift()!;
    for (let i = 0; i < n; i += 1) {
      if (subgroup.includes(i)) continue;
      const next = closure([...subgroup, i]), signature = key(next);
      if (!seen.has(signature)) { seen.set(signature, next); queue.push(next); }
    }
  }
  const subgroups = [...seen.values()].sort(listCompare).map((members) => ({ members,
    normal: elements.every((_, g) => members.every((h) => members.includes(conjugate(g, h)))) }));
  if (!object(value) || !exact(value, ["format", "schemaVersion", "order", "actionDegree", "gapVersion",
    "elements", "center", "conjugacyClasses", "subgroups", "complete"]) ||
    value.format !== SAGE_GROUP_RESULT_FORMAT || value.schemaVersion !== 1 || value.order !== n ||
    value.actionDegree !== action.degree || value.complete !== true || typeof value.gapVersion !== "string" ||
    !/^[0-9][A-Za-z0-9.+-]{0,39}$/.test(value.gapVersion) ||
    canonicalJsonStringify(value.elements) !== canonicalJsonStringify(elements) ||
    canonicalJsonStringify(value.center) !== canonicalJsonStringify(center) ||
    canonicalJsonStringify(value.conjugacyClasses) !== canonicalJsonStringify(classes) ||
    canonicalJsonStringify(value.subgroups) !== canonicalJsonStringify(subgroups))
    throw new TypeError("GAP group result disagrees with the pinned exact group action or complete invariants.");
  return JSON.parse(canonicalJsonStringify(value)) as SageFiniteGroupResult;
};
