import type {
  CanonicalSurfaceDefinition,
  DerivedSurfaceMeshCorrespondence,
  DerivedSurfaceMeshIdentity,
  DerivedSurfaceMeshState,
  SurfaceAnalysisMethod,
  SurfaceAnalysisPayload,
  SurfaceDerivedMeshPayload,
} from "./contracts";

export type DerivedSurfaceMeshHistoryEntry = {
  id: string;
  action: "created" | "regenerated" | "frozen" | "detached" | "marked-stale";
  at: number;
  meshRevision: number;
  sourceRevision: number;
  detail: string;
};

export type DerivedSurfaceMeshRecord = {
  version: 1;
  identity: DerivedSurfaceMeshIdentity;
  label: string;
  vertexCount: number;
  faceCount: number;
  correspondence: Pick<DerivedSurfaceMeshCorrespondence, "correspondenceId" | "kind" | "state" | "mappedVertexCount" | "vertexCount" | "meanConfidence" | "explanation">;
  warnings: readonly string[];
  history: readonly DerivedSurfaceMeshHistoryEntry[];
};

type Settings = Readonly<Record<string, number | string | boolean | null>>;
const stableValue = (value: unknown): unknown => Array.isArray(value)
  ? value.map(stableValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, stableValue(entry)]))
    : value;
const hash = (value: unknown) => {
  const text = JSON.stringify(stableValue(value)); let result = 2166136261;
  for (let index = 0; index < text.length; index += 1) result = Math.imul(result ^ text.charCodeAt(index), 16777619);
  return (result >>> 0).toString(36);
};
const mean = (values: ArrayLike<number> | undefined) => {
  if (!values?.length) return null;
  let sum = 0; let count = 0;
  for (let index = 0; index < values.length; index += 1) { const value = Number(values[index]); if (Number.isFinite(value)) { sum += value; count += 1; } }
  return count ? sum / count : null;
};

export const createDerivedSurfaceMeshCorrespondence = (args: {
  definition: CanonicalSurfaceDefinition;
  vertexCount: number;
  parameterCoordinates?: ArrayLike<number>;
  sourceSampleIndices?: ArrayLike<number>;
  residuals?: ArrayLike<number>;
  sourceCells?: ArrayLike<number>;
  confidence?: ArrayLike<number>;
}): DerivedSurfaceMeshCorrespondence => {
  const expectedParameters = args.vertexCount * 2;
  const hasParameters = args.parameterCoordinates?.length === expectedParameters && args.definition.representation !== "implicit";
  let parameterMappedCount = 0;
  if (hasParameters) {
    for (let vertex = 0; vertex < args.vertexCount; vertex += 1) {
      if (Number.isFinite(Number(args.parameterCoordinates![vertex * 2])) && Number.isFinite(Number(args.parameterCoordinates![vertex * 2 + 1]))) parameterMappedCount += 1;
    }
  }
  const implicitEvidence = args.definition.representation === "implicit" && (!!args.residuals?.length || !!args.sourceCells?.length || !!args.confidence?.length);
  const kind = hasParameters ? "parameter" : implicitEvidence ? "implicit-projection" : args.definition.representation === "implicit" ? "nearest-surface" : "unavailable";
  const finiteCount = (values: ArrayLike<number> | undefined, valid: (value: number) => boolean) => {
    let count = 0; if (!values) return count;
    for (let index = 0; index < values.length; index += 1) if (valid(Number(values[index]))) count += 1;
    return count;
  };
  const evidenceMappedCount = Math.max(
    finiteCount(args.residuals, Number.isFinite),
    finiteCount(args.sourceCells, (value) => Number.isInteger(value) && value >= 0),
    finiteCount(args.confidence, (value) => Number.isFinite(value) && value > 0),
    finiteCount(args.sourceSampleIndices, (value) => Number.isInteger(value) && value >= 0 && value !== 0xffffffff),
  );
  const mappedVertexCount = hasParameters
    ? parameterMappedCount
    : evidenceMappedCount;
  const state = mappedVertexCount >= args.vertexCount && args.vertexCount > 0 ? "complete" : mappedVertexCount > 0 ? "partial" : "unavailable";
  const correspondenceId = `${args.definition.identity.key}:correspondence:${hash({ kind, vertexCount: args.vertexCount, mappedVertexCount })}`;
  const explanation = kind === "parameter"
    ? "Each mapped vertex retains its source chart coordinate and sample reference."
    : kind === "implicit-projection"
      ? "Implicit correspondence retains available projection residual, source-cell or confidence evidence; no UV coordinates are invented."
      : kind === "nearest-surface"
        ? "The implicit tessellation has no global UV chart; nearest-surface evidence is currently unavailable and remains explicit."
        : "This tessellation does not expose a source-domain correspondence.";
  return {
    correspondenceId, kind, state,
    sourceSampleIndices: args.sourceSampleIndices ? Uint32Array.from(args.sourceSampleIndices) : undefined,
    parameterCoordinates: hasParameters ? Float64Array.from(args.parameterCoordinates!) : undefined,
    residuals: args.residuals ? Float32Array.from(args.residuals) : undefined,
    sourceCells: args.sourceCells ? Int32Array.from(args.sourceCells) : undefined,
    confidence: args.confidence ? Float32Array.from(args.confidence) : undefined,
    mappedVertexCount: Math.min(args.vertexCount, mappedVertexCount), vertexCount: args.vertexCount,
    meanConfidence: mean(args.confidence), explanation,
  };
};

