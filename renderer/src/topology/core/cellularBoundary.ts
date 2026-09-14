import type {
  CanonicalTopologyComplex,
  TopologyDiagnostic,
  TopologyObject,
  TopologyResult,
} from "./contracts";
import { createTopologyResult } from "./provenance";
import type { TopologyStructuralValidationReport } from "./structuralValidation";

export const TOPOLOGY_CELLULAR_BOUNDARY_VERSION = "cellular-boundary-operators@1" as const;

/** JSON-safe storage for values computed exclusively with bigint arithmetic. */
export type ExactIntegerMatrix = {
  ring: "Z";
  encoding: "decimal-bigint";
  rowCellDimension: 0 | 1;
  columnCellDimension: 1 | 2;
  rowCellIds: string[];
  columnCellIds: string[];
  entries: string[][];
};

export type CellularBoundaryOperators = {
  chainCellIds: {
    c0: string[];
    c1: string[];
    c2: string[];
  };
  boundary1: ExactIntegerMatrix;
  boundary2: ExactIntegerMatrix;
  compositionBoundary1Boundary2: ExactIntegerMatrix;
  chainCondition: {
    expression: "∂1∂2 = 0";
    holds: boolean;
    nonzeroEntries: Array<{ vertexId: string; faceId: string; value: string }>;
  };
};

const zeroMatrix = (rows: number, columns: number): bigint[][] =>
  Array.from({ length: rows }, () => Array<bigint>(columns).fill(0n));

const encodeMatrix = (
  entries: bigint[][],
  rowCellDimension: ExactIntegerMatrix["rowCellDimension"],
  columnCellDimension: ExactIntegerMatrix["columnCellDimension"],
  rowCellIds: string[],
  columnCellIds: string[]
): ExactIntegerMatrix => ({
  ring: "Z",
  encoding: "decimal-bigint",
  rowCellDimension,
  columnCellDimension,
  rowCellIds: [...rowCellIds],
  columnCellIds: [...columnCellIds],
  entries: entries.map((row) => row.map((value) => value.toString())),
});

export const decodeExactIntegerMatrix = (matrix: ExactIntegerMatrix): bigint[][] =>
  matrix.entries.map((row) => row.map((value) => BigInt(value)));

const multiplyBigIntMatrices = (
  left: bigint[][],
  right: bigint[][],
  sharedDimension: number,
  outputRows: number,
  outputColumns: number
): bigint[][] => {
  const product = zeroMatrix(outputRows, outputColumns);
  for (let row = 0; row < outputRows; row += 1) {
    for (let column = 0; column < outputColumns; column += 1) {
      let value = 0n;
      for (let inner = 0; inner < sharedDimension; inner += 1) {
        value += (left[row]?.[inner] ?? 0n) * (right[inner]?.[column] ?? 0n);
      }
      product[row][column] = value;
    }
  }
  return product;
};

const buildMatrices = (complex: CanonicalTopologyComplex): CellularBoundaryOperators => {
  const c0 = complex.vertices.map((cell) => cell.id);
  const c1 = complex.edges.map((cell) => cell.id);
  const c2 = complex.faces.map((cell) => cell.id);
  const vertexIndex = new Map(c0.map((cellId, index) => [cellId, index]));
  const edgeIndex = new Map(c1.map((cellId, index) => [cellId, index]));
  const boundary1 = zeroMatrix(c0.length, c1.length);
  const boundary2 = zeroMatrix(c1.length, c2.length);

  complex.edges.forEach((edge, column) => {
    const sourceRow = vertexIndex.get(edge.endpoints[0]);
    const targetRow = vertexIndex.get(edge.endpoints[1]);
    if (sourceRow !== undefined) boundary1[sourceRow][column] -= 1n;
    if (targetRow !== undefined) boundary1[targetRow][column] += 1n;
  });

  complex.faces.forEach((face, column) => {
    face.attachment.forEach((occurrence) => {
      const row = edgeIndex.get(occurrence.edgeId);
      if (row !== undefined) boundary2[row][column] += BigInt(occurrence.direction);
    });
  });

  const composition = multiplyBigIntMatrices(boundary1, boundary2, c1.length, c0.length, c2.length);
  const nonzeroEntries: CellularBoundaryOperators["chainCondition"]["nonzeroEntries"] = [];
  composition.forEach((row, rowIndex) =>
    row.forEach((value, columnIndex) => {
      if (value !== 0n) {
        nonzeroEntries.push({
          vertexId: c0[rowIndex],
          faceId: c2[columnIndex],
          value: value.toString(),
        });
      }
    })
  );

  return {
    chainCellIds: { c0, c1, c2 },
    boundary1: encodeMatrix(boundary1, 0, 1, c0, c1),
    boundary2: encodeMatrix(boundary2, 1, 2, c1, c2),
    compositionBoundary1Boundary2: encodeMatrix(composition, 0, 2, c0, c2),
    chainCondition: {
      expression: "∂1∂2 = 0",
      holds: nonzeroEntries.length === 0,
      nonzeroEntries,
    },
  };
};

export const buildExactCellularBoundaryOperators = (
  object: TopologyObject,
  structuralValidation: TopologyResult<TopologyStructuralValidationReport>
): TopologyResult<CellularBoundaryOperators> => {
  if (!structuralValidation.value?.canComputeCellularAlgebra || structuralValidation.status === "failed") {
    return createTopologyResult({
      status: "unsupported",
      method: "exact cellular boundary operators over Z",
      assumptions: ["structurally valid canonical finite 2-complex"],
      sourceRevision: object.provenance.source.revision,
      algorithmVersion: TOPOLOGY_CELLULAR_BOUNDARY_VERSION,
      diagnostics: [
        {
          code: "cellular-boundary/invalid-structure",
          severity: "error",
          message: "Boundary operators were not constructed because canonical structural validation failed.",
        },
      ],
    });
  }

  const value = buildMatrices(object.canonical);
  const diagnostics: TopologyDiagnostic[] = value.chainCondition.nonzeroEntries.map((entry) => ({
    code: "cellular-boundary/nonzero-composition",
    severity: "error",
    message: `Exact composition has coefficient ${entry.value} at vertex '${entry.vertexId}', face '${entry.faceId}'.`,
    cellRef: { dimension: 2, cellId: entry.faceId },
  }));

  return createTopologyResult({
    status: value.chainCondition.holds ? "exact" : "failed",
    value,
    method: "oriented cellular incidence over Z using bigint arithmetic",
    assumptions: [
      "canonical edge endpoint order defines positive orientation",
      "canonical face attachment signs are relative to canonical edge orientation",
      "all integer arithmetic is exact bigint before decimal serialization",
    ],
    sourceRevision: object.provenance.source.revision,
    algorithmVersion: TOPOLOGY_CELLULAR_BOUNDARY_VERSION,
    diagnostics,
  });
};
