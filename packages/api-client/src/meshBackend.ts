import { decode as decodeBase64String, encode as encodeBase64String } from "base-64";
import type {
  CgalHealthResponse,
  CgalMeshRequest,
  CgalMeshResponse,
  CgalValidateMeshRequest,
  CgalValidateMeshResponse,
  CgalPingResponse,
  CgalStopResponse,
  CgalVersionResponse,
  GeodesicHeatRequest,
  GeodesicHeatResponse,
  MeshBackendCapabilities,
  VtkBooleanRequest,
  VtkMeshRequest,
  VtkMeshResponse,
  VtkPreviewRequest,
  VtkVolumeDistanceRequest,
  VtkVolumeDistanceResponse,
  VtkVolumeIsosurfaceRequest,
  VtkVolumeIsosurfaceResponse,
  VtkVolumeSliceRequest,
  VtkVolumeSliceResponse,
  VtkVolumeStreamlinesRequest,
  VtkVolumeStreamlinesResponse,
} from "./contracts";

export interface MeshBackend {
  getCapabilities(): MeshBackendCapabilities;
  cgalHealth(): Promise<CgalHealthResponse>;
  cgalPing(): Promise<CgalPingResponse>;
  cgalVersion(): Promise<CgalVersionResponse>;
  stopCgalWorker(): Promise<CgalStopResponse>;
  runCgalMesh(req: Omit<CgalMeshRequest, "jobId">): Promise<CgalMeshResponse>;
  runCgalValidateMesh(req: Omit<CgalValidateMeshRequest, "jobId">): Promise<CgalValidateMeshResponse>;
  runGeodesicHeat(req: Omit<GeodesicHeatRequest, "jobId">): Promise<GeodesicHeatResponse>;
  vtkPreviewImplicit(req: Omit<VtkPreviewRequest, "jobId">): Promise<VtkMeshResponse>;
  vtkCleanNormals(req: Omit<VtkMeshRequest, "jobId">): Promise<VtkMeshResponse>;
  vtkDecimate(req: Omit<VtkMeshRequest, "jobId">): Promise<VtkMeshResponse>;
  vtkSmooth(req: Omit<VtkMeshRequest, "jobId">): Promise<VtkMeshResponse>;
  vtkBoolean(req: Omit<VtkBooleanRequest, "jobId">): Promise<VtkMeshResponse>;
  vtkVolumeSlice(req: Omit<VtkVolumeSliceRequest, "jobId">): Promise<VtkVolumeSliceResponse>;
  vtkVolumeIsosurface(req: Omit<VtkVolumeIsosurfaceRequest, "jobId">): Promise<VtkVolumeIsosurfaceResponse>;
  vtkVolumeDistance(req: Omit<VtkVolumeDistanceRequest, "jobId">): Promise<VtkVolumeDistanceResponse>;
  vtkVolumeStreamlines(req: Omit<VtkVolumeStreamlinesRequest, "jobId">): Promise<VtkVolumeStreamlinesResponse>;
}

export type HttpMeshBackendOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type JsonRecord = Record<string, JsonValue>;

type VtkMeshProxyResponse =
  | {
      ok: true;
      positions_b64: string;
      indices_b64: string;
      normals_b64?: string;
      vertexCount?: number;
      triCount?: number;
    }
  | { ok: false; error: string };

type VtkVolumeSliceProxyResponse =
  | {
      ok: true;
      data_b64: string;
      width: number;
      height: number;
      format?: "rgba8";
      min?: number;
      max?: number;
    }
  | { ok: false; error: string };

type VtkVolumeDistanceProxyResponse =
  | {
      ok: true;
      scalars_b64: string;
      dims: [number, number, number];
    }
  | { ok: false; error: string };

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const makeJobId = () => {
  const c: Crypto | undefined = (globalThis as { crypto?: Crypto }).crypto;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : `${Date.now()}_${Math.random()}`;
};

const getWindowObject = (): Window | undefined => {
  if (typeof globalThis.window === "undefined") return undefined;
  return globalThis.window;
};

