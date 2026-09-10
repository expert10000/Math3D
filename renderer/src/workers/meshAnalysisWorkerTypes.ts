import type { MeshDifferentialGeometryResult } from "../mesh/meshDifferentialGeometry";
import type {
  SurfaceFeatureExtractionParameters,
  SurfaceFeatureExtractionResult,
} from "../mesh/surfaceFeatureExtraction";
import type {
  RidgeValleyExtractionParameters,
  RidgeValleyExtractionResult,
} from "../mesh/ridgeValleyExtraction";

export type MeshAnalysisWorkerMesh = {
  positions: Float32Array;
  indices: Uint32Array | null;
};

export type MeshAnalysisWorkerRequest =
  | {
      type: "compute-differential";
      jobId: string;
      meshRevision: string;
      mesh: MeshAnalysisWorkerMesh;
    }
  | {
      type: "compute-surface-features";
      jobId: string;
      meshRevision: string;
      mesh: MeshAnalysisWorkerMesh;
      differential: MeshDifferentialGeometryResult;
      parameters: SurfaceFeatureExtractionParameters;
    }
  | {
      type: "compute-ridges-valleys";
      jobId: string;
      meshRevision: string;
      mesh: MeshAnalysisWorkerMesh;
      differential: MeshDifferentialGeometryResult;
      parameters: RidgeValleyExtractionParameters;
    };

export type MeshAnalysisWorkerPhase = "queued" | "running" | "publishing";

export type MeshAnalysisWorkerProgressMessage = {
  type: "progress";
  jobId: string;
  meshRevision: string;
  phase: MeshAnalysisWorkerPhase;
  progress: number;
};

export type MeshAnalysisWorkerResultMessage =
  | {
      type: "differential-result";
      jobId: string;
      meshRevision: string;
      ok: true;
      result: MeshDifferentialGeometryResult;
      computeTimeMs: number;
    }
  | {
      type: "surface-features-result";
      jobId: string;
      meshRevision: string;
      ok: true;
      result: SurfaceFeatureExtractionResult;
      computeTimeMs: number;
    }
  | {
      type: "ridges-valleys-result";
      jobId: string;
      meshRevision: string;
      ok: true;
      result: RidgeValleyExtractionResult;
      computeTimeMs: number;
    }
  | {
      type: "error";
      jobId: string;
      meshRevision: string;
      ok: false;
      error: string;
    };

export type MeshAnalysisWorkerMessage =
  | MeshAnalysisWorkerProgressMessage
  | MeshAnalysisWorkerResultMessage;
