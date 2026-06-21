// src/components/ParamSurfaceViewer.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ParametricGeometry } from "three/examples/jsm/geometries/ParametricGeometry.js";

import DomainDirectionPicker from "./DomainDirectionPicker";
import { integrateGeodesic } from "../math/geodesic";
import type { ParamGeodesicState } from "../math/paramGeodesicContinuous";
import {
  computePrincipalCurvatureAtUV,
  type PrincipalCurvatureResult,
  type PrincipalCurvatureScalars,
} from "../math/principalCurvature";
import { integratePrincipalStreamlineBidirectional, stabilizePrincipalResult } from "../math/principalStreamlines";
import { stabilizeTangentDirection } from "../math/curvatureDirections";
import { buildStreamlineSegments, buildVertexAdjacency, traceStreamlineBidirectional } from "../math/curvatureLines";
import { buildVertexAdjacency as buildRidgeAdjacency, detectRidgeValleySegments } from "../math/ridgeValley";
import { stitchRidgeValleyCurves } from "../math/ridgeValleyStitch";
import { marchingSquares } from "../math/marchingSquares";
import {
  buildWeierstrassSurface,
  type WeierstrassBuildResult,
  type WeierstrassDriftResult,
} from "../math/weierstrass";
import {
  buildRotationalSurfaceEvaluator,
  type RotationalProfileMode,
} from "../math/rotationalSurface";
import {
  buildSplineSurfacePointEvaluator,
  type SplineSurfaceSettings,
} from "../math/splineSurface";

import type {
  ColorMode,
  CameraTourCommand,
  CameraTourEvent,
  CameraTourMode,
  ProbeInfo,
  RenderQuality,
  SceneBackgroundMode,
  SliceNormal,
  SlicePreset,
  OverlayPolylineGroup,
  OverlayPointSet,
  ViewportDebugSnapshot,
} from "./SurfaceViewer";
import AxisGizmo from "./AxisGizmo";
import { Slice2DPreview } from "./Slice2DPreview";
import type { ColorPalette } from "./colorPalette";
import type { GaussPoint } from "./gaussMapUtils";
import {
  buildChartCellId,
  computeChartGridDiagnostics,
  type ChartGridDiagnostics,
} from "../math/chartGridDiagnostics";
import {
  buildSurfaceSampleSetFromViewer,
  getNonIndexedDrawCount,
  type SurfaceSample,
  type SurfaceSampleSet,
} from "../math/sampling/surfaceSampling";
import type { SelectionMask } from "../math/selection/selectionModel";
import type { PolylineSet } from "../scene/renderPrimitives";
import {
  createLayeredReferenceGrid,
  DEFAULT_REFERENCE_PLANE_GRID_SETTINGS,
  type ReferencePlaneGridSettings,
} from "@math3d/renderer-web";
import type { ParamSurfaceId as CoreParamSurfaceId } from "@math3d/core";
import {
  installWebGLContextLogger,
  isNoWebGLMode,
  isVmSafeGraphicsMode,
  vmSafePixelRatio,
  vmSafeRendererParams,
} from "./graphicsMode";
import { NoWebGLPanel } from "./NoWebGLPanel";
import { registerThreeResourceDiagnostics } from "./threeResourceDiagnostics";

type ParamPreset = {
  id: string;
  label: string;
  xExpr: string;
  yExpr: string;
  zExpr: string;
  createdAt: number;
};

const IDLE_RENDER_MIN_FRAME_MS = 1000 / 2;
const VM_SAFE_IDLE_RENDER_MIN_FRAME_MS = 5000;
type SurfaceCellData = {
  id: string;
  i: number;
  j: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  seamU: boolean;
  seamV: boolean;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  area: number;
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
};
const LS_PARAM_KEY = "mathapp.surfacePresets.param.v1";
const TAU = Math.PI * 2;
type ParamDomain = { uMin: number; uMax: number; vMin: number; vMax: number };
type CameraSyncState = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
};

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = globalThis.crypto;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : `${Date.now()}_${Math.random()}`;
}

function autoLabel3(x: string, y: string, z: string) {
  const s = `${x.trim()} | ${y.trim()} | ${z.trim()}`.replace(/\s+/g, " ");
  if (!s.trim()) return "Param preset";
  return s.length <= 28 ? s : s.slice(0, 28) + "…";
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

type ProbeLabelSprite = {
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
};

const PROBE_LABEL_FONT =
  "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

const formatProbeNumber = (value: number) => (Number.isFinite(value) ? value.toFixed(3) : "nan");

const createProbeLabelSprite = (): ProbeLabelSprite | null => {
  const width = 512;
  const height = 104;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.7, 0.36, 1);
  sprite.renderOrder = 490;
  sprite.visible = false;
  return { sprite, texture, ctx, width, height };
};

const drawProbeLabelSprite = (label: ProbeLabelSprite, lines: string[]) => {
  const { ctx, texture, width, height } = label;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(15,23,42,0.82)";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(148,163,184,0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  ctx.font = PROBE_LABEL_FONT;
  ctx.fillStyle = "#f8fafc";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const lineHeight = 30;
  const startY = 24;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 12, startY + i * lineHeight);
  }
  texture.needsUpdate = true;
};

export type ParamSurfaceId = CoreParamSurfaceId;

type Props = {
  surfaceId: ParamSurfaceId;
  customX?: string;
  customY?: string;
  customZ?: string;
  rotationalProfileMode?: RotationalProfileMode;
  rotationalProfileRExpr?: string;
  rotationalProfileZExpr?: string;
  rotationalProfilePointsText?: string;
  rotationalAxisOrigin?: { x: number; y: number; z: number };
  rotationalAxisDirection?: { x: number; y: number; z: number };
  rmfRibbonTwistEnabled?: boolean;
  rmfRibbonTwistTurns?: number;
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
  paramResolution?: number;
  colorMode?: ColorMode;
  colorPalette?: ColorPalette;
  showChartGrid?: boolean;
  chartGridMode?: "local" | "mesh-face";
  onSurfaceCellSelectionEnabledChange?: (enabled: boolean) => void;
  chartGridCountU?: number;
  chartGridCountV?: number;
  paramDomain?: ParamDomain;
  splineSettings?: SplineSurfaceSettings;
  weierstrassGExpr?: string;
  weierstrassPhiExpr?: string;
  weierstrassResolution?: number;
  weierstrassRecenter?: boolean;
  weierstrassDiagnostics?: WeierstrassDriftResult | null;
  showDriftArrow?: boolean;
  onWeierstrassError?: (message: string | null) => void;
  onWeierstrassPathDisagreement?: (data: { avg: number; max: number } | null) => void;
  isCameraLeader?: boolean;
  cameraSync?: CameraSyncState | null;
  onCameraSync?: (state: CameraSyncState) => void;
  cameraOverride?: CameraSyncState | null;
  cameraOverrideToken?: number;
  renderQuality?: RenderQuality;
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
  geodesicPathSmooth?: boolean;
  geodesicPathDebug?: boolean;
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
  overlayPolylineGroups?: OverlayPolylineGroup[] | null;
  overlayPointSets?: OverlayPointSet[] | null;
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
    uv?: { u: number; v: number };
    xy?: { x: number; y: number };
  }) => void;
  inspectPoint?: { x: number; y: number; z: number } | null;
  selectionOverlayVisible?: boolean;
  selectionOverlayOnTop?: boolean;
  selectionSphere?: { center: { x: number; y: number; z: number }; radius: number } | null;
  zoomToRegion?: boolean;
  zoomToRegionToken?: number;
  windowReframeToken?: number;
  reframePaddingFactor?: number;
  onViewportDebug?: (snapshot: ViewportDebugSnapshot) => void;
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
  onParamCurvature?: (data: PrincipalCurvatureScalars | null) => void;

  paramProbeUV?: { u: number; v: number } | null;
  paramProbeToken?: number;

  sliceEnabled?: boolean;
  slicePreset?: SlicePreset;
  sliceOffset?: number;
  sliceNormal?: SliceNormal;
  sliceShowPlane?: boolean;
  sliceShowSheet?: boolean;
  sliceThickness?: number;
  slicePlanes?: { preset: SlicePreset; offset: number; normal: SliceNormal }[];
  sliceLineColorMode?: "solid" | "height" | "arclen";
  sliceLinePalette?: ColorPalette;
  sliceSheetOpacity?: number;

  onSetCustomX?: (expr: string) => void;
  onSetCustomY?: (expr: string) => void;
  onSetCustomZ?: (expr: string) => void;
  onParamGeodesicState?: (state: ParamGeodesicState | null) => void;
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

// ---------- safe expression for custom σ(u,v) ----------
function makeSafeParamExpr(
  expr: string | undefined,
  fallback: (u: number, v: number) => number
): (u: number, v: number) => number {
  const trimmed = (expr ?? "").trim();
  if (!trimmed) return fallback;

  let compiled: (u: number, v: number, pi: number, e: number, PI: number, E: number) => number;
  try {
    compiled = new Function(
      "u",
      "v",
      "pi",
      "e",
      "PI",
      "E",
      `
      const {
        sin, cos, tan, asin, acos, atan,
        sinh, cosh, tanh,
        exp, log, sqrt, abs, pow
      } = Math;
      return (${trimmed});
    `
    ) as (u: number, v: number, pi: number, e: number, PI: number, E: number) => number;
  } catch {
    return () => NaN;
  }

  return (u: number, v: number) => {
    try {
      const val = compiled(u, v, Math.PI, Math.E, Math.PI, Math.E);
      return Number.isFinite(val) ? val : NaN;
    } catch {
      return NaN;
    }
  };
}

// per-surface parameter domain
function getDomain(surfaceId: ParamSurfaceId) {
  switch (surfaceId) {
    case "plane":
    case "hyperbolicParaboloid":
    case "enneper":
      return { uMin: -2, uMax: 2, vMin: -2, vMax: 2 };

    case "bezierSurface":
    case "bSplineSurface":
    case "nurbsSurface":
      return { uMin: 0, uMax: 1, vMin: 0, vMax: 1 };

    case "paraboloid":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0, vMax: 2 };

    case "cylinder":
    case "cone":
    case "helicoid":
    case "catenoid":
      return { uMin: -Math.PI, uMax: Math.PI, vMin: -2, vMax: 2 };

    case "rotationalDevelopable":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -1.8, vMax: 1.8 };

    case "rotationalGraph":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2, vMax: 2 };

    case "rotationalBell":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2.4, vMax: 2.4 };

    case "rotationalHyperboloid":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -1.2, vMax: 1.2 };

    case "rotationalFreeProfile":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2, vMax: 2 };

    case "sphere":
    case "rotationalSpheroid":
    case "ellipsoid":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0, vMax: Math.PI };

    case "torus":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0, vMax: 2 * Math.PI };

    case "mobius":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -1, vMax: 1 };

    case "kleinBottle":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0, vMax: 2 * Math.PI };

    case "pseudosphere":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0, vMax: 2.6 };

    case "dini":
      return { uMin: 0, uMax: 4 * Math.PI, vMin: 0.25, vMax: 1.35 };

    case "twistedStrip":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -0.6, vMax: 0.6 };
    case "sweepLinearExtrusion":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2, vMax: 2 };
    case "sweepDirectional":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2, vMax: 2 };
    case "sweepPath":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2.5, vMax: 2.5 };
    case "sweepHelical":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0, vMax: 4 * Math.PI };
    case "sweepScaled":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2.5, vMax: 2.5 };
    case "sweepTwisted":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2.2, vMax: 2.2 };
    case "ribbonRMF":
      return { uMin: -1, uMax: 1, vMin: -2.5, vMax: 2.5 };
    case "tubeConstant":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2, vMax: 2 };
    case "tubeVariable":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -2.5, vMax: 2.5 };
    case "tubeClosed":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0, vMax: 2 * Math.PI };
    case "tubeOpen":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -1.2, vMax: 1.2 };

    // Exponential cone/funnel: u is angle, v is profile input (v>0).
    case "expCone":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0.15, vMax: 2.8 };

    // ✅ NEW: τ(u,v)=(u cos v, u sin v, v)
    // v is BOTH angle and height, so we DO NOT wrap it (no identification); just choose a few turns
    case "helicoidUV":
      return { uMin: 0, uMax: 1.8, vMin: 0, vMax: 6 * Math.PI };
    case "boy":
      return { uMin: 0, uMax: Math.PI, vMin: 0, vMax: Math.PI };
    case "weierstrass":
      return { uMin: -1, uMax: 1, vMin: -1, vMax: 1 };

    case "custom":
    default:
      return { uMin: -Math.PI, uMax: Math.PI, vMin: -2, vMax: 2 };
  }
}

