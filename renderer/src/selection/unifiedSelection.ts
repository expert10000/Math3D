import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import {
  makeGeometryEdgeKey,
  summarizeGeometryEdgeTopology,
  summarizeGeometryFaceTopology,
  summarizeGeometryVertexTopology,
  type GeometryPickResult,
  type GeometryTopologyReference,
} from "../geometry/picking";

export type UnifiedSelectionWorkspace = "geometry" | "mesh";
export type UnifiedSelectionKind = "object" | "face" | "edge" | "vertex";
export type UnifiedSelectionLifecycle = "selected" | "hover" | "editing";
export type UnifiedSelectionVec3 = readonly [number, number, number];

export type UnifiedSelectionTopology = {
  readonly adjacentFaces: readonly number[];
  readonly adjacentEdges: readonly string[];
  readonly adjacentVertices: readonly number[];
  readonly incidentFaces?: number;
  readonly incidentEdges?: number;
  readonly valence?: number;
  readonly boundaryEdges?: number;
  readonly boundary?: boolean;
  readonly nonManifold?: boolean;
  readonly faceVertexCount?: number;
};

export type UnifiedSelection = {
  readonly workspace: UnifiedSelectionWorkspace;
  readonly selectionType: UnifiedSelectionKind;
  readonly lifecycle: UnifiedSelectionLifecycle;
  readonly objectId: string;
  readonly objectLabel: string;
  readonly objectType?: string | null;
  readonly meshKey?: string | null;
  readonly topologyVersion?: number | null;
  readonly topologyReference?: GeometryTopologyReference | null;
  readonly stale: boolean;
  readonly label: string;
  readonly faceId?: number | null;
  readonly edgeId?: string | null;
  readonly edgeVertices?: readonly [number, number] | null;
  readonly vertexId?: number | null;
  readonly worldPosition?: UnifiedSelectionVec3 | null;
  readonly localPosition?: UnifiedSelectionVec3 | null;
  readonly normal?: UnifiedSelectionVec3 | null;
  readonly tangent?: UnifiedSelectionVec3 | null;
  readonly bitangent?: UnifiedSelectionVec3 | null;
  readonly topology: UnifiedSelectionTopology;
  readonly source: "geometry-pick" | "mesh-topology" | "mesh-object";
};

export type MeshTopologyUnifiedSelectionMode = "object" | "auto" | "face" | "edge" | "vertex";

export type MeshTopologyUnifiedSelectionInput = {
  readonly objectId?: string | null;
  readonly objectLabel?: string | null;
  readonly objectType?: string | null;
  readonly meshKey?: string | null;
  readonly topologyVersion?: number | null;
  readonly mesh?: SurfaceMeshData | null;
  readonly mode: MeshTopologyUnifiedSelectionMode;
  readonly faceIndex?: number | null;
  readonly edgeVertices?: readonly [number, number] | null;
  readonly vertexIndex?: number | null;
  readonly valid?: boolean;
  readonly selectionCleared?: boolean;
  readonly worldPosition?: UnifiedSelectionVec3 | null;
  readonly normal?: UnifiedSelectionVec3 | null;
};

const EMPTY_TOPOLOGY: UnifiedSelectionTopology = {
  adjacentFaces: [],
  adjacentEdges: [],
  adjacentVertices: [],
};

const toVec3 = (value: readonly [number, number, number] | undefined | null): UnifiedSelectionVec3 | null =>
  value ? [value[0], value[1], value[2]] : null;

const formatMeshObjectLabel = (input: MeshTopologyUnifiedSelectionInput): string => {
  const label = input.objectLabel?.trim();
  return label || input.mesh?.label || "SurfaceMesh";
};

const formatSelectionLabel = (kind: UnifiedSelectionKind, objectLabel: string, id?: string | number | null): string => {
  if (kind === "object") return `${objectLabel} object`;
  if (kind === "edge") return id == null ? `${objectLabel} edge` : `${objectLabel} edge [${id}]`;
  return id == null ? `${objectLabel} ${kind}` : `${objectLabel} ${kind} #${id}`;
};

const edgeIdFromVertices = (vertices: readonly [number, number] | null | undefined): string | null =>
  vertices ? `${vertices[0]}-${vertices[1]}` : null;

const readMeshVertex = (mesh: SurfaceMeshData | null, index: number | null): UnifiedSelectionVec3 | null => {
  if (!mesh || index == null) return null;
  const vertexCount = Math.floor((mesh.positions?.length ?? 0) / 3);
  if (!Number.isInteger(index) || index < 0 || index >= vertexCount) return null;
  const base = index * 3;
  return [Number(mesh.positions[base]), Number(mesh.positions[base + 1]), Number(mesh.positions[base + 2])];
};

