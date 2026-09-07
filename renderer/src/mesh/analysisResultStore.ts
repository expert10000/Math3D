import type { SurfaceMeshData, SurfaceMeshSource } from "./surfaceMesh";

export type MeshAnalysisResultKind = "curvature" | "quality" | "diagnostics" | "geodesic";

export type MeshAnalysisResultState = "ready" | "running" | "error";

export type MeshCurvatureAnalysisPayload = {
  K: Float32Array;
  H: Float32Array;
  k1: Float32Array;
  k2: Float32Array;
};

export type MeshDiagnosticsAnalysisPayload = {
  trianglesValid: boolean;
  invalidFaceCount: number;
  degenerateTriangleCount: number;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  selfIntersectionPairs: number;
  duplicateVertexCount: number;
  duplicateVertexGroups: number[][];
  eulerCharacteristic: number | null;
  watertight: boolean | null;
  boundaryLoopCount: number;
  weldTolerance: number;
  cleanMesh: boolean;
  sphereSeamWarning: boolean;
};

export type MeshAnalysisMeshIdentity = {
  meshId: string;
  revision: string;
  key: string;
  label: string;
  sourceLabel: string;
  vertexCount: number;
  faceCount: number;
};

export type MeshAnalysisResult<TPayload = unknown> = {
  kind: MeshAnalysisResultKind;
  variant: string;
  state: MeshAnalysisResultState;
  mesh: MeshAnalysisMeshIdentity;
  createdAt: number;
  updatedAt: number;
  parameters: Record<string, number | string | boolean | null>;
  payload: TPayload | null;
  error: string | null;
};

export type MeshAnalysisResultStore = {
  version: 1;
  entries: Record<string, MeshAnalysisResult>;
};

type UpsertMeshAnalysisResultOptions<TPayload> = {
  kind: MeshAnalysisResultKind;
  mesh: MeshAnalysisMeshIdentity;
  variant?: string;
  state?: MeshAnalysisResultState;
  parameters?: Record<string, number | string | boolean | null>;
  payload?: TPayload | null;
  error?: string | null;
  now?: number;
};

const MAX_STORED_RESULTS = 24;

const cleanKeyPart = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]+/g, "_")
    .slice(0, 96);

const sourceIdentity = (source: SurfaceMeshSource): string => {
  switch (source.kind) {
    case "import":
      return `import:${cleanKeyPart(source.filename)}`;
    case "geometryObject":
      return `geometry:${cleanKeyPart(
        source.objectId ??
          source.objectName ??
          source.objects?.map((entry) => entry.objectId ?? entry.objectName).join(",")
      )}`;
    case "polyhedronPreset":
      return `preset:${cleanKeyPart(source.id ?? source.label)}`;
    case "detachedMesh":
      return `detached:${cleanKeyPart(source.fromLabel ?? source.fromKind)}`;
    default:
      return source.kind;
  }
};

const hashNumbers = (values: ArrayLike<number> | null | undefined): string => {
  if (!values?.length) return "0";
  const length = values.length;
  const sampleCount = length <= 262_144 ? length : Math.min(4_096, length);
  const numberBits = new DataView(new ArrayBuffer(8));
  let hash = 2166136261;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const index = Math.min(length - 1, Math.floor((sample * (length - 1)) / Math.max(1, sampleCount - 1)));
    const value = Number(values[index] ?? 0);
    numberBits.setFloat64(0, Number.isFinite(value) ? value : 0, true);
    hash ^= numberBits.getUint32(0, true);
    hash = Math.imul(hash, 16777619);
    hash ^= numberBits.getUint32(4, true);
    hash = Math.imul(hash, 16777619);
  }
  const precision = sampleCount === length ? "full" : "sampled";
  return `${precision}-${(hash >>> 0).toString(36)}`;
};

export const createMeshAnalysisMeshIdentity = (mesh: SurfaceMeshData): MeshAnalysisMeshIdentity => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const faceCount = mesh.indices ? Math.floor(mesh.indices.length / 3) : Math.floor(vertexCount / 3);
  const sourceLabel = sourceIdentity(mesh.source);
  const meshId = `${sourceLabel}:${cleanKeyPart(mesh.label) || "mesh"}`;
  const revision = [
    `v${vertexCount}`,
    `f${faceCount}`,
    `p${hashNumbers(mesh.positions)}`,
    `i${hashNumbers(mesh.indices)}`,
  ].join(":");
  return {
    meshId,
    revision,
    key: `${meshId}@${revision}`,
    label: mesh.label,
    sourceLabel,
    vertexCount,
    faceCount,
  };
};

export const createMeshAnalysisResultStore = (): MeshAnalysisResultStore => ({ version: 1, entries: {} });

export const meshAnalysisResultKey = (
  mesh: MeshAnalysisMeshIdentity,
  kind: MeshAnalysisResultKind,
  variant = "default"
): string => `${mesh.key}:${kind}:${cleanKeyPart(variant) || "default"}`;

export const getMeshAnalysisResult = <TPayload = unknown>(
  store: MeshAnalysisResultStore,
  mesh: MeshAnalysisMeshIdentity | null | undefined,
  kind: MeshAnalysisResultKind,
  variant = "default"
): MeshAnalysisResult<TPayload> | null => {
  if (!mesh) return null;
  return (store.entries[meshAnalysisResultKey(mesh, kind, variant)] as MeshAnalysisResult<TPayload> | undefined) ?? null;
};

export const upsertMeshAnalysisResult = <TPayload>(
  store: MeshAnalysisResultStore,
  options: UpsertMeshAnalysisResultOptions<TPayload>
): MeshAnalysisResultStore => {
  const variant = options.variant ?? "default";
  const key = meshAnalysisResultKey(options.mesh, options.kind, variant);
  const previous = store.entries[key];
  const now = options.now ?? Date.now();
  const nextEntry: MeshAnalysisResult<TPayload> = {
    kind: options.kind,
    variant,
    state: options.state ?? "ready",
    mesh: options.mesh,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    parameters: options.parameters ?? previous?.parameters ?? {},
    payload: options.payload ?? null,
    error: options.error ?? null,
  };
  const entries = { ...store.entries, [key]: nextEntry };
  const orderedKeys = Object.entries(entries)
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
    .map(([entryKey]) => entryKey);
  if (orderedKeys.length > MAX_STORED_RESULTS) {
    for (const staleKey of orderedKeys.slice(MAX_STORED_RESULTS)) delete entries[staleKey];
  }
  return { version: 1, entries };
};

export const meshAnalysisResultKindsForMesh = (
  store: MeshAnalysisResultStore,
  mesh: MeshAnalysisMeshIdentity | null | undefined
): MeshAnalysisResultKind[] => {
  if (!mesh) return [];
  const kinds = new Set<MeshAnalysisResultKind>();
  for (const entry of Object.values(store.entries)) {
    if (entry.mesh.key === mesh.key && entry.state === "ready") kinds.add(entry.kind);
  }
  return [...kinds].sort();
};
