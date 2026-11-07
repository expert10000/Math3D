import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { sha256Checksum, structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { projectTemporalFieldSourceStatus, type TemporalFieldSourceDocument,
  type VerifiedTemporalTransfers } from "./temporalFieldSourceDocument";
import type { VectorField3DIsosurface } from "./vectorField3DIsosurface";

type Bounds = readonly [readonly [number, number], readonly [number, number],
  readonly [number, number]];
export type TemporalSurfaceEventKind = "stable-count" | "possible-merge" |
  "possible-split" | "disappearance" | "appearance" | "inconclusive";
export type TemporalSurfaceEvent = Readonly<{ fromTime: number; toTime: number;
  fromComponents: number; toComponents: number;
  fromEuler: readonly number[]; toEuler: readonly number[];
  kind: TemporalSurfaceEventKind; reason: string;
  interpolation: "unavailable" }>;
export type TemporalSurfaceEventStudy = Readonly<{ status: "ready" | "unavailable";
  reason: string | null; events: readonly TemporalSurfaceEvent[];
  publication: AnalysisResultEnvelope | null }>;
export type TemporalSurfaceEventFrame = Readonly<{ time: number;
  surface: VectorField3DIsosurface }>;

const bytesHash = (values: Float32Array | Uint32Array) => sha256Checksum(
  new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
export const temporalSurfaceSignature = (surface: VectorField3DIsosurface) => structuralHash({
  source: surface.source, level: surface.level, unit: surface.unit,
  clipBounds: surface.clipBounds, topology: surface.topology,
  positions: bytesHash(surface.positions), indices: bytesHash(surface.indices),
  normals: bytesHash(surface.normals) });
const overlap = (a: Bounds, b: Bounds, tolerance: number) =>
  a.every((range, axis) => range[0] <= b[axis]![1] + tolerance &&
    b[axis]![0] <= range[1] + tolerance);

/** Mesh-connected components with Euler characteristic and physical bounds. */
export function measureTemporalSurfaceComponents(surface: VectorField3DIsosurface):
  readonly Readonly<{ vertices: number; edges: number; faces: number;
    euler: number; bounds: Bounds }>[] {
  if (!surface.complete || surface.triangleCount < 0 ||
      surface.triangleCount > 20_000 || surface.indices.length !==
        surface.triangleCount * 3 || surface.positions.length % 3 ||
      surface.positions.length > 60_000 * 3 ||
      surface.indices.some(id => id * 3 + 2 >= surface.positions.length))
    throw new RangeError("Event frame is partial or exceeds the 20,000-triangle budget.");
  const count = surface.positions.length / 3;
  const parent = Array.from({ length: count }, (_, index) => index);
  const root = (id: number): number => {
    while (parent[id] !== id) { parent[id] = parent[parent[id]!]!; id = parent[id]!; }
    return id;
  };
  for (let i = 0; i < surface.indices.length; i += 3) {
    const a = surface.indices[i]!, b = surface.indices[i + 1]!,
      c = surface.indices[i + 2]!;
    parent[root(b)] = root(a); parent[root(c)] = root(a);
  }
  const components = new Map<number, { vertices: Set<number>; edges: Set<string>;
    faces: number; bounds: [number[], number[], number[]] }>();
  for (let i = 0; i < surface.indices.length; i += 3) {
    const ids = [surface.indices[i]!, surface.indices[i + 1]!,
      surface.indices[i + 2]!];
    const key = root(ids[0]!);
    let item = components.get(key);
    if (!item) { item = { vertices: new Set(), edges: new Set(), faces: 0,
      bounds: [[Infinity, -Infinity], [Infinity, -Infinity],
        [Infinity, -Infinity]] }; components.set(key, item); }
    item.faces++;
    for (let edge = 0; edge < 3; edge++) {
      const a = ids[edge]!, b = ids[(edge + 1) % 3]!;
      item.edges.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
      item.vertices.add(a);
      for (let axis = 0; axis < 3; axis++) {
        const value = surface.positions[a * 3 + axis]!;
        if (!Number.isFinite(value)) throw new TypeError("Event geometry has a nonfinite vertex.");
        item.bounds[axis]![0] = Math.min(item.bounds[axis]![0]!, value);
        item.bounds[axis]![1] = Math.max(item.bounds[axis]![1]!, value);
      }
    }
  }
  if (components.size !== surface.topology.connectedComponents)
    throw new TypeError("Event frame component count disagrees with its mesh.");
  return [...components.values()].map(item => ({ vertices: item.vertices.size,
    edges: item.edges.size, faces: item.faces,
    euler: item.vertices.size - item.edges.size + item.faces,
    bounds: item.bounds as unknown as Bounds }));
}

/** Counts and bounding overlap support event candidates, never point correspondence. */
export function classifyTemporalSurfaceEvent(a: VectorField3DIsosurface,
  b: VectorField3DIsosurface, fromTime: number, toTime: number): TemporalSurfaceEvent {
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) ||
      fromTime >= toTime || a.level !== b.level || a.unit !== b.unit ||
      JSON.stringify(a.coordinateAxes) !== JSON.stringify(b.coordinateAxes) ||
      JSON.stringify(a.clipBounds) !== JSON.stringify(b.clipBounds))
    throw new TypeError("Event frames need ordered times and identical physical extraction rules.");
  const left = measureTemporalSurfaceComponents(a),
    right = measureTemporalSurfaceComponents(b);
  if (a.triangleCount > 0 && !a.topology.watertight ||
      b.triangleCount > 0 && !b.topology.watertight ||
      a.topology.nonManifoldEdgeCount || b.topology.nonManifoldEdgeCount ||
      a.topology.boundaryEdgeCount || b.topology.boundaryEdgeCount)
    return { fromTime, toTime, fromComponents: left.length,
      toComponents: right.length, fromEuler: left.map(item => item.euler),
      toEuler: right.map(item => item.euler), kind: "inconclusive",
      reason: "An open or nonmanifold frame cannot support a component-event claim.",
      interpolation: "unavailable" };
  const tolerance = Math.min(...a.coordinateAxes.map(axis => axis.max - axis.min)) * .025;
  const matches = left.map(item => right.map((other, index) =>
    overlap(item.bounds, other.bounds, tolerance) ? index : -1).filter(index =>
      index >= 0));
  let kind: TemporalSurfaceEventKind = "inconclusive";
  let reason = "Component count and bounds do not resolve the event.";
  if (!left.length && right.length) {
    kind = "appearance"; reason = "A previously empty frame now contains components.";
  } else if (left.length && !right.length) {
    kind = "disappearance"; reason = "All components disappeared in the exact next frame.";
  } else if (left.length === right.length &&
      left.every((item, index) => item.euler === right[index]?.euler)) {
    kind = "stable-count";
    reason = "Counts and Euler characteristics agree; correspondence is still unverified.";
  } else if (left.length > right.length) {
    const overlapCounts = right.map((_, index) => matches.filter(row =>
      row.includes(index)).length);
    if (overlapCounts.some(count => count > 1)) {
      kind = "possible-merge";
      reason = "Multiple earlier component bounds overlap one later component; identity is unverified.";
    } else if (matches.some(row => row.length === 0)) {
      kind = "disappearance";
      reason = "An earlier component has no overlapping later bound; disappearance is a sampled-frame observation.";
    }
  } else if (right.length > left.length) {
    if (matches.some(row => row.length > 1)) {
      kind = "possible-split";
      reason = "One earlier component bound overlaps multiple later components; identity is unverified.";
    } else if (right.some((_, index) => !matches.some(row => row.includes(index)))) {
      kind = "appearance";
      reason = "A later component has no overlapping earlier bound; appearance is a sampled-frame observation.";
    }
  }
  return { fromTime, toTime, fromComponents: left.length,
    toComponents: right.length, fromEuler: left.map(item => item.euler),
    toEuler: right.map(item => item.euler), kind, reason,
    interpolation: "unavailable" };
}

