/** Versioned exact QQ matrix recipe. Basis vectors are rows of these arrays. */
export type SageMatrixDossierInput = Readonly<{ format: "math3d.sage-matrix-dossier"; schemaVersion: 1;
  matrix: readonly (readonly string[])[] }>;
export type SageMatrixDossierResult = Readonly<{ format: "math3d.sage-matrix-dossier-result"; schemaVersion: 1;
  coefficientDomain: "QQ"; sourceMatrix: readonly (readonly string[])[]; inputShape: readonly [number, number];
  rank: number; reducedRowEchelonForm: readonly (readonly string[])[]; pivotColumns: readonly number[];
  kernelBasis: readonly (readonly string[])[]; imageBasis: readonly (readonly string[])[];
  minimalPolynomial: string | null; characteristicPolynomial: string | null }>;

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value: Record<string, unknown>, fields: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...fields].sort().join("|");
const gcd = (a: bigint, b: bigint): bigint => {
  let left = a < 0n ? -a : a, right = b;
  while (right) [left, right] = [right, left % right];
  return left;
};
const rationalText = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^(?:0|-?[1-9][0-9]{0,63})(?:\/[1-9][0-9]{0,63})?$/.test(value)) return false;
  const [numerator, denominator] = value.split("/");
  return denominator === undefined || (BigInt(denominator) > 1n && BigInt(numerator) !== 0n &&
    gcd(BigInt(numerator), BigInt(denominator)) === 1n);
};
const matrixOf = (value: unknown, rows: number, columns: number): value is string[][] =>
  Array.isArray(value) && value.length === rows && value.every((row) => Array.isArray(row) &&
    row.length === columns && row.every(rationalText));
const frozenMatrix = (value: readonly (readonly string[])[]) =>
  Object.freeze(value.map((row) => Object.freeze([...row])));

export const parseSageMatrixDossierInput = (value: unknown): SageMatrixDossierInput => {
  if (!record(value) || !exact(value, ["format", "schemaVersion", "matrix"]) ||
    value.format !== "math3d.sage-matrix-dossier" || value.schemaVersion !== 1 ||
    !Array.isArray(value.matrix) || value.matrix.length < 1 || value.matrix.length > 8 ||
    !Array.isArray(value.matrix[0]) || value.matrix[0].length < 1 || value.matrix[0].length > 8 ||
    !matrixOf(value.matrix, value.matrix.length, value.matrix[0].length)) {
    throw new TypeError("Matrix dossier requires a 1–8 by 1–8 matrix of reduced canonical QQ fractions.");
  }
  return Object.freeze({ format: "math3d.sage-matrix-dossier", schemaVersion: 1,
    matrix: frozenMatrix(value.matrix) });
};

type Fraction = readonly [bigint, bigint];
const fraction = (value: string): Fraction => {
  const [n, d] = value.split("/");
  return [BigInt(n), BigInt(d ?? "1")];
};
const sum = (left: Fraction, right: Fraction): Fraction =>
  [left[0] * right[1] + right[0] * left[1], left[1] * right[1]];
const product = (left: Fraction, right: Fraction): Fraction => [left[0] * right[0], left[1] * right[1]];
const equal = (left: Fraction, right: Fraction) => left[0] * right[1] === right[0] * left[1];
const zero = (value: Fraction) => value[0] === 0n;
const one = (value: Fraction) => value[0] === value[1];
const polynomialText = (value: unknown) => typeof value === "string" && !!value && value.length <= 4096 &&
  /^[A-Za-z0-9_+\-*/^()\s]+$/.test(value);

