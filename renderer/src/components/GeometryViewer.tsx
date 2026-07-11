import React, { useMemo } from "react";
import * as THREE from "three";
import {
  SurfaceViewer,
  type CameraFitCommand,
  type MeshInteractionQualityMode,
  type RenderQuality,
  type CameraTourCommand,
  type CameraTourEvent,
  type CameraSyncState,
  type ColorMode,
  type OverlayLabelSet,
  type OverlayPointSet,
  type OverlayPolylineGroup,
} from "./SurfaceViewer";
import type { GeometryScene, Polygon3 } from "../geometry/types";
import { buildGeometryRenderData } from "../geometry/render";
import type { PolylineSet } from "../scene/renderPrimitives";
import { polygonNormalFromVertices } from "../geometry/polyhedra";
import { normalizeVec3, scaleVec3 } from "../geometry/vec";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import type { ReferencePlaneGridSettings } from "./layeredReferenceGrid";

export type GeometryViewportDisplayMode = "solid" | "transparent" | "wireframe" | "edges" | "normals";

type GeometryViewerMesh = SurfaceMeshData & {
  id?: string;
  transform?: {
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
  };
};

const matrixForMeshTransform = (transform: GeometryViewerMesh["transform"]) => {
  const position = transform?.position ?? { x: 0, y: 0, z: 0 };
  const rotation = transform?.rotation ?? { x: 0, y: 0, z: 0 };
  const scale = transform?.scale ?? { x: 1, y: 1, z: 1 };
  return new THREE.Matrix4().compose(
    new THREE.Vector3(position.x, position.y, position.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z)),
    new THREE.Vector3(scale.x, scale.y, scale.z)
  );
};

const readMeshVertex = (positions: ArrayLike<number>, index: number, matrix: THREE.Matrix4) => {
  const offset = index * 3;
  return new THREE.Vector3(
    Number(positions[offset] ?? 0),
    Number(positions[offset + 1] ?? 0),
    Number(positions[offset + 2] ?? 0)
  ).applyMatrix4(matrix);
};

const vecToPoint = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });

const buildMeshFeatureEdgeLines = (mesh: GeometryViewerMesh, maxLines: number): PolylineSet => {
  const positions = mesh.positions;
  const vertexCount = Math.floor((positions?.length ?? 0) / 3);
  if (vertexCount < 3) return [];
  const indices = mesh.indices && mesh.indices.length >= 3 ? mesh.indices : null;
  const triangleCount = indices ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);
  if (!triangleCount) return [];
  const matrix = matrixForMeshTransform(mesh.transform);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const edgeMap = new Map<string, { a: number; b: number; normals: THREE.Vector3[]; count: number }>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const addEdge = (a: number, b: number, normal: THREE.Vector3) => {
    const key = edgeKey(a, b);
    const entry = edgeMap.get(key);
    if (entry) {
      entry.normals.push(normal);
      entry.count += 1;
      return;
    }
    edgeMap.set(key, { a, b, normals: [normal], count: 1 });
  };
  for (let tri = 0; tri < triangleCount; tri++) {
    const base = tri * 3;
    const i0 = indices ? Number(indices[base]) : base;
    const i1 = indices ? Number(indices[base + 1]) : base + 1;
    const i2 = indices ? Number(indices[base + 2]) : base + 2;
    if (i0 < 0 || i1 < 0 || i2 < 0 || i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) continue;
    const p0 = readMeshVertex(positions, i0, matrix);
    const p1 = readMeshVertex(positions, i1, matrix);
    const p2 = readMeshVertex(positions, i2, matrix);
    const normal = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
    if (normal.lengthSq() < 1e-12) continue;
    normal.applyMatrix3(normalMatrix).normalize();
    addEdge(i0, i1, normal);
    addEdge(i1, i2, normal);
    addEdge(i2, i0, normal);
  }
  const cosThreshold = Math.cos((28 * Math.PI) / 180);
  const candidates: Array<{ score: number; a: number; b: number }> = [];
  for (const edge of edgeMap.values()) {
    let score = edge.count === 1 ? 2 : 0;
    if (edge.normals.length >= 2) {
      const dot = edge.normals[0].dot(edge.normals[1]);
      if (dot < cosThreshold) score = Math.max(score, 1 + (1 - dot));
    }
    if (score > 0) candidates.push({ score, a: edge.a, b: edge.b });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxLines).map((edge) => [
    vecToPoint(readMeshVertex(positions, edge.a, matrix)),
    vecToPoint(readMeshVertex(positions, edge.b, matrix)),
  ]);
};

