export const TOPOLOGY_SNF_VERSION = "smith-normal-form@1" as const;

export type SmithNormalForm = {
  diagonal: string[];
  rank: number;
  leftTransform: string[][];
  leftTransformInverse: string[][];
  rightTransform: string[][];
  rightTransformInverse: string[][];
};

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

export const identityBigIntMatrix = (size: number): bigint[][] =>
  Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => (row === column ? 1n : 0n))
  );

export const multiplyBigIntMatrices = (left: bigint[][], right: bigint[][]): bigint[][] => {
  const rows = left.length;
  const shared = left[0]?.length ?? right.length;
  const columns = right[0]?.length ?? 0;
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      let value = 0n;
      for (let inner = 0; inner < shared; inner += 1) {
        value += (left[row]?.[inner] ?? 0n) * (right[inner]?.[column] ?? 0n);
      }
      return value;
    })
  );
};

const encode = (matrix: bigint[][]): string[][] =>
  matrix.map((row) => row.map((value) => value.toString()));

export const decodeBigIntMatrix = (matrix: string[][]): bigint[][] =>
  matrix.map((row) => row.map((value) => BigInt(value)));

export const smithNormalForm = (input: bigint[][], columnCount = input[0]?.length ?? 0): SmithNormalForm => {
  const rowCount = input.length;
  const matrix = Array.from({ length: rowCount }, (_, row) =>
    Array.from({ length: columnCount }, (_, column) => input[row]?.[column] ?? 0n)
  );
  const left = identityBigIntMatrix(rowCount);
  const leftInverse = identityBigIntMatrix(rowCount);
  const right = identityBigIntMatrix(columnCount);
  const rightInverse = identityBigIntMatrix(columnCount);

  const swapRows = (first: number, second: number) => {
    if (first === second) return;
    [matrix[first], matrix[second]] = [matrix[second], matrix[first]];
    [left[first], left[second]] = [left[second], left[first]];
    for (let row = 0; row < rowCount; row += 1) {
      [leftInverse[row][first], leftInverse[row][second]] = [leftInverse[row][second], leftInverse[row][first]];
    }
  };
  const addRow = (target: number, source: number, factor: bigint) => {
    for (let column = 0; column < columnCount; column += 1) {
      matrix[target][column] += factor * matrix[source][column];
    }
    for (let column = 0; column < rowCount; column += 1) {
      left[target][column] += factor * left[source][column];
    }
    for (let row = 0; row < rowCount; row += 1) {
      leftInverse[row][source] -= factor * leftInverse[row][target];
    }
  };
  const scaleRowMinusOne = (target: number) => {
    for (let column = 0; column < columnCount; column += 1) matrix[target][column] *= -1n;
    for (let column = 0; column < rowCount; column += 1) left[target][column] *= -1n;
    for (let row = 0; row < rowCount; row += 1) leftInverse[row][target] *= -1n;
  };
  const swapColumns = (first: number, second: number) => {
    if (first === second) return;
    for (let row = 0; row < rowCount; row += 1) {
      [matrix[row][first], matrix[row][second]] = [matrix[row][second], matrix[row][first]];
    }
    for (let row = 0; row < columnCount; row += 1) {
      [right[row][first], right[row][second]] = [right[row][second], right[row][first]];
    }
    [rightInverse[first], rightInverse[second]] = [rightInverse[second], rightInverse[first]];
  };
  const addColumn = (target: number, source: number, factor: bigint) => {
    for (let row = 0; row < rowCount; row += 1) {
      matrix[row][target] += factor * matrix[row][source];
    }
    for (let row = 0; row < columnCount; row += 1) {
      right[row][target] += factor * right[row][source];
    }
    for (let column = 0; column < columnCount; column += 1) {
      rightInverse[source][column] -= factor * rightInverse[target][column];
    }
  };

  const diagonalLength = Math.min(rowCount, columnCount);
  let pivotIndex = 0;
  while (pivotIndex < diagonalLength) {
    let pivotPosition: { row: number; column: number } | null = null;
    for (let row = pivotIndex; row < rowCount; row += 1) {
      for (let column = pivotIndex; column < columnCount; column += 1) {
        const value = matrix[row][column];
        if (value === 0n) continue;
        if (!pivotPosition || abs(value) < abs(matrix[pivotPosition.row][pivotPosition.column])) {
          pivotPosition = { row, column };
        }
      }
    }
    if (!pivotPosition) break;
    swapRows(pivotIndex, pivotPosition.row);
    swapColumns(pivotIndex, pivotPosition.column);

    while (true) {
      let reduced = false;
      for (let row = pivotIndex + 1; row < rowCount; row += 1) {
        if (matrix[row][pivotIndex] === 0n) continue;
        const quotient = matrix[row][pivotIndex] / matrix[pivotIndex][pivotIndex];
        addRow(row, pivotIndex, -quotient);
        if (matrix[row][pivotIndex] !== 0n) swapRows(row, pivotIndex);
        reduced = true;
        break;
      }
      if (reduced) continue;
      for (let column = pivotIndex + 1; column < columnCount; column += 1) {
        if (matrix[pivotIndex][column] === 0n) continue;
        const quotient = matrix[pivotIndex][column] / matrix[pivotIndex][pivotIndex];
        addColumn(column, pivotIndex, -quotient);
        if (matrix[pivotIndex][column] !== 0n) swapColumns(column, pivotIndex);
        reduced = true;
        break;
      }
      if (reduced) continue;

      let nondivisible: { row: number; column: number } | null = null;
      for (let row = pivotIndex + 1; row < rowCount && !nondivisible; row += 1) {
        for (let column = pivotIndex + 1; column < columnCount; column += 1) {
          if (matrix[row][column] % matrix[pivotIndex][pivotIndex] !== 0n) {
            nondivisible = { row, column };
            break;
          }
        }
      }
      if (!nondivisible) break;
      addRow(pivotIndex, nondivisible.row, 1n);
    }

    if (matrix[pivotIndex][pivotIndex] < 0n) scaleRowMinusOne(pivotIndex);
    pivotIndex += 1;
  }

  const diagonal = Array.from({ length: diagonalLength }, (_, index) => matrix[index][index] ?? 0n);
  const rank = diagonal.filter((value) => value !== 0n).length;
  return {
    diagonal: diagonal.map((value) => value.toString()),
    rank,
    leftTransform: encode(left),
    leftTransformInverse: encode(leftInverse),
    rightTransform: encode(right),
    rightTransformInverse: encode(rightInverse),
  };
};
