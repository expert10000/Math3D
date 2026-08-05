import type { SurfaceTopologyGizmoDragInfo, SurfaceTopologyGizmoTarget } from "../components/SurfaceViewer";
import {
  mapTopologyGizmoDragToParams,
  type AdaptiveTopologyGizmoDragParams,
} from "./adaptiveTopologyGizmo";

export type GeometryTopologyGizmoPoint = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type GeometryTopologyGizmoSelectionMode = "object" | "face" | "edge" | "vertex";
export type GeometryTopologyGizmoEdgeMode = "split" | "bevel";

export type GeometryTopologyGizmoFaceTarget = {
  readonly objectId: string;
  readonly faceIndex: number;
  readonly point: GeometryTopologyGizmoPoint;
  readonly normal: GeometryTopologyGizmoPoint;
  readonly faceVertices?: readonly GeometryTopologyGizmoPoint[] | null;
};

export type GeometryTopologyGizmoEdgeTarget = {
  readonly objectId: string;
  readonly edgeVertexPair: readonly [number, number];
  readonly point: GeometryTopologyGizmoPoint;
  readonly normal: GeometryTopologyGizmoPoint;
  readonly edgePoints?: readonly [GeometryTopologyGizmoPoint, GeometryTopologyGizmoPoint] | null;
  readonly edgeLength?: number | null;
};

export type GeometryTopologyGizmoVertexTarget = {
  readonly objectId: string;
  readonly vertexIndex: number;
  readonly point: GeometryTopologyGizmoPoint;
  readonly normal: GeometryTopologyGizmoPoint;
};

export type GeometryTopologyGizmoTargetInput = {
  readonly geometryMode: string;
  readonly selectionMode: GeometryTopologyGizmoSelectionMode;
  readonly faceTarget?: GeometryTopologyGizmoFaceTarget | null;
  readonly edgeTarget?: GeometryTopologyGizmoEdgeTarget | null;
  readonly vertexTarget?: GeometryTopologyGizmoVertexTarget | null;
  readonly referenceLength: number;
};

export type GeometryTopologyGizmoDragState = {
  readonly edgeMode: GeometryTopologyGizmoEdgeMode;
  readonly faceInsetRatio: number;
  readonly faceExtrudeDistance: number;
  readonly edgeSplitRatio: number;
  readonly edgeBevelAmount: number;
  readonly vertexMoveAmount: number;
  readonly referenceLength: number;
};

export type GeometryTopologyGizmoReleaseAction =
  | "extrude-face"
  | "inset-face"
  | "face-subdivide"
  | "split-edge"
  | "bevel-edge"
  | "move-vertex";

const addPoint = (
  a: GeometryTopologyGizmoPoint,
  b: GeometryTopologyGizmoPoint
): GeometryTopologyGizmoPoint => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

const subPoint = (
  a: GeometryTopologyGizmoPoint,
  b: GeometryTopologyGizmoPoint
): GeometryTopologyGizmoPoint => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

const scalePoint = (point: GeometryTopologyGizmoPoint, factor: number): GeometryTopologyGizmoPoint => ({
  x: point.x * factor,
  y: point.y * factor,
  z: point.z * factor,
});

const normalizePoint = (point: GeometryTopologyGizmoPoint): GeometryTopologyGizmoPoint | null => {
  const length = Math.hypot(point.x, point.y, point.z);
  if (!Number.isFinite(length) || length <= 1e-9) return null;
  return { x: point.x / length, y: point.y / length, z: point.z / length };
};

const centroid = (points: readonly GeometryTopologyGizmoPoint[]): GeometryTopologyGizmoPoint | null => {
  if (!points.length) return null;
  const sum = points.reduce((acc, point) => addPoint(acc, point), { x: 0, y: 0, z: 0 });
  return scalePoint(sum, 1 / points.length);
};

export function buildGeometryTopologyGizmoTarget({
  geometryMode,
  selectionMode,
  faceTarget,
  edgeTarget,
  vertexTarget,
  referenceLength,
}: GeometryTopologyGizmoTargetInput): SurfaceTopologyGizmoTarget | null {
  if (geometryMode !== "procedural" || selectionMode === "object") return null;
  const length = Math.max(0.001, Number.isFinite(referenceLength) ? referenceLength : 1);
  const displayLength = Math.min(length, 0.55);
  if (selectionMode === "face") {
    if (!faceTarget) return null;
    const normal = normalizePoint(faceTarget.normal) ?? { x: 0, y: 1, z: 0 };
    const origin = centroid(faceTarget.faceVertices ?? []) ?? faceTarget.point;
    return {
      enabled: true,
      mode: "face",
      origin: addPoint(origin, scalePoint(normal, 0.05)),
      axis: normal,
      length: displayLength,
      color: 0x0ea5e9,
      label: "Geometry face handle",
    };
  }
  if (selectionMode === "edge") {
    const edgePoints = edgeTarget?.edgePoints;
    if (!edgePoints) return null;
    const [a, b] = edgePoints;
    const axis = normalizePoint(subPoint(b, a));
    if (!axis) return null;
    return {
      enabled: true,
      mode: "edge",
      origin: scalePoint(addPoint(a, b), 0.5),
      axis,
      length: displayLength,
      color: 0xf97316,
      label: "Geometry edge handle",
    };
  }
  if (!vertexTarget) return null;
  const axis = normalizePoint(vertexTarget.normal) ?? { x: 0, y: 1, z: 0 };
  return {
    enabled: true,
    mode: "vertex",
    origin: vertexTarget.point,
    axis,
    length: displayLength,
    color: 0x22c55e,
    label: "Geometry vertex handle",
  };
}

export function mapGeometryTopologyGizmoDragToParams(
  info: SurfaceTopologyGizmoDragInfo,
  state: GeometryTopologyGizmoDragState
): AdaptiveTopologyGizmoDragParams | null {
  const selectionType = info.mode === "face" ? "Face" : info.mode === "edge" ? "Edge" : "Vertex";
  const operation =
    info.mode === "edge" ? (state.edgeMode === "bevel" ? "Bevel Edge" : "Split Edge") : info.mode === "vertex" ? "Move Vertex" : null;
  return mapTopologyGizmoDragToParams({
    workspace: "Geometry",
    selectionType,
    operation,
    dragDistance: info.distance,
    referenceLength: state.referenceLength,
    initialRatio: info.mode === "face" ? state.faceInsetRatio : state.edgeSplitRatio,
    initialAmount:
      info.mode === "face"
        ? state.faceExtrudeDistance
        : info.mode === "edge"
          ? state.edgeBevelAmount
          : state.vertexMoveAmount,
  });
}

export function geometryTopologyGizmoReleaseAction(
  params: AdaptiveTopologyGizmoDragParams | null
): GeometryTopologyGizmoReleaseAction | null {
  if (!params) return null;
  if (params.operation === "Extrude Face") return "extrude-face";
  if (params.operation === "Inset Face") return "inset-face";
  if (params.operation === "Face Subdivide") return "face-subdivide";
  if (params.operation === "Split Edge") return "split-edge";
  if (params.operation === "Bevel Edge") return "bevel-edge";
  if (params.operation === "Move Vertex") return "move-vertex";
  return null;
}