const readMeshFaceVertexIndices = (
  mesh: SurfaceMeshData | null,
  faceIndex: number | null
): readonly [number, number, number] | null => {
  if (!mesh || faceIndex == null) return null;
  const vertexCount = Math.floor((mesh.positions?.length ?? 0) / 3);
  const indices = mesh.indices ?? null;
  const faceCount = indices && indices.length >= 3 ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);
  if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= faceCount) return null;
  const base = faceIndex * 3;
  const a = indices ? Number(indices[base]) : base;
  const b = indices ? Number(indices[base + 1]) : base + 1;
  const c = indices ? Number(indices[base + 2]) : base + 2;
  if (a < 0 || b < 0 || c < 0 || a >= vertexCount || b >= vertexCount || c >= vertexCount) return null;
  return [a, b, c];
};

const averagePoints = (points: readonly UnifiedSelectionVec3[]): UnifiedSelectionVec3 | null => {
  if (!points.length) return null;
  const sum = points.reduce(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]] as [number, number, number],
    [0, 0, 0] as [number, number, number]
  );
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
};

const faceAdjacentEdges = (pick: GeometryPickResult): string[] => {
  const tri = pick.sourceTriangle;
  if (!tri) return [];
  return [
    makeGeometryEdgeKey(tri[0], tri[1]),
    makeGeometryEdgeKey(tri[1], tri[2]),
    makeGeometryEdgeKey(tri[2], tri[0]),
  ];
};

export function unifiedSelectionFromGeometryPick(
  pick: GeometryPickResult | null | undefined,
  lifecycle: UnifiedSelectionLifecycle = "selected"
): UnifiedSelection | null {
  if (!pick) return null;
  const edgeId = edgeIdFromVertices(pick.edgeVertices);
  const topology: UnifiedSelectionTopology =
    pick.kind === "face"
      ? {
          adjacentFaces: pick.faceTopology?.adjacentFaceIndices ?? [],
          adjacentEdges: faceAdjacentEdges(pick),
          adjacentVertices: pick.sourceTriangle ?? [],
          faceVertexCount: pick.faceTopology?.vertices,
        }
      : pick.kind === "edge"
        ? {
            adjacentFaces: pick.edgeTopology?.adjacentFaces ?? [],
            adjacentEdges: [],
            adjacentVertices: pick.edgeVertices ?? [],
            incidentFaces: pick.edgeTopology?.incidentFaces,
            boundary: pick.edgeTopology?.boundary,
            nonManifold: pick.edgeTopology?.nonManifold,
          }
        : pick.kind === "vertex"
          ? {
              adjacentFaces: pick.vertexTopology?.faceIndices ?? [],
              adjacentEdges: [],
              adjacentVertices: pick.vertexTopology?.neighborVertices ?? [],
              incidentFaces: pick.vertexTopology?.incidentFaces,
              incidentEdges: pick.vertexTopology?.incidentEdges,
              valence: pick.vertexTopology?.valence,
              boundaryEdges: pick.vertexTopology?.boundaryEdges,
            }
          : EMPTY_TOPOLOGY;

  return {
    workspace: "geometry",
    selectionType: pick.kind,
    lifecycle,
    objectId: pick.objectId,
    objectLabel: pick.objectLabel,
    objectType: pick.objectType,
    meshKey: pick.meshKey ?? null,
    topologyVersion: pick.topologyVersion ?? null,
    topologyReference: pick.topologyReference ?? null,
    stale: Boolean(pick.stale),
    label: pick.label,
    faceId: pick.faceIndex ?? null,
    edgeId,
    edgeVertices: pick.edgeVertices ?? null,
    vertexId: pick.vertexIndex ?? null,
    worldPosition: toVec3(pick.worldPoint),
    localPosition: toVec3(pick.localPoint),
    normal: toVec3(pick.normal),
    tangent: toVec3(pick.tangent),
    bitangent: toVec3(pick.bitangent),
    topology,
    source: "geometry-pick",
  };
}

