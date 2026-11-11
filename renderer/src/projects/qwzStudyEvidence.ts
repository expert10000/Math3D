import { inspectProjectQwzPinnedSample, matchesScientificSourceGeneration,
  qualifyProjectQwzQuadStudy, viewerSourceFromDocument,
  type Math3DProject, type StudyRecordV1 } from "@math3d/core";
import { openVerifiedStudyQuantumScene } from "./studyQuantumSource";
import { verifyProjectQwzSample } from "./qwzStudySample";
import { createResultPublication, resultEvidenceRowsCsv } from "../results/resultPublication";
import { pointTableStore } from "../graph2d/pointTableStore";
import { QWZ_BAND_PROFILE_OPERATION } from "./qwzBandProfile";

const omittedQuantities = ["band energy", "Berry curvature", "reciprocal projection", "topology invariants"] as const;

type QwzEvidenceReport = {
  projectId: string; studyId: string;
  source: { runId: string; resultSha256: string;
    bands: { documentId: string; revision: number; sceneFingerprint: string };
    curvature: { documentId: string; revision: number; sceneFingerprint: string } };
  verification: { status: "verified" | "withheld"; reason?: string;
    selection: unknown; invariants: unknown };
  profile?: { status: "saved" | "withheld"; reason?: string; graphDocumentId: string;
    resultId: string; rowCount: number; tableChecksum: string };
};

export function qwzStudyPublication(evidence: QwzEvidenceReport) {
  const verified = evidence.verification.status === "verified";
  return createResultPublication({ module: "study", resultId: evidence.studyId,
    source: { id: evidence.studyId, revision: null, generation: null, hash: null },
    sourceStatus: verified ? "both scene bundles reverified" : "source or pin withheld",
    status: verified ? "recorded" : "withheld",
    reason: verified ? "Exact band and curvature bundles and the pinned reciprocal mapping were rechecked." :
      evidence.verification.reason ?? "Pinned quantities are unavailable.",
    recordedClaim: "Producer band energy, Berry curvature and topology invariants at the pinned QWZ sample." +
      (evidence.profile?.status === "saved" ? " Saved reciprocal band profile in Graph." : ""),
    independentCheck: "Math3D rechecks both bundle hashes and the reciprocal sample mapping; topology invariants are producer claims, not independently proved.",
    summary: { source: evidence.source, selection: evidence.verification.selection,
      invariants: evidence.verification.invariants, profile: evidence.profile ?? null } });
}

export function qwzStudyEvidenceCsv(evidence: QwzEvidenceReport): string {
  const publication = qwzStudyPublication(evidence);
  return resultEvidenceRowsCsv([
    ["studyId", evidence.studyId], ["projectId", evidence.projectId],
    ["publicationStatus", publication.assessment.status],
    ["sourceStatus", publication.assessment.sourceStatus],
    ["bandsDocumentId", evidence.source.bands.documentId],
    ["bandsRevision", evidence.source.bands.revision],
    ["bandsFingerprint", evidence.source.bands.sceneFingerprint],
    ["curvatureDocumentId", evidence.source.curvature.documentId],
    ["curvatureRevision", evidence.source.curvature.revision],
    ["curvatureFingerprint", evidence.source.curvature.sceneFingerprint],
    ["recordedClaim", publication.assessment.recordedClaim],
    ["independentCheck", publication.assessment.independentCheck],
    ["selection", publication.summary?.selection ?? null],
    ["invariants", publication.summary?.invariants ?? null],
    ["profile", evidence.profile ?? null],
    ["omissions", evidence.verification.status === "withheld" ? omittedQuantities : []],
  ]);
}

