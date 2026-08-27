import type {
  CgalHealthResponse,
  CgalMeshRequest,
  CgalMeshResponse,
  CgalRepairMeshRequest,
  CgalRepairMeshResponse,
  CgalRemeshMeshRequest,
  CgalRemeshMeshResponse,
  CgalValidateMeshRequest,
  CgalValidateMeshResponse,
  CgalPingResponse,
  CgalStopResponse,
  CgalVersionResponse,
} from "@math3d/api-client";
import { meshBackend } from "./meshBackend";

export type { CgalMeshRequest, CgalMeshResponse };
export type { CgalValidateMeshRequest, CgalValidateMeshResponse };
export type { CgalRepairMeshRequest, CgalRepairMeshResponse };
export type { CgalRemeshMeshRequest, CgalRemeshMeshResponse };

export async function cgalHealth(): Promise<CgalHealthResponse> {
  return meshBackend.cgalHealth();
}

export async function cgalPing(): Promise<CgalPingResponse> {
  return meshBackend.cgalPing();
}

export async function cgalVersion(): Promise<CgalVersionResponse> {
  return meshBackend.cgalVersion();
}

export async function stopCgalWorker(): Promise<CgalStopResponse> {
  return meshBackend.stopCgalWorker();
}

export async function runCgalMesh(req: Omit<CgalMeshRequest, "jobId">): Promise<CgalMeshResponse> {
  return meshBackend.runCgalMesh(req);
}

export async function runCgalValidateMesh(req: Omit<CgalValidateMeshRequest, "jobId">): Promise<CgalValidateMeshResponse> {
  return meshBackend.runCgalValidateMesh(req);
}

export async function runCgalRepairMesh(req: Omit<CgalRepairMeshRequest, "jobId">): Promise<CgalRepairMeshResponse> {
  return meshBackend.runCgalRepairMesh(req);
}

export async function runCgalRemeshMesh(req: Omit<CgalRemeshMeshRequest, "jobId">): Promise<CgalRemeshMeshResponse> {
  return meshBackend.runCgalRemeshMesh(req);
}
