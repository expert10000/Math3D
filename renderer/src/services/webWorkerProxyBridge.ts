import { bumpMemoryCounter, setMemoryGauge } from "../diagnostics/memoryDiagnostics";

const proxyBaseRaw = (import.meta as any)?.env?.VITE_MATH3D_WORKER_PROXY_BASE as string | undefined;
const proxyEnabledRaw = (import.meta as any)?.env?.VITE_MATH3D_WORKER_PROXY_ENABLED as string | undefined;

const proxyEnabled =
  proxyEnabledRaw == null
    ? true
    : !["0", "false", "no", "off"].includes(String(proxyEnabledRaw).toLowerCase());

const proxyBase = (proxyBaseRaw || "/api/worker").replace(/\/+$/, "");
const BINARY_CONTENT_TYPE = "application/x-math3d-binary";

const isStaticPagesHost = (): boolean => {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname.toLowerCase();
  return hostname.endsWith(".github.io");
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const asErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
};

const toByteView = (data: ArrayBuffer | ArrayBufferView): Uint8Array => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
};

type BinaryPart = {
  name: string;
  data: ArrayBuffer | ArrayBufferView;
};

const asArrayBuffer = (data: ArrayBuffer | ArrayBufferView): ArrayBuffer => {
  if (data instanceof ArrayBuffer) return data;
  const view = toByteView(data);
  if (view.byteOffset === 0 && view.byteLength === view.buffer.byteLength) {
    return view.buffer as ArrayBuffer;
  }
  return view.slice().buffer;
};

const decodeBinaryEnvelope = (buffer: ArrayBuffer): any => {
  if (buffer.byteLength < 4) throw new Error("Invalid binary worker response");
  const headerLength = new DataView(buffer, 0, 4).getUint32(0, true);
  if (headerLength < 2 || 4 + headerLength > buffer.byteLength) {
    throw new Error("Invalid binary worker response header");
  }
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength)));
  const payloads: Record<string, ArrayBuffer> = {};
  let offset = 4 + headerLength;
  for (const part of Array.isArray(header?.binary) ? header.binary : []) {
    const bytes = Number(part?.bytes || 0);
    const name = String(part?.name || "");
    if (!name || bytes < 0 || offset + bytes > buffer.byteLength) {
      throw new Error("Invalid binary worker response payload");
    }
    payloads[name] = buffer.slice(offset, offset + bytes);
    offset += bytes;
  }
  const { binary: _binary, ...metadata } = header;
  return { ...metadata, binaryPayloads: payloads };
};

