/** Bounded three-degree chain complexes built from saved ZZ free modules and maps. */
import type { AlgebraObjectRef } from "./algebraObjects";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";

export type ChainComplexDefinition = Readonly<{ kind: "chain-complex"; coefficientRing: AlgebraObjectRef;
  modules: readonly [AlgebraObjectRef, AlgebraObjectRef, AlgebraObjectRef];
  boundaries: readonly [AlgebraObjectRef, AlgebraObjectRef] }>;
export type ResolvedChainComplex = Readonly<{ dimensions: readonly [number, number, number];
  boundary1: readonly (readonly string[])[]; boundary2: readonly (readonly string[])[] }>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const sameRef = (a: AlgebraObjectRef, b: AlgebraObjectRef) =>
  a.objectId === b.objectId && a.revision === b.revision;

export const parseChainComplexDefinition = (value: unknown,
  parseRef: (value: unknown, path: string) => AlgebraObjectRef): ChainComplexDefinition => {
  if (!object(value) || !exact(value, ["kind", "coefficientRing", "modules", "boundaries"]) ||
      value.kind !== "chain-complex" || !Array.isArray(value.modules) || value.modules.length !== 3 ||
      !Array.isArray(value.boundaries) || value.boundaries.length !== 2)
    throw new TypeError("Chain complex requires pinned C0, C1, C2 modules and d1, d2 maps.");
  return { kind: "chain-complex", coefficientRing: parseRef(value.coefficientRing, "definition.coefficientRing"),
    modules: value.modules.map((ref, index) => parseRef(ref, `definition.modules[${index}]`)) as unknown as ChainComplexDefinition["modules"],
    boundaries: value.boundaries.map((ref, index) => parseRef(ref, `definition.boundaries[${index}]`)) as unknown as ChainComplexDefinition["boundaries"] };
};

/** Exact matrix product uses BigInt; equality is a mathematical chain condition, not a display heuristic. */
export const chainBoundaryProduct = (d1: readonly (readonly string[])[], d2: readonly (readonly string[])[]):
  readonly (readonly string[])[] => d1.map((row) => d2[0].map((_, column) =>
    row.reduce((sum, entry, index) => sum + BigInt(entry) * BigInt(d2[index][column]), 0n).toString()));

export const resolveChainComplex = (definition: ChainComplexDefinition,
  objects: readonly ProjectAlgebraObjectEntry[]): ResolvedChainComplex => {
  const lookup = (ref: AlgebraObjectRef) => objects.find((entry) => entry.id === ref.objectId)
    ?.revisions[ref.revision - 1];
  const ring = lookup(definition.coefficientRing);
  const groups = definition.modules.map(lookup);
  const maps = definition.boundaries.map(lookup);
  if (ring?.definition.kind !== "integer-ring") throw new TypeError("Chain complex requires a pinned ZZ coefficient ring.");
  for (let degree = 0; degree < 3; degree += 1) {
    const group = groups[degree];
    if (group?.definition.kind !== "module" || group.definition.relationMap.domainRank !== 0 ||
        !sameRef(group.definition.baseRing, definition.coefficientRing))
      throw new TypeError(`C${degree} must be a pinned free module over the same ZZ ring.`);
  }
  for (let degree = 1; degree <= 2; degree += 1) {
    const map = maps[degree - 1];
    if (map?.definition.kind !== "module-map" ||
        !sameRef(map.definition.sourceModule, definition.modules[degree]) ||
        !sameRef(map.definition.targetModule, definition.modules[degree - 1]))
      throw new TypeError(`d${degree} must be a pinned map C${degree} → C${degree - 1}.`);
  }
  const dimensions = groups.map((group) => (group!.definition as { ambientRank: number }).ambientRank) as
    unknown as ResolvedChainComplex["dimensions"];
  const boundary1 = (maps[0]!.definition as { matrix: readonly (readonly string[])[] }).matrix;
  const boundary2 = (maps[1]!.definition as { matrix: readonly (readonly string[])[] }).matrix;
  if (chainBoundaryProduct(boundary1, boundary2).some((row) => row.some((value) => value !== "0")))
    throw new TypeError("Chain condition d1·d2 = 0 failed over ZZ.");
  return { dimensions, boundary1, boundary2 };
};

export const chainComplexLabel = (definition: ChainComplexDefinition,
  objects: readonly ProjectAlgebraObjectEntry[]): string => {
  const { dimensions } = resolveChainComplex(definition, objects);
  return `ZZ^${dimensions[2]} → ZZ^${dimensions[1]} → ZZ^${dimensions[0]} (d1·d2=0)`;
};

