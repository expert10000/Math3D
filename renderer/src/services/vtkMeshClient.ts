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
      positions: Float32Array;
      indices: Uint32Array;
      normals?: Float32Array;
      vertexCount: number;
      triCount: number;
    }
  | { ok: false; error: string };

function makeJobId() {
  const c: any = globalThis.crypto;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : `${Date.now()}_${Math.random()}`;
}

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

async function runVtk(op: "cleanNormals" | "decimate" | "smooth", req: Omit<VtkMeshRequest, "jobId">): Promise<VtkMeshResponse> {
  const api = (window as any).vtkMesh;
  if (!api || typeof api[op] !== "function") return { ok: false, error: "VTK IPC unavailable" };
  const jobId = makeJobId();
  const res = await api[op]({ ...req, jobId });
  if (!res || res.ok === false) {
    return { ok: false, error: res?.error ?? "VTK worker failed" };
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
