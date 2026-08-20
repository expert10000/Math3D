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
    normalMs: number;
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

const computePreviewNormals = (positions: Float32Array, indices: Uint32Array | null): Float32Array => {
  const vertexCount = Math.floor(positions.length / 3);
  const normals = new Float32Array(vertexCount * 3);
  const faceCount = indices?.length ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);

  for (let face = 0; face < faceCount; face += 1) {
    let ia = face * 3;
    let ib = ia + 1;
    let ic = ia + 2;
    if (indices) {
      const base = face * 3;
      ia = indices[base] ?? -1;
      ib = indices[base + 1] ?? -1;
      ic = indices[base + 2] ?? -1;
    }
    if (ia < 0 || ib < 0 || ic < 0 || ia >= vertexCount || ib >= vertexCount || ic >= vertexCount) continue;

    const ax = positions[ia * 3] ?? 0;
    const ay = positions[ia * 3 + 1] ?? 0;
    const az = positions[ia * 3 + 2] ?? 0;
    const bx = positions[ib * 3] ?? 0;
    const by = positions[ib * 3 + 1] ?? 0;
    const bz = positions[ib * 3 + 2] ?? 0;
    const cx = positions[ic * 3] ?? 0;
    const cy = positions[ic * 3 + 1] ?? 0;
    const cz = positions[ic * 3 + 2] ?? 0;

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;

    normals[ia * 3] += nx;
    normals[ia * 3 + 1] += ny;
    normals[ia * 3 + 2] += nz;
    normals[ib * 3] += nx;
    normals[ib * 3 + 1] += ny;
    normals[ib * 3 + 2] += nz;
    normals[ic * 3] += nx;
    normals[ic * 3 + 1] += ny;
    normals[ic * 3 + 2] += nz;
  }

  for (let i = 0; i + 2 < normals.length; i += 3) {
    const nx = normals[i] ?? 0;
    const ny = normals[i + 1] ?? 0;
    const nz = normals[i + 2] ?? 0;
    const length = Math.hypot(nx, ny, nz);
    if (length > 1e-12) {
      normals[i] = nx / length;
      normals[i + 1] = ny / length;
      normals[i + 2] = nz / length;
    } else {
      normals[i] = 0;
      normals[i + 1] = 0;
      normals[i + 2] = 1;
    }
  }

  return normals;
};

ctx.onmessage = (event: MessageEvent<MeshFullPreviewWorkerRequest>) => {
  const message = event.data;
  if (!message || message.type !== "prepare-full-preview") return;
  const workerStartedAt = performance.now();
  const boundsStart = performance.now();
  const bounds = computeBounds(message.positions);
  const boundsMs = performance.now() - boundsStart;
  const normalStart = performance.now();
  const normals =
    message.normals && message.normals.length >= message.positions.length
      ? message.normals
      : computePreviewNormals(message.positions, message.indices);
  const normalMs = performance.now() - normalStart;
  const vertexCount = Math.floor(message.positions.length / 3);
  const triangleCount = message.indices?.length
    ? Math.floor(message.indices.length / 3)
    : Math.floor(message.positions.length / 9);
  const geometryBytes =
    byteLengthOf(message.positions) +
    byteLengthOf(normals) +
    byteLengthOf(message.indices) +
    byteLengthOf(message.uvs);
  const workerFinishedAt = performance.now();
  const response: MeshFullPreviewWorkerResponse = {
    type: "full-preview-ready",
    jobId: message.jobId,
    label: message.label,
    positions: message.positions,
    normals,
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
      normalMs,
      totalMs: workerFinishedAt - workerStartedAt,
    },
  };
  const transfer: Transferable[] = [response.positions.buffer];
  if (response.normals) transfer.push(response.normals.buffer);
  if (response.indices) transfer.push(response.indices.buffer);
  if (response.uvs) transfer.push(response.uvs.buffer);
  ctx.postMessage(response, transfer);
};
