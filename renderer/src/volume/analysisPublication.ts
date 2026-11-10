import { createResultPublication, resultEvidenceRowsCsv, resultPublicationJson } from "../results/resultPublication";
import type { VolumeAnalysisSummary } from "./analysis";
import type { VolumeObject } from "./contracts";
import { serializeVolumeObject } from "./infrastructure";

export type VolumeAnalysisSnapshot = { identityKey: string; summary: VolumeAnalysisSummary };

export const publishVolumeAnalysisEvidence = (volume: VolumeObject, snapshot: VolumeAnalysisSnapshot | null) => {
  const current = snapshot?.identityKey === volume.identity.key && volume.state === "current";
  const summary = current ? snapshot.summary : null;
  const publication = createResultPublication({
    module: "volume",
    resultId: `${volume.identity.volumeId}:analysis`,
    source: {
      id: volume.identity.volumeId,
      revision: volume.identity.volumeRevision,
      generation: volume.identity.sampledGridRevision,
      hash: volume.provenance.sampledGridFingerprint,
    },
    sourceStatus: volume.state,
    status: summary ? "recorded" : "withheld",
    reason: summary ? "Analysis belongs to the current Volume grid." : "Analysis source changed or has not been computed.",
    recordedClaim: "Volume analysis summary was computed from the captured grid.",
    independentCheck: summary ? "Snapshot identity and current Volume identity match." : "Snapshot identity does not match the current Volume identity.",
    summary: summary ? {
      statistics: summary.statistics,
      region: { threshold: summary.region.threshold, voxelCount: summary.region.voxelCount, physicalVolume: summary.region.physicalVolume, components: summary.region.components.length },
      criticalPointCount: summary.criticalPoints.length,
      iso: summary.iso,
      derivativeMethod: summary.derivatives.method,
    } : null,
  });
  const csv = summary ? resultEvidenceRowsCsv([
    ["volumeId", volume.identity.volumeId],
    ["volumeRevision", volume.identity.volumeRevision],
    ["sampledGridRevision", volume.identity.sampledGridRevision],
    ["finiteCount", summary.statistics.finiteCount],
    ["missingCount", summary.statistics.missingCount],
    ["minimum", summary.statistics.minimum],
    ["maximum", summary.statistics.maximum],
    ["mean", summary.statistics.mean],
    ["standardDeviation", summary.statistics.standardDeviation],
    ["regionVoxelCount", summary.region.voxelCount],
    ["regionPhysicalVolume", summary.region.physicalVolume],
    ["regionComponentCount", summary.region.components.length],
    ["criticalPointCount", summary.criticalPoints.length],
    ["isoCrossingEdgeCount", summary.iso.crossingEdgeCount],
  ]) : null;
  return {
    publication,
    receiptJson: resultPublicationJson(publication),
    csv,
    reportJson: summary ? JSON.stringify({
      version: 2,
      volume: serializeVolumeObject(volume),
      publication,
      analysis: summary,
    }, null, 2) + "\n" : null,
  };
};
