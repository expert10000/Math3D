import type { MeshValidation, SurfaceMeshData } from "./surfaceMesh";

const isFiniteNumber = (v: number) => Number.isFinite(v);

const isFinite3 = (x: number, y: number, z: number) =>
  Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);

const getIndexValue = (indices: ArrayLike<number>, i: number) => Number(indices[i]);

const isValidIndex = (idx: number, vertexCount: number) =>
  Number.isInteger(idx) && idx >= 0 && idx < vertexCount;

const triangleIndices = (
  indices: ArrayLike<number> | null,
  t: number,
  vertexCount: number
): { a: number; b: number; c: number } | null => {
  if (indices && indices.length >= 3) {
    const base = t * 3;
    const a = getIndexValue(indices, base);
    const b = getIndexValue(indices, base + 1);
    const c = getIndexValue(indices, base + 2);
    if (!isValidIndex(a, vertexCount) || !isValidIndex(b, vertexCount) || !isValidIndex(c, vertexCount)) {
      return null;
    }
    return { a, b, c };
  }
  const a = t * 3;
  const b = a + 1;
  const c = a + 2;
  if (c >= vertexCount) return null;
  return { a, b, c };
};

export function computeVertexNormals(mesh: SurfaceMeshData): SurfaceMeshData {
  const positions = mesh.positions;
  const vertexCount = Math.floor(positions.length / 3);
  const normals = new Float32Array(vertexCount * 3);
  if (vertexCount === 0) {
    return { ...mesh, normals };
  }

  const indices = mesh.indices;
  const hasIndices = !!(indices && indices.length >= 3);
  const triCount = hasIndices ? Math.floor(indices!.length / 3) : Math.floor(vertexCount / 3);

  for (let t = 0; t < triCount; t++) {
    const tri = triangleIndices(indices, t, vertexCount);
    if (!tri) continue;
    const { a, b, c } = tri;
    const a3 = a * 3;
    const b3 = b * 3;
    const c3 = c * 3;
    const ax = positions[a3];
    const ay = positions[a3 + 1];
    const az = positions[a3 + 2];
    const bx = positions[b3];
    const by = positions[b3 + 1];
    const bz = positions[b3 + 2];
    const cx = positions[c3];
    const cy = positions[c3 + 1];
    const cz = positions[c3 + 2];
    if (!isFinite3(ax, ay, az) || !isFinite3(bx, by, bz) || !isFinite3(cx, cy, cz)) continue;

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;

    normals[a3] += nx;
    normals[a3 + 1] += ny;
    normals[a3 + 2] += nz;
    normals[b3] += nx;
    normals[b3 + 1] += ny;
    normals[b3 + 2] += nz;
    normals[c3] += nx;
    normals[c3 + 1] += ny;
    normals[c3 + 2] += nz;
  }

  for (let i = 0; i < vertexCount; i++) {
    const nIdx = i * 3;
    const nx = normals[nIdx];
    const ny = normals[nIdx + 1];
    const nz = normals[nIdx + 2];
    const nLen = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(nLen) || nLen < 1e-20) {
      normals[nIdx] = Number.NaN;
      normals[nIdx + 1] = Number.NaN;
      normals[nIdx + 2] = Number.NaN;
    } else {
      const inv = 1 / nLen;
      normals[nIdx] = nx * inv;
      normals[nIdx + 1] = ny * inv;
      normals[nIdx + 2] = nz * inv;
    }
  }

  return { ...mesh, normals };
}

