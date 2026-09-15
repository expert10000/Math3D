import {
  constructExactSparseBoundaryMatrices,
  classifyCanonicalFinite2DSurface,
  createSageIntegerHomologyJobRequest,
  createSageIntegerHomologyPayload,
  normalizeSageIntegerHomologyOutput,
  publishSageIntegerHomologyResult,
  type AnalysisResultEnvelope,
  type CanonicalFinite2DResult,
  type CanonicalSurfaceClassificationOutcome,
  type ExactSparseBoundaryMatrixOutcome,
  type LocalZ2HomologyOutcome,
  type SageIntegerHomologyOutput,
  type ScientificJobLimits,
  type ScientificJobOutcome,
  type ScientificJobRequest,
  type ScientificSourceGeneration,
  type TopologyDocument,
} from "@math3d/core";
import { canonicalizeFundamentalDiagramTopologyDocument } from "./canonicalFinite2DAdapter";
import { computeFundamentalDiagramLocalZ2Feedback } from "./localZ2Feedback";
import { createSageUnavailableFallback } from "./sageIntegerHomologyJob";

export type TopologyAlgebraAuthority = Readonly<{
  status: "exact";
  document: TopologyDocument;
  canonical: CanonicalFinite2DResult;
  boundary: Extract<ExactSparseBoundaryMatrixOutcome, { status: "exact" }>;
  localZ2: LocalZ2HomologyOutcome;
  surfaceClassification: CanonicalSurfaceClassificationOutcome;
}> | Readonly<{
  status: "unsupported" | "failed";
  diagnostics: readonly Readonly<{ code: string; message: string }>[];
  localZ2: LocalZ2HomologyOutcome;
  surfaceClassification: CanonicalSurfaceClassificationOutcome | null;
}>;

export type PreparedTopologyIntegerHomologyJob = Readonly<{
  authority: Extract<TopologyAlgebraAuthority, { status: "exact" }>;
  payload: ReturnType<typeof createSageIntegerHomologyPayload>;
  request: ScientificJobRequest;
}>;

export type PublishedTopologyIntegerHomology =
  | Readonly<{
      status: "exact";
      output: SageIntegerHomologyOutput;
      result: AnalysisResultEnvelope;
    }>
  | Readonly<{
      status: "sage-unavailable";
      message: string;
      localZ2: LocalZ2HomologyOutcome;
    }>
  | Readonly<{
      status: "cancelled" | "stale" | "failed";
      message: string;
    }>
  | Readonly<{
      status: "timed-out";
      message: string;
      localZ2: LocalZ2HomologyOutcome;
    }>;

export const DEFAULT_TOPOLOGY_INTEGER_HOMOLOGY_LIMITS = Object.freeze({
  maxInputBytes: 256 * 1024,
  maxOutputBytes: 64 * 1024,
  maxMemoryBytes: 512 * 1024,
  maxWorkUnits: 100_000,
});

export const deriveTopologyAlgebraAuthority = (document: TopologyDocument): TopologyAlgebraAuthority => {
  const localZ2 = computeFundamentalDiagramLocalZ2Feedback(document);
  const canonical = canonicalizeFundamentalDiagramTopologyDocument(document);
  if (canonical.status !== "canonicalized") {
    return {
      status: canonical.status === "unsupported" ? "unsupported" : "failed",
      diagnostics: canonical.diagnostics.map(({ code, message }) => ({ code, message })),
      localZ2,
      surfaceClassification: null,
    };
  }
  const surfaceClassification = classifyCanonicalFinite2DSurface(canonical, document);
  const boundary = constructExactSparseBoundaryMatrices(canonical, document);
  if (boundary.status !== "exact") return { ...boundary, localZ2, surfaceClassification };
  return { status: "exact", document, canonical, boundary, localZ2, surfaceClassification };
};

export const prepareTopologyIntegerHomologyJob = (args: {
  document: TopologyDocument;
  jobId: string;
  deadlineAt: number;
  limits?: Partial<Omit<ScientificJobLimits, "deadlineAt">>;
}): PreparedTopologyIntegerHomologyJob => {
  const authority = deriveTopologyAlgebraAuthority(args.document);
  if (authority.status !== "exact") {
    throw new TypeError(authority.diagnostics.map(({ code, message }) => `${code}: ${message}`).join(" "));
  }
  const payload = createSageIntegerHomologyPayload({
    boundaryMatrices: authority.boundary.payload,
    boundaryMatrixHandle: authority.boundary.handle,
    currentSource: authority.canonical.source,
  });
  const request = createSageIntegerHomologyJobRequest({
    jobId: args.jobId,
    source: authority.canonical.source,
    payload,
    limits: {
      deadlineAt: args.deadlineAt,
      ...DEFAULT_TOPOLOGY_INTEGER_HOMOLOGY_LIMITS,
      ...args.limits,
    },
  });
  return { authority, payload, request };
};

export const publishTopologyIntegerHomologyOutcome = (args: {
  prepared: PreparedTopologyIntegerHomologyJob;
  outcome: ScientificJobOutcome;
  currentSource: ScientificSourceGeneration;
}): PublishedTopologyIntegerHomology => {
  if (args.outcome.ok) {
    try {
      const normalized = normalizeSageIntegerHomologyOutput(args.outcome.output);
      if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
      return {
        status: "exact",
        output: normalized.value,
        result: publishSageIntegerHomologyResult({
          jobResult: args.outcome,
          currentSource: args.currentSource,
          expectedPayload: args.prepared.payload,
          boundaryMatrixHandle: args.prepared.authority.boundary.handle,
        }),
      };
    } catch (error) {
      return { status: "failed", message: error instanceof Error ? error.message : String(error) };
    }
  }

  if (args.outcome.code === "cancelled") return { status: "cancelled", message: args.outcome.message };
  if (args.outcome.code === "deadline-exceeded") {
    return { status: "timed-out", message: args.outcome.message, localZ2: args.prepared.authority.localZ2 };
  }
  if (args.outcome.code === "stale-source") return { status: "stale", message: args.outcome.message };

  const fallback = createSageUnavailableFallback({
    sageOutcome: args.outcome,
    boundaryMatrices: args.prepared.authority.boundary.payload,
    boundaryMatrixHandle: args.prepared.authority.boundary.handle,
    currentSource: args.currentSource,
  });
  if (fallback) {
    return { status: "sage-unavailable", message: args.outcome.message, localZ2: fallback.localZ2 };
  }
  return { status: "failed", message: args.outcome.message };
};
