import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { marchingCubesVolume } from "../math/marchingCubes";

import type { VolumeDataset, VectorGrid } from "../scene/datasets";
import type { Image2D } from "../scene/renderPrimitives";
import {
  buildSliceImage,
  getSliceInfo,
  gradientMagnitudeAt,
  gridIndexToWorld,
  sampleGridTrilinear,
  sliceVolumeData,
  volumeSliceContours,
  type SliceAxis,
  type VolumeSliceData,
  type VolumeSliceHover,
  type VolumeSliceReport,
  type VolumeSliceWindow,
} from "../scene/volume/sliceVolume";
import {
  supportsVtkVolumeSlice,
  vtkVolumeIsosurface,
  vtkVolumeSlice,
  vtkVolumeStreamlines,
} from "../services/vtkVolumeClient";
import { vtkSmooth } from "../services/vtkMeshClient";
import { configureOrbitControlsForTouch, installViewerTouchGestures } from "../utils/viewerTouchGestures";
import {
  createVolumeTransferTextureData,
  getVolumeTransferPreset,
  planVolumeRendering,
  renderVolumeProjectionCpu,
  volumeRenderStepCount,
  type VolumeDirectRenderStatus,
  type VolumeRenderMode,
  type VolumeRenderQuality,
  type VolumeTextureSampling,
  type VolumeTransferFunction,
} from "../volume/transferFunction";

export type VolumeViewerProps = {
  dataset: VolumeDataset | null;
  vectorGrid?: VectorGrid | null;
  axis: SliceAxis;
  index: number;
  opacity: number;
  crosshair?: [number, number, number] | null;
  onSlicePick?: (world: [number, number, number], axis: SliceAxis) => void;
  onSliceStep?: (axis: SliceAxis, delta: number, coarse: boolean) => void;
  onResetCrosshair?: () => void;
  coarseStep?: number;
  orientationConvention?: "scientific" | "radiological";
  viewPreset?: "free" | "xy" | "xz" | "yz";
  showPrimarySlice?: boolean;
  spatialSlices?: Record<SliceAxis, number>;
  spatialPlaneVisibility?: Record<SliceAxis, boolean>;
  showAxes?: boolean;
  contourEnabled?: boolean;
  contourCount?: number;
  windowMode?: "auto" | "minmax";
  onSliceReport?: (report: VolumeSliceReport | null) => void;
  onSliceHover?: (hover: VolumeSliceHover | null) => void;
  showIsosurface?: boolean;
  isoValue?: number;
  isoSmoothing?: boolean;
  isoSmoothingIterations?: number;
  showCropBox?: boolean;
  cropCenter?: [number, number, number];
  cropExtents?: [number, number, number];
  cropGizmoEnabled?: boolean;
  cropGizmoMode?: "move" | "scale";
  clipToCrop?: boolean;
  onCropChange?: (center: [number, number, number], extents: [number, number, number]) => void;
  cameraCommand?: { token: number; kind: "fit-volume" | "fit-mesh" | "fit-crop" | "reset" };
  autoFitIsosurface?: boolean;
  renderMode?: VolumeRenderMode;
  transferFunction?: VolumeTransferFunction;
  renderQuality?: VolumeRenderQuality;
  textureSampling?: VolumeTextureSampling;
  gradientOpacity?: number;
  gradientShading?: boolean;
  renderWindow?: [number, number];
  onVolumeRenderStatus?: (status: VolumeDirectRenderStatus) => void;
  initialCameraState?: VolumeCameraState | null;
  onCameraStateChange?: (state: VolumeCameraState) => void;
  showStreamlines?: boolean;
  streamlineSeeds?: [number, number, number][];
  streamlineStepSize?: number;
  streamlineMaxSteps?: number;
  streamlineMaxLength?: number;
  captureToken?: number;
  onCaptureThumbnail?: (dataUrl: string | null) => void;
};

export type VolumeCameraState = {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
};

type VolumeSliceRuntimeState =
  | { kind: "empty"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "unsupported"; message: string }
  | { kind: "loading"; message: string }
  | { kind: "fallback"; message: string }
  | { kind: "ready"; message: string };

const disposeMesh = (mesh: THREE.Mesh) => {
  mesh.geometry.dispose();
  const mat = mesh.material as THREE.Material | THREE.Material[];
  if (Array.isArray(mat)) {
    mat.forEach((m) => m.dispose());
  } else {
    mat.dispose();
  }
};

const clearGroup = (group: THREE.Group) => {
  const children = [...group.children];
  for (const child of children) {
    group.remove(child);
    const anyChild = child as any;
    if (anyChild.geometry) {
      anyChild.geometry.dispose?.();
    }
    if (anyChild.material) {
      const mat = anyChild.material as THREE.Material | THREE.Material[];
      const disposeMaterial = (material: THREE.Material) => {
        const map = (material as THREE.MeshBasicMaterial).map;
        map?.dispose();
        material.dispose();
      };
      if (Array.isArray(mat)) mat.forEach(disposeMaterial);
      else disposeMaterial(mat);
    }
  }
};

const VTK_SLICE_THRESHOLD = 64 * 64 * 64;
const VTK_ISO_THRESHOLD = 64 * 64 * 64;
const MAX_INTERACTIVE_VOLUME_SAMPLES = 256 * 256 * 256;

const DIRECT_VOLUME_VERTEX_SHADER = `precision highp float;
in vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
out vec3 vTexturePosition;
void main() {
  vTexturePosition = position + vec3(0.5);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DIRECT_VOLUME_FRAGMENT_SHADER = `precision highp float;
precision highp sampler3D;
uniform sampler3D uVolume;
uniform sampler2D uTransfer;
uniform vec3 uCameraTexture;
uniform vec3 uVoxelStep;
uniform float uStepCount;
uniform float uGradientOpacity;
uniform bool uGradientShading;
uniform int uMode;
uniform vec3 uCropMin;
uniform vec3 uCropMax;
in vec3 vTexturePosition;
out vec4 outColor;

vec2 intersectSampleBox(vec3 origin, vec3 direction) {
  vec3 safeDirection = sign(direction) * max(abs(direction), vec3(1e-6));
  vec3 first = (uCropMin - origin) / safeDirection;
  vec3 second = (uCropMax - origin) / safeDirection;
  vec3 nearPlane = min(first, second);
  vec3 farPlane = max(first, second);
  return vec2(max(max(nearPlane.x, nearPlane.y), nearPlane.z), min(min(farPlane.x, farPlane.y), farPlane.z));
}

float scalarAt(vec3 position) {
  return texture(uVolume, clamp(position, vec3(0.0), vec3(1.0))).r;
}

vec3 gradientAt(vec3 position) {
  return vec3(
    scalarAt(position + vec3(uVoxelStep.x, 0.0, 0.0)) - scalarAt(position - vec3(uVoxelStep.x, 0.0, 0.0)),
    scalarAt(position + vec3(0.0, uVoxelStep.y, 0.0)) - scalarAt(position - vec3(0.0, uVoxelStep.y, 0.0)),
    scalarAt(position + vec3(0.0, 0.0, uVoxelStep.z)) - scalarAt(position - vec3(0.0, 0.0, uVoxelStep.z))
  );
}

