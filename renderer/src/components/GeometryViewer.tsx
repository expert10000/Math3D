import React, { useMemo } from "react";
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
  type OverlayMeshGroup,
  type OverlayPointSet,
  type OverlayPolylineGroup,
  type SurfaceTopologyGizmoDragInfo,
  type SurfaceTopologyGizmoTarget,
  type SurfaceViewerPickModifiers,
} from "./SurfaceViewer";
import type { GeometryScene, Polygon3 } from "../geometry/types";
import { buildGeometryRenderData } from "../geometry/render";
import type { PolylineSet } from "../scene/renderPrimitives";
import { polygonNormalFromVertices } from "../geometry/polyhedra";
import { normalizeVec3, scaleVec3 } from "../geometry/vec";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import type { ReferencePlaneGridSettings } from "./layeredReferenceGrid";
import type { GeometryPickPolicy, GeometryRenderableMetadata } from "../geometry/picking";

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
      wireframe?: boolean;
      flatShading?: boolean;
      pickPolicy?: GeometryPickPolicy;
      renderableMetadata?: GeometryRenderableMetadata;
      transform?: {
        position?: { x: number; y: number; z: number };
        rotation?: { x: number; y: number; z: number };
        scale?: { x: number; y: number; z: number };
      };
    }
  > | null;
  colorMode?: ColorMode;
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
  extraOverlayMeshGroups?: OverlayMeshGroup[] | null;
  extraOverlayPointSets?: OverlayPointSet[] | null;
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
    distance?: number;
    screenPoint?: [number, number];
    sourceTriangleScreen?: [[number, number], [number, number], [number, number]];
    modifiers?: SurfaceViewerPickModifiers;
  }) => void;
  onPickMiss?: (info?: {
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    screenPoint?: [number, number];
    modifiers?: SurfaceViewerPickModifiers;
  }) => void;
  onPickHover?: (info: {
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    meshKey?: string;
    faceIndex?: number;
    vertexIndex?: number;
    distance?: number;
    screenPoint?: [number, number];
    sourceTriangleScreen?: [[number, number], [number, number], [number, number]];
    modifiers?: SurfaceViewerPickModifiers;
  }) => void;
  onPickHoverMiss?: () => void;
  selectedMeshKey?: string | null;
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
  topologyGizmo?: SurfaceTopologyGizmoTarget | null;
  onTopologyGizmoDragStart?: (info: SurfaceTopologyGizmoDragInfo) => void;
  onTopologyGizmoDrag?: (info: SurfaceTopologyGizmoDragInfo) => void;
  onTopologyGizmoDragEnd?: (info: SurfaceTopologyGizmoDragInfo) => void;
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
  showBoundingBox?: boolean;
};

export const GeometryViewer: React.FC<GeometryViewerProps> = ({
  scene,
  meshOverride = null,
  meshOverrides = null,
  colorMode = "solid",
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
  extraOverlayMeshGroups = null,
  extraOverlayPointSets = null,
  highlightPolygons,
  highlightColor = 0xf97316,
  highlightOpacity = 0.9,
  highlightRadiusScale = 2.2,
  highlightFillColor,
  highlightFillOpacity = 0.22,
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
  onPickMiss,
  onPickHover,
  onPickHoverMiss,
  inspectSelectionMeshKey = null,
  gizmoEnabled = false,
  gizmoMeshKey = null,
  gizmoMode = "translate",
  gizmoSpace = "world",
  gizmoTranslationSnap = null,
  gizmoRotationSnapDeg = null,
  gizmoScaleSnap = null,
  onGizmoTransform,
  topologyGizmo = null,
  onTopologyGizmoDragStart,
  onTopologyGizmoDrag,
  onTopologyGizmoDragEnd,
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
  showBoundingBox = true,
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
          }
        : null,
    [mesh]
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
            opacity: entry.opacity,
            roughness: entry.roughness,
            metalness: entry.metalness,
            wireframe: entry.wireframe,
            flatShading: entry.flatShading,
            pickPolicy: entry.pickPolicy,
            renderableMetadata: entry.renderableMetadata,
            transform: entry.transform,
          }))
        : null,
    [meshOverrideList]
  );
  const highlightGroups = useMemo(() => {
    if (!highlightPolygons?.length) return [];
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
  }, [highlightPolygons, highlightColor, highlightOpacity, highlightRadiusScale]);
  const overlayPolylineGroups = useMemo(
    () => [...renderData.overlayPolylineGroups, ...highlightGroups, ...(extraOverlayPolylineGroups ?? [])],
    [renderData.overlayPolylineGroups, highlightGroups, extraOverlayPolylineGroups]
  );
  const overlayMeshGroups = useMemo(() => {
    const extra = extraOverlayMeshGroups ?? [];
    if (!highlightPolygons?.length) return extra;
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
    if (positions.length < 9 || indices.length < 3) return extra;
    return [
      {
        positions,
        indices,
        color: highlightFillColor ?? highlightColor,
        opacity: highlightFillOpacity,
        doubleSided: true,
      },
      ...extra,
    ];
  }, [
    extraOverlayMeshGroups,
    highlightPolygons,
    highlightFillOffset,
    highlightFillOpacity,
    highlightFillColor,
    highlightColor,
  ]);

  const overlayPointSets = useMemo(
    () => [...renderData.overlayPointSets, ...(highlightPointSets ?? []), ...(extraOverlayPointSets ?? [])],
    [renderData.overlayPointSets, highlightPointSets, extraOverlayPointSets]
  );

  return (
    <SurfaceViewer
      surfaceId="surface_mesh"
      surfaceMeshOverride={surfaceMeshOverrideForViewer}
      surfaceMeshOverrides={surfaceMeshOverridesForViewer}
      colorMode={colorMode}
      wireframe={wireframe}
      materialOpacity={materialOpacity}
      showPlanes={showPlanes}
      planeGridSettings={planeGridSettings}
      overlayPolylineGroups={overlayPolylineGroups}
      overlayPointSets={overlayPointSets}
      overlayMeshGroups={overlayMeshGroups}
      overlayLabelSets={overlayLabelSets}
      showContours={false}
      showBoundingBox={showBoundingBox}
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
      topologyGizmo={topologyGizmo}
      onTopologyGizmoDragStart={onTopologyGizmoDragStart}
      onTopologyGizmoDrag={onTopologyGizmoDrag}
      onTopologyGizmoDragEnd={onTopologyGizmoDragEnd}
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
                distance: info.distance,
                screenPoint: info.screenPoint,
                sourceTriangleScreen: info.sourceTriangleScreen,
                modifiers: info.modifiers,
              });
            }
          : undefined
      }
      onInspectPickMiss={pickEnabled ? onPickMiss : undefined}
      onInspectHover={
        pickEnabled && onPickHover
          ? (info) => {
              onPickHover({
                point: info.point,
                normal: info.normal,
                meshKey: info.meshKey,
                faceIndex: info.faceIndex,
                vertexIndex: info.vertexIndex,
                distance: info.distance,
                screenPoint: info.screenPoint,
                sourceTriangleScreen: info.sourceTriangleScreen,
                modifiers: info.modifiers,
              });
            }
          : undefined
      }
      onInspectHoverMiss={pickEnabled ? onPickHoverMiss : undefined}
      inspectSelectionMeshKey={inspectSelectionMeshKey}
      surfaceMeshFallbackMode="none"
    />
  );
};
