import {
  type AnalysisArtifactHandle,
} from "./analysisResults";
import {
  type CanonicalCellDimension,
  type CanonicalFinite2DCellLocator,
  type CanonicalFinite2DResult,
  type CanonicalFinite2DSourceReference,
} from "./canonicalFinite2DComplex";
import {
  CANONICAL_FINITE_2D_VALIDATOR_VERSION,
  validateCanonicalFinite2DStructure,
} from "./canonicalFinite2DValidation";
import { immutableCanonicalJsonClone } from "./commands";
import {
  canonicalJsonStringify,
  isStructuralHash,
  type StructuralHash,
} from "./documentIdentity";
import {
  isScientificSourceGeneration,
  type ScientificSourceGeneration,
} from "./scientificJobs";
import type { TopologyDocument } from "./topologyDocument";

export const CANONICAL_FINITE_2D_BOUNDARY_VERSION = "exact-sparse-cellular-boundary@1" as const;
export const TOPOLOGY_BOUNDARY_MATRIX_ARTIFACT_FORMAT = "math3d.topology-boundary-matrices" as const;
export const TOPOLOGY_BOUNDARY_MATRIX_ARTIFACT_SCHEMA_VERSION = 1 as const;
export const TOPOLOGY_BOUNDARY_MATRIX_ARTIFACT_ENCODING =
  "application/vnd.math3d.topology-boundary-matrices+json;version=1" as const;

export type ExactSparseIntegerEntry = Readonly<{
  row: number;
  column: number;
  value: string;
}>;

export type ExactSparseIntegerContribution = Readonly<{
  row: number;
  column: number;
  value: "-1" | "1";
  sourceReferences: readonly CanonicalFinite2DSourceReference[];
}>;

export type ExactSparseCellBasisEntry = Readonly<{
  index: number;
  cell: CanonicalFinite2DCellLocator;
  sourceReferences: readonly CanonicalFinite2DSourceReference[];
}>;

export type ExactSparseIntegerMatrix = Readonly<{
  ring: "Z";
  encoding: "coo-decimal-bigint";
  rowCellDimension: 0 | 1;
  columnCellDimension: 1 | 2;
  rows: number;
  columns: number;
  rowBasis: readonly ExactSparseCellBasisEntry[];
  columnBasis: readonly ExactSparseCellBasisEntry[];
  entries: readonly ExactSparseIntegerEntry[];
  contributions: readonly ExactSparseIntegerContribution[];
}>;

export type ExactSparseBoundaryMatrixArtifact = Readonly<{
  format: typeof TOPOLOGY_BOUNDARY_MATRIX_ARTIFACT_FORMAT;
  schemaVersion: typeof TOPOLOGY_BOUNDARY_MATRIX_ARTIFACT_SCHEMA_VERSION;
  algorithmVersion: typeof CANONICAL_FINITE_2D_BOUNDARY_VERSION;
  validatorVersion: typeof CANONICAL_FINITE_2D_VALIDATOR_VERSION;
  source: ScientificSourceGeneration;
  sourceId: string;
  canonicalHash: StructuralHash;
  boundary1: ExactSparseIntegerMatrix;
  boundary2: ExactSparseIntegerMatrix;
  chainCondition: Readonly<{
    expression: "d1*d2 = 0";
    holds: boolean;
    nonzeroEntries: readonly ExactSparseIntegerEntry[];
  }>;
}>;

export type ExactSparseBoundaryMatrixSummary = Readonly<{
  boundary1Shape: readonly [number, number];
  boundary2Shape: readonly [number, number];
  boundary1Nonzeros: number;
  boundary2Nonzeros: number;
  chainConditionHolds: boolean;
}>;

export type ExactSparseBoundaryMatrixOutcome =
  | Readonly<{
      status: "exact";
      handle: AnalysisArtifactHandle;
      payload: ExactSparseBoundaryMatrixArtifact;
      summary: ExactSparseBoundaryMatrixSummary;
    }>
  | Readonly<{
      status: "unsupported" | "failed";
      diagnostics: readonly Readonly<{ code: string; message: string }>[];
    }>;

