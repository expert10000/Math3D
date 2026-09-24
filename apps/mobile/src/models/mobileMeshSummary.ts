export type MobileMeshSummary = {
  status: "ready";
  source: string;
  vertexCount: number;
  triangleCount: number;
  surfaceArea: number;
  enclosedVolume: number | null;
  componentCount: number;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  orientationMismatchEdgeCount: number;
  eulerCharacteristic: number;
  degenerateTriangleCount: number;
  isolatedVertexCount: number;
  manifold: boolean;
  closed: boolean;
  healthy: boolean;
};

export type MobileMeshSummaryResult =
  | MobileMeshSummary
  | { status: "unavailable"; reason: string };

type MeshBufferInput = {
  positions: ArrayLike<number>;
  indices?: ArrayLike<number> | null;
  source: string;
};

class DisjointSet {
  private readonly parent: Int32Array;

  constructor(size: number) {
    this.parent = new Int32Array(size);
    for (let index = 0; index < size; index += 1) this.parent[index] = index;
  }

  find(value: number): number {
    let root = value;
    while (this.parent[root] !== root) root = this.parent[root];
    let cursor = value;
    while (this.parent[cursor] !== cursor) {
      const next = this.parent[cursor];
      this.parent[cursor] = root;
      cursor = next;
    }
    return root;
  }

  union(a: number, b: number) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent[rootB] = rootA;
  }
}

type EdgeUse = { count: number; direction: number };

const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;

export const summarizeMobileMesh = (input: MeshBufferInput): MobileMeshSummaryResult => {
  if (input.positions.length < 9 || input.positions.length % 3 !== 0) {
    return { status: "unavailable", reason: "Mesh positions do not contain complete triangles." };
  }
  const vertexCount = input.positions.length / 3;
  const indexCount = input.indices?.length ?? vertexCount;
  if (indexCount < 3 || indexCount % 3 !== 0) {
    return { status: "unavailable", reason: "Mesh indices do not contain complete triangles." };
  }

  const indexAt = (offset: number) => input.indices ? Number(input.indices[offset]) : offset;
  const disjoint = new DisjointSet(vertexCount);
  const usedVertices = new Set<number>();
  const edges = new Map<string, EdgeUse>();
  let surfaceArea = 0;
  let signedVolume = 0;
  let triangleCount = 0;
  let degenerateTriangleCount = 0;

  const addEdge = (a: number, b: number) => {
    const key = edgeKey(a, b);
    const direction = a < b ? 1 : -1;
    const current = edges.get(key);
    if (current) {
      current.count += 1;
      current.direction += direction;
    } else {
      edges.set(key, { count: 1, direction });
    }
  };

  for (let offset = 0; offset < indexCount; offset += 3) {
    const ia = indexAt(offset);
    const ib = indexAt(offset + 1);
    const ic = indexAt(offset + 2);
    if (![ia, ib, ic].every((index) => Number.isInteger(index) && index >= 0 && index < vertexCount)) {
      return { status: "unavailable", reason: "Mesh indices reference missing vertices." };
    }
    if (ia === ib || ib === ic || ic === ia) {
      degenerateTriangleCount += 1;
      continue;
    }

    const ax = Number(input.positions[ia * 3]);
    const ay = Number(input.positions[ia * 3 + 1]);
    const az = Number(input.positions[ia * 3 + 2]);
    const bx = Number(input.positions[ib * 3]);
    const by = Number(input.positions[ib * 3 + 1]);
    const bz = Number(input.positions[ib * 3 + 2]);
    const cx = Number(input.positions[ic * 3]);
    const cy = Number(input.positions[ic * 3 + 1]);
    const cz = Number(input.positions[ic * 3 + 2]);
    if (![ax, ay, az, bx, by, bz, cx, cy, cz].every(Number.isFinite)) {
      return { status: "unavailable", reason: "Mesh contains non-finite coordinates." };
    }

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const doubledArea = Math.hypot(crossX, crossY, crossZ);
    if (doubledArea <= 1e-12) {
      degenerateTriangleCount += 1;
      continue;
    }

    triangleCount += 1;
    surfaceArea += doubledArea * 0.5;
    signedVolume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    usedVertices.add(ia);
    usedVertices.add(ib);
    usedVertices.add(ic);
    disjoint.union(ia, ib);
    disjoint.union(ib, ic);
    addEdge(ia, ib);
    addEdge(ib, ic);
    addEdge(ic, ia);
  }

  if (triangleCount === 0) return { status: "unavailable", reason: "Mesh has no non-degenerate triangles." };

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  let orientationMismatchEdgeCount = 0;
  for (const edge of edges.values()) {
    if (edge.count === 1) boundaryEdgeCount += 1;
    if (edge.count > 2) nonManifoldEdgeCount += 1;
    if (edge.count === 2 && edge.direction !== 0) orientationMismatchEdgeCount += 1;
  }
  const componentRoots = new Set(Array.from(usedVertices, (vertex) => disjoint.find(vertex)));
  const isolatedVertexCount = vertexCount - usedVertices.size;
  const manifold = nonManifoldEdgeCount === 0;
  const closed = manifold && boundaryEdgeCount === 0;
  const orientedClosed = closed && orientationMismatchEdgeCount === 0;

  return {
    status: "ready",
    source: input.source,
    vertexCount,
    triangleCount,
    surfaceArea,
    enclosedVolume: orientedClosed ? Math.abs(signedVolume) : null,
    componentCount: componentRoots.size,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    orientationMismatchEdgeCount,
    eulerCharacteristic: usedVertices.size - edges.size + triangleCount,
    degenerateTriangleCount,
    isolatedVertexCount,
    manifold,
    closed,
    healthy: degenerateTriangleCount === 0 && isolatedVertexCount === 0 && nonManifoldEdgeCount === 0 && orientationMismatchEdgeCount === 0,
  };
};