void main() {
  vec3 direction = normalize(vTexturePosition - uCameraTexture);
  vec2 hit = intersectSampleBox(uCameraTexture, direction);
  float startDistance = max(hit.x, 0.0);
  if (hit.y <= startDistance) discard;
  float stepLength = (hit.y - startDistance) / max(1.0, uStepCount);
  vec3 position = uCameraTexture + direction * (startDistance + stepLength * 0.5);
  vec3 stepVector = direction * stepLength;
  float maximumValue = 0.0;
  float minimumValue = 1.0;
  float totalValue = 0.0;
  float sampleCount = 0.0;
  vec4 accumulated = vec4(0.0);

  for (int sampleIndex = 0; sampleIndex < 512; sampleIndex += 1) {
    if (float(sampleIndex) >= uStepCount) break;
    float value = scalarAt(position);
    maximumValue = max(maximumValue, value);
    minimumValue = min(minimumValue, value);
    totalValue += value;
    sampleCount += 1.0;
    if (uMode == 3) {
      vec4 mapped = texture(uTransfer, vec2(value, 0.5));
      vec3 gradient = gradientAt(position);
      float gradientMagnitude = length(gradient);
      mapped.a *= mix(1.0, clamp(gradientMagnitude * 8.0, 0.0, 1.0), clamp(uGradientOpacity, 0.0, 1.0));
      mapped.a = 1.0 - pow(max(0.0, 1.0 - mapped.a), 180.0 / max(1.0, uStepCount));
      if (uGradientShading && gradientMagnitude > 1e-5) {
        vec3 normal = normalize(gradient);
        vec3 lightDirection = normalize(vec3(0.45, 0.7, 1.0));
        mapped.rgb *= 0.28 + 0.72 * abs(dot(normal, lightDirection));
      }
      accumulated.rgb += (1.0 - accumulated.a) * mapped.a * mapped.rgb;
      accumulated.a += (1.0 - accumulated.a) * mapped.a;
      if (accumulated.a >= 0.985) break;
    }
    position += stepVector;
  }

  if (uMode == 3) {
    if (accumulated.a <= 0.002) discard;
    outColor = accumulated;
    return;
  }
  float projected = uMode == 0 ? maximumValue : uMode == 1 ? minimumValue : totalValue / max(1.0, sampleCount);
  vec4 mapped = texture(uTransfer, vec2(projected, 0.5));
  outColor = vec4(mapped.rgb, max(0.2, mapped.a));
}`;

const buildCpuIsosurface = (
  grid: VolumeDataset["grid"],
  iso: number
): THREE.BufferGeometry | null => {
  const [nx, ny, nz] = grid.dims;
  const total = nx * ny * nz;
  if (!total || total > VTK_ISO_THRESHOLD) return null;

  const res = marchingCubesVolume(grid, iso);
  if (!res) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(res.positions, 3));
  geom.setIndex(new THREE.BufferAttribute(res.indices, 1));
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  geom.computeBoundingBox();
  return geom;
};

const getGridBounds = (grid: VolumeDataset["grid"]) => {
  const corners: [number, number, number][] = [];
  for (const x of [0, Math.max(0, grid.dims[0] - 1)]) {
    for (const y of [0, Math.max(0, grid.dims[1] - 1)]) {
      for (const z of [0, Math.max(0, grid.dims[2] - 1)]) corners.push(gridIndexToWorld(grid, [x, y, z]));
    }
  }
  const min: [number, number, number] = [
    Math.min(...corners.map((corner) => corner[0])),
    Math.min(...corners.map((corner) => corner[1])),
    Math.min(...corners.map((corner) => corner[2])),
  ];
  const max: [number, number, number] = [
    Math.max(...corners.map((corner) => corner[0])),
    Math.max(...corners.map((corner) => corner[1])),
    Math.max(...corners.map((corner) => corner[2])),
  ];
  const center: [number, number, number] = [
    (min[0] + max[0]) * 0.5,
    (min[1] + max[1]) * 0.5,
    (min[2] + max[2]) * 0.5,
  ];
  const dx = max[0] - min[0];
  const dy = max[1] - min[1];
  const dz = max[2] - min[2];
  const diag = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return { min, max, center, diag };
};

const fitCameraToSphere = (
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  center: THREE.Vector3,
  radius: number,
  padding = 1.35
): VolumeCameraState | null => {
  if (!Number.isFinite(radius) || radius <= 0) return null;

  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * Math.max(0.01, camera.aspect));
  const limitingFov = Math.max(THREE.MathUtils.degToRad(5), Math.min(verticalFov, horizontalFov));
  const distance = Math.max(0.1, (radius * padding) / Math.sin(limitingFov * 0.5));
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 1e-8) direction.set(0.9, 0.82, 1);
  direction.normalize();

  camera.position.copy(center).addScaledVector(direction, distance);
  camera.up.set(0, 1, 0);
  camera.near = Math.max(0.001, distance / 1000);
  camera.far = Math.max(200, distance + radius * 10);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  camera.lookAt(center);
  controls.update();

  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [center.x, center.y, center.z],
    up: [camera.up.x, camera.up.y, camera.up.z],
  };
};

const fitCameraToGeometry = (
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  geometry: THREE.BufferGeometry,
  padding = 1.35
): VolumeCameraState | null => {
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere;
  if (!sphere || !Number.isFinite(sphere.radius) || sphere.radius <= 0) return null;

  return fitCameraToSphere(camera, controls, sphere.center, sphere.radius, padding);
};

const cameraStatesNearlyEqual = (
  first: VolumeCameraState | null | undefined,
  second: VolumeCameraState | null | undefined,
  epsilon = 1e-5
) => {
  if (!first || !second) return false;
  const close = (a: number, b: number) => Math.abs(a - b) <= epsilon;
  return first.position.every((value, index) => close(value, second.position[index]))
    && first.target.every((value, index) => close(value, second.target[index]))
    && first.up.every((value, index) => close(value, second.up[index]));
};

const getCropClippingPlanes = (
  center?: [number, number, number],
  extents?: [number, number, number]
): THREE.Plane[] => {
  if (!center || !extents) return [];
  const min = center.map((value, axis) => value - Math.abs(extents[axis])) as [number, number, number];
  const max = center.map((value, axis) => value + Math.abs(extents[axis])) as [number, number, number];
  return [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -min[0]),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), max[0]),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -min[1]),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), max[1]),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -min[2]),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), max[2]),
  ];
};

const getSliceCameraFrame = (
  grid: VolumeDataset["grid"],
  axis: SliceAxis,
  index: number,
  preset: "xy" | "xz" | "yz",
  convention: "scientific" | "radiological"
) => {
  const bounds = getGridBounds(grid);
  const slice = getSliceInfo(grid, axis, index);
  const center = new THREE.Vector3(...slice.plane.center);
  const normal = new THREE.Vector3(...slice.plane.normal).normalize();
  const up = new THREE.Vector3(...slice.plane.v).normalize();
  const scientificSide = preset === "xz" ? -1 : 1;
  const conventionSide = convention === "radiological" ? -1 : 1;
  const position = center
    .clone()
    .add(normal.multiplyScalar(Math.max(1, bounds.diag * 1.4) * scientificSide * conventionSide));
  return { center, position, up };
};

const findNearestPointOnMesh = (geom: THREE.BufferGeometry, point: THREE.Vector3) => {
  const pos = geom.getAttribute("position") as THREE.BufferAttribute | null;
  if (!pos) return null;
  const index = geom.getIndex();
  const posArr = pos.array as ArrayLike<number>;
  const idxArr = index?.array as ArrayLike<number> | undefined;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const tri = new THREE.Triangle();
  const closest = new THREE.Vector3();
  const best = new THREE.Vector3();
  let bestDist = Infinity;

  if (idxArr && idxArr.length >= 3) {
    const triCount = Math.floor(idxArr.length / 3);
    for (let i = 0; i < triCount; i++) {
      const ia = Number(idxArr[i * 3]) * 3;
      const ib = Number(idxArr[i * 3 + 1]) * 3;
      const ic = Number(idxArr[i * 3 + 2]) * 3;
      a.set(posArr[ia], posArr[ia + 1], posArr[ia + 2]);
      b.set(posArr[ib], posArr[ib + 1], posArr[ib + 2]);
      c.set(posArr[ic], posArr[ic + 1], posArr[ic + 2]);
      tri.set(a, b, c);
      tri.closestPointToPoint(point, closest);
      const dist = closest.distanceToSquared(point);
      if (dist < bestDist) {
        bestDist = dist;
        best.copy(closest);
      }
    }
  } else {
    const triCount = Math.floor(posArr.length / 9);
    for (let i = 0; i < triCount; i++) {
      const base = i * 9;
      a.set(posArr[base], posArr[base + 1], posArr[base + 2]);
      b.set(posArr[base + 3], posArr[base + 4], posArr[base + 5]);
      c.set(posArr[base + 6], posArr[base + 7], posArr[base + 8]);
      tri.set(a, b, c);
      tri.closestPointToPoint(point, closest);
      const dist = closest.distanceToSquared(point);
      if (dist < bestDist) {
        bestDist = dist;
        best.copy(closest);
      }
    }
  }

  if (!Number.isFinite(bestDist)) return null;
  return best;
};

export const VolumeViewer: React.FC<VolumeViewerProps> = ({
  dataset,
  vectorGrid,
  axis,
  index,
  opacity,
  crosshair = null,
  onSlicePick,
  onSliceStep,
  onResetCrosshair,
  coarseStep = 5,
  orientationConvention = "scientific",
  viewPreset = "free",
  showPrimarySlice = true,
  spatialSlices,
  spatialPlaneVisibility,
  showAxes = true,
  contourEnabled = false,
  contourCount = 6,
  windowMode = "auto",
  onSliceReport,
  onSliceHover,
  showIsosurface = false,
  isoValue = 0,
  isoSmoothing = false,
  isoSmoothingIterations = 20,
  showCropBox = false,
  cropCenter,
  cropExtents,
  cropGizmoEnabled = false,
  cropGizmoMode = "move",
  clipToCrop = false,
  onCropChange,
  cameraCommand,
  autoFitIsosurface = false,
  renderMode = "slice",
  transferFunction = getVolumeTransferPreset("grayscale"),
  renderQuality = "balanced",
  textureSampling = "linear",
  gradientOpacity = 0,
  gradientShading = false,
  renderWindow = [0, 1],
  onVolumeRenderStatus,
  initialCameraState = null,
  onCameraStateChange,
  showStreamlines = false,
  streamlineSeeds,
  streamlineStepSize,
  streamlineMaxSteps,
  streamlineMaxLength,
  captureToken = 0,
  onCaptureThumbnail,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);
  const sliceMeshRef = useRef<THREE.Mesh | null>(null);
  const sliceTextureRef = useRef<THREE.DataTexture | null>(null);
  const spatialPlanesGroupRef = useRef<THREE.Group | null>(null);
  const contourGroupRef = useRef<THREE.Group | null>(null);
  const hoverMarkerRef = useRef<THREE.Mesh | null>(null);
  const isoMeshRef = useRef<THREE.Mesh | null>(null);
  const isoMarkerRef = useRef<THREE.Mesh | null>(null);
  const directVolumeMeshRef = useRef<THREE.Mesh | null>(null);
  const directVolumeTextureRef = useRef<THREE.Data3DTexture | null>(null);
  const transferTextureRef = useRef<THREE.DataTexture | null>(null);
  const cpuProjectionTextureRef = useRef<THREE.DataTexture | null>(null);
  const directVolumeMaterialRef = useRef<THREE.RawShaderMaterial | null>(null);
  const streamlinesGroupRef = useRef<THREE.Group | null>(null);
  const cropBoxRef = useRef<THREE.LineSegments | null>(null);
  const cropGizmoRef = useRef<TransformControls | null>(null);
  const cropGizmoHelperRef = useRef<THREE.Object3D | null>(null);
  const cropDraggingRef = useRef(false);
  const crosshairGroupRef = useRef<THREE.Group | null>(null);
  const opacityRef = useRef(opacity);
  const [sliceData, setSliceData] = useState<VolumeSliceData | null>(null);
  const [sliceImage, setSliceImage] = useState<Image2D | null>(null);
  const sliceDataRef = useRef<VolumeSliceData | null>(null);
  const datasetRef = useRef<VolumeDataset | null>(dataset);
  const [hoverInfo, setHoverInfo] = useState<VolumeSliceHover | null>(null);
  const hoverInfoRef = useRef<VolumeSliceHover | null>(null);
  const onCropChangeRef = useRef(onCropChange);
  const onSlicePickRef = useRef(onSlicePick);
  const onSliceStepRef = useRef(onSliceStep);
  const hoverPendingRef = useRef<{ x: number; y: number } | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  const viewPresetRef = useRef(viewPreset);
  const orientationConventionRef = useRef(orientationConvention);
  const initialCameraStateRef = useRef(initialCameraState);
  const onCameraStateChangeRef = useRef(onCameraStateChange);
  const lastPublishedCameraStateRef = useRef<VolumeCameraState | null>(null);
  const cameraInteractingRef = useRef(false);
  const lastIsosurfaceAutoFitRef = useRef<{
    dataset: VolumeDataset;
    isoValue: number;
    smoothing: boolean;
    smoothingIterations: number;
  } | null>(initialCameraState && dataset ? {
    dataset,
    isoValue,
    smoothing: isoSmoothing,
    smoothingIterations: isoSmoothingIterations,
  } : null);
  const lastDatasetAutoFitRef = useRef<VolumeDataset | null>(initialCameraState ? dataset : null);
  const onVolumeRenderStatusRef = useRef(onVolumeRenderStatus);
  const renderModeRef = useRef(renderMode);
  const renderStepCountRef = useRef(volumeRenderStepCount(renderQuality));
  const [isoMeshToken, setIsoMeshToken] = useState(0);
  const [cameraFitTarget, setCameraFitTarget] = useState<"initial" | "mesh" | "volume" | "crop">("initial");
  const [cameraFitRevision, setCameraFitRevision] = useState(0);
  const [volumeContextToken, setVolumeContextToken] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [sliceRuntimeState, setSliceRuntimeState] = useState<VolumeSliceRuntimeState>({
    kind: dataset ? "loading" : "empty",
    message: dataset ? "Preparing volume slice…" : "No volume dataset selected.",
  });

  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  useEffect(() => {
    datasetRef.current = dataset;
  }, [dataset]);

  useEffect(() => {
    viewPresetRef.current = viewPreset;
  }, [viewPreset]);

  useEffect(() => {
    orientationConventionRef.current = orientationConvention;
  }, [orientationConvention]);

  useEffect(() => {
    onCameraStateChangeRef.current = onCameraStateChange;
  }, [onCameraStateChange]);

  const publishCameraState = useCallback((state: VolumeCameraState) => {
    lastPublishedCameraStateRef.current = state;
    onCameraStateChangeRef.current?.(state);
  }, []);

  const autoFitIsosurfaceOnce = useCallback((geometry: THREE.BufferGeometry, sourceDataset: VolumeDataset) => {
    const previousAutoFit = lastIsosurfaceAutoFitRef.current;
    const shouldAutoFit = autoFitIsosurface
      && viewPreset === "free"
      && !cameraInteractingRef.current
      && (!previousAutoFit
        || previousAutoFit.dataset !== sourceDataset
        || previousAutoFit.isoValue !== isoValue
        || previousAutoFit.smoothing !== isoSmoothing
        || previousAutoFit.smoothingIterations !== isoSmoothingIterations);
    if (!shouldAutoFit) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const state = fitCameraToGeometry(camera, controls, geometry);
    if (!state) return;
    lastIsosurfaceAutoFitRef.current = {
      dataset: sourceDataset,
      isoValue,
      smoothing: isoSmoothing,
      smoothingIterations: isoSmoothingIterations,
    };
    setCameraFitTarget("mesh");
    setCameraFitRevision((revision) => revision + 1);
    publishCameraState(state);
  }, [autoFitIsosurface, isoSmoothing, isoSmoothingIterations, isoValue, publishCameraState, viewPreset]);

  useEffect(() => {
    onVolumeRenderStatusRef.current = onVolumeRenderStatus;
  }, [onVolumeRenderStatus]);

  useEffect(() => {
    renderModeRef.current = renderMode;
  }, [renderMode]);

  useEffect(() => {
    renderStepCountRef.current = volumeRenderStepCount(renderQuality);
    if (directVolumeMaterialRef.current) directVolumeMaterialRef.current.uniforms.uStepCount.value = renderStepCountRef.current;
  }, [renderQuality]);

  useEffect(() => {
    sliceDataRef.current = sliceData;
  }, [sliceData]);

  useEffect(() => {
    hoverInfoRef.current = hoverInfo;
    if (onSliceHover) onSliceHover(hoverInfo);
  }, [hoverInfo, onSliceHover]);

  useEffect(() => {
    onCropChangeRef.current = onCropChange;
  }, [onCropChange]);

  useEffect(() => {
    if (!onCaptureThumbnail || !captureToken) return;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const cam = cameraRef.current;
    if (!renderer || !scene || !cam) {
      onCaptureThumbnail(null);
      return;
    }
    renderer.render(scene, cam);
    const src = renderer.domElement;
    const w = 240;
    const h = 160;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onCaptureThumbnail(null);
      return;
    }
    ctx.drawImage(src, 0, 0, w, h);
    onCaptureThumbnail(canvas.toDataURL("image/jpeg", 0.7));
  }, [captureToken]);

  useEffect(() => {
    onSlicePickRef.current = onSlicePick;
  }, [onSlicePick]);

  useEffect(() => {
    onSliceStepRef.current = onSliceStep;
  }, [onSliceStep]);

  useEffect(() => {
    if (axesHelperRef.current) {
      axesHelperRef.current.visible = showAxes;
    }
  }, [showAxes]);

  const sliceWindow = useMemo<VolumeSliceWindow | null>(() => {
    if (!sliceData) return null;
    const stats = sliceData.stats;
    const low = windowMode === "auto" ? stats.p02 : stats.min;
    const high = windowMode === "auto" ? stats.p98 : stats.max;
    return { low, high, mode: windowMode };
  }, [sliceData, windowMode]);

  useEffect(() => {
    if (!cropGizmoRef.current) return;
    cropGizmoRef.current.setMode(cropGizmoMode === "scale" ? "scale" : "translate");
    const enabled = !!cropGizmoEnabled && !!showCropBox;
    cropGizmoRef.current.enabled = enabled;
    if (cropGizmoHelperRef.current) {
      cropGizmoHelperRef.current.visible = enabled;
    }
  }, [cropGizmoMode, cropGizmoEnabled, showCropBox]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!sceneReady || !camera || !controls) return;
    controls.enableRotate = viewPreset === "free";
    controls.enablePan = viewPreset === "free";
    controls.enableZoom = viewPreset === "free";
    if (viewPreset === "free" || !dataset?.grid) return;

    const frame = getSliceCameraFrame(dataset.grid, axis, index, viewPreset, orientationConvention);
    camera.up.copy(frame.up);
    camera.position.copy(frame.position);
    camera.lookAt(frame.center);
    controls.target.copy(frame.center);
    controls.update();
  }, [axis, dataset, index, orientationConvention, viewPreset, sceneReady]);

  useEffect(() => {
    if (!sceneReady || !cameraCommand || cameraCommand.token <= 0 || viewPreset !== "free") return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    if (cameraCommand.kind === "fit-mesh" && isoMeshRef.current) {
      const state = fitCameraToGeometry(camera, controls, isoMeshRef.current.geometry);
      if (state) {
        setCameraFitTarget("mesh");
        setCameraFitRevision((revision) => revision + 1);
        publishCameraState(state);
      }
      return;
    }
    const gridBounds = dataset?.grid ? getGridBounds(dataset.grid) : { center: [0, 0, 0] as [number, number, number], diag: 2 };
    const useCrop = cameraCommand.kind === "fit-crop" && cropCenter && cropExtents;
    const center = new THREE.Vector3(...(useCrop ? cropCenter : gridBounds.center));
    const cropDiag = useCrop
      ? 2 * Math.hypot(cropExtents[0], cropExtents[1], cropExtents[2])
      : gridBounds.diag;
    const distance = Math.max(1, cropDiag * 1.4);
    camera.up.set(0, 1, 0);
    camera.position.set(center.x + distance * 0.9, center.y + distance * 0.82, center.z + distance);
    controls.target.copy(center);
    camera.lookAt(center);
    controls.update();
    setCameraFitTarget(useCrop ? "crop" : "volume");
    setCameraFitRevision((revision) => revision + 1);
    publishCameraState({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [center.x, center.y, center.z],
      up: [camera.up.x, camera.up.y, camera.up.z],
    });
  }, [cameraCommand, cropCenter, cropExtents, dataset, publishCameraState, sceneReady, viewPreset]);

  useEffect(() => {
    if (!sceneReady || viewPreset !== "free" || !initialCameraState) return;
    if (cameraInteractingRef.current) return;
    // Camera state emitted by this viewer is persisted by the parent and echoed
    // back through this prop. Reapplying that state while OrbitControls damping
    // is still settling produces a visible snap/flicker loop.
    if (cameraStatesNearlyEqual(initialCameraState, lastPublishedCameraStateRef.current)) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.set(...initialCameraState.position);
    camera.up.set(...initialCameraState.up);
    controls.target.set(...initialCameraState.target);
    camera.lookAt(controls.target);
    controls.update();
  }, [initialCameraState, sceneReady, viewPreset]);

  useEffect(() => {
    if (!sceneReady || viewPreset !== "free" || !autoFitIsosurface || !dataset?.grid) return;
    // Isosurfaces get a tighter fit after extraction. Other modes frame the full
    // physical grid so changing presets never inherits an unusable zoom level.
    if (showIsosurface && renderMode === "isosurface") return;
    if (lastDatasetAutoFitRef.current === dataset) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const bounds = getGridBounds(dataset.grid);
    const state = fitCameraToSphere(
      camera,
      controls,
      new THREE.Vector3(...bounds.center),
      Math.max(1e-6, bounds.diag * 0.5)
    );
    if (!state) return;
    lastDatasetAutoFitRef.current = dataset;
    setCameraFitTarget("volume");
    setCameraFitRevision((revision) => revision + 1);
    publishCameraState(state);
  }, [autoFitIsosurface, dataset, publishCameraState, renderMode, sceneReady, showIsosurface, viewPreset]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fb);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 200);
    camera.position.set(2.6, 2.4, 2.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.localClippingEnabled = true;
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);
    configureOrbitControlsForTouch(controls);
    const restoredCamera = initialCameraStateRef.current;
    if (restoredCamera) {
      camera.position.set(...restoredCamera.position);
      camera.up.set(...restoredCamera.up);
      controls.target.set(...restoredCamera.target);
      camera.lookAt(controls.target);
    }
    controls.update();
    const publishCurrentCameraState = () => {
      publishCameraState({
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
        up: [camera.up.x, camera.up.y, camera.up.z],
      });
    };
    const beginInteractiveRender = () => {
      cameraInteractingRef.current = true;
      const material = directVolumeMaterialRef.current;
      if (material) material.uniforms.uStepCount.value = Math.min(80, renderStepCountRef.current);
    };
    const finishInteractiveRender = () => {
      cameraInteractingRef.current = false;
      const material = directVolumeMaterialRef.current;
      if (material) material.uniforms.uStepCount.value = renderStepCountRef.current;
      publishCurrentCameraState();
    };
    controls.addEventListener("start", beginInteractiveRender);
    controls.addEventListener("end", finishInteractiveRender);
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      const grid = datasetRef.current?.grid;
      if (!grid) return;
      const plan = planVolumeRendering(grid.dims, { webgl2: false, max3dTextureSize: 0, budgetBytes: 0 });
      onVolumeRenderStatusRef.current?.({ state: "context-lost", plan, mode: renderModeRef.current, message: "WebGL context lost; orthogonal CPU slices remain available while the 3-D renderer recovers." });
    };
    const handleContextRestored = () => setVolumeContextToken((token) => token + 1);
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored);

    const axes = new THREE.AxesHelper(1.25);
    const axesMat = axes.material as THREE.Material | THREE.Material[];
    if (Array.isArray(axesMat)) {
      axesMat.forEach((m) => {
        m.depthTest = false;
      });
    } else {
      axesMat.depthTest = false;
    }
    axes.renderOrder = 5;
    axes.visible = showAxes;
    scene.add(axes);
    axesHelperRef.current = axes;

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(3.5, 4.2, 3.8);
    scene.add(dir);

    const contourGroup = new THREE.Group();
    contourGroup.renderOrder = 6;
    scene.add(contourGroup);
    contourGroupRef.current = contourGroup;

    const cropGizmo = new TransformControls(camera, renderer.domElement);
    cropGizmo.setMode(cropGizmoMode === "scale" ? "scale" : "translate");
    cropGizmo.setSpace("world");
    cropGizmo.enabled = !!cropGizmoEnabled;
    cropGizmo.setSize(0.9);
    const cropGizmoHelper = cropGizmo.getHelper();
    cropGizmoHelper.visible = !!cropGizmoEnabled;
    cropGizmoHelper.renderOrder = 9;
    cropGizmoHelper.traverse((child: any) => {
      if (!child) return;
      child.renderOrder = 9;
      const mat = child.material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      const setMat = (m: THREE.Material) => {
        m.depthTest = false;
        m.depthWrite = false;
        m.transparent = true;
      };
      if (Array.isArray(mat)) mat.forEach(setMat);
      else setMat(mat);
    });
    cropGizmo.addEventListener("dragging-changed", (evt: any) => {
      const dragging = !!evt?.value;
      cropDraggingRef.current = dragging;
      controls.enabled = !dragging;
    });
    cropGizmo.addEventListener("objectChange", () => {
      const obj = cropBoxRef.current;
      if (!obj) return;
      const center: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
      const extents: [number, number, number] = [
        Math.max(1e-6, Math.abs(obj.scale.x)),
        Math.max(1e-6, Math.abs(obj.scale.y)),
        Math.max(1e-6, Math.abs(obj.scale.z)),
      ];
      onCropChangeRef.current?.(center, extents);
    });
    scene.add(cropGizmoHelper);
    cropGizmoRef.current = cropGizmo;
    cropGizmoHelperRef.current = cropGizmoHelper;

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    setSceneReady(true);

    const handleResize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    // Establish the correct aspect before any automatic fit effect runs.
    handleResize();

    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);
    window.addEventListener("resize", handleResize);

    const refitCamera = () => {
      const preset = viewPresetRef.current;
      const grid = datasetRef.current?.grid;
      if (grid && preset !== "free") {
        const presetAxis: SliceAxis = preset === "xy" ? "z" : preset === "xz" ? "y" : "x";
        const axisIndex = presetAxis === "x" ? 0 : presetAxis === "y" ? 1 : 2;
        const presetIndex = Math.round((grid.dims[axisIndex] - 1) * 0.5);
        const frame = getSliceCameraFrame(grid, presetAxis, presetIndex, preset, orientationConventionRef.current);
        camera.up.copy(frame.up);
        camera.position.copy(frame.position);
        camera.lookAt(frame.center);
        controls.target.copy(frame.center);
      } else {
        const bounds = grid
          ? getGridBounds(grid)
          : { center: [0, 0, 0] as [number, number, number], diag: 2 };
        const center = new THREE.Vector3(...bounds.center);
        const dist = Math.max(1, bounds.diag * 1.4);
        const pos = center.clone();
        pos.set(center.x + dist * 0.9, center.y + dist * 0.82, center.z + dist);
        camera.up.set(0, 1, 0);
        camera.position.copy(pos);
        camera.lookAt(center);
        controls.target.copy(center);
      }
      controls.update();
    };

    const disposeTouchGestures = installViewerTouchGestures(renderer.domElement, {
      onDoubleTap: refitCamera,
    });

    let frameId = 0;
    const localCamera = new THREE.Vector3();
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      const directMesh = directVolumeMeshRef.current;
      const directMaterial = directVolumeMaterialRef.current;
      if (directMesh && directMaterial) {
        localCamera.copy(camera.position);
        directMesh.worldToLocal(localCamera);
        localCamera.addScalar(0.5);
        directMaterial.uniforms.uCameraTexture.value.copy(localCamera);
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      window.removeEventListener("resize", handleResize);
      disposeTouchGestures();
      controls.removeEventListener("start", beginInteractiveRender);
      controls.removeEventListener("end", finishInteractiveRender);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();

      if (sliceMeshRef.current) {
        scene.remove(sliceMeshRef.current);
        disposeMesh(sliceMeshRef.current);
        sliceMeshRef.current = null;
      }
      if (isoMeshRef.current) {
        scene.remove(isoMeshRef.current);
        disposeMesh(isoMeshRef.current);
        isoMeshRef.current = null;
      }
      if (directVolumeMeshRef.current) {
        scene.remove(directVolumeMeshRef.current);
        disposeMesh(directVolumeMeshRef.current);
        directVolumeMeshRef.current = null;
      }
      directVolumeTextureRef.current?.dispose();
      directVolumeTextureRef.current = null;
      transferTextureRef.current?.dispose();
      transferTextureRef.current = null;
      cpuProjectionTextureRef.current?.dispose();
      cpuProjectionTextureRef.current = null;
      directVolumeMaterialRef.current = null;
      if (contourGroupRef.current) {
        clearGroup(contourGroupRef.current);
        scene.remove(contourGroupRef.current);
        contourGroupRef.current = null;
      }
      if (spatialPlanesGroupRef.current) {
        clearGroup(spatialPlanesGroupRef.current);
        scene.remove(spatialPlanesGroupRef.current);
        spatialPlanesGroupRef.current = null;
      }
      if (streamlinesGroupRef.current) {
        clearGroup(streamlinesGroupRef.current);
        scene.remove(streamlinesGroupRef.current);
        streamlinesGroupRef.current = null;
      }
      if (hoverMarkerRef.current) {
        scene.remove(hoverMarkerRef.current);
        hoverMarkerRef.current.geometry.dispose();
        const mat = hoverMarkerRef.current.material as THREE.Material | undefined;
        if (mat) mat.dispose();
        hoverMarkerRef.current = null;
      }
      if (crosshairGroupRef.current) {
        clearGroup(crosshairGroupRef.current);
        scene.remove(crosshairGroupRef.current);
        crosshairGroupRef.current = null;
      }
      if (isoMarkerRef.current) {
        scene.remove(isoMarkerRef.current);
        isoMarkerRef.current.geometry.dispose();
        const mat = isoMarkerRef.current.material as THREE.Material | undefined;
        if (mat) mat.dispose();
        isoMarkerRef.current = null;
      }
      if (cropBoxRef.current) {
        scene.remove(cropBoxRef.current);
        cropBoxRef.current.geometry.dispose();
        const mat = cropBoxRef.current.material as THREE.Material | undefined;
        if (mat) mat.dispose();
        cropBoxRef.current = null;
      }
      if (cropGizmoHelperRef.current) {
        scene.remove(cropGizmoHelperRef.current);
        cropGizmoHelperRef.current = null;
      }
      if (cropGizmoRef.current) {
        cropGizmoRef.current.dispose();
        cropGizmoRef.current = null;
      }
      if (sliceTextureRef.current) {
        sliceTextureRef.current.dispose();
        sliceTextureRef.current = null;
      }
    };
  }, [publishCameraState]);

  useEffect(() => {
    if (!dataset?.grid) {
      setSliceData(null);
      setSliceImage(null);
      setHoverInfo(null);
      setSliceRuntimeState({ kind: "empty", message: "No volume dataset selected." });
      if (onSliceReport) onSliceReport(null);
      return;
    }
    const expectedSamples = dataset.grid.dims[0] * dataset.grid.dims[1] * dataset.grid.dims[2];
    const validDimensions = dataset.grid.dims.every((value) => Number.isInteger(value) && value > 0);
    if (!validDimensions || expectedSamples <= 0 || dataset.grid.scalars.length < expectedSamples) {
      setSliceData(null);
      setSliceImage(null);
      setHoverInfo(null);
      setSliceRuntimeState({
        kind: "invalid",
        message: `Invalid volume grid (${dataset.grid.scalars.length.toLocaleString()} of ${Math.max(0, expectedSamples).toLocaleString()} samples).`,
      });
      if (onSliceReport) onSliceReport(null);
      return;
    }
    if (expectedSamples > MAX_INTERACTIVE_VOLUME_SAMPLES) {
      setSliceData(null);
      setSliceImage(null);
      setHoverInfo(null);
      setSliceRuntimeState({
        kind: "unsupported",
        message: `Interactive slices support up to ${MAX_INTERACTIVE_VOLUME_SAMPLES.toLocaleString()} samples; this grid requests ${expectedSamples.toLocaleString()}.`,
      });
      if (onSliceReport) onSliceReport(null);
      return;
    }
    try {
      setSliceRuntimeState({ kind: "loading", message: `Preparing ${axis.toUpperCase()} slice…` });
      setSliceData(sliceVolumeData(dataset.grid, axis, index));
    } catch (error) {
      setSliceData(null);
      setSliceImage(null);
      setSliceRuntimeState({
        kind: "invalid",
        message: error instanceof Error ? error.message : "The volume slice could not be sampled.",
      });
      if (onSliceReport) onSliceReport(null);
    }
  }, [dataset, axis, index, onSliceReport]);

  useEffect(() => {
    if (!sliceData || !dataset?.grid) {
      setSliceImage(null);
      return;
    }

    let cancelled = false;
    const grid = dataset.grid;
    const total = grid.dims[0] * grid.dims[1] * grid.dims[2];
    const canUseVtk = supportsVtkVolumeSlice() && total > VTK_SLICE_THRESHOLD;
    const plane = sliceData.plane;
    const windowReq = sliceWindow ? { low: sliceWindow.low, high: sliceWindow.high } : undefined;
    const planeReq = plane
      ? {
          center: plane.center,
          normal: plane.normal,
          u: plane.u,
          v: plane.v,
          width: plane.width,
          height: plane.height,
          resolution: [sliceData.width, sliceData.height] as [number, number],
        }
      : undefined;

    (async () => {
      let backendFailure: string | null = null;
      try {
        if (canUseVtk) {
          const res = await vtkVolumeSlice({
            dims: grid.dims,
            scalars: grid.scalars,
            axis,
            index,
            spacing: grid.spacing,
            origin: grid.origin,
            plane: planeReq,
            window: windowReq,
          });
          if (!cancelled && res.ok) {
            setSliceImage({
              width: res.width,
              height: res.height,
              format: "rgba8",
              data: res.data,
              worldPlane: plane,
            });
            setSliceRuntimeState({ kind: "ready", message: "VTK slice ready." });
            return;
          }
          if (!res.ok) backendFailure = res.error;
        }
        if (!cancelled) {
          setSliceImage(buildSliceImage(sliceData, sliceWindow ?? undefined));
          setSliceRuntimeState(
            backendFailure
              ? { kind: "fallback", message: `VTK unavailable: ${backendFailure}. Showing CPU slice.` }
              : { kind: "ready", message: "CPU slice ready." }
          );
        }
      } catch (error) {
        if (!cancelled) {
          setSliceImage(null);
          setSliceRuntimeState({
            kind: "invalid",
            message: error instanceof Error ? error.message : "Volume slice rendering failed.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sliceData, sliceWindow, dataset, axis, index]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!showPrimarySlice || !sliceData || !sliceImage) {
      if (sliceMeshRef.current) {
        scene.remove(sliceMeshRef.current);
        disposeMesh(sliceMeshRef.current);
        sliceMeshRef.current = null;
      }
      if (sliceTextureRef.current) {
        sliceTextureRef.current.dispose();
        sliceTextureRef.current = null;
      }
      return;
    }

    const plane = sliceImage.worldPlane ?? sliceData.plane;
    const image = sliceImage;

    let texture = sliceTextureRef.current;
    if (!texture || texture.image.width !== image.width || texture.image.height !== image.height) {
      if (texture) texture.dispose();
      texture = new THREE.DataTexture(image.data, image.width, image.height, THREE.RGBAFormat);
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      sliceTextureRef.current = texture;
    } else {
      texture.image.data = image.data;
      texture.needsUpdate = true;
    }

    const safeOpacity = Math.min(1, Math.max(0, opacityRef.current));
    let mesh = sliceMeshRef.current;
    if (!mesh) {
      const geom = new THREE.PlaneGeometry(plane?.width ?? 1, plane?.height ?? 1);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: safeOpacity < 1,
        opacity: safeOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 3;
      scene.add(mesh);
      sliceMeshRef.current = mesh;
    } else {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.map = texture;
      mat.opacity = safeOpacity;
      mat.transparent = safeOpacity < 1;
      mat.needsUpdate = true;

      const geom = mesh.geometry as THREE.PlaneGeometry;
      const params = geom.parameters as { width: number; height: number };
      if (Math.abs(params.width - plane.width) > 1e-6 || Math.abs(params.height - plane.height) > 1e-6) {
        geom.dispose();
        mesh.geometry = new THREE.PlaneGeometry(plane.width, plane.height);
      }
    }

    if (plane && mesh) {
      mesh.position.set(plane.center[0], plane.center[1], plane.center[2]);
      const u = new THREE.Vector3(...plane.u).normalize();
      const v = new THREE.Vector3(...plane.v).normalize();
      const n = new THREE.Vector3(...plane.normal).normalize();
      const basis = new THREE.Matrix4().makeBasis(u, v, n);
      mesh.setRotationFromMatrix(basis);
    }
  }, [showPrimarySlice, sliceData, sliceImage]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (spatialPlanesGroupRef.current) {
      clearGroup(spatialPlanesGroupRef.current);
      scene.remove(spatialPlanesGroupRef.current);
      spatialPlanesGroupRef.current = null;
    }
    if (viewPreset !== "free" || !dataset?.grid || !spatialSlices) return;

    const group = new THREE.Group();
    group.name = "volume-spatial-slice-planes";
    const colors: Record<SliceAxis, number> = { x: 0xef4444, y: 0x22c55e, z: 0x3b82f6 };
    const clippingPlanes = clipToCrop ? getCropClippingPlanes(cropCenter, cropExtents) : [];
    for (const [axisOrder, sliceAxis] of (["x", "y", "z"] as const).entries()) {
      if (spatialPlaneVisibility?.[sliceAxis] === false) continue;
      const data = sliceVolumeData(dataset.grid, sliceAxis, spatialSlices[sliceAxis]);
      const image = buildSliceImage(data);
      const texture = new THREE.DataTexture(image.data, image.width, image.height, THREE.RGBAFormat);
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: colors[sliceAxis],
        transparent: true,
        opacity: Math.min(0.72, Math.max(0.16, opacity * 0.55)),
        side: THREE.DoubleSide,
        depthWrite: false,
        clippingPlanes,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(data.plane.width, data.plane.height), material);
      mesh.name = `volume-spatial-plane-${sliceAxis}`;
      mesh.position.set(...data.plane.center);
      const basis = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...data.plane.u).normalize(),
        new THREE.Vector3(...data.plane.v).normalize(),
        new THREE.Vector3(...data.plane.normal).normalize()
      );
      mesh.setRotationFromMatrix(basis);
      // Deterministic ordering prevents intersecting transparent slice planes
      // from swapping order as the camera moves.
      mesh.renderOrder = 3 + axisOrder * 0.01;
      group.add(mesh);
    }
    scene.add(group);
    spatialPlanesGroupRef.current = group;
    return () => {
      if (spatialPlanesGroupRef.current === group) spatialPlanesGroupRef.current = null;
      clearGroup(group);
      scene.remove(group);
    };
  }, [clipToCrop, cropCenter, cropExtents, dataset, opacity, spatialPlaneVisibility, spatialSlices, viewPreset]);

  useEffect(() => {
    if (!sliceData || !sliceWindow || !onSliceReport) {
      if (onSliceReport) onSliceReport(null);
      return;
    }
    onSliceReport({
      ...sliceData.stats,
      width: sliceData.width,
      height: sliceData.height,
      window: sliceWindow,
    });
  }, [sliceData, sliceWindow, onSliceReport]);

  useEffect(() => {
    const group = contourGroupRef.current;
    if (!group) return;

    clearGroup(group);
    if (!sliceData || !contourEnabled) return;

    const count = Math.max(1, Math.min(16, Math.round(contourCount)));
    const low = sliceWindow?.low ?? sliceData.stats.min;
    const high = sliceWindow?.high ?? sliceData.stats.max;
    const span = high - low;
    if (!Number.isFinite(span) || Math.abs(span) < 1e-12) return;

    const levels: number[] = [];
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      levels.push(low + t * span);
    }

    const polylines = volumeSliceContours(sliceData, levels);
    if (!polylines.length) return;

    const n = new THREE.Vector3(...sliceData.plane.normal).normalize();
    const offset = Math.max(1e-4, Math.min(sliceData.plane.width, sliceData.plane.height) * 0.002);
    const offsetVec = n.multiplyScalar(offset);

    for (const line of polylines) {
      if (line.length < 2) continue;
      const points = line.map((pt) => new THREE.Vector3(pt.x, pt.y, pt.z).add(offsetVec));
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: 0x1f3556,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new THREE.Line(geom, mat);
      mesh.renderOrder = 4;
      group.add(mesh);
    }
  }, [sliceData, contourEnabled, contourCount, sliceWindow]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) return;

    const dom = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane();
    const tmp = new THREE.Vector3();
    let dragging = false;

    const pickAt = (clientX: number, clientY: number) => {
      const data = sliceDataRef.current;
      const grid = datasetRef.current?.grid;
      if (!data || !grid) return null;

      const rect = dom.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      const normal = new THREE.Vector3(...data.plane.normal).normalize();
      const center = new THREE.Vector3(...data.plane.center);
      plane.setFromNormalAndCoplanarPoint(normal, center);
      const hit = raycaster.ray.intersectPlane(plane, tmp);
      if (!hit) return null;

      const u = new THREE.Vector3(...data.plane.u).normalize();
      const v = new THREE.Vector3(...data.plane.v).normalize();
      const rel = hit.clone().sub(center);
      const s = rel.dot(u);
      const t = rel.dot(v);
      const halfW = data.plane.width * 0.5;
      const halfH = data.plane.height * 0.5;
      if (Math.abs(s) > halfW + 1e-6 || Math.abs(t) > halfH + 1e-6) {
        return null;
      }

      const world: [number, number, number] = [hit.x, hit.y, hit.z];
      const value = sampleGridTrilinear(grid, world);
      const gradMag = gradientMagnitudeAt(grid, world);
      return { world, value, gradMag };
    };

    const process = () => {
      hoverRafRef.current = null;
      const pending = hoverPendingRef.current;
      if (!pending) return;
      const hit = pickAt(pending.x, pending.y);
      if (!hit) {
        setHoverInfo(null);
        return;
      }

      const { world, value, gradMag } = hit;
      const prev = hoverInfoRef.current;
      if (
        prev &&
        Math.abs(prev.world[0] - world[0]) < 1e-6 &&
        Math.abs(prev.world[1] - world[1]) < 1e-6 &&
        Math.abs(prev.world[2] - world[2]) < 1e-6
      ) {
        return;
      }
      setHoverInfo({ world, value, gradMag });
    };

    const handleMove = (e: PointerEvent) => {
      hoverPendingRef.current = { x: e.clientX, y: e.clientY };
      if (hoverRafRef.current !== null) return;
      hoverRafRef.current = window.requestAnimationFrame(process);
      if (dragging && (e.buttons & 1) === 1 && !cropDraggingRef.current) {
        const hit = pickAt(e.clientX, e.clientY);
        if (hit) onSlicePickRef.current?.(hit.world, axis);
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || cropDraggingRef.current || viewPresetRef.current === "free") return;
      dragging = true;
      dom.setPointerCapture?.(e.pointerId);
      const hit = pickAt(e.clientX, e.clientY);
      if (hit) onSlicePickRef.current?.(hit.world, axis);
    };

    const handlePointerUp = (e: PointerEvent) => {
      dragging = false;
      if (dom.hasPointerCapture?.(e.pointerId)) dom.releasePointerCapture?.(e.pointerId);
    };

    const handleClick = (e: MouseEvent) => {
      if (e.button !== 0 || cropDraggingRef.current) return;
      const hit = pickAt(e.clientX, e.clientY);
      if (!hit) return;
      onSlicePickRef.current?.(hit.world, axis);
    };

    const handleWheel = (e: WheelEvent) => {
      if (viewPresetRef.current === "free" || !onSliceStepRef.current || e.deltaY === 0) return;
      e.preventDefault();
      onSliceStepRef.current(axis, e.deltaY > 0 ? 1 : -1, e.shiftKey || e.ctrlKey || e.altKey || e.metaKey);
    };

    const handleLeave = () => {
      hoverPendingRef.current = null;
      if (hoverRafRef.current !== null) {
        window.cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
      setHoverInfo(null);
    };

    dom.addEventListener("pointermove", handleMove);
    dom.addEventListener("pointerdown", handlePointerDown);
    dom.addEventListener("pointerup", handlePointerUp);
    dom.addEventListener("pointercancel", handlePointerUp);
    dom.addEventListener("click", handleClick);
    dom.addEventListener("pointerleave", handleLeave);
    dom.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      dom.removeEventListener("pointermove", handleMove);
      dom.removeEventListener("pointerdown", handlePointerDown);
      dom.removeEventListener("pointerup", handlePointerUp);
      dom.removeEventListener("pointercancel", handlePointerUp);
      dom.removeEventListener("click", handleClick);
      dom.removeEventListener("pointerleave", handleLeave);
      dom.removeEventListener("wheel", handleWheel);
      if (hoverRafRef.current !== null) {
        window.cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const data = sliceDataRef.current;

    if (!hoverInfo || !data) {
      if (hoverMarkerRef.current) {
        scene.remove(hoverMarkerRef.current);
        hoverMarkerRef.current.geometry.dispose();
        const mat = hoverMarkerRef.current.material as THREE.Material | undefined;
        if (mat) mat.dispose();
        hoverMarkerRef.current = null;
      }
      return;
    }

    const normal = new THREE.Vector3(...data.plane.normal).normalize();
    const offset = Math.max(1e-4, Math.min(data.plane.width, data.plane.height) * 0.003);
    const radius = Math.max(0.01, Math.min(data.plane.width, data.plane.height) * 0.01);

    if (!hoverMarkerRef.current) {
      const geom = new THREE.SphereGeometry(radius, 14, 14);
      const mat = new THREE.MeshBasicMaterial({ color: 0xe1563b });
      const marker = new THREE.Mesh(geom, mat);
      marker.renderOrder = 7;
      hoverMarkerRef.current = marker;
      scene.add(marker);
    }

    hoverMarkerRef.current.position.set(hoverInfo.world[0], hoverInfo.world[1], hoverInfo.world[2]);
    hoverMarkerRef.current.position.add(normal.multiplyScalar(offset));
  }, [hoverInfo]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!crosshair || !dataset?.grid) {
      if (crosshairGroupRef.current) {
        clearGroup(crosshairGroupRef.current);
        scene.remove(crosshairGroupRef.current);
        crosshairGroupRef.current = null;
      }
      return;
    }

    const bounds = getGridBounds(dataset.grid);
    const [x, y, z] = crosshair;

    let group = crosshairGroupRef.current;
    if (!group) {
      group = new THREE.Group();
      group.renderOrder = 8;
      scene.add(group);
      crosshairGroupRef.current = group;
    } else {
      clearGroup(group);
    }

    const makeLine = (a: THREE.Vector3, b: THREE.Vector3) => {
      const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
      const mat = new THREE.LineBasicMaterial({
        color: 0x2563eb,
        transparent: true,
        opacity: 0.7,
        depthTest: false,
        depthWrite: false,
      });
      const line = new THREE.Line(geom, mat);
      line.renderOrder = 8;
      return line;
    };
    const data = sliceDataRef.current;
    if (viewPreset !== "free" && data) {
      const normal = new THREE.Vector3(...data.plane.normal).normalize();
      const planeCenter = new THREE.Vector3(...data.plane.center);
      const projected = new THREE.Vector3(x, y, z);
      projected.addScaledVector(normal, -projected.clone().sub(planeCenter).dot(normal));
      const u = new THREE.Vector3(...data.plane.u).normalize().multiplyScalar(data.plane.width * 0.5);
      const v = new THREE.Vector3(...data.plane.v).normalize().multiplyScalar(data.plane.height * 0.5);
      group.add(makeLine(projected.clone().sub(u), projected.clone().add(u)));
      group.add(makeLine(projected.clone().sub(v), projected.clone().add(v)));
    } else {
      group.add(makeLine(new THREE.Vector3(bounds.min[0], y, z), new THREE.Vector3(bounds.max[0], y, z)));
      group.add(makeLine(new THREE.Vector3(x, bounds.min[1], z), new THREE.Vector3(x, bounds.max[1], z)));
      group.add(makeLine(new THREE.Vector3(x, y, bounds.min[2]), new THREE.Vector3(x, y, bounds.max[2])));
    }

    const radius = Math.max(0.01, bounds.diag * 0.012);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0x2563eb, depthTest: false, depthWrite: false })
    );
    marker.position.set(x, y, z);
    marker.renderOrder = 9;
    group.add(marker);
  }, [crosshair, dataset, sliceData, viewPreset]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!showIsosurface || !crosshair || !isoMeshRef.current) {
      if (isoMarkerRef.current) {
        scene.remove(isoMarkerRef.current);
        isoMarkerRef.current.geometry.dispose();
        const mat = isoMarkerRef.current.material as THREE.Material | undefined;
        if (mat) mat.dispose();
        isoMarkerRef.current = null;
      }
      return;
    }

    const geom = isoMeshRef.current.geometry as THREE.BufferGeometry | undefined;
    if (!geom) return;
    const nearest = findNearestPointOnMesh(geom, new THREE.Vector3(...crosshair));
    if (!nearest) return;

    const bounds = dataset?.grid ? getGridBounds(dataset.grid) : null;
    const radius = Math.max(0.01, (bounds?.diag ?? 1) * 0.012);

    let marker = isoMarkerRef.current;
    if (!marker) {
      marker = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false, depthWrite: false })
      );
      marker.renderOrder = 9;
      isoMarkerRef.current = marker;
      scene.add(marker);
    } else {
      const geomSphere = marker.geometry as THREE.SphereGeometry;
      if (geomSphere.parameters.radius !== radius) {
        marker.geometry.dispose();
        marker.geometry = new THREE.SphereGeometry(radius, 14, 14);
      }
    }

    marker.position.copy(nearest);
  }, [crosshair, showIsosurface, isoMeshToken, dataset]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!showCropBox || !cropCenter || !cropExtents) {
      if (cropBoxRef.current) {
        scene.remove(cropBoxRef.current);
        cropBoxRef.current.geometry.dispose();
        const mat = cropBoxRef.current.material as THREE.Material | undefined;
        if (mat) mat.dispose();
        cropBoxRef.current = null;
      }
      if (cropGizmoRef.current) {
        cropGizmoRef.current.detach();
      }
      if (cropGizmoHelperRef.current) {
        cropGizmoHelperRef.current.visible = false;
      }
      return;
    }

    if (!cropBoxRef.current) {
      const geom = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2));
      const mat = new THREE.LineBasicMaterial({
        color: 0x6b7280,
        transparent: true,
        opacity: 0.55,
        depthTest: false,
      });
      const box = new THREE.LineSegments(geom, mat);
      box.renderOrder = 2;
      cropBoxRef.current = box;
      scene.add(box);
    }

    if (!cropDraggingRef.current && cropBoxRef.current) {
      cropBoxRef.current.position.set(cropCenter[0], cropCenter[1], cropCenter[2]);
      cropBoxRef.current.scale.set(
        Math.max(1e-6, cropExtents[0]),
        Math.max(1e-6, cropExtents[1]),
        Math.max(1e-6, cropExtents[2])
      );
    }

    if (cropGizmoRef.current && cropBoxRef.current) {
      cropGizmoRef.current.attach(cropBoxRef.current);
      const enabled = !!cropGizmoEnabled && !!showCropBox;
      cropGizmoRef.current.enabled = enabled;
      if (cropGizmoHelperRef.current) {
        cropGizmoHelperRef.current.visible = enabled;
      }
    }
  }, [showCropBox, cropCenter, cropExtents, cropGizmoEnabled]);

  useEffect(() => {
    const clippingPlanes = clipToCrop ? getCropClippingPlanes(cropCenter, cropExtents) : [];
    for (const mesh of [sliceMeshRef.current, isoMeshRef.current, directVolumeMeshRef.current]) {
      if (!mesh) continue;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        material.clippingPlanes = clippingPlanes;
        material.needsUpdate = true;
      }
    }
  }, [clipToCrop, cropCenter, cropExtents, isoMeshToken, sliceImage]);

  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer || viewPreset !== "free") return;

    const clearDirectVolume = () => {
      if (directVolumeMeshRef.current) {
        scene.remove(directVolumeMeshRef.current);
        disposeMesh(directVolumeMeshRef.current);
        directVolumeMeshRef.current = null;
      }
      directVolumeTextureRef.current?.dispose();
      directVolumeTextureRef.current = null;
      transferTextureRef.current?.dispose();
      transferTextureRef.current = null;
      cpuProjectionTextureRef.current?.dispose();
      cpuProjectionTextureRef.current = null;
      directVolumeMaterialRef.current = null;
    };

    if (!dataset?.grid || renderMode === "slice" || renderMode === "isosurface") {
      clearDirectVolume();
      if (dataset?.grid) {
        const plan = planVolumeRendering(dataset.grid.dims, { webgl2: renderer.capabilities.isWebGL2, max3dTextureSize: 0, budgetBytes: 128 * 1024 * 1024 });
        onVolumeRenderStatusRef.current?.({ state: "idle", plan, mode: renderMode, message: renderMode === "slice" ? "Orthogonal slice rendering active." : "Explicit isosurface rendering active." });
      }
      return;
    }

    const gl = renderer.getContext();
    const gl2 = gl as WebGL2RenderingContext;
    const max3dTextureSize = renderer.capabilities.isWebGL2 ? Number(gl2.getParameter(gl2.MAX_3D_TEXTURE_SIZE)) || 0 : 0;
    const plan = planVolumeRendering(dataset.grid.dims, {
      webgl2: renderer.capabilities.isWebGL2,
      max3dTextureSize,
      budgetBytes: 128 * 1024 * 1024,
    });
    if (plan.path !== "gpu-3d-texture") {
      clearDirectVolume();
      const projection = renderVolumeProjectionCpu({
        scalars: dataset.grid.scalars,
        dimensions: dataset.grid.dims,
        mode: renderMode,
        transferFunction,
        window: renderWindow,
      });
      const texture = new THREE.DataTexture(projection.rgba, projection.width, projection.height, THREE.RGBAFormat, THREE.UnsignedByteType);
      texture.minFilter = textureSampling === "nearest" ? THREE.NearestFilter : THREE.LinearFilter;
      texture.magFilter = textureSampling === "nearest" ? THREE.NearestFilter : THREE.LinearFilter;
      texture.needsUpdate = true;
      cpuProjectionTextureRef.current = texture;
      const bounds = getGridBounds(dataset.grid);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.position.set(...bounds.center);
      mesh.scale.set(Math.max(1e-6, bounds.max[0] - bounds.min[0]), Math.max(1e-6, bounds.max[1] - bounds.min[1]), 1);
      mesh.renderOrder = 1;
      scene.add(mesh);
      directVolumeMeshRef.current = mesh;
      onVolumeRenderStatusRef.current?.({
        state: "fallback",
        plan,
        mode: renderMode,
        message: `${plan.message} Showing a deterministic CPU projection; orthogonal CPU slices remain visible.`,
      });
      return;
    }

    clearDirectVolume();
    const scalars = dataset.grid.scalars;
    let minimum = Infinity;
    let maximum = -Infinity;
    for (let index = 0; index < scalars.length; index += 1) {
      const value = scalars[index];
      if (!Number.isFinite(value)) continue;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
      onVolumeRenderStatusRef.current?.({ state: "unsupported", plan, mode: renderMode, message: "Direct rendering requires at least one finite scalar; orthogonal CPU slices remain visible." });
      return;
    }
    const span = Math.max(1e-12, maximum - minimum);
    const windowLow = Math.max(0, Math.min(1, Math.min(renderWindow[0], renderWindow[1])));
    const windowHigh = Math.max(windowLow + 1e-6, Math.min(1, Math.max(renderWindow[0], renderWindow[1])));
    const textureValues = Uint8Array.from(scalars, (value) => {
      if (!Number.isFinite(value)) return 0;
      const normalized = (value - minimum) / span;
      return Math.round(Math.max(0, Math.min(1, (normalized - windowLow) / (windowHigh - windowLow))) * 255);
    });
    const volumeTexture = new THREE.Data3DTexture(textureValues, dataset.grid.dims[0], dataset.grid.dims[1], dataset.grid.dims[2]);
    volumeTexture.format = THREE.RedFormat;
    volumeTexture.type = THREE.UnsignedByteType;
    volumeTexture.minFilter = textureSampling === "nearest" ? THREE.NearestFilter : THREE.LinearFilter;
    volumeTexture.magFilter = textureSampling === "nearest" ? THREE.NearestFilter : THREE.LinearFilter;
    volumeTexture.unpackAlignment = 1;
    volumeTexture.needsUpdate = true;
    directVolumeTextureRef.current = volumeTexture;

    const transferTexture = new THREE.DataTexture(createVolumeTransferTextureData(transferFunction), 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    transferTexture.minFilter = THREE.LinearFilter;
    transferTexture.magFilter = THREE.LinearFilter;
    transferTexture.needsUpdate = true;
    transferTextureRef.current = transferTexture;

    const modeIndex = renderMode === "mip" ? 0 : renderMode === "minip" ? 1 : renderMode === "average" ? 2 : 3;
    const bounds = getGridBounds(dataset.grid);
    const axisSpan = bounds.max.map((value, axis) => Math.max(1e-9, value - bounds.min[axis])) as [number, number, number];
    const cropMin = clipToCrop && cropCenter && cropExtents
      ? cropCenter.map((value, axis) => Math.max(0, Math.min(1, (value - Math.abs(cropExtents[axis]) - bounds.min[axis]) / axisSpan[axis]))) as [number, number, number]
      : [0, 0, 0] as [number, number, number];
    const cropMax = clipToCrop && cropCenter && cropExtents
      ? cropCenter.map((value, axis) => Math.max(0, Math.min(1, (value + Math.abs(cropExtents[axis]) - bounds.min[axis]) / axisSpan[axis]))) as [number, number, number]
      : [1, 1, 1] as [number, number, number];
    const material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: DIRECT_VOLUME_VERTEX_SHADER,
      fragmentShader: DIRECT_VOLUME_FRAGMENT_SHADER,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uVolume: { value: volumeTexture },
        uTransfer: { value: transferTexture },
        uCameraTexture: { value: new THREE.Vector3(2, 2, 2) },
        uVoxelStep: { value: new THREE.Vector3(1 / Math.max(1, dataset.grid.dims[0] - 1), 1 / Math.max(1, dataset.grid.dims[1] - 1), 1 / Math.max(1, dataset.grid.dims[2] - 1)) },
        uStepCount: { value: volumeRenderStepCount(renderQuality) },
        uGradientOpacity: { value: gradientOpacity },
        uGradientShading: { value: gradientShading },
        uMode: { value: modeIndex },
        uCropMin: { value: new THREE.Vector3(...cropMin) },
        uCropMax: { value: new THREE.Vector3(...cropMax) },
      },
    });
    directVolumeMaterialRef.current = material;
    renderStepCountRef.current = volumeRenderStepCount(renderQuality);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.position.set(...bounds.center);
    mesh.scale.set(Math.max(1e-6, bounds.max[0] - bounds.min[0]), Math.max(1e-6, bounds.max[1] - bounds.min[1]), Math.max(1e-6, bounds.max[2] - bounds.min[2]));
    mesh.renderOrder = 1;
    scene.add(mesh);
    directVolumeMeshRef.current = mesh;
    onVolumeRenderStatusRef.current?.({ state: "ready", plan, mode: renderMode, message: `${renderMode.toUpperCase()} ray marching ready · ${renderStepCountRef.current} samples · ${textureSampling} sampling.` });

    return clearDirectVolume;
  }, [clipToCrop, cropCenter, cropExtents, dataset, gradientOpacity, gradientShading, renderMode, renderQuality, renderWindow, textureSampling, transferFunction, viewPreset, volumeContextToken]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!showIsosurface || renderMode !== "isosurface" || !dataset?.grid) {
      if (isoMeshRef.current) {
        scene.remove(isoMeshRef.current);
        disposeMesh(isoMeshRef.current);
        isoMeshRef.current = null;
      }
      return;
    }

    let cancelled = false;

    (async () => {
      const res = await vtkVolumeIsosurface({
        dims: dataset.grid.dims,
        scalars: dataset.grid.scalars,
        iso: isoValue,
        spacing: dataset.grid.spacing,
        origin: dataset.grid.origin,
      });

      if (cancelled) return;
      if (!res.ok) {
        const cpu = buildCpuIsosurface(dataset.grid, isoValue);
        if (!cpu) {
          if (isoMeshRef.current) {
            scene.remove(isoMeshRef.current);
            disposeMesh(isoMeshRef.current);
            isoMeshRef.current = null;
          }
          console.warn("[volume] isosurface failed", res.error);
          return;
        }

        let mesh = isoMeshRef.current;
        if (!mesh) {
          const geom = new THREE.BufferGeometry();
          const mat = new THREE.MeshStandardMaterial({
            color: 0x5b6f91,
            roughness: 0.4,
            metalness: 0.1,
            side: THREE.DoubleSide,
          });
          mesh = new THREE.Mesh(geom, mat);
          mesh.renderOrder = 1;
          scene.add(mesh);
          isoMeshRef.current = mesh;
        }

        mesh.geometry.dispose();
        mesh.geometry = cpu;
        mesh.position.set(0, 0, 0);
        mesh.scale.set(1, 1, 1);
        autoFitIsosurfaceOnce(cpu, dataset);
        setIsoMeshToken((t) => t + 1);
        return;
      }

      let meshData = res;
      if (isoSmoothing) {
        const smoothRes = await vtkSmooth(meshData.positions, meshData.indices, {
          iterations: isoSmoothingIterations,
          passband: 0.1,
          computeNormals: true,
        });
        if (!cancelled && smoothRes.ok) {
          meshData = smoothRes;
        }
      }

      if (cancelled) return;

      let mesh = isoMeshRef.current;
      if (!mesh) {
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.MeshStandardMaterial({
          color: 0x5b6f91,
          roughness: 0.4,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
        mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = 1;
        scene.add(mesh);
        isoMeshRef.current = mesh;
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(meshData.positions, 3));
      geom.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
      if (meshData.normals && meshData.normals.length) {
        geom.setAttribute("normal", new THREE.BufferAttribute(meshData.normals, 3));
      } else {
        geom.computeVertexNormals();
      }
      geom.computeBoundingSphere();
      geom.computeBoundingBox();

      mesh.geometry.dispose();
      mesh.geometry = geom;
      mesh.position.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      autoFitIsosurfaceOnce(geom, dataset);
      setIsoMeshToken((t) => t + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [autoFitIsosurfaceOnce, dataset, showIsosurface, isoValue, isoSmoothing, isoSmoothingIterations, renderMode]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (streamlinesGroupRef.current) {
      scene.remove(streamlinesGroupRef.current);
      clearGroup(streamlinesGroupRef.current);
      streamlinesGroupRef.current = null;
    }

    if (!showStreamlines || !vectorGrid || !streamlineSeeds?.length) return;

    let cancelled = false;

    (async () => {
      const res = await vtkVolumeStreamlines({
        dims: vectorGrid.dims,
        vectors: vectorGrid.vectors,
        spacing: vectorGrid.spacing,
        origin: vectorGrid.origin,
        seeds: streamlineSeeds,
        stepSize: streamlineStepSize,
        maxSteps: streamlineMaxSteps,
        maxLength: streamlineMaxLength,
      });

      if (cancelled || !res.ok) {
        if (!res.ok) {
          console.warn("[volume] streamlines failed", res.error);
        }
        return;
      }

      const spacing = vectorGrid.spacing ?? [1, 1, 1];
      const dims = vectorGrid.dims;
      const spanX = Math.max(0, (dims[0] - 1) * spacing[0]);
      const spanY = Math.max(0, (dims[1] - 1) * spacing[1]);
      const spanZ = Math.max(0, (dims[2] - 1) * spacing[2]);
      const diag = Math.sqrt(spanX * spanX + spanY * spanY + spanZ * spanZ);
      const tubeRadius = Math.max(0.0012, diag * 0.004);
      const radialSegments = 8;

      const group = new THREE.Group();
      group.renderOrder = 4;

      for (const line of res.lines) {
        if (!line || line.length < 2) continue;
        const points = line.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        const path = new THREE.CurvePath<THREE.Vector3>();
        for (let i = 0; i + 1 < points.length; i++) {
          path.add(new THREE.LineCurve3(points[i], points[i + 1]));
        }
        const tubularSegments = Math.min(2000, Math.max(60, points.length * 3));
        const geom = new THREE.TubeGeometry(path, tubularSegments, tubeRadius, radialSegments, false);
        const mat = new THREE.MeshBasicMaterial({
          color: 0x1f9fbf,
          transparent: true,
          opacity: 0.85,
          depthTest: false,
          depthWrite: false,
        });
        const tube = new THREE.Mesh(geom, mat);
        tube.renderOrder = 4;
        tube.frustumCulled = false;
        group.add(tube);
      }

      if (!group.children.length) return;
      scene.add(group);
      streamlinesGroupRef.current = group;
    })();

    return () => {
      cancelled = true;
    };
  }, [
    showStreamlines,
    vectorGrid,
    streamlineSeeds,
    streamlineStepSize,
    streamlineMaxSteps,
    streamlineMaxLength,
  ]);

  useEffect(() => {
    const mesh = sliceMeshRef.current;
    if (!mesh) return;
    const safeOpacity = Math.min(1, Math.max(0, opacity));
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = safeOpacity;
    mat.transparent = safeOpacity < 1;
    mat.needsUpdate = true;
  }, [opacity]);

  const showBlockingState =
    sliceRuntimeState.kind === "empty" ||
    sliceRuntimeState.kind === "invalid" ||
    sliceRuntimeState.kind === "unsupported";
  const showProgressState = sliceRuntimeState.kind === "loading";
  const showFallbackState = sliceRuntimeState.kind === "fallback";
  const orientationLabels = useMemo(() => {
    const horizontal = viewPreset === "yz" ? "Y" : "X";
    const vertical = viewPreset === "xy" ? "Y" : "Z";
    const sign = orientationConvention === "scientific" ? "+" : "−";
    return { horizontal: `${sign}${horizontal}`, vertical: `+${vertical}` };
  }, [orientationConvention, viewPreset]);
  const handleNavigationKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (viewPreset === "free") return;
    if (event.key === "Home") {
      event.preventDefault();
      onResetCrosshair?.();
      return;
    }
    let delta = 0;
    let coarse = event.shiftKey;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") delta = 1;
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") delta = -1;
    if (event.key === "PageUp") {
      delta = 1;
      coarse = true;
    }
    if (event.key === "PageDown") {
      delta = -1;
      coarse = true;
    }
    if (!delta) return;
    event.preventDefault();
    onSliceStep?.(axis, delta, coarse);
  };

  return (
    <div
      data-testid={`volume-slice-viewer-${viewPreset}`}
      data-camera-fit-target={viewPreset === "free" ? cameraFitTarget : undefined}
      data-camera-fit-revision={viewPreset === "free" ? cameraFitRevision : undefined}
      style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, position: "relative" }}
      tabIndex={viewPreset === "free" ? -1 : 0}
      role={viewPreset === "free" ? undefined : "application"}
      aria-label={viewPreset === "free" ? undefined : `${viewPreset.toUpperCase()} volume slice, ${orientationConvention} orientation. Arrow keys step one slice; Shift or Page keys step ${coarseStep}; Home resets.`}
      onKeyDown={handleNavigationKeyDown}
    >
      <div ref={mountRef} style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0 }} />
      {viewPreset !== "free" && (
        <>
          <div
            data-testid={`volume-orientation-${viewPreset}-horizontal`}
            style={{ position: "absolute", right: 8, top: "50%", color: "#1d4ed8", fontSize: 10, fontWeight: 900, pointerEvents: "none", zIndex: 4 }}
          >
            {orientationLabels.horizontal}
          </div>
          <div
            data-testid={`volume-orientation-${viewPreset}-vertical`}
            style={{ position: "absolute", left: "50%", top: 7, color: "#15803d", fontSize: 10, fontWeight: 900, pointerEvents: "none", zIndex: 4 }}
          >
            {orientationLabels.vertical}
          </div>
        </>
      )}
      {(showBlockingState || showProgressState) && (
        <div
          data-testid={`volume-slice-state-${sliceRuntimeState.kind}`}
          role={sliceRuntimeState.kind === "invalid" || sliceRuntimeState.kind === "unsupported" ? "alert" : "status"}
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            padding: 18,
            background: showBlockingState ? "rgba(248,250,252,0.94)" : "rgba(248,250,252,0.72)",
            color:
              sliceRuntimeState.kind === "invalid" || sliceRuntimeState.kind === "unsupported"
                ? "#b42318"
                : "#475569",
            fontSize: 11,
            fontWeight: 700,
            textAlign: "center",
            zIndex: 5,
          }}
        >
          {sliceRuntimeState.message}
        </div>
      )}
      {showFallbackState && (
        <div
          data-testid="volume-slice-state-fallback"
          role="status"
          title={sliceRuntimeState.message}
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            maxWidth: "calc(100% - 16px)",
            border: "1px solid #f5c26b",
            borderRadius: 7,
            background: "rgba(255,251,235,0.94)",
            color: "#92400e",
            padding: "4px 7px",
            fontSize: 9,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            zIndex: 5,
          }}
        >
          Backend fallback · CPU slice
        </div>
      )}
    </div>
  );
};
