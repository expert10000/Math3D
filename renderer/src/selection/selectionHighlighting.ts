import type {
  OverlayMeshGroup,
  OverlayPointSet,
  OverlayPolylineGroup,
} from "../components/SurfaceViewer";
import { buildMeshEdgeTopology, meshEdgeKey } from "../mesh/edgeSelection";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import type { SelectionResult, UnifiedSelectionManagerState } from "./unifiedSelection";

type Vec3 = { x: number; y: number; z: number };
type EdgePair = readonly [number, number];

export type SelectionHighlightOverlays = {
  readonly meshGroups: readonly OverlayMeshGroup[];
  readonly pointSets: readonly OverlayPointSet[];
  readonly polylineGroups: readonly OverlayPolylineGroup[];
};

export const SELECTION_HIGHLIGHT_COLORS = {
  selected: 0xf97316,
  hover: 0x2563eb,
  adjacent: 0x67e8f9,
  preview: 0x8b5cf6,
  previewAlt: 0xffffff,
} as const;

const EMPTY_OVERLAYS: SelectionHighlightOverlays = {
  meshGroups: [],
  pointSets: [],
  polylineGroups: [],
};

const readPoint = (mesh: SurfaceMeshData, index: number): Vec3 | null => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  if (!Number.isInteger(index) || index < 0 || index >= vertexCount) return null;
  const base = index * 3;
  return {
    x: Number(mesh.positions[base] ?? 0),
    y: Number(mesh.positions[base + 1] ?? 0),
    z: Number(mesh.positions[base + 2] ?? 0),
  };
};

const readTriangle = (mesh: SurfaceMeshData, faceIndex: number): [number, number, number] | null => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  if (!Number.isInteger(faceIndex) || faceIndex < 0) return null;
  if (mesh.indices && mesh.indices.length >= 3) {
    const base = faceIndex * 3;
    if (base + 2 >= mesh.indices.length) return null;
    const a = Number(mesh.indices[base]);
    const b = Number(mesh.indices[base + 1]);
    const c = Number(mesh.indices[base + 2]);
    if ([a, b, c].some((value) => !Number.isInteger(value) || value < 0 || value >= vertexCount)) return null;
    return [a, b, c];
  }
  const base = faceIndex * 3;
  if (base + 2 >= vertexCount) return null;
  return [base, base + 1, base + 2];
};

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(length) || length <= 1e-9) return { x: 0, y: 0, z: 1 };
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const faceNormal = (vertices: readonly Vec3[]): Vec3 => {
  if (vertices.length < 3) return { x: 0, y: 0, z: 1 };
  return normalize(cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0])));
};

const edgePairFromSelection = (selection: SelectionResult): EdgePair | null => {
  if (selection.entityType !== "edge") return null;
  const fromAdjacency = selection.adjacency.vertices;
  if (fromAdjacency.length >= 2) return [fromAdjacency[0], fromAdjacency[1]];
  const match = selection.entityId.match(/edge:(\d+)[-:](\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
};

const pointFromSelection = (selection: SelectionResult): Vec3 | null =>
  selection.point ? { x: selection.point[0], y: selection.point[1], z: selection.point[2] } : null;

const colorForState = (selection: SelectionResult): number => {
  if (selection.state === "hover") return SELECTION_HIGHLIGHT_COLORS.hover;
  if (selection.state === "preview" || selection.state === "editing") return SELECTION_HIGHLIGHT_COLORS.preview;
  return SELECTION_HIGHLIGHT_COLORS.selected;
};

const opacityForState = (selection: SelectionResult): number =>
  selection.state === "hover" ? 0.52 : selection.state === "preview" || selection.state === "editing" ? 0.62 : 0.92;

const faceGroupFromIndices = (
  mesh: SurfaceMeshData,
  faceIndices: readonly number[],
  color: number,
  opacity: number,
  offset: number
): OverlayMeshGroup | null => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const faceIndex of faceIndices) {
    const triangle = readTriangle(mesh, Math.round(faceIndex));
    if (!triangle) continue;
    const vertices = triangle.map((vertexIndex) => readPoint(mesh, vertexIndex));
    if (vertices.some((vertex) => !vertex)) continue;
    const faceVertices = vertices as Vec3[];
    const n = faceNormal(faceVertices);
    const base = positions.length / 3;
    for (const vertex of faceVertices) {
      positions.push(vertex.x + n.x * offset, vertex.y + n.y * offset, vertex.z + n.z * offset);
    }
    indices.push(base, base + 1, base + 2);
  }
  if (!indices.length) return null;
  return { positions, indices, color, opacity, doubleSided: true };
};

const edgeLinesFromPairs = (mesh: SurfaceMeshData, edges: readonly EdgePair[]): OverlayPolylineGroup["lines"] => {
  const lines: OverlayPolylineGroup["lines"] = [];
  const seen = new Set<string>();
  for (const [a, b] of edges) {
    const key = meshEdgeKey(a, b);
    if (seen.has(key)) continue;
    seen.add(key);
    const pa = readPoint(mesh, a);
    const pb = readPoint(mesh, b);
    if (pa && pb) lines.push([pa, pb]);
  }
  return lines;
};

const edgePairsFromKeys = (edgeKeys: readonly string[]): EdgePair[] =>
  edgeKeys
    .map((key) => key.match(/(\d+)[-:](\d+)/))
    .filter((match): match is RegExpMatchArray => !!match)
    .map((match) => [Number(match[1]), Number(match[2])] as const);

const selectedFaceId = (selection: SelectionResult): number | null => {
  if (selection.entityType !== "face") return null;
  const match = selection.entityId.match(/face:(\d+)/);
  return match ? Number(match[1]) : null;
};

