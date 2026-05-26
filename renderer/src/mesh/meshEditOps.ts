import type { SurfaceMeshData } from "./surfaceMesh";

type Tri = [number, number, number];

const EPS = 1e-9;

const assertMeshVertices = (mesh: SurfaceMeshData) => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  if (vertexCount <= 0) {
    throw new Error("Mesh has no vertices.");
  }
  return vertexCount;
};

const readTriangles = (mesh: SurfaceMeshData, vertexCount: number): Tri[] => {
  const triangles: Tri[] = [];
  if (mesh.indices && mesh.indices.length >= 3) {
    const triCount = Math.floor(mesh.indices.length / 3);
    for (let i = 0; i < triCount; i += 1) {
      const base = i * 3;
      const a = Number(mesh.indices[base]);
      const b = Number(mesh.indices[base + 1]);
      const c = Number(mesh.indices[base + 2]);
      if (
        !Number.isInteger(a) ||
        !Number.isInteger(b) ||
        !Number.isInteger(c) ||
        a < 0 ||
        b < 0 ||
        c < 0 ||
        a >= vertexCount ||
        b >= vertexCount ||
        c >= vertexCount
      ) {
        continue;
      }
      triangles.push([a, b, c]);
    }
    return triangles;
  }

  const triCount = Math.floor(vertexCount / 3);
  for (let i = 0; i < triCount; i += 1) {
    const a = i * 3;
    triangles.push([a, a + 1, a + 2]);
  }
  return triangles;
};

const compactMesh = (positions: number[], triangles: Tri[]) => {
  const used = new Set<number>();
  for (const [a, b, c] of triangles) {
    used.add(a);
    used.add(b);
    used.add(c);
  }
  const sorted = Array.from(used).sort((x, y) => x - y);
  const remap = new Map<number, number>();
  const nextPositions: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const source = sorted[i];
    remap.set(source, i);
    const base = source * 3;
    nextPositions.push(positions[base] ?? 0, positions[base + 1] ?? 0, positions[base + 2] ?? 0);
  }
  const nextTriangles: Tri[] = [];
  for (const tri of triangles) {
    const a = remap.get(tri[0]);
    const b = remap.get(tri[1]);
    const c = remap.get(tri[2]);
    if (a == null || b == null || c == null) continue;
    if (a === b || b === c || c === a) continue;
    nextTriangles.push([a, b, c]);
  }
  return { positions: nextPositions, triangles: nextTriangles };
};

const buildMesh = (mesh: SurfaceMeshData, positions: number[], triangles: Tri[], compact = false): SurfaceMeshData => {
  const resolved = compact ? compactMesh(positions, triangles) : { positions, triangles };
  const indices = new Uint32Array(resolved.triangles.length * 3);
  for (let i = 0; i < resolved.triangles.length; i += 1) {
    const base = i * 3;
    const tri = resolved.triangles[i];
    indices[base] = tri[0];
    indices[base + 1] = tri[1];
    indices[base + 2] = tri[2];
  }
  return {
    ...mesh,
    positions: Float32Array.from(resolved.positions),
    indices,
    normals: null,
    uvs: null,
    adjacency: null,
    meanEdgeLength: null,
    validation: null,
  };
};

const faceFromIndex = (triangles: Tri[], faceIndex: number): Tri => {
  if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= triangles.length) {
    throw new Error("Invalid face selection.");
  }
  return triangles[faceIndex];
};

const vec3At = (positions: number[], idx: number): [number, number, number] => {
  const base = idx * 3;
  return [positions[base] ?? 0, positions[base + 1] ?? 0, positions[base + 2] ?? 0];
};

const pushVec3 = (positions: number[], value: [number, number, number]) => {
  const idx = Math.floor(positions.length / 3);
  positions.push(value[0], value[1], value[2]);
  return idx;
};

const triangleNormal = (positions: number[], tri: Tri): [number, number, number] => {
  const [ax, ay, az] = vec3At(positions, tri[0]);
  const [bx, by, bz] = vec3At(positions, tri[1]);
  const [cx, cy, cz] = vec3At(positions, tri[2]);
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const len = Math.hypot(nx, ny, nz);
  if (!Number.isFinite(len) || len <= EPS) return [0, 1, 0];
  return [nx / len, ny / len, nz / len];
};

const splitTriangleByEdge = (tri: Tri, edgeA: number, edgeB: number, mid: number): Tri[] | null => {
  const [v0, v1, v2] = tri;
  const is01 = (v0 === edgeA && v1 === edgeB) || (v0 === edgeB && v1 === edgeA);
  if (is01) return [[v0, mid, v2], [mid, v1, v2]];
  const is12 = (v1 === edgeA && v2 === edgeB) || (v1 === edgeB && v2 === edgeA);
  if (is12) return [[v1, mid, v0], [mid, v2, v0]];
  const is20 = (v2 === edgeA && v0 === edgeB) || (v2 === edgeB && v0 === edgeA);
  if (is20) return [[v2, mid, v1], [mid, v0, v1]];
  return null;
};