export type ExactSparseMatrixCoordinateLocation = Readonly<{
  coefficient: string;
  rowCell: ExactSparseCellBasisEntry;
  columnCell: ExactSparseCellBasisEntry;
  contributions: readonly ExactSparseIntegerContribution[];
}>;

const artifactHandle = (result: CanonicalFinite2DResult): AnalysisArtifactHandle => ({
  artifactId: `${result.complex.id}/boundary-matrices/g${result.source.generation}`,
  kind: "sparse-matrix",
  role: "topology.cellular-boundary-d1-d2",
});

const uniqueReferences = (
  references: readonly CanonicalFinite2DSourceReference[]
): CanonicalFinite2DSourceReference[] => {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.sourceId}\u0000${reference.stage}\u0000${reference.dimension}\u0000${reference.cellId}\u0000${reference.occurrence ?? -1}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const matrixEntries = (
  contributions: readonly ExactSparseIntegerContribution[]
): ExactSparseIntegerEntry[] => {
  const sums = new Map<string, bigint>();
  for (const contribution of contributions) {
    const key = `${contribution.row}\u0000${contribution.column}`;
    sums.set(key, (sums.get(key) ?? 0n) + BigInt(contribution.value));
  }
  return [...sums.entries()]
    .filter(([, value]) => value !== 0n)
    .map(([key, value]) => {
      const [row, column] = key.split("\u0000").map(Number);
      return { row: row!, column: column!, value: value.toString() };
    })
    .sort((left, right) => left.row - right.row || left.column - right.column);
};

const basis = (
  dimension: CanonicalCellDimension,
  cells: readonly Readonly<{ id: string; sourceRefs: readonly CanonicalFinite2DSourceReference[] }>[]
): ExactSparseCellBasisEntry[] =>
  cells.map((cell, index) => ({
    index,
    cell: { dimension, cellId: cell.id },
    sourceReferences: [...cell.sourceRefs],
  }));

const buildMatrices = (result: CanonicalFinite2DResult): {
  boundary1: ExactSparseIntegerMatrix;
  boundary2: ExactSparseIntegerMatrix;
} => {
  const complex = result.complex;
  const vertexIndex = new Map(complex.vertices.map((cell, index) => [cell.id, index]));
  const edgeIndex = new Map(complex.edges.map((cell, index) => [cell.id, index]));
  const boundary1Contributions: ExactSparseIntegerContribution[] = [];
  const boundary2Contributions: ExactSparseIntegerContribution[] = [];

  complex.edges.forEach((edge, column) => {
    const source = vertexIndex.get(edge.endpoints[0])!;
    const target = vertexIndex.get(edge.endpoints[1])!;
    boundary1Contributions.push({
      row: source,
      column,
      value: "-1",
      sourceReferences: uniqueReferences([
        ...edge.sourceRefs,
        ...complex.vertices[source]!.sourceRefs,
      ]),
    });
    boundary1Contributions.push({
      row: target,
      column,
      value: "1",
      sourceReferences: uniqueReferences([
        ...edge.sourceRefs,
        ...complex.vertices[target]!.sourceRefs,
      ]),
    });
  });
  complex.faces.forEach((face, column) => {
    face.attachment.forEach((token) => {
      const row = edgeIndex.get(token.edgeId)!;
      boundary2Contributions.push({
        row,
        column,
        value: token.direction === 1 ? "1" : "-1",
        sourceReferences: uniqueReferences([
          token.sourceRef,
          ...face.sourceRefs,
          ...complex.edges[row]!.sourceRefs,
        ]),
      });
    });
  });

  return {
    boundary1: {
      ring: "Z",
      encoding: "coo-decimal-bigint",
      rowCellDimension: 0,
      columnCellDimension: 1,
      rows: complex.vertices.length,
      columns: complex.edges.length,
      rowBasis: basis(0, complex.vertices),
      columnBasis: basis(1, complex.edges),
      entries: matrixEntries(boundary1Contributions),
      contributions: boundary1Contributions,
    },
    boundary2: {
      ring: "Z",
      encoding: "coo-decimal-bigint",
      rowCellDimension: 1,
      columnCellDimension: 2,
      rows: complex.edges.length,
      columns: complex.faces.length,
      rowBasis: basis(1, complex.edges),
      columnBasis: basis(2, complex.faces),
      entries: matrixEntries(boundary2Contributions),
      contributions: boundary2Contributions,
    },
  };
};

