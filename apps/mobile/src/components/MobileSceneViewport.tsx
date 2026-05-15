import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { Canvas, useFrame } from "@react-three/fiber/native";
import * as THREE from "three";
import type { SceneDocument } from "@math3d/core";
import {
  buildSceneSurfacePreviews,
  type MobileMeshPayload,
  type MobileRenderQuality,
  type MobileSurfacePreview,
} from "../viewer/mobileSurfacePreview";

const SHOW_GRID = false;

type MobileSceneViewportProps = {
  scene: SceneDocument;
  quality: MobileRenderQuality;
  visibleSurfaceIds?: string[];
  cameraCommand?: { type: "reset" | "fit"; token: number } | null;
  forceFallback?: boolean;
  implicitMeshBySurfaceId?: Record<string, MobileMeshPayload | undefined>;
  onRenderReady?: () => void;
};

type OrbitState = {
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
      orbit.targetY + orbit.distance * Math.cos(orbit.polar),
      orbit.targetZ + orbit.distance * sinPolar * Math.sin(orbit.azimuth)
    );
    camera.up.set(0, 1, 0);
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

const fitOrbitToPreviews = (previews: MobileSurfacePreview[], current: OrbitState): OrbitState => {
  if (previews.length === 0) return { ...DEFAULT_ORBIT };

  const merged = new THREE.Box3();
  merged.makeEmpty();

  for (const preview of previews) {
    const geometry = preview.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) continue;
    merged.union(geometry.boundingBox);
  }

  if (merged.isEmpty()) return { ...DEFAULT_ORBIT };

  const sphere = merged.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(0.2, sphere.radius);
  const fovRadians = (52 * Math.PI) / 180;
  const fitDistance = clamp((radius / Math.sin(fovRadians * 0.5)) * 1.35, 1.5, 40);

  return {
    azimuth: current.azimuth,
    polar: current.polar,
    distance: fitDistance,
    targetX: sphere.center.x,
    targetY: sphere.center.y,
    targetZ: sphere.center.z,
  };
};

const SurfaceMesh: React.FC<{ preview: MobileSurfacePreview }> = ({ preview }) => {
  useEffect(() => {
    return () => {
      preview.geometry.dispose();
    };
  }, [preview.geometry]);

  return (
    <mesh geometry={preview.geometry}>
      <meshBasicMaterial color={preview.color} side={THREE.DoubleSide} />
    </mesh>
  );
};

export const MobileSceneViewport: React.FC<MobileSceneViewportProps> = ({
  scene,
  quality,
  visibleSurfaceIds,
  cameraCommand,
  forceFallback = false,
  implicitMeshBySurfaceId,
  onRenderReady,
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

  const orbitRef = useRef<OrbitState>({ ...DEFAULT_ORBIT });

  const previousTouchesRef = useRef<TouchPoint[]>([]);
  const [gestureHint, setGestureHint] = useState("1-finger orbit | 2-finger pan + pinch zoom");

  useEffect(() => {
    orbitRef.current = fitOrbitToPreviews(visiblePreviews, orbitRef.current);
  }, [scene.id, quality, visiblePreviews]);

  useEffect(() => {
    if (!cameraCommand) return;
    if (cameraCommand.type === "reset") {
      orbitRef.current = { ...DEFAULT_ORBIT };
      return;
    }
    if (cameraCommand.type === "fit") {
      orbitRef.current = fitOrbitToPreviews(visiblePreviews, orbitRef.current);
    }
  }, [cameraCommand, visiblePreviews]);

  if (forceFallback) {
    return (
      <View style={[styles.viewportRoot, styles.fallbackRoot]}>
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
    } else if (currentTouches.length >= 2 && previousTouches.length >= 2) {
      const c0 = centerBetween(currentTouches[0], currentTouches[1]);
      const p0 = centerBetween(previousTouches[0], previousTouches[1]);
      const centerDx = c0.x - p0.x;
      const centerDy = c0.y - p0.y;

      const currentDistance = distanceBetween(currentTouches[0], currentTouches[1]);
      const previousDistance = distanceBetween(previousTouches[0], previousTouches[1]);
      const zoomRatio = previousDistance > 1e-3 ? currentDistance / previousDistance : 1;

      const panScale = orbitRef.current.distance * 0.003;
      orbitRef.current.targetX -= centerDx * panScale;
      orbitRef.current.targetY += centerDy * panScale;

      orbitRef.current.distance = clamp(orbitRef.current.distance / clamp(zoomRatio, 0.7, 1.4), 1.5, 40);
      setGestureHint("Panning / Zooming");
    }

    previousTouchesRef.current = currentTouches;
  };

  const handleResponderEnd = () => {
    previousTouchesRef.current = [];
    setGestureHint("1-finger orbit | 2-finger pan + pinch zoom");
  };

  return (
    <View
      style={styles.viewportRoot}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleResponderGrant}
      onResponderMove={handleResponderMove}
      onResponderRelease={handleResponderEnd}
      onResponderTerminate={handleResponderEnd}
    >
      <Canvas
        style={styles.canvas}
        camera={{ fov: 52, near: 0.01, far: 1000, position: [0, 0, 6] }}
        gl={{ antialias: true }}
      >
        {SHOW_GRID ? <gridHelper args={[12, 12, "#8ea3bb", "#b7c6d7"]} /> : null}

        {visiblePreviews.map((preview, index) => (
          <SurfaceMesh key={`surface-preview-${preview.id}-${index}`} preview={preview} />
        ))}

        <CameraRig orbitRef={orbitRef} />
        <RenderReadyPing onReady={onRenderReady} />
      </Canvas>

      <View style={styles.overlay} pointerEvents="none">
        <Text style={styles.overlayText}>{gestureHint}</Text>
        <Text style={styles.overlayText}>Visible surfaces: {visiblePreviews.length}</Text>
      </View>

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
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  overlayText: {
    color: "#f8fbff",
    fontSize: 10,
    fontWeight: "600",
  },
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
