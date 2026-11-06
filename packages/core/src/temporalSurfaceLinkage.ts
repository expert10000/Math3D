import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { matchRemeshedTemporalSurface } from "./temporalRemeshedSurface";
import { computeTemporalSurfaceEvents, measureTemporalSurfaceComponents,
  projectTemporalSurfaceEventsStatus, temporalSurfaceSignature,
  type TemporalSurfaceEventFrame } from "./temporalSurfaceEvents";
import { projectTemporalFieldSourceStatus, type TemporalFieldSourceDocument,
  type VerifiedTemporalTransfers } from "./temporalFieldSourceDocument";
import type { VectorField3DIsosurface } from "./vectorField3DIsosurface";

type Bounds = readonly [readonly [number, number], readonly [number, number],
  readonly [number, number]];
export type TemporalComponentLink = Readonly<{ fromFrame: number; toFrame: number;
  fromComponent: number | null; toComponent: number | null;
  status: "geometric-continuation" | "possible-split" | "possible-merge" |
    "appearance" | "disappearance" | "ambiguous";
  maxError: number | null; rmsError: number | null; reason: string }>;
export type TemporalSurfaceLinkageStudy = Readonly<{ status: "ready" | "unavailable";
  reason: string | null; links: readonly TemporalComponentLink[];
  publication: AnalysisResultEnvelope | null }>;

/** Extracts bounded connected component meshes for the shared GF-54 matcher. */
function components(surface: VectorField3DIsosurface): readonly Readonly<{
  mesh: VectorField3DIsosurface; bounds: Bounds; euler: number }>[] {
  measureTemporalSurfaceComponents(surface);
  if (surface.triangleCount > 20_000 || surface.positions.length > 180_000)
    throw new RangeError("Component linkage exceeds the 20,000-triangle or 60,000-vertex budget.");
  const parent = Array.from({ length: surface.positions.length / 3 }, (_, i) => i);
  const root = (id: number): number => {
    while (parent[id] !== id) { parent[id] = parent[parent[id]!]!; id = parent[id]!; }
    return id;
  };
  for (let i = 0; i < surface.indices.length; i += 3) {
    const a = root(surface.indices[i]!), b = root(surface.indices[i + 1]!),
      c = root(surface.indices[i + 2]!);
    parent[b] = a; parent[c] = a;
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < surface.indices.length; i += 3) {
    const key = root(surface.indices[i]!);
    const group = groups.get(key);
    if (group) group.push(surface.indices[i]!, surface.indices[i + 1]!,
      surface.indices[i + 2]!);
    else groups.set(key, [surface.indices[i]!, surface.indices[i + 1]!,
      surface.indices[i + 2]!]);
  }
  return [...groups.values()].map(indices => {
    const ids = [...new Set(indices)];
    const local = new Map(ids.map((id, index) => [id, index]));
    const positions = new Float32Array(ids.flatMap(id => [
      surface.positions[id * 3]!, surface.positions[id * 3 + 1]!,
      surface.positions[id * 3 + 2]!]));
    const normals = new Float32Array(ids.flatMap(id => [
      surface.normals[id * 3]!, surface.normals[id * 3 + 1]!,
      surface.normals[id * 3 + 2]!]));
    const mesh = { ...surface, positions, normals,
      indices: new Uint32Array(indices.map(id => local.get(id)!)),
      triangleCount: indices.length / 3, vertexCount: ids.length,
      topology: { ...surface.topology, connectedComponents: 1 } };
    const measuredOne = measureTemporalSurfaceComponents(mesh)[0]!;
    return { mesh, bounds: measuredOne.bounds, euler: measuredOne.euler };
  }).sort((a, b) => a.bounds[0][0] - b.bounds[0][0] ||
    a.bounds[1][0] - b.bounds[1][0]);
}

const overlaps = (a: Bounds, b: Bounds, tolerance: number) =>
  a.every((range, axis) => range[0] <= b[axis]![1] + tolerance &&
    b[axis]![0] <= range[1] + tolerance);

