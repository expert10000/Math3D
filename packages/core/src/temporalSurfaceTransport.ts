import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { type TemporalSurfaceEventFrame, temporalSurfaceSignature } from "./temporalSurfaceEvents";
import { computeTemporalSurfaceLinkage, projectTemporalSurfaceLinkageStatus,
  temporalSurfaceComponentMeshes, type TemporalComponentLink } from "./temporalSurfaceLinkage";
import { createVerifiedTemporalFieldSampler, type TemporalFieldSourceDocument,
  type VerifiedTemporalTransfers } from "./temporalFieldSourceDocument";
import type { VectorField3DDocument } from "./vectorField3DDocument";

type Vec3 = readonly [number, number, number];
export type SurfaceTransportRule = Readonly<{ method: "verified-midpoint-advection";
  maxStepTime: number; distanceTolerance: number; witnessesPerComponent: number }>;
export type SurfaceTransportWitness = Readonly<{ link: TemporalComponentLink;
  status: "transport-consistent" | "transport-inconsistent" | "ambiguous";
  tested: number; withinTargetBounds: number; maxMissDistance: number | null;
  reason: string }>;
export type TemporalSurfaceTransportStudy = Readonly<{ status: "ready" | "unavailable";
  reason: string | null; witnesses: readonly SurfaceTransportWitness[];
  publication: AnalysisResultEnvelope | null }>;

const unavailable = (reason: string): TemporalSurfaceTransportStudy => ({
  status: "unavailable", reason, witnesses: [], publication: null });