export const composeExactSparseIntegerMatrices = (
  left: ExactSparseIntegerMatrix,
  right: ExactSparseIntegerMatrix
): readonly ExactSparseIntegerEntry[] => {
  if (left.columns !== right.rows) throw new RangeError("Sparse matrix dimensions do not compose.");
  const rightByRow = new Map<number, ExactSparseIntegerEntry[]>();
  for (const entry of right.entries) {
    const row = rightByRow.get(entry.row) ?? [];
    row.push(entry);
    rightByRow.set(entry.row, row);
  }
  const sums = new Map<string, bigint>();
  for (const leftEntry of left.entries) {
    for (const rightEntry of rightByRow.get(leftEntry.column) ?? []) {
      const key = `${leftEntry.row}\u0000${rightEntry.column}`;
      const product = BigInt(leftEntry.value) * BigInt(rightEntry.value);
      sums.set(key, (sums.get(key) ?? 0n) + product);
    }
  }
  return [...sums.entries()]
    .filter(([, value]) => value !== 0n)
    .map(([key, value]) => {
      const [row, column] = key.split("\u0000").map(Number);
      return { row: row!, column: column!, value: value.toString() };
    })
    .sort((left, right) => left.row - right.row || left.column - right.column);
};

export const constructExactSparseBoundaryMatrices = (
  result: CanonicalFinite2DResult,
  sourceDocument: TopologyDocument
): ExactSparseBoundaryMatrixOutcome => {
  const validation = validateCanonicalFinite2DStructure(result, sourceDocument);
  if (validation.status !== "certified-within-model" || !validation.report?.eligibility.cellularAlgebra) {
    return immutableCanonicalJsonClone({
      status: "unsupported",
      diagnostics: validation.diagnostics.map(({ code, message }) => ({ code, message })),
    }) as ExactSparseBoundaryMatrixOutcome;
  }

  const { boundary1, boundary2 } = buildMatrices(result);
  const composition = composeExactSparseIntegerMatrices(boundary1, boundary2);
  if (composition.length > 0) {
    return immutableCanonicalJsonClone({
      status: "failed",
      diagnostics: composition.map((entry) => ({
        code: "cellular-boundary/nonzero-composition",
        message: `Exact d1*d2 coefficient at row ${entry.row}, column ${entry.column} is ${entry.value}.`,
      })),
    }) as ExactSparseBoundaryMatrixOutcome;
  }

  const payload: ExactSparseBoundaryMatrixArtifact = {
    format: TOPOLOGY_BOUNDARY_MATRIX_ARTIFACT_FORMAT,
    schemaVersion: TOPOLOGY_BOUNDARY_MATRIX_ARTIFACT_SCHEMA_VERSION,
    algorithmVersion: CANONICAL_FINITE_2D_BOUNDARY_VERSION,
    validatorVersion: CANONICAL_FINITE_2D_VALIDATOR_VERSION,
    source: result.source,
    sourceId: result.complex.sourceId,
    canonicalHash: result.canonicalHash,
    boundary1,
    boundary2,
    chainCondition: { expression: "d1*d2 = 0", holds: true, nonzeroEntries: [] },
  };
  return immutableCanonicalJsonClone({
    status: "exact",
    handle: artifactHandle(result),
    payload,
    summary: {
      boundary1Shape: [boundary1.rows, boundary1.columns],
      boundary2Shape: [boundary2.rows, boundary2.columns],
      boundary1Nonzeros: boundary1.entries.length,
      boundary2Nonzeros: boundary2.entries.length,
      chainConditionHolds: true,
    },
  }) as ExactSparseBoundaryMatrixOutcome;
};

export const decodeExactSparseIntegerMatrix = (matrix: ExactSparseIntegerMatrix): bigint[][] => {
  const dense = Array.from({ length: matrix.rows }, () => Array<bigint>(matrix.columns).fill(0n));
  for (const entry of matrix.entries) dense[entry.row]![entry.column] = BigInt(entry.value);
  return dense;
};