export function computeTemporalSurfaceLinkage(project: Math3DProject,
  temporal: TemporalFieldSourceDocument, frames: readonly TemporalSurfaceEventFrame[],
  eventResult: AnalysisResultEnvelope,
  transfers?: VerifiedTemporalTransfers): TemporalSurfaceLinkageStudy {
  const unavailable = (reason: string): TemporalSurfaceLinkageStudy =>
    ({ status: "unavailable", reason, links: [], publication: null });
  if (!project.workspace.results.some(item => item.resultId === eventResult.resultId &&
      structuralHash(item.summary) === structuralHash(eventResult.summary)) ||
      projectTemporalSurfaceEventsStatus(project, eventResult, transfers).status !== "current")
    return unavailable("saved-verified-gf52-events-required");
  const replay = computeTemporalSurfaceEvents(project, temporal, frames, transfers);
  if (replay.status !== "ready" ||
      structuralHash(replay.publication!.summary) !== structuralHash(eventResult.summary))
    return unavailable("exact-frame-event-evidence-changed");
  const links: TemporalComponentLink[] = [];
  try {
    for (let frame = 0; frame < frames.length - 1; frame++) {
      const left = components(frames[frame]!.surface);
      const right = components(frames[frame + 1]!.surface);
      const event = replay.events[frame]!;
      const span = Math.min(...frames[frame]!.surface.coordinateAxes.map(axis =>
        axis.max - axis.min));
      const tolerance = span * .025;
      const candidates = left.map(a => right.map((b, j) =>
        overlaps(a.bounds, b.bounds, tolerance) ? j : -1).filter(j => j >= 0));
      for (const [i, a] of left.entries()) {
        if (!candidates[i]!.length) {
          links.push({ fromFrame: frame, toFrame: frame + 1,
            fromComponent: i, toComponent: null, status: "disappearance",
            maxError: null, rmsError: null,
            reason: "No later physical component bound overlaps this sampled component." });
          continue;
        }
        for (const j of candidates[i]!) {
          const b = right[j]!;
          const incoming = candidates.filter(row => row.includes(j)).length;
          const oneToOne = candidates[i]!.length === 1 && incoming === 1;
          const match = oneToOne && a.euler === b.euler &&
            event.kind === "stable-count" ? matchRemeshedTemporalSurface(a.mesh, b.mesh) : null;
          const status = !oneToOne ? candidates[i]!.length > 1 ?
            "possible-split" : "possible-merge" :
            match?.status === "matched" ? "geometric-continuation" : "ambiguous";
          links.push({ fromFrame: frame, toFrame: frame + 1,
            fromComponent: i, toComponent: j, status,
            maxError: match?.status === "matched" ? match.maxError : null,
            rmsError: match?.status === "matched" ? match.rmsError : null,
            reason: match?.status === "matched" ?
              "Unique bounded geometric match; material identity unverified." :
              !oneToOne ? "Overlapping bounds permit multiple component histories." :
              match?.reason ?? "Event topology or component geometry cannot establish identity." });
        }
      }
      for (const j of right.keys()) if (!candidates.some(row => row.includes(j)))
        links.push({ fromFrame: frame, toFrame: frame + 1,
          fromComponent: null, toComponent: j, status: "appearance",
          maxError: null, rmsError: null,
          reason: "No earlier physical component bound overlaps this sampled component." });
    }
  } catch (cause) { return unavailable(cause instanceof Error ? cause.message : String(cause)); }
  const lineage = { temporalId: temporal.identity.id,
    temporalHash: temporal.identity.structuralHash,
    temporalGenerationHash: temporal.source.generationHash,
    eventResultId: eventResult.resultId,
    eventSummaryHash: structuralHash(eventResult.summary),
    signatures: frames.map(frame => temporalSurfaceSignature(frame.surface)) };
  const summary = { links, interpolation: "unavailable",
    exactFrameOnly: true, timeUnit: temporal.source.timeAxis.unit,
    geometricContinuationCount: links.filter(item =>
      item.status === "geometric-continuation").length,
    ambiguousCount: links.filter(item => item.status === "ambiguous" ||
      item.status.startsWith("possible-")).length };
  const pin = temporal.source.frames[0]!;
  const parameters = { lineage, outputHash: structuralHash(summary) };
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.temporal-surface-linkage.${structuralHash(parameters).slice(7)}`,
    status: "numerical", provenance: { source: {
      documentId: pin.documentId as `math3d:${string}:${string}`,
      revision: pin.revision, structuralHash: pin.structuralHash as `sha256:${string}`,
      generation: pin.revision }, operation: {
        type: "vector3d.temporal-surface-linkage",
        algorithm: "bounded-component-overlap-remesh-check", algorithmVersion: "1",
        parameters }, numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary, warnings: ["Component linkage is sampled geometric evidence, not material tracking. Exact frames only."],
    diagnostics: [], artifacts: [] });
  return { status: "ready", reason: null, links, publication };
}

export function projectTemporalSurfaceLinkageStatus(project: Math3DProject,
  result: AnalysisResultEnvelope, transfers?: VerifiedTemporalTransfers) {
  if (result.provenance.operation.type !== "vector3d.temporal-surface-linkage")
    return { status: "withheld" as const, reason: "wrong-result-type" };
  const parameters = result.provenance.operation.parameters;
  const lineage = parameters.lineage as Record<string, unknown>;
  const temporal = project.workspace.timeSources?.find(item =>
    item.identity.id === lineage?.temporalId);
  const events = project.workspace.results.find(item =>
    item.resultId === lineage?.eventResultId);
  const pin = result.provenance.source;
  const first = temporal?.source.frames[0];
  if (!temporal || !events || !first ||
      pin.documentId !== first.documentId || pin.revision !== first.revision ||
      pin.structuralHash !== first.structuralHash || pin.generation !== first.revision ||
      temporal.identity.structuralHash !== lineage.temporalHash ||
      temporal.source.generationHash !== lineage.temporalGenerationHash ||
      structuralHash(events.summary) !== lineage.eventSummaryHash ||
      structuralHash(result.summary) !== parameters.outputHash ||
      result.summary.interpolation !== "unavailable" ||
      result.resultId !== `vector3d.temporal-surface-linkage.${structuralHash(parameters).slice(7)}` ||
      projectTemporalSurfaceEventsStatus(project, events, transfers).status !== "current")
    return { status: "withheld" as const, reason: "linkage-lineage-or-evidence-changed" };
  const status = projectTemporalFieldSourceStatus(project, temporal, transfers);
  return status.status === "current" ? { status: "current" as const, reason: null } :
    { status: "withheld" as const, reason: status.reason };
}

export function upsertProjectTemporalSurfaceLinkage(project: Math3DProject,
  study: TemporalSurfaceLinkageStudy,
  transfers?: VerifiedTemporalTransfers): Math3DProject {
  if (study.status !== "ready" || !study.publication ||
      structuralHash(study.links) !== structuralHash(study.publication.summary.links))
    throw new TypeError("Only measured component linkage can be saved.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  if (projectTemporalSurfaceLinkageStatus(current, study.publication, transfers).status !== "current")
    throw new TypeError("Component sources changed or are unverified.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== study.publication!.resultId), study.publication] }));
}
