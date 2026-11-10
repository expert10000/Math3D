import type { VolumeDerivedResult, VolumeObject } from "./contracts";

export type VolumeDerivedQualification = {
  status: "current" | "snapshot" | "detached" | "stale" | "unavailable";
  reason: string;
  showMetrics: boolean;
  canTransfer: boolean;
  canBake: boolean;
};

const sameParameters = (
  recorded: Readonly<Record<string, number | string | boolean>>,
  current: Readonly<Record<string, number | string | boolean>>,
) => {
  const recordedKeys = Object.keys(recorded).sort();
  const currentKeys = Object.keys(current).sort();
  return recordedKeys.length === currentKeys.length &&
    recordedKeys.every((key, index) => key === currentKeys[index] && Object.is(recorded[key], current[key]));
};

export const qualifyVolumeDerivedResult = (
  result: VolumeDerivedResult,
  source: VolumeObject,
  currentParameters: Readonly<Record<string, number | string | boolean>>,
  hasGeometry: boolean,
): VolumeDerivedQualification => {
  const metadataReady = !!result.isosurface &&
    result.isosurface.correspondence.sourceSampledGridRevision === result.sourceSampledGridRevision &&
    result.isosurface.isoValue === result.parameters.isoValue;
  const available = hasGeometry && metadataReady;
  const canBake = available && result.state !== "snapshot";
  if (!available) return {
    status: "unavailable", reason: "Derived geometry or matching extraction metadata is unavailable.",
    showMetrics: false, canTransfer: false, canBake: false,
  };
  if (result.state === "snapshot" || result.state === "detached") return {
    status: result.state,
    reason: result.state === "snapshot" ? "Self-contained geometry snapshot; original source is historical." : "Detached geometry; original source is historical.",
    showMetrics: true, canTransfer: true, canBake,
  };
  const sourceMatches = source.state === "current" &&
    result.sourceVolumeId === source.identity.volumeId &&
    result.sourceVolumeRevision === source.identity.volumeRevision &&
    result.sourceSampledGridRevision === source.identity.sampledGridRevision;
  if (result.state !== "current" || !sourceMatches || !sameParameters(result.parameters, currentParameters)) return {
    status: "stale", reason: result.staleReason ?? "Source Volume or isosurface settings changed.",
    showMetrics: false, canTransfer: false, canBake,
  };
  return {
    status: "current", reason: "Extraction matches the current Volume grid and isosurface settings.",
    showMetrics: true, canTransfer: true, canBake,
  };
};
