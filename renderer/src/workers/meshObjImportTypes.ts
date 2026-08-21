export type MeshObjImportWorkerRequest = {
  type: "parse-simple-obj";
  jobId: number;
  label: string;
  buffer: ArrayBuffer;
  sentAt: number;
};

export type MeshObjImportWorkerSuccess = {
  type: "simple-obj-ready";
  jobId: number;
  label: string;
  positions: Float32Array;
  indices: Uint32Array;
  sentAt: number;
  workerStartedAt: number;
  workerFinishedAt: number;
  vertexCount: number;
  triangleCount: number;
  timings: {
    decodeMs: number;
    detectMs: number;
    vertexParseMs: number;
    faceParseMs: number;
    indexBuildMs: number;
    totalMs: number;
  };
};

export type MeshObjImportWorkerFallback = {
  type: "simple-obj-fallback";
  jobId: number;
  label: string;
  sentAt: number;
  workerStartedAt: number;
  workerFinishedAt: number;
  reason: string;
  timings: {
    decodeMs: number;
    detectMs: number;
    vertexParseMs: number;
    faceParseMs: number;
    indexBuildMs: number;
    totalMs: number;
  };
};

export type MeshObjImportWorkerResponse = MeshObjImportWorkerSuccess | MeshObjImportWorkerFallback;