export function computeAdjacency(mesh: SurfaceMeshData): SurfaceMeshData {
  const positions = mesh.positions;
  const vertexCount = Math.floor(positions.length / 3);
  const neighbors: Set<number>[] = Array.from({ length: vertexCount }, () => new Set<number>());
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    if (a < 0 || b < 0 || a >= vertexCount || b >= vertexCount) return;
    neighbors[a].add(b);
    neighbors[b].add(a);
  };

  const indices = mesh.indices;
  if (indices && indices.length >= 3) {
    const triCount = Math.floor(indices.length / 3);
    for (let t = 0; t < triCount; t++) {
      const tri = triangleIndices(indices, t, vertexCount);
      if (!tri) continue;
      addEdge(tri.a, tri.b);
      addEdge(tri.b, tri.c);
      addEdge(tri.c, tri.a);
    }
  } else if (vertexCount >= 3) {
    const triCount = Math.floor(vertexCount / 3);
    for (let t = 0; t < triCount; t++) {
      const a = t * 3;
      const b = a + 1;
      const c = a + 2;
      addEdge(a, b);
      addEdge(b, c);
      addEdge(c, a);
    }

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < vertexCount; i++) {
      const idx = i * 3;
      const x = positions[idx];
      const y = positions[idx + 1];
      const z = positions[idx + 2];
      if (!isFinite3(x, y, z)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }

    let spacing = 0;
    if (triCount > 0) {
      const sampleCount = Math.min(triCount, 5000);
      let sum = 0;
      let edges = 0;
      for (let t = 0; t < sampleCount; t++) {
        const a = t * 3;
        const b = a + 1;
        const c = a + 2;
        const ax = positions[a * 3];
        const ay = positions[a * 3 + 1];
        const az = positions[a * 3 + 2];
        const bx = positions[b * 3];
        const by = positions[b * 3 + 1];
        const bz = positions[b * 3 + 2];
        const cx = positions[c * 3];
        const cy = positions[c * 3 + 1];
        const cz = positions[c * 3 + 2];
        const ab = Math.hypot(ax - bx, ay - by, az - bz);
        const bc = Math.hypot(bx - cx, by - cy, bz - cz);
        const ca = Math.hypot(cx - ax, cy - ay, cz - az);
        if (isFiniteNumber(ab)) {
          sum += ab;
          edges++;
        }
        if (isFiniteNumber(bc)) {
          sum += bc;
          edges++;
        }
        if (isFiniteNumber(ca)) {
          sum += ca;
          edges++;
        }
      }
      if (edges > 0) spacing = Math.max(1e-6, sum / edges);
    }

    if (spacing <= 0) {
      const dx = maxX - minX;
      const dy = maxY - minY;
      const dz = maxZ - minZ;
      const diag = Math.sqrt(dx * dx + dy * dy + dz * dz);
      spacing =
        Number.isFinite(diag) && diag > 0 ? Math.max(1e-6, diag / Math.sqrt(vertexCount)) : 0;
    }

    if (spacing > 0 && Number.isFinite(spacing)) {
      const cellSize = Math.max(1e-6, spacing * 1.6);
      const radius = Math.max(1e-6, spacing * 2.6);
      const radius2 = radius * radius;
      const buckets = new Map<string, number[]>();
      const keyOf = (x: number, y: number, z: number) => {
        const ix = Math.floor((x - minX) / cellSize);
        const iy = Math.floor((y - minY) / cellSize);
        const iz = Math.floor((z - minZ) / cellSize);
        return `${ix},${iy},${iz}`;
      };

      for (let i = 0; i < vertexCount; i++) {
        const idx = i * 3;
        const x = positions[idx];
        const y = positions[idx + 1];
        const z = positions[idx + 2];
        if (!isFinite3(x, y, z)) continue;
        const key = keyOf(x, y, z);
        const list = buckets.get(key);
        if (list) list.push(i);
        else buckets.set(key, [i]);
      }

      for (let i = 0; i < vertexCount; i++) {
        const idx = i * 3;
        const x = positions[idx];
        const y = positions[idx + 1];
        const z = positions[idx + 2];
        if (!isFinite3(x, y, z)) continue;
        const ix = Math.floor((x - minX) / cellSize);
        const iy = Math.floor((y - minY) / cellSize);
        const iz = Math.floor((z - minZ) / cellSize);
        for (let gx = -1; gx <= 1; gx++) {
          for (let gy = -1; gy <= 1; gy++) {
            for (let gz = -1; gz <= 1; gz++) {
              const key = `${ix + gx},${iy + gy},${iz + gz}`;
              const list = buckets.get(key);
              if (!list) continue;
              for (let k = 0; k < list.length; k++) {
                const j = list[k];
                if (j === i) continue;
                const jIdx = j * 3;
                const dx = positions[jIdx] - x;
                const dy = positions[jIdx + 1] - y;
                const dz = positions[jIdx + 2] - z;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 <= radius2) addEdge(i, j);
              }
            }
          }
        }
      }
    }
  }

  return { ...mesh, adjacency: neighbors.map((set) => Array.from(set)) };
}

export function computeMeanEdgeLength(mesh: SurfaceMeshData): SurfaceMeshData {
  const positions = mesh.positions;
  const vertexCount = Math.floor(positions.length / 3);
  const indices = mesh.indices;
  const hasIndices = !!(indices && indices.length >= 3);
  const triCount = hasIndices ? Math.floor(indices!.length / 3) : Math.floor(vertexCount / 3);
  if (triCount <= 0) {
    return { ...mesh, meanEdgeLength: 0 };
  }

  const stride = Math.max(1, Math.floor(triCount / 5000));
  let sum = 0;
  let edges = 0;

  for (let t = 0; t < triCount; t += stride) {
    const tri = triangleIndices(indices, t, vertexCount);
    if (!tri) continue;
    const a = tri.a * 3;
    const b = tri.b * 3;
    const c = tri.c * 3;
    const ax = positions[a];
    const ay = positions[a + 1];
    const az = positions[a + 2];
    const bx = positions[b];
    const by = positions[b + 1];
    const bz = positions[b + 2];
    const cx = positions[c];
    const cy = positions[c + 1];
    const cz = positions[c + 2];
    if (!isFinite3(ax, ay, az) || !isFinite3(bx, by, bz) || !isFinite3(cx, cy, cz)) continue;
    const ab = Math.hypot(ax - bx, ay - by, az - bz);
    const bc = Math.hypot(bx - cx, by - cy, bz - cz);
    const ca = Math.hypot(cx - ax, cy - ay, cz - az);
    if (isFiniteNumber(ab)) {
      sum += ab;
      edges++;
    }
    if (isFiniteNumber(bc)) {
      sum += bc;
      edges++;
    }
    if (isFiniteNumber(ca)) {
      sum += ca;
      edges++;
    }
  }

  const meanEdgeLength = edges > 0 ? sum / edges : 0;
  return { ...mesh, meanEdgeLength };
}

