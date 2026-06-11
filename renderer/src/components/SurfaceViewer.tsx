// src/components/SurfaceViewer.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { ParametricGeometry } from "three/examples/jsm/geometries/ParametricGeometry.js";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { buildGraphContours } from "../math/contours";
import { computePrincipalCurvatureAtUV, type PrincipalCurvatureResult } from "../math/principalCurvature";
import { integratePrincipalStreamlineBidirectional, stabilizePrincipalResult } from "../math/principalStreamlines";
import { stabilizeTangentDirection } from "../math/curvatureDirections";
import { marchingSquares } from "../math/marchingSquares";
import { buildStreamlineSegments, buildVertexAdjacency, traceStreamlineBidirectional } from "../math/curvatureLines";
import { buildVertexAdjacency as buildRidgeAdjacency, detectRidgeValleySegments } from "../math/ridgeValley";
import { stitchRidgeValleyCurves } from "../math/ridgeValleyStitch";
import { integrateGeodesic } from "../math/geodesic";

import { scalarToColor01, type ColorPalette, solidColorForPalette } from "./colorPalette";
import type { GaussPoint } from "./gaussMapUtils";
import type { MeshValidation } from "../mesh/surfaceMesh";
import AxisGizmo from "./AxisGizmo";
import { Slice2DPreview, buildSliceSvgString } from "./Slice2DPreview";
import { compileExpression } from "../math/expression";
import type { ColorMode as CoreColorMode, SurfaceId as CoreSurfaceId } from "@math3d/core";
import {
  buildSurfaceSampleSetFromViewer,
  getNonIndexedDrawCount,
  type SurfaceSampleSet,
} from "../math/sampling/surfaceSampling";
import type { SelectionMask } from "../math/selection/selectionModel";
import type { PolylineSet } from "../scene/renderPrimitives";
import {
  createLayeredReferenceGrid,
  DEFAULT_REFERENCE_PLANE_GRID_SETTINGS,
  type ReferencePlaneGridSettings,
} from "@math3d/renderer-web";

export type ColorMode = CoreColorMode;

export type SlicePreset = "xy" | "yz" | "xz" | "custom";
export type SliceNormal = { x: number; y: number; z: number };
type GraphDomain = { xSpan: number; ySpan: number };
export type CameraSyncState = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
};
export type ViewportDebugSnapshot = {
  viewer: "surface" | "param";
  phase: string;
  ts: number;
  mount: { width: number; height: number };
  canvasCss: { width: number; height: number };
  drawingBuffer: { width: number; height: number };
  pixelRatio: number;
  devicePixelRatio: number;
  camera: {
    aspect: number;
    fov: number;
    distance: number;
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  };
};
export type SurfacePerformanceSnapshot = {
  ts: number;
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  vertices: number;
  meshObjects: number;
  overlayObjects: number;
  raycastTimeMs: number;
  lastMeshBuildMs: number | null;
  lodLevel: "Performance" | "Balanced" | "Full";
  bvhStatus: "Off";
  gpuMemoryEstimateBytes: number;
  gpuMemoryEstimateLabel: string;
  rendererMemory: {
    geometries: number;
    textures: number;
  };
};
export type RenderQuality = "performance" | "balanced" | "sharp";
export type MeshRuntimeQuality = "interactive-preview" | "balanced" | "accurate";
export type MeshInteractionQualityMode = "full" | "adaptive" | "fast-preview";
export type SceneBackgroundMode = "default" | "calm" | "transparent";
export type CameraTourMode =
  | "balanced"
  | "orbit"
  | "zoom"
  | "spiral"
  | "quick"
  | "long"
  | "long_orbit"
  | "long_zoom"
  | "long_spiral";
export type CameraTourCaptureFormat = "mp4" | "webm";
export type CameraTourCommand = {
  token: number;
  action: "play" | "stop";
  center?: { x: number; y: number; z: number };
  radius?: number;
  durationMs?: number;
  mode?: CameraTourMode;
  captureVideo?: boolean;
  captureFps?: number;
  captureFileName?: string;
  captureFormat?: CameraTourCaptureFormat;
};
export type CameraFitCommand = {
  token: number;
  center: { x: number; y: number; z: number };
  radius: number;
  padding?: number;
};
export type CameraTourEvent =
  | "started"
  | "completed"
  | "stopped"
  | "interrupted"
  | "capture_saved"
  | "capture_saved_mp4"
  | "capture_saved_webm"
  | "capture_fallback_webm"
  | "capture_unsupported"
  | "capture_error";
type ImplicitMeshOverride = {
  positions: number[];
  indices: number[];
};

type SurfaceMeshOverride = {
  id?: string;
  positions: ArrayLike<number>;
  indices?: ArrayLike<number> | null;
  normals?: ArrayLike<number> | null;
  uvs?: ArrayLike<number> | null;
  adjacency?: number[][] | null;
  meanEdgeLength?: number | null;
  validation?: MeshValidation | null;
  color?: number;
  opacity?: number;
  roughness?: number;
  metalness?: number;
  wireframe?: boolean;
  flatShading?: boolean;
  transform?: {
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
  };
};

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const DEFAULT_MESH_PREVIEW_TRIANGLE_TARGET = 100_000;
const IDLE_RENDER_MIN_FRAME_MS = 1000 / 8;

type SurfaceMeshLodBuffers = {
  positions: Float32Array;
  indices: Uint32Array | null;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  fullTriangleCount: number;
  activeTriangleCount: number;
};

const clampInt = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)));

const normalizePositiveInt = (value: number, fallback: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return fallback;
  return clampInt(value, min, max);
};

const triangleCountFromBuffers = (positions: ArrayLike<number>, indices?: ArrayLike<number> | null) => {
  if (indices && indices.length >= 3) return Math.floor(indices.length / 3);
  return Math.floor((positions.length ?? 0) / 9);
};

const computeMeshPreviewTriangleTarget = (
  fullTriangles: number,
  runtimeQuality: MeshRuntimeQuality,
  mode: MeshInteractionQualityMode,
  previewTriangleTarget: number
) => {
  if (fullTriangles <= 0) return 0;
  if (mode === "full") return fullTriangles;

  // Fast-preview is an explicit persistent quality mode and must stay decimated
  // even when interaction settles back to "accurate" runtime state.
  if (mode === "fast-preview") {
    if (fullTriangles < 12_000) return fullTriangles;
    const minVisibleTriangles = 600;
    const rawTarget =
      fullTriangles < 50_000
        ? Math.round(fullTriangles * 0.55)
        : fullTriangles < 250_000
          ? Math.round(fullTriangles * 0.35)
            : fullTriangles <= 1_000_000
              ? Math.round(fullTriangles * 0.2)
              : Math.min(previewTriangleTarget, 80_000);
    const clampedTarget = Math.max(
      Math.min(minVisibleTriangles, fullTriangles),
      Math.min(rawTarget, previewTriangleTarget)
    );
    return Math.max(1, Math.min(clampedTarget, fullTriangles));
  }

  if (runtimeQuality === "accurate") return fullTriangles;

  if (runtimeQuality === "balanced") {
    if (fullTriangles < 250_000) return fullTriangles;
    if (fullTriangles <= 1_000_000) return Math.max(1, Math.round(fullTriangles * 0.6));
    return Math.max(1, Math.min(fullTriangles, Math.max(previewTriangleTarget * 2, Math.round(fullTriangles * 0.35))));
  }

  if (fullTriangles < 50_000) return fullTriangles;
  if (fullTriangles < 250_000) return Math.max(1, Math.round(fullTriangles * 0.5));
  if (fullTriangles <= 1_000_000) {
    const lower = Math.max(1, Math.round(fullTriangles * 0.1));
    const upper = Math.max(lower, Math.round(fullTriangles * 0.25));
    return clampInt(previewTriangleTarget, lower, upper);
  }
  return Math.max(1, Math.min(previewTriangleTarget, 120_000));
};

const buildSurfaceMeshLodBuffers = (
  override: SurfaceMeshOverride,
  runtimeQuality: MeshRuntimeQuality,
  mode: MeshInteractionQualityMode,
  previewTriangleTarget: number
): SurfaceMeshLodBuffers => {
  const positions = override.positions instanceof Float32Array ? override.positions : Float32Array.from(override.positions ?? []);
  const normalsRaw = override.normals;
  const uvsRaw = override.uvs;
  const indicesRaw = override.indices;
  const fullTriangles = triangleCountFromBuffers(positions, indicesRaw);
  const targetTriangles = computeMeshPreviewTriangleTarget(fullTriangles, runtimeQuality, mode, previewTriangleTarget);
  if (targetTriangles <= 0 || targetTriangles >= fullTriangles) {
    return {
      positions,
      indices: indicesRaw ? Uint32Array.from(indicesRaw) : null,
      normals: normalsRaw ? (normalsRaw instanceof Float32Array ? normalsRaw : Float32Array.from(normalsRaw)) : null,
      uvs: uvsRaw ? (uvsRaw instanceof Float32Array ? uvsRaw : Float32Array.from(uvsRaw)) : null,
      fullTriangleCount: fullTriangles,
      activeTriangleCount: fullTriangles,
    };
  }

  if (indicesRaw && indicesRaw.length >= 3) {
    const fullTriCount = Math.floor(indicesRaw.length / 3);
    const sampled: number[] = [];
    for (let i = 0; i < targetTriangles; i += 1) {
      const tri = Math.min(fullTriCount - 1, Math.floor(((i + 0.5) * fullTriCount) / targetTriangles));
      const base = tri * 3;
      sampled.push(indicesRaw[base], indicesRaw[base + 1], indicesRaw[base + 2]);
    }
    return {
      positions,
      indices: Uint32Array.from(sampled),
      normals: normalsRaw ? (normalsRaw instanceof Float32Array ? normalsRaw : Float32Array.from(normalsRaw)) : null,
      uvs: uvsRaw ? (uvsRaw instanceof Float32Array ? uvsRaw : Float32Array.from(uvsRaw)) : null,
      fullTriangleCount: fullTriangles,
      activeTriangleCount: Math.floor(sampled.length / 3),
    };
  }

  const fullTriCount = Math.floor(positions.length / 9);
  const sampledTriCount = Math.max(1, Math.min(targetTriangles, fullTriCount));
  const nextPositions = new Float32Array(sampledTriCount * 9);
  const nextNormals =
    normalsRaw && normalsRaw.length >= positions.length ? new Float32Array(sampledTriCount * 9) : null;
  const nextUvs =
    uvsRaw && uvsRaw.length >= Math.floor((positions.length / 3) * 2) ? new Float32Array(sampledTriCount * 6) : null;
  const normals = normalsRaw as ArrayLike<number> | null;
  const uvs = uvsRaw as ArrayLike<number> | null;
  for (let outTri = 0; outTri < sampledTriCount; outTri += 1) {
    const tri = Math.min(fullTriCount - 1, Math.floor(((outTri + 0.5) * fullTriCount) / sampledTriCount));
    const srcPosBase = tri * 9;
    nextPositions.set(positions.subarray(srcPosBase, srcPosBase + 9), outTri * 9);
    if (nextNormals && normals) {
      const outPosBase = outTri * 9;
      for (let j = 0; j < 9; j += 1) {
        nextNormals[outPosBase + j] = normals[srcPosBase + j];
      }
    }
    if (nextUvs && uvs) {
      const srcUvBase = tri * 6;
      const outUvBase = outTri * 6;
      for (let j = 0; j < 6; j += 1) {
        nextUvs[outUvBase + j] = uvs[srcUvBase + j];
      }
    }
  }
  return {
    positions: nextPositions,
    indices: null,
    normals: nextNormals,
    uvs: nextUvs,
    fullTriangleCount: fullTriangles,
    activeTriangleCount: sampledTriCount,
  };
};

const applySurfaceMeshOverrideTransform = (
  object: THREE.Object3D,
  transform?: {
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
  }
) => {
  const position = transform?.position;
  const rotation = transform?.rotation;
  const scale = transform?.scale;
  object.position.set(
    Number.isFinite(position?.x) ? Number(position?.x) : 0,
    Number.isFinite(position?.y) ? Number(position?.y) : 0,
    Number.isFinite(position?.z) ? Number(position?.z) : 0
  );
  object.rotation.set(
    (Number.isFinite(rotation?.x) ? Number(rotation?.x) : 0) * DEG_TO_RAD,
    (Number.isFinite(rotation?.y) ? Number(rotation?.y) : 0) * DEG_TO_RAD,
    (Number.isFinite(rotation?.z) ? Number(rotation?.z) : 0) * DEG_TO_RAD
  );
  object.scale.set(
    Math.max(1e-6, Number.isFinite(scale?.x) ? Number(scale?.x) : 1),
    Math.max(1e-6, Number.isFinite(scale?.y) ? Number(scale?.y) : 1),
    Math.max(1e-6, Number.isFinite(scale?.z) ? Number(scale?.z) : 1)
  );
  object.updateMatrixWorld(true);
};

export type OverlayPointSet = {
  points: { x: number; y: number; z: number }[];
  color?: number;
  size?: number;
  opacity?: number;
};
type DragPlaneAnchor = {
  point: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  meshKey?: string;
};
export type OverlayPolylineGroup = {
  lines: PolylineSet;
  color: number;
  opacity?: number;
  radiusScale?: number;
};
export type OverlayLabel = {
  text: string;
  position: { x: number; y: number; z: number };
  color?: number;
  backgroundColor?: number;
  backgroundOpacity?: number;
  borderColor?: number;
  size?: number;
  opacity?: number;
};
export type OverlayLabelSet = {
  labels: OverlayLabel[];
  font?: string;
  color?: number;
  opacity?: number;
  size?: number;
};
export type OverlayMeshGroup = {
  positions: ArrayLike<number>;
  indices?: ArrayLike<number> | null;
  color: number;
  opacity?: number;
  doubleSided?: boolean;
};
type SurfaceDecompositionCell = {
  id: string;
  kind: "graph" | "mesh";
  i?: number;
  j?: number;
  meshKey?: string;
  triangleIndex?: number;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  area: number;
  corners: THREE.Vector3[];
  invalidReason?: "non_finite" | "degenerate" | "out_of_bounds";
};
type SurfaceDecompositionDiagnostics = {
  validCells: number;
  maskedCells: number;
  invalidCells: number;
  skippedNonFinite: number;
  skippedDegenerate: number;
  skippedOutOfBounds: number;
  minArea: number | null;
  maxArea: number | null;
  avgArea: number | null;
};

const DBG_COLORS = false;
const TAU = Math.PI * 2;

function disposeObject3D(obj: THREE.Object3D) {
  const anyObj = obj as any;
  if (anyObj.geometry && typeof anyObj.geometry.dispose === "function") {
    anyObj.geometry.dispose();
  }
  const mat = anyObj.material as THREE.Material | THREE.Material[] | undefined;
  if (mat) {
    const disposeMat = (m: THREE.Material) => {
      const anyMat = m as any;
      if (anyMat?.map && typeof anyMat.map.dispose === "function") {
        anyMat.map.dispose();
      }
      m.dispose();
    };
    if (Array.isArray(mat)) mat.forEach((m) => disposeMat(m));
    else disposeMat(mat);
  }
}

function clearGroup(group: THREE.Group) {
  const children = [...group.children];
  children.forEach((child) => {
    child.traverse(disposeObject3D);
    group.remove(child);
  });
}

const PROBE_HUD_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

const formatProbeNumber = (value: number) => (Number.isFinite(value) ? value.toFixed(3) : "nan");

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
};

function isImplicitMeshObj(obj: THREE.Object3D) {
  const anyObj = obj as any;
  if (anyObj?.isMarchingCubes) return true;
  if (anyObj?.isMesh && anyObj.userData?.__implicit) return true;
  return false;
}

export type SurfaceId = CoreSurfaceId;

export type ProbeInfo = {
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  uv?: { u: number; v: number };
  xy?: { x: number; y: number };
};

type GizmoView = "xy" | "xyNeg" | "xz" | "xzNeg" | "yz" | "yzNeg" | "iso";
type GizmoMenuView = "front" | "back" | "left" | "right" | "top" | "bottom" | "iso";

const GIZMO_MENU_ITEMS: Array<{ id: GizmoMenuView; label: string }> = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
  { id: "iso", label: "Iso" },
];

const iconCommonProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true as const,
};

const LockGlyph: React.FC<{ locked: boolean }> = ({ locked }) => (
  <svg {...iconCommonProps}>
    <rect x="5" y="11" width="14" height="9" rx="2.3" />
    <path d={locked ? "M8 11V8a4 4 0 1 1 8 0v3" : "M8 11V8a4 4 0 0 1 8 0"} />
  </svg>
);

const ResetGlyph: React.FC = () => (
  <svg {...iconCommonProps}>
    <path d="M20 12a8 8 0 1 1-2.35-5.66" />
    <path d="M20 5v5h-5" />
  </svg>
);

const MenuGlyph: React.FC = () => (
  <svg {...iconCommonProps}>
    <circle cx="6" cy="12" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.7" fill="currentColor" stroke="none" />
  </svg>
);

/* ---------- helpers ---------- */

// world convention for graphs:
// (x, height=z, yDomain)  =>  world = (x, y, z) = (x, f(x,yDomain), yDomain)

function makeGraphGeometry(
  f: (x: number, y: number) => number,
  xMax = 1.5,
  yMax = 1.5,
  nx = 80,
  ny = 80
) {
  const clampGraphHeight = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    const LIM = 1e4;
    if (value > LIM) return LIM;
    if (value < -LIM) return -LIM;
    return value;
  };
  return new ParametricGeometry(
    (u, v, target) => {
      const x = (u - 0.5) * 2 * xMax;
      const y = (v - 0.5) * 2 * yMax;
      const z = clampGraphHeight(f(x, y));
      target.set(x, z, y);
    },
    nx,
    ny
  );
}

function makeGraphContourLines(
  f: (x: number, y: number) => number,
  xMax: number,
  yMax: number,
  levelCount: number,
  gridN = 140
): THREE.LineSegments {
  const safeF = (x: number, y: number) => {
    const v = f(x, y);
    if (!Number.isFinite(v)) return 0;
    const LIM = 1e4;
    if (v > LIM) return LIM;
    if (v < -LIM) return -LIM;
    return v;
  };
  const { geometry } = buildGraphContours(safeF, {
    xMin: -xMax,
    xMax: xMax,
    yMin: -yMax,
    yMax: yMax,
    gridN,
    levelCount,
  });

  // convert from (x,y,z=f) to world (x, z, y)
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    pos.setXYZ(i, x, z, y);
  }
  pos.needsUpdate = true;

  const mat = new THREE.LineBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.85,
  });

  const lines = new THREE.LineSegments(geometry, mat);
  lines.position.y += 1e-3;
  lines.renderOrder = 10;

  return lines;
}

function hsvToRgb(h: number, s: number, v: number) {
  const hh = ((h % 1) + 1) % 1;
  const c = v * s;
  const x = c * (1 - Math.abs((hh * 6) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;

  const seg = Math.floor(hh * 6);
  switch (seg) {
    case 0: r = c; g = x; b = 0; break;
    case 1: r = x; g = c; b = 0; break;
    case 2: r = 0; g = c; b = x; break;
    case 3: r = 0; g = x; b = c; break;
    case 4: r = x; g = 0; b = c; break;
    default: r = c; g = 0; b = x; break;
  }

  return { r: r + m, g: g + m, b: b + m };
}

function applyPhaseColors(geometry: THREE.BufferGeometry) {
  const pos = geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos) return;
  const count = pos.count;
  if (!count) return;

  const values = new Float32Array(count);
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < count; i++) {
    const re = pos.getY(i);
    const im = pos.getZ(i);
    const logR = Math.log(Math.hypot(re, im) + 1e-9);
    values[i] = logR;
    if (logR < min) min = logR;
    if (logR > max) max = logR;
  }

  let range = max - min;
  if (!Number.isFinite(range) || range === 0) range = 1;

  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let v = (values[i] - min) / range;
    if (v < 0) v = 0;
    else if (v > 1) v = 1;
    v = 0.15 + 0.85 * v;
    const re = pos.getY(i);
    const im = pos.getZ(i);
    const h = ((Math.atan2(im, re) / TAU) + 1) % 1;
    const { r, g, b } = hsvToRgb(h, 1, v);
    colors[3 * i] = r;
    colors[3 * i + 1] = g;
    colors[3 * i + 2] = b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  (geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  stampGeom(geometry, "phase");
}

function applyVertexColors(
  geometry: THREE.BufferGeometry,
  colorMode: ColorMode,
  palette: ColorPalette
) {
  if (colorMode === "solid") {
    geometry.deleteAttribute("color");
    return;
  }

  if (colorMode === "phase") {
    applyPhaseColors(geometry);
    return;
  }

  const pos = geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos) return;

  const count = pos.count;
  if (!count) return;

  const values = new Float32Array(count);
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    // keep your semantics:
    // height -> y, otherwise -> radius
    const v = colorMode === "height" ? y : Math.sqrt(x * x + y * y + z * z);

    values[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  let range = max - min;
  if (!Number.isFinite(range) || range === 0) range = 1;

  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    let t = (values[i] - min) / range;
    // clamp to [0,1] (avoids weirdness on degenerate ranges)
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    const { r, g, b } = scalarToColor01(t, palette);
    colors[3 * i] = r;
    colors[3 * i + 1] = g;
    colors[3 * i + 2] = b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  (geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;

  stampGeom(geometry, `vertexColors mode=${colorMode} palette=${palette} min=${min.toFixed(3)} max=${max.toFixed(3)}`);

  if (DBG_COLORS) {
    console.log("[applyVertexColors] done", { colorMode, palette, min, max, range, colorAttr: colorAttrStats(geometry) });
  }

}

function applyHeatmapColors(
  geometry: THREE.BufferGeometry,
  values: ArrayLike<number>,
  palette: ColorPalette
) {
  const pos = geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos) return;
  const count = pos.count;
  if (!count) return;
  if (!values || values.length !== count) return;

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  let range = max - min;
  if (!Number.isFinite(range) || range === 0) range = 1;

  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let t = (values[i] - min) / range;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const { r, g, b } = scalarToColor01(t, palette);
    colors[3 * i] = r;
    colors[3 * i + 1] = g;
    colors[3 * i + 2] = b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  (geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;

  stampGeom(geometry, `heatmap palette=${palette} min=${min.toFixed(3)} max=${max.toFixed(3)}`);
}

function sampleImplicitDerivatives(
  f: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
  h = 1e-2
) {
  const fx = (f(x + h, y, z) - f(x - h, y, z)) / (2 * h);
  const fy = (f(x, y + h, z) - f(x, y - h, z)) / (2 * h);
  const fz = (f(x, y, z + h) - f(x, y, z - h)) / (2 * h);

  const fxx = (f(x + h, y, z) - 2 * f(x, y, z) + f(x - h, y, z)) / (h * h);
  const fyy = (f(x, y + h, z) - 2 * f(x, y, z) + f(x, y - h, z)) / (h * h);
  const fzz = (f(x, y, z + h) - 2 * f(x, y, z) + f(x, y, z - h)) / (h * h);

  const fxy = (f(x + h, y + h, z) - f(x + h, y - h, z) - f(x - h, y + h, z) + f(x - h, y - h, z)) / (4 * h * h);
  const fxz = (f(x + h, y, z + h) - f(x + h, y, z - h) - f(x - h, y, z + h) + f(x - h, y, z - h)) / (4 * h * h);
  const fyz = (f(x, y + h, z + h) - f(x, y + h, z - h) - f(x, y - h, z + h) + f(x, y - h, z - h)) / (4 * h * h);

  return { fx, fy, fz, fxx, fyy, fzz, fxy, fxz, fyz };
}

function projectPointToImplicitSurface(
  f: (x: number, y: number, z: number) => number,
  point: THREE.Vector3,
  opts?: { iterations?: number; tol?: number; h?: number; maxStep?: number }
) {
  const iterations = Math.max(1, Math.floor(opts?.iterations ?? 5));
  const tol = Math.max(1e-8, opts?.tol ?? 1e-4);
  const h = Math.max(1e-6, opts?.h ?? 1e-3);
  const maxStep = Math.max(1e-4, opts?.maxStep ?? 0.2);

  for (let i = 0; i < iterations; i++) {
    const v = f(point.x, point.y, point.z);
    if (!Number.isFinite(v)) break;
    if (Math.abs(v) <= tol) break;

    const d = sampleImplicitDerivatives(f, point.x, point.y, point.z, h);
    const g2 = d.fx * d.fx + d.fy * d.fy + d.fz * d.fz;
    if (!Number.isFinite(g2) || g2 < 1e-12) break;

    let step = v / g2;
    if (step > maxStep) step = maxStep;
    else if (step < -maxStep) step = -maxStep;

    point.x -= step * d.fx;
    point.y -= step * d.fy;
    point.z -= step * d.fz;
  }

  return point;
}

function applyImplicitCurvatureColors(
  geometry: THREE.BufferGeometry,
  f: (x: number, y: number, z: number) => number,
  palette: ColorPalette
) {
  const pos = geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos) return;

  const count = pos.count;
  if (!count) return;

  const values = new Float32Array(count);
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const d = sampleImplicitDerivatives(f, x, y, z);
    const gx = d.fx;
    const gy = d.fy;
    const gz = d.fz;
    const g2 = gx * gx + gy * gy + gz * gz;
    const gLen = Math.sqrt(g2);
    let H = 0;
    if (gLen > 1e-8 && Number.isFinite(gLen)) {
      const num =
        d.fxx * (gy * gy + gz * gz) +
        d.fyy * (gx * gx + gz * gz) +
        d.fzz * (gx * gx + gy * gy) -
        2 * (gx * gy * d.fxy + gx * gz * d.fxz + gy * gz * d.fyz);
      H = num / (2 * gLen * gLen * gLen);
    }
    const v = Math.log10(1 + Math.abs(H));
    values[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  let range = max - min;
  if (!Number.isFinite(range) || range === 0) range = 1;

  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let t = (values[i] - min) / range;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const { r, g, b } = scalarToColor01(t, palette);
    colors[3 * i] = r;
    colors[3 * i + 1] = g;
    colors[3 * i + 2] = b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  (geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
}

function buildImplicitNormalLines(
  geometry: THREE.BufferGeometry,
  f: (x: number, y: number, z: number) => number,
  scale = 0.2
) {
  const pos = geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos) return null;

  const count = pos.count;
  if (!count) return null;

  const stride = Math.max(1, Math.floor(count / 800));
  const positions: number[] = [];

  for (let i = 0; i < count; i += stride) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const d = sampleImplicitDerivatives(f, x, y, z);
    const gx = d.fx;
    const gy = d.fy;
    const gz = d.fz;
    const gLen = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (!Number.isFinite(gLen) || gLen < 1e-8) continue;
    const nx = gx / gLen;
    const ny = gy / gLen;
    const nz = gz / gLen;

    positions.push(x, y, z, x + nx * scale, y + ny * scale, z + nz * scale);
  }

  if (positions.length === 0) return null;

  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x1f3556, transparent: true, opacity: 0.85 });
  const lines = new THREE.LineSegments(lineGeom, lineMat);
  lines.frustumCulled = false;
  return lines;
}

type ImplicitPrincipalResult = {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  dir1: THREE.Vector3;
  dir2: THREE.Vector3;
  k1: number;
  k2: number;
  H: number;
  K: number;
  isUmbilic: boolean;
};

function computeImplicitPrincipalAtPoint(
  f: (x: number, y: number, z: number) => number,
  point: THREE.Vector3,
  h = 1e-2
): ImplicitPrincipalResult | null {
  const d = sampleImplicitDerivatives(f, point.x, point.y, point.z, h);
  const gx = d.fx;
  const gy = d.fy;
  const gz = d.fz;
  const g2 = gx * gx + gy * gy + gz * gz;
  const gLen = Math.sqrt(g2);
  if (!Number.isFinite(gLen) || gLen < 1e-8) return null;

  const normal = new THREE.Vector3(gx, gy, gz).multiplyScalar(1 / gLen);
  const { e1, e2 } = makePlaneBasis(normal);

  const h11 = d.fxx;
  const h22 = d.fyy;
  const h33 = d.fzz;
  const h12 = d.fxy;
  const h13 = d.fxz;
  const h23 = d.fyz;

  const He1 = new THREE.Vector3(
    h11 * e1.x + h12 * e1.y + h13 * e1.z,
    h12 * e1.x + h22 * e1.y + h23 * e1.z,
    h13 * e1.x + h23 * e1.y + h33 * e1.z
  );
  const He2 = new THREE.Vector3(
    h11 * e2.x + h12 * e2.y + h13 * e2.z,
    h12 * e2.x + h22 * e2.y + h23 * e2.z,
    h13 * e2.x + h23 * e2.y + h33 * e2.z
  );

  const s11 = -e1.dot(He1) / gLen;
  const s12 = -e1.dot(He2) / gLen;
  const s22 = -e2.dot(He2) / gLen;

  const tr = s11 + s22;
  const det = s11 * s22 - s12 * s12;
  const disc = Math.max(0, (tr * tr) * 0.25 - det);
  const root = Math.sqrt(disc);
  const k1 = tr * 0.5 + root;
  const k2 = tr * 0.5 - root;
  const isUmbilic = Math.abs(k1 - k2) < 1e-5;

  const eigenVec = (k: number) => {
    if (Math.abs(s12) < 1e-10) {
      return Math.abs(s11 - k) <= Math.abs(s22 - k) ? { x: 1, y: 0 } : { x: 0, y: 1 };
    }
    const x = s12;
    const y = k - s11;
    const len = Math.hypot(x, y);
    return len > 1e-12 ? { x: x / len, y: y / len } : { x: 1, y: 0 };
  };

  const v1 = eigenVec(k1);
  const v2 = eigenVec(k2);
  const dir1 = e1.clone().multiplyScalar(v1.x).addScaledVector(e2, v1.y).normalize();
  const dir2 = e1.clone().multiplyScalar(v2.x).addScaledVector(e2, v2.y).normalize();

  return {
    point: point.clone(),
    normal,
    dir1,
    dir2,
    k1,
    k2,
    H: (k1 + k2) * 0.5,
    K: k1 * k2,
    isUmbilic,
  };
}


const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function colorAttrStats(geom: THREE.BufferGeometry) {
  const a = geom.getAttribute("color") as THREE.BufferAttribute | null;
  if (!a) return { has: false };

  let mn = +Infinity, mx = -Infinity;
  // sample up to ~200 points (avoid heavy logs)
  const step = Math.max(1, Math.floor(a.count / 200));
  for (let i = 0; i < a.count; i += step) {
    const r = a.getX(i), g = a.getY(i), b = a.getZ(i);
    mn = Math.min(mn, r, g, b);
    mx = Math.max(mx, r, g, b);
  }
  return { has: true, count: a.count, min: mn, max: mx, itemSize: a.itemSize };
}

function stampGeom(geom: THREE.BufferGeometry, stamp: string) {
  (geom as any).userData = (geom as any).userData || {};
  (geom as any).userData.__colorStamp = stamp;
}

function readStamp(geom: THREE.BufferGeometry) {
  return (geom as any).userData?.__colorStamp ?? "(none)";
}

function debugMesh(tag: string, mesh: THREE.Mesh, extra?: any) {
  if (!DBG_COLORS) return;
  const geom = mesh.geometry as THREE.BufferGeometry;
  const mat = mesh.material as any;

  console.groupCollapsed(`${tag} :: ${mesh.name || mesh.uuid}`);
  console.log("extra", extra ?? {});
  console.log("geom.color", colorAttrStats(geom));
  console.log("geom.stamp", readStamp(geom));
  console.log("mat.type", mat?.type, "vertexColors=", !!mat?.vertexColors, "wireframe=", !!mat?.wireframe);
  console.trace("trace");
  console.groupEnd();
}

// ✅ NEW: curvature coloring for graph surfaces with a RED↔YELLOW heatmap
// - uses |Gaussian curvature| of z=f(x,y) with finite differences
// - low curvature => yellow, high => red (so you SEE red immediately)
function applyCurvatureHeatToGraph(
  geometry: THREE.BufferGeometry,
  f: (x: number, y: number) => number,
  palette: ColorPalette = "redYellow"
) {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute | null;
  if (!pos) return;

  const n = pos.count;
  if (n <= 0) return;

  // choose eps relative to typical mesh spacing; keep it stable
  const eps = 1e-2;

  const vals = new Float32Array(n);
  let mx = 0;

  const safeF = (x: number, y: number) => {
    const v = f(x, y);
    return Number.isFinite(v) ? v : NaN;
  };

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const yDom = pos.getZ(i); // graph domain y is stored in world z

    const f00 = safeF(x, yDom);
    if (!Number.isFinite(f00)) {
      vals[i] = 0;
      continue;
    }

    const fxp = safeF(x + eps, yDom);
    const fxm = safeF(x - eps, yDom);
    const fyp = safeF(x, yDom + eps);
    const fym = safeF(x, yDom - eps);

    const fxyp = safeF(x + eps, yDom + eps);
    const fxym = safeF(x + eps, yDom - eps);
    const fmxp = safeF(x - eps, yDom + eps);
    const fmxm = safeF(x - eps, yDom - eps);

    if (
      !Number.isFinite(fxp) ||
      !Number.isFinite(fxm) ||
      !Number.isFinite(fyp) ||
      !Number.isFinite(fym) ||
      !Number.isFinite(fxyp) ||
      !Number.isFinite(fxym) ||
      !Number.isFinite(fmxp) ||
      !Number.isFinite(fmxm)
    ) {
      vals[i] = 0;
      continue;
    }

    const fx = (fxp - fxm) / (2 * eps);
    const fy = (fyp - fym) / (2 * eps);

    const fxx = (fxp - 2 * f00 + fxm) / (eps * eps);
    const fyy = (fyp - 2 * f00 + fym) / (eps * eps);
    const fxy = (fxyp - fxym - fmxp + fmxm) / (4 * eps * eps);

    const denom = Math.pow(1 + fx * fx + fy * fy, 2);
    const K = denom > 1e-12 ? (fxx * fyy - fxy * fxy) / denom : 0;

    const m = Number.isFinite(K) ? Math.abs(K) : 0;

    vals[i] = m;
    if (m > mx) mx = m;
  }

  const colors = new Float32Array(n * 3);

  // compress huge spikes so you still get contrast:
  // t = log(1 + s*m) / log(1 + s*mx)
  const s = 30;
  const invDen = mx > 1e-12 ? 1 / Math.log1p(s * mx) : 0;

  for (let i = 0; i < n; i++) {
    const m = vals[i];
    let t = mx > 1e-12 ? Math.log1p(s * m) * invDen : 0;

    // clamp
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    // For curvature "heat", many people expect:
    // low curvature => yellow, high => red.
    // Your scalarToColor01(redYellow) is red->yellow as t increases,
    // so invert ONLY for redYellow to get yellow->red.
    const tt = palette === "redYellow" ? 1 - t : t;

    const { r, g, b } = scalarToColor01(tt, palette);
    colors[3 * i + 0] = r;
    colors[3 * i + 1] = g;
    colors[3 * i + 2] = b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  (geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;


 stampGeom(geometry, `curvHeat palette=${palette} mx=${mx.toExponential(2)} s=${s}`);

  if (DBG_COLORS) {
    const st = colorAttrStats(geometry);
    console.groupCollapsed("[applyCurvatureHeatToGraph] done");
    console.log({ palette, n, mx, s });
    console.log("colorAttr", st);
    console.log("sample tt @0, mid, last:", {
      c0: st.has ? [ (geometry.getAttribute("color") as any).getX(0),
                     (geometry.getAttribute("color") as any).getY(0),
                     (geometry.getAttribute("color") as any).getZ(0)] : null,
    });
    console.groupEnd();

}

}

function makePlaneBasis(n: THREE.Vector3) {
  const up = Math.abs(n.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const e1 = new THREE.Vector3().crossVectors(up, n);
  if (e1.lengthSq() < 1e-12) {
    up.set(1, 0, 0);
    e1.crossVectors(up, n);
  }
  e1.normalize();
  const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
  return { e1, e2 };
}

type PrincipalProjectionPlane = "xy" | "yz" | "xz";

const PRINCIPAL_PROJECTION_COLORS: Record<PrincipalProjectionPlane, number> = {
  xy: 0x0ea5e9,
  yz: 0x16a34a,
  xz: 0xf59e0b,
};

const cloneIndexArray = (index: ArrayLike<number>) => {
  if (index instanceof Uint32Array) return new Uint32Array(index);
  if (index instanceof Uint16Array) return new Uint16Array(index);
  if (index instanceof Uint8Array) return new Uint8Array(index);
  return Uint32Array.from(index);
};

const projectPointToPlane = (
  point: THREE.Vector3,
  plane: PrincipalProjectionPlane,
  out: THREE.Vector3
) => {
  if (plane === "xy") {
    out.set(point.x, point.y, 0);
    return out;
  }
  if (plane === "yz") {
    out.set(0, point.y, point.z);
    return out;
  }
  out.set(point.x, 0, point.z);
  return out;
};

const buildPrincipalProjectionGroup = (
  root: THREE.Object3D,
  options: {
    showXY: boolean;
    showYZ: boolean;
    showXZ: boolean;
    opacity: number;
    wireframe: boolean;
  }
) => {
  const planes: PrincipalProjectionPlane[] = [];
  if (options.showXY) planes.push("xy");
  if (options.showYZ) planes.push("yz");
  if (options.showXZ) planes.push("xz");
  if (!planes.length) return null;

  root.updateMatrixWorld(true);
  const sourceMeshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh?.isMesh) return;
    if (!(mesh.geometry instanceof THREE.BufferGeometry)) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | null;
    if (!pos || pos.count < 3) return;
    sourceMeshes.push(mesh);
  });
  if (!sourceMeshes.length) return null;

  const group = new THREE.Group();
  group.name = "principal-plane-projections";
  const world = new THREE.Vector3();
  const projected = new THREE.Vector3();

  for (const source of sourceMeshes) {
    const geometry = source.geometry as THREE.BufferGeometry;
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute | null;
    if (!pos || pos.count < 3) continue;
    const idx = geometry.getIndex();

    for (const plane of planes) {
      const projectedPositions = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        world.fromBufferAttribute(pos, i).applyMatrix4(source.matrixWorld);
        projectPointToPlane(world, plane, projected);
        projectedPositions[3 * i] = projected.x;
        projectedPositions[3 * i + 1] = projected.y;
        projectedPositions[3 * i + 2] = projected.z;
      }

      const projectedGeom = new THREE.BufferGeometry();
      projectedGeom.setAttribute("position", new THREE.Float32BufferAttribute(projectedPositions, 3));
      if (idx && idx.count >= 3) {
        projectedGeom.setIndex(new THREE.BufferAttribute(cloneIndexArray(idx.array as ArrayLike<number>), 1));
      }

      const opacity = Math.max(0.03, Math.min(0.95, options.opacity));
      const mat = new THREE.MeshBasicMaterial({
        color: PRINCIPAL_PROJECTION_COLORS[plane],
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        wireframe: options.wireframe,
      });
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -1;
      mat.polygonOffsetUnits = -1;

      const projectedMesh = new THREE.Mesh(projectedGeom, mat);
      projectedMesh.frustumCulled = false;
      projectedMesh.renderOrder = 210;
      group.add(projectedMesh);
    }
  }

  return group.children.length ? group : null;
};

/* ---------- props ---------- */

type Props = {
  surfaceId: SurfaceId;
  graphExpr?: string;
  implicitExpr?: string;
  implicitMeshOverride?: ImplicitMeshOverride | null;
  surfaceMeshOverride?: SurfaceMeshOverride | null;
  surfaceMeshOverrides?: SurfaceMeshOverride[] | null;
  implicitMeshToken?: number;

  wireframe?: boolean;
  showPlanes?: boolean;
  planeGridSettings?: ReferencePlaneGridSettings;
  showPrincipalProjections?: boolean;
  principalProjectionXY?: boolean;
  principalProjectionYZ?: boolean;
  principalProjectionXZ?: boolean;
  principalProjectionOpacity?: number;

  lightPreset?: "studio" | "soft" | "contrast" | "neutral" | "warm";
  materialRoughness?: number;
  materialMetalness?: number;
  materialOpacity?: number;

  graphResolution?: number;
  implicitResolution?: number;
  implicitDomainSize?: number;

  colorMode?: ColorMode;
  colorPalette?: ColorPalette;
  implicitOverlay?: "none" | "normals" | "curvature";
  graphDomain?: GraphDomain;
  showChartGrid?: boolean;
  chartGridMode?: "local" | "mesh-face";
  onSurfaceCellSelectionEnabledChange?: (enabled: boolean) => void;
  chartGridCountU?: number;
  chartGridCountV?: number;
  isCameraLeader?: boolean;
  cameraSync?: CameraSyncState | null;
  onCameraSync?: (state: CameraSyncState) => void;
  cameraOverride?: CameraSyncState | null;
  cameraOverrideToken?: number;
  cameraFitCommand?: CameraFitCommand | null;
  renderQuality?: RenderQuality;
  meshInteractionQualityMode?: MeshInteractionQualityMode;
  meshInteractionRestoreDelayMs?: number;
  meshInteractionPreviewTriangleTarget?: number;
  meshInteractionHideVertexMarkers?: boolean;
  meshInteractionHideFaceNormals?: boolean;
  meshInteractionHideCurvatureGlyphs?: boolean;
  meshInteractionHideWireframe?: boolean;
  meshInteractionHideSceneOverlays?: boolean;
  onMeshInteractionStateChange?: (active: boolean) => void;
  sceneBackgroundMode?: SceneBackgroundMode;
  cameraTourCommand?: CameraTourCommand | null;
  onCameraTourEvent?: (event: CameraTourEvent) => void;
  captureToken?: number;
  onCaptureThumbnail?: (dataUrl: string | null) => void;

  showBoundingBox?: boolean;
  resetToken?: number;

  probeEnabled?: boolean;
  showProbeNormal?: boolean;
  showProbeTangentPlane?: boolean;
  showProbeTangents?: boolean;
  showPrincipalDirections?: boolean;
  showPrincipalNormalPlanes?: boolean;
  showPrincipalLines?: boolean;
  showPrincipalGlyphs?: boolean;
  principalGlyphDensity?: number;
  principalGlyphLength?: number;
  principalGlyphMode?: "both" | "d1";
  showCurvatureLines?: boolean;
  curvatureLineField?: "d1" | "d2";
  curvatureSeedSource?: "global" | "selection";
  curvatureSeedDensity?: number;
  curvatureStepSize?: number;
  curvatureMaxSteps?: number;
  curvatureMaxLines?: number;
  curvatureRebuildToken?: number;
  showRidges?: boolean;
  showValleys?: boolean;
  ridgeValleySelectionOnly?: boolean;
  ridgeValleyMagMin?: number;
  ridgeValleyContrast?: number;
  ridgeValleyMinCos?: number;
  ridgeValleySegmentScale?: number;
  ridgeValleySampleMode?: "high" | "medium" | "low";
  ridgeValleyStitch?: boolean;
  ridgeValleyDecimate?: number;
  ridgeValleyMaxCurves?: number;
  ridgeValleyMinConf?: number;
  graphProbeXY?: { x: number; y: number } | null;
  graphProbeToken?: number;
  implicitProbeXYZ?: { x: number; y: number; z: number } | null;
  implicitProbeToken?: number;
  onProbe?: (info: ProbeInfo) => void;

  gaussMapEnabled?: boolean;
  onToggleGaussMap?: () => void;
  showOverlayControls?: boolean;
  showViewGizmo?: boolean;
  onGaussPoints?: (points: GaussPoint[]) => void;
  gaussHighlightPoint?: { x: number; y: number; z: number } | null;
  sampleMaxPoints?: number;
  includeSamplesUV?: boolean;
  onSampleSet?: (set: SurfaceSampleSet | null) => void;
  selectionMask?: SelectionMask | null;
  selectRegionEnabled?: boolean;
  onSelectionPick?: (info: {
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    uv?: { u: number; v: number };
    sampleIndex?: number;
    meshKey?: string;
    vertexIndex?: number;
  }) => void;
  geodesicPathEnabled?: boolean;
  onGeodesicPathPick?: (info: {
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    uv?: { u: number; v: number };
    sampleIndex?: number;
    meshKey?: string;
    vertexIndex?: number;
  }) => void;
  geodesicPathStart?: { meshKey: string; vertexIndex: number } | null;
  geodesicPathEnd?: { meshKey: string; vertexIndex: number } | null;
  geodesicPathIndices?: number[] | null;
  geodesicHeatEnabled?: boolean;
  onGeodesicHeatPick?: (info: {
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    meshKey?: string;
    faceIndex?: number;
    bary?: [number, number, number];
    uv?: { u: number; v: number };
  }) => void;
  geodesicHeatStart?: { point: { x: number; y: number; z: number }; meshKey?: string } | null;
  geodesicHeatEnd?: { point: { x: number; y: number; z: number }; meshKey?: string } | null;
  geodesicHeatPolylines?: PolylineSet | null;
  geodesicHeatmapValues?: number[] | null;
  geodesicHeatmapEnabled?: boolean;
  overlayHeatmapValues?: ArrayLike<number> | null;
  overlayHeatmapEnabled?: boolean;
  overlayPolylines?: PolylineSet | null;
  overlayPolylinesColor?: number;
  overlayPolylineGroups?: OverlayPolylineGroup[] | null;
  overlayPointSets?: OverlayPointSet[] | null;
  overlayMeshGroups?: OverlayMeshGroup[] | null;
  overlayLabelSets?: OverlayLabelSet[] | null;
  geodesicDiskEnabled?: boolean;
  geodesicDiskPickEnabled?: boolean;
  onGeodesicDiskPick?: (info: {
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    meshKey?: string;
    faceIndex?: number;
    bary?: [number, number, number];
    uv?: { u: number; v: number };
  }) => void;
  geodesicDiskCenter?: { point: { x: number; y: number; z: number } } | null;
  geodesicDiskMesh?: { positions: Float32Array } | null;
  geodesicDiskBoundary?: { x: number; y: number; z: number }[][] | null;
  geodesicDiskShowBoundary?: boolean;
  inspectEnabled?: boolean;
  onInspectPick?: (info: {
    index: number;
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    meshKey?: string;
    faceIndex?: number;
    vertexIndex?: number;
    uv?: { u: number; v: number };
    xy?: { x: number; y: number };
  }) => void;
  onInspectHover?: (info: {
    index: number;
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    meshKey?: string;
    faceIndex?: number;
    vertexIndex?: number;
    uv?: { u: number; v: number };
    xy?: { x: number; y: number };
  }) => void;
  inspectSelectionMeshKey?: string | null;
  inspectPoint?: { x: number; y: number; z: number } | null;
  selectionOverlayVisible?: boolean;
  selectionOverlayOnTop?: boolean;
  selectionSphere?: { center: { x: number; y: number; z: number }; radius: number } | null;
  zoomToRegion?: boolean;
  zoomToRegionToken?: number;
  windowReframeToken?: number;
  reframePaddingFactor?: number;
  onViewportDebug?: (snapshot: ViewportDebugSnapshot) => void;
  onPerformanceSnapshot?: (snapshot: SurfacePerformanceSnapshot) => void;
  lastMeshBuildMs?: number | null;

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
  dragPlaneAnchor?: DragPlaneAnchor | null;
  onShiftWheelScale?: (info: { delta: number }) => void;
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

  onSetGraphExpr?: (expr: string) => void;
  onSetImplicitExpr?: (expr: string) => void;

  showContours?: boolean;
  contourCount?: number;
  suspendPointerInteractions?: boolean;
  suspendRendering?: boolean;
  surfaceMeshFallbackMode?: "sphere" | "none";
};

type PrincipalField = {
  positions: Float32Array;
  normals: Float32Array;
  k1: Float32Array;
  k2: Float32Array;
  d1: Float32Array;
  d2: Float32Array;
  vertexCount: number;
  index: ArrayLike<number> | null;
};



/* ---------- main viewer ---------- */

export const SurfaceViewer: React.FC<Props> = (props) => {
  const {
    surfaceId,
    graphExpr,
    implicitExpr,
    implicitMeshOverride = null,
    surfaceMeshOverride = null,
    surfaceMeshOverrides = null,
    implicitMeshToken,

    wireframe,
    showPlanes,
    planeGridSettings = DEFAULT_REFERENCE_PLANE_GRID_SETTINGS,
    showPrincipalProjections = false,
    principalProjectionXY = true,
    principalProjectionYZ = true,
    principalProjectionXZ = true,
    principalProjectionOpacity = 0.24,

    lightPreset = "studio",
    materialRoughness = 0.3,
    materialMetalness = 0.1,
    materialOpacity = 1,

    graphResolution = 80,
    implicitResolution = 32,
    implicitDomainSize,

    colorMode = "solid",
    colorPalette = "blueRed",
    implicitOverlay = "none",
    graphDomain,
    showChartGrid = false,
    chartGridMode = "local",
    onSurfaceCellSelectionEnabledChange,
    chartGridCountU = 11,
    chartGridCountV = 11,
    isCameraLeader = false,
    cameraSync = null,
    onCameraSync,
    cameraOverride = null,
    cameraOverrideToken = 0,
    cameraFitCommand = null,
    renderQuality = "balanced",
    meshInteractionQualityMode = "adaptive",
    meshInteractionRestoreDelayMs = 150,
    meshInteractionPreviewTriangleTarget = DEFAULT_MESH_PREVIEW_TRIANGLE_TARGET,
    meshInteractionHideVertexMarkers = true,
    meshInteractionHideFaceNormals = true,
    meshInteractionHideCurvatureGlyphs = true,
    meshInteractionHideWireframe = false,
    meshInteractionHideSceneOverlays = false,
    onMeshInteractionStateChange,
    sceneBackgroundMode = "default",
    cameraTourCommand = null,
    onCameraTourEvent,
    captureToken = 0,
    onCaptureThumbnail,

    showBoundingBox = false,
    resetToken,

    probeEnabled = false,
    showProbeNormal = true,
    showProbeTangentPlane = true,
    showProbeTangents = true,
    showPrincipalDirections = false,
    showPrincipalNormalPlanes = false,
    showPrincipalLines = false,
    showPrincipalGlyphs = false,
    principalGlyphDensity = 100,
    principalGlyphLength = 0,
    principalGlyphMode = "both",
    showCurvatureLines = false,
    curvatureLineField = "d1",
    curvatureSeedSource = "global",
    curvatureSeedDensity = 100,
    curvatureStepSize = 0,
    curvatureMaxSteps = 400,
    curvatureMaxLines = 200,
    curvatureRebuildToken = 0,
    showRidges = false,
    showValleys = false,
    ridgeValleySelectionOnly = false,
    ridgeValleyMagMin = 0.05,
    ridgeValleyContrast = 0.01,
    ridgeValleyMinCos = 0.3,
    ridgeValleySegmentScale = 0.005,
    ridgeValleySampleMode = "medium",
    ridgeValleyStitch = false,
    ridgeValleyDecimate = 0.002,
    ridgeValleyMaxCurves = 200,
    ridgeValleyMinConf = 0,
    graphProbeXY = null,
    graphProbeToken,
    implicitProbeXYZ = null,
    implicitProbeToken,
    onProbe,

    gaussMapEnabled = false,
    onToggleGaussMap,
    showOverlayControls = true,
    showViewGizmo = true,
    onGaussPoints,
    gaussHighlightPoint = null,
    sampleMaxPoints = 900,
    includeSamplesUV = true,
    onSampleSet,
    selectionMask = null,
    selectRegionEnabled = false,
    onSelectionPick,
    geodesicPathEnabled = false,
    onGeodesicPathPick,
    geodesicPathStart = null,
    geodesicPathEnd = null,
    geodesicPathIndices = null,
    geodesicHeatEnabled = false,
    onGeodesicHeatPick,
    onGeodesicDiskPick,
    geodesicHeatStart = null,
    geodesicHeatEnd = null,
    geodesicHeatPolylines = null,
    geodesicHeatmapValues = null,
    geodesicHeatmapEnabled = false,
    overlayHeatmapValues = null,
    overlayHeatmapEnabled = false,
    overlayPolylines = null,
    overlayPolylinesColor = 0x2a7bff,
    overlayPolylineGroups = null,
    overlayPointSets = null,
    overlayMeshGroups = null,
    overlayLabelSets = null,
    geodesicDiskEnabled = false,
    geodesicDiskPickEnabled = false,
    geodesicDiskCenter = null,
    geodesicDiskMesh = null,
    geodesicDiskBoundary = null,
    geodesicDiskShowBoundary = true,
    inspectEnabled = false,
    onInspectPick,
    onInspectHover,
    inspectSelectionMeshKey = null,
    inspectPoint = null,
    selectionOverlayVisible = true,
    selectionOverlayOnTop = false,
    selectionSphere = null,
    zoomToRegion = false,
    zoomToRegionToken = 0,
    windowReframeToken = 0,
    reframePaddingFactor = 1.08,
    onViewportDebug,
    onPerformanceSnapshot,
    lastMeshBuildMs = null,
    dragEnabled = false,
    onDragStart,
    onDrag,
    onDragEnd,
    dragPlaneAnchor = null,
    onShiftWheelScale,
    gizmoEnabled = false,
    gizmoMeshKey = null,
    gizmoMode = "translate",
    gizmoSpace = "world",
    gizmoTranslationSnap = null,
    gizmoRotationSnapDeg = null,
    gizmoScaleSnap = null,
    onGizmoTransform,

    onSetGraphExpr,
    onSetImplicitExpr,

    showContours = false,
    contourCount = 12,
    suspendPointerInteractions = false,
    suspendRendering = false,
    surfaceMeshFallbackMode = "sphere",
  } = props;
  const planeGridShowGrid = planeGridSettings.showGrid;
  const planeGridShowMinor = planeGridSettings.showMinorGrid;
  const planeGridShowLabels = planeGridSettings.showLabels;
  const planeGridShowAxisLabels = planeGridSettings.showAxisLabels;
  const planeGridLabelSkin = planeGridSettings.labelSkin;
  const planeGridShowXY = planeGridSettings.showXY;
  const planeGridShowXZ = planeGridSettings.showXZ;
  const planeGridShowYZ = planeGridSettings.showYZ;
  const planeGridAutoScale = planeGridSettings.autoGridScale;
  const planeGridDensity = planeGridSettings.gridDensity;
  const planeGridOpacity = planeGridSettings.planeOpacity;
  const sceneBackgroundColor = sceneBackgroundMode === "calm" ? 0xf1f5fb : 0xf8f9fb;
  const sceneBackgroundAlpha = sceneBackgroundMode === "transparent" ? 0 : 1;
  const initialMeshRuntimeQuality: MeshRuntimeQuality =
    surfaceId === "surface_mesh" && meshInteractionQualityMode === "fast-preview"
      ? "interactive-preview"
      : "accurate";
  const [meshRuntimeQuality, setMeshRuntimeQuality] = useState<MeshRuntimeQuality>(initialMeshRuntimeQuality);
  const meshRuntimeQualityRef = useRef<MeshRuntimeQuality>(initialMeshRuntimeQuality);
  const meshInteractionActiveRef = useRef(false);
  const meshInteractionIdleTimerRef = useRef<number | null>(null);
  const normalizedMeshRestoreDelayMs = normalizePositiveInt(meshInteractionRestoreDelayMs, 150, 50, 2000);
  const normalizedMeshPreviewTriangleTarget = normalizePositiveInt(
    meshInteractionPreviewTriangleTarget,
    DEFAULT_MESH_PREVIEW_TRIANGLE_TARGET,
    5_000,
    5_000_000
  );
  const canUseMeshInteractionLod = surfaceId === "surface_mesh" && meshInteractionQualityMode !== "full";
  const suppressInteractionOverlays = canUseMeshInteractionLod && meshRuntimeQuality !== "accurate";
  const effectiveWireframe = wireframe && !(suppressInteractionOverlays && meshInteractionHideWireframe);
  const effectiveShowPrincipalGlyphs =
    showPrincipalGlyphs && !(suppressInteractionOverlays && meshInteractionHideCurvatureGlyphs);
  const effectiveSelectionOverlayVisible =
    selectionOverlayVisible && !(suppressInteractionOverlays && meshInteractionHideVertexMarkers);
  const effectiveImplicitOverlay =
    suppressInteractionOverlays && meshInteractionHideFaceNormals && implicitOverlay === "normals"
      ? "none"
      : implicitOverlay;
  const hideSceneOverlaysDuringInteraction =
    suppressInteractionOverlays && meshInteractionHideSceneOverlays;
  const effectiveOverlayMeshGroups = hideSceneOverlaysDuringInteraction ? null : overlayMeshGroups;
  const effectiveOverlayLabelSets = hideSceneOverlaysDuringInteraction ? null : overlayLabelSets;
  const effectiveOverlayPolylineGroups = hideSceneOverlaysDuringInteraction ? null : overlayPolylineGroups;
  const effectiveOverlayPointSets = hideSceneOverlaysDuringInteraction ? null : overlayPointSets;

  const mountRef = useRef<HTMLDivElement | null>(null);

  // slice visuals
  const sliceGroupRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const selectionOverlayRef = useRef<THREE.Points | null>(null);
  const selectionSphereRef = useRef<THREE.Mesh | null>(null);
  const inspectMarkerRef = useRef<THREE.Mesh | null>(null);
  const geodesicPathLineRef = useRef<THREE.Line | null>(null);
  const geodesicPathMarkersRef = useRef<{ start: THREE.Mesh | null; end: THREE.Mesh | null }>({
    start: null,
    end: null,
  });
  const geodesicHeatLineRef = useRef<THREE.Object3D | null>(null);
  const overlayPolylinesRef = useRef<THREE.Group | null>(null);
  const overlayPolylineGroupsRef = useRef<THREE.Group | null>(null);
  const principalProjectionGroupRef = useRef<THREE.Group | null>(null);
  const overlayPointSetsRef = useRef<THREE.Group | null>(null);
  const overlayMeshGroupsRef = useRef<THREE.Group | null>(null);
  const overlayLabelSetsRef = useRef<THREE.Group | null>(null);
  const chartGridRef = useRef<THREE.Group | null>(null);
  const chartGridPickMeshRef = useRef<THREE.Mesh | null>(null);
  const chartGridCellsRef = useRef<SurfaceDecompositionCell[]>([]);
  const chartGridCellFaceFactorRef = useRef(1);
  const viewGizmoRef = useRef<THREE.Group | null>(null);
  const bboxHelperRef = useRef<THREE.Box3Helper | null>(null);
  const geodesicHeatMarkersRef = useRef<{ start: THREE.Mesh | null; end: THREE.Mesh | null }>({
    start: null,
    end: null,
  });
  const geodesicDiskGroupRef = useRef<THREE.Group | null>(null);
  const sampleSetRef = useRef<SurfaceSampleSet | null>(null);
  const selectRegionEnabledRef = useRef(selectRegionEnabled);
  const onSelectionPickRef = useRef(onSelectionPick);
  const inspectEnabledRef = useRef(inspectEnabled);
  const inspectSelectionMeshKeyRef = useRef<string | null>(inspectSelectionMeshKey);
  const dragEnabledRef = useRef(dragEnabled);
  const dragPlaneAnchorRef = useRef<DragPlaneAnchor | null>(dragPlaneAnchor);
  const geodesicPathEnabledRef = useRef(geodesicPathEnabled);
  const geodesicHeatEnabledRef = useRef(geodesicHeatEnabled);
  const geodesicDiskPickEnabledRef = useRef(geodesicDiskPickEnabled);
  const showChartGridRef = useRef(showChartGrid);
  const onInspectPickRef = useRef(onInspectPick);
  const onInspectHoverRef = useRef(onInspectHover);
  const onDragStartRef = useRef(onDragStart);
  const onDragRef = useRef(onDrag);
  const onDragEndRef = useRef(onDragEnd);
  const onShiftWheelScaleRef = useRef(onShiftWheelScale);
  const onGizmoTransformRef = useRef(onGizmoTransform);
  const gizmoModeRef = useRef(gizmoMode);
  const suspendRenderingRef = useRef(suspendRendering);
  const onGeodesicPathPickRef = useRef(onGeodesicPathPick);
  const onGeodesicHeatPickRef = useRef(onGeodesicHeatPick);
  const onGeodesicDiskPickRef = useRef(onGeodesicDiskPick);

  const surfaceObjRef = useRef<THREE.Object3D | null>(null);
  const probeWidgetsRef = useRef<{
    marker: THREE.Mesh;
    normal: THREE.ArrowHelper;
    plane: THREE.Mesh;
    t1: THREE.ArrowHelper;
    t2: THREE.ArrowHelper;
  } | null>(null);
  const probePointRef = useRef<THREE.Vector3 | null>(null);
  const probeNormalRef = useRef<THREE.Vector3 | null>(null);
  const applyProbeFromDomainRef = useRef<
    | ((
        point: THREE.Vector3,
        normalWorld: THREE.Vector3,
        xyDomain?: { x: number; y: number },
        uvDomain?: { u: number; v: number }
      ) => void)
    | null
  >(null);
  const [probePointToken, setProbePointToken] = useState(0);
  const [probeHudLines, setProbeHudLines] = useState<string[]>([]);
  const principalGroupRef = useRef<THREE.Group | null>(null);
  const principalGlyphsRef = useRef<{ d1?: THREE.LineSegments; d2?: THREE.LineSegments } | null>(
    null
  );
  const curvatureLinesRef = useRef<THREE.LineSegments | null>(null);
  const ridgeLinesRef = useRef<THREE.Object3D | null>(null);
  const valleyLinesRef = useRef<THREE.Object3D | null>(null);
  const principalFieldRef = useRef<{ key: string; data: PrincipalField | null } | null>(null);
  const prevPrincipalRef = useRef<PrincipalCurvatureResult | null>(null);
  const [probeXY, setProbeXY] = useState<{ x: number; y: number } | null>(null);
  const [surfaceCellSelectionEnabled, setSurfaceCellSelectionEnabled] = useState(() => surfaceId !== "surface_mesh");
  const [surfaceCellCentersVisible, setSurfaceCellCentersVisible] = useState(false);
  const [surfaceCellNormalsVisible, setSurfaceCellNormalsVisible] = useState(false);
  const [surfaceCellValuesVisible, setSurfaceCellValuesVisible] = useState(false);
  const [selectedSurfaceCellIndex, setSelectedSurfaceCellIndex] = useState<number | null>(null);
  const [selectedSurfaceCellInfo, setSelectedSurfaceCellInfo] = useState<SurfaceDecompositionCell | null>(null);
  const [surfaceCellMaskedIds, setSurfaceCellMaskedIds] = useState<Set<string>>(new Set());
  const [surfaceCellDiagnostics, setSurfaceCellDiagnostics] = useState<SurfaceDecompositionDiagnostics>({
    validCells: 0,
    maskedCells: 0,
    invalidCells: 0,
    skippedNonFinite: 0,
    skippedDegenerate: 0,
    skippedOutOfBounds: 0,
    minArea: null,
    maxArea: null,
    avgArea: null,
  });
  const [surfaceCellInvalidRows, setSurfaceCellInvalidRows] = useState<SurfaceDecompositionCell[]>([]);
  const surfaceCellSelectionEnabledRef = useRef(surfaceCellSelectionEnabled);
  const chartGridRenderableCellIndicesRef = useRef<number[]>([]);
  const [sceneEpoch, setSceneEpoch] = useState(0);
  const sliceFrameRef = useRef<{
    n: THREE.Vector3;
    e1: THREE.Vector3;
    e2: THREE.Vector3;
    x0: THREE.Vector3;
    size: number;
  } | null>(null);
  const lockSliceRestoreRef = useRef<{ rotate: boolean; pan: boolean; zoom: boolean } | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    meshKey?: string;
    plane: THREE.Plane;
    startPoint: THREE.Vector3;
    lastPoint: THREE.Vector3;
    normal: THREE.Vector3;
    moved: boolean;
    clickPick?: {
      point: THREE.Vector3;
      normal: THREE.Vector3;
      meshKey?: string;
      faceIndex?: number;
      uv?: { u: number; v: number };
      xy?: { x: number; y: number };
    };
  } | null>(null);

  type ViewMode = "free" | GizmoView;
  const [viewMode, setViewMode] = useState<ViewMode>("free");
  const [lockToAxisPlane, setLockToAxisPlane] = useState(false);
  const [viewGizmoMenuOpen, setViewGizmoMenuOpen] = useState(false);
  const [lockToSlicePlane, setLockToSlicePlane] = useState(false);
  const [slicePlaneEnabled, setSlicePlaneEnabled] = useState(false);
  const [slicePlanePreset, setSlicePlanePreset] = useState<SlicePreset>("xy");
  const [slicePlaneTheta, setSlicePlaneTheta] = useState(0);
  const [slicePlanePhi, setSlicePlanePhi] = useState(0);
  const [slicePlaneOffset, setSlicePlaneOffset] = useState(0);
  const [slicePlaneSize, setSlicePlaneSize] = useState(3.5);
  const [slicePolylines2D, setSlicePolylines2D] = useState<Array<Array<{ s: number; t: number }>>>([]);
  const [sliceSnapToCurve, setSliceSnapToCurve] = useState(true);
  const [sliceHoverST, setSliceHoverST] = useState<{ s: number; t: number } | null>(null);
  const [sliceHoverReadout, setSliceHoverReadout] = useState<{ s: number; t: number } | null>(null);
  const sliceHoverReadoutTimerRef = useRef<number | null>(null);
  const [sliceHoverSnap, setSliceHoverSnap] = useState<{ s: number; t: number } | null>(null);
  const sliceHoverMarkerRef = useRef<THREE.Mesh | null>(null);
  const sliceHoverSmoothRef = useRef<{ s: number; t: number } | null>(null);

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const transformControlsHelperRef = useRef<THREE.Object3D | null>(null);
  const gizmoOverlayRestoreFrameRef = useRef<number | null>(null);
  const gizmoDragStartPositionRef = useRef<THREE.Vector3 | null>(null);
  const gizmoDraggingRef = useRef(false);
  const zoomDebounceRef = useRef<number | null>(null);
  const zoomAnimRef = useRef<number | null>(null);
  const zoomNowRef = useRef(0);
  const zoomRestoreRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 } | null>(null);
  const zoomedToRegionRef = useRef(false);
  const zoomTogglePrevRef = useRef(zoomToRegion);
  const cameraTourFrameRef = useRef<number | null>(null);
  const cameraTourRunIdRef = useRef(0);
  const cameraTourCaptureStopRef = useRef<((reason: "completed" | "stopped" | "interrupted") => void) | null>(
    null
  );
  const gaussHighlightRef = useRef<THREE.Mesh | null>(null);
  const centerRef = useRef(new THREE.Vector3(0, 0, 0));
  const radiusRef = useRef<number>(3);
  const forceReframeRef = useRef<(() => void) | null>(null);
  const onCameraTourEventRef = useRef<Props["onCameraTourEvent"] | undefined>(undefined);
  const onPerformanceSnapshotRef = useRef<Props["onPerformanceSnapshot"] | undefined>(undefined);
  const onMeshInteractionStateChangeRef = useRef<Props["onMeshInteractionStateChange"] | undefined>(undefined);
  const lastMeshBuildMsRef = useRef<number | null>(lastMeshBuildMs);
  const perfFrameRef = useRef<{ lastFrameAt: number; fps: number; frameTimeMs: number; lastEmitAt: number }>({
    lastFrameAt: 0,
    fps: 0,
    frameTimeMs: 0,
    lastEmitAt: 0,
  });
  const lastRenderedAtRef = useRef(0);
  const raycastPerfRef = useRef<{ lastMs: number; emaMs: number; samples: number }>({
    lastMs: 0,
    emaMs: 0,
    samples: 0,
  });
  useEffect(() => {
    meshRuntimeQualityRef.current = meshRuntimeQuality;
  }, [meshRuntimeQuality]);
  const clearMeshInteractionIdleTimer = useCallback(() => {
    if (meshInteractionIdleTimerRef.current != null) {
      window.clearTimeout(meshInteractionIdleTimerRef.current);
      meshInteractionIdleTimerRef.current = null;
    }
  }, []);
  const finalizeMeshInteraction = useCallback(() => {
    meshInteractionActiveRef.current = false;
    clearMeshInteractionIdleTimer();
    setMeshRuntimeQuality("accurate");
    onMeshInteractionStateChangeRef.current?.(false);
  }, [clearMeshInteractionIdleTimer]);
  const beginMeshInteraction = useCallback(() => {
    if (!canUseMeshInteractionLod) return;
    if (meshInteractionQualityMode === "fast-preview") {
      meshInteractionActiveRef.current = false;
      clearMeshInteractionIdleTimer();
      if (meshRuntimeQualityRef.current !== "interactive-preview") {
        setMeshRuntimeQuality("interactive-preview");
      }
      return;
    }
    meshInteractionActiveRef.current = true;
    clearMeshInteractionIdleTimer();
    setMeshRuntimeQuality("interactive-preview");
    onMeshInteractionStateChangeRef.current?.(true);
  }, [canUseMeshInteractionLod, clearMeshInteractionIdleTimer, meshInteractionQualityMode]);
  const endMeshInteraction = useCallback(() => {
    if (!canUseMeshInteractionLod) {
      finalizeMeshInteraction();
      return;
    }
    if (meshInteractionQualityMode === "fast-preview") {
      meshInteractionActiveRef.current = false;
      clearMeshInteractionIdleTimer();
      if (meshRuntimeQualityRef.current !== "interactive-preview") {
        setMeshRuntimeQuality("interactive-preview");
      }
      return;
    }
    meshInteractionActiveRef.current = false;
    clearMeshInteractionIdleTimer();
    setMeshRuntimeQuality("balanced");
    onMeshInteractionStateChangeRef.current?.(false);
    meshInteractionIdleTimerRef.current = window.setTimeout(() => {
      meshInteractionIdleTimerRef.current = null;
      if (meshInteractionActiveRef.current) return;
      setMeshRuntimeQuality("accurate");
    }, normalizedMeshRestoreDelayMs);
  }, [
    canUseMeshInteractionLod,
    clearMeshInteractionIdleTimer,
    finalizeMeshInteraction,
    meshInteractionQualityMode,
    normalizedMeshRestoreDelayMs,
  ]);
  useEffect(() => {
    if (!canUseMeshInteractionLod) {
      finalizeMeshInteraction();
      return;
    }
    if (meshInteractionQualityMode === "fast-preview") {
      clearMeshInteractionIdleTimer();
      meshInteractionActiveRef.current = false;
      if (meshRuntimeQualityRef.current !== "interactive-preview") {
        setMeshRuntimeQuality("interactive-preview");
      }
    }
  }, [canUseMeshInteractionLod, clearMeshInteractionIdleTimer, finalizeMeshInteraction, meshInteractionQualityMode]);
  useEffect(() => {
    return () => {
      clearMeshInteractionIdleTimer();
    };
  }, [clearMeshInteractionIdleTimer]);

    const onProbeRef = useRef<Props["onProbe"] | undefined>(undefined);
    useEffect(() => {
      onProbeRef.current = onProbe;
    }, [onProbe]);
    useEffect(() => {
      onCameraTourEventRef.current = onCameraTourEvent;
    }, [onCameraTourEvent]);
    useEffect(() => {
      onPerformanceSnapshotRef.current = onPerformanceSnapshot;
    }, [onPerformanceSnapshot]);
    useEffect(() => {
      onMeshInteractionStateChangeRef.current = onMeshInteractionStateChange;
    }, [onMeshInteractionStateChange]);
    useEffect(() => {
      lastMeshBuildMsRef.current = Number.isFinite(lastMeshBuildMs) ? Number(lastMeshBuildMs) : null;
    }, [lastMeshBuildMs]);

  const stopCameraTourCapture = useCallback((reason: "completed" | "stopped" | "interrupted") => {
    const stop = cameraTourCaptureStopRef.current;
    if (!stop) return;
    stop(reason);
  }, []);

  const stopCameraTour = useCallback(
    (reason: "stopped" | "interrupted", notify = true) => {
      const hadActiveTour = cameraTourFrameRef.current != null;
      cameraTourRunIdRef.current += 1;
      if (cameraTourFrameRef.current != null) {
        cancelAnimationFrame(cameraTourFrameRef.current);
        cameraTourFrameRef.current = null;
      }
      stopCameraTourCapture(reason);
      if (notify && (hadActiveTour || reason !== "stopped")) {
        onCameraTourEventRef.current?.(reason);
      }
    },
    [stopCameraTourCapture]
  );
  const interruptCameraTour = useCallback(() => {
    stopCameraTour("interrupted");
  }, [stopCameraTour]);

  useEffect(() => {
    const onCaptureAutoFit = (event: Event) => {
      const cam = cameraRef.current;
      const controls = controlsRef.current;
      if (!cam || !controls) return;

      const center = centerRef.current;
      const radius = radiusRef.current;
      const detail = (event as CustomEvent<{ padding?: number; direction?: { x?: number; y?: number; z?: number } }>)
        .detail;
      const paddingRaw = Number(detail?.padding);
      const padding = Number.isFinite(paddingRaw) ? Math.max(1.05, Math.min(1.8, paddingRaw)) : 1.34;
      const aspectRaw = Number((detail as { aspect?: number } | undefined)?.aspect);
      const effectiveAspect = Number.isFinite(aspectRaw) ? Math.max(0.75, Math.min(3, aspectRaw)) : cam.aspect;
      const fovY = THREE.MathUtils.degToRad(cam.fov);
      const tanY = Math.tan(Math.max(1e-3, fovY * 0.5));
      const tanX = tanY * Math.max(1e-3, effectiveAspect);

      const dir = new THREE.Vector3(1, 0.68, 1.2);
      const dx = Number(detail?.direction?.x);
      const dy = Number(detail?.direction?.y);
      const dz = Number(detail?.direction?.z);
      if (Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(dz)) {
        dir.set(dx, dy, dz);
      }
      if (dir.lengthSq() < 1e-8) dir.set(1, 0.68, 1.2);
      dir.normalize();

      let requiredDist = Number.NaN;
      const sampleSet = sampleSetRef.current;
      const samples = sampleSet?.samples;
      if (samples?.length && Number.isFinite(tanX) && tanX > 1e-6 && Number.isFinite(tanY) && tanY > 1e-6) {
        const forward = dir.clone().multiplyScalar(-1);
        const worldUp = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(worldUp, forward);
        if (right.lengthSq() < 1e-8) {
          worldUp.set(0, 0, 1);
          right.crossVectors(worldUp, forward);
        }
        right.normalize();
        const up = new THREE.Vector3().crossVectors(forward, right).normalize();
        const rel = new THREE.Vector3();
        let maxDist = 0;
        let used = 0;
        for (const sample of samples) {
          const p = sample?.position;
          if (!p) continue;
          rel.copy(p).sub(center);
          const alongViewDir = rel.dot(dir);
          const projectedX = Math.abs(rel.dot(right));
          const projectedY = Math.abs(rel.dot(up));
          const distForX = alongViewDir + (projectedX * padding) / tanX;
          const distForY = alongViewDir + (projectedY * padding) / tanY;
          maxDist = Math.max(maxDist, alongViewDir + 1e-3, distForX, distForY);
          used += 1;
        }
        if (used > 0 && Number.isFinite(maxDist) && maxDist > 0) {
          requiredDist = maxDist;
        }
      }

      if (!(Number.isFinite(requiredDist) && requiredDist > 0)) {
        if (!Number.isFinite(radius) || radius <= 0) return;
        const fovX = 2 * Math.atan(Math.tan(fovY * 0.5) * effectiveAspect);
        const minFov = Math.max(1e-3, Math.min(fovY, fovX));
        requiredDist = (radius * padding) / Math.sin(minFov * 0.5);
        if (!Number.isFinite(requiredDist) || requiredDist <= 0) return;
      }

      cam.position.copy(center).addScaledVector(dir, requiredDist);
      cam.up.set(0, 1, 0);
      controls.target.copy(center);
      cam.lookAt(center);
      controls.update();
    };

    window.addEventListener("math3d:capture-autofit", onCaptureAutoFit as EventListener);
    return () => window.removeEventListener("math3d:capture-autofit", onCaptureAutoFit as EventListener);
  }, []);

  useEffect(() => {
    selectRegionEnabledRef.current = selectRegionEnabled;
  }, [selectRegionEnabled]);

  useEffect(() => {
    onSelectionPickRef.current = onSelectionPick;
  }, [onSelectionPick]);
  useEffect(() => {
    geodesicPathEnabledRef.current = geodesicPathEnabled;
  }, [geodesicPathEnabled]);
  useEffect(() => {
    onGeodesicPathPickRef.current = onGeodesicPathPick;
  }, [onGeodesicPathPick]);
  useEffect(() => {
    geodesicHeatEnabledRef.current = geodesicHeatEnabled;
  }, [geodesicHeatEnabled]);
  useEffect(() => {
    onGeodesicHeatPickRef.current = onGeodesicHeatPick;
  }, [onGeodesicHeatPick]);
  useEffect(() => {
    geodesicDiskPickEnabledRef.current = geodesicDiskPickEnabled;
  }, [geodesicDiskPickEnabled]);
  useEffect(() => {
    onGeodesicDiskPickRef.current = onGeodesicDiskPick;
  }, [onGeodesicDiskPick]);
  useEffect(() => {
    showChartGridRef.current = showChartGrid;
  }, [showChartGrid]);
  useEffect(() => {
    surfaceCellSelectionEnabledRef.current = surfaceCellSelectionEnabled;
  }, [surfaceCellSelectionEnabled]);
  useEffect(() => {
    onSurfaceCellSelectionEnabledChange?.(surfaceCellSelectionEnabled);
  }, [onSurfaceCellSelectionEnabledChange, surfaceCellSelectionEnabled]);
  useEffect(() => {
    if (surfaceId === "surface_mesh") {
      setSurfaceCellSelectionEnabled(false);
    }
  }, [surfaceId]);
  useEffect(() => {
    inspectEnabledRef.current = inspectEnabled;
  }, [inspectEnabled]);
  useEffect(() => {
    inspectSelectionMeshKeyRef.current = inspectSelectionMeshKey;
  }, [inspectSelectionMeshKey]);
  useEffect(() => {
    onInspectPickRef.current = onInspectPick;
  }, [onInspectPick]);
  useEffect(() => {
    onInspectHoverRef.current = onInspectHover;
  }, [onInspectHover]);
  useEffect(() => {
    dragEnabledRef.current = dragEnabled;
  }, [dragEnabled]);
  useEffect(() => {
    dragPlaneAnchorRef.current = dragPlaneAnchor;
  }, [dragPlaneAnchor]);
  useEffect(() => {
    onDragStartRef.current = onDragStart;
  }, [onDragStart]);
  useEffect(() => {
    onDragRef.current = onDrag;
  }, [onDrag]);
  useEffect(() => {
    onDragEndRef.current = onDragEnd;
  }, [onDragEnd]);
  useEffect(() => {
    onShiftWheelScaleRef.current = onShiftWheelScale;
  }, [onShiftWheelScale]);
  useEffect(() => {
    if (!showChartGrid || chartGridMode !== "mesh-face") {
      setSelectedSurfaceCellIndex(null);
      setSelectedSurfaceCellInfo(null);
      setSurfaceCellInvalidRows([]);
      setSurfaceCellDiagnostics({
        validCells: 0,
        maskedCells: 0,
        invalidCells: 0,
        skippedNonFinite: 0,
        skippedDegenerate: 0,
        skippedOutOfBounds: 0,
        minArea: null,
        maxArea: null,
        avgArea: null,
      });
    }
  }, [showChartGrid, chartGridMode]);
  useEffect(() => {
    if (!surfaceCellSelectionEnabled) {
      setSelectedSurfaceCellIndex(null);
      setSelectedSurfaceCellInfo(null);
    }
  }, [surfaceCellSelectionEnabled]);
  useEffect(() => {
    onGizmoTransformRef.current = onGizmoTransform;
  }, [onGizmoTransform]);
  useEffect(() => {
    gizmoModeRef.current = gizmoMode;
  }, [gizmoMode]);
  useEffect(() => {
    suspendRenderingRef.current = suspendRendering;
  }, [suspendRendering]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const canvas = renderer.domElement;
    if (!canvas) return;

    const releaseAllPointerCapture = () => {
      const dragState = dragStateRef.current;
      if (dragState && typeof canvas.releasePointerCapture === "function") {
        try {
          canvas.releasePointerCapture(dragState.pointerId);
        } catch {
          // Ignore capture release errors for stale pointer ids.
        }
      }
      dragStateRef.current = null;
      endMeshInteraction();
      if (
        typeof canvas.hasPointerCapture === "function" &&
        typeof canvas.releasePointerCapture === "function"
      ) {
        for (let pointerId = 0; pointerId <= 32; pointerId += 1) {
          try {
            if (canvas.hasPointerCapture(pointerId)) {
              canvas.releasePointerCapture(pointerId);
            }
          } catch {
            // Ignore unsupported/stale pointer ids.
          }
        }
      }
      const controls = controlsRef.current;
      if (controls) controls.enabled = true;
    };

    if (suspendPointerInteractions) {
      releaseAllPointerCapture();
      canvas.style.pointerEvents = "none";
      return () => {
        canvas.style.pointerEvents = "";
      };
    }
    canvas.style.pointerEvents = "";
  }, [suspendPointerInteractions, sceneEpoch, endMeshInteraction]);

  const showProbeNormalRef = useRef(showProbeNormal);
  const showProbeTangentPlaneRef = useRef(showProbeTangentPlane);
  const showProbeTangentsRef = useRef(showProbeTangents);

  useEffect(() => {
    showProbeNormalRef.current = showProbeNormal;
    showProbeTangentPlaneRef.current = showProbeTangentPlane;
    showProbeTangentsRef.current = showProbeTangents;
  }, [showProbeNormal, showProbeTangentPlane, showProbeTangents]);

  useEffect(() => {
    if (!probeEnabled) {
      setProbeXY(null);
      setProbeHudLines([]);
      prevPrincipalRef.current = null;
      probePointRef.current = null;
      probeNormalRef.current = null;
      if (principalGroupRef.current) clearGroup(principalGroupRef.current);
      const widgets = probeWidgetsRef.current;
      if (widgets) {
        widgets.marker.visible = false;
        widgets.normal.visible = false;
        widgets.plane.visible = false;
        widgets.t1.visible = false;
        widgets.t2.visible = false;
      }
    }
  }, [probeEnabled]);

  useEffect(() => {
    setProbeHudLines([]);
    prevPrincipalRef.current = null;
    if (principalGroupRef.current) clearGroup(principalGroupRef.current);
  }, [surfaceId, graphExpr, implicitExpr, graphDomain?.xSpan, graphDomain?.ySpan]);

  const applyCameraView = (view: GizmoView) => {
    const cam = cameraRef.current;
    const controls = controlsRef.current;
    if (!cam || !controls) return;

    const center = centerRef.current ?? new THREE.Vector3(0, 0, 0);
    const d = (radiusRef.current || 3) * 2.0;

    if (view === "xy") {
      cam.position.set(center.x, center.y, center.z + d);
      cam.up.set(0, 1, 0);
    } else if (view === "xyNeg") {
      cam.position.set(center.x, center.y, center.z - d);
      cam.up.set(0, 1, 0);
    } else if (view === "xz") {
      cam.position.set(center.x, center.y + d, center.z);
      cam.up.set(0, 0, 1);
    } else if (view === "xzNeg") {
      cam.position.set(center.x, center.y - d, center.z);
      cam.up.set(0, 0, -1);
    } else if (view === "yz") {
      cam.position.set(center.x + d, center.y, center.z);
      cam.up.set(0, 1, 0);
    } else if (view === "yzNeg") {
      cam.position.set(center.x - d, center.y, center.z);
      cam.up.set(0, 1, 0);
    } else if (view === "iso") {
      const isoDir = new THREE.Vector3(1, 0.85, 1.12).normalize();
      cam.position.copy(center).addScaledVector(isoDir, d * 1.08);
      cam.up.set(0, 1, 0);
    }

    controls.target.copy(center);
    cam.lookAt(center);
    controls.update();
  };

  const applyNamedGizmoView = useCallback((view: GizmoMenuView) => {
    const mapping: Record<GizmoMenuView, GizmoView> = {
      front: "xy",
      back: "xyNeg",
      right: "yz",
      left: "yzNeg",
      top: "xz",
      bottom: "xzNeg",
      iso: "iso",
    };
    setViewMode(mapping[view]);
    setViewGizmoMenuOpen(false);
  }, []);

  const handleResetCameraFromGizmo = useCallback(() => {
    setViewMode("free");
    setLockToAxisPlane(false);
    setViewGizmoMenuOpen(false);
    forceReframeRef.current?.();
  }, []);

  useEffect(() => {
    setViewMode("free");
    setLockToAxisPlane(false);
    setViewGizmoMenuOpen(false);
  }, [resetToken]);

  useEffect(() => {
    if (showOverlayControls && showViewGizmo && !gizmoEnabled) return;
    setViewGizmoMenuOpen(false);
  }, [gizmoEnabled, showOverlayControls, showViewGizmo]);

  useEffect(() => {
    if (!windowReframeToken) return;
    const apply = () => {
      forceReframeRef.current?.();
    };
    apply();
    const raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [windowReframeToken]);

  useEffect(() => {
    const controls = controlsRef.current;
    const cam = cameraRef.current;
    if (!controls || !cam) return;

    if (lockToSlicePlane) return;
    const shouldLock = lockToAxisPlane && viewMode !== "free";
    controls.enableRotate = !shouldLock;

    if (viewMode === "free") return;
    applyCameraView(viewMode as GizmoView);
  }, [viewMode, lockToAxisPlane, lockToSlicePlane]);

  useEffect(() => {
    const controls = controlsRef.current;
    const cam = cameraRef.current;
    if (!controls || !cam) return;

    if (!lockToSlicePlane || !slicePlaneEnabled) {
      if (lockSliceRestoreRef.current) {
        controls.enableRotate = lockSliceRestoreRef.current.rotate;
        controls.enablePan = lockSliceRestoreRef.current.pan;
        controls.enableZoom = lockSliceRestoreRef.current.zoom;
        lockSliceRestoreRef.current = null;
        controls.update();
      }
      return;
    }

    if (!lockSliceRestoreRef.current) {
      lockSliceRestoreRef.current = {
        rotate: controls.enableRotate,
        pan: controls.enablePan,
        zoom: controls.enableZoom,
      };
    }

    controls.enableRotate = false;
    controls.enablePan = false;
    controls.enableZoom = true;

    const frame = sliceFrameRef.current ?? buildSliceFrame();
    sliceFrameRef.current = {
      n: frame.n.clone(),
      e1: frame.e1.clone(),
      e2: frame.e2.clone(),
      x0: frame.x0.clone(),
      size: frame.size,
    };

    const target = frame.x0;
    const currentDist = cam.position.distanceTo(target);
    const minDist = Math.max(frame.size * 1.6, radiusRef.current || 3);
    const dist = Math.max(minDist, currentDist);

    controls.target.copy(target);
    cam.position.copy(target).add(frame.n.clone().multiplyScalar(dist));
    cam.up.copy(frame.e2);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    controls.update();
  }, [
    lockToSlicePlane,
    slicePlaneEnabled,
    slicePlaneTheta,
    slicePlanePhi,
    slicePlaneOffset,
    slicePlaneSize,
  ]);

  const isGraphId = (id: SurfaceId) =>
    id === "graph_saddle" ||
    id === "graph_rotatedSaddle" ||
    id === "graph_monkey" ||
    id === "graph_wave" ||
    id === "graph_paraboloid" ||
    id === "graph_gaussian" ||
    id === "graph_ripple" ||
    id === "graph_mexican" ||
    id === "graph_sinSum" ||
    id === "graph_sinc" ||
    id === "graph_sinc2" ||
    id === "graph_custom";

  const isImplicitId = (id: SurfaceId) =>
    id === "sphere" ||
    id === "hyperboloid" ||
    id === "paraboloid" ||
    id === "cone" ||
    id === "cylinder" ||
    id === "hyperboloid_twoSheet" ||
    id === "ellipsoid" ||
    id === "torus_implicit" ||
    id === "gyroid" ||
    id === "superquadric" ||
    id === "roman" ||
    id === "scherk" ||
    id === "implicit_custom";

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const sliceNormalFromAngles = () => {
    const sinT = Math.sin(slicePlaneTheta);
    const n = new THREE.Vector3(
      sinT * Math.cos(slicePlanePhi),
      sinT * Math.sin(slicePlanePhi),
      Math.cos(slicePlaneTheta)
    );
    if (n.lengthSq() < 1e-12) n.set(0, 0, 1);
    return n.normalize();
  };

  const buildSliceFrame = () => {
    const n = sliceNormalFromAngles();
    const { e1, e2 } = makePlaneBasis(n);
    const size = Math.max(0.5, slicePlaneSize);
    const x0 = n.clone().multiplyScalar(slicePlaneOffset);
    return { n, e1, e2, x0, size };
  };

  const applySlicePreset = (preset: SlicePreset) => {
    setSlicePlanePreset(preset);
    if (preset === "xy") {
      setSlicePlaneTheta(0);
      setSlicePlanePhi(0);
    } else if (preset === "yz") {
      setSlicePlaneTheta(Math.PI / 2);
      setSlicePlanePhi(0);
    } else if (preset === "xz") {
      setSlicePlaneTheta(Math.PI / 2);
      setSlicePlanePhi(Math.PI / 2);
    }
  };

  const formatSliceTimestamp = () => {
    const d = new Date();
    const pad2 = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  };

  const downloadTextFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const buildSliceCsv = () => {
    const frame = sliceFrameRef.current ?? buildSliceFrame();
    const { x0, e1, e2 } = frame;
    const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(6) : "NaN");
    const lines: string[] = ["polyline_id,index,s,t,x,y,z"];

    for (let pid = 0; pid < slicePolylines2D.length; pid++) {
      const line = slicePolylines2D[pid];
      for (let i = 0; i < line.length; i++) {
        const { s, t } = line[i];
        const x = x0.x + e1.x * s + e2.x * t;
        const y = x0.y + e1.y * s + e2.y * t;
        const z = x0.z + e1.z * s + e2.z * t;
        lines.push([pid, i, fmt(s), fmt(t), fmt(x), fmt(y), fmt(z)].join(","));
      }
    }
    return lines.join("\n");
  };

  const handleExportCsv = () => {
    if (!slicePlaneEnabled || slicePolylines2D.length === 0) return;
    const csv = buildSliceCsv();
    const filename = `slice_${surfaceId}_${formatSliceTimestamp()}.csv`;
    downloadTextFile(csv, filename, "text/csv;charset=utf-8");
  };

  const handleExportSvg = () => {
    if (!slicePlaneEnabled || slicePolylines2D.length === 0) return;
    const svg = buildSliceSvgString({
      polylines: slicePolylines2D,
      planeSize: slicePlaneSize,
      width: 150,
      height: 150,
      pad: 12,
    });
    const filename = `slice_${surfaceId}_${formatSliceTimestamp()}.svg`;
    downloadTextFile(svg, filename, "image/svg+xml;charset=utf-8");
  };

  const handleCopySliceJson = async () => {
    if (!slicePlaneEnabled || slicePolylines2D.length === 0) return;
    const frame = sliceFrameRef.current ?? buildSliceFrame();
    const payload = {
      surfaceId,
      plane: {
        thetaDeg: toDeg(slicePlaneTheta),
        phiDeg: toDeg(slicePlanePhi),
        offset: slicePlaneOffset,
        planeSize: slicePlaneSize,
        n: [frame.n.x, frame.n.y, frame.n.z],
        e1: [frame.e1.x, frame.e1.y, frame.e1.z],
        e2: [frame.e2.x, frame.e2.y, frame.e2.z],
        X0: [frame.x0.x, frame.x0.y, frame.x0.z],
      },
      polylinesST: slicePolylines2D,
    };
    const json = JSON.stringify(payload, null, 2);

    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(json);
        return;
      } catch (err) {
        console.warn("[slice] clipboard write failed", err);
      }
    } else {
      console.warn("[slice] clipboard API unavailable");
    }
    window.alert("Clipboard unavailable. Try exporting CSV or SVG instead.");
  };

  const getImplicitFallback = (id: SurfaceId) => {
    switch (id) {
      case "sphere":
        return (x: number, y: number, z: number) => x * x + y * y + z * z - 1;
      case "cylinder":
        return (x: number, y: number, z: number) => x * x + z * z - 1 + y * 0;
      case "cone": {
        const r = 1.2;
        const h = 2.4;
        return (x: number, y: number, z: number) => {
          const ry = (r / h) * (h * 0.5 - y);
          return x * x + z * z - ry * ry;
        };
      }
      case "paraboloid":
        return (x: number, y: number, z: number) => y - (x * x + z * z);
      case "hyperboloid": {
        const a = 0.8;
        const c = 0.6;
        return (x: number, y: number, z: number) => (x * x) / (a * a) + (z * z) / (a * a) - (y * y) / (c * c) - 1;
      }
      default:
        return null;
    }
  };

  const [graphCompileError, setGraphCompileError] = useState<string | null>(null);
  const [implicitCompileError, setImplicitCompileError] = useState<string | null>(null);

  const graphFnRef = useRef<((x: number, y: number) => number) | null>(null);
  const implicitFnRef = useRef<((x: number, y: number, z: number) => number) | null>(null);

  // compile graphExpr safely
  useEffect(() => {
    if (surfaceId !== "graph_custom") return;

    const src = (graphExpr ?? "").trim();
    const r = compileExpression(src, ["x", "y"]);
    if (r.error) {
      graphFnRef.current = null;
      setGraphCompileError(`${r.error.message} (col ${r.error.col})`);
      return;
    }

    const fn = r.fn!;
    graphFnRef.current = (x, y) => {
      const v = fn({ x, y });
      if (!Number.isFinite(v)) return 0;
      const LIM = 1e4;
      if (v > LIM) return LIM;
      if (v < -LIM) return -LIM;
      return v;
    };
    setGraphCompileError(null);
  }, [surfaceId, graphExpr]);

  // compile implicitExpr safely
  useEffect(() => {
    if (surfaceId !== "implicit_custom") return;

    const src = (implicitExpr ?? "").trim();
    if (!src) {
      implicitFnRef.current = null;
      setImplicitCompileError("Expression is empty.");
      return;
    }

    const r = compileExpression(src, ["x", "y", "z"]);
    if (r.error) {
      implicitFnRef.current = null;
      setImplicitCompileError(`${r.error.message} (col ${r.error.col})`);
      return;
    }

    const fn = r.fn!;
    implicitFnRef.current = (x, y, z) => {
      const v = fn({ x, y, z });
      return Number.isFinite(v) ? v : 1e3;
    };
    setImplicitCompileError(null);
  }, [surfaceId, implicitExpr]);

  const getGraphF = (): ((x: number, y: number) => number) => {
    if (surfaceId === "graph_saddle") return (x, y) => 0.4 * (x * x - y * y);
    if (surfaceId === "graph_rotatedSaddle") return (x, y) => 0.8 * x * y;
    if (surfaceId === "graph_monkey") return (x, y) => 0.2 * (x * x * x - 3 * x * y * y);
    if (surfaceId === "graph_wave") return (x, y) => 0.6 * Math.sin(x * 1.3) * Math.cos(y * 1.3);
    if (surfaceId === "graph_paraboloid") return (x, y) => 0.3 * (x * x + y * y);
    if (surfaceId === "graph_gaussian") return (x, y) => Math.exp(-0.7 * (x * x + y * y));
    if (surfaceId === "graph_ripple") return (x, y) => {
      const r = Math.sqrt(x * x + y * y);
      return r < 1e-4 ? 1 : Math.sin(3 * r) / (3 * r);
    };
    if (surfaceId === "graph_mexican") return (x, y) => {
      const r2 = x * x + y * y;
      return (1 - r2) * Math.exp(-0.5 * r2);
    };
    if (surfaceId === "graph_sinSum") return (x, y) => 0.45 * (Math.sin(x) + Math.cos(y));
    if (surfaceId === "graph_sinc") return (x, y) => {
      const r = Math.sqrt(x * x + y * y);
      return r < 1e-4 ? 1 : Math.sin(r) / r;
    };
    if (surfaceId === "graph_sinc2") return (x, y) => {
      const r = Math.sqrt(x * x + y * y);
      return Math.sin(2 * r) / (1 + r * r);
    };

    // graph_custom: compiled
    return graphFnRef.current ?? ((x, y) => x * x - y * y);
  };

  const getGraphSpan = (xFallback: number, yFallback: number) => ({
    xSpan: graphDomain?.xSpan ?? xFallback,
    ySpan: graphDomain?.ySpan ?? yFallback,
  });

  const lastCameraSyncRef = useRef<CameraSyncState | null>(null);

  // update vertex colors / wireframe without rebuilding full scene
  useEffect(() => {
    const root = surfaceObjRef.current;
    if (!root) return;

    const f = isGraphId(surfaceId) ? getGraphF() : null;
    const activeHeatmapValues =
      overlayHeatmapEnabled && overlayHeatmapValues?.length
        ? overlayHeatmapValues
        : geodesicHeatmapEnabled && geodesicHeatmapValues?.length
        ? geodesicHeatmapValues
        : null;

    root.traverse((o) => {
      const anyO = o as any;
      if (isImplicitMeshObj(anyO)) {
        const implicitMeta = (anyO as any).userData?.__implicit as
          | { f: (x: number, y: number, z: number) => number }
          | undefined;
        const useHeatmap = !!activeHeatmapValues?.length;
        const posAttr = anyO.geometry?.getAttribute("position") as THREE.BufferAttribute | null;
        const heatmapOk = useHeatmap && !!posAttr && posAttr.count === activeHeatmapValues!.length;
        const useImplicitCurv =
          !heatmapOk && effectiveImplicitOverlay === "curvature" && typeof implicitMeta?.f === "function";
        const useScalarColors = !heatmapOk && !useImplicitCurv && colorMode !== "solid";

        const mats = Array.isArray(anyO.material) ? anyO.material : [anyO.material];
        for (const m of mats) {
          if (!m) continue;
          (m as any).wireframe = !!effectiveWireframe;
          (m as any).vertexColors = useImplicitCurv || heatmapOk || useScalarColors;
          (m as any).roughness = materialRoughness;
          (m as any).metalness = materialMetalness;
          (m as any).transparent = clamp01(materialOpacity) < 1;
          (m as any).opacity = clamp01(materialOpacity);
          if (heatmapOk || useImplicitCurv || useScalarColors) {
            (m as any).color?.set(0xffffff);
          } else if (colorMode === "solid") {
            (m as any).color?.set(solidColorForPalette(colorPalette));
          } else {
            (m as any).color?.set(0xffffff);
          }
          m.needsUpdate = true;
        }
        if (anyO.geometry) {
          if (heatmapOk) {
            applyHeatmapColors(anyO.geometry, activeHeatmapValues!, colorPalette);
          } else if (useImplicitCurv && implicitMeta?.f) {
            applyImplicitCurvatureColors(anyO.geometry, implicitMeta.f, colorPalette);
          } else if (useScalarColors) {
            applyVertexColors(anyO.geometry, colorMode, colorPalette);
          } else if (anyO.geometry.getAttribute("color")) {
            anyO.geometry.deleteAttribute("color");
          }
        }
        return;
      }

      if (anyO?.isMesh && anyO.geometry) {
        const mesh = anyO as THREE.Mesh;
        const geom = mesh.geometry as THREE.BufferGeometry;
        const style = (mesh as any)?.userData?.__surfaceMeshOverrideStyle as
          | {
              color?: number;
              opacity?: number;
              roughness?: number;
              metalness?: number;
              wireframe?: boolean;
              flatShading?: boolean;
            }
          | undefined;
        const meshOpacity = clamp01((style?.opacity ?? 1) * materialOpacity);
        const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
        const heatmapOk =
          !!activeHeatmapValues?.length && !!posAttr && posAttr.count === activeHeatmapValues.length;

        debugMesh("[recolorTraverse] BEFORE", mesh, { surfaceId, colorMode, colorPalette });

        if (heatmapOk) {
          applyHeatmapColors(geom, activeHeatmapValues!, colorPalette);
        } else if (colorMode === "solid") {
          geom.deleteAttribute("color");
        } else if (colorMode === "curvature" && f) {
          applyCurvatureHeatToGraph(geom, f, colorPalette);
        } else {
          applyVertexColors(geom, colorMode, colorPalette);
        }

        debugMesh("[recolorTraverse] AFTER", mesh, { surfaceId, colorMode, colorPalette });

        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!m) continue;
          (m as any).wireframe = style?.wireframe ?? !!effectiveWireframe;
          (m as any).flatShading = !!style?.flatShading;
          (m as any).vertexColors = heatmapOk || colorMode !== "solid";
          (m as any).roughness = clamp01(style?.roughness ?? materialRoughness);
          (m as any).metalness = clamp01(style?.metalness ?? materialMetalness);
          (m as any).transparent = meshOpacity < 1;
          (m as any).opacity = meshOpacity;
          if (heatmapOk) {
            (m as any).color?.set(0xffffff);
          } else if (colorMode === "solid") {
            (m as any).color?.set(style?.color ?? solidColorForPalette(colorPalette));
          } else {
            (m as any).color?.set(0xffffff);
          }
          m.needsUpdate = true;

          if (DBG_COLORS) {
            console.log("[recolorTraverse] mat", {
              type: (m as any).type,
              vertexColors: !!(m as any).vertexColors,
              wireframe: !!(m as any).wireframe,
            });
          }
        }
      }
    });

  }, [
    surfaceId,
    graphExpr,
    colorMode,
    colorPalette,
    effectiveWireframe,
    materialRoughness,
    materialMetalness,
    materialOpacity,
    effectiveImplicitOverlay,
    geodesicHeatmapEnabled,
    geodesicHeatmapValues,
    overlayHeatmapEnabled,
    overlayHeatmapValues,
    implicitMeshToken,
  ]);

  // --- rebuild contour lines (graph + implicit) ---
  useEffect(() => {
    const root = surfaceObjRef.current;
    if (!root) return;

    // remove old contours
    for (const ch of [...root.children]) {
      if ((ch as any)?.userData?.__contours) {
        ch.traverse(disposeObject3D);
        root.remove(ch);
      }
    }

    const isGraphSurface = isGraphId(surfaceId);
    const isImplicitSurface = isImplicitId(surfaceId);
    const isMeshSurface = surfaceId === "surface_mesh";
    if (!isGraphSurface && !isImplicitSurface) return;
    if (!showContours || contourCount <= 0) return;

    if (isGraphSurface) {
      const f = getGraphF();
      const spans = (root as any).userData?.__graph as { xSpan: number; ySpan: number } | undefined;
      const xSpan = spans?.xSpan ?? 1.5;
      const ySpan = spans?.ySpan ?? 1.5;

      const contours = makeGraphContourLines(f, xSpan, ySpan, contourCount);
      (contours as any).userData = { ...(contours as any).userData, __contours: true };
      root.add(contours);
      return;
    }

    if (isImplicitSurface) {
      let implicitF: ((x: number, y: number, z: number) => number) | null = null;
      let implicitSize: number | null = null;

      root.traverse((obj) => {
        if (implicitF) return;
        const anyObj = obj as any;
        if (isImplicitMeshObj(anyObj)) {
          const meta = anyObj.userData?.__implicit as { f: (x: number, y: number, z: number) => number; size?: number } | undefined;
          if (meta?.f) {
            implicitF = meta.f;
            if (typeof meta.size === "number") implicitSize = meta.size;
          }
        }
      });

      if (!implicitF) {
        const fallback = getImplicitFallback(surfaceId);
        if (fallback) implicitF = fallback;
      }

      if (!implicitF) return;

      let size = implicitSize ?? 0;
      if (!Number.isFinite(size) || size <= 0) {
        const box = new THREE.Box3().setFromObject(root);
        const sizeVec = new THREE.Vector3();
        box.getSize(sizeVec);
        size = Math.max(sizeVec.x, sizeVec.y, sizeVec.z) * 0.5;
        if (!Number.isFinite(size) || size <= 0) size = radiusRef.current || 2.5;
      }

      const pad = Math.max(1e-4, size * 1e-3);
      const y0 = -size + pad;
      const y1 = size - pad;
      if (y1 <= y0) return;

      const levels: number[] = [];
      for (let k = 1; k <= contourCount; k++) {
        const t = k / (contourCount + 1);
        levels.push(y0 + t * (y1 - y0));
      }

      const gridN = Math.max(40, Math.round(implicitResolution * 1.5));
      const xMin = -size;
      const xMax = size;
      const zMin = -size;
      const zMax = size;
      const dx = (xMax - xMin) / (gridN - 1);
      const dz = (zMax - zMin) / (gridN - 1);

      const contourGroup = new THREE.Group();
      (contourGroup as any).userData = { ...(contourGroup as any).userData, __contours: true };

      const lineMat = new THREE.LineBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.85,
      });

      const yOffset = Math.max(0.001, size * 0.0015);

      for (const yLevel of levels) {
        const polylines = marchingSquares({
          nx: gridN,
          ny: gridN,
          xMin,
          xMax,
          yMin: zMin,
          yMax: zMax,
          level: 0,
          sample: (i, j) => {
            const x = xMin + i * dx;
            const z = zMin + j * dz;
            const v = implicitF!(x, yLevel, z);
            return Number.isFinite(v) ? v : NaN;
          },
        });

        for (const poly of polylines) {
          if (poly.length < 2) continue;
          const pts: THREE.Vector3[] = [];
          for (const pt of poly) {
            const x = pt.x;
            const z = pt.y;
            if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
            pts.push(new THREE.Vector3(x, yLevel + yOffset, z));
          }
          if (pts.length < 2) continue;
          const geom = new THREE.BufferGeometry().setFromPoints(pts);
          const line = new THREE.Line(geom, lineMat);
          line.renderOrder = 10;
          contourGroup.add(line);
        }
      }

      if (contourGroup.children.length > 0) {
        root.add(contourGroup);
      } else {
        lineMat.dispose();
      }
    }
  }, [
    surfaceId,
    graphExpr,
    implicitExpr,
      showContours,
      contourCount,
      graphDomain?.xSpan,
      graphDomain?.ySpan,
      implicitResolution,
      implicitMeshToken,
    ]);

  // --- slicing plane + intersection (graph + implicit surfaces) ---
  useEffect(() => {
    const group = sliceGroupRef.current;
    if (!group) return;

    clearGroup(group);

    if (!slicePlaneEnabled) {
      setSlicePolylines2D([]);
      sliceFrameRef.current = null;
      return;
    }

    const isGraphSurface = isGraphId(surfaceId);
    const isImplicitSurface = isImplicitId(surfaceId);
    if (!isGraphSurface && !isImplicitSurface) {
      setSlicePolylines2D([]);
      sliceFrameRef.current = null;
      return;
    }

    const frame = buildSliceFrame();
    sliceFrameRef.current = {
      n: frame.n.clone(),
      e1: frame.e1.clone(),
      e2: frame.e2.clone(),
      x0: frame.x0.clone(),
      size: frame.size,
    };

    const planeGeom = new THREE.PlaneGeometry(frame.size, frame.size, 1, 1);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x9aa3ad,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    (planeMat as any).polygonOffset = true;
    (planeMat as any).polygonOffsetFactor = -1;
    (planeMat as any).polygonOffsetUnits = -1;

    const planeMesh = new THREE.Mesh(planeGeom, planeMat);
    planeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), frame.n);
    planeMesh.position.copy(frame.x0);
    planeMesh.renderOrder = 8;
    group.add(planeMesh);

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x1f3556,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    });

    const lineOffset = Math.max(0.001, (radiusRef.current || 3) * 0.002);
    const normalOffset = frame.n.clone().multiplyScalar(lineOffset);

    if (isGraphSurface) {
      const f = getGraphF();
      const root = surfaceObjRef.current as THREE.Object3D | null;
      const meta = root ? (root as any).userData?.__graph as { xSpan: number; ySpan: number } | undefined : undefined;
      const xSpan = meta?.xSpan ?? graphDomain?.xSpan ?? 1.5;
      const ySpan = meta?.ySpan ?? graphDomain?.ySpan ?? 1.5;

      const xMin = -xSpan;
      const xMax = xSpan;
      const yMin = -ySpan;
      const yMax = ySpan;

      const nx = Math.max(30, Math.round(graphResolution));
      const ny = Math.max(30, Math.round(graphResolution));

      const dx = (xMax - xMin) / (nx - 1);
      const dy = (yMax - yMin) / (ny - 1);

      const polylines = marchingSquares({
        nx,
        ny,
        xMin,
        xMax,
        yMin,
        yMax,
        level: 0,
        sample: (i, j) => {
          const x = xMin + i * dx;
          const y = yMin + j * dy;
          const z = f(x, y);
          if (!Number.isFinite(z)) return NaN;
          return frame.n.x * x + frame.n.y * z + frame.n.z * y - slicePlaneOffset;
        },
      });

      const polylines2D: Array<Array<{ s: number; t: number }>> = [];

      for (const poly of polylines) {
        if (poly.length < 2) continue;
        const pts: THREE.Vector3[] = [];
        const pts2D: Array<{ s: number; t: number }> = [];
        for (const pt of poly) {
          const z = f(pt.x, pt.y);
          if (!Number.isFinite(z)) continue;
          const world = new THREE.Vector3(pt.x, z, pt.y);
          const rel = world.clone().sub(frame.x0);
          const s = rel.dot(frame.e1);
          const t = rel.dot(frame.e2);
          pts2D.push({ s, t });
          pts.push(world.add(normalOffset));
        }
        if (pts.length < 2) continue;
        if (pts2D.length >= 2) polylines2D.push(pts2D);
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geom, lineMat);
        line.renderOrder = 12;
        group.add(line);
      }
      setSlicePolylines2D(polylines2D);
    } else if (isImplicitSurface) {
      const root = surfaceObjRef.current as THREE.Object3D | null;
      let implicitF: ((x: number, y: number, z: number) => number) | null = null;

      if (root) {
        root.traverse((obj) => {
          if (implicitF) return;
          const anyObj = obj as any;
          if (isImplicitMeshObj(anyObj)) {
            const meta = anyObj.userData?.__implicit as { f: (x: number, y: number, z: number) => number } | undefined;
            if (meta?.f) implicitF = meta.f;
          }
        });
      }

      if (!implicitF) {
        const fallback = getImplicitFallback(surfaceId);
        if (fallback) {
          implicitF = fallback;
        } else {
          lineMat.dispose();
          setSlicePolylines2D([]);
          return;
        }
      }

      const { e1, e2 } = frame;
      const x0 = frame.x0;

      const sMax = frame.size * 0.5;
      const sMin = -sMax;

      const nx = 120;
      const ny = 120;

      const dx = (sMax - sMin) / (nx - 1);
      const dy = (sMax - sMin) / (ny - 1);

      const x0x = x0.x;
      const x0y = x0.y;
      const x0z = x0.z;
      const e1x = e1.x;
      const e1y = e1.y;
      const e1z = e1.z;
      const e2x = e2.x;
      const e2y = e2.y;
      const e2z = e2.z;

      const polylines = marchingSquares({
        nx,
        ny,
        xMin: sMin,
        xMax: sMax,
        yMin: sMin,
        yMax: sMax,
        level: 0,
        sample: (i, j) => {
          const s = sMin + i * dx;
          const t = sMin + j * dy;
          const x = x0x + e1x * s + e2x * t;
          const y = x0y + e1y * s + e2y * t;
          const z = x0z + e1z * s + e2z * t;
          const v = implicitF!(x, y, z);
          return Number.isFinite(v) ? v : NaN;
        },
      });

      const polylines2D: Array<Array<{ s: number; t: number }>> = [];

      for (const poly of polylines) {
        if (poly.length < 2) continue;
        const pts: THREE.Vector3[] = [];
        const pts2D: Array<{ s: number; t: number }> = [];
        for (const pt of poly) {
          const s = pt.x;
          const t = pt.y;
          const x = x0x + e1x * s + e2x * t;
          const y = x0y + e1y * s + e2y * t;
          const z = x0z + e1z * s + e2z * t;
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
          pts2D.push({ s, t });
          pts.push(new THREE.Vector3(x, y, z).add(normalOffset));
        }
        if (pts.length < 2) continue;
        if (pts2D.length >= 2) polylines2D.push(pts2D);
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geom, lineMat);
        line.renderOrder = 12;
        group.add(line);
      }
      setSlicePolylines2D(polylines2D);
    }
  }, [
    slicePlaneEnabled,
    slicePlaneTheta,
    slicePlanePhi,
    slicePlaneOffset,
    slicePlaneSize,
    surfaceId,
    graphExpr,
    graphDomain?.xSpan,
    graphDomain?.ySpan,
    graphResolution,
    implicitExpr,
    sceneEpoch,
  ]);

  useEffect(() => {
    if (!slicePlaneEnabled) {
      setSliceHoverST(null);
      setSliceHoverSnap(null);
      setSliceHoverReadout(null);
      if (sliceHoverReadoutTimerRef.current !== null) {
        window.clearTimeout(sliceHoverReadoutTimerRef.current);
        sliceHoverReadoutTimerRef.current = null;
      }
    }
  }, [slicePlaneEnabled]);

  useEffect(() => {
    if (sliceHoverReadoutTimerRef.current !== null) {
      window.clearTimeout(sliceHoverReadoutTimerRef.current);
      sliceHoverReadoutTimerRef.current = null;
    }
    if (!sliceHoverST) {
      setSliceHoverReadout(null);
      return;
    }
    sliceHoverReadoutTimerRef.current = window.setTimeout(() => {
      setSliceHoverReadout(sliceHoverST);
      sliceHoverReadoutTimerRef.current = null;
    }, 120);
  }, [sliceHoverST]);

  useEffect(() => {
    if (!sliceHoverST) {
      setSliceHoverSnap(null);
      sliceHoverSmoothRef.current = null;
      return;
    }
    if (!sliceSnapToCurve || !slicePolylines2D.length) {
      sliceHoverSmoothRef.current = sliceHoverST;
      setSliceHoverSnap(sliceHoverST);
      return;
    }
    let best = sliceHoverST;
    let bestD2 = Infinity;
    for (const line of slicePolylines2D) {
      for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i];
        const b = line[i + 1];
        const vx = b.s - a.s;
        const vy = b.t - a.t;
        const wx = sliceHoverST.s - a.s;
        const wy = sliceHoverST.t - a.t;
        const vv = vx * vx + vy * vy;
        const t = vv > 1e-12 ? Math.min(1, Math.max(0, (wx * vx + wy * vy) / vv)) : 0;
        const ps = a.s + vx * t;
        const pt = a.t + vy * t;
        const dx = ps - sliceHoverST.s;
        const dy = pt - sliceHoverST.t;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { s: ps, t: pt };
        }
      }
    }
    const prev = sliceHoverSmoothRef.current ?? best;
    const alpha = 0.35;
    const smooth = {
      s: prev.s + (best.s - prev.s) * alpha,
      t: prev.t + (best.t - prev.t) * alpha,
    };
    sliceHoverSmoothRef.current = smooth;
    setSliceHoverSnap(smooth);
  }, [sliceHoverST, slicePolylines2D, sliceSnapToCurve]);

  useEffect(() => {
    const group = sliceGroupRef.current;
    if (!group) return;

    if (!slicePlaneEnabled || !sliceHoverSnap) {
      if (sliceHoverMarkerRef.current) {
        const marker = sliceHoverMarkerRef.current;
        group.remove(marker);
        marker.geometry.dispose();
        const mat = marker.material as THREE.Material | undefined;
        if (mat) mat.dispose();
        sliceHoverMarkerRef.current = null;
      }
      return;
    }

    const frame = sliceFrameRef.current;
    if (!frame) return;

    const point = frame.x0
      .clone()
      .add(frame.e1.clone().multiplyScalar(sliceHoverSnap.s))
      .add(frame.e2.clone().multiplyScalar(sliceHoverSnap.t));
    const offset = Math.max(0.001, (radiusRef.current || 3) * 0.002);
    const radius = Math.max(0.01, frame.size * 0.012);

    if (!sliceHoverMarkerRef.current) {
      const geom = new THREE.SphereGeometry(radius, 14, 14);
      const mat = new THREE.MeshBasicMaterial({ color: 0xe1563b });
      const marker = new THREE.Mesh(geom, mat);
      marker.renderOrder = 13;
      sliceHoverMarkerRef.current = marker;
      group.add(marker);
    }

    sliceHoverMarkerRef.current.position.copy(point).add(frame.n.clone().multiplyScalar(offset));
  }, [slicePlaneEnabled, sliceHoverSnap]);

function firstMeshIn(obj: THREE.Object3D): THREE.Mesh | null {

  

  if ((obj as any).isMesh) return obj as THREE.Mesh;
  let found: THREE.Mesh | null = null;
  obj.traverse((c) => {
    if (!found && (c as any).isMesh) found = c as THREE.Mesh;
  });
  return found;
}

useEffect(() => {
  const obj = surfaceObjRef.current;
  if (!obj) return;
  const activeHeatmapValues =
    overlayHeatmapEnabled && overlayHeatmapValues?.length
      ? overlayHeatmapValues
      : geodesicHeatmapEnabled && geodesicHeatmapValues?.length
      ? geodesicHeatmapValues
      : null;

  // MarchingCubes: update material color only (no vertex colors)
  if (isImplicitMeshObj(obj)) {
    const mesh = obj as THREE.Mesh;
    const geom = mesh.geometry as THREE.BufferGeometry | null;
    const implicitMeta = (mesh as any).userData?.__implicit as
      | { f: (x: number, y: number, z: number) => number }
      | undefined;
    const posAttr = geom?.getAttribute("position") as THREE.BufferAttribute | null;
    const heatmapOk =
      !!activeHeatmapValues?.length && !!posAttr && posAttr.count === activeHeatmapValues.length;
    const useImplicitCurv =
      !heatmapOk && effectiveImplicitOverlay === "curvature" && typeof implicitMeta?.f === "function";
    const useScalarColors = !heatmapOk && !useImplicitCurv && colorMode !== "solid";
    const mat = (mesh as any).material as THREE.Material | undefined;
    if (geom) {
      if (heatmapOk) {
        applyHeatmapColors(geom, activeHeatmapValues!, colorPalette);
      } else if (useImplicitCurv && implicitMeta?.f) {
        applyImplicitCurvatureColors(geom, implicitMeta.f, colorPalette);
      } else if (useScalarColors) {
        applyVertexColors(geom, colorMode, colorPalette);
      } else if (geom.getAttribute("color")) {
        geom.deleteAttribute("color");
      }
    }
    if (mat && (mat as any).color) {
      if (heatmapOk || useImplicitCurv || useScalarColors) {
        (mat as any).color.set(0xffffff);
      } else {
        (mat as any).color.set(solidColorForPalette(colorPalette));
      }
      (mat as any).vertexColors = heatmapOk || useImplicitCurv || useScalarColors;
      mat.needsUpdate = true;
    }
    return;
  }

  const mesh = firstMeshIn(obj);
  if (!mesh) return;
debugMesh("[recolorFirstMesh] BEFORE", mesh, { surfaceId, colorMode, colorPalette });



  const geom = mesh.geometry as THREE.BufferGeometry | null;
  if (!geom) return;

  // ensure vertex colors are actually used
  const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
  const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
  const heatmapOk =
    !!activeHeatmapValues?.length && !!posAttr && posAttr.count === activeHeatmapValues.length;
  if (mat) {
    mat.vertexColors = heatmapOk || colorMode !== "solid";
    if (heatmapOk || colorMode !== "solid") {
      mat.color.set(0xffffff);
    } else {
      mat.color.set(solidColorForPalette(colorPalette));
    }
    mat.needsUpdate = true;
  }

  // repaint
  if (heatmapOk) {
    applyHeatmapColors(geom, activeHeatmapValues!, colorPalette);
  } else if (colorMode === "curvature") {
    const g = (obj as any).userData?.__graph;
    const f = g?.f as ((x: number, y: number) => number) | undefined;

    if (typeof f === "function") {
      applyCurvatureHeatToGraph(geom, f, colorPalette);
    } else {
      // curvature for non-graph: fallback so UI still "does something"
      applyVertexColors(geom, "radius", colorPalette);
    }
  } else if (colorMode !== "solid") {
    applyVertexColors(geom, colorMode, colorPalette);
  } else {
    // optional: remove old colors so solid truly looks solid
    if (geom.getAttribute("color")) geom.deleteAttribute("color");


debugMesh("[recolorFirstMesh] AFTER", mesh, { surfaceId, colorMode, colorPalette });

  }

  geom.attributes.color && (geom.attributes.color.needsUpdate = true);

}, [
  surfaceId,
  graphExpr,
  implicitExpr,
  colorMode,
  colorPalette,
  effectiveImplicitOverlay,
  implicitMeshToken,
  geodesicHeatmapEnabled,
  geodesicHeatmapValues,
  overlayHeatmapEnabled,
  overlayHeatmapValues,
]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const getSize = () => {
      const rect = mount.getBoundingClientRect();
      const width = rect.width || 400;
      const height = rect.height || 300;
      return { width, height };
    };

    const { width, height } = getSize();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const heavySurface = surfaceId === "surface_mesh" || surfaceId === "torus_implicit";
    const maxPixelRatio =
      renderQuality === "performance"
        ? 1
        : renderQuality === "sharp"
          ? heavySurface
            ? 1.9
            : 3
          : heavySurface
            ? 1.35
            : 2;
    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const qualityScale =
      renderQuality === "performance" ? 1 : renderQuality === "sharp" ? 1.75 : 1.15;
    const targetPixelRatio = devicePixelRatio * qualityScale;
    renderer.setPixelRatio(Math.min(targetPixelRatio, maxPixelRatio));
    renderer.setSize(width, height, false);
    renderer.setClearColor(sceneBackgroundColor, sceneBackgroundAlpha);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.localClippingEnabled = true;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(3, 3, 4);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    controls.screenSpacePanning = true;

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.enabled = false;
    transformControls.visible = false;
    transformControls.setSize(1.35);
    transformControls.setMode(gizmoMode);
    transformControls.setSpace(gizmoSpace);
    transformControls.setTranslationSnap(
      gizmoTranslationSnap != null && Number.isFinite(gizmoTranslationSnap) && gizmoTranslationSnap > 0
        ? gizmoTranslationSnap
        : null
    );
    transformControls.setRotationSnap(
      gizmoRotationSnapDeg != null && Number.isFinite(gizmoRotationSnapDeg) && gizmoRotationSnapDeg > 0
        ? gizmoRotationSnapDeg * DEG_TO_RAD
        : null
    );
    transformControls.setScaleSnap(
      gizmoScaleSnap != null && Number.isFinite(gizmoScaleSnap) && gizmoScaleSnap > 0 ? gizmoScaleSnap : null
    );
    const transformControlsHelper =
      typeof (transformControls as any).getHelper === "function"
        ? ((transformControls as any).getHelper() as THREE.Object3D)
        : (transformControls as unknown as THREE.Object3D);
    transformControlsHelper.visible = false;
    scene.add(transformControlsHelper);

    cameraRef.current = camera;
    controlsRef.current = controls;
    transformControlsRef.current = transformControls;
    transformControlsHelperRef.current = transformControlsHelper;
    zoomRestoreRef.current = null;
    zoomedToRegionRef.current = false;
    zoomTogglePrevRef.current = zoomToRegion;

    const emitCameraSync = () => {
      if (!isCameraLeader || !onCameraSync) return;
      const cam = cameraRef.current;
      const ctrls = controlsRef.current;
      if (!cam || !ctrls) return;

      const next: CameraSyncState = {
        position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        target: { x: ctrls.target.x, y: ctrls.target.y, z: ctrls.target.z },
        up: { x: cam.up.x, y: cam.up.y, z: cam.up.z },
      };

      const prev = lastCameraSyncRef.current;
      if (
        prev &&
        Math.abs(prev.position.x - next.position.x) < 1e-4 &&
        Math.abs(prev.position.y - next.position.y) < 1e-4 &&
        Math.abs(prev.position.z - next.position.z) < 1e-4 &&
        Math.abs(prev.target.x - next.target.x) < 1e-4 &&
        Math.abs(prev.target.y - next.target.y) < 1e-4 &&
        Math.abs(prev.target.z - next.target.z) < 1e-4 &&
        Math.abs(prev.up.x - next.up.x) < 1e-4 &&
        Math.abs(prev.up.y - next.up.y) < 1e-4 &&
        Math.abs(prev.up.z - next.up.z) < 1e-4
      ) {
        return;
      }

      lastCameraSyncRef.current = next;
      onCameraSync(next);
    };

    const emitViewportDebug = (phase: string) => {
      if (!onViewportDebug) return;
      const rect = mount.getBoundingClientRect();
      const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2());
      onViewportDebug({
        viewer: "surface",
        phase,
        ts: Date.now(),
        mount: { width: rect.width, height: rect.height },
        canvasCss: {
          width: renderer.domElement.clientWidth,
          height: renderer.domElement.clientHeight,
        },
        drawingBuffer: {
          width: drawingBuffer.x,
          height: drawingBuffer.y,
        },
        pixelRatio: renderer.getPixelRatio(),
        devicePixelRatio: Math.max(1, window.devicePixelRatio || 1),
        camera: {
          aspect: camera.aspect,
          fov: camera.fov,
          distance: camera.position.distanceTo(controls.target),
          position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
        },
      });
    };
    let lastViewportDebugAt = 0;
    const emitViewportDebugThrottled = (phase: string) => {
      if (!onViewportDebug) return;
      const now = performance.now();
      if (now - lastViewportDebugAt < 220) return;
      lastViewportDebugAt = now;
      emitViewportDebug(phase);
    };
    const recordRaycastDuration = (startAt: number) => {
      const elapsed = Math.max(0, performance.now() - startAt);
      const stats = raycastPerfRef.current;
      stats.lastMs = elapsed;
      stats.samples += 1;
      stats.emaMs = stats.samples <= 1 ? elapsed : stats.emaMs * 0.82 + elapsed * 0.18;
    };
    const estimateGpuBytes = (root: THREE.Object3D): number => {
      const seen = new Set<string>();
      let total = 0;
      root.traverse((obj) => {
        const geom = (obj as THREE.Mesh).geometry;
        if (!(geom instanceof THREE.BufferGeometry)) return;
        if (seen.has(geom.uuid)) return;
        seen.add(geom.uuid);
        for (const key of Object.keys(geom.attributes)) {
          const attr = geom.attributes[key] as THREE.BufferAttribute | undefined;
          const array = attr?.array as ArrayLike<number> | undefined;
          if (!array) continue;
          const byteLength = (array as { byteLength?: number }).byteLength;
          if (Number.isFinite(byteLength)) total += Number(byteLength);
        }
        const indexArray = geom.index?.array as ArrayLike<number> | undefined;
        if (indexArray) {
          const byteLength = (indexArray as { byteLength?: number }).byteLength;
          if (Number.isFinite(byteLength)) total += Number(byteLength);
        }
      });
      return total;
    };
    const countRenderableObjects = (root: THREE.Object3D | null): number => {
      if (!root) return 0;
      let count = 0;
      root.traverse((obj) => {
        if (!obj.visible) return;
        const anyObj = obj as THREE.Object3D & { isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean };
        if (anyObj.isMesh || anyObj.isLine || anyObj.isPoints || anyObj.isSprite) count += 1;
      });
      return count;
    };
    const estimateOverlayCount = (): number => {
      return (
        countRenderableObjects(selectionOverlayRef.current) +
        countRenderableObjects(selectionSphereRef.current) +
        countRenderableObjects(inspectMarkerRef.current) +
        countRenderableObjects(geodesicPathLineRef.current) +
        countRenderableObjects(geodesicHeatLineRef.current) +
        countRenderableObjects(overlayPolylinesRef.current) +
        countRenderableObjects(overlayPolylineGroupsRef.current) +
        countRenderableObjects(principalProjectionGroupRef.current) +
        countRenderableObjects(overlayPointSetsRef.current) +
        countRenderableObjects(overlayMeshGroupsRef.current) +
        countRenderableObjects(overlayLabelSetsRef.current) +
        countRenderableObjects(chartGridRef.current) +
        countRenderableObjects(geodesicDiskGroupRef.current) +
        countRenderableObjects(principalGroupRef.current) +
        countRenderableObjects(curvatureLinesRef.current) +
        countRenderableObjects(ridgeLinesRef.current) +
        countRenderableObjects(valleyLinesRef.current)
      );
    };
    const emitPerformanceSnapshot = () => {
      const perfCb = onPerformanceSnapshotRef.current;
      if (!perfCb) return;
      const now = performance.now();
      const perfFrame = perfFrameRef.current;
      if (perfFrame.lastEmitAt !== 0 && now - perfFrame.lastEmitAt < 250) return;
      perfFrame.lastEmitAt = now;
      const renderInfo = renderer.info.render;
      const drawCalls = Math.max(0, Math.round(renderInfo.calls ?? 0));
      const triangles = Math.max(0, Math.round(renderInfo.triangles ?? 0));
      const lines = Math.max(0, Math.round(renderInfo.lines ?? 0));
      const points = Math.max(0, Math.round(renderInfo.points ?? 0));
      const vertices = Math.max(0, Math.round(triangles * 3 + lines * 2 + points));
      const gpuBytes = estimateGpuBytes(scene);
      const primaryMeshObjects = countRenderableObjects(surfaceObjRef.current);
      perfCb({
        ts: Date.now(),
        fps: perfFrame.fps,
        frameTimeMs: perfFrame.frameTimeMs,
        drawCalls,
        triangles,
        vertices,
        meshObjects: primaryMeshObjects,
        overlayObjects: estimateOverlayCount(),
        raycastTimeMs: raycastPerfRef.current.emaMs,
        lastMeshBuildMs: lastMeshBuildMsRef.current,
        lodLevel:
          canUseMeshInteractionLod && meshRuntimeQualityRef.current !== "accurate"
            ? meshRuntimeQualityRef.current === "interactive-preview"
              ? "Performance"
              : "Balanced"
            : renderQuality === "performance"
              ? "Performance"
              : renderQuality === "sharp"
                ? "Full"
                : "Balanced",
        bvhStatus: "Off",
        gpuMemoryEstimateBytes: gpuBytes,
        gpuMemoryEstimateLabel: formatBytes(gpuBytes),
        rendererMemory: {
          geometries: renderer.info.memory.geometries ?? 0,
          textures: renderer.info.memory.textures ?? 0,
        },
      });
    };
    const handleControlsChangeDebug = () => {
      emitViewportDebugThrottled("controls");
    };
    controls.addEventListener("change", handleControlsChangeDebug);

    if (isCameraLeader && onCameraSync) {
      controls.addEventListener("change", emitCameraSync);
      emitCameraSync();
    }
    const handleControlsStart = () => {
      interruptCameraTour();
      beginMeshInteraction();
    };
    const handleControlsEnd = () => {
      endMeshInteraction();
    };
    controls.addEventListener("start", handleControlsStart);
    controls.addEventListener("end", handleControlsEnd);

    const emitGizmoObjectChange = () => {
      const tc = transformControlsRef.current;
      const cb = onGizmoTransformRef.current;
      const target = tc?.object;
      if (!cb || !target) return;
      const meshKey = (target as any)?.userData?.__surfaceMeshOverrideId;
      cb({
        meshKey: meshKey != null ? String(meshKey) : undefined,
        position: {
          x: target.position.x,
          y: target.position.y,
          z: target.position.z,
        },
        rotation: {
          x: target.rotation.x * RAD_TO_DEG,
          y: target.rotation.y * RAD_TO_DEG,
          z: target.rotation.z * RAD_TO_DEG,
        },
        scale: {
          x: target.scale.x,
          y: target.scale.y,
          z: target.scale.z,
        },
      });
    };
    const clampGizmoTargetScale = () => {
      if (gizmoModeRef.current !== "scale") return;
      const target = transformControlsRef.current?.object;
      if (!target) return;
      const minScale = 0.05;
      const sx = Number.isFinite(target.scale.x) ? Math.max(minScale, target.scale.x) : 1;
      const sy = Number.isFinite(target.scale.y) ? Math.max(minScale, target.scale.y) : 1;
      const sz = Number.isFinite(target.scale.z) ? Math.max(minScale, target.scale.z) : 1;
      if (
        Math.abs(target.scale.x - sx) > 1e-9 ||
        Math.abs(target.scale.y - sy) > 1e-9 ||
        Math.abs(target.scale.z - sz) > 1e-9
      ) {
        target.scale.set(sx, sy, sz);
        target.updateMatrixWorld(true);
      }
    };
    const sanitizeGizmoTargetPosition = () => {
      if (gizmoModeRef.current !== "translate") return;
      const target = transformControlsRef.current?.object;
      if (!target) return;
      if (
        Number.isFinite(target.position.x) &&
        Number.isFinite(target.position.y) &&
        Number.isFinite(target.position.z)
      ) {
        return;
      }
      target.position.copy(gizmoDragStartPositionRef.current ?? new THREE.Vector3());
      target.updateMatrixWorld(true);
    };
    const setSceneOverlayGroupsVisible = (visible: boolean) => {
      if (gizmoOverlayRestoreFrameRef.current != null) {
        cancelAnimationFrame(gizmoOverlayRestoreFrameRef.current);
        gizmoOverlayRestoreFrameRef.current = null;
      }
      overlayMeshGroupsRef.current && (overlayMeshGroupsRef.current.visible = visible);
      overlayLabelSetsRef.current && (overlayLabelSetsRef.current.visible = visible);
      overlayPolylineGroupsRef.current && (overlayPolylineGroupsRef.current.visible = visible);
      overlayPointSetsRef.current && (overlayPointSetsRef.current.visible = visible);
    };
    const restoreSceneOverlayGroupsAfterCommit = () => {
      if (gizmoOverlayRestoreFrameRef.current != null) {
        cancelAnimationFrame(gizmoOverlayRestoreFrameRef.current);
      }
      gizmoOverlayRestoreFrameRef.current = requestAnimationFrame(() => {
        gizmoOverlayRestoreFrameRef.current = requestAnimationFrame(() => {
          gizmoOverlayRestoreFrameRef.current = null;
          setSceneOverlayGroupsVisible(true);
        });
      });
    };
    const handleGizmoDraggingChanged = (event: { value?: boolean }) => {
      const dragging = !!event?.value;
      gizmoDraggingRef.current = dragging;
      const ctrls = controlsRef.current;
      if (ctrls) ctrls.enabled = !dragging;
      if (dragging) {
        const target = transformControlsRef.current?.object;
        gizmoDragStartPositionRef.current = target ? target.position.clone() : null;
        setSceneOverlayGroupsVisible(false);
      } else {
        sanitizeGizmoTargetPosition();
        clampGizmoTargetScale();
        emitGizmoObjectChange();
        gizmoDragStartPositionRef.current = null;
        restoreSceneOverlayGroupsAfterCommit();
      }
    };
    const handleGizmoObjectChange = () => {
      const tc = transformControlsRef.current;
      sanitizeGizmoTargetPosition();
      clampGizmoTargetScale();
      if (gizmoDraggingRef.current || (tc as any)?.dragging) return;
      emitGizmoObjectChange();
    };
    transformControls.addEventListener("dragging-changed", handleGizmoDraggingChanged);
    transformControls.addEventListener("objectChange", handleGizmoObjectChange);

    if (lightPreset === "contrast") {
      scene.add(new THREE.AmbientLight(0xffffff, 0.18));
      const key = new THREE.DirectionalLight(0xffffff, 1.15);
      key.position.set(4, 6, 3);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 0.35);
      rim.position.set(-3, -2, -4);
      scene.add(rim);
    } else if (lightPreset === "soft") {
      scene.add(new THREE.AmbientLight(0xffffff, 0.45));
      const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
      hemi.position.set(0, 6, 0);
      scene.add(hemi);
    } else if (lightPreset === "neutral") {
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const key = new THREE.DirectionalLight(0xffffff, 0.7);
      key.position.set(4, 4.5, 4);
      scene.add(key);
    } else if (lightPreset === "warm") {
      scene.add(new THREE.AmbientLight(0xfff4e6, 0.5));
      const key = new THREE.DirectionalLight(0xffe2c7, 0.85);
      key.position.set(4, 5, 3);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.25);
      fill.position.set(-4, 2, -3);
      scene.add(fill);
    } else {
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 0.85);
      key.position.set(3, 5, 4);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.35);
      fill.position.set(-4, 2, -3);
      scene.add(fill);
    }

    const sliceGroup = new THREE.Group();
    sliceGroupRef.current = sliceGroup;
    scene.add(sliceGroup);

    const opacity = clamp01(materialOpacity);
    const graphRes = Math.max(20, Math.round(graphResolution));
    const implicitRes = Math.max(18, Math.round(implicitResolution));
    const useImplicitOverride =
      !!implicitMeshOverride?.positions?.length && !!implicitMeshOverride?.indices?.length;
    const hasSurfaceMeshOverrides =
      surfaceId === "surface_mesh" &&
      !!surfaceMeshOverrides?.some((override) => (override.positions?.length ?? 0) >= 3);
    const useSurfaceMeshOverrides = surfaceId === "surface_mesh" && hasSurfaceMeshOverrides;
    const useSurfaceMeshOverride =
      surfaceId === "surface_mesh" && !useSurfaceMeshOverrides && !!surfaceMeshOverride?.positions?.length;

    const makeMaterial = (override?: SurfaceMeshOverride) =>
      new THREE.MeshStandardMaterial({
        color:
          colorMode === "solid"
            ? override?.color ?? solidColorForPalette(colorPalette)
            : 0xffffff,
        metalness: clamp01(override?.metalness ?? materialMetalness),
        roughness: clamp01(override?.roughness ?? materialRoughness),
        side: THREE.DoubleSide,
        wireframe: override?.wireframe ?? !!effectiveWireframe,
        flatShading: !!override?.flatShading,
        vertexColors: colorMode !== "solid",
        transparent: clamp01((override?.opacity ?? 1) * materialOpacity) < 1,
        opacity: clamp01((override?.opacity ?? 1) * materialOpacity),
      });



    const resolveImplicitSize = (fallback: number) => {
      const s = implicitDomainSize ?? fallback;
      return Number.isFinite(s) && s > 0 ? s : fallback;
    };

    const makeImplicitOverrideMesh = (
      f: (x: number, y: number, z: number) => number,
      fallbackSize: number
    ) => {
      const positions = implicitMeshOverride?.positions ?? [];
      const indices = implicitMeshOverride?.indices ?? [];
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      geom.computeBoundingBox();
      geom.computeBoundingSphere();

      const mesh = new THREE.Mesh(geom, makeMaterial());
      let sizeHint = resolveImplicitSize(fallbackSize);
      if (geom.boundingBox) {
        const sizeVec = new THREE.Vector3();
        geom.boundingBox.getSize(sizeVec);
        const span = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
        if (Number.isFinite(span) && span > 0) sizeHint = span * 0.5;
      }
      (mesh as any).userData.__implicit = { f, size: sizeHint, source: "cgal" };
      return mesh;
    };

    const makeSurfaceMeshOverrideMesh = (override: SurfaceMeshOverride) => {
      const geom = new THREE.BufferGeometry();
      const positions = override.positions ?? [];
      const normals = override.normals ?? null;
      const uvs = override.uvs ?? null;
      const indices = override.indices ?? null;
      const validation = override.validation ?? null;
      const nanNormals = validation?.stats?.nanNormals ?? 0;

      const posArray = positions instanceof Float32Array ? positions : Float32Array.from(positions);
      geom.setAttribute("position", new THREE.Float32BufferAttribute(posArray, 3));

      if (indices && indices.length >= 3) {
        const idxArray = indices instanceof Uint32Array ? indices : Uint32Array.from(indices);
        geom.setIndex(new THREE.BufferAttribute(idxArray, 1));
      }

      if (uvs && uvs.length >= 2) {
        const uvArray = uvs instanceof Float32Array ? uvs : Float32Array.from(uvs);
        geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvArray, 2));
      }

      const normalsOk = !!normals && normals.length >= posArray.length && nanNormals === 0;
      if (normalsOk) {
        const nArray = normals instanceof Float32Array ? normals : Float32Array.from(normals);
        geom.setAttribute("normal", new THREE.Float32BufferAttribute(nArray, 3));
      } else {
        geom.computeVertexNormals();
      }

      if (colorMode !== "solid") applyVertexColors(geom, colorMode, colorPalette);
      const mesh = new THREE.Mesh(geom, makeMaterial(override));
      if (override.id) {
        (mesh as any).userData.__surfaceMeshOverrideId = override.id;
      }
      (mesh as any).userData.__surfaceMeshOverrideStyle = {
        color: override.color,
        opacity: override.opacity,
        wireframe: override.wireframe,
        flatShading: override.flatShading,
      };
      applySurfaceMeshOverrideTransform(mesh, override.transform);
      return mesh;
    };

    const makeSurfaceMeshOverrideGroup = () => {
      const group = new THREE.Group();
      if (!surfaceMeshOverrides?.length) return group;
      for (const override of surfaceMeshOverrides) {
        if (!override?.positions || (override.positions.length ?? 0) < 3) continue;
        group.add(makeSurfaceMeshOverrideMesh(override));
      }
      return group;
    };

    // Build an implicit surface by sampling f on a cubic grid and extracting the 0-isosurface.
    const makeImplicitSurface = (f: (x: number, y: number, z: number) => number, size = 2.2) => {
      const finalSize = resolveImplicitSize(size);
      const effect = new MarchingCubes(implicitRes, makeMaterial(), true, true);
      const field = effect.field;

      let idx = 0;
      for (let k = 0; k < implicitRes; k++) {
        const z = ((k / (implicitRes - 1)) * 2 - 1) * finalSize;
        for (let j = 0; j < implicitRes; j++) {
          const y = ((j / (implicitRes - 1)) * 2 - 1) * finalSize;
          for (let i = 0; i < implicitRes; i++) {
            const x = ((i / (implicitRes - 1)) * 2 - 1) * finalSize;

            let raw = f(x, y, z);
            if (!Number.isFinite(raw)) raw = 1e3;
            field[idx++] = raw;
          }
        }
      }

      effect.isolation = 0;
      effect.enableUvs = false;
      effect.enableColors = false;
      effect.update();
      (effect as any).userData.__implicit = { f, size: finalSize };

      return effect;
    };

    const makeImplicitMesh = (f: (x: number, y: number, z: number) => number, size = 2.2) => {
      if (useImplicitOverride) return makeImplicitOverrideMesh(f, size);
      return makeImplicitSurface(f, size);
    };

      const makeSurface = (id: SurfaceId): THREE.Object3D => {
        switch (id) {
        case "surface_mesh": {
          if (useSurfaceMeshOverrides) return makeSurfaceMeshOverrideGroup();
          if (useSurfaceMeshOverride && surfaceMeshOverride) return makeSurfaceMeshOverrideMesh(surfaceMeshOverride);
          if (surfaceMeshFallbackMode === "none") return new THREE.Group();
          const geo = new THREE.SphereGeometry(1, 32, 24);
          if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);
          return new THREE.Mesh(geo, makeMaterial());
        }
          case "sphere": {
            const f = (x: number, y: number, z: number) => x * x + y * y + z * z - 1;
            if (useImplicitOverride) return makeImplicitOverrideMesh(f, 2.2);
            const geo = new THREE.SphereGeometry(1, 64, 64);
            if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);
            return new THREE.Mesh(geo, makeMaterial());
          }
          case "cylinder": {
            const f = (x: number, y: number, z: number) => x * x + z * z - 1 + y * 0;
            if (useImplicitOverride) return makeImplicitOverrideMesh(f, 2.2);
            const geo = new THREE.CylinderGeometry(1, 1, 2.4, 64, 1, false);
            if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);
            return new THREE.Mesh(geo, makeMaterial());
          }
          case "cone": {
            const r = 1.2;
            const h = 2.4;
            const f = (x: number, y: number, z: number) => {
              const ry = (r / h) * (h * 0.5 - y);
              return x * x + z * z - ry * ry;
            };
            if (useImplicitOverride) return makeImplicitOverrideMesh(f, 2.2);
            const geo = new THREE.ConeGeometry(1.2, 2.4, 64, 1, false);
            if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);
            return new THREE.Mesh(geo, makeMaterial());
          }
          case "paraboloid": {
            const f = (x: number, y: number, z: number) => y - (x * x + z * z);
            if (useImplicitOverride) return makeImplicitOverrideMesh(f, 2.2);
            const geo = new ParametricGeometry(
              (u, v, target) => {
                const r = u * 1.4;
              const theta = v * 2 * Math.PI;
              const x = r * Math.cos(theta);
              const z = r * Math.sin(theta);
              const y = r * r;
              target.set(x, y, z);
            },
            64,
            64
          );
            if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);
            return new THREE.Mesh(geo, makeMaterial());
          }
          case "hyperboloid": {
            const a = 0.8;
            const c = 0.6;
            const f = (x: number, y: number, z: number) =>
              (x * x) / (a * a) + (z * z) / (a * a) - (y * y) / (c * c) - 1;
            if (useImplicitOverride) return makeImplicitOverrideMesh(f, 2.2);
            const geo = new ParametricGeometry(
              (u, v, target) => {
                const t = (u - 0.5) * 2;
                const theta = v * 2 * Math.PI;
                const cosh = Math.cosh(t);
                const sinh = Math.sinh(t);
                const x = a * cosh * Math.cos(theta);
                const z = a * cosh * Math.sin(theta);
              const y = c * sinh;
              target.set(x, y, z);
            },
            64,
            64
          );
          if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);
          return new THREE.Mesh(geo, makeMaterial());
        }
          case "hyperboloid_twoSheet": {
            const a = 0.7;
            const b = 0.7;
            const c = 0.9;
            return makeImplicitMesh(
              (x, y, z) => (z * z) / (c * c) - (x * x) / (a * a) - (y * y) / (b * b) - 1,
              2.3
            );
          }
          case "ellipsoid": {
            const a = 1.3;
            const b = 0.9;
            const c = 0.7;
            return makeImplicitMesh((x, y, z) => (x * x) / (a * a) + (y * y) / (b * b) + (z * z) / (c * c) - 1);
          }
          case "torus_implicit": {
            const R = 1.05;
            const r = 0.45;
            return makeImplicitMesh((x, y, z) => {
              const q = Math.sqrt(x * x + y * y) - R;
              return q * q + z * z - r * r;
            }, 2.1);
          }
        case "gyroid": {
          const s = 1.4;
          return makeImplicitMesh(
            (x, y, z) => Math.sin(x * s) * Math.cos(y * s) + Math.sin(y * s) * Math.cos(z * s) + Math.sin(z * s) * Math.cos(x * s),
            2.2
          );
        }
        case "superquadric": {
          const n = 4;
          return makeImplicitMesh((x, y, z) => Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n) + Math.pow(Math.abs(z), n) - 1.2);
        }
        case "roman": {
          return makeImplicitMesh(
            (x, y, z) => x * x * y * y + y * y * z * z + z * z * x * x - 2 * x * y * z,
            1.8
          );
        }
        case "scherk": {
          return makeImplicitMesh((x, y, z) => Math.sin(z) - Math.sinh(x) * Math.sinh(y), 1.6);
        }

        // graphs z=f(x,y): ALWAYS return a Group and store spans
        case "graph_saddle": {
          const f = (x: number, y: number) => 0.4 * (x * x - y * y);
          const { xSpan, ySpan } = getGraphSpan(1.5, 1.5);

          const geo = makeGraphGeometry(f, xSpan, ySpan, graphRes, graphRes);
          if (colorMode === "curvature") applyCurvatureHeatToGraph(geo, f, colorPalette);
          else if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);

          const mesh = new THREE.Mesh(geo, makeMaterial());
          const group = new THREE.Group();
          (group as any).userData.__graph = { xSpan, ySpan };
          group.add(mesh);
          return group;
        }

        case "graph_rotatedSaddle": {
          const f = (x: number, y: number) => 0.8 * x * y;
          const { xSpan, ySpan } = getGraphSpan(1.5, 1.5);

          const geo = makeGraphGeometry(f, xSpan, ySpan, graphRes, graphRes);
          if (colorMode === "curvature") applyCurvatureHeatToGraph(geo, f, colorPalette);
          else if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);

          const mesh = new THREE.Mesh(geo, makeMaterial());
          const group = new THREE.Group();
          (group as any).userData.__graph = { xSpan, ySpan };
          group.add(mesh);
          return group;
        }

        case "graph_monkey": {
          const f = (x: number, y: number) => 0.2 * (x * x * x - 3 * x * y * y);
          const { xSpan, ySpan } = getGraphSpan(1.4, 1.4);

          const geo = makeGraphGeometry(f, xSpan, ySpan, graphRes, graphRes);
          if (colorMode === "curvature") applyCurvatureHeatToGraph(geo, f, colorPalette);
          else if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);

          const mesh = new THREE.Mesh(geo, makeMaterial());
          const group = new THREE.Group();
          (group as any).userData.__graph = { xSpan, ySpan };
          group.add(mesh);
          return group;
        }

        case "graph_wave": {
          const f = (x: number, y: number) => 0.6 * Math.sin(x * 1.3) * Math.cos(y * 1.3);
          const { xSpan, ySpan } = getGraphSpan(Math.PI, Math.PI);

          const geo = makeGraphGeometry(f, xSpan, ySpan, graphRes, graphRes);
          if (colorMode === "curvature") applyCurvatureHeatToGraph(geo, f, colorPalette);
          else if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);

          const mesh = new THREE.Mesh(geo, makeMaterial());
          const group = new THREE.Group();
          (group as any).userData.__graph = { xSpan, ySpan };
          group.add(mesh);
          return group;
        }

        case "graph_paraboloid": {
          const f = (x: number, y: number) => 0.3 * (x * x + y * y);
          const { xSpan, ySpan } = getGraphSpan(1.7, 1.7);

          const geo = makeGraphGeometry(f, xSpan, ySpan, graphRes, graphRes);
          if (colorMode === "curvature") applyCurvatureHeatToGraph(geo, f, colorPalette);
          else if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);

          const mesh = new THREE.Mesh(geo, makeMaterial());
          const group = new THREE.Group();
          (group as any).userData.__graph = { xSpan, ySpan };
          group.add(mesh);
          return group;
        }

        case "graph_gaussian": {
          const f = (x: number, y: number) => Math.exp(-0.7 * (x * x + y * y));
          const { xSpan, ySpan } = getGraphSpan(2.0, 2.0);

          const geo = makeGraphGeometry(f, xSpan, ySpan, graphRes, graphRes);
          if (colorMode === "curvature") applyCurvatureHeatToGraph(geo, f, colorPalette);
          else if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);

          const mesh = new THREE.Mesh(geo, makeMaterial());
          const group = new THREE.Group();
          (group as any).userData.__graph = { xSpan, ySpan };
          group.add(mesh);
          return group;
        }

        case "graph_ripple": {
          const f = (x: number, y: number) => {
            const r = Math.sqrt(x * x + y * y);
            return r < 1e-4 ? 1 : Math.sin(3 * r) / (3 * r);
          };
          const { xSpan, ySpan } = getGraphSpan(2.4, 2.4);

          const geo = makeGraphGeometry(f, xSpan, ySpan, graphRes, graphRes);
          if (colorMode === "curvature") applyCurvatureHeatToGraph(geo, f, colorPalette);
          else if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);

          const mesh = new THREE.Mesh(geo, makeMaterial());
          const group = new THREE.Group();
          (group as any).userData.__graph = { xSpan, ySpan };
          group.add(mesh);
          return group;
        }

        case "graph_mexican": {
          const f = (x: number, y: number) => {
            const r2 = x * x + y * y;
            return (1 - r2) * Math.exp(-0.5 * r2);
          };
          const { xSpan, ySpan } = getGraphSpan(2.2, 2.2);

          const geo = makeGraphGeometry(f, xSpan, ySpan, graphRes, graphRes);
          if (colorMode === "curvature") applyCurvatureHeatToGraph(geo, f, colorPalette);
          else if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);

          const mesh = new THREE.Mesh(geo, makeMaterial());
          const group = new THREE.Group();
          (group as any).userData.__graph = { xSpan, ySpan };
          group.add(mesh);
          return group;
        }

        case "graph_sinSum": {
          const f = (x: number, y: number) => 0.45 * (Math.sin(x) + Math.cos(y));
          const { xSpan, ySpan } = getGraphSpan(Math.PI, Math.PI);

          const geo = makeGraphGeometry(f, xSpan, ySpan, graphRes, graphRes);
          if (colorMode === "curvature") applyCurvatureHeatToGraph(geo, f, colorPalette);
          else if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);

          const mesh = new THREE.Mesh(geo, makeMaterial());
          const group = new THREE.Group();
          (group as any).userData.__graph = { xSpan, ySpan };
          group.add(mesh);
          return group;
        }

        case "graph_sinc": {
          const f = (x: number, y: number) => {
            const r = Math.sqrt(x * x + y * y);
            return r < 1e-4 ? 1 : Math.sin(r) / r;
          };
          const { xSpan, ySpan } = getGraphSpan(5, 5);

          const geo = makeGraphGeometry(f, xSpan, ySpan, graphRes, graphRes);
          if (colorMode === "curvature") applyCurvatureHeatToGraph(geo, f, colorPalette);
          else if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);

          const mesh = new THREE.Mesh(geo, makeMaterial());
          const group = new THREE.Group();
          (group as any).userData.__graph = { xSpan, ySpan };
          group.add(mesh);
          return group;
        }

        case "graph_sinc2": {
          const f = (x: number, y: number) => {
            const r = Math.sqrt(x * x + y * y);
            return Math.sin(2 * r) / (1 + r * r);
          };
          const { xSpan, ySpan } = getGraphSpan(5, 5);

          const geo = makeGraphGeometry(f, xSpan, ySpan, graphRes, graphRes);
          if (colorMode === "curvature") applyCurvatureHeatToGraph(geo, f, colorPalette);
          else if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);

          const mesh = new THREE.Mesh(geo, makeMaterial());
          const group = new THREE.Group();
          (group as any).userData.__graph = { xSpan, ySpan };
          group.add(mesh);
          return group;
        }

        case "graph_custom": {
          const f = graphFnRef.current ?? ((x: number, y: number) => x * x - y * y);
          const { xSpan, ySpan } = getGraphSpan(2, 2);

          const geo = makeGraphGeometry(f, xSpan, ySpan, graphRes, graphRes);
          if (colorMode === "curvature") applyCurvatureHeatToGraph(geo, f, colorPalette);
          else if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);

          const mesh = new THREE.Mesh(geo, makeMaterial());
          const group = new THREE.Group();
          (group as any).userData.__graph = { xSpan, ySpan };
          group.add(mesh);
          return group;
        }

        case "implicit_custom": {
          const f =
            implicitFnRef.current ??
            ((x: number, y: number, z: number) => x * x + y * y + z * z - 1);
          return makeImplicitMesh(f, 2.1);
        }

        default: {
          const geo = new THREE.SphereGeometry(1, 64, 64);
          if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);
          return new THREE.Mesh(geo, makeMaterial());
        }
      }
    };

    const surfaceObj = makeSurface(surfaceId);
    scene.add(surfaceObj);
    surfaceObjRef.current = surfaceObj;

    surfaceObj.updateMatrixWorld(true);
    const meshList: THREE.Mesh[] = [];
    surfaceObj.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        meshList.push(mesh);
      }
    });

    const aggregatedSamples: SurfaceSampleSet["samples"] = [];
    const meshData: SurfaceSampleSet["meshData"] = [];
    let nextId = 0;
    let remainingSamples = Math.max(1, Math.floor(sampleMaxPoints));
    for (const mesh of meshList) {
      if (!mesh.geometry || remainingSamples <= 0) continue;
      mesh.updateMatrixWorld(true);
      const posAttr = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | null;
      if (posAttr) {
        const indexAttr = mesh.geometry.getIndex();
        const drawCount = getNonIndexedDrawCount(mesh.geometry as THREE.BufferGeometry, posAttr);
        const positions =
          drawCount != null
            ? (posAttr.array as Float32Array).subarray(0, drawCount * 3)
            : (posAttr.array as Float32Array);
        const meshKey = (mesh as any)?.userData?.__surfaceMeshOverrideId ?? mesh.uuid;
        meshData.push({
          key: meshKey,
          positions,
          indices: indexAttr ? indexAttr.array : null,
        });
      }
      const { samples: chunk } = buildSurfaceSampleSetFromViewer({
        geometry: mesh.geometry as THREE.BufferGeometry,
        worldMatrix: mesh.matrixWorld,
        maxSamples: remainingSamples,
        includeUV: includeSamplesUV,
        startId: nextId,
        meshKey: (mesh as any)?.userData?.__surfaceMeshOverrideId ?? mesh.uuid,
      });
      if (!chunk.length) continue;
      aggregatedSamples.push(...chunk);
      nextId += chunk.length;
      remainingSamples -= chunk.length;
    }

    let nextSampleSet: SurfaceSampleSet;
    if (aggregatedSamples.length) {
      const box = new THREE.Box3().setFromPoints(aggregatedSamples.map((s) => s.position));
      nextSampleSet = {
        samples: aggregatedSamples,
        bbox: box,
        center: box.getCenter(new THREE.Vector3()),
        meshData,
      };
    } else {
      nextSampleSet = { samples: [], meshData };
    }
    let implicitOverlayLines: THREE.LineSegments | null = null;
    const findImplicitObj = (): THREE.Object3D | null => {
      let found: THREE.Object3D | null = null;
      surfaceObj.traverse((obj) => {
        if (isImplicitMeshObj(obj as any)) found = obj;
      });
      return found;
    };
    const implicitObj = findImplicitObj();
    const implicitMeta = (implicitObj as any)?.userData?.__implicit as
      | { f: (x: number, y: number, z: number) => number; size?: number }
      | undefined;
    if (implicitObj && implicitMeta?.f) {
      if (effectiveImplicitOverlay === "curvature" && (implicitObj as any).geometry) {
        applyImplicitCurvatureColors((implicitObj as any).geometry, implicitMeta.f, colorPalette);
      }
      if (effectiveImplicitOverlay === "normals" && (implicitObj as any).geometry) {
        implicitOverlayLines = buildImplicitNormalLines((implicitObj as any).geometry, implicitMeta.f, 0.22);
        if (implicitOverlayLines) scene.add(implicitOverlayLines);
      }
    }

    const implicitFForStats = implicitMeta?.f ?? getImplicitFallback(surfaceId);
    if (implicitFForStats && nextSampleSet.samples.length) {
        const count = nextSampleSet.samples.length;
        const K = new Float32Array(count);
        const H = new Float32Array(count);
        const k1 = new Float32Array(count);
        const k2 = new Float32Array(count);
        let sizeHint =
          implicitDomainSize ?? implicitMeta?.size ?? (nextSampleSet.bbox ? nextSampleSet.bbox.getSize(new THREE.Vector3()).length() * 0.5 : 0);
        if (!sizeHint) sizeHint = radiusRef.current ?? 2.2;
        const h = Math.max(1e-4, sizeHint / Math.max(12, implicitResolution));
        for (let i = 0; i < count; i++) {
          const sample = nextSampleSet.samples[i];
          const curv = computeImplicitPrincipalAtPoint(implicitFForStats, sample.position, h);
          if (curv) {
            K[i] = curv.K;
            H[i] = curv.H;
            k1[i] = curv.k1;
            k2[i] = curv.k2;
          } else {
            K[i] = NaN;
            H[i] = NaN;
            k1[i] = NaN;
            k2[i] = NaN;
          }
        }
        nextSampleSet.curvatures = { K, H, k1, k2 };
    }

    sampleSetRef.current = nextSampleSet;
    onSampleSet?.(nextSampleSet);

    const box = new THREE.Box3().setFromObject(surfaceObj);
    const center = new THREE.Vector3();
    box.getCenter(center);
    centerRef.current.copy(center);

    const sizeVec = new THREE.Vector3();
    box.getSize(sizeVec);
    radiusRef.current = sizeVec.length() * 0.5 || 3;

    if (showBoundingBox) {
      const boxHelper = new THREE.Box3Helper(box, 0x999999);
      scene.add(boxHelper);
      bboxHelperRef.current = boxHelper;
    }

    const viewGizmo = new THREE.Group();
    viewGizmo.position.copy(center);
    viewGizmo.visible = showViewGizmo && showOverlayControls && !gizmoEnabled;
    viewGizmoRef.current = viewGizmo;
    scene.add(viewGizmo);

    const gizmoSize = Math.max(0.7, Math.min(1.7, (radiusRef.current || 3) * 0.26));
    const arrowLen = gizmoSize;
    const negLen = gizmoSize * 0.75;
    const headLen = Math.max(0.14, arrowLen * 0.22);
    const headWidth = Math.max(0.08, headLen * 0.6);

    const makeArrow = (dir: THREE.Vector3, len: number, color: number) => {
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), len, color, headLen, headWidth);
      arrow.renderOrder = 450;
      arrow.line.material.depthTest = false;
      arrow.line.material.depthWrite = false;
      arrow.cone.material.depthTest = false;
      arrow.cone.material.depthWrite = false;
      viewGizmo.add(arrow);
      return arrow;
    };

    const makePlane = (color: number, size: number) => {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      const geom = new THREE.PlaneGeometry(size, size);
      const plane = new THREE.Mesh(geom, mat);
      plane.renderOrder = 440;
      viewGizmo.add(plane);
      return plane;
    };

    const colorX = 0xe53b3b;
    const colorY = 0x2faf5c;
    const colorZ = 0x2f6fe8;

    makeArrow(new THREE.Vector3(1, 0, 0), arrowLen, colorX);
    makeArrow(new THREE.Vector3(-1, 0, 0), negLen, colorX);
    makeArrow(new THREE.Vector3(0, 1, 0), arrowLen, colorY);
    makeArrow(new THREE.Vector3(0, -1, 0), negLen, colorY);
    makeArrow(new THREE.Vector3(0, 0, 1), arrowLen, colorZ);
    makeArrow(new THREE.Vector3(0, 0, -1), negLen, colorZ);

    const planeSize = gizmoSize * 0.55;
    const planeXY = makePlane(colorZ, planeSize);
    planeXY.position.z = gizmoSize * 0.02;

    const planeYZ = makePlane(colorX, planeSize);
    planeYZ.rotation.y = Math.PI / 2;
    planeYZ.position.x = gizmoSize * 0.02;

    const planeXZ = makePlane(colorY, planeSize);
    planeXZ.rotation.x = -Math.PI / 2;
    planeXZ.position.y = gizmoSize * 0.02;

    const originSphere = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.04, gizmoSize * 0.08), 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xf2f5f8, depthTest: false, depthWrite: false })
    );
    originSphere.renderOrder = 460;
    viewGizmo.add(originSphere);

    let referenceGridOverlay: ReturnType<typeof createLayeredReferenceGrid> | null = null;
    if (showPlanes) {
      const halfSize = Math.max(3, Math.min(28, (radiusRef.current || 3) * 1.35));
      referenceGridOverlay = createLayeredReferenceGrid({
        halfSize,
        lineLift: Math.max(0.002, halfSize * 0.0012),
        originDotRadius: Math.max(0.04, halfSize * 0.014),
        showGrid: planeGridShowGrid,
        showMinorGrid: planeGridShowMinor,
        showLabels: planeGridShowLabels,
        showAxisLabels: planeGridShowAxisLabels,
        labelSkin: planeGridLabelSkin,
        showXY: planeGridShowXY,
        showXZ: planeGridShowXZ,
        showYZ: planeGridShowYZ,
        autoGridScale: planeGridAutoScale,
        gridDensity: planeGridDensity,
        planeOpacity: planeGridOpacity,
      });
      scene.add(referenceGridOverlay.group);
    }

    // ---- PROBE GADGET ----
    const probeMarkerGeom = new THREE.SphereGeometry(0.06, 18, 18);
    const probeMarkerMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const probeMarker = new THREE.Mesh(probeMarkerGeom, probeMarkerMat);
    probeMarker.visible = false;
    scene.add(probeMarker);

    const normalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      0.9,
      0x222266
    );
    normalArrow.visible = false;
    scene.add(normalArrow);

    const tangentPlaneGeom = new THREE.PlaneGeometry(1.5, 1.5);
    const tangentPlaneMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    const tangentPlane = new THREE.Mesh(tangentPlaneGeom, tangentPlaneMat);
    tangentPlane.visible = false;
    scene.add(tangentPlane);

    const tangentArrow1 = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      1.2,
      0x116611
    );
    tangentArrow1.visible = false;
    scene.add(tangentArrow1);

    const tangentArrow2 = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      1.2,
      0x661111
    );
    tangentArrow2.visible = false;
    scene.add(tangentArrow2);

    probeWidgetsRef.current = {
      marker: probeMarker,
      normal: normalArrow,
      plane: tangentPlane,
      t1: tangentArrow1,
      t2: tangentArrow2,
    };

    const gaussMarkerGeom = new THREE.SphereGeometry(0.045, 16, 16);
    const gaussMarkerMat = new THREE.MeshBasicMaterial({ color: 0xffd54f });
    const gaussMarker = new THREE.Mesh(gaussMarkerGeom, gaussMarkerMat);
    gaussMarker.visible = false;
    scene.add(gaussMarker);
    gaussHighlightRef.current = gaussMarker;

    const principalGroup = new THREE.Group();
    scene.add(principalGroup);
    principalGroupRef.current = principalGroup;

    const applyProbe = (
      point: THREE.Vector3,
      normalWorld: THREE.Vector3,
      xyDomain?: { x: number; y: number },
      uvDomain?: { u: number; v: number }
    ) => {
      const n = normalWorld.clone().normalize();

      probeMarker.position.copy(point);
      probeMarker.visible = true;

      normalArrow.position.copy(point);
      normalArrow.setDirection(n);
      normalArrow.visible = !!showProbeNormalRef.current;

      const offset = 0.014;
      const viewDir = camera.position.clone().sub(point).normalize();

      const tmp = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const e1 = new THREE.Vector3().crossVectors(tmp, n).normalize();
      const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();

      const basisMat = new THREE.Matrix4().makeBasis(e1, e2, n);

      tangentPlane.position.copy(point.clone().add(viewDir.multiplyScalar(offset)));
      tangentPlane.setRotationFromMatrix(basisMat);
      tangentPlane.visible = !!showProbeTangentPlaneRef.current;

      tangentArrow1.position.copy(point);
      tangentArrow1.setDirection(e1);
      tangentArrow1.visible = !!showProbeTangentsRef.current;

      tangentArrow2.position.copy(point);
      tangentArrow2.setDirection(e2);
      tangentArrow2.visible = !!showProbeTangentsRef.current;

      probePointRef.current = point.clone();
      probeNormalRef.current = n.clone();
      setProbePointToken((v) => v + 1);
      setProbeXY(xyDomain ?? null);
      setProbeHudLines(
        [
          `p: (${formatProbeNumber(point.x)}, ${formatProbeNumber(point.y)}, ${formatProbeNumber(point.z)})`,
          `n: (${formatProbeNumber(n.x)}, ${formatProbeNumber(n.y)}, ${formatProbeNumber(n.z)})`,
          uvDomain
            ? `uv: (${formatProbeNumber(uvDomain.u)}, ${formatProbeNumber(uvDomain.v)})`
            : xyDomain
            ? `xy: (${formatProbeNumber(xyDomain.x)}, ${formatProbeNumber(xyDomain.y)})`
            : "",
        ].filter(Boolean) as string[]
      );

      const cb = onProbeRef.current;
      if (cb) {
        cb({
          point: { x: point.x, y: point.y, z: point.z },
          normal: { x: n.x, y: n.y, z: n.z },
          xy: xyDomain,
          uv: uvDomain,
        });
      }
    };
    applyProbeFromDomainRef.current = applyProbe;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const findNearestSample = (point: THREE.Vector3) => {
      const sampleSet = sampleSetRef.current;
      if (!sampleSet || !sampleSet.samples.length) return null;
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < sampleSet.samples.length; i++) {
        const sample = sampleSet.samples[i];
        const d2 = sample.position.distanceToSquared(point);
        if (d2 < bestDist) {
          bestDist = d2;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) return null;
      return { index: bestIdx, sample: sampleSet.samples[bestIdx] };
    };

      const handlePointerDown = (event: PointerEvent) => {
        interruptCameraTour();
        if (
          !(showChartGridRef.current && surfaceCellSelectionEnabledRef.current) &&
          !probeEnabled &&
          !selectRegionEnabledRef.current &&
          !geodesicPathEnabledRef.current &&
          !geodesicHeatEnabledRef.current &&
          !geodesicDiskPickEnabledRef.current &&
          !inspectEnabledRef.current &&
          !dragEnabledRef.current
        )
          return;

        const activeTransformControls = transformControlsRef.current;
        if (
          activeTransformControls?.enabled &&
          ((activeTransformControls as any).dragging || (activeTransformControls as any).axis)
        ) {
          return;
        }

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointer.set(x, y);

      raycaster.setFromCamera(pointer, camera);
      const gridPickMesh = chartGridPickMeshRef.current;
      if (showChartGridRef.current && surfaceCellSelectionEnabledRef.current && gridPickMesh) {
        const gridPickStartAt = performance.now();
        const cellHits = raycaster.intersectObject(gridPickMesh, false);
        recordRaycastDuration(gridPickStartAt);
        if (cellHits.length) {
          const faceIndex = cellHits[0].faceIndex ?? -1;
          const cellFaceFactor = Math.max(1, chartGridCellFaceFactorRef.current);
          const renderableCellIndex = faceIndex >= 0 ? Math.floor(faceIndex / cellFaceFactor) : -1;
          const mappedCellIndex =
            renderableCellIndex >= 0
              ? (chartGridRenderableCellIndicesRef.current[renderableCellIndex] ?? -1)
              : -1;
          const cell = mappedCellIndex >= 0 ? chartGridCellsRef.current[mappedCellIndex] : null;
          if (cell) {
            setSelectedSurfaceCellIndex(mappedCellIndex);
            setSelectedSurfaceCellInfo(cell);
            if (
              !probeEnabled &&
              !selectRegionEnabledRef.current &&
              !geodesicPathEnabledRef.current &&
              !geodesicHeatEnabledRef.current &&
              !geodesicDiskPickEnabledRef.current &&
              !inspectEnabledRef.current &&
              !dragEnabledRef.current
            ) {
              return;
            }
          }
        }
      }
      const pickStartAt = performance.now();
      const intersects = raycaster.intersectObjects([surfaceObj], true);
      recordRaycastDuration(pickStartAt);
      if (!intersects.length) {
        const anchor = dragPlaneAnchorRef.current;
        const anchorPoint = anchor?.point;
        if (dragEnabledRef.current && event.button === 0 && anchorPoint) {
          const px = Number(anchorPoint.x);
          const py = Number(anchorPoint.y);
          const pz = Number(anchorPoint.z);
          if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) return;
          const planePoint = new THREE.Vector3(px, py, pz);
          const anchorNormal = anchor.normal;
          const hasExplicitNormal =
            Number.isFinite(anchorNormal?.x) ||
            Number.isFinite(anchorNormal?.y) ||
            Number.isFinite(anchorNormal?.z);
          const planeNormal = hasExplicitNormal
            ? new THREE.Vector3(
                Number.isFinite(anchorNormal?.x) ? Number(anchorNormal?.x) : 0,
                Number.isFinite(anchorNormal?.y) ? Number(anchorNormal?.y) : 0,
                Number.isFinite(anchorNormal?.z) ? Number(anchorNormal?.z) : 1
              )
            : new THREE.Vector3();
          if (!hasExplicitNormal) camera.getWorldDirection(planeNormal);
          if (planeNormal.lengthSq() < 1e-8) planeNormal.set(0, 0, 1);
          planeNormal.normalize();

          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint);
          const hitPoint = new THREE.Vector3();
          if (!raycaster.ray.intersectPlane(plane, hitPoint)) return;

          beginMeshInteraction();
          dragStateRef.current = {
            pointerId: event.pointerId,
            meshKey: anchor.meshKey,
            plane,
            startPoint: hitPoint.clone(),
            lastPoint: hitPoint.clone(),
            normal: planeNormal.clone(),
            moved: false,
          };
          const dragStartCb = onDragStartRef.current;
          if (dragStartCb) {
            dragStartCb({
              point: { x: planePoint.x, y: planePoint.y, z: planePoint.z },
              normal: { x: planeNormal.x, y: planeNormal.y, z: planeNormal.z },
              meshKey: anchor.meshKey,
            });
          }
          if (renderer.domElement.setPointerCapture) {
            renderer.domElement.setPointerCapture(event.pointerId);
          }
          const controls = controlsRef.current;
          if (controls) controls.enabled = false;
        }
        return;
      }
      const resolveHitMeshKey = (candidate: THREE.Intersection<THREE.Object3D>) => {
        const key = (candidate.object as any)?.userData?.__surfaceMeshOverrideId;
        return key == null ? null : String(key);
      };

      const isGraphSurface = isGraphId(surfaceId);
      const allowMeshPick = isGraphSurface || surfaceId === "surface_mesh";
      let hit = intersects[0];
      if (geodesicHeatEnabledRef.current || geodesicDiskPickEnabledRef.current) {
        const heatHit = allowMeshPick
          ? intersects.find((candidate) => typeof (candidate as any).faceIndex === "number")
          : intersects.find((candidate) => {
            const obj = candidate.object as any;
            const implicitMeta = obj?.userData?.__implicit as { source?: string } | undefined;
            return implicitMeta?.source === "cgal" && typeof (candidate as any).faceIndex === "number";
          });
        if (!heatHit) return;
        hit = heatHit;
      } else if (inspectEnabledRef.current && !dragEnabledRef.current && intersects.length > 1) {
        const selectedMeshKey = inspectSelectionMeshKeyRef.current;
        const firstHitMeshKey = resolveHitMeshKey(intersects[0]);
        if (selectedMeshKey && firstHitMeshKey === selectedMeshKey) {
          const alternate = intersects.find((candidate) => {
            const candidateKey = resolveHitMeshKey(candidate);
            return !!candidateKey && candidateKey !== selectedMeshKey;
          });
          if (alternate) hit = alternate;
        }
      }
      const point = hit.point.clone();
      const hitMeshKeyValue = (hit.object as any)?.userData?.__surfaceMeshOverrideId;
      const hitMeshKey = hitMeshKeyValue == null ? undefined : String(hitMeshKeyValue);

      let normalWorld = new THREE.Vector3(0, 1, 0);

      if (hit.face) {
        normalWorld.copy(hit.face.normal);
        const obj = hit.object as THREE.Object3D;
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(obj.matrixWorld);
        normalWorld.applyMatrix3(normalMatrix).normalize();
      } else if ((hit as any).normal) {
        normalWorld.copy((hit as any).normal).normalize();
      }

      let xyDomain: { x: number; y: number } | undefined;
      let uvDomain: { u: number; v: number } | undefined;
      if (isGraphSurface) {
        xyDomain = { x: point.x, y: point.z };
      }
      const hitUv = (hit as any).uv as THREE.Vector2 | undefined;
      if (hitUv && Number.isFinite(hitUv.x) && Number.isFinite(hitUv.y)) {
        uvDomain = { u: hitUv.x, v: hitUv.y };
      }

        if (geodesicDiskPickEnabledRef.current) {
          const diskCb = onGeodesicDiskPickRef.current;
          if (diskCb) {
            const mesh = hit.object as THREE.Mesh;
            const geom = mesh.geometry as THREE.BufferGeometry;
            const faceIndex = (hit as any).faceIndex;
            const implicitMeta = (mesh as any)?.userData?.__implicit as { source?: string } | undefined;
            const allowDiskPick = isGraphSurface || surfaceId === "surface_mesh" || implicitMeta?.source === "cgal";
            if (geom && typeof faceIndex === "number" && allowDiskPick) {
              const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
              const idxAttr = geom.getIndex();
              if (posAttr) {
                const triBase = faceIndex * 3;
                const i0 = idxAttr ? idxAttr.getX(triBase) : triBase;
                const i1 = idxAttr ? idxAttr.getX(triBase + 1) : triBase + 1;
                const i2 = idxAttr ? idxAttr.getX(triBase + 2) : triBase + 2;

                if (
                  i0 < 0 || i1 < 0 || i2 < 0 ||
                  i0 >= posAttr.count || i1 >= posAttr.count || i2 >= posAttr.count
                ) {
                  return;
                }

                const a = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
                const b = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
                const c = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
                const localPoint = point.clone();
                mesh.worldToLocal(localPoint);
                const bary = new THREE.Vector3();
                new THREE.Triangle(a, b, c).getBarycoord(localPoint, bary);
                if (Number.isFinite(bary.x) && Number.isFinite(bary.y) && Number.isFinite(bary.z)) {
                  diskCb({
                    point: { x: point.x, y: point.y, z: point.z },
                    normal: { x: normalWorld.x, y: normalWorld.y, z: normalWorld.z },
                    meshKey: mesh.uuid,
                    faceIndex,
                    bary: [bary.x, bary.y, bary.z],
                  });
                }
              }
            }
          }
          return;
        }

        if (geodesicHeatEnabledRef.current) {
          const heatCb = onGeodesicHeatPickRef.current;
          if (heatCb) {
            const mesh = hit.object as THREE.Mesh;
            const geom = mesh.geometry as THREE.BufferGeometry;
            const faceIndex = (hit as any).faceIndex;
            const implicitMeta = (mesh as any)?.userData?.__implicit as { source?: string } | undefined;
            const allowHeatPick = isGraphSurface || surfaceId === "surface_mesh" || implicitMeta?.source === "cgal";
            if (geom && typeof faceIndex === "number" && allowHeatPick) {
              const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
              const idxAttr = geom.getIndex();
              if (posAttr) {
                const triBase = faceIndex * 3;
                const i0 = idxAttr ? idxAttr.getX(triBase) : triBase;
                const i1 = idxAttr ? idxAttr.getX(triBase + 1) : triBase + 1;
                const i2 = idxAttr ? idxAttr.getX(triBase + 2) : triBase + 2;

                if (
                  i0 < 0 || i1 < 0 || i2 < 0 ||
                  i0 >= posAttr.count || i1 >= posAttr.count || i2 >= posAttr.count
                ) {
                  return;
                }

                const a = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
                const b = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
                const c = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
                const localPoint = point.clone();
                mesh.worldToLocal(localPoint);
                const bary = new THREE.Vector3();
                new THREE.Triangle(a, b, c).getBarycoord(localPoint, bary);
                if (Number.isFinite(bary.x) && Number.isFinite(bary.y) && Number.isFinite(bary.z)) {
                  heatCb({
                    point: { x: point.x, y: point.y, z: point.z },
                    normal: { x: normalWorld.x, y: normalWorld.y, z: normalWorld.z },
                    meshKey: mesh.uuid,
                    faceIndex,
                    bary: [bary.x, bary.y, bary.z],
                    uv: uvDomain,
                  });
                }
              }
            }
          }
          return;
        }

        if (geodesicPathEnabledRef.current) {
          const pathCb = onGeodesicPathPickRef.current;
          if (pathCb) {
            const nearest = findNearestSample(point);
            pathCb({
              point: { x: point.x, y: point.y, z: point.z },
              normal: { x: normalWorld.x, y: normalWorld.y, z: normalWorld.z },
              uv: uvDomain ?? (xyDomain ? { u: xyDomain.x, v: xyDomain.y } : undefined),
              sampleIndex: nearest?.index,
              meshKey: nearest?.sample.meshKey,
              vertexIndex: nearest?.sample.vertexIndex,
            });
          }
          return;
        }

        const dragAnchorMeshKey = dragPlaneAnchorRef.current?.meshKey;
        const dragMeshKey = dragAnchorMeshKey ?? hitMeshKey;
        if (dragEnabledRef.current && event.button === 0 && dragMeshKey) {
          beginMeshInteraction();
          const planeNormal = new THREE.Vector3();
          camera.getWorldDirection(planeNormal);
          if (planeNormal.lengthSq() < 1e-8) planeNormal.set(0, 0, 1);
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, point);
          dragStateRef.current = {
            pointerId: event.pointerId,
            meshKey: dragMeshKey,
            plane,
            startPoint: point.clone(),
            lastPoint: point.clone(),
            normal: normalWorld.clone(),
            moved: false,
            clickPick: {
              point: point.clone(),
              normal: normalWorld.clone(),
              meshKey: dragMeshKey,
              faceIndex: typeof (hit as any).faceIndex === "number" ? Number((hit as any).faceIndex) : undefined,
              uv: uvDomain,
              xy: xyDomain,
            },
          };
          const dragStartCb = onDragStartRef.current;
          if (dragStartCb) {
            dragStartCb({
              point: { x: point.x, y: point.y, z: point.z },
              normal: { x: normalWorld.x, y: normalWorld.y, z: normalWorld.z },
              meshKey: dragMeshKey,
            });
          }
          if (renderer.domElement.setPointerCapture) {
            renderer.domElement.setPointerCapture(event.pointerId);
          }
          const controls = controlsRef.current;
          if (controls) controls.enabled = false;
          return;
        }

        if (inspectEnabledRef.current) {
          const inspectCb = onInspectPickRef.current;
          if (inspectCb) {
            const nearest = findNearestSample(point);
            const faceIndex = typeof (hit as any).faceIndex === "number" ? Number((hit as any).faceIndex) : undefined;
            if (nearest) {
              const inspectNormal = nearest.sample.normal.clone().normalize();
              inspectCb({
                index: nearest.index,
                point: {
                  x: point.x,
                  y: point.y,
                  z: point.z,
                },
                normal: { x: inspectNormal.x, y: inspectNormal.y, z: inspectNormal.z },
                meshKey: hitMeshKey ?? nearest.sample.meshKey,
                faceIndex,
                vertexIndex: nearest.sample.vertexIndex,
                uv: uvDomain ?? (xyDomain ? { u: xyDomain.x, v: xyDomain.y } : undefined),
                xy: xyDomain,
              });
            } else {
              inspectCb({
                index: -1,
                point: { x: point.x, y: point.y, z: point.z },
                normal: { x: normalWorld.x, y: normalWorld.y, z: normalWorld.z },
                meshKey: hitMeshKey ?? undefined,
                faceIndex,
                vertexIndex: undefined,
                uv: uvDomain ?? (xyDomain ? { u: xyDomain.x, v: xyDomain.y } : undefined),
                xy: xyDomain,
              });
            }
          }
          return;
        }

      if (probeEnabled) {
        applyProbe(point, normalWorld, xyDomain, uvDomain);
      }

      const selectionCb = onSelectionPickRef.current;
      if (selectRegionEnabledRef.current && selectionCb) {
        const nearest = findNearestSample(point);
        selectionCb({
          point: { x: point.x, y: point.y, z: point.z },
          normal: { x: normalWorld.x, y: normalWorld.y, z: normalWorld.z },
          uv: uvDomain ?? (xyDomain ? { u: xyDomain.x, v: xyDomain.y } : undefined),
          sampleIndex: nearest?.index,
          meshKey: nearest?.sample.meshKey,
          vertexIndex: nearest?.sample.vertexIndex,
        });
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const activeTransformControls = transformControlsRef.current;
      if (
        activeTransformControls?.enabled &&
        ((activeTransformControls as any).dragging || (activeTransformControls as any).axis)
      ) {
        return;
      }

      const dragState = dragStateRef.current;
      const inspectHoverCb = onInspectHoverRef.current;
      if (!dragState) {
        if (!inspectEnabledRef.current || !inspectHoverCb) return;
      }
      if (
        !dragState &&
        canUseMeshInteractionLod &&
        meshRuntimeQualityRef.current !== "accurate"
      ) {
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointer.set(x, y);
      raycaster.setFromCamera(pointer, camera);

        if (dragState && event.pointerId === dragState.pointerId) {
        const hitPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(dragState.plane, hitPoint)) return;
        dragState.lastPoint.copy(hitPoint);
        const delta = hitPoint.clone().sub(dragState.startPoint);
        if (delta.lengthSq() > 1e-6) {
          dragState.moved = true;
        }
        const dragCb = onDragRef.current;
        if (dragCb) {
          dragCb({
            point: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
            normal: { x: dragState.normal.x, y: dragState.normal.y, z: dragState.normal.z },
            delta: { x: delta.x, y: delta.y, z: delta.z },
            meshKey: dragState.meshKey,
          });
        }
        return;
      }

      if (!inspectEnabledRef.current || !inspectHoverCb) return;
      const hoverPickStartAt = performance.now();
      const intersects = raycaster.intersectObjects([surfaceObj], true);
      recordRaycastDuration(hoverPickStartAt);
      if (!intersects.length) return;
      const hit = intersects[0];
      const point = hit.point.clone();
      const hitMeshKey = (hit.object as any)?.userData?.__surfaceMeshOverrideId;
      let normalWorld = new THREE.Vector3(0, 1, 0);
      if (hit.face) {
        normalWorld.copy(hit.face.normal);
        const obj = hit.object as THREE.Object3D;
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(obj.matrixWorld);
        normalWorld.applyMatrix3(normalMatrix).normalize();
      } else if ((hit as any).normal) {
        normalWorld.copy((hit as any).normal).normalize();
      }
      const isGraphSurface = isGraphId(surfaceId);
      let xyDomain: { x: number; y: number } | undefined;
      if (isGraphSurface) {
        xyDomain = { x: point.x, y: point.z };
      }
      let uvDomain: { u: number; v: number } | undefined;
      const hitUv = (hit as any).uv as THREE.Vector2 | undefined;
      if (hitUv && Number.isFinite(hitUv.x) && Number.isFinite(hitUv.y)) {
        uvDomain = { u: hitUv.x, v: hitUv.y };
      }
      const nearest = findNearestSample(point);
      const faceIndex = typeof (hit as any).faceIndex === "number" ? Number((hit as any).faceIndex) : undefined;
      if (nearest) {
        const inspectNormal = nearest.sample.normal.clone().normalize();
        inspectHoverCb({
          index: nearest.index,
          point: { x: point.x, y: point.y, z: point.z },
          normal: { x: inspectNormal.x, y: inspectNormal.y, z: inspectNormal.z },
          meshKey: hitMeshKey ?? nearest.sample.meshKey,
          faceIndex,
          vertexIndex: nearest.sample.vertexIndex,
          uv: uvDomain ?? (xyDomain ? { u: xyDomain.x, v: xyDomain.y } : undefined),
          xy: xyDomain,
        });
      } else {
        inspectHoverCb({
          index: -1,
          point: { x: point.x, y: point.y, z: point.z },
          normal: { x: normalWorld.x, y: normalWorld.y, z: normalWorld.z },
          meshKey: hitMeshKey ?? undefined,
          faceIndex,
          vertexIndex: undefined,
          uv: uvDomain ?? (xyDomain ? { u: xyDomain.x, v: xyDomain.y } : undefined),
          xy: xyDomain,
        });
      }
    };

      const handlePointerUp = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      dragStateRef.current = null;
      endMeshInteraction();
      if (renderer.domElement.releasePointerCapture) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
      const controls = controlsRef.current;
      if (controls) controls.enabled = true;
      if (!dragState.moved && dragState.clickPick && inspectEnabledRef.current) {
        const inspectCb = onInspectPickRef.current;
        if (inspectCb) {
          const clickPick = dragState.clickPick;
          const nearest = findNearestSample(clickPick.point);
          if (nearest) {
            const inspectNormal = nearest.sample.normal.clone().normalize();
            inspectCb({
              index: nearest.index,
              point: { x: clickPick.point.x, y: clickPick.point.y, z: clickPick.point.z },
              normal: { x: inspectNormal.x, y: inspectNormal.y, z: inspectNormal.z },
              meshKey: clickPick.meshKey ?? nearest.sample.meshKey,
              faceIndex: clickPick.faceIndex,
              vertexIndex: nearest.sample.vertexIndex,
              uv: clickPick.uv ?? (clickPick.xy ? { u: clickPick.xy.x, v: clickPick.xy.y } : undefined),
              xy: clickPick.xy,
            });
          } else {
            inspectCb({
              index: -1,
              point: { x: clickPick.point.x, y: clickPick.point.y, z: clickPick.point.z },
              normal: { x: clickPick.normal.x, y: clickPick.normal.y, z: clickPick.normal.z },
              meshKey: clickPick.meshKey,
              faceIndex: clickPick.faceIndex,
              vertexIndex: undefined,
              uv: clickPick.uv ?? (clickPick.xy ? { u: clickPick.xy.x, v: clickPick.xy.y } : undefined),
              xy: clickPick.xy,
            });
          }
        }
      }
      const dragEndCb = onDragEndRef.current;
      if (dragEndCb) {
        dragEndCb({
          point: { x: dragState.lastPoint.x, y: dragState.lastPoint.y, z: dragState.lastPoint.z },
          normal: { x: dragState.normal.x, y: dragState.normal.y, z: dragState.normal.z },
          meshKey: dragState.meshKey,
        });
      }
    };

    const handleWheel = (event: WheelEvent) => {
      interruptCameraTour();
      beginMeshInteraction();
      endMeshInteraction();
      if (!event.shiftKey) return;
      const cb = onShiftWheelScaleRef.current;
      if (!cb) return;
      event.preventDefault();
      event.stopPropagation();
      cb({ delta: event.deltaY });
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);

    setSceneEpoch((v) => v + 1);

    const syncRendererSize = (reframe = false) => {
      const { width: rawWidth, height: rawHeight } = getSize();
      if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight)) return;

      const w = Math.max(1, Math.round(rawWidth));
      const h = Math.max(1, Math.round(rawHeight));
      const nextDevicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
      const nextTargetPixelRatio = nextDevicePixelRatio * qualityScale;
      renderer.setPixelRatio(Math.min(nextTargetPixelRatio, maxPixelRatio));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);

      const radius = radiusRef.current;
      if (!Number.isFinite(radius) || radius <= 0) return;

      const center = centerRef.current;
      const fovY = THREE.MathUtils.degToRad(camera.fov);
      const fovX = 2 * Math.atan(Math.tan(fovY * 0.5) * camera.aspect);
      const minFov = Math.max(1e-3, Math.min(fovY, fovX));
      const fitPadding = Math.max(0.88, Math.min(1.35, reframePaddingFactor));
      const requiredDist = (radius * fitPadding) / Math.sin(minFov * 0.5);
      if (!Number.isFinite(requiredDist) || requiredDist <= 0) return;

      const currentDist = camera.position.distanceTo(center);
      if (!reframe && currentDist >= requiredDist) return;

      const viewDir = camera.position.clone().sub(controls.target);
      if (viewDir.lengthSq() < 1e-8) viewDir.set(0, 0, 1);
      viewDir.normalize();
      const nextDist = Math.max(requiredDist, currentDist);
      camera.position.copy(center).addScaledVector(viewDir, nextDist);
      controls.target.copy(center);
      camera.lookAt(center);
      controls.update();
    };
    forceReframeRef.current = () => {
      syncRendererSize(true);
      emitViewportDebug("window-reframe");
    };

    let resizeFrameId = 0;
    let resizeTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      syncRendererSize(false);
      emitViewportDebug("resize");
      if (resizeFrameId) cancelAnimationFrame(resizeFrameId);
      resizeFrameId = requestAnimationFrame(() => {
        resizeFrameId = 0;
        syncRendererSize(false);
        emitViewportDebug("resize-raf");
      });
      if (resizeTimeoutId) clearTimeout(resizeTimeoutId);
      resizeTimeoutId = setTimeout(() => {
        resizeTimeoutId = null;
        syncRendererSize(true);
        emitViewportDebug("resize-final");
      }, 120);
    };

    window.addEventListener("resize", handleResize);
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);
    handleResize();
    emitViewportDebug("init");

    let frameId = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (suspendRenderingRef.current) return;

      const now = performance.now();
      const hasContinuousMotion =
        meshInteractionActiveRef.current ||
        cameraTourFrameRef.current != null ||
        zoomAnimRef.current != null;
      if (!hasContinuousMotion && now - lastRenderedAtRef.current < IDLE_RENDER_MIN_FRAME_MS) {
        return;
      }
      if (hasContinuousMotion) {
        controls.update();
      }

      const perfFrame = perfFrameRef.current;
      if (perfFrame.lastFrameAt > 0) {
        const dt = Math.max(0.0001, now - perfFrame.lastFrameAt);
        perfFrame.frameTimeMs = perfFrame.frameTimeMs === 0 ? dt : perfFrame.frameTimeMs * 0.82 + dt * 0.18;
        const fps = 1000 / dt;
        perfFrame.fps = perfFrame.fps === 0 ? fps : perfFrame.fps * 0.82 + fps * 0.18;
      }
      perfFrame.lastFrameAt = now;
      lastRenderedAtRef.current = now;
      renderer.render(scene, camera);
      emitPerformanceSnapshot();
    };

    animate();

    return () => {
      forceReframeRef.current = null;
      stopCameraTour("stopped", false);
      cancelAnimationFrame(frameId);
      if (gizmoOverlayRestoreFrameRef.current != null) {
        cancelAnimationFrame(gizmoOverlayRestoreFrameRef.current);
        gizmoOverlayRestoreFrameRef.current = null;
      }
      gizmoDragStartPositionRef.current = null;
      gizmoDraggingRef.current = false;
      if (resizeFrameId) cancelAnimationFrame(resizeFrameId);
      if (resizeTimeoutId) clearTimeout(resizeTimeoutId);
      ro.disconnect();
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      window.removeEventListener("pointerup", handlePointerUp);
      controls.removeEventListener("change", handleControlsChangeDebug);

      if (isCameraLeader && onCameraSync) {
        controls.removeEventListener("change", emitCameraSync);
      }
      controls.removeEventListener("start", handleControlsStart);
      controls.removeEventListener("end", handleControlsEnd);
      transformControls.removeEventListener("dragging-changed", handleGizmoDraggingChanged);
      transformControls.removeEventListener("objectChange", handleGizmoObjectChange);
      transformControls.detach();
      if (transformControlsHelperRef.current) {
        scene.remove(transformControlsHelperRef.current);
        transformControlsHelperRef.current = null;
      }
      transformControls.dispose();
      if (transformControlsRef.current === transformControls) transformControlsRef.current = null;
      controls.dispose();

      viewGizmo.traverse(disposeObject3D);
      scene.remove(viewGizmo);
      if (viewGizmoRef.current === viewGizmo) viewGizmoRef.current = null;

      if (bboxHelperRef.current) {
        scene.remove(bboxHelperRef.current);
        bboxHelperRef.current.traverse(disposeObject3D);
        bboxHelperRef.current = null;
      }

      if (referenceGridOverlay) {
        scene.remove(referenceGridOverlay.group);
        referenceGridOverlay.dispose();
        referenceGridOverlay = null;
      }

      if (sliceGroupRef.current) {
        clearGroup(sliceGroupRef.current);
        scene.remove(sliceGroupRef.current);
      }

      if (principalGroupRef.current) {
        clearGroup(principalGroupRef.current);
        scene.remove(principalGroupRef.current);
        principalGroupRef.current = null;
      }
      if (principalGlyphsRef.current) {
        if (principalGlyphsRef.current.d1) {
          scene.remove(principalGlyphsRef.current.d1);
          principalGlyphsRef.current.d1.geometry.dispose();
          (principalGlyphsRef.current.d1.material as THREE.Material).dispose();
        }
        if (principalGlyphsRef.current.d2) {
          scene.remove(principalGlyphsRef.current.d2);
          principalGlyphsRef.current.d2.geometry.dispose();
          (principalGlyphsRef.current.d2.material as THREE.Material).dispose();
        }
        principalGlyphsRef.current = null;
      }

      if (curvatureLinesRef.current) {
        scene.remove(curvatureLinesRef.current);
        curvatureLinesRef.current.geometry.dispose();
        (curvatureLinesRef.current.material as THREE.Material).dispose();
        curvatureLinesRef.current = null;
      }

      if (ridgeLinesRef.current) {
        scene.remove(ridgeLinesRef.current);
        ridgeLinesRef.current.traverse(disposeObject3D);
        ridgeLinesRef.current = null;
      }

      if (valleyLinesRef.current) {
        scene.remove(valleyLinesRef.current);
        valleyLinesRef.current.traverse(disposeObject3D);
        valleyLinesRef.current = null;
      }

      if (gaussHighlightRef.current) {
        scene.remove(gaussHighlightRef.current);
        gaussHighlightRef.current.traverse(disposeObject3D);
        gaussHighlightRef.current = null;
      }

      if (principalProjectionGroupRef.current) {
        scene.remove(principalProjectionGroupRef.current);
        principalProjectionGroupRef.current.traverse(disposeObject3D);
        principalProjectionGroupRef.current = null;
      }

      if (selectionOverlayRef.current) {
        scene.remove(selectionOverlayRef.current);
        selectionOverlayRef.current.traverse(disposeObject3D);
        selectionOverlayRef.current = null;
      }

      if (geodesicPathLineRef.current) {
        scene.remove(geodesicPathLineRef.current);
        geodesicPathLineRef.current.traverse(disposeObject3D);
        geodesicPathLineRef.current = null;
      }
      if (geodesicPathMarkersRef.current.start) {
        scene.remove(geodesicPathMarkersRef.current.start);
        geodesicPathMarkersRef.current.start.traverse(disposeObject3D);
        geodesicPathMarkersRef.current.start = null;
      }
      if (geodesicPathMarkersRef.current.end) {
        scene.remove(geodesicPathMarkersRef.current.end);
        geodesicPathMarkersRef.current.end.traverse(disposeObject3D);
        geodesicPathMarkersRef.current.end = null;
      }

      if (implicitOverlayLines) {
        implicitOverlayLines.geometry.dispose();
        const matAny = implicitOverlayLines.material as THREE.Material | THREE.Material[] | undefined;
        if (matAny) {
          if (Array.isArray(matAny)) matAny.forEach((m) => m.dispose());
          else matAny.dispose();
        }
      }

      sliceGroupRef.current = null;

      scene.traverse((obj) => {
        const anyO = obj as any;
        if (anyO?.isMesh) {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const matAny = (mesh as any).material as THREE.Material | THREE.Material[] | undefined;
          if (matAny) {
            if (Array.isArray(matAny)) matAny.forEach((m) => m.dispose());
            else matAny.dispose();
          }
        }
      });

      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      rendererRef.current = null;
      applyProbeFromDomainRef.current = null;

      sampleSetRef.current = null;
      onSampleSet?.(null);
      sceneRef.current = null;

      surfaceObjRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, [
    surfaceId,
    graphExpr,
    implicitExpr,
    wireframe,
    showPlanes,
    lightPreset,
    colorMode,
    colorPalette,
    implicitOverlay,
    showBoundingBox,
    planeGridShowGrid,
    planeGridShowMinor,
    planeGridShowLabels,
    planeGridShowAxisLabels,
    planeGridLabelSkin,
    planeGridShowXY,
    planeGridShowXZ,
    planeGridShowYZ,
    planeGridAutoScale,
    planeGridDensity,
    planeGridOpacity,
    renderQuality,
    reframePaddingFactor,
    resetToken,
    probeEnabled,
    graphResolution,
    implicitResolution,
    implicitMeshToken,
    implicitDomainSize,
    graphDomain?.xSpan,
    graphDomain?.ySpan,
    isCameraLeader,
    onCameraSync,
    interruptCameraTour,
    beginMeshInteraction,
    endMeshInteraction,
    stopCameraTour,
  ]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setClearColor(sceneBackgroundColor, sceneBackgroundAlpha);
  }, [sceneBackgroundColor, sceneBackgroundAlpha]);

  useEffect(() => {
    const applyProbe = applyProbeFromDomainRef.current;
    if (!applyProbe) return;

    if (graphProbeXY && isGraphId(surfaceId)) {
      const { x, y } = graphProbeXY;
      const f = getGraphF();
      const z = f(x, y);
      if (!Number.isFinite(z)) return;

      const point = new THREE.Vector3(x, z, y);
      const eps = 1e-2;
      const fx = (f(x + eps, y) - f(x - eps, y)) / (2 * eps);
      const fy = (f(x, y + eps) - f(x, y - eps)) / (2 * eps);
      if (!Number.isFinite(fx) || !Number.isFinite(fy)) return;

      const normalWorld = new THREE.Vector3(fx, -1, fy);
      if (normalWorld.lengthSq() < 1e-12) return;
      normalWorld.normalize();
      applyProbe(point, normalWorld, { x, y });
      return;
    }

    if (implicitProbeXYZ && isImplicitId(surfaceId)) {
      const root = surfaceObjRef.current as THREE.Object3D | null;
      let implicitF: ((x: number, y: number, z: number) => number) | null = null;
      let implicitSize: number | null = null;

      if (root) {
        root.traverse((obj) => {
          if (implicitF) return;
          const anyObj = obj as any;
          if (!isImplicitMeshObj(anyObj)) return;
          const meta = anyObj.userData?.__implicit as
            | { f: (x: number, y: number, z: number) => number; size?: number }
            | undefined;
          if (!meta?.f) return;
          implicitF = meta.f;
          if (typeof meta.size === "number") implicitSize = meta.size;
        });
      }

      if (!implicitF) {
        const fallback = getImplicitFallback(surfaceId);
        if (fallback) implicitF = fallback;
      }
      if (!implicitF) return;

      const size = implicitDomainSize ?? implicitSize ?? radiusRef.current ?? 2.2;
      const h = Math.max(1e-3, size * 0.01);
      const p = new THREE.Vector3(implicitProbeXYZ.x, implicitProbeXYZ.y, implicitProbeXYZ.z);

      for (let it = 0; it < 6; it++) {
        const d = sampleImplicitDerivatives(implicitF, p.x, p.y, p.z, h);
        const gx = d.fx;
        const gy = d.fy;
        const gz = d.fz;
        const g2 = gx * gx + gy * gy + gz * gz;
        if (!Number.isFinite(g2) || g2 < 1e-10) return;
        const v = implicitF(p.x, p.y, p.z);
        if (!Number.isFinite(v)) return;
        const s = v / g2;
        p.x -= gx * s;
        p.y -= gy * s;
        p.z -= gz * s;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
        if (Math.abs(v) < 1e-5) break;
      }

      const d = sampleImplicitDerivatives(implicitF, p.x, p.y, p.z, h);
      const n = new THREE.Vector3(d.fx, d.fy, d.fz);
      if (n.lengthSq() < 1e-12) return;
      n.normalize();
      applyProbe(p, n);
    }
  }, [
    surfaceId,
    graphProbeXY,
    graphProbeToken,
    implicitProbeXYZ,
    implicitProbeToken,
    implicitDomainSize,
    sceneEpoch,
  ]);

  useEffect(() => {
    const tc = transformControlsRef.current;
    if (!tc) return;
    tc.setSize(1.35);
    tc.setMode(gizmoMode);
    tc.setSpace(gizmoSpace);
    tc.setTranslationSnap(
      gizmoTranslationSnap != null && Number.isFinite(gizmoTranslationSnap) && gizmoTranslationSnap > 0
        ? gizmoTranslationSnap
        : null
    );
    tc.setRotationSnap(
      gizmoRotationSnapDeg != null && Number.isFinite(gizmoRotationSnapDeg) && gizmoRotationSnapDeg > 0
        ? gizmoRotationSnapDeg * DEG_TO_RAD
        : null
    );
    tc.setScaleSnap(
      gizmoScaleSnap != null && Number.isFinite(gizmoScaleSnap) && gizmoScaleSnap > 0 ? gizmoScaleSnap : null
    );
  }, [gizmoMode, gizmoSpace, gizmoTranslationSnap, gizmoRotationSnapDeg, gizmoScaleSnap]);

  useEffect(() => {
    const tc = transformControlsRef.current;
    const helper = transformControlsHelperRef.current;
    tc?.detach();
    if (!tc) return;
    tc.enabled = false;
    tc.visible = false;
    if (helper) helper.visible = false;
    if (!gizmoEnabled || surfaceId !== "surface_mesh" || !gizmoMeshKey) return;
    const root = surfaceObjRef.current;
    if (!root) return;

    let target: THREE.Object3D | null = null;
    root.traverse((obj) => {
      if (target) return;
      const id = (obj as any)?.userData?.__surfaceMeshOverrideId;
      if (id != null && String(id) === gizmoMeshKey && (obj as any)?.isMesh) {
        target = obj;
      }
    });
    if (!target) return;
    tc.attach(target);
    tc.enabled = true;
    tc.visible = true;
    if (helper) helper.visible = true;
  }, [gizmoEnabled, gizmoMeshKey, surfaceId, sceneEpoch, surfaceMeshOverride, surfaceMeshOverrides]);

  useEffect(() => {
    if (surfaceId !== "surface_mesh") return;
    const scene = sceneRef.current;
    const surfaceObj = surfaceObjRef.current;
    if (!scene || !surfaceObj) return;

    const hasOverrides =
      !!surfaceMeshOverrides?.some((override) => (override.positions?.length ?? 0) >= 3);
    const useOverrides = hasOverrides;
    const useOverride = !useOverrides && !!surfaceMeshOverride?.positions?.length;
    if (!useOverrides && !useOverride) return;
    const runtimeQualityForMesh = canUseMeshInteractionLod ? meshRuntimeQuality : "accurate";

    const makeMaterial = (override?: SurfaceMeshOverride) =>
      new THREE.MeshStandardMaterial({
        color:
          colorMode === "solid"
            ? override?.color ?? solidColorForPalette(colorPalette)
            : 0xffffff,
        metalness: clamp01(override?.metalness ?? materialMetalness),
        roughness: clamp01(override?.roughness ?? materialRoughness),
        side: THREE.DoubleSide,
        wireframe: override?.wireframe ?? !!effectiveWireframe,
        flatShading: !!override?.flatShading,
        vertexColors: colorMode !== "solid",
        transparent: clamp01((override?.opacity ?? 1) * materialOpacity) < 1,
        opacity: clamp01((override?.opacity ?? 1) * materialOpacity),
      });

    const makeSurfaceMeshOverrideMesh = (override: SurfaceMeshOverride) => {
      const geom = new THREE.BufferGeometry();
      const lodBuffers = buildSurfaceMeshLodBuffers(
        override,
        runtimeQualityForMesh,
        meshInteractionQualityMode,
        normalizedMeshPreviewTriangleTarget
      );
      const positions = lodBuffers.positions;
      const normals = lodBuffers.normals;
      const uvs = lodBuffers.uvs;
      const indices = lodBuffers.indices;
      const validation = override.validation ?? null;
      const nanNormals = validation?.stats?.nanNormals ?? 0;

      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

      if (indices && indices.length >= 3) {
        geom.setIndex(new THREE.BufferAttribute(indices, 1));
      }

      if (uvs && uvs.length >= 2) {
        geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      }

      const normalsOk = !!normals && normals.length >= positions.length && nanNormals === 0;
      if (normalsOk) {
        geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      } else {
        geom.computeVertexNormals();
      }

      if (colorMode !== "solid") applyVertexColors(geom, colorMode, colorPalette);
      const mesh = new THREE.Mesh(geom, makeMaterial(override));
      if (override.id) {
        (mesh as any).userData.__surfaceMeshOverrideId = override.id;
      }
      (mesh as any).userData.__surfaceMeshLod = {
        runtimeQuality: runtimeQualityForMesh,
        fullTriangleCount: lodBuffers.fullTriangleCount,
        activeTriangleCount: lodBuffers.activeTriangleCount,
      };
      (mesh as any).userData.__surfaceMeshOverrideStyle = {
        color: override.color,
        opacity: override.opacity,
        roughness: override.roughness,
        metalness: override.metalness,
        wireframe: override.wireframe,
        flatShading: override.flatShading,
      };
      applySurfaceMeshOverrideTransform(mesh, override.transform);
      return mesh;
    };

    const rebuildSurfaceObject = () => {
      if (surfaceObjRef.current) {
        scene.remove(surfaceObjRef.current);
        surfaceObjRef.current.traverse(disposeObject3D);
        surfaceObjRef.current = null;
      }

      let nextObj: THREE.Object3D | null = null;
      if (useOverrides && surfaceMeshOverrides?.length) {
        const group = new THREE.Group();
        for (const override of surfaceMeshOverrides) {
          if (!override?.positions || (override.positions.length ?? 0) < 3) continue;
          group.add(makeSurfaceMeshOverrideMesh(override));
        }
        if (group.children.length) nextObj = group;
      } else if (useOverride && surfaceMeshOverride) {
        nextObj = makeSurfaceMeshOverrideMesh(surfaceMeshOverride);
      }

      if (!nextObj) return;
      scene.add(nextObj);
      surfaceObjRef.current = nextObj;
    };

    const updateGeometryFromOverride = (mesh: THREE.Mesh, override: SurfaceMeshOverride) => {
      const geom = mesh.geometry as THREE.BufferGeometry;
      const lodBuffers = buildSurfaceMeshLodBuffers(
        override,
        runtimeQualityForMesh,
        meshInteractionQualityMode,
        normalizedMeshPreviewTriangleTarget
      );
      const positions = lodBuffers.positions;
      const normals = lodBuffers.normals;
      const uvs = lodBuffers.uvs;
      const indices = lodBuffers.indices;
      const validation = override.validation ?? null;
      const nanNormals = validation?.stats?.nanNormals ?? 0;

      const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
      if (!posAttr || posAttr.array.length !== positions.length) {
        geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      } else {
        (posAttr.array as Float32Array).set(positions);
        posAttr.needsUpdate = true;
      }

      if (indices && indices.length >= 3) {
        const idxAttr = geom.getIndex();
        if (!idxAttr || (idxAttr.array as ArrayLike<number>).length !== indices.length) {
          geom.setIndex(new THREE.BufferAttribute(indices, 1));
        } else {
          (idxAttr.array as Uint32Array).set(indices);
          idxAttr.needsUpdate = true;
        }
      } else if (geom.getIndex()) {
        geom.setIndex(null);
      }

      if (uvs && uvs.length >= 2) {
        const uvAttr = geom.getAttribute("uv") as THREE.BufferAttribute | null;
        if (!uvAttr || uvAttr.array.length !== uvs.length) {
          geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        } else {
          (uvAttr.array as Float32Array).set(uvs);
          uvAttr.needsUpdate = true;
        }
      } else if (geom.getAttribute("uv")) {
        geom.deleteAttribute("uv");
      }

      const normalsOk = !!normals && normals.length >= positions.length && nanNormals === 0;
      if (normalsOk) {
        const nAttr = geom.getAttribute("normal") as THREE.BufferAttribute | null;
        if (!nAttr || nAttr.array.length !== normals.length) {
          geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        } else {
          (nAttr.array as Float32Array).set(normals);
          nAttr.needsUpdate = true;
        }
      } else {
        geom.computeVertexNormals();
      }

      geom.computeBoundingBox();
      geom.computeBoundingSphere();
      const style = {
        color: override.color,
        opacity: override.opacity,
        roughness: override.roughness,
        metalness: override.metalness,
        wireframe: override.wireframe,
        flatShading: override.flatShading,
      };
      (mesh as any).userData.__surfaceMeshLod = {
        runtimeQuality: runtimeQualityForMesh,
        fullTriangleCount: lodBuffers.fullTriangleCount,
        activeTriangleCount: lodBuffers.activeTriangleCount,
      };
      (mesh as any).userData.__surfaceMeshOverrideStyle = style;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        (m as any).wireframe = style.wireframe ?? !!effectiveWireframe;
        (m as any).flatShading = !!style.flatShading;
        (m as any).roughness = clamp01(style.roughness ?? materialRoughness);
        (m as any).metalness = clamp01(style.metalness ?? materialMetalness);
        const styleOpacity = clamp01((style.opacity ?? 1) * materialOpacity);
        (m as any).transparent = styleOpacity < 1;
        (m as any).opacity = styleOpacity;
        if (colorMode === "solid") {
          (m as any).color?.set(style.color ?? solidColorForPalette(colorPalette));
        }
        m.needsUpdate = true;
      }
      applySurfaceMeshOverrideTransform(mesh, override.transform);
    };

    const meshById = new Map<string, THREE.Mesh>();
    surfaceObj.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh?.isMesh || !mesh.geometry) return;
      const id = (mesh as any)?.userData?.__surfaceMeshOverrideId;
      if (id) meshById.set(String(id), mesh);
    });

    let needsRebuild = false;
    if (useOverrides && surfaceMeshOverrides) {
      if (meshById.size !== surfaceMeshOverrides.length) {
        needsRebuild = true;
      } else {
        for (const override of surfaceMeshOverrides) {
          if (!override?.id || !meshById.has(String(override.id))) {
            needsRebuild = true;
            break;
          }
        }
      }
    } else if (useOverride) {
      if (!surfaceObj || !(surfaceObj as any).isMesh) needsRebuild = true;
    }

    if (needsRebuild) {
      rebuildSurfaceObject();
    } else if (useOverrides && surfaceMeshOverrides) {
      for (const override of surfaceMeshOverrides) {
        if (!override?.id) continue;
        const mesh = meshById.get(String(override.id));
        if (mesh) updateGeometryFromOverride(mesh, override);
      }
    } else if (useOverride && surfaceMeshOverride && (surfaceObj as any)?.isMesh) {
      updateGeometryFromOverride(surfaceObj as THREE.Mesh, surfaceMeshOverride);
    }

    const activeSurfaceObj = surfaceObjRef.current;
    if (!activeSurfaceObj) return;

    activeSurfaceObj.updateMatrixWorld(true);
    const meshList: THREE.Mesh[] = [];
    activeSurfaceObj.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        meshList.push(mesh);
      }
    });

    const aggregatedSamples: SurfaceSampleSet["samples"] = [];
    const meshData: SurfaceSampleSet["meshData"] = [];
    let nextId = 0;
    let remainingSamples = Math.max(1, Math.floor(sampleMaxPoints));
    for (const mesh of meshList) {
      if (!mesh.geometry || remainingSamples <= 0) continue;
      mesh.updateMatrixWorld(true);
      const posAttr = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | null;
      if (posAttr) {
        const indexAttr = mesh.geometry.getIndex();
        const drawCount = getNonIndexedDrawCount(mesh.geometry as THREE.BufferGeometry, posAttr);
        const positions =
          drawCount != null
            ? (posAttr.array as Float32Array).subarray(0, drawCount * 3)
            : (posAttr.array as Float32Array);
        const meshKey = (mesh as any)?.userData?.__surfaceMeshOverrideId ?? mesh.uuid;
        meshData.push({
          key: meshKey,
          positions,
          indices: indexAttr ? indexAttr.array : null,
        });
      }
      const { samples: chunk } = buildSurfaceSampleSetFromViewer({
        geometry: mesh.geometry as THREE.BufferGeometry,
        worldMatrix: mesh.matrixWorld,
        maxSamples: remainingSamples,
        includeUV: includeSamplesUV,
        startId: nextId,
        meshKey: (mesh as any)?.userData?.__surfaceMeshOverrideId ?? mesh.uuid,
      });
      if (!chunk.length) continue;
      aggregatedSamples.push(...chunk);
      nextId += chunk.length;
      remainingSamples -= chunk.length;
    }

    let nextSampleSet: SurfaceSampleSet;
    if (aggregatedSamples.length) {
      const box = new THREE.Box3().setFromPoints(aggregatedSamples.map((s) => s.position));
      nextSampleSet = {
        samples: aggregatedSamples,
        bbox: box,
        center: box.getCenter(new THREE.Vector3()),
        meshData,
      };
    } else {
      nextSampleSet = { samples: [], meshData };
    }
    sampleSetRef.current = nextSampleSet;
    onSampleSet?.(nextSampleSet);

    const box = new THREE.Box3().setFromObject(activeSurfaceObj);
    const center = new THREE.Vector3();
    box.getCenter(center);
    centerRef.current.copy(center);

    const sizeVec = new THREE.Vector3();
    box.getSize(sizeVec);
    radiusRef.current = sizeVec.length() * 0.5 || 3;

    const viewGizmo = viewGizmoRef.current;
    if (viewGizmo) viewGizmo.position.copy(center);

    const existingBoxHelper = bboxHelperRef.current;
    if (showBoundingBox) {
      if (existingBoxHelper) {
        existingBoxHelper.box.copy(box);
      } else {
        const helper = new THREE.Box3Helper(box, 0x999999);
        scene.add(helper);
        bboxHelperRef.current = helper;
      }
    } else if (existingBoxHelper) {
      scene.remove(existingBoxHelper);
      existingBoxHelper.traverse(disposeObject3D);
      bboxHelperRef.current = null;
    }

    const tc = transformControlsRef.current;
    const helper = transformControlsHelperRef.current;
    tc?.detach();
    if (tc) {
      tc.enabled = false;
      tc.visible = false;
      if (helper) helper.visible = false;
      if (gizmoEnabled && surfaceId === "surface_mesh" && gizmoMeshKey) {
        let target: THREE.Object3D | null = null;
        activeSurfaceObj.traverse((obj) => {
          if (target) return;
          const id = (obj as any)?.userData?.__surfaceMeshOverrideId;
          if (id != null && String(id) === gizmoMeshKey && (obj as any)?.isMesh) {
            target = obj;
          }
        });
        if (target) {
          tc.attach(target);
          tc.enabled = true;
          tc.visible = true;
          if (helper) helper.visible = true;
        }
      }
    }
  }, [
    surfaceId,
    surfaceMeshOverride,
    surfaceMeshOverrides,
    colorMode,
    colorPalette,
    effectiveWireframe,
    materialOpacity,
    materialMetalness,
    materialRoughness,
    canUseMeshInteractionLod,
    meshRuntimeQuality,
    meshInteractionQualityMode,
    normalizedMeshPreviewTriangleTarget,
    includeSamplesUV,
    sampleMaxPoints,
    showBoundingBox,
    onSampleSet,
    gizmoEnabled,
    gizmoMeshKey,
  ]);

  useEffect(() => {
    if (!onGaussPoints) return;
    if (!gaussMapEnabled) {
      onGaussPoints([]);
      return;
    }

    const sampleSet = sampleSetRef.current;
    if (!sampleSet || !sampleSet.samples.length) {
      onGaussPoints([]);
      return;
    }

    const pts: GaussPoint[] = sampleSet.samples.map((sample) => ({
      id: sample.id,
      position: {
        x: sample.position.x,
        y: sample.position.y,
        z: sample.position.z,
      },
      normal: {
        x: sample.normal.x,
        y: sample.normal.y,
        z: sample.normal.z,
      },
    }));

    onGaussPoints(pts);
  }, [sceneEpoch, gaussMapEnabled, onGaussPoints]);

  useEffect(() => {
    const scene = sceneRef.current;
    const surfaceObj = surfaceObjRef.current;
    const sampleSet = sampleSetRef.current;
    if (!scene) return;

    if (selectionOverlayRef.current) {
      selectionOverlayRef.current.parent?.remove(selectionOverlayRef.current);
      selectionOverlayRef.current.traverse(disposeObject3D);
      selectionOverlayRef.current = null;
    }

    if (selectionSphereRef.current) {
      selectionSphereRef.current.parent?.remove(selectionSphereRef.current);
      selectionSphereRef.current.traverse(disposeObject3D);
      selectionSphereRef.current = null;
    }

    if (!effectiveSelectionOverlayVisible || !selectionMask || !sampleSet || !selectionMask.count) {
      return;
    }

    const positions = new Float32Array(selectionMask.count * 3);
    const parent = surfaceObj ?? scene;
    parent.updateMatrixWorld(true);
    const tmp = new THREE.Vector3();
    let ptr = 0;
    for (let i = 0; i < selectionMask.selected.length; i++) {
      if (!selectionMask.selected[i]) continue;
      const sample = sampleSet.samples[i];
      if (!sample) continue;
      if (parent !== scene) {
        tmp.copy(sample.position);
        parent.worldToLocal(tmp);
        positions[3 * ptr] = tmp.x;
        positions[3 * ptr + 1] = tmp.y;
        positions[3 * ptr + 2] = tmp.z;
      } else {
        positions[3 * ptr] = sample.position.x;
        positions[3 * ptr + 1] = sample.position.y;
        positions[3 * ptr + 2] = sample.position.z;
      }
      ptr++;
    }

    if (ptr === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const baseSize = Math.max(0.02, (radiusRef.current || 3) * 0.01);
    const material = new THREE.PointsMaterial({
      color: 0x800000,
      size: baseSize * (selectionOverlayOnTop ? 1.5 : 1),
      sizeAttenuation: true,
      depthTest: !selectionOverlayOnTop,
      depthWrite: false,
    });
    const overlay = new THREE.Points(geometry, material);
    overlay.renderOrder = selectionOverlayOnTop ? 200 : 30;
    parent.add(overlay);
    selectionOverlayRef.current = overlay;

    return () => {
      if (selectionOverlayRef.current === overlay) {
        overlay.parent?.remove(overlay);
        geometry.dispose();
        material.dispose();
        selectionOverlayRef.current = null;
      }
    };
  }, [selectionMask, sceneEpoch, effectiveSelectionOverlayVisible, selectionOverlayOnTop]);

  useEffect(() => {
    const scene = sceneRef.current;
    const surfaceObj = surfaceObjRef.current;
    if (!scene) return;

    if (selectionSphereRef.current) {
      selectionSphereRef.current.parent?.remove(selectionSphereRef.current);
      selectionSphereRef.current.traverse(disposeObject3D);
      selectionSphereRef.current = null;
    }

    if (!selectionSphere) return;

    const parent = surfaceObj ?? scene;
    parent.updateMatrixWorld(true);
    const geometry = new THREE.SphereGeometry(selectionSphere.radius, 24, 18);
    const material = new THREE.MeshBasicMaterial({
      color: 0x800000,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    const sphere = new THREE.Mesh(geometry, material);
    if (parent !== scene) {
      const center = new THREE.Vector3(
        selectionSphere.center.x,
        selectionSphere.center.y,
        selectionSphere.center.z
      );
      parent.worldToLocal(center);
      sphere.position.copy(center);
    } else {
      sphere.position.set(selectionSphere.center.x, selectionSphere.center.y, selectionSphere.center.z);
    }
    sphere.renderOrder = 25;
    parent.add(sphere);
    selectionSphereRef.current = sphere;

    return () => {
      if (selectionSphereRef.current === sphere) {
        sphere.parent?.remove(sphere);
        sphere.traverse(disposeObject3D);
        selectionSphereRef.current = null;
      }
    };
  }, [selectionSphere, sceneEpoch]);

  useEffect(() => {
    const cam = cameraRef.current;
    const controls = controlsRef.current;
    const sampleSet = sampleSetRef.current;
    if (!cam || !sampleSet || !selectionMask?.count) return;

    const isImmediate = zoomToRegionToken !== zoomNowRef.current;
    if (isImmediate) {
      zoomNowRef.current = zoomToRegionToken;
      if (zoomedToRegionRef.current && zoomRestoreRef.current) {
        if (zoomDebounceRef.current) {
          window.clearTimeout(zoomDebounceRef.current);
          zoomDebounceRef.current = null;
        }
        if (zoomAnimRef.current) cancelAnimationFrame(zoomAnimRef.current);
        const restore = zoomRestoreRef.current;
        const startPos = cam.position.clone();
        const startTarget = controls
          ? controls.target.clone()
          : cam.position.clone().add(cam.getWorldDirection(new THREE.Vector3()));
        const startUp = cam.up.clone();
        const endPos = restore.position.clone();
        const endTarget = restore.target.clone();
        const endUp = restore.up.clone();
        const startTime = performance.now();
        const duration = 280;
        const animate = () => {
          const now = performance.now();
          const t = Math.min(1, (now - startTime) / duration);
          const k = t * (2 - t);
          cam.position.lerpVectors(startPos, endPos, k);
          cam.up.lerpVectors(startUp, endUp, k);
          if (controls) {
            controls.target.lerpVectors(startTarget, endTarget, k);
            controls.update();
          } else {
            cam.lookAt(endTarget);
          }
          cam.updateProjectionMatrix();
          if (t < 1) {
            zoomAnimRef.current = requestAnimationFrame(animate);
          }
        };
        zoomAnimRef.current = requestAnimationFrame(animate);
        zoomRestoreRef.current = null;
        zoomedToRegionRef.current = false;
        return;
      }
    } else if (!zoomToRegion) {
      return;
    }

    const scheduleMs = isImmediate ? 0 : 220;
    if (zoomDebounceRef.current) {
      window.clearTimeout(zoomDebounceRef.current);
      zoomDebounceRef.current = null;
    }

    zoomDebounceRef.current = window.setTimeout(() => {
      const box = new THREE.Box3();
      let hasPoint = false;
      const selected = selectionMask.selected;
      for (let i = 0; i < selected.length; i++) {
        if (!selected[i]) continue;
        const sample = sampleSet.samples[i];
        if (!sample) continue;
        box.expandByPoint(sample.position);
        hasPoint = true;
      }
      if (!hasPoint) return;

      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(1e-6, size.length() * 0.5);
      const padding = 1.2;
      const fov = THREE.MathUtils.degToRad(cam.fov);
      const dist = (radius * padding) / Math.sin(Math.max(1e-3, fov * 0.5));

      const startPos = cam.position.clone();
      const startTarget = controls
        ? controls.target.clone()
        : cam.position.clone().add(cam.getWorldDirection(new THREE.Vector3()));
      if (!zoomedToRegionRef.current) {
        zoomRestoreRef.current = {
          position: cam.position.clone(),
          target: startTarget.clone(),
          up: cam.up.clone(),
        };
        zoomedToRegionRef.current = true;
      }
      const viewDir = startPos.clone().sub(startTarget);
      if (viewDir.lengthSq() < 1e-8) viewDir.set(0, 0, 1);
      viewDir.normalize();
      const endPos = center.clone().addScaledVector(viewDir, dist);

      const startUp = cam.up.clone();
      const endUp = cam.up.clone();
      const startTime = performance.now();
      const duration = 280;
      const animate = () => {
        const now = performance.now();
        const t = Math.min(1, (now - startTime) / duration);
        const k = t * (2 - t);
        cam.position.lerpVectors(startPos, endPos, k);
        cam.up.lerpVectors(startUp, endUp, k);
        if (controls) {
          controls.target.lerpVectors(startTarget, center, k);
          controls.update();
        } else {
          cam.lookAt(center);
        }
        cam.updateProjectionMatrix();
        if (t < 1) {
          zoomAnimRef.current = requestAnimationFrame(animate);
        }
      };

      if (zoomAnimRef.current) cancelAnimationFrame(zoomAnimRef.current);
      zoomAnimRef.current = requestAnimationFrame(animate);
    }, scheduleMs);

    return () => {
      if (zoomDebounceRef.current) {
        window.clearTimeout(zoomDebounceRef.current);
        zoomDebounceRef.current = null;
      }
    };
  }, [selectionMask, zoomToRegion, zoomToRegionToken]);

  useEffect(() => {
    const prev = zoomTogglePrevRef.current;
    if (prev && !zoomToRegion) {
      const cam = cameraRef.current;
      const controls = controlsRef.current;
      const restore = zoomRestoreRef.current;
      if (zoomDebounceRef.current) {
        window.clearTimeout(zoomDebounceRef.current);
        zoomDebounceRef.current = null;
      }
      if (zoomAnimRef.current) cancelAnimationFrame(zoomAnimRef.current);
      if (cam && restore) {
        const startPos = cam.position.clone();
        const startTarget = controls
          ? controls.target.clone()
          : cam.position.clone().add(cam.getWorldDirection(new THREE.Vector3()));
        const startUp = cam.up.clone();

        const endPos = restore.position.clone();
        const endTarget = restore.target.clone();
        const endUp = restore.up.clone();

        const startTime = performance.now();
        const duration = 280;
        const animate = () => {
          const now = performance.now();
          const t = Math.min(1, (now - startTime) / duration);
          const k = t * (2 - t);
          cam.position.lerpVectors(startPos, endPos, k);
          cam.up.lerpVectors(startUp, endUp, k);
          if (controls) {
            controls.target.lerpVectors(startTarget, endTarget, k);
            controls.update();
          } else {
            cam.lookAt(endTarget);
          }
          cam.updateProjectionMatrix();
          if (t < 1) {
            zoomAnimRef.current = requestAnimationFrame(animate);
          }
        };
        zoomAnimRef.current = requestAnimationFrame(animate);
      }
      zoomRestoreRef.current = null;
      zoomedToRegionRef.current = false;
    }
    zoomTogglePrevRef.current = zoomToRegion;
  }, [zoomToRegion]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (inspectMarkerRef.current) {
      scene.remove(inspectMarkerRef.current);
      inspectMarkerRef.current.traverse(disposeObject3D);
      inspectMarkerRef.current = null;
    }

    if (!inspectPoint) return;

    const geometry = new THREE.SphereGeometry(0.035, 16, 12);
    const material = new THREE.MeshBasicMaterial({ color: 0xffd54f });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(inspectPoint.x, inspectPoint.y, inspectPoint.z);
    marker.renderOrder = 210;
    scene.add(marker);
    inspectMarkerRef.current = marker;

    return () => {
      if (inspectMarkerRef.current === marker) {
        scene.remove(marker);
        marker.traverse(disposeObject3D);
        inspectMarkerRef.current = null;
      }
    };
  }, [inspectPoint, sceneEpoch]);

  useEffect(() => {
    const scene = sceneRef.current;
    const surfaceObj = surfaceObjRef.current;
    if (!scene || !surfaceObj) return;

    const clearMarker = (marker: THREE.Mesh | null) => {
      if (!marker) return;
      scene.remove(marker);
      marker.traverse(disposeObject3D);
    };

    if (geodesicPathLineRef.current) {
      scene.remove(geodesicPathLineRef.current);
      geodesicPathLineRef.current.traverse(disposeObject3D);
      geodesicPathLineRef.current = null;
    }
    if (geodesicPathMarkersRef.current.start) {
      clearMarker(geodesicPathMarkersRef.current.start);
      geodesicPathMarkersRef.current.start = null;
    }
    if (geodesicPathMarkersRef.current.end) {
      clearMarker(geodesicPathMarkersRef.current.end);
      geodesicPathMarkersRef.current.end = null;
    }

    const pathMeshKey = geodesicPathStart?.meshKey ?? geodesicPathEnd?.meshKey;
    if (!pathMeshKey) return;

    const findMeshByKey = (meshKey: string): THREE.Mesh | null => {
      let found: THREE.Mesh | null = null;
      surfaceObj.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && mesh.uuid === meshKey) found = mesh;
      });
      return found;
    };

    const placeMarker = (endpoint: { meshKey: string; vertexIndex: number }, color: number) => {
      const mesh = findMeshByKey(endpoint.meshKey);
      if (!mesh) return null;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute | null;
      if (!posAttr) return null;
      if (endpoint.vertexIndex < 0 || endpoint.vertexIndex >= posAttr.count) return null;

      const pos = new THREE.Vector3(
        posAttr.getX(endpoint.vertexIndex),
        posAttr.getY(endpoint.vertexIndex),
        posAttr.getZ(endpoint.vertexIndex)
      );
      pos.applyMatrix4(mesh.matrixWorld);

      const markerGeom = new THREE.SphereGeometry(0.035, 16, 12);
      const markerMat = new THREE.MeshBasicMaterial({ color });
      const marker = new THREE.Mesh(markerGeom, markerMat);
      marker.position.copy(pos);
      marker.renderOrder = 220;
      scene.add(marker);
      return marker;
    };

    if (geodesicPathStart) {
      geodesicPathMarkersRef.current.start = placeMarker(geodesicPathStart, 0x33cc66);
    }
    if (geodesicPathEnd) {
      geodesicPathMarkersRef.current.end = placeMarker(geodesicPathEnd, 0xff6633);
    }

    if (!geodesicPathIndices?.length) return;

    const mesh = findMeshByKey(pathMeshKey);
    if (!mesh) return;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute | null;
    const uvAttr = geometry.getAttribute("uv") as THREE.BufferAttribute | null;
    if (!posAttr) return;

    const rawPoints: THREE.Vector3[] = [];
    const rawUVs: { u: number; v: number }[] = [];
    const tmp = new THREE.Vector3();
    for (let i = 0; i < geodesicPathIndices.length; i++) {
      const idx = geodesicPathIndices[i];
      if (idx < 0 || idx >= posAttr.count) continue;
      tmp.set(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
      tmp.applyMatrix4(mesh.matrixWorld);
      rawPoints.push(tmp.clone());
      if (uvAttr) {
        rawUVs.push({ u: uvAttr.getX(idx), v: uvAttr.getY(idx) });
      }
    }
    if (rawPoints.length < 2) return;

    let drawPoints = rawPoints;
    let sphereApplied = false;
    if (surfaceId === "sphere" && rawPoints.length >= 2) {
      const center = centerRef.current ?? new THREE.Vector3(0, 0, 0);
      const start = rawPoints[0].clone().sub(center);
      const end = rawPoints[rawPoints.length - 1].clone().sub(center);
      const aLen = start.length();
      const bLen = end.length();
      const r = (aLen + bLen) * 0.5;
      if (r > 1e-8 && aLen > 1e-8 && bLen > 1e-8) {
        const n0 = start.clone().multiplyScalar(1 / aLen);
        const n1 = end.clone().multiplyScalar(1 / bLen);
        const dot = Math.min(1, Math.max(-1, n0.dot(n1)));
        const angle = Math.acos(dot);
        if (Number.isFinite(angle)) {
          const maxSegment = Math.max(0.008, r / 160);
          const arcLen = r * angle;
          const segments = Math.min(720, Math.max(12, Math.ceil(arcLen / maxSegment)));
          const points: THREE.Vector3[] = [];
          if (angle < 1e-6) {
            points.push(rawPoints[0].clone(), rawPoints[rawPoints.length - 1].clone());
          } else if (Math.abs(Math.PI - angle) < 1e-4) {
            let axis = new THREE.Vector3(1, 0, 0);
            if (Math.abs(n0.dot(axis)) > 0.9) axis.set(0, 1, 0);
            axis = axis.cross(n0).normalize();
            const q = new THREE.Quaternion();
            for (let i = 0; i <= segments; i++) {
              const t = i / segments;
              q.setFromAxisAngle(axis, angle * t);
              points.push(n0.clone().applyQuaternion(q).multiplyScalar(r).add(center));
            }
          } else {
            const sinAngle = Math.sin(angle);
            for (let i = 0; i <= segments; i++) {
              const t = i / segments;
              const s0 = Math.sin((1 - t) * angle) / sinAngle;
              const s1 = Math.sin(t * angle) / sinAngle;
              points.push(n0.clone().multiplyScalar(s0).addScaledVector(n1, s1).multiplyScalar(r).add(center));
            }
          }
          if (points.length >= 2) {
            drawPoints = points;
            sphereApplied = true;
          }
        }
      }
    }
    let paramApplied = false;
    if (
      !sphereApplied &&
      (surfaceId === "paraboloid" || surfaceId === "hyperboloid") &&
      uvAttr &&
      rawUVs.length === rawPoints.length &&
      rawPoints.length >= 2
    ) {
      const uMin = 0;
      const uMax = 1;
      const vMin = 0;
      const vMax = 1;
      const uRange = uMax - uMin;
      const vRange = vMax - vMin;
      const wrapU = false;
      const wrapV = true;

      const paramFunc = (u: number, v: number, target: THREE.Vector3) => {
        if (surfaceId === "paraboloid") {
          const r = u * 1.4;
          const theta = v * Math.PI * 2;
          const x = r * Math.cos(theta);
          const z = r * Math.sin(theta);
          const y = r * r;
          target.set(x, y, z);
        } else {
          const t = (u - 0.5) * 2;
          const theta = v * Math.PI * 2;
          const a = 0.8;
          const c = 0.6;
          const cosh = Math.cosh(t);
          const sinh = Math.sinh(t);
          target.set(a * cosh * Math.cos(theta), c * sinh, a * cosh * Math.sin(theta));
        }
        return target;
      };

      const unwrapDelta = (a: number, b: number, range: number, wrap: boolean) => {
        let d = b - a;
        if (wrap && Number.isFinite(range) && range > 0) {
          if (d > 0.5 * range) d -= range;
          else if (d < -0.5 * range) d += range;
        }
        return d;
      };

      const smoothFromUVs = (): THREE.Vector3[] | null => {
        const minSep = 1e-6;
        const dedupPoints: THREE.Vector3[] = [];
        const dedupUVs: { u: number; v: number }[] = [];
        for (let i = 0; i < rawPoints.length; i++) {
          const p = rawPoints[i];
          const last = dedupPoints[dedupPoints.length - 1];
          if (!last || last.distanceToSquared(p) > minSep * minSep) {
            dedupPoints.push(p.clone());
            dedupUVs.push({ u: rawUVs[i].u, v: rawUVs[i].v });
          }
        }
        if (dedupUVs.length < 2) return null;

        const unwrapped: { u: number; v: number }[] = [];
        let prev = dedupUVs[0];
        unwrapped.push({ u: prev.u, v: prev.v });
        for (let i = 1; i < dedupUVs.length; i++) {
          let u = dedupUVs[i].u;
          let v = dedupUVs[i].v;
          const du = unwrapDelta(prev.u, u, uRange, wrapU);
          const dv = unwrapDelta(prev.v, v, vRange, wrapV);
          u = prev.u + du;
          v = prev.v + dv;
          const next = { u, v };
          unwrapped.push(next);
          prev = next;
        }

        const sizeHint = radiusRef.current || 3;
        const maxSegment = Math.max(0.008, sizeHint / 160);
        let totalLen = 0;
        for (let i = 0; i + 1 < dedupPoints.length; i++) {
          totalLen += dedupPoints[i].distanceTo(dedupPoints[i + 1]);
        }

        let control = unwrapped;
        const smoothIters = control.length >= 3 ? Math.min(4, Math.max(2, Math.floor(control.length / 8))) : 0;
        for (let iter = 0; iter < smoothIters; iter++) {
          if (control.length < 3) break;
          const next: { u: number; v: number }[] = [];
          next.push(control[0]);
          for (let i = 0; i + 1 < control.length; i++) {
            const a = control[i];
            const b = control[i + 1];
            next.push({ u: a.u * 0.75 + b.u * 0.25, v: a.v * 0.75 + b.v * 0.25 });
            next.push({ u: a.u * 0.25 + b.u * 0.75, v: a.v * 0.25 + b.v * 0.75 });
          }
          next.push(control[control.length - 1]);
          control = next;
        }

        const baseSamples = Math.min(1200, Math.max(24, Math.ceil(totalLen / maxSegment)));
        const minSamples = Math.min(1200, Math.max(24, control.length * 4));
        const sampleCount = Math.max(baseSamples, minSamples);

        const controlPoints = control.map((uv) => new THREE.Vector3(uv.u, uv.v, 0));
        let smoothed = control;
        if (controlPoints.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(controlPoints, false, "centripetal", 0.5);
          smoothed = curve.getPoints(sampleCount).map((p) => ({ u: p.x, v: p.y }));
        }

        const clamp = (val: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, val));
        const wrapCoord = (val: number, lo: number, hi: number) => {
          const range = hi - lo;
          if (!Number.isFinite(range) || range <= 0) return lo;
          let t = (val - lo) % range;
          if (t < 0) t += range;
          return lo + t;
        };

        const smoothedPoints: THREE.Vector3[] = [];
        const tmpP = new THREE.Vector3();
        for (const uv of smoothed) {
          const u = wrapU ? wrapCoord(uv.u, uMin, uMax) : clamp(uv.u, uMin, uMax);
          const v = wrapV ? wrapCoord(uv.v, vMin, vMax) : clamp(uv.v, vMin, vMax);
          paramFunc(u, v, tmpP);
          tmpP.applyMatrix4(mesh.matrixWorld);
          smoothedPoints.push(tmpP.clone());
        }
        return smoothedPoints.length >= 2 ? smoothedPoints : null;
      };

      const tryGeodesicShooting = (): THREE.Vector3[] | null => {
        const segCount = Math.min(rawUVs.length - 1, 4);
        let du = 0;
        let dv = 0;
        for (let i = 0; i < segCount; i++) {
          du += unwrapDelta(rawUVs[i].u, rawUVs[i + 1].u, uRange, wrapU);
          dv += unwrapDelta(rawUVs[i].v, rawUVs[i + 1].v, vRange, wrapV);
        }
        if (Math.hypot(du, dv) < 1e-6 && rawUVs.length > 2) {
          du = unwrapDelta(rawUVs[0].u, rawUVs[2].u, uRange, wrapU) * 0.5;
          dv = unwrapDelta(rawUVs[0].v, rawUVs[2].v, vRange, wrapV) * 0.5;
        }
        if (Math.hypot(du, dv) < 1e-6) {
          du = unwrapDelta(rawUVs[0].u, rawUVs[rawUVs.length - 1].u, uRange, wrapU);
          dv = unwrapDelta(rawUVs[0].v, rawUVs[rawUVs.length - 1].v, vRange, wrapV);
        }
        const dirLen = Math.hypot(du, dv);
        if (dirLen <= 1e-8) return null;

        const d0 = { du: du / dirLen, dv: dv / dirLen };
        const d1 = { du: -d0.dv, dv: d0.du };

        let rawLen = 0;
        for (let i = 1; i < rawPoints.length; i++) {
          rawLen += rawPoints[i - 1].distanceTo(rawPoints[i]);
        }
        const sizeHint = radiusRef.current || 3;
        const maxSegment = Math.max(0.008, sizeHint / 160);
        const stepScale = 0.35;
        const steps = Math.min(1800, Math.max(320, Math.ceil(rawLen / Math.max(1e-5, maxSegment * stepScale))));
        const maxArcLength = rawLen * 1.05;

        const sigmaWorld = (u: number, v: number, target?: THREE.Vector3) => {
          const t = target ?? new THREE.Vector3();
          paramFunc(u, v, t);
          t.applyMatrix4(mesh.matrixWorld);
          return t;
        };

        const shoot = (theta: number) => {
          const c = Math.cos(theta);
          const s = Math.sin(theta);
          const dir = { du: d0.du * c + d1.du * s, dv: d0.dv * c + d1.dv * s };
          const pts = integrateGeodesic({
            sigma: sigmaWorld,
            startUV: rawUVs[0],
            dirUV: dir,
            domain: { uMin, uMax, vMin, vMax },
            wrap: { wrapU, wrapV },
            steps,
            h: maxArcLength / steps,
            maxArcLength,
            maxStepLength3D: maxSegment * 2,
          });
          const endPoint = pts.length ? pts[pts.length - 1] : null;
          const err = endPoint ? endPoint.distanceTo(rawPoints[rawPoints.length - 1]) : Number.POSITIVE_INFINITY;
          return { pts, err, theta };
        };

        const span = Math.PI;
        const samples = 17;
        let best = { pts: [] as THREE.Vector3[], err: Number.POSITIVE_INFINITY, theta: 0 };
        for (let i = 0; i < samples; i++) {
          const t = -span + (2 * span * i) / (samples - 1);
          const candidate = shoot(t);
          if (candidate.err < best.err) best = candidate;
        }

        let step = span / Math.max(1, samples - 1);
        for (let iter = 0; iter < 6; iter++) {
          const left = shoot(best.theta - step);
          const right = shoot(best.theta + step);
          if (left.err < best.err) best = left;
          if (right.err < best.err) best = right;
          step *= 0.5;
        }

        const acceptErr = Math.max(rawLen * 0.4, maxSegment * 6);
        if (best.pts.length >= 2 && best.err < acceptErr) {
          best.pts[0] = rawPoints[0].clone();
          best.pts[best.pts.length - 1] = rawPoints[rawPoints.length - 1].clone();
          return best.pts;
        }
        return null;
      };

      const shot = tryGeodesicShooting();
      if (shot) {
        drawPoints = shot;
        paramApplied = true;
      } else {
        const fallback = smoothFromUVs();
        if (fallback) {
          drawPoints = fallback;
          paramApplied = true;
        }
      }
    }

    if (!sphereApplied && !paramApplied && isImplicitId(surfaceId) && rawPoints.length >= 2) {
      const implicitMeta = (surfaceObj as any)?.userData?.__implicit as
        | { f: (x: number, y: number, z: number) => number; size?: number }
        | undefined;
      const implicitF = implicitMeta?.f ?? getImplicitFallback(surfaceId);
      if (implicitF) {
        const deduped: THREE.Vector3[] = [];
        const minSep = 1e-5;
        for (const p of rawPoints) {
          const last = deduped[deduped.length - 1];
          if (!last || last.distanceToSquared(p) > minSep * minSep) {
            deduped.push(p.clone());
          }
        }
        if (deduped.length >= 2) {
          const sizeHint = implicitMeta?.size ?? 2;
          const maxSegment = Math.max(0.012, sizeHint / 85);
          const densified: THREE.Vector3[] = [deduped[0].clone()];
          for (let i = 0; i + 1 < deduped.length; i++) {
            const a = deduped[i];
            const b = deduped[i + 1];
            const segLen = a.distanceTo(b);
            const steps = Math.max(1, Math.ceil(segLen / maxSegment));
            for (let s = 1; s <= steps; s++) {
              densified.push(a.clone().lerp(b, s / steps));
            }
          }

          const projH = Math.max(1e-4, sizeHint / 1000);
          const maxStep = Math.max(0.02, sizeHint / 80);
          const projected = densified.map((p) =>
            projectPointToImplicitSurface(implicitF, p.clone(), { h: projH, maxStep })
          );

          let smoothed = projected;
          const chaikinIters = Math.min(4, Math.max(1, Math.floor(projected.length / 80)));
          for (let iter = 0; iter < chaikinIters; iter++) {
            if (smoothed.length < 2) break;
            const next: THREE.Vector3[] = [];
            next.push(rawPoints[0].clone());
            for (let i = 0; i + 1 < smoothed.length; i++) {
              const a = smoothed[i];
              const b = smoothed[i + 1];
              const q = projectPointToImplicitSurface(implicitF, a.clone().lerp(b, 0.25), { h: projH, maxStep });
              const r = projectPointToImplicitSurface(implicitF, a.clone().lerp(b, 0.75), { h: projH, maxStep });
              next.push(q, r);
            }
            next.push(rawPoints[rawPoints.length - 1].clone());
            smoothed = next;
          }

          if (smoothed.length >= 4) {
            const start = smoothed[0];
            const end = smoothed[smoothed.length - 1];
            const startDir = smoothed[2].clone().sub(smoothed[1]);
            if (startDir.lengthSq() > 1e-12) {
              startDir.normalize();
              const len = start.distanceTo(smoothed[1]);
              const adjusted = start.clone().addScaledVector(startDir, len);
              smoothed[1] = projectPointToImplicitSurface(implicitF, adjusted, { h: projH, maxStep });
            }

            const endDir = smoothed[smoothed.length - 2].clone().sub(smoothed[smoothed.length - 3]);
            if (endDir.lengthSq() > 1e-12) {
              endDir.normalize();
              const len = end.distanceTo(smoothed[smoothed.length - 2]);
              const adjusted = end.clone().addScaledVector(endDir, -len);
              smoothed[smoothed.length - 2] = projectPointToImplicitSurface(implicitF, adjusted, { h: projH, maxStep });
            }
          }

          drawPoints = smoothed;
        }
      }
    }

    const lineGeom = new THREE.BufferGeometry().setFromPoints(drawPoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xff6b00,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    });
    const line = new THREE.Line(lineGeom, lineMat);
    line.renderOrder = 215;
    line.frustumCulled = false;
    scene.add(line);
    geodesicPathLineRef.current = line;
  }, [geodesicPathEnd, geodesicPathIndices, geodesicPathStart, sceneEpoch, surfaceId]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const clearMarker = (marker: THREE.Mesh | null) => {
      if (!marker) return;
      scene.remove(marker);
      marker.traverse(disposeObject3D);
    };

    if (geodesicHeatLineRef.current) {
      scene.remove(geodesicHeatLineRef.current);
      geodesicHeatLineRef.current.traverse(disposeObject3D);
      geodesicHeatLineRef.current = null;
    }
    if (geodesicHeatMarkersRef.current.start) {
      clearMarker(geodesicHeatMarkersRef.current.start);
      geodesicHeatMarkersRef.current.start = null;
    }
    if (geodesicHeatMarkersRef.current.end) {
      clearMarker(geodesicHeatMarkersRef.current.end);
      geodesicHeatMarkersRef.current.end = null;
    }

    const placeMarker = (point: { x: number; y: number; z: number }, color: number) => {
      const markerGeom = new THREE.SphereGeometry(0.035, 16, 12);
      const markerMat = new THREE.MeshBasicMaterial({ color });
      const marker = new THREE.Mesh(markerGeom, markerMat);
      marker.position.set(point.x, point.y, point.z);
      marker.renderOrder = 220;
      scene.add(marker);
      return marker;
    };

    if (geodesicHeatStart?.point) {
      geodesicHeatMarkersRef.current.start = placeMarker(geodesicHeatStart.point, 0x33cc66);
    }
    if (geodesicHeatEnd?.point) {
      geodesicHeatMarkersRef.current.end = placeMarker(geodesicHeatEnd.point, 0xff6633);
    }

    if (!geodesicHeatPolylines?.length) return;

    const sizeHint = radiusRef.current || 3;
    const tubeRadius = Math.max(0.00175, (sizeHint / 220) * 0.5);
    const radialSegments = 10;
    const group = new THREE.Group();

    for (const line of geodesicHeatPolylines) {
      if (!line || line.length < 2) continue;
      const points = line.map((p) => new THREE.Vector3(p.x, p.y, p.z));
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i + 1 < points.length; i++) {
        path.add(new THREE.LineCurve3(points[i], points[i + 1]));
      }
      const tubularSegments = Math.min(2000, Math.max(120, points.length * 3));
      const geom = new THREE.TubeGeometry(path, tubularSegments, tubeRadius, radialSegments, false);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x8a5cff,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
      });
      const tube = new THREE.Mesh(geom, mat);
      tube.renderOrder = 215;
      tube.frustumCulled = false;
      group.add(tube);
    }

    if (!group.children.length) return;
    scene.add(group);
    geodesicHeatLineRef.current = group;
  }, [geodesicHeatEnd, geodesicHeatPolylines, geodesicHeatStart, sceneEpoch]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (principalProjectionGroupRef.current) {
      scene.remove(principalProjectionGroupRef.current);
      principalProjectionGroupRef.current.traverse(disposeObject3D);
      principalProjectionGroupRef.current = null;
    }

    if (!showPrincipalProjections) return;
    const root = surfaceObjRef.current;
    if (!root) return;

    const group = buildPrincipalProjectionGroup(root, {
      showXY: principalProjectionXY,
      showYZ: principalProjectionYZ,
      showXZ: principalProjectionXZ,
      opacity: principalProjectionOpacity,
      wireframe: !!wireframe,
    });
    if (!group) return;
    scene.add(group);
    principalProjectionGroupRef.current = group;
  }, [
    sceneEpoch,
    showPrincipalProjections,
    principalProjectionXY,
    principalProjectionYZ,
    principalProjectionXZ,
    principalProjectionOpacity,
    wireframe,
    surfaceId,
    graphExpr,
    implicitExpr,
    graphResolution,
    implicitResolution,
    implicitMeshToken,
    implicitDomainSize,
    surfaceMeshOverride,
    surfaceMeshOverrides,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (overlayMeshGroupsRef.current) {
      scene.remove(overlayMeshGroupsRef.current);
      overlayMeshGroupsRef.current.traverse(disposeObject3D);
      overlayMeshGroupsRef.current = null;
    }

    if (!effectiveOverlayMeshGroups?.length) return;

    const group = new THREE.Group();
    for (const entry of effectiveOverlayMeshGroups) {
      if (!entry?.positions || entry.positions.length < 9) continue;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(entry.positions), 3));
      if (entry.indices && entry.indices.length >= 3) {
        geom.setIndex(Array.from(entry.indices));
      }
      geom.computeVertexNormals();
      const opacity = entry.opacity ?? 1;
      const mat = new THREE.MeshBasicMaterial({
        color: entry.color,
        transparent: opacity < 1,
        opacity,
        depthTest: false,
        depthWrite: false,
        side: entry.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 220;
      mesh.frustumCulled = false;
      group.add(mesh);
    }

    if (!group.children.length) return;
    scene.add(group);
    overlayMeshGroupsRef.current = group;
  }, [effectiveOverlayMeshGroups, sceneEpoch]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (overlayLabelSetsRef.current) {
      scene.remove(overlayLabelSetsRef.current);
      overlayLabelSetsRef.current.traverse(disposeObject3D);
      overlayLabelSetsRef.current = null;
    }

    if (!effectiveOverlayLabelSets?.length) return;

    const group = new THREE.Group();
    const sizeHint = radiusRef.current || 3;
    const baseSize = Math.max(0.08, (sizeHint / 26) * 0.8);
    const toCss = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
    const toRgba = (color: number, alpha: number) => {
      const r = (color >> 16) & 255;
      const g = (color >> 8) & 255;
      const b = color & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    };
    const maxAniso = rendererRef.current?.capabilities?.getMaxAnisotropy?.() ?? 0;

    for (const set of effectiveOverlayLabelSets) {
      if (!set?.labels?.length) continue;
      const baseColor = set.color ?? 0xffffff;
      const baseOpacity = set.opacity ?? 0.9;
      const baseFont = set.font ?? "600 32px Georgia, \"Times New Roman\", serif";
      const baseScale = (set.size ?? 1) * baseSize;

      for (const label of set.labels) {
        if (!label?.text) continue;
        const font = set.font ?? baseFont;
        const color = label.color ?? baseColor;
        const opacity = label.opacity ?? baseOpacity;
        const size = (label.size ?? 1) * baseScale;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        const fontSize = Math.max(18, Math.round(32 * (label.size ?? 1)));
        const pad = Math.ceil(fontSize * 0.4);
        const fontWithSize = font.replace(/\d+px/, `${fontSize}px`);
        ctx.font = fontWithSize;
        const metrics = ctx.measureText(label.text);
        const width = Math.max(2, Math.ceil(metrics.width + pad * 2));
        const height = Math.max(2, Math.ceil(fontSize * 1.4 + pad * 2));
        canvas.width = width;
        canvas.height = height;
        ctx.font = fontWithSize;
        if (label.backgroundColor != null) {
          roundedRect(ctx, 1, 1, width - 2, height - 2, Math.max(6, fontSize * 0.35));
          ctx.fillStyle = toRgba(label.backgroundColor, label.backgroundOpacity ?? 0.88);
          ctx.fill();
          if (label.borderColor != null) {
            ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.08));
            ctx.strokeStyle = toCss(label.borderColor);
            ctx.stroke();
          }
        }
        ctx.fillStyle = toCss(color);
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillText(label.text, width / 2, height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        if (maxAniso > 0) texture.anisotropy = maxAniso;
        texture.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity,
          depthTest: false,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(mat);
        const aspect = width / height;
        sprite.scale.set(size * aspect, size, 1);
        sprite.position.set(label.position.x, label.position.y, label.position.z);
        sprite.renderOrder = 320;
        sprite.frustumCulled = false;
        group.add(sprite);
      }
    }

    if (!group.children.length) return;
    scene.add(group);
    overlayLabelSetsRef.current = group;
  }, [effectiveOverlayLabelSets, sceneEpoch]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (overlayPolylinesRef.current) {
      scene.remove(overlayPolylinesRef.current);
      overlayPolylinesRef.current.traverse(disposeObject3D);
      overlayPolylinesRef.current = null;
    }

    if (!overlayPolylines?.length) return;

    const group = new THREE.Group();
    const sizeHint = radiusRef.current || 3;
    const tubeRadius = Math.max(0.006, (sizeHint / 110) * 1.1);
    const radialSegments = 12;

    for (const line of overlayPolylines) {
      if (!line || line.length < 2) continue;
      const points = line.map((p) => new THREE.Vector3(p.x, p.y, p.z));
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i + 1 < points.length; i++) {
        path.add(new THREE.LineCurve3(points[i], points[i + 1]));
      }
      const tubularSegments = Math.min(640, Math.max(12, Math.round(points.length * 1.5)));
      const geom = new THREE.TubeGeometry(path, tubularSegments, tubeRadius, radialSegments, false);
      const mat = new THREE.MeshBasicMaterial({
        color: overlayPolylinesColor,
        transparent: false,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 300;
      mesh.frustumCulled = false;
      group.add(mesh);
    }

    if (!group.children.length) return;
    scene.add(group);
    overlayPolylinesRef.current = group;
  }, [overlayPolylines, overlayPolylinesColor, sceneEpoch]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (overlayPolylineGroupsRef.current) {
      scene.remove(overlayPolylineGroupsRef.current);
      overlayPolylineGroupsRef.current.traverse(disposeObject3D);
      overlayPolylineGroupsRef.current = null;
    }

    if (!effectiveOverlayPolylineGroups?.length) return;

    const group = new THREE.Group();
    const sizeHint = radiusRef.current || 3;
    const baseRadius = Math.max(0.006, (sizeHint / 110) * 1.1);
    const radialSegments = 12;

    for (const entry of effectiveOverlayPolylineGroups) {
      if (!entry?.lines?.length) continue;
      const tubeRadius = baseRadius * (entry.radiusScale ?? 1);
      const opacity = entry.opacity ?? 1;
      const mat = new THREE.MeshBasicMaterial({
        color: entry.color,
        transparent: opacity < 1,
        opacity,
        depthTest: false,
        depthWrite: false,
      });

      for (const line of entry.lines) {
        if (!line || line.length < 2) continue;
        const points = line.map((p) => new THREE.Vector3(p.x, p.y, p.z));
        const path = new THREE.CurvePath<THREE.Vector3>();
        for (let i = 0; i + 1 < points.length; i++) {
          path.add(new THREE.LineCurve3(points[i], points[i + 1]));
        }
        const tubularSegments = Math.min(640, Math.max(12, Math.round(points.length * 1.5)));
        const geom = new THREE.TubeGeometry(path, tubularSegments, tubeRadius, radialSegments, false);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = 300;
        mesh.frustumCulled = false;
        group.add(mesh);
      }
    }

    if (!group.children.length) return;
    scene.add(group);
    overlayPolylineGroupsRef.current = group;
  }, [effectiveOverlayPolylineGroups, sceneEpoch]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (overlayPointSetsRef.current) {
      scene.remove(overlayPointSetsRef.current);
      overlayPointSetsRef.current.traverse(disposeObject3D);
      overlayPointSetsRef.current = null;
    }

    if (!effectiveOverlayPointSets?.length) return;

    const group = new THREE.Group();
    const sizeHint = radiusRef.current || 3;
    const defaultSize = Math.max(0.02, (sizeHint / 90) * 0.45);

    for (const set of effectiveOverlayPointSets) {
      if (!set.points?.length) continue;
      const positions = new Float32Array(set.points.length * 3);
      for (let i = 0; i < set.points.length; i++) {
        const p = set.points[i];
        positions[3 * i] = p.x;
        positions[3 * i + 1] = p.y;
        positions[3 * i + 2] = p.z;
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: set.color ?? 0xff3333,
        size: set.size ?? defaultSize,
        sizeAttenuation: true,
        transparent: true,
        opacity: set.opacity ?? 0.9,
        depthTest: false,
        depthWrite: false,
      });
      const points = new THREE.Points(geom, mat);
      points.renderOrder = 310;
      points.frustumCulled = false;
      group.add(points);
    }

    if (!group.children.length) return;
    scene.add(group);
    overlayPointSetsRef.current = group;
  }, [effectiveOverlayPointSets, sceneEpoch]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (geodesicDiskGroupRef.current) {
      scene.remove(geodesicDiskGroupRef.current);
      geodesicDiskGroupRef.current.traverse(disposeObject3D);
      geodesicDiskGroupRef.current = null;
    }

    if (!geodesicDiskEnabled) return;

    const group = new THREE.Group();
    group.renderOrder = 210;

    if (geodesicDiskMesh?.positions?.length) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(geodesicDiskMesh.positions, 3)
      );
      const mat = new THREE.MeshBasicMaterial({
        color: 0x4c8bf5,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -1;
      mat.polygonOffsetUnits = -1;
      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 210;
      mesh.frustumCulled = false;
      group.add(mesh);
    }

    if (geodesicDiskShowBoundary && geodesicDiskBoundary?.length) {
      for (const line of geodesicDiskBoundary) {
        if (line.length < 2) continue;
        const geom = new THREE.BufferGeometry().setFromPoints(
          line.map((p) => new THREE.Vector3(p.x, p.y, p.z))
        );
        const mat = new THREE.LineBasicMaterial({
          color: 0xffa24a,
          transparent: true,
          opacity: 0.95,
          depthTest: true,
        });
        const mesh = new THREE.Line(geom, mat);
        mesh.renderOrder = 215;
        mesh.frustumCulled = false;
        group.add(mesh);
      }
    }

    if (geodesicDiskCenter?.point) {
      const markerGeom = new THREE.SphereGeometry(0.03, 16, 12);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d });
      const marker = new THREE.Mesh(markerGeom, markerMat);
      marker.position.set(
        geodesicDiskCenter.point.x,
        geodesicDiskCenter.point.y,
        geodesicDiskCenter.point.z
      );
      marker.renderOrder = 220;
      group.add(marker);
    }

    scene.add(group);
    geodesicDiskGroupRef.current = group;

    return () => {
      if (geodesicDiskGroupRef.current === group) {
        scene.remove(group);
        group.traverse(disposeObject3D);
        geodesicDiskGroupRef.current = null;
      }
    };
  }, [
    geodesicDiskEnabled,
    geodesicDiskMesh,
    geodesicDiskBoundary,
    geodesicDiskShowBoundary,
    geodesicDiskCenter,
    sceneEpoch,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (principalGlyphsRef.current) {
      if (principalGlyphsRef.current.d1) {
        scene.remove(principalGlyphsRef.current.d1);
        principalGlyphsRef.current.d1.geometry.dispose();
        (principalGlyphsRef.current.d1.material as THREE.Material).dispose();
      }
      if (principalGlyphsRef.current.d2) {
        scene.remove(principalGlyphsRef.current.d2);
        principalGlyphsRef.current.d2.geometry.dispose();
        (principalGlyphsRef.current.d2.material as THREE.Material).dispose();
      }
      principalGlyphsRef.current = null;
    }

    if (!effectiveShowPrincipalGlyphs) return;

    const sampleSet = sampleSetRef.current;
    if (!sampleSet || !sampleSet.samples.length) return;

    const isGraphSurface = isGraphId(surfaceId);
    const isImplicitSurface = isImplicitId(surfaceId);
    if (!isGraphSurface && !isImplicitSurface) return;

    const stride = Math.max(1, Math.floor(principalGlyphDensity));
    const baseLength =
      principalGlyphLength > 0
        ? principalGlyphLength
        : Math.max(0.03, (radiusRef.current || 3) * 0.12);
    const includeDir2 = principalGlyphMode !== "d1";
    const offset = Math.max(0.001, (radiusRef.current || 3) * 0.0015);

    let implicitF: ((x: number, y: number, z: number) => number) | null = null;
    let implicitSize: number | null = null;
    if (isImplicitSurface) {
      const root = surfaceObjRef.current as THREE.Object3D | null;
      if (root) {
        root.traverse((obj) => {
          if (implicitF) return;
          const anyObj = obj as any;
          if (isImplicitMeshObj(anyObj)) {
            const meta = anyObj.userData?.__implicit as
              | { f: (x: number, y: number, z: number) => number; size?: number }
              | undefined;
            if (meta?.f) {
              implicitF = meta.f;
              if (typeof meta.size === "number") implicitSize = meta.size;
            }
          }
        });
      }
      if (!implicitF) {
        const fallback = getImplicitFallback(surfaceId);
        if (fallback) implicitF = fallback;
      }
      if (!implicitF) return;
    }

    const graphF = isGraphSurface ? getGraphF() : null;
    const graphMeta = isGraphSurface
      ? ((surfaceObjRef.current as any)?.userData?.__graph as { xSpan: number; ySpan: number } | undefined)
      : undefined;
    const xSpan = graphMeta?.xSpan ?? graphDomain?.xSpan ?? 1.5;
    const ySpan = graphMeta?.ySpan ?? graphDomain?.ySpan ?? 1.5;
    const uMin = -xSpan;
    const uMax = xSpan;
    const vMin = -ySpan;
    const vMax = ySpan;
    const paramFunc =
      isGraphSurface && graphF
        ? (u: number, v: number, target: THREE.Vector3) => {
            target.set(u, graphF(u, v), v);
          }
        : null;

    let implicitH = 0.02;
    if (isImplicitSurface) {
      const size = implicitSize ?? radiusRef.current ?? 3;
      implicitH = Math.max(1e-4, size / Math.max(12, implicitResolution));
    }

    const positions1: number[] = [];
    const positions2: number[] = [];
    const tmpDir = new THREE.Vector3();
    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const tmpBase = new THREE.Vector3();
    const refAxis = new THREE.Vector3();
    const n = new THREE.Vector3();

    const addSegment = (target: number[], p: THREE.Vector3, dir: THREE.Vector3, normal: THREE.Vector3, scale: number) => {
      tmpDir.copy(dir);
      tmpDir.addScaledVector(normal, -tmpDir.dot(normal));
      if (tmpDir.lengthSq() < 1e-12) return;
      tmpDir.normalize();
      stabilizeTangentDirection(tmpDir, normal, refAxis);
      const half = 0.5 * baseLength * scale;
      tmpBase.copy(p).addScaledVector(normal, offset);
      tmpA.copy(tmpBase).addScaledVector(tmpDir, -half);
      tmpB.copy(tmpBase).addScaledVector(tmpDir, half);
      target.push(tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z);
    };

    for (let i = 0; i < sampleSet.samples.length; i += stride) {
      const sample = sampleSet.samples[i];
      if (!sample) continue;

      if (isGraphSurface && paramFunc && graphF) {
        const res = computePrincipalCurvatureAtUV({
          paramFunc,
          u: sample.position.x,
          v: sample.position.z,
          uMin,
          uMax,
          vMin,
          vMax,
        });
        if (!res || res.isUmbilic) continue;
        n.copy(res.normal);
        if (n.dot(sample.normal) < 0) {
          n.negate();
          res.dir1.negate();
          res.dir2.negate();
        }
        addSegment(positions1, res.point, res.dir1, n, 1);
        if (includeDir2) addSegment(positions2, res.point, res.dir2, n, 0.8);
      } else if (isImplicitSurface && implicitF) {
        const res = computeImplicitPrincipalAtPoint(implicitF, sample.position, implicitH);
        if (!res || res.isUmbilic) continue;
        n.copy(res.normal);
        if (n.dot(sample.normal) < 0) {
          n.negate();
          res.dir1.negate();
          res.dir2.negate();
        }
        addSegment(positions1, res.point, res.dir1, n, 1);
        if (includeDir2) addSegment(positions2, res.point, res.dir2, n, 0.8);
      }
    }

    if (!positions1.length && !positions2.length) return;

    const glyphs: { d1?: THREE.LineSegments; d2?: THREE.LineSegments } = {};

    if (positions1.length) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions1, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0x1b9e77, depthTest: true, depthWrite: false });
      const lines = new THREE.LineSegments(geom, mat);
      lines.renderOrder = 120;
      scene.add(lines);
      glyphs.d1 = lines;
    }

    if (positions2.length) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions2, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xd95f02, depthTest: true, depthWrite: false });
      const lines = new THREE.LineSegments(geom, mat);
      lines.renderOrder = 120;
      scene.add(lines);
      glyphs.d2 = lines;
    }

    principalGlyphsRef.current = glyphs;
  }, [
    effectiveShowPrincipalGlyphs,
    principalGlyphDensity,
    principalGlyphLength,
    principalGlyphMode,
    surfaceId,
    graphExpr,
    implicitExpr,
    graphDomain?.xSpan,
    graphDomain?.ySpan,
    implicitResolution,
    surfaceMeshOverride,
    surfaceMeshOverrides,
    sceneEpoch,
  ]);

  const getPrincipalField = () => {
    const key = [
      surfaceId,
      graphExpr ?? "",
      implicitExpr ?? "",
      graphDomain?.xSpan ?? "",
      graphDomain?.ySpan ?? "",
      implicitResolution,
      sceneEpoch,
    ].join("|");
    const cached = principalFieldRef.current;
    if (cached && cached.key === key) return cached.data;

    const isGraphSurface = isGraphId(surfaceId);
    const isImplicitSurface = isImplicitId(surfaceId);
    const isMeshSurface = surfaceId === "surface_mesh";
    if (!isGraphSurface && !isImplicitSurface && !isMeshSurface) {
      principalFieldRef.current = { key, data: null };
      return null;
    }

    const root = surfaceObjRef.current;
    if (!root) return null;

    const scanImplicitSurface = (rootObj: THREE.Object3D) => {
      let scanGeometry: THREE.BufferGeometry | null = null;
      let scanImplicitF: ((x: number, y: number, z: number) => number) | null = null;
      let scanImplicitSize: number | null = null;
      let scanImplicitFromMeta = false;

      rootObj.traverse((obj) => {
        const anyObj = obj as any;
        const meta = anyObj?.userData?.__implicit as
          | { f: (x: number, y: number, z: number) => number; size?: number }
          | undefined;
        if (!scanGeometry && anyObj?.isMesh && anyObj.geometry) {
          scanGeometry = anyObj.geometry as THREE.BufferGeometry;
        }
        if (meta?.f) {
          scanImplicitF = meta.f;
          if (typeof meta.size === "number") scanImplicitSize = meta.size;
          scanImplicitFromMeta = true;
        }
      });

      return {
        geometry: scanGeometry,
        implicitF: scanImplicitF,
        implicitSize: scanImplicitSize,
        implicitFromMeta: scanImplicitFromMeta,
      };
    };

    const findMeshGeometry = (rootObj: THREE.Object3D): THREE.BufferGeometry | null => {
      let found: THREE.BufferGeometry | null = null;
      rootObj.traverse((obj) => {
        if (found) return;
        const mesh = obj as THREE.Mesh;
        if (mesh?.isMesh && mesh.geometry) {
          found = mesh.geometry as THREE.BufferGeometry;
        }
      });
      return found;
    };

    let geometry: THREE.BufferGeometry | null = null;
    let implicitF: ((x: number, y: number, z: number) => number) | null = null;
    let implicitSize: number | null = null;
    let implicitFromMeta = false;

    if (isImplicitSurface) {
      const scan = scanImplicitSurface(root);
      geometry = scan.geometry;
      implicitF = scan.implicitF;
      implicitSize = scan.implicitSize;
      implicitFromMeta = scan.implicitFromMeta;

      if (!implicitF) {
        const fallback = getImplicitFallback(surfaceId);
        if (fallback) implicitF = fallback;
      }
    } else {
      geometry = findMeshGeometry(root);
    }

    if (!geometry) {
      principalFieldRef.current = { key, data: null };
      return null;
    }

    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute | null;
    if (!posAttr) {
      principalFieldRef.current = { key, data: null };
      return null;
    }
    let positions = posAttr.array as Float32Array;
    let vertexCount = posAttr.count;

    let normalAttr = geometry.getAttribute("normal") as THREE.BufferAttribute | null;
    if (!normalAttr) {
      geometry.computeVertexNormals();
      normalAttr = geometry.getAttribute("normal") as THREE.BufferAttribute | null;
    }
    if (!normalAttr) {
      principalFieldRef.current = { key, data: null };
      return null;
    }
    const normals = normalAttr.array as Float32Array;

    let decimatedImplicit = false;
    if (isImplicitSurface) {
      const maxImplicitVertices = 200000;
      const targetImplicitVertices = 20000;
      if (vertexCount > maxImplicitVertices) {
        principalFieldRef.current = { key, data: null };
        return null;
      }
      if (vertexCount > targetImplicitVertices) {
        const stride = Math.max(1, Math.ceil(vertexCount / targetImplicitVertices));
        const indices: number[] = [];
        for (let i = 0; i < vertexCount; i += stride) indices.push(i);
        const newCount = indices.length;
        const positionsSub = new Float32Array(newCount * 3);
        for (let i = 0; i < newCount; i++) {
          const srcIdx = indices[i] * 3;
          const dstIdx = i * 3;
          positionsSub[dstIdx] = positions[srcIdx];
          positionsSub[dstIdx + 1] = positions[srcIdx + 1];
          positionsSub[dstIdx + 2] = positions[srcIdx + 2];
        }
        positions = positionsSub;
        vertexCount = newCount;
        decimatedImplicit = true;
      }
    }

    const normalsOut = isImplicitSurface || isMeshSurface ? new Float32Array(vertexCount * 3) : normals;
    const k1 = new Float32Array(vertexCount);
    const k2 = new Float32Array(vertexCount);
    const d1 = new Float32Array(vertexCount * 3);
    const d2 = new Float32Array(vertexCount * 3);

    if (isGraphSurface) {
      const uvAttr = geometry.getAttribute("uv") as THREE.BufferAttribute | null;
      if (!uvAttr) {
        principalFieldRef.current = { key, data: null };
        return null;
      }
      const graphF = getGraphF();
      const graphMeta = (surfaceObjRef.current as any)?.userData?.__graph as { xSpan: number; ySpan: number } | undefined;
      const xSpan = graphMeta?.xSpan ?? graphDomain?.xSpan ?? 1.5;
      const ySpan = graphMeta?.ySpan ?? graphDomain?.ySpan ?? 1.5;
      const uMin = -xSpan;
      const uMax = xSpan;
      const vMin = -ySpan;
      const vMax = ySpan;
      const paramFunc = (u: number, v: number, target: THREE.Vector3) => {
        target.set(u, graphF(u, v), v);
      };

      for (let i = 0; i < vertexCount; i++) {
        const u = (uvAttr.getX(i) - 0.5) * 2 * xSpan;
        const v = (uvAttr.getY(i) - 0.5) * 2 * ySpan;
        const res = computePrincipalCurvatureAtUV({ paramFunc, u, v, uMin, uMax, vMin, vMax });
        const nIdx = i * 3;
        if (!res || res.isUmbilic) {
          k1[i] = NaN;
          k2[i] = NaN;
          d1[nIdx] = NaN;
          d1[nIdx + 1] = NaN;
          d1[nIdx + 2] = NaN;
          d2[nIdx] = NaN;
          d2[nIdx + 1] = NaN;
          d2[nIdx + 2] = NaN;
          continue;
        }
        const nx = normals[nIdx];
        const ny = normals[nIdx + 1];
        const nz = normals[nIdx + 2];
        let k1v = res.k1;
        let k2v = res.k2;
        if (res.normal.x * nx + res.normal.y * ny + res.normal.z * nz < 0) {
          res.dir1.negate();
          res.dir2.negate();
          k1v = -k1v;
          k2v = -k2v;
        }
        k1[i] = k1v;
        k2[i] = k2v;
        d1[nIdx] = res.dir1.x;
        d1[nIdx + 1] = res.dir1.y;
        d1[nIdx + 2] = res.dir1.z;
        d2[nIdx] = res.dir2.x;
        d2[nIdx + 1] = res.dir2.y;
        d2[nIdx + 2] = res.dir2.z;
      }
    } else if (isMeshSurface) {
      const index = geometry.getIndex() ? (geometry.getIndex()!.array as ArrayLike<number>) : null;
      const meshAdjacency = surfaceMeshOverride?.adjacency ?? null;
      const neighbors =
        meshAdjacency && meshAdjacency.length === vertexCount
          ? meshAdjacency
          : buildVertexAdjacency(index, vertexCount, positions);
      const tmpNormal = new THREE.Vector3();
      const tmpE1 = new THREE.Vector3();
      const tmpE2 = new THREE.Vector3();

      for (let i = 0; i < vertexCount; i++) {
        const idx = i * 3;
        tmpNormal.set(normals[idx], normals[idx + 1], normals[idx + 2]);
        const nLen = tmpNormal.length();
        if (!Number.isFinite(nLen) || nLen < 1e-8) {
          k1[i] = NaN;
          k2[i] = NaN;
          normalsOut[idx] = NaN;
          normalsOut[idx + 1] = NaN;
          normalsOut[idx + 2] = NaN;
          d1[idx] = NaN;
          d1[idx + 1] = NaN;
          d1[idx + 2] = NaN;
          d2[idx] = NaN;
          d2[idx + 1] = NaN;
          d2[idx + 2] = NaN;
          continue;
        }
        tmpNormal.multiplyScalar(1 / nLen);
        normalsOut[idx] = tmpNormal.x;
        normalsOut[idx + 1] = tmpNormal.y;
        normalsOut[idx + 2] = tmpNormal.z;

        const nbrs = neighbors[i];
        if (!nbrs || nbrs.length < 2) {
          k1[i] = NaN;
          k2[i] = NaN;
          d1[idx] = NaN;
          d1[idx + 1] = NaN;
          d1[idx + 2] = NaN;
          d2[idx] = NaN;
          d2[idx + 1] = NaN;
          d2[idx + 2] = NaN;
          continue;
        }

        const basis = makePlaneBasis(tmpNormal);
        tmpE1.copy(basis.e1);
        tmpE2.copy(basis.e2);

        let sumU = 0;
        let sumV = 0;
        let sumU2 = 0;
        let sumV2 = 0;
        let sumUV = 0;
        let count = 0;

        const px = positions[idx];
        const py = positions[idx + 1];
        const pz = positions[idx + 2];

        for (let n = 0; n < nbrs.length; n++) {
          const j = nbrs[n];
          if (j < 0 || j >= vertexCount) continue;
          const jIdx = j * 3;
          let vx = positions[jIdx] - px;
          let vy = positions[jIdx + 1] - py;
          let vz = positions[jIdx + 2] - pz;
          const ndot = vx * tmpNormal.x + vy * tmpNormal.y + vz * tmpNormal.z;
          vx -= ndot * tmpNormal.x;
          vy -= ndot * tmpNormal.y;
          vz -= ndot * tmpNormal.z;
          const u = vx * tmpE1.x + vy * tmpE1.y + vz * tmpE1.z;
          const v = vx * tmpE2.x + vy * tmpE2.y + vz * tmpE2.z;
          if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
          sumU += u;
          sumV += v;
          sumU2 += u * u;
          sumV2 += v * v;
          sumUV += u * v;
          count += 1;
        }

        if (count < 2) {
          k1[i] = NaN;
          k2[i] = NaN;
          d1[idx] = NaN;
          d1[idx + 1] = NaN;
          d1[idx + 2] = NaN;
          d2[idx] = NaN;
          d2[idx + 1] = NaN;
          d2[idx + 2] = NaN;
          continue;
        }

        const inv = 1 / count;
        const meanU = sumU * inv;
        const meanV = sumV * inv;
        const sxx = sumU2 * inv - meanU * meanU;
        const syy = sumV2 * inv - meanV * meanV;
        const sxy = sumUV * inv - meanU * meanV;
        if (!Number.isFinite(sxx) || !Number.isFinite(syy) || !Number.isFinite(sxy)) {
          k1[i] = NaN;
          k2[i] = NaN;
          d1[idx] = NaN;
          d1[idx + 1] = NaN;
          d1[idx + 2] = NaN;
          d2[idx] = NaN;
          d2[idx + 1] = NaN;
          d2[idx + 2] = NaN;
          continue;
        }

        const trace = sxx + syy;
        const diff = sxx - syy;
        const disc = Math.sqrt(diff * diff + 4 * sxy * sxy);
        const lambda1 = 0.5 * (trace + disc);
        const lambda2 = 0.5 * (trace - disc);
        k1[i] = lambda1;
        k2[i] = lambda2;

        let vx = sxy;
        let vy = lambda1 - sxx;
        if (Math.abs(vx) + Math.abs(vy) < 1e-10) {
          vx = lambda1 - syy;
          vy = sxy;
        }
        if (Math.abs(vx) + Math.abs(vy) < 1e-10) {
          vx = 1;
          vy = 0;
        }
        const vlen = Math.hypot(vx, vy);
        vx /= vlen;
        vy /= vlen;

        const d1x = tmpE1.x * vx + tmpE2.x * vy;
        const d1y = tmpE1.y * vx + tmpE2.y * vy;
        const d1z = tmpE1.z * vx + tmpE2.z * vy;
        const d1len = Math.hypot(d1x, d1y, d1z) || 1;
        d1[idx] = d1x / d1len;
        d1[idx + 1] = d1y / d1len;
        d1[idx + 2] = d1z / d1len;

        const d2x = tmpNormal.y * d1[idx + 2] - tmpNormal.z * d1[idx + 1];
        const d2y = tmpNormal.z * d1[idx] - tmpNormal.x * d1[idx + 2];
        const d2z = tmpNormal.x * d1[idx + 1] - tmpNormal.y * d1[idx];
        const d2len = Math.hypot(d2x, d2y, d2z) || 1;
        d2[idx] = d2x / d2len;
        d2[idx + 1] = d2y / d2len;
        d2[idx + 2] = d2z / d2len;
      }
    } else if (isImplicitSurface && implicitF) {
      const baseSize = implicitSize ?? radiusRef.current ?? 3;
      const sizeForDeriv = implicitFromMeta ? 1 : baseSize;
      const implicitH = Math.max(
        1e-4,
        Math.min(sizeForDeriv / Math.max(80, implicitResolution * 2), sizeForDeriv * 0.05)
      );
      const fEval = implicitFromMeta && implicitSize
        ? (x: number, y: number, z: number) => implicitF!(x * implicitSize!, y * implicitSize!, z * implicitSize!)
        : implicitF;
      const timeStart = performance.now();
      const timeBudget = 140;
      const tmpPoint = new THREE.Vector3();
      for (let i = 0; i < vertexCount; i++) {
        if (i % 200 === 0 && performance.now() - timeStart > timeBudget) {
          principalFieldRef.current = { key, data: null };
          return null;
        }
        const idx = i * 3;
        const px = positions[idx];
        const py = positions[idx + 1];
        const pz = positions[idx + 2];
        const v = fEval(px, py, pz);
        const voxel = 2 / Math.max(2, implicitResolution - 1);
        const tol = implicitFromMeta ? Math.max(1e-3, voxel * 2.5) : Math.max(1e-3, implicitH * 3);
        if (!Number.isFinite(v) || Math.abs(v) > tol) {
          k1[i] = NaN;
          k2[i] = NaN;
          d1[idx] = NaN;
          d1[idx + 1] = NaN;
          d1[idx + 2] = NaN;
          d2[idx] = NaN;
          d2[idx + 1] = NaN;
          d2[idx + 2] = NaN;
          normalsOut[idx] = NaN;
          normalsOut[idx + 1] = NaN;
          normalsOut[idx + 2] = NaN;
          continue;
        }
        const res = computeImplicitPrincipalAtPoint(fEval, tmpPoint.set(px, py, pz), implicitH);
        if (!res || res.isUmbilic) {
          k1[i] = NaN;
          k2[i] = NaN;
          d1[idx] = NaN;
          d1[idx + 1] = NaN;
          d1[idx + 2] = NaN;
          d2[idx] = NaN;
          d2[idx + 1] = NaN;
          d2[idx + 2] = NaN;
          continue;
        }
        normalsOut[idx] = res.normal.x;
        normalsOut[idx + 1] = res.normal.y;
        normalsOut[idx + 2] = res.normal.z;
        k1[i] = res.k1;
        k2[i] = res.k2;
        d1[idx] = res.dir1.x;
        d1[idx + 1] = res.dir1.y;
        d1[idx + 2] = res.dir1.z;
        d2[idx] = res.dir2.x;
        d2[idx + 1] = res.dir2.y;
        d2[idx + 2] = res.dir2.z;
      }
    } else {
      principalFieldRef.current = { key, data: null };
      return null;
    }

    const index = decimatedImplicit ? null : geometry.getIndex() ? geometry.getIndex()!.array : null;
    const data: PrincipalField = { positions, normals: normalsOut, k1, k2, d1, d2, vertexCount, index };
    principalFieldRef.current = { key, data };
    return data;
  };

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (curvatureLinesRef.current) {
      scene.remove(curvatureLinesRef.current);
      curvatureLinesRef.current.geometry.dispose();
      (curvatureLinesRef.current.material as THREE.Material).dispose();
      curvatureLinesRef.current = null;
    }

    if (!showCurvatureLines) return;

    const isImplicitSurface = isImplicitId(surfaceId);
    const isMeshSurface = surfaceId === "surface_mesh";
    let field = getPrincipalField();
    if (isImplicitSurface) {
      const sampleSet = sampleSetRef.current;
      if (sampleSet?.samples.length) {
        let implicitF: ((x: number, y: number, z: number) => number) | null = null;
        let implicitSize: number | null = null;
        let implicitFromMeta = false;
        const root = surfaceObjRef.current as THREE.Object3D | null;
        if (root) {
          root.traverse((obj) => {
            if (implicitF) return;
            const meta = (obj as any)?.userData?.__implicit as
              | { f: (x: number, y: number, z: number) => number; size?: number }
              | undefined;
            if (meta?.f) {
              implicitF = meta.f;
              if (typeof meta.size === "number") implicitSize = meta.size;
              implicitFromMeta = true;
            }
          });
        }
        if (!implicitF) {
          const fallback = getImplicitFallback(surfaceId);
          if (fallback) implicitF = fallback;
        }
        if (implicitF) {
          const count = sampleSet.samples.length;
          const positions = new Float32Array(count * 3);
          const normals = new Float32Array(count * 3);
          const d1 = new Float32Array(count * 3);
          const d2 = new Float32Array(count * 3);
          const baseSize = implicitSize ?? radiusRef.current ?? 3;
          const sizeForDeriv = implicitFromMeta ? 1 : baseSize;
          const implicitH = Math.max(
            1e-4,
            Math.min(sizeForDeriv / Math.max(80, implicitResolution * 2), sizeForDeriv * 0.05)
          );
          const fEval = implicitFromMeta && implicitSize
            ? (x: number, y: number, z: number) => implicitF!(x * implicitSize!, y * implicitSize!, z * implicitSize!)
            : implicitF!;
          const voxel = 2 / Math.max(2, implicitResolution - 1);
          let tol = Math.max(1e-3, implicitH * 3);
          if (implicitFromMeta) {
            tol = Math.max(tol, voxel * 2.5);
          } else {
            tol = Math.max(tol, implicitH * 6);
          }
          const tmpPoint = new THREE.Vector3();
          for (let i = 0; i < count; i++) {
            const sample = sampleSet.samples[i];
            const idx = i * 3;
            positions[idx] = sample.position.x;
            positions[idx + 1] = sample.position.y;
            positions[idx + 2] = sample.position.z;
            const v = fEval(sample.position.x, sample.position.y, sample.position.z);
            if (!Number.isFinite(v) || Math.abs(v) > tol) {
              normals[idx] = NaN;
              normals[idx + 1] = NaN;
              normals[idx + 2] = NaN;
              d1[idx] = NaN;
              d1[idx + 1] = NaN;
              d1[idx + 2] = NaN;
              d2[idx] = NaN;
              d2[idx + 1] = NaN;
              d2[idx + 2] = NaN;
              continue;
            }
            const res = computeImplicitPrincipalAtPoint(fEval, tmpPoint.copy(sample.position), implicitH);
            if (!res || res.isUmbilic) {
              normals[idx] = NaN;
              normals[idx + 1] = NaN;
              normals[idx + 2] = NaN;
              d1[idx] = NaN;
              d1[idx + 1] = NaN;
              d1[idx + 2] = NaN;
              d2[idx] = NaN;
              d2[idx + 1] = NaN;
              d2[idx + 2] = NaN;
              continue;
            }
            normals[idx] = res.normal.x;
            normals[idx + 1] = res.normal.y;
            normals[idx + 2] = res.normal.z;
            d1[idx] = res.dir1.x;
            d1[idx + 1] = res.dir1.y;
            d1[idx + 2] = res.dir1.z;
            d2[idx] = res.dir2.x;
            d2[idx + 1] = res.dir2.y;
            d2[idx + 2] = res.dir2.z;
          }
          field = {
            positions,
            normals,
            d1,
            d2,
            k1: new Float32Array(count),
            k2: new Float32Array(count),
            vertexCount: count,
            index: null,
          };
        }
      }
    }
    if (!field) return;

    const { positions, normals, d1, d2, vertexCount, index } = field;
    const estimateEdgeSpacing = (idx: ArrayLike<number> | null, pos: Float32Array, vCount: number) => {
      let sum = 0;
      let edges = 0;
      const maxTris = 6000;
      if (idx && idx.length >= 3) {
        const triCount = Math.min(Math.floor(idx.length / 3), maxTris);
        for (let t = 0; t < triCount; t++) {
          const base = t * 3;
          const a = Number(idx[base]);
          const b = Number(idx[base + 1]);
          const c = Number(idx[base + 2]);
          if (a < 0 || b < 0 || c < 0 || a >= vCount || b >= vCount || c >= vCount) continue;
          const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
          const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
          const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];
          const ab = Math.hypot(ax - bx, ay - by, az - bz);
          const bc = Math.hypot(bx - cx, by - cy, bz - cz);
          const ca = Math.hypot(cx - ax, cy - ay, cz - az);
          if (Number.isFinite(ab)) { sum += ab; edges++; }
          if (Number.isFinite(bc)) { sum += bc; edges++; }
          if (Number.isFinite(ca)) { sum += ca; edges++; }
        }
      } else if (vCount >= 3) {
        const triCount = Math.min(Math.floor(vCount / 3), maxTris);
        for (let t = 0; t < triCount; t++) {
          const a = t * 3;
          const b = t * 3 + 1;
          const c = t * 3 + 2;
          const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
          const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
          const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];
          const ab = Math.hypot(ax - bx, ay - by, az - bz);
          const bc = Math.hypot(bx - cx, by - cy, bz - cz);
          const ca = Math.hypot(cx - ax, cy - ay, cz - az);
          if (Number.isFinite(ab)) { sum += ab; edges++; }
          if (Number.isFinite(bc)) { sum += bc; edges++; }
          if (Number.isFinite(ca)) { sum += ca; edges++; }
        }
      }
      return edges > 0 ? sum / edges : 0;
    };
    const buildSpatialAdjacency = (pos: Float32Array, count: number) => {
      const neighbors: Set<number>[] = Array.from({ length: count }, () => new Set<number>());
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const x = pos[idx];
        const y = pos[idx + 1];
        const z = pos[idx + 2];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
      const dx = maxX - minX;
      const dy = maxY - minY;
      const dz = maxZ - minZ;
      const diag = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let spacing = Number.isFinite(diag) && diag > 0 ? diag / Math.sqrt(count) : 0;
      if (!Number.isFinite(spacing) || spacing <= 0) spacing = 0.05;
      const cellSize = Math.max(1e-6, spacing * 1.6);
      const radius = Math.max(1e-6, spacing * 2.6);
      const radius2 = radius * radius;
      const buckets = new Map<string, number[]>();
      const keyOf = (x: number, y: number, z: number) => {
        const ix = Math.floor((x - minX) / cellSize);
        const iy = Math.floor((y - minY) / cellSize);
        const iz = Math.floor((z - minZ) / cellSize);
        return `${ix},${iy},${iz}`;
      };
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const x = pos[idx];
        const y = pos[idx + 1];
        const z = pos[idx + 2];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        const key = keyOf(x, y, z);
        const list = buckets.get(key);
        if (list) list.push(i);
        else buckets.set(key, [i]);
      }
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const x = pos[idx];
        const y = pos[idx + 1];
        const z = pos[idx + 2];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        const ix = Math.floor((x - minX) / cellSize);
        const iy = Math.floor((y - minY) / cellSize);
        const iz = Math.floor((z - minZ) / cellSize);
        for (let gx = -1; gx <= 1; gx++) {
          for (let gy = -1; gy <= 1; gy++) {
            for (let gz = -1; gz <= 1; gz++) {
              const key = `${ix + gx},${iy + gy},${iz + gz}`;
              const list = buckets.get(key);
              if (!list) continue;
              for (let k = 0; k < list.length; k++) {
                const j = list[k];
                if (j === i) continue;
                const jIdx = j * 3;
                const dx = pos[jIdx] - x;
                const dy = pos[jIdx + 1] - y;
                const dz = pos[jIdx + 2] - z;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 <= radius2) {
                  neighbors[i].add(j);
                  neighbors[j].add(i);
                }
              }
            }
          }
        }
      }
      return { neighbors: neighbors.map((s) => Array.from(s)), spacing };
    };
    let neighbors: number[][];
    let neighborSpacing = 0;
    const meshAdjacency = isMeshSurface ? surfaceMeshOverride?.adjacency ?? null : null;
    const meshMeanEdge = isMeshSurface ? surfaceMeshOverride?.meanEdgeLength ?? 0 : 0;
    if (isImplicitSurface && !index) {
      const built = buildSpatialAdjacency(positions, vertexCount);
      neighbors = built.neighbors;
      neighborSpacing = built.spacing;
    } else {
      neighbors =
        meshAdjacency && meshAdjacency.length === vertexCount
          ? meshAdjacency
          : buildVertexAdjacency(index, vertexCount, positions);
      if (neighborSpacing <= 0) {
        if (isMeshSurface && Number.isFinite(meshMeanEdge) && meshMeanEdge > 0) {
          neighborSpacing = meshMeanEdge;
        } else if (isMeshSurface || !isImplicitSurface) {
          neighborSpacing = estimateEdgeSpacing(index, positions, vertexCount);
        }
      }
    }
    const dirField = curvatureLineField === "d2" ? d2 : d1;
    const maxStepsRaw = Math.max(10, Math.floor(curvatureMaxSteps));
    const maxLinesRaw = Math.max(1, Math.floor(curvatureMaxLines));
    const maxSteps = isImplicitSurface ? Math.min(maxStepsRaw, 320) : maxStepsRaw;
    const maxLines = isImplicitSurface ? Math.min(maxLinesRaw, 220) : maxLinesRaw;
    const baseStride = Math.max(1, Math.floor(curvatureSeedDensity));
    const stride =
      (isImplicitSurface || isMeshSurface) && neighborSpacing > 0
        ? Math.max(1, Math.floor(baseStride * 0.4))
        : baseStride;
    const bboxDiag = (radiusRef.current || 3) * 2;
    let stepSize = curvatureStepSize > 0 ? curvatureStepSize : Math.max(1e-4, bboxDiag / 200);
    if (neighborSpacing > 0) {
      stepSize = Math.max(stepSize, neighborSpacing * 0.8);
    }

    const seeds: number[] = [];
    const isValidDir = (idx: number) => {
      const nIdx = idx * 3;
      const nx = normals[nIdx];
      const ny = normals[nIdx + 1];
      const nz = normals[nIdx + 2];
      const dx = dirField[nIdx];
      const dy = dirField[nIdx + 1];
      const dz = dirField[nIdx + 2];
      return (
        Number.isFinite(nx) &&
        Number.isFinite(ny) &&
        Number.isFinite(nz) &&
        Number.isFinite(dx) &&
        Number.isFinite(dy) &&
        Number.isFinite(dz)
      );
    };
    const visited = new Set<number>();
    const sampleSet = sampleSetRef.current;
    const canUseSelection = curvatureSeedSource === "selection" && selectionMask?.count && sampleSet?.samples.length;

    if (canUseSelection && sampleSet && selectionMask) {
      const selected = selectionMask.selected;
      const findNearestVertex = (px: number, py: number, pz: number) => {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < vertexCount; i++) {
          const idx = i * 3;
          const dx = positions[idx] - px;
          const dy = positions[idx + 1] - py;
          const dz = positions[idx + 2] - pz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < bestDist) {
            bestDist = d2;
            bestIdx = i;
          }
        }
        return bestIdx;
      };

      for (let i = 0; i < selected.length && seeds.length < maxLines; i += stride) {
        if (!selected[i]) continue;
        const sample = sampleSet.samples[i];
        if (!sample) continue;
        const seed = findNearestVertex(sample.position.x, sample.position.y, sample.position.z);
        if (isValidDir(seed)) {
          seeds.push(seed);
        }
      }
    }

    if (!seeds.length) {
      for (let i = 0; i < vertexCount && seeds.length < maxLines; i += stride) {
        if (isValidDir(i)) {
          seeds.push(i);
        }
      }
    }
    if (!seeds.length) {
      for (let i = 0; i < vertexCount && seeds.length < maxLines; i++) {
        if (isValidDir(i)) {
          seeds.push(i);
        }
      }
    }

    const paths: number[][] = [];
    const timeStart = performance.now();
    const timeBudget = isImplicitSurface ? 200 : 180;
    for (let i = 0; i < seeds.length && paths.length < maxLines; i++) {
      if (performance.now() - timeStart > timeBudget) break;
      const seed = seeds[i];
      if (visited.has(seed)) continue;
      const path = traceStreamlineBidirectional({
        seedIndex: seed,
        positions,
        normals,
        dirField,
        neighbors,
        maxSteps,
        stepSize,
        minCos: isImplicitSurface ? 0.05 : isMeshSurface ? 0.05 : undefined,
      });
      if (path.length < 2) continue;
      paths.push(path);
      path.forEach((idx) => visited.add(idx));
    }

    if (!paths.length) return;

    const segments = buildStreamlineSegments(paths, positions);
    if (!segments.length) return;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(segments, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x7a1d14,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geom, mat);
    lines.renderOrder = 130;
    scene.add(lines);
    curvatureLinesRef.current = lines;
  }, [
    showCurvatureLines,
    curvatureLineField,
    curvatureSeedSource,
    curvatureSeedDensity,
    curvatureStepSize,
    curvatureMaxSteps,
    curvatureMaxLines,
    curvatureRebuildToken,
    selectionMask,
    surfaceId,
    graphExpr,
    implicitExpr,
    graphDomain?.xSpan,
    graphDomain?.ySpan,
    implicitResolution,
    surfaceMeshOverride,
    surfaceMeshOverrides,
    sceneEpoch,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const clearLines = (ref: React.MutableRefObject<THREE.Object3D | null>) => {
      if (!ref.current) return;
      ref.current.traverse(disposeObject3D);
      scene.remove(ref.current);
      ref.current = null;
    };

    clearLines(ridgeLinesRef);
    clearLines(valleyLinesRef);

    if (!showRidges && !showValleys) return;

    const isMeshSurface = surfaceId === "surface_mesh";
    const field = getPrincipalField();
    if (!field) return;

    const { positions, k1, k2, d1, d2, vertexCount, index } = field;
    const meshAdjacency = isMeshSurface ? surfaceMeshOverride?.adjacency ?? null : null;
    const neighbors =
      meshAdjacency && meshAdjacency.length === vertexCount
        ? meshAdjacency
        : buildRidgeAdjacency(index, vertexCount);
    const bboxDiag = (radiusRef.current || 3) * 2;
    const segmentLength = ridgeValleyStitch
      ? 0
      : Math.max(1e-6, ridgeValleySegmentScale * bboxDiag);
    const sampleConfig =
      ridgeValleySampleMode === "high"
        ? { stride: 1, maxSegments: 12000 }
        : ridgeValleySampleMode === "low"
          ? { stride: 4, maxSegments: 4000 }
          : { stride: 2, maxSegments: 8000 };

    let allowedMask: Uint8Array | null = null;
    if (ridgeValleySelectionOnly && selectionMask?.count && sampleSetRef.current?.samples.length) {
      const sampleSet = sampleSetRef.current;
      const selected = selectionMask.selected;
      allowedMask = new Uint8Array(vertexCount);
      const findNearestVertex = (px: number, py: number, pz: number) => {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < vertexCount; i++) {
          const idx = i * 3;
          const dx = positions[idx] - px;
          const dy = positions[idx + 1] - py;
          const dz = positions[idx + 2] - pz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < bestDist) {
            bestDist = d2;
            bestIdx = i;
          }
        }
        return bestIdx;
      };

      const stride = Math.max(1, Math.floor(sampleConfig.stride));
      for (let i = 0; i < selected.length && i < sampleSet.samples.length; i += stride) {
        if (!selected[i]) continue;
        const sample = sampleSet.samples[i];
        if (!sample) continue;
        const seed = findNearestVertex(sample.position.x, sample.position.y, sample.position.z);
        allowedMask[seed] = 1;
      }
    }

    const result = detectRidgeValleySegments({
      positions,
      k1,
      k2,
      d1,
      d2,
      neighbors,
      minCos: ridgeValleyMinCos,
      epsK: ridgeValleyContrast,
      kMagMin: ridgeValleyMagMin,
      segmentLength,
      stride: sampleConfig.stride,
      maxSegments: sampleConfig.maxSegments,
      skipUmbilic: true,
      allowedMask,
    });

    const buildPolylineGroup = (polylines: Float32Array[], color: number) => {
      if (!polylines.length) return null;
      const group = new THREE.Group();
      for (const points of polylines) {
        if (points.length < 6) continue;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(points, 3));
        const mat = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false,
        });
        const line = new THREE.Line(geom, mat);
        line.renderOrder = 140;
        line.frustumCulled = false;
        group.add(line);
      }
      return group.children.length ? group : null;
    };

    if (ridgeValleyStitch) {
      const decimateEps = Math.max(0, ridgeValleyDecimate * bboxDiag);
      const maxCurves = Math.max(1, Math.floor(ridgeValleyMaxCurves));
      const minConf = Math.max(0, ridgeValleyMinConf);
      const stitchBase = {
        positions,
        normals: field.normals,
        neighbors,
        minCosLink: ridgeValleyMinCos,
        minConf,
        maxChainLen: 2000,
        maxCurves,
        maxTotalPoints: 200000,
        decimateEps,
      };

      if (showRidges) {
        const ridgeCurves = stitchRidgeValleyCurves({
          ...stitchBase,
          featureMask: result.ridgeMask,
          confidence: result.ridgeConfidence,
          dirField: d1,
        });
        const group = buildPolylineGroup(ridgeCurves.polylines, 0x1b9e77);
        if (group) {
          scene.add(group);
          ridgeLinesRef.current = group;
        }
      }

      if (showValleys) {
        const valleyCurves = stitchRidgeValleyCurves({
          ...stitchBase,
          featureMask: result.valleyMask,
          confidence: result.valleyConfidence,
          dirField: d2,
        });
        const group = buildPolylineGroup(valleyCurves.polylines, 0xd95f02);
        if (group) {
          scene.add(group);
          valleyLinesRef.current = group;
        }
      }
    } else {
      if (showRidges && result.ridgeSegments.length) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(result.ridgeSegments, 3));
        const mat = new THREE.LineBasicMaterial({
          color: 0x1b9e77,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false,
        });
        const lines = new THREE.LineSegments(geom, mat);
        lines.renderOrder = 140;
        scene.add(lines);
        ridgeLinesRef.current = lines;
      }

      if (showValleys && result.valleySegments.length) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(result.valleySegments, 3));
        const mat = new THREE.LineBasicMaterial({
          color: 0xd95f02,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false,
        });
        const lines = new THREE.LineSegments(geom, mat);
        lines.renderOrder = 140;
        scene.add(lines);
        valleyLinesRef.current = lines;
      }
    }
  }, [
    showRidges,
    showValleys,
    ridgeValleySelectionOnly,
    ridgeValleyMagMin,
    ridgeValleyContrast,
    ridgeValleyMinCos,
    ridgeValleySegmentScale,
    ridgeValleySampleMode,
    ridgeValleyStitch,
    ridgeValleyDecimate,
    ridgeValleyMaxCurves,
    ridgeValleyMinConf,
    selectionMask,
    surfaceId,
    graphExpr,
    implicitExpr,
    graphDomain?.xSpan,
    graphDomain?.ySpan,
    implicitResolution,
    sceneEpoch,
  ]);

  useEffect(() => {
    const widgets = probeWidgetsRef.current;
    if (!widgets) return;
    const hasProbe = widgets.marker.visible;

    widgets.normal.visible = hasProbe && showProbeNormal;
    widgets.plane.visible = hasProbe && showProbeTangentPlane;
    const showT = hasProbe && showProbeTangents;
    widgets.t1.visible = showT;
    widgets.t2.visible = showT;
  }, [showProbeNormal, showProbeTangentPlane, showProbeTangents]);

  useEffect(() => {
    const marker = gaussHighlightRef.current;
    if (!marker) return;
    if (!gaussMapEnabled || !gaussHighlightPoint) {
      marker.visible = false;
      return;
    }
    marker.position.set(gaussHighlightPoint.x, gaussHighlightPoint.y, gaussHighlightPoint.z);
    marker.visible = true;
  }, [gaussHighlightPoint, gaussMapEnabled]);

  useEffect(() => {
    const group = principalGroupRef.current;
    if (!group) return;

    clearGroup(group);

    const isGraphSurface = isGraphId(surfaceId);
    const isImplicitSurface = isImplicitId(surfaceId);
    if (!isGraphSurface && !isImplicitSurface) return;
    if (!showPrincipalDirections && !showPrincipalNormalPlanes && !showPrincipalLines) return;

    if (isGraphSurface) {
      if (!probeXY) return;

      const f = getGraphF();
      const root = surfaceObjRef.current as THREE.Object3D | null;
      const meta = root ? (root as any).userData?.__graph as { xSpan: number; ySpan: number } | undefined : undefined;
      const xSpan = meta?.xSpan ?? graphDomain?.xSpan ?? 1.5;
      const ySpan = meta?.ySpan ?? graphDomain?.ySpan ?? 1.5;

      const uMin = -xSpan;
      const uMax = xSpan;
      const vMin = -ySpan;
      const vMax = ySpan;

      const paramFunc = (u: number, v: number, target: THREE.Vector3) => {
        target.set(u, f(u, v), v);
      };

      const res = computePrincipalCurvatureAtUV({
        paramFunc,
        u: probeXY.x,
        v: probeXY.y,
        uMin,
        uMax,
        vMin,
        vMax,
      });

      if (!res) {
        prevPrincipalRef.current = null;
        return;
      }

      const stable = stabilizePrincipalResult(res, prevPrincipalRef.current);
      prevPrincipalRef.current = stable;

      if (stable.isUmbilic) return;

      const arrowLen = Math.max(0.25, Math.min(1.2, (radiusRef.current || 3) * 0.28));
      const planeSize = arrowLen * 2.2;
      const lineOffset = Math.max(0.002, (radiusRef.current || 3) * 0.0025);

      if (showPrincipalDirections) {
        const a1 = new THREE.ArrowHelper(stable.dir1, stable.point, arrowLen, 0x1b9e77);
        const a2 = new THREE.ArrowHelper(stable.dir2, stable.point, arrowLen, 0xd95f02);
        a1.renderOrder = 998;
        a2.renderOrder = 998;
        group.add(a1, a2);
      }

      if (showPrincipalNormalPlanes) {
        const planeGeom1 = new THREE.PlaneGeometry(planeSize, planeSize);
        const planeGeom2 = new THREE.PlaneGeometry(planeSize, planeSize);
        const mat1 = new THREE.MeshBasicMaterial({
          color: 0x3f8efc,
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const mat2 = new THREE.MeshBasicMaterial({
          color: 0xf85f73,
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          depthWrite: false,
        });

        const n1 = new THREE.Vector3().crossVectors(stable.dir1, stable.normal).normalize();
        const n2 = new THREE.Vector3().crossVectors(stable.dir2, stable.normal).normalize();

        const p1 = new THREE.Mesh(planeGeom1, mat1);
        const p2 = new THREE.Mesh(planeGeom2, mat2);
        p1.position.copy(stable.point);
        p2.position.copy(stable.point);
        p1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n1);
        p2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n2);
        p1.renderOrder = 997;
        p2.renderOrder = 997;
        group.add(p1, p2);
      }

      if (showPrincipalLines) {
        const maxSteps = 320;
        const range = Math.min(Math.abs(uMax - uMin), Math.abs(vMax - vMin));
        const step = 0.02 * range;
        const bounds = { uMin, uMax, vMin, vMax };
        const frameAt = (uv: { u: number; v: number }) => {
          if (uv.u < uMin || uv.u > uMax || uv.v < vMin || uv.v > vMax) return null;
          return computePrincipalCurvatureAtUV({
            paramFunc,
            u: uv.u,
            v: uv.v,
            uMin,
            uMax,
            vMin,
            vMax,
          });
        };

        const lineMaterial1 = new THREE.LineBasicMaterial({
          color: 0x1b9e77,
          depthTest: false,
          depthWrite: false,
        });
        const lineMaterial2 = new THREE.LineBasicMaterial({
          color: 0xd95f02,
          depthTest: false,
          depthWrite: false,
        });

        const startUV = { u: probeXY.x, v: probeXY.y };

        const p1 = integratePrincipalStreamlineBidirectional(frameAt, startUV, 1, {
          bounds,
          step,
          maxSteps,
          normalOffset: lineOffset,
        });
        if (p1.xyz.length >= 2) {
          const geom = new THREE.BufferGeometry().setFromPoints(p1.xyz);
          const line = new THREE.Line(geom, lineMaterial1);
          line.renderOrder = 996;
          group.add(line);
        } else {
          lineMaterial1.dispose();
        }

        const p2 = integratePrincipalStreamlineBidirectional(frameAt, startUV, 2, {
          bounds,
          step,
          maxSteps,
          normalOffset: lineOffset,
        });
        if (p2.xyz.length >= 2) {
          const geom = new THREE.BufferGeometry().setFromPoints(p2.xyz);
          const line = new THREE.Line(geom, lineMaterial2);
          line.renderOrder = 996;
          group.add(line);
        } else {
          lineMaterial2.dispose();
        }
      }
      return;
    }

    if (isImplicitSurface) {
      const start = probePointRef.current ? probePointRef.current.clone() : null;
      if (!start) return;

      const root = surfaceObjRef.current as THREE.Object3D | null;
      let implicitF: ((x: number, y: number, z: number) => number) | null = null;
      let implicitSize: number | null = null;

      if (root) {
        root.traverse((obj) => {
          if (implicitF) return;
          const anyObj = obj as any;
          if (isImplicitMeshObj(anyObj)) {
            const meta = anyObj.userData?.__implicit as { f: (x: number, y: number, z: number) => number; size?: number } | undefined;
            if (meta?.f) {
              implicitF = meta.f;
              if (typeof meta.size === "number") implicitSize = meta.size;
            }
          }
        });
      }

      if (!implicitF) {
        const fallback = getImplicitFallback(surfaceId);
        if (fallback) implicitF = fallback;
      }

      if (!implicitF) return;

      let size = implicitSize ?? 0;
      if (!Number.isFinite(size) || size <= 0) {
        size = radiusRef.current || 3;
      }

      const h = Math.max(1e-3, size * 0.01);
      const res = computeImplicitPrincipalAtPoint(implicitF, start, h);
      if (!res) return;

      const normalProbe = probeNormalRef.current;
      if (normalProbe && res.normal.dot(normalProbe) < 0) {
        res.normal.multiplyScalar(-1);
      }

      if (res.isUmbilic) return;

      const arrowLen = Math.max(0.25, Math.min(1.2, size * 0.28));
      const planeSize = arrowLen * 2.2;
      const lineOffset = Math.max(0.002, size * 0.0025);

      if (showPrincipalDirections) {
        const a1 = new THREE.ArrowHelper(res.dir1, res.point, arrowLen, 0x1b9e77);
        const a2 = new THREE.ArrowHelper(res.dir2, res.point, arrowLen, 0xd95f02);
        a1.renderOrder = 998;
        a2.renderOrder = 998;
        group.add(a1, a2);
      }

      if (showPrincipalNormalPlanes) {
        const planeGeom1 = new THREE.PlaneGeometry(planeSize, planeSize);
        const planeGeom2 = new THREE.PlaneGeometry(planeSize, planeSize);
        const mat1 = new THREE.MeshBasicMaterial({
          color: 0x3f8efc,
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const mat2 = new THREE.MeshBasicMaterial({
          color: 0xf85f73,
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          depthWrite: false,
        });

        const n1 = new THREE.Vector3().crossVectors(res.dir1, res.normal).normalize();
        const n2 = new THREE.Vector3().crossVectors(res.dir2, res.normal).normalize();

        const p1 = new THREE.Mesh(planeGeom1, mat1);
        const p2 = new THREE.Mesh(planeGeom2, mat2);
        p1.position.copy(res.point);
        p2.position.copy(res.point);
        p1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n1);
        p2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n2);
        p1.renderOrder = 997;
        p2.renderOrder = 997;
        group.add(p1, p2);
      }

      if (showPrincipalLines) {
        const steps = 320;
        const stepBase = Math.max(1e-3, size * 0.02);
        const maxRadius = size * 2.0;
        const maxResidual = Math.max(1e-4, size * 0.002);

        const projectToSurface = (p: THREE.Vector3) => {
          for (let it = 0; it < 3; it++) {
            const d = sampleImplicitDerivatives(implicitF!, p.x, p.y, p.z, h);
            const gx = d.fx;
            const gy = d.fy;
            const gz = d.fz;
            const g2 = gx * gx + gy * gy + gz * gz;
            if (!Number.isFinite(g2) || g2 < 1e-10) return false;
            const v = implicitF!(p.x, p.y, p.z);
            if (!Number.isFinite(v)) return false;
            const s = v / g2;
            p.x -= gx * s;
            p.y -= gy * s;
            p.z -= gz * s;
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return false;
          }
          return true;
        };

        const traceDir = (which: 1 | 2, dirSign: 1 | -1) => {
          const pts: THREE.Vector3[] = [];
          let p = start.clone();
          let prevDir: THREE.Vector3 | null = null;
          let prevNormal: THREE.Vector3 | null = null;
          for (let i = 0; i < steps; i++) {
            const frame = computeImplicitPrincipalAtPoint(implicitF!, p, h);
            if (!frame || frame.isUmbilic) break;
            if (prevNormal && frame.normal.dot(prevNormal) < 0) {
              frame.normal.multiplyScalar(-1);
              frame.dir1.multiplyScalar(-1);
              frame.dir2.multiplyScalar(-1);
            }

            let dir = (which === 1 ? frame.dir1 : frame.dir2).clone();
            dir.addScaledVector(frame.normal, -dir.dot(frame.normal));
            if (!Number.isFinite(dir.x) || !Number.isFinite(dir.y) || !Number.isFinite(dir.z)) break;
            if (dir.lengthSq() < 1e-12) break;
            dir.normalize();
            if (prevDir && dir.dot(prevDir) < 0) dir.negate();
            dir.multiplyScalar(dirSign);

            const plotPt = p.clone().addScaledVector(frame.normal, lineOffset);
            pts.push(plotPt);

            const kMax = Math.max(Math.abs(frame.k1), Math.abs(frame.k2));
            const localStep = Math.max(1e-3, Math.min(stepBase, kMax > 1e-6 ? 0.25 / kMax : stepBase));
            p = p.clone().addScaledVector(dir, localStep);
            if (!projectToSurface(p)) break;
            const residual = implicitF!(p.x, p.y, p.z);
            if (!Number.isFinite(residual) || Math.abs(residual) > maxResidual) break;
            if (p.length() > maxRadius) break;
            prevDir = dir.clone();
            prevNormal = frame.normal.clone();
          }
          return pts;
        };

        const joinBidirectional = (which: 1 | 2) => {
          const back = traceDir(which, -1);
          const fwd = traceDir(which, 1);
          const backRev = back.slice().reverse();
          if (backRev.length > 0 && fwd.length > 0) backRev.pop();
          return [...backRev, ...fwd];
        };

        const lineMaterial1 = new THREE.LineBasicMaterial({
          color: 0x1b9e77,
          depthTest: false,
          depthWrite: false,
        });
        const lineMaterial2 = new THREE.LineBasicMaterial({
          color: 0xd95f02,
          depthTest: false,
          depthWrite: false,
        });

        const p1 = joinBidirectional(1);
        if (p1.length >= 2) {
          const geom = new THREE.BufferGeometry().setFromPoints(p1);
          const line = new THREE.Line(geom, lineMaterial1);
          line.renderOrder = 996;
          group.add(line);
        } else {
          lineMaterial1.dispose();
        }

        const p2 = joinBidirectional(2);
        if (p2.length >= 2) {
          const geom = new THREE.BufferGeometry().setFromPoints(p2);
          const line = new THREE.Line(geom, lineMaterial2);
          line.renderOrder = 996;
          group.add(line);
        } else {
          lineMaterial2.dispose();
        }
      }
    }
  }, [
    probeXY?.x,
    probeXY?.y,
    probePointToken,
    surfaceId,
    graphExpr,
    implicitExpr,
    graphDomain?.xSpan,
    graphDomain?.ySpan,
    showPrincipalDirections,
    showPrincipalNormalPlanes,
    showPrincipalLines,
    probeEnabled,
    sceneEpoch,
  ]);

  useEffect(() => {
    if (!cameraSync || isCameraLeader) return;
    const cam = cameraRef.current;
    const ctrls = controlsRef.current;
    if (!cam || !ctrls) return;

    cam.position.set(cameraSync.position.x, cameraSync.position.y, cameraSync.position.z);
    cam.up.set(cameraSync.up.x, cameraSync.up.y, cameraSync.up.z);
    ctrls.target.set(cameraSync.target.x, cameraSync.target.y, cameraSync.target.z);
    cam.updateProjectionMatrix();
    ctrls.update();
  }, [
    cameraSync?.position.x,
    cameraSync?.position.y,
    cameraSync?.position.z,
    cameraSync?.target.x,
    cameraSync?.target.y,
    cameraSync?.target.z,
    cameraSync?.up.x,
    cameraSync?.up.y,
    cameraSync?.up.z,
    isCameraLeader,
  ]);

  useEffect(() => {
    if (!cameraOverride) return;
    const cam = cameraRef.current;
    const ctrls = controlsRef.current;
    if (!cam || !ctrls) return;

    cam.position.set(cameraOverride.position.x, cameraOverride.position.y, cameraOverride.position.z);
    cam.up.set(cameraOverride.up.x, cameraOverride.up.y, cameraOverride.up.z);
    ctrls.target.set(cameraOverride.target.x, cameraOverride.target.y, cameraOverride.target.z);
    cam.updateProjectionMatrix();
    ctrls.update();
  }, [cameraOverrideToken]);

  useEffect(() => {
    if (!cameraFitCommand) return;
    const cam = cameraRef.current;
    const ctrls = controlsRef.current;
    if (!cam || !ctrls) return;

    const { center, radius } = cameraFitCommand;
    const cx = Number(center?.x);
    const cy = Number(center?.y);
    const cz = Number(center?.z);
    const targetRadius = Number(radius);
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) return;
    if (!Number.isFinite(targetRadius) || targetRadius <= 1e-6) return;

    const targetCenter = new THREE.Vector3(cx, cy, cz);
    const fovY = THREE.MathUtils.degToRad(cam.fov);
    const fovX = 2 * Math.atan(Math.tan(fovY * 0.5) * cam.aspect);
    const minFov = Math.max(1e-3, Math.min(fovY, fovX));
    const fitPadding = Math.max(0.88, Math.min(1.6, Number(cameraFitCommand.padding ?? 1.08)));
    const requiredDist = (targetRadius * fitPadding) / Math.sin(minFov * 0.5);
    if (!Number.isFinite(requiredDist) || requiredDist <= 0) return;

    const currentTarget = ctrls.target.clone();
    const viewDir = cam.position.clone().sub(currentTarget);
    if (viewDir.lengthSq() < 1e-8) viewDir.set(0.7, 0.58, 1);
    viewDir.normalize();

    cam.position.copy(targetCenter).addScaledVector(viewDir, requiredDist);
    ctrls.target.copy(targetCenter);
    cam.lookAt(targetCenter);
    ctrls.update();

    centerRef.current.copy(targetCenter);
    radiusRef.current = targetRadius;
    setViewMode("free");
    setLockToAxisPlane(false);
    setViewGizmoMenuOpen(false);
  }, [cameraFitCommand?.token]);

  useEffect(() => {
    if (!cameraTourCommand) return;
    const cam = cameraRef.current;
    const ctrls = controlsRef.current;
    if (!cam || !ctrls) return;

    if (cameraTourCommand.action === "stop") {
      stopCameraTour("stopped");
      return;
    }

    const centerInput = cameraTourCommand.center;
    const radiusInput = cameraTourCommand.radius;
    const fallbackCenter = centerRef.current;
    const centerX = Number.isFinite(centerInput?.x) ? Number(centerInput?.x) : fallbackCenter.x;
    const centerY = Number.isFinite(centerInput?.y) ? Number(centerInput?.y) : fallbackCenter.y;
    const centerZ = Number.isFinite(centerInput?.z) ? Number(centerInput?.z) : fallbackCenter.z;
    const centerValid = Number.isFinite(centerX) && Number.isFinite(centerY) && Number.isFinite(centerZ);
    const radiusValue =
      Number.isFinite(radiusInput) && Number(radiusInput) > 0
        ? Number(radiusInput)
        : Number.isFinite(radiusRef.current) && radiusRef.current > 0
          ? radiusRef.current
          : NaN;
    if (!centerValid || !Number.isFinite(radiusValue) || radiusValue <= 0) {
      return;
    }

    stopCameraTour("stopped", false);

    const clampPhi = (phi: number) => Math.min(Math.PI - 0.32, Math.max(0.32, phi));
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

    const center = new THREE.Vector3(centerX, centerY, centerZ);
    const startPos = cam.position.clone();
    const startTarget = ctrls.target.clone();
    const startOffset = startPos.clone().sub(center);
    if (startOffset.lengthSq() < 1e-10) {
      startOffset.set(2.2, 1.3, 2.0);
    }
    const startSpherical = new THREE.Spherical().setFromVector3(startOffset);
    const startTheta = startSpherical.theta;
    const startPhi = clampPhi(startSpherical.phi);
    const startRadius = Math.max(0.1, startSpherical.radius);

    const focusRadius = Math.max(0.2, Number(radiusValue));
    const mode: CameraTourMode = cameraTourCommand.mode ?? "balanced";
    const preset = (() => {
      switch (mode) {
        case "orbit":
          return {
            durationMs: 6600,
            introT: 0.14,
            settleT: 0.1,
            orbitSpan: Math.PI * 2.05,
            phiBase: 1.03,
            phiAmp: 0.11,
            finalPhi: 1.0,
            nearDistance: Math.max(1.7, focusRadius * 2.95),
            farDistance: Math.max(1.9, focusRadius * 3.2),
            finalThetaOffset: Math.PI * 0.66,
            targetLift: focusRadius * 0.06,
            zoomPulseAmp: focusRadius * 0.05,
            zoomPulseCycles: 2.0,
          };
        case "zoom":
          return {
            durationMs: 4300,
            introT: 0.24,
            settleT: 0.12,
            orbitSpan: Math.PI * 0.96,
            phiBase: 1.06,
            phiAmp: 0.09,
            finalPhi: 0.98,
            nearDistance: Math.max(1.25, focusRadius * 2.05),
            farDistance: Math.max(1.65, focusRadius * 3.45),
            finalThetaOffset: Math.PI * 0.55,
            targetLift: 0,
            zoomPulseAmp: focusRadius * 0.22,
            zoomPulseCycles: 1.5,
          };
        case "spiral":
          return {
            durationMs: 6000,
            introT: 0.18,
            settleT: 0.1,
            orbitSpan: Math.PI * 1.82,
            phiBase: 1.15,
            phiAmp: 0.2,
            finalPhi: 0.92,
            nearDistance: Math.max(1.5, focusRadius * 2.5),
            farDistance: Math.max(1.75, focusRadius * 2.95),
            finalThetaOffset: Math.PI * 0.7,
            targetLift: focusRadius * 0.14,
            zoomPulseAmp: focusRadius * 0.08,
            zoomPulseCycles: 1.6,
          };
        case "quick":
          return {
            durationMs: 2400,
            introT: 0.16,
            settleT: 0.14,
            orbitSpan: Math.PI * 0.88,
            phiBase: 1.02,
            phiAmp: 0.08,
            finalPhi: 1.0,
            nearDistance: Math.max(1.35, focusRadius * 2.45),
            farDistance: Math.max(1.45, focusRadius * 2.65),
            finalThetaOffset: Math.PI * 0.42,
            targetLift: 0,
            zoomPulseAmp: focusRadius * 0.03,
            zoomPulseCycles: 1.0,
          };
        case "long":
          return {
            durationMs: 9200,
            introT: 0.14,
            settleT: 0.1,
            orbitSpan: Math.PI * 2.78,
            phiBase: 1.07,
            phiAmp: 0.15,
            finalPhi: 0.96,
            nearDistance: Math.max(1.45, focusRadius * 2.35),
            farDistance: Math.max(1.8, focusRadius * 3.15),
            finalThetaOffset: Math.PI * 0.84,
            targetLift: focusRadius * 0.08,
            zoomPulseAmp: focusRadius * 0.07,
            zoomPulseCycles: 2.4,
          };
        case "long_orbit":
          return {
            durationMs: 11800,
            introT: 0.12,
            settleT: 0.09,
            orbitSpan: Math.PI * 3.28,
            phiBase: 1.05,
            phiAmp: 0.12,
            finalPhi: 0.98,
            nearDistance: Math.max(1.55, focusRadius * 2.55),
            farDistance: Math.max(1.9, focusRadius * 3.25),
            finalThetaOffset: Math.PI * 1.02,
            targetLift: focusRadius * 0.08,
            zoomPulseAmp: focusRadius * 0.1,
            zoomPulseCycles: 2.6,
          };
        case "long_zoom":
          return {
            durationMs: 10800,
            introT: 0.14,
            settleT: 0.11,
            orbitSpan: Math.PI * 2.46,
            phiBase: 1.08,
            phiAmp: 0.16,
            finalPhi: 0.9,
            nearDistance: Math.max(1.1, focusRadius * 1.78),
            farDistance: Math.max(2.0, focusRadius * 4.1),
            finalThetaOffset: Math.PI * 0.9,
            targetLift: focusRadius * 0.06,
            zoomPulseAmp: focusRadius * 0.34,
            zoomPulseCycles: 3.0,
          };
        case "long_spiral":
          return {
            durationMs: 12400,
            introT: 0.13,
            settleT: 0.12,
            orbitSpan: Math.PI * 2.92,
            phiBase: 1.18,
            phiAmp: 0.24,
            finalPhi: 0.86,
            nearDistance: Math.max(1.25, focusRadius * 2.0),
            farDistance: Math.max(1.95, focusRadius * 3.5),
            finalThetaOffset: Math.PI * 1.1,
            targetLift: focusRadius * 0.22,
            zoomPulseAmp: focusRadius * 0.2,
            zoomPulseCycles: 2.2,
          };
        case "balanced":
        default:
          return {
            durationMs: 5200,
            introT: 0.2,
            settleT: 0.1,
            orbitSpan: Math.PI * 1.42,
            phiBase: 1.04,
            phiAmp: 0.16,
            finalPhi: 1.02,
            nearDistance: Math.max(1.5, focusRadius * 2.7),
            farDistance: Math.max(1.7, focusRadius * 3.08),
            finalThetaOffset: Math.PI * 0.62,
            targetLift: 0,
            zoomPulseAmp: 0,
            zoomPulseCycles: 0,
          };
      }
    })();
    const durationMs = Number.isFinite(cameraTourCommand.durationMs)
      ? Math.max(1200, Math.min(16000, Number(cameraTourCommand.durationMs)))
      : preset.durationMs;
    const introT = Math.min(0.35, Math.max(0.08, preset.introT));
    const settleT = Math.min(0.25, Math.max(0.05, preset.settleT));
    const orbitT = Math.max(0.2, 1 - introT - settleT);
    const orbitEndT = Math.min(1, introT + orbitT);
    const finalTheta = startTheta + preset.finalThetaOffset;
    const orbitPhiAt = (u: number) =>
      preset.phiBase + preset.phiAmp * Math.sin(Math.PI * u) + (mode === "spiral" ? -0.26 * u : 0);
    const orbitRadiusAt = (u: number) => {
      const base =
        preset.farDistance + (preset.nearDistance - preset.farDistance) * easeOutCubic(clamp01(u));
      if (preset.zoomPulseAmp <= 0 || preset.zoomPulseCycles <= 0) return base;
      const wave = Math.sin(Math.PI * 2 * preset.zoomPulseCycles * u);
      const decay = 1 - clamp01(u) * 0.7;
      return base + preset.zoomPulseAmp * wave * decay;
    };
    const orbitTargetLiftAt = (u: number) =>
      preset.targetLift === 0 ? 0 : preset.targetLift * Math.sin(Math.PI * u);

    cameraTourCaptureStopRef.current = null;
    if (cameraTourCommand.captureVideo) {
      const canvas = rendererRef.current?.domElement as HTMLCanvasElement | undefined;
      const hasCapture = !!canvas && typeof canvas.captureStream === "function";
      if (!hasCapture || typeof MediaRecorder === "undefined") {
        onCameraTourEventRef.current?.("capture_unsupported");
      } else {
        const fps = Number.isFinite(cameraTourCommand.captureFps)
          ? Math.max(12, Math.min(60, Number(cameraTourCommand.captureFps)))
          : 30;
        const timestamp = (() => {
          const d = new Date();
          const p2 = (n: number) => String(n).padStart(2, "0");
          return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(
            d.getMinutes()
          )}${p2(d.getSeconds())}`;
        })();
        const fallbackName = `camera-tour-${surfaceId}-${timestamp}.webm`;
        const desiredName =
          typeof cameraTourCommand.captureFileName === "string" && cameraTourCommand.captureFileName.trim().length
            ? cameraTourCommand.captureFileName.trim()
            : fallbackName;
        const requestedFormat: CameraTourCaptureFormat =
          cameraTourCommand.captureFormat === "webm" ? "webm" : "mp4";
        try {
          const stream = canvas!.captureStream(fps);
          const mp4Candidates = [
            "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
            "video/mp4;codecs=avc1",
            "video/mp4",
          ];
          const webmCandidates = [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm",
          ];
          const mimeCandidates = requestedFormat === "mp4" ? [...mp4Candidates, ...webmCandidates] : webmCandidates;
          const mimeType =
            typeof MediaRecorder.isTypeSupported === "function"
              ? mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ""
              : "";
          if (!mimeType) {
            onCameraTourEventRef.current?.("capture_unsupported");
            return;
          }
          const actualFormat: CameraTourCaptureFormat = mimeType.toLowerCase().includes("mp4") ? "mp4" : "webm";
          if (requestedFormat === "mp4" && actualFormat === "webm") {
            onCameraTourEventRef.current?.("capture_fallback_webm");
          }
          const captureWidth = Math.max(1, Math.round(canvas!.width || 0));
          const captureHeight = Math.max(1, Math.round(canvas!.height || 0));
          const capturePixels = captureWidth * captureHeight;
          const bitsPerPixelPerFrame =
            renderQuality === "sharp" ? 0.22 : renderQuality === "balanced" ? 0.16 : 0.11;
          const codecBoost = actualFormat === "mp4" ? 1.08 : 1;
          const minBitrate =
            renderQuality === "sharp" ? 10_000_000 : renderQuality === "balanced" ? 6_500_000 : 4_000_000;
          const maxBitrate = 42_000_000;
          const videoBitsPerSecond = Math.max(
            minBitrate,
            Math.min(
              maxBitrate,
              Math.round(capturePixels * Math.max(12, fps) * bitsPerPixelPerFrame * codecBoost)
            )
          );
          const recorder = mimeType
            ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond })
            : new MediaRecorder(stream);
          const chunks: BlobPart[] = [];
          let finalized = false;
          let stopCapture: ((reason: "completed" | "stopped" | "interrupted") => void) | null = null;
          const finalize = () => {
            if (finalized) return;
            finalized = true;
            stream.getTracks().forEach((track) => {
              try {
                track.stop();
              } catch {
                // ignore
              }
            });
            if (stopCapture && cameraTourCaptureStopRef.current === stopCapture) {
              cameraTourCaptureStopRef.current = null;
            }
            const blob = new Blob(chunks, {
              type: recorder.mimeType || (actualFormat === "mp4" ? "video/mp4" : "video/webm"),
            });
            if (!blob.size) {
              onCameraTourEventRef.current?.("capture_error");
              return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const expectedExt = actualFormat === "mp4" ? ".mp4" : ".webm";
            const lowered = desiredName.toLowerCase();
            a.download = lowered.endsWith(".mp4") || lowered.endsWith(".webm") ? desiredName.replace(/\.(mp4|webm)$/i, expectedExt) : `${desiredName}${expectedExt}`;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 0);
            onCameraTourEventRef.current?.("capture_saved");
            onCameraTourEventRef.current?.(actualFormat === "mp4" ? "capture_saved_mp4" : "capture_saved_webm");
          };
          stopCapture = (_reason: "completed" | "stopped" | "interrupted") => {
            if (recorder.state === "inactive") {
              finalize();
              return;
            }
            try {
              recorder.stop();
            } catch {
              finalize();
            }
          };
          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              chunks.push(event.data);
            }
          };
          recorder.onerror = () => {
            onCameraTourEventRef.current?.("capture_error");
          };
          recorder.onstop = () => {
            finalize();
          };
          recorder.start(100);
          cameraTourCaptureStopRef.current = stopCapture;
        } catch {
          onCameraTourEventRef.current?.("capture_error");
        }
      }
    }

    const runId = cameraTourRunIdRef.current + 1;
    cameraTourRunIdRef.current = runId;
    const startedAt = performance.now();
    onCameraTourEventRef.current?.("started");

    const renderSpherical = new THREE.Spherical();
    const renderOffset = new THREE.Vector3();
    const renderTarget = new THREE.Vector3();
    const renderPose = (theta: number, phi: number, radius: number, target: THREE.Vector3) => {
      renderSpherical.radius = Math.max(0.2, radius);
      renderSpherical.phi = clampPhi(phi);
      renderSpherical.theta = theta;
      renderOffset.setFromSpherical(renderSpherical);
      cam.position.copy(target).add(renderOffset);
      cam.up.set(0, 1, 0);
      ctrls.target.copy(target);
      cam.lookAt(target);
      cam.updateProjectionMatrix();
      ctrls.update();
    };

    const step = () => {
      if (cameraTourRunIdRef.current !== runId) return;
      const elapsed = performance.now() - startedAt;
      const t = Math.min(1, elapsed / durationMs);

      if (t <= introT) {
        const k = easeInOutCubic(t / introT);
        const theta = startTheta;
        const phi = startPhi + (preset.phiBase - startPhi) * k;
        const radius = startRadius + (preset.farDistance - startRadius) * k;
        renderTarget.copy(startTarget).lerp(center, k);
        if (preset.targetLift !== 0) {
          renderTarget.y += preset.targetLift * 0.35 * Math.sin(Math.PI * k);
        }
        renderPose(theta, phi, radius, renderTarget);
      } else if (t <= orbitEndT) {
        const u = (t - introT) / orbitT;
        const k = easeInOutCubic(u);
        const theta = startTheta + preset.orbitSpan * k;
        const phi = orbitPhiAt(u);
        const radius = orbitRadiusAt(u);
        renderTarget.copy(center);
        renderTarget.y += orbitTargetLiftAt(u);
        renderPose(theta, phi, radius, renderTarget);
      } else {
        const denom = Math.max(1e-6, 1 - orbitEndT);
        const u = (t - orbitEndT) / denom;
        const k = easeInOutCubic(u);
        const orbitEndTheta = startTheta + preset.orbitSpan;
        const theta = orbitEndTheta + (finalTheta - orbitEndTheta) * k;
        const orbitEndPhi = orbitPhiAt(1);
        const phi = orbitEndPhi + (preset.finalPhi - orbitEndPhi) * k;
        const orbitEndRadius = orbitRadiusAt(1);
        const radius = orbitEndRadius + (preset.nearDistance - orbitEndRadius) * k;
        renderTarget.copy(center);
        renderPose(theta, phi, radius, renderTarget);
      }

      if (t < 1) {
        cameraTourFrameRef.current = requestAnimationFrame(step);
        return;
      }

      cameraTourFrameRef.current = null;
      if (cameraTourRunIdRef.current !== runId) return;
      cameraTourRunIdRef.current += 1;
      stopCameraTourCapture("completed");
      onCameraTourEventRef.current?.("completed");
    };

    cameraTourFrameRef.current = requestAnimationFrame(step);
  }, [cameraTourCommand?.token, stopCameraTour, stopCameraTourCapture, surfaceId]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (chartGridRef.current) {
      chartGridRef.current.traverse(disposeObject3D);
      scene.remove(chartGridRef.current);
      chartGridRef.current = null;
    }
    chartGridPickMeshRef.current = null;
    chartGridCellsRef.current = [];
    chartGridRenderableCellIndicesRef.current = [];
    chartGridCellFaceFactorRef.current = 1;

    if (!showChartGrid) return;

    const uCount = Math.max(2, Math.round(chartGridCountU));
    const vCount = Math.max(2, Math.round(chartGridCountV));
    const group = new THREE.Group();
    group.name = "surface-decomposition-overlay";
    group.renderOrder = 150;
    const cells: SurfaceDecompositionCell[] = [];
    const renderableCellIndices: number[] = [];
    let areaMin = Number.POSITIVE_INFINITY;
    let areaMax = Number.NEGATIVE_INFINITY;
    let areaSum = 0;
    let areaCount = 0;
    let maskedCells = 0;
    let skippedNonFinite = 0;
    let skippedDegenerate = 0;
    let skippedOutOfBounds = 0;
    const fillPositions: number[] = [];
    const fillIndices: number[] = [];
    let vertexCursor = 0;
    const edgePositions: number[] = [];
    const addEdge = (a: THREE.Vector3, b: THREE.Vector3) => {
      edgePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    };
    const addGraphCell = (
      p00: THREE.Vector3,
      p10: THREE.Vector3,
      p11: THREE.Vector3,
      p01: THREE.Vector3,
      i: number,
      j: number
    ) => {
      const eA = new THREE.Vector3().subVectors(p10, p00);
      const eB = new THREE.Vector3().subVectors(p01, p00);
      const nA = new THREE.Vector3().crossVectors(eA, eB);
      const tri1Area = nA.length() * 0.5;
      const nB = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(p11, p10),
        new THREE.Vector3().subVectors(p01, p10)
      );
      const tri2Area = nB.length() * 0.5;
      const normal = nA.add(nB).normalize();
      if (!Number.isFinite(normal.x) || !Number.isFinite(normal.y) || !Number.isFinite(normal.z)) {
        normal.set(0, 1, 0);
      }
      const center = new THREE.Vector3()
        .copy(p00)
        .add(p10)
        .add(p11)
        .add(p01)
        .multiplyScalar(0.25);
      const area = tri1Area + tri2Area;
      const id = `graph:${i}:${j}`;
      const cell: SurfaceDecompositionCell = {
        id,
        kind: "graph",
        i,
        j,
        center,
        normal,
        area,
        corners: [p00.clone(), p10.clone(), p11.clone(), p01.clone()],
      };
      const cellIndex = cells.push(cell) - 1;
      if (surfaceCellMaskedIds.has(id)) {
        maskedCells += 1;
        return;
      }
      renderableCellIndices.push(cellIndex);
      if (Number.isFinite(area) && area > 0) {
        areaMin = Math.min(areaMin, area);
        areaMax = Math.max(areaMax, area);
        areaSum += area;
        areaCount += 1;
      }
      fillPositions.push(
        p00.x, p00.y, p00.z,
        p10.x, p10.y, p10.z,
        p11.x, p11.y, p11.z,
        p01.x, p01.y, p01.z
      );
      fillIndices.push(
        vertexCursor,
        vertexCursor + 1,
        vertexCursor + 2,
        vertexCursor,
        vertexCursor + 2,
        vertexCursor + 3
      );
      vertexCursor += 4;
      addEdge(p00, p10);
      addEdge(p10, p11);
      addEdge(p11, p01);
      addEdge(p01, p00);
    };
    const addTriCell = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      c: THREE.Vector3,
      meshKey?: string,
      triangleIndex?: number
    ) => {
      const id = `${meshKey ?? "mesh"}:${triangleIndex ?? cells.length}`;
      const cross = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(b, a),
        new THREE.Vector3().subVectors(c, a)
      );
      const area = cross.length() * 0.5;
      const center = new THREE.Vector3().copy(a).add(b).add(c).multiplyScalar(1 / 3);
      if (!Number.isFinite(area)) {
        cells.push({
          id,
          kind: "mesh",
          meshKey,
          triangleIndex,
          center,
          normal: new THREE.Vector3(0, 1, 0),
          area: Number.NaN,
          corners: [a.clone(), b.clone(), c.clone()],
          invalidReason: "non_finite",
        });
        skippedNonFinite += 1;
        return;
      }
      if (area <= 1e-12) {
        const normalDeg = cross.lengthSq() > 1e-16 ? cross.clone().normalize() : new THREE.Vector3(0, 1, 0);
        cells.push({
          id,
          kind: "mesh",
          meshKey,
          triangleIndex,
          center,
          normal: normalDeg,
          area,
          corners: [a.clone(), b.clone(), c.clone()],
          invalidReason: "degenerate",
        });
        skippedDegenerate += 1;
        return;
      }
      const normal = cross.normalize();
      const cell: SurfaceDecompositionCell = {
        id,
        kind: "mesh",
        meshKey,
        triangleIndex,
        center,
        normal,
        area,
        corners: [a.clone(), b.clone(), c.clone()],
      };
      const cellIndex = cells.push(cell) - 1;
      if (surfaceCellMaskedIds.has(id)) {
        maskedCells += 1;
        return;
      }
      renderableCellIndices.push(cellIndex);
      areaMin = Math.min(areaMin, area);
      areaMax = Math.max(areaMax, area);
      areaSum += area;
      areaCount += 1;
      fillPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      fillIndices.push(vertexCursor, vertexCursor + 1, vertexCursor + 2);
      vertexCursor += 3;
      addEdge(a, b);
      addEdge(b, c);
      addEdge(c, a);
    };

    if (isGraphId(surfaceId)) {
      const f = getGraphF();
      const span = getGraphSpan(1.5, 1.5);
      const xMax = span.xSpan;
      const yMax = span.ySpan;
      const steps = 120;

      const addGraphGrid = (axis: "x" | "y", count: number, color: number) => {
        const positions: number[] = [];
        const mat = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.75,
        });
        const prev = new THREE.Vector3();
        const cur = new THREE.Vector3();
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0.5 : i / (count - 1);
          const fixed = axis === "x" ? -xMax + 2 * xMax * t : -yMax + 2 * yMax * t;
          let hasPrev = false;
          for (let j = 0; j < steps; j++) {
            const s = steps === 1 ? 0.5 : j / (steps - 1);
            const x = axis === "x" ? fixed : -xMax + 2 * xMax * s;
            const y = axis === "y" ? fixed : -yMax + 2 * yMax * s;
            const z = f(x, y);
            if (!Number.isFinite(z)) {
              hasPrev = false;
              continue;
            }
            cur.set(x, z, y);
            if (hasPrev) {
              positions.push(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z);
            }
            prev.copy(cur);
            hasPrev = true;
          }
        }
        if (!positions.length) {
          mat.dispose();
          return;
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        const lines = new THREE.LineSegments(geom, mat);
        lines.renderOrder = 150;
        group.add(lines);
      };

      addGraphGrid("x", uCount, 0x1f77b4);
      addGraphGrid("y", vCount, 0xff7f0e);
      for (let i = 0; i < uCount - 1; i++) {
        const t0 = i / (uCount - 1);
        const t1 = (i + 1) / (uCount - 1);
        const x0 = -xMax + 2 * xMax * t0;
        const x1 = -xMax + 2 * xMax * t1;
        for (let j = 0; j < vCount - 1; j++) {
          const s0 = j / (vCount - 1);
          const s1 = (j + 1) / (vCount - 1);
          const y0 = -yMax + 2 * yMax * s0;
          const y1 = -yMax + 2 * yMax * s1;
          const z00 = f(x0, y0);
          const z10 = f(x1, y0);
          const z11 = f(x1, y1);
          const z01 = f(x0, y1);
          if (![z00, z10, z11, z01].every((z) => Number.isFinite(z))) continue;
          const p00 = new THREE.Vector3(x0, z00, y0);
          const p10 = new THREE.Vector3(x1, z10, y0);
          const p11 = new THREE.Vector3(x1, z11, y1);
          const p01 = new THREE.Vector3(x0, z01, y1);
          addGraphCell(p00, p10, p11, p01, i, j);
        }
      }
      chartGridCellFaceFactorRef.current = 2;
    } else if (chartGridMode === "mesh-face") {
      const root = surfaceObjRef.current;
      if (!root) {
        setSurfaceCellInvalidRows([]);
        setSurfaceCellDiagnostics({
          validCells: 0,
          maskedCells: 0,
          invalidCells: 0,
          skippedNonFinite: 0,
          skippedDegenerate: 0,
          skippedOutOfBounds: 0,
          minArea: null,
          maxArea: null,
          avgArea: null,
        });
        return;
      }
      root.updateMatrixWorld(true);
      const meshCandidates: THREE.Mesh[] = [];
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh?.isMesh) return;
        const geom = mesh.geometry as THREE.BufferGeometry | undefined;
        const pos = geom?.getAttribute?.("position") as THREE.BufferAttribute | undefined;
        if (!geom || !pos || pos.count < 3) return;
        meshCandidates.push(mesh);
      });
      if (!meshCandidates.length) {
        setSurfaceCellInvalidRows([]);
        setSurfaceCellDiagnostics({
          validCells: 0,
          maskedCells: 0,
          invalidCells: 0,
          skippedNonFinite: 0,
          skippedDegenerate: 0,
          skippedOutOfBounds: 0,
          minArea: null,
          maxArea: null,
          avgArea: null,
        });
        return;
      }

      let triCountTotal = 0;
      for (const mesh of meshCandidates) {
        const geom = mesh.geometry as THREE.BufferGeometry;
        const idxAttr = geom.getIndex();
        triCountTotal += idxAttr ? Math.floor(idxAttr.count / 3) : Math.floor((geom.getAttribute("position") as THREE.BufferAttribute).count / 3);
      }
      const maxTriCells = Math.max(480, Math.min(12000, uCount * vCount * 28));
      const triStride = Math.max(1, Math.ceil(triCountTotal / maxTriCells));
      let triOrdinal = 0;
      const localA = new THREE.Vector3();
      const localB = new THREE.Vector3();
      const localC = new THREE.Vector3();
      for (const mesh of meshCandidates) {
        const geom = mesh.geometry as THREE.BufferGeometry;
        const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
        const idxAttr = geom.getIndex();
        const triCount = idxAttr ? Math.floor(idxAttr.count / 3) : Math.floor(posAttr.count / 3);
        for (let t = 0; t < triCount; t++) {
          const keep = triStride === 1 || triOrdinal % triStride === 0;
          triOrdinal += 1;
          if (!keep) continue;
          const i0 = idxAttr ? idxAttr.getX(3 * t) : 3 * t;
          const i1 = idxAttr ? idxAttr.getX(3 * t + 1) : 3 * t + 1;
          const i2 = idxAttr ? idxAttr.getX(3 * t + 2) : 3 * t + 2;
          if (
            i0 < 0 || i1 < 0 || i2 < 0 ||
            i0 >= posAttr.count || i1 >= posAttr.count || i2 >= posAttr.count
          ) {
            cells.push({
              id: `${mesh.uuid}:${t}`,
              kind: "mesh",
              meshKey: mesh.uuid,
              triangleIndex: t,
              center: new THREE.Vector3(),
              normal: new THREE.Vector3(0, 1, 0),
              area: Number.NaN,
              corners: [],
              invalidReason: "out_of_bounds",
            });
            skippedOutOfBounds += 1;
            continue;
          }
          localA.set(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0)).applyMatrix4(mesh.matrixWorld);
          localB.set(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1)).applyMatrix4(mesh.matrixWorld);
          localC.set(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2)).applyMatrix4(mesh.matrixWorld);
          if (
            !Number.isFinite(localA.x) || !Number.isFinite(localA.y) || !Number.isFinite(localA.z) ||
            !Number.isFinite(localB.x) || !Number.isFinite(localB.y) || !Number.isFinite(localB.z) ||
            !Number.isFinite(localC.x) || !Number.isFinite(localC.y) || !Number.isFinite(localC.z)
          ) {
            cells.push({
              id: `${mesh.uuid}:${t}`,
              kind: "mesh",
              meshKey: mesh.uuid,
              triangleIndex: t,
              center: new THREE.Vector3(),
              normal: new THREE.Vector3(0, 1, 0),
              area: Number.NaN,
              corners: [localA.clone(), localB.clone(), localC.clone()],
              invalidReason: "non_finite",
            });
            skippedNonFinite += 1;
            continue;
          }
          addTriCell(localA, localB, localC, mesh.uuid, t);
        }
      }
      chartGridCellFaceFactorRef.current = 1;
    } else {
      const origin = probePointRef.current;
      const normalRaw = probeNormalRef.current;
      if (!origin || !normalRaw || normalRaw.lengthSq() < 1e-12) return;

      const normal = normalRaw.clone().normalize();
      const ref = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      let tangentU = new THREE.Vector3().crossVectors(ref, normal);
      if (tangentU.lengthSq() < 1e-12) {
        tangentU = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), normal);
      }
      if (tangentU.lengthSq() < 1e-12) return;
      tangentU.normalize();
      const tangentV = new THREE.Vector3().crossVectors(normal, tangentU).normalize();

      let patchRadius = 0.7;
      const mesh = surfaceObjRef.current as THREE.Mesh | null;
      const geom = mesh?.geometry as THREE.BufferGeometry | undefined;
      if (geom) {
        geom.computeBoundingBox();
        const bbox = geom.boundingBox;
        if (bbox) {
          const diag = bbox.getSize(new THREE.Vector3()).length();
          if (Number.isFinite(diag) && diag > 0) {
            patchRadius = Math.max(0.2, diag * 0.12);
          }
        }
      }

      const steps = 48;
      const addLocalGrid = (axis: "u" | "v", count: number, color: number) => {
        const positions: number[] = [];
        const mat = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.78,
        });
        const prev = new THREE.Vector3();
        const cur = new THREE.Vector3();
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0.5 : i / (count - 1);
          const fixed = -patchRadius + 2 * patchRadius * t;
          let hasPrev = false;
          for (let j = 0; j < steps; j++) {
            const s = steps === 1 ? 0.5 : j / (steps - 1);
            const a = -patchRadius + 2 * patchRadius * s;
            const u = axis === "u" ? fixed : a;
            const v = axis === "v" ? fixed : a;
            cur.copy(origin).addScaledVector(tangentU, u).addScaledVector(tangentV, v);
            if (hasPrev) {
              positions.push(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z);
            }
            prev.copy(cur);
            hasPrev = true;
          }
        }
        if (!positions.length) {
          mat.dispose();
          return;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        const lines = new THREE.LineSegments(geometry, mat);
        lines.renderOrder = 150;
        group.add(lines);
      };

      addLocalGrid("u", uCount, 0x1f77b4);
      addLocalGrid("v", vCount, 0xff7f0e);
      chartGridCellFaceFactorRef.current = 1;
    }

    chartGridCellsRef.current = cells;
    chartGridRenderableCellIndicesRef.current = renderableCellIndices;
    setSurfaceCellInvalidRows(cells.filter((cell) => !!cell.invalidReason));
    setSurfaceCellDiagnostics({
      validCells: renderableCellIndices.length,
      maskedCells,
      invalidCells: skippedNonFinite + skippedDegenerate + skippedOutOfBounds + maskedCells,
      skippedNonFinite,
      skippedDegenerate,
      skippedOutOfBounds,
      minArea: areaCount ? areaMin : null,
      maxArea: areaCount ? areaMax : null,
      avgArea: areaCount ? areaSum / areaCount : null,
    });
    if (selectedSurfaceCellIndex != null) {
      setSelectedSurfaceCellInfo(cells[selectedSurfaceCellIndex] ?? null);
    }
    if (!cells.length) {
      if (selectedSurfaceCellIndex != null) {
        setSelectedSurfaceCellIndex(null);
        setSelectedSurfaceCellInfo(null);
      }
      if (group.children.length) {
        chartGridRef.current = group;
        scene.add(group);
      } else {
        group.traverse(disposeObject3D);
      }
      return;
    }
    if (!renderableCellIndices.length) {
      if (group.children.length) {
        chartGridRef.current = group;
        scene.add(group);
      } else {
        group.traverse(disposeObject3D);
      }
      return;
    }

    if (edgePositions.length) {
      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x1f2937,
        transparent: true,
        opacity: 0.78,
      });
      const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      edgeLines.renderOrder = 150;
      group.add(edgeLines);
    }

    const fillGeometry = new THREE.BufferGeometry();
    fillGeometry.setAttribute("position", new THREE.Float32BufferAttribute(fillPositions, 3));
    fillGeometry.setIndex(fillIndices);
    const areaSpan = Math.max(1e-9, (areaCount ? areaMax : 0) - (areaCount ? areaMin : 0));
    const colors: number[] = [];
    for (const cellIndex of renderableCellIndices) {
      const cell = cells[cellIndex];
      const t = surfaceCellValuesVisible
        ? Math.min(1, Math.max(0, (cell.area - (areaCount ? areaMin : 0)) / areaSpan))
        : 0;
      const color = surfaceCellValuesVisible
        ? new THREE.Color().setHSL(0.62 - 0.53 * t, 0.86, 0.54)
        : new THREE.Color(0x4f8cff);
      const verts = cell.corners.length;
      for (let k = 0; k < verts; k++) {
        colors.push(color.r, color.g, color.b);
      }
    }
    fillGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const fillMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: surfaceCellValuesVisible ? 0.34 : 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
    fillMesh.renderOrder = 140;
    group.add(fillMesh);

    const pickGeometry = fillGeometry.clone();
    const pickMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.001,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const pickMesh = new THREE.Mesh(pickGeometry, pickMaterial);
    pickMesh.renderOrder = 145;
    group.add(pickMesh);
    chartGridPickMeshRef.current = pickMesh;

    if (surfaceCellCentersVisible) {
      const centerPositions = new Float32Array(renderableCellIndices.length * 3);
      for (let i = 0; i < renderableCellIndices.length; i++) {
        const cell = cells[renderableCellIndices[i]];
        centerPositions[3 * i] = cell.center.x;
        centerPositions[3 * i + 1] = cell.center.y;
        centerPositions[3 * i + 2] = cell.center.z;
      }
      const centerGeometry = new THREE.BufferGeometry();
      centerGeometry.setAttribute("position", new THREE.BufferAttribute(centerPositions, 3));
      const centerMaterial = new THREE.PointsMaterial({
        color: 0x0f172a,
        size: Math.max(0.015, (radiusRef.current || 3) * 0.01),
        sizeAttenuation: true,
        depthWrite: false,
      });
      const centerPoints = new THREE.Points(centerGeometry, centerMaterial);
      centerPoints.renderOrder = 160;
      group.add(centerPoints);
    }

    if (surfaceCellNormalsVisible) {
      const normalScale = Math.max(0.05, (radiusRef.current || 3) * 0.08);
      const normalSegments = new Float32Array(renderableCellIndices.length * 6);
      for (let i = 0; i < renderableCellIndices.length; i++) {
        const cell = cells[renderableCellIndices[i]];
        const p0 = cell.center;
        const p1 = cell.center.clone().addScaledVector(cell.normal, normalScale);
        normalSegments[6 * i] = p0.x;
        normalSegments[6 * i + 1] = p0.y;
        normalSegments[6 * i + 2] = p0.z;
        normalSegments[6 * i + 3] = p1.x;
        normalSegments[6 * i + 4] = p1.y;
        normalSegments[6 * i + 5] = p1.z;
      }
      const normalGeometry = new THREE.BufferGeometry();
      normalGeometry.setAttribute("position", new THREE.BufferAttribute(normalSegments, 3));
      const normalMaterial = new THREE.LineBasicMaterial({
        color: 0x14532d,
        transparent: true,
        opacity: 0.85,
      });
      const normalLines = new THREE.LineSegments(normalGeometry, normalMaterial);
      normalLines.renderOrder = 161;
      group.add(normalLines);
    }

    if (selectedSurfaceCellIndex != null) {
      const selectedCell = cells[selectedSurfaceCellIndex];
      if (selectedCell && selectedCell.corners.length >= 3) {
        const selectedPositions: number[] = [];
        for (const p of selectedCell.corners) {
          selectedPositions.push(p.x, p.y, p.z);
        }
        const selectedGeometry = new THREE.BufferGeometry();
        selectedGeometry.setAttribute("position", new THREE.Float32BufferAttribute(selectedPositions, 3));
        if (selectedCell.corners.length === 4) {
          selectedGeometry.setIndex([0, 1, 2, 0, 2, 3]);
        } else {
          selectedGeometry.setIndex([0, 1, 2]);
        }
        const selectedMaterial = new THREE.MeshBasicMaterial({
          color: 0xf43f5e,
          transparent: true,
          opacity: 0.46,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const selectedMesh = new THREE.Mesh(selectedGeometry, selectedMaterial);
        selectedMesh.renderOrder = 170;
        group.add(selectedMesh);

        const borderPositions: number[] = [];
        const corners = selectedCell.corners;
        for (let i = 0; i < corners.length; i++) {
          const a = corners[i];
          const b = corners[(i + 1) % corners.length];
          borderPositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
        const borderGeometry = new THREE.BufferGeometry();
        borderGeometry.setAttribute("position", new THREE.Float32BufferAttribute(borderPositions, 3));
        const borderMaterial = new THREE.LineBasicMaterial({
          color: 0xbe123c,
          transparent: true,
          opacity: 0.95,
        });
        const borderLines = new THREE.LineSegments(borderGeometry, borderMaterial);
        borderLines.renderOrder = 171;
        group.add(borderLines);
      }
    }

    if (group.children.length) {
      chartGridRef.current = group;
      scene.add(group);
    } else {
      group.traverse(disposeObject3D);
    }
  }, [
    showChartGrid,
    chartGridCountU,
    chartGridCountV,
    surfaceCellCentersVisible,
    surfaceCellNormalsVisible,
    surfaceCellValuesVisible,
    selectedSurfaceCellIndex,
    surfaceId,
    chartGridMode,
    graphDomain?.xSpan,
    graphDomain?.ySpan,
    probePointToken,
    surfaceCellMaskedIds,
    sceneEpoch,
  ]);

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
    const gizmo = viewGizmoRef.current;
    if (gizmo) gizmo.visible = showViewGizmo && showOverlayControls && !gizmoEnabled;
  }, [gizmoEnabled, showViewGizmo, showOverlayControls]);

  /* ---------------- presets storage UI (unchanged logic) ---------------- */

  type GraphPreset = { id: string; label: string; expr: string; createdAt: number };
  type ImplicitPreset = { id: string; label: string; expr: string; createdAt: number };

  const LS_GRAPH_KEY = "mathapp.surfacePresets.graph.v1";
  const LS_IMPLICIT_KEY = "mathapp.surfacePresets.implicit.v1";

  function safeParseArray<T>(raw: string | null): T[] {
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? (v as T[]) : [];
    } catch {
      return [];
    }
  }

  function saveArray(key: string, arr: unknown[]) {
    try {
      localStorage.setItem(key, JSON.stringify(arr));
    } catch {
      // ignore
    }
  }

  function makeId() {
    const c: any = globalThis.crypto;
    return typeof c?.randomUUID === "function" ? c.randomUUID() : `${Date.now()}_${Math.random()}`;
  }

  function autoLabel(expr: string, fallback: string) {
    const s = expr.trim().replace(/\s+/g, " ");
    if (!s) return fallback;
    return s.length <= 28 ? s : s.slice(0, 28) + "…";
  }

  const [graphPresetLabel, setGraphPresetLabel] = useState("");
  const [implicitPresetLabel, setImplicitPresetLabel] = useState("");

  const [graphPresets, setGraphPresets] = useState<GraphPreset[]>([]);
  const [implicitPresets, setImplicitPresets] = useState<ImplicitPreset[]>([]);

  useEffect(() => {
    setGraphPresets(safeParseArray<GraphPreset>(localStorage.getItem(LS_GRAPH_KEY)));
    setImplicitPresets(safeParseArray<ImplicitPreset>(localStorage.getItem(LS_IMPLICIT_KEY)));
  }, []);

  const upsertToDb = async (preset: any) => {
    try {
      const api = (window as any).surfacePresets;
      if (!api) return;
      await api.upsert(preset);
    } catch {
      // ignore
    }
  };

  const removeFromDb = async (id: string) => {
    try {
      const api = (window as any).surfacePresets;
      if (!api) return;
      await api.remove(id);
    } catch {
      // ignore
    }
  };

  const saveGraphPreset = async () => {
    const e = (graphExpr ?? "").trim();
    if (!e) return;

    const p: GraphPreset = {
      id: makeId(),
      label: (graphPresetLabel.trim() || autoLabel(e, "Graph preset")).trim(),
      expr: e,
      createdAt: Date.now(),
    };

    const next = [p, ...graphPresets];
    setGraphPresets(next);
    saveArray(LS_GRAPH_KEY, next);
    setGraphPresetLabel("");

    await upsertToDb({
      id: p.id,
      kind: "graph",
      label: p.label,
      expr: p.expr,
      createdAt: p.createdAt,
      updatedAt: Date.now(),
    });
  };

  const loadGraphPreset = (p: GraphPreset) => {
    onSetGraphExpr?.(p.expr);
  };

  const deleteGraphPreset = async (id: string) => {
    const next = graphPresets.filter((p) => p.id !== id);
    setGraphPresets(next);
    saveArray(LS_GRAPH_KEY, next);
    await removeFromDb(id);
  };

  const loadImplicitPreset = (p: ImplicitPreset) => {
    onSetImplicitExpr?.(p.expr);
  };

  const saveImplicitPreset = async () => {
    const e = (implicitExpr ?? "").trim();
    if (!e) return;

    const p: ImplicitPreset = {
      id: makeId(),
      label: (implicitPresetLabel.trim() || autoLabel(e, "Implicit preset")).trim(),
      expr: e,
      createdAt: Date.now(),
    };

    const next = [p, ...implicitPresets];
    setImplicitPresets(next);
    saveArray(LS_IMPLICIT_KEY, next);
    setImplicitPresetLabel("");

    await upsertToDb({
      id: p.id,
      kind: "implicit",
      label: p.label,
      expr: p.expr,
      createdAt: p.createdAt,
      updatedAt: Date.now(),
    });
  };

  const duplicateImplicitPreset = async (src: ImplicitPreset) => {
    const copy: ImplicitPreset = {
      id: makeId(),
      label: (src.label ? `${src.label} (copy)` : "Copy").trim(),
      expr: src.expr,
      createdAt: Date.now(),
    };

    const next = [copy, ...implicitPresets];
    setImplicitPresets(next);
    saveArray(LS_IMPLICIT_KEY, next);

    await upsertToDb({
      id: copy.id,
      kind: "implicit",
      label: copy.label,
      expr: copy.expr,
      createdAt: copy.createdAt,
      updatedAt: Date.now(),
    });
  };

  const deleteImplicitPreset = async (id: string) => {
    if (!confirm("Delete this preset?")) return;

    const next = implicitPresets.filter((p) => p.id !== id);
    setImplicitPresets(next);
    saveArray(LS_IMPLICIT_KEY, next);

    await removeFromDb(id);
  };

  const isGraphSurface = isGraphId(surfaceId);
  const isImplicitSurface = isImplicitId(surfaceId);
  const sliceUiEnabled = isGraphSurface || isImplicitSurface;
  const sliceExportEnabled = slicePlaneEnabled && slicePolylines2D.length > 0;
  const sliceOffsetRange = isGraphSurface
    ? Math.max(1, graphDomain?.xSpan ?? 1.5, graphDomain?.ySpan ?? 1.5)
    : Math.max(1, radiusRef.current || 3);
  const sliceSizeMax = Math.max(2, sliceOffsetRange * 2.5);
  const sliceThetaDeg = toDeg(slicePlaneTheta);
  const slicePhiDeg = toDeg(slicePlanePhi);
  const slicePreviewSpan = Math.max(0.5, slicePlaneSize * 0.5);
  const sliceHoverInfo = (() => {
    const st = sliceHoverReadout ?? sliceHoverSnap ?? sliceHoverST;
    const frame = sliceFrameRef.current;
    if (!slicePlaneEnabled || !st || !frame) return null;
    const world = frame.x0
      .clone()
      .add(frame.e1.clone().multiplyScalar(st.s))
      .add(frame.e2.clone().multiplyScalar(st.t));
    return { st, world };
  })();
  const selectedSurfaceCellMasked = !!(
    selectedSurfaceCellInfo && surfaceCellMaskedIds.has(selectedSurfaceCellInfo.id)
  );
  const showProbeHud = probeEnabled && probeHudLines.length > 0;
  const presetButtonStyle = (active: boolean) => ({
    padding: "2px 8px",
    borderRadius: 6,
    border: "1px solid #cfd6df",
    background: active ? "#dbe7ff" : "#f2f4f7",
    fontSize: 11,
    cursor: "pointer",
  });

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        pointerEvents: suspendPointerInteractions ? "none" : "auto",
      }}
    >
      <div
        ref={mountRef}
        data-testid="surface-viewer-canvas-host"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          pointerEvents: suspendPointerInteractions ? "none" : "auto",
        }}
      />

      {showOverlayControls && (sliceUiEnabled || showChartGrid || !!onToggleGaussMap) && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 20,
            borderRadius: 8,
            background: "rgba(255,255,255,0.92)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 11,
            minWidth: 180,
          }}
        >
          {sliceUiEnabled && (
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={slicePlaneEnabled}
                onChange={(e) => setSlicePlaneEnabled(e.target.checked)}
              />
              <span>Slice plane</span>
            </label>
          )}

          {sliceUiEnabled && slicePlaneEnabled && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={lockToSlicePlane}
                  onChange={(e) => setLockToSlicePlane(e.target.checked)}
                />
                <span>Lock view to plane</span>
              </label>

              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  style={presetButtonStyle(slicePlanePreset === "xy")}
                  onClick={() => applySlicePreset("xy")}
                >
                  XY
                </button>
                <button
                  type="button"
                  style={presetButtonStyle(slicePlanePreset === "yz")}
                  onClick={() => applySlicePreset("yz")}
                >
                  YZ
                </button>
                <button
                  type="button"
                  style={presetButtonStyle(slicePlanePreset === "xz")}
                  onClick={() => applySlicePreset("xz")}
                >
                  XZ
                </button>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Theta</span>
                <span>{sliceThetaDeg.toFixed(0)} deg</span>
              </div>
              <input
                type="range"
                min={0}
                max={180}
                step={1}
                value={sliceThetaDeg}
                onChange={(e) => {
                  setSlicePlaneTheta(toRad(Number(e.target.value)));
                  setSlicePlanePreset("custom");
                }}
              />

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Phi</span>
                <span>{slicePhiDeg.toFixed(0)} deg</span>
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={slicePhiDeg}
                onChange={(e) => {
                  setSlicePlanePhi(toRad(Number(e.target.value)));
                  setSlicePlanePreset("custom");
                }}
              />

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Offset</span>
                <span>{slicePlaneOffset.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={-sliceOffsetRange}
                max={sliceOffsetRange}
                step={0.01}
                value={slicePlaneOffset}
                onChange={(e) => setSlicePlaneOffset(Number(e.target.value))}
              />

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Plane size</span>
                <span>{slicePlaneSize.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={sliceSizeMax}
                step={0.05}
                value={slicePlaneSize}
                onChange={(e) => setSlicePlaneSize(Number(e.target.value))}
              />

              <Slice2DPreview
                enabled={slicePlaneEnabled}
                planeSize={slicePreviewSpan}
                polylines={slicePolylines2D}
                onHover={setSliceHoverST}
                onClickST={(pt) => {
                  const frame = sliceFrameRef.current ?? buildSliceFrame();
                  const xclick = frame.x0
                    .clone()
                    .add(frame.e1.clone().multiplyScalar(pt.s))
                    .add(frame.e2.clone().multiplyScalar(pt.t));
                  const newOffset = frame.n.dot(xclick);
                  setSlicePlaneOffset(newOffset);
                }}
              />

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={handleExportCsv} disabled={!sliceExportEnabled}>
                  Export CSV
                </button>
                <button type="button" onClick={handleExportSvg} disabled={!sliceExportEnabled}>
                  Export SVG
                </button>
                <button type="button" onClick={handleCopySliceJson} disabled={!sliceExportEnabled}>
                  Copy JSON
                </button>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                <input
                  type="checkbox"
                  checked={sliceSnapToCurve}
                  onChange={(e) => setSliceSnapToCurve(e.target.checked)}
                />
                <span>Snap hover to curve</span>
              </label>

            </>
          )}
          {onToggleGaussMap && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input type="checkbox" checked={gaussMapEnabled} onChange={onToggleGaussMap} />
              <span>Show Gauss map (S²)</span>
            </label>
          )}
          {showChartGrid && chartGridMode === "mesh-face" && !isGraphId(surfaceId) && (
            <div
              style={{
                marginTop: 2,
                paddingTop: 8,
                borderTop: "1px solid rgba(148,163,184,0.45)",
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
                Surface decomposition
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={surfaceCellSelectionEnabled}
                  onChange={(e) => setSurfaceCellSelectionEnabled(e.target.checked)}
                />
                <span>Selectable cells</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={surfaceCellCentersVisible}
                  onChange={(e) => setSurfaceCellCentersVisible(e.target.checked)}
                />
                <span>Cell centers</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={surfaceCellNormalsVisible}
                  onChange={(e) => setSurfaceCellNormalsVisible(e.target.checked)}
                />
                <span>Cell normals</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={surfaceCellValuesVisible}
                  onChange={(e) => setSurfaceCellValuesVisible(e.target.checked)}
                />
                <span>Per-cell area values</span>
              </label>
              {selectedSurfaceCellInfo && (
                <div
                  style={{
                    fontSize: 10,
                    lineHeight: 1.35,
                    color: "#334155",
                    background: "rgba(241,245,249,0.85)",
                    border: "1px solid rgba(148,163,184,0.35)",
                    borderRadius: 6,
                    padding: "6px 8px",
                  }}
                >
                  {selectedSurfaceCellInfo.kind === "graph" &&
                  selectedSurfaceCellInfo.i != null &&
                  selectedSurfaceCellInfo.j != null
                    ? `Cell [${selectedSurfaceCellInfo.i}, ${selectedSurfaceCellInfo.j}]  area=${
                        Number.isFinite(selectedSurfaceCellInfo.area)
                          ? selectedSurfaceCellInfo.area.toFixed(4)
                          : "nan"
                      }`
                    : `Cell area=${
                        Number.isFinite(selectedSurfaceCellInfo.area)
                          ? selectedSurfaceCellInfo.area.toFixed(4)
                          : "nan"
                      }`}
                  {selectedSurfaceCellInfo.invalidReason
                    ? `  invalid=${selectedSurfaceCellInfo.invalidReason}`
                    : ""}
                  {selectedSurfaceCellMasked ? "  masked" : ""}
                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={{ padding: "2px 6px", fontSize: 10 }}
                      onClick={() =>
                        setSurfaceCellMaskedIds((prev) => {
                          const next = new Set(prev);
                          if (selectedSurfaceCellMasked) next.delete(selectedSurfaceCellInfo.id);
                          else next.add(selectedSurfaceCellInfo.id);
                          return next;
                        })
                      }
                    >
                      {selectedSurfaceCellMasked ? "Unmask cell" : "Mask cell"}
                    </button>
                    <button
                      type="button"
                      style={{ padding: "2px 6px", fontSize: 10 }}
                      onClick={() => setSurfaceCellMaskedIds(new Set())}
                      disabled={surfaceCellDiagnostics.maskedCells === 0}
                    >
                      Clear masks
                    </button>
                  </div>
                </div>
              )}
              <div
                style={{
                  fontSize: 10,
                  lineHeight: 1.35,
                  color: "#334155",
                  background: "rgba(248,250,252,0.9)",
                  border: "1px solid rgba(148,163,184,0.3)",
                  borderRadius: 6,
                  padding: "6px 8px",
                }}
              >
                <div>Valid cells: {surfaceCellDiagnostics.validCells}</div>
                <div>
                  Invalid cells: {surfaceCellDiagnostics.invalidCells}
                  {" "}
                  (non-finite {surfaceCellDiagnostics.skippedNonFinite}, degenerate{" "}
                  {surfaceCellDiagnostics.skippedDegenerate}, out-of-bounds{" "}
                  {surfaceCellDiagnostics.skippedOutOfBounds}, masked {surfaceCellDiagnostics.maskedCells})
                </div>
                <div>
                  Area min/avg/max:{" "}
                  {surfaceCellDiagnostics.minArea == null
                    ? "—"
                    : `${surfaceCellDiagnostics.minArea.toFixed(4)} / ${(
                        surfaceCellDiagnostics.avgArea ?? 0
                      ).toFixed(4)} / ${(
                        surfaceCellDiagnostics.maxArea ?? 0
                      ).toFixed(4)}`}
                </div>
              </div>
              {surfaceCellInvalidRows.length > 0 && (
                <div
                  style={{
                    maxHeight: 150,
                    overflowY: "auto",
                    border: "1px solid rgba(148,163,184,0.3)",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.92)",
                    padding: "4px 6px",
                    display: "grid",
                    gap: 4,
                  }}
                >
                  {surfaceCellInvalidRows.slice(0, 40).map((row) => {
                    const cellIndex = chartGridCellsRef.current.indexOf(row);
                    const label = row.triangleIndex != null ? `tri ${row.triangleIndex}` : row.id;
                    return (
                      <div
                        key={`${row.id}:${row.invalidReason ?? "invalid"}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 6,
                          alignItems: "center",
                          fontSize: 10,
                          color: "#334155",
                        }}
                      >
                        <span>
                          {label} · {row.invalidReason}
                        </span>
                        <button
                          type="button"
                          style={{ padding: "1px 6px", fontSize: 10 }}
                          onClick={() => {
                            if (cellIndex >= 0) {
                              setSelectedSurfaceCellIndex(cellIndex);
                              setSelectedSurfaceCellInfo(row);
                            }
                          }}
                        >
                          Jump
                        </button>
                      </div>
                    );
                  })}
                  {surfaceCellInvalidRows.length > 40 && (
                    <div style={{ fontSize: 10, color: "#64748b" }}>
                      Showing first 40 invalid rows.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {sliceHoverInfo && slicePlaneEnabled && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            zIndex: 30,
            width: "52ch",
            height: 44,
            padding: "8px 12px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.96)",
            border: "1px solid rgba(0,0,0,0.12)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.14)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
            fontSize: 13,
            lineHeight: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            color: "#2f3a45",
          }}
        >
          {(() => {
            const fmt = (v: number) => v.toFixed(2).padStart(6, " ");
            return `Slice hover: s ${fmt(sliceHoverInfo.st.s)}, t ${fmt(sliceHoverInfo.st.t)} | X (${fmt(sliceHoverInfo.world.x)}, ${fmt(sliceHoverInfo.world.y)}, ${fmt(sliceHoverInfo.world.z)})`;
          })()}
        </div>
      )}

      {showProbeHud && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 12,
            transform: "translateX(-50%)",
            zIndex: 32,
            width: "min(84vw, 760px)",
            padding: "8px 12px",
            borderRadius: 12,
            background: "rgba(15,23,42,0.82)",
            border: "1px solid rgba(148,163,184,0.85)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.24)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            color: "#f8fafc",
            fontFamily: PROBE_HUD_FONT_FAMILY,
            fontSize: 12,
            lineHeight: 1.3,
            pointerEvents: "none",
          }}
        >
          {probeHudLines.map((line, idx) => (
            <div key={`${idx}-${line}`}>{line}</div>
          ))}
        </div>
      )}

      {showOverlayControls && showViewGizmo && (
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            borderRadius: 11,
            background: "linear-gradient(150deg, rgba(250,252,255,0.95), rgba(226,236,247,0.92))",
            border: "1px solid rgba(134,153,179,0.52)",
            boxShadow: "0 10px 18px rgba(30,45,70,0.16), inset 0 1px 1px rgba(255,255,255,0.8)",
            padding: "7px 7px 6px",
            display: "flex",
            flexDirection: "column",
            gap: 5,
            width: 152,
            fontFamily: "\"Avenir Next\", \"Segoe UI\", \"Trebuchet MS\", \"Noto Sans\", sans-serif",
            color: "#233042",
            backdropFilter: "blur(5px)",
            userSelect: "none",
          }}
        >
          <div
            style={{
              padding: "0 2px",
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              fontWeight: 700,
              color: "#6a7483",
              opacity: 0.9,
            }}
          >
            View
          </div>
          <AxisGizmo
            size={138}
            getMainCamera={() => cameraRef.current}
            onSelectView={(view) => {
              setViewMode(view);
              setViewGizmoMenuOpen(false);
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              position: "relative",
            }}
          >
            <button
              type="button"
              title={lockToAxisPlane ? "Unlock axis view" : "Lock view to axis"}
              aria-label={lockToAxisPlane ? "Unlock axis view" : "Lock view to axis"}
              aria-pressed={lockToAxisPlane}
              onClick={() => setLockToAxisPlane((v) => !v)}
              style={{
                width: 31,
                height: 28,
                borderRadius: 7,
                border: "1px solid " + (lockToAxisPlane ? "#2962d9" : "rgba(128,146,171,0.58)"),
                background: lockToAxisPlane ? "rgba(227,239,255,0.95)" : "rgba(255,255,255,0.87)",
                color: lockToAxisPlane ? "#1d4ed8" : "#495669",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <LockGlyph locked={lockToAxisPlane} />
            </button>
            <button
              type="button"
              title="Reset camera"
              aria-label="Reset camera"
              onClick={handleResetCameraFromGizmo}
              style={{
                width: 31,
                height: 28,
                borderRadius: 7,
                border: "1px solid rgba(128,146,171,0.58)",
                background: "rgba(255,255,255,0.87)",
                color: "#495669",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <ResetGlyph />
            </button>
            <button
              type="button"
              title={viewGizmoMenuOpen ? "Close view menu" : "Open view menu"}
              aria-label={viewGizmoMenuOpen ? "Close view menu" : "Open view menu"}
              aria-haspopup="menu"
              aria-expanded={viewGizmoMenuOpen}
              onClick={() => setViewGizmoMenuOpen((open) => !open)}
              style={{
                marginLeft: "auto",
                width: 31,
                height: 28,
                borderRadius: 7,
                border: "1px solid " + (viewGizmoMenuOpen ? "#2962d9" : "rgba(128,146,171,0.58)"),
                background: viewGizmoMenuOpen ? "rgba(227,239,255,0.95)" : "rgba(255,255,255,0.87)",
                color: viewGizmoMenuOpen ? "#1d4ed8" : "#495669",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <MenuGlyph />
            </button>
            {viewGizmoMenuOpen && (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: 34,
                  zIndex: 20,
                  minWidth: 88,
                  padding: 4,
                  borderRadius: 8,
                  background: "rgba(248,251,255,0.97)",
                  border: "1px solid rgba(132,149,173,0.62)",
                  boxShadow: "0 8px 16px rgba(23,37,64,0.2)",
                  display: "grid",
                  gap: 2,
                }}
              >
                {GIZMO_MENU_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => applyNamedGizmoView(item.id)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid transparent",
                      background: "transparent",
                      color: "#334155",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {(surfaceId === "graph_custom" || surfaceId === "implicit_custom") && (
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            borderRadius: 8,
            background: "rgba(255,255,255,0.92)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 12,
            maxWidth: 360,
          }}
        >
          {surfaceId === "graph_custom" && (
            <>
              <div style={{ fontWeight: 600 }}>Graph presets</div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={graphPresetLabel}
                  onChange={(e) => setGraphPresetLabel(e.target.value)}
                  placeholder="Preset name (optional)"
                  style={{ flex: 1, padding: "6px 8px" }}
                />
                <button onClick={() => void saveGraphPreset()} disabled={!(graphExpr ?? "").trim()}>
                  Save
                </button>
              </div>

              {graphPresets.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {graphPresets.map((p) => (
                    <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button onClick={() => loadGraphPreset(p)} disabled={!onSetGraphExpr} title={p.expr}>
                        {p.label}
                      </button>
                      <button onClick={() => void deleteGraphPreset(p.id)} title="Delete preset">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {surfaceId === "implicit_custom" && (
            <>
              <div style={{ fontWeight: 600 }}>Implicit presets</div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={implicitPresetLabel}
                  onChange={(e) => setImplicitPresetLabel(e.target.value)}
                  placeholder="Preset name (optional)"
                  style={{ flex: 1, padding: "6px 8px" }}
                />
                <button onClick={() => void saveImplicitPreset()} disabled={!(implicitExpr ?? "").trim()}>
                  Save
                </button>
              </div>

              <div style={{ maxHeight: 320, overflow: "auto", paddingRight: 4 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {implicitPresets.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 10px",
                        borderRadius: 10,
                        background: "#f6f7f9",
                        border: "1px solid #eceef2",
                      }}
                    >
                      <div
                        style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                        title={p.expr}
                        onClick={() => loadImplicitPreset(p)}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.15 }}>
                          {p.label || "(unnamed)"}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.8,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            marginTop: 2,
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                          }}
                        >
                          {p.expr}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => loadImplicitPreset(p)} disabled={!onSetImplicitExpr}>
                          Load
                        </button>
                        <button onClick={() => void duplicateImplicitPreset(p)}>Duplicate</button>
                        <button onClick={() => void deleteImplicitPreset(p.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {surfaceId === "graph_custom" && graphCompileError && (
        <div
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            zIndex: 50,
            maxWidth: 420,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(220,60,40,0.15)",
            border: "1px solid rgba(220,60,40,0.45)",
            color: "#7a1d14",
            fontSize: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            whiteSpace: "pre-wrap",
            pointerEvents: "none",
          }}
        >
          {graphCompileError}
        </div>
      )}

      {surfaceId === "implicit_custom" && implicitCompileError && (
        <div
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            zIndex: 50,
            maxWidth: 420,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(220,60,40,0.15)",
            border: "1px solid rgba(220,60,40,0.45)",
            color: "#7a1d14",
            fontSize: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            whiteSpace: "pre-wrap",
            pointerEvents: "none",
          }}
        >
          {implicitCompileError}
        </div>
      )}
    </div>
  );
};
