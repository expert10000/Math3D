import type {
  GeodesicSurfacePathRequest,
  GeodesicSurfacePathResponse,
} from "@math3d/api-client";
import { meshBackend } from "./meshBackend";

export type { GeodesicSurfacePathRequest, GeodesicSurfacePathResponse };

export async function runGeodesicSurfacePath(
  req: Omit<GeodesicSurfacePathRequest, "jobId">
): Promise<GeodesicSurfacePathResponse> {
  return meshBackend.runGeodesicSurfacePath(req);
}