export const createDerivedSurfaceMeshPayload = (args: {
  definition: CanonicalSurfaceDefinition;
  label: string;
  vertexCount: number;
  faceCount: number;
  method: string;
  settings: Settings;
  backend: { id: string; version?: string };
  state?: DerivedSurfaceMeshState;
  meshRevision?: number;
  createdAt?: number;
  meshId?: string;
  correspondence?: Omit<Parameters<typeof createDerivedSurfaceMeshCorrespondence>[0], "definition" | "vertexCount">;
  warnings?: readonly string[];
}): SurfaceDerivedMeshPayload => {
  const createdAt = args.createdAt ?? Date.now(); const state = args.state ?? "live-current";
  const variant = state === "robust-variant" ? args.backend.id : state;
  const meshId = args.meshId ?? `${args.definition.identity.key}:derived:${variant}:${hash({ method: args.method, settings: args.settings, backend: args.backend.id })}`;
  const identity: DerivedSurfaceMeshIdentity = {
    version: 1, meshId, meshRevision: args.meshRevision ?? 1, source: args.definition.identity,
    sourceRepresentation: args.definition.representation, tessellation: { method: args.method, settings: { ...args.settings } },
    backend: { ...args.backend }, createdAt, state,
  };
  const correspondence = createDerivedSurfaceMeshCorrespondence({ definition: args.definition, vertexCount: args.vertexCount, ...(args.correspondence ?? {}) });
  return {
    kind: "derived-mesh", identity, meshId, sourceSurfaceId: args.definition.identity.surfaceId,
    sourceRevision: args.definition.identity.surfaceRevision, live: state === "live-current", vertexCount: args.vertexCount,
    faceCount: args.faceCount, correspondenceId: correspondence.correspondenceId, correspondence,
    warnings: [...(args.warnings ?? []), ...(correspondence.state === "unavailable" ? [correspondence.explanation] : [])],
  };
};

export const compactDerivedSurfaceMesh = (payload: SurfaceDerivedMeshPayload, label: string, action: DerivedSurfaceMeshHistoryEntry["action"] = "created"): DerivedSurfaceMeshRecord => ({
  version: 1, identity: payload.identity, label, vertexCount: payload.vertexCount, faceCount: payload.faceCount,
  correspondence: {
    correspondenceId: payload.correspondence.correspondenceId, kind: payload.correspondence.kind, state: payload.correspondence.state,
    mappedVertexCount: payload.correspondence.mappedVertexCount, vertexCount: payload.correspondence.vertexCount,
    meanConfidence: payload.correspondence.meanConfidence, explanation: payload.correspondence.explanation,
  },
  warnings: [...payload.warnings],
  history: [{ id: `${payload.meshId}:${action}:${payload.identity.meshRevision}`, action, at: payload.identity.createdAt, meshRevision: payload.identity.meshRevision, sourceRevision: payload.sourceRevision, detail: `${payload.identity.tessellation.method} via ${payload.identity.backend.id}` }],
});

export const transitionDerivedSurfaceMeshRecord = (record: DerivedSurfaceMeshRecord, state: Exclude<DerivedSurfaceMeshState, "live-current" | "stale">, now = Date.now()): DerivedSurfaceMeshRecord => {
  const action = state === "frozen-snapshot" ? "frozen" : state === "detached" ? "detached" : "created";
  const identity = { ...record.identity, meshId: `${record.identity.meshId}:${state}:${now}`, meshRevision: 1, state, createdAt: now, staleReason: undefined };
  return { ...record, identity, label: `${record.label} (${state.replace("-", " ")})`, history: [...record.history, { id: `${identity.meshId}:${action}`, action, at: now, meshRevision: identity.meshRevision, sourceRevision: identity.source.surfaceRevision, detail: `Derived from ${record.identity.meshId}` }] };
};

