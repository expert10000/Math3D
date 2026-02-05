import type { SliceAxis } from "../scene/volume/sliceVolume";

export type VtkVolumeSliceRequest = {
  jobId: string;
  dims: [number, number, number];
  scalars: ArrayBuffer | ArrayBufferView;
  axis: SliceAxis;
  index: number;
  spacing?: [number, number, number];
  origin?: [number, number, number];
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
