import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { distanceToAtlasFace } from "./vectorField3DAtlasSeams";
import { type TemporalSurfaceEventFrame } from "./temporalSurfaceEvents";
import { temporalSurfaceComponentMeshes } from "./temporalSurfaceLinkage";
import { computeTemporalSurfaceTransport, projectTemporalSurfaceTransportStatus,
  type SurfaceTransportRule } from "./temporalSurfaceTransport";
import { createVerifiedTemporalFieldSampler, type TemporalFieldSourceDocument,
  type VerifiedTemporalTransfers } from "./temporalFieldSourceDocument";

type Vec3 = readonly [number, number, number];
type Face = readonly [Vec3, Vec3, Vec3];
export type TemporalSurfaceIdentityStudy = Readonly<{ status: "measured" | "unavailable";
  reason: string | null; publication: AnalysisResultEnvelope | null }>;
const unavailable = (reason: string): TemporalSurfaceIdentityStudy => ({
  status: "unavailable", reason, publication: null });
const add = (a: Vec3, b: Vec3, scale: number): Vec3 =>
  [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
const facesOf = (mesh: ReturnType<typeof temporalSurfaceComponentMeshes>[number]["mesh"]):
  readonly Face[] => Array.from({ length: mesh.indices.length / 3 }, (_, index) =>
  [0, 1, 2].map(corner => {
    const id = mesh.indices[index * 3 + corner]! * 3;
    return [mesh.positions[id]!, mesh.positions[id + 1]!,
      mesh.positions[id + 2]!] as Vec3;
  }) as unknown as Face);
const pointsOf = (mesh: ReturnType<typeof temporalSurfaceComponentMeshes>[number]["mesh"],
  limit: number): readonly Vec3[] => {
  const count = mesh.positions.length / 3;
  return Array.from({ length: Math.min(count, limit) }, (_, index) => {
    const id = Math.floor(index * count / Math.min(count, limit)) * 3;
    return [mesh.positions[id]!, mesh.positions[id + 1]!,
      mesh.positions[id + 2]!] as Vec3;
  });
};

/** Unique two-way physical surface witnesses. Split and merge identities remain ambiguous. */
export function computeTemporalSurfaceIdentity(project: Math3DProject,
  temporal: TemporalFieldSourceDocument, frames: readonly TemporalSurfaceEventFrame[],
  transport: AnalysisResultEnvelope, transfers?: VerifiedTemporalTransfers,
  shouldCancel?: () => boolean): TemporalSurfaceIdentityStudy {
  const saved = project.workspace.results.find(item => item.resultId === transport.resultId);
  if (!saved || structuralHash(saved.summary) !== structuralHash(transport.summary) ||
      projectTemporalSurfaceTransportStatus(project, transport, transfers).status !== "current")
    return unavailable("saved-verified-gf59-transport-required");
  const rule = transport.provenance.operation.parameters.rule as SurfaceTransportRule;
  const linkageId = (transport.provenance.operation.parameters.lineage as
    { linkageResultId?: string }).linkageResultId;
  const linkage = project.workspace.results.find(item => item.resultId === linkageId);
  if (!linkage) return unavailable("saved-linkage-missing");
  const replay = computeTemporalSurfaceTransport(project, temporal, frames,
    linkage, rule, transfers, shouldCancel);
  if (replay.status !== "ready" ||
      structuralHash(replay.publication!.summary) !== structuralHash(transport.summary))
    return unavailable("exact-frame-transport-changed");
  let sample: ReturnType<typeof createVerifiedTemporalFieldSampler>;
  try { sample = createVerifiedTemporalFieldSampler(project, temporal, transfers); }
  catch { return unavailable("temporal-source-unverified"); }
  const components = frames.map(frame => temporalSurfaceComponentMeshes(frame.surface));
  if (components.some(items => items.length > 8 ||
      items.some(item => item.mesh.triangleCount > 4_000)))
    return unavailable("identity-component-or-face-budget");
  const tolerance = rule.distanceTolerance;
  let tests = 0;
  const test = () => {
    if (shouldCancel?.()) throw new Error("Surface identity cancelled.");
    if (++tests > 100_000) throw new RangeError("Surface identity work budget reached.");
  };
  const advect = (point: Vec3, from: number, to: number) => {
    const dt = to - from;
    const first = sample(from, point).vector;
    const midpoint = add(point, first, dt / 2);
    const second = sample((from + to) / 2, midpoint).vector;
    return add(point, second, dt);
  };
  const distance = (points: readonly Vec3[], faces: readonly Face[]) => {
    const errors = points.map(point => {
      let closest = Infinity;
      for (const face of faces) { test();
        closest = Math.min(closest, distanceToAtlasFace(point, face)); }
      return closest;
    });
    return { min: Math.min(...errors), max: Math.max(...errors),
      rms: Math.sqrt(errors.reduce((sum, value) =>
      sum + value * value, 0) / errors.length) };
  };
  const witnesses = replay.witnesses.map(witness => {
    const link = witness.link;
    const ambiguous = (reason: string) => ({ link,
      status: "ambiguous" as const, reason, forwardMax: null as number | null,
      backwardMax: null as number | null, alternativeMatches: 0,
      forwardRms: null as number | null, backwardRms: null as number | null });
    if (link.fromComponent === null || link.toComponent === null ||
        link.status !== "geometric-continuation")
      return ambiguous("topology-event-or-one-sided-component");
    const competitors = replay.witnesses.filter(other =>
      other.link.fromFrame === link.fromFrame &&
      other.link.toFrame === link.toFrame &&
      (other.link.fromComponent === link.fromComponent ||
        other.link.toComponent === link.toComponent) &&
      (other.link.fromComponent !== link.fromComponent ||
        other.link.toComponent !== link.toComponent));
    if (competitors.length) return ambiguous("component-link-not-unique");
    const from = components[link.fromFrame]?.[link.fromComponent];
    const to = components[link.toFrame]?.[link.toComponent];
    const start = frames[link.fromFrame]?.time, end = frames[link.toFrame]?.time;
    if (!from || !to || start === undefined || end === undefined)
      return ambiguous("component-frame-missing");
    try {
      const forwardPoints = pointsOf(from.mesh, 16).map(point => advect(point, start, end));
      const backwardPoints = pointsOf(to.mesh, 16).map(point => advect(point, end, start));
      const forward = distance(forwardPoints, facesOf(to.mesh));
      const backward = distance(backwardPoints, facesOf(from.mesh));
      const alternatives = [
        ...components[link.toFrame]!.filter((_, id) => id !== link.toComponent)
          .map(item => distance(forwardPoints, facesOf(item.mesh)).min),
        ...components[link.fromFrame]!.filter((_, id) => id !== link.fromComponent)
          .map(item => distance(backwardPoints, facesOf(item.mesh)).min) ];
      const alternativeMatches = alternatives.filter(value => value <= tolerance).length;
      const unique = witness.status === "transport-consistent" &&
        forward.max <= tolerance && backward.max <= tolerance &&
        alternativeMatches === 0;
      return { link, status: unique ? "supported-unique" as const :
        "ambiguous" as const,
        reason: unique ? "unique-two-way-verified-surface-witness" :
          "surface-error-or-alternative-match",
        forwardMax: forward.max, backwardMax: backward.max,
        forwardRms: forward.rms, backwardRms: backward.rms, alternativeMatches };
    } catch (cause) {
      if (cause instanceof Error && /cancelled|budget/.test(cause.message)) throw cause;
      return ambiguous("verified-sampling-incomplete");
    }
  });
  const identityLinks = witnesses.filter(item => item.status === "supported-unique")
    .map(item => item.link);
  const summary = { transportResultId: transport.resultId,
    transportHash: structuralHash(transport.summary),
    temporalId: temporal.identity.id, temporalHash: temporal.identity.structuralHash,
    frameSignatures: (transport.provenance.operation.parameters.lineage as
      { signatures: readonly string[] }).signatures,
    witnesses, identityLinks, ambiguousCount: witnesses.length - identityLinks.length,
    rule: { method: "two-way-midpoint-surface-distance", tolerance,
      maxPointsPerComponent: 16, maxFaceTests: 100_000 },
    workTests: tests, coordinateUnit: transport.summary.coordinateUnit,
    timeUnit: transport.summary.timeUnit,
    exactFrameOnly: true, interpolation: "unavailable",
    globalMaterialIdentity: "unverified" };
  const parameters = { transportResultId: transport.resultId,
    temporalId: temporal.identity.id, outputHash: structuralHash(summary) };
  const pin = transport.provenance.source;
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.temporal-surface-identity.${structuralHash({ pin, parameters }).slice(7)}`,
    status: "numerical", provenance: { source: pin,
      operation: { type: "vector3d.temporal-surface-identity",
        algorithm: "bounded-verified-two-way-component-witnesses",
        algorithmVersion: "1", parameters },
      numericContext: { precision: { binaryBits: 53 },
        tolerance: { absolute: tolerance } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary, warnings: ["A unique sampled component link is not global material identity or interpolation permission."],
    diagnostics: [], artifacts: [] });
  return { status: "measured", reason: null, publication };
}

export function projectTemporalSurfaceIdentityStatus(project: Math3DProject,
  result: AnalysisResultEnvelope, transfers?: VerifiedTemporalTransfers) {
  if (result.provenance.operation.type !== "vector3d.temporal-surface-identity")
    return { status: "withheld" as const, reason: "wrong-result-type" };
  const p = result.provenance.operation.parameters;
  const transport = project.workspace.results.find(item => item.resultId ===
    p.transportResultId);
  const temporal = project.workspace.timeSources?.find(item => item.identity.id ===
    p.temporalId);
  if (!transport || !temporal ||
      projectTemporalSurfaceTransportStatus(project, transport,
        transfers).status !== "current" ||
      structuralHash(transport.summary) !== result.summary.transportHash ||
      temporal.identity.structuralHash !== result.summary.temporalHash ||
      structuralHash(result.summary) !== p.outputHash ||
      result.summary.exactFrameOnly !== true ||
      result.summary.interpolation !== "unavailable" ||
      result.summary.globalMaterialIdentity !== "unverified" ||
      result.provenance.source.documentId !== transport.provenance.source.documentId ||
      result.provenance.source.revision !== transport.provenance.source.revision ||
      result.provenance.source.structuralHash !== transport.provenance.source.structuralHash ||
      result.resultId !== `vector3d.temporal-surface-identity.${structuralHash({
        pin: transport.provenance.source, parameters: p }).slice(7)}`)
    return { status: "withheld" as const, reason: "identity-source-or-evidence-changed" };
  return { status: "current" as const, reason: null };
}

export function upsertProjectTemporalSurfaceIdentity(project: Math3DProject,
  study: TemporalSurfaceIdentityStudy,
  transfers?: VerifiedTemporalTransfers): Math3DProject {
  if (study.status !== "measured" || !study.publication)
    throw new TypeError("Only measured surface identity witnesses can be saved.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  if (projectTemporalSurfaceIdentityStatus(current, study.publication,
    transfers).status !== "current")
    throw new TypeError("Surface identity lineage changed before save.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== study.publication!.resultId), study.publication] }));
}
