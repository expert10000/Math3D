import {
  buildSplineCurve,
  closestPointOnCurve,
  createSplineDefinition,
  derivative,
  sampleUniform,
  secondDerivative,
  type AnyCurve,
  type CanonicalSplineDefinition,
  type CurvePoint,
} from "@math3d/core";
import type { CanonicalCurveDefinition } from "./contracts";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

export type CurveMeshOutputMode = "points" | "polyline" | "tube" | "ribbon" | "swept-profile" | "frame-glyphs";
export type CurveFramePolicy = "frenet" | "bishop";
export type CurveMeshState = "live-current" | "frozen-snapshot" | "detached" | "stale";
export type CurveMeshPrimitive = "points" | "lines" | "triangles";

export type CurveMeshSettings = {
  outputMode: CurveMeshOutputMode;
  longitudinalResolution: number;
  radialResolution: number;
  tubeRadius: number;
  caps: boolean;
  profile: ReadonlyArray<readonly [number, number]>;
  twist: number;
  framePolicy: CurveFramePolicy;
  ribbonWidth: number;
  ribbonOrientation: "normal" | "binormal";
  seamPolicy: "weld" | "duplicate";
  boundaryPolicy: "open" | "cap";
};

export type DerivedCurveMeshIdentity = {
  version: 1;
  meshId: string;
  meshRevision: number;
  sourceCurveId: string;
  sourceCurveRevision: number;
  sourceRepresentation: string;
  sourceFidelity: "exact" | "parametric" | "sampled";
  sourceUnits: CanonicalCurveDefinition["units"];
  variant: CurveMeshOutputMode;
  state: CurveMeshState;
  createdAt: number;
  settings: CurveMeshSettings;
  staleReason?: string;
};

export type CurveMeshNavigation = {
  openCurveSource: { curveId: string; curveRevision: number };
  openMeshAnalysis: { meshId: string; meshRevision: number };
};

export type CurveMeshCorrespondence = {
  correspondenceId: string;
  state: "complete" | "partial" | "unavailable";
  sourceParameters: Float64Array;
  sourceSampleIndices: Uint32Array;
  profileIndices: Uint32Array;
  confidence: Float32Array;
  explanation: string;
};

export type CurveMeshGeometry = {
  primitive: CurveMeshPrimitive;
  positions: Float32Array;
  indices: Uint32Array | null;
  normals: Float32Array | null;
};

export type DerivedCurveMeshPayload = {
  kind: "derived-curve-mesh";
  identity: DerivedCurveMeshIdentity;
  geometry: CurveMeshGeometry;
  correspondence: CurveMeshCorrespondence;
  navigation: CurveMeshNavigation;
  vertexCount: number;
  faceCount: number;
  warnings: string[];
};

export type CurveMeshHistoryEntry = { id: string; action: "created" | "regenerated" | "frozen" | "detached" | "marked-stale"; at: number; meshRevision: number; sourceRevision: number; detail: string };
export type DerivedCurveMeshRecord = { version: 1; identity: DerivedCurveMeshIdentity; label: string; payload: DerivedCurveMeshPayload; history: CurveMeshHistoryEntry[] };

export const DEFAULT_CURVE_MESH_SETTINGS: CurveMeshSettings = {
  outputMode: "tube", longitudinalResolution: 96, radialResolution: 12, tubeRadius: 0.08, caps: true,
  profile: [[1, 0], [0, 1], [-1, 0], [0, -1]], twist: 0, framePolicy: "bishop",
  ribbonWidth: 0.15, ribbonOrientation: "normal", seamPolicy: "weld", boundaryPolicy: "cap",
};

