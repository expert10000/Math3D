import type { SurfaceMeshData, SurfaceMeshSource } from "./surfaceMesh";

export type MeshAnalysisResultKind =
  | "curvature"
  | "quality"
  | "diagnostics"
  | "geodesic"
  | "normals"
  | "principal-directions"
  | "field-calculus"
  | "surface-features"
  | "ridges-valleys"
  | (string & {});

export type MeshAnalysisResultState = "ready" | "running" | "deferred" | "stale" | "error";

export type MeshAnalysisParameterValue =
  | number
  | string
  | boolean
  | null
  | readonly MeshAnalysisParameterValue[]
  | { readonly [key: string]: MeshAnalysisParameterValue };

export type MeshAnalysisParameters = Readonly<Record<string, MeshAnalysisParameterValue>>;

export type MeshDiagnosticState = "Healthy" | "Warning" | "Invalid" | "Unverified";

export type MeshAnalysisResultDependency = {
  kind: MeshAnalysisResultKind;
  variant?: string;
  state: MeshAnalysisResultState;
  key?: string;
  resultVersion?: number;
};

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
  state: MeshDiagnosticState;
  cleanMesh: boolean;
  sphereSeamWarning: boolean;
};

type MeshDiagnosticStateInput = Pick<
  MeshDiagnosticsAnalysisPayload,
  | "trianglesValid"
  | "invalidFaceCount"
  | "degenerateTriangleCount"
  | "boundaryEdgeCount"
  | "nonManifoldEdgeCount"
  | "selfIntersectionPairs"
  | "duplicateVertexCount"
  | "watertight"
>;

export const deriveMeshDiagnosticState = (diagnostics: MeshDiagnosticStateInput): MeshDiagnosticState => {
  if (
    !diagnostics.trianglesValid ||
    diagnostics.invalidFaceCount > 0 ||
    diagnostics.degenerateTriangleCount > 0 ||
    diagnostics.boundaryEdgeCount > 0 ||
    diagnostics.nonManifoldEdgeCount > 0 ||
    diagnostics.watertight === false
  ) {
    return "Invalid";
  }
  if (diagnostics.selfIntersectionPairs > 0 || diagnostics.duplicateVertexCount > 0) return "Warning";
  if (diagnostics.watertight === true) return "Healthy";
  return "Unverified";
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
  parameters: MeshAnalysisParameters;
  payload: TPayload | null;
  error: string | null;
  progress: number | null;
  dependencies: MeshAnalysisResultDependency[];
  parameterHash: string;
  resultVersion: number;
  computeTimeMs: number | null;
};

export type MeshAnalysisResultStore = {
  version: 2;
  entries: Record<string, MeshAnalysisResult>;
};

type UpsertMeshAnalysisResultOptions<TPayload> = {
  kind: MeshAnalysisResultKind;
  mesh: MeshAnalysisMeshIdentity;
  variant?: string;
  state?: MeshAnalysisResultState;
  parameters?: MeshAnalysisParameters;
  payload?: TPayload | null;
  error?: string | null;
  progress?: number | null;
  dependencies?: MeshAnalysisResultDependency[];
  computeTimeMs?: number | null;
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
  const numberBits = new DataView(new ArrayBuffer(8));
  let hash = 2166136261;
  for (let index = 0; index < length; index += 1) {
    const value = Number(values[index] ?? 0);
    numberBits.setFloat64(0, value, true);
    hash ^= numberBits.getUint32(0, true);
    hash = Math.imul(hash, 16777619);
    hash ^= numberBits.getUint32(4, true);
    hash = Math.imul(hash, 16777619);
  }
  return `full-${(hash >>> 0).toString(36)}`;
};

const stableParameterValue = (value: unknown): unknown => {
  if (typeof value === "number") {
    if (Number.isNaN(value)) return { $number: "NaN" };
    if (value === Number.POSITIVE_INFINITY) return { $number: "+Infinity" };
    if (value === Number.NEGATIVE_INFINITY) return { $number: "-Infinity" };
    if (Object.is(value, -0)) return { $number: "-0" };
  }
  if (Array.isArray(value)) return value.map(stableParameterValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableParameterValue(entry)])
    );
  }
  return value;
};

export const meshAnalysisParameterHash = (
  parameters: MeshAnalysisParameters
): string => JSON.stringify(stableParameterValue(parameters));

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

export const createMeshAnalysisResultStore = (): MeshAnalysisResultStore => ({ version: 2, entries: {} });

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

export const isMeshAnalysisResultCurrent = (
  store: MeshAnalysisResultStore,
  result: MeshAnalysisResult | null | undefined
): boolean => {
  if (!result || result.state !== "ready") return false;
  return result.dependencies.every((dependency) => {
    const key = dependency.key ?? dependencyKey(result.mesh, dependency);
    const current = store.entries[key];
    return !!current &&
      current.state === "ready" &&
      (dependency.resultVersion == null || current.resultVersion === dependency.resultVersion);
  });
};

export const getMeshAnalysisResultForParameters = <TPayload = unknown>(
  store: MeshAnalysisResultStore,
  mesh: MeshAnalysisMeshIdentity | null | undefined,
  kind: MeshAnalysisResultKind,
  parameters: MeshAnalysisParameters,
  variant = "default"
): MeshAnalysisResult<TPayload> | null => {
  const result = getMeshAnalysisResult<TPayload>(store, mesh, kind, variant);
  if (
    !result ||
    result.parameterHash !== meshAnalysisParameterHash(parameters) ||
    !isMeshAnalysisResultCurrent(store, result)
  ) return null;
  return result;
};

