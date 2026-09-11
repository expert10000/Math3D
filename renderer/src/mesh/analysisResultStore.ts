import type {
  AnalysisComputationRecord,
  AnalysisParameters,
  AnalysisResult,
  AnalysisResultDependency,
  AnalysisResultState,
  AnalysisResultStore,
} from "../analysis/contracts";
import {
  analysisParameterHash,
  analysisResultKey,
  analysisResultKindsForIdentity,
  cleanAnalysisKeyPart,
  createAnalysisResultStore,
  getAnalysisResult,
  getAnalysisResultForParameters,
  invalidateAnalysisResult,
  isAnalysisResultCurrent,
  upsertAnalysisResult,
} from "../analysis/resultStore";
import type { SurfaceMeshData, SurfaceMeshSource } from "./surfaceMesh";
import { deriveMeshHealthState, type MeshHealthResult, type MeshHealthState } from "./meshHealth";
import type { MeshDifferentialGeometryResult } from "./meshDifferentialGeometry";

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

export type MeshAnalysisResultState = AnalysisResultState;
export type MeshAnalysisParameters = AnalysisParameters;
export type MeshDiagnosticState = MeshHealthState;
export type MeshAnalysisResultDependency = AnalysisResultDependency<MeshAnalysisResultKind>;
export type MeshCurvatureAnalysisPayload = MeshDifferentialGeometryResult;
export type MeshDiagnosticsAnalysisPayload = MeshHealthResult;

export const deriveMeshDiagnosticState = deriveMeshHealthState;

export type MeshAnalysisMeshIdentity = {
  meshId: string;
  revision: string;
  key: string;
  label: string;
  sourceLabel: string;
  vertexCount: number;
  faceCount: number;
};

export type MeshAnalysisResult<TPayload = unknown> =
  AnalysisResult<TPayload, MeshAnalysisResultKind, MeshAnalysisMeshIdentity>;
export type MeshAnalysisComputationRecord =
  AnalysisComputationRecord<MeshAnalysisResultKind, MeshAnalysisMeshIdentity>;
export type MeshAnalysisResultStore =
  AnalysisResultStore<MeshAnalysisResultKind, MeshAnalysisMeshIdentity>;

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
  backend?: string;
  now?: number;
};

const sourceIdentity = (source: SurfaceMeshSource): string => {
  switch (source.kind) {
    case "import": return `import:${cleanAnalysisKeyPart(source.filename)}`;
    case "geometryObject":
      return `geometry:${cleanAnalysisKeyPart(source.objectId ?? source.objectName ?? source.objects?.map((entry) => entry.objectId ?? entry.objectName).join(","))}`;
    case "polyhedronPreset": return `preset:${cleanAnalysisKeyPart(source.id ?? source.label)}`;
    case "derivedSurface":
      return `surface:${cleanAnalysisKeyPart(source.sourceSurfaceId)}:r${source.sourceSurfaceRevision}:mesh:${cleanAnalysisKeyPart(source.meshId)}:r${source.meshRevision}:${source.role}`;
    case "detachedMesh": return `detached:${cleanAnalysisKeyPart(source.fromLabel ?? source.fromKind)}`;
    default: return source.kind;
  }
};

const hashNumbers = (values: ArrayLike<number> | null | undefined): string => {
  if (!values?.length) return "0";
  const numberBits = new DataView(new ArrayBuffer(8));
  let hash = 2166136261;
  for (let index = 0; index < values.length; index += 1) {
    numberBits.setFloat64(0, Number(values[index] ?? 0), true);
    hash ^= numberBits.getUint32(0, true);
    hash = Math.imul(hash, 16777619);
    hash ^= numberBits.getUint32(4, true);
    hash = Math.imul(hash, 16777619);
  }
  return `full-${(hash >>> 0).toString(36)}`;
};

