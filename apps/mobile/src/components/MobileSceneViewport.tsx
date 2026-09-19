import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { Canvas, useFrame } from "@react-three/fiber/native";
import * as THREE from "three";
import type { SceneDocument } from "@math3d/core";
import { DEFAULT_MOBILE_GRID_PLANES, type MobileGridPlane } from "../models/mobileCoordinateGrid";
import {
  buildSceneSurfacePreviews,
  type MobileMeshPayload,
  type MobileRenderQuality,
  type MobileSurfacePreview,
} from "../viewer/mobileSurfacePreview";

type MobileSceneViewportProps = {
  scene: SceneDocument;
  quality: MobileRenderQuality;
  visibleSurfaceIds?: string[];
  selectedSurfaceId?: string | null;
  cameraCommand?: { type: "reset" | "fit"; token: number } | null;
  forceFallback?: boolean;
  implicitMeshBySurfaceId?: Record<string, MobileMeshPayload | undefined>;
  onRenderReady?: () => void;
  initialOrbit?: OrbitState | null;
  onOrbitChange?: (orbit: OrbitState) => void;
  onSelectedSurfaceChange?: (surfaceId: string) => void;
  renderPaused?: boolean;
  surfaceOpacityById?: Record<string, number>;
  showGrid?: boolean;
  showAxes?: boolean;
  gridPlanes?: MobileGridPlane[];
  viewportStyle?: StyleProp<ViewStyle>;
};

export type OrbitState = {
  azimuth: number;
  polar: number;
  distance: number;
  targetX: number;
  targetY: number;
  targetZ: number;
};

type TouchPoint = {
  id: string;
  x: number;
  y: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
type FiniteBounds = {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
};
const hasFiniteBounds = (box: FiniteBounds | null | undefined): box is FiniteBounds => {
  if (!box) return false;
  return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite);
};
const DEFAULT_ORBIT: OrbitState = {
  azimuth: 0.8,
  polar: 1.1,
  distance: 6,
  targetX: 0,
  targetY: 0,
  targetZ: 0,
};

