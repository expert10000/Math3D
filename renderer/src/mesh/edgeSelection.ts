import type { SurfaceMeshData } from "./surfaceMesh";

export type MeshEdgeSelectionTool = "loop" | "ring" | "boundary" | "sharp" | "feature";
export type MeshEdgePair = readonly [number, number];

export type MeshEdgeSelectionResult = {
  readonly tool: MeshEdgeSelectionTool;
  readonly seed: MeshEdgePair;
  readonly edges: readonly MeshEdgePair[];
  readonly label: string;
  readonly status: string;
};

type Tri = readonly [number, number, number];

type EdgeInfo = {
  readonly a: number;
  readonly b: number;
  readonly faces: number[];
};

type MeshEdgeTopology = {
  readonly vertexCount: number;
  readonly triangles: readonly Tri[];
  readonly edges: ReadonlyMap<string, EdgeInfo>;
  readonly vertexEdges: ReadonlyMap<number, readonly string[]>;
  readonly faceEdges: readonly (readonly string[])[];
};

const MAX_SELECTION_EDGES = 512;
const LOOP_CONTINUATION_COS = Math.cos((45 * Math.PI) / 180);
const RING_PARALLEL_COS = Math.cos((35 * Math.PI) / 180);
const DEFAULT_SHARP_EDGE_ANGLE_DEG = 35;

export const meshEdgeKey = (a: number, b: number): string => {
  const i0 = Math.min(a, b);
  const i1 = Math.max(a, b);
  return `${i0}-${i1}`;
};

const edgePairFromKey = (key: string): MeshEdgePair => {
  const [a, b] = key.split("-").map((part) => Number(part));
  return [a, b];
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
        Number.isInteger(a) &&
        Number.isInteger(b) &&
        Number.isInteger(c) &&
        a >= 0 &&
        b >= 0 &&
        c >= 0 &&
        a < vertexCount &&
        b < vertexCount &&
        c < vertexCount &&
        a !== b &&
        b !== c &&
        c !== a
      ) {
        triangles.push([a, b, c]);
      }
    }
    return triangles;
  }

  const triCount = Math.floor(vertexCount / 3);
  for (let i = 0; i < triCount; i += 1) {
    const base = i * 3;
    triangles.push([base, base + 1, base + 2]);
  }
  return triangles;
};

export function buildMeshEdgeTopology(mesh: SurfaceMeshData): MeshEdgeTopology {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const triangles = readTriangles(mesh, vertexCount);
  const edgeMap = new Map<string, EdgeInfo>();
  const vertexEdges = new Map<number, string[]>();
  const faceEdges: string[][] = [];

  const addVertexEdge = (vertex: number, key: string) => {
    const entries = vertexEdges.get(vertex) ?? [];
    if (!entries.includes(key)) entries.push(key);
    vertexEdges.set(vertex, entries);
  };

  const addEdge = (faceIndex: number, a: number, b: number) => {
    const key = meshEdgeKey(a, b);
    let info = edgeMap.get(key);
    if (!info) {
      const pair = edgePairFromKey(key);
      info = { a: pair[0], b: pair[1], faces: [] };
      edgeMap.set(key, info);
      addVertexEdge(info.a, key);
      addVertexEdge(info.b, key);
    }
    if (!info.faces.includes(faceIndex)) info.faces.push(faceIndex);
    return key;
  };

  triangles.forEach(([a, b, c], faceIndex) => {
    faceEdges.push([addEdge(faceIndex, a, b), addEdge(faceIndex, b, c), addEdge(faceIndex, c, a)]);
  });

  return { vertexCount, triangles, edges: edgeMap, vertexEdges, faceEdges };
}

const readPoint = (mesh: SurfaceMeshData, index: number): readonly [number, number, number] | null => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  if (!Number.isInteger(index) || index < 0 || index >= vertexCount) return null;
  const base = index * 3;
  return [
    Number(mesh.positions[base] ?? 0),
    Number(mesh.positions[base + 1] ?? 0),
    Number(mesh.positions[base + 2] ?? 0),
  ];
};

const edgeDirection = (mesh: SurfaceMeshData, from: number, to: number): readonly [number, number, number] | null => {
  const a = readPoint(mesh, from);
  const b = readPoint(mesh, to);
  if (!a || !b) return null;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(len) || len <= 1e-12) return null;
  return [dx / len, dy / len, dz / len];
};

const absDirectionDot = (
  a: readonly [number, number, number] | null,
  b: readonly [number, number, number] | null
): number => {
  if (!a || !b) return -1;
  return Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
};

