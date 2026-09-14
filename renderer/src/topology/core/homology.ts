import type { TopologyObject, TopologyResult } from "./contracts";
import type { CellularBoundaryOperators } from "./cellularBoundary";
import { decodeExactIntegerMatrix } from "./cellularBoundary";
import { createTopologyResult } from "./provenance";
import {
  decodeBigIntMatrix,
  multiplyBigIntMatrices,
  smithNormalForm,
  type SmithNormalForm,
} from "./smithNormalForm";

export const TOPOLOGY_HOMOLOGY_VERSION = "cellular-homology@1" as const;

export type ExactCellularChain = {
  degree: 0 | 1 | 2;
  coefficients: Array<{ cellId: string; coefficient: string }>;
};

export type IntegralHomologyGenerator = {
  id: string;
  kind: "free" | "torsion";
  order?: string;
  representative: ExactCellularChain;
};

export type IntegralHomologyGroup = {
  degree: 0 | 1 | 2;
  notation: string;
  bettiNumber: number;
  torsionCoefficients: string[];
  generators: IntegralHomologyGenerator[];
};

export type Mod2HomologyGenerator = {
  id: string;
  representative: ExactCellularChain;
};

export type Mod2HomologyGroup = {
  degree: 0 | 1 | 2;
  notation: string;
  dimension: number;
  generators: Mod2HomologyGenerator[];
};

export type TopologyHomologyAnalysis = {
  coefficientDomains: ["Z", "Z/2Z"];
  integer: {
    groups: [IntegralHomologyGroup, IntegralHomologyGroup, IntegralHomologyGroup];
    smith: {
      boundary1: SmithNormalForm;
      boundary2: SmithNormalForm;
      boundary2OnKernelBoundary1: SmithNormalForm;
    };
  };
  mod2: {
    groups: [Mod2HomologyGroup, Mod2HomologyGroup, Mod2HomologyGroup];
  };
};

const zeroMatrix = (rows: number, columns: number): bigint[][] =>
  Array.from({ length: rows }, () => Array<bigint>(columns).fill(0n));

const matrixColumn = (matrix: bigint[][], column: number, rows: number): bigint[] =>
  Array.from({ length: rows }, (_, row) => matrix[row]?.[column] ?? 0n);

const multiplyMatrixVector = (matrix: bigint[][], vector: bigint[]): bigint[] =>
  matrix.map((row) => row.reduce((sum, value, index) => sum + value * (vector[index] ?? 0n), 0n));

const encodeChain = (degree: 0 | 1 | 2, cellIds: string[], values: bigint[]): ExactCellularChain => ({
  degree,
  coefficients: cellIds.flatMap((cellId, index) => {
    const coefficient = values[index] ?? 0n;
    return coefficient === 0n ? [] : [{ cellId, coefficient: coefficient.toString() }];
  }),
});

const integralNotation = (bettiNumber: number, torsionCoefficients: bigint[]): string => {
  const summands: string[] = [];
  if (bettiNumber === 1) summands.push("Z");
  if (bettiNumber > 1) summands.push(`Z^${bettiNumber}`);
  torsionCoefficients.forEach((order) => summands.push(`Z/${order.toString()}Z`));
  return summands.join(" ⊕ ") || "0";
};

const mod2Notation = (dimension: number): string =>
  dimension === 0 ? "0" : dimension === 1 ? "Z/2Z" : `(Z/2Z)^${dimension}`;

const makeIntegralGroup = (
  degree: 0 | 1 | 2,
  cellIds: string[],
  freeRepresentatives: bigint[][],
  torsionRepresentatives: Array<{ order: bigint; values: bigint[] }>
): IntegralHomologyGroup => {
  const torsionCoefficients = torsionRepresentatives.map((entry) => entry.order);
  return {
    degree,
    notation: integralNotation(freeRepresentatives.length, torsionCoefficients),
    bettiNumber: freeRepresentatives.length,
    torsionCoefficients: torsionCoefficients.map((value) => value.toString()),
    generators: [
      ...freeRepresentatives.map((values, index) => ({
        id: `H${degree}-free-${index + 1}`,
        kind: "free" as const,
        representative: encodeChain(degree, cellIds, values),
      })),
      ...torsionRepresentatives.map((entry, index) => ({
        id: `H${degree}-torsion-${index + 1}`,
        kind: "torsion" as const,
        order: entry.order.toString(),
        representative: encodeChain(degree, cellIds, entry.values),
      })),
    ],
  };
};

