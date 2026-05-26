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

export type CgalHealthResponse = { ok: boolean; error?: string };
export type CgalPingResponse = { ok: boolean; pong?: boolean; error?: string };
export type CgalVersionResponse = { ok: boolean; version?: string; protocol?: string; error?: string };
export type CgalStopResponse = { ok: boolean; error?: string };

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

export type SliceAxis = "x" | "y" | "z";

export type VtkVolumeSliceRequest = {
  jobId: string;
  dims: [number, number, number];
  scalars: ArrayBuffer | ArrayBufferView;
  axis?: SliceAxis;
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
  | { ok: true; lines: [number, number, number][][] }
  | { ok: false; error: string };

export type MeshContract = {
  positions: ArrayBuffer | ArrayBufferView | number[];
  indices: ArrayBuffer | ArrayBufferView | number[];
  normals?: ArrayBuffer | ArrayBufferView | number[];
  scalars?: { name: string; values: ArrayBuffer | ArrayBufferView | number[] }[];
};

export type MeshResult = MeshContract & {
  vertexCount?: number;
  triCount?: number;
};

export type WorkerRequest =
  | { kind: "cgal.mesh"; payload: Omit<CgalMeshRequest, "jobId"> }
  | { kind: "cgal.geodesic-heat"; payload: Omit<GeodesicHeatRequest, "jobId"> }
  | { kind: "vtk.preview-implicit"; payload: Omit<VtkPreviewRequest, "jobId"> }
  | { kind: "vtk.clean-normals"; payload: Omit<VtkMeshRequest, "jobId"> }
  | { kind: "vtk.decimate"; payload: Omit<VtkMeshRequest, "jobId"> }
  | { kind: "vtk.smooth"; payload: Omit<VtkMeshRequest, "jobId"> }
  | { kind: "vtk.boolean"; payload: Omit<VtkBooleanRequest, "jobId"> }
  | { kind: "vtk.volume.slice"; payload: Omit<VtkVolumeSliceRequest, "jobId"> }
  | { kind: "vtk.volume.isosurface"; payload: Omit<VtkVolumeIsosurfaceRequest, "jobId"> }
  | { kind: "vtk.volume.distance"; payload: Omit<VtkVolumeDistanceRequest, "jobId"> }
  | { kind: "vtk.volume.streamlines"; payload: Omit<VtkVolumeStreamlinesRequest, "jobId"> };

export type WorkerResponse =
  | CgalMeshResponse
  | GeodesicHeatResponse
  | VtkMeshResponse
  | VtkVolumeSliceResponse
  | VtkVolumeIsosurfaceResponse
  | VtkVolumeDistanceResponse
  | VtkVolumeStreamlinesResponse;
