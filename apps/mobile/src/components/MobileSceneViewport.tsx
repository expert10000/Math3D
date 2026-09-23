import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { Canvas, useFrame } from "@react-three/fiber/native";
import * as THREE from "three";
import type { SceneDocument } from "@math3d/core";
import type { MobileSurfaceColorMode } from "../viewer/mobileCurvatureColors";
import type { MobileSurfaceRenderMode, MobileSurfaceShading } from "../viewer/mobileViewModes";
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
  onOpenCompute?: () => void;
  renderPaused?: boolean;
  surfaceOpacityById?: Record<string, number>;
  colorMode?: MobileSurfaceColorMode;
  renderMode?: MobileSurfaceRenderMode;
  shading?: MobileSurfaceShading;
  showBoundingBox?: boolean;
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
    if (!geometry) continue;
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

const SurfaceMesh: React.FC<{
  preview: MobileSurfacePreview;
  opacity: number;
  renderMode: MobileSurfaceRenderMode;
  shading: MobileSurfaceShading;
}> = ({ preview, opacity, renderMode, shading }) => {
  const geometry = preview.geometry;
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) return null;

  const hasVertexColors = !!geometry.getAttribute("color");
  const materialColor = hasVertexColors ? "#ffffff" : preview.color;

  return <group>
    {renderMode !== "wireframe" ? (
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={materialColor}
          vertexColors={hasVertexColors}
          side={THREE.DoubleSide}
          flatShading={shading === "flat"}
          roughness={0.72}
          metalness={0.04}
          transparent={opacity < 1}
          opacity={opacity}
          depthWrite={opacity >= 1}
          polygonOffset={renderMode === "solid-edges"}
          polygonOffsetFactor={renderMode === "solid-edges" ? 1 : 0}
          polygonOffsetUnits={renderMode === "solid-edges" ? 1 : 0}
        />
      </mesh>
    ) : null}
    {renderMode !== "solid" ? (
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={renderMode === "wireframe" ? materialColor : "#18324a"}
          vertexColors={renderMode === "wireframe" && hasVertexColors}
          wireframe
          side={THREE.DoubleSide}
          transparent={opacity < 1 || renderMode === "solid-edges"}
          opacity={renderMode === "solid-edges" ? Math.min(0.62, opacity) : opacity}
          depthWrite={renderMode === "wireframe" && opacity >= 1}
        />
      </mesh>
    ) : null}
  </group>;
};

const PlaneGrid: React.FC<{
  plane: MobileGridPlane;
  halfSize: number;
  majorStep: number;
  color: string;
}> = ({ plane, halfSize, majorStep, color }) => {
  const { majorGeometry, minorGeometry } = useMemo(() => {
    const majorVertices: number[] = [];
    const minorVertices: number[] = [];
    const point = (a: number, b: number): number[] =>
      plane === "xy" ? [a, b, 0] : plane === "xz" ? [a, 0, b] : [0, a, b];
    const line = (vertices: number[], a0: number, b0: number, a1: number, b1: number) => {
      vertices.push(...point(a0, b0), ...point(a1, b1));
    };
    const minorStep = majorStep / 5;
    const count = Math.round(halfSize / minorStep);
    for (let index = -count; index <= count; index += 1) {
      if (index === 0) continue;
      const offset = index * minorStep;
      const vertices = index % 5 === 0 ? majorVertices : minorVertices;
      line(vertices, offset, -halfSize, offset, halfSize);
      line(vertices, -halfSize, offset, halfSize, offset);
    }
    const makeGeometry = (vertices: number[]) => {
      const next = new THREE.BufferGeometry();
      next.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      return next;
    };
    return { majorGeometry: makeGeometry(majorVertices), minorGeometry: makeGeometry(minorVertices) };
  }, [plane, halfSize, majorStep]);

  useEffect(() => () => {
    majorGeometry.dispose();
    minorGeometry.dispose();
  }, [majorGeometry, minorGeometry]);

  const rotation: [number, number, number] = plane === "xy"
    ? [0, 0, 0]
    : plane === "xz"
      ? [Math.PI / 2, 0, 0]
      : [0, Math.PI / 2, 0];

  return (
    <group>
      <mesh rotation={rotation}>
        <planeGeometry args={[halfSize * 2, halfSize * 2]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.055} depthWrite={false} />
      </mesh>
      <lineSegments geometry={minorGeometry}>
        <lineBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={majorGeometry}>
        <lineBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} />
      </lineSegments>
    </group>
  );
};