const selectedVertexId = (selection: SelectionResult): number | null => {
  if (selection.entityType !== "vertex") return null;
  const match = selection.entityId.match(/vertex:(\d+)/);
  return match ? Number(match[1]) : null;
};

export function buildSelectionHighlightOverlays(
  selection: SelectionResult | null,
  mesh: SurfaceMeshData | null | undefined
): SelectionHighlightOverlays {
  if (!selection || !mesh?.positions?.length || selection.entityType === "object") return EMPTY_OVERLAYS;

  const meshGroups: OverlayMeshGroup[] = [];
  const pointSets: OverlayPointSet[] = [];
  const polylineGroups: OverlayPolylineGroup[] = [];
  const color = colorForState(selection);
  const selectedOpacity = opacityForState(selection);
  const adjacentOpacity = selection.state === "hover" ? 0.2 : 0.28;

  if (selection.entityType === "face") {
    const faceIndex = selectedFaceId(selection);
    const selectedFace = faceIndex == null ? null : faceGroupFromIndices(mesh, [faceIndex], color, selectedOpacity * 0.36, 0.026);
    const neighborFaces = faceGroupFromIndices(
      mesh,
      selection.adjacency.faces,
      SELECTION_HIGHLIGHT_COLORS.adjacent,
      adjacentOpacity,
      0.018
    );
    if (neighborFaces) meshGroups.push(neighborFaces);
    if (selectedFace) meshGroups.push(selectedFace);
    const triangle = faceIndex == null ? null : readTriangle(mesh, faceIndex);
    const faceLines = triangle
      ? edgeLinesFromPairs(mesh, [
          [triangle[0], triangle[1]],
          [triangle[1], triangle[2]],
          [triangle[2], triangle[0]],
        ])
      : [];
    if (faceLines.length) {
      polylineGroups.push({
        lines: faceLines,
        color,
        opacity: selectedOpacity,
        radiusWorld: selection.state === "hover" ? 0.008 : 0.012,
      });
    }
  } else if (selection.entityType === "edge") {
    const pair = edgePairFromSelection(selection);
    if (pair) {
      const selectedLines = edgeLinesFromPairs(mesh, [pair]);
      if (selectedLines.length) {
        polylineGroups.push({
          lines: selectedLines,
          color,
          opacity: selectedOpacity,
          radiusWorld: selection.state === "hover" ? 0.009 : 0.014,
        });
      }
      const connectedFaces = faceGroupFromIndices(
        mesh,
        selection.adjacency.faces,
        SELECTION_HIGHLIGHT_COLORS.adjacent,
        adjacentOpacity,
        0.018
      );
      if (connectedFaces) meshGroups.push(connectedFaces);
    }
  } else if (selection.entityType === "vertex") {
    const vertexIndex = selectedVertexId(selection);
    const selectedPoint = pointFromSelection(selection) ?? (vertexIndex == null ? null : readPoint(mesh, vertexIndex));
    const adjacentFaces = faceGroupFromIndices(
      mesh,
      selection.adjacency.faces,
      SELECTION_HIGHLIGHT_COLORS.adjacent,
      adjacentOpacity,
      0.018
    );
    if (adjacentFaces) meshGroups.push(adjacentFaces);
    let connectedEdges = edgePairsFromKeys(selection.adjacency.edges);
    if (!connectedEdges.length && vertexIndex != null) {
      const topology = buildMeshEdgeTopology(mesh);
      connectedEdges = edgePairsFromKeys(topology.vertexEdges.get(vertexIndex) ?? []);
    }
    const connectedLines = edgeLinesFromPairs(mesh, connectedEdges);
    if (connectedLines.length) {
      polylineGroups.push({
        lines: connectedLines,
        color: SELECTION_HIGHLIGHT_COLORS.adjacent,
        opacity: selection.state === "hover" ? 0.44 : 0.56,
        radiusWorld: 0.008,
      });
    }
    if (selectedPoint) {
      pointSets.push(
        { points: [selectedPoint], color: SELECTION_HIGHLIGHT_COLORS.previewAlt, size: 0.25, opacity: 0.82 },
        { points: [selectedPoint], color, size: 0.15, opacity: selectedOpacity }
      );
    }
  }

  return { meshGroups, pointSets, polylineGroups };
}

const appendOverlays = (target: {
  meshGroups: OverlayMeshGroup[];
  pointSets: OverlayPointSet[];
  polylineGroups: OverlayPolylineGroup[];
}, overlays: SelectionHighlightOverlays) => {
  target.meshGroups.push(...overlays.meshGroups);
  target.pointSets.push(...overlays.pointSets);
  target.polylineGroups.push(...overlays.polylineGroups);
};

export function buildSelectionManagerHighlightOverlays(
  manager: UnifiedSelectionManagerState,
  resolveMesh: (selection: SelectionResult) => SurfaceMeshData | null | undefined
): SelectionHighlightOverlays {
  const result = { meshGroups: [] as OverlayMeshGroup[], pointSets: [] as OverlayPointSet[], polylineGroups: [] as OverlayPolylineGroup[] };
  const selections = manager.results.length
    ? manager.results
    : [manager.hover, manager.selected, manager.editing, manager.preview].filter(
        (selection): selection is SelectionResult => !!selection
      );
  const seen = new Set<string>();
  for (const selection of selections) {
    const key = `${selection.state}:${selection.workspace}:${selection.objectId}:${selection.meshKey ?? ""}:${selection.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    appendOverlays(result, buildSelectionHighlightOverlays(selection, resolveMesh(selection)));
  }
  return result;
}
