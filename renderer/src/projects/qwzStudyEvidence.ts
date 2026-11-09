import { inspectProjectQwzPinnedSample, qualifyProjectQwzQuadStudy,
  type Math3DProject, type StudyRecordV1 } from "@math3d/core";
import { openVerifiedStudyQuantumScene } from "./studyQuantumSource";
import { verifyProjectQwzSample } from "./qwzStudySample";

const omittedQuantities = ["band energy", "Berry curvature", "reciprocal projection", "topology invariants"] as const;

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
  const base = { schema: "math3d.qwz-study-evidence/v1" as const,
    projectId: project.identity.id, studyId: study.id, studyTitle: study.title, source };
  const withheld = (reason: string) => ({ ...base, verification: {
    status: "withheld" as const, reason, omissions: [...omittedQuantities], selection: null,
    invariants: null } });
  const pin = inspectProjectQwzPinnedSample(study, pair);
  if (pin.status === "none") return withheld("This Study has no pinned QWZ band sample.");
  if (pin.status === "withheld") return withheld(pin.reason);
  try {
    const { band, target, projection, review } = await verifyProjectQwzSample(project, pair, pin.sampleIndex);
    // Recheck both external bundles after the sample reads, immediately before freezing the report.
    await openVerifiedStudyQuantumScene(project, pair.bands);
    await openVerifiedStudyQuantumScene(project, pair.curvature);
    return { ...base, verification: {
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
  } catch (error) { return withheld((error as Error).message); }
}
