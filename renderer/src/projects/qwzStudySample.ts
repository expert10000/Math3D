import type { Math3DProject, ProjectQwzPair } from "@math3d/core";
import { openVerifiedStudyQuantumScene } from "./studyQuantumSource";
import { reviewedQwzPair } from "../components/quantumStudyProfile";

type QuantumApi = NonNullable<Window["quantumScenes"]>;

/** Verify both immutable sources and the actual band/curvature sample before reporting a linked k. */
export async function verifyProjectQwzSample(project: Math3DProject, pair: ProjectQwzPair,
  sampleIndex: number, api: QuantumApi | undefined = window.quantumScenes) {
  if (!Number.isSafeInteger(sampleIndex) || sampleIndex < 0 || sampleIndex > 1_000_000)
    throw new TypeError("QWZ sample index is outside the supported range.");
  if (!api?.bandSample || !api.topologySample || !api.projectQwzCursor)
    throw new TypeError("QWZ sample verification is unavailable on this host.");
  const curvature = await openVerifiedStudyQuantumScene(project, pair.curvature);
  const bands = await openVerifiedStudyQuantumScene(project, pair.bands);
  const review = reviewedQwzPair(bands, curvature);
  const quantity = (curvature.document.extensions[pair.curvature.source.sceneSchema] as { scene?: {
    topology?: { quantities: { id: string; kind: string; object: string }[] } } } | undefined)
    ?.scene?.topology?.quantities.find(item => item.kind === "berry-curvature" && item.object === "berry-curvature");
  if (!quantity) throw new TypeError("Verified Berry-curvature quantity is missing.");
  const band = await api.bandSample({ fingerprint: pair.bands.source.sceneFingerprint,
    objectId: "band-0", sampleIndex });
  if (band.fingerprint !== pair.bands.source.sceneFingerprint ||
      band.runId !== pair.bands.source.provenance.runId ||
      band.resultSha256 !== pair.bands.source.provenance.resultSha256 ||
      band.kUnit !== pair.bands.source.coordinates.units[0])
    throw new TypeError("Band sample differs from the saved QWZ source or reciprocal unit.");
  await openVerifiedStudyQuantumScene(project, pair.curvature);
  const projection = await api.projectQwzCursor({ fingerprint: pair.curvature.source.sceneFingerprint,
    runId: band.runId, resultSha256: band.resultSha256, k: [band.k[0], band.k[1]],
    basisId: `qwz:${band.kUnit}` });
  if (projection.target !== "curvature" || !Number.isFinite(projection.distance))
    throw new TypeError("Curvature projection has no qualified target.");
  const target = await api.topologySample({ fingerprint: pair.curvature.source.sceneFingerprint,
    quantityId: quantity.id, sampleIndex: projection.sampleIndex });
  if (target.fingerprint !== pair.curvature.source.sceneFingerprint ||
      target.quantityId !== quantity.id || target.sampleIndex !== projection.sampleIndex ||
      target.runId !== band.runId || target.resultSha256 !== band.resultSha256 ||
      target.coordinateUnits[0] !== pair.curvature.source.coordinates.units[0] ||
      target.coordinateUnits[1] !== pair.curvature.source.coordinates.units[1] ||
      Math.abs(target.position[0] - projection.k[0]) > 1e-8 ||
      Math.abs(target.position[1] - projection.k[1]) > 1e-8)
    throw new TypeError("Curvature sample differs from the exact projected k point.");
  return { band, target, projection, review };
}