const inferAnalysisBackend = (
  kind: MeshAnalysisResultKind,
  parameters: MeshAnalysisParameters,
  payload: unknown
): string => {
  if (kind === "diagnostics" && payload && typeof payload === "object") {
    const backend = (payload as { backend?: unknown }).backend;
    if (typeof backend === "string" && backend) {
      return backend === "cgal" ? "CGAL" : backend === "hybrid" ? "Math3D + CGAL" : "Math3D";
    }
  }
  if (kind === "geodesic") {
    if (parameters.method === "surface") return "CGAL";
    if (parameters.method === "heat") return "Python heat worker";
    return "Renderer CPU";
  }
  if (kind === "quality") return "Math3D quality worker";
  if (["curvature", "normals", "principal-directions", "surface-features", "ridges-valleys"].includes(kind)) {
    return "Mesh analysis worker";
  }
  return "Renderer CPU";
};

export const meshAnalysisParameterHash = analysisParameterHash;

export const createMeshAnalysisMeshIdentity = (mesh: SurfaceMeshData): MeshAnalysisMeshIdentity => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const faceCount = mesh.indices ? Math.floor(mesh.indices.length / 3) : Math.floor(vertexCount / 3);
  const sourceLabel = sourceIdentity(mesh.source);
  const meshId = `${sourceLabel}:${cleanAnalysisKeyPart(mesh.label) || "mesh"}`;
  const revision = `v${vertexCount}:f${faceCount}:p${hashNumbers(mesh.positions)}:i${hashNumbers(mesh.indices)}`;
  return { meshId, revision, key: `${meshId}@${revision}`, label: mesh.label, sourceLabel, vertexCount, faceCount };
};

export const createMeshAnalysisResultStore = (): MeshAnalysisResultStore =>
  createAnalysisResultStore<MeshAnalysisResultKind, MeshAnalysisMeshIdentity>();

export const meshAnalysisResultKey = (
  mesh: MeshAnalysisMeshIdentity,
  kind: MeshAnalysisResultKind,
  variant = "default"
): string => analysisResultKey(mesh, kind, variant);

export const getMeshAnalysisResult = <TPayload = unknown>(
  store: MeshAnalysisResultStore,
  mesh: MeshAnalysisMeshIdentity | null | undefined,
  kind: MeshAnalysisResultKind,
  variant = "default"
): MeshAnalysisResult<TPayload> | null =>
  getAnalysisResult<TPayload, MeshAnalysisResultKind, MeshAnalysisMeshIdentity>(store, mesh, kind, variant);

export const isMeshAnalysisResultCurrent = (
  store: MeshAnalysisResultStore,
  result: MeshAnalysisResult | null | undefined
): boolean => isAnalysisResultCurrent(store, result);

export const getMeshAnalysisResultForParameters = <TPayload = unknown>(
  store: MeshAnalysisResultStore,
  mesh: MeshAnalysisMeshIdentity | null | undefined,
  kind: MeshAnalysisResultKind,
  parameters: MeshAnalysisParameters,
  variant = "default"
): MeshAnalysisResult<TPayload> | null =>
  getAnalysisResultForParameters<TPayload, MeshAnalysisResultKind, MeshAnalysisMeshIdentity>(store, mesh, kind, parameters, variant);

export const invalidateMeshAnalysisResult = (
  store: MeshAnalysisResultStore,
  mesh: MeshAnalysisMeshIdentity,
  kind: MeshAnalysisResultKind,
  variant = "default",
  now = Date.now()
): MeshAnalysisResultStore => invalidateAnalysisResult(store, mesh, kind, variant, now);

export const upsertMeshAnalysisResult = <TPayload>(
  store: MeshAnalysisResultStore,
  options: UpsertMeshAnalysisResultOptions<TPayload>
): MeshAnalysisResultStore => upsertAnalysisResult(store, {
  ...options,
  identity: options.mesh,
  backend: options.backend ?? inferAnalysisBackend(options.kind, options.parameters ?? {}, options.payload),
}, {
  lineageKey: (identity) => identity.meshId,
  defaultBackend: "Renderer CPU",
  maxResults: 24,
  maxHistory: 96,
});

export const meshAnalysisResultKindsForMesh = (
  store: MeshAnalysisResultStore,
  mesh: MeshAnalysisMeshIdentity | null | undefined
): MeshAnalysisResultKind[] => analysisResultKindsForIdentity(store, mesh);
