export type GeodesicHeatRequest = {
  jobId: string;
  mesh: { V: number[][]; F: number[][] };
  source: { face: number; bary: [number, number, number] };
  target: { face: number; bary: [number, number, number] };
  options?: {
    t_factor?: number;
    step_factor?: number;
    max_steps?: number;
    stop_eps?: number;
    return_phi?: boolean;
  };
};

export type GeodesicHeatResponse =
  | { ok: true; polyline: number[][]; length: number; phi_vertex?: number[] }
  | { ok: false; error: string };

function makeJobId() {
  const c: any = globalThis.crypto;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : `${Date.now()}_${Math.random()}`;
}

export async function runGeodesicHeat(
  req: Omit<GeodesicHeatRequest, "jobId">
): Promise<GeodesicHeatResponse> {
  const api = (window as any).cgalMesh;
  if (!api?.geodesicHeat) return { ok: false, error: "Geodesic heat IPC unavailable" };
  const jobId = makeJobId();
  return api.geodesicHeat({ ...req, jobId });
}
