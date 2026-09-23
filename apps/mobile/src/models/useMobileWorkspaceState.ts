import { useState } from "react";
import type { SceneDocument } from "@math3d/core";
import type { OrbitState } from "../components/MobileSceneViewport";
import { DEFAULT_MOBILE_GRID_PLANES, type MobileGridPlane } from "./mobileCoordinateGrid";
import type { MobileSurfaceColorMode } from "../viewer/mobileCurvatureColors";
import type { MobileRenderQuality } from "../viewer/mobileSurfacePreview";
import type { MobileSurfaceRenderMode, MobileSurfaceShading } from "../viewer/mobileViewModes";

export type CameraCommandType = "reset" | "fit";

export const useMobileWorkspaceState = () => {
  const [viewerDocument, setViewerDocument] = useState<SceneDocument | null>(null);
  const [selectedSurfaceId, setSelectedSurfaceId] = useState<string | null>(null);
  const [visibleSurfaceIds, setVisibleSurfaceIds] = useState<string[]>([]);
  const [surfaceOpacityById, setSurfaceOpacityById] = useState<Record<string, number>>({});
  const [surfaceColorMode, setSurfaceColorMode] = useState<MobileSurfaceColorMode>("solid");
  const [surfaceRenderMode, setSurfaceRenderMode] = useState<MobileSurfaceRenderMode>("solid");
  const [surfaceShading, setSurfaceShading] = useState<MobileSurfaceShading>("smooth");
  const [renderQuality, setRenderQuality] = useState<MobileRenderQuality>("balanced");
  const [showAxes, setShowAxes] = useState(true);
  const [gridPlanes, setGridPlanes] = useState<MobileGridPlane[]>([...DEFAULT_MOBILE_GRID_PLANES]);
  const [cameraOrbit, setCameraOrbit] = useState<OrbitState | null>(null);
  const [cameraCommandType, setCameraCommandType] = useState<CameraCommandType | null>(null);
  const [cameraCommandToken, setCameraCommandToken] = useState(0);
  return {
    viewerDocument, setViewerDocument, selectedSurfaceId, setSelectedSurfaceId, visibleSurfaceIds, setVisibleSurfaceIds,
    surfaceOpacityById, setSurfaceOpacityById, surfaceColorMode, setSurfaceColorMode,
    surfaceRenderMode, setSurfaceRenderMode, surfaceShading, setSurfaceShading, renderQuality, setRenderQuality,
    showAxes, setShowAxes, gridPlanes, setGridPlanes, cameraOrbit, setCameraOrbit, cameraCommandType, setCameraCommandType,
    cameraCommandToken, setCameraCommandToken,
  };
};
