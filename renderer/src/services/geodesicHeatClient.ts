import type { GeodesicHeatRequest, GeodesicHeatResponse } from "@math3d/api-client";
import { meshBackend } from "./meshBackend";

export type { GeodesicHeatRequest, GeodesicHeatResponse };

export async function runGeodesicHeat(
  req: Omit<GeodesicHeatRequest, "jobId">
): Promise<GeodesicHeatResponse> {
  return meshBackend.runGeodesicHeat(req);
}
