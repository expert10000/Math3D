import { analysisParameterHash } from "../analysis/resultStore";
import { isMeshAnalysisResultCurrent, type MeshAnalysisMeshIdentity,
  type MeshAnalysisComputationRecord, type MeshAnalysisParameters, type MeshAnalysisResult,
  type MeshAnalysisResultKind, type MeshAnalysisResultStore } from "./analysisResultStore";

export type MeshResultQualification = Readonly<{
  status: "current" | "historical" | "computing" | "failed" | "unavailable";
  reason: string;
  canUseCurrentValues: boolean;
}>;

/** Prefer the record for the visible controls; retain the latest other variant for historical context. */
export const selectFocusedMeshResult = (input: {
  store: MeshAnalysisResultStore;
  mesh: MeshAnalysisMeshIdentity | null;
  kind: MeshAnalysisResultKind | null;
  variant?: string;
  parameters?: MeshAnalysisParameters;
}): MeshAnalysisResult | null => {
  const { store, mesh, kind, variant, parameters } = input;
  if (!mesh || !kind) return null;
  const candidates = Object.values(store.entries)
    .filter(result => result.kind === kind && result.identity.key === mesh.key)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const parameterHash = parameters === undefined ? null : analysisParameterHash(parameters);
  return candidates.find(result => (variant === undefined || result.variant === variant) &&
    (parameterHash === null || result.parameterHash === parameterHash)) ?? candidates[0] ?? null;
};

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

/** A history row is current only while its exact recorded result version remains current. */
export const qualifyMeshComputationRecord = (input: {
  store: MeshAnalysisResultStore;
  mesh: MeshAnalysisMeshIdentity | null;
  record: MeshAnalysisComputationRecord;
}): MeshResultQualification => {
  const { store, mesh, record } = input;
  if (!mesh || record.identity.key !== mesh.key) return {
    status: "historical", reason: "This run belongs to another Mesh generation.", canUseCurrentValues: false };
  if (record.state === "queued" || record.state === "running") return {
    status: "computing", reason: "This run has not completed.", canUseCurrentValues: false };
  if (record.state === "error" || record.state === "cancelled") return {
    status: "failed", reason: record.error ?? "This run did not complete.", canUseCurrentValues: false };
  if (record.state === "stale") return {
    status: "historical", reason: "This run was invalidated.", canUseCurrentValues: false };
  const result = store.entries[record.resultKey] ?? null;
  if (!result || result.resultVersion !== record.resultVersion ||
      result.parameterHash !== record.parameterHash) return {
    status: "historical", reason: "A newer run replaced this recorded result version.", canUseCurrentValues: false };
  return qualifyMeshAnalysisResult({ store, mesh, result, kind: record.kind,
    variant: record.variant, parameters: record.parameters });
};
