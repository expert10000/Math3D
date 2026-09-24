import { createHttpMeshBackend } from "@math3d/api-client";
import type {
  CgalHealthResponse,
  CgalMeshRequest,
  CgalMeshResponse,
  CgalVersionResponse,
  GeodesicHeatRequest,
  GeodesicHeatResponse,
  VtkMeshResponse,
  VtkPreviewRequest,
  VtkPreviewJobRequest,
  VtkPreviewJobSnapshot,
  VtkVolumeIsosurfaceRequest,
  VtkVolumeIsosurfaceResponse,
} from "@math3d/core";

export interface MobileMeshBackend {
  health(): Promise<CgalHealthResponse>;
  version(): Promise<CgalVersionResponse>;
  generateImplicitMesh(request: Omit<CgalMeshRequest, "jobId">): Promise<CgalMeshResponse>;
  previewImplicit(request: Omit<VtkPreviewRequest, "jobId">): Promise<VtkMeshResponse>;
  submitPreviewJob(request: VtkPreviewJobRequest): Promise<VtkPreviewJobSnapshot>;
  getPreviewJob(jobId: string): Promise<VtkPreviewJobSnapshot>;
  cancelPreviewJob(jobId: string): Promise<VtkPreviewJobSnapshot>;
  volumeIsosurface(
    request: Omit<VtkVolumeIsosurfaceRequest, "jobId">
  ): Promise<VtkVolumeIsosurfaceResponse>;
  geodesicHeat(request: Omit<GeodesicHeatRequest, "jobId">): Promise<GeodesicHeatResponse>;
}

export const createMobileMeshBackend = (baseUrl: string, authorizationToken?: string): MobileMeshBackend => ({
  // Delegate worker transport and retry/timeout policy to shared api client.
  ...(() => {
    const backend = createHttpMeshBackend(baseUrl, {
      timeoutMs: 25_000,
      retries: 1,
      retryDelayMs: 500,
      authorizationToken,
    });
    return {
      health: () => backend.cgalHealth(),
      version: () => backend.cgalVersion(),
      generateImplicitMesh: (request: Omit<CgalMeshRequest, "jobId">) => backend.runCgalMesh(request),
      previewImplicit: (request: Omit<VtkPreviewRequest, "jobId">) => backend.vtkPreviewImplicit(request),
      submitPreviewJob: (request: VtkPreviewJobRequest) => backend.submitVtkPreviewJob(request),
      getPreviewJob: (jobId: string) => backend.getVtkPreviewJob(jobId),
      cancelPreviewJob: (jobId: string) => backend.cancelVtkPreviewJob(jobId),
      volumeIsosurface: (request: Omit<VtkVolumeIsosurfaceRequest, "jobId">) =>
        backend.vtkVolumeIsosurface(request),
      geodesicHeat: (request: Omit<GeodesicHeatRequest, "jobId">) => backend.runGeodesicHeat(request),
    };
  })(),
});