const isDegenerateTriangle = (
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
) => {
  if (!isFinite3(ax, ay, az) || !isFinite3(bx, by, bz) || !isFinite3(cx, cy, cz)) return true;
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const crossX = aby * acz - abz * acy;
  const crossY = abz * acx - abx * acz;
  const crossZ = abx * acy - aby * acx;
  const area2 = crossX * crossX + crossY * crossY + crossZ * crossZ;
  const ab2 = abx * abx + aby * aby + abz * abz;
  const ac2 = acx * acx + acy * acy + acz * acz;
  const scale = ab2 + ac2;
  if (!Number.isFinite(area2) || !Number.isFinite(scale) || scale <= 0) return true;
  return area2 <= scale * 1e-12;
};

export function validateMesh(mesh: SurfaceMeshData): SurfaceMeshData {
  const positions = mesh.positions;
  const vertexCount = Math.floor(positions.length / 3);
  const indices = mesh.indices;
  const normals = mesh.normals ?? null;
  const uvs = mesh.uvs ?? null;
  const hasIndices = !!(indices && indices.length >= 3);
  const faceCount = hasIndices ? Math.floor(indices!.length / 3) : Math.floor(vertexCount / 3);

  let nanPositions = 0;
  for (let i = 0; i < vertexCount; i++) {
    const idx = i * 3;
    const x = positions[idx];
    const y = positions[idx + 1];
    const z = positions[idx + 2];
    if (!isFinite3(x, y, z)) nanPositions++;
  }

  let nanNormals = 0;
  if (normals) {
    const normalCount = Math.floor(normals.length / 3);
    const limit = Math.min(vertexCount, normalCount);
    for (let i = 0; i < limit; i++) {
      const idx = i * 3;
      const x = normals[idx];
      const y = normals[idx + 1];
      const z = normals[idx + 2];
      if (!isFinite3(x, y, z)) nanNormals++;
    }
  }

  let nanUvs = 0;
  if (uvs) {
    const uvCount = Math.floor(uvs.length / 2);
    for (let i = 0; i < uvCount; i++) {
      const idx = i * 2;
      const u = uvs[idx];
      const v = uvs[idx + 1];
      if (!Number.isFinite(u) || !Number.isFinite(v)) nanUvs++;
    }
  }

  let outOfRangeIndices = 0;
  if (indices) {
    for (let i = 0; i < indices.length; i++) {
      const idx = getIndexValue(indices, i);
      if (!isValidIndex(idx, vertexCount)) outOfRangeIndices++;
    }
  }

  let degenerateFaces = 0;
  if (faceCount > 0) {
    for (let t = 0; t < faceCount; t++) {
      const tri = triangleIndices(indices, t, vertexCount);
      if (!tri) continue;
      const a3 = tri.a * 3;
      const b3 = tri.b * 3;
      const c3 = tri.c * 3;
      if (
        tri.a === tri.b ||
        tri.b === tri.c ||
        tri.c === tri.a ||
        isDegenerateTriangle(
          positions[a3],
          positions[a3 + 1],
          positions[a3 + 2],
          positions[b3],
          positions[b3 + 1],
          positions[b3 + 2],
          positions[c3],
          positions[c3 + 1],
          positions[c3 + 2]
        )
      ) {
        degenerateFaces++;
      }
    }
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (positions.length % 3 !== 0) warnings.push("positions length not divisible by 3");
  if (indices && indices.length % 3 !== 0) warnings.push("indices length not divisible by 3");
  if (normals && normals.length % 3 !== 0) warnings.push("normals length not divisible by 3");
  if (uvs && uvs.length % 2 !== 0) warnings.push("uvs length not divisible by 2");

  if (nanPositions > 0) errors.push(`non-finite positions: ${nanPositions}`);
  if (outOfRangeIndices > 0) errors.push(`out-of-range indices: ${outOfRangeIndices}`);
  if (nanNormals > 0) warnings.push(`non-finite normals: ${nanNormals}`);
  if (nanUvs > 0) warnings.push(`non-finite uvs: ${nanUvs}`);
  if (degenerateFaces > 0) warnings.push(`degenerate faces: ${degenerateFaces}`);

  const validation: MeshValidation = {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      vertexCount,
      faceCount,
      degenerateFaces,
      outOfRangeIndices,
      nanPositions,
      nanNormals,
      nanUvs,
    },
  };

  return { ...mesh, validation };
}
