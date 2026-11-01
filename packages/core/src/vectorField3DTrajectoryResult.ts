import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { canonicalJsonStringify, sha256Checksum, structuralHash,
  type CanonicalJsonValue } from "./documentIdentity";
import { createScientificDatasetLink } from "./scientificDatasetLink";
import { type VectorField3DDocument } from "./vectorField3DDocument";
import { integrateVectorField3DTrajectories,
  type VectorField3DTrajectoryArtifact } from "./vectorField3DTrajectories";
import { viewerSourceFromDocument } from "./viewerProvenance";

export const VECTOR_FIELD3D_TRAJECTORY_RESULT_TYPE = "vector3d.trajectory-solver" as const;
const sha = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function compactScientificSource(document: VectorField3DDocument,
  artifact: VectorField3DTrajectoryArtifact) {
  const field = document.source.field;
  if (field.kind !== "scientific-bundle") throw new TypeError("A scientific vector source is required.");
  const link = createScientificDatasetLink(field.references);
  if (artifact.sourceHash !== link.sourceHash ||
      Boolean(artifact.verifiedTiles) === Boolean(artifact.verifiedVolumes))
    throw new TypeError("Trajectory source verification provenance is missing or changed.");
  if (artifact.verifiedTiles) {
    if (artifact.verifiedTiles.length !== 3) throw new TypeError("Three verified tile components are required.");
    const components = artifact.verifiedTiles.map((part, index) => {
      const reference = field.references[index]!;
      if (part.name !== reference.component || part.resourceSha256 !== reference.resourceSha256 ||
          !sha(part.tileSetSha256) || !Number.isSafeInteger(part.totalTiles) || part.totalTiles < 1 ||
          part.verifiedTiles !== part.tileIndices.length ||
          part.tileIndices.length !== part.tileSha256.length ||
          new Set(part.tileIndices).size !== part.tileIndices.length ||
          part.tileIndices.some(tile => !Number.isSafeInteger(tile) || tile < 0 || tile >= part.totalTiles) ||
          part.tileSha256.some(value => !sha(value)) ||
          sha256Checksum(new TextEncoder().encode(part.tileIndices.map((tile, at) =>
            `${tile}:${part.tileSha256[at]}`).join("|"))).slice(7) !== part.tileSetSha256)
        throw new TypeError(`Verified trajectory tiles changed for ${reference.component}.`);
      return { name: part.name, resourceSha256: part.resourceSha256,
        verifiedTiles: part.verifiedTiles, totalTiles: part.totalTiles,
        tileSetSha256: part.tileSetSha256 };
    });
    return { kind: "tile-sets", sourceHash: artifact.sourceHash, components };
  }
  const volumes = artifact.verifiedVolumes!;
  if (volumes.length !== 3) throw new TypeError("Three verified volume components are required.");
  const components = volumes.map((part, index) => {
    const reference = field.references[index]!;
    if (part.name !== reference.component || part.resourceSha256 !== reference.resourceSha256 ||
        !sha(part.sampleSha256) || part.sampleShape.length !== 3 ||
        part.sampleShape.some(size => !Number.isSafeInteger(size) || size < 2) ||
        (part.verifiedChunkSetSha256 !== undefined && !sha(part.verifiedChunkSetSha256)))
      throw new TypeError(`Verified trajectory volume changed for ${reference.component}.`);
    return { name: part.name, resourceSha256: part.resourceSha256,
      sampleSha256: part.sampleSha256, sampleShape: part.sampleShape,
      ...(part.verifiedChunkSetSha256 ?
        { verifiedChunkSetSha256: part.verifiedChunkSetSha256 } : {}) };
  });
  return { kind: "volumes", sourceHash: artifact.sourceHash, components };
}

