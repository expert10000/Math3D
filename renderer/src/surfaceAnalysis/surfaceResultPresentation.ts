import { isAnalysisResultCurrent } from "../analysis/resultStore";
import type { CanonicalSurfaceDefinition, SurfaceAnalysisPayload, SurfaceResultKind } from "./contracts";
import type { SurfaceAnalysisResult, SurfaceAnalysisResultStore } from "./infrastructure";

export type SurfaceResultPresentation = Readonly<{
  status: "current" | "historical" | "unavailable";
  claim: string;
  verification: string;
  reason: string;
  canUseCurrentValues: boolean;
}>;

const claims: Partial<Record<SurfaceResultKind, string>> = {
  "surface-definition": "The represented Surface definition and its source generation are recorded.",
  "curvature-field": "Curvature values were sampled or approximated on the represented Surface.",
  "surface-probe": "Local differential quantities were evaluated at a represented Surface point.",
  "chart-diagnostics": "Metric and distortion diagnostics were evaluated on the parameter domain.",
  "surface-curves": "Curves were collected from represented Surface geometry.",
  "surface-features": "Features were collected from represented Surface geometry.",
  "derived-surface-mesh": "A discrete mesh was derived from the represented Surface.",
};

const unchecked = "The recorded source dependency is checked for freshness; mathematical correctness is not independently verified in this Inspector.";

export const presentSurfaceAnalysisResult = (
  definition: CanonicalSurfaceDefinition,
  result: SurfaceAnalysisResult<SurfaceAnalysisPayload> | null,
  store: SurfaceAnalysisResultStore,
): SurfaceResultPresentation => {
  if (!result?.payload) return { status: "unavailable", claim: "No completed Surface result is available.",
    verification: "No independent check is available.", reason: result?.error ?? "Compute or collect a result for this Surface.",
    canUseCurrentValues: false };
  const payload = result.payload;
  if (payload.surfaceId !== result.identity.surfaceId || payload.surfaceRevision !== result.identity.surfaceRevision ||
      payload.representation !== result.identity.representation) return {
    status: "unavailable", claim: "Surface result identity is inconsistent.",
    verification: "No independent check is available.", reason: "The payload does not match its recorded Surface generation.",
    canUseCurrentValues: false,
  };
  const claim = claims[result.kind] ?? `A ${result.kind} result was recorded for the represented Surface.`;
  if (result.identity.key !== definition.identity.key || !isAnalysisResultCurrent(store, result)) return {
    status: "historical", claim, verification: unchecked,
    reason: "The result or a recorded source dependency is no longer current; recompute before using numerical values.",
    canUseCurrentValues: false,
  };
  return { status: "current", claim, verification: unchecked,
    reason: "The exact Surface source dependency is current.", canUseCurrentValues: true };
};
