import {
  createAnalysisResultEnvelope,
  type AnalysisArtifactHandle,
  type AnalysisResultEnvelope,
} from "./analysisResults";
import {
  normalizeExactSparseBoundaryMatrixArtifact,
  type ExactSparseBoundaryMatrixArtifact,
  type ExactSparseIntegerMatrix,
} from "./canonicalFinite2DBoundaryMatrices";
import { immutableCanonicalJsonClone } from "./commands";
import {
  matchesScientificSourceGeneration,
  type ScientificSourceGeneration,
} from "./scientificJobs";

export const LOCAL_Z2_HOMOLOGY_VERSION = "local-sparse-z2-homology@1" as const;

export const DEFAULT_LOCAL_Z2_HOMOLOGY_LIMITS = Object.freeze({
  maxCells: 4_096,
  maxNonzeros: 200_000,
  maxReductionSteps: 4_000_000,
});

export type LocalZ2HomologyLimits = Readonly<{
  maxCells: number;
  maxNonzeros: number;
  maxReductionSteps: number;
}>;

export type LocalZ2HomologyGroup = Readonly<{
  degree: 0 | 1 | 2;
  dimension: number;
  notation: string;
}>;

export type LocalZ2HomologyValue = Readonly<{
  coefficientField: Readonly<{
    name: "finite field with two elements";
    notation: "Z/2Z";
    characteristic: 2;
  }>;
  authority: "exact";
  scope: "bounded-local-feedback";
  chainDimensions: readonly [number, number, number];
  boundaryRanks: readonly [number, number];
  bettiNumbers: readonly [number, number, number];
  groups: readonly [LocalZ2HomologyGroup, LocalZ2HomologyGroup, LocalZ2HomologyGroup];
  work: Readonly<{
    nonzeros: number;
    reductionSteps: number;
    limits: LocalZ2HomologyLimits;
  }>;
  limitation: string;
}>;

export type LocalZ2HomologyRequest = Readonly<{
  boundaryMatrices: unknown;
  boundaryMatrixHandle: AnalysisArtifactHandle;
  currentSource: ScientificSourceGeneration;
  limits?: Partial<LocalZ2HomologyLimits>;
}>;

export type LocalZ2HomologyOutcome =
  | Readonly<{ status: "exact"; value: LocalZ2HomologyValue; result: AnalysisResultEnvelope }>
  | Readonly<{ status: "unsupported"; result?: AnalysisResultEnvelope; diagnostics: readonly LocalZ2Diagnostic[] }>
  | Readonly<{ status: "failed"; diagnostics: readonly LocalZ2Diagnostic[] }>;

export type LocalZ2Diagnostic = Readonly<{
  code: string;
  message: string;
}>;

class ReductionLimitError extends Error {}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;

const notation = (dimension: number): string =>
  dimension === 0 ? "0" : dimension === 1 ? "Z/2Z" : `(Z/2Z)^${dimension}`;

const normalizeLimit = (value: unknown, fallback: number, name: string): number => {
  const normalized = value ?? fallback;
  if (!Number.isSafeInteger(normalized) || (normalized as number) < 1) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
  return normalized as number;
};

const normalizeLimits = (value?: Partial<LocalZ2HomologyLimits>): LocalZ2HomologyLimits => ({
  maxCells: normalizeLimit(value?.maxCells, DEFAULT_LOCAL_Z2_HOMOLOGY_LIMITS.maxCells, "maxCells"),
  maxNonzeros: normalizeLimit(value?.maxNonzeros, DEFAULT_LOCAL_Z2_HOMOLOGY_LIMITS.maxNonzeros, "maxNonzeros"),
  maxReductionSteps: normalizeLimit(
    value?.maxReductionSteps,
    DEFAULT_LOCAL_Z2_HOMOLOGY_LIMITS.maxReductionSteps,
    "maxReductionSteps"
  ),
});

const validateHandle = (handle: AnalysisArtifactHandle): void => {
  if (
    !handle ||
    typeof handle.artifactId !== "string" || !SAFE_ID.test(handle.artifactId) ||
    handle.kind !== "sparse-matrix" ||
    handle.role !== "topology.cellular-boundary-d1-d2"
  ) {
    throw new TypeError("Local Z/2Z homology requires the T06 boundary-matrix artifact handle.");
  }
};