const buildRmfRibbonSampler = (options: {
  vMin: number;
  vMax: number;
  twistEnabled: boolean;
  twistTurns: number;
  sampleCount?: number;
}) => {
  const { vMin, vMax, twistEnabled, twistTurns } = options;
  const sampleCount = Math.max(24, Math.floor(options.sampleCount ?? 160));
  const vRange = Math.max(1e-6, vMax - vMin);
  const vs = new Float64Array(sampleCount);
  const centers = new Array<THREE.Vector3>(sampleCount);
  const tangents = new Array<THREE.Vector3>(sampleCount);
  const normals = new Array<THREE.Vector3>(sampleCount);
  const binormals = new Array<THREE.Vector3>(sampleCount);

  const centerAt = (v: number, out: THREE.Vector3) => {
    out.set(0.95 * Math.cos(0.6 * v), 0.45 * Math.sin(1.05 * v), v);
    return out;
  };

  const tangentAt = (v: number, out: THREE.Vector3) => {
    const h = Math.max(1e-3, vRange * 1e-3);
    const pa = new THREE.Vector3();
    const pb = new THREE.Vector3();
    centerAt(v + h, pa);
    centerAt(v - h, pb);
    out.copy(pa).sub(pb);
    if (out.lengthSq() < 1e-12) out.set(0, 0, 1);
    return out.normalize();
  };

  for (let i = 0; i < sampleCount; i++) {
    const t = sampleCount > 1 ? i / (sampleCount - 1) : 0;
    const v = vMin + vRange * t;
    vs[i] = v;
    centers[i] = new THREE.Vector3();
    tangents[i] = new THREE.Vector3();
    centerAt(v, centers[i]);
    tangentAt(v, tangents[i]);
    normals[i] = new THREE.Vector3();
    binormals[i] = new THREE.Vector3();
  }

  const helper = Math.abs(tangents[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  normals[0].copy(helper).addScaledVector(tangents[0], -helper.dot(tangents[0]));
  if (normals[0].lengthSq() < 1e-12) normals[0].set(1, 0, 0);
  normals[0].normalize();
  binormals[0].crossVectors(tangents[0], normals[0]).normalize();

  const axis = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (let i = 1; i < sampleCount; i++) {
    const tPrev = tangents[i - 1];
    const tCurr = tangents[i];
    const nCurr = normals[i];
    const bCurr = binormals[i];

    nCurr.copy(normals[i - 1]);
    axis.crossVectors(tPrev, tCurr);
    const axisLen = axis.length();
    if (axisLen > 1e-9) {
      const dot = THREE.MathUtils.clamp(tPrev.dot(tCurr), -1, 1);
      q.setFromAxisAngle(axis.multiplyScalar(1 / axisLen), Math.atan2(axisLen, dot));
      nCurr.applyQuaternion(q);
    }
    nCurr.addScaledVector(tCurr, -nCurr.dot(tCurr));
    if (nCurr.lengthSq() < 1e-12) {
      const aux = Math.abs(tCurr.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      nCurr.copy(aux).addScaledVector(tCurr, -aux.dot(tCurr));
    }
    nCurr.normalize();
    bCurr.crossVectors(tCurr, nCurr).normalize();
  }

  const c = new THREE.Vector3();
  const t = new THREE.Vector3();
  const n = new THREE.Vector3();
  const b = new THREE.Vector3();
  const side = new THREE.Vector3();
  const halfWidth = 0.32;
  const twistTurnsSafe = Number.isFinite(twistTurns) ? twistTurns : 1;

  return (u: number, v: number, target: THREE.Vector3) => {
    const vc = THREE.MathUtils.clamp(v, vMin, vMax);
    const s = ((vc - vMin) / vRange) * (sampleCount - 1);
    const i0 = Math.max(0, Math.min(sampleCount - 1, Math.floor(s)));
    const i1 = Math.max(i0, Math.min(sampleCount - 1, i0 + 1));
    const w = THREE.MathUtils.clamp(s - i0, 0, 1);

    c.copy(centers[i0]).lerp(centers[i1], w);
    t.copy(tangents[i0]).lerp(tangents[i1], w).normalize();
    n.copy(normals[i0]).lerp(normals[i1], w);
    n.addScaledVector(t, -n.dot(t));
    if (n.lengthSq() < 1e-12) n.copy(normals[i0]);
    n.normalize();
    b.crossVectors(t, n).normalize();

    const twistAngle = twistEnabled ? twistTurnsSafe * TAU * ((vc - vMin) / vRange) : 0;
    const ct = Math.cos(twistAngle);
    const st = Math.sin(twistAngle);
    side.copy(n).multiplyScalar(ct).addScaledVector(b, st);

    target.copy(c).addScaledVector(side, u * halfWidth);
  };
};

// ---- color helpers ----
function scalarToColor01(
  t: number,
  palette: ColorPalette
): { r: number; g: number; b: number } {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;

  switch (palette) {
    case "grayscale": {
      const g = x;
      return { r: g, g, b: g };
    }

    case "redYellow": {
      return { r: 1, g: x, b: 0 };
    }

    case "rainbow": {
      const h = x * 5.0;
      const i = Math.floor(h);
      const f = h - i;
      const q = 1 - f;

      let r = 0, g = 0, b = 0;
      switch (i) {
        case 0: r = 1; g = f; b = 0; break;
        case 1: r = q; g = 1; b = 0; break;
        case 2: r = 0; g = 1; b = f; break;
        case 3: r = 0; g = q; b = 1; break;
        default: r = f; g = 0; b = 1; break;
      }
      return { r, g, b };
    }

    case "blueRed":
    default: {
      const four = 4 * x;
      const r = Math.min(Math.max(four - 1.5, 0), 1);
      const g = Math.min(Math.max(2 - Math.abs(four - 2), 0), 1);
      const b = Math.min(Math.max(1.5 - four, 0), 1);
      return { r, g, b };
    }
  }
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
  geometry.attributes.color.needsUpdate = true;
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
  if (count === 0) return;

  const values = new Float32Array(count);
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    let v: number;
    if (colorMode === "height") v = y;
    else v = Math.sqrt(x * x + y * y + z * z);

    values[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const range = max - min || 1;
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const t = (values[i] - min) / range;
    const { r, g, b } = scalarToColor01(t, palette);
    colors[3 * i] = r;
    colors[3 * i + 1] = g;
    colors[3 * i + 2] = b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.attributes.color.needsUpdate = true;
}

function applyHeatmapColors(
  geometry: THREE.BufferGeometry,
  values: number[] | Float32Array,
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
  geometry.attributes.color.needsUpdate = true;
}

const PARAM_CURVATURE_MODES = new Set<ColorMode>(["gaussian", "mean", "k1", "k2"]);

type ParamCurvatureMode = "gaussian" | "mean" | "k1" | "k2";

function isParamCurvatureMode(mode: ColorMode): mode is ParamCurvatureMode {
  return PARAM_CURVATURE_MODES.has(mode);
}

function applyParamCurvatureColors(
  geometry: THREE.BufferGeometry,
  mode: ParamCurvatureMode,
  palette: ColorPalette,
  paramFunc: (u: number, v: number, target: THREE.Vector3) => void,
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number
) {
  const uvAttr = geometry.getAttribute("uv") as THREE.BufferAttribute | null;
  if (!uvAttr) {
    applyVertexColors(geometry, "radius", palette);
    return;
  }

  const count = uvAttr.count;
  if (!count) return;

  const values = new Float32Array(count);
  let min = Infinity;
  let max = -Infinity;

  const uRange = uMax - uMin;
  const vRange = vMax - vMin;
  const du = Math.max(1e-5, Math.abs(uRange) * 1e-3);
  const dv = Math.max(1e-5, Math.abs(vRange) * 1e-3);

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const evalParam = (u: number, v: number, target: THREE.Vector3) => {
    paramFunc(clamp(u, uMin, uMax), clamp(v, vMin, vMax), target);
  };

  const p = new THREE.Vector3();
  const pu1 = new THREE.Vector3();
  const pu2 = new THREE.Vector3();
  const pv1 = new THREE.Vector3();
  const pv2 = new THREE.Vector3();
  const puv1 = new THREE.Vector3();
  const puv2 = new THREE.Vector3();
  const puv3 = new THREE.Vector3();
  const puv4 = new THREE.Vector3();

  const Xu = new THREE.Vector3();
  const Xv = new THREE.Vector3();
  const Xuu = new THREE.Vector3();
  const Xvv = new THREE.Vector3();
  const Xuv = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const u = uMin + uvAttr.getX(i) * uRange;
    const v = vMin + uvAttr.getY(i) * vRange;

    evalParam(u, v, p);

    evalParam(u + du, v, pu1);
    evalParam(u - du, v, pu2);
    Xu.copy(pu1).sub(pu2).multiplyScalar(0.5 / du);
    Xuu.copy(pu1).add(pu2).addScaledVector(p, -2).multiplyScalar(1 / (du * du));

    evalParam(u, v + dv, pv1);
    evalParam(u, v - dv, pv2);
    Xv.copy(pv1).sub(pv2).multiplyScalar(0.5 / dv);
    Xvv.copy(pv1).add(pv2).addScaledVector(p, -2).multiplyScalar(1 / (dv * dv));

    evalParam(u + du, v + dv, puv1);
    evalParam(u + du, v - dv, puv2);
    evalParam(u - du, v + dv, puv3);
    evalParam(u - du, v - dv, puv4);
    Xuv.copy(puv1).sub(puv2).sub(puv3).add(puv4).multiplyScalar(1 / (4 * du * dv));

    n.copy(Xu).cross(Xv);
    const nLen2 = n.lengthSq();
    const E = Xu.dot(Xu);
    const F = Xu.dot(Xv);
    const G = Xv.dot(Xv);
    const denom = E * G - F * F;

    let val = 0;
    if (nLen2 >= 1e-12 && Math.abs(denom) >= 1e-12) {
      n.multiplyScalar(1 / Math.sqrt(nLen2));
      const e = Xuu.dot(n);
      const f = Xuv.dot(n);
      const g = Xvv.dot(n);

      const H = (e * G - 2 * f * F + g * E) / (2 * denom);
      const K = (e * g - f * f) / denom;
      const disc = Math.max(0, H * H - K);

      if (mode === "gaussian") val = K;
      else if (mode === "mean") val = H;
      else if (mode === "k1") val = H + Math.sqrt(disc);
      else val = H - Math.sqrt(disc);
    }

    if (!Number.isFinite(val)) val = 0;
    values[i] = val;
    if (val < min) min = val;
    if (val > max) max = val;
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
  geometry.attributes.color.needsUpdate = true;
}

function applyParamColoring(
  geometry: THREE.BufferGeometry,
  colorMode: ColorMode,
  palette: ColorPalette,
  paramState?: {
    paramFunc: (u: number, v: number, target: THREE.Vector3) => void;
    uMin: number;
    uMax: number;
    vMin: number;
    vMax: number;
  }
) {
  if (colorMode === "solid") {
    geometry.deleteAttribute("color");
    return;
  }

  if (isParamCurvatureMode(colorMode) && paramState) {
    applyParamCurvatureColors(
      geometry,
      colorMode,
      palette,
      paramState.paramFunc,
      paramState.uMin,
      paramState.uMax,
      paramState.vMin,
      paramState.vMax
    );
    return;
  }

  applyVertexColors(geometry, colorMode, palette);
}

function makeSlicePlane(preset: SlicePreset, offset: number, normalCustom: SliceNormal) {
  let n =
    preset === "xy"
      ? new THREE.Vector3(0, 0, 1)
      : preset === "yz"
      ? new THREE.Vector3(1, 0, 0)
      : preset === "xz"
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(normalCustom.x, normalCustom.y, normalCustom.z);

  if (n.lengthSq() < 1e-12) n.set(0, 0, 1);
  n.normalize();

  return new THREE.Plane(n, -offset);
}

function makeSlabPlanes(preset: SlicePreset, offset: number, normalCustom: SliceNormal, thickness: number): THREE.Plane[] {
  const base = makeSlicePlane(preset, offset, normalCustom);
  const n = base.normal.clone().normalize();
  const h = Math.max(0, thickness) * 0.5;

  const a = offset - h;
  const b = offset + h;

  const p1 = new THREE.Plane(n.clone(), -a);
  const p2 = new THREE.Plane(n.clone().multiplyScalar(-1), b);

  return [p1, p2];
}

function buildSliceSegmentsPositions(geom: THREE.BufferGeometry, plane: THREE.Plane): number[] {
  const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
  if (!posAttr) return [];

  const idx = geom.getIndex();

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();

  const out: number[] = [];

  const getV = (i: number, target: THREE.Vector3) => {
    target.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
  };

  const intersectEdge = (p: THREE.Vector3, q: THREE.Vector3, dp: number, dq: number, outPt: THREE.Vector3) => {
    const t = dp / (dp - dq);
    outPt.copy(p).lerp(q, t);
  };

  const triCount = idx ? idx.count / 3 : posAttr.count / 3;

  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(3 * t + 0) : 3 * t + 0;
    const i1 = idx ? idx.getX(3 * t + 1) : 3 * t + 1;
    const i2 = idx ? idx.getX(3 * t + 2) : 3 * t + 2;

    getV(i0, a);
    getV(i1, b);
    getV(i2, c);

    const da = plane.distanceToPoint(a);
    const db = plane.distanceToPoint(b);
    const dc = plane.distanceToPoint(c);

    let hit = 0;

    if ((da >= 0 && db < 0) || (da < 0 && db >= 0)) {
      intersectEdge(a, b, da, db, hit === 0 ? p1 : p2);
      hit++;
    }
    if ((db >= 0 && dc < 0) || (db < 0 && dc >= 0)) {
      intersectEdge(b, c, db, dc, hit === 0 ? p1 : p2);
      hit++;
    }
    if (hit < 2 && ((dc >= 0 && da < 0) || (dc < 0 && da >= 0))) {
      intersectEdge(c, a, dc, da, hit === 0 ? p1 : p2);
      hit++;
    }

    if (hit === 2) {
      out.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }

  return out;
}

function applySliceClipping(root: THREE.Object3D, enabled: boolean, planes: THREE.Plane[] | null) {
  root.traverse((obj) => {
    const mesh = obj as any;
    if (!mesh?.isMesh) return;

    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;

    const setForOne = (m: THREE.Material) => {
      const mm = m as any;

      if (!enabled || !planes || planes.length === 0) {
        mm.clippingPlanes = null;
      } else {
        mm.clippingPlanes = planes;
        mm.clipIntersection = false;
      }

      mm.needsUpdate = true;
    };

    if (Array.isArray(mat)) mat.forEach(setForOne);
    else setForOne(mat);
  });
}

function computeArcTForSegmentSoup(allPositions: number[], eps = 1e-4): Float32Array {
  const count = Math.floor(allPositions.length / 3);
  const outT = new Float32Array(count);
  if (count < 2) return outT;

  const keyOf = (x: number, y: number, z: number) =>
    `${Math.round(x / eps)}|${Math.round(y / eps)}|${Math.round(z / eps)}`;

  const keyToId = new Map<string, number>();
  const nodes: { p: THREE.Vector3; neigh: number[] }[] = [];
  const vNode = new Int32Array(count);

  const addNode = (x: number, y: number, z: number) => {
    const k = keyOf(x, y, z);
    const ex = keyToId.get(k);
    if (ex !== undefined) return ex;
    const id = nodes.length;
    keyToId.set(k, id);
    nodes.push({ p: new THREE.Vector3(x, y, z), neigh: [] });
    return id;
  };

  for (let i = 0; i < count; i++) {
    const x = allPositions[3 * i + 0];
    const y = allPositions[3 * i + 1];
    const z = allPositions[3 * i + 2];
    vNode[i] = addNode(x, y, z);
  }

  const addNeighbor = (a: number, b: number) => {
    const na = nodes[a].neigh;
    if (!na.includes(b)) na.push(b);
  };

  for (let i = 0; i + 1 < count; i += 2) {
    const a = vNode[i];
    const b = vNode[i + 1];
    if (a === b) continue;
    addNeighbor(a, b);
    addNeighbor(b, a);
  }

  const nodeT = new Float32Array(nodes.length);
  for (let i = 0; i < nodeT.length; i++) nodeT[i] = -1;

  const visitedNode = new Uint8Array(nodes.length);

  const walkComponent = (start: number) => {
    let s = start;

    if (nodes[s].neigh.length !== 1) {
      const q: number[] = [s];
      const seen = new Set<number>([s]);
      while (q.length) {
        const u = q.pop()!;
        if (nodes[u].neigh.length === 1) {
          s = u;
          break;
        }
        for (const v of nodes[u].neigh) {
          if (!seen.has(v)) {
            seen.add(v);
            q.push(v);
          }
        }
      }
    }

    const stack: number[] = [s];
    const dist = new Float32Array(nodes.length);
    dist[s] = 0;
    visitedNode[s] = 1;

    while (stack.length) {
      const u = stack.pop()!;
      for (const v of nodes[u].neigh) {
        if (visitedNode[v]) continue;
        const duv = nodes[u].p.distanceTo(nodes[v].p);
        dist[v] = dist[u] + duv;
        visitedNode[v] = 1;
        stack.push(v);
      }
    }

    let maxD = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (visitedNode[i] && dist[i] > maxD) maxD = dist[i];
    }

    const inv = maxD > 1e-9 ? 1 / maxD : 0;
    for (let i = 0; i < nodes.length; i++) {
      if (visitedNode[i]) nodeT[i] = dist[i] * inv;
    }
  };

  for (let i = 0; i < nodes.length; i++) {
    if (visitedNode[i]) continue;
    if (nodes[i].neigh.length === 0) {
      visitedNode[i] = 1;
      nodeT[i] = 0;
      continue;
    }
    walkComponent(i);
  }

  for (let i = 0; i < count; i++) {
    const t = nodeT[vNode[i]];
    outT[i] = t >= 0 ? t : 0;
  }
  return outT;
}

// ---- viewer state used for reverse probe ----
type ViewerState = {
  scene: THREE.Scene;
  paramFunc: (u: number, v: number, target: THREE.Vector3) => void;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  applyProbe: (
    point: THREE.Vector3,
    normalWorld: THREE.Vector3,
    uvDomain?: { u: number; v: number }
  ) => void;
};

function wrapFlagsFor(surfaceId: ParamSurfaceId) {
  // wrapping in (u,v) domain space
  // wrapU: parameter is periodic (angle)
  // wrapV: parameter is periodic (angle)
  const wrapU =
    surfaceId === "cylinder" ||
    surfaceId === "cone" ||
    surfaceId === "rotationalDevelopable" ||
    surfaceId === "rotationalGraph" ||
    surfaceId === "rotationalBell" ||
    surfaceId === "rotationalSpheroid" ||
    surfaceId === "rotationalHyperboloid" ||
    surfaceId === "rotationalFreeProfile" ||
    surfaceId === "helicoid" ||
    surfaceId === "catenoid" ||
    surfaceId === "sphere" ||
    surfaceId === "ellipsoid" ||
    surfaceId === "torus" ||
    surfaceId === "mobius" ||
    surfaceId === "kleinBottle" ||
    surfaceId === "expCone" ||
    surfaceId === "paraboloid" ||
    surfaceId === "pseudosphere" ||
    surfaceId === "dini" ||
    surfaceId === "twistedStrip" ||
    surfaceId === "sweepLinearExtrusion" ||
    surfaceId === "sweepDirectional" ||
    surfaceId === "sweepPath" ||
    surfaceId === "sweepHelical" ||
    surfaceId === "sweepScaled" ||
    surfaceId === "sweepTwisted" ||
    surfaceId === "tubeConstant" ||
    surfaceId === "tubeVariable" ||
    surfaceId === "tubeClosed" ||
    surfaceId === "tubeOpen";

  const wrapV = surfaceId === "torus" || surfaceId === "kleinBottle" || surfaceId === "tubeClosed";

  // NOTE: helicoidUV: v is not “just angle” because z=v, so NO wrapping.
  return { wrapU, wrapV };
}

function disposeObject3D(obj: THREE.Object3D) {
  const anyObj = obj as any;
  if (anyObj.geometry && typeof anyObj.geometry.dispose === "function") {
    anyObj.geometry.dispose();
  }
  const mat = anyObj.material as THREE.Material | THREE.Material[] | undefined;
  if (mat) {
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  }
}

function clearGroup(group: THREE.Group) {
  const children = [...group.children];
  children.forEach((child) => {
    child.traverse(disposeObject3D);
    group.remove(child);
  });
}

export const ParamSurfaceViewer: React.FC<Props> = (props) => {
  if (isNoWebGLMode()) {
    return <NoWebGLPanel title="3D parametric viewer paused" />;
  }

  const {
  surfaceId,
  customX,
  customY,
  customZ,
  rotationalProfileMode = "formula",
  rotationalProfileRExpr,
  rotationalProfileZExpr,
  rotationalProfilePointsText,
  rotationalAxisOrigin,
  rotationalAxisDirection,
  rmfRibbonTwistEnabled = false,
  rmfRibbonTwistTurns = 1,
  wireframe,
  showPlanes,
  planeGridSettings = DEFAULT_REFERENCE_PLANE_GRID_SETTINGS,
  showPrincipalProjections = false,
  principalProjectionXY = true,
  principalProjectionYZ = true,
  principalProjectionXZ = true,
  principalProjectionOpacity = 0.24,
  lightPreset = "studio",
  materialRoughness = 0.6,
  materialMetalness = 0.1,
  materialOpacity = 1,
  paramResolution = 64,
  colorMode = "solid",
  colorPalette = "blueRed",
  showChartGrid = false,
  chartGridCountU = 11,
  chartGridCountV = 11,
  paramDomain,
  splineSettings,
  weierstrassGExpr,
  weierstrassPhiExpr,
  weierstrassResolution,
  weierstrassRecenter,
  weierstrassDiagnostics,
  showDriftArrow = false,
  onWeierstrassError,
  onWeierstrassPathDisagreement,
  isCameraLeader = false,
  cameraSync = null,
  onCameraSync,
  cameraOverride = null,
  cameraOverrideToken = 0,
  renderQuality = "balanced",
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
    geodesicPathSmooth = true,
    geodesicPathDebug = false,
    geodesicHeatEnabled = false,
    onGeodesicHeatPick,
    onGeodesicDiskPick,
    geodesicHeatStart = null,
    geodesicHeatEnd = null,
    geodesicHeatPolylines = null,
    geodesicHeatmapValues = null,
    geodesicHeatmapEnabled = false,
    overlayPolylineGroups = null,
    geodesicDiskEnabled = false,
    geodesicDiskPickEnabled = false,
    geodesicDiskCenter = null,
    geodesicDiskMesh = null,
    geodesicDiskBoundary = null,
    geodesicDiskShowBoundary = true,
    inspectEnabled = false,
    onInspectPick,
    inspectPoint = null,
    selectionOverlayVisible = true,
    selectionOverlayOnTop = false,
    selectionSphere = null,
    zoomToRegion = false,
    zoomToRegionToken = 0,
    windowReframeToken = 0,
    reframePaddingFactor = 1.08,
    onViewportDebug,
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
  onParamCurvature,
  paramProbeUV = null,
  paramProbeToken,
  sliceEnabled = false,
  slicePreset = "xy",
  sliceOffset = 0,
  sliceNormal = { x: 0, y: 0, z: 1 },
  sliceShowPlane = true,
  sliceShowSheet = false,
  sliceThickness = 0,
  slicePlanes,
  sliceLineColorMode = "solid",
  sliceLinePalette = "rainbow",
  sliceSheetOpacity = 0.12,
  onSetCustomX,
  onSetCustomY,
  onSetCustomZ,
  onParamGeodesicState,
  } = props;
  const surfaceParamResolution = surfaceId === "torus" ? Math.min(paramResolution, 40) : paramResolution;
  const planeGridShowGrid = planeGridSettings.showGrid;
  const planeGridShowMinor = planeGridSettings.showMinorGrid;
  const planeGridShowLabels = planeGridSettings.showLabels;
  const planeGridShowXY = planeGridSettings.showXY;
  const planeGridShowXZ = planeGridSettings.showXZ;
  const planeGridShowYZ = planeGridSettings.showYZ;
  const planeGridAutoScale = planeGridSettings.autoGridScale;
  const planeGridDensity = planeGridSettings.gridDensity;
  const planeGridOpacity = planeGridSettings.planeOpacity;

  const mountRef = useRef<HTMLDivElement | null>(null);

  // refs for stable callbacks / flags
  const viewerRef = useRef<ViewerState | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const onProbeRef = useRef(onProbe);
  const probeEnabledRef = useRef(probeEnabled);
  const selectRegionEnabledRef = useRef(selectRegionEnabled);
  const onSelectionPickRef = useRef(onSelectionPick);
  const inspectEnabledRef = useRef(inspectEnabled);
  const onInspectPickRef = useRef(onInspectPick);
  const geodesicPathEnabledRef = useRef(geodesicPathEnabled);
  const onGeodesicPathPickRef = useRef(onGeodesicPathPick);
  const geodesicHeatEnabledRef = useRef(geodesicHeatEnabled);
  const onGeodesicHeatPickRef = useRef(onGeodesicHeatPick);
  const geodesicDiskPickEnabledRef = useRef(geodesicDiskPickEnabled);
  const onGeodesicDiskPickRef = useRef(onGeodesicDiskPick);
  const showChartGridRef = useRef(showChartGrid);
  const showProbeNormalRef = useRef(showProbeNormal);
  const showProbeTangentPlaneRef = useRef(showProbeTangentPlane);
  const showProbeTangentsRef = useRef(showProbeTangents);
  const weierstrassCacheRef = useRef<WeierstrassBuildResult | null>(null);
  const [weierstrassError, setWeierstrassError] = useState<string | null>(null);

  // last known probe uv in DOMAIN coords
  const [probeUV, setProbeUV] = useState<{ u: number; v: number } | null>(null);
  const [sceneEpoch, setSceneEpoch] = useState(0);

  // geodesic UI + line
  const [showGeodesic, setShowGeodesic] = useState(false);
  const [surfaceCellSelectionEnabled, setSurfaceCellSelectionEnabled] = useState(true);
  const [surfaceCellCentersVisible, setSurfaceCellCentersVisible] = useState(false);
  const [surfaceCellNormalsVisible, setSurfaceCellNormalsVisible] = useState(false);
  const [surfaceCellValuesVisible, setSurfaceCellValuesVisible] = useState(false);
  const [surfaceCellSeamsVisible, setSurfaceCellSeamsVisible] = useState(true);
  const [selectedSurfaceCellIndex, setSelectedSurfaceCellIndex] = useState<number | null>(null);
  const [selectedSurfaceCellInfo, setSelectedSurfaceCellInfo] = useState<SurfaceCellData | null>(null);
  const [surfaceCellMaskedIds, setSurfaceCellMaskedIds] = useState<Set<string>>(new Set());
  const [surfaceCellDiagnostics, setSurfaceCellDiagnostics] = useState<ChartGridDiagnostics>({
    validCells: 0,
    seamUCells: 0,
    seamVCells: 0,
    maskedCells: 0,
    skippedNonFinite: 0,
    skippedDegenerate: 0,
    invalidCells: 0,
    minArea: null,
    maxArea: null,
    avgArea: null,
  });
  const surfaceCellSelectionEnabledRef = useRef(surfaceCellSelectionEnabled);
  // direction stored in NORMALIZED uv-space (unit-ish, for the picker)
  const [geoDir, setGeoDir] = useState<{ du: number; dv: number }>({ du: 1, dv: 0 });
  const geodesicLineRef = useRef<THREE.Line | null>(null);
  const geodesicPathLineRef = useRef<THREE.Line | null>(null);
  const geodesicPathRawLineRef = useRef<THREE.Line | null>(null);
  const geodesicPathMarkersRef = useRef<{ start: THREE.Mesh | null; end: THREE.Mesh | null }>({
    start: null,
    end: null,
  });
  const geodesicDiskGroupRef = useRef<THREE.Group | null>(null);
  const geodesicHeatLineRef = useRef<THREE.Object3D | null>(null);
  const overlayPolylineGroupsRef = useRef<THREE.Group | null>(null);
  const principalProjectionGroupRef = useRef<THREE.Group | null>(null);
  const geodesicHeatMarkersRef = useRef<{ start: THREE.Mesh | null; end: THREE.Mesh | null }>({
    start: null,
    end: null,
  });

  type GizmoView = "xy" | "xz" | "yz";
  type ViewMode = "free" | GizmoView;

  const [viewMode, setViewMode] = useState<ViewMode>("free");
  const [lockToPlane, setLockToPlane] = useState(false);
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
  const [sliceHoverSnap, setSliceHoverSnap] = useState<{ s: number; t: number } | null>(null);
  const sliceHoverSmoothRef = useRef<{ s: number; t: number } | null>(null);
  const sliceHoverMarkerRef = useRef<THREE.Mesh | null>(null);
  const sliceHoverReadoutTimerRef = useRef<number | null>(null);
  const sliceFrameRef = useRef<{
    n: THREE.Vector3;
    e1: THREE.Vector3;
    e2: THREE.Vector3;
    x0: THREE.Vector3;
    size: number;
  } | null>(null);

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

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const zoomDebounceRef = useRef<number | null>(null);
  const zoomAnimRef = useRef<number | null>(null);
  const zoomNowRef = useRef(0);
  const zoomRestoreRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 } | null>(null);
  const zoomedToRegionRef = useRef(false);
  const zoomTogglePrevRef = useRef(zoomToRegion);
  const lastCameraSyncRef = useRef<CameraSyncState | null>(null);
  const centerRef = useRef(new THREE.Vector3(0, 0, 0));
  const radiusRef = useRef<number>(3);
  const forceReframeRef = useRef<(() => void) | null>(null);
  const cameraTourFrameRef = useRef<number | null>(null);
  const cameraTourRunIdRef = useRef(0);
  const gaussHighlightRef = useRef<THREE.Mesh | null>(null);
  const selectionOverlayRef = useRef<THREE.Points | null>(null);
  const selectionSphereRef = useRef<THREE.Mesh | null>(null);
  const inspectMarkerRef = useRef<THREE.Mesh | null>(null);

  const sliceDirtyRef = useRef(true);
  const surfaceObjRef = useRef<THREE.Object3D | null>(null);
  const sampleSetRef = useRef<SurfaceSampleSet | null>(null);
  const probeWidgetsRef = useRef<{
    marker: THREE.Mesh;
    normal: THREE.ArrowHelper;
    plane: THREE.Mesh;
    t1: THREE.ArrowHelper;
    t2: THREE.ArrowHelper;
  } | null>(null);
  const probeLabelRef = useRef<ProbeLabelSprite | null>(null);
  const principalGroupRef = useRef<THREE.Group | null>(null);
  const principalGlyphsRef = useRef<{ d1?: THREE.LineSegments; d2?: THREE.LineSegments } | null>(
    null
  );
  const curvatureLinesRef = useRef<THREE.LineSegments | null>(null);
  const ridgeLinesRef = useRef<THREE.Object3D | null>(null);
  const valleyLinesRef = useRef<THREE.Object3D | null>(null);
  const chartGridRef = useRef<THREE.Group | null>(null);
  const chartGridPickMeshRef = useRef<THREE.Mesh | null>(null);
  const chartGridCellsRef = useRef<SurfaceCellData[]>([]);
  const principalFieldRef = useRef<{ key: string; data: PrincipalField | null } | null>(null);
  const prevPrincipalRef = useRef<PrincipalCurvatureResult | null>(null);
  const sliceLinesRef = useRef<THREE.LineSegments | null>(null);
  const sliceMatRef = useRef<THREE.LineBasicMaterial | null>(null);
  const sliceSheetsRef = useRef<THREE.Group | null>(null);
  const sliceGroupRef = useRef<THREE.Group | null>(null);
  const diagnosticsGroupRef = useRef<THREE.Group | null>(null);
  const driftArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const resolveSceneBackground = useCallback(() => {
    if (sceneBackgroundMode === "transparent") {
      return { color: 0x000000, alpha: 0, scene: null as THREE.Color | null };
    }
    if (sceneBackgroundMode === "calm") {
      const calmColor = 0xf1f5fb;
      return { color: calmColor, alpha: 1, scene: new THREE.Color(calmColor) };
    }
    const defaultColor = 0xf8f9fb;
    return { color: defaultColor, alpha: 1, scene: new THREE.Color(defaultColor) };
  }, [sceneBackgroundMode]);

  const sliceParamsRef = useRef({
    enabled: sliceEnabled,
    preset: slicePreset as SlicePreset,
    offset: sliceOffset,
    normal: sliceNormal as SliceNormal,
    showIntersection: sliceShowPlane,
    showSheet: sliceShowSheet,
    thickness: sliceThickness,
    planes: (slicePlanes ?? null) as { preset: SlicePreset; offset: number; normal: SliceNormal }[] | null,
    lineColorMode: sliceLineColorMode as "solid" | "height" | "arclen",
    linePalette: sliceLinePalette as ColorPalette,
    sheetOpacity: sliceSheetOpacity,
  });

  const [paramPresetLabel, setParamPresetLabel] = useState("");
  const [paramPresets, setParamPresets] = useState<ParamPreset[]>([]);

  useEffect(() => {
    setParamPresets(safeParseArray<ParamPreset>(localStorage.getItem(LS_PARAM_KEY)));
  }, []);

  const saveParamPreset = () => {
    if (surfaceId !== "custom") return;

    const x = (customX ?? "").trim();
    const y = (customY ?? "").trim();
    const z = (customZ ?? "").trim();

    // require at least one non-empty (you can make it stricter if you want)
    if (!x && !y && !z) return;

    const p: ParamPreset = {
      id: makeId(),
      label: (paramPresetLabel.trim() || autoLabel3(x, y, z)).trim(),
      xExpr: x,
      yExpr: y,
      zExpr: z,
      createdAt: Date.now(),
    };

    const next = [p, ...paramPresets];
    setParamPresets(next);
    saveArray(LS_PARAM_KEY, next);
    setParamPresetLabel("");
  };

  const loadParamPreset = (p: ParamPreset) => {
    onSetCustomX?.(p.xExpr);
    onSetCustomY?.(p.yExpr);
    onSetCustomZ?.(p.zExpr);
  };

  const duplicateParamPreset = (src: ParamPreset) => {
    const copy: ParamPreset = {
      ...src,
      id: makeId(),
      label: (src.label ? `${src.label} (copy)` : "Copy").trim(),
      createdAt: Date.now(),
    };
    const next = [copy, ...paramPresets];
    setParamPresets(next);
    saveArray(LS_PARAM_KEY, next);
  };

  const deleteParamPreset = (id: string) => {
    if (!confirm("Delete this preset?")) return;
    const next = paramPresets.filter((p) => p.id !== id);
    setParamPresets(next);
    saveArray(LS_PARAM_KEY, next);
  };

  const applyCameraView = (view: GizmoView) => {
    const cam = cameraRef.current;
    const controls = controlsRef.current;
    if (!cam || !controls) return;

    const center = centerRef.current ?? new THREE.Vector3(0, 0, 0);
    const d = (radiusRef.current || 3) * 2.0;

    if (view === "xy") {
      cam.position.set(center.x, center.y, center.z + d);
      cam.up.set(0, 1, 0);
    } else if (view === "xz") {
      cam.position.set(center.x, center.y + d, center.z);
      cam.up.set(0, 0, 1);
    } else {
      cam.position.set(center.x + d, center.y, center.z);
      cam.up.set(0, 1, 0);
    }

    controls.target.copy(center);
    cam.lookAt(center);
    controls.update();
  };

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
    onProbeRef.current = onProbe;
  }, [onProbe]);

  useEffect(() => {
    showProbeNormalRef.current = showProbeNormal;
    showProbeTangentPlaneRef.current = showProbeTangentPlane;
    showProbeTangentsRef.current = showProbeTangents;
  }, [showProbeNormal, showProbeTangentPlane, showProbeTangents]);

  useEffect(() => {
    if (probeEnabled) return;
    prevPrincipalRef.current = null;
    setProbeUV(null);
    if (principalGroupRef.current) clearGroup(principalGroupRef.current);
    const widgets = probeWidgetsRef.current;
    if (widgets) {
      widgets.marker.visible = false;
      widgets.normal.visible = false;
      widgets.plane.visible = false;
      widgets.t1.visible = false;
      widgets.t2.visible = false;
    }
    if (probeLabelRef.current) {
      probeLabelRef.current.sprite.visible = false;
    }
  }, [probeEnabled]);

  useEffect(() => {
    prevPrincipalRef.current = null;
    if (principalGroupRef.current) clearGroup(principalGroupRef.current);
  }, [
    surfaceId,
    customX,
    customY,
    customZ,
    rotationalProfileMode,
    rotationalProfileRExpr,
    rotationalProfileZExpr,
    rotationalProfilePointsText,
    rotationalAxisOrigin?.x,
    rotationalAxisOrigin?.y,
    rotationalAxisOrigin?.z,
    rotationalAxisDirection?.x,
    rotationalAxisDirection?.y,
    rotationalAxisDirection?.z,
    rmfRibbonTwistEnabled,
    rmfRibbonTwistTurns,
    paramDomain?.uMin,
    paramDomain?.uMax,
    paramDomain?.vMin,
    paramDomain?.vMax,
  ]);

  useEffect(() => {
    probeEnabledRef.current = probeEnabled;
  }, [probeEnabled]);

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
    inspectEnabledRef.current = inspectEnabled;
  }, [inspectEnabled]);
  useEffect(() => {
    onInspectPickRef.current = onInspectPick;
  }, [onInspectPick]);
  useEffect(() => {
    if (!showChartGrid) {
      setSelectedSurfaceCellIndex(null);
      setSelectedSurfaceCellInfo(null);
    }
  }, [showChartGrid]);
  useEffect(() => {
    if (!surfaceCellSelectionEnabled) {
      setSelectedSurfaceCellIndex(null);
      setSelectedSurfaceCellInfo(null);
    }
  }, [surfaceCellSelectionEnabled]);
  useEffect(() => {
    setSurfaceCellMaskedIds(new Set());
    setSelectedSurfaceCellIndex(null);
    setSelectedSurfaceCellInfo(null);
  }, [surfaceId]);

  useEffect(() => {
    sliceParamsRef.current = {
      enabled: sliceEnabled,
      preset: slicePreset,
      offset: sliceOffset,
      normal: sliceNormal,
      showIntersection: sliceShowPlane,
      showSheet: sliceShowSheet,
      thickness: sliceThickness,
      planes: slicePlanes ?? null,
      lineColorMode: sliceLineColorMode,
      linePalette: sliceLinePalette,
      sheetOpacity: sliceSheetOpacity,
    };
    sliceDirtyRef.current = true;
  }, [
    sliceEnabled,
    slicePreset,
    sliceOffset,
    sliceNormal,
    sliceShowPlane,
    sliceShowSheet,
    sliceThickness,
    slicePlanes,
    sliceLineColorMode,
    sliceLinePalette,
    sliceSheetOpacity,
  ]);

  // Reset camera mode when user hits "Reset camera view"
  useEffect(() => {
    setViewMode("free");
    setLockToPlane(false);
  }, [resetToken]);

  useEffect(() => {
    if (!windowReframeToken) return;
    const apply = () => {
      forceReframeRef.current?.();
    };
    apply();
    const raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [windowReframeToken]);

  // React to plane selection & lock state without recreating scene
  useEffect(() => {
    const controls = controlsRef.current;
    const cam = cameraRef.current;
    if (!controls || !cam) return;

    const shouldLock = lockToPlane && viewMode !== "free";
    controls.enableRotate = !shouldLock;

    if (viewMode === "free") return;
    applyCameraView(viewMode as GizmoView);
  }, [viewMode, lockToPlane]);

  // --- slice update uses ONLY refs ---
  function updateSlice(surfaceObj: THREE.Object3D) {
    const p = sliceParamsRef.current;

    const baseConfigs =
      p.planes && p.planes.length > 0
        ? p.planes
        : [{ preset: p.preset, offset: p.offset, normal: p.normal }];

    const clipPlanes: THREE.Plane[] = [];
    for (const cfg of baseConfigs) {
      if (p.thickness > 0) {
        clipPlanes.push(...makeSlabPlanes(cfg.preset, cfg.offset, cfg.normal, p.thickness));
      } else {
        clipPlanes.push(makeSlicePlane(cfg.preset, cfg.offset, cfg.normal));
      }
    }

    applySliceClipping(surfaceObj, p.enabled, p.enabled ? clipPlanes : null);

    const lines = sliceLinesRef.current;
    const lineMat = sliceMatRef.current;
    if (!lines || !lineMat) return;

    if (!p.enabled || !p.showIntersection) {
      lines.visible = false;
    } else {
      const mesh = surfaceObj as THREE.Mesh;
      const baseGeom = mesh.geometry as THREE.BufferGeometry;

      mesh.updateMatrixWorld(true);

      const worldGeom = baseGeom.clone();
      worldGeom.applyMatrix4(mesh.matrixWorld);

      const allPositions: number[] = [];
      if (p.thickness > 0) {
        for (const cfg of baseConfigs) {
          const planeMid = makeSlicePlane(cfg.preset, cfg.offset, cfg.normal);
          allPositions.push(...buildSliceSegmentsPositions(worldGeom, planeMid));
        }
      } else {
        for (const cfg of baseConfigs) {
          const plane = makeSlicePlane(cfg.preset, cfg.offset, cfg.normal);
          allPositions.push(...buildSliceSegmentsPositions(worldGeom, plane));
        }
      }

      worldGeom.dispose();

      const sliceGeom = new THREE.BufferGeometry();
      sliceGeom.setAttribute("position", new THREE.Float32BufferAttribute(allPositions, 3));

      if (p.lineColorMode !== "solid" && allPositions.length >= 6) {
        const count = allPositions.length / 3;
        const colors = new Float32Array(count * 3);

        if (p.lineColorMode === "height") {
          let mn = Infinity;
          let mx = -Infinity;
          for (let i = 0; i < count; i++) {
            const yy = allPositions[i * 3 + 1];
            if (yy < mn) mn = yy;
            if (yy > mx) mx = yy;
          }
          const range = mx - mn || 1;

          for (let i = 0; i < count; i++) {
            const yy = allPositions[i * 3 + 1];
            const t = (yy - mn) / range;
            const { r, g, b } = scalarToColor01(t, p.linePalette);
            colors[i * 3 + 0] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
          }

          lineMat.color.set(0xffffff);
          lineMat.needsUpdate = true;
        } else if (p.lineColorMode === "arclen") {
          const tArc = computeArcTForSegmentSoup(allPositions);
          for (let i = 0; i < count; i++) {
            const t = tArc[i];
            const { r, g, b } = scalarToColor01(t, p.linePalette);
            colors[i * 3 + 0] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
          }

          lineMat.color.set(0xffffff);
          lineMat.needsUpdate = true;
        }

        sliceGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        lineMat.vertexColors = true;
      } else {
        sliceGeom.deleteAttribute("color");
        lineMat.vertexColors = false;
      }

      lines.geometry.dispose();
      lines.geometry = sliceGeom;
      lines.visible = true;
    }

    const sheets = sliceSheetsRef.current;
    if (!sheets) return;

    while (sheets.children.length) {
      const ch = sheets.children.pop() as THREE.Mesh;
      if (ch?.geometry) ch.geometry.dispose();
      const matAny = (ch as any).material as THREE.Material | THREE.Material[] | undefined;
      if (matAny) {
        if (Array.isArray(matAny)) matAny.forEach((m) => m.dispose());
        else matAny.dispose();
      }
    }

    if (!p.enabled || !p.showSheet) return;

    const size = Math.max(2.0, (radiusRef.current || 3) * 2.4);

    for (const cfg of baseConfigs) {
      const plane = makeSlicePlane(cfg.preset, cfg.offset, cfg.normal);
      const n = plane.normal.clone().normalize();

      const x0 = n.clone().multiplyScalar(cfg.offset);

      const geom = new THREE.PlaneGeometry(size, size, 1, 1);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x999999,
        transparent: true,
        opacity: Math.min(0.9, Math.max(0, p.sheetOpacity)),
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      (mat as any).polygonOffset = true;
      (mat as any).polygonOffsetFactor = -1;
      (mat as any).polygonOffsetUnits = -1;

      const mesh = new THREE.Mesh(geom, mat);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      mesh.quaternion.copy(q);
      mesh.position.copy(x0);
      mesh.renderOrder = 9;

      sheets.add(mesh);
    }
  }

  // --- slicing plane + intersection (param surfaces) ---
  useEffect(() => {
    const group = sliceGroupRef.current;
    if (!group) return;

    clearGroup(group);

    if (!slicePlaneEnabled) {
      setSlicePolylines2D([]);
      sliceFrameRef.current = null;
      return;
    }
    const state = viewerRef.current;
    if (!state) {
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

    const { paramFunc, uMin, uMax, vMin, vMax } = state;
    const nx = Math.max(30, Math.round(surfaceParamResolution));
    const ny = Math.max(30, Math.round(surfaceParamResolution));

    const du = (uMax - uMin) / (nx - 1);
    const dv = (vMax - vMin) / (ny - 1);
    const p = new THREE.Vector3();

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x1f3556,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    });

    const lineOffset = Math.max(0.001, (radiusRef.current || 3) * 0.002);
    const normalOffset = frame.n.clone().multiplyScalar(lineOffset);

    const polylines = marchingSquares({
      nx,
      ny,
      xMin: uMin,
      xMax: uMax,
      yMin: vMin,
      yMax: vMax,
      level: 0,
      sample: (i, j) => {
        const u = uMin + i * du;
        const v = vMin + j * dv;
        paramFunc(u, v, p);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return NaN;
        return frame.n.dot(p) - slicePlaneOffset;
      },
    });

    const polylines2D: Array<Array<{ s: number; t: number }>> = [];

    for (const poly of polylines) {
      if (poly.length < 2) continue;
      const pts: THREE.Vector3[] = [];
      const pts2D: Array<{ s: number; t: number }> = [];
      for (const uv of poly) {
        paramFunc(uv.x, uv.y, p);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
        const rel = p.clone().sub(frame.x0);
        const s = rel.dot(frame.e1);
        const t = rel.dot(frame.e2);
        pts2D.push({ s, t });
        pts.push(p.clone().add(normalOffset));
      }
      if (pts.length < 2) continue;
      if (pts2D.length >= 2) polylines2D.push(pts2D);
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geom, lineMat);
      line.renderOrder = 12;
      group.add(line);
    }
    setSlicePolylines2D(polylines2D);
  }, [
    slicePlaneEnabled,
    slicePlaneTheta,
    slicePlanePhi,
    slicePlaneOffset,
    slicePlaneSize,
    surfaceId,
    customX,
    customY,
    customZ,
    rotationalProfileMode,
    rotationalProfileRExpr,
    rotationalProfileZExpr,
    rotationalProfilePointsText,
    rotationalAxisOrigin?.x,
    rotationalAxisOrigin?.y,
    rotationalAxisOrigin?.z,
    rotationalAxisDirection?.x,
    rotationalAxisDirection?.y,
    rotationalAxisDirection?.z,
    rmfRibbonTwistEnabled,
    rmfRibbonTwistTurns,
    paramDomain?.uMin,
    paramDomain?.uMax,
    paramDomain?.vMin,
    paramDomain?.vMax,
    surfaceParamResolution,
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

  // --- main viewer setup ---
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const getSize = () => {
      const rect = mount.getBoundingClientRect();
      return {
        width: rect.width || 600,
        height: rect.height || 400,
      };
    };

    const { width, height } = getSize();
    const background = resolveSceneBackground();

    const scene = new THREE.Scene();
    scene.background = background.scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(4, 3, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer(
      vmSafeRendererParams({ antialias: renderQuality !== "performance", alpha: true })
    );
    const removeWebGLContextLogger = installWebGLContextLogger(renderer.domElement, "param-surface");
    const heavySurface = surfaceId === "torus";
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
    renderer.setPixelRatio(vmSafePixelRatio(targetPixelRatio, maxPixelRatio));
    renderer.setSize(width, height, false);
    renderer.setClearColor(background.color, background.alpha);
    renderer.localClippingEnabled = true;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    const resourceDiagnostics = registerThreeResourceDiagnostics("param-surface", scene, renderer);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
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
        viewer: "param",
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
    let lastRenderedAt = 0;
    let controlsInteractionActive = false;
    const renderSoon = () => {
      lastRenderedAt = 0;
    };
    const handleControlsChangeDebug = () => {
      renderSoon();
      emitViewportDebugThrottled("controls");
    };
    const handleControlsStart = () => {
      controlsInteractionActive = true;
      renderSoon();
    };
    const handleControlsEnd = () => {
      controlsInteractionActive = false;
      renderSoon();
    };
    controls.addEventListener("change", handleControlsChangeDebug);
    controls.addEventListener("start", handleControlsStart);
    controls.addEventListener("end", handleControlsEnd);

    if (isCameraLeader && onCameraSync) {
      controls.addEventListener("change", emitCameraSync);
      emitCameraSync();
    }

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
      const light1 = new THREE.DirectionalLight(0xffffff, 0.9);
      light1.position.set(5, 6, 4);
      scene.add(light1);
      const light2 = new THREE.AmbientLight(0xffffff, 0.3);
      scene.add(light2);
    }

    const sheetsGroup = new THREE.Group();
    sliceSheetsRef.current = sheetsGroup;
    scene.add(sheetsGroup);

    const sliceMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      vertexColors: false,
    });
    sliceMatRef.current = sliceMat;

    const sliceGeom = new THREE.BufferGeometry();
    const sliceLines = new THREE.LineSegments(sliceGeom, sliceMat);
    sliceLines.visible = false;
    sliceLines.renderOrder = 10;
    sliceLinesRef.current = sliceLines;
    scene.add(sliceLines);

    const sliceGroup = new THREE.Group();
    sliceGroupRef.current = sliceGroup;
    scene.add(sliceGroup);

    // coordinate axes
    const axesLength = 3;
    const axes = new THREE.AxesHelper(axesLength);
    scene.add(axes);

    // axis labels
    const labelSprites: THREE.Sprite[] = [];

    const makeAxisLabel = (text: string, color: string, position: THREE.Vector3) => {
      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(0, 0, size, size);
      ctx.font = "28px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, size / 2, size / 2);

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(0.35, 0.35, 0.35);
      sprite.position.copy(position);
      scene.add(sprite);
      labelSprites.push(sprite);
    };

    makeAxisLabel("+x", "#d9534f", new THREE.Vector3(axesLength * 1.05, 0, 0));
    makeAxisLabel("+y", "#5cb85c", new THREE.Vector3(0, axesLength * 1.05, 0));
    makeAxisLabel("+z", "#5bc0de", new THREE.Vector3(0, 0, axesLength * 1.05));

    const diagnosticsGroup = new THREE.Group();
    diagnosticsGroup.name = "diagnostics";
    diagnosticsGroupRef.current = diagnosticsGroup;
    scene.add(diagnosticsGroup);

    // optional coordinate planes
    const extraGeoms: THREE.BufferGeometry[] = [];
    const extraMats: THREE.Material[] = [];
    let referenceGridOverlay: ReturnType<typeof createLayeredReferenceGrid> | null = null;
    if (showPlanes) {
      referenceGridOverlay = createLayeredReferenceGrid({
        halfSize: 3,
        lineLift: 0.003,
        originDotRadius: 0.052,
        showGrid: planeGridShowGrid,
        showMinorGrid: planeGridShowMinor,
        showLabels: planeGridShowLabels,
        showXY: planeGridShowXY,
        showXZ: planeGridShowXZ,
        showYZ: planeGridShowYZ,
        autoGridScale: planeGridAutoScale,
        gridDensity: planeGridDensity,
        planeOpacity: planeGridOpacity,
      });
      scene.add(referenceGridOverlay.group);
    }

    const slices = Math.max(16, Math.round(surfaceParamResolution));
    const stacks = Math.max(16, Math.round(surfaceParamResolution));
    // Weierstrass integration grid can differ from render resolution.
    const buildResolution = Math.max(4, Math.round(weierstrassResolution ?? surfaceParamResolution));

    const rawDomain = paramDomain ?? getDomain(surfaceId);
    let uMin = Number.isFinite(rawDomain.uMin) ? rawDomain.uMin : -Math.PI;
    let uMax = Number.isFinite(rawDomain.uMax) ? rawDomain.uMax : Math.PI;
    let vMin = Number.isFinite(rawDomain.vMin) ? rawDomain.vMin : -2;
    let vMax = Number.isFinite(rawDomain.vMax) ? rawDomain.vMax : 2;
    if (uMin === uMax) uMax = uMin + 0.1;
    if (vMin === vMax) vMax = vMin + 0.1;
    if (uMin > uMax) [uMin, uMax] = [uMax, uMin];
    if (vMin > vMax) [vMin, vMax] = [vMax, vMin];

    let paramFunc: (u: number, v: number, target: THREE.Vector3) => void;
    let weierstrassState: WeierstrassBuildResult | null = null;

    if (surfaceId === "weierstrass") {
      const built = buildWeierstrassSurface({
        gExpr: (weierstrassGExpr ?? "z").trim() || "z",
        phiExpr: (weierstrassPhiExpr ?? "1").trim() || "1",
        uMin,
        uMax,
        vMin,
        vMax,
        resolution: buildResolution,
        recenterRescale: weierstrassRecenter ?? true,
      });

      if (built.error || built.errorMessage) {
        const message = built.errorMessage ?? built.error?.message ?? "Invalid Weierstrass data.";
        if (message !== weierstrassError) setWeierstrassError(message);
        onWeierstrassError?.(message);
        weierstrassState = weierstrassCacheRef.current;
      } else {
        weierstrassState = built;
        weierstrassCacheRef.current = built;
        if (weierstrassError) setWeierstrassError(null);
        onWeierstrassError?.(null);
      }

      if (weierstrassState) {
        uMin = weierstrassState.uMin;
        uMax = weierstrassState.uMax;
        vMin = weierstrassState.vMin;
        vMax = weierstrassState.vMax;
      }
    } else if (weierstrassError) {
      setWeierstrassError(null);
      onWeierstrassError?.(null);
    }

    const pathDisagreementValue =
      surfaceId === "weierstrass" ? weierstrassState?.pathDisagreement ?? null : null;
    onWeierstrassPathDisagreement?.(pathDisagreementValue);

    const rotationalEval = buildRotationalSurfaceEvaluator(surfaceId, {
      mode: rotationalProfileMode,
      rExpr: rotationalProfileRExpr,
      zExpr: rotationalProfileZExpr,
      pointsText: rotationalProfilePointsText,
      axisOrigin: rotationalAxisOrigin,
      axisDirection: rotationalAxisDirection,
    });
    const splineEval = buildSplineSurfacePointEvaluator(surfaceId, splineSettings);
    const spanU = Math.max(1e-9, uMax - uMin);
    const spanV = Math.max(1e-9, vMax - vMin);
    const rmfRibbonEval =
      surfaceId === "ribbonRMF"
        ? buildRmfRibbonSampler({
            vMin,
            vMax,
            twistEnabled: rmfRibbonTwistEnabled,
            twistTurns: rmfRibbonTwistTurns,
          })
        : null;

    if (surfaceId === "custom") {
      const xFn = makeSafeParamExpr(customX, (u) => u);
      const yFn = makeSafeParamExpr(customY, (_u, v) => v);
      const zFn = makeSafeParamExpr(customZ, () => 0);

      paramFunc = (u, v, target) => {
        const x = xFn(u, v);
        const y = yFn(u, v);
        const z = zFn(u, v);
        target.set(
          Number.isFinite(x) ? x : 0,
          Number.isFinite(y) ? y : 0,
          Number.isFinite(z) ? z : 0
        );
      };
    } else if (surfaceId === "weierstrass") {
      if (weierstrassState) {
        paramFunc = (u, v, target) => {
          weierstrassState.paramFunc(u, v, target);
        };
      } else {
        paramFunc = (_u, _v, target) => target.set(0, 0, 0);
      }
    } else {
      paramFunc = (u, v, target) => {
        let x = 0,
          y = 0,
          z = 0;

        if (rotationalEval) {
          const p = rotationalEval(u, v);
          target.set(p.x, p.y, p.z);
          return;
        }
        if (splineEval) {
          const uuNorm = (u - uMin) / spanU;
          const vvNorm = (v - vMin) / spanV;
          const p = splineEval(uuNorm, vvNorm);
          target.set(p.x, p.y, p.z);
          return;
        }

        switch (surfaceId) {
          case "plane":
            x = u;
            y = v;
            z = 0;
            break;

          case "cylinder":
            x = Math.cos(u);
            y = Math.sin(u);
            z = v;
            break;

          case "cone":
            x = v * Math.cos(u);
            y = v * Math.sin(u);
            z = v;
            break;

          case "rotationalDevelopable": {
            const k = 0.35;
            const r = Math.max(0.1, 1 + k * v);
            x = r * Math.cos(u);
            y = r * Math.sin(u);
            z = v;
            break;
          }

          case "rotationalGraph": {
            const f = 0.55 + 0.35 * v * v;
            x = f * Math.cos(u);
            y = f * Math.sin(u);
            z = v;
            break;
          }

          case "rotationalBell": {
            const r = Math.max(0.1, 1 + 0.2 * Math.sin(3 * v));
            x = r * Math.cos(u);
            y = r * Math.sin(u);
            z = v;
            break;
          }

          case "rotationalHyperboloid": {
            const a = 0.8;
            const c = 0.9;
            x = a * Math.cosh(v) * Math.cos(u);
            y = a * Math.cosh(v) * Math.sin(u);
            z = c * Math.sinh(v);
            break;
          }

          case "rotationalFreeProfile": {
            const r = Math.max(0.15, 0.55 + 0.12 * v + 0.08 * v * v - 0.015 * v * v * v);
            x = r * Math.cos(u);
            y = r * Math.sin(u);
            z = v + 0.15 * Math.sin(1.7 * v);
            break;
          }

          case "helicoid": {
            const a = 0.4;
            x = v * Math.cos(u);
            y = v * Math.sin(u);
            z = a * u;
            break;
          }

          case "catenoid":
            x = Math.cosh(v) * Math.cos(u);
            y = Math.cosh(v) * Math.sin(u);
            z = v;
            break;

          case "sphere": {
            const R = 1;
            x = R * Math.sin(v) * Math.cos(u);
            y = R * Math.sin(v) * Math.sin(u);
            z = R * Math.cos(v);
            break;
          }

          case "rotationalSpheroid": {
            const a = 1.15;
            const c = 0.75;
            x = a * Math.sin(v) * Math.cos(u);
            y = a * Math.sin(v) * Math.sin(u);
            z = c * Math.cos(v);
            break;
          }

          case "ellipsoid": {
            const a = 1.3;
            const b = 0.95;
            const c = 0.7;
            x = a * Math.sin(v) * Math.cos(u);
            y = b * Math.sin(v) * Math.sin(u);
            z = c * Math.cos(v);
            break;
          }

          case "torus": {
            const R = 1.4;
            const r = 0.5;
            const cosV = Math.cos(v);
            x = (R + r * cosV) * Math.cos(u);
            y = (R + r * cosV) * Math.sin(u);
            z = r * Math.sin(v);
            break;
          }

          case "mobius": {
            const half = v / 2;
            const cosHalf = Math.cos(u / 2);
            const sinHalf = Math.sin(u / 2);
            const rho = 1 + half * cosHalf;
            x = rho * Math.cos(u);
            y = rho * Math.sin(u);
            z = half * sinHalf;
            break;
          }

          case "kleinBottle": {
            const r = 4 * (1 - Math.cos(u) / 2);
            const xBase = r * Math.cos(u);
            const yBase = r * Math.sin(u);
            if (u < Math.PI) {
              x = xBase * (1 + Math.sin(u)) + 2 * Math.cos(v);
              z = yBase;
            } else {
              x = xBase + 2 * Math.cos(v + Math.PI);
              z = yBase;
            }
            y = 2 * Math.sin(v);
            break;
          }

          case "hyperbolicParaboloid":
            x = u;
            y = v;
            z = u * v;
            break;

          case "paraboloid":
            x = v * Math.cos(u);
            y = v * Math.sin(u);
            z = 0.6 * v * v;
            break;

          case "enneper":
            x = u - (u * u * u) / 3 + u * v * v;
            y = v - (v * v * v) / 3 + v * u * u;
            z = u * u - v * v;
            break;

          case "pseudosphere": {
            const sech = 1 / Math.cosh(v);
            x = Math.cos(u) * sech;
            y = Math.sin(u) * sech;
            z = v - Math.tanh(v);
            break;
          }

          case "dini": {
            const a = 1;
            const b = 0.2;
            const sinV = Math.sin(v);
            const tanHalf = Math.tan(v / 2);
            const logTerm = Math.log(Math.max(tanHalf, 1e-6));
            x = a * Math.cos(u) * sinV;
            y = a * Math.sin(u) * sinV;
            z = a * (Math.cos(v) + logTerm) + b * u;
            break;
          }

          case "twistedStrip": {
            const twist = 2 * u;
            const rho = 1 + v * Math.cos(twist);
            x = rho * Math.cos(u);
            y = rho * Math.sin(u);
            z = v * Math.sin(twist);
            break;
          }

          case "sweepLinearExtrusion": {
            const px = 0.62 * Math.cos(u) + 0.08 * Math.cos(3 * u);
            const py = 0.36 * Math.sin(u);
            x = px;
            y = py;
            z = v;
            break;
          }

          case "sweepDirectional": {
            const px = 0.52 * Math.cos(u);
            const py = 0.3 * Math.sin(u);
            x = px + 0.45 * v;
            y = py + 0.2 * v;
            z = v;
            break;
          }

          case "sweepPath": {
            const cx = 0.85 * Math.cos(0.7 * v);
            const cy = 0.55 * Math.sin(1.1 * v);
            const cz = v;
            const r = 0.22;
            x = cx + r * Math.cos(u);
            y = cy + r * Math.sin(u);
            z = cz;
            break;
          }

          case "sweepHelical": {
            const R = 1.2;
            const r = 0.22;
            const tube = R + r * Math.cos(u);
            x = tube * Math.cos(v);
            y = tube * Math.sin(v);
            z = 0.35 * v + r * Math.sin(u);
            break;
          }

          case "sweepScaled": {
            const scale = 0.55 + 0.24 * Math.sin(0.9 * v);
            x = scale * Math.cos(u);
            y = 0.62 * scale * Math.sin(u);
            z = v;
            break;
          }

          case "sweepTwisted": {
            const theta = u + 1.6 * v;
            x = 0.72 * Math.cos(theta);
            y = 0.36 * Math.sin(theta);
            z = v;
            break;
          }

          case "ribbonRMF": {
            if (rmfRibbonEval) {
              rmfRibbonEval(u, v, target);
              return;
            }
            x = 0.3 * u;
            y = 0;
            z = v;
            break;
          }

          case "tubeConstant": {
            const r = 0.45;
            x = r * Math.cos(u);
            y = r * Math.sin(u);
            z = v;
            break;
          }

          case "tubeVariable": {
            const r = 0.3 + 0.13 * (1 + Math.sin(1.35 * v));
            x = r * Math.cos(u);
            y = r * Math.sin(u);
            z = v;
            break;
          }

          case "tubeClosed": {
            const R = 1.25;
            const r = 0.32;
            x = (R + r * Math.cos(u)) * Math.cos(v);
            y = (R + r * Math.cos(u)) * Math.sin(v);
            z = r * Math.sin(u);
            break;
          }

          case "tubeOpen": {
            const R = 1.2;
            const r = 0.24;
            const tube = R + r * Math.cos(u);
            x = tube * Math.cos(v);
            y = r * Math.sin(u);
            z = tube * Math.sin(v);
            break;
          }

          // Rotational graph type: σ(u,v) = (v cos u, v sin u, ln v)
          case "expCone":
            x = v * Math.cos(u);
            y = v * Math.sin(u);
            z = Math.log(Math.max(v, 1e-9));
            break;

          // ✅ NEW: τ(u,v) = (u cos v, u sin v, v)
          case "helicoidUV":
            x = u * Math.cos(v);
            y = u * Math.sin(v);
            z = v;
            break;

          case "boy": {
            const sqrt2 = Math.SQRT2;
            const cos2v = Math.cos(2 * v);
            const sin2v = Math.sin(2 * v);
            const cos2u = Math.cos(2 * u);
            const sin2u = Math.sin(2 * u);
            const sin3u = Math.sin(3 * u);
            const cos3u = Math.cos(3 * u);
            const denom = 2 - sqrt2 * sin3u * sin2v;
            const d = Math.abs(denom) < 1e-3 ? (denom < 0 ? -1e-3 : 1e-3) : denom;
            x = (sqrt2 * Math.cos(u) * cos2v + cos2u * sin2v) / d;
            y = (sqrt2 * Math.sin(u) * cos2v - sin2u * sin2v) / d;
            z = cos3u / d;
            break;
          }
        }

        target.set(x, y, z);
      };
    }

    const paramWrapped = (uu: number, vv: number, target: THREE.Vector3) => {
      const u = uMin + (uMax - uMin) * uu;
      const v = vMin + (vMax - vMin) * vv;
      paramFunc(u, v, target);
    };

    const geometry = new ParametricGeometry(paramWrapped, slices, stacks);
    geometry.computeVertexNormals();

    applyParamColoring(geometry, colorMode, colorPalette, { paramFunc, uMin, uMax, vMin, vMax });

    const opacity = Math.min(1, Math.max(0, materialOpacity));
    const material = new THREE.MeshStandardMaterial({
      color: colorMode === "solid" ? 0x3366cc : 0xffffff, // ✅ keep vertex colors “pure”
      metalness: materialMetalness,
      roughness: materialRoughness,
      side: THREE.DoubleSide,
      wireframe: !!wireframe,
      vertexColors: colorMode !== "solid",
      transparent: opacity < 1,
      opacity,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    surfaceObjRef.current = mesh;

    let sampleSet: SurfaceSampleSet | null = null;
    if (mesh.geometry) {
      mesh.updateMatrixWorld(true);
      sampleSet = buildSurfaceSampleSetFromViewer({
        geometry: mesh.geometry as THREE.BufferGeometry,
        worldMatrix: mesh.matrixWorld,
        maxSamples: sampleMaxPoints,
        includeUV: includeSamplesUV,
        startId: 0,
        meshKey: mesh.uuid,
      });
      const posAttr = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | null;
      if (sampleSet && posAttr) {
        const indexAttr = mesh.geometry.getIndex();
        const drawCount = getNonIndexedDrawCount(mesh.geometry as THREE.BufferGeometry, posAttr);
        const positions =
          drawCount != null
            ? (posAttr.array as Float32Array).subarray(0, drawCount * 3)
            : (posAttr.array as Float32Array);
        sampleSet.meshData = [
          {
            key: mesh.uuid,
            positions,
            indices: indexAttr ? indexAttr.array : null,
          },
        ];
      }
      if (sampleSet && includeSamplesUV) {
        sampleSet.samples.forEach((sample) => {
          if (!sample.uv) return;
          sample.uv = {
            u: uMin + (uMax - uMin) * sample.uv.u,
            v: vMin + (vMax - vMin) * sample.uv.v,
          };
        });
      }
      if (sampleSet && includeSamplesUV) {
        const count = sampleSet.samples.length;
        const K = new Float32Array(count);
        const H = new Float32Array(count);
        const k1 = new Float32Array(count);
        const k2 = new Float32Array(count);
        for (let i = 0; i < count; i++) {
          const uv = sampleSet.samples[i].uv;
          if (!uv) {
            K[i] = NaN;
            H[i] = NaN;
            k1[i] = NaN;
            k2[i] = NaN;
            continue;
          }
          const curv = computePrincipalCurvatureAtUV({
            paramFunc,
            u: uv.u,
            v: uv.v,
            uMin,
            uMax,
            vMin,
            vMax,
          });
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
        sampleSet.curvatures = { K, H, k1, k2 };
      }
    }
    sampleSetRef.current = sampleSet;
    onSampleSet?.(sampleSet);
    if (onParamGeodesicState && mesh) {
      const wrap = wrapFlagsFor(surfaceId);
      const paramWorld = (u: number, v: number, target?: THREE.Vector3) => {
        const t = target ?? new THREE.Vector3();
        paramFunc(u, v, t);
        t.applyMatrix4(mesh.matrixWorld);
        return t;
      };
      onParamGeodesicState({
        paramFunc: paramWorld,
        domain: { uMin, uMax, vMin, vMax },
        wrap,
        meshKey: mesh.uuid,
      });
    }

    // bbox for camera snapping
    const bbox = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    centerRef.current.copy(center);

    const sizeVec = new THREE.Vector3();
    bbox.getSize(sizeVec);
    radiusRef.current = sizeVec.length() * 0.5 || 3;

    // optional bounding box helper
    if (showBoundingBox) {
      const boxHelper = new THREE.Box3Helper(bbox, 0x999999);
      scene.add(boxHelper);
      extraGeoms.push(boxHelper.geometry as THREE.BufferGeometry);
      if (Array.isArray((boxHelper as any).material)) {
        (boxHelper as any).material.forEach((m: THREE.Material) => extraMats.push(m));
      } else {
        extraMats.push((boxHelper as any).material as THREE.Material);
      }
    }

    // probe marker + normal arrow
    const probeMarkerGeom = new THREE.SphereGeometry(0.06, 16, 16);
    const probeMarkerMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const probeMarker = new THREE.Mesh(probeMarkerGeom, probeMarkerMat);
    probeMarker.visible = false;
    scene.add(probeMarker);
    extraGeoms.push(probeMarkerGeom);
    extraMats.push(probeMarkerMat);

    const probeLabel = createProbeLabelSprite();
    if (probeLabel) {
      scene.add(probeLabel.sprite);
      probeLabelRef.current = probeLabel;
    } else {
      probeLabelRef.current = null;
    }

    const normalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      0.5,
      0x222266
    );
    normalArrow.visible = false;
    scene.add(normalArrow);

    // tangent plane & basis arrows
    const tangentPlaneGeom = new THREE.PlaneGeometry(0.5, 0.5);
    const tangentPlaneMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });
    const tangentPlane = new THREE.Mesh(tangentPlaneGeom, tangentPlaneMat);
    tangentPlane.visible = false;
    scene.add(tangentPlane);
    extraGeoms.push(tangentPlaneGeom);
    extraMats.push(tangentPlaneMat);

    const tangentArrow1 = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      0.5,
      0x116611
    );
    tangentArrow1.visible = false;
    scene.add(tangentArrow1);

    const tangentArrow2 = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      0.5,
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

    // shared helper
    const applyProbe = (
      point: THREE.Vector3,
      normalWorld: THREE.Vector3,
      uvDomain?: { u: number; v: number }
    ) => {
      const n = normalWorld.clone().normalize();

      probeMarker.position.copy(point);
      probeMarker.visible = true;

      normalArrow.position.copy(point);
      normalArrow.setDirection(n);
      normalArrow.visible = !!showProbeNormalRef.current;

      const tmp =
        Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);

      const e1 = new THREE.Vector3().crossVectors(tmp, n).normalize();
      const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();

      const basisMat = new THREE.Matrix4().makeBasis(e1, e2, n);

      tangentPlane.position.copy(point).add(n.clone().multiplyScalar(0.002));
      tangentPlane.setRotationFromMatrix(basisMat);
      tangentPlane.visible = !!showProbeTangentPlaneRef.current;

      tangentArrow1.position.copy(point);
      tangentArrow1.setDirection(e1);
      tangentArrow1.visible = !!showProbeTangentsRef.current;

      tangentArrow2.position.copy(point);
      tangentArrow2.setDirection(e2);
      tangentArrow2.visible = !!showProbeTangentsRef.current;

      // store last uv for geodesic
      setProbeUV(uvDomain ?? null);

      const probeLabel = probeLabelRef.current;
      if (probeLabel) {
        const lines = [
          `p: (${formatProbeNumber(point.x)}, ${formatProbeNumber(point.y)}, ${formatProbeNumber(point.z)})`,
          `n: (${formatProbeNumber(n.x)}, ${formatProbeNumber(n.y)}, ${formatProbeNumber(n.z)})`,
          uvDomain
            ? `uv: (${formatProbeNumber(uvDomain.u)}, ${formatProbeNumber(uvDomain.v)})`
            : "",
        ].filter(Boolean) as string[];
        drawProbeLabelSprite(probeLabel, lines);
        const labelPos = point.clone().add(n.clone().multiplyScalar(0.12));
        const viewOffset = camera.position.clone().sub(point).normalize().multiplyScalar(0.08);
        probeLabel.sprite.position.copy(labelPos.add(viewOffset));
        probeLabel.sprite.visible = true;
      }

      const cb = onProbeRef.current;
      if (cb) {
        cb({
          point: { x: point.x, y: point.y, z: point.z },
          normal: { x: n.x, y: n.y, z: n.z },
          uv: uvDomain,
        });
      }
    };

    // store for reverse probe + geodesic drawing
    viewerRef.current = { scene, paramFunc, uMin, uMax, vMin, vMax, applyProbe };
    setSceneEpoch((v) => v + 1);

    // raycaster for surface click
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

      const handlePointerDown = (event: PointerEvent) => {
        console.log("[ParamSurfaceViewer] pointer down", {
          selectRegionEnabled: selectRegionEnabledRef.current,
          probeEnabled: probeEnabledRef.current,
          geodesicPathEnabled: geodesicPathEnabledRef.current,
          geodesicHeatEnabled: geodesicHeatEnabledRef.current,
          geodesicDiskPickEnabled: geodesicDiskPickEnabledRef.current,
        });
        if (
          !(showChartGridRef.current && surfaceCellSelectionEnabledRef.current) &&
          !probeEnabledRef.current &&
          !selectRegionEnabledRef.current &&
          !inspectEnabledRef.current &&
          !geodesicPathEnabledRef.current &&
          !geodesicHeatEnabledRef.current &&
          !geodesicDiskPickEnabledRef.current
        )
          return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointer.set(x, y);

      raycaster.setFromCamera(pointer, camera);
      const gridPickMesh = chartGridPickMeshRef.current;
      if (showChartGridRef.current && surfaceCellSelectionEnabledRef.current && gridPickMesh) {
        const cellHits = raycaster.intersectObject(gridPickMesh, false);
        if (cellHits.length) {
          const faceIndex = cellHits[0].faceIndex ?? -1;
          const cellIndex = faceIndex >= 0 ? Math.floor(faceIndex / 2) : -1;
          const cell = cellIndex >= 0 ? chartGridCellsRef.current[cellIndex] : null;
          if (cell) {
            setSelectedSurfaceCellIndex(cellIndex);
            setSelectedSurfaceCellInfo(cell);
            if (
              !probeEnabledRef.current &&
              !selectRegionEnabledRef.current &&
              !inspectEnabledRef.current &&
              !geodesicPathEnabledRef.current &&
              !geodesicHeatEnabledRef.current &&
              !geodesicDiskPickEnabledRef.current
            ) {
              return;
            }
          }
        }
      }
      const intersects = raycaster.intersectObjects([mesh], true);
      if (!intersects.length) return;

      const hit = intersects[0];
      const point = hit.point.clone();

      let normalWorld = new THREE.Vector3(0, 1, 0);
      if (hit.face) {
        normalWorld.copy(hit.face.normal);
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
        normalWorld.applyMatrix3(normalMatrix).normalize();
      } else if ((hit as any).normal) {
        normalWorld.copy((hit as any).normal).normalize();
      }

      let uvDomain: { u: number; v: number } | undefined;
      if (hit.uv) {
        const uu = hit.uv.x;
        const vv = hit.uv.y;
        const u = uMin + (uMax - uMin) * uu;
        const v = vMin + (vMax - vMin) * vv;
        uvDomain = { u, v };
      }

        if (geodesicDiskPickEnabledRef.current) {
          const diskCb = onGeodesicDiskPickRef.current;
          if (diskCb) {
            const geom = mesh.geometry as THREE.BufferGeometry;
            const faceIndex = (hit as any).faceIndex;
            if (geom && typeof faceIndex === "number") {
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
                    uv: uvDomain,
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
            const geom = mesh.geometry as THREE.BufferGeometry;
            const faceIndex = (hit as any).faceIndex;
            if (geom && typeof faceIndex === "number") {
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
            const sampleSet = sampleSetRef.current;
            let nearest: { index: number; sample: SurfaceSample } | null = null;
            if (sampleSet?.samples.length) {
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
              if (bestIdx >= 0) nearest = { index: bestIdx, sample: sampleSet.samples[bestIdx] };
            }
            pathCb({
              point: { x: point.x, y: point.y, z: point.z },
              normal: { x: normalWorld.x, y: normalWorld.y, z: normalWorld.z },
              uv: uvDomain,
              sampleIndex: nearest?.index,
              meshKey: nearest?.sample.meshKey,
              vertexIndex: nearest?.sample.vertexIndex,
            });
          }
          return;
        }

        if (inspectEnabledRef.current) {
          const inspectCb = onInspectPickRef.current;
          if (inspectCb) {
            const sampleSet = sampleSetRef.current;
          if (sampleSet?.samples.length) {
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
            if (bestIdx >= 0) {
              const sample = sampleSet.samples[bestIdx];
              const inspectNormal = sample.normal.clone().normalize();
              inspectCb({
                index: bestIdx,
                point: { x: sample.position.x, y: sample.position.y, z: sample.position.z },
                normal: { x: inspectNormal.x, y: inspectNormal.y, z: inspectNormal.z },
                uv: uvDomain,
              });
            }
          }
        }
        return;
      }

      if (probeEnabledRef.current) {
        applyProbe(point, normalWorld, uvDomain);
      }

      const selectionCb = onSelectionPickRef.current;
      if (selectRegionEnabledRef.current && selectionCb) {
        let nearest: { index: number; sample: SurfaceSampleSet["samples"][number] } | null = null;
        const sampleSet = sampleSetRef.current;
        if (sampleSet?.samples.length) {
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
          if (bestIdx >= 0) {
            nearest = { index: bestIdx, sample: sampleSet.samples[bestIdx] };
          }
        }
        console.log("[ParamSurfaceViewer] selection pick", {
          point: { x: point.x, y: point.y, z: point.z },
          normal: { x: normalWorld.x, y: normalWorld.y, z: normalWorld.z },
          uv: uvDomain,
        });
        selectionCb({
          point: { x: point.x, y: point.y, z: point.z },
          normal: { x: normalWorld.x, y: normalWorld.y, z: normalWorld.z },
          uv: uvDomain,
          sampleIndex: nearest?.index,
          meshKey: nearest?.sample.meshKey,
          vertexIndex: nearest?.sample.vertexIndex,
        });
      }
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    let frameId = 0;
    let pageVisible = document.visibilityState !== "hidden";
    const handleVisibilityChange = () => {
      pageVisible = document.visibilityState !== "hidden";
      if (pageVisible) {
        renderSoon();
        onResize();
      }
    };
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (!pageVisible) return;
      if (sliceDirtyRef.current && surfaceObjRef.current) {
        updateSlice(surfaceObjRef.current);
        sliceDirtyRef.current = false;
        renderSoon();
      }
      const now = performance.now();
      const hasContinuousMotion =
        controlsInteractionActive ||
        cameraTourFrameRef.current != null ||
        zoomAnimRef.current != null;
      const idleRenderMinFrameMs = isVmSafeGraphicsMode()
        ? VM_SAFE_IDLE_RENDER_MIN_FRAME_MS
        : IDLE_RENDER_MIN_FRAME_MS;
      if (!hasContinuousMotion && now - lastRenderedAt < idleRenderMinFrameMs) {
        return;
      }
      if (hasContinuousMotion) controls.update();
      lastRenderedAt = now;
      renderer.render(scene, camera);
    };
    animate();

    const syncRendererSize = (reframe = false) => {
      const { width: rawWidth, height: rawHeight } = getSize();
      if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight)) return;

      const w = Math.max(1, Math.round(rawWidth));
      const h = Math.max(1, Math.round(rawHeight));
      const nextDevicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
      const nextTargetPixelRatio = nextDevicePixelRatio * qualityScale;
      renderer.setPixelRatio(vmSafePixelRatio(nextTargetPixelRatio, maxPixelRatio));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderSoon();

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
    const onResize = () => {
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

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);
    onResize();
    emitViewportDebug("init");

      return () => {
        resourceDiagnostics.snapshot("before-cleanup");
        // dispose geodesic line if present
        if (geodesicLineRef.current) {
          scene.remove(geodesicLineRef.current);
          geodesicLineRef.current.geometry.dispose();
          (geodesicLineRef.current.material as THREE.Material).dispose();
          geodesicLineRef.current = null;
        }
        if (geodesicPathLineRef.current) {
          scene.remove(geodesicPathLineRef.current);
          geodesicPathLineRef.current.geometry.dispose();
          (geodesicPathLineRef.current.material as THREE.Material).dispose();
          geodesicPathLineRef.current = null;
        }
        if (geodesicPathRawLineRef.current) {
          scene.remove(geodesicPathRawLineRef.current);
          geodesicPathRawLineRef.current.geometry.dispose();
          (geodesicPathRawLineRef.current.material as THREE.Material).dispose();
          geodesicPathRawLineRef.current = null;
        }
        if (geodesicPathMarkersRef.current.start) {
          scene.remove(geodesicPathMarkersRef.current.start);
          geodesicPathMarkersRef.current.start.geometry.dispose();
          (geodesicPathMarkersRef.current.start.material as THREE.Material).dispose();
          geodesicPathMarkersRef.current.start = null;
        }
        if (geodesicPathMarkersRef.current.end) {
          scene.remove(geodesicPathMarkersRef.current.end);
          geodesicPathMarkersRef.current.end.geometry.dispose();
          (geodesicPathMarkersRef.current.end.material as THREE.Material).dispose();
          geodesicPathMarkersRef.current.end = null;
        }
        if (geodesicHeatLineRef.current) {
          scene.remove(geodesicHeatLineRef.current);
          geodesicHeatLineRef.current.traverse(disposeObject3D);
          geodesicHeatLineRef.current = null;
        }
        if (geodesicHeatMarkersRef.current.start) {
          scene.remove(geodesicHeatMarkersRef.current.start);
          geodesicHeatMarkersRef.current.start.geometry.dispose();
          (geodesicHeatMarkersRef.current.start.material as THREE.Material).dispose();
          geodesicHeatMarkersRef.current.start = null;
        }
        if (geodesicHeatMarkersRef.current.end) {
          scene.remove(geodesicHeatMarkersRef.current.end);
          geodesicHeatMarkersRef.current.end.geometry.dispose();
          (geodesicHeatMarkersRef.current.end.material as THREE.Material).dispose();
          geodesicHeatMarkersRef.current.end = null;
        }

        viewerRef.current = null;
        forceReframeRef.current = null;
        if (resizeFrameId) cancelAnimationFrame(resizeFrameId);
        if (resizeTimeoutId) clearTimeout(resizeTimeoutId);
        ro.disconnect();
        window.removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        cancelAnimationFrame(frameId);
        controls.removeEventListener("change", handleControlsChangeDebug);
        controls.removeEventListener("start", handleControlsStart);
        controls.removeEventListener("end", handleControlsEnd);
        renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
        if (isCameraLeader && onCameraSync) {
          controls.removeEventListener("change", emitCameraSync);
        }
        controls.dispose();
        if (referenceGridOverlay) {
          scene.remove(referenceGridOverlay.group);
          referenceGridOverlay.dispose();
          referenceGridOverlay = null;
        }
        geometry.dispose();
        material.dispose();
        extraGeoms.forEach((g) => g.dispose());
        extraMats.forEach((m) => m.dispose());

      labelSprites.forEach((s) => {
        const mat = s.material as THREE.SpriteMaterial;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
      if (probeLabelRef.current) {
        scene.remove(probeLabelRef.current.sprite);
        const mat = probeLabelRef.current.sprite.material as THREE.SpriteMaterial;
        if (mat.map) mat.map.dispose();
        mat.dispose();
        probeLabelRef.current = null;
      }

      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      removeWebGLContextLogger();
      resourceDiagnostics.unregister("after-cleanup");
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      rendererRef.current = null;

      sampleSetRef.current = null;
      onSampleSet?.(null);
      onParamGeodesicState?.(null);

      if (sliceLinesRef.current) sliceLinesRef.current.geometry.dispose();
      if (sliceMatRef.current) sliceMatRef.current.dispose();
      if (sliceSheetsRef.current) {
        sliceSheetsRef.current.traverse((obj) => {
          const m = (obj as any).material as THREE.Material | undefined;
          if (m) m.dispose();
          const g = (obj as any).geometry as THREE.BufferGeometry | undefined;
          if (g) g.dispose();
        });
      }
      if (sliceGroupRef.current) {
        clearGroup(sliceGroupRef.current);
        scene.remove(sliceGroupRef.current);
      }
      sliceLinesRef.current = null;
      sliceMatRef.current = null;
      sliceSheetsRef.current = null;
      sliceGroupRef.current = null;

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

      if (diagnosticsGroupRef.current) {
        clearGroup(diagnosticsGroupRef.current);
        scene.remove(diagnosticsGroupRef.current);
        diagnosticsGroupRef.current = null;
        driftArrowRef.current = null;
      }

      if (gaussHighlightRef.current) {
        scene.remove(gaussHighlightRef.current);
        gaussHighlightRef.current.geometry.dispose();
        (gaussHighlightRef.current.material as THREE.Material).dispose();
        gaussHighlightRef.current = null;
      }

      if (principalProjectionGroupRef.current) {
        scene.remove(principalProjectionGroupRef.current);
        principalProjectionGroupRef.current.traverse(disposeObject3D);
        principalProjectionGroupRef.current = null;
      }

      if (selectionOverlayRef.current) {
        scene.remove(selectionOverlayRef.current);
        selectionOverlayRef.current.geometry.dispose();
        (selectionOverlayRef.current.material as THREE.Material).dispose();
        selectionOverlayRef.current = null;
      }

      if (selectionSphereRef.current) {
        scene.remove(selectionSphereRef.current);
        selectionSphereRef.current.geometry.dispose();
        (selectionSphereRef.current.material as THREE.Material).dispose();
        selectionSphereRef.current = null;
      }
      if (inspectMarkerRef.current) {
        scene.remove(inspectMarkerRef.current);
        inspectMarkerRef.current.geometry.dispose();
        (inspectMarkerRef.current.material as THREE.Material).dispose();
        inspectMarkerRef.current = null;
      }

      surfaceObjRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, [
    surfaceId,
    customX,
    customY,
    customZ,
    rotationalProfileMode,
    rotationalProfileRExpr,
    rotationalProfileZExpr,
    rotationalProfilePointsText,
    rotationalAxisOrigin?.x,
    rotationalAxisOrigin?.y,
    rotationalAxisOrigin?.z,
    rotationalAxisDirection?.x,
    rotationalAxisDirection?.y,
    rotationalAxisDirection?.z,
    rmfRibbonTwistEnabled,
    rmfRibbonTwistTurns,
    wireframe,
    showPlanes,
    planeGridShowGrid,
    planeGridShowMinor,
    planeGridShowLabels,
    planeGridShowXY,
    planeGridShowXZ,
    planeGridShowYZ,
    planeGridAutoScale,
    planeGridDensity,
    planeGridOpacity,
    lightPreset,
    colorMode,
    showBoundingBox,
    renderQuality,
    reframePaddingFactor,
    resetToken,
    surfaceParamResolution,
    weierstrassGExpr,
    weierstrassPhiExpr,
    splineSettings?.bezierControlGridText,
    splineSettings?.bSplineControlGridText,
    splineSettings?.bSplineDegreeU,
    splineSettings?.bSplineDegreeV,
    splineSettings?.bSplineKnotUText,
    splineSettings?.bSplineKnotVText,
    splineSettings?.nurbsControlGridText,
    splineSettings?.nurbsDegreeU,
    splineSettings?.nurbsDegreeV,
    splineSettings?.nurbsKnotUText,
    splineSettings?.nurbsKnotVText,
    splineSettings?.nurbsWeightsText,
    weierstrassResolution,
    weierstrassRecenter,
    weierstrassError,
    paramDomain?.uMin,
    paramDomain?.uMax,
    paramDomain?.vMin,
    paramDomain?.vMax,
    isCameraLeader,
    onCameraSync,
    onWeierstrassError,
    onParamGeodesicState,
    resolveSceneBackground,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return;
    const background = resolveSceneBackground();
    scene.background = background.scene;
    renderer.setClearColor(background.color, background.alpha);
  }, [resolveSceneBackground]);

  useEffect(() => {
    const widgets = probeWidgetsRef.current;
    if (!widgets) return;
    const hasProbe = widgets.marker.visible;

    widgets.normal.visible = hasProbe && showProbeNormal;
    widgets.plane.visible = hasProbe && showProbeTangentPlane;
    const showT = hasProbe && showProbeTangents;
    widgets.t1.visible = showT;
    widgets.t2.visible = showT;
    if (probeLabelRef.current) {
      probeLabelRef.current.sprite.visible = hasProbe;
    }
  }, [showProbeNormal, showProbeTangentPlane, showProbeTangents]);

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
      position: { x: sample.position.x, y: sample.position.y, z: sample.position.z },
      normal: { x: sample.normal.x, y: sample.normal.y, z: sample.normal.z },
    }));
    onGaussPoints(pts);
  }, [sceneEpoch, gaussMapEnabled, onGaussPoints, surfaceId]);

  useEffect(() => {
    const st = viewerRef.current;
    const scene = st?.scene;
    const sampleSet = sampleSetRef.current;
    if (!scene) return;

    if (selectionOverlayRef.current) {
      scene.remove(selectionOverlayRef.current);
      selectionOverlayRef.current.geometry.dispose();
      (selectionOverlayRef.current.material as THREE.Material).dispose();
      selectionOverlayRef.current = null;
    }

    if (!selectionOverlayVisible || !selectionMask || !sampleSet || !selectionMask.count) {
      return;
    }

    const positions = new Float32Array(selectionMask.count * 3);
    let ptr = 0;
    for (let i = 0; i < selectionMask.selected.length; i++) {
      if (!selectionMask.selected[i]) continue;
      const sample = sampleSet.samples[i];
      if (!sample) continue;
      positions[3 * ptr] = sample.position.x;
      positions[3 * ptr + 1] = sample.position.y;
      positions[3 * ptr + 2] = sample.position.z;
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
    scene.add(overlay);
    selectionOverlayRef.current = overlay;

    return () => {
      if (selectionOverlayRef.current === overlay) {
        scene.remove(overlay);
        geometry.dispose();
        material.dispose();
        selectionOverlayRef.current = null;
      }
    };
  }, [selectionMask, sceneEpoch, selectionOverlayVisible, selectionOverlayOnTop]);

  useEffect(() => {
    const st = viewerRef.current;
    const scene = st?.scene;
    if (!scene) return;

    if (selectionSphereRef.current) {
      scene.remove(selectionSphereRef.current);
      selectionSphereRef.current.geometry.dispose();
      (selectionSphereRef.current.material as THREE.Material).dispose();
      selectionSphereRef.current = null;
    }

    if (!selectionSphere) return;

    const geometry = new THREE.SphereGeometry(selectionSphere.radius, 24, 18);
    const material = new THREE.MeshBasicMaterial({
      color: 0x800000,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(selectionSphere.center.x, selectionSphere.center.y, selectionSphere.center.z);
    sphere.renderOrder = 25;
    scene.add(sphere);
    selectionSphereRef.current = sphere;

    return () => {
      if (selectionSphereRef.current === sphere) {
        scene.remove(sphere);
        geometry.dispose();
        material.dispose();
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
    const st = viewerRef.current;
    const scene = st?.scene;
    if (!scene) return;

    if (inspectMarkerRef.current) {
      scene.remove(inspectMarkerRef.current);
      inspectMarkerRef.current.geometry.dispose();
      (inspectMarkerRef.current.material as THREE.Material).dispose();
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
        geometry.dispose();
        material.dispose();
        inspectMarkerRef.current = null;
      }
    };
  }, [inspectPoint, sceneEpoch]);

  useEffect(() => {
    const st = viewerRef.current;
    const scene = st?.scene;
    const surfaceObj = surfaceObjRef.current;
    if (!scene || !surfaceObj) return;

    const clearMarker = (marker: THREE.Mesh | null) => {
      if (!marker) return;
      scene.remove(marker);
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
    };

    if (geodesicPathLineRef.current) {
      scene.remove(geodesicPathLineRef.current);
      geodesicPathLineRef.current.geometry.dispose();
      (geodesicPathLineRef.current.material as THREE.Material).dispose();
      geodesicPathLineRef.current = null;
    }
    if (geodesicPathRawLineRef.current) {
      scene.remove(geodesicPathRawLineRef.current);
      geodesicPathRawLineRef.current.geometry.dispose();
      (geodesicPathRawLineRef.current.material as THREE.Material).dispose();
      geodesicPathRawLineRef.current = null;
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
    if (!posAttr) return;
    const uvAttr = geometry.getAttribute("uv") as THREE.BufferAttribute | null;
    const { paramFunc, uMin, uMax, vMin, vMax } = st;
    const uRange = uMax - uMin;
    const vRange = vMax - vMin;

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
        rawUVs.push({
          u: uMin + uRange * uvAttr.getX(idx),
          v: vMin + vRange * uvAttr.getY(idx),
        });
      }
    }
    if (rawPoints.length < 2) return;

    if (geodesicPathDebug) {
      const rawLineGeom = new THREE.BufferGeometry().setFromPoints(rawPoints);
      const rawLineMat = new THREE.LineDashedMaterial({
        color: 0x8c8c8c,
        transparent: true,
        opacity: 0.55,
        dashSize: 0.05,
        gapSize: 0.03,
      });
      const rawLine = new THREE.Line(rawLineGeom, rawLineMat);
      rawLine.computeLineDistances();
      rawLine.renderOrder = 214;
      rawLine.frustumCulled = false;
      scene.add(rawLine);
      geodesicPathRawLineRef.current = rawLine;
    }

    const smoothFromUVs = (): THREE.Vector3[] | null => {
      if (!uvAttr || rawUVs.length !== rawPoints.length) return null;
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

      const { wrapU, wrapV } = wrapFlagsFor(surfaceId);
      const unwrapped: { u: number; v: number }[] = [];
      let prev = dedupUVs[0];
      unwrapped.push({ u: prev.u, v: prev.v });
      for (let i = 1; i < dedupUVs.length; i++) {
        let u = dedupUVs[i].u;
        let v = dedupUVs[i].v;
        if (wrapU && Number.isFinite(uRange) && uRange > 0) {
          const du = u - prev.u;
          if (du > 0.5 * uRange) u -= uRange;
          else if (du < -0.5 * uRange) u += uRange;
        }
        if (wrapV && Number.isFinite(vRange) && vRange > 0) {
          const dv = v - prev.v;
          if (dv > 0.5 * vRange) v -= vRange;
          else if (dv < -0.5 * vRange) v += vRange;
        }
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
      if (smoothedPoints.length >= 2) {
        smoothedPoints[0].copy(rawPoints[0]);
        smoothedPoints[smoothedPoints.length - 1].copy(rawPoints[rawPoints.length - 1]);
        return smoothedPoints;
      }
      return null;
    };

    const tryGeodesicShooting = (opts?: {
      span?: number;
      samples?: number;
      refineIters?: number;
      acceptFactor?: number;
      maxArcFactor?: number;
      stepScale?: number;
    }): THREE.Vector3[] | null => {
      if (!uvAttr || rawUVs.length !== rawPoints.length) return null;
      const { wrapU, wrapV } = wrapFlagsFor(surfaceId);
      const unwrapDelta = (a: number, b: number, range: number, wrap: boolean) => {
        let d = b - a;
        if (wrap && Number.isFinite(range) && range > 0) {
          if (d > 0.5 * range) d -= range;
          else if (d < -0.5 * range) d += range;
        }
        return d;
      };

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
      const stepScale = opts?.stepScale ?? 0.4;
      const steps = Math.min(1800, Math.max(320, Math.ceil(rawLen / Math.max(1e-5, maxSegment * stepScale))));
      const maxArcFactor = opts?.maxArcFactor ?? 1.05;
      const maxArcLength = rawLen * maxArcFactor;

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

      const span = opts?.span ?? Math.PI;
      const samples = opts?.samples ?? 17;
      let best = { pts: [] as THREE.Vector3[], err: Number.POSITIVE_INFINITY, theta: 0 };
      for (let i = 0; i < samples; i++) {
        const t = -span + (2 * span * i) / (samples - 1);
        const candidate = shoot(t);
        if (candidate.err < best.err) best = candidate;
      }

      let step = span / Math.max(1, samples - 1);
      const refineIters = opts?.refineIters ?? 6;
      for (let iter = 0; iter < refineIters; iter++) {
        const left = shoot(best.theta - step);
        const right = shoot(best.theta + step);
        if (left.err < best.err) best = left;
        if (right.err < best.err) best = right;
        step *= 0.5;
      }

      const acceptFactor = opts?.acceptFactor ?? 0.35;
      const acceptErr = Math.max(rawLen * acceptFactor, maxSegment * 6);
      if (best.pts.length >= 2 && best.err < acceptErr) {
        best.pts[0] = rawPoints[0].clone();
        best.pts[best.pts.length - 1] = rawPoints[rawPoints.length - 1].clone();
        if (geodesicPathDebug) {
          console.log("[geodesic][shoot]", {
            surfaceId,
            err: best.err,
            rawLen,
            theta: best.theta,
            steps,
          });
        }
        return best.pts;
      }
      return null;
    };

    let drawPoints = rawPoints;
    let smoothedApplied = false;
    if (geodesicPathSmooth && surfaceId === "sphere") {
      const start = rawPoints[0];
      const end = rawPoints[rawPoints.length - 1];
      const aLen = start.length();
      const bLen = end.length();
      const r = (aLen + bLen) * 0.5;
      if (r > 1e-8 && aLen > 1e-8 && bLen > 1e-8) {
        const n0 = start.clone().multiplyScalar(1 / aLen);
        const n1 = end.clone().multiplyScalar(1 / bLen);
        const dot = Math.min(1, Math.max(-1, n0.dot(n1)));
        const angle = Math.acos(dot);
        if (Number.isFinite(angle)) {
          const sizeHint = radiusRef.current || r;
          const maxSegment = Math.max(0.008, sizeHint / 160);
          const arcLen = r * angle;
          const segments = Math.min(720, Math.max(12, Math.ceil(arcLen / maxSegment)));
          const points: THREE.Vector3[] = [];
          if (angle < 1e-6) {
            points.push(start.clone(), end.clone());
          } else if (Math.abs(Math.PI - angle) < 1e-4) {
            let axis = new THREE.Vector3(1, 0, 0);
            if (Math.abs(n0.dot(axis)) > 0.9) axis.set(0, 1, 0);
            axis = axis.cross(n0).normalize();
            const q = new THREE.Quaternion();
            for (let i = 0; i <= segments; i++) {
              const t = i / segments;
              q.setFromAxisAngle(axis, angle * t);
              points.push(n0.clone().applyQuaternion(q).multiplyScalar(r));
            }
          } else {
            const sinAngle = Math.sin(angle);
            for (let i = 0; i <= segments; i++) {
              const t = i / segments;
              const s0 = Math.sin((1 - t) * angle) / sinAngle;
              const s1 = Math.sin(t * angle) / sinAngle;
              const p = n0.clone().multiplyScalar(s0).addScaledVector(n1, s1).multiplyScalar(r);
              points.push(p);
            }
          }
          if (points.length >= 2) {
            drawPoints = points;
            smoothedApplied = true;
          }
        }
      }
    } else if (geodesicPathSmooth && (surfaceId === "catenoid" || surfaceId === "ellipsoid")) {
      const shot = tryGeodesicShooting({
        span: Math.PI,
        samples: surfaceId === "ellipsoid" ? 21 : 17,
        refineIters: 6,
        acceptFactor: surfaceId === "ellipsoid" ? 0.4 : 0.35,
        maxArcFactor: 1.05,
        stepScale: 0.35,
      });
      if (shot) {
        drawPoints = shot;
        smoothedApplied = true;
      } else {
        const fallback = smoothFromUVs();
        if (fallback) {
          drawPoints = fallback;
          smoothedApplied = true;
        }
      }
    }

    if (!smoothedApplied && geodesicPathSmooth) {
      const fallback = smoothFromUVs();
      if (fallback) {
        drawPoints = fallback;
        smoothedApplied = true;
      }
    }

    const lineGeom = new THREE.BufferGeometry().setFromPoints(drawPoints);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff6b00, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(lineGeom, lineMat);
    line.renderOrder = 215;
    line.frustumCulled = false;
    scene.add(line);
    geodesicPathLineRef.current = line;
  }, [
    geodesicPathDebug,
    geodesicPathEnd,
    geodesicPathIndices,
    geodesicPathSmooth,
    geodesicPathStart,
    sceneEpoch,
    surfaceId,
  ]);

  useEffect(() => {
    const st = viewerRef.current;
    const scene = st?.scene;
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
    customX,
    customY,
    customZ,
    rotationalProfileMode,
    rotationalProfileRExpr,
    rotationalProfileZExpr,
    rotationalProfilePointsText,
    rotationalAxisOrigin?.x,
    rotationalAxisOrigin?.y,
    rotationalAxisOrigin?.z,
    rotationalAxisDirection?.x,
    rotationalAxisDirection?.y,
    rotationalAxisDirection?.z,
    rmfRibbonTwistEnabled,
    rmfRibbonTwistTurns,
    surfaceParamResolution,
    weierstrassGExpr,
    weierstrassPhiExpr,
    weierstrassResolution,
    weierstrassRecenter,
    paramDomain?.uMin,
    paramDomain?.uMax,
    paramDomain?.vMin,
    paramDomain?.vMax,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (overlayPolylineGroupsRef.current) {
      scene.remove(overlayPolylineGroupsRef.current);
      overlayPolylineGroupsRef.current.traverse(disposeObject3D);
      overlayPolylineGroupsRef.current = null;
    }

    if (!overlayPolylineGroups?.length) return;

    const group = new THREE.Group();
    const sizeHint = radiusRef.current || 3;
    const baseRadius = Math.max(0.0025, (sizeHint / 160) * 0.9);
    const radialSegments = 10;

    for (const entry of overlayPolylineGroups) {
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
        const tubularSegments = Math.min(1600, Math.max(80, points.length * 2));
        const geom = new THREE.TubeGeometry(path, tubularSegments, tubeRadius, radialSegments, false);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = 230;
        mesh.frustumCulled = false;
        group.add(mesh);
      }
    }

    if (!group.children.length) return;
    scene.add(group);
    overlayPolylineGroupsRef.current = group;
  }, [overlayPolylineGroups, sceneEpoch]);

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
    const st = viewerRef.current;
    const scene = st?.scene;
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

    if (!showPrincipalGlyphs) return;

    const sampleSet = sampleSetRef.current;
    if (!sampleSet || !sampleSet.samples.length) return;

    const { paramFunc, uMin, uMax, vMin, vMax } = st;
    const stride = Math.max(1, Math.floor(principalGlyphDensity));
    const baseLength =
      principalGlyphLength > 0
        ? principalGlyphLength
        : Math.max(0.03, (radiusRef.current || 3) * 0.12);
    const includeDir2 = principalGlyphMode !== "d1";
    const offset = Math.max(0.001, (radiusRef.current || 3) * 0.0015);

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
      if (!sample?.uv) continue;

      const res = computePrincipalCurvatureAtUV({
        paramFunc,
        u: sample.uv.u,
        v: sample.uv.v,
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
    showPrincipalGlyphs,
    principalGlyphDensity,
    principalGlyphLength,
    principalGlyphMode,
    sceneEpoch,
  ]);

  const getPrincipalField = () => {
    const key = [
      surfaceId,
      customX ?? "",
      customY ?? "",
      customZ ?? "",
      rotationalProfileMode,
      rotationalProfileRExpr ?? "",
      rotationalProfileZExpr ?? "",
      rotationalProfilePointsText ?? "",
      rotationalAxisOrigin?.x ?? "",
      rotationalAxisOrigin?.y ?? "",
      rotationalAxisOrigin?.z ?? "",
      rotationalAxisDirection?.x ?? "",
      rotationalAxisDirection?.y ?? "",
      rotationalAxisDirection?.z ?? "",
      paramDomain?.uMin ?? "",
      paramDomain?.uMax ?? "",
      paramDomain?.vMin ?? "",
      paramDomain?.vMax ?? "",
      sceneEpoch,
    ].join("|");
    const cached = principalFieldRef.current;
    if (cached && cached.key === key) return cached.data;

    const st = viewerRef.current;
    const obj = surfaceObjRef.current;
    const mesh = obj as THREE.Mesh | null;
    const geometry = mesh?.geometry as THREE.BufferGeometry | undefined;
    if (!st || !geometry) {
      principalFieldRef.current = { key, data: null };
      return null;
    }

    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute | null;
    const uvAttr = geometry.getAttribute("uv") as THREE.BufferAttribute | null;
    if (!posAttr || !uvAttr) {
      principalFieldRef.current = { key, data: null };
      return null;
    }
    const positions = posAttr.array as Float32Array;

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

    const { paramFunc, uMin, uMax, vMin, vMax } = st;
    const vertexCount = posAttr.count;
    const k1 = new Float32Array(vertexCount);
    const k2 = new Float32Array(vertexCount);
    const d1 = new Float32Array(vertexCount * 3);
    const d2 = new Float32Array(vertexCount * 3);
    const uRange = uMax - uMin || 1;
    const vRange = vMax - vMin || 1;

    for (let i = 0; i < vertexCount; i++) {
      const u = uMin + uvAttr.getX(i) * uRange;
      const v = vMin + uvAttr.getY(i) * vRange;
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

    const index = geometry.getIndex() ? geometry.getIndex()!.array : null;
    const data: PrincipalField = { positions, normals, k1, k2, d1, d2, vertexCount, index };
    principalFieldRef.current = { key, data };
    return data;
  };

  useEffect(() => {
    const st = viewerRef.current;
    const scene = st?.scene;
    if (!scene) return;

    if (curvatureLinesRef.current) {
      scene.remove(curvatureLinesRef.current);
      curvatureLinesRef.current.geometry.dispose();
      (curvatureLinesRef.current.material as THREE.Material).dispose();
      curvatureLinesRef.current = null;
    }

    if (!showCurvatureLines) return;
    const field = getPrincipalField();
    if (!field) return;

    const { positions, normals, d1, d2, vertexCount, index } = field;
    const neighbors = buildVertexAdjacency(index, vertexCount, positions);
    const dirField = curvatureLineField === "d2" ? d2 : d1;
    const maxSteps = Math.max(10, Math.floor(curvatureMaxSteps));
    const maxLines = Math.max(1, Math.floor(curvatureMaxLines));
    const stride = Math.max(1, Math.floor(curvatureSeedDensity));
    const bboxDiag = (radiusRef.current || 3) * 2;
    const stepSize = curvatureStepSize > 0 ? curvatureStepSize : Math.max(1e-4, bboxDiag / 200);

    const seeds: number[] = [];
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
        seeds.push(seed);
      }
    }

    if (!seeds.length) {
      for (let i = 0; i < vertexCount && seeds.length < maxLines; i += stride) {
        seeds.push(i);
      }
    }

    const paths: number[][] = [];
    for (let i = 0; i < seeds.length && paths.length < maxLines; i++) {
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
    customX,
    customY,
    customZ,
    rotationalProfileMode,
    rotationalProfileRExpr,
    rotationalProfileZExpr,
    rotationalProfilePointsText,
    rotationalAxisOrigin?.x,
    rotationalAxisOrigin?.y,
    rotationalAxisOrigin?.z,
    rotationalAxisDirection?.x,
    rotationalAxisDirection?.y,
    rotationalAxisDirection?.z,
    rmfRibbonTwistEnabled,
    rmfRibbonTwistTurns,
    paramDomain?.uMin,
    paramDomain?.uMax,
    paramDomain?.vMin,
    paramDomain?.vMax,
    sceneEpoch,
  ]);

  useEffect(() => {
    const st = viewerRef.current;
    const scene = st?.scene;
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

    const field = getPrincipalField();
    if (!field) return;

    const { positions, k1, k2, d1, d2, vertexCount, index } = field;
    const neighbors = buildRidgeAdjacency(index, vertexCount);
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
    customX,
    customY,
    customZ,
    rotationalProfileMode,
    rotationalProfileRExpr,
    rotationalProfileZExpr,
    rotationalProfilePointsText,
    rotationalAxisOrigin?.x,
    rotationalAxisOrigin?.y,
    rotationalAxisOrigin?.z,
    rotationalAxisDirection?.x,
    rotationalAxisDirection?.y,
    rotationalAxisDirection?.z,
    rmfRibbonTwistEnabled,
    rmfRibbonTwistTurns,
    paramDomain?.uMin,
    paramDomain?.uMax,
    paramDomain?.vMin,
    paramDomain?.vMax,
    sceneEpoch,
  ]);

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
    const group = diagnosticsGroupRef.current;
    if (!group) return;

    let arrow = driftArrowRef.current;
    if (!arrow) {
      arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, 0xff6b35, 0.24, 0.14);
      const lineMat = arrow.line.material;
      if (Array.isArray(lineMat)) lineMat.forEach((mat) => { mat.depthTest = false; });
      else lineMat.depthTest = false;
      arrow.renderOrder = 999;
      group.add(arrow);
      driftArrowRef.current = arrow;
    }

    if (
      surfaceId !== "weierstrass" ||
      !showDriftArrow ||
      !weierstrassDiagnostics ||
      "errorMessage" in weierstrassDiagnostics
    ) {
      arrow.visible = false;
      return;
    }

    const driftVec = weierstrassDiagnostics.driftVec.clone();
    const driftLen = driftVec.length();
    if (driftLen < 1e-8) {
      arrow.visible = false;
      return;
    }

    const arrowLength = Math.max(0.35, Math.min(3, driftLen * 40 + 0.2));
    arrow.position.set(0, 0, 0);
    arrow.setDirection(driftVec.normalize());
    arrow.setLength(arrowLength, Math.max(0.2, arrowLength * 0.25), Math.max(0.2, arrowLength * 0.15));
    arrow.visible = true;
  }, [sceneEpoch, showDriftArrow, weierstrassDiagnostics, surfaceId]);

  useEffect(() => {
    const st = viewerRef.current;
    const group = principalGroupRef.current;
    if (!st || !group) return;

    clearGroup(group);

    if (!probeUV) {
      onParamCurvature?.(null);
      return;
    }

    if (!probeEnabled) {
      onParamCurvature?.(null);
      return;
    }

    const { paramFunc, uMin, uMax, vMin, vMax } = st;
    const res = computePrincipalCurvatureAtUV({
      paramFunc,
      u: probeUV.u,
      v: probeUV.v,
      uMin,
      uMax,
      vMin,
      vMax,
    });

    if (!res) {
      prevPrincipalRef.current = null;
      onParamCurvature?.(null);
      return;
    }

    const stable = stabilizePrincipalResult(res, prevPrincipalRef.current);
    prevPrincipalRef.current = stable;

    onParamCurvature?.({
      k1: stable.k1,
      k2: stable.k2,
      H: stable.H,
      K: stable.K,
      isUmbilic: stable.isUmbilic,
    });

    if (stable.isUmbilic) return;

    const arrowLen = Math.max(0.25, Math.min(0.9, (radiusRef.current || 3) * 0.28));
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
      const maxSteps = 280;
      const uRange = uMax - uMin || 1;
      const vRange = vMax - vMin || 1;
      const step = 0.02 * Math.min(Math.abs(uRange), Math.abs(vRange));
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

      const startUV = { u: probeUV.u, v: probeUV.v };

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
  }, [
    probeUV?.u,
    probeUV?.v,
    surfaceId,
    customX,
    customY,
    customZ,
    rotationalProfileMode,
    rotationalProfileRExpr,
    rotationalProfileZExpr,
    rotationalProfilePointsText,
    rotationalAxisOrigin?.x,
    rotationalAxisOrigin?.y,
    rotationalAxisOrigin?.z,
    rotationalAxisDirection?.x,
    rotationalAxisDirection?.y,
    rotationalAxisDirection?.z,
    rmfRibbonTwistEnabled,
    rmfRibbonTwistTurns,
    paramDomain?.uMin,
    paramDomain?.uMax,
    paramDomain?.vMin,
    paramDomain?.vMax,
    showPrincipalDirections,
    showPrincipalNormalPlanes,
    showPrincipalLines,
    onParamCurvature,
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
    return () => {
      if (cameraTourFrameRef.current != null) {
        cancelAnimationFrame(cameraTourFrameRef.current);
        cameraTourFrameRef.current = null;
      }
      cameraTourRunIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!cameraTourCommand) return;
    const cam = cameraRef.current;
    const ctrls = controlsRef.current;
    if (!cam || !ctrls) return;

    const emit = (event: CameraTourEvent) => {
      onCameraTourEvent?.(event);
    };

    const stopActive = (event: CameraTourEvent) => {
      if (cameraTourFrameRef.current != null) {
        cancelAnimationFrame(cameraTourFrameRef.current);
        cameraTourFrameRef.current = null;
        cameraTourRunIdRef.current += 1;
        emit(event);
      }
    };

    if (cameraTourCommand.action === "stop") {
      stopActive("stopped");
      return;
    }

    const presetByMode: Record<CameraTourMode, { durationMs: number; turns: number; elevAmp: number; zoomAmp: number }> = {
      balanced: { durationMs: 8800, turns: 1.35, elevAmp: 0.2, zoomAmp: 0.08 },
      orbit: { durationMs: 11000, turns: 1.95, elevAmp: 0.16, zoomAmp: 0.06 },
      zoom: { durationMs: 9000, turns: 1.1, elevAmp: 0.12, zoomAmp: 0.18 },
      spiral: { durationMs: 10800, turns: 1.7, elevAmp: 0.34, zoomAmp: 0.1 },
      quick: { durationMs: 5600, turns: 1.15, elevAmp: 0.14, zoomAmp: 0.06 },
      long: { durationMs: 12400, turns: 2.05, elevAmp: 0.22, zoomAmp: 0.1 },
      long_orbit: { durationMs: 13600, turns: 2.45, elevAmp: 0.2, zoomAmp: 0.08 },
      long_zoom: { durationMs: 13200, turns: 1.25, elevAmp: 0.16, zoomAmp: 0.22 },
      long_spiral: { durationMs: 14200, turns: 2.2, elevAmp: 0.38, zoomAmp: 0.1 },
    };

    const mode: CameraTourMode = cameraTourCommand.mode ?? "balanced";
    const preset = presetByMode[mode] ?? presetByMode.balanced;
    const durationMs = Number.isFinite(cameraTourCommand.durationMs)
      ? Math.max(1200, Math.min(16000, Number(cameraTourCommand.durationMs)))
      : preset.durationMs;

    if (cameraTourCommand.captureVideo) {
      emit("capture_unsupported");
    }

    const centerInput = cameraTourCommand.center;
    const center = new THREE.Vector3(
      centerInput?.x ?? ctrls.target.x,
      centerInput?.y ?? ctrls.target.y,
      centerInput?.z ?? ctrls.target.z
    );
    const radiusInput = cameraTourCommand.radius;
    const radius = Math.max(
      0.2,
      Number.isFinite(radiusInput) ? Number(radiusInput) : Math.max(0.8, radiusRef.current * 1.1)
    );
    const startDir = cam.position.clone().sub(center);
    const startTheta = Math.atan2(startDir.z, startDir.x);

    stopActive("interrupted");
    emit("started");

    const runId = cameraTourRunIdRef.current + 1;
    cameraTourRunIdRef.current = runId;
    const startedAt = performance.now();

    const step = (now: number) => {
      if (cameraTourRunIdRef.current !== runId) return;
      const t = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
      const eased = t * t * (3 - 2 * t);
      const theta = startTheta + eased * Math.PI * 2 * preset.turns;
      const elevation = 0.35 + preset.elevAmp * Math.sin(eased * Math.PI * 2);
      const dist = radius * (1 + preset.zoomAmp * Math.sin(eased * Math.PI * 4));

      const y = center.y + dist * elevation;
      const planar = Math.max(1e-3, dist * Math.sqrt(Math.max(0.01, 1 - elevation * elevation)));
      cam.position.set(center.x + planar * Math.cos(theta), y, center.z + planar * Math.sin(theta));
      cam.up.set(0, 1, 0);
      ctrls.target.copy(center);
      cam.updateProjectionMatrix();
      ctrls.update();

      if (t >= 1) {
        cameraTourFrameRef.current = null;
        if (cameraTourRunIdRef.current === runId) {
          cameraTourRunIdRef.current += 1;
          emit("completed");
        }
        return;
      }
      cameraTourFrameRef.current = requestAnimationFrame(step);
    };

    cameraTourFrameRef.current = requestAnimationFrame(step);
  }, [cameraTourCommand?.token, onCameraTourEvent]);

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

    if (!showChartGrid) return;
    const state = viewerRef.current;
    if (!state) return;

    const { paramFunc, uMin, uMax, vMin, vMax } = state;
    const { wrapU, wrapV } = wrapFlagsFor(surfaceId);
    const uCount = Math.max(2, Math.round(chartGridCountU));
    const vCount = Math.max(2, Math.round(chartGridCountV));
      const steps: number = 120;

    const group = new THREE.Group();
    group.name = "surface-cell-grid";
    group.renderOrder = 150;
    const cells: SurfaceCellData[] = [];
    const areaValues: number[] = [];
    const cellPositions: number[] = [];
    const cellIndices: number[] = [];
    let vertexCursor = 0;
    const tmpP00 = new THREE.Vector3();
    const tmpP10 = new THREE.Vector3();
    const tmpP11 = new THREE.Vector3();
    const tmpP01 = new THREE.Vector3();
    const eA = new THREE.Vector3();
    const eB = new THREE.Vector3();
    const nA = new THREE.Vector3();
    const nB = new THREE.Vector3();
    let skippedNonFinite = 0;
    let skippedDegenerate = 0;

    const addGrid = (axis: "u" | "v", count: number, color: number) => {
      const positions: number[] = [];
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.75,
      });
      const tmp = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const fixed = axis === "u" ? uMin + (uMax - uMin) * t : vMin + (vMax - vMin) * t;
        let prev: THREE.Vector3 | null = null;
        for (let j = 0; j < steps; j++) {
          const s = steps === 1 ? 0.5 : j / (steps - 1);
          const u = axis === "u" ? fixed : uMin + (uMax - uMin) * s;
          const v = axis === "v" ? fixed : vMin + (vMax - vMin) * s;
          paramFunc(u, v, tmp);
          if (!Number.isFinite(tmp.x) || !Number.isFinite(tmp.y) || !Number.isFinite(tmp.z)) {
            prev = null;
            continue;
          }
          if (prev) {
            positions.push(prev.x, prev.y, prev.z, tmp.x, tmp.y, tmp.z);
          }
          prev = tmp.clone();
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

    const addSeam = (axis: "u" | "v", fixed: number, color: number) => {
      const positions: number[] = [];
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
      });
      const tmp = new THREE.Vector3();
      let prev: THREE.Vector3 | null = null;
      for (let j = 0; j < steps; j++) {
        const s = steps === 1 ? 0.5 : j / (steps - 1);
        const u = axis === "u" ? fixed : uMin + (uMax - uMin) * s;
        const v = axis === "v" ? fixed : vMin + (vMax - vMin) * s;
        paramFunc(u, v, tmp);
        if (!Number.isFinite(tmp.x) || !Number.isFinite(tmp.y) || !Number.isFinite(tmp.z)) {
          prev = null;
          continue;
        }
        if (prev) {
          positions.push(prev.x, prev.y, prev.z, tmp.x, tmp.y, tmp.z);
        }
        prev = tmp.clone();
      }
      if (!positions.length) {
        mat.dispose();
        return;
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const line = new THREE.LineSegments(geom, mat);
      line.renderOrder = 165;
      group.add(line);
    };

    addGrid("u", uCount, 0x1f77b4);
    addGrid("v", vCount, 0xff7f0e);
    if (surfaceCellSeamsVisible) {
      if (wrapU) {
        addSeam("u", uMin, 0xdb2777);
        addSeam("u", uMax, 0xdb2777);
      }
      if (wrapV) {
        addSeam("v", vMin, 0x14b8a6);
        addSeam("v", vMax, 0x14b8a6);
      }
    }

    for (let i = 0; i < uCount - 1; i++) {
      const u0 = uMin + ((uMax - uMin) * i) / (uCount - 1);
      const u1 = uMin + ((uMax - uMin) * (i + 1)) / (uCount - 1);
      for (let j = 0; j < vCount - 1; j++) {
        const v0 = vMin + ((vMax - vMin) * j) / (vCount - 1);
        const v1 = vMin + ((vMax - vMin) * (j + 1)) / (vCount - 1);
        paramFunc(u0, v0, tmpP00);
        paramFunc(u1, v0, tmpP10);
        paramFunc(u1, v1, tmpP11);
        paramFunc(u0, v1, tmpP01);
        if (
          !Number.isFinite(tmpP00.x) || !Number.isFinite(tmpP00.y) || !Number.isFinite(tmpP00.z) ||
          !Number.isFinite(tmpP10.x) || !Number.isFinite(tmpP10.y) || !Number.isFinite(tmpP10.z) ||
          !Number.isFinite(tmpP11.x) || !Number.isFinite(tmpP11.y) || !Number.isFinite(tmpP11.z) ||
          !Number.isFinite(tmpP01.x) || !Number.isFinite(tmpP01.y) || !Number.isFinite(tmpP01.z)
        ) {
          skippedNonFinite += 1;
          continue;
        }

        const p00 = tmpP00.clone();
        const p10 = tmpP10.clone();
        const p11 = tmpP11.clone();
        const p01 = tmpP01.clone();
        const center = new THREE.Vector3()
          .copy(p00)
          .add(p10)
          .add(p11)
          .add(p01)
          .multiplyScalar(0.25);

        const tri1Area = nA
          .crossVectors(eA.subVectors(p10, p00), eB.subVectors(p01, p00))
          .length() * 0.5;
        const tri2Area = nB
          .crossVectors(eA.subVectors(p11, p10), eB.subVectors(p01, p10))
          .length() * 0.5;
        const area = tri1Area + tri2Area;
        if (!(Number.isFinite(area) && area > 1e-12)) {
          skippedDegenerate += 1;
          continue;
        }

        const normal = new THREE.Vector3()
          .crossVectors(eA.subVectors(p10, p00), eB.subVectors(p01, p00))
          .add(nB.crossVectors(eA.subVectors(p11, p10), eB.subVectors(p01, p10)))
          .normalize();
        if (!Number.isFinite(normal.x) || !Number.isFinite(normal.y) || !Number.isFinite(normal.z)) {
          normal.set(0, 1, 0);
        }

        const cell: SurfaceCellData = {
          id: buildChartCellId(i, j),
          i,
          j,
          u0,
          u1,
          v0,
          v1,
          seamU: wrapU && (i === 0 || i === uCount - 2),
          seamV: wrapV && (j === 0 || j === vCount - 2),
          center,
          normal,
          area,
          corners: [p00, p10, p11, p01],
        };
        cells.push(cell);
        areaValues.push(area);

        cellPositions.push(
          p00.x, p00.y, p00.z,
          p10.x, p10.y, p10.z,
          p11.x, p11.y, p11.z,
          p01.x, p01.y, p01.z
        );
        cellIndices.push(
          vertexCursor,
          vertexCursor + 1,
          vertexCursor + 2,
          vertexCursor,
          vertexCursor + 2,
          vertexCursor + 3
        );
        vertexCursor += 4;
      }
    }

    chartGridCellsRef.current = cells;
    setSurfaceCellDiagnostics(
      computeChartGridDiagnostics({
        cells,
        maskedIds: surfaceCellMaskedIds,
        skippedNonFinite,
        skippedDegenerate,
      })
    );
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

    const fillGeometry = new THREE.BufferGeometry();
    fillGeometry.setAttribute("position", new THREE.Float32BufferAttribute(cellPositions, 3));
    fillGeometry.setIndex(cellIndices);
    const areaMin = Math.min(...areaValues);
    const areaMax = Math.max(...areaValues);
    const areaSpan = Math.max(1e-9, areaMax - areaMin);
    const colors: number[] = [];
    for (let idx = 0; idx < cells.length; idx++) {
      const cell = cells[idx];
      const masked = surfaceCellMaskedIds.has(cell.id);
      const t = surfaceCellValuesVisible
        ? Math.min(1, Math.max(0, (cell.area - areaMin) / areaSpan))
        : 0;
      const color = masked
        ? new THREE.Color(0x94a3b8)
        : surfaceCellValuesVisible
          ? new THREE.Color().setHSL(0.62 - 0.53 * t, 0.86, 0.54)
          : new THREE.Color(0x4f8cff);
      for (let k = 0; k < 4; k++) {
        colors.push(color.r, color.g, color.b);
      }
    }
    fillGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const fillMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: surfaceCellValuesVisible ? 0.36 : 0.14,
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
      const centerPositions = new Float32Array(cells.length * 3);
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i].center;
        centerPositions[3 * i] = c.x;
        centerPositions[3 * i + 1] = c.y;
        centerPositions[3 * i + 2] = c.z;
      }
      const centerGeometry = new THREE.BufferGeometry();
      centerGeometry.setAttribute("position", new THREE.BufferAttribute(centerPositions, 3));
      const centerMaterial = new THREE.PointsMaterial({
        color: 0x0f172a,
        size: Math.max(0.015, (radiusRef.current || 3) * 0.012),
        sizeAttenuation: true,
        depthWrite: false,
      });
      const centerPoints = new THREE.Points(centerGeometry, centerMaterial);
      centerPoints.renderOrder = 160;
      group.add(centerPoints);
    }

    if (surfaceCellNormalsVisible) {
      const normalScale = Math.max(0.05, (radiusRef.current || 3) * 0.08);
      const normalSegments = new Float32Array(cells.length * 6);
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
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
      if (selectedCell) {
        const selectedGeometry = new THREE.BufferGeometry();
        const [p00, p10, p11, p01] = selectedCell.corners;
        selectedGeometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            [
              p00.x, p00.y, p00.z,
              p10.x, p10.y, p10.z,
              p11.x, p11.y, p11.z,
              p01.x, p01.y, p01.z,
            ],
            3
          )
        );
        selectedGeometry.setIndex([0, 1, 2, 0, 2, 3]);
        const selectedMaterial = new THREE.MeshBasicMaterial({
          color: 0xf43f5e,
          transparent: true,
          opacity: 0.48,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const selectedMesh = new THREE.Mesh(selectedGeometry, selectedMaterial);
        selectedMesh.renderOrder = 170;
        group.add(selectedMesh);

        const borderGeometry = new THREE.BufferGeometry();
        borderGeometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            [
              p00.x, p00.y, p00.z,
              p10.x, p10.y, p10.z,
              p10.x, p10.y, p10.z,
              p11.x, p11.y, p11.z,
              p11.x, p11.y, p11.z,
              p01.x, p01.y, p01.z,
              p01.x, p01.y, p01.z,
              p00.x, p00.y, p00.z,
            ],
            3
          )
        );
        const borderMaterial = new THREE.LineBasicMaterial({ color: 0xbe123c, transparent: true, opacity: 0.95 });
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
    surfaceCellSeamsVisible,
    surfaceCellMaskedIds,
    selectedSurfaceCellIndex,
    surfaceId,
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
    const obj = surfaceObjRef.current;
    if (!obj) return;

    const state = viewerRef.current;
    const paramState = state
      ? {
          paramFunc: state.paramFunc,
          uMin: state.uMin,
          uMax: state.uMax,
          vMin: state.vMin,
          vMax: state.vMax,
        }
      : undefined;

    const mesh = obj as THREE.Mesh;
    const geom = mesh.geometry as THREE.BufferGeometry;
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const opacity = Math.min(1, Math.max(0, materialOpacity));
    const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | null;
    const heatmapOk =
      !!geodesicHeatmapEnabled &&
      !!geodesicHeatmapValues?.length &&
      !!posAttr &&
      posAttr.count === geodesicHeatmapValues.length;

    if (heatmapOk) {
      applyHeatmapColors(geom, geodesicHeatmapValues!, colorPalette);
      mat.vertexColors = true;
      mat.color.set("#ffffff");
    } else if (colorMode === "solid") {
      geom.deleteAttribute("color");
      mat.vertexColors = false;

      mat.color.set(
        colorPalette === "redYellow" ? "#ffcc00"
        : colorPalette === "blueRed" ? "#4f8cff"
        : colorPalette === "grayscale" ? "#888888"
        : "#6a5cff"
      );
    } else {
      applyParamColoring(geom, colorMode, colorPalette, paramState);
      mat.vertexColors = true;
      mat.color.set("#ffffff"); // don't tint vertex colors
    }

    mat.roughness = materialRoughness;
    mat.metalness = materialMetalness;
    mat.transparent = opacity < 1;
    mat.opacity = opacity;
    mat.needsUpdate = true;
  }, [
    colorMode,
    colorPalette,
    surfaceId,
    materialRoughness,
    materialMetalness,
    materialOpacity,
    geodesicHeatmapEnabled,
    geodesicHeatmapValues,
  ]);

  // --- reverse probe: (u,v) click on param map → 3D marker/normal ---
  useEffect(() => {
    if (!paramProbeUV) return;

    const state = viewerRef.current;
    if (!state) return;

    const { paramFunc, uMin, uMax, vMin, vMax, applyProbe } = state;
    const { u, v } = paramProbeUV;

    const uClamped = Math.min(Math.max(u, uMin), uMax);
    const vClamped = Math.min(Math.max(v, vMin), vMax);

    const p = new THREE.Vector3();
    paramFunc(uClamped, vClamped, p);

    const duDom = uMax - uMin || 1;
    const dvDom = vMax - vMin || 1;
    const epsU = 1e-3 * duDom;
    const epsV = 1e-3 * dvDom;

    const pu1 = new THREE.Vector3();
    const pu2 = new THREE.Vector3();
    const pv1 = new THREE.Vector3();
    const pv2 = new THREE.Vector3();

    paramFunc(uClamped + epsU, vClamped, pu1);
    paramFunc(uClamped - epsU, vClamped, pu2);
    paramFunc(uClamped, vClamped + epsV, pv1);
    paramFunc(uClamped, vClamped - epsV, pv2);

    const su = pu1.sub(pu2);
    const sv = pv1.sub(pv2);

    let nWorld = new THREE.Vector3().crossVectors(su, sv);
    if (nWorld.lengthSq() === 0) nWorld.set(0, 1, 0);
    else nWorld.normalize();

    applyProbe(p, nWorld, { u: uClamped, v: vClamped });
  }, [paramProbeUV, paramProbeToken]);

  // --- geodesic drawing effect (uses last probeUV) ---
  useEffect(() => {
    const state = viewerRef.current;
    if (!state) return;

    const { scene, paramFunc, uMin, uMax, vMin, vMax } = state;

    const removeLine = () => {
      if (!geodesicLineRef.current) return;
      scene.remove(geodesicLineRef.current);
      geodesicLineRef.current.geometry.dispose();
      (geodesicLineRef.current.material as THREE.Material).dispose();
      geodesicLineRef.current = null;
    };

    if (!showGeodesic || !probeUV) {
      removeLine();
      return;
    }

    const uRange = uMax - uMin || 1;
    const vRange = vMax - vMin || 1;

    // sigma(u,v)
    const sigma = (u: number, v: number, target?: THREE.Vector3) => {
      const t = target ?? new THREE.Vector3();
      paramFunc(u, v, t);
      return t;
    };

    // picker gives direction in normalized domain; rescale to domain units
    const dirDom = {
      du: geoDir.du * uRange,
      dv: geoDir.dv * vRange,
    };

    const { wrapU, wrapV } = wrapFlagsFor(surfaceId);

    const eps = 1e-4 * Math.min(Math.abs(uRange), Math.abs(vRange));
    const h = 0.02; // integration step in "t"
    const steps = 650;

    const isTorusLike = surfaceId === "torus" || surfaceId === "kleinBottle";

    // torus-like: smaller step, more steps
    const hUse = isTorusLike ? 0.008 : h;
    const stepsUse = isTorusLike ? steps * 3 : steps;

    const ptsF = integrateGeodesic({
      sigma,
      startUV: { u: probeUV.u, v: probeUV.v },
      dirUV: { du: dirDom.du, dv: dirDom.dv },
      domain: { uMin, uMax, vMin, vMax },
      wrap: isTorusLike ? {} : { wrapU, wrapV },
      steps: stepsUse,
      h: hUse,
      eps,
      stopAtBoundary: !isTorusLike,
      maxArcLength: isTorusLike ? 120 : undefined,

      // ✅ robustness knobs
      renormalizeSpeed: true,
      maxStepLength3D: isTorusLike ? 0.35 : 0.5,
    });

    const ptsB = integrateGeodesic({
      sigma,
      startUV: { u: probeUV.u, v: probeUV.v },
      dirUV: { du: -dirDom.du, dv: -dirDom.dv },
      domain: { uMin, uMax, vMin, vMax },
      wrap: isTorusLike ? {} : { wrapU, wrapV },
      steps: stepsUse,
      h: hUse,
      eps,
      stopAtBoundary: !isTorusLike,
      maxArcLength: isTorusLike ? 120 : undefined,

      // ✅ robustness knobs
      renormalizeSpeed: true,
      maxStepLength3D: isTorusLike ? 0.35 : 0.5,
    });

    ptsB.reverse();
    const pts = ptsB.concat(ptsF);

    removeLine();

    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: 0xff3333,
      depthTest: false,
      depthWrite: false,
    });

    const line = new THREE.Line(geom, mat);
    line.renderOrder = 999;

    geodesicLineRef.current = line;
    scene.add(line);

    // cleanup on dependency change
    return () => {
      // no-op; removal happens via removeLine in subsequent calls
    };
  }, [showGeodesic, probeUV?.u, probeUV?.v, geoDir.du, geoDir.dv, surfaceId]);

  // normalize uv for the picker UI
  const picker = (() => {
    const st = viewerRef.current;
    if (!st || !probeUV) return null;

    const uRange = st.uMax - st.uMin || 1;
    const vRange = st.vMax - st.vMin || 1;

    const uu = (probeUV.u - st.uMin) / uRange;
    const vv = (probeUV.v - st.vMin) / vRange;

    return (
      <DomainDirectionPicker
        u={uu}
        v={vv}
        du={geoDir.du}
        dv={geoDir.dv}
        onChangeDir={(du, dv) => setGeoDir({ du, dv })}
      />
    );
  })();

  const canLoad = !!(onSetCustomX && onSetCustomY && onSetCustomZ);
  const sliceOffsetRange = Math.max(1, radiusRef.current || 3);
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
  const presetButtonStyle = (active: boolean) => ({
    padding: "2px 8px",
    borderRadius: 6,
    border: "1px solid #cfd6df",
    background: active ? "#dbe7ff" : "#f2f4f7",
    fontSize: 11,
    cursor: "pointer",
  });
  const chartWrapFlags = wrapFlagsFor(surfaceId);
  const chartSeamSupported = chartWrapFlags.wrapU || chartWrapFlags.wrapV;
  const selectedSurfaceCellMasked = !!(
    selectedSurfaceCellInfo && surfaceCellMaskedIds.has(selectedSurfaceCellInfo.id)
  );

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={mountRef} data-testid="surface-viewer-canvas-host" style={{ width: "100%", height: "100%" }} />

      {showOverlayControls && (
        <>
          {/* TOP-LEFT overlay: geodesic only */}
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              padding: 10,
              borderRadius: 10,
              background: "rgba(255,255,255,0.92)",
              boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              userSelect: "none",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={showGeodesic}
                onChange={() => setShowGeodesic((s) => !s)}
              />
              Geodesic
            </label>

            {showGeodesic && (
              <>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  {probeUV ? "Drag the tip to set direction" : "Probe a point first"}
                </div>
                <div style={{ opacity: probeUV ? 1 : 0.4 }}>
                  {picker ?? (
                    <DomainDirectionPicker
                      u={0.5}
                      v={0.5}
                      du={geoDir.du}
                      dv={geoDir.dv}
                      onChangeDir={(du, dv) => setGeoDir({ du, dv })}
                    />
                  )}
                </div>
              </>
            )}
          </div>

          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
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
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={slicePlaneEnabled}
                onChange={(e) => setSlicePlaneEnabled(e.target.checked)}
              />
              <span>Slice plane</span>
            </label>

            {slicePlaneEnabled && (
              <>
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
            {showChartGrid && (
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
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: chartSeamSupported ? "#0f172a" : "#94a3b8",
                  }}
                  title={chartSeamSupported ? "" : "Seam overlay is available on wrapped parameter domains only."}
                >
                  <input
                    type="checkbox"
                    checked={surfaceCellSeamsVisible}
                    onChange={(e) => setSurfaceCellSeamsVisible(e.target.checked)}
                    disabled={!chartSeamSupported}
                  />
                  <span>Seam visualization</span>
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
                    {`Cell [${selectedSurfaceCellInfo.i}, ${selectedSurfaceCellInfo.j}]  area=${selectedSurfaceCellInfo.area.toFixed(4)}${
                      selectedSurfaceCellInfo.seamU || selectedSurfaceCellInfo.seamV ? "  seam" : ""
                    }${selectedSurfaceCellMasked ? "  masked" : ""}`}
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
                    (non-finite {surfaceCellDiagnostics.skippedNonFinite}, degenerate {surfaceCellDiagnostics.skippedDegenerate}, masked {surfaceCellDiagnostics.maskedCells})
                  </div>
                  <div>
                    Seams: U {surfaceCellDiagnostics.seamUCells}, V {surfaceCellDiagnostics.seamVCells}
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
              </div>
            )}
          </div>
        </>
      )}

      {showOverlayControls && showViewGizmo && (
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            borderRadius: 6,
            background: "rgba(255,255,255,0.9)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontSize: 11,
          }}
        >
          <AxisGizmo
            size={96}
            getMainCamera={() => cameraRef.current}
            onSelectView={(view) => setViewMode(view)}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
            <input
              type="checkbox"
              checked={lockToPlane && viewMode !== "free"}
              onChange={(e) => setLockToPlane(e.target.checked)}
            />
            <span>Lock view to plane</span>
          </label>
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

      {surfaceId === "custom" && (
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
            maxWidth: 380,
          }}
        >
          <div style={{ fontWeight: 700 }}>Param presets</div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={paramPresetLabel}
              onChange={(e) => setParamPresetLabel(e.target.value)}
              placeholder="Preset name (optional)"
              style={{ flex: 1, padding: "6px 8px" }}
            />
            <button
              onClick={saveParamPreset}
              disabled={!((customX ?? "").trim() || (customY ?? "").trim() || (customZ ?? "").trim())}
            >
              Save
            </button>
          </div>

          {paramPresets.length > 0 && (
            <div
              style={{
                maxHeight: 260,
                overflow: "auto",
                paddingRight: 4,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {paramPresets.map((p) => (
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
                    title={`x=${p.xExpr}\ny=${p.yExpr}\nz=${p.zExpr}`}
                    onClick={() => loadParamPreset(p)}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.15 }}>
                      {p.label || "(unnamed)"}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                        marginTop: 2,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      x = {p.xExpr || "0"}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      y = {p.yExpr || "0"}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      z = {p.zExpr || "0"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => loadParamPreset(p)} disabled={!canLoad}>
                      Load
                    </button>
                    <button onClick={() => duplicateParamPreset(p)}>Duplicate</button>
                    <button onClick={() => deleteParamPreset(p.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
