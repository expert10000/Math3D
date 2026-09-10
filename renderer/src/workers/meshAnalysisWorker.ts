/// <reference lib="webworker" />

import { computeMeshDifferentialGeometry } from "../mesh/meshDifferentialGeometry";
import { extractSurfaceFeatures } from "../mesh/surfaceFeatureExtraction";
import { extractRidgesAndValleys } from "../mesh/ridgeValleyExtraction";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import type {
  MeshAnalysisWorkerMessage,
  MeshAnalysisWorkerProgressMessage,
  MeshAnalysisWorkerRequest,
} from "./meshAnalysisWorkerTypes";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

const normalizeMesh = (request: MeshAnalysisWorkerRequest): SurfaceMeshData => ({
  label: "Analysis worker mesh",
  positions:
    request.mesh.positions instanceof Float32Array
      ? request.mesh.positions
      : new Float32Array(request.mesh.positions as ArrayLike<number>),
  indices:
    request.mesh.indices == null
      ? null
      : request.mesh.indices instanceof Uint32Array
        ? request.mesh.indices
        : new Uint32Array(request.mesh.indices as ArrayLike<number>),
  source: { kind: "detachedMesh", fromLabel: "analysis-worker" },
});

const postProgress = (
  request: MeshAnalysisWorkerRequest,
  phase: MeshAnalysisWorkerProgressMessage["phase"],
  progress: number
) => {
  ctx.postMessage({
    type: "progress",
    jobId: request.jobId,
    meshRevision: request.meshRevision,
    phase,
    progress,
  } satisfies MeshAnalysisWorkerMessage);
};

ctx.onmessage = (event: MessageEvent<MeshAnalysisWorkerRequest>) => {
  const request = event.data;
  if (!request || typeof request.jobId !== "string" || !request.jobId) return;
  const startedAt = now();
  try {
    postProgress(request, "running", 0.05);
    const mesh = normalizeMesh(request);
    if (request.type === "compute-differential") {
      const result = computeMeshDifferentialGeometry(mesh);
      if (!result) throw new Error("Differential geometry is unavailable for this mesh.");
      postProgress(request, "publishing", 0.95);
      ctx.postMessage({
        type: "differential-result",
        jobId: request.jobId,
        meshRevision: request.meshRevision,
        ok: true,
        result,
        computeTimeMs: Math.max(0, now() - startedAt),
      } satisfies MeshAnalysisWorkerMessage);
      return;
    }
    if (request.type === "compute-surface-features") {
      const result = extractSurfaceFeatures(mesh, request.differential, request.parameters);
      postProgress(request, "publishing", 0.95);
      ctx.postMessage({
        type: "surface-features-result",
        jobId: request.jobId,
        meshRevision: request.meshRevision,
        ok: true,
        result,
        computeTimeMs: Math.max(0, now() - startedAt),
      } satisfies MeshAnalysisWorkerMessage);
      return;
    }
    if (request.type === "compute-ridges-valleys") {
      const result = extractRidgesAndValleys(mesh, request.differential, request.parameters);
      postProgress(request, "publishing", 0.95);
      ctx.postMessage({
        type: "ridges-valleys-result",
        jobId: request.jobId,
        meshRevision: request.meshRevision,
        ok: true,
        result,
        computeTimeMs: Math.max(0, now() - startedAt),
      } satisfies MeshAnalysisWorkerMessage);
    }
  } catch (error: any) {
    ctx.postMessage({
      type: "error",
      jobId: request.jobId,
      meshRevision: request.meshRevision,
      ok: false,
      error: String(error?.message ?? error ?? "Mesh analysis worker failed."),
    } satisfies MeshAnalysisWorkerMessage);
  }
};
