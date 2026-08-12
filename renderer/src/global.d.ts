export {};

declare global {
  type PresetKind = "graph" | "implicit" | "param";

  type SurfacePresetRecord = {
    id: string;
    kind: PresetKind;
    label: string;

    // graph / implicit
    expr?: string;

    // param
    xExpr?: string;
    yExpr?: string;
    zExpr?: string;

    createdAt: number;
    updatedAt: number;
  };

  type CgalMeshRequest = {
    jobId: string;
    f: string;
    iso: number;
    domain: { min: [number, number, number]; max: [number, number, number] };
    quality: { target_edge: number; radiusBound?: number };
    scalars?: string[];
    verbose?: boolean;
    preflightSamples?: number;
  };

  type CgalMeshResponse =
    | { ok: true; positions: number[]; indices: number[]; scalars?: { name: string; values: number[] }[] }
    | { ok: false; error: string };

  type GeodesicHeatRequest = {
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

  type GeodesicHeatResponse =
    | { ok: true; polyline: number[][]; length: number; phi_vertex?: number[] }
    | { ok: false; error: string };

  type VtkMeshRequest = {
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
  type VtkBooleanOperation = "union" | "difference" | "intersection" | "imprint";
  type VtkBooleanRequest = {
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

  type VtkMeshResponse =
    | {
        ok: true;
        positions: ArrayBuffer | ArrayBufferView;
        indices: ArrayBuffer | ArrayBufferView;
        normals?: ArrayBuffer | ArrayBufferView;
        vertexCount: number;
        triCount: number;
      }
    | { ok: false; error: string };

  type VtkPreviewRequest = {
    jobId: string;
    expr: string;
    iso: number;
    domain: { min: [number, number, number]; max: [number, number, number] };
    resolution: number;
    targetFaces?: number;
    targetReduction?: number;
  };

  type VtkVolumeSliceRequest = {
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

  type VtkVolumeSliceResponse =
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

  type VtkVolumeIsosurfaceRequest = {
    jobId: string;
    dims: [number, number, number];
    scalars: ArrayBuffer | ArrayBufferView;
    iso: number;
    spacing?: [number, number, number];
    origin?: [number, number, number];
  };

  type VtkVolumeIsosurfaceResponse =
    | {
        ok: true;
        positions: ArrayBuffer | ArrayBufferView;
        indices: ArrayBuffer | ArrayBufferView;
        normals?: ArrayBuffer | ArrayBufferView;
        vertexCount: number;
        triCount: number;
      }
    | { ok: false; error: string };

  type VtkVolumeDistanceRequest = {
    jobId: string;
    dims: [number, number, number];
    positions: ArrayBuffer | ArrayBufferView;
    indices: ArrayBuffer | ArrayBufferView;
    spacing?: [number, number, number];
    origin?: [number, number, number];
    signed?: boolean;
    windingNumber?: boolean;
  };

  type VtkVolumeDistanceResponse =
    | {
        ok: true;
        scalars: ArrayBuffer | ArrayBufferView;
        dims: [number, number, number];
      }
    | { ok: false; error: string };

  type VtkVolumeStreamlinesRequest = {
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

  type VtkVolumeStreamlinesResponse =
    | { ok: true; lines: number[][][] }
    | { ok: false; error: string };

  type AppCaptureScreenshotRequest = {
    target: "scene" | "window";
    rect?: { x: number; y: number; width: number; height: number };
  };

  type AppCaptureScreenshotResponse =
    | { ok: true; path: string; folder: string }
    | { ok: false; error: string };
  type AppCaptureListRequest = {
    limit?: number;
  };
  type AppCaptureListResponse =
    | { ok: true; folder: string; paths: string[] }
    | { ok: false; error: string };

  type MeshBenchmarkCategory = "basic" | "standard" | "mathematical" | "problematic" | "stress";
  type MeshBenchmarkTestKind = "import" | "topology" | "boundary" | "selection" | "analysis" | "performance";
  type MeshBenchmarkExpectedMetrics = {
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
  type MeshBenchmarkExpected = {
    computedReference?: MeshBenchmarkExpectedMetrics & { closedByEdgeIncidence?: boolean };
    expected?: MeshBenchmarkExpectedMetrics;
    expectedAfterSpatialWeld?: MeshBenchmarkExpectedMetrics & { uniqueVertices?: number };
    file?: string;
    generated?: boolean;
    purpose?: string;
    rawTriangleCornerCount?: number;
  };
  type MeshBenchmarkModelRecord = {
    id: string;
    label: string;
    category: MeshBenchmarkCategory;
    relativePath: string;
    fileName: string;
    tests: MeshBenchmarkTestKind[];
    expected?: MeshBenchmarkExpected;
  };
  type MeshBenchmarkListResponse =
    | { ok: true; entries: MeshBenchmarkModelRecord[] }
    | { ok: false; error: string };
  type MeshBenchmarkLoadResponse =
    | { ok: true; entry: MeshBenchmarkModelRecord; bytes: Uint8Array }
    | { ok: false; error: string };
  type MeshBenchmarkMatchResponse =
    | { ok: true; entry: MeshBenchmarkModelRecord | null }
    | { ok: false; error: string };

  type TopologyDocumentSaveRequest = {
    suggestedName?: string;
    defaultPath?: string;
    content: string;
  };

  type TopologyDocumentSaveResponse =
    | { ok: true; canceled: false; path: string }
    | { ok: false; canceled: true }
    | { ok: false; canceled: false; error: string };

  type TopologyDocumentOpenResponse =
    | { ok: true; canceled: false; path: string; content: string }
    | { ok: false; canceled: true }
    | { ok: false; canceled: false; error: string };

  type AppWindowStatePacket = {
    reason?: string;
    maximized: boolean;
    fullscreen: boolean;
    bounds?: { x: number; y: number; width: number; height: number };
  };

  type PythonWorkerFailureCategory =
    | "worker-missing"
    | "startup-crash"
    | "dependency-load-failure"
    | "operation-timeout"
    | "unknown";

  type PythonWorkerDiagnosticsError = {
    category: PythonWorkerFailureCategory;
    code: string;
    message: string;
    detail: string;
    context: string;
    fatal: boolean;
    at: number;
  };

  type PythonWorkerDiagnosticsSnapshot = {
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

  type OctaveHealthResponse = {
    status: string;
    engine: string;
    available: boolean;
  };

  type OctaveEigResponse = {
    ok: boolean;
    engine: string;
    inputShape: [number, number];
    eigenvalues: number[];
    eigenvectors: number[][];
    elapsedMs: number;
    error?: string;
  };

  type OctaveSolveResponse = {
    ok: boolean;
    engine: string;
    inputShape: [number, number];
    solution: number[];
    residualNorm: number;
    elapsedMs: number;
    error?: string;
  };

  type SageOperation =
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

  type SageHealthResponse = {
    status: string;
    engine: string;
    available: boolean;
    operations: SageOperation[];
  };

  type SageRunRequest = {
    operation: SageOperation;
    params: Record<string, unknown>;
  };

  type SageRunResponse = {
    engine: string;
    operation: SageOperation | string;
    success: boolean;
    latex: string;
    result: Record<string, unknown>;
    warnings: string[];
    elapsedMs?: number;
    error?: string;
  };

  type ComputeEngineId = "sage" | "octave";
  type ComputeEngineAction = "install" | "start" | "stop" | "update" | "logs" | "reset";

  type ComputeEngineSnapshot = {
    native: {
      label: "Native Math3D";
      installed: true;
      statusText: string;
    };
    docker: {
      dockerAvailable: boolean;
      composeAvailable: boolean;
      dockerVersion?: string;
      composeVersion?: string;
      error?: string;
    };
    engines: Array<{
      id: ComputeEngineId;
      label: string;
      installed: boolean;
      running: boolean;
      healthy: boolean;
      statusText: string;
      containerName: string;
      healthUrl: string;
      version?: string;
      lastError?: string;
    }>;
    checkedAt: number;
  };

  type ComputeEngineActionResult = {
    ok: boolean;
    engineId: ComputeEngineId;
    action: ComputeEngineAction;
    stdout?: string;
    stderr?: string;
    error?: string;
    snapshot: ComputeEngineSnapshot;
  };

  interface Window {
    surfacePresets?: {
      list: (kind: PresetKind) => Promise<SurfacePresetRecord[]>;
      upsert: (preset: SurfacePresetRecord) => Promise<void>;
      remove: (id: string) => Promise<void>;
    };
    cgalMesh?: {
      ping: () => Promise<{ ok: boolean; pong?: boolean; error?: string }>;
      version: () => Promise<{ ok: boolean; version?: string; protocol?: string; error?: string }>;
      health: () => Promise<{ ok: boolean; error?: string }>;
      mesh: (req: CgalMeshRequest) => Promise<CgalMeshResponse>;
      stop: () => Promise<{ ok: boolean; error?: string }>;
      geodesicHeat: (req: GeodesicHeatRequest) => Promise<GeodesicHeatResponse>;
    };
    vtkMesh?: {
      cleanNormals: (req: VtkMeshRequest) => Promise<VtkMeshResponse>;
      decimate: (req: VtkMeshRequest) => Promise<VtkMeshResponse>;
      smooth: (req: VtkMeshRequest) => Promise<VtkMeshResponse>;
      boolean: (req: VtkBooleanRequest) => Promise<VtkMeshResponse>;
      previewImplicit: (req: VtkPreviewRequest) => Promise<VtkMeshResponse>;
    };
    vtkVolume?: {
      slice: (req: VtkVolumeSliceRequest) => Promise<VtkVolumeSliceResponse>;
      isosurface: (req: VtkVolumeIsosurfaceRequest) => Promise<VtkVolumeIsosurfaceResponse>;
      distanceField: (req: VtkVolumeDistanceRequest) => Promise<VtkVolumeDistanceResponse>;
      streamlines: (req: VtkVolumeStreamlinesRequest) => Promise<VtkVolumeStreamlinesResponse>;
    };
    appMenu?: {
      onModeChange: (handler: (mode: string) => void) => () => void;
      onCommand: (handler: (command: string, payload?: unknown) => void) => () => void;
    };
    meshBenchmarks?: {
      list: () => Promise<MeshBenchmarkListResponse>;
      load: (id: string) => Promise<MeshBenchmarkLoadResponse>;
      match: (fileName: string) => Promise<MeshBenchmarkMatchResponse>;
    };
    appCapture?: {
      captureScreenshot: (req: AppCaptureScreenshotRequest) => Promise<AppCaptureScreenshotResponse>;
      listScreenshots: (req?: AppCaptureListRequest) => Promise<AppCaptureListResponse>;
    };
    topologyDocuments?: {
      save: (req: TopologyDocumentSaveRequest) => Promise<TopologyDocumentSaveResponse>;
      open: () => Promise<TopologyDocumentOpenResponse>;
    };
    appWindow?: {
      onStateChange: (handler: (packet: AppWindowStatePacket) => void) => () => void;
    };
    pythonWorkerDiagnostics?: {
      getStatus: () => Promise<PythonWorkerDiagnosticsSnapshot>;
    };
    octaveService?: {
      health: () => Promise<OctaveHealthResponse>;
      getStatus: () => Promise<OctaveHealthResponse>;
      eig: (matrix: number[][]) => Promise<OctaveEigResponse>;
      solve: (matrix: number[][], rhs: number[]) => Promise<OctaveSolveResponse>;
    };
    sageService?: {
      health: () => Promise<SageHealthResponse>;
      getStatus: () => Promise<SageHealthResponse>;
      run: (req: SageRunRequest) => Promise<SageRunResponse>;
    };
    computeEngines?: {
      getStatus: () => Promise<ComputeEngineSnapshot>;
      runAction: (engineId: ComputeEngineId, action: ComputeEngineAction) => Promise<ComputeEngineActionResult>;
      openDockerGuide: () => Promise<{ ok: boolean }>;
    };
    appRuntime?: {
      geometrySmoke?: boolean;
      e2e?: boolean;
    };
    __MATH3D_E2E_GEOMETRY_PICK__?: {
      commitGeometryPick: (request: {
        kind: "object" | "face" | "edge" | "vertex";
        objectId?: string;
        faceIndex?: number;
        edgeVertices?: [number, number];
        vertexIndex?: number;
      }) => {
        ok: boolean;
        error?: string;
        kind?: "object" | "face" | "edge" | "vertex";
        objectId?: string;
        faceIndex?: number;
        edgeVertices?: [number, number];
        vertexIndex?: number;
      };
    };
    __MATH3D_GEOMETRY_SMOKE_TRIGGER__?: boolean;
  }
}