const add = (a: Vec3, b: Vec3, scale: number): Vec3 =>
  [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
const boundsDistance = (point: Vec3, bounds: readonly (readonly [number, number])[]) =>
  Math.hypot(...point.map((value, axis) =>
    Math.max(bounds[axis]![0] - value, 0, value - bounds[axis]![1])));

/** Region-level transport evidence from checked temporal velocity samples. */
export function computeTemporalSurfaceTransport(project: Math3DProject,
  temporal: TemporalFieldSourceDocument, frames: readonly TemporalSurfaceEventFrame[],
  linkage: AnalysisResultEnvelope, rule: SurfaceTransportRule,
  transfers?: VerifiedTemporalTransfers, shouldCancel?: () => boolean): TemporalSurfaceTransportStudy {
  if (rule.method !== "verified-midpoint-advection" ||
      !Number.isFinite(rule.maxStepTime) || rule.maxStepTime <= 0 || rule.maxStepTime > 4 ||
      !Number.isFinite(rule.distanceTolerance) || rule.distanceTolerance <= 0 ||
      rule.distanceTolerance > 1 || !Number.isInteger(rule.witnessesPerComponent) ||
      rule.witnessesPerComponent < 2 || rule.witnessesPerComponent > 16)
    throw new RangeError("Transport needs bounded midpoint steps and 2–16 witnesses.");
  const saved = project.workspace.results.find(item => item.resultId === linkage.resultId);
  if (!saved || structuralHash(saved.summary) !== structuralHash(linkage.summary) ||
      projectTemporalSurfaceLinkageStatus(project, linkage, transfers).status !== "current")
    return unavailable("saved-verified-component-linkage-required");
  const eventId = linkage.provenance.operation.parameters.lineage &&
    (linkage.provenance.operation.parameters.lineage as { eventResultId?: string }).eventResultId;
  const event = project.workspace.results.find(item => item.resultId === eventId);
  if (!event) return unavailable("saved-event-evidence-missing");
  const replay = computeTemporalSurfaceLinkage(project, temporal, frames, event, transfers);
  if (replay.status !== "ready" || structuralHash(replay.publication!.summary) !==
      structuralHash(linkage.summary)) return unavailable("exact-frame-linkage-changed");
  const first = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === temporal.source.frames[0]!.documentId)?.checkpoint as
    VectorField3DDocument | undefined;
  if (first?.format !== "math3d.vector-field3d-document" ||
      temporal.source.timeAxis.unit !== first.source.timeUnit ||
      temporal.source.timeAxis.unit !== "s" ||
      temporal.source.timeAxis.interpolation !== "linear" ||
      new Set(first.source.axes.map(axis => axis.unit)).size !== 1 ||
      (first.source.field.kind === "expressions" ?
        first.source.field.components.map(item => item.unit) :
        first.source.field.componentUnits).some(unit =>
          unit !== `${first.source.axes[0]!.unit}/s`))
    return unavailable("transport-needs-matching-length-and-velocity-units-in-seconds");
  let sample: ReturnType<typeof createVerifiedTemporalFieldSampler>;
  try { sample = createVerifiedTemporalFieldSampler(project, temporal, transfers); }
  catch { return unavailable("temporal-source-verification-required"); }
  const meshes = frames.map(frame => temporalSurfaceComponentMeshes(frame.surface));
  const links = replay.links;
  if (links.length > 128) return unavailable("transport-link-budget");
  const witnesses: SurfaceTransportWitness[] = [];
  for (const link of links) {
    if (shouldCancel?.()) throw new Error("Surface transport cancelled.");
    if (link.fromComponent === null || link.toComponent === null) {
      witnesses.push({ link, status: "ambiguous", tested: 0,
        withinTargetBounds: 0, maxMissDistance: null,
        reason: "Appearance or disappearance has no two-sided material witness." });
      continue;
    }
    const from = meshes[link.fromFrame]?.[link.fromComponent];
    const to = meshes[link.toFrame]?.[link.toComponent];
    const start = frames[link.fromFrame]?.time, end = frames[link.toFrame]?.time;
    if (!from || !to || start === undefined || end === undefined ||
        end - start > rule.maxStepTime) return unavailable("transport-frame-or-step-budget");
    const positions = from.mesh.positions;
    const vertexCount = positions.length / 3;
    const selected: Vec3[] = Array.from({ length: Math.min(vertexCount,
      rule.witnessesPerComponent - 1) }, (_, index) => {
      const id = Math.floor(index * vertexCount /
        Math.min(vertexCount, rule.witnessesPerComponent - 1));
      return [positions[id * 3]!, positions[id * 3 + 1]!, positions[id * 3 + 2]!];
    });
    selected.push([0, 1, 2].map(axis =>
      (from.bounds[axis]![0] + from.bounds[axis]![1]) / 2) as unknown as Vec3);
    let within = 0, maxMiss = 0, tested = 0, unavailableSamples = 0;
    for (const point of selected) {
      if (shouldCancel?.()) throw new Error("Surface transport cancelled.");
      try {
        const velocity = sample(start, point).vector;
        const midpoint = add(point, velocity, (end - start) / 2);
        const middleVelocity = sample((start + end) / 2, midpoint).vector;
        const predicted = add(point, middleVelocity, end - start);
        const distance = boundsDistance(predicted, to.bounds);
        tested++; maxMiss = Math.max(maxMiss, distance);
        if (distance <= rule.distanceTolerance) within++;
      } catch { unavailableSamples++; }
    }
    const status = unavailableSamples || tested < 2 ? "ambiguous" :
      within >= 2 ? "transport-consistent" : "transport-inconsistent";
    witnesses.push({ link, status, tested, withinTargetBounds: within,
      maxMissDistance: tested ? maxMiss : null,
      reason: status === "transport-consistent" ?
        "Checked velocity predicts region overlap; this does not prove material identity." :
        status === "ambiguous" ? "Velocity sampling or witness coverage is incomplete." :
          "Checked velocity does not place enough witnesses in the target region." });
  }
  const lineage = { temporalId: temporal.identity.id,
    temporalHash: temporal.identity.structuralHash,
    linkageResultId: linkage.resultId, linkageSummaryHash: structuralHash(linkage.summary),
    signatures: frames.map(frame => temporalSurfaceSignature(frame.surface)) };
  const summary = { witnesses, interpolation: "unavailable", exactFrameOnly: true,
    materialIdentity: "unverified", coordinateUnit: first.source.axes[0]!.unit,
    timeUnit: temporal.source.timeAxis.unit,
    ambiguousCount: witnesses.filter(item => item.status === "ambiguous").length };
  const parameters = { rule, lineage, outputHash: structuralHash(summary) };
  const pin = temporal.source.frames[0]!;
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.temporal-surface-transport.${structuralHash(parameters).slice(7)}`,
    status: "numerical", provenance: { source: { documentId: pin.documentId as
      `math3d:${string}:${string}`, revision: pin.revision,
      structuralHash: pin.structuralHash as `sha256:${string}`, generation: pin.revision },
      operation: { type: "vector3d.temporal-surface-transport",
        algorithm: "verified-midpoint-region-witness", algorithmVersion: "1",
        parameters }, numericContext: { precision: { binaryBits: 53 },
        tolerance: { absolute: rule.distanceTolerance } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary, warnings: ["Region transport evidence does not prove material identity or permit surface interpolation."],
    diagnostics: [], artifacts: [] });
  return { status: "ready", reason: null, witnesses, publication };
}

export function projectTemporalSurfaceTransportStatus(project: Math3DProject,
  result: AnalysisResultEnvelope, transfers?: VerifiedTemporalTransfers) {
  if (result.provenance.operation.type !== "vector3d.temporal-surface-transport")
    return { status: "withheld" as const, reason: "wrong-result-type" };
  const parameters = result.provenance.operation.parameters;
  const lineage = parameters.lineage as { temporalId: string; temporalHash: string;
    linkageResultId: string; linkageSummaryHash: string } | undefined;
  const temporal = project.workspace.timeSources?.find(item =>
    item.identity.id === lineage?.temporalId);
  const linkage = project.workspace.results.find(item =>
    item.resultId === lineage?.linkageResultId);
  const pin = result.provenance.source, first = temporal?.source.frames[0];
  if (!temporal || !linkage || !first || pin.documentId !== first.documentId ||
      pin.revision !== first.revision || pin.structuralHash !== first.structuralHash ||
      pin.generation !== first.revision ||
      temporal.identity.structuralHash !== lineage?.temporalHash ||
      structuralHash(linkage.summary) !== lineage.linkageSummaryHash ||
      projectTemporalSurfaceLinkageStatus(project, linkage, transfers).status !== "current" ||
      structuralHash(result.summary) !== parameters.outputHash ||
      result.summary.interpolation !== "unavailable" ||
      result.summary.materialIdentity !== "unverified" ||
      result.resultId !== `vector3d.temporal-surface-transport.${structuralHash(parameters).slice(7)}`)
    return { status: "withheld" as const, reason: "transport-source-or-evidence-changed" };
  return { status: "current" as const, reason: null };
}

export function upsertProjectTemporalSurfaceTransport(project: Math3DProject,
  study: TemporalSurfaceTransportStudy,
  transfers?: VerifiedTemporalTransfers): Math3DProject {
  if (study.status !== "ready" || !study.publication ||
      structuralHash(study.witnesses) !== structuralHash(study.publication.summary.witnesses))
    throw new TypeError("Only measured transport evidence can be saved.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  if (projectTemporalSurfaceTransportStatus(current, study.publication, transfers).status !== "current")
    throw new TypeError("Transport source or event lineage changed.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== study.publication!.resultId), study.publication] }));
}
