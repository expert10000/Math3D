import { createResultPublication, resultEvidenceRowsCsv, resultPublicationJson } from "../results/resultPublication";
import type { VolumeDataset } from "../scene/datasets";
import type { VolumeObject } from "./contracts";
import { fingerprintSdfGrid } from "./sdfPreviewPin";
import { qualifySdfSignEvidence } from "./sdfSignEvidence";

export const publishSdfEvidence = (
  dataset: VolumeDataset,
  volume: VolumeObject,
  currentMeshFingerprint: string | null,
  preview: boolean,
) => {
  const metadata = dataset.sdf;
  const gridMatches = !!metadata?.outputGridFingerprint &&
    metadata.outputGridFingerprint === fingerprintSdfGrid(dataset.grid);
  const signEvidence = qualifySdfSignEvidence(metadata?.sign ?? null,
    metadata?.sourceMeshFingerprint ?? null, currentMeshFingerprint, metadata?.sourceEvidence ?? "live");
  const current = !!metadata && gridMatches && signEvidence.status === "current" && volume.state === "current";
  const status = current ? preview ? "preview" : "recorded" : "withheld";
  const reason = !metadata ? "No SDF evidence is available." : !gridMatches ?
    "The sampled SDF output grid changed or has no content fingerprint." :
    signEvidence.status !== "current" ? signEvidence.reason :
    preview ? "Preview matches source evidence but is not applied." : "Applied SDF output and mesh-bound sign evidence match.";
  const summary = status === "recorded" ? {
    output: metadata!.output,
    operation: metadata!.operation,
    sign: metadata!.sign,
    sampling: metadata!.sampling,
  } : null;
  const publication = createResultPublication({
    module: "volume",
    resultId: `${dataset.sourceId ?? volume.identity.volumeId}:sdf`,
    source: {
      id: dataset.sourceId ?? volume.identity.volumeId,
      revision: volume.identity.volumeRevision,
      generation: volume.identity.sampledGridRevision,
      hash: metadata?.outputGridFingerprint ?? null,
    },
    sourceStatus: preview ? "preview" : signEvidence.status,
    status,
    reason,
    recordedClaim: "The SDF producer sampled a distance or occupancy field from its recorded sources.",
    independentCheck: current ? "Output bytes match the recorded grid fingerprint and the analyzed mesh bytes match; this is not a numerical proof of distance accuracy." :
      "Output or source-mesh identity could not be rechecked against the current workspace.",
    summary,
  });
  const report = {
    version: 1,
    sourceId: dataset.sourceId ?? null,
    sources: metadata?.sources ?? [],
    method: metadata ? { output: metadata.output, operation: metadata.operation, parameters: metadata.parameters,
      backend: metadata.backend, backendVersion: metadata.backendVersion, sampling: metadata.sampling } : null,
    warnings: metadata?.warnings ?? [],
    publication,
    sign: summary?.sign ?? null,
  };
  const csv = resultEvidenceRowsCsv([
    ["status", status], ["reason", reason], ["sourceId", dataset.sourceId],
    ["operation", metadata?.operation], ["output", metadata?.output],
    ["backend", metadata?.backend], ["backendVersion", metadata?.backendVersion],
    ["sourceCount", metadata?.sources.length],
    ["signConfidence", summary?.sign.confidence],
    ["watertight", summary?.sign.watertight],
    ["orientation", summary?.sign.orientation],
    ["boundaryEdgeCount", summary?.sign.boundaryEdgeCount],
    ["nonManifoldEdgeCount", summary?.sign.nonManifoldEdgeCount],
    ["signedVolume", summary?.sign.signedVolume],
  ]);
  return { publication, reportJson: JSON.stringify(report, null, 2) + "\n", csv, receiptJson: resultPublicationJson(publication) };
};