const buildMeshNormalLines = (mesh: GeometryViewerMesh, maxLines: number): PolylineSet => {
  const positions = mesh.positions;
  const vertexCount = Math.floor((positions?.length ?? 0) / 3);
  if (vertexCount < 3) return [];
  const indices = mesh.indices && mesh.indices.length >= 3 ? mesh.indices : null;
  const triangleCount = indices ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);
  if (!triangleCount) return [];
  const matrix = matrixForMeshTransform(mesh.transform);
  const diagHint = Math.max(0.18, Math.min(0.55, Math.cbrt(Math.max(1, vertexCount)) * 0.035));
  const stride = Math.max(1, Math.ceil(triangleCount / maxLines));
  const lines: PolylineSet = [];
  for (let tri = 0; tri < triangleCount && lines.length < maxLines; tri += stride) {
    const base = tri * 3;
    const i0 = indices ? Number(indices[base]) : base;
    const i1 = indices ? Number(indices[base + 1]) : base + 1;
    const i2 = indices ? Number(indices[base + 2]) : base + 2;
    if (i0 < 0 || i1 < 0 || i2 < 0 || i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) continue;
    const p0 = readMeshVertex(positions, i0, matrix);
    const p1 = readMeshVertex(positions, i1, matrix);
    const p2 = readMeshVertex(positions, i2, matrix);
    const center = new THREE.Vector3().add(p0).add(p1).add(p2).multiplyScalar(1 / 3);
    const normal = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
    if (normal.lengthSq() < 1e-12) continue;
    normal.normalize();
    const end = center.clone().add(normal.multiplyScalar(diagHint));
    lines.push([vecToPoint(center), vecToPoint(end)]);
  }
  return lines;
};

export type GeometryViewerProps = {
  scene: GeometryScene;
  meshOverride?: SurfaceMeshData | null;
  meshOverrides?: Array<
    SurfaceMeshData & {
      id?: string;
      color?: number;
      opacity?: number;
      roughness?: number;
      metalness?: number;
      flatShading?: boolean;
      transform?: {
        position?: { x: number; y: number; z: number };
        rotation?: { x: number; y: number; z: number };
        scale?: { x: number; y: number; z: number };
      };
    }
  > | null;
  colorMode?: ColorMode;
  selectedMeshKey?: string | null;
  wireframe?: boolean;
  materialOpacity?: number;
  showPlanes?: boolean;
  planeGridSettings?: ReferencePlaneGridSettings;
  resetToken?: number;
  cameraOverride?: CameraSyncState | null;
  cameraOverrideToken?: number;
  cameraFitCommand?: CameraFitCommand | null;
  cameraTourCommand?: CameraTourCommand | null;
  onCameraTourEvent?: (event: CameraTourEvent) => void;
  extraOverlayPolylineGroups?: OverlayPolylineGroup[] | null;
  highlightPolygons?: Polygon3[] | null;
  highlightColor?: number;
  highlightOpacity?: number;
  highlightRadiusScale?: number;
  highlightFillColor?: number;
  highlightFillOpacity?: number;
  highlightFillOffset?: number;
  highlightPointSets?: OverlayPointSet[] | null;
  overlayLabelSets?: OverlayLabelSet[] | null;
  dragEnabled?: boolean;
  onDragStart?: (info: {
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    meshKey?: string;
  }) => void;
  onDrag?: (info: {
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    delta: { x: number; y: number; z: number };
    meshKey?: string;
  }) => void;
  onDragEnd?: (info: {
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    meshKey?: string;
  }) => void;
  dragPlaneAnchor?: {
    point: { x: number; y: number; z: number };
    normal?: { x: number; y: number; z: number };
    meshKey?: string;
  } | null;
  onShiftWheelScale?: (info: { delta: number }) => void;
  pickEnabled?: boolean;
  onPick?: (info: {
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    meshKey?: string;
    faceIndex?: number;
    vertexIndex?: number;
  }) => void;
  onPickHover?: (info: {
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    meshKey?: string;
    faceIndex?: number;
    vertexIndex?: number;
  }) => void;
  inspectSelectionMeshKey?: string | null;
  gizmoEnabled?: boolean;
  gizmoMeshKey?: string | null;
  gizmoMode?: "translate" | "rotate" | "scale";
  gizmoSpace?: "world" | "local";
  gizmoTranslationSnap?: number | null;
  gizmoRotationSnapDeg?: number | null;
  gizmoScaleSnap?: number | null;
  onGizmoTransform?: (info: {
    meshKey?: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  }) => void;
  lineRadiusScale?: number;
  segmentRadiusScale?: number;
  edgeRadiusScale?: number;
  meshInteractionQualityMode?: MeshInteractionQualityMode;
  meshInteractionRestoreDelayMs?: number;
  meshInteractionPreviewTriangleTarget?: number;
  meshInteractionHideVertexMarkers?: boolean;
  meshInteractionHideFaceNormals?: boolean;
  meshInteractionHideCurvatureGlyphs?: boolean;
  meshInteractionHideWireframe?: boolean;
  meshInteractionHideSceneOverlays?: boolean;
  onMeshInteractionStateChange?: (active: boolean) => void;
  renderQuality?: RenderQuality;
  viewportDisplayMode?: GeometryViewportDisplayMode;
};

