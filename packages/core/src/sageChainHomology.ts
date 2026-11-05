/** Revision-pinned ZZ chain homology with independently checked Smith witnesses. */
import { canonicalJsonStringify, isStableDocumentId, isStructuralHash,
  type StableDocumentId, type StructuralHash } from "./documentIdentity";
import type { AlgebraObjectRef } from "./algebraObjects";
import { parseChainComplexDefinition, resolveChainComplex, chainBoundaryProduct,
  type ChainComplexDefinition } from "./chainComplex";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";
import type { Math3DProject } from "./math3dProject";
import { parseSageIntegerMatrixFormsInput, parseSageIntegerMatrixFormsResult,
  type SageIntegerMatrixFormsResult } from "./sageIntegerMatrixForms";

export const SAGE_CHAIN_FORMAT = "math3d.sage-chain-homology";
export const SAGE_CHAIN_RESULT_FORMAT = "math3d.sage-chain-homology-result";
type Smith = SageIntegerMatrixFormsResult["smith"];
export type SageChainHomologyInput = Readonly<{ format: typeof SAGE_CHAIN_FORMAT; schemaVersion: 1;
  projectId: StableDocumentId; target: AlgebraObjectRef; targetHash: StructuralHash;
  definition: ChainComplexDefinition; dimensions: readonly [number, number, number];
  boundary1: readonly (readonly string[])[]; boundary2: readonly (readonly string[])[] }>;
export type SageChainHomologyGroup = Readonly<{ degree: 0 | 1 | 2; freeRank: number;
  torsionOrders: readonly string[] }>;
export type SageChainHomologyResult = Readonly<{ format: typeof SAGE_CHAIN_RESULT_FORMAT; schemaVersion: 1;
  coefficientDomain: "ZZ"; dimensions: readonly [number, number, number];
  boundary1Smith: Smith; inverseRight: readonly (readonly string[])[];
  restrictedBoundary2Smith: Smith | null;
  groups: readonly [SageChainHomologyGroup, SageChainHomologyGroup, SageChainHomologyGroup] }>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const canonical = (value: unknown, digits = 128): value is string => typeof value === "string" &&
  new RegExp(`^(?:0|-?[1-9][0-9]{0,${digits - 1}})$`).test(value);
const matrixShape = (value: unknown, rows: number, columns: number, digits = 128): value is string[][] =>
  Array.isArray(value) && value.length === rows && value.every((row) => Array.isArray(row) &&
    row.length === columns && row.every((entry: unknown) => canonical(entry, digits)));
const parseRef = (value: unknown, path: string): AlgebraObjectRef => {
  if (!object(value) || !exact(value, ["objectId", "revision"]) || !isStableDocumentId(value.objectId) ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 1)
    throw new TypeError(`${path} must pin an object ID and positive revision.`);
  return value as AlgebraObjectRef;
};
const multiply = (left: readonly (readonly bigint[])[], right: readonly (readonly bigint[])[]) =>
  left.map((row) => right[0].map((_, column) => row.reduce((sum, entry, i) => sum + entry * right[i][column], 0n)));
const bigMatrix = (matrix: readonly (readonly string[])[]) => matrix.map((row) => row.map(BigInt));
const sameMatrix = (a: readonly (readonly bigint[])[], b: readonly (readonly bigint[])[]) =>
  a.length === b.length && a.every((row, i) => row.length === b[i].length && row.every((v, j) => v === b[i][j]));
const identity = (size: number) => Array.from({ length: size }, (_, i) =>
  Array.from({ length: size }, (_, j) => i === j ? 1n : 0n));

export const parseSageChainHomologyInput = (value: unknown): SageChainHomologyInput => {
  if (!object(value) || !exact(value, ["format", "schemaVersion", "projectId", "target", "targetHash",
    "definition", "dimensions", "boundary1", "boundary2"]) || value.format !== SAGE_CHAIN_FORMAT ||
    value.schemaVersion !== 1 || !isStableDocumentId(value.projectId) || !isStructuralHash(value.targetHash) ||
    !Array.isArray(value.dimensions) || value.dimensions.length !== 3 ||
    !value.dimensions.every((rank) => Number.isSafeInteger(rank) && rank >= 1 && rank <= 6))
    throw new TypeError("Invalid versioned pinned ZZ chain-homology input.");
  parseRef(value.target, "target");
  parseChainComplexDefinition(value.definition, parseRef);
  const [n0, n1, n2] = value.dimensions as number[];
  if (!matrixShape(value.boundary1, n0, n1, 18) || !matrixShape(value.boundary2, n1, n2, 18) ||
      chainBoundaryProduct(value.boundary1, value.boundary2).some((row) => row.some((entry) => entry !== "0")))
    throw new TypeError("Chain boundaries must have exact compatible dimensions and satisfy d1·d2=0.");
  return JSON.parse(canonicalJsonStringify(value)) as SageChainHomologyInput;
};

export const validateSageChainHomologySnapshot = (value: unknown, projectId: StableDocumentId,
  objects: readonly ProjectAlgebraObjectEntry[]): SageChainHomologyInput => {
  const input = parseSageChainHomologyInput(value);
  const record = objects.find((entry) => entry.id === input.target.objectId)?.revisions[input.target.revision - 1];
  if (input.projectId !== projectId || record?.definition.kind !== "chain-complex" ||
      record.contentHash !== input.targetHash ||
      canonicalJsonStringify(record.definition) !== canonicalJsonStringify(input.definition))
    throw new TypeError("Chain-homology request differs from its pinned Project object.");
  const resolved = resolveChainComplex(record.definition, objects);
  if (canonicalJsonStringify(resolved.dimensions) !== canonicalJsonStringify(input.dimensions) ||
      canonicalJsonStringify(resolved.boundary1) !== canonicalJsonStringify(input.boundary1) ||
      canonicalJsonStringify(resolved.boundary2) !== canonicalJsonStringify(input.boundary2))
    throw new TypeError("Chain-homology matrices differ from their pinned module maps.");
  return input;
};

