import { ipcMain } from "electron";
import { getPythonWorker, stopPythonWorker } from "../python/PythonWorker";

export type CgalMeshRequest = {
  jobId: string;
  f: string;
  iso: number;
  domain: { min: [number, number, number]; max: [number, number, number] };
  quality: { target_edge: number; radiusBound?: number };
  scalars?: string[];
  verbose?: boolean;
  preflightSamples?: number;
};

export type CgalMeshResponse =
  | { ok: true; positions: number[]; indices: number[]; scalars?: { name: string; values: number[] }[] }
  | { ok: false; error: string };

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

export type CgalHealthResponse = { ok: true } | { ok: false; error: string };

export function registerCgalMeshIpc() {
  ipcMain.handle("mesh:cgal", async (_evt, req: CgalMeshRequest): Promise<CgalMeshResponse> => {
    try {
      const worker = await getPythonWorker();
      return await worker.meshCgal(req);
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });

  ipcMain.handle("mesh:geodesic:heat", async (_evt, req: GeodesicHeatRequest): Promise<GeodesicHeatResponse> => {
    try {
      const worker = await getPythonWorker();
      return await worker.geodesicHeat(req);
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });

  ipcMain.handle("mesh:cgal:health", async (): Promise<CgalHealthResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.health();
      if (res?.ok === false) {
        return { ok: false, error: res.error ?? "CGAL worker health failed" };
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });

  ipcMain.handle("mesh:cgal:stop", async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      stopPythonWorker();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });
}