const readTouches = (event: GestureResponderEvent): TouchPoint[] => {
  const native = event.nativeEvent as unknown as {
    touches?: Array<{ identifier?: number | string; pageX?: number; pageY?: number }>;
  };
  const touches = Array.isArray(native.touches) ? native.touches : [];
  return touches
    .map((touch, index) => ({
      id: String(touch.identifier ?? index),
      x: typeof touch.pageX === "number" ? touch.pageX : 0,
      y: typeof touch.pageY === "number" ? touch.pageY : 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
};

const distanceBetween = (a: TouchPoint, b: TouchPoint) => Math.hypot(a.x - b.x, a.y - b.y);

const centerBetween = (a: TouchPoint, b: TouchPoint) => ({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });

const CameraRig: React.FC<{ orbitRef: React.MutableRefObject<OrbitState> }> = ({ orbitRef }) => {
  useFrame(({ camera }) => {
    const orbit = orbitRef.current;
    const sinPolar = Math.sin(orbit.polar);

    camera.position.set(
      orbit.targetX + orbit.distance * sinPolar * Math.cos(orbit.azimuth),
      orbit.targetY + orbit.distance * sinPolar * Math.sin(orbit.azimuth),
      orbit.targetZ + orbit.distance * Math.cos(orbit.polar)
    );
    camera.up.set(0, 0, 1);
    camera.lookAt(orbit.targetX, orbit.targetY, orbit.targetZ);
  });

  return null;
};

const RenderReadyPing: React.FC<{ onReady?: () => void }> = ({ onReady }) => {
  const sentRef = useRef(false);
  useFrame(() => {
    if (sentRef.current || !onReady) return;
    sentRef.current = true;
    onReady();
  });
  return null;
};

const fitOrbitToPreviews = (previews: MobileSurfacePreview[], current: OrbitState, aspect: number): OrbitState => {
  if (previews.length === 0) return { ...DEFAULT_ORBIT };

  const merged = new THREE.Box3();
  merged.makeEmpty();

  for (const preview of previews) {
    const geometry = preview.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!hasFiniteBounds(geometry.boundingBox)) continue;
    merged.union(geometry.boundingBox);
  }

  if (merged.isEmpty()) return { ...DEFAULT_ORBIT };

  const sphere = merged.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(0.2, sphere.radius);
  const fovRadians = (52 * Math.PI) / 180;
  const horizontalHalfFov = Math.atan(Math.tan(fovRadians * 0.5) * Math.max(0.2, aspect));
  const limitingHalfFov = Math.min(fovRadians * 0.5, horizontalHalfFov);
  const fitDistance = clamp((radius / Math.sin(limitingHalfFov)) * 1.35, 1.5, 40);

  return {
    azimuth: current.azimuth,
    polar: current.polar,
    distance: fitDistance,
    targetX: sphere.center.x,
    targetY: sphere.center.y,
    targetZ: sphere.center.z,
  };
};

const SurfaceMesh: React.FC<{ preview: MobileSurfacePreview; opacity: number }> = ({ preview, opacity }) => {
  useEffect(() => {
    return () => {
      preview.geometry.dispose();
    };
  }, [preview.geometry]);

  return (
    <mesh geometry={preview.geometry}>
      <meshBasicMaterial color={preview.color} side={THREE.DoubleSide} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
    </mesh>
  );
};

type GridRange = { min: number; max: number };

const PlaneGrid: React.FC<{
  plane: MobileGridPlane;
  first: GridRange;
  second: GridRange;
  offset: number;
  spacing: number;
  color: string;
}> = ({ plane, first, second, offset, spacing, color }) => {
  const geometry = useMemo(() => {
    const vertices: number[] = [];
    const point = (a: number, b: number): number[] =>
      plane === "xy" ? [a, b, offset] : plane === "xz" ? [a, offset, b] : [offset, a, b];
    const line = (a0: number, b0: number, a1: number, b1: number) => {
      vertices.push(...point(a0, b0), ...point(a1, b1));
    };
    for (let a = first.min; a <= first.max + spacing * 0.01; a += spacing) {
      line(a, second.min, a, second.max);
    }
    for (let b = second.min; b <= second.max + spacing * 0.01; b += spacing) {
      line(first.min, b, first.max, b);
    }
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    return next;
  }, [plane, first.min, first.max, second.min, second.max, offset, spacing]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={plane === "xy" ? 0.55 : 0.38} depthWrite={false} />
    </lineSegments>
  );
};

export const MobileSceneViewport: React.FC<MobileSceneViewportProps> = ({
  scene,
  quality,
  visibleSurfaceIds,
  selectedSurfaceId,
  cameraCommand,
  forceFallback = false,
  implicitMeshBySurfaceId,
  onRenderReady,
  initialOrbit,
  onOrbitChange,
  onSelectedSurfaceChange,
  renderPaused = false,
  surfaceOpacityById,
  showGrid = true,
  showAxes = true,
  gridPlanes = DEFAULT_MOBILE_GRID_PLANES,
  viewportStyle,
}) => {
  const previews = useMemo(
    () => buildSceneSurfacePreviews(scene, quality, { implicitMeshBySurfaceId }),
    [scene, quality, implicitMeshBySurfaceId]
  );
  const visibleSet = useMemo(() => {
    if (!visibleSurfaceIds) return null;
    return new Set(
      visibleSurfaceIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    );
  }, [visibleSurfaceIds]);
  const visiblePreviews = useMemo(() => {
    if (!visibleSet) return previews;
    return previews.filter((preview) => visibleSet.has(preview.id));
  }, [previews, visibleSet]);
  const warnings = useMemo(
    () => visiblePreviews.map((item) => item.warning).filter((value): value is string => typeof value === "string"),
    [visiblePreviews]
  );
  const coordinateFrame = useMemo(() => {
    const bounds = new THREE.Box3().makeEmpty();
    for (const preview of visiblePreviews) {
      if (!preview.geometry.boundingBox) preview.geometry.computeBoundingBox();
      if (hasFiniteBounds(preview.geometry.boundingBox)) bounds.union(preview.geometry.boundingBox);
    }
    const empty = bounds.isEmpty();
    const extent = (min: number, max: number) => empty ? 2 : Math.max(0, max - min);
    const widestSpan = Math.max(
      extent(bounds.min.x, bounds.max.x),
      extent(bounds.min.y, bounds.max.y),
      extent(bounds.min.z, bounds.max.z),
      2
    );
    const roughSpacing = widestSpan / 6;
    const magnitude = 10 ** Math.floor(Math.log10(roughSpacing));
    const spacing = [1, 2, 5, 10].map((step) => step * magnitude).find((step) => step >= roughSpacing) ?? magnitude * 10;
    const gridRange = (min: number, max: number): GridRange => {
      if (empty) return { min: -2, max: 2 };
      const padding = Math.max(spacing, (max - min) * 0.15);
      return {
        min: Math.floor((min - padding) / spacing) * spacing,
        max: Math.ceil((max + padding) / spacing) * spacing,
      };
    };
    const xRange = gridRange(bounds.min.x, bounds.max.x);
    const yRange = gridRange(bounds.min.y, bounds.max.y);
    const zRange = gridRange(bounds.min.z, bounds.max.z);
    const offsetBehind = (min: number) => Math.floor((min - spacing * 0.4) / spacing) * spacing;
    const planeX = empty ? 0 : offsetBehind(bounds.min.x);
    const planeY = empty ? 0 : offsetBehind(bounds.min.y);
    const planeZ = empty ? 0 : offsetBehind(bounds.min.z);
    return {
      xRange,
      yRange,
      zRange,
      spacing,
      planeX,
      planeY,
      planeZ,
      axisLength: clamp(Math.max(spacing * 2, widestSpan * 0.35), 2, 8),
    };
  }, [visiblePreviews]);

  const orbitRef = useRef<OrbitState>(initialOrbit ? { ...initialOrbit } : { ...DEFAULT_ORBIT });

  const previousTouchesRef = useRef<TouchPoint[]>([]);
  const lastTapRef = useRef<{ at: number; x: number; y: number } | null>(null);
  const [gestureHint, setGestureHint] = useState("1-finger orbit | 2-finger pan + pinch zoom");
  const [doubleTapToken, setDoubleTapToken] = useState(0);
  const [viewportAspect, setViewportAspect] = useState(1);

  useEffect(() => {
    orbitRef.current = fitOrbitToPreviews(visiblePreviews, orbitRef.current, viewportAspect);
  }, [scene.id, quality, visiblePreviews, viewportAspect]);

  useEffect(() => {
    if (!initialOrbit) return;
    orbitRef.current = { ...initialOrbit };
  }, [initialOrbit]);

  useEffect(() => {
    if (!cameraCommand) return;
    if (cameraCommand.type === "reset") {
      orbitRef.current = fitOrbitToPreviews(visiblePreviews, { ...DEFAULT_ORBIT }, viewportAspect);
      return;
    }
    if (cameraCommand.type === "fit") {
      orbitRef.current = fitOrbitToPreviews(visiblePreviews, orbitRef.current, viewportAspect);
    }
  }, [cameraCommand, visiblePreviews, viewportAspect]);

  useEffect(() => {
    onOrbitChange?.(orbitRef.current);
  }, [onOrbitChange, cameraCommand?.token, visiblePreviews, doubleTapToken]);

  if (forceFallback) {
    return (
      <View style={[styles.viewportRoot, styles.fallbackRoot, viewportStyle]}>
        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.overlayText}>Android safe mode (GL fallback)</Text>
          <Text style={styles.overlayText}>Visible surfaces: {visiblePreviews.length}</Text>
        </View>
        <View style={styles.fallbackList}>
          {visiblePreviews.length === 0 && <Text style={styles.fallbackText}>No visible surfaces selected.</Text>}
          {visiblePreviews.map((preview, index) => (
            <View key={`fallback-${preview.id}-${index}`} style={styles.fallbackItem}>
              <Text style={styles.fallbackTitle}>{preview.id}</Text>
              <Text style={styles.fallbackText}>preview color: {preview.color}</Text>
              {preview.warning ? <Text style={styles.fallbackWarn}>{preview.warning}</Text> : null}
            </View>
          ))}
        </View>
      </View>
    );
  }

  const handleResponderGrant = (event: GestureResponderEvent) => {
    previousTouchesRef.current = readTouches(event);
    const touches = previousTouchesRef.current;
    if (touches.length !== 1) return;
    const current = touches[0];
    const now = Date.now();
    const lastTap = lastTapRef.current;
    if (
      lastTap &&
      now - lastTap.at < 260 &&
      Math.abs(lastTap.x - current.x) < 22 &&
      Math.abs(lastTap.y - current.y) < 22
    ) {
      orbitRef.current = fitOrbitToPreviews(visiblePreviews, orbitRef.current, viewportAspect);
      setGestureHint("Focused visible surfaces");
      setDoubleTapToken((value) => value + 1);
      lastTapRef.current = null;
      return;
    }
    lastTapRef.current = { at: now, x: current.x, y: current.y };
  };

  const handleResponderMove = (event: GestureResponderEvent) => {
    const currentTouches = readTouches(event);
    const previousTouches = previousTouchesRef.current;

    if (currentTouches.length === 1 && previousTouches.length === 1) {
      const dx = currentTouches[0].x - previousTouches[0].x;
      const dy = currentTouches[0].y - previousTouches[0].y;
      orbitRef.current.azimuth -= dx * 0.012;
      orbitRef.current.polar = clamp(orbitRef.current.polar + dy * 0.012, 0.12, Math.PI - 0.12);
      setGestureHint("Orbiting");
      onOrbitChange?.(orbitRef.current);
    } else if (currentTouches.length >= 2 && previousTouches.length >= 2) {
      const c0 = centerBetween(currentTouches[0], currentTouches[1]);
      const p0 = centerBetween(previousTouches[0], previousTouches[1]);
      const centerDx = c0.x - p0.x;
      const centerDy = c0.y - p0.y;

      const currentDistance = distanceBetween(currentTouches[0], currentTouches[1]);
      const previousDistance = distanceBetween(previousTouches[0], previousTouches[1]);
      const zoomRatio = previousDistance > 1e-3 ? currentDistance / previousDistance : 1;

      const panScale = orbitRef.current.distance * 0.003;
      const azimuth = orbitRef.current.azimuth;
      const polar = orbitRef.current.polar;
      orbitRef.current.targetX += (centerDx * Math.sin(azimuth) - centerDy * Math.cos(polar) * Math.cos(azimuth)) * panScale;
      orbitRef.current.targetY += (-centerDx * Math.cos(azimuth) - centerDy * Math.cos(polar) * Math.sin(azimuth)) * panScale;
      orbitRef.current.targetZ += centerDy * Math.sin(polar) * panScale;

      orbitRef.current.distance = clamp(orbitRef.current.distance / clamp(zoomRatio, 0.7, 1.4), 1.5, 40);
      setGestureHint("Panning / Zooming");
      onOrbitChange?.(orbitRef.current);
    }

    previousTouchesRef.current = currentTouches;
  };

  const handleResponderEnd = () => {
    previousTouchesRef.current = [];
    setGestureHint("1-finger orbit | 2-finger pan + pinch zoom");
  };

  return (
    <View
      style={[styles.viewportRoot, viewportStyle]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (height > 0) setViewportAspect((current) => {
          const next = width / height;
          return Math.abs(current - next) > 0.01 ? next : current;
        });
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleResponderGrant}
      onResponderMove={handleResponderMove}
      onResponderRelease={handleResponderEnd}
      onResponderTerminate={handleResponderEnd}
    >
      <Canvas
        style={styles.canvas}
        camera={{ fov: 52, near: 0.01, far: 1000, position: [4, 4, 4], up: [0, 0, 1] }}
        gl={{ antialias: true }}
        frameloop={renderPaused ? "demand" : "always"}
      >
        {showGrid && gridPlanes.includes("xy") ? (
          <PlaneGrid plane="xy" first={coordinateFrame.xRange} second={coordinateFrame.yRange} offset={coordinateFrame.planeZ} spacing={coordinateFrame.spacing} color="#afc1d4" />
        ) : null}
        {showGrid && gridPlanes.includes("xz") ? (
          <PlaneGrid plane="xz" first={coordinateFrame.xRange} second={coordinateFrame.zRange} offset={coordinateFrame.planeY} spacing={coordinateFrame.spacing} color="#baa8d4" />
        ) : null}
        {showGrid && gridPlanes.includes("yz") ? (
          <PlaneGrid plane="yz" first={coordinateFrame.yRange} second={coordinateFrame.zRange} offset={coordinateFrame.planeX} spacing={coordinateFrame.spacing} color="#8fbbb3" />
        ) : null}
        {showAxes ? <axesHelper args={[coordinateFrame.axisLength]} /> : null}

        {visiblePreviews.map((preview, index) => (
          <group
            key={`surface-preview-${preview.id}-${index}`}
            onPointerDown={() => {
              onSelectedSurfaceChange?.(preview.id);
            }}
          >
            <SurfaceMesh preview={preview} opacity={Math.max(0, Math.min(1, surfaceOpacityById?.[preview.id] ?? 1))} />
          </group>
        ))}

        <CameraRig orbitRef={orbitRef} />
        <RenderReadyPing onReady={onRenderReady} />
      </Canvas>

      <View style={styles.overlay} pointerEvents="none">
        <Text style={styles.overlayText}>{gestureHint}</Text>
        <Text style={styles.overlayText}>Visible surfaces: {visiblePreviews.length}</Text>
        {selectedSurfaceId ? <Text style={styles.overlayText}>Selected: {selectedSurfaceId}</Text> : null}
        {renderPaused ? <Text style={styles.overlayText}>Paused in background</Text> : null}
      </View>

      {(showGrid || showAxes) && (
        <View style={styles.coordinateBadge} pointerEvents="none" testID="mobile-coordinate-grid-legend">
          {showGrid && gridPlanes.includes("xy") && <Text style={styles.coordinateBadgeTitle}>XY · z={coordinateFrame.planeZ}</Text>}
          {showGrid && gridPlanes.includes("xz") && <Text style={styles.coordinateBadgeTitle}>XZ · y={coordinateFrame.planeY}</Text>}
          {showGrid && gridPlanes.includes("yz") && <Text style={styles.coordinateBadgeTitle}>YZ · x={coordinateFrame.planeX}</Text>}
          {showGrid && <Text style={styles.coordinateBadgeScale}>{coordinateFrame.spacing} unit grid</Text>}
          {showAxes && (
            <View style={styles.axisLegend}>
              <Text style={[styles.axisLabel, styles.axisX]}>X</Text>
              <Text style={[styles.axisLabel, styles.axisY]}>Y</Text>
              <Text style={[styles.axisLabel, styles.axisZ]}>Z</Text>
            </View>
          )}
        </View>
      )}

      {warnings.length > 0 && (
        <View style={styles.warningPanel} pointerEvents="none">
          {warnings.slice(0, 2).map((warning, index) => (
            <Text key={`warning-${index}`} style={styles.warningText}>
              {warning}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  viewportRoot: {
    width: "100%",
    height: 340,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#eef4fa",
    borderWidth: 1,
    borderColor: "#d7e0ea",
  },
  canvas: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    left: 8,
    top: 8,
    borderRadius: 8,
    backgroundColor: "rgba(24,38,56,0.74)",
    maxWidth: "62%",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  overlayText: {
    color: "#f8fbff",
    fontSize: 10,
    fontWeight: "600",
  },
  coordinateBadge: {
    position: "absolute",
    right: 8,
    top: 8,
    borderRadius: 8,
    backgroundColor: "rgba(248,251,255,0.94)",
    borderWidth: 1,
    borderColor: "#cbd8e6",
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: "center",
    gap: 2,
  },
  coordinateBadgeTitle: {
    color: "#1d3854",
    fontSize: 10,
    fontWeight: "800",
  },
  coordinateBadgeScale: {
    color: "#52677d",
    fontSize: 9,
  },
  axisLegend: {
    flexDirection: "row",
    gap: 7,
  },
  axisLabel: {
    fontSize: 10,
    fontWeight: "900",
  },
  axisX: { color: "#c62828" },
  axisY: { color: "#2e7d32" },
  axisZ: { color: "#1565c0" },
  warningPanel: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 8,
    backgroundColor: "rgba(133,33,0,0.82)",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 3,
  },
  warningText: {
    color: "#fff7ed",
    fontSize: 10,
    lineHeight: 14,
  },
  fallbackRoot: {
    paddingTop: 50,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  fallbackList: {
    gap: 8,
  },
  fallbackItem: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d7e0ea",
    backgroundColor: "#f8fbff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  fallbackTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1f2d3d",
  },
  fallbackText: {
    fontSize: 11,
    color: "#4b5e73",
  },
  fallbackWarn: {
    fontSize: 10,
    color: "#8f1d1d",
    lineHeight: 14,
  },
});