type V3 = { x: number; y: number; z: number };
const EPS = 1e-10;
const p3 = (point: CurvePoint): V3 => ({ x: point.x, y: point.y, z: "z" in point ? point.z : 0 });
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: V3, value: number): V3 => ({ x: a.x * value, y: a.y * value, z: a.z * value });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: V3): V3 => { const length = Math.hypot(a.x, a.y, a.z); return length <= EPS ? { x: 0, y: 0, z: 0 } : scale(a, 1 / length); };
const rotateFrame = (normal: V3, binormal: V3, angle: number) => ({ normal: add(scale(normal, Math.cos(angle)), scale(binormal, Math.sin(angle))), binormal: add(scale(normal, -Math.sin(angle)), scale(binormal, Math.cos(angle))) });
const hash = (value: unknown) => { const text = JSON.stringify(value); let output = 2166136261; for (let index = 0; index < text.length; index += 1) output = Math.imul(output ^ text.charCodeAt(index), 16777619); return (output >>> 0).toString(36); };

type FrameSample = { t: number; point: V3; tangent: V3; normal: V3; binormal: V3; sampleIndex: number };
const buildFrames = (curve: AnyCurve, count: number, policy: CurveFramePolicy, twist: number): FrameSample[] => {
  const rows = sampleUniform(curve, count); const frames: FrameSample[] = []; let previousNormal: V3 | null = null;
  rows.forEach((row, sampleIndex) => {
    const tangent = norm(p3(derivative(curve as never, row.t)));
    const second = p3(secondDerivative(curve as never, row.t));
    let normal = policy === "frenet" ? norm(sub(second, scale(tangent, dot(second, tangent)))) : previousNormal ? norm(sub(previousNormal, scale(tangent, dot(previousNormal, tangent)))) : { x: 0, y: 0, z: 0 };
    if (Math.hypot(normal.x, normal.y, normal.z) <= EPS) {
      const reference = Math.abs(tangent.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
      normal = norm(cross(reference, tangent));
    }
    let binormal = norm(cross(tangent, normal)); normal = norm(cross(binormal, tangent));
    const turned = rotateFrame(normal, binormal, twist * sampleIndex / Math.max(1, rows.length - 1)); normal = turned.normal; binormal = turned.binormal;
    previousNormal = normal; frames.push({ t: row.t, point: p3(row.point), tangent, normal, binormal, sampleIndex });
  });
  return frames;
};

const pushVertex = (positions: number[], normals: number[], point: V3, normal: V3, parameters: number[], samples: number[], profiles: number[], frame: FrameSample, profileIndex: number) => {
  positions.push(point.x, point.y, point.z); normals.push(normal.x, normal.y, normal.z); parameters.push(frame.t); samples.push(frame.sampleIndex); profiles.push(profileIndex);
};

export const createDerivedCurveMesh = (args: { definition: CanonicalCurveDefinition; curve: AnyCurve; settings?: Partial<CurveMeshSettings>; fidelity?: DerivedCurveMeshIdentity["sourceFidelity"]; meshRevision?: number; meshId?: string; state?: CurveMeshState; now?: number }): DerivedCurveMeshPayload => {
  const settings: CurveMeshSettings = { ...DEFAULT_CURVE_MESH_SETTINGS, ...(args.settings ?? {}), profile: args.settings?.profile ? [...args.settings.profile] : DEFAULT_CURVE_MESH_SETTINGS.profile };
  settings.longitudinalResolution = Math.max(2, Math.min(4096, Math.round(settings.longitudinalResolution)));
  settings.radialResolution = Math.max(3, Math.min(256, Math.round(settings.radialResolution)));
  settings.tubeRadius = Math.max(1e-6, settings.tubeRadius); settings.ribbonWidth = Math.max(1e-6, settings.ribbonWidth);
  const frameCount = args.curve.domain.closed && settings.seamPolicy === "weld" ? settings.longitudinalResolution : settings.longitudinalResolution + 1;
  const frames = buildFrames(args.curve, frameCount, settings.framePolicy, settings.twist);
  const positions: number[] = []; const normals: number[] = []; const indices: number[] = []; const parameters: number[] = []; const samples: number[] = []; const profiles: number[] = [];
  let primitive: CurveMeshPrimitive = "triangles"; const warnings: string[] = [];
  const closed = Boolean(args.curve.domain.closed);

  if (settings.outputMode === "points" || settings.outputMode === "polyline") {
    primitive = settings.outputMode === "points" ? "points" : "lines";
    frames.forEach((frame) => pushVertex(positions, normals, frame.point, frame.normal, parameters, samples, profiles, frame, 0));
    if (primitive === "lines") for (let index = 1; index < frames.length; index += 1) indices.push(index - 1, index);
    if (primitive === "lines" && closed) indices.push(frames.length - 1, 0);
  } else if (settings.outputMode === "frame-glyphs") {
    primitive = "lines";
    frames.forEach((frame) => {
      const start = positions.length / 3; pushVertex(positions, normals, frame.point, frame.normal, parameters, samples, profiles, frame, 0);
      [frame.tangent, frame.normal, frame.binormal].forEach((axis, axisIndex) => { pushVertex(positions, normals, add(frame.point, scale(axis, settings.ribbonWidth)), axis, parameters, samples, profiles, frame, axisIndex + 1); indices.push(start, start + axisIndex + 1); });
    });
  } else {
    const profile = settings.outputMode === "ribbon"
      ? [[-settings.ribbonWidth / 2, 0], [settings.ribbonWidth / 2, 0]] as const
      : settings.outputMode === "tube"
        ? Array.from({ length: settings.radialResolution }, (_, index) => { const angle = 2 * Math.PI * index / settings.radialResolution; return [settings.tubeRadius * Math.cos(angle), settings.tubeRadius * Math.sin(angle)] as const; })
        : settings.profile.map(([x, y]) => [x * settings.tubeRadius, y * settings.tubeRadius] as const);
    if (profile.length < 2) throw new Error("Swept profile requires at least two points.");
    frames.forEach((frame) => profile.forEach(([x, y], profileIndex) => {
      const axisA = settings.outputMode === "ribbon" && settings.ribbonOrientation === "binormal" ? frame.binormal : frame.normal;
      const axisB = settings.outputMode === "ribbon" ? frame.binormal : frame.binormal;
      const radial = add(scale(axisA, x), scale(axisB, y)); pushVertex(positions, normals, add(frame.point, radial), norm(radial), parameters, samples, profiles, frame, profileIndex);
    }));
    const rings = frames.length; const width = profile.length; const ringPairs = closed && settings.seamPolicy === "weld" ? rings : rings - 1; const profileClosed = settings.outputMode !== "ribbon";
    for (let ring = 0; ring < ringPairs; ring += 1) {
      const nextRing = (ring + 1) % rings; const segments = profileClosed ? width : width - 1;
      for (let side = 0; side < segments; side += 1) { const nextSide = (side + 1) % width; const a = ring * width + side; const b = nextRing * width + side; const c = nextRing * width + nextSide; const d = ring * width + nextSide; indices.push(a, b, c, a, c, d); }
    }
    const cap = settings.caps || settings.boundaryPolicy === "cap";
    if (!closed && profileClosed && cap) {
      [0, rings - 1].forEach((ring, capIndex) => { const frame = frames[ring]; const center = positions.length / 3; const capNormal = scale(frame.tangent, capIndex ? 1 : -1); pushVertex(positions, normals, frame.point, capNormal, parameters, samples, profiles, frame, width); for (let side = 0; side < width; side += 1) { const next = (side + 1) % width; if (capIndex) indices.push(center, ring * width + side, ring * width + next); else indices.push(center, ring * width + next, ring * width + side); } });
    }
  }
  const now = args.now ?? Date.now(); const meshRevision = args.meshRevision ?? 1;
  const meshId = args.meshId ?? `curve-mesh:${args.definition.identity.curveId}:${settings.outputMode}:${hash(settings)}`;
  const identity: DerivedCurveMeshIdentity = { version: 1, meshId, meshRevision, sourceCurveId: args.definition.identity.curveId, sourceCurveRevision: args.definition.identity.curveRevision, sourceRepresentation: args.definition.representation, sourceFidelity: args.fidelity ?? (args.definition.representation === "polyline" ? "sampled" : "parametric"), sourceUnits: { ...args.definition.units }, variant: settings.outputMode, state: args.state ?? "live-current", createdAt: now, settings };
  const correspondence: CurveMeshCorrespondence = { correspondenceId: `${meshId}:map:${meshRevision}`, state: parameters.length === positions.length / 3 ? "complete" : parameters.length ? "partial" : "unavailable", sourceParameters: Float64Array.from(parameters), sourceSampleIndices: Uint32Array.from(samples), profileIndices: Uint32Array.from(profiles), confidence: new Float32Array(parameters.length).fill(1), explanation: "Every generated vertex retains its Curve parameter, longitudinal sample, and profile index." };
  return { kind: "derived-curve-mesh", identity, geometry: { primitive, positions: Float32Array.from(positions), indices: indices.length ? Uint32Array.from(indices) : null, normals: normals.length ? Float32Array.from(normals) : null }, correspondence, navigation: { openCurveSource: { curveId: identity.sourceCurveId, curveRevision: identity.sourceCurveRevision }, openMeshAnalysis: { meshId: identity.meshId, meshRevision: identity.meshRevision } }, vertexCount: positions.length / 3, faceCount: primitive === "triangles" ? indices.length / 3 : 0, warnings };
};

export const createCurveMeshRecord = (payload: DerivedCurveMeshPayload, label: string): DerivedCurveMeshRecord => ({ version: 1, identity: payload.identity, label, payload, history: [{ id: `${payload.identity.meshId}:created:1`, action: "created", at: payload.identity.createdAt, meshRevision: payload.identity.meshRevision, sourceRevision: payload.identity.sourceCurveRevision, detail: `${payload.identity.variant} using ${payload.identity.settings.framePolicy} frames` }] });
const transition = (record: DerivedCurveMeshRecord, state: "frozen-snapshot" | "detached", now: number): DerivedCurveMeshRecord => { const action = state === "detached" ? "detached" : "frozen"; const identity = { ...record.identity, meshId: `${record.identity.meshId}:${state}:${now}`, meshRevision: 1, state, createdAt: now, staleReason: undefined }; const payload = { ...record.payload, identity, correspondence: { ...record.payload.correspondence, correspondenceId: `${identity.meshId}:map:1` } }; return { ...record, identity, payload, history: [...record.history, { id: `${identity.meshId}:${action}`, action, at: now, meshRevision: 1, sourceRevision: identity.sourceCurveRevision, detail: `Derived from ${record.identity.meshId}` }] }; };
export const freezeCurveMeshRecord = (record: DerivedCurveMeshRecord, now = Date.now()) => transition(record, "frozen-snapshot", now);
export const detachCurveMeshRecord = (record: DerivedCurveMeshRecord, now = Date.now()) => transition(record, "detached", now);
export const markCurveMeshStale = (record: DerivedCurveMeshRecord, definition: CanonicalCurveDefinition, settings: CurveMeshSettings, now = Date.now()): DerivedCurveMeshRecord => {
  if (record.identity.state !== "live-current") return record; const sourceChanged = record.identity.sourceCurveRevision !== definition.identity.curveRevision; const settingsChanged = JSON.stringify(record.identity.settings) !== JSON.stringify(settings); if (!sourceChanged && !settingsChanged) return record;
  const staleReason = sourceChanged ? `Source changed from Curve revision ${record.identity.sourceCurveRevision} to ${definition.identity.curveRevision}.` : "CurveMesh generation settings changed."; const identity = { ...record.identity, state: "stale" as const, staleReason }; const payload = { ...record.payload, identity };
  return { ...record, identity, payload, history: [...record.history, { id: `${identity.meshId}:stale:${now}`, action: "marked-stale", at: now, meshRevision: identity.meshRevision, sourceRevision: definition.identity.curveRevision, detail: staleReason }] };
};
export const regenerateCurveMeshRecord = (record: DerivedCurveMeshRecord, definition: CanonicalCurveDefinition, curve: AnyCurve, settings: CurveMeshSettings, now = Date.now()): DerivedCurveMeshRecord => {
  const payload = createDerivedCurveMesh({ definition, curve, settings, meshId: record.identity.meshId, meshRevision: record.identity.meshRevision + 1, now }); const next = createCurveMeshRecord(payload, record.label); next.history = [...record.history, { ...next.history[0], action: "regenerated", id: `${payload.identity.meshId}:regenerated:${payload.identity.meshRevision}` }]; return next;
};

export type CurveMeshSelectionMapping = { state: "complete" | "partial" | "unavailable"; curveParameters: Float64Array; meshVertexIndices: Uint32Array; explanation: string };
export const mapCurveSelectionToMesh = (correspondence: CurveMeshCorrespondence, parameters: ArrayLike<number>, tolerance = 1e-5): CurveMeshSelectionMapping => { const vertices: number[] = []; const mapped: number[] = []; for (let targetIndex = 0; targetIndex < parameters.length; targetIndex += 1) { const target = Number(parameters[targetIndex]); let best = -1; let error = Infinity; correspondence.sourceParameters.forEach((parameter, vertex) => { const next = Math.abs(parameter - target); if (next < error) { best = vertex; error = next; } }); if (best >= 0 && error <= tolerance) { vertices.push(best); mapped.push(correspondence.sourceParameters[best]); } } return { state: vertices.length === parameters.length ? "complete" : vertices.length ? "partial" : "unavailable", curveParameters: Float64Array.from(mapped), meshVertexIndices: Uint32Array.from(vertices), explanation: vertices.length ? "Mapped to generated vertices through retained Curve parameters." : "No generated vertex lies within the parameter tolerance." }; };
export const mapMeshSelectionToCurve = (correspondence: CurveMeshCorrespondence, vertices: ArrayLike<number>): CurveMeshSelectionMapping => { const mapped: number[] = []; const valid: number[] = []; for (let index = 0; index < vertices.length; index += 1) { const vertex = Number(vertices[index]); const parameter = correspondence.sourceParameters[vertex]; if (parameter == null) continue; valid.push(vertex); mapped.push(parameter); } return { state: valid.length === vertices.length ? "complete" : valid.length ? "partial" : "unavailable", curveParameters: Float64Array.from(mapped), meshVertexIndices: Uint32Array.from(valid), explanation: valid.length ? "Mapped through retained Curve parameters." : "Selected mesh vertices have no Curve correspondence." }; };

export const curveMeshToSurfaceMesh = (record: DerivedCurveMeshRecord, role: "live" | "snapshot" | "detached"): SurfaceMeshData => ({ label: record.label, positions: record.payload.geometry.positions, indices: record.payload.geometry.primitive === "triangles" ? record.payload.geometry.indices : null, normals: record.payload.geometry.normals, source: { kind: "derivedCurve", role, state: record.identity.state, meshId: record.identity.meshId, meshRevision: record.identity.meshRevision, sourceCurveId: record.identity.sourceCurveId, sourceCurveRevision: record.identity.sourceCurveRevision, sourceRepresentation: record.identity.sourceRepresentation, sourceFidelity: record.identity.sourceFidelity, sourceUnits: record.identity.sourceUnits, variant: record.identity.variant, framePolicy: record.identity.settings.framePolicy, generationSettings: { longitudinalResolution: record.identity.settings.longitudinalResolution, radialResolution: record.identity.settings.radialResolution, tubeRadius: record.identity.settings.tubeRadius, caps: record.identity.settings.caps, twist: record.identity.settings.twist, ribbonWidth: record.identity.settings.ribbonWidth, ribbonOrientation: record.identity.settings.ribbonOrientation, seamPolicy: record.identity.settings.seamPolicy, boundaryPolicy: record.identity.settings.boundaryPolicy }, correspondenceId: record.payload.correspondence.correspondenceId, createdAt: record.identity.createdAt } });

export type MeshCurveExtractionKind = "boundary-loops" | "feature-edge-chains" | "selected-edge-chain" | "cross-section" | "polylines";
export type ExtractedMeshCurve = { id: string; kind: MeshCurveExtractionKind; branch: number; points: V3[]; sourceMeshLabel: string; sourceVertexIndices: Uint32Array; sourceFaceIndices: Uint32Array; fidelity: "polyline-approximation"; warnings: string[] };
type Edge = readonly [number, number];
const pointAt = (mesh: SurfaceMeshData, index: number): V3 => ({ x: mesh.positions[index * 3], y: mesh.positions[index * 3 + 1], z: mesh.positions[index * 3 + 2] });
const chainEdges = (edges: readonly Edge[]): Array<{ vertices: number[] }> => { const remaining = edges.map((edge) => [edge[0], edge[1]] as [number, number]); const chains: Array<{ vertices: number[] }> = []; while (remaining.length) { const edge = remaining.shift()!; const vertices = [edge[0], edge[1]]; let extended = true; while (extended) { extended = false; const tail = vertices.at(-1)!; const index = remaining.findIndex(([a, b]) => a === tail || b === tail); if (index >= 0) { const [a, b] = remaining.splice(index, 1)[0]; vertices.push(a === tail ? b : a); extended = true; } } chains.push({ vertices }); } return chains; };
export const extractMeshCurves = (args: { mesh: SurfaceMeshData; kind: MeshCurveExtractionKind; selectedEdges?: readonly Edge[]; featureEdges?: readonly Edge[]; featureAngleRadians?: number; polylines?: ReadonlyArray<ReadonlyArray<V3>>; crossSection?: { origin?: V3; normal: V3; tolerance?: number } }): ExtractedMeshCurve[] => {
  if (args.kind === "polylines") {
    const sourcePolylines = args.polylines ?? (args.mesh.source.kind === "derivedCurve" && args.mesh.source.variant === "polyline"
      ? [Array.from({ length: args.mesh.positions.length / 3 }, (_, index) => pointAt(args.mesh, index))]
      : []);
    return sourcePolylines.filter((line) => line.length >= 2).map((points, branch) => ({ id: `${args.mesh.label}:polyline:${branch}`, kind: args.kind, branch, points: points.map((point) => ({ ...point })), sourceMeshLabel: args.mesh.label, sourceVertexIndices: new Uint32Array(), sourceFaceIndices: new Uint32Array(), fidelity: "polyline-approximation", warnings: ["Source polyline has no continuous evaluator."] }));
  }
  if (args.kind === "cross-section") {
    if (!args.mesh.indices || !args.crossSection) return [];
    const origin = args.crossSection.origin ?? { x: 0, y: 0, z: 0 };
    const planeNormal = norm(args.crossSection.normal);
    if (Math.hypot(planeNormal.x, planeNormal.y, planeNormal.z) <= EPS) throw new Error("Cross-section plane normal must be non-zero.");
    const tolerance = Math.max(EPS, args.crossSection.tolerance ?? 1e-7);
    const sectionPoints: V3[] = [];
    const sectionEdges: Edge[] = [];
    const edgeFaces: number[] = [];
    const findOrAddPoint = (point: V3) => {
      const found = sectionPoints.findIndex((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y, candidate.z - point.z) <= tolerance);
      if (found >= 0) return found;
      sectionPoints.push(point);
      return sectionPoints.length - 1;
    };
    for (let face = 0; face < args.mesh.indices.length / 3; face += 1) {
      const vertices = [0, 1, 2].map((offset) => pointAt(args.mesh, args.mesh.indices![face * 3 + offset]));
      const distances = vertices.map((point) => dot(sub(point, origin), planeNormal));
      const hits: V3[] = [];
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
        const da = distances[a]; const db = distances[b];
        if (Math.abs(da) <= tolerance) hits.push(vertices[a]);
        if ((da < -tolerance && db > tolerance) || (da > tolerance && db < -tolerance)) {
          const u = da / (da - db);
          hits.push(add(vertices[a], scale(sub(vertices[b], vertices[a]), u)));
        }
      }
      const unique = hits.filter((point, index) => hits.findIndex((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y, candidate.z - point.z) <= tolerance) === index);
      if (unique.length === 2) { sectionEdges.push([findOrAddPoint(unique[0]), findOrAddPoint(unique[1])]); edgeFaces.push(face); }
    }
    return chainEdges(sectionEdges).filter((chain) => chain.vertices.length >= 2).map((chain, branch) => ({
      id: `${args.mesh.label}:cross-section:${branch}`, kind: args.kind, branch,
      points: chain.vertices.map((vertex) => sectionPoints[vertex]), sourceMeshLabel: args.mesh.label,
      sourceVertexIndices: new Uint32Array(), sourceFaceIndices: Uint32Array.from(edgeFaces), fidelity: "polyline-approximation",
      warnings: ["Cross-section points are linearly interpolated on Mesh triangle edges."],
    }));
  }
  let edges: Edge[] = args.kind === "selected-edge-chain" ? [...(args.selectedEdges ?? [])] : args.kind === "feature-edge-chains" ? [...(args.featureEdges ?? [])] : [];
  if (args.kind === "feature-edge-chains" && !args.featureEdges && args.mesh.indices) {
    const featureAngle = Math.max(0, Math.min(Math.PI, args.featureAngleRadians ?? Math.PI / 6));
    const candidates = new Map<string, { edge: Edge; normals: V3[] }>();
    for (let face = 0; face < args.mesh.indices.length / 3; face += 1) {
      const triangle = [args.mesh.indices[face * 3], args.mesh.indices[face * 3 + 1], args.mesh.indices[face * 3 + 2]];
      const normal = norm(cross(sub(pointAt(args.mesh, triangle[1]), pointAt(args.mesh, triangle[0])), sub(pointAt(args.mesh, triangle[2]), pointAt(args.mesh, triangle[0]))));
      for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]] as Edge[]) {
        const edge: Edge = a < b ? [a, b] : [b, a]; const key = `${edge[0]}:${edge[1]}`;
        const entry = candidates.get(key) ?? { edge, normals: [] }; entry.normals.push(normal); candidates.set(key, entry);
      }
    }
    edges = [...candidates.values()].filter((entry) => entry.normals.length === 1 || (entry.normals.length === 2 && dot(entry.normals[0], entry.normals[1]) <= Math.cos(featureAngle))).map((entry) => entry.edge);
  }
  if (args.kind === "boundary-loops") {
    if (!args.mesh.indices) return [];
    const counts = new Map<string, { edge: Edge; count: number }>();
    for (let index = 0; index < args.mesh.indices.length; index += 3) { const tri = [args.mesh.indices[index], args.mesh.indices[index + 1], args.mesh.indices[index + 2]]; for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]] as Edge[]) { const edge: Edge = a < b ? [a, b] : [b, a]; const key = `${edge[0]}:${edge[1]}`; const current = counts.get(key); counts.set(key, { edge, count: (current?.count ?? 0) + 1 }); } }
    edges = [...counts.values()].filter((entry) => entry.count === 1).map((entry) => entry.edge);
  }
  return chainEdges(edges).filter((chain) => chain.vertices.length >= 2).map((chain, branch) => ({ id: `${args.mesh.label}:${args.kind}:${branch}`, kind: args.kind, branch, points: chain.vertices.map((vertex) => pointAt(args.mesh, vertex)), sourceMeshLabel: args.mesh.label, sourceVertexIndices: Uint32Array.from(chain.vertices), sourceFaceIndices: new Uint32Array(), fidelity: "polyline-approximation", warnings: ["Extracted Mesh topology is represented as an ordered polyline."] }));
};

export type FittedMeshSpline = { definition: CanonicalSplineDefinition; curve: AnyCurve; tolerance: number; residuals: Float64Array; maximumResidual: number; accepted: boolean; source: ExtractedMeshCurve };
export const fitExtractedMeshCurve = (source: ExtractedMeshCurve, options: { tolerance: number; degree?: number }): FittedMeshSpline => {
  if (source.points.length < 2) throw new Error("Spline fitting requires at least two extracted points.");
  const degree = Math.max(1, Math.min(options.degree ?? 1, source.points.length - 1));
  const definition = createSplineDefinition({ id: `${source.id}:spline-fit`, name: `${source.sourceMeshLabel} fitted spline`, kind: "b-spline", dimension: 3, degree, controlPoints: source.points });
  const curve = buildSplineCurve(definition); const residuals = Float64Array.from(source.points.map((point) => closestPointOnCurve(curve, point, 512).distance ?? Infinity)); let maximumResidual = 0; residuals.forEach((value) => { maximumResidual = Math.max(maximumResidual, value); });
  return { definition, curve, tolerance: options.tolerance, residuals, maximumResidual, accepted: maximumResidual <= options.tolerance, source };
};