type BinaryReduction = { rank: number; pivots: number[]; rows: number[][] };

const reduceMod2 = (input: number[][], columnCount = input[0]?.length ?? 0): BinaryReduction => {
  const rows = input.map((row) => Array.from({ length: columnCount }, (_, column) => (row[column] ?? 0) & 1));
  const pivots: number[] = [];
  let pivotRow = 0;
  for (let column = 0; column < columnCount && pivotRow < rows.length; column += 1) {
    const found = rows.findIndex((row, index) => index >= pivotRow && row[column] === 1);
    if (found < 0) continue;
    [rows[pivotRow], rows[found]] = [rows[found], rows[pivotRow]];
    for (let row = 0; row < rows.length; row += 1) {
      if (row !== pivotRow && rows[row][column] === 1) {
        for (let next = column; next < columnCount; next += 1) rows[row][next] ^= rows[pivotRow][next];
      }
    }
    pivots.push(column);
    pivotRow += 1;
  }
  return { rank: pivots.length, pivots, rows };
};

const mod2Matrix = (matrix: bigint[][]): number[][] =>
  matrix.map((row) => row.map((value) => Number(((value % 2n) + 2n) % 2n)));

const mod2Nullspace = (matrix: number[][], columnCount: number): number[][] => {
  const reduced = reduceMod2(matrix, columnCount);
  const pivotSet = new Set(reduced.pivots);
  return Array.from({ length: columnCount }, (_, column) => column)
    .filter((column) => !pivotSet.has(column))
    .map((freeColumn) => {
      const vector = Array<number>(columnCount).fill(0);
      vector[freeColumn] = 1;
      reduced.pivots.forEach((pivotColumn, row) => {
        vector[pivotColumn] = reduced.rows[row]?.[freeColumn] ?? 0;
      });
      return vector;
    });
};

const matrixColumnsMod2 = (matrix: number[][], rows: number, columns: number): number[][] =>
  Array.from({ length: columns }, (_, column) => Array.from({ length: rows }, (_, row) => matrix[row]?.[column] ?? 0));

const rankOfColumnVectors = (vectors: number[][], vectorLength: number): number => {
  if (vectors.length === 0) return 0;
  const rowMatrix = Array.from({ length: vectorLength }, (_, row) =>
    vectors.map((vector) => vector[row] ?? 0)
  );
  return reduceMod2(rowMatrix, vectors.length).rank;
};

const quotientBasisMod2 = (cycles: number[][], boundaries: number[][], vectorLength: number): number[][] => {
  const span = [...boundaries];
  let rank = rankOfColumnVectors(span, vectorLength);
  const representatives: number[][] = [];
  cycles.forEach((cycle) => {
    const nextRank = rankOfColumnVectors([...span, cycle], vectorLength);
    if (nextRank > rank) {
      span.push(cycle);
      representatives.push(cycle);
      rank = nextRank;
    }
  });
  return representatives;
};

const makeMod2Group = (
  degree: 0 | 1 | 2,
  cellIds: string[],
  representatives: number[][]
): Mod2HomologyGroup => ({
  degree,
  notation: mod2Notation(representatives.length),
  dimension: representatives.length,
  generators: representatives.map((values, index) => ({
    id: `H${degree}-mod2-${index + 1}`,
    representative: encodeChain(degree, cellIds, values.map((value) => BigInt(value))),
  })),
});

