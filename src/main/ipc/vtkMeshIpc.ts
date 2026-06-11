import { ipcMain } from "electron";
import {
  getPythonWorker,
  runInjectedVtkPreview,
  type VtkMeshRequest,
  type VtkMeshResponse,
  type VtkBooleanRequest,
  type VtkMeshOp,
  type VtkPreviewRequest,
  type VtkVolumeSliceRequest,
  type VtkVolumeSliceResponse,
  type VtkVolumeIsosurfaceRequest,
  type VtkVolumeIsosurfaceResponse,
  type VtkVolumeDistanceRequest,
  type VtkVolumeDistanceResponse,
  type VtkVolumeStreamlinesRequest,
  type VtkVolumeStreamlinesResponse,
} from "../python/pythonWorker";
import {
  recordPythonWorkerFailure,
  recordPythonWorkerSuccess,
} from "../python/pythonWorkerDiagnostics";

export type VtkMeshRequestPayload = Omit<VtkMeshRequest, "jobId"> & { jobId: string };
export type VtkBooleanRequestPayload = Omit<VtkBooleanRequest, "jobId"> & { jobId: string };
export type VtkPreviewRequestPayload = Omit<VtkPreviewRequest, "jobId"> & { jobId: string };
export type VtkVolumeSliceRequestPayload = Omit<VtkVolumeSliceRequest, "jobId"> & { jobId: string };
export type VtkVolumeIsosurfaceRequestPayload = Omit<VtkVolumeIsosurfaceRequest, "jobId"> & { jobId: string };
export type VtkVolumeDistanceRequestPayload = Omit<VtkVolumeDistanceRequest, "jobId"> & { jobId: string };
export type VtkVolumeStreamlinesRequestPayload = Omit<VtkVolumeStreamlinesRequest, "jobId"> & { jobId: string };

async function runVtkJob(op: VtkMeshOp, req: VtkMeshRequestPayload): Promise<VtkMeshResponse> {
  try {
    const worker = await getPythonWorker();
    const res = await worker.vtkMesh(op, req);
    if (!res.ok) {
      const diag = recordPythonWorkerFailure(res.error, `mesh:vtk:${op}`, "WORKER_OPERATION_FAILED");
      return { ok: false, error: diag.message };
    }
    recordPythonWorkerSuccess();
    return res;
  } catch (e: any) {
    const diag = recordPythonWorkerFailure(e, `mesh:vtk:${op}`, "WORKER_OPERATION_FAILED");
    return { ok: false, error: diag.message };
  }
}

export function registerVtkMeshIpc() {
  ipcMain.handle("mesh:vtk:clean", async (_evt, req: VtkMeshRequestPayload): Promise<VtkMeshResponse> => {
    return runVtkJob("vtk_clean_normals", req);
  });

  ipcMain.handle("mesh:vtk:decimate", async (_evt, req: VtkMeshRequestPayload): Promise<VtkMeshResponse> => {
    return runVtkJob("vtk_decimate", req);
  });

  ipcMain.handle("mesh:vtk:smooth", async (_evt, req: VtkMeshRequestPayload): Promise<VtkMeshResponse> => {
    return runVtkJob("vtk_smooth", req);
  });

  ipcMain.handle("mesh:vtk:boolean", async (_evt, req: VtkBooleanRequestPayload): Promise<VtkMeshResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.vtkBoolean(req);
      if (!res.ok) {
        const diag = recordPythonWorkerFailure(res.error, "mesh:vtk:boolean", "WORKER_OPERATION_FAILED");
        return { ok: false, error: diag.message };
      }
      recordPythonWorkerSuccess();
      return res;
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:vtk:boolean", "WORKER_OPERATION_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle("mesh:vtk:preview", async (_evt, req: VtkPreviewRequestPayload): Promise<VtkMeshResponse> => {
    try {
      const injected = await runInjectedVtkPreview(req);
      if (injected) return injected;
      const worker = await getPythonWorker();
      const res = await worker.vtkPreviewImplicit(req);
      if (!res.ok) {
        const diag = recordPythonWorkerFailure(res.error, "mesh:vtk:preview", "WORKER_OPERATION_FAILED");
        return { ok: false, error: diag.message };
      }
      recordPythonWorkerSuccess();
      return res;
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:vtk:preview", "WORKER_OPERATION_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle(
    "volume:vtk:slice",
    async (_evt, req: VtkVolumeSliceRequestPayload): Promise<VtkVolumeSliceResponse> => {
      try {
        const worker = await getPythonWorker();
        const res = await worker.vtkVolumeSlice(req);
        if (!res.ok) {
          const diag = recordPythonWorkerFailure(res.error, "volume:vtk:slice", "WORKER_OPERATION_FAILED");
          return { ok: false, error: diag.message };
        }
        recordPythonWorkerSuccess();
        return res;
      } catch (e: any) {
        const diag = recordPythonWorkerFailure(e, "volume:vtk:slice", "WORKER_OPERATION_FAILED");
        return { ok: false, error: diag.message };
      }
    }
  );

  ipcMain.handle(
    "volume:vtk:isosurface",
    async (_evt, req: VtkVolumeIsosurfaceRequestPayload): Promise<VtkVolumeIsosurfaceResponse> => {
      try {
        const worker = await getPythonWorker();
        const res = await worker.vtkVolumeIsosurface(req);
        if (!res.ok) {
          const diag = recordPythonWorkerFailure(res.error, "volume:vtk:isosurface", "WORKER_OPERATION_FAILED");
          return { ok: false, error: diag.message };
        }
        recordPythonWorkerSuccess();
        return res;
      } catch (e: any) {
        const diag = recordPythonWorkerFailure(e, "volume:vtk:isosurface", "WORKER_OPERATION_FAILED");
        return { ok: false, error: diag.message };
      }
    }
  );

  ipcMain.handle(
    "volume:vtk:distance",
    async (_evt, req: VtkVolumeDistanceRequestPayload): Promise<VtkVolumeDistanceResponse> => {
      try {
        const worker = await getPythonWorker();
        const res = await worker.vtkVolumeDistance(req);
        if (!res.ok) {
          const diag = recordPythonWorkerFailure(res.error, "volume:vtk:distance", "WORKER_OPERATION_FAILED");
          return { ok: false, error: diag.message };
        }
        recordPythonWorkerSuccess();
        return res;
      } catch (e: any) {
        const diag = recordPythonWorkerFailure(e, "volume:vtk:distance", "WORKER_OPERATION_FAILED");
        return { ok: false, error: diag.message };
      }
    }
  );

  ipcMain.handle(
    "volume:vtk:streamlines",
    async (_evt, req: VtkVolumeStreamlinesRequestPayload): Promise<VtkVolumeStreamlinesResponse> => {
      try {
        const worker = await getPythonWorker();
        const res = await worker.vtkVolumeStreamlines(req);
        if (!res.ok) {
          const diag = recordPythonWorkerFailure(res.error, "volume:vtk:streamlines", "WORKER_OPERATION_FAILED");
          return { ok: false, error: diag.message };
        }
        recordPythonWorkerSuccess();
        return res;
      } catch (e: any) {
        const diag = recordPythonWorkerFailure(e, "volume:vtk:streamlines", "WORKER_OPERATION_FAILED");
        return { ok: false, error: diag.message };
      }
    }
  );
}
