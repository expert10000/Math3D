/** Bounded Smith and row-Hermite workflows over a selected saved ZZ domain. */
export type SageIntegerMatrixFormsInput = Readonly<{ format: "math3d.sage-integer-matrix-forms";
  schemaVersion: 1; matrix: readonly (readonly string[])[] }>;
type SmithTransform = Readonly<{ status: "verified"; left: readonly (readonly string[])[];
  right: readonly (readonly string[])[] }> | Readonly<{ status: "unavailable"; reason: string }>;
type HermiteTransform = Readonly<{ status: "verified"; left: readonly (readonly string[])[] }> |
  Readonly<{ status: "unavailable"; reason: string }>;
export type SageIntegerMatrixFormsResult = Readonly<{
  format: "math3d.sage-integer-matrix-forms-result"; schemaVersion: 1; coefficientDomain: "ZZ";
  sourceMatrix: readonly (readonly string[])[]; inputShape: readonly [number, number]; rank: number;
  smith: Readonly<{ form: readonly (readonly string[])[]; diagonal: readonly string[];
    transformations: SmithTransform }>;
  hermite: Readonly<{ form: readonly (readonly string[])[]; transformation: HermiteTransform }>;
  cokernel: Readonly<{ freeRank: number; torsionOrders: readonly string[] }>;
}>;

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value: Record<string, unknown>, fields: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...fields].sort().join("|");
const integer = (value: unknown, digits = 128): value is string => typeof value === "string" &&
  new RegExp(`^(?:0|-?[1-9][0-9]{0,${digits - 1}})$`).test(value);
const matrixOf = (value: unknown, rows: number, columns: number, digits = 128): value is string[][] =>
  Array.isArray(value) && value.length === rows && value.every((row) => Array.isArray(row) &&
    row.length === columns && row.every((entry: unknown) => integer(entry, digits)));
const freezeMatrix = (value: readonly (readonly string[])[]) => Object.freeze(value.map((row) => Object.freeze([...row])));
const bigintMatrix = (value: readonly (readonly string[])[]) => value.map((row) => row.map(BigInt));
const equalMatrix = (left: readonly (readonly bigint[])[], right: readonly (readonly bigint[])[]) =>
  left.length === right.length && left.every((row, i) => row.length === right[i].length &&
    row.every((entry, j) => entry === right[i][j]));
const multiply = (left: readonly (readonly bigint[])[], right: readonly (readonly bigint[])[]) =>
  left.map((row) => right[0].map((_, column) => row.reduce((sum, entry, i) => sum + entry * right[i][column], 0n)));
const determinant = (value: readonly (readonly bigint[])[]): bigint => {
  if (value.length === 1) return value[0][0];
  return value[0].reduce((sum, entry, column) => sum + (column % 2 ? -entry : entry) *
    determinant(value.slice(1).map((row) => row.filter((_, i) => i !== column))), 0n);
};
const reason = (value: unknown): value is string => typeof value === "string" && !!value.trim() && value.length <= 512;

export const parseSageIntegerMatrixFormsInput = (value: unknown, digits = 18): SageIntegerMatrixFormsInput => {
  const bound = digits === 128 ? 128 : 18;
  if (!record(value) || !exact(value, ["format", "schemaVersion", "matrix"]) ||
    value.format !== "math3d.sage-integer-matrix-forms" || value.schemaVersion !== 1 ||
    !Array.isArray(value.matrix) || value.matrix.length < 1 || value.matrix.length > 6 ||
    !Array.isArray(value.matrix[0]) || value.matrix[0].length < 1 || value.matrix[0].length > 6 ||
    !matrixOf(value.matrix, value.matrix.length, value.matrix[0].length, bound)) {
    throw new TypeError(`Integer matrix forms require a 1–6 by 1–6 matrix of canonical signed decimals (${bound} digits max).`);
  }
  return Object.freeze({ format: "math3d.sage-integer-matrix-forms", schemaVersion: 1,
    matrix: freezeMatrix(value.matrix) });
};

