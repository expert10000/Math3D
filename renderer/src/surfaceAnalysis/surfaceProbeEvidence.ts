import { createResultPublication, resultEvidenceRowsCsv } from "../results/resultPublication";
import type { CanonicalSurfaceDefinition, SurfaceAnalysisPayload } from "./contracts";
import type { SurfaceAnalysisResult } from "./infrastructure";
import type { SurfaceResultPresentation } from "./surfaceResultPresentation";

/** Export the exact recorded probe, including its angle, after source qualification. */
export function createSurfaceProbeEvidence(input: {
  definition: CanonicalSurfaceDefinition;
  result: SurfaceAnalysisResult<SurfaceAnalysisPayload>;
  qualification: SurfaceResultPresentation;
}) {
  const { definition, result, qualification } = input;
  const payload = result.payload;
  if (result.kind !== "surface-probe" || payload?.data.kind !== "local-probe" ||
      payload.surfaceId !== result.identity.surfaceId ||
      payload.surfaceRevision !== result.identity.surfaceRevision ||
      qualification.status === "unavailable")
    throw new TypeError("Probe evidence requires a matching Surface result.");
  const current = qualification.status === "current" && qualification.canUseCurrentValues &&
    definition.identity.key === result.identity.key;
  const probe = payload.data;
  const publication = createResultPublication({ module: "surface",
    resultId: `${result.identity.key}:surface-probe:${probe.probeId}:v${result.resultVersion}`,
    source: { id: result.identity.key, revision: result.identity.surfaceRevision,
      generation: null, hash: current ? definition.fingerprint : null },
    sourceStatus: qualification.status, status: current ? "recorded" : "withheld",
    reason: qualification.reason, recordedClaim: qualification.claim,
    independentCheck: qualification.verification,
    summary: { probeId: probe.probeId, classification: probe.classification,
      position: probe.position, gaussianCurvature: probe.gaussianCurvature,
      meanCurvature: probe.meanCurvature, normalCurvature: probe.normalCurvature,
      units: payload.units } });
  return { format: "math3d.surface-probe-evidence/v1" as const,
    source: { identity: result.identity, fingerprint: publication.source.hash,
      representation: payload.representation, units: payload.units, orientation: payload.orientation },
    result: { kind: result.kind, variant: result.variant, version: result.resultVersion,
      state: result.state, method: payload.method, backend: result.backend,
      parameters: result.parameters, dependencies: result.dependencies },
    qualification: { status: qualification.status, claim: qualification.claim,
      independentCheck: qualification.verification, reason: qualification.reason },
    warnings: payload.warnings, probe: current ? probe : null, publication };
}

export type SurfaceProbeEvidence = ReturnType<typeof createSurfaceProbeEvidence>;

export const surfaceProbeEvidenceJson = (evidence: SurfaceProbeEvidence): string =>
  JSON.stringify(evidence, null, 2) + "\n";

export const surfaceProbeEvidenceCsv = (evidence: SurfaceProbeEvidence): string =>
  resultEvidenceRowsCsv([
    ["resultId", evidence.publication.resultId], ["sourceId", evidence.publication.source.id],
    ["sourceRevision", evidence.publication.source.revision],
    ["sourceFingerprint", evidence.publication.source.hash],
    ["sourceStatus", evidence.publication.assessment.sourceStatus],
    ["publicationStatus", evidence.publication.assessment.status],
    ["recordedClaim", evidence.publication.assessment.recordedClaim],
    ["independentCheck", evidence.publication.assessment.independentCheck],
    ["probeId", evidence.publication.summary?.probeId ?? null],
    ["classification", evidence.publication.summary?.classification ?? null],
    ["position", evidence.publication.summary?.position ?? null],
    ["gaussianCurvature", evidence.publication.summary?.gaussianCurvature ?? null],
    ["meanCurvature", evidence.publication.summary?.meanCurvature ?? null],
    ["normalCurvature", evidence.publication.summary?.normalCurvature ?? null],
    ["units", evidence.source.units], ["warnings", evidence.warnings],
  ]);