const dependencyKey = (
  mesh: MeshAnalysisMeshIdentity,
  dependency: Pick<MeshAnalysisResultDependency, "kind" | "variant">
): string => meshAnalysisResultKey(mesh, dependency.kind, dependency.variant ?? "default");

const invalidateDependents = (
  entries: Record<string, MeshAnalysisResult>,
  changedKey: string,
  now: number
): void => {
  const pending = [changedKey];
  const visited = new Set<string>();
  while (pending.length) {
    const dependencyResultKey = pending.shift()!;
    if (visited.has(dependencyResultKey)) continue;
    visited.add(dependencyResultKey);
    for (const [candidateKey, candidate] of Object.entries(entries)) {
      if (candidateKey === changedKey) continue;
      const dependsOnChangedResult = candidate.dependencies.some((dependency) =>
        dependency.key
          ? dependency.key === dependencyResultKey
          : dependencyKey(candidate.mesh, dependency) === dependencyResultKey
      );
      if (!dependsOnChangedResult) continue;
      if (candidate.state === "stale") {
        pending.push(candidateKey);
        continue;
      }
      entries[candidateKey] = {
        ...candidate,
        state: "stale",
        updatedAt: now,
        progress: null,
        dependencies: candidate.dependencies.map((dependency) =>
          (dependency.key ?? dependencyKey(candidate.mesh, dependency)) === dependencyResultKey
            ? { ...dependency, state: "stale" }
            : dependency
        ),
      };
      pending.push(candidateKey);
    }
  }
};

export const invalidateMeshAnalysisResult = (
  store: MeshAnalysisResultStore,
  mesh: MeshAnalysisMeshIdentity,
  kind: MeshAnalysisResultKind,
  variant = "default",
  now = Date.now()
): MeshAnalysisResultStore => {
  const key = meshAnalysisResultKey(mesh, kind, variant);
  const current = store.entries[key];
  if (!current) return store;
  const entries = {
    ...store.entries,
    [key]: { ...current, state: "stale" as const, updatedAt: now, progress: null },
  };
  invalidateDependents(entries, key, now);
  return { version: 2, entries };
};

export const upsertMeshAnalysisResult = <TPayload>(
  store: MeshAnalysisResultStore,
  options: UpsertMeshAnalysisResultOptions<TPayload>
): MeshAnalysisResultStore => {
  const variant = options.variant ?? "default";
  const key = meshAnalysisResultKey(options.mesh, options.kind, variant);
  const previous = store.entries[key] as MeshAnalysisResult<TPayload> | undefined;
  const now = options.now ?? Date.now();
  const parameters = options.parameters ?? previous?.parameters ?? {};
  const parameterHash = meshAnalysisParameterHash(parameters);
  const resultVersion = (previous?.resultVersion ?? 0) + 1;
  const dependencies = (options.dependencies ?? previous?.dependencies ?? []).map((dependency) => {
    const key = dependency.key ?? dependencyKey(options.mesh, dependency);
    const current = store.entries[key];
    return {
      ...dependency,
      variant: dependency.variant ?? "default",
      key,
      state: current?.state ?? dependency.state,
      resultVersion: current?.resultVersion ?? dependency.resultVersion,
    };
  });
  const nextEntry: MeshAnalysisResult<TPayload> = {
    kind: options.kind,
    variant,
    state: options.state ?? "ready",
    mesh: options.mesh,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    parameters,
    payload: options.payload !== undefined ? options.payload : previous?.payload ?? null,
    error: options.error !== undefined ? options.error : previous?.error ?? null,
    progress:
      options.progress !== undefined
        ? options.progress == null
          ? null
          : Math.min(1, Math.max(0, options.progress))
        : previous?.progress ?? (options.state === "ready" || options.state == null ? 1 : null),
    dependencies,
    parameterHash,
    resultVersion,
    computeTimeMs:
      options.computeTimeMs !== undefined ? options.computeTimeMs : previous?.computeTimeMs ?? null,
  };
  const entries = { ...store.entries, [key]: nextEntry };
  for (const [entryKey, entry] of Object.entries(entries)) {
    if (entryKey === key || entry.mesh.meshId !== options.mesh.meshId || entry.mesh.revision === options.mesh.revision) continue;
    if (entry.state !== "stale") entries[entryKey] = { ...entry, state: "stale", updatedAt: now, progress: null };
  }
  invalidateDependents(entries, key, now);
  entries[key] = nextEntry;
  const orderedKeys = Object.entries(entries)
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
    .map(([entryKey]) => entryKey);
  if (orderedKeys.length > MAX_STORED_RESULTS) {
    for (const staleKey of orderedKeys.slice(MAX_STORED_RESULTS)) delete entries[staleKey];
  }
  return { version: 2, entries };
};

export const meshAnalysisResultKindsForMesh = (
  store: MeshAnalysisResultStore,
  mesh: MeshAnalysisMeshIdentity | null | undefined
): MeshAnalysisResultKind[] => {
  if (!mesh) return [];
  const kinds = new Set<MeshAnalysisResultKind>();
  for (const entry of Object.values(store.entries)) {
    if (entry.mesh.key === mesh.key && isMeshAnalysisResultCurrent(store, entry)) kinds.add(entry.kind);
  }
  return [...kinds].sort();
};
