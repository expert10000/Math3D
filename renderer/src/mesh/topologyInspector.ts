import type { SurfaceMeshData } from "./surfaceMesh";

export type MeshTopologyListRow = {
  readonly label: string;
  readonly detail: string;
  readonly flags: readonly string[];
};

export type MeshTopologyBoundaryLoop = {
  readonly label: string;
  readonly edgeCount: number;
  readonly edges: readonly string[];
  readonly vertices: readonly number[];
  readonly closed: boolean;
};

export type MeshTopologyFlag = {
  readonly label: string;
  readonly value: string;
  readonly tone: "good" | "warn" | "neutral";
};

export type MeshTopologyInspectorDetails = {
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly edgeCount: number;
  readonly boundaryEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly connectedComponentCount: number;
  readonly eulerCharacteristic: number;
  readonly hasBoundary: boolean;
  readonly manifold: boolean;
  readonly watertight: boolean;
  readonly closed: boolean;
  readonly open: boolean;
  readonly orientable: boolean | null;
  readonly orientabilityLabel: "orientable" | "unknown" | "non-orientable";
  readonly topologyTypeLabel: "closed mesh" | "open mesh" | "non-manifold mesh";
  readonly isolatedVertexCount: number;
  readonly rowLimit: number;
  readonly itemLimit: number;
  readonly vertexAdjacencyRows: readonly MeshTopologyListRow[];
  readonly faceAdjacencyRows: readonly MeshTopologyListRow[];
  readonly edgeIncidenceRows: readonly MeshTopologyListRow[];
  readonly boundaryLoops: readonly MeshTopologyBoundaryLoop[];
  readonly flags: readonly MeshTopologyFlag[];
};

export type MeshTopologyInspectorOptions = {
  readonly rowLimit?: number;
  readonly itemLimit?: number;
};

type Tri = readonly [number, number, number];
type OrientedFaceEdge = { readonly faceIndex: number; readonly direction: 1 | -1 };
type EdgeRecord = {
  readonly a: number;
  readonly b: number;
  readonly faces: number[];
  readonly orientedFaces: OrientedFaceEdge[];
};

const edgeKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

const formatIndexList = (prefix: string, values: readonly number[], limit: number): string => {
  if (!values.length) return "none";
  const sorted = [...values].sort((a, b) => a - b);
  const listed = sorted.slice(0, limit).map((value) => `${prefix}${value}`);
  const suffix = sorted.length > limit ? ` +${sorted.length - limit} more` : "";
  return `${listed.join(", ")}${suffix}`;
};

const readTriangles = (mesh: SurfaceMeshData): Tri[] => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const triangles: Tri[] = [];
  if (mesh.indices && mesh.indices.length >= 3) {
    const faceCount = Math.floor(mesh.indices.length / 3);
    for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
      const base = faceIndex * 3;
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

  const faceCount = Math.floor(vertexCount / 3);
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    const base = faceIndex * 3;
    triangles.push([base, base + 1, base + 2]);
  }
  return triangles;
};