export function computeTemporalSurfaceEvents(project: Math3DProject,
  temporal: TemporalFieldSourceDocument,
  frames: readonly TemporalSurfaceEventFrame[],
  transfers?: VerifiedTemporalTransfers): TemporalSurfaceEventStudy {
  const unavailable = (reason: string): TemporalSurfaceEventStudy =>
    ({ status: "unavailable", reason, events: [], publication: null });
  const status = projectTemporalFieldSourceStatus(project, temporal, transfers);
  if (status.status !== "current") return unavailable(status.reason ?? "source-unverified");
  if (frames.length !== temporal.source.frames.length || frames.length < 2 ||
      frames.length > 4) return unavailable("frame-count-changed");
  try {
    for (const [index, frame] of frames.entries()) {
      const pin = temporal.source.frames[index]!;
      if (frame.time !== pin.time || frame.surface.source.documentId !== pin.documentId ||
          frame.surface.source.revision !== pin.revision ||
          frame.surface.source.structuralHash !== pin.structuralHash)
        return unavailable(`frame-${index + 1}-changed`);
    }
    const events = frames.slice(0, -1).map((frame, index) =>
      classifyTemporalSurfaceEvent(frame.surface, frames[index + 1]!.surface,
        frame.time, frames[index + 1]!.time));
    const pin = temporal.source.frames[0]!;
    const lineage = { temporalId: temporal.identity.id,
      temporalRevision: temporal.identity.revision,
      temporalHash: temporal.identity.structuralHash,
      temporalGenerationHash: temporal.source.generationHash,
      signatures: frames.map(frame => temporalSurfaceSignature(frame.surface)) };
    const publication = createAnalysisResultEnvelope({
      resultId: `vector3d.temporal-surface-events.${structuralHash(lineage).slice(7)}`,
      status: "numerical",
      provenance: { source: { documentId: pin.documentId as `math3d:${string}:${string}`,
        revision: pin.revision, structuralHash: pin.structuralHash as `sha256:${string}`,
        generation: pin.revision },
        operation: { type: "vector3d.temporal-surface-events",
          algorithm: "mesh-components-euler-bounds", algorithmVersion: "1",
          parameters: { lineage } },
        numericContext: { precision: { binaryBits: 53 } },
        engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
      summary: { events, eventCount: events.length,
        timeUnit: temporal.source.timeAxis.unit,
        interpolation: "unavailable", coverage: "exact-verified-frames" },
      warnings: ["Possible split or merge describes sampled components, not tracked material points. Exact frames only."],
      diagnostics: [], artifacts: [] });
    return { status: "ready", reason: null, events, publication };
  } catch (cause) { return unavailable(cause instanceof Error ? cause.message : String(cause)); }
}

export function projectTemporalSurfaceEventsStatus(project: Math3DProject,
  result: AnalysisResultEnvelope, transfers?: VerifiedTemporalTransfers) {
  if (result.provenance.operation.type !== "vector3d.temporal-surface-events")
    return { status: "withheld" as const, reason: "wrong-result-type" };
  const lineage = result.provenance.operation.parameters.lineage as Record<string, unknown>;
  const temporal = project.workspace.timeSources?.find(item =>
    item.identity.id === lineage?.temporalId);
  if (!temporal) return { status: "withheld" as const, reason: "temporal-source-missing" };
  const first = temporal.source.frames[0]!;
  if (result.provenance.source.documentId !== first.documentId ||
      result.provenance.source.revision !== first.revision ||
      result.provenance.source.structuralHash !== first.structuralHash ||
      result.provenance.source.generation !== first.revision ||
      lineage.temporalRevision !== temporal.identity.revision ||
      lineage.temporalHash !== temporal.identity.structuralHash ||
      lineage.temporalGenerationHash !== temporal.source.generationHash ||
      result.resultId !== `vector3d.temporal-surface-events.${structuralHash(lineage).slice(7)}`)
    return { status: "withheld" as const, reason: "event-lineage-changed" };
  const status = projectTemporalFieldSourceStatus(project, temporal, transfers);
  return status.status === "current" ? { status: "current" as const, reason: null } :
    { status: "withheld" as const, reason: status.reason };
}

export function upsertProjectTemporalSurfaceEvents(project: Math3DProject,
  study: TemporalSurfaceEventStudy, transfers?: VerifiedTemporalTransfers): Math3DProject {
  if (study.status !== "ready" || !study.publication ||
      structuralHash(study.events) !== structuralHash(study.publication.summary.events))
    throw new TypeError("Only verified exact-frame events can be saved.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  if (projectTemporalSurfaceEventsStatus(current, study.publication, transfers).status !== "current")
    throw new TypeError("Event sources changed or are unverified.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== study.publication!.resultId), study.publication] }));
}