const sparseMod2Columns = (
  matrix: ExactSparseIntegerMatrix,
  work: { steps: number },
  maxReductionSteps: number
): bigint[] => {
  const columns = Array<bigint>(matrix.columns).fill(0n);
  for (const entry of matrix.entries) {
    work.steps += 1;
    if (work.steps > maxReductionSteps) throw new ReductionLimitError("Local Z/2Z work limit exceeded while decoding incidence.");
    if ((BigInt(entry.value) & 1n) !== 0n) columns[entry.column] ^= 1n << BigInt(entry.row);
  }
  return columns;
};

const rankMod2 = (
  matrix: ExactSparseIntegerMatrix,
  work: { steps: number },
  maxReductionSteps: number
): number => {
  const pivots = new Map<number, bigint>();
  let rank = 0;
  for (let vector of sparseMod2Columns(matrix, work, maxReductionSteps)) {
    while (vector !== 0n) {
      work.steps += 1;
      if (work.steps > maxReductionSteps) throw new ReductionLimitError("Local Z/2Z work limit exceeded during sparse reduction.");
      const pivot = vector.toString(2).length - 1;
      const existing = pivots.get(pivot);
      if (existing === undefined) {
        pivots.set(pivot, vector);
        rank += 1;
        break;
      }
      vector ^= existing;
    }
  }
  return rank;
};

const diagnostic = (code: string, message: string): LocalZ2Diagnostic => ({ code, message });

const resultId = (artifact: ExactSparseBoundaryMatrixArtifact): string =>
  `${artifact.source.documentId}/result/homology-z2/g${artifact.source.generation}`;

const resultEnvelope = (
  artifact: ExactSparseBoundaryMatrixArtifact,
  handle: AnalysisArtifactHandle,
  status: "exact" | "unsupported",
  limits: LocalZ2HomologyLimits,
  summary: Record<string, unknown>,
  warnings: readonly string[],
  diagnostics: readonly LocalZ2Diagnostic[]
): AnalysisResultEnvelope => createAnalysisResultEnvelope({
  resultId: resultId(artifact),
  status,
  provenance: {
    source: artifact.source,
    operation: {
      type: "topology.homology-z2",
      algorithm: "bounded sparse column reduction over the finite field with two elements",
      algorithmVersion: LOCAL_Z2_HOMOLOGY_VERSION,
      parameters: {
        coefficientField: "Z/2Z",
        maxCells: limits.maxCells,
        maxNonzeros: limits.maxNonzeros,
        maxReductionSteps: limits.maxReductionSteps,
        canonicalHash: artifact.canonicalHash,
      },
    },
    engine: { name: "Math3D shared core", version: "1" },
    elapsedMs: 0,
  },
  summary: summary as AnalysisResultEnvelope["summary"],
  warnings,
  diagnostics: diagnostics.map((entry) => ({ ...entry, severity: status === "exact" ? "info" : "warning" })),
  artifacts: [handle],
});

const limitOutcome = (
  artifact: ExactSparseBoundaryMatrixArtifact,
  handle: AnalysisArtifactHandle,
  limits: LocalZ2HomologyLimits,
  code: string,
  message: string
): LocalZ2HomologyOutcome => {
  const diagnostics = [diagnostic(code, message)];
  return immutableCanonicalJsonClone({
    status: "unsupported",
    result: resultEnvelope(
      artifact,
      handle,
      "unsupported",
      limits,
      {
        coefficientField: "Z/2Z",
        authority: "unsupported",
        canonicalHash: artifact.canonicalHash,
        limitation: message,
      },
      ["The bounded local engine withheld output; increase reviewed limits or use a constrained external job."],
      diagnostics
    ),
    diagnostics,
  }) as LocalZ2HomologyOutcome;
};