const computeConnectedComponents = (vertexNeighbors: readonly ReadonlySet<number>[]): number => {
  const visited = new Uint8Array(vertexNeighbors.length);
  let components = 0;
  for (let start = 0; start < vertexNeighbors.length; start += 1) {
    if (visited[start]) continue;
    components += 1;
    visited[start] = 1;
    const stack = [start];
    while (stack.length) {
      const current = stack.pop() ?? -1;
      for (const next of vertexNeighbors[current] ?? []) {
        if (next < 0 || next >= vertexNeighbors.length || visited[next]) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
  }
  return components;
};

const computeOrientable = (
  faceCount: number,
  edgeMap: ReadonlyMap<string, EdgeRecord>,
  faceEdges: readonly (readonly string[])[]
): boolean | null => {
  if (faceCount <= 0) return null;
  if ([...edgeMap.values()].some((edge) => edge.faces.length > 2)) return null;
  const assigned = new Map<number, boolean>();
  for (let start = 0; start < faceCount; start += 1) {
    if (assigned.has(start)) continue;
    assigned.set(start, false);
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const faceIndex = queue[cursor];
      const faceFlip = assigned.get(faceIndex) ?? false;
      for (const key of faceEdges[faceIndex] ?? []) {
        const edge = edgeMap.get(key);
        if (!edge || edge.orientedFaces.length !== 2) continue;
        const [first, second] = edge.orientedFaces;
        const other = first.faceIndex === faceIndex ? second : second.faceIndex === faceIndex ? first : null;
        const current = first.faceIndex === faceIndex ? first : second.faceIndex === faceIndex ? second : null;
        if (!other || !current) continue;
        const sameDirection = current.direction === other.direction;
        const requiredOtherFlip = sameDirection ? !faceFlip : faceFlip;
        const previous = assigned.get(other.faceIndex);
        if (previous == null) {
          assigned.set(other.faceIndex, requiredOtherFlip);
          queue.push(other.faceIndex);
        } else if (previous !== requiredOtherFlip) {
          return false;
        }
      }
    }
  }
  return true;
};

const computeBoundaryLoops = (
  boundaryKeys: readonly string[],
  edgeMap: ReadonlyMap<string, EdgeRecord>,
  vertexEdges: readonly ReadonlySet<string>[],
  itemLimit: number
): MeshTopologyBoundaryLoop[] => {
  const boundarySet = new Set(boundaryKeys);
  const visited = new Set<string>();
  const loops: MeshTopologyBoundaryLoop[] = [];

  const orderedComponent = (component: readonly string[]): { edges: string[]; vertices: number[]; closed: boolean } => {
    const componentSet = new Set(component);
    const vertexToKeys = new Map<number, string[]>();
    for (const key of component) {
      const edge = edgeMap.get(key);
      if (!edge) continue;
      vertexToKeys.set(edge.a, [...(vertexToKeys.get(edge.a) ?? []), key]);
      vertexToKeys.set(edge.b, [...(vertexToKeys.get(edge.b) ?? []), key]);
    }
    const endpoints = [...vertexToKeys.entries()]
      .filter(([, keys]) => keys.length === 1)
      .map(([vertex]) => vertex);
    const closed = endpoints.length === 0 && [...vertexToKeys.values()].every((keys) => keys.length === 2);
    const startVertex = endpoints[0] ?? [...vertexToKeys.keys()].sort((a, b) => a - b)[0] ?? null;
    if (startVertex == null) return { edges: [...component], vertices: [], closed: false };

    const orderedEdges: string[] = [];
    const orderedVertices: number[] = [startVertex];
    let currentVertex = startVertex;
    let previousKey: string | null = null;
    for (let guard = 0; guard < component.length; guard += 1) {
      const nextKey = (vertexToKeys.get(currentVertex) ?? [])
        .filter((key) => componentSet.has(key) && key !== previousKey && !orderedEdges.includes(key))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
      if (!nextKey) break;
      const edge = edgeMap.get(nextKey);
      if (!edge) break;
      orderedEdges.push(nextKey);
      const nextVertex = edge.a === currentVertex ? edge.b : edge.a;
      if (!closed || nextVertex !== startVertex || orderedEdges.length < component.length) {
        orderedVertices.push(nextVertex);
      }
      previousKey = nextKey;
      currentVertex = nextVertex;
      if (closed && currentVertex === startVertex && orderedEdges.length === component.length) break;
    }

    if (orderedEdges.length !== component.length) {
      for (const key of component) {
        if (!orderedEdges.includes(key)) orderedEdges.push(key);
      }
    }
    return { edges: orderedEdges, vertices: orderedVertices, closed };
  };

  for (const startKey of boundaryKeys) {
    if (visited.has(startKey)) continue;
    const queue = [startKey];
    const component: string[] = [];
    const vertices = new Set<number>();
    visited.add(startKey);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const key = queue[cursor];
      const edge = edgeMap.get(key);
      if (!edge) continue;
      component.push(key);
      vertices.add(edge.a);
      vertices.add(edge.b);
      for (const vertex of [edge.a, edge.b]) {
        for (const nextKey of vertexEdges[vertex] ?? []) {
          if (!boundarySet.has(nextKey) || visited.has(nextKey)) continue;
          visited.add(nextKey);
          queue.push(nextKey);
        }
      }
    }
    const ordered = orderedComponent(component);
    const loopIndex = loops.length + 1;
    loops.push({
      label: `${ordered.closed ? "loop" : "chain"} ${loopIndex}`,
      edgeCount: ordered.edges.length,
      edges: ordered.edges.slice(0, itemLimit),
      vertices: ordered.vertices.slice(0, itemLimit + 1),
      closed: ordered.closed,
    });
  }
  return loops;
};