const triangleNormal = (
  mesh: SurfaceMeshData,
  triangle: Tri
): readonly [number, number, number] | null => {
  const a = readPoint(mesh, triangle[0]);
  const b = readPoint(mesh, triangle[1]);
  const c = readPoint(mesh, triangle[2]);
  if (!a || !b || !c) return null;
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const acx = c[0] - a[0];
  const acy = c[1] - a[1];
  const acz = c[2] - a[2];
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const len = Math.hypot(nx, ny, nz);
  if (!Number.isFinite(len) || len <= 1e-12) return null;
  return [nx / len, ny / len, nz / len];
};

const clampUnit = (value: number): number => Math.max(-1, Math.min(1, value));

const computeFaceNormals = (
  mesh: SurfaceMeshData,
  topology: MeshEdgeTopology
): readonly (readonly [number, number, number] | null)[] =>
  topology.triangles.map((triangle) => triangleNormal(mesh, triangle));

const computeSharpEdgeKeys = (
  mesh: SurfaceMeshData,
  topology: MeshEdgeTopology,
  angleDeg = DEFAULT_SHARP_EDGE_ANGLE_DEG
): string[] => {
  const faceNormals = computeFaceNormals(mesh, topology);
  const thresholdRad = (Math.max(0, Math.min(180, angleDeg)) * Math.PI) / 180;
  const keys: string[] = [];
  for (const [key, info] of topology.edges) {
    if (info.faces.length !== 2) continue;
    const n0 = faceNormals[info.faces[0]];
    const n1 = faceNormals[info.faces[1]];
    if (!n0 || !n1) continue;
    const dot = Math.abs(clampUnit(n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]));
    const angle = Math.acos(dot);
    if (angle >= thresholdRad) keys.push(key);
  }
  return keys;
};

const connectedEdgeComponent = (
  topology: MeshEdgeTopology,
  seed: MeshEdgePair,
  selectableKeys: readonly string[]
): string[] => {
  if (!selectableKeys.length) return [];
  const seedKey = meshEdgeKey(seed[0], seed[1]);
  const selectableSet = new Set(selectableKeys);
  if (!selectableSet.has(seedKey)) return selectableKeys.slice(0, MAX_SELECTION_EDGES);

  const visited = new Set<string>([seedKey]);
  const queue = [seedKey];
  for (let cursor = 0; cursor < queue.length && visited.size < MAX_SELECTION_EDGES; cursor += 1) {
    const [a, b] = edgePairFromKey(queue[cursor]);
    for (const vertex of [a, b]) {
      for (const candidate of topology.vertexEdges.get(vertex) ?? []) {
        if (!selectableSet.has(candidate) || visited.has(candidate)) continue;
        visited.add(candidate);
        queue.push(candidate);
      }
    }
  }
  return [...visited];
};

const growLoopSide = (
  mesh: SurfaceMeshData,
  topology: MeshEdgeTopology,
  visited: Set<string>,
  seed: MeshEdgePair,
  from: number,
  at: number
) => {
  let previous = from;
  let current = at;
  for (let guard = 0; guard < MAX_SELECTION_EDGES; guard += 1) {
    const incoming = edgeDirection(mesh, previous, current);
    const candidates = topology.vertexEdges.get(current) ?? [];
    let bestKey: string | null = null;
    let bestScore = -Infinity;

    for (const key of candidates) {
      if (visited.has(key)) continue;
      const [a, b] = edgePairFromKey(key);
      const next = a === current ? b : b === current ? a : null;
      if (next == null || next === previous) continue;
      const outgoing = edgeDirection(mesh, current, next);
      const score = incoming && outgoing ? incoming[0] * outgoing[0] + incoming[1] * outgoing[1] + incoming[2] * outgoing[2] : -1;
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }

    if (!bestKey || bestScore < LOOP_CONTINUATION_COS) return;
    visited.add(bestKey);
    const [a, b] = edgePairFromKey(bestKey);
    previous = current;
    current = a === current ? b : a;
    if (current === seed[0] || current === seed[1]) return;
  }
};

const selectEdgeLoop = (mesh: SurfaceMeshData, topology: MeshEdgeTopology, seed: MeshEdgePair): string[] => {
  const seedKey = meshEdgeKey(seed[0], seed[1]);
  const visited = new Set<string>([seedKey]);
  growLoopSide(mesh, topology, visited, seed, seed[0], seed[1]);
  growLoopSide(mesh, topology, visited, seed, seed[1], seed[0]);
  return [...visited];
};