export const locateExactSparseMatrixCoordinate = (
  matrix: ExactSparseIntegerMatrix,
  row: number,
  column: number
): ExactSparseMatrixCoordinateLocation | null => {
  if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column) || row < 0 || column < 0) return null;
  const rowCell = matrix.rowBasis[row];
  const columnCell = matrix.columnBasis[column];
  if (!rowCell || !columnCell) return null;
  return immutableCanonicalJsonClone({
    coefficient: matrix.entries.find((entry) => entry.row === row && entry.column === column)?.value ?? "0",
    rowCell,
    columnCell,
    contributions: matrix.contributions.filter((entry) => entry.row === row && entry.column === column),
  }) as ExactSparseMatrixCoordinateLocation;
};

export const encodeExactSparseBoundaryMatrixArtifact = (
  payload: ExactSparseBoundaryMatrixArtifact
): Uint8Array => new TextEncoder().encode(canonicalJsonStringify(payload));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isIntegerString = (value: unknown, allowZero = true): value is string =>
  typeof value === "string" &&
  value.length <= 256 &&
  (allowZero ? /^(?:0|-?[1-9][0-9]*)$/.test(value) : /^-?[1-9][0-9]*$/.test(value));

const hasExactFields = (
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
  errors: string[]
): void => {
  const expectedSet = new Set(expected);
  const unknown = Object.keys(value).filter((field) => !expectedSet.has(field));
  const missing = expected.filter((field) => !Object.prototype.hasOwnProperty.call(value, field));
  if (unknown.length > 0) errors.push(`${path} contains unknown fields: ${unknown.sort().join(", ")}.`);
  if (missing.length > 0) errors.push(`${path} is missing fields: ${missing.sort().join(", ")}.`);
};

const validateSourceReference = (
  value: unknown,
  sourceId: string,
  path: string,
  errors: string[]
): void => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  const required = ["sourceId", "stage", "dimension", "cellId"];
  const optional = value.occurrence === undefined ? [] : ["occurrence"];
  hasExactFields(value, [...required, ...optional], path, errors);
  if (value.sourceId !== sourceId) errors.push(`${path}.sourceId must match artifact.sourceId.`);
  if (value.stage !== "source" && value.stage !== "refinement") errors.push(`${path}.stage is invalid.`);
  if (value.dimension !== 0 && value.dimension !== 1 && value.dimension !== 2) errors.push(`${path}.dimension is invalid.`);
  if (typeof value.cellId !== "string" || value.cellId.length === 0) errors.push(`${path}.cellId is invalid.`);
  if (value.occurrence !== undefined && (!Number.isSafeInteger(value.occurrence) || (value.occurrence as number) < 0)) {
    errors.push(`${path}.occurrence is invalid.`);
  }
};

