import type {
  VtkVolumeDistanceRequest,
  VtkVolumeIsosurfaceRequest,
  VtkVolumeSliceRequest,
  VtkVolumeStreamlinesRequest,
} from "@math3d/api-client";
import { getMeshBackendCapabilities, meshBackend } from "./meshBackend";

export type {
  VtkVolumeDistanceRequest,
  VtkVolumeIsosurfaceRequest,
  VtkVolumeSliceRequest,
  VtkVolumeStreamlinesRequest,
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

export type VtkVolumeDistanceResponse =
  | {
      ok: true;
      scalars: Float32Array;
      dims: [number, number, number];
    }
  | { ok: false; error: string };

export type VtkVolumeStreamlinesResponse =
  | { ok: true; lines: [number, number, number][][] }
  | { ok: false; error: string };

export const supportsVtkVolumeSlice = (): boolean => getMeshBackendCapabilities().vtkVolumeSlice;
export const supportsVtkVolumeDistance = (): boolean => getMeshBackendCapabilities().vtkVolumeDistance;

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice().buffer;
}

export async function vtkVolumeSlice(
  req: Omit<VtkVolumeSliceRequest, "jobId">
): Promise<VtkVolumeSliceResponse> {
  const res = await meshBackend.vtkVolumeSlice(req);
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
  const res = await meshBackend.vtkVolumeIsosurface(req);
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
  const res = await meshBackend.vtkVolumeDistance(req);
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
  const res = await meshBackend.vtkVolumeStreamlines(req);
  if (!res || res.ok === false) {
    return { ok: false, error: res?.error ?? "VTK streamlines failed" };
  }
  if (!Array.isArray(res.lines)) {
    return { ok: false, error: "VTK streamlines returned empty data" };
  }
  return { ok: true, lines: res.lines };
}
