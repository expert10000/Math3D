import { contextBridge, ipcRenderer } from "electron";

export type PresetKind = "graph" | "implicit" | "param";

console.log("[preload] LOADED");

const asFlag = (value: unknown): boolean =>
  ["1", "true", "yes", "on", "y"].includes(String(value ?? "").toLowerCase());

const readGeometrySmokeFlag = (): boolean => {
  try {
    const flags = ipcRenderer.sendSync("app:runtime:get-flags") as { geometrySmoke?: unknown } | null;
    if (flags?.geometrySmoke === true) return true;
  } catch {
    // Ignore: runtime flags are optional for non-main test contexts.
  }
  return asFlag(process.env.MATH3D_GEOMETRY_SMOKE);
};

const geometrySmokeEnabled = readGeometrySmokeFlag();
const e2eRuntimeEnabled = asFlag(process.env.MATH3D_E2E);
if (geometrySmokeEnabled) {
  console.log("[preload] GEOMETRY_SMOKE=1");
}

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

export type VtkBooleanOperation = "union" | "difference" | "intersection" | "imprint";
export type VtkBooleanRequest = {
  jobId: string;
  positionsA: ArrayBuffer | ArrayBufferView;
  indicesA: ArrayBuffer | ArrayBufferView;
  positionsB: ArrayBuffer | ArrayBufferView;
  indicesB: ArrayBuffer | ArrayBufferView;
  operation: VtkBooleanOperation;
  options?: {
    computeNormals?: boolean;
    curveRadius?: number;
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
  axis?: "x" | "y" | "z";
  index?: number;
  spacing?: [number, number, number];
  origin?: [number, number, number];
  plane?: {
    center: [number, number, number];
    normal: [number, number, number];
    u: [number, number, number];
    v: [number, number, number];
    width: number;
    height: number;
    resolution?: [number, number];
  };
  window?: { low: number; high: number };
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

export type VtkVolumeDistanceRequest = {
  jobId: string;
  dims: [number, number, number];
  positions: ArrayBuffer | ArrayBufferView;
  indices: ArrayBuffer | ArrayBufferView;
  spacing?: [number, number, number];
  origin?: [number, number, number];
  signed?: boolean;
  windingNumber?: boolean;
};

export type VtkVolumeDistanceResponse =
  | {
      ok: true;
      scalars: ArrayBuffer | ArrayBufferView;
      dims: [number, number, number];
    }
  | { ok: false; error: string };

export type VtkVolumeStreamlinesRequest = {
  jobId: string;
  dims: [number, number, number];
  vectors: ArrayBuffer | ArrayBufferView;
  spacing?: [number, number, number];
  origin?: [number, number, number];
  seeds: [number, number, number][];
  stepSize?: number;
  maxSteps?: number;
  maxLength?: number;
};

export type VtkVolumeStreamlinesResponse =
  | { ok: true; lines: number[][][] }
  | { ok: false; error: string };

export type AppCaptureScreenshotRequest = {
  target: "scene" | "window";
  rect?: { x: number; y: number; width: number; height: number };
};

export type AppCaptureScreenshotResponse =
  | { ok: true; path: string; folder: string }
  | { ok: false; error: string };
export type AppCaptureListRequest = {
  limit?: number;
};
export type AppCaptureListResponse =
  | { ok: true; folder: string; paths: string[] }
  | { ok: false; error: string };

export type TopologyDocumentSaveRequest = {
  suggestedName?: string;
  defaultPath?: string;
  content: string;
};

export type TopologyDocumentSaveResponse =
  | { ok: true; canceled: false; path: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

export type TopologyDocumentOpenResponse =
  | { ok: true; canceled: false; path: string; content: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

export type MeshFileDialogEntry = {
  fileName: string;
  bytes: Uint8Array;
};
export type MeshFileOpenResponse =
  | { ok: true; canceled: false; files: MeshFileDialogEntry[] }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

export type MeshBenchmarkCategory = "basic" | "standard" | "mathematical" | "problematic" | "stress";
export type MeshBenchmarkTestKind = "import" | "topology" | "boundary" | "selection" | "analysis" | "performance";

export type MeshBenchmarkModel = {
  id: string;
  label: string;
  category: MeshBenchmarkCategory;
  relativePath: string;
  fileName: string;
  tests: MeshBenchmarkTestKind[];
  expected?: MeshBenchmarkExpected;
};
export type MeshBenchmarkExpectedMetrics = {
  boundaryEdges?: number;
  boundaryLoops?: number;
  closed?: boolean;
  components?: number;
  degenerateFacesAtLeast?: number;
  edges?: number;
  eulerCharacteristic?: number;
  faces?: number;
  genus?: number;
  nonManifoldEdges?: number;
  orientationConsistent?: boolean;
  selfIntersectionPairsAtLeast?: number;
  vertices?: number;
};
export type MeshBenchmarkExpected = {
  computedReference?: MeshBenchmarkExpectedMetrics & { closedByEdgeIncidence?: boolean };
  expected?: MeshBenchmarkExpectedMetrics;
  expectedAfterSpatialWeld?: MeshBenchmarkExpectedMetrics & { uniqueVertices?: number };
  file?: string;
  generated?: boolean;
  purpose?: string;
  rawTriangleCornerCount?: number;
};

export type MeshBenchmarkListResponse =
  | { ok: true; entries: MeshBenchmarkModel[] }
  | { ok: false; error: string };

export type MeshBenchmarkLoadResponse =
  | { ok: true; entry: MeshBenchmarkModel; bytes: Uint8Array }
  | { ok: false; error: string };

export type MeshBenchmarkMatchResponse =
  | { ok: true; entry: MeshBenchmarkModel | null }
  | { ok: false; error: string };

export type AppWindowStatePacket = {
  reason?: string;
  maximized: boolean;
  fullscreen: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
};

export type PythonWorkerFailureCategory =
  | "worker-missing"
  | "startup-crash"
  | "dependency-load-failure"
  | "operation-timeout"
  | "unknown";

export type PythonWorkerDiagnosticsError = {
  category: PythonWorkerFailureCategory;
  code: string;
  message: string;
  detail: string;
  context: string;
  fatal: boolean;
  at: number;
};

export type PythonWorkerDiagnosticsSnapshot = {
  startupChecked: boolean;
  available: boolean;
  statusMessage: string;
  backend?: "python-script" | "bundled-exe";
  version?: string;
  protocol?: string;
  command?: string;
  args?: string[];
  logPath: string;
  lastCheckAt: number;
  lastError?: PythonWorkerDiagnosticsError;
};

export type SageOperation =
  | "sage.symbolic.simplify"
  | "sage.symbolic.factor"
  | "sage.symbolic.expand"
  | "sage.symbolic.solve"
  | "sage.matrix.eigen_exact"
  | "sage.matrix.charpoly"
  | "sage.polynomial.roots_exact"
  | "sage.polynomial.factor"
  | "sage.groebner.compute"
  | "sage.numberTheory.gcd"
  | "sage.numberTheory.modInverse";

export type SageRunRequest = {
  operation: SageOperation;
  params: Record<string, unknown>;
};

export type ComputeEngineId = "sage" | "octave";
export type ComputeEngineAction = "install" | "start" | "stop" | "update" | "logs" | "reset";

contextBridge.exposeInMainWorld("surfacePresets", {
  list: (kind: PresetKind): Promise<SurfacePresetRecord[]> =>
    ipcRenderer.invoke("surfacePresets:list", kind),

  upsert: (preset: SurfacePresetRecord): Promise<void> =>
    ipcRenderer.invoke("surfacePresets:upsert", preset),

  remove: (id: string): Promise<void> =>
    ipcRenderer.invoke("surfacePresets:remove", id),
});

contextBridge.exposeInMainWorld("cgalMesh", {
  ping: (): Promise<{ ok: boolean; pong?: boolean; error?: string }> =>
    ipcRenderer.invoke("mesh:cgal:ping"),
  version: (): Promise<{ ok: boolean; version?: string; protocol?: string; error?: string }> =>
    ipcRenderer.invoke("mesh:cgal:version"),
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
  boolean: (req: VtkBooleanRequest): Promise<VtkMeshResponse> =>
    ipcRenderer.invoke("mesh:vtk:boolean", req),
  previewImplicit: (req: VtkPreviewRequest): Promise<VtkMeshResponse> =>
    ipcRenderer.invoke("mesh:vtk:preview", req),
});

contextBridge.exposeInMainWorld("vtkVolume", {
  slice: (req: VtkVolumeSliceRequest): Promise<VtkVolumeSliceResponse> =>
    ipcRenderer.invoke("volume:vtk:slice", req),
  isosurface: (req: VtkVolumeIsosurfaceRequest): Promise<VtkVolumeIsosurfaceResponse> =>
    ipcRenderer.invoke("volume:vtk:isosurface", req),
  distanceField: (req: VtkVolumeDistanceRequest): Promise<VtkVolumeDistanceResponse> =>
    ipcRenderer.invoke("volume:vtk:distance", req),
  streamlines: (req: VtkVolumeStreamlinesRequest): Promise<VtkVolumeStreamlinesResponse> =>
    ipcRenderer.invoke("volume:vtk:streamlines", req),
});

contextBridge.exposeInMainWorld("appMenu", {
  onModeChange: (handler: (mode: string) => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, mode: string) => handler(mode);
    ipcRenderer.on("app:mode", listener);
    return () => ipcRenderer.removeListener("app:mode", listener);
  },
  onCommand: (handler: (command: string, payload?: unknown) => void) => {
    const listener = (
      _evt: Electron.IpcRendererEvent,
      packet: { command?: string; payload?: unknown } | null | undefined
    ) => {
      const command = typeof packet?.command === "string" ? packet.command : "";
      if (!command) return;
      handler(command, packet?.payload);
    };
    ipcRenderer.on("app:menu-command", listener);
    return () => ipcRenderer.removeListener("app:menu-command", listener);
  },
});

contextBridge.exposeInMainWorld("appCapture", {
  captureScreenshot: (req: AppCaptureScreenshotRequest): Promise<AppCaptureScreenshotResponse> =>
    ipcRenderer.invoke("app:capture-screenshot", req),
  listScreenshots: (req?: AppCaptureListRequest): Promise<AppCaptureListResponse> =>
    ipcRenderer.invoke("app:capture-list", req ?? {}),
});

contextBridge.exposeInMainWorld("topologyDocuments", {
  save: (req: TopologyDocumentSaveRequest): Promise<TopologyDocumentSaveResponse> =>
    ipcRenderer.invoke("topology:document:save", req),
  open: (): Promise<TopologyDocumentOpenResponse> =>
    ipcRenderer.invoke("topology:document:open"),
});

contextBridge.exposeInMainWorld("meshFiles", {
  open: (): Promise<MeshFileOpenResponse> =>
    ipcRenderer.invoke("meshFiles:open"),
});

contextBridge.exposeInMainWorld("meshBenchmarks", {
  list: (): Promise<MeshBenchmarkListResponse> =>
    ipcRenderer.invoke("meshBenchmark:list"),
  load: (id: string): Promise<MeshBenchmarkLoadResponse> =>
    ipcRenderer.invoke("meshBenchmark:load", id),
  match: (fileName: string): Promise<MeshBenchmarkMatchResponse> =>
    ipcRenderer.invoke("meshBenchmark:match", fileName),
});

contextBridge.exposeInMainWorld("appWindow", {
  onStateChange: (handler: (packet: AppWindowStatePacket) => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, packet: AppWindowStatePacket | null | undefined) => {
      if (!packet) return;
      handler(packet);
    };
    ipcRenderer.on("app:window-state", listener);
    return () => ipcRenderer.removeListener("app:window-state", listener);
  },
});

contextBridge.exposeInMainWorld("appDiagnostics", {
  getRendererMemory: (): Promise<unknown> =>
    ipcRenderer.invoke("app:renderer-memory"),
});

contextBridge.exposeInMainWorld("pythonWorkerDiagnostics", {
  getStatus: (): Promise<PythonWorkerDiagnosticsSnapshot> =>
    ipcRenderer.invoke("python-worker:diagnostics:get"),
});

contextBridge.exposeInMainWorld("sageService", {
  health: (): Promise<unknown> =>
    ipcRenderer.invoke("sage:health"),
  getStatus: (): Promise<unknown> =>
    ipcRenderer.invoke("sage:health"),
  run: (req: SageRunRequest): Promise<unknown> =>
    ipcRenderer.invoke("sage:run", req),
});

contextBridge.exposeInMainWorld("computeEngines", {
  getStatus: (): Promise<unknown> =>
    ipcRenderer.invoke("compute-engines:get-status"),
  runAction: (engineId: ComputeEngineId, action: ComputeEngineAction): Promise<unknown> =>
    ipcRenderer.invoke("compute-engines:run-action", { engineId, action }),
  openDockerGuide: (): Promise<unknown> =>
    ipcRenderer.invoke("compute-engines:open-docker-guide"),
});

contextBridge.exposeInMainWorld("appRuntime", {
  geometrySmoke: geometrySmokeEnabled,
  e2e: e2eRuntimeEnabled,
});
