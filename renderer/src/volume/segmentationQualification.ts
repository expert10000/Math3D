import type { VolumeObject } from "./contracts";
import type { IntegerVolumeLabelMap } from "./segmentation";

export type VolumeSegmentationQualification = {
  status: "current" | "preview" | "stale" | "unavailable";
  reason: string;
  showValues: boolean;
  canApply: boolean;
  canEdit: boolean;
};

export const qualifyVolumeSegmentation = (
  map: IntegerVolumeLabelMap | null,
  source: VolumeObject,
  threshold: number,
  preview: boolean,
): VolumeSegmentationQualification => {
  if (!map) return {
    status: "unavailable", reason: "No segmentation has been computed.",
    showValues: false, canApply: false, canEdit: false,
  };
  const matches = source.state === "current" &&
    map.provenance.sourceVolumeId === source.identity.volumeId &&
    map.provenance.sourceVolumeRevision === source.identity.volumeRevision &&
    map.provenance.sourceSampledGridRevision === source.identity.sampledGridRevision &&
    map.provenance.parameters.low === threshold &&
    map.dimensions.every((size, axis) => size === source.spatial.dimensions[axis]) &&
    map.data.length === source.spatial.dimensions.reduce((count, size) => count * size, 1);
  if (!matches) return {
    status: "stale", reason: "The segmentation source grid or threshold changed.",
    showValues: false, canApply: false, canEdit: false,
  };
  return preview ? {
    status: "preview", reason: "Preview matches the current Volume grid and threshold; apply to retain it.",
    showValues: true, canApply: true, canEdit: false,
  } : {
    status: "current", reason: "Segmentation matches the current Volume grid and threshold.",
    showValues: true, canApply: false, canEdit: true,
  };
};
