export type FastPreviewProxyAlgorithm = "triangle-sample" | "connected-cluster";

export type FastPreviewProxyInput = {
  positions: ArrayLike<number>;
  indices?: ArrayLike<number> | null;
  normals?: ArrayLike<number> | null;
  uvs?: ArrayLike<number> | null;
};

export type FastPreviewProxyBuffers = {
  positions: Float32Array;
  indices: Uint32Array | null;
  normals: Float32Array | null;
  uvs: Float32Array | null;
};

const sourceTriangleCount = (mesh: FastPreviewProxyInput) =>
  mesh.indices?.length ? Math.floor(mesh.indices.length / 3) : Math.floor(mesh.positions.length / 9);

const sourceVertexIndex = (mesh: FastPreviewProxyInput, triangleIndex: number, corner: number) =>
  mesh.indices?.length ? Number(mesh.indices[triangleIndex * 3 + corner] ?? -1) : triangleIndex * 3 + corner;

const buildTriangleSample = (mesh: FastPreviewProxyInput, targetTriangles: number): FastPreviewProxyBuffers => {
  const fullTriangles = sourceTriangleCount(mesh);
  const sampleTriangles = Math.max(1, Math.min(Math.floor(targetTriangles), fullTriangles));
  const positions = new Float32Array(sampleTriangles * 9);
  const hasNormals = !!mesh.normals && mesh.normals.length >= mesh.positions.length;
  const hasUvs = !!mesh.uvs && mesh.uvs.length >= Math.floor(mesh.positions.length / 3) * 2;
  const normals = hasNormals ? new Float32Array(sampleTriangles * 9) : null;
  const uvs = hasUvs ? new Float32Array(sampleTriangles * 6) : null;

  for (let outTri = 0; outTri < sampleTriangles; outTri += 1) {
    const tri = Math.min(fullTriangles - 1, Math.floor(((outTri + 0.5) * fullTriangles) / sampleTriangles));
    for (let corner = 0; corner < 3; corner += 1) {
      const sourceVertex = sourceVertexIndex(mesh, tri, corner);
      const srcPos = sourceVertex * 3;
      const dstPos = outTri * 9 + corner * 3;
      positions[dstPos] = mesh.positions[srcPos] ?? 0;
      positions[dstPos + 1] = mesh.positions[srcPos + 1] ?? 0;
      positions[dstPos + 2] = mesh.positions[srcPos + 2] ?? 0;
      if (normals && mesh.normals) {
        normals[dstPos] = mesh.normals[srcPos] ?? 0;
        normals[dstPos + 1] = mesh.normals[srcPos + 1] ?? 0;
        normals[dstPos + 2] = mesh.normals[srcPos + 2] ?? 1;
      }
      if (uvs && mesh.uvs) {
        const srcUv = sourceVertex * 2;
        const dstUv = outTri * 6 + corner * 2;
        uvs[dstUv] = mesh.uvs[srcUv] ?? 0;
        uvs[dstUv + 1] = mesh.uvs[srcUv + 1] ?? 0;
      }
    }
  }

  return { positions, indices: null, normals, uvs };
};

/**
 * Builds a whole-surface preview using vertex clusters rather than independent
 * triangle samples. It is intentionally local and deterministic: no GPU, VTK,
 * or CGAL worker is required for a readable connected preview.
 */