/** Verifies invariant divisibility, cokernel ranks, and every supplied unimodular identity. */
export const parseSageIntegerMatrixFormsResult = (value: unknown,
  input: SageIntegerMatrixFormsInput, sourceDigits = 18): SageIntegerMatrixFormsResult => {
  const sourceBound = sourceDigits === 128 ? 128 : 18;
  const source = input.matrix, rows = source.length, columns = source[0].length, diagonalLength = Math.min(rows, columns);
  if (!record(value) || !exact(value, ["format", "schemaVersion", "coefficientDomain", "sourceMatrix", "inputShape",
    "rank", "smith", "hermite", "cokernel"]) || value.format !== "math3d.sage-integer-matrix-forms-result" ||
    value.schemaVersion !== 1 || value.coefficientDomain !== "ZZ" ||
    !matrixOf(value.sourceMatrix, rows, columns, sourceBound) ||
    source.some((row, i) => row.some((entry, j) => (value.sourceMatrix as string[][])[i][j] !== entry)) ||
    !Array.isArray(value.inputShape) || value.inputShape.length !== 2 || value.inputShape[0] !== rows ||
    value.inputShape[1] !== columns || !Number.isSafeInteger(value.rank) || (value.rank as number) < 0 ||
    (value.rank as number) > diagonalLength || !record(value.smith) ||
    !exact(value.smith, ["form", "diagonal", "transformations"]) ||
    !matrixOf(value.smith.form, rows, columns) || !Array.isArray(value.smith.diagonal) ||
    value.smith.diagonal.length !== diagonalLength || !value.smith.diagonal.every((entry) => integer(entry)) ||
    !record(value.hermite) || !exact(value.hermite, ["form", "transformation"]) ||
    !matrixOf(value.hermite.form, rows, columns) || !record(value.cokernel) ||
    !exact(value.cokernel, ["freeRank", "torsionOrders"]) ||
    !Number.isSafeInteger(value.cokernel.freeRank) || value.cokernel.freeRank !== rows - (value.rank as number) ||
    !Array.isArray(value.cokernel.torsionOrders) || !value.cokernel.torsionOrders.every((entry) => integer(entry))) {
    throw new TypeError("Invalid exact ZZ matrix forms result or mismatched source matrix.");
  }
  const smith = value.smith as { form: string[][]; diagonal: string[]; transformations: unknown };
  const hermite = value.hermite as { form: string[][]; transformation: unknown };
  const cokernel = value.cokernel as { freeRank: number; torsionOrders: string[] };
  const diagonal = smith.diagonal.map(BigInt);
  const nonzero = diagonal.filter((entry) => entry !== 0n);
  if (diagonal.some((entry) => entry < 0n) || nonzero.length !== value.rank ||
    diagonal.some((entry, i) => (i > 0 && diagonal[i - 1] === 0n && entry !== 0n)) ||
    nonzero.some((entry, i) => i > 0 && entry % nonzero[i - 1] !== 0n) ||
    smith.form.some((row, i) => row.some((entry, j) => BigInt(entry) !== (i === j ? diagonal[i] : 0n))) ||
    cokernel.torsionOrders.join("|") !== nonzero.filter((entry) => entry > 1n).map(String).join("|")) {
    throw new TypeError("Smith form violates diagonal, divisibility, rank or cokernel invariants.");
  }
  const smithTransforms = smith.transformations;
  let verifiedSmith: SmithTransform;
  if (!record(smithTransforms)) throw new TypeError("Invalid Smith transformation status.");
  if (smithTransforms.status === "verified") {
    if (!exact(smithTransforms, ["status", "left", "right"]) ||
      !matrixOf(smithTransforms.left, rows, rows) || !matrixOf(smithTransforms.right, columns, columns)) {
      throw new TypeError("Invalid Smith transformation matrices.");
    }
    const left = bigintMatrix(smithTransforms.left), right = bigintMatrix(smithTransforms.right);
    if (![1n, -1n].includes(determinant(left)) || ![1n, -1n].includes(determinant(right)) ||
      !equalMatrix(multiply(multiply(left, bigintMatrix(source)), right), bigintMatrix(smith.form))) {
      throw new TypeError("Smith transformations do not verify U·A·V=D with unimodular U and V.");
    }
    verifiedSmith = Object.freeze({ status: "verified", left: freezeMatrix(smithTransforms.left),
      right: freezeMatrix(smithTransforms.right) });
  } else if (smithTransforms.status === "unavailable" && exact(smithTransforms, ["status", "reason"]) &&
      reason(smithTransforms.reason)) {
    verifiedSmith = Object.freeze({ status: "unavailable", reason: smithTransforms.reason });
  } else throw new TypeError("Invalid Smith transformation status.");
  const hermiteTransform = hermite.transformation;
  let verifiedHermite: HermiteTransform;
  if (!record(hermiteTransform)) throw new TypeError("Invalid Hermite transformation status.");
  if (hermiteTransform.status === "verified") {
    if (!exact(hermiteTransform, ["status", "left"]) || !matrixOf(hermiteTransform.left, rows, rows)) {
      throw new TypeError("Invalid Hermite transformation matrix.");
    }
    const left = bigintMatrix(hermiteTransform.left);
    if (![1n, -1n].includes(determinant(left)) ||
      !equalMatrix(multiply(left, bigintMatrix(source)), bigintMatrix(hermite.form))) {
      throw new TypeError("Hermite transformation does not verify U·A=H with unimodular U.");
    }
    verifiedHermite = Object.freeze({ status: "verified", left: freezeMatrix(hermiteTransform.left) });
  } else if (hermiteTransform.status === "unavailable" && exact(hermiteTransform, ["status", "reason"]) &&
      reason(hermiteTransform.reason)) {
    verifiedHermite = Object.freeze({ status: "unavailable", reason: hermiteTransform.reason });
  } else throw new TypeError("Invalid Hermite transformation status.");
  return Object.freeze({ format: "math3d.sage-integer-matrix-forms-result", schemaVersion: 1,
    coefficientDomain: "ZZ", sourceMatrix: freezeMatrix(source), inputShape: Object.freeze([rows, columns] as const),
    rank: nonzero.length, smith: Object.freeze({ form: freezeMatrix(smith.form), diagonal: Object.freeze([...smith.diagonal]),
      transformations: verifiedSmith }), hermite: Object.freeze({ form: freezeMatrix(hermite.form),
      transformation: verifiedHermite }), cokernel: Object.freeze({ freeRank: cokernel.freeRank,
      torsionOrders: Object.freeze([...cokernel.torsionOrders]) }) });
};