const normalizeMatrix = (
  value: unknown,
  rowDimension: 0 | 1,
  columnDimension: 1 | 2,
  sourceId: string,
  path: string,
  errors: string[]
): ExactSparseIntegerMatrix | null => {
  const initialErrorCount = errors.length;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return null;
  }
  const allowed = new Set([
    "ring", "encoding", "rowCellDimension", "columnCellDimension", "rows", "columns",
    "rowBasis", "columnBasis", "entries", "contributions",
  ]);
  const unknown = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknown.length > 0) errors.push(`${path} contains unknown fields: ${unknown.sort().join(", ")}.`);
  if (value.ring !== "Z") errors.push(`${path}.ring must be Z.`);
  if (value.encoding !== "coo-decimal-bigint") errors.push(`${path}.encoding is invalid.`);
  if (value.rowCellDimension !== rowDimension || value.columnCellDimension !== columnDimension) {
    errors.push(`${path} cell dimensions are invalid.`);
  }
  if (!Number.isSafeInteger(value.rows) || (value.rows as number) < 0) errors.push(`${path}.rows is invalid.`);
  if (!Number.isSafeInteger(value.columns) || (value.columns as number) < 0) errors.push(`${path}.columns is invalid.`);
  const rows = Number.isSafeInteger(value.rows) ? value.rows as number : 0;
  const columns = Number.isSafeInteger(value.columns) ? value.columns as number : 0;

  const validateBasis = (candidate: unknown, dimension: CanonicalCellDimension, count: number, basisPath: string) => {
    if (!Array.isArray(candidate) || candidate.length !== count) {
      errors.push(`${basisPath} must contain exactly ${count} entries.`);
      return;
    }
    const cellIds = new Set<string>();
    candidate.forEach((entry, index) => {
      const entryPath = `${basisPath}[${index}]`;
      if (!isRecord(entry)) {
        errors.push(`${entryPath} is invalid.`);
        return;
      }
      hasExactFields(entry, ["index", "cell", "sourceReferences"], entryPath, errors);
      if (entry.index !== index) errors.push(`${entryPath}.index must equal ${index}.`);
      if (!isRecord(entry.cell)) {
        errors.push(`${entryPath}.cell is invalid.`);
      } else {
        hasExactFields(entry.cell, ["dimension", "cellId"], `${entryPath}.cell`, errors);
        if (entry.cell.dimension !== dimension) errors.push(`${entryPath}.cell.dimension is invalid.`);
        if (typeof entry.cell.cellId !== "string" || entry.cell.cellId.length === 0) {
          errors.push(`${entryPath}.cell.cellId is invalid.`);
        } else if (cellIds.has(entry.cell.cellId)) {
          errors.push(`${basisPath} contains duplicate cell ID '${entry.cell.cellId}'.`);
        } else {
          cellIds.add(entry.cell.cellId);
        }
      }
      if (!Array.isArray(entry.sourceReferences) || entry.sourceReferences.length === 0) {
        errors.push(`${entryPath}.sourceReferences must be a non-empty array.`);
      } else {
        entry.sourceReferences.forEach((reference, referenceIndex) => {
          validateSourceReference(reference, sourceId, `${entryPath}.sourceReferences[${referenceIndex}]`, errors);
          if (isRecord(reference) && reference.dimension !== dimension) {
            errors.push(`${entryPath}.sourceReferences[${referenceIndex}].dimension must be ${dimension}.`);
          }
        });
      }
    });
  };
  validateBasis(value.rowBasis, rowDimension, rows, `${path}.rowBasis`);
  validateBasis(value.columnBasis, columnDimension, columns, `${path}.columnBasis`);

  const entries = Array.isArray(value.entries) ? value.entries : [];
  if (!Array.isArray(value.entries)) errors.push(`${path}.entries must be an array.`);
  let previous = "";
  entries.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`${path}.entries[${index}] is invalid.`);
      return;
    }
    hasExactFields(entry, ["row", "column", "value"], `${path}.entries[${index}]`, errors);
    const valid = Number.isSafeInteger(entry.row) && Number.isSafeInteger(entry.column) &&
      (entry.row as number) >= 0 && (entry.row as number) < rows &&
      (entry.column as number) >= 0 && (entry.column as number) < columns &&
      isIntegerString(entry.value, false);
    if (!valid) errors.push(`${path}.entries[${index}] is invalid.`);
    const key = `${String(entry.row).padStart(12, "0")}:${String(entry.column).padStart(12, "0")}`;
    if (key <= previous) errors.push(`${path}.entries must be unique and row-major sorted.`);
    previous = key;
  });
  const contributions = Array.isArray(value.contributions) ? value.contributions : [];
  if (!Array.isArray(value.contributions)) errors.push(`${path}.contributions must be an array.`);
  contributions.forEach((entry, index) => {
    const entryPath = `${path}.contributions[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${entryPath} is invalid.`);
      return;
    }
    hasExactFields(entry, ["row", "column", "value", "sourceReferences"], entryPath, errors);
    if (!Number.isSafeInteger(entry.row) || (entry.row as number) < 0 || (entry.row as number) >= rows) {
      errors.push(`${entryPath}.row is invalid.`);
    }
    if (!Number.isSafeInteger(entry.column) || (entry.column as number) < 0 || (entry.column as number) >= columns) {
      errors.push(`${entryPath}.column is invalid.`);
    }
    if (entry.value !== "-1" && entry.value !== "1") errors.push(`${entryPath}.value is invalid.`);
    if (!Array.isArray(entry.sourceReferences) || entry.sourceReferences.length === 0) {
      errors.push(`${entryPath}.sourceReferences must be a non-empty array.`);
    } else {
      entry.sourceReferences.forEach((reference, referenceIndex) =>
        validateSourceReference(reference, sourceId, `${entryPath}.sourceReferences[${referenceIndex}]`, errors)
      );
    }
  });
  if (errors.length > initialErrorCount) return null;
  const matrix = value as unknown as ExactSparseIntegerMatrix;
  if (canonicalJsonStringify(matrixEntries(matrix.contributions)) !== canonicalJsonStringify(matrix.entries)) {
    errors.push(`${path}.entries do not equal the exact sum of contributions.`);
    return null;
  }
  return matrix;
};

