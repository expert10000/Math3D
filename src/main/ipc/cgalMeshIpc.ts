import { ipcMain } from "electron";
import { getPythonWorker } from "../python/PythonWorker";

export type CgalMeshRequest = {
  jobId: string;
  f: string;
  iso: number;
  domain: { min: [number, number, number]; max: [number, number, number] };
  quality: { target_edge: number };
  scalars?: string[];
};

export type CgalMeshResponse =
  | { ok: true; positions: number[]; indices: number[]; scalars?: { name: string; values: number[] }[] }
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
}
