import type { VtkBooleanRequest, VtkMeshRequest, VtkPreviewRequest } from "@math3d/api-client";
import { meshBackend } from "./meshBackend";

export type { VtkBooleanRequest, VtkMeshRequest, VtkPreviewRequest };

export type VtkMeshResponse =
  | {
      ok: true;
      positions: Float32Array;
      indices: Uint32Array;
      normals?: Float32Array;
      vertexCount: number;
      triCount: number;
    }
  | { ok: false; error: string };

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

function toFloat32(data: ArrayBuffer | ArrayBufferView): Float32Array {
  const buf = toArrayBuffer(data);
  return new Float32Array(buf);
}

function toUint32(data: ArrayBuffer | ArrayBufferView): Uint32Array {
  const buf = toArrayBuffer(data);
  return new Uint32Array(buf);
}

function normalizeVtkMeshResponse(
  res: Awaited<ReturnType<typeof meshBackend.vtkSmooth>>,
  errorMessage: string
): VtkMeshResponse {
  if (!res || res.ok === false) {
    return { ok: false, error: res?.error ?? errorMessage };
  }
  return {
    ok: true,
    positions: toFloat32(res.positions),
    indices: toUint32(res.indices),
    normals: res.normals ? toFloat32(res.normals) : undefined,
    vertexCount: Number(res.vertexCount) || Math.floor(toArrayBuffer(res.positions).byteLength / 12),
    triCount: Number(res.triCount) || Math.floor(toArrayBuffer(res.indices).byteLength / 12),
  };
}

async function runVtk(op: "cleanNormals" | "decimate" | "smooth", req: Omit<VtkMeshRequest, "jobId">): Promise<VtkMeshResponse> {
  if (op === "cleanNormals") {
    return normalizeVtkMeshResponse(await meshBackend.vtkCleanNormals(req), "VTK worker failed");
  }
  if (op === "decimate") {
    return normalizeVtkMeshResponse(await meshBackend.vtkDecimate(req), "VTK worker failed");
  }
  return normalizeVtkMeshResponse(await meshBackend.vtkSmooth(req), "VTK worker failed");
}

export async function vtkPreviewImplicit(req: Omit<VtkPreviewRequest, "jobId">): Promise<VtkMeshResponse> {
  return normalizeVtkMeshResponse(await meshBackend.vtkPreviewImplicit(req), "VTK preview failed");
}

export async function vtkCleanNormals(
  positions: Float32Array,
  indices: Uint32Array,
  options?: VtkMeshRequest["options"]
): Promise<VtkMeshResponse> {
  return runVtk("cleanNormals", { positions, indices, options });
}

export async function vtkDecimate(
  positions: Float32Array,
  indices: Uint32Array,
  options?: VtkMeshRequest["options"]
): Promise<VtkMeshResponse> {
  return runVtk("decimate", { positions, indices, options });
}

export async function vtkSmooth(
  positions: Float32Array,
  indices: Uint32Array,
  options?: VtkMeshRequest["options"]
): Promise<VtkMeshResponse> {
  return runVtk("smooth", { positions, indices, options });
}

export async function vtkBoolean(req: Omit<VtkBooleanRequest, "jobId">): Promise<VtkMeshResponse> {
  return normalizeVtkMeshResponse(await meshBackend.vtkBoolean(req), "VTK boolean failed");
}