export const GeometryViewer: React.FC<GeometryViewerProps> = ({
  scene,
  meshOverride = null,
  meshOverrides = null,
  colorMode = "solid",
  selectedMeshKey = null,
  wireframe = false,
  materialOpacity = 0.85,
  showPlanes = false,
  planeGridSettings,
  resetToken,
  cameraOverride = null,
  cameraOverrideToken = 0,
  cameraFitCommand = null,
  cameraTourCommand = null,
  onCameraTourEvent,
  extraOverlayPolylineGroups = null,
  highlightPolygons,
  highlightColor = 0xf97316,
  highlightOpacity = 0.82,
  highlightRadiusScale = 1.35,
  highlightFillColor,
  highlightFillOpacity = 0.18,
  highlightFillOffset = 0.004,
  highlightPointSets,
  overlayLabelSets,
  dragEnabled = false,
  onDragStart,
  onDrag,
  onDragEnd,
  dragPlaneAnchor = null,
  onShiftWheelScale,
  pickEnabled = false,
  onPick,
  onPickHover,
  inspectSelectionMeshKey = null,
  gizmoEnabled = false,
  gizmoMeshKey = null,
  gizmoMode = "translate",
  gizmoSpace = "world",
  gizmoTranslationSnap = null,
  gizmoRotationSnapDeg = null,
  gizmoScaleSnap = null,
  onGizmoTransform,
  lineRadiusScale = 1,
  segmentRadiusScale = 1,
  edgeRadiusScale = 1,
  meshInteractionQualityMode = "adaptive",
  meshInteractionRestoreDelayMs = 150,
  meshInteractionPreviewTriangleTarget = 100_000,
  meshInteractionHideVertexMarkers = true,
  meshInteractionHideFaceNormals = true,
  meshInteractionHideCurvatureGlyphs = true,
  meshInteractionHideWireframe = false,
  meshInteractionHideSceneOverlays = false,
  onMeshInteractionStateChange,
  renderQuality = "balanced",
  viewportDisplayMode = "solid",
}) => {
  const renderData = useMemo(
    () =>
      buildGeometryRenderData(scene, {
        label: "Geometry",
        emitEdges: true,
        lineRadiusScale,
        segmentRadiusScale,
        edgeRadiusScale,
      }),
    [scene, lineRadiusScale, segmentRadiusScale, edgeRadiusScale]
  );

  const meshOverrideList = meshOverrides?.length ? meshOverrides : null;
  const mesh = meshOverrideList ? null : meshOverride ?? renderData.mesh;
  const showMeshFaces = viewportDisplayMode !== "edges";
  const forceWireframe = viewportDisplayMode === "wireframe";
  const effectiveMaterialOpacity =
    viewportDisplayMode === "transparent"
      ? Math.min(materialOpacity, 0.42)
      : showMeshFaces
        ? materialOpacity
        : 1;
  const selectedOutlineEnabled = viewportDisplayMode === "solid" || viewportDisplayMode === "transparent";
  const selectedMeshForOverlay = useMemo(
    () =>
      selectedMeshKey && meshOverrideList
        ? meshOverrideList.find((entry) => entry.id === selectedMeshKey) ?? null
        : null,
    [meshOverrideList, selectedMeshKey]
  );
  const edgeOnlyGroups = useMemo(() => {
    if (viewportDisplayMode !== "edges" || !meshOverrideList?.length) return [] as OverlayPolylineGroup[];
    return meshOverrideList
      .map((entry) => {
        const lines = buildMeshFeatureEdgeLines(entry, 260);
        if (!lines.length) return null;
        return {
          lines,
          color: entry.id === selectedMeshKey ? 0x1d4ed8 : 0x334155,
          opacity: entry.id === selectedMeshKey ? 0.9 : 0.56,
          radiusScale: entry.id === selectedMeshKey ? 1.05 : 0.72,
        } satisfies OverlayPolylineGroup;
      })
      .filter((entry): entry is OverlayPolylineGroup => !!entry);
  }, [meshOverrideList, selectedMeshKey, viewportDisplayMode]);
  const selectedOutlineGroup = useMemo(() => {
    if (!selectedOutlineEnabled || !selectedMeshForOverlay) return null;
    const lines = buildMeshFeatureEdgeLines(selectedMeshForOverlay, 520);
    if (!lines.length) return null;
    return {
      lines,
      color: 0x1d4ed8,
      opacity: viewportDisplayMode === "transparent" ? 0.86 : 0.72,
      radiusScale: 1.08,
    } satisfies OverlayPolylineGroup;
  }, [selectedMeshForOverlay, selectedOutlineEnabled, viewportDisplayMode]);
  const normalOverlayGroup = useMemo(() => {
    if (viewportDisplayMode !== "normals" || !selectedMeshForOverlay) return null;
    const lines = buildMeshNormalLines(selectedMeshForOverlay, 140);
    if (!lines.length) return null;
    return {
      lines,
      color: 0x0ea5e9,
      opacity: 0.84,
      radiusScale: 0.78,
    } satisfies OverlayPolylineGroup;
  }, [selectedMeshForOverlay, viewportDisplayMode]);

  const surfaceMeshOverrideForViewer = useMemo(
    () =>
      mesh
        ? {
            positions: mesh.positions,
            indices: mesh.indices,
            normals: mesh.normals ?? null,
            uvs: mesh.uvs ?? null,
            adjacency: mesh.adjacency ?? null,
            meanEdgeLength: mesh.meanEdgeLength ?? null,
            validation: mesh.validation ?? null,
            visible: showMeshFaces,
            wireframe: forceWireframe,
          }
        : null,
    [mesh, forceWireframe, showMeshFaces]
  );
  const surfaceMeshOverridesForViewer = useMemo(
    () =>
      meshOverrideList
        ? meshOverrideList.map((entry) => ({
            id: entry.id,
            positions: entry.positions,
            indices: entry.indices,
            normals: entry.normals ?? null,
            uvs: entry.uvs ?? null,
            adjacency: entry.adjacency ?? null,
            meanEdgeLength: entry.meanEdgeLength ?? null,
            validation: entry.validation ?? null,
            color: entry.color,
            roughness: entry.roughness,
            metalness: entry.metalness,
            opacity:
              viewportDisplayMode === "transparent"
                ? Math.min(entry.opacity ?? 1, 0.42)
                : entry.opacity,
            wireframe: forceWireframe,
            visible: showMeshFaces,
            flatShading: entry.flatShading,
            transform: entry.transform,
          }))
        : null,
    [meshOverrideList, forceWireframe, showMeshFaces, viewportDisplayMode]
  );
  const highlightGroups = useMemo(() => {
    if (!highlightPolygons?.length || !selectedOutlineEnabled) return [];
    const lines: PolylineSet = [];
    for (const poly of highlightPolygons) {
      const verts = poly.vertices ?? [];
      if (verts.length < 2) continue;
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        lines.push([a, b]);
      }
    }
    if (!lines.length) return [];
    return [
      {
        lines,
        color: highlightColor,
        opacity: highlightOpacity,
        radiusScale: highlightRadiusScale,
      },
    ];
  }, [highlightPolygons, highlightColor, highlightOpacity, highlightRadiusScale, selectedOutlineEnabled]);
  const overlayPolylineGroups = useMemo(
    () =>
      [
        ...(viewportDisplayMode === "solid" || viewportDisplayMode === "transparent" || viewportDisplayMode === "edges"
          ? renderData.overlayPolylineGroups
          : []),
        ...edgeOnlyGroups,
        ...(selectedOutlineGroup ? [selectedOutlineGroup] : []),
        ...(normalOverlayGroup ? [normalOverlayGroup] : []),
        ...highlightGroups,
        ...(extraOverlayPolylineGroups ?? []),
      ],
    [
      renderData.overlayPolylineGroups,
      edgeOnlyGroups,
      selectedOutlineGroup,
      normalOverlayGroup,
      highlightGroups,
      extraOverlayPolylineGroups,
      viewportDisplayMode,
    ]
  );
  const overlayMeshGroups = useMemo(() => {
    if (!highlightPolygons?.length || !selectedOutlineEnabled) return [];
    const positions: number[] = [];
    const indices: number[] = [];
    let baseIndex = 0;
    for (const poly of highlightPolygons) {
      const verts = poly.vertices ?? [];
      if (verts.length < 3) continue;
      const normal = polygonNormalFromVertices(verts);
      const offsetVec = normal
        ? scaleVec3(normalizeVec3(normal) ?? normal, highlightFillOffset)
        : { x: 0, y: 0, z: 0 };
      for (const v of verts) {
        positions.push(v.x + offsetVec.x, v.y + offsetVec.y, v.z + offsetVec.z);
      }
      for (let i = 1; i + 1 < verts.length; i++) {
        indices.push(baseIndex, baseIndex + i, baseIndex + i + 1);
      }
      baseIndex += verts.length;
    }
    if (positions.length < 9 || indices.length < 3) return [];
    return [
      {
        positions,
        indices,
        color: highlightFillColor ?? highlightColor,
        opacity: highlightFillOpacity,
        doubleSided: true,
      },
    ];
  }, [highlightPolygons, highlightFillOffset, highlightFillOpacity, highlightFillColor, highlightColor, selectedOutlineEnabled]);

  const overlayPointSets = useMemo(
    () => [...renderData.overlayPointSets, ...(highlightPointSets ?? [])],
    [renderData.overlayPointSets, highlightPointSets]
  );

  return (
    <SurfaceViewer
      surfaceId="surface_mesh"
      surfaceMeshOverride={surfaceMeshOverrideForViewer}
      surfaceMeshOverrides={surfaceMeshOverridesForViewer}
      colorMode={colorMode}
      wireframe={wireframe || forceWireframe}
      materialOpacity={effectiveMaterialOpacity}
      showPlanes={showPlanes}
      planeGridSettings={planeGridSettings}
      overlayPolylineGroups={overlayPolylineGroups}
      overlayPointSets={overlayPointSets}
      overlayMeshGroups={overlayMeshGroups}
      overlayLabelSets={overlayLabelSets}
      showContours={false}
      showBoundingBox={true}
      resetToken={resetToken}
      cameraOverride={cameraOverride}
      cameraOverrideToken={cameraOverrideToken}
      cameraFitCommand={cameraFitCommand}
      cameraTourCommand={cameraTourCommand}
      onCameraTourEvent={onCameraTourEvent}
      renderQuality={renderQuality}
      meshInteractionQualityMode={meshInteractionQualityMode}
      meshInteractionRestoreDelayMs={meshInteractionRestoreDelayMs}
      meshInteractionPreviewTriangleTarget={meshInteractionPreviewTriangleTarget}
      meshInteractionHideVertexMarkers={meshInteractionHideVertexMarkers}
      meshInteractionHideFaceNormals={meshInteractionHideFaceNormals}
      meshInteractionHideCurvatureGlyphs={meshInteractionHideCurvatureGlyphs}
      meshInteractionHideWireframe={meshInteractionHideWireframe}
      meshInteractionHideSceneOverlays={meshInteractionHideSceneOverlays}
      onMeshInteractionStateChange={onMeshInteractionStateChange}
      sampleSetEnabled={false}
      dragEnabled={dragEnabled}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      dragPlaneAnchor={dragPlaneAnchor}
      onShiftWheelScale={onShiftWheelScale}
      gizmoEnabled={gizmoEnabled}
      gizmoMeshKey={gizmoMeshKey}
      gizmoMode={gizmoMode}
      gizmoSpace={gizmoSpace}
      gizmoTranslationSnap={gizmoTranslationSnap}
      gizmoRotationSnapDeg={gizmoRotationSnapDeg}
      gizmoScaleSnap={gizmoScaleSnap}
      onGizmoTransform={onGizmoTransform}
      inspectEnabled={pickEnabled}
      onInspectPick={
        pickEnabled && onPick
          ? (info) => {
              onPick({
                point: info.point,
                normal: info.normal,
                meshKey: info.meshKey,
                faceIndex: info.faceIndex,
                vertexIndex: info.vertexIndex,
              });
            }
          : undefined
      }
      onInspectHover={
        pickEnabled && onPickHover
          ? (info) => {
              onPickHover({
                point: info.point,
                normal: info.normal,
                meshKey: info.meshKey,
                faceIndex: info.faceIndex,
                vertexIndex: info.vertexIndex,
              });
            }
          : undefined
      }
      inspectSelectionMeshKey={inspectSelectionMeshKey}
      surfaceMeshFallbackMode="none"
    />
  );
};
