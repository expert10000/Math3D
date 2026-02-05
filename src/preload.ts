import { contextBridge, ipcRenderer } from "electron";

export type PresetKind = "graph" | "implicit" | "param";

console.log("[preload] LOADED");

export type SurfacePresetRecord = {
  id: string;
  kind: PresetKind;
  label: string;
  expr?: string;      // graph / implicit
  xExpr?: string;     // param
  yExpr?: string;     // param
  zExpr?: string;     // param
  createdAt: number;
  updatedAt: number;
};

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

export type VtkMeshRequest = {
  jobId: string;
  positions: ArrayBuffer | ArrayBufferView;
  indices: ArrayBuffer | ArrayBufferView;
  options?: {
    targetReduction?: number;
    targetFaces?: number;
    iterations?: number;
    passband?: number;
    computeNormals?: boolean;
  };
};

export type VtkMeshResponse =
  | {
      ok: true;
      positions: ArrayBuffer | ArrayBufferView;
      indices: ArrayBuffer | ArrayBufferView;
      normals?: ArrayBuffer | ArrayBufferView;
      vertexCount: number;
      triCount: number;
    }
  | { ok: false; error: string };

export type VtkPreviewRequest = {
  jobId: string;
  expr: string;
  iso: number;
  domain: { min: [number, number, number]; max: [number, number, number] };
  resolution: number;
  targetFaces?: number;
  targetReduction?: number;
};

export type VtkVolumeSliceRequest = {
  jobId: string;
  dims: [number, number, number];
  scalars: ArrayBuffer | ArrayBufferView;
  axis: "x" | "y" | "z";
  index: number;
  spacing?: [number, number, number];
  origin?: [number, number, number];
};

export type VtkVolumeSliceResponse =
  | {
      ok: true;
      data: ArrayBuffer | ArrayBufferView;
      width: number;
      height: number;
      format: "rgba8";
      min?: number;
      max?: number;
    }
  | { ok: false; error: string };

export type VtkVolumeIsosurfaceRequest = {
  jobId: string;
  dims: [number, number, number];
  scalars: ArrayBuffer | ArrayBufferView;
  iso: number;
  spacing?: [number, number, number];
  origin?: [number, number, number];
};

export type VtkVolumeIsosurfaceResponse =
  | {
      ok: true;
      positions: ArrayBuffer | ArrayBufferView;
      indices: ArrayBuffer | ArrayBufferView;
      normals?: ArrayBuffer | ArrayBufferView;
      vertexCount: number;
      triCount: number;
    }
  | { ok: false; error: string };

contextBridge.exposeInMainWorld("surfacePresets", {
  list: (kind: PresetKind): Promise<SurfacePresetRecord[]> =>
    ipcRenderer.invoke("surfacePresets:list", kind),

  upsert: (preset: SurfacePresetRecord): Promise<void> =>
    ipcRenderer.invoke("surfacePresets:upsert", preset),

  remove: (id: string): Promise<void> =>
    ipcRenderer.invoke("surfacePresets:remove", id),
});

contextBridge.exposeInMainWorld("cgalMesh", {
  health: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("mesh:cgal:health"),
  mesh: (req: CgalMeshRequest): Promise<any> =>
    ipcRenderer.invoke("mesh:cgal", req),
  geodesicHeat: (req: GeodesicHeatRequest): Promise<any> =>
    ipcRenderer.invoke("mesh:geodesic:heat", req),
  stop: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("mesh:cgal:stop"),
});

contextBridge.exposeInMainWorld("vtkMesh", {
  cleanNormals: (req: VtkMeshRequest): Promise<VtkMeshResponse> =>
    ipcRenderer.invoke("mesh:vtk:clean", req),
  decimate: (req: VtkMeshRequest): Promise<VtkMeshResponse> =>
    ipcRenderer.invoke("mesh:vtk:decimate", req),
  smooth: (req: VtkMeshRequest): Promise<VtkMeshResponse> =>
    ipcRenderer.invoke("mesh:vtk:smooth", req),
  previewImplicit: (req: VtkPreviewRequest): Promise<VtkMeshResponse> =>
    ipcRenderer.invoke("mesh:vtk:preview", req),
});

contextBridge.exposeInMainWorld("vtkVolume", {
  slice: (req: VtkVolumeSliceRequest): Promise<VtkVolumeSliceResponse> =>
    ipcRenderer.invoke("volume:vtk:slice", req),
  isosurface: (req: VtkVolumeIsosurfaceRequest): Promise<VtkVolumeIsosurfaceResponse> =>
    ipcRenderer.invoke("volume:vtk:isosurface", req),
});
