import { createResultPublication, resultEvidenceRowsCsv, resultPublicationJson } from "../results/resultPublication";
import type { VolumeComparisonSummary } from "./comparison";
import type { VolumeObject } from "./contracts";

export type VolumeComparisonSnapshot = {
  aKey: string;
  bKey: string;
  summary: VolumeComparisonSummary;
};

const matches = (record: { id: string; volumeRevision: number; sampledGridRevision: number }, volume: VolumeObject) =>
  record.id === volume.identity.volumeId &&
  record.volumeRevision === volume.identity.volumeRevision &&
  record.sampledGridRevision === volume.identity.sampledGridRevision;

export const publishVolumeComparisonEvidence = (
  baseline: VolumeObject | null,
  active: VolumeObject,
  snapshot: VolumeComparisonSnapshot | null,
) => {
  const current = !!baseline && !!snapshot &&
    snapshot.aKey === baseline.identity.key && snapshot.bKey === active.identity.key &&
    matches(snapshot.summary.provenance.volumeA, baseline) && matches(snapshot.summary.provenance.volumeB, active) &&
    active.state === "current";
  const summary = current ? snapshot!.summary : null;
  const publication = createResultPublication({
    module: "volume",
    resultId: `${active.identity.volumeId}:comparison`,
    source: {
      id: active.identity.volumeId,
      revision: active.identity.volumeRevision,
      generation: active.identity.sampledGridRevision,
      hash: active.provenance.sampledGridFingerprint,
    },
    sourceStatus: active.state,
    status: summary ? "recorded" : "withheld",
    reason: summary ? "Both comparison sources match the captured A and current B grids." : "Comparison source changed or has not been computed.",
    recordedClaim: "Comparison metrics were computed from captured Volume A and active Volume B.",
    independentCheck: summary ? "Both source IDs and grid revisions match the comparison provenance." : "A or B identity does not match the comparison provenance.",
    summary: summary ? { metrics: summary.metrics, provenance: summary.provenance, changeThreshold: summary.changeThreshold } : null,
  });
  const csv = summary ? resultEvidenceRowsCsv([
    ["volumeAId", summary.provenance.volumeA.id],
    ["volumeARevision", summary.provenance.volumeA.volumeRevision],
    ["volumeAGridRevision", summary.provenance.volumeA.sampledGridRevision],
    ["volumeBId", summary.provenance.volumeB.id],
    ["volumeBRevision", summary.provenance.volumeB.volumeRevision],
    ["volumeBGridRevision", summary.provenance.volumeB.sampledGridRevision],
    ["alignment", summary.provenance.alignmentPolicy],
    ["interpolation", summary.provenance.interpolation],
    ["finitePairCount", summary.metrics.finitePairCount],
    ["missingPairCount", summary.metrics.missingPairCount],
    ["signedMeanDifference", summary.metrics.signedMeanDifference],
    ["absoluteMeanDifference", summary.metrics.absoluteMeanDifference],
    ["relativeMeanDifference", summary.metrics.relativeMeanDifference],
    ["rmse", summary.metrics.norms.rmse],
    ["correlation", summary.metrics.correlation],
    ["changedVoxelCount", summary.metrics.changedVoxelCount],
    ["changedFraction", summary.metrics.changedFraction],
  ]) : null;
  return {
    publication,
    receiptJson: resultPublicationJson(publication),
    csv,
    reportJson: summary ? JSON.stringify({ version: 1, publication, comparison: summary }, null, 2) + "\n" : null,
  };
};