export const normalizeExactSparseBoundaryMatrixArtifact = (
  value: unknown
): Readonly<{ ok: true; value: ExactSparseBoundaryMatrixArtifact } | { ok: false; errors: readonly string[] }> => {
  if (!isRecord(value)) return { ok: false, errors: ["Boundary-matrix artifact must be an object."] };
  const errors: string[] = [];
  const allowed = new Set([
    "format", "schemaVersion", "algorithmVersion", "validatorVersion", "source", "sourceId", "canonicalHash",
    "boundary1", "boundary2", "chainCondition",
  ]);
  const unknown = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknown.length > 0) errors.push(`Boundary-matrix artifact contains unknown fields: ${unknown.sort().join(", ")}.`);
  if (value.format !== TOPOLOGY_BOUNDARY_MATRIX_ARTIFACT_FORMAT) errors.push("Boundary-matrix artifact format is invalid.");
  if (value.schemaVersion !== TOPOLOGY_BOUNDARY_MATRIX_ARTIFACT_SCHEMA_VERSION) errors.push("Boundary-matrix artifact schema version is invalid.");
  if (value.algorithmVersion !== CANONICAL_FINITE_2D_BOUNDARY_VERSION) errors.push("Boundary-matrix artifact algorithm version is invalid.");
  if (value.validatorVersion !== CANONICAL_FINITE_2D_VALIDATOR_VERSION) errors.push("Boundary-matrix artifact validator version is invalid.");
  if (!isScientificSourceGeneration(value.source)) errors.push("Boundary-matrix artifact source is invalid.");
  if (typeof value.sourceId !== "string" || value.sourceId.length === 0) errors.push("Boundary-matrix artifact sourceId is invalid.");
  if (!isStructuralHash(value.canonicalHash)) errors.push("Boundary-matrix artifact canonical hash is invalid.");
  const sourceId = typeof value.sourceId === "string" ? value.sourceId : "";
  const boundary1 = normalizeMatrix(value.boundary1, 0, 1, sourceId, "artifact.boundary1", errors);
  const boundary2 = normalizeMatrix(value.boundary2, 1, 2, sourceId, "artifact.boundary2", errors);
  if (!isRecord(value.chainCondition) || value.chainCondition.expression !== "d1*d2 = 0" ||
      value.chainCondition.holds !== true || !Array.isArray(value.chainCondition.nonzeroEntries) ||
      value.chainCondition.nonzeroEntries.length !== 0) {
    errors.push("Boundary-matrix artifact chain condition must record an exact zero composition.");
  } else {
    hasExactFields(value.chainCondition, ["expression", "holds", "nonzeroEntries"], "artifact.chainCondition", errors);
  }
  if (boundary1 && boundary2) {
    if (boundary1.columns !== boundary2.rows) errors.push("Boundary-matrix artifact dimensions do not compose.");
    if (canonicalJsonStringify(boundary1.columnBasis) !== canonicalJsonStringify(boundary2.rowBasis)) {
      errors.push("Boundary-matrix artifact C1 bases do not match.");
    }
    if (composeExactSparseIntegerMatrices(boundary1, boundary2).length > 0) {
      errors.push("Boundary-matrix artifact has nonzero d1*d2 composition.");
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: immutableCanonicalJsonClone(value) as ExactSparseBoundaryMatrixArtifact,
  };
};

export const decodeExactSparseBoundaryMatrixArtifact = (
  bytes: Uint8Array
): ExactSparseBoundaryMatrixArtifact => {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Boundary-matrix artifact bytes must be a Uint8Array.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new TypeError(`Boundary-matrix artifact is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const normalized = normalizeExactSparseBoundaryMatrixArtifact(parsed);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