const CoordinateAxes: React.FC<{ halfSize: number }> = ({ halfSize }) => {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.Float32BufferAttribute([
      -halfSize, 0, 0, halfSize, 0, 0,
      0, -halfSize, 0, 0, halfSize, 0,
      0, 0, -halfSize, 0, 0, halfSize,
    ], 3));
    next.setAttribute("color", new THREE.Float32BufferAttribute([
      0.89, 0.36, 0.36, 0.89, 0.36, 0.36,
      0.27, 0.71, 0.45, 0.27, 0.71, 0.45,
      0.29, 0.51, 1, 0.29, 0.51, 1,
    ], 3));
    return next;
  }, [halfSize]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.9} depthWrite={false} />
    </lineSegments>
  );
};

const SurfaceBounds: React.FC<{ previews: MobileSurfacePreview[] }> = ({ previews }) => {
  const { geometry, center } = useMemo(() => {
    const bounds = new THREE.Box3().makeEmpty();
    for (const preview of previews) {
      const geometry = preview.geometry;
      if (!geometry) continue;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (hasFiniteBounds(geometry.boundingBox)) bounds.union(geometry.boundingBox);
    }
    if (bounds.isEmpty()) return { geometry: null, center: new THREE.Vector3() };
    const size = bounds.getSize(new THREE.Vector3());
    const boxGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const next = new THREE.EdgesGeometry(boxGeometry);
    boxGeometry.dispose();
    return { geometry: next, center: bounds.getCenter(new THREE.Vector3()) };
  }, [previews]);

  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return <lineSegments geometry={geometry} position={[center.x, center.y, center.z]}>
    <lineBasicMaterial color="#234d73" transparent opacity={0.88} depthWrite={false} />
  </lineSegments>;
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
  onOpenCompute,
  renderPaused = false,
  surfaceOpacityById,
  colorMode = "solid",
  renderMode = "solid",
  shading = "smooth",
  showBoundingBox = false,
  showGrid = true,
  showAxes = true,
  gridPlanes = DEFAULT_MOBILE_GRID_PLANES,
  viewportStyle,
}) => {
  const previews = useMemo(
    () => buildSceneSurfacePreviews(scene, quality, { implicitMeshBySurfaceId, colorMode }),
    [scene, quality, implicitMeshBySurfaceId, colorMode]
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
  const renderablePreviews = useMemo(
    () => visiblePreviews.filter((preview) => preview.geometry !== null),
    [visiblePreviews]
  );
  const firstUncomputedPreview = useMemo(
    () => visiblePreviews.find((preview) => preview.state === "uncomputed"),
    [visiblePreviews]
  );
  const warnings = useMemo(
    () => visiblePreviews.map((item) => item.warning).filter((value): value is string => typeof value === "string"),
    [visiblePreviews]
  );
  const coordinateFrame = useMemo(() => {
    const bounds = new THREE.Box3().makeEmpty();
    for (const preview of visiblePreviews) {
      const geometry = preview.geometry;
      if (!geometry) continue;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (hasFiniteBounds(geometry.boundingBox)) bounds.union(geometry.boundingBox);
    }
    const coordinateExtent = bounds.isEmpty() ? 2 : Math.max(
      Math.abs(bounds.min.x), Math.abs(bounds.max.x),
      Math.abs(bounds.min.y), Math.abs(bounds.max.y),
      Math.abs(bounds.min.z), Math.abs(bounds.max.z)
    );
    const desiredHalfSize = clamp(coordinateExtent * 1.15, 2, 40);
    const roughStep = desiredHalfSize / 4;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const majorStep = [1, 2, 5, 10].map((step) => step * magnitude).find((step) => step >= roughStep) ?? magnitude * 10;
    const halfSize = Math.ceil(desiredHalfSize / majorStep) * majorStep;
    return {
      halfSize,
      majorStep,
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
          <Text style={styles.overlayText}>Rendered surfaces: {renderablePreviews.length}</Text>
        </View>
        <View style={styles.fallbackList}>
          {visiblePreviews.length === 0 && <Text style={styles.fallbackText}>No visible surfaces selected.</Text>}
          {visiblePreviews.map((preview, index) => (
            <View key={`fallback-${preview.id}-${index}`} style={styles.fallbackItem}>
              <Text style={styles.fallbackTitle}>{preview.id}</Text>
              {preview.state === "uncomputed" ? (
                <>
                  <Text style={styles.fallbackWarn}>Mesh not computed</Text>
                  <Text style={styles.fallbackText}>Formula: {preview.uncomputed?.formula}</Text>
                  <Text style={styles.fallbackText}>Requires: {preview.uncomputed?.capability}</Text>
                </>
              ) : (
                <Text style={styles.fallbackText}>{colorMode === "solid" ? `preview color: ${preview.color}` : "Curvature colors require the 3D renderer."}</Text>
              )}
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
        <ambientLight intensity={1.25} />
        <directionalLight position={[5, -4, 8]} intensity={1.55} />
        <directionalLight position={[-4, 3, 1]} intensity={0.55} />
        {showGrid && gridPlanes.includes("xy") ? (
          <PlaneGrid plane="xy" halfSize={coordinateFrame.halfSize} majorStep={coordinateFrame.majorStep} color="#74abff" />
        ) : null}
        {showGrid && gridPlanes.includes("xz") ? (
          <PlaneGrid plane="xz" halfSize={coordinateFrame.halfSize} majorStep={coordinateFrame.majorStep} color="#69ca84" />
        ) : null}
        {showGrid && gridPlanes.includes("yz") ? (
          <PlaneGrid plane="yz" halfSize={coordinateFrame.halfSize} majorStep={coordinateFrame.majorStep} color="#ffa877" />
        ) : null}
        {showAxes ? <CoordinateAxes halfSize={coordinateFrame.halfSize} /> : null}
        {showBoundingBox ? <SurfaceBounds previews={renderablePreviews} /> : null}

        {renderablePreviews.map((preview, index) => (
          <group
            key={`surface-preview-${preview.id}-${index}`}
            onPointerDown={() => {
              onSelectedSurfaceChange?.(preview.id);
            }}
          >
            <SurfaceMesh
              preview={preview}
              opacity={Math.max(0, Math.min(1, surfaceOpacityById?.[preview.id] ?? 1))}
              renderMode={renderMode}
              shading={shading}
            />
          </group>
        ))}

        <CameraRig orbitRef={orbitRef} />
        <RenderReadyPing onReady={onRenderReady} />
      </Canvas>

      <View style={styles.overlay} pointerEvents="none">
        <Text style={styles.overlayText}>{gestureHint}</Text>
        <Text style={styles.overlayText}>Rendered surfaces: {renderablePreviews.length}</Text>
        {selectedSurfaceId ? <Text style={styles.overlayText}>Selected: {selectedSurfaceId}</Text> : null}
        {renderPaused ? <Text style={styles.overlayText}>Paused in background</Text> : null}
      </View>

      {firstUncomputedPreview?.uncomputed ? (
        <View style={styles.uncomputedPanel} pointerEvents="box-none">
          <Text style={styles.uncomputedTitle}>Mesh not computed</Text>
          <Text style={styles.uncomputedText} numberOfLines={2}>Formula: {firstUncomputedPreview.uncomputed.formula}</Text>
          <Text style={styles.uncomputedText}>Requires: {firstUncomputedPreview.uncomputed.capability}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Open Compute" onPress={onOpenCompute} style={styles.uncomputedAction}>
            <Text style={styles.uncomputedActionText}>Open Compute</Text>
          </Pressable>
        </View>
      ) : null}

      {(showGrid || showAxes) && (
        <View style={styles.coordinateBadge} pointerEvents="none" testID="mobile-coordinate-grid-legend">
          {showGrid && gridPlanes.includes("xy") && <Text style={[styles.coordinateBadgeTitle, styles.planeLabelXY]}>XY · z=0</Text>}
          {showGrid && gridPlanes.includes("xz") && <Text style={[styles.coordinateBadgeTitle, styles.planeLabelXZ]}>XZ · y=0</Text>}
          {showGrid && gridPlanes.includes("yz") && <Text style={[styles.coordinateBadgeTitle, styles.planeLabelYZ]}>YZ · x=0</Text>}
          {showGrid && <Text style={styles.coordinateBadgeScale}>{coordinateFrame.majorStep} unit grid</Text>}
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
  planeLabelXY: { color: "#245da7" },
  planeLabelXZ: { color: "#237044" },
  planeLabelYZ: { color: "#a45122" },
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
  uncomputedPanel: {
    position: "absolute",
    left: 18,
    right: 18,
    top: "38%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#9eafc0",
    backgroundColor: "rgba(248,251,255,0.96)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  uncomputedTitle: {
    color: "#263d53",
    fontSize: 14,
    fontWeight: "800",
  },
  uncomputedText: {
    color: "#52677d",
    fontSize: 10,
    lineHeight: 14,
  },
  uncomputedAction: {
    alignSelf: "flex-start",
    marginTop: 4,
    borderRadius: 7,
    backgroundColor: "#194a7a",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  uncomputedActionText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
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