export function unifiedSelectionFromMeshTopology(
  input: MeshTopologyUnifiedSelectionInput,
  lifecycle: UnifiedSelectionLifecycle = "selected"
): UnifiedSelection | null {
  if (input.selectionCleared || input.valid === false) return null;
  const objectLabel = formatMeshObjectLabel(input);
  const objectId = input.objectId ?? input.meshKey ?? objectLabel;
  const meshKey = input.meshKey ?? objectId;
  const mode = input.mode === "auto" ? "object" : input.mode;

  if (mode === "object") {
    if (!input.mesh && !input.objectLabel && !input.objectId) return null;
    return {
      workspace: "mesh",
      selectionType: "object",
      lifecycle,
      objectId,
      objectLabel,
      objectType: input.objectType ?? "mesh",
      meshKey,
      topologyVersion: input.topologyVersion ?? null,
      topologyReference: null,
      stale: false,
      label: formatSelectionLabel("object", objectLabel),
      faceId: null,
      edgeId: null,
      edgeVertices: null,
      vertexId: null,
      worldPosition: input.worldPosition ?? null,
      normal: input.normal ?? null,
      tangent: null,
      bitangent: null,
      topology: EMPTY_TOPOLOGY,
      source: "mesh-object",
    };
  }

  const faceId = input.faceIndex ?? null;
  const edgeVertices = input.edgeVertices ?? null;
  const edgeId = edgeIdFromVertices(edgeVertices);
  const vertexId = input.vertexIndex ?? null;
  const mesh = input.mesh ?? null;
  const faceVertexIndices = mode === "face" ? readMeshFaceVertexIndices(mesh, faceId) : null;
  const faceTopology = mesh && faceId != null ? summarizeGeometryFaceTopology(mesh, faceId) : undefined;
  const edgeTopology = mesh && edgeVertices ? summarizeGeometryEdgeTopology(mesh, [...edgeVertices] as [number, number]) : undefined;
  const vertexTopology = mesh && vertexId != null ? summarizeGeometryVertexTopology(mesh, vertexId) : undefined;
  const derivedWorldPosition =
    input.worldPosition ??
    (mode === "face" && faceVertexIndices
      ? averagePoints(faceVertexIndices.map((index) => readMeshVertex(mesh, index)).filter((point): point is UnifiedSelectionVec3 => !!point))
      : mode === "edge" && edgeVertices
        ? averagePoints(edgeVertices.map((index) => readMeshVertex(mesh, index)).filter((point): point is UnifiedSelectionVec3 => !!point))
        : mode === "vertex"
          ? readMeshVertex(mesh, vertexId)
          : null);
  const topology: UnifiedSelectionTopology =
    mode === "face"
      ? {
          adjacentFaces: faceTopology?.adjacentFaceIndices ?? [],
          adjacentEdges: faceVertexIndices
            ? [
                makeGeometryEdgeKey(faceVertexIndices[0], faceVertexIndices[1]),
                makeGeometryEdgeKey(faceVertexIndices[1], faceVertexIndices[2]),
                makeGeometryEdgeKey(faceVertexIndices[2], faceVertexIndices[0]),
              ]
            : [],
          adjacentVertices: faceVertexIndices ?? [],
          faceVertexCount: faceTopology?.vertices,
        }
      : mode === "edge"
        ? {
            adjacentFaces: edgeTopology?.adjacentFaces ?? [],
            adjacentEdges: [],
            adjacentVertices: edgeVertices ?? [],
            incidentFaces: edgeTopology?.incidentFaces,
            boundary: edgeTopology?.boundary,
            nonManifold: edgeTopology?.nonManifold,
          }
        : {
            adjacentFaces: vertexTopology?.faceIndices ?? [],
            adjacentEdges: [],
            adjacentVertices: vertexTopology?.neighborVertices ?? [],
            incidentFaces: vertexTopology?.incidentFaces,
            incidentEdges: vertexTopology?.incidentEdges,
            valence: vertexTopology?.valence,
            boundaryEdges: vertexTopology?.boundaryEdges,
          };

  const entityId = mode === "face" ? faceId : mode === "edge" ? edgeId : vertexId;
  return {
    workspace: "mesh",
    selectionType: mode,
    lifecycle,
    objectId,
    objectLabel,
    objectType: input.objectType ?? "mesh",
    meshKey,
    topologyVersion: input.topologyVersion ?? null,
    topologyReference: null,
    stale: false,
    label: formatSelectionLabel(mode, objectLabel, entityId),
    faceId,
    edgeId,
    edgeVertices,
    vertexId,
    worldPosition: derivedWorldPosition,
    localPosition: null,
    normal: input.normal ?? null,
    tangent: null,
    bitangent: null,
    topology,
    source: "mesh-topology",
  };
}