async function requestBinary<T>(
  path: string,
  metadata: Record<string, unknown>,
  parts: BinaryPart[] = []
): Promise<T> {
  const normalizedParts = parts.map((part) => ({ ...part, buffer: asArrayBuffer(part.data) }));
  const headerBytes = new TextEncoder().encode(
    JSON.stringify({
      ...metadata,
      binary: normalizedParts.map((part) => ({ name: part.name, bytes: part.buffer.byteLength })),
    })
  );
  const prefix = new Uint8Array(4);
  new DataView(prefix.buffer).setUint32(0, headerBytes.byteLength, true);
  const requestBytes =
    prefix.byteLength +
    headerBytes.byteLength +
    normalizedParts.reduce((sum, part) => sum + part.buffer.byteLength, 0);
  bumpMemoryCounter("transport.binaryRequests");
  bumpMemoryCounter("transport.binaryBytesSent", requestBytes);
  setMemoryGauge("transport.lastRequestBytes", requestBytes);
  const response = await fetch(`${proxyBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": BINARY_CONTENT_TYPE,
      Accept: `${BINARY_CONTENT_TYPE}, application/json`,
    },
    body: new Blob([prefix.buffer, headerBytes.buffer, ...normalizedParts.map((part) => part.buffer)]),
  });
  const contentType = response.headers.get("content-type") || "";
  let data: any;
  if (contentType.includes(BINARY_CONTENT_TYPE)) {
    const responseBuffer = await response.arrayBuffer();
    bumpMemoryCounter("transport.binaryResponses");
    bumpMemoryCounter("transport.binaryBytesReceived", responseBuffer.byteLength);
    setMemoryGauge("transport.lastResponseBytes", responseBuffer.byteLength);
    data = decodeBinaryEnvelope(responseBuffer);
  } else {
    data = await response.json().catch(() => null);
  }
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data as T;
}

async function requestJson<T>(method: "GET" | "POST", path: string, body?: Record<string, JsonValue>): Promise<T> {
  const response = await fetch(`${proxyBase}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });

  const data = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    const msg = data?.error || `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return data as T;
}

function installCgalBridge(win: Window & typeof globalThis) {
  if ((win as any).cgalMesh) return;
  (win as any).cgalMesh = {
    ping: async () => {
      try {
        return await requestJson<{ ok: boolean; pong?: boolean; error?: string }>("POST", "/cgal/ping");
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "CGAL proxy unavailable") };
      }
    },
    version: async () => {
      try {
        return await requestJson<{ ok: boolean; version?: string; protocol?: string; error?: string }>("GET", "/cgal/version");
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "CGAL proxy unavailable") };
      }
    },
    health: async () => {
      try {
        return await requestJson<{ ok: boolean; error?: string }>("GET", "/cgal/health");
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "CGAL proxy unavailable") };
      }
    },
    mesh: async (req: any) => {
      try {
        return await requestJson<any>("POST", "/cgal/mesh", req);
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "CGAL proxy unavailable") };
      }
    },
    geodesicHeat: async (req: any) => {
      try {
        return await requestJson<any>("POST", "/cgal/geodesic-heat", req);
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "CGAL proxy unavailable") };
      }
    },
    stop: async () => {
      try {
        return await requestJson<{ ok: boolean; error?: string }>("POST", "/cgal/stop");
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "CGAL proxy unavailable") };
      }
    },
  };
}

function installVtkMeshBridge(win: Window & typeof globalThis) {
  if ((win as any).vtkMesh) return;

  const withMeshBuffers = async (path: string, req: any) => {
    const res = await requestBinary<any>(path, {
      jobId: req.jobId,
      options: req.options || {},
    }, [
      { name: "positions", data: req.positions },
      { name: "indices", data: req.indices },
    ]);
    if (!res?.ok) return { ok: false, error: res?.error || "VTK proxy failed" };
    const binary = res.binaryPayloads || {};
    return {
      ok: true,
      positions: binary.positions,
      indices: binary.indices,
      normals: binary.normals,
      vertexCount: Number(res.vertexCount) || 0,
      triCount: Number(res.triCount) || 0,
    };
  };
  const withBooleanBuffers = async (path: string, req: any) => {
    const res = await requestBinary<any>(path, {
      jobId: req.jobId,
      operation: req.operation,
      options: req.options || {},
    }, [
      { name: "positionsA", data: req.positionsA },
      { name: "indicesA", data: req.indicesA },
      { name: "positionsB", data: req.positionsB },
      { name: "indicesB", data: req.indicesB },
    ]);
    if (!res?.ok) return { ok: false, error: res?.error || "VTK proxy failed" };
    const binary = res.binaryPayloads || {};
    return {
      ok: true,
      positions: binary.positions,
      indices: binary.indices,
      normals: binary.normals,
      vertexCount: Number(res.vertexCount) || 0,
      triCount: Number(res.triCount) || 0,
    };
  };

  (win as any).vtkMesh = {
    cleanNormals: async (req: any) => {
      try {
        return await withMeshBuffers("/vtk/clean", req);
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK proxy unavailable") };
      }
    },
    decimate: async (req: any) => {
      try {
        return await withMeshBuffers("/vtk/decimate", req);
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK proxy unavailable") };
      }
    },
    smooth: async (req: any) => {
      try {
        return await withMeshBuffers("/vtk/smooth", req);
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK proxy unavailable") };
      }
    },
    boolean: async (req: any) => {
      try {
        return await withBooleanBuffers("/vtk/boolean", req);
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK proxy unavailable") };
      }
    },
    previewImplicit: async (req: any) => {
      try {
        const res = await requestBinary<any>("/vtk/preview", req);
        if (!res?.ok) return { ok: false, error: res?.error || "VTK preview failed" };
        const binary = res.binaryPayloads || {};
        return {
          ok: true,
          positions: binary.positions,
          indices: binary.indices,
          normals: binary.normals,
          vertexCount: Number(res.vertexCount) || 0,
          triCount: Number(res.triCount) || 0,
        };
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK proxy unavailable") };
      }
    },
  };
}

function installVtkVolumeBridge(win: Window & typeof globalThis) {
  if ((win as any).vtkVolume) return;
  (win as any).vtkVolume = {
    slice: async (req: any) => {
      try {
        const { scalars, ...metadata } = req;
        const res = await requestBinary<any>("/volume/slice", metadata, [{ name: "scalars", data: scalars }]);
        if (!res?.ok) return { ok: false, error: res?.error || "VTK volume slice failed" };
        const binary = res.binaryPayloads || {};
        return {
          ok: true,
          data: binary.data,
          width: Number(res.width) || 0,
          height: Number(res.height) || 0,
          format: "rgba8",
          min: typeof res.min === "number" ? res.min : undefined,
          max: typeof res.max === "number" ? res.max : undefined,
        };
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK volume proxy unavailable") };
      }
    },
    isosurface: async (req: any) => {
      try {
        const { scalars, ...metadata } = req;
        const res = await requestBinary<any>("/volume/isosurface", metadata, [{ name: "scalars", data: scalars }]);
        if (!res?.ok) return { ok: false, error: res?.error || "VTK volume isosurface failed" };
        const binary = res.binaryPayloads || {};
        return {
          ok: true,
          positions: binary.positions,
          indices: binary.indices,
          normals: binary.normals,
          vertexCount: Number(res.vertexCount) || 0,
          triCount: Number(res.triCount) || 0,
        };
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK volume proxy unavailable") };
      }
    },
    distanceField: async (req: any) => {
      try {
        const { positions, indices, ...metadata } = req;
        const res = await requestBinary<any>("/volume/distance", metadata, [
          { name: "positions", data: positions },
          { name: "indices", data: indices },
        ]);
        if (!res?.ok) return { ok: false, error: res?.error || "VTK volume distance failed" };
        return {
          ok: true,
          scalars: res.binaryPayloads?.scalars,
          dims: Array.isArray(res.dims) ? res.dims : req.dims,
        };
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK volume proxy unavailable") };
      }
    },
    streamlines: async (req: any) => {
      try {
        const { vectors, ...metadata } = req;
        return await requestBinary<any>("/volume/streamlines", metadata, [{ name: "vectors", data: vectors }]);
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK volume proxy unavailable") };
      }
    },
  };
}

function installDiagnosticsBridge(win: Window & typeof globalThis) {
  if ((win as any).pythonWorkerDiagnostics) return;
  (win as any).pythonWorkerDiagnostics = {
    getStatus: async () => {
      return requestJson<any>("GET", "/diagnostics");
    },
  };
}

export function installWebWorkerProxyBridge() {
  if (!proxyEnabled) return;
  if (typeof window === "undefined") return;
  if (isStaticPagesHost()) return;
  const win = window as Window & typeof globalThis;

  installCgalBridge(win);
  installVtkMeshBridge(win);
  installVtkVolumeBridge(win);
  installDiagnosticsBridge(win);
}