export const buildSageChainHomologyInput = (project: Math3DProject,
  target: AlgebraObjectRef): SageChainHomologyInput => {
  const record = project.algebraObjects?.find((entry) => entry.id === target.objectId)?.revisions[target.revision - 1];
  if (record?.definition.kind !== "chain-complex") throw new TypeError("Select a saved ZZ chain complex.");
  const resolved = resolveChainComplex(record.definition, project.algebraObjects ?? []);
  return validateSageChainHomologySnapshot({ format: SAGE_CHAIN_FORMAT, schemaVersion: 1,
    projectId: project.identity.id, target, targetHash: record.contentHash, definition: record.definition,
    dimensions: resolved.dimensions, boundary1: resolved.boundary1, boundary2: resolved.boundary2 },
  project.identity.id, project.algebraObjects ?? []);
};

const verifySmith = (value: unknown, matrix: readonly (readonly string[])[]): Smith => {
  const rows = matrix.length, columns = matrix[0].length;
  const diagonal = object(value) ? value.diagonal : null;
  const rank = Array.isArray(diagonal) ? diagonal.filter((entry) => entry !== "0").length : -1;
  const forms = parseSageIntegerMatrixFormsResult({ format: "math3d.sage-integer-matrix-forms-result",
    schemaVersion: 1, coefficientDomain: "ZZ", sourceMatrix: matrix, inputShape: [rows, columns], rank,
    smith: value, hermite: { form: matrix, transformation: { status: "unavailable", reason: "Not requested for homology." } },
    cokernel: { freeRank: rows - rank, torsionOrders: Array.isArray(diagonal)
      ? diagonal.filter((entry) => typeof entry === "string" && BigInt(entry) > 1n) : [] } },
  parseSageIntegerMatrixFormsInput({ format: "math3d.sage-integer-matrix-forms", schemaVersion: 1, matrix }, 128), 128);
  if (forms.smith.transformations.status !== "verified")
    throw new TypeError("Chain homology requires exact unimodular Smith witnesses.");
  return forms.smith;
};
const rankOf = (smith: Smith) => smith.diagonal.filter((entry) => entry !== "0").length;
const torsionOf = (smith: Smith) => smith.diagonal.filter((entry) => BigInt(entry) > 1n);

export const parseSageChainHomologyResult = (value: unknown,
  input: SageChainHomologyInput): SageChainHomologyResult => {
  const source = parseSageChainHomologyInput(input), [n0, n1, n2] = source.dimensions;
  if (!object(value) || !exact(value, ["format", "schemaVersion", "coefficientDomain", "dimensions",
    "boundary1Smith", "inverseRight", "restrictedBoundary2Smith", "groups"]) ||
    value.format !== SAGE_CHAIN_RESULT_FORMAT || value.schemaVersion !== 1 || value.coefficientDomain !== "ZZ" ||
    canonicalJsonStringify(value.dimensions) !== canonicalJsonStringify(source.dimensions) ||
    !matrixShape(value.inverseRight, n1, n1) || !Array.isArray(value.groups) || value.groups.length !== 3)
    throw new TypeError("Invalid exact ZZ chain-homology result envelope.");
  const d1Smith = verifySmith(value.boundary1Smith, source.boundary1);
  if (d1Smith.transformations.status !== "verified") throw new TypeError("Missing boundary Smith witness.");
  const right = bigMatrix(d1Smith.transformations.right), inverse = bigMatrix(value.inverseRight);
  if (!sameMatrix(multiply(right, inverse), identity(n1)) || !sameMatrix(multiply(inverse, right), identity(n1)))
    throw new TypeError("Kernel basis inverse does not invert the Smith column transformation.");
  const r1 = rankOf(d1Smith), kernelRank = n1 - r1;
  const transformed = multiply(inverse, bigMatrix(source.boundary2));
  if (transformed.slice(0, r1).some((row) => row.some((entry) => entry !== 0n)))
    throw new TypeError("Boundary d2 does not lie in the exact kernel of d1.");
  const restrictedMatrix = transformed.slice(r1).map((row) => row.map(String));
  const restricted = kernelRank ? verifySmith(value.restrictedBoundary2Smith, restrictedMatrix) : null;
  if (!kernelRank && value.restrictedBoundary2Smith !== null)
    throw new TypeError("A zero-rank kernel has no restricted boundary matrix.");
  const r2 = restricted ? rankOf(restricted) : 0;
  const expected = [
    { degree: 0, freeRank: n0 - r1, torsionOrders: torsionOf(d1Smith) },
    { degree: 1, freeRank: kernelRank - r2, torsionOrders: restricted ? torsionOf(restricted) : [] },
    { degree: 2, freeRank: n2 - r2, torsionOrders: [] },
  ];
  if (!value.groups.every((group, index) => object(group) && exact(group, ["degree", "freeRank", "torsionOrders"]) &&
      canonicalJsonStringify(group) === canonicalJsonStringify(expected[index])))
    throw new TypeError("Homology groups disagree with verified kernels, images and Smith factors.");
  return { format: SAGE_CHAIN_RESULT_FORMAT, schemaVersion: 1, coefficientDomain: "ZZ",
    dimensions: source.dimensions, boundary1Smith: d1Smith, inverseRight: value.inverseRight,
    restrictedBoundary2Smith: restricted, groups: expected as SageChainHomologyResult["groups"] };
};
