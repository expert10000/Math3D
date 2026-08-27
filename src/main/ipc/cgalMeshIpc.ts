import { ipcMain } from "electron";
import { getPythonWorker, stopPythonWorker } from "../python/pythonWorker";
import {
  recordPythonWorkerFailure,
  recordPythonWorkerSuccess,
} from "../python/pythonWorkerDiagnostics";

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

export type CgalValidateMeshRequest = {
  jobId: string;
  positions: ArrayBuffer | ArrayBufferView | Buffer;
  indices: ArrayBuffer | ArrayBufferView | Buffer;
  options?: {
    selfIntersectionSampleLimit?: number;
  };
};

export type CgalValidateMeshResponse =
  | {
      ok: true;
      vertexCount: number;
      faceCount: number;
      edgeCount: number;
      componentCount: number;
      boundaryEdgeCount: number;
      nonManifoldEdgeCount: number;
      invalidFaceCount: number;
      degenerateFaceCount: number;
      duplicateFaceCount: number;
      watertight: boolean;
      manifold: boolean;
      oriented: boolean;
      selfIntersection: {
        checked: boolean;
        suspectedPairs: number;
        sampledFaces: number;
        truncated: boolean;
      };
      diagnostics: string[];
      warnings: string[];
    }
  | { ok: false; error: string };

export type CgalRepairMeshRequest = {
  jobId: string;
  positions: ArrayBuffer | ArrayBufferView | Buffer;
  indices: ArrayBuffer | ArrayBufferView | Buffer;
  options?: {
    orientFaces?: boolean;
    removeDegenerateFaces?: boolean;
    removeDuplicateFaces?: boolean;
    compactVertices?: boolean;
    fillSmallHoles?: boolean;
    maxHoleEdges?: number;
  };
};

export type CgalRepairSummary = {
  inputVertices: number;
  inputFaces: number;
  outputVertices: number;
  outputFaces: number;
  removedInvalidFaces: number;
  removedDegenerateFaces: number;
  removedDuplicateFaces: number;
  removedUnusedVertices: number;
  orientedComponents: number;
  filledHoles: number;
  diagnostics: string[];
  warnings: string[];
};

export type CgalRepairMeshResponse =
  | {
      ok: true;
      positions: ArrayBuffer | ArrayBufferView;
      indices: ArrayBuffer | ArrayBufferView;
      normals?: ArrayBuffer | ArrayBufferView;
      vertexCount: number;
      triCount: number;
      repair: CgalRepairSummary;
    }
  | { ok: false; error: string };

export type CgalRemeshMeshRequest = {
  jobId: string;
  positions: ArrayBuffer | ArrayBufferView | Buffer;
  indices: ArrayBuffer | ArrayBufferView | Buffer;
  options?: {
    targetEdgeLength?: number;
    iterations?: number;
    preserveSharpEdges?: boolean;
    smoothIterations?: number;
  };
};

export type CgalRemeshSummary = {
  inputVertices: number;
  inputFaces: number;
  outputVertices: number;
  outputFaces: number;
  targetEdgeLength: number;
  iterations: number;
  splitEdges: number;
  smoothedVertices: number;
  preservedVertices: number;
  diagnostics: string[];
  warnings: string[];
};

export type CgalRemeshMeshResponse =
  | {
      ok: true;
      positions: ArrayBuffer | ArrayBufferView;
      indices: ArrayBuffer | ArrayBufferView;
      normals?: ArrayBuffer | ArrayBufferView;
      vertexCount: number;
      triCount: number;
      remesh: CgalRemeshSummary;
    }
  | { ok: false; error: string };

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

export type CgalHealthResponse = { ok: true } | { ok: false; error: string };
export type PythonPingResponse = { ok: true; pong: boolean } | { ok: false; error: string };
export type PythonVersionResponse =
  | { ok: true; version: string; protocol: string }
  | { ok: false; error: string };

export function registerCgalMeshIpc() {
  ipcMain.handle("mesh:cgal:ping", async (): Promise<PythonPingResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.ping();
      recordPythonWorkerSuccess();
      return { ok: true, pong: !!res.pong };
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:cgal:ping", "WORKER_PING_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle("mesh:cgal:version", async (): Promise<PythonVersionResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.version();
      recordPythonWorkerSuccess({ version: res.version, protocol: res.protocol });
      return { ok: true, version: res.version, protocol: res.protocol };
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:cgal:version", "WORKER_VERSION_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle("mesh:cgal", async (_evt, req: CgalMeshRequest): Promise<CgalMeshResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.meshCgal(req);
      if (!res.ok) {
        const diag = recordPythonWorkerFailure(res.error, "mesh:cgal", "WORKER_OPERATION_FAILED");
        return { ok: false, error: diag.message };
      }
      recordPythonWorkerSuccess();
      return res;
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:cgal", "WORKER_OPERATION_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle("mesh:cgal:validate", async (_evt, req: CgalValidateMeshRequest): Promise<CgalValidateMeshResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.validateCgalMesh(req);
      if (!res.ok) {
        const diag = recordPythonWorkerFailure(res.error, "mesh:cgal:validate", "WORKER_OPERATION_FAILED");
        return { ok: false, error: diag.message };
      }
      recordPythonWorkerSuccess();
      return res;
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:cgal:validate", "WORKER_OPERATION_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle("mesh:cgal:repair", async (_evt, req: CgalRepairMeshRequest): Promise<CgalRepairMeshResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.repairCgalMesh(req);
      if (!res.ok) {
        const diag = recordPythonWorkerFailure(res.error, "mesh:cgal:repair", "WORKER_OPERATION_FAILED");
        return { ok: false, error: diag.message };
      }
      recordPythonWorkerSuccess();
      return res;
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:cgal:repair", "WORKER_OPERATION_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle("mesh:cgal:remesh", async (_evt, req: CgalRemeshMeshRequest): Promise<CgalRemeshMeshResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.remeshCgalMesh(req);
      if (!res.ok) {
        const diag = recordPythonWorkerFailure(res.error, "mesh:cgal:remesh", "WORKER_OPERATION_FAILED");
        return { ok: false, error: diag.message };
      }
      recordPythonWorkerSuccess();
      return res;
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:cgal:remesh", "WORKER_OPERATION_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle("mesh:geodesic:heat", async (_evt, req: GeodesicHeatRequest): Promise<GeodesicHeatResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.geodesicHeat(req);
      if (!res.ok) {
        const diag = recordPythonWorkerFailure(res.error, "mesh:geodesic:heat", "WORKER_OPERATION_FAILED");
        return { ok: false, error: diag.message };
      }
      recordPythonWorkerSuccess();
      return res;
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:geodesic:heat", "WORKER_OPERATION_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle("mesh:cgal:health", async (): Promise<CgalHealthResponse> => {
    try {
      const worker = await getPythonWorker();
      const res = await worker.health();
      if (res?.ok === false) {
        const diag = recordPythonWorkerFailure(res.error ?? "CGAL worker health failed", "mesh:cgal:health", "WORKER_HEALTH_FAILED");
        return { ok: false, error: diag.message };
      }
      recordPythonWorkerSuccess();
      return { ok: true };
    } catch (e: any) {
      const diag = recordPythonWorkerFailure(e, "mesh:cgal:health", "WORKER_HEALTH_FAILED");
      return { ok: false, error: diag.message };
    }
  });

  ipcMain.handle("mesh:cgal:stop", async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      stopPythonWorker();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });
}
