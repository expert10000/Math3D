import { describe, expect, it } from "vitest";
import {
  decodeBigIntMatrix,
  identityBigIntMatrix,
  multiplyBigIntMatrices,
  smithNormalForm,
} from "./smithNormalForm";

const diagonalMatrix = (rows: number, columns: number, diagonal: string[]): bigint[][] =>
  Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => (row === column ? BigInt(diagonal[row] ?? "0") : 0n))
  );

describe("Smith normal form", () => {
  it("returns unimodular transforms and divisibility-normalized diagonal forms", () => {
    const fixtures = [
      [[2n, 4n], [4n, 8n]],
      [[6n, 9n, 3n], [4n, 10n, 6n]],
      [[0n, 2n], [3n, 5n], [6n, 10n]],
      [[0n, 0n], [0n, 0n]],
    ];
    for (const matrix of fixtures) {
      const result = smithNormalForm(matrix);
      const left = decodeBigIntMatrix(result.leftTransform);
      const right = decodeBigIntMatrix(result.rightTransform);
      const transformed = multiplyBigIntMatrices(multiplyBigIntMatrices(left, matrix), right);
      expect(transformed).toEqual(diagonalMatrix(matrix.length, matrix[0]?.length ?? 0, result.diagonal));
      const nonzero = result.diagonal.map(BigInt).filter((value) => value !== 0n);
      for (let index = 1; index < nonzero.length; index += 1) {
        expect(nonzero[index] % nonzero[index - 1]).toBe(0n);
      }
      expect(multiplyBigIntMatrices(left, decodeBigIntMatrix(result.leftTransformInverse))).toEqual(
        identityBigIntMatrix(left.length)
      );
      expect(multiplyBigIntMatrices(right, decodeBigIntMatrix(result.rightTransformInverse))).toEqual(
        identityBigIntMatrix(right.length)
      );
    }
  });
});