const capabilitySnapshot = (win: any): MeshBackendCapabilities => ({
  cgalHealth: typeof win?.cgalMesh?.health === "function",
  cgalMesh: typeof win?.cgalMesh?.mesh === "function",
  cgalGeodesicHeat: typeof win?.cgalMesh?.geodesicHeat === "function",
  vtkPreviewImplicit: typeof win?.vtkMesh?.previewImplicit === "function",
  vtkMeshCleanNormals: typeof win?.vtkMesh?.cleanNormals === "function",
  vtkMeshDecimate: typeof win?.vtkMesh?.decimate === "function",
  vtkMeshSmooth: typeof win?.vtkMesh?.smooth === "function",
  vtkMeshBoolean: typeof win?.vtkMesh?.boolean === "function",
  vtkVolumeSlice: typeof win?.vtkVolume?.slice === "function",
  vtkVolumeIsosurface: typeof win?.vtkVolume?.isosurface === "function",
  vtkVolumeDistance: typeof win?.vtkVolume?.distanceField === "function",
  vtkVolumeStreamlines: typeof win?.vtkVolume?.streamlines === "function",
});

const toByteView = (data: ArrayBuffer | ArrayBufferView): Uint8Array => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
};

const toBinaryString = (data: ArrayBuffer | ArrayBufferView): string => {
  const bytes = toByteView(data);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const part = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...part);
  }
  return binary;
};

const encodeBase64 = (data: ArrayBuffer | ArrayBufferView): string => encodeBase64String(toBinaryString(data));

