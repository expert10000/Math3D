import { createHttpMeshBackend } from "@math3d/api-client";
import type {
  CgalHealthResponse,
  CgalMeshRequest,
  CgalMeshResponse,
  GeodesicHeatRequest,
  GeodesicHeatResponse,
  VtkMeshResponse,
  VtkPreviewRequest,
  VtkVolumeIsosurfaceRequest,
  VtkVolumeIsosurfaceResponse,
} from "@math3d/core";

export interface MobileMeshBackend {
  health(): Promise<CgalHealthResponse>;
  generateImplicitMesh(request: Omit<CgalMeshRequest, "jobId">): Promise<CgalMeshResponse>;
  previewImplicit(request: Omit<VtkPreviewRequest, "jobId">): Promise<VtkMeshResponse>;
  volumeIsosurface(
    request: Omit<VtkVolumeIsosurfaceRequest, "jobId">
  ): Promise<VtkVolumeIsosurfaceResponse>;
  geodesicHeat(request: Omit<GeodesicHeatRequest, "jobId">): Promise<GeodesicHeatResponse>;
}

export const createMobileMeshBackend = (baseUrl: string): MobileMeshBackend => ({
  // Delegate worker transport and retry/timeout policy to shared api client.
  ...(() => {
    const backend = createHttpMeshBackend(baseUrl, {
      timeoutMs: 25_000,
      retries: 1,
      retryDelayMs: 500,
    });
    return {
      health: () => backend.cgalHealth(),
      generateImplicitMesh: (request: Omit<CgalMeshRequest, "jobId">) => backend.runCgalMesh(request),
      previewImplicit: (request: Omit<VtkPreviewRequest, "jobId">) => backend.vtkPreviewImplicit(request),
      volumeIsosurface: (request: Omit<VtkVolumeIsosurfaceRequest, "jobId">) =>
        backend.vtkVolumeIsosurface(request),
      geodesicHeat: (request: Omit<GeodesicHeatRequest, "jobId">) => backend.runGeodesicHeat(request),
    };
  })(),
});