export const markDerivedSurfaceMeshRecordStale = (record: DerivedSurfaceMeshRecord, current: CanonicalSurfaceDefinition, currentSettings: Settings, now = Date.now()): DerivedSurfaceMeshRecord => {
  if (record.identity.state !== "live-current") return record;
  const sourceChanged = record.identity.source.key !== current.identity.key;
  const settingsChanged = JSON.stringify(stableValue(record.identity.tessellation.settings)) !== JSON.stringify(stableValue(currentSettings));
  if (!sourceChanged && !settingsChanged) return record;
  const staleReason = sourceChanged ? `Source changed from revision ${record.identity.source.surfaceRevision} to ${current.identity.surfaceRevision}.` : "Tessellation settings changed.";
  return { ...record, identity: { ...record.identity, state: "stale", staleReason }, history: [...record.history, { id: `${record.identity.meshId}:stale:${now}`, action: "marked-stale", at: now, meshRevision: record.identity.meshRevision, sourceRevision: current.identity.surfaceRevision, detail: staleReason }] };
};

export const regenerateDerivedSurfaceMeshRecord = (record: DerivedSurfaceMeshRecord, payload: SurfaceDerivedMeshPayload, now = Date.now()): DerivedSurfaceMeshRecord => {
  const next = compactDerivedSurfaceMesh({ ...payload, identity: { ...payload.identity, meshId: record.identity.meshId, meshRevision: record.identity.meshRevision + 1, createdAt: now, state: "live-current", staleReason: undefined }, meshId: record.identity.meshId, live: true }, record.label, "regenerated");
  return { ...next, history: [...record.history, ...next.history] };
};

export type DerivedSelectionMapping = { state: "complete" | "partial" | "unavailable"; sourceIndices: Uint32Array; meshVertexIndices: Uint32Array; confidence: Float32Array; explanation: string };
export const mapSourceSelectionToDerivedMesh = (correspondence: DerivedSurfaceMeshCorrespondence, sourceIndices: ArrayLike<number>): DerivedSelectionMapping => {
  if (!correspondence.sourceSampleIndices?.length) return { state: "unavailable", sourceIndices: new Uint32Array(), meshVertexIndices: new Uint32Array(), confidence: new Float32Array(), explanation: correspondence.explanation };
  const wanted = new Set(Array.from(sourceIndices, Number)); const source: number[] = []; const mesh: number[] = []; const confidence: number[] = [];
  correspondence.sourceSampleIndices.forEach((value, vertex) => { if (value !== 0xffffffff && wanted.has(value)) { source.push(value); mesh.push(vertex); confidence.push(correspondence.confidence?.[vertex] ?? 1); } });
  return { state: mesh.length === wanted.size ? "complete" : mesh.length ? "partial" : "unavailable", sourceIndices: Uint32Array.from(source), meshVertexIndices: Uint32Array.from(mesh), confidence: Float32Array.from(confidence), explanation: mesh.length ? "Mapped through retained source sample references." : "No selected source samples have retained mesh correspondences." };
};
export const mapDerivedMeshSelectionToSource = (correspondence: DerivedSurfaceMeshCorrespondence, meshVertexIndices: ArrayLike<number>): DerivedSelectionMapping => {
  if (!correspondence.sourceSampleIndices?.length) return { state: "unavailable", sourceIndices: new Uint32Array(), meshVertexIndices: new Uint32Array(), confidence: new Float32Array(), explanation: correspondence.explanation };
  const source: number[] = []; const mesh: number[] = []; const confidence: number[] = [];
  for (let offset = 0; offset < meshVertexIndices.length; offset += 1) { const vertex = Number(meshVertexIndices[offset]); const value = correspondence.sourceSampleIndices[vertex]; if (value == null || value === 0xffffffff) continue; source.push(value); mesh.push(vertex); confidence.push(correspondence.confidence?.[vertex] ?? 1); }
  return { state: mesh.length === meshVertexIndices.length ? "complete" : mesh.length ? "partial" : "unavailable", sourceIndices: Uint32Array.from(source), meshVertexIndices: Uint32Array.from(mesh), confidence: Float32Array.from(confidence), explanation: mesh.length ? "Mapped through retained source sample references." : "Selected mesh vertices have no retained source mapping." };
};

export const createDerivedSurfaceMeshAnalysisPayload = (definition: CanonicalSurfaceDefinition, method: SurfaceAnalysisMethod, mesh: SurfaceDerivedMeshPayload): SurfaceAnalysisPayload => ({
  version: 1, surfaceId: definition.identity.surfaceId, surfaceRevision: definition.identity.surfaceRevision,
  representation: definition.representation, method: definition.representation === "mesh-backed" ? "mesh-approximation" : method,
  units: definition.units, orientation: definition.orientation, warnings: [...definition.warnings, ...mesh.warnings], data: mesh,
});
