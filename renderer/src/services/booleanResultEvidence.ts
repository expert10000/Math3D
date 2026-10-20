export interface BooleanResultEvidence {
  volume: number | null;
  bounds: [number, number, number, number, number, number] | null;
  points: number;
  triangles: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  invalidTriangles: number;
  components: number;
  eulerCharacteristic: number;
  closed: boolean;
  empty: boolean;
  inputASha256?: string;
  inputBSha256?: string;
  outputSha256?: string;
}

export function measureBooleanResult(mesh: {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}): BooleanResultEvidence {
  const { positions, indices } = mesh;
  const pointCount = Math.floor(positions.length / 3);
  const triangleCount = Math.floor(indices.length / 3);
  const bounds: [number, number, number, number, number, number] = [
    Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity,
  ];
  let finitePositions = positions.length % 3 === 0;
  for (let i = 0; i < pointCount; i += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i * 3 + axis];
      if (!Number.isFinite(value)) finitePositions = false;
      bounds[axis * 2] = Math.min(bounds[axis * 2], value);
      bounds[axis * 2 + 1] = Math.max(bounds[axis * 2 + 1], value);
    }
  }

  const parent = Array.from({ length: pointCount }, (_, index) => index);
  const root = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const join = (a: number, b: number): void => {
    const ra = root(a);
    const rb = root(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const edges = new Map<string, number>();
  const used = new Set<number>();
  let invalidTriangles = indices.length % 3 === 0 ? 0 : 1;
  let validTriangles = 0;
  let signedVolume6 = 0;
  const ox = positions[0] ?? 0;
  const oy = positions[1] ?? 0;
  const oz = positions[2] ?? 0;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];
    if (![a, b, c].every((index) => Number.isInteger(index) && index >= 0 && index < pointCount)) {
      invalidTriangles += 1;
      continue;
    }
    validTriangles += 1;
    used.add(a);
    used.add(b);
    used.add(c);
    join(a, b);
    join(b, c);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    const ax = positions[a * 3] - ox;
    const ay = positions[a * 3 + 1] - oy;
    const az = positions[a * 3 + 2] - oz;
    const bx = positions[b * 3] - ox;
    const by = positions[b * 3 + 1] - oy;
    const bz = positions[b * 3 + 2] - oz;
    const cx = positions[c * 3] - ox;
    const cy = positions[c * 3 + 1] - oy;
    const cz = positions[c * 3 + 2] - oz;
    signedVolume6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edges.values()) {
    if (count === 1) boundaryEdges += 1;
    else if (count > 2) nonManifoldEdges += 1;
  }
  const empty = triangleCount === 0 && invalidTriangles === 0;
  const closed = !empty && finitePositions && invalidTriangles === 0 && boundaryEdges === 0 && nonManifoldEdges === 0;
  return {
    volume: empty ? 0 : closed && Number.isFinite(signedVolume6) ? Math.abs(signedVolume6) / 6 : null,
    bounds: pointCount > 0 && finitePositions ? bounds : null,
    points: used.size,
    triangles: triangleCount,
    boundaryEdges,
    nonManifoldEdges,
    invalidTriangles,
    components: new Set([...used].map(root)).size,
    eulerCharacteristic: used.size - edges.size + validTriangles,
    closed,
    empty,
  };
}
