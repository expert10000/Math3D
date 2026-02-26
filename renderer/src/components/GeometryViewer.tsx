import React, { useMemo } from "react";
import { SurfaceViewer, type ColorMode, type OverlayLabelSet, type OverlayPointSet } from "./SurfaceViewer";
import type { GeometryScene, Polygon3 } from "../geometry/types";
import { buildGeometryRenderData } from "../geometry/render";
import type { PolylineSet } from "../scene/renderPrimitives";
import { polygonNormalFromVertices } from "../geometry/polyhedra";
import { normalizeVec3, scaleVec3 } from "../geometry/vec";

export type GeometryViewerProps = {
  scene: GeometryScene;
  colorMode?: ColorMode;
  wireframe?: boolean;
  materialOpacity?: number;
  resetToken?: number;
  highlightPolygons?: Polygon3[] | null;
  highlightColor?: number;
  highlightOpacity?: number;
  highlightRadiusScale?: number;
  highlightFillColor?: number;
  highlightFillOpacity?: number;
  highlightFillOffset?: number;
  highlightPointSets?: OverlayPointSet[] | null;
  overlayLabelSets?: OverlayLabelSet[] | null;
  pickEnabled?: boolean;
  onPick?: (info: { point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } }) => void;
};

export const GeometryViewer: React.FC<GeometryViewerProps> = ({
  scene,
  colorMode = "solid",
  wireframe = false,
  materialOpacity = 0.85,
  resetToken,
  highlightPolygons,
  highlightColor = 0xf97316,
  highlightOpacity = 0.9,
  highlightRadiusScale = 2.2,
  highlightFillColor,
  highlightFillOpacity = 0.22,
  highlightFillOffset = 0.004,
  highlightPointSets,
  overlayLabelSets,
  pickEnabled = false,
  onPick,
}) => {
  const renderData = useMemo(
    () =>
      buildGeometryRenderData(scene, {
        label: "Geometry",
        emitEdges: true,
      }),
    [scene]
  );

  const mesh = renderData.mesh;
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
    () => [...renderData.overlayPolylineGroups, ...highlightGroups],
    [renderData.overlayPolylineGroups, highlightGroups]
  );
  const overlayMeshGroups = useMemo(() => {
    if (!highlightPolygons?.length) return [];
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
  }, [highlightPolygons, highlightFillOffset, highlightFillOpacity, highlightFillColor, highlightColor]);

  const overlayPointSets = useMemo(
    () => [...renderData.overlayPointSets, ...(highlightPointSets ?? [])],
    [renderData.overlayPointSets, highlightPointSets]
  );

  return (
    <SurfaceViewer
      surfaceId="surface_mesh"
      surfaceMeshOverride={
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
          : null
      }
      colorMode={colorMode}
      wireframe={wireframe}
      materialOpacity={materialOpacity}
      overlayPolylineGroups={overlayPolylineGroups}
      overlayPointSets={overlayPointSets}
      overlayMeshGroups={overlayMeshGroups}
      overlayLabelSets={overlayLabelSets}
      showContours={false}
      showBoundingBox={true}
      resetToken={resetToken}
      inspectEnabled={pickEnabled}
      onInspectPick={
        pickEnabled && onPick
          ? (info) => {
              onPick({ point: info.point, normal: info.normal });
            }
          : undefined
      }
    />
  );
};
