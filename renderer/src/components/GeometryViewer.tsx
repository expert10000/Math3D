import React, { useMemo } from "react";
import { SurfaceViewer, type ColorMode } from "./SurfaceViewer";
import type { GeometryScene } from "../geometry/types";
import { buildGeometryRenderData } from "../geometry/render";

export type GeometryViewerProps = {
  scene: GeometryScene;
  colorMode?: ColorMode;
  wireframe?: boolean;
  materialOpacity?: number;
  resetToken?: number;
};

export const GeometryViewer: React.FC<GeometryViewerProps> = ({
  scene,
  colorMode = "solid",
  wireframe = false,
  materialOpacity = 0.85,
  resetToken,
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
      overlayPolylineGroups={renderData.overlayPolylineGroups}
      overlayPointSets={renderData.overlayPointSets}
      showContours={false}
      showBoundingBox={true}
      resetToken={resetToken}
    />
  );
};