const buildConnectedClusterProxy = (mesh: FastPreviewProxyInput, targetTriangles: number): FastPreviewProxyBuffers => {
  const fullTriangles = sourceTriangleCount(mesh);
  const vertexCount = Math.floor(mesh.positions.length / 3);
  if (vertexCount === 0 || fullTriangles === 0) {
    return { positions: new Float32Array(), indices: null, normals: null, uvs: null };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < vertexCount; index += 1) {
    const base = index * 3;
    const x = Number(mesh.positions[base] ?? 0);
    const y = Number(mesh.positions[base + 1] ?? 0);
    const z = Number(mesh.positions[base + 2] ?? 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const spanX = Math.max(1e-9, maxX - minX);
  const spanY = Math.max(1e-9, maxY - minY);
  const spanZ = Math.max(1e-9, maxZ - minZ);
  // Surface vertices occupy the boundary of a 3D grid. The multiplier yields
  // enough boundary cells to approximate the requested triangle budget.
  const gridSize = Math.max(2, Math.min(256, Math.ceil(Math.cbrt(Math.max(8, targetTriangles)) * 2.5)));
  const hasNormals = !!mesh.normals && mesh.normals.length >= mesh.positions.length;
  const hasUvs = !!mesh.uvs && mesh.uvs.length >= vertexCount * 2;
  const sourceToCluster = new Int32Array(vertexCount);
  const clusterByKey = new Map<string, number>();
  const count: number[] = [];
  const sumX: number[] = [];
  const sumY: number[] = [];
  const sumZ: number[] = [];
  const sumNx: number[] = [];
  const sumNy: number[] = [];
  const sumNz: number[] = [];
  const sumU: number[] = [];
  const sumV: number[] = [];

  for (let source = 0; source < vertexCount; source += 1) {
    const base = source * 3;
    const x = Number(mesh.positions[base] ?? 0);
    const y = Number(mesh.positions[base + 1] ?? 0);
    const z = Number(mesh.positions[base + 2] ?? 0);
    const cellX = Math.min(gridSize - 1, Math.max(0, Math.floor(((x - minX) / spanX) * gridSize)));
    const cellY = Math.min(gridSize - 1, Math.max(0, Math.floor(((y - minY) / spanY) * gridSize)));
    const cellZ = Math.min(gridSize - 1, Math.max(0, Math.floor(((z - minZ) / spanZ) * gridSize)));
    const key = `${cellX}:${cellY}:${cellZ}`;
    let cluster = clusterByKey.get(key);
    if (cluster == null) {
      cluster = count.length;
      clusterByKey.set(key, cluster);
      count.push(0);
      sumX.push(0); sumY.push(0); sumZ.push(0);
      if (hasNormals) { sumNx.push(0); sumNy.push(0); sumNz.push(0); }
      if (hasUvs) { sumU.push(0); sumV.push(0); }
    }
    sourceToCluster[source] = cluster;
    count[cluster] += 1;
    sumX[cluster] += x;
    sumY[cluster] += y;
    sumZ[cluster] += z;
    if (hasNormals && mesh.normals) {
      sumNx[cluster] += Number(mesh.normals[base] ?? 0);
      sumNy[cluster] += Number(mesh.normals[base + 1] ?? 0);
      sumNz[cluster] += Number(mesh.normals[base + 2] ?? 0);
    }
    if (hasUvs && mesh.uvs) {
      const uvBase = source * 2;
      sumU[cluster] += Number(mesh.uvs[uvBase] ?? 0);
      sumV[cluster] += Number(mesh.uvs[uvBase + 1] ?? 0);
    }
  }

  const positions = new Float32Array(count.length * 3);
  const normals = hasNormals ? new Float32Array(count.length * 3) : null;
  const uvs = hasUvs ? new Float32Array(count.length * 2) : null;
  for (let cluster = 0; cluster < count.length; cluster += 1) {
    const divisor = Math.max(1, count[cluster]);
    const base = cluster * 3;
    positions[base] = sumX[cluster] / divisor;
    positions[base + 1] = sumY[cluster] / divisor;
    positions[base + 2] = sumZ[cluster] / divisor;
    if (normals) {
      const nx = sumNx[cluster];
      const ny = sumNy[cluster];
      const nz = sumNz[cluster];
      const length = Math.hypot(nx, ny, nz) || 1;
      normals[base] = nx / length;
      normals[base + 1] = ny / length;
      normals[base + 2] = nz / length;
    }
    if (uvs) {
      const uvBase = cluster * 2;
      uvs[uvBase] = sumU[cluster] / divisor;
      uvs[uvBase + 1] = sumV[cluster] / divisor;
    }
  }

  const indices: number[] = [];
  const seenFaces = new Set<string>();
  for (let tri = 0; tri < fullTriangles; tri += 1) {
    const aSource = sourceVertexIndex(mesh, tri, 0);
    const bSource = sourceVertexIndex(mesh, tri, 1);
    const cSource = sourceVertexIndex(mesh, tri, 2);
    if (aSource < 0 || bSource < 0 || cSource < 0 || aSource >= vertexCount || bSource >= vertexCount || cSource >= vertexCount) continue;
    const a = sourceToCluster[aSource];
    const b = sourceToCluster[bSource];
    const c = sourceToCluster[cSource];
    if (a === b || b === c || c === a) continue;
    const faceKey = [a, b, c].sort((left, right) => left - right).join(":");
    if (seenFaces.has(faceKey)) continue;
    seenFaces.add(faceKey);
    indices.push(a, b, c);
  }

  // Very coarse grid cells can occasionally collapse every face. Preserve a
  // useful preview rather than returning an empty canvas in that case.
  if (indices.length < 3) return buildTriangleSample(mesh, targetTriangles);
  return { positions, indices: Uint32Array.from(indices), normals, uvs };
};

export const buildFastPreviewProxy = (
  mesh: FastPreviewProxyInput,
  targetTriangles: number,
  algorithm: FastPreviewProxyAlgorithm
): FastPreviewProxyBuffers => {
  const fullTriangles = sourceTriangleCount(mesh);
  if (fullTriangles <= 0 || targetTriangles >= fullTriangles) {
    return {
      positions: Float32Array.from(mesh.positions),
      indices: mesh.indices ? Uint32Array.from(mesh.indices) : null,
      normals: mesh.normals ? Float32Array.from(mesh.normals) : null,
      uvs: mesh.uvs ? Float32Array.from(mesh.uvs) : null,
    };
  }
  return algorithm === "connected-cluster"
    ? buildConnectedClusterProxy(mesh, targetTriangles)
    : buildTriangleSample(mesh, targetTriangles);
};
