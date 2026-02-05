import { edgeTable, triTable } from "three/examples/jsm/objects/MarchingCubes.js";
import type { VolumeGrid } from "../scene/datasets";

export type MarchingCubesResult = {
  positions: Float32Array;
  indices: Uint32Array;
};

const EDGE_TABLE = edgeTable as unknown as Int32Array;
const TRI_TABLE = triTable as unknown as Int32Array;

export function marchingCubesVolume(grid: VolumeGrid, iso: number): MarchingCubesResult | null {
  const [nx, ny, nz] = grid.dims;
  if (nx < 2 || ny < 2 || nz < 2) return null;

  const total = nx * ny * nz;
  if (!total || !grid.scalars?.length) return null;

  const scalars = grid.scalars as ArrayLike<number>;
  const spacing = grid.spacing ?? [1, 1, 1];
  const origin = grid.origin ?? [0, 0, 0];

  const positions: number[] = [];
  const indices: number[] = [];

  const vertList = new Float32Array(12 * 3);
  const cornerVals = new Float32Array(8);
  const cornerX = new Float32Array(8);
  const cornerY = new Float32Array(8);
  const cornerZ = new Float32Array(8);

  const strideY = nx;
  const strideZ = nx * ny;

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

  for (let z = 0; z < nz - 1; z++) {
    const z0 = origin[2] + spacing[2] * z;
    const z1 = z0 + spacing[2];
    for (let y = 0; y < ny - 1; y++) {
      const y0 = origin[1] + spacing[1] * y;
      const y1 = y0 + spacing[1];
      for (let x = 0; x < nx - 1; x++) {
        const x0 = origin[0] + spacing[0] * x;
        const x1 = x0 + spacing[0];

        const base = x + strideY * y + strideZ * z;
        const c0 = base;
        const c1 = base + 1;
        const c2 = base + 1 + strideY;
        const c3 = base + strideY;
        const c4 = base + strideZ;
        const c5 = c4 + 1;
        const c6 = c4 + 1 + strideY;
        const c7 = c4 + strideY;

        cornerVals[0] = Number(scalars[c0] ?? 0);
        cornerVals[1] = Number(scalars[c1] ?? 0);
        cornerVals[2] = Number(scalars[c2] ?? 0);
        cornerVals[3] = Number(scalars[c3] ?? 0);
        cornerVals[4] = Number(scalars[c4] ?? 0);
        cornerVals[5] = Number(scalars[c5] ?? 0);
        cornerVals[6] = Number(scalars[c6] ?? 0);
        cornerVals[7] = Number(scalars[c7] ?? 0);

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
  }

  if (!indices.length) return null;
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}
