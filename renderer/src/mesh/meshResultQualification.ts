import { analysisParameterHash } from "../analysis/resultStore";
import { isMeshAnalysisResultCurrent, type MeshAnalysisMeshIdentity,
  type MeshAnalysisParameters, type MeshAnalysisResult,
  type MeshAnalysisResultKind, type MeshAnalysisResultStore } from "./analysisResultStore";

export type MeshResultQualification = Readonly<{
  status: "current" | "historical" | "computing" | "failed" | "unavailable";
  reason: string;
  canUseCurrentValues: boolean;
}>;

export const qualifyMeshAnalysisResult = (input: {
  store: MeshAnalysisResultStore;
  mesh: MeshAnalysisMeshIdentity | null;
  result: MeshAnalysisResult | null;
  kind: MeshAnalysisResultKind | null;
  variant?: string;
  parameters?: MeshAnalysisParameters;
}): MeshResultQualification => {
  const { store, mesh, result, kind, variant, parameters } = input;
  if (!mesh || !kind || !result) return { status: "unavailable", reason: "No result is recorded for this Mesh and quantity.", canUseCurrentValues: false };
  if (result.identity.key !== mesh.key || result.kind !== kind) return {
    status: "historical", reason: "The result belongs to another Mesh generation or quantity.", canUseCurrentValues: false };
  if ((variant !== undefined && result.variant !== variant) ||
      (parameters !== undefined && result.parameterHash !== analysisParameterHash(parameters))) return {
    status: "historical", reason: "The recorded result used different analysis settings.", canUseCurrentValues: false };
  if (result.state === "queued" || result.state === "running") return {
    status: "computing", reason: "This Mesh analysis has not completed.", canUseCurrentValues: false };
  if (result.state === "error" || result.state === "cancelled") return {
    status: "failed", reason: result.error ?? "The Mesh analysis did not complete.", canUseCurrentValues: false };
  if (result.state === "stale" || !isMeshAnalysisResultCurrent(store, result)) return {
    status: "historical", reason: "The result or a recorded dependency is no longer current.", canUseCurrentValues: false };
  if (result.state !== "ready" || result.payload == null) return {
    status: "unavailable", reason: "No completed Mesh values are available.", canUseCurrentValues: false };
  return { status: "current", reason: "The exact Mesh generation, settings and dependencies are current.", canUseCurrentValues: true };
};
