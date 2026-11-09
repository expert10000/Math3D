import { analysisResultKey, isAnalysisResultCurrent } from "../analysis/resultStore";
import type { CanonicalSurfaceDefinition, SurfaceAnalysisPayload, SurfaceIdentity,
  SurfaceChartPayload } from "./contracts";
import { getSurfaceAnalysisResult, type SurfaceAnalysisResult,
  type SurfaceAnalysisResultStore } from "./infrastructure";
import type { SurfaceResultPresentation } from "./surfaceResultPresentation";

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
  return {
    format: "math3d.surface-chart-evidence/v1" as const,
    source: { identity: result.identity,
      fingerprint: qualification.status === "current" && definition.identity.key === result.identity.key ? definition.fingerprint : null,
      representation: payload.representation, units: payload.units, orientation: payload.orientation },
    result: { kind: result.kind, variant: result.variant, state: result.state,
      version: result.resultVersion, method: payload.method, backend: result.backend,
      parameters: result.parameters, dependencies: result.dependencies },
    qualification: { status: qualification.status, claim: qualification.claim,
      independentCheck: qualification.verification, reason: qualification.reason },
    warnings: payload.warnings,
    chart: payload.data,
  };
};

export const serializeSurfaceChartEvidence = (evidence: ReturnType<typeof createSurfaceChartEvidence>): string =>
  JSON.stringify(evidence, (_key, value) => ArrayBuffer.isView(value)
    ? Array.from(value as unknown as ArrayLike<number>) : value, 2);
