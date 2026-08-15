/// <reference lib="webworker" />

type MeshFullPreviewWorkerRequest = {
  type: "prepare-full-preview";
  jobId: number;
  label: string;
  positions: Float32Array;
  normals: Float32Array | null;
  indices: Uint32Array | null;
  uvs: Float32Array | null;
  sentAt: number;
};

type MeshFullPreviewBounds = {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  radius: number;
};

type MeshFullPreviewWorkerResponse = {
  type: "full-preview-ready";
  jobId: number;
  label: string;
  positions: Float32Array;
  normals: Float32Array | null;
  indices: Uint32Array | null;
  uvs: Float32Array | null;
  bounds: MeshFullPreviewBounds;
  vertexCount: number;
  triangleCount: number;
  geometryBytes: number;
  sentAt: number;
  workerStartedAt: number;
  workerFinishedAt: number;
  timings: {
    boundsMs: number;
    totalMs: number;
  };
};

const ctx = self as DedicatedWorkerGlobalScope;

const byteLengthOf = (value: ArrayBufferView | null | undefined): number => value?.byteLength ?? 0;

const computeBounds = (positions: Float32Array): MeshFullPreviewBounds => {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    minZ = 0;
    maxX = 0;
    maxY = 0;
    maxZ = 0;
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  let radiusSq = 0;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const dx = (positions[i] ?? 0) - centerX;
    const dy = (positions[i + 1] ?? 0) - centerY;
    const dz = (positions[i + 2] ?? 0) - centerZ;
    radiusSq = Math.max(radiusSq, dx * dx + dy * dy + dz * dz);
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [centerX, centerY, centerZ],
    radius: Math.sqrt(radiusSq),
  };
};

ctx.onmessage = (event: MessageEvent<MeshFullPreviewWorkerRequest>) => {
  const message = event.data;
  if (!message || message.type !== "prepare-full-preview") return;
  const workerStartedAt = performance.now();
  const boundsStart = performance.now();
  const bounds = computeBounds(message.positions);
  const boundsMs = performance.now() - boundsStart;
  const vertexCount = Math.floor(message.positions.length / 3);
  const triangleCount = message.indices?.length
    ? Math.floor(message.indices.length / 3)
    : Math.floor(message.positions.length / 9);
  const geometryBytes =
    byteLengthOf(message.positions) +
    byteLengthOf(message.normals) +
    byteLengthOf(message.indices) +
    byteLengthOf(message.uvs);
  const workerFinishedAt = performance.now();
  const response: MeshFullPreviewWorkerResponse = {
    type: "full-preview-ready",
    jobId: message.jobId,
    label: message.label,
    positions: message.positions,
    normals: message.normals,
    indices: message.indices,
    uvs: message.uvs,
    bounds,
    vertexCount,
    triangleCount,
    geometryBytes,
    sentAt: message.sentAt,
    workerStartedAt,
    workerFinishedAt,
    timings: {
      boundsMs,
      totalMs: workerFinishedAt - workerStartedAt,
    },
  };
  const transfer: Transferable[] = [response.positions.buffer];
  if (response.normals) transfer.push(response.normals.buffer);
  if (response.indices) transfer.push(response.indices.buffer);
  if (response.uvs) transfer.push(response.uvs.buffer);
  ctx.postMessage(response, transfer);
};
