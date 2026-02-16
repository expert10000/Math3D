/// <reference lib="webworker" />

import { compileExpression } from "../math/expression";
import { edgeTable, triTable } from "three/examples/jsm/objects/MarchingCubes.js";

type ImplicitBakeBounds = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
};

type BakeRequest = {
  type: "bake";
  jobId: string;
  expr: string;
  bounds: ImplicitBakeBounds;
  resolution: number;
  iso?: number;
};

type ProgressMessage = {
  type: "progress";
  jobId: string;
  phase: "sampling" | "marching";
  progress: number;
};

type ResultMessage =
  | {
      type: "result";
      jobId: string;
      ok: true;
      positions: Float32Array;
      indices: Uint32Array;
    }
  | {
      type: "result";
      jobId: string;
      ok: false;
      error: string;
    };

const EDGE_TABLE = edgeTable as unknown as Int32Array;
const TRI_TABLE = triTable as unknown as Int32Array;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const clampInt = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
};

const safeNumber = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

const postProgress = (msg: ProgressMessage) => {
  ctx.postMessage(msg);
};

const postResult = (msg: ResultMessage) => {
  if (msg.ok) {
    ctx.postMessage(msg, [msg.positions.buffer, msg.indices.buffer]);
  } else {
    ctx.postMessage(msg);
  }
};

const marchGrid = (
  scalars: Float32Array,
  bounds: ImplicitBakeBounds,
  dims: [number, number, number],
  iso: number,
  jobId: string
) => {
  const [nx, ny, nz] = dims;
  const strideY = nx;
  const strideZ = nx * ny;

  const xMin = bounds.xMin;
  const yMin = bounds.yMin;
  const zMin = bounds.zMin;
  const xMax = bounds.xMax;
  const yMax = bounds.yMax;
  const zMax = bounds.zMax;
  const dx = nx > 1 ? (xMax - xMin) / (nx - 1) : 0;
  const dy = ny > 1 ? (yMax - yMin) / (ny - 1) : 0;
  const dz = nz > 1 ? (zMax - zMin) / (nz - 1) : 0;

  const positions: number[] = [];
  const indices: number[] = [];
  const vertList = new Float32Array(12 * 3);
  const cornerVals = new Float32Array(8);
  const cornerX = new Float32Array(8);
  const cornerY = new Float32Array(8);
  const cornerZ = new Float32Array(8);

  const setEdgeVertex = (edge: number, a: number, b: number) => {
    const v1 = cornerVals[a];
    const v2 = cornerVals[b];
    const denom = v2 - v1;
    const t = Math.abs(denom) < 1e-12 ? 0.5 : (iso - v1) / denom;
    const i = edge * 3;
    vertList[i] = cornerX[a] + t * (cornerX[b] - cornerX[a]);
    vertList[i + 1] = cornerY[a] + t * (cornerY[b] - cornerY[a]);
    vertList[i + 2] = cornerZ[a] + t * (cornerZ[b] - cornerZ[a]);
  };

  const progressStride = Math.max(1, Math.floor(nz / 40));

  for (let z = 0; z < nz - 1; z++) {
    const z0 = zMin + dz * z;
    const z1 = z0 + dz;
    for (let y = 0; y < ny - 1; y++) {
      const y0 = yMin + dy * y;
      const y1 = y0 + dy;
      for (let x = 0; x < nx - 1; x++) {
        const x0 = xMin + dx * x;
        const x1 = x0 + dx;

        const base = x + strideY * y + strideZ * z;
        const c0 = base;
        const c1 = base + 1;
        const c2 = base + 1 + strideY;
        const c3 = base + strideY;
        const c4 = base + strideZ;
        const c5 = c4 + 1;
        const c6 = c4 + 1 + strideY;
        const c7 = c4 + strideY;

        cornerVals[0] = scalars[c0] ?? 0;
        cornerVals[1] = scalars[c1] ?? 0;
        cornerVals[2] = scalars[c2] ?? 0;
        cornerVals[3] = scalars[c3] ?? 0;
        cornerVals[4] = scalars[c4] ?? 0;
        cornerVals[5] = scalars[c5] ?? 0;
        cornerVals[6] = scalars[c6] ?? 0;
        cornerVals[7] = scalars[c7] ?? 0;

        let cubeIndex = 0;
        if (cornerVals[0] < iso) cubeIndex |= 1;
        if (cornerVals[1] < iso) cubeIndex |= 2;
        if (cornerVals[2] < iso) cubeIndex |= 4;
        if (cornerVals[3] < iso) cubeIndex |= 8;
        if (cornerVals[4] < iso) cubeIndex |= 16;
        if (cornerVals[5] < iso) cubeIndex |= 32;
        if (cornerVals[6] < iso) cubeIndex |= 64;
        if (cornerVals[7] < iso) cubeIndex |= 128;

        const bits = EDGE_TABLE[cubeIndex];
        if (!bits) continue;

        cornerX[0] = x0; cornerY[0] = y0; cornerZ[0] = z0;
        cornerX[1] = x1; cornerY[1] = y0; cornerZ[1] = z0;
        cornerX[2] = x1; cornerY[2] = y1; cornerZ[2] = z0;
        cornerX[3] = x0; cornerY[3] = y1; cornerZ[3] = z0;
        cornerX[4] = x0; cornerY[4] = y0; cornerZ[4] = z1;
        cornerX[5] = x1; cornerY[5] = y0; cornerZ[5] = z1;
        cornerX[6] = x1; cornerY[6] = y1; cornerZ[6] = z1;
        cornerX[7] = x0; cornerY[7] = y1; cornerZ[7] = z1;

        if (bits & 1) setEdgeVertex(0, 0, 1);
        if (bits & 2) setEdgeVertex(1, 1, 2);
        if (bits & 4) setEdgeVertex(2, 2, 3);
        if (bits & 8) setEdgeVertex(3, 3, 0);
        if (bits & 16) setEdgeVertex(4, 4, 5);
        if (bits & 32) setEdgeVertex(5, 5, 6);
        if (bits & 64) setEdgeVertex(6, 6, 7);
        if (bits & 128) setEdgeVertex(7, 7, 4);
        if (bits & 256) setEdgeVertex(8, 0, 4);
        if (bits & 512) setEdgeVertex(9, 1, 5);
        if (bits & 1024) setEdgeVertex(10, 2, 6);
        if (bits & 2048) setEdgeVertex(11, 3, 7);

        const triOffset = cubeIndex * 16;
        for (let i = 0; i < 16; i += 3) {
          const a = TRI_TABLE[triOffset + i];
          if (a < 0) break;
          const b = TRI_TABLE[triOffset + i + 1];
          const c = TRI_TABLE[triOffset + i + 2];
          const ai = a * 3;
          const bi = b * 3;
          const ci = c * 3;
          const baseIndex = positions.length / 3;
          positions.push(
            vertList[ai], vertList[ai + 1], vertList[ai + 2],
            vertList[bi], vertList[bi + 1], vertList[bi + 2],
            vertList[ci], vertList[ci + 1], vertList[ci + 2]
          );
          indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
        }
      }
    }

    if (z % progressStride === 0 || z === nz - 2) {
      postProgress({ type: "progress", jobId, phase: "marching", progress: (z + 1) / (nz - 1) });
    }
  }

  if (!indices.length) return null;
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
};

