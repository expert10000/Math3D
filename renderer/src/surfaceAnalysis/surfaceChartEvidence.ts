import { analysisResultKey, isAnalysisResultCurrent } from "../analysis/resultStore";
import type { CanonicalSurfaceDefinition, SurfaceAnalysisPayload, SurfaceIdentity,
  SurfaceChartPayload } from "./contracts";
import { getSurfaceAnalysisResult, type SurfaceAnalysisResult,
  type SurfaceAnalysisResultStore } from "./infrastructure";
import type { SurfaceResultPresentation } from "./surfaceResultPresentation";
import { createResultPublication, resultEvidenceRowsCsv } from "../results/resultPublication";

/** Overlay visibility is display state and must not create a new chart computation. */
export const editSurfaceChartOverlay = (
  store: SurfaceAnalysisResultStore,
  identity: SurfaceIdentity,
  kind: SurfaceChartPayload["overlays"][number]["kind"],
): SurfaceAnalysisResultStore => {
  const result = getSurfaceAnalysisResult<SurfaceAnalysisPayload>(store, identity, "chart-diagnostics");
  const payload = result?.payload;
  if (!result || !isAnalysisResultCurrent(store, result) || payload?.data.kind !== "chart" ||
      !payload.data.overlays.some(overlay => overlay.kind === kind)) return store;
  const chart = payload.data;
  const overlays = chart.overlays.map(overlay => overlay.kind === kind ? { ...overlay, visible: !overlay.visible } : overlay);
  const key = analysisResultKey(identity, "chart-diagnostics");
  return { ...store, entries: { ...store.entries,
    [key]: { ...result, payload: { ...payload, data: { ...chart, overlays } } } } };
};

export const createSurfaceChartEvidence = (input: {
  definition: CanonicalSurfaceDefinition;
  result: SurfaceAnalysisResult<SurfaceAnalysisPayload>;
  qualification: SurfaceResultPresentation;
}) => {
  const { definition, result, qualification } = input;
  const payload = result.payload;
  if (result.kind !== "chart-diagnostics" || payload?.data.kind !== "chart" ||
      qualification.status === "unavailable" || payload.surfaceId !== result.identity.surfaceId ||
      payload.surfaceRevision !== result.identity.surfaceRevision) {
    throw new TypeError("Chart evidence requires a matching Surface chart result.");
  }
  const current = qualification.canUseCurrentValues && qualification.status === "current" &&
    definition.identity.key === result.identity.key;
  const publication = createResultPublication({ module: "surface",
    resultId: `${result.identity.key}:chart-diagnostics:v${result.resultVersion}`,
    source: { id: result.identity.key, revision: result.identity.surfaceRevision,
      generation: null, hash: current ? definition.fingerprint : null },
    sourceStatus: qualification.status, status: current ? "recorded" : "withheld",
    reason: qualification.reason, recordedClaim: qualification.claim,
    independentCheck: qualification.verification,
    summary: { sampleCount: payload.data.sampleCount, statistics: payload.data.statistics,
      units: payload.units, warnings: payload.warnings } });
  return {
    format: "math3d.surface-chart-evidence/v1" as const,
    source: { identity: result.identity,
      fingerprint: current ? definition.fingerprint : null,
      representation: payload.representation, units: payload.units, orientation: payload.orientation },
    result: { kind: result.kind, variant: result.variant, state: result.state,
      version: result.resultVersion, method: payload.method, backend: result.backend,
      parameters: result.parameters, dependencies: result.dependencies },
    qualification: { status: qualification.status, claim: qualification.claim,
      independentCheck: qualification.verification, reason: qualification.reason },
    warnings: payload.warnings,
    chart: current ? payload.data : null,
    publication,
  };
};

export const serializeSurfaceChartEvidence = (evidence: ReturnType<typeof createSurfaceChartEvidence>): string =>
  JSON.stringify(evidence, (_key, value) => ArrayBuffer.isView(value)
    ? Array.from(value as unknown as ArrayLike<number>) : value, 2) + "\n";

/** Bounded chart statistics; sampled arrays remain in the qualified JSON export. */
export const surfaceChartEvidenceCsv = (evidence: ReturnType<typeof createSurfaceChartEvidence>): string =>
  resultEvidenceRowsCsv([
    ["resultId", evidence.publication.resultId], ["sourceId", evidence.publication.source.id],
    ["sourceRevision", evidence.publication.source.revision],
    ["sourceFingerprint", evidence.publication.source.hash],
    ["sourceStatus", evidence.publication.assessment.sourceStatus],
    ["publicationStatus", evidence.publication.assessment.status],
    ["recordedClaim", evidence.publication.assessment.recordedClaim],
    ["independentCheck", evidence.publication.assessment.independentCheck],
    ["sampleCount", evidence.publication.summary?.sampleCount ?? null],
    ["statistics", evidence.publication.summary?.statistics ?? null],
    ["units", evidence.source.units], ["warnings", evidence.warnings],
  ]);
