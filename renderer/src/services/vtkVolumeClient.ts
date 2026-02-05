import type { SliceAxis } from "../scene/volume/sliceVolume";

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
      data: Uint8Array;
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
      positions: Float32Array;
      indices: Uint32Array;
      normals?: Float32Array;
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
};

export type VtkVolumeDistanceResponse =
  | {
      ok: true;
      scalars: Float32Array;
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

function makeJobId() {
  const c: any = globalThis.crypto;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : `${Date.now()}_${Math.random()}`;
}

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

export async function vtkVolumeSlice(
  req: Omit<VtkVolumeSliceRequest, "jobId">
): Promise<VtkVolumeSliceResponse> {
  const api = (window as any).vtkVolume;
  if (!api || typeof api.slice !== "function") {
    return { ok: false, error: "VTK volume IPC unavailable" };
  }
  const jobId = makeJobId();
  const res = await api.slice({ ...req, jobId });
  if (!res || res.ok === false) {
    return { ok: false, error: res?.error ?? "VTK volume slice failed" };
  }
  const buf = res.data ? toArrayBuffer(res.data) : new ArrayBuffer(0);
  return {
    ok: true,
    data: new Uint8Array(buf),
    width: Number(res.width) || 0,
    height: Number(res.height) || 0,
    format: "rgba8",
    min: typeof res.min === "number" ? res.min : undefined,
    max: typeof res.max === "number" ? res.max : undefined,
  };
}

function toFloat32(data: ArrayBuffer | ArrayBufferView): Float32Array {
  const buf = toArrayBuffer(data);
  return new Float32Array(buf);
}

function toUint32(data: ArrayBuffer | ArrayBufferView): Uint32Array {
  const buf = toArrayBuffer(data);
  return new Uint32Array(buf);
}

export async function vtkVolumeIsosurface(
  req: Omit<VtkVolumeIsosurfaceRequest, "jobId">
): Promise<VtkVolumeIsosurfaceResponse> {
  const api = (window as any).vtkVolume;
  if (!api || typeof api.isosurface !== "function") {
    return { ok: false, error: "VTK volume IPC unavailable" };
  }
  const jobId = makeJobId();
  const res = await api.isosurface({ ...req, jobId });
  if (!res || res.ok === false) {
    return { ok: false, error: res?.error ?? "VTK volume isosurface failed" };
  }
  return {
    ok: true,
    positions: toFloat32(res.positions),
    indices: toUint32(res.indices),
    normals: res.normals ? toFloat32(res.normals) : undefined,
    vertexCount: Number(res.vertexCount) || 0,
    triCount: Number(res.triCount) || 0,
  };
}

export async function vtkVolumeDistance(
  req: Omit<VtkVolumeDistanceRequest, "jobId">
): Promise<VtkVolumeDistanceResponse> {
  const api = (window as any).vtkVolume;
  if (!api || typeof api.distanceField !== "function") {
    return { ok: false, error: "VTK volume IPC unavailable" };
  }
  const jobId = makeJobId();
  const res = await api.distanceField({ ...req, jobId });
  if (!res || res.ok === false) {
    return { ok: false, error: res?.error ?? "VTK volume distance failed" };
  }
  return {
    ok: true,
    scalars: toFloat32(res.scalars),
    dims: Array.isArray(res.dims) && res.dims.length === 3 ? res.dims : req.dims,
  };
}

export async function vtkVolumeStreamlines(
  req: Omit<VtkVolumeStreamlinesRequest, "jobId">
): Promise<VtkVolumeStreamlinesResponse> {
  const api = (window as any).vtkVolume;
  if (!api || typeof api.streamlines !== "function") {
    return { ok: false, error: "VTK volume IPC unavailable" };
  }
  const jobId = makeJobId();
  const res = await api.streamlines({ ...req, jobId });
  if (!res || res.ok === false) {
    return { ok: false, error: res?.error ?? "VTK streamlines failed" };
  }
  if (!Array.isArray(res.lines)) {
    return { ok: false, error: "VTK streamlines returned empty data" };
  }
  return { ok: true, lines: res.lines };
}
