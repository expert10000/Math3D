import { createResultPublication, resultEvidenceRowsCsv, resultPublicationJson } from "../results/resultPublication";
import type { VolumeDerivedResult, VolumeObject } from "./contracts";
import { qualifyVolumeDerivedResult } from "./derivedQualification";

export const publishVolumeDerivedEvidence = (
  result: VolumeDerivedResult,
  source: VolumeObject,
  settings: Readonly<Record<string, number | string | boolean>>,
  hasGeometry: boolean,
) => {
  const qualification = qualifyVolumeDerivedResult(result, source, settings, hasGeometry);
  const metadata = result.isosurface;
  const metrics = qualification.showMetrics ? metadata?.metrics ?? null : null;
  const method = metadata ? {
    algorithm: metadata.algorithm,
    algorithmVersion: metadata.algorithmVersion,
    backend: metadata.backend,
    isoValue: metadata.isoValue,
    normalMethod: metadata.normalMethod,
  } : null;
  const publication = createResultPublication({
    module: "volume",
    resultId: result.id,
    source: {
      id: result.sourceVolumeId,
      revision: result.sourceVolumeRevision,
      generation: result.sourceSampledGridRevision,
      hash: null,
    },
    sourceStatus: qualification.status,
    status: qualification.showMetrics ? "recorded" : "withheld",
    reason: qualification.reason,
    recordedClaim: "The extraction produced an isosurface and recorded its measured geometry.",
    independentCheck: qualification.showMetrics
      ? "Recorded source and extraction metadata match available geometry; numerical metrics have no independent proof."
      : "Current source or retained geometry does not qualify the measured geometry.",
    summary: metrics,
  });
  const report = {
    version: 1,
    result: {
      id: result.id,
      label: result.label,
      kind: result.kind,
      state: result.state,
      sourceVolumeId: result.sourceVolumeId,
      sourceVolumeRevision: result.sourceVolumeRevision,
      sourceSampledGridRevision: result.sourceSampledGridRevision,
      parameters: result.parameters,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    },
    method,
    qualification,
    publication,
    metrics,
    profile: qualification.showMetrics ? metadata?.profile ?? null : null,
    warnings: qualification.showMetrics ? metadata?.warnings ?? [] : [],
  };
  const csv = resultEvidenceRowsCsv([
    ["resultId", result.id],
    ["status", qualification.status],
    ["reason", qualification.reason],
    ["sourceVolumeId", result.sourceVolumeId],
    ["sourceVolumeRevision", result.sourceVolumeRevision],
    ["sourceSampledGridRevision", result.sourceSampledGridRevision],
    ["algorithm", method?.algorithm],
    ["backend", method?.backend],
    ["isoValue", method?.isoValue],
    ["vertexCount", metrics?.vertexCount],
    ["faceCount", metrics?.faceCount],
    ["connectedComponents", metrics?.connectedComponents],
    ["boundaryEdgeCount", metrics?.boundaryEdgeCount],
    ["nonManifoldEdgeCount", metrics?.nonManifoldEdgeCount],
    ["surfaceArea", metrics?.surfaceArea],
    ["enclosedVolume", metrics?.enclosedVolume],
    ["watertight", metrics?.watertight],
  ]);
  return { reportJson: JSON.stringify(report, null, 2) + "\n", csv, receiptJson: resultPublicationJson(publication), publication };
};
