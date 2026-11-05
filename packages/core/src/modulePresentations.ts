/** Bounded exact module presentations and maps; no Smith or Gröbner classification is inferred. */
import type { AlgebraObjectRef } from "./algebraObjects";
import { parseIdealGenerator } from "./algebraIdealGenerators";

export const MAX_MODULE_RANK = 6;
export type ModuleDefinition = Readonly<{ kind: "module"; baseRing: AlgebraObjectRef;
  ambientRank: number; generators: readonly string[];
  relationMap: Readonly<{ domainRank: number; codomainRank: number;
    matrix: readonly (readonly string[])[] }> }>;
export type ModuleMapDefinition = Readonly<{ kind: "module-map"; sourceModule: AlgebraObjectRef;
  targetModule: AlgebraObjectRef; domainRank: number; codomainRank: number;
  matrix: readonly (readonly string[])[] }>;
export type ModuleScalarRing = Readonly<{ kind: "integer-ring" }> | Readonly<{ kind: "rational-field" }> |
  Readonly<{ kind: "polynomial-ring"; variables: readonly string[] }>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value: Record<string, unknown>, fields: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...fields].sort().join("|");
const rank = (value: unknown, allowZero = false): value is number => Number.isSafeInteger(value) &&
  (value as number) >= (allowZero ? 0 : 1) && (value as number) <= MAX_MODULE_RANK;
const generatorName = (value: unknown): value is string => typeof value === "string" &&
  /^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(value);
const integer = (value: string) => /^(?:0|-?[1-9][0-9]{0,17})$/.test(value);
const gcd = (a: bigint, b: bigint): bigint => {
  let left = a < 0n ? -a : a, right = b;
  while (right) [left, right] = [right, left % right];
  return left;
};
const boundedEntry = (value: unknown): string => {
  if (typeof value !== "string" || value.length > 96) throw new TypeError("Module matrix entries must be short exact expressions.");
  return parseIdealGenerator(value);
};

/** Matrix rows are target coordinates; columns are source generators. */
export const parseModuleMatrix = (value: unknown, rows: number, columns: number): readonly (readonly string[])[] => {
  if (!Array.isArray(value) || value.length !== rows || !value.every((row) =>
      Array.isArray(row) && row.length === columns))
    throw new TypeError(`Module map matrix must have ${rows} rows and ${columns} columns.`);
  return value.map((row: unknown[]) => row.map(boundedEntry));
};

export const parseModuleDefinition = (value: unknown): ModuleDefinition => {
  if (!object(value) || !exact(value, ["kind", "baseRing", "ambientRank", "generators", "relationMap"]) ||
      value.kind !== "module" || !rank(value.ambientRank) || !Array.isArray(value.generators) ||
      value.generators.length !== value.ambientRank || !value.generators.every(generatorName) ||
      new Set(value.generators).size !== value.generators.length || !object(value.relationMap) ||
      !exact(value.relationMap, ["domainRank", "codomainRank", "matrix"]) ||
      !rank(value.relationMap.domainRank, true) || value.relationMap.codomainRank !== value.ambientRank)
    throw new TypeError("Module requires 1–6 named ambient generators and a typed relation map R^m → R^n.");
  return { kind: "module", baseRing: value.baseRing as AlgebraObjectRef,
    ambientRank: value.ambientRank as number, generators: [...value.generators],
    relationMap: { domainRank: value.relationMap.domainRank as number,
      codomainRank: value.ambientRank as number,
      matrix: parseModuleMatrix(value.relationMap.matrix, value.ambientRank as number,
        value.relationMap.domainRank as number) } };
};

export const parseModuleMapDefinition = (value: unknown): ModuleMapDefinition => {
  if (!object(value) || !exact(value, ["kind", "sourceModule", "targetModule", "domainRank", "codomainRank", "matrix"]) ||
      value.kind !== "module-map" || !rank(value.domainRank) || !rank(value.codomainRank))
    throw new TypeError("Module map requires pinned source and target modules with ranks 1–6.");
  return { kind: "module-map", sourceModule: value.sourceModule as AlgebraObjectRef,
    targetModule: value.targetModule as AlgebraObjectRef, domainRank: value.domainRank as number,
    codomainRank: value.codomainRank as number,
    matrix: parseModuleMatrix(value.matrix, value.codomainRank as number, value.domainRank as number) };
};

/** Ring-specific scalar check runs after the Project registry resolves the pinned parent ring. */
export const validateModuleMatrixScalars = (matrix: readonly (readonly string[])[], ring: ModuleScalarRing): void => {
  for (const row of matrix) for (const entry of row) {
    if (ring.kind === "integer-ring") {
      if (!integer(entry)) throw new TypeError("ZZ module matrices require canonical integer entries.");
    } else if (ring.kind === "rational-field") {
      const parts = entry.split("/");
      if (parts.length === 1) {
        if (!integer(entry)) throw new TypeError("QQ module matrices require canonical rational entries.");
      } else if (parts.length !== 2 || !integer(parts[0]) || !/^[1-9][0-9]{0,17}$/.test(parts[1]) ||
          BigInt(parts[1] || "0") < 2n || parts[0] === "0" || gcd(BigInt(parts[0]), BigInt(parts[1])) !== 1n) {
        throw new TypeError("QQ module matrices require reduced rational entries with positive denominators.");
      }
    } else {
      if (parseIdealGenerator(entry, ring.variables) !== entry)
        throw new TypeError("Polynomial module entries must use canonical ambient-ring variables.");
    }
  }
};

export const modulePresentationLabel = (definition: ModuleDefinition, ringLabel: string): string =>
  definition.relationMap.domainRank === 0 ? `${ringLabel}^${definition.ambientRank}` :
    `${ringLabel}^${definition.ambientRank} / im(A: ${ringLabel}^${definition.relationMap.domainRank} → ${ringLabel}^${definition.ambientRank})`;
