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

export type MeshBenchmarkCategory = "basic" | "standard" | "problematic" | "stress";

export type MeshBenchmarkModel = {
  id: string;
  label: string;
  category: MeshBenchmarkCategory;
  relativePath: string;
  fileName: string;
};

export type MeshBenchmarkListResponse =
  | { ok: true; entries: MeshBenchmarkModel[] }
  | { ok: false; error: string };

export type MeshBenchmarkLoadResponse =
  | { ok: true; entry: MeshBenchmarkModel; bytes: Uint8Array }
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
});

contextBridge.exposeInMainWorld("appMenu", {
  onModeChange: (handler: (mode: string) => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, mode: string) => handler(mode);
    ipcRenderer.on("app:mode", listener);
    return () => ipcRenderer.removeListener("app:mode", listener);
  },
  onCommand: (handler: (command: string, payload?: unknown) => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, packet: { command?: string; payload?: unknown }) => {
      if (packet?.command) handler(packet.command, packet.payload);
    };
    ipcRenderer.on("app:menu-command", listener);
    return () => ipcRenderer.removeListener("app:menu-command", listener);
  },
});

contextBridge.exposeInMainWorld("meshBenchmarks", {
  list: (): Promise<MeshBenchmarkListResponse> =>
    ipcRenderer.invoke("meshBenchmark:list"),
  load: (id: string): Promise<MeshBenchmarkLoadResponse> =>
    ipcRenderer.invoke("meshBenchmark:load", id),
});
