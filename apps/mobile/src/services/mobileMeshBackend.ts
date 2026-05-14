import type {
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
  generateImplicitMesh(request: Omit<CgalMeshRequest, "jobId">): Promise<CgalMeshResponse>;
  previewImplicit(request: Omit<VtkPreviewRequest, "jobId">): Promise<VtkMeshResponse>;
  volumeIsosurface(
    request: Omit<VtkVolumeIsosurfaceRequest, "jobId">
  ): Promise<VtkVolumeIsosurfaceResponse>;
  geodesicHeat(request: Omit<GeodesicHeatRequest, "jobId">): Promise<GeodesicHeatResponse>;
}

type JsonRecord = Record<string, unknown>;

const defaultHeaders = {
  "Content-Type": "application/json",
};

const postJson = async <T>(baseUrl: string, path: string, body: JsonRecord): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: defaultHeaders,
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || payload == null) {
    throw new Error(`Request failed: ${path} (${response.status})`);
  }
  return payload;
};

export const createMobileMeshBackend = (baseUrl: string): MobileMeshBackend => ({
  generateImplicitMesh(request) {
    return postJson<CgalMeshResponse>(baseUrl, "/cgal/mesh", request as JsonRecord);
  },
  previewImplicit(request) {
    return postJson<VtkMeshResponse>(baseUrl, "/vtk/preview", request as JsonRecord);
  },
  volumeIsosurface(request) {
    return postJson<VtkVolumeIsosurfaceResponse>(baseUrl, "/volume/isosurface", request as JsonRecord);
  },
  geodesicHeat(request) {
    return postJson<GeodesicHeatResponse>(baseUrl, "/cgal/geodesic-heat", request as JsonRecord);
  },
});