/** Checks shapes, source identity, canonical RREF, and exact kernel/image witnesses. */
export const parseSageMatrixDossierResult = (value: unknown, input: SageMatrixDossierInput): SageMatrixDossierResult => {
  const source = input.matrix, rows = source.length, columns = source[0].length;
  if (!record(value) || !exact(value, ["format", "schemaVersion", "coefficientDomain", "sourceMatrix", "inputShape",
    "rank", "reducedRowEchelonForm", "pivotColumns", "kernelBasis", "imageBasis", "minimalPolynomial",
    "characteristicPolynomial"]) || value.format !== "math3d.sage-matrix-dossier-result" || value.schemaVersion !== 1 ||
    value.coefficientDomain !== "QQ" || !matrixOf(value.sourceMatrix, rows, columns) ||
    source.some((row, i) => row.some((entry, j) => (value.sourceMatrix as string[][])[i][j] !== entry)) ||
    !Array.isArray(value.inputShape) || value.inputShape.length !== 2 || value.inputShape[0] !== rows ||
    value.inputShape[1] !== columns || !Number.isSafeInteger(value.rank) || (value.rank as number) < 0 ||
    (value.rank as number) > Math.min(rows, columns) || !matrixOf(value.reducedRowEchelonForm, rows, columns) ||
    !Array.isArray(value.pivotColumns) || value.pivotColumns.length !== value.rank ||
    !value.pivotColumns.every((pivot, i) => Number.isSafeInteger(pivot) && pivot >= 0 && pivot < columns &&
      (i === 0 || pivot > (value.pivotColumns as number[])[i - 1])) ||
    !matrixOf(value.kernelBasis, columns - (value.rank as number), columns) ||
    !matrixOf(value.imageBasis, value.rank as number, rows) ||
    (rows === columns ? !polynomialText(value.minimalPolynomial) || !polynomialText(value.characteristicPolynomial)
      : value.minimalPolynomial !== null || value.characteristicPolynomial !== null)) {
    throw new TypeError("Invalid exact QQ matrix dossier result or mismatched source matrix.");
  }
  const rank = value.rank as number, pivots = value.pivotColumns as number[], rref = value.reducedRowEchelonForm as string[][];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const entry = fraction(rref[row][column]);
    if ((row >= rank && !zero(entry)) || (row < rank && column < pivots[row] && !zero(entry)) ||
        (pivots.includes(column) && (row === pivots.indexOf(column) ? !one(entry) : !zero(entry)))) {
      throw new TypeError("Matrix dossier RREF is inconsistent with its pivots.");
    }
  }
  for (const vector of value.kernelBasis as string[][]) for (const row of source) {
    let total: Fraction = [0n, 1n];
    for (let column = 0; column < columns; column++) total = sum(total, product(fraction(row[column]), fraction(vector[column])));
    if (!zero(total)) throw new TypeError("Matrix dossier kernel vector does not satisfy A·v=0.");
  }
  const freeColumns = Array.from({ length: columns }, (_, column) => column).filter((column) => !pivots.includes(column));
  for (let i = 0; i < freeColumns.length; i++) for (let column = 0; column < columns; column++) {
    const pivotRow = pivots.indexOf(column);
    const expected: Fraction = column === freeColumns[i] ? [1n, 1n] : pivotRow < 0 ? [0n, 1n]
      : [-fraction(rref[pivotRow][freeColumns[i]])[0], fraction(rref[pivotRow][freeColumns[i]])[1]];
    if (!equal(fraction((value.kernelBasis as string[][])[i][column]), expected)) {
      throw new TypeError("Matrix dossier kernel basis is inconsistent with the canonical RREF.");
    }
  }
  for (let i = 0; i < rank; i++) for (let row = 0; row < rows; row++) {
    if ((value.imageBasis as string[][])[i][row] !== source[row][pivots[i]]) {
      throw new TypeError("Matrix dossier image basis does not match the pivot columns of A.");
    }
  }
  return Object.freeze({ format: "math3d.sage-matrix-dossier-result", schemaVersion: 1, coefficientDomain: "QQ",
    sourceMatrix: frozenMatrix(value.sourceMatrix), inputShape: Object.freeze([rows, columns] as const), rank,
    reducedRowEchelonForm: frozenMatrix(rref), pivotColumns: Object.freeze([...pivots]),
    kernelBasis: frozenMatrix(value.kernelBasis), imageBasis: frozenMatrix(value.imageBasis),
    minimalPolynomial: value.minimalPolynomial as string | null,
    characteristicPolynomial: value.characteristicPolynomial as string | null });
};