const bakeImplicit = (req: BakeRequest) => {
  const r = compileExpression((req.expr ?? "").trim(), ["x", "y", "z"]);
  if (r.error) {
    postResult({
      type: "result",
      jobId: req.jobId,
      ok: false,
      error: `${r.error.message} (col ${r.error.col})`,
    });
    return;
  }

  const fn = r.fn!;
  const nx = clampInt(req.resolution, 8, 320);
  const ny = nx;
  const nz = nx;

  const xMin = safeNumber(req.bounds.xMin, -1);
  const xMax = safeNumber(req.bounds.xMax, 1);
  const yMin = safeNumber(req.bounds.yMin, -1);
  const yMax = safeNumber(req.bounds.yMax, 1);
  const zMin = safeNumber(req.bounds.zMin, -1);
  const zMax = safeNumber(req.bounds.zMax, 1);

  const dx = nx > 1 ? (xMax - xMin) / (nx - 1) : 0;
  const dy = ny > 1 ? (yMax - yMin) / (ny - 1) : 0;
  const dz = nz > 1 ? (zMax - zMin) / (nz - 1) : 0;

  const total = nx * ny * nz;
  if (total <= 0 || !Number.isFinite(total)) {
    postResult({ type: "result", jobId: req.jobId, ok: false, error: "Invalid bake resolution." });
    return;
  }

  const scalars = new Float32Array(total);
  let idx = 0;
  const progressStride = Math.max(1, Math.floor(nz / 40));

  for (let k = 0; k < nz; k++) {
    const z = zMin + dz * k;
    for (let j = 0; j < ny; j++) {
      const y = yMin + dy * j;
      for (let i = 0; i < nx; i++) {
        const x = xMin + dx * i;
        let v = fn({ x, y, z });
        if (!Number.isFinite(v)) v = 1e3;
        scalars[idx++] = v;
      }
    }

    if (k % progressStride === 0 || k === nz - 1) {
      postProgress({ type: "progress", jobId: req.jobId, phase: "sampling", progress: (k + 1) / nz });
    }
  }

  const iso = Number.isFinite(req.iso) ? Number(req.iso) : 0;
  const result = marchGrid(scalars, req.bounds, [nx, ny, nz], iso, req.jobId);
  if (!result) {
    postResult({ type: "result", jobId: req.jobId, ok: false, error: "No triangles generated." });
    return;
  }

  postResult({ type: "result", jobId: req.jobId, ok: true, positions: result.positions, indices: result.indices });
};

ctx.onmessage = (event: MessageEvent<BakeRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== "bake") return;
  bakeImplicit(msg);
};

export {};