export const computeMeshTopologyInspector = (
  mesh: SurfaceMeshData | null,
  options: MeshTopologyInspectorOptions = {}
): MeshTopologyInspectorDetails | null => {
  if (!mesh?.positions?.length) return null;
  const rowLimit = Math.max(4, Math.floor(options.rowLimit ?? 18));
  const itemLimit = Math.max(4, Math.floor(options.itemLimit ?? 12));
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const triangles = readTriangles(mesh);
  const faceCount = triangles.length;
  const vertexNeighbors = Array.from({ length: vertexCount }, () => new Set<number>());
  const vertexFaces = Array.from({ length: vertexCount }, () => new Set<number>());
  const vertexEdges = Array.from({ length: vertexCount }, () => new Set<string>());
  const faceNeighbors = Array.from({ length: faceCount }, () => new Set<number>());
  const faceEdges: string[][] = [];
  const edgeMap = new Map<string, EdgeRecord>();

  const linkEdge = (faceIndex: number, from: number, to: number): string => {
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    const key = edgeKey(a, b);
    let edge = edgeMap.get(key);
    if (!edge) {
      edge = { a, b, faces: [], orientedFaces: [] };
      edgeMap.set(key, edge);
    }
    if (!edge.faces.includes(faceIndex)) edge.faces.push(faceIndex);
    edge.orientedFaces.push({ faceIndex, direction: from === a && to === b ? 1 : -1 });
    vertexEdges[a]?.add(key);
    vertexEdges[b]?.add(key);
    return key;
  };

  triangles.forEach(([a, b, c], faceIndex) => {
    vertexNeighbors[a]?.add(b);
    vertexNeighbors[a]?.add(c);
    vertexNeighbors[b]?.add(a);
    vertexNeighbors[b]?.add(c);
    vertexNeighbors[c]?.add(a);
    vertexNeighbors[c]?.add(b);
    vertexFaces[a]?.add(faceIndex);
    vertexFaces[b]?.add(faceIndex);
    vertexFaces[c]?.add(faceIndex);
    faceEdges.push([linkEdge(faceIndex, a, b), linkEdge(faceIndex, b, c), linkEdge(faceIndex, c, a)]);
  });

  for (const edge of edgeMap.values()) {
    for (const faceA of edge.faces) {
      for (const faceB of edge.faces) {
        if (faceA !== faceB) faceNeighbors[faceA]?.add(faceB);
      }
    }
  }

  const edgeRows = [...edgeMap.values()].sort((a, b) => a.a - b.a || a.b - b.b);
  const boundaryKeys = edgeRows.filter((edge) => edge.faces.length === 1).map((edge) => edgeKey(edge.a, edge.b));
  const nonManifoldEdgeCount = edgeRows.filter((edge) => edge.faces.length > 2).length;
  const boundaryEdgeSet = new Set(boundaryKeys);
  const boundaryLoops = computeBoundaryLoops(boundaryKeys, edgeMap, vertexEdges, itemLimit);
  const isolatedVertexCount = vertexNeighbors.filter((neighbors) => neighbors.size === 0).length;
  const orientable = computeOrientable(faceCount, edgeMap, faceEdges);
  const hasBoundary = boundaryKeys.length > 0;
  const manifold = nonManifoldEdgeCount === 0;
  const watertight = !hasBoundary && manifold;
  const closed = watertight;
  const open = hasBoundary && manifold;
  const orientabilityLabel = orientable == null ? "unknown" : orientable ? "orientable" : "non-orientable";
  const topologyTypeLabel = !manifold ? "non-manifold mesh" : closed ? "closed mesh" : "open mesh";
  const eulerCharacteristic = vertexCount - edgeRows.length + faceCount;

  const vertexAdjacencyRows = vertexNeighbors.slice(0, rowLimit).map<MeshTopologyListRow>((neighbors, vertexIndex) => {
    const flags: string[] = [];
    const incidentBoundary = [...(vertexEdges[vertexIndex] ?? [])].some((key) => boundaryEdgeSet.has(key));
    if (incidentBoundary) flags.push("boundary");
    if (!neighbors.size) flags.push("isolated");
    return {
      label: `v${vertexIndex}`,
      detail: `neighbors: ${formatIndexList("v", [...neighbors], itemLimit)}; faces: ${formatIndexList(
        "f",
        [...(vertexFaces[vertexIndex] ?? [])],
        itemLimit
      )}`,
      flags,
    };
  });

  const faceAdjacencyRows = triangles.slice(0, rowLimit).map<MeshTopologyListRow>((tri, faceIndex) => ({
    label: `f${faceIndex}`,
    detail: `vertices: ${tri.map((vertex) => `v${vertex}`).join(", ")}; neighbors: ${formatIndexList(
      "f",
      [...(faceNeighbors[faceIndex] ?? [])],
      itemLimit
    )}; edges: ${(faceEdges[faceIndex] ?? []).slice(0, itemLimit).map((key) => `e${key}`).join(", ") || "none"}`,
    flags: (faceEdges[faceIndex] ?? []).some((key) => boundaryEdgeSet.has(key)) ? ["touches boundary"] : [],
  }));

  const edgeIncidenceRows = edgeRows.slice(0, rowLimit).map<MeshTopologyListRow>((edge) => {
    const flags: string[] = [];
    if (edge.faces.length === 1) flags.push("boundary");
    if (edge.faces.length > 2) flags.push("non-manifold");
    return {
      label: `e${edge.a}-${edge.b}`,
      detail: `faces: ${formatIndexList("f", edge.faces, itemLimit)}; endpoints: v${edge.a}, v${edge.b}`,
      flags,
    };
  });

  const flags: MeshTopologyFlag[] = [
    { label: "Manifold", value: manifold ? "yes" : "no", tone: manifold ? "good" : "warn" },
    { label: "Mesh", value: topologyTypeLabel, tone: !manifold ? "warn" : closed ? "good" : "neutral" },
    { label: "Watertight", value: watertight ? "yes" : "no", tone: watertight ? "good" : hasBoundary ? "neutral" : "warn" },
    { label: "Boundary", value: hasBoundary ? "yes" : "no", tone: hasBoundary ? "neutral" : "good" },
    {
      label: "Non-manifold edges",
      value: String(nonManifoldEdgeCount),
      tone: nonManifoldEdgeCount === 0 ? "good" : "warn",
    },
    {
      label: "Orientable",
      value: orientabilityLabel,
      tone: orientable === false ? "warn" : orientable === true ? "good" : "neutral",
    },
    {
      label: "Isolated vertices",
      value: String(isolatedVertexCount),
      tone: isolatedVertexCount === 0 ? "good" : "warn",
    },
  ];

  return {
    vertexCount,
    faceCount,
    edgeCount: edgeRows.length,
    boundaryEdgeCount: boundaryKeys.length,
    nonManifoldEdgeCount,
    connectedComponentCount: computeConnectedComponents(vertexNeighbors),
    eulerCharacteristic,
    hasBoundary,
    manifold,
    watertight,
    closed,
    open,
    orientable,
    orientabilityLabel,
    topologyTypeLabel,
    isolatedVertexCount,
    rowLimit,
    itemLimit,
    vertexAdjacencyRows,
    faceAdjacencyRows,
    edgeIncidenceRows,
    boundaryLoops,
    flags,
  };
};