/** A frozen report references source generations; it never embeds their arrays. */
export async function buildQwzStudyEvidence(project: Math3DProject, study: StudyRecordV1) {
  const pair = qualifyProjectQwzQuadStudy(project, study);
  if (!pair) throw new TypeError("QWZ Study mapping or source generations are unavailable.");
  const source = {
    runId: pair.bands.source.provenance.runId,
    resultSha256: pair.bands.source.provenance.resultSha256,
    bands: { documentId: pair.bands.identity.id, revision: pair.bands.identity.revision,
      sceneFingerprint: pair.bands.source.sceneFingerprint },
    curvature: { documentId: pair.curvature.identity.id, revision: pair.curvature.identity.revision,
      sceneFingerprint: pair.curvature.source.sceneFingerprint },
  };
  const profileResult = [...project.workspace.results].reverse().find(item =>
    item.provenance.operation.type === QWZ_BAND_PROFILE_OPERATION &&
    (item.provenance.operation.parameters as Record<string, unknown>).studyId === study.id);
  const profileParameters = profileResult?.provenance.operation.parameters as Record<string, unknown> | undefined;
  const profileGraph = project.workspace.entries.find(entry =>
    entry.module === "graph2d" && entry.expected.id === profileParameters?.graphDocumentId);
  const profileObject = profileGraph?.checkpoint.format === "math3d.graph2d-document" ?
    profileGraph.checkpoint.source.objects.find(item => item.id === "qwz-band-profile") : null;
  const profile = profileResult && typeof profileParameters?.graphDocumentId === "string" ? {
    status: (profileGraph && profileObject?.kind === "point-series" &&
      profileGraph.expected.structuralHash === profileParameters.graphHash &&
      profileObject.table.id === profileParameters.tableId &&
      profileObject.table.checksum === profileParameters.tableChecksum &&
      matchesScientificSourceGeneration(profileResult.provenance.source,
        viewerSourceFromDocument(pair.bands)) && pointTableStore.resolve(profileObject.table)
      ? "saved" : "withheld") as "saved" | "withheld",
    ...(!profileGraph || profileObject?.kind !== "point-series" ||
      !pointTableStore.resolve(profileObject.table) ? { reason: "Graph profile table is missing or changed." } : {}),
    graphDocumentId: profileParameters.graphDocumentId, resultId: profileResult.resultId,
    rowCount: profileObject?.kind === "point-series" ? profileObject.table.rowCount : 0,
    tableChecksum: String(profileParameters.tableChecksum ?? ""),
  } : undefined;
  const base = { schema: "math3d.qwz-study-evidence/v1" as const,
    projectId: project.identity.id, studyId: study.id, studyTitle: study.title, source,
    ...(profile ? { profile } : {}) };
  const withheld = (reason: string) => {
    const report = { ...base, verification: {
    status: "withheld" as const, reason, omissions: [...omittedQuantities], selection: null,
    invariants: null }, ...(profile ? { profile: { ...profile, status: "withheld" as const,
      reason: `Producer source unavailable: ${reason}` } } : {}) };
    return { ...report, publication: qwzStudyPublication(report) };
  };
  const pin = inspectProjectQwzPinnedSample(study, pair);
  if (pin.status === "none") return withheld("This Study has no pinned QWZ band sample.");
  if (pin.status === "withheld") return withheld(pin.reason);
  try {
    const { band, target, projection, review } = await verifyProjectQwzSample(project, pair, pin.sampleIndex);
    // Recheck both external bundles after the sample reads, immediately before freezing the report.
    await openVerifiedStudyQuantumScene(project, pair.bands);
    await openVerifiedStudyQuantumScene(project, pair.curvature);
    const report = { ...base, verification: {
      status: "verified" as const, omissions: [] as string[],
      selection: {
        band: { sampleId: band.sampleId, sampleIndex: band.sampleIndex,
          k: [band.k[0], band.k[1]] as [number, number], kUnit: band.kUnit,
          energy: band.energy, energyUnit: band.energyUnit },
        curvature: { sampleId: target.sampleId, sampleIndex: target.sampleIndex,
          k: [target.position[0], target.position[1]] as [number, number],
          value: target.value, valueUnit: target.valueUnit, convention: target.convention },
        projection: { distance: projection.distance, unit: band.kUnit,
          candidateCount: projection.candidateCount, strategy: projection.strategy },
      }, invariants: review.invariants,
    } };
    return { ...report, publication: qwzStudyPublication(report) };
  } catch (error) { return withheld((error as Error).message); }
}