const selectEdgeRing = (mesh: SurfaceMeshData, topology: MeshEdgeTopology, seed: MeshEdgePair): string[] => {
  const seedKey = meshEdgeKey(seed[0], seed[1]);
  const seedInfo = topology.edges.get(seedKey);
  const seedDirection = edgeDirection(mesh, seed[0], seed[1]);
  const visited = new Set<string>([seedKey]);
  const visitedFaces = new Set<number>();
  const faceQueue = [...(seedInfo?.faces ?? [])];

  for (let cursor = 0; cursor < faceQueue.length && visited.size < MAX_SELECTION_EDGES; cursor += 1) {
    const faceIndex = faceQueue[cursor];
    if (visitedFaces.has(faceIndex)) continue;
    visitedFaces.add(faceIndex);
    const faceEdges = topology.faceEdges[faceIndex] ?? [];
    for (const candidateKey of faceEdges) {
      const [a, b] = edgePairFromKey(candidateKey);
      const score = absDirectionDot(seedDirection, edgeDirection(mesh, a, b));
      if (score >= RING_PARALLEL_COS) {
        visited.add(candidateKey);
      }
      const info = topology.edges.get(candidateKey);
      if (!info) continue;
      for (const nextFace of info.faces) {
        if (!visitedFaces.has(nextFace)) faceQueue.push(nextFace);
      }
    }
  }

  return [...visited];
};

const selectBoundary = (topology: MeshEdgeTopology, seed: MeshEdgePair): string[] => {
  const boundaryKeys = [...topology.edges.entries()]
    .filter(([, info]) => info.faces.length === 1)
    .map(([key]) => key);
  if (!boundaryKeys.length) return [];
  return connectedEdgeComponent(topology, seed, boundaryKeys);
};

const selectSharpEdges = (mesh: SurfaceMeshData, topology: MeshEdgeTopology, seed: MeshEdgePair): string[] =>
  connectedEdgeComponent(topology, seed, computeSharpEdgeKeys(mesh, topology));

const selectFeatureEdges = (mesh: SurfaceMeshData, topology: MeshEdgeTopology, seed: MeshEdgePair): string[] => {
  const sharpKeys = computeSharpEdgeKeys(mesh, topology);
  const featureKeys = [...topology.edges.entries()]
    .filter(([, info]) => info.faces.length !== 2)
    .map(([key]) => key);
  const combined = Array.from(new Set([...featureKeys, ...sharpKeys]));
  return connectedEdgeComponent(topology, seed, combined);
};

const toolLabel = (tool: MeshEdgeSelectionTool) =>
  tool === "loop"
    ? "Edge loop"
    : tool === "ring"
      ? "Edge ring"
      : tool === "boundary"
        ? "Boundary"
        : tool === "sharp"
          ? "Sharp edges"
          : "Feature edges";

export function selectMeshEdgesByTool(
  mesh: SurfaceMeshData,
  edgeA: number,
  edgeB: number,
  tool: MeshEdgeSelectionTool
): MeshEdgeSelectionResult {
  const topology = buildMeshEdgeTopology(mesh);
  const a = Math.round(edgeA);
  const b = Math.round(edgeB);
  const seedKey = meshEdgeKey(a, b);
  const seedInfo = topology.edges.get(seedKey);
  if (
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    a < 0 ||
    b < 0 ||
    a >= topology.vertexCount ||
    b >= topology.vertexCount ||
    a === b ||
    !seedInfo
  ) {
    throw new Error("Invalid edge selection.");
  }

  const selectedKeys =
    tool === "loop"
      ? selectEdgeLoop(mesh, topology, [a, b])
      : tool === "ring"
        ? selectEdgeRing(mesh, topology, [a, b])
        : tool === "boundary"
          ? selectBoundary(topology, [a, b])
          : tool === "sharp"
            ? selectSharpEdges(mesh, topology, [a, b])
            : selectFeatureEdges(mesh, topology, [a, b]);
  const edges = selectedKeys.map(edgePairFromKey);
  const label = toolLabel(tool);
  const seedLabel = `Edge ${seedInfo.a}-${seedInfo.b}`;
  const status =
    edges.length > 0
      ? `${label} selected ${edges.length} ${edges.length === 1 ? "edge" : "edges"} from ${seedLabel}.`
      : `${label} found no selectable edges from ${seedLabel}.`;

  return {
    tool,
    seed: [seedInfo.a, seedInfo.b],
    edges,
    label,
    status,
  };
}
