import { createResultPublication, resultEvidenceRowsCsv, resultPublicationJson } from "../results/resultPublication";
import type { VolumeGrid } from "../scene/datasets";
import type { VolumeObject } from "./contracts";
import { labelStatistics, type IntegerVolumeLabelMap } from "./segmentation";
import { qualifyVolumeSegmentation } from "./segmentationQualification";

const MAX_EXPORTED_LABELS = 64;

export const publishVolumeSegmentationEvidence = (
  map: IntegerVolumeLabelMap | null,
  source: VolumeObject,
  threshold: number,
  preview: boolean,
) => {
  const qualification = qualifyVolumeSegmentation(map, source, threshold, preview);
  const recorded = qualification.status === "current" && !!map;
  const allStats = recorded ? labelStatistics(map!, {
    origin: [...source.spatial.origin] as [number, number, number],
    spacing: [...source.spatial.spacing] as [number, number, number],
    direction: [...source.spatial.direction] as NonNullable<VolumeGrid["direction"]>,
    centering: source.spatial.centering,
  }) : [];
  const regions = recorded ? allStats.slice(0, MAX_EXPORTED_LABELS).map((stats) => ({
    ...stats,
    name: map!.labels.find((label) => label.id === stats.label)?.name ?? `Label ${stats.label}`,
  })) : null;
  const labelCount = recorded ? allStats.length : null;
  const omittedLabelCount = recorded ? Math.max(0, allStats.length - regions!.length) : null;
  const totalLabeledVoxels = recorded ? allStats.reduce((sum, stats) => sum + stats.voxelCount, 0) : null;
  const pin = map?.provenance;
  const publication = createResultPublication({
    module: "volume",
    resultId: `${pin?.sourceVolumeId ?? source.identity.volumeId}:segmentation`,
    source: {
      id: pin?.sourceVolumeId ?? source.identity.volumeId,
      revision: pin?.sourceVolumeRevision ?? source.identity.volumeRevision,
      generation: pin?.sourceSampledGridRevision ?? source.identity.sampledGridRevision,
      hash: null,
    },
    sourceStatus: qualification.status,
    status: recorded ? "recorded" : qualification.status === "preview" ? "preview" : "withheld",
    reason: qualification.reason,
    recordedClaim: "Nearest-neighbor connected-component labels and their region measurements were computed from the captured Volume grid.",
    independentCheck: recorded
      ? "Source ID, Volume and grid revisions, dimensions and threshold match; source bytes were not rechecked."
      : "Current source and applied-result qualification did not pass.",
    summary: recorded ? { labelCount, totalLabeledVoxels, omittedLabelCount, regions } : null,
  });
  const report = {
    version: 1,
    provenance: pin ? {
      operation: pin.operation,
      sourceVolumeId: pin.sourceVolumeId,
      sourceVolumeRevision: pin.sourceVolumeRevision,
      sourceSampledGridRevision: pin.sourceSampledGridRevision,
      parameters: pin.parameters,
      createdAt: pin.createdAt,
    } : null,
    qualification,
    publication,
    labelCount,
    totalLabeledVoxels,
    omittedLabelCount,
    regions,
  };
  const rows: Array<readonly [string, unknown]> = [
    ["status", qualification.status],
    ["reason", qualification.reason],
    ["sourceVolumeId", pin?.sourceVolumeId ?? source.identity.volumeId],
    ["sourceVolumeRevision", pin?.sourceVolumeRevision ?? source.identity.volumeRevision],
    ["sourceSampledGridRevision", pin?.sourceSampledGridRevision ?? source.identity.sampledGridRevision],
    ["threshold", pin?.parameters.low ?? null],
    ["labelCount", labelCount],
    ["totalLabeledVoxels", totalLabeledVoxels],
    ["omittedLabelCount", omittedLabelCount],
  ];
  for (const region of regions ?? []) rows.push(
    [`label.${region.label}.name`, region.name],
    [`label.${region.label}.voxelCount`, region.voxelCount],
    [`label.${region.label}.physicalVolume`, region.physicalVolume],
    [`label.${region.label}.centroid`, region.centroid],
    [`label.${region.label}.bounds`, region.bounds],
  );
  return { reportJson: JSON.stringify(report, null, 2) + "\n", csv: resultEvidenceRowsCsv(rows), receiptJson: resultPublicationJson(publication), publication };
};