export const computeExactHomology = (
  object: TopologyObject,
  boundaryResult: TopologyResult<CellularBoundaryOperators>
): TopologyResult<TopologyHomologyAnalysis> => {
  const boundary = boundaryResult.value;
  if (boundaryResult.status !== "exact" || !boundary?.chainCondition.holds) {
    return createTopologyResult({
      status: "unsupported",
      method: "cellular homology over Z and Z/2Z",
      assumptions: ["exact cellular boundary operators satisfying ∂1∂2 = 0"],
      sourceRevision: object.provenance.source.revision,
      algorithmVersion: TOPOLOGY_HOMOLOGY_VERSION,
      diagnostics: [{
        code: "homology/exact-boundaries-unavailable",
        severity: "error",
        message: "Homology was withheld because exact boundary operators with a passing chain condition are unavailable.",
      }],
    });
  }

  const { c0, c1, c2 } = boundary.chainCellIds;
  const d1 = decodeExactIntegerMatrix(boundary.boundary1);
  const d2 = decodeExactIntegerMatrix(boundary.boundary2);
  const snf1 = smithNormalForm(d1, c1.length);
  const snf2 = smithNormalForm(d2, c2.length);
  const v1 = decodeBigIntMatrix(snf1.rightTransform);
  const v1Inverse = decodeBigIntMatrix(snf1.rightTransformInverse);
  const u1Inverse = decodeBigIntMatrix(snf1.leftTransformInverse);
  const v2 = decodeBigIntMatrix(snf2.rightTransform);
  const kernel1Dimension = c1.length - snf1.rank;
  const d2InD1Basis = multiplyBigIntMatrices(v1Inverse, d2);
  const d2OnKernel = Array.from({ length: kernel1Dimension }, (_, row) =>
    Array.from({ length: c2.length }, (_, column) => d2InD1Basis[snf1.rank + row]?.[column] ?? 0n)
  );
  const snf2OnKernel = smithNormalForm(d2OnKernel, c2.length);
  const u2KernelInverse = decodeBigIntMatrix(snf2OnKernel.leftTransformInverse);
  const kernel1Basis = Array.from({ length: kernel1Dimension }, (_, index) =>
    matrixColumn(v1, snf1.rank + index, c1.length)
  );
  const kernel1BasisMatrix = Array.from({ length: c1.length }, (_, row) =>
    kernel1Basis.map((column) => column[row] ?? 0n)
  );

  const h0Torsion = snf1.diagonal
    .slice(0, snf1.rank)
    .map(BigInt)
    .flatMap((order, index) => order > 1n ? [{ order, values: matrixColumn(u1Inverse, index, c0.length) }] : []);
  const h0Free = Array.from({ length: c0.length - snf1.rank }, (_, index) =>
    matrixColumn(u1Inverse, snf1.rank + index, c0.length)
  );
  const h0 = makeIntegralGroup(0, c0, h0Free, h0Torsion);

  const h1Torsion = snf2OnKernel.diagonal
    .slice(0, snf2OnKernel.rank)
    .map(BigInt)
    .flatMap((order, index) => order > 1n ? [{
      order,
      values: multiplyMatrixVector(kernel1BasisMatrix, matrixColumn(u2KernelInverse, index, kernel1Dimension)),
    }] : []);
  const h1Free = Array.from({ length: kernel1Dimension - snf2OnKernel.rank }, (_, index) =>
    multiplyMatrixVector(
      kernel1BasisMatrix,
      matrixColumn(u2KernelInverse, snf2OnKernel.rank + index, kernel1Dimension)
    )
  );
  const h1 = makeIntegralGroup(1, c1, h1Free, h1Torsion);

  const h2Free = Array.from({ length: c2.length - snf2.rank }, (_, index) =>
    matrixColumn(v2, snf2.rank + index, c2.length)
  );
  const h2 = makeIntegralGroup(2, c2, h2Free, []);

  const d1Mod2 = mod2Matrix(d1);
  const d2Mod2 = mod2Matrix(d2);
  const c0Cycles = Array.from({ length: c0.length }, (_, index) =>
    Array.from({ length: c0.length }, (_, row) => row === index ? 1 : 0)
  );
  const h0Mod2Reps = quotientBasisMod2(
    c0Cycles,
    matrixColumnsMod2(d1Mod2, c0.length, c1.length),
    c0.length
  );
  const h1Mod2Reps = quotientBasisMod2(
    mod2Nullspace(d1Mod2, c1.length),
    matrixColumnsMod2(d2Mod2, c1.length, c2.length),
    c1.length
  );
  const h2Mod2Reps = mod2Nullspace(d2Mod2, c2.length);

  return createTopologyResult({
    status: "exact",
    value: {
      coefficientDomains: ["Z", "Z/2Z"],
      integer: {
        groups: [h0, h1, h2],
        smith: { boundary1: snf1, boundary2: snf2, boundary2OnKernelBoundary1: snf2OnKernel },
      },
      mod2: {
        groups: [
          makeMod2Group(0, c0, h0Mod2Reps),
          makeMod2Group(1, c1, h1Mod2Reps),
          makeMod2Group(2, c2, h2Mod2Reps),
        ],
      },
    },
    method: "Smith normal form over bigint Z plus independent row reduction over Z/2Z",
    assumptions: [
      "canonical cells form finite free chain groups in dimensions 0 through 2",
      "exact cellular boundary operators satisfy ∂1∂2 = 0",
      "representatives use the displayed canonical cell bases",
    ],
    sourceRevision: object.provenance.source.revision,
    algorithmVersion: TOPOLOGY_HOMOLOGY_VERSION,
  });
};