const vertexNormal = (positions: number[], triangles: Tri[], vertexIndex: number): [number, number, number] => {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (const tri of triangles) {
    if (tri[0] !== vertexIndex && tri[1] !== vertexIndex && tri[2] !== vertexIndex) continue;
    const n = triangleNormal(positions, tri);
    nx += n[0];
    ny += n[1];
    nz += n[2];
  }
  const len = Math.hypot(nx, ny, nz);
  if (!Number.isFinite(len) || len <= EPS) return [0, 1, 0];
  return [nx / len, ny / len, nz / len];
};

export const extrudeFace = (mesh: SurfaceMeshData, faceIndex: number, distance: number): SurfaceMeshData => {
  const vertexCount = assertMeshVertices(mesh);
  const triangles = readTriangles(mesh, vertexCount);
  const tri = faceFromIndex(triangles, faceIndex);
  const positions = Array.from(mesh.positions);
  const n = triangleNormal(positions, tri);
  const d = Number.isFinite(distance) ? distance : 0;
  if (Math.abs(d) <= EPS) {
    throw new Error("Extrude distance must be non-zero.");
  }

  const [a, b, c] = tri;
  const [ax, ay, az] = vec3At(positions, a);
  const [bx, by, bz] = vec3At(positions, b);
  const [cx, cy, cz] = vec3At(positions, c);
  const an = pushVec3(positions, [ax + n[0] * d, ay + n[1] * d, az + n[2] * d]);
  const bn = pushVec3(positions, [bx + n[0] * d, by + n[1] * d, bz + n[2] * d]);
  const cn = pushVec3(positions, [cx + n[0] * d, cy + n[1] * d, cz + n[2] * d]);

  const nextTriangles = triangles.slice();
  nextTriangles.push([an, bn, cn]);
  nextTriangles.push([a, b, bn], [a, bn, an]);
  nextTriangles.push([b, c, cn], [b, cn, bn]);
  nextTriangles.push([c, a, an], [c, an, cn]);
  return buildMesh(mesh, positions, nextTriangles);
};

export const insetFace = (mesh: SurfaceMeshData, faceIndex: number, ratio: number): SurfaceMeshData => {
  const vertexCount = assertMeshVertices(mesh);
  const triangles = readTriangles(mesh, vertexCount);
  const tri = faceFromIndex(triangles, faceIndex);
  const t = Math.max(0.02, Math.min(0.92, Number.isFinite(ratio) ? ratio : 0.2));
  const positions = Array.from(mesh.positions);
  const [a, b, c] = tri;
  const pa = vec3At(positions, a);
  const pb = vec3At(positions, b);
  const pc = vec3At(positions, c);
  const centroid: [number, number, number] = [
    (pa[0] + pb[0] + pc[0]) / 3,
    (pa[1] + pb[1] + pc[1]) / 3,
    (pa[2] + pb[2] + pc[2]) / 3,
  ];
  const lerp = (p: [number, number, number]): [number, number, number] => [
    p[0] + (centroid[0] - p[0]) * t,
    p[1] + (centroid[1] - p[1]) * t,
    p[2] + (centroid[2] - p[2]) * t,
  ];
  const ai = pushVec3(positions, lerp(pa));
  const bi = pushVec3(positions, lerp(pb));
  const ci = pushVec3(positions, lerp(pc));

  const nextTriangles = triangles.filter((_, idx) => idx !== faceIndex);
  nextTriangles.push([ai, bi, ci]);
  nextTriangles.push([a, b, bi], [a, bi, ai]);
  nextTriangles.push([b, c, ci], [b, ci, bi]);
  nextTriangles.push([c, a, ai], [c, ai, ci]);
  return buildMesh(mesh, positions, nextTriangles);
};

export const deleteFace = (mesh: SurfaceMeshData, faceIndex: number): SurfaceMeshData => {
  const vertexCount = assertMeshVertices(mesh);
  const triangles = readTriangles(mesh, vertexCount);
  faceFromIndex(triangles, faceIndex);
  const nextTriangles = triangles.filter((_, idx) => idx !== faceIndex);
  return buildMesh(mesh, Array.from(mesh.positions), nextTriangles, true);
};

export const splitEdge = (mesh: SurfaceMeshData, edgeA: number, edgeB: number): SurfaceMeshData => {
  const vertexCount = assertMeshVertices(mesh);
  if (edgeA < 0 || edgeB < 0 || edgeA >= vertexCount || edgeB >= vertexCount || edgeA === edgeB) {
    throw new Error("Invalid edge selection.");
  }
  const triangles = readTriangles(mesh, vertexCount);
  const positions = Array.from(mesh.positions);
  const aPos = vec3At(positions, edgeA);
  const bPos = vec3At(positions, edgeB);
  const mid = pushVec3(positions, [
    (aPos[0] + bPos[0]) * 0.5,
    (aPos[1] + bPos[1]) * 0.5,
    (aPos[2] + bPos[2]) * 0.5,
  ]);
  const nextTriangles: Tri[] = [];
  let splitCount = 0;
  for (const tri of triangles) {
    const split = splitTriangleByEdge(tri, edgeA, edgeB, mid);
    if (!split) {
      nextTriangles.push(tri);
      continue;
    }
    nextTriangles.push(split[0], split[1]);
    splitCount += 1;
  }
  if (!splitCount) {
    throw new Error("Selected edge is not part of any face.");
  }
  return buildMesh(mesh, positions, nextTriangles);
};

