import type {
  CgalHealthResponse,
  CgalMeshRequest,
  CgalMeshResponse,
  CgalPingResponse,
  CgalStopResponse,
  CgalVersionResponse,
} from "@math3d/api-client";
import { meshBackend } from "./meshBackend";

export type { CgalMeshRequest, CgalMeshResponse };

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