const decodeBase64 = (base64: string): ArrayBuffer => {
  const binary = decodeBase64String(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const asErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
};

const withJobId = <T extends JsonRecord>(payload: T): T & { jobId: string } => ({ ...payload, jobId: makeJobId() });

const parseJsonResponse = async <T>(response: Response, path: string): Promise<T> => {
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    const msg =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${response.status} (${path})`;
    throw new HttpError(response.status, msg);
  }
  if (payload == null) {
    throw new Error(`Empty response from ${path}`);
  }
  return payload as T;
};

const shouldRetry = (error: unknown, attempt: number, retries: number): boolean => {
  if (attempt >= retries) return false;
  if (error instanceof HttpError) return error.status >= 500;
  if (error instanceof Error && error.name === "AbortError") return true;
  return true;
};

const createHttpRequester = (baseUrl: string, options?: HttpMeshBackendOptions) => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const retries = Math.max(0, options?.retries ?? 1);
  const retryDelayMs = Math.max(0, options?.retryDelayMs ?? 500);

  const requestJson = async <T>(
    method: "GET" | "POST",
    path: string,
    body?: JsonRecord
  ): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${normalizedBaseUrl}${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body == null ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        return await parseJsonResponse<T>(response, path);
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
        if (!shouldRetry(error, attempt, retries)) {
          throw error;
        }
        await sleep(retryDelayMs * (attempt + 1));
      }
    }
    throw lastError;
  };

  return {
    getJson<T>(path: string): Promise<T> {
      return requestJson<T>("GET", path);
    },
    postJson<T>(path: string, body?: JsonRecord): Promise<T> {
      return requestJson<T>("POST", path, body);
    },
  };
};

const toVtkMeshResponse = (payload: VtkMeshProxyResponse): VtkMeshResponse => {
  if (!payload.ok) return { ok: false, error: payload.error || "VTK request failed" };
  return {
    ok: true,
    positions: decodeBase64(payload.positions_b64),
    indices: decodeBase64(payload.indices_b64),
    normals: payload.normals_b64 ? decodeBase64(payload.normals_b64) : undefined,
    vertexCount: Number(payload.vertexCount) || 0,
    triCount: Number(payload.triCount) || 0,
  };
};

export function createElectronMeshBackend(): MeshBackend {
  return {
    getCapabilities() {
      return capabilitySnapshot(getWindowObject());
    },
    async cgalHealth() {
      const api = (getWindowObject() as any)?.cgalMesh;
      if (!api?.health) return { ok: false, error: "CGAL IPC unavailable" };
      return api.health();
    },
    async cgalPing() {
      const api = (getWindowObject() as any)?.cgalMesh;
      if (!api?.ping) return { ok: false, error: "CGAL IPC unavailable" };
      return api.ping();
    },
    async cgalVersion() {
      const api = (getWindowObject() as any)?.cgalMesh;
      if (!api?.version) return { ok: false, error: "CGAL IPC unavailable" };
      return api.version();
    },
    async stopCgalWorker() {
      const api = (getWindowObject() as any)?.cgalMesh;
      if (!api?.stop) return { ok: false, error: "CGAL IPC unavailable" };
      return api.stop();
    },
    async runCgalMesh(req) {
      const api = (getWindowObject() as any)?.cgalMesh;
      if (!api?.mesh) return { ok: false, error: "CGAL IPC unavailable" };
      return api.mesh({ ...req, jobId: makeJobId() });
    },
    async runCgalValidateMesh(req) {
      const api = (getWindowObject() as any)?.cgalMesh;
      if (!api?.validateMesh) return { ok: false, error: "CGAL validation IPC unavailable" };
      return api.validateMesh({ ...req, jobId: makeJobId() });
    },
    async runGeodesicHeat(req) {
      const api = (getWindowObject() as any)?.cgalMesh;
      if (!api?.geodesicHeat) return { ok: false, error: "Geodesic heat IPC unavailable" };
      return api.geodesicHeat({ ...req, jobId: makeJobId() });
    },
    async vtkPreviewImplicit(req) {
      const api = (getWindowObject() as any)?.vtkMesh;
      if (!api?.previewImplicit) return { ok: false, error: "VTK IPC unavailable" };
      return api.previewImplicit({ ...req, jobId: makeJobId() });
    },
    async vtkCleanNormals(req) {
      const api = (getWindowObject() as any)?.vtkMesh;
      if (!api?.cleanNormals) return { ok: false, error: "VTK IPC unavailable" };
      return api.cleanNormals({ ...req, jobId: makeJobId() });
    },
    async vtkDecimate(req) {
      const api = (getWindowObject() as any)?.vtkMesh;
      if (!api?.decimate) return { ok: false, error: "VTK IPC unavailable" };
      return api.decimate({ ...req, jobId: makeJobId() });
    },
    async vtkSmooth(req) {
      const api = (getWindowObject() as any)?.vtkMesh;
      if (!api?.smooth) return { ok: false, error: "VTK IPC unavailable" };
      return api.smooth({ ...req, jobId: makeJobId() });
    },
    async vtkBoolean(req) {
      const api = (getWindowObject() as any)?.vtkMesh;
      if (!api?.boolean) return { ok: false, error: "VTK IPC unavailable" };
      return api.boolean({ ...req, jobId: makeJobId() });
    },
    async vtkVolumeSlice(req) {
      const api = (getWindowObject() as any)?.vtkVolume;
      if (!api?.slice) return { ok: false, error: "VTK volume IPC unavailable" };
      return api.slice({ ...req, jobId: makeJobId() });
    },
    async vtkVolumeIsosurface(req) {
      const api = (getWindowObject() as any)?.vtkVolume;
      if (!api?.isosurface) return { ok: false, error: "VTK volume IPC unavailable" };
      return api.isosurface({ ...req, jobId: makeJobId() });
    },
    async vtkVolumeDistance(req) {
      const api = (getWindowObject() as any)?.vtkVolume;
      if (!api?.distanceField) return { ok: false, error: "VTK volume IPC unavailable" };
      return api.distanceField({ ...req, jobId: makeJobId() });
    },
    async vtkVolumeStreamlines(req) {
      const api = (getWindowObject() as any)?.vtkVolume;
      if (!api?.streamlines) return { ok: false, error: "VTK volume IPC unavailable" };
      return api.streamlines({ ...req, jobId: makeJobId() });
    },
  };
}

export function createHttpMeshBackend(baseUrl: string, options?: HttpMeshBackendOptions): MeshBackend {
  const http = createHttpRequester(baseUrl, options);

  const meshPayload = (req: Omit<VtkMeshRequest, "jobId">): JsonRecord => ({
    ...withJobId(req as unknown as JsonRecord),
    positions_b64: encodeBase64(req.positions),
    indices_b64: encodeBase64(req.indices),
  });
  const booleanPayload = (req: Omit<VtkBooleanRequest, "jobId">): JsonRecord => ({
    ...withJobId(req as unknown as JsonRecord),
    positionsA_b64: encodeBase64(req.positionsA),
    indicesA_b64: encodeBase64(req.indicesA),
    positionsB_b64: encodeBase64(req.positionsB),
    indicesB_b64: encodeBase64(req.indicesB),
  });

  return {
    getCapabilities() {
      return {
        cgalHealth: true,
        cgalMesh: true,
        cgalGeodesicHeat: true,
        vtkPreviewImplicit: true,
        vtkMeshCleanNormals: true,
        vtkMeshDecimate: true,
        vtkMeshSmooth: true,
        vtkMeshBoolean: true,
        vtkVolumeSlice: true,
        vtkVolumeIsosurface: true,
        vtkVolumeDistance: true,
        vtkVolumeStreamlines: true,
      };
    },
    async cgalHealth() {
      try {
        return await http.getJson<CgalHealthResponse>("/cgal/health");
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "CGAL health request failed") };
      }
    },
    async cgalPing() {
      try {
        return await http.postJson<CgalPingResponse>("/cgal/ping");
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "CGAL ping request failed") };
      }
    },
    async cgalVersion() {
      try {
        return await http.getJson<CgalVersionResponse>("/cgal/version");
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "CGAL version request failed") };
      }
    },
    async stopCgalWorker() {
      try {
        return await http.postJson<CgalStopResponse>("/cgal/stop");
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "CGAL stop request failed") };
      }
    },
    async runCgalMesh(req) {
      try {
        return await http.postJson<CgalMeshResponse>("/cgal/mesh", withJobId(req as unknown as JsonRecord));
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "CGAL mesh request failed") };
      }
    },
    async runCgalValidateMesh() {
      return { ok: false, error: "CGAL validation proxy unavailable" };
    },
    async runGeodesicHeat(req) {
      try {
        return await http.postJson<GeodesicHeatResponse>(
          "/cgal/geodesic-heat",
          withJobId(req as unknown as JsonRecord)
        );
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "Geodesic heat request failed") };
      }
    },
    async vtkPreviewImplicit(req) {
      try {
        const payload = await http.postJson<VtkMeshProxyResponse>(
          "/vtk/preview",
          withJobId(req as unknown as JsonRecord)
        );
        return toVtkMeshResponse(payload);
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK preview request failed") };
      }
    },
    async vtkCleanNormals(req) {
      try {
        const payload = await http.postJson<VtkMeshProxyResponse>("/vtk/clean", meshPayload(req));
        return toVtkMeshResponse(payload);
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK clean normals request failed") };
      }
    },
    async vtkDecimate(req) {
      try {
        const payload = await http.postJson<VtkMeshProxyResponse>("/vtk/decimate", meshPayload(req));
        return toVtkMeshResponse(payload);
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK decimate request failed") };
      }
    },
    async vtkSmooth(req) {
      try {
        const payload = await http.postJson<VtkMeshProxyResponse>("/vtk/smooth", meshPayload(req));
        return toVtkMeshResponse(payload);
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK smooth request failed") };
      }
    },
    async vtkBoolean(req) {
      try {
        const payload = await http.postJson<VtkMeshProxyResponse>("/vtk/boolean", booleanPayload(req));
        return toVtkMeshResponse(payload);
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK boolean request failed") };
      }
    },
    async vtkVolumeSlice(req) {
      try {
        const payload = await http.postJson<VtkVolumeSliceProxyResponse>("/volume/slice", {
          ...withJobId(req as unknown as JsonRecord),
          scalars_b64: encodeBase64(req.scalars),
        });
        if (!payload.ok) return { ok: false, error: payload.error || "VTK volume slice failed" };
        return {
          ok: true,
          data: decodeBase64(payload.data_b64),
          width: Number(payload.width) || 0,
          height: Number(payload.height) || 0,
          format: payload.format || "rgba8",
          min: typeof payload.min === "number" ? payload.min : undefined,
          max: typeof payload.max === "number" ? payload.max : undefined,
        };
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK volume slice request failed") };
      }
    },
    async vtkVolumeIsosurface(req) {
      try {
        const payload = await http.postJson<VtkMeshProxyResponse>("/volume/isosurface", {
          ...withJobId(req as unknown as JsonRecord),
          scalars_b64: encodeBase64(req.scalars),
        });
        return toVtkMeshResponse(payload);
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK volume isosurface request failed") };
      }
    },
    async vtkVolumeDistance(req) {
      try {
        const payload = await http.postJson<VtkVolumeDistanceProxyResponse>("/volume/distance", {
          ...withJobId(req as unknown as JsonRecord),
          positions_b64: encodeBase64(req.positions),
          indices_b64: encodeBase64(req.indices),
        });
        if (!payload.ok) return { ok: false, error: payload.error || "VTK volume distance failed" };
        return {
          ok: true,
          scalars: decodeBase64(payload.scalars_b64),
          dims: payload.dims,
        };
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK volume distance request failed") };
      }
    },
    async vtkVolumeStreamlines(req) {
      try {
        return await http.postJson<VtkVolumeStreamlinesResponse>("/volume/streamlines", {
          ...withJobId(req as unknown as JsonRecord),
          vectors_b64: encodeBase64(req.vectors),
        });
      } catch (error) {
        return { ok: false, error: asErrorMessage(error, "VTK volume streamlines request failed") };
      }
    },
  };
}

export const electronMeshBackend = createElectronMeshBackend();