export const bevelEdge = (mesh: SurfaceMeshData, edgeA: number, edgeB: number, amount: number): SurfaceMeshData => {
  const vertexCount = assertMeshVertices(mesh);
  if (edgeA < 0 || edgeB < 0 || edgeA >= vertexCount || edgeB >= vertexCount || edgeA === edgeB) {
    throw new Error("Invalid edge selection.");
  }
  const triangles = readTriangles(mesh, vertexCount);
  const positions = Array.from(mesh.positions);
  const d = Number.isFinite(amount) ? amount : 0;
  if (Math.abs(d) <= EPS) throw new Error("Bevel amount must be non-zero.");

  const edgeNormal: [number, number, number] = [0, 0, 0];
  let support = 0;
  for (const tri of triangles) {
    const hasA = tri[0] === edgeA || tri[1] === edgeA || tri[2] === edgeA;
    const hasB = tri[0] === edgeB || tri[1] === edgeB || tri[2] === edgeB;
    if (!hasA || !hasB) continue;
    const n = triangleNormal(positions, tri);
    edgeNormal[0] += n[0];
    edgeNormal[1] += n[1];
    edgeNormal[2] += n[2];
    support += 1;
  }
  if (!support) {
    throw new Error("Selected edge is not part of any face.");
  }
  const len = Math.hypot(edgeNormal[0], edgeNormal[1], edgeNormal[2]);
  if (!Number.isFinite(len) || len <= EPS) {
    throw new Error("Unable to compute bevel direction for selected edge.");
  }
  const nx = edgeNormal[0] / len;
  const ny = edgeNormal[1] / len;
  const nz = edgeNormal[2] / len;
  const move = (idx: number) => {
    const base = idx * 3;
    positions[base] += nx * d;
    positions[base + 1] += ny * d;
    positions[base + 2] += nz * d;
  };
  move(edgeA);
  move(edgeB);
  return buildMesh(mesh, positions, triangles);
};

export const moveVertex = (
  mesh: SurfaceMeshData,
  vertexIndex: number,
  amount: number,
  direction?: { x: number; y: number; z: number } | null
): SurfaceMeshData => {
  const vertexCount = assertMeshVertices(mesh);
  if (vertexIndex < 0 || vertexIndex >= vertexCount) {
    throw new Error("Invalid vertex selection.");
  }
  const triangles = readTriangles(mesh, vertexCount);
  const positions = Array.from(mesh.positions);
  const base = vertexIndex * 3;
  const d = Number.isFinite(amount) ? amount : 0;
  if (Math.abs(d) <= EPS) throw new Error("Move amount must be non-zero.");
  let dir: [number, number, number];
  if (
    direction &&
    Number.isFinite(direction.x) &&
    Number.isFinite(direction.y) &&
    Number.isFinite(direction.z) &&
    Math.hypot(direction.x, direction.y, direction.z) > EPS
  ) {
    const n = Math.hypot(direction.x, direction.y, direction.z);
    dir = [direction.x / n, direction.y / n, direction.z / n];
  } else {
    dir = vertexNormal(positions, triangles, vertexIndex);
  }
  positions[base] += dir[0] * d;
  positions[base + 1] += dir[1] * d;
  positions[base + 2] += dir[2] * d;
  return buildMesh(mesh, positions, triangles);
};

export const weldVertices = (mesh: SurfaceMeshData, keep: number, merge: number): SurfaceMeshData => {
  const vertexCount = assertMeshVertices(mesh);
  if (
    keep < 0 ||
    merge < 0 ||
    keep >= vertexCount ||
    merge >= vertexCount ||
    keep === merge ||
    !Number.isInteger(keep) ||
    !Number.isInteger(merge)
  ) {
    throw new Error("Invalid weld selection.");
  }
  const triangles = readTriangles(mesh, vertexCount);
  const positions = Array.from(mesh.positions);
  const nextTriangles: Tri[] = [];
  for (const tri of triangles) {
    const ta = tri[0] === merge ? keep : tri[0];
    const tb = tri[1] === merge ? keep : tri[1];
    const tc = tri[2] === merge ? keep : tri[2];
    if (ta === tb || tb === tc || tc === ta) continue;
    nextTriangles.push([ta, tb, tc]);
  }
  return buildMesh(mesh, positions, nextTriangles, true);
};

