import { ipcMain } from "electron";
import { getPythonWorker, stopPythonWorker } from "../python/pythonWorker";
import {
  recordPythonWorkerFailure,
  recordPythonWorkerSuccess,
} from "../python/pythonWorkerDiagnostics";

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
export type PythonPingResponse = { ok: true; pong: boolean } | { ok: false; error: string };
export type PythonVersionResponse =
  | { ok: true; version: string; protocol: string }
  | { ok: false; error: string };

export function registerCgalMeshIpc() {
  ipcMain.handle("mesh:cgal:ping", async (): Promise<PythonPingResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.ping();
      recordPythonWorkerSuccess();
      return { ok: true, pong: !!res.pong };
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:cgal:ping", "WORKER_PING_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle("mesh:cgal:version", async (): Promise<PythonVersionResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.version();
      recordPythonWorkerSuccess({ version: res.version, protocol: res.protocol });
      return { ok: true, version: res.version, protocol: res.protocol };
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:cgal:version", "WORKER_VERSION_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle("mesh:cgal", async (_evt, req: CgalMeshRequest): Promise<CgalMeshResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.meshCgal(req);
      if (!res.ok) {
        const diag = recordPythonWorkerFailure(res.error, "mesh:cgal", "WORKER_OPERATION_FAILED");
        return { ok: false, error: diag.message };
      }
      recordPythonWorkerSuccess();
      return res;
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:cgal", "WORKER_OPERATION_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle("mesh:geodesic:heat", async (_evt, req: GeodesicHeatRequest): Promise<GeodesicHeatResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.geodesicHeat(req);
      if (!res.ok) {
        const diag = recordPythonWorkerFailure(res.error, "mesh:geodesic:heat", "WORKER_OPERATION_FAILED");
        return { ok: false, error: diag.message };
      }
      recordPythonWorkerSuccess();
      return res;
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:geodesic:heat", "WORKER_OPERATION_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle("mesh:cgal:health", async (): Promise<CgalHealthResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.health();
      if (res?.ok === false) {
        const diag = recordPythonWorkerFailure(res.error ?? "CGAL worker health failed", "mesh:cgal:health", "WORKER_HEALTH_FAILED");
        return { ok: false, error: diag.message };
      }
      recordPythonWorkerSuccess();
      return { ok: true };
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:cgal:health", "WORKER_HEALTH_FAILED");
      return { ok: false, error: diag.message };
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
