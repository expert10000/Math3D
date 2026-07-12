const proxyBaseRaw = (import.meta as any)?.env?.VITE_MATH3D_WORKER_PROXY_BASE as string | undefined;
const proxyEnabledRaw = (import.meta as any)?.env?.VITE_MATH3D_WORKER_PROXY_ENABLED as string | undefined;

const isStaticGithubPagesHost = () =>
  typeof window !== "undefined" && window.location.hostname.toLowerCase().endsWith(".github.io");

const proxyEnabled =
  proxyEnabledRaw == null
    ? !isStaticGithubPagesHost()
    : !["0", "false", "no", "off"].includes(String(proxyEnabledRaw).toLowerCase());

const proxyBase = (proxyBaseRaw || "/api/worker").replace(/\/+$/, "");

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

const encodeBase64 = (data: ArrayBuffer | ArrayBufferView): string => {
  const bytes = toByteView(data);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
};

const decodeBase64 = (base64: string): ArrayBuffer => {
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

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
    const payload = {
      jobId: req.jobId,
      options: req.options || {},
      positions_b64: encodeBase64(req.positions),
      indices_b64: encodeBase64(req.indices),
    };
    const res = await requestJson<any>("POST", path, payload);
    if (!res?.ok) return { ok: false, error: res?.error || "VTK proxy failed" };
    return {
      ok: true,
      positions: decodeBase64(String(res.positions_b64 || "")),
      indices: decodeBase64(String(res.indices_b64 || "")),
      normals: res.normals_b64 ? decodeBase64(String(res.normals_b64)) : undefined,
      vertexCount: Number(res.vertexCount) || 0,
      triCount: Number(res.triCount) || 0,
    };
  };
  const withBooleanBuffers = async (path: string, req: any) => {
    const payload = {
      jobId: req.jobId,
      operation: req.operation,
      options: req.options || {},
      positionsA_b64: encodeBase64(req.positionsA),
      indicesA_b64: encodeBase64(req.indicesA),
      positionsB_b64: encodeBase64(req.positionsB),
      indicesB_b64: encodeBase64(req.indicesB),
    };
    const res = await requestJson<any>("POST", path, payload);
    if (!res?.ok) return { ok: false, error: res?.error || "VTK proxy failed" };
    return {
      ok: true,
      positions: decodeBase64(String(res.positions_b64 || "")),
      indices: decodeBase64(String(res.indices_b64 || "")),
      normals: res.normals_b64 ? decodeBase64(String(res.normals_b64)) : undefined,
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
        const res = await requestJson<any>("POST", "/vtk/preview", req);
        if (!res?.ok) return { ok: false, error: res?.error || "VTK preview failed" };
        return {
          ok: true,
          positions: decodeBase64(String(res.positions_b64 || "")),
          indices: decodeBase64(String(res.indices_b64 || "")),
          normals: res.normals_b64 ? decodeBase64(String(res.normals_b64)) : undefined,
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
        const payload = { ...req, scalars_b64: encodeBase64(req.scalars) };
        const res = await requestJson<any>("POST", "/volume/slice", payload);
        if (!res?.ok) return { ok: false, error: res?.error || "VTK volume slice failed" };
        return {
          ok: true,
          data: decodeBase64(String(res.data_b64 || "")),
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
        const payload = { ...req, scalars_b64: encodeBase64(req.scalars) };
        const res = await requestJson<any>("POST", "/volume/isosurface", payload);
        if (!res?.ok) return { ok: false, error: res?.error || "VTK volume isosurface failed" };
        return {
          ok: true,
          positions: decodeBase64(String(res.positions_b64 || "")),
          indices: decodeBase64(String(res.indices_b64 || "")),
          normals: res.normals_b64 ? decodeBase64(String(res.normals_b64)) : undefined,
          vertexCount: Number(res.vertexCount) || 0,
          triCount: Number(res.triCount) || 0,
        };
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK volume proxy unavailable") };
      }
    },
    distanceField: async (req: any) => {
      try {
        const payload = {
          ...req,
          positions_b64: encodeBase64(req.positions),
          indices_b64: encodeBase64(req.indices),
        };
        const res = await requestJson<any>("POST", "/volume/distance", payload);
        if (!res?.ok) return { ok: false, error: res?.error || "VTK volume distance failed" };
        return {
          ok: true,
          scalars: decodeBase64(String(res.scalars_b64 || "")),
          dims: Array.isArray(res.dims) ? res.dims : req.dims,
        };
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK volume proxy unavailable") };
      }
    },
    streamlines: async (req: any) => {
      try {
        const payload = { ...req, vectors_b64: encodeBase64(req.vectors) };
        return await requestJson<any>("POST", "/volume/streamlines", payload);
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
  const win = window as Window & typeof globalThis;

  installCgalBridge(win);
  installVtkMeshBridge(win);
  installVtkVolumeBridge(win);
  installDiagnosticsBridge(win);
}
