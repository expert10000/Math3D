import type {
  CgalHealthResponse,
  CgalMeshRequest,
  CgalMeshResponse,
  GeodesicHeatRequest,
  GeodesicHeatResponse,
  VtkMeshResponse,
  VtkPreviewRequest,
  VtkVolumeIsosurfaceRequest,
  VtkVolumeIsosurfaceResponse,
} from "@math3d/core";

export interface MobileMeshBackend {
  health(): Promise<CgalHealthResponse>;
  generateImplicitMesh(request: Omit<CgalMeshRequest, "jobId">): Promise<CgalMeshResponse>;
  previewImplicit(request: Omit<VtkPreviewRequest, "jobId">): Promise<VtkMeshResponse>;
  volumeIsosurface(
    request: Omit<VtkVolumeIsosurfaceRequest, "jobId">
  ): Promise<VtkVolumeIsosurfaceResponse>;
  geodesicHeat(request: Omit<GeodesicHeatRequest, "jobId">): Promise<GeodesicHeatResponse>;
}

type JsonRecord = Record<string, unknown>;

const defaultHeaders = {
  "Content-Type": "application/json",
};

type VtkProxyResponse =
  | {
      ok: true;
      positions_b64: string;
      indices_b64: string;
      normals_b64?: string;
      vertexCount?: number;
      triCount?: number;
    }
  | { ok: false; error: string };

const decodeBase64ToArrayBuffer = (value: string): ArrayBuffer => {
  const source = value || "";
  const maybeAtob = (globalThis as { atob?: (input: string) => string }).atob;
  const binary =
    typeof maybeAtob === "function"
      ? maybeAtob(source)
      : (() => {
          throw new Error("Base64 decoder is not available in this runtime.");
        })();
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const postJson = async <T>(baseUrl: string, path: string, body: JsonRecord): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: defaultHeaders,
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || payload == null) {
    throw new Error(`Request failed: ${path} (${response.status})`);
  }
  return payload;
};

const getJson = async <T>(baseUrl: string, path: string): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: defaultHeaders,
  });
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || payload == null) {
    throw new Error(`Request failed: ${path} (${response.status})`);
  }
  return payload;
};

const toVtkMeshResponse = (payload: VtkProxyResponse): VtkMeshResponse => {
  if (!payload.ok) return payload;
  return {
    ok: true,
    positions: decodeBase64ToArrayBuffer(payload.positions_b64),
    indices: decodeBase64ToArrayBuffer(payload.indices_b64),
    normals: payload.normals_b64 ? decodeBase64ToArrayBuffer(payload.normals_b64) : undefined,
    vertexCount: Number(payload.vertexCount) || 0,
    triCount: Number(payload.triCount) || 0,
  };
};

export const createMobileMeshBackend = (baseUrl: string): MobileMeshBackend => ({
  health() {
    return getJson<CgalHealthResponse>(baseUrl, "/cgal/health");
  },
  generateImplicitMesh(request) {
    return postJson<CgalMeshResponse>(baseUrl, "/cgal/mesh", request as JsonRecord);
  },
  async previewImplicit(request) {
    const payload = await postJson<VtkProxyResponse>(baseUrl, "/vtk/preview", request as JsonRecord);
    return toVtkMeshResponse(payload);
  },
  volumeIsosurface(request) {
    return postJson<VtkVolumeIsosurfaceResponse>(baseUrl, "/volume/isosurface", request as JsonRecord);
  },
  geodesicHeat(request) {
    return postJson<GeodesicHeatResponse>(baseUrl, "/cgal/geodesic-heat", request as JsonRecord);
  },
});
