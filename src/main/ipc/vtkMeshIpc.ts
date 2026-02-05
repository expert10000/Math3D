import { ipcMain } from "electron";
import {
  getPythonWorker,
  type VtkMeshRequest,
  type VtkMeshResponse,
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
} from "../python/PythonWorker";

export type VtkMeshRequestPayload = Omit<VtkMeshRequest, "jobId"> & { jobId: string };
export type VtkPreviewRequestPayload = Omit<VtkPreviewRequest, "jobId"> & { jobId: string };
export type VtkVolumeSliceRequestPayload = Omit<VtkVolumeSliceRequest, "jobId"> & { jobId: string };
export type VtkVolumeIsosurfaceRequestPayload = Omit<VtkVolumeIsosurfaceRequest, "jobId"> & { jobId: string };
export type VtkVolumeDistanceRequestPayload = Omit<VtkVolumeDistanceRequest, "jobId"> & { jobId: string };
export type VtkVolumeStreamlinesRequestPayload = Omit<VtkVolumeStreamlinesRequest, "jobId"> & { jobId: string };

async function runVtkJob(op: VtkMeshOp, req: VtkMeshRequestPayload): Promise<VtkMeshResponse> {
  try {
    const worker = await getPythonWorker();
    return await worker.vtkMesh(op, req);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
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

  ipcMain.handle("mesh:vtk:preview", async (_evt, req: VtkPreviewRequestPayload): Promise<VtkMeshResponse> => {
    try {
      const worker = await getPythonWorker();
      return await worker.vtkPreviewImplicit(req);
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });

  ipcMain.handle(
    "volume:vtk:slice",
    async (_evt, req: VtkVolumeSliceRequestPayload): Promise<VtkVolumeSliceResponse> => {
      try {
        const worker = await getPythonWorker();
        return await worker.vtkVolumeSlice(req);
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    }
  );

  ipcMain.handle(
    "volume:vtk:isosurface",
    async (_evt, req: VtkVolumeIsosurfaceRequestPayload): Promise<VtkVolumeIsosurfaceResponse> => {
      try {
        const worker = await getPythonWorker();
        return await worker.vtkVolumeIsosurface(req);
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    }
  );

  ipcMain.handle(
    "volume:vtk:distance",
    async (_evt, req: VtkVolumeDistanceRequestPayload): Promise<VtkVolumeDistanceResponse> => {
      try {
        const worker = await getPythonWorker();
        return await worker.vtkVolumeDistance(req);
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    }
  );

  ipcMain.handle(
    "volume:vtk:streamlines",
    async (_evt, req: VtkVolumeStreamlinesRequestPayload): Promise<VtkVolumeStreamlinesResponse> => {
      try {
        const worker = await getPythonWorker();
        return await worker.vtkVolumeStreamlines(req);
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    }
  );
}
