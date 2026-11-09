import { isAnalysisResultCurrent } from "../analysis/resultStore";
import type { CanonicalSurfaceDefinition, SurfaceAnalysisPayload } from "./contracts";
import type { SurfaceAnalysisResult, SurfaceAnalysisResultStore } from "./infrastructure";

export type SurfaceLayerQualification = Readonly<{
  status: "current" | "historical" | "unavailable";
  claim: string;
  verification: string;
  reason: string;
  canUseCurrentActions: boolean;
}>;

const noIndependentCheck = "Source identity and layer geometry are recorded; mathematical correctness has not been independently verified here.";

export const qualifySurfaceLayerResult = (
  definition: CanonicalSurfaceDefinition,
  result: SurfaceAnalysisResult<SurfaceAnalysisPayload> | null,
  store: SurfaceAnalysisResultStore,
): SurfaceLayerQualification => {
  const data = result?.payload?.data;
  if (!result || !data || (data.kind !== "curve-layers" && data.kind !== "feature-layers")) return {
    status: "unavailable", claim: "No collected Surface layers are available.",
    verification: "No independent check is available.", reason: "Collect layers from the current Surface to inspect them.",
    canUseCurrentActions: false,
  };
  const expectedKind = data.kind === "curve-layers" ? "surface-curves" : "surface-features";
  const consistent = result.kind === expectedKind && result.payload?.surfaceId === result.identity.surfaceId &&
    result.payload.surfaceRevision === result.identity.surfaceRevision &&
    data.layers.every(layer => layer.identity.key === result.identity.key && layer.identity.surfaceRevision === result.identity.surfaceRevision);
  if (!consistent) return {
    status: "unavailable", claim: "Collected Surface layer identity is inconsistent.",
    verification: "No independent check is available.", reason: "The result and its layers do not identify the same Surface generation.",
    canUseCurrentActions: false,
  };
  const claim = data.kind === "curve-layers"
    ? "Curves were collected from represented Surface geometry."
    : "Features were collected from represented Surface geometry.";
  if (result.identity.key !== definition.identity.key || !isAnalysisResultCurrent(store, result)) return {
    status: "historical", claim, verification: noIndependentCheck,
    reason: "The saved layer result or its source definition is no longer current; recompute before using it as current geometry.",
    canUseCurrentActions: false,
  };
  return { status: "current", claim, verification: noIndependentCheck,
    reason: "The exact Surface definition dependency is current.", canUseCurrentActions: true };
};
