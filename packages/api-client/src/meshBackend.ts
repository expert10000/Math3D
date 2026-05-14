import type {
  CgalHealthResponse,
  CgalMeshRequest,
  CgalMeshResponse,
  CgalPingResponse,
  CgalStopResponse,
  CgalVersionResponse,
  GeodesicHeatRequest,
  GeodesicHeatResponse,
  MeshBackendCapabilities,
  VtkMeshRequest,
  VtkMeshResponse,
  VtkPreviewRequest,
  VtkVolumeDistanceRequest,
  VtkVolumeDistanceResponse,
  VtkVolumeIsosurfaceRequest,
  VtkVolumeIsosurfaceResponse,
  VtkVolumeSliceRequest,
  VtkVolumeSliceResponse,
  VtkVolumeStreamlinesRequest,
  VtkVolumeStreamlinesResponse,
} from "./contracts";

export interface MeshBackend {
  getCapabilities(): MeshBackendCapabilities;
  cgalHealth(): Promise<CgalHealthResponse>;
  cgalPing(): Promise<CgalPingResponse>;
  cgalVersion(): Promise<CgalVersionResponse>;
  stopCgalWorker(): Promise<CgalStopResponse>;
  runCgalMesh(req: Omit<CgalMeshRequest, "jobId">): Promise<CgalMeshResponse>;
  runGeodesicHeat(req: Omit<GeodesicHeatRequest, "jobId">): Promise<GeodesicHeatResponse>;
  vtkPreviewImplicit(req: Omit<VtkPreviewRequest, "jobId">): Promise<VtkMeshResponse>;
  vtkCleanNormals(req: Omit<VtkMeshRequest, "jobId">): Promise<VtkMeshResponse>;
  vtkDecimate(req: Omit<VtkMeshRequest, "jobId">): Promise<VtkMeshResponse>;
  vtkSmooth(req: Omit<VtkMeshRequest, "jobId">): Promise<VtkMeshResponse>;
  vtkVolumeSlice(req: Omit<VtkVolumeSliceRequest, "jobId">): Promise<VtkVolumeSliceResponse>;
  vtkVolumeIsosurface(req: Omit<VtkVolumeIsosurfaceRequest, "jobId">): Promise<VtkVolumeIsosurfaceResponse>;
  vtkVolumeDistance(req: Omit<VtkVolumeDistanceRequest, "jobId">): Promise<VtkVolumeDistanceResponse>;
  vtkVolumeStreamlines(req: Omit<VtkVolumeStreamlinesRequest, "jobId">): Promise<VtkVolumeStreamlinesResponse>;
}

const makeJobId = () => {
  const c: Crypto | undefined = (globalThis as any).crypto;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : `${Date.now()}_${Math.random()}`;
};

const getWindowObject = (): Window | undefined => {
  if (typeof globalThis.window === "undefined") return undefined;
  return globalThis.window;
};

const capabilitySnapshot = (win: any): MeshBackendCapabilities => ({
  cgalHealth: typeof win?.cgalMesh?.health === "function",
  cgalMesh: typeof win?.cgalMesh?.mesh === "function",
  cgalGeodesicHeat: typeof win?.cgalMesh?.geodesicHeat === "function",
  vtkPreviewImplicit: typeof win?.vtkMesh?.previewImplicit === "function",
  vtkMeshCleanNormals: typeof win?.vtkMesh?.cleanNormals === "function",
  vtkMeshDecimate: typeof win?.vtkMesh?.decimate === "function",
  vtkMeshSmooth: typeof win?.vtkMesh?.smooth === "function",
  vtkVolumeSlice: typeof win?.vtkVolume?.slice === "function",
  vtkVolumeIsosurface: typeof win?.vtkVolume?.isosurface === "function",
  vtkVolumeDistance: typeof win?.vtkVolume?.distanceField === "function",
  vtkVolumeStreamlines: typeof win?.vtkVolume?.streamlines === "function",
});

export function createElectronMeshBackend(): MeshBackend {
  return {
    getCapabilities() {
      return capabilitySnapshot(getWindowObject());
    },
    async cgalHealth() {
      const api = (getWindowObject() as any)?.cgalMesh;
      if (!api?.health) return { ok: false, error: "CGAL IPC unavailable" };
      return api.health();
    },
    async cgalPing() {
      const api = (getWindowObject() as any)?.cgalMesh;
      if (!api?.ping) return { ok: false, error: "CGAL IPC unavailable" };
      return api.ping();
    },
    async cgalVersion() {
      const api = (getWindowObject() as any)?.cgalMesh;
      if (!api?.version) return { ok: false, error: "CGAL IPC unavailable" };
      return api.version();
    },
    async stopCgalWorker() {
      const api = (getWindowObject() as any)?.cgalMesh;
      if (!api?.stop) return { ok: false, error: "CGAL IPC unavailable" };
      return api.stop();
    },
    async runCgalMesh(req) {
      const api = (getWindowObject() as any)?.cgalMesh;
      if (!api?.mesh) return { ok: false, error: "CGAL IPC unavailable" };
      return api.mesh({ ...req, jobId: makeJobId() });
    },
    async runGeodesicHeat(req) {
      const api = (getWindowObject() as any)?.cgalMesh;
      if (!api?.geodesicHeat) return { ok: false, error: "Geodesic heat IPC unavailable" };
      return api.geodesicHeat({ ...req, jobId: makeJobId() });
    },
    async vtkPreviewImplicit(req) {
      const api = (getWindowObject() as any)?.vtkMesh;
      if (!api?.previewImplicit) return { ok: false, error: "VTK IPC unavailable" };
      return api.previewImplicit({ ...req, jobId: makeJobId() });
    },
    async vtkCleanNormals(req) {
      const api = (getWindowObject() as any)?.vtkMesh;
      if (!api?.cleanNormals) return { ok: false, error: "VTK IPC unavailable" };
      return api.cleanNormals({ ...req, jobId: makeJobId() });
    },
    async vtkDecimate(req) {
      const api = (getWindowObject() as any)?.vtkMesh;
      if (!api?.decimate) return { ok: false, error: "VTK IPC unavailable" };
      return api.decimate({ ...req, jobId: makeJobId() });
    },
    async vtkSmooth(req) {
      const api = (getWindowObject() as any)?.vtkMesh;
      if (!api?.smooth) return { ok: false, error: "VTK IPC unavailable" };
      return api.smooth({ ...req, jobId: makeJobId() });
    },
    async vtkVolumeSlice(req) {
      const api = (getWindowObject() as any)?.vtkVolume;
      if (!api?.slice) return { ok: false, error: "VTK volume IPC unavailable" };
      return api.slice({ ...req, jobId: makeJobId() });
    },
    async vtkVolumeIsosurface(req) {
      const api = (getWindowObject() as any)?.vtkVolume;
      if (!api?.isosurface) return { ok: false, error: "VTK volume IPC unavailable" };
      return api.isosurface({ ...req, jobId: makeJobId() });
    },
    async vtkVolumeDistance(req) {
      const api = (getWindowObject() as any)?.vtkVolume;
      if (!api?.distanceField) return { ok: false, error: "VTK volume IPC unavailable" };
      return api.distanceField({ ...req, jobId: makeJobId() });
    },
    async vtkVolumeStreamlines(req) {
      const api = (getWindowObject() as any)?.vtkVolume;
      if (!api?.streamlines) return { ok: false, error: "VTK volume IPC unavailable" };
      return api.streamlines({ ...req, jobId: makeJobId() });
    },
  };
}

export const electronMeshBackend = createElectronMeshBackend();