/** Computes immediate exact Betti numbers over Z/2Z from a current T06 artifact. */
export const computeLocalZ2Homology = (request: LocalZ2HomologyRequest): LocalZ2HomologyOutcome => {
  let limits: LocalZ2HomologyLimits;
  try {
    limits = normalizeLimits(request.limits);
    validateHandle(request.boundaryMatrixHandle);
  } catch (error) {
    return immutableCanonicalJsonClone({
      status: "failed",
      diagnostics: [diagnostic("homology-z2/invalid-request", error instanceof Error ? error.message : String(error))],
    }) as LocalZ2HomologyOutcome;
  }

  const normalized = normalizeExactSparseBoundaryMatrixArtifact(request.boundaryMatrices);
  if (!normalized.ok) {
    return immutableCanonicalJsonClone({
      status: "failed",
      diagnostics: normalized.errors.map((message) => diagnostic("homology-z2/invalid-boundary-artifact", message)),
    }) as LocalZ2HomologyOutcome;
  }
  const artifact = normalized.value;
  if (!matchesScientificSourceGeneration(artifact.source, request.currentSource)) {
    return immutableCanonicalJsonClone({
      status: "unsupported",
      diagnostics: [diagnostic(
        "homology-z2/stale-source",
        "The boundary artifact does not match the current topology document revision, hash, and generation."
      )],
    }) as LocalZ2HomologyOutcome;
  }

  const chainDimensions = [
    artifact.boundary1.rows,
    artifact.boundary1.columns,
    artifact.boundary2.columns,
  ] as const;
  const totalCells = chainDimensions.reduce((sum, value) => sum + value, 0);
  const nonzeros = artifact.boundary1.entries.length + artifact.boundary2.entries.length;
  if (totalCells > limits.maxCells) {
    return limitOutcome(
      artifact,
      request.boundaryMatrixHandle,
      limits,
      "homology-z2/cell-limit-exceeded",
      `The finite complex has ${totalCells} cells; the local limit is ${limits.maxCells}.`
    );
  }
  if (nonzeros > limits.maxNonzeros) {
    return limitOutcome(
      artifact,
      request.boundaryMatrixHandle,
      limits,
      "homology-z2/nonzero-limit-exceeded",
      `The boundary operators have ${nonzeros} nonzero entries; the local limit is ${limits.maxNonzeros}.`
    );
  }

  const work = { steps: 0 };
  let rank1: number;
  let rank2: number;
  try {
    rank1 = rankMod2(artifact.boundary1, work, limits.maxReductionSteps);
    rank2 = rankMod2(artifact.boundary2, work, limits.maxReductionSteps);
  } catch (error) {
    if (error instanceof ReductionLimitError) {
      return limitOutcome(
        artifact,
        request.boundaryMatrixHandle,
        limits,
        "homology-z2/work-limit-exceeded",
        error.message
      );
    }
    return immutableCanonicalJsonClone({
      status: "failed",
      diagnostics: [diagnostic("homology-z2/reduction-failed", error instanceof Error ? error.message : String(error))],
    }) as LocalZ2HomologyOutcome;
  }

  const bettiNumbers = [
    chainDimensions[0] - rank1,
    chainDimensions[1] - rank1 - rank2,
    chainDimensions[2] - rank2,
  ] as const;
  if (bettiNumbers.some((value) => value < 0)) {
    return immutableCanonicalJsonClone({
      status: "failed",
      diagnostics: [diagnostic("homology-z2/inconsistent-ranks", "Boundary ranks produce a negative homology dimension.")],
    }) as LocalZ2HomologyOutcome;
  }

  const groups = bettiNumbers.map((dimension, degree) => ({
    degree: degree as 0 | 1 | 2,
    dimension,
    notation: notation(dimension),
  })) as unknown as LocalZ2HomologyValue["groups"];
  const limitation = "Finite-field feedback does not compute integral homology or torsion and does not replace the T08 Sage job.";
  const value: LocalZ2HomologyValue = {
    coefficientField: { name: "finite field with two elements", notation: "Z/2Z", characteristic: 2 },
    authority: "exact",
    scope: "bounded-local-feedback",
    chainDimensions,
    boundaryRanks: [rank1, rank2],
    bettiNumbers,
    groups,
    work: { nonzeros, reductionSteps: work.steps, limits },
    limitation,
  };
  const result = resultEnvelope(
    artifact,
    request.boundaryMatrixHandle,
    "exact",
    limits,
    {
      coefficientField: value.coefficientField.notation,
      characteristic: value.coefficientField.characteristic,
      authority: value.authority,
      scope: value.scope,
      chainDimensions: [...value.chainDimensions],
      boundaryRanks: [...value.boundaryRanks],
      bettiNumbers: [...value.bettiNumbers],
      groupNotations: value.groups.map((group) => group.notation),
      canonicalHash: artifact.canonicalHash,
      limitation,
    },
    [limitation],
    []
  );
  return immutableCanonicalJsonClone({ status: "exact", value, result }) as LocalZ2HomologyOutcome;
};