/** Publish solver diagnostics only; trajectory point arrays stay in the viewer. */
export function createVectorField3DTrajectoryResult(document: VectorField3DDocument,
  artifact: VectorField3DTrajectoryArtifact): AnalysisResultEnvelope {
  if (artifact.source.documentId !== document.identity.id ||
      artifact.source.revision !== document.identity.revision ||
      artifact.source.structuralHash !== document.identity.structuralHash)
    throw new TypeError("The trajectory source generation changed.");
  const direction = artifact.trajectories[0]?.direction;
  if (!direction || artifact.trajectories.some(path => path.direction !== direction))
    throw new TypeError("One consistent trajectory direction is required.");
  const source = viewerSourceFromDocument(document);
  const summary = {
    solver: { ...artifact.solver }, totalEvaluations: artifact.totalEvaluations,
    trajectories: artifact.trajectories.map(path => ({ seedId: path.seedId,
      direction: path.direction, acceptedSteps: path.acceptedSteps,
      rejectedSteps: path.rejectedSteps, evaluations: path.evaluations,
      stopReason: path.stopReason, maxEstimatedLocalError:
        Number.isFinite(path.maxEstimatedLocalError) ? path.maxEstimatedLocalError : null,
      stopDetail: path.stopDetail,
      endpoint: path.points.at(-1)?.position ?? null,
      parameterEnd: path.points.at(-1)?.time ?? null,
      arcLength: path.points.at(-1)?.arcLength ?? null })) };
  const parameters: Record<string, CanonicalJsonValue> = {
    seedIds: document.source.seeds.map(seed => seed.id), direction,
    coordinateUnits: document.source.axes.map(axis => axis.unit),
    sourceHash: document.identity.structuralHash };
  if (document.source.field.kind === "scientific-bundle") {
    parameters.sourceReferences = JSON.parse(canonicalJsonStringify(
      document.source.field.references)) as CanonicalJsonValue;
    parameters.verifiedSource = JSON.parse(canonicalJsonStringify(
      compactScientificSource(document, artifact))) as CanonicalJsonValue;
  }
  const resultId = `vector3d-trajectories:${structuralHash({ source,
    parameters, summary }).slice(7)}`;
  return createAnalysisResultEnvelope({ resultId, status: "numerical",
    provenance: { source, operation: { type: VECTOR_FIELD3D_TRAJECTORY_RESULT_TYPE,
      algorithm: artifact.solver.method,
      algorithmVersion: document.source.field.kind === "scientific-bundle" ?
        "solver-report-v2" : "solver-report-v1",
      parameters }, numericContext: { precision: { binaryBits: 53 },
      tolerance: { absolute: artifact.solver.absoluteTolerance,
        relative: artifact.solver.relativeTolerance } },
      engine: { name: "Math3D trajectory integrator", version: "1" }, elapsedMs: 0 },
    summary, warnings: artifact.trajectories.some(path =>
      ["solver-failure", "undefined", "step-limit", "cancelled"].includes(path.stopReason)) ?
      ["One or more trajectories stopped before the requested limit."] : [],
    diagnostics: [], artifacts: [] });
}

/** Compare a fresh verified replay with saved solver numbers and source digests. */
export function verifyVectorField3DTrajectoryResult(saved: AnalysisResultEnvelope,
  document: VectorField3DDocument,
  replayedArtifact?: VectorField3DTrajectoryArtifact): AnalysisResultEnvelope {
  if (saved.provenance.operation.type !== VECTOR_FIELD3D_TRAJECTORY_RESULT_TYPE)
    throw new TypeError("A saved trajectory result is required.");
  if (document.source.field.kind === "scientific-bundle" && !replayedArtifact)
    throw new TypeError("The measured trajectory source must be verified and rerun.");
  const fresh = createVectorField3DTrajectoryResult(document,
    document.source.field.kind === "expressions" ? integrateVectorField3DTrajectories(document, {
      direction: saved.provenance.operation.parameters.direction === "backward" ?
        "backward" : "forward" }) : replayedArtifact!);
  if (saved.resultId !== fresh.resultId ||
      canonicalJsonStringify(saved.provenance.source) !==
        canonicalJsonStringify(fresh.provenance.source) ||
      canonicalJsonStringify(saved.provenance.operation) !==
        canonicalJsonStringify(fresh.provenance.operation) ||
      canonicalJsonStringify(saved.summary) !== canonicalJsonStringify(fresh.summary))
    throw new TypeError("Saved trajectory solver statistics differ from the verified source.");
  return saved;
}
