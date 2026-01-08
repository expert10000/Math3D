// src/math/contours.ts
import * as THREE from "three";

export type ContourOptions = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  gridN?: number;        // sampling resolution (e.g. 120)
  levelCount?: number;   // number of contour levels (e.g. 12)
  zPadding?: number;     // avoid drawing exactly on min/max (e.g. 1e-6)
};

function lerpVec3(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  return new THREE.Vector3(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t
  );
}

function edgePoint(
  pA: THREE.Vector3,
  zA: number,
  pB: THREE.Vector3,
  zB: number,
  c: number
): THREE.Vector3 | null {
  const dz = zB - zA;
  if (Math.abs(dz) < 1e-12) return null;
  const t = (c - zA) / dz;
  if (t < 0 || t > 1) return null;
  return lerpVec3(pA, pB, t);
}

// Marching-squares edges: 0=bottom(bl->br), 1=right(br->tr), 2=top(tr->tl), 3=left(tl->bl)
const CASE_TO_SEGMENTS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[3, 0]],
  2: [[0, 1]],
  3: [[3, 1]],
  4: [[1, 2]],
  5: [[3, 2], [0, 1]], // ambiguous: draw both
  6: [[0, 2]],
  7: [[3, 2]],
  8: [[2, 3]],
  9: [[0, 2]],
  10: [[0, 3], [1, 2]], // ambiguous: draw both
  11: [[1, 2]],
  12: [[1, 3]],
  13: [[0, 1]],
  14: [[3, 0]],
  15: [],
};

export function buildGraphContours(
  f: (x: number, y: number) => number,
  opts: ContourOptions
): {
  geometry: THREE.BufferGeometry;
  minZ: number;
  maxZ: number;
  levels: number[];
} {
  const gridN = Math.max(10, opts.gridN ?? 120);
  const levelCount = Math.max(1, opts.levelCount ?? 12);
  const zPadding = opts.zPadding ?? 1e-6;

  const { xMin, xMax, yMin, yMax } = opts;
  const dx = (xMax - xMin) / (gridN - 1);
  const dy = (yMax - yMin) / (gridN - 1);

  // Sample z grid + min/max
  const Z: number[][] = Array.from({ length: gridN }, () => Array(gridN).fill(0));
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let j = 0; j < gridN; j++) {
    const y = yMin + j * dy;
    for (let i = 0; i < gridN; i++) {
      const x = xMin + i * dx;
      const z = f(x, y);
      Z[j][i] = z;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }

  // Contour levels (avoid exact endpoints)
  const z0 = minZ + zPadding;
  const z1 = maxZ - zPadding;
  const levels: number[] = [];
  if (z1 <= z0) {
    // flat/degenerate
    return { geometry: new THREE.BufferGeometry(), minZ, maxZ, levels };
  }
  for (let k = 1; k <= levelCount; k++) {
    const t = k / (levelCount + 1);
    levels.push(z0 + t * (z1 - z0));
  }

  const verts: number[] = [];

  // Build segments for each level
  for (const c of levels) {
    for (let j = 0; j < gridN - 1; j++) {
      const y0 = yMin + j * dy;
      const y1 = yMin + (j + 1) * dy;

      for (let i = 0; i < gridN - 1; i++) {
        const x0 = xMin + i * dx;
        const x1 = xMin + (i + 1) * dx;

        // corners (bl, br, tr, tl)
        const zBL = Z[j][i];
        const zBR = Z[j][i + 1];
        const zTR = Z[j + 1][i + 1];
        const zTL = Z[j + 1][i];

        const pBL = new THREE.Vector3(x0, y0, zBL);
        const pBR = new THREE.Vector3(x1, y0, zBR);
        const pTR = new THREE.Vector3(x1, y1, zTR);
        const pTL = new THREE.Vector3(x0, y1, zTL);

        // bitmask: 1=bl, 2=br, 4=tr, 8=tl (>= c)
        const m =
          (zBL >= c ? 1 : 0) |
          (zBR >= c ? 2 : 0) |
          (zTR >= c ? 4 : 0) |
          (zTL >= c ? 8 : 0);

        const segs = CASE_TO_SEGMENTS[m];
        if (!segs || segs.length === 0) continue;

        // Edge intersection points
        const E: Array<THREE.Vector3 | null> = [null, null, null, null];
        // 0 bottom bl->br
        E[0] = edgePoint(pBL, zBL, pBR, zBR, c);
        // 1 right br->tr
        E[1] = edgePoint(pBR, zBR, pTR, zTR, c);
        // 2 top tr->tl
        E[2] = edgePoint(pTR, zTR, pTL, zTL, c);
        // 3 left tl->bl
        E[3] = edgePoint(pTL, zTL, pBL, zBL, c);

        for (const [a, b] of segs) {
          const A = E[a];
          const B = E[b];
          if (!A || !B) continue;

          verts.push(A.x, A.y, A.z, B.x, B.y, B.z);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  return { geometry, minZ, maxZ, levels };
}
