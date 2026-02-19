// src/App.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { uiStyles as styles } from "./uiStyles";

import MobiusScreen from "./screens/MobiusScreen";
import { ChebyshevScreen } from "./screens/ChebyshevScreen";

import { PlanePlot, type PlanePlotHandle } from "./components/PlanePlot";
import {
  RiemannSpherePlot,
  type SphereGuide as RiemannSphereGuide,
  type SphereLine as RiemannSphereLine,
  type SpherePoint as RiemannSpherePoint,
} from "./components/RiemannSpherePlot";
import TabButton from "./components/TabButton";
import GaussMapPanel from "./components/GaussMapPanel";
import { SelectionStatsPanel } from "./components/SelectionStatsPanel";
import { DiskStatsPanel } from "./components/DiskStatsPanel";
import { WorkbookPanel } from "./components/WorkbookPanel";

import {
  SurfaceViewer,
  type SurfaceId,
  type ColorMode,
  type ProbeInfo,
} from "./components/SurfaceViewer";
import { VolumeViewer } from "./components/VolumeViewer";
import { VolumeSliceHistogram } from "./components/VolumeSliceHistogram";

import { ParamSurfaceViewer, type ParamSurfaceId } from "./components/ParamSurfaceViewer";
import type { ColorPalette } from "./components/colorPalette";

import { renderMobius } from "./d3/MobiusRenderer";
import { renderChebyshev } from "./d3/ChebyshevRenderer";
import { renderTransform, type TransformPrimitive } from "./d3/TransformRenderer";
import { renderStandardMap, type MapId } from "./d3/StandardMapRenderer";

import type { GaussPoint, GaussColorMode } from "./components/gaussMapUtils";
import type { SurfaceSampleSet } from "./math/sampling/surfaceSampling";
import {
  computeSelectionMask,
  type GaussCapSelection,
  type RegionSelection,
  type SelectionMask,
} from "./math/selection/selectionModel";
import { buildMeshAdjacency, computeGeodesicDistances } from "./math/selection/geodesicSelection";
import { dijkstraDistancesAndPrev, reconstructPath } from "./math/selection/geodesicGraph";
import {
  computeSelectionStats,
  type SelectionMetricKey,
  type SelectionStats,
} from "./math/selection/selectionStats";
import { buildGeodesicDisk } from "./math/geodesicDisk";
import { cgalHealth, runCgalMesh, stopCgalWorker } from "./services/cgalMeshClient";
import { runGeodesicHeat } from "./services/geodesicHeatClient";
import { vtkCleanNormals, vtkDecimate, vtkPreviewImplicit, vtkSmooth } from "./services/vtkMeshClient";
import { vtkVolumeDistance } from "./services/vtkVolumeClient";
import { solveContinuousGraphGeodesic } from "./math/graphGeodesicContinuous";
import { compileExpression } from "./math/expression";
import {
  buildComplexMapSweep,
  compileComplexMapExpressions,
  type ComplexMapSweepSpec,
} from "./math/complexMapSweep";
import { marchingSquares } from "./math/marchingSquares";
import {
  solveContinuousParamGeodesic,
  type ParamGeodesicState,
} from "./math/paramGeodesicContinuous";

import type { MobiusParams } from "./math/mobius";
import { computeGraphInvariantsFromProbe, type CurvatureData } from "./math/surfaceInvariants";
import type { PrincipalCurvatureScalars } from "./math/principalCurvature";
import { computeWeierstrassDrift, type WeierstrassDriftResult } from "./math/weierstrass";
import { WEIERSTRASS_PRESETS, type WeierstrassPreset } from "./math/weierstrassPresets";
import {
  buildSurfaceMeshFromGeometry,
  loadSurfaceMeshFromFile,
  mergeMeshData,
  weldSurfaceMeshVertices,
  type SurfaceMeshData,
  type SurfaceMeshSource,
  type SurfaceMeshPreset,
} from "./mesh/surfaceMesh";
import { exportMeshToGLB, exportMeshToOBJ } from "./mesh/meshExport";
import {
  computeAdjacency,
  computeMeanEdgeLength,
  computeVertexNormals,
  validateMesh,
} from "./mesh/meshOps";
import type { DatasetKind, MeshDataset, VolumeDataset, VectorGrid } from "./scene/datasets";
import type { PolylineSet } from "./scene/renderPrimitives";
import { bakeGraphSurface, bakeParamSurface, bakeWeierstrassSurface } from "./math/bakeSurface";
import {
  buildVolumeGridFromPreset,
  getVolumePreset,
  getVolumePresetBounds,
  getVolumePresetDefaultParams,
  resolveVolumePresetParams,
  VOLUME_PRESETS,
  type VolumePreset,
  type VolumePresetId,
  type VolumePresetParams,
} from "./scene/volume/volumePresets";
import {
  type SliceAxis,
  gradientMagnitudeAt,
  sampleGridTrilinear,
  type VolumeSliceHover,
  type VolumeSliceReport,
  worldToGridIndex,
} from "./scene/volume/sliceVolume";
import {
  clampSampling,
  samplingFromBounds,
  samplingSpacing,
  samplingToBounds,
  type VolumeSampling,
} from "./scene/volume/volumeSampling";
import {
  buildVectorGridFromPreset,
  getVectorPreset,
  VECTOR_PRESETS,
  type VectorPresetId,
} from "./scene/volume/vectorPresets";
import { buildSliceSeeds } from "./scene/volume/streamlines";
import {
  createDefaultWorkbook,
  createWorkbookFromTemplate,
  WORKBOOK_TEMPLATES,
  WORKBOOK_PROBLEM_PACKS,
  type Workbook,
  type WorkbookBlock,
  type WorkbookBlockType,
  type WorkbookStageId,
  type WorkbookViewSnapshot,
  type WorkbookPort,
  type WorkbookValueType,
  type WorkbookComputeCacheEntry,
  type WorkbookComputeOutputs,
  type WorkbookInteractionKind,
  type WorkbookDirectionOutput,
  type WorkbookMaskOutput,
  type WorkbookParamDef,
  type WorkbookParamValue,
  type WorkbookCurveOutput,
  type WorkbookPointOutput,
  type WorkbookSnapshotSlot,
} from "./workbook/workbookModel";
/* ---------------- App modes ---------------- */

type Mode = "mobius" | "chebyshev" | "transform" | "maps" | "surfaces";
type SurfaceViewerKind = "implicit" | "graph" | "param" | "weierstrass" | "mesh" | "complex";
const SURFACE_VIEWER_KINDS: SurfaceViewerKind[] = [
  "implicit",
  "graph",
  "param",
  "weierstrass",
  "mesh",
  "complex",
];
const isSurfaceViewerKind = (value: string | undefined): value is SurfaceViewerKind =>
  !!value && SURFACE_VIEWER_KINDS.includes(value as SurfaceViewerKind);
type GraphDomain = { xSpan: number; ySpan: number };
type ImplicitDomain = { xSpan: number; ySpan: number };
type ImplicitBakeBounds = { xSpan: number; ySpan: number; zSpan: number };
type ParamDomain = { uMin: number; uMax: number; vMin: number; vMax: number };
type CameraSyncState = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
};
const MODE_LIST: Mode[] = ["mobius", "chebyshev", "transform", "maps", "surfaces"];
const isModeValue = (value: string): value is Mode =>
  MODE_LIST.includes(value as Mode);
type ComplexMapLine = { axis: "u" | "v"; value: number } | null;

const WORKBOOK_STORAGE_KEY = "math3d.workbooks.v1";
const WORKBOOK_ACTIVE_KEY = "math3d.workbooks.active.v1";
const WORKBOOK_STAGE_KEY = "math3d.workbooks.stage.v1";
const WORKBOOK_PANEL_KEY = "math3d.workbooks.rightPanel.v1";
const WORKBOOK_GHOST_OVERLAYS_KEY = "math3d.workbook.ghostOverlays.v1";
type WorkbookReplayPayload = {
  workbooks: Workbook[];
  activeWorkbookId?: string | null;
  activeStageId?: WorkbookStageId;
};
const REPLAY_PAYLOAD: WorkbookReplayPayload | null = (() => {
  const anyWin = globalThis as any;
  const payload = anyWin?.__MATH3D_REPLAY__;
  if (!payload || !Array.isArray(payload.workbooks)) return null;
  return payload as WorkbookReplayPayload;
})();
const IS_REPLAY_MODE = !!REPLAY_PAYLOAD;
const COMPARE_IGNORE_OVERLAYS_KEY = "math3d.compare.ignoreWorkbookOverlays.v1";
const COMPARE_CAMERA_SYNC_KEY = "math3d.compare.cameraSync.v1";
const WORKBOOK_STAGE_IDS: WorkbookStageId[] = ["define", "compute", "visualize", "explain"];
const isWorkbookStageId = (value: string | null): value is WorkbookStageId =>
  !!value && WORKBOOK_STAGE_IDS.includes(value as WorkbookStageId);
type ComplexPreimageMode = "none" | "re" | "im" | "abs" | "arg";
type ComplexDistortionMode = "none" | "area" | "anisotropy" | "conformal";
type ComplexMapMarkerData = {
  thresholds: { critical: number; zero: number; pole: number };
  critical: { z: [number, number][]; w: [number, number][]; p3d: { x: number; y: number; z: number }[] };
  zero: { z: [number, number][]; w: [number, number][]; p3d: { x: number; y: number; z: number }[] };
  pole: { z: [number, number][]; w: [number, number][]; p3d: { x: number; y: number; z: number }[] };
};
type ComplexMapDistortionField = {
  values: Float32Array;
  nx: number;
  ny: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  min: number;
  max: number;
};
type ComplexMapDistortionProbe = {
  u: number;
  v: number;
  detAbs: number;
  ratio: number;
  conformalErr: number;
};
type ComplexMapProbe = {
  u: number;
  v: number;
  w: { re: number; im: number; mag: number; arg: number };
  det: number;
  detAbs: number;
  sigmaMax: number;
  sigmaMin: number;
  ratio: number;
  conformalErr: number;
  localScale: number;
  source: "z" | "w" | "surface";
};
type ComplexMapProbePin = ComplexMapProbe & { id: string; label?: string };
type ComplexMapSphereLine = {
  axis: "u" | "v";
  value: number;
  line: [number, number][];
};
type CgalMeshState = {
  surfaceId: SurfaceId;
  expr: string;
  positions: number[];
  indices: number[];
  createdAt: number;
};
type CgalHealthState = { ok: boolean; error?: string };

const stereographicToSphere = (re: number, im: number) => {
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    return { x: 0, y: 0, z: 1 };
  }
  const r2 = re * re + im * im;
  if (!Number.isFinite(r2)) {
    return { x: 0, y: 0, z: 1 };
  }
  const denom = 1 + r2;
  if (!Number.isFinite(denom) || denom === 0) {
    return { x: 0, y: 0, z: 1 };
  }
  return {
    x: (2 * re) / denom,
    y: (2 * im) / denom,
    z: (r2 - 1) / denom,
  };
};

const wrapAngle = (theta: number) => {
  const twoPi = Math.PI * 2;
  let t = theta;
  if (!Number.isFinite(t)) return 0;
  t = ((t + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  return t;
};

const evalRiemannSheet = (
  re: number,
  im: number,
  sheetIndex: number,
  sheetCount: number,
  branchCutAngle: number
) => {
  const r = Math.hypot(re, im);
  if (!Number.isFinite(r)) return null;
  if (r === 0) return { re: 0, im: 0 };
  const thetaRaw = Math.atan2(im, re);
  const theta = wrapAngle(thetaRaw - branchCutAngle) + branchCutAngle;
  const k = Math.max(1, sheetCount);
  const angle = (theta + 2 * Math.PI * sheetIndex) / k;
  const mag = Math.pow(r, 1 / k);
  return { re: mag * Math.cos(angle), im: mag * Math.sin(angle) };
};

const applySurfaceMeshOps = (mesh: SurfaceMeshData): SurfaceMeshData => {
  let next = mesh;
  if (!mesh.normals || mesh.normals.length < mesh.positions.length) {
    next = computeVertexNormals(next);
  }
  next = computeAdjacency(next);
  next = computeMeanEdgeLength(next);
  next = validateMesh(next);
  return next;
};

const toMeshDataset = (mesh: SurfaceMeshData | null): MeshDataset | null =>
  mesh ? { kind: "mesh", mesh } : null;

/* ---------------- constants ---------------- */


type MobiusSubTab = "map" | "decompose" | "invariants" | "circles";



const identityParams: MobiusParams = {
  a: { re: 1, im: 0 },
  b: { re: 0, im: 0 },
  c: { re: 0, im: 0 },
  d: { re: 1, im: 0 },
};

const splitterStyle: React.CSSProperties = {
  width: 6,
  cursor: "col-resize",
  alignSelf: "stretch",
  background: "linear-gradient(to right, transparent 0, #ddd 3px, transparent 6px)",
};

const WEIERSTRASS_DEFAULTS = {
  gExpr: "z",
  phiExpr: "1",
  domain: { uMin: -1, uMax: 1, vMin: -1, vMax: 1 },
  resolution: 80,
  recenter: true,
};

const COMPLEX_MAP_PRESETS = [
  { id: "z", label: "w = z", reExpr: "u", imExpr: "v" },
  { id: "z2", label: "w = z^2", reExpr: "u^2 - v^2", imExpr: "2*u*v" },
  { id: "z3", label: "w = z^3", reExpr: "u^3 - 3*u*v^2", imExpr: "3*u^2*v - v^3" },
  { id: "exp", label: "w = exp(z)", reExpr: "exp(u) * cos(v)", imExpr: "exp(u) * sin(v)" },
];
const COMPLEX_MAP_CUSTOM_ID = "custom";

const COMPLEX_MAP_DEFAULT_SPEC: ComplexMapSweepSpec = {
  reExpr: COMPLEX_MAP_PRESETS[0]?.reExpr ?? "u",
  imExpr: COMPLEX_MAP_PRESETS[0]?.imExpr ?? "v",
  uMin: -2,
  uMax: 2,
  vMin: -2,
  vMax: 2,
  nu: 120,
  nv: 80,
  sweepAxis: "v",
  outputMode: "sweep",
  wScale: 1,
  clampAbs: null,
  showIsolines: false,
  isolinesCountU: 7,
  isolinesCountV: 7,
  mapMode: "standard",
  sheetCount: 2,
  sheetMode: "all",
  sheetIndex: 0,
  branchCutAngle: 0,
};

const COMPLEX_MAP_LABEL = "Complex Map Sweep (z→w)";
const COMPLEX_MAP_OUTPUT_LABELS: Record<ComplexMapSweepSpec["outputMode"], string> = {
  sweep: COMPLEX_MAP_LABEL,
  re: "Complex Map Surface (Re)",
  im: "Complex Map Surface (Im)",
  both: "Complex Map Surfaces (Re + Im)",
};
const COMPLEX_MAP_LABEL_SET = new Set(Object.values(COMPLEX_MAP_OUTPUT_LABELS));
const RIEMANN_SURFACE_PREFIX = "Riemann surface";
const isComplexMapSurfaceLabel = (label?: string | null) =>
  !!label && (COMPLEX_MAP_LABEL_SET.has(label) || label.startsWith(RIEMANN_SURFACE_PREFIX));
const COMPLEX_GRID_COLORS = {
  u: "#1f77b4",
  v: "#e67e22",
};
const COMPLEX_GRID_COLORS_3D = {
  u: 0x1f77b4,
  v: 0xe67e22,
};

const DEFAULT_VOLUME_PRESET_ID: VolumePresetId = "sphere";

const WEIERSTRASS_META = {
  label: "Weierstrass",
  formula: "X(z) = Re integral Phi(z) dz",
  note: "Minimal surface from Weierstrass data g(z), phi(z).",
};

const buildEllipsoidGeometry = () => {
  const geom = new THREE.SphereGeometry(1, 96, 64);
  geom.scale(1.6, 1.15, 0.85);
  return geom;
};

const buildBumpySphereGeometry = () => {
  const geom = new THREE.SphereGeometry(1, 120, 80);
  const pos = geom.getAttribute("position") as THREE.BufferAttribute | null;
  if (!pos) return geom;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, y, z) || 1;
    const nx = x / r;
    const ny = y / r;
    const nz = z / r;
    const theta = Math.atan2(z, x);
    const phi = Math.acos(Math.max(-1, Math.min(1, ny)));
    const bump = 0.18 * Math.sin(3 * theta) * Math.sin(2 * phi);
    const nr = r * (1 + bump);
    pos.setXYZ(i, nx * nr, ny * nr, nz * nr);
  }
  geom.computeVertexNormals();
  return geom;
};

const buildWavyTorusGeometry = () => {
  const major = 1.05;
  const minor = 0.32;
  const geom = new THREE.TorusGeometry(major, minor, 64, 220);
  const pos = geom.getAttribute("position") as THREE.BufferAttribute | null;
  if (!pos) return geom;
  const amp = 0.35;
  const freq = 5;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = Math.atan2(y, x);
    const cx = major * Math.cos(u);
    const cy = major * Math.sin(u);
    const vx = x - cx;
    const vy = y - cy;
    const vz = z;
    const vlen = Math.hypot(vx, vy, vz) || 1;
    const scale = 1 + amp * Math.sin(freq * u);
    const nx = vx / vlen;
    const ny = vy / vlen;
    const nz = vz / vlen;
    const newLen = minor * scale;
    pos.setXYZ(i, cx + nx * newLen, cy + ny * newLen, nz * newLen);
  }
  geom.computeVertexNormals();
  return geom;
};

const SURFACE_MESH_PRESETS: SurfaceMeshPreset[] = [
  { id: "mesh_box", label: "Box", build: () => new THREE.BoxGeometry(1.8, 1.8, 1.8, 10, 10, 10) },
  { id: "mesh_icosphere", label: "Icosphere", build: () => new THREE.IcosahedronGeometry(1.3, 3) },
  { id: "mesh_torus", label: "Torus", build: () => new THREE.TorusGeometry(1.1, 0.35, 48, 120) },
  { id: "mesh_knot", label: "Torus knot", build: () => new THREE.TorusKnotGeometry(0.9, 0.25, 220, 32) },
  { id: "mesh_dodeca", label: "Dodecahedron", build: () => new THREE.DodecahedronGeometry(1.2, 1) },
  { id: "mesh_ellipsoid", label: "Ellipsoid", build: buildEllipsoidGeometry },
  { id: "mesh_bumpy", label: "Bumpy sphere", build: buildBumpySphereGeometry },
  { id: "mesh_wavy_torus", label: "Wavy torus", build: buildWavyTorusGeometry },
];

/* ---------------- Surfaces meta ---------------- */

// equation / implicit surfaces metadata (for SurfaceViewer)
const SURFACES_EQ_META: {
  id: SurfaceId;
  label: string;
  formula: string;
  note: string;
}[] = [
    { id: "sphere", label: "Sphere", formula: "x² + y² + z² = R²", note: "Perfectly symmetric in all directions." },
    { id: "hyperboloid", label: "Hyperboloid", formula: "x² + y² − z² = 1  (one sheet)", note: "Ruled surface; circles + hyperbolas." },
    { id: "paraboloid", label: "Paraboloid", formula: "z = x² + y²  (elliptic)", note: "Like a satellite dish; vertical sections are parabolas." },
    { id: "cone", label: "Cone", formula: "x² + y² = z²", note: "Double cone with vertex at the origin." },
    { id: "cylinder", label: "Cylinder", formula: "x² + y² = R²", note: "Circle extruded along an axis." },

    { id: "hyperboloid_twoSheet", label: "Two-sheet hyperboloid", formula: "z^2/c^2 - x^2/a^2 - y^2/b^2 = 1", note: "Two disconnected bowls along z." },
    { id: "ellipsoid", label: "Ellipsoid", formula: "x^2/a^2 + y^2/b^2 + z^2/c^2 = 1", note: "Stretched sphere with three radii." },
    { id: "torus_implicit", label: "Torus (implicit)", formula: "(sqrt(x^2+y^2)-R)^2 + z^2 = r^2", note: "Implicit donut surface." },
    { id: "gyroid", label: "Gyroid", formula: "sin x cos y + sin y cos z + sin z cos x = 0", note: "Triply periodic minimal surface." },
    { id: "superquadric", label: "Superquadric", formula: "|x|^n + |y|^n + |z|^n = 1", note: "Boxy to round as n varies." },
    { id: "roman", label: "Roman (Steiner) surface", formula: "x^2 y^2 + y^2 z^2 + z^2 x^2 - 2xyz = 0", note: "Classical self-intersecting quartic." },
    { id: "scherk", label: "Scherk minimal surface", formula: "sin z - sinh x sinh y = 0", note: "Periodic minimal surface with saddle sheets." },

    // graph surfaces
    { id: "graph_saddle", label: "Saddle graph", formula: "z = x² − y²", note: "Classical saddle; negative curvature at the origin." },
    { id: "graph_rotatedSaddle", label: "Rotated saddle", formula: "z = 2xy", note: "Same as x² − y² rotated by 45°." },
    { id: "graph_monkey", label: "Monkey saddle", formula: "z = x³ − 3xy²", note: "Saddle with 3 valleys; higher-order critical point." },
    { id: "graph_wave", label: "Wave", formula: "z = sin x · cos y", note: "Periodic surface; good for gradients." },
    { id: "graph_paraboloid", label: "Paraboloid graph", formula: "z = 0.3(x^2+y^2)", note: "Convex bowl; positive curvature." },
    { id: "graph_gaussian", label: "Gaussian bump", formula: "z = exp(-(x^2+y^2))", note: "Bell-shaped bump with fast decay." },
    { id: "graph_ripple", label: "Ripple", formula: "z = sin(3r)/(3r)", note: "Radial ripples, r = sqrt(x^2+y^2)." },
    { id: "graph_mexican", label: "Mexican hat", formula: "z = (1-r^2) exp(-r^2/2)", note: "Ring with a central peak." },
    { id: "graph_sinSum", label: "Sin+Cos", formula: "z = sin x + cos y", note: "Simple sinusoidal grid." },
    { id: "graph_sinc", label: "Sinc", formula: "z = sin r / r", note: "Radial sinc with gentle decay." },
    { id: "graph_sinc2", label: "Sinc (decay)", formula: "z = sin(2r) / (1 + r^2)", note: "Higher frequency with decay." },
    { id: "graph_custom", label: "Custom graph", formula: "z = f(x, y)", note: "User-defined graph expression in x,y." },

    // implicit custom
    { id: "implicit_custom", label: "Implicit surface", formula: "f(x, y, z) = 0", note: "Level set of an equation." },
  ];

const GRAPH_SURFACE_IDS: SurfaceId[] = [
  "graph_saddle",
  "graph_rotatedSaddle",
  "graph_monkey",
  "graph_wave",
  "graph_paraboloid",
  "graph_gaussian",
  "graph_ripple",
  "graph_mexican",
  "graph_sinSum",
  "graph_sinc",
  "graph_sinc2",
  "graph_custom",
];

const IMPLICIT_EXPR_PRESETS: { id: SurfaceId; label: string; expr: string }[] = [
  { id: "sphere", label: "Sphere", expr: "x*x + y*y + z*z - 1" },
  { id: "hyperboloid", label: "Hyperboloid", expr: "x*x/(0.8^2) + z*z/(0.8^2) - y*y/(0.6^2) - 1" },
  { id: "paraboloid", label: "Paraboloid", expr: "y - (x*x + z*z)" },
  { id: "cone", label: "Cone", expr: "x*x + z*z - (0.5*(1.2 - y))^2" },
  { id: "cylinder", label: "Cylinder", expr: "x*x + z*z - 1" },
  { id: "hyperboloid_twoSheet", label: "Two-sheet hyperboloid", expr: "z*z/(0.9^2) - x*x/(0.7^2) - y*y/(0.7^2) - 1" },
  { id: "ellipsoid", label: "Ellipsoid", expr: "x*x/(1.3^2) + y*y/(0.9^2) + z*z/(0.7^2) - 1" },
  { id: "torus_implicit", label: "Torus", expr: "(sqrt(x*x + y*y) - 1.05)^2 + z*z - 0.45^2" },
  { id: "gyroid", label: "Gyroid", expr: "sin(x*1.4)*cos(y*1.4) + sin(y*1.4)*cos(z*1.4) + sin(z*1.4)*cos(x*1.4)" },
  { id: "superquadric", label: "Superquadric", expr: "abs(x)^4 + abs(y)^4 + abs(z)^4 - 1.2" },
  { id: "roman", label: "Roman surface", expr: "x*x*y*y + y*y*z*z + z*z*x*x - 2*x*y*z" },
  { id: "scherk", label: "Scherk surface", expr: "sin(z) - (0.5*(exp(x) - exp(-x)))*(0.5*(exp(y) - exp(-y)))" },
];

const pillRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

const pill = (active: boolean): React.CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid " + (active ? "#0a66c2" : "#ddd"),
  background: active ? "#e6f0ff" : "#fff",
  fontWeight: active ? 700 : 500,
  cursor: "pointer",
  userSelect: "none",
  fontSize: 12,
});

const PARAM_CURVATURE_COLOR_MODES: ColorMode[] = ["gaussian", "mean", "k1", "k2"];

const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  solid: "Solid",
  height: "Height",
  radius: "Radius",
  phase: "Phase",
  curvature: "Curvature",
  gaussian: "K",
  mean: "H",
  k1: "k1",
  k2: "k2",
};




function isGraphSurface(id: SurfaceId): boolean {
  return GRAPH_SURFACE_IDS.includes(id);
}

function isMeshSurface(id: SurfaceId): boolean {
  return id === "surface_mesh";
}

function isImplicitSurface(id: SurfaceId): boolean {
  return !isGraphSurface(id) && !isMeshSurface(id);
}

function normalizeImplicitDomain(d: ImplicitDomain, fallback: ImplicitDomain): ImplicitDomain {
  const xSpan = Math.max(0.2, Number(d.xSpan));
  const ySpan = Math.max(0.2, Number(d.ySpan));
  return {
    xSpan: Number.isFinite(xSpan) && xSpan > 0 ? xSpan : fallback.xSpan,
    ySpan: Number.isFinite(ySpan) && ySpan > 0 ? ySpan : fallback.ySpan,
  };
}

const DEFAULT_IMPLICIT_BAKE_BOUNDS: ImplicitBakeBounds = { xSpan: 2.2, ySpan: 2.2, zSpan: 2.2 };

function normalizeImplicitBakeBounds(d: ImplicitBakeBounds, fallback: ImplicitBakeBounds): ImplicitBakeBounds {
  const xSpan = Math.max(0.2, Number(d.xSpan));
  const ySpan = Math.max(0.2, Number(d.ySpan));
  const zSpan = Math.max(0.2, Number(d.zSpan));
  return {
    xSpan: Number.isFinite(xSpan) && xSpan > 0 ? xSpan : fallback.xSpan,
    ySpan: Number.isFinite(ySpan) && ySpan > 0 ? ySpan : fallback.ySpan,
    zSpan: Number.isFinite(zSpan) && zSpan > 0 ? zSpan : Math.max(fallback.xSpan, fallback.ySpan),
  };
}

function getDefaultGraphSpan(id: SurfaceId): GraphDomain {
  switch (id) {
    case "graph_saddle":
    case "graph_rotatedSaddle":
      return { xSpan: 1.5, ySpan: 1.5 };
    case "graph_monkey":
      return { xSpan: 1.4, ySpan: 1.4 };
    case "graph_wave":
      return { xSpan: Math.PI, ySpan: Math.PI };
    case "graph_paraboloid":
      return { xSpan: 1.7, ySpan: 1.7 };
    case "graph_gaussian":
      return { xSpan: 2.0, ySpan: 2.0 };
    case "graph_ripple":
      return { xSpan: 2.4, ySpan: 2.4 };
    case "graph_mexican":
      return { xSpan: 2.2, ySpan: 2.2 };
    case "graph_sinSum":
      return { xSpan: Math.PI, ySpan: Math.PI };
    case "graph_sinc":
    case "graph_sinc2":
      return { xSpan: 5, ySpan: 5 };
    case "graph_custom":
      return { xSpan: 2, ySpan: 2 };
    default:
      return { xSpan: 2, ySpan: 2 };
  }
}

function getDefaultImplicitDomain(id: SurfaceId): ImplicitDomain {
  const toSpan = (size: number) => ({ xSpan: size, ySpan: size });
  switch (id) {
    case "torus_implicit":
      return toSpan(2.1);
    case "hyperboloid_twoSheet":
      return toSpan(2.3);
    case "roman":
      return toSpan(1.8);
    case "scherk":
      return toSpan(1.6);
    case "implicit_custom":
      return toSpan(2.1);
    case "gyroid":
    case "superquadric":
    case "ellipsoid":
      return toSpan(2.2);
    default:
      return toSpan(2.2);
  }
}

// parametric surfaces metadata (for ParamSurfaceViewer)
const PARAM_SURFACES_META: {
  id: ParamSurfaceId;
  label: string;
  formula: string;
  note: string;
}[] = [
    { id: "plane", label: "Plane", formula: "σ(u,v) = (u, v, 0)", note: "Developable; K = 0." },
    { id: "cylinder", label: "Circular cylinder", formula: "σ(u,v) = (cos u, sin u, v)", note: "One principal curvature is 0." },
    { id: "cone", label: "Cone (away from tip)", formula: "σ(u,v) = (v cos u, v sin u, v)", note: "Rulings through a vertex; tip is singular." },
    { id: "helicoid", label: "Helicoid", formula: "σ(u,v) = (v cos u, v sin u, a u)", note: "Minimal ruled surface." },
    { id: "catenoid", label: "Catenoid", formula: "σ(u,v) = (cosh v cos u, cosh v sin u, v)", note: "Minimal surface of revolution." },
    { id: "sphere", label: "Sphere", formula: "σ(u,v) = (R sin v cos u, R sin v sin u, R cos v)", note: "Spherical coordinates." },
    { id: "ellipsoid", label: "Ellipsoid", formula: "σ(u,v) = (a sin v cos u, b sin v sin u, c cos v)", note: "Scaled sphere with three axes." },
    { id: "paraboloid", label: "Paraboloid (param)", formula: "σ(u,v) = (u cos v, u sin v, u^2)", note: "Parametric paraboloid." },
    { id: "pseudosphere", label: "Pseudosphere", formula: "σ(u,v) = (cos u sech v, sin u sech v, v - tanh v)", note: "Constant negative curvature surface." },
    { id: "dini", label: "Dini surface", formula: "σ(u,v) = (cos u sin v, sin u sin v, cos v + log tan(v/2) + b u)", note: "Twisted pseudosphere." },
    { id: "twistedStrip", label: "Twisted strip", formula: "σ(u,v) = ((1+v cos 2u) cos u, (1+v cos 2u) sin u, v sin 2u)", note: "Strip with two twists." },
    { id: "torus", label: "Torus", formula: "σ(u,v) = ((R + r cos v) cos u, (R + r cos v) sin u, r sin v)", note: "Donut surface." },
    { id: "mobius", label: "Möbius strip", formula: "σ(u,v) ≈ ((1 + v/2 cos(u/2)) cos u, …)", note: "Non-orientable strip." },
    { id: "kleinBottle", label: "Klein bottle", formula: "σ(u,v) = immersion in ℝ³ (self-intersecting)", note: "Embedding needs ℝ⁴." },
    { id: "hyperbolicParaboloid", label: "Hyperbolic paraboloid", formula: "σ(u,v) = (u, v, u v)", note: "Saddle; ruled (two families)." },
    { id: "enneper", label: "Enneper surface", formula: "σ(u,v) = (u − u³/3 + u v², v − v³/3 + v u², u² − v²)", note: "Minimal; self-intersections." },
      { id: "expCone", label: "Exp cone", formula: "σ(u,v) = (e^u cos v, e^u sin v, u)", note: "u>0; v is angle." },

  { id: "helicoidUV", label: "Helicoid (u,v)", formula: "σ(u,v) = (u cos v, u sin v, v)", note: "v is angle + height; use a few turns (no wrapV)." },
  { id: "boy", label: "Boy's surface", formula: "σ(u,v) = Bryant-Kusner param", note: "Immersion of RP2; self-intersections." },

    { id: "custom", label: "Custom σ(u,v)", formula: "σ(u,v) = (X(u,v), Y(u,v), Z(u,v))", note: "User-defined parametrisation." },
  ];

function getParamDomainPreviewBounds(id: ParamSurfaceId) {
  // keep these consistent with ParamSurfaceViewer's domain switch
  switch (id) {
    case "expCone":
      return { uMin: 0.15, uMax: 2.8, vMin: 0, vMax: 2 * Math.PI };

    case "helicoidUV":
      return { uMin: 0, uMax: 1.8, vMin: 0, vMax: 6 * Math.PI };
    case "boy":
      return { uMin: 0, uMax: Math.PI, vMin: 0, vMax: Math.PI };

    case "paraboloid":
      return { uMin: 0, uMax: 2, vMin: 0, vMax: 2 * Math.PI };

    case "pseudosphere":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: 0, vMax: 2.6 };

    case "dini":
      return { uMin: 0, uMax: 4 * Math.PI, vMin: 0.25, vMax: 1.35 };

    case "twistedStrip":
      return { uMin: 0, uMax: 2 * Math.PI, vMin: -0.6, vMax: 0.6 };

    // defaults for everything else (safe generic)
    default:
      return { uMin: -Math.PI, uMax: Math.PI, vMin: -1, vMax: 1 };
  }
}

/* ---------------- small helpers ---------------- */

type GraphDomainPreset = {
  id: string;
  surfaceId: SurfaceId;
  label: string;
  xSpan: number;
  ySpan: number;
  createdAt: number;
};

type ParamDomainPreset = {
  id: string;
  surfaceId: ParamSurfaceId;
  label: string;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  createdAt: number;
};

type ImplicitDomainPreset = {
  id: string;
  surfaceId: SurfaceId;
  label: string;
  xSpan: number;
  ySpan: number;
  createdAt: number;
};

type GeodesicPathEndpoint = {
  meshKey: string;
  vertexIndex: number;
};
type GeodesicHeatEndpoint = {
  meshKey: string;
  faceIndex: number;
  bary: [number, number, number];
  point: { x: number; y: number; z: number };
  uv?: { u: number; v: number };
};
type GeodesicDiskCenter = {
  meshKey: string;
  faceIndex: number;
  bary: [number, number, number];
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  uv?: { u: number; v: number };
};

type BBox3 = { min: [number, number, number]; max: [number, number, number] };

function safeParseArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function safeParseRecord<T>(raw: string | null): Record<string, T> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return v as Record<string, T>;
  } catch {
    return {};
  }
}

function safeParseObject<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return v as T;
  } catch {
    return null;
  }
}

function normalizeGraphDomain(d: GraphDomain, fallback: GraphDomain): GraphDomain {
  const x = Number.isFinite(d.xSpan) ? Math.max(0.2, d.xSpan) : fallback.xSpan;
  const y = Number.isFinite(d.ySpan) ? Math.max(0.2, d.ySpan) : fallback.ySpan;
  return { xSpan: x, ySpan: y };
}

function normalizeParamDomain(d: ParamDomain, fallback: ParamDomain): ParamDomain {
  const uMin = Number.isFinite(d.uMin) ? d.uMin : fallback.uMin;
  const uMax = Number.isFinite(d.uMax) ? d.uMax : fallback.uMax;
  const vMin = Number.isFinite(d.vMin) ? d.vMin : fallback.vMin;
  const vMax = Number.isFinite(d.vMax) ? d.vMax : fallback.vMax;

  let u0 = uMin;
  let u1 = uMax;
  let v0 = vMin;
  let v1 = vMax;
  if (u0 === u1) u1 = u0 + 0.1;
  if (v0 === v1) v1 = v0 + 0.1;
  if (u0 > u1) [u0, u1] = [u1, u0];
  if (v0 > v1) [v0, v1] = [v1, v0];
  return { uMin: u0, uMax: u1, vMin: v0, vMax: v1 };
}

function bboxDiag(b: BBox3) {
  const dx = b.max[0] - b.min[0];
  const dy = b.max[1] - b.min[1];
  const dz = b.max[2] - b.min[2];
  return Math.hypot(dx, dy, dz);
}

function inflateBBox(b: BBox3, padFrac = 0.05): BBox3 {
  const diag = bboxDiag(b);
  const pad = Math.max(1e-6, padFrac * diag);
  return {
    min: [b.min[0] - pad, b.min[1] - pad, b.min[2] - pad],
    max: [b.max[0] + pad, b.max[1] + pad, b.max[2] + pad],
  };
}

function boundsFromPositions(positions: ArrayLike<number> | null | undefined): BBox3 | null {
  if (!positions || positions.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = Number(positions[i]);
    const y = Number(positions[i + 1]);
    const z = Number(positions[i + 2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!(minX <= maxX) || !(minY <= maxY) || !(minZ <= maxZ)) return null;
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

function clampBBox(b: BBox3, c: BBox3): BBox3 {
  return {
    min: [
      Math.max(b.min[0], c.min[0]),
      Math.max(b.min[1], c.min[1]),
      Math.max(b.min[2], c.min[2]),
    ],
    max: [
      Math.min(b.max[0], c.max[0]),
      Math.min(b.max[1], c.max[1]),
      Math.min(b.max[2], c.max[2]),
    ],
  };
}

function estimateTargetEdgeFromBudget(diag: number, triBudget: number) {
  const budget = Math.max(200, triBudget);
  const edge = diag * Math.sqrt(6.25 / budget);
  return Math.max(1e-6, Math.min(diag, edge));
}

function estimateTrianglesFromDiag(diag: number, targetEdge: number) {
  if (!Number.isFinite(diag) || !Number.isFinite(targetEdge) || targetEdge <= 0) return 0;
  const r = 0.5 * diag;
  const area = 4 * Math.PI * r * r;
  const triArea = (Math.sqrt(3) / 4) * (targetEdge * targetEdge);
  return Math.max(0, Math.floor(area / Math.max(1e-12, triArea)));
}

function getCgalDomainBBox(args: {
  selectionBBox?: BBox3 | null;
  implicitDomainBBox: BBox3;
  padFrac?: number;
}): BBox3 {
  const padFrac = args.padFrac ?? 0.05;

  // priority: selection -> implicit domain
  let b = args.selectionBBox ?? args.implicitDomainBBox;

  b = inflateBBox(b, padFrac);

  // clamp inflated selection back into global domain
  if (args.selectionBBox) {
    b = clampBBox(b, args.implicitDomainBBox);
  }

  // validate
  for (let i = 0; i < 3; i++) {
    if (!(b.min[i] < b.max[i])) return inflateBBox(args.implicitDomainBBox, 0.0);
  }
  if (bboxDiag(b) < 1e-6) return inflateBBox(args.implicitDomainBBox, 0.0);

  return b;
}

function saveArray(key: string, arr: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

function saveRecord<T>(key: string, record: Record<string, T>) {
  try {
    localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // ignore
  }
}

type WeierstrassDiagnosticsSuccess = Extract<WeierstrassDriftResult, { drift: number }>;

function isWeierstrassDiagnosticsSuccess(
  diag: WeierstrassDriftResult | null
): diag is WeierstrassDiagnosticsSuccess {
  return !!diag && "drift" in diag && "driftVec" in diag && "okLevel" in diag;
}

function makeId() {
  const c: any = globalThis.crypto;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : `${Date.now()}_${Math.random()}`;
}

const resolveVisualizeSnapshot = (
  visualize: WorkbookBlock["visualize"] | undefined,
  slot: WorkbookSnapshotSlot
): WorkbookViewSnapshot | null => {
  if (!visualize) return null;
  if (slot === "A") return visualize.snapshotA ?? visualize.snapshot ?? null;
  return visualize.snapshotB ?? null;
};

function normalizeWorkbooks(raw: Workbook[]): Workbook[] {
  return raw.map((wb) => ({
    ...wb,
    stages: wb.stages.map((stage) => ({
      ...stage,
      blocks: stage.blocks.map((block) => {
        if (block.type !== "visualize") return block;
        const visualize = block.visualize ?? { live: true };
        const snapshotA = visualize.snapshotA ?? visualize.snapshot ?? null;
        const snapshotB = visualize.snapshotB ?? null;
        if (visualize.snapshotA === snapshotA && visualize.snapshotB === snapshotB) return block;
        return {
          ...block,
          visualize: {
            ...visualize,
            snapshotA,
            snapshotB,
          },
        };
      }),
    })),
  }));
}

function loadWorkbooks(): Workbook[] {
  if (REPLAY_PAYLOAD?.workbooks?.length) return normalizeWorkbooks(REPLAY_PAYLOAD.workbooks);
  const raw = safeParseArray<Workbook>(localStorage.getItem(WORKBOOK_STORAGE_KEY));
  if (raw.length > 0) return normalizeWorkbooks(raw);
  return [createDefaultWorkbook(makeId)];
}

function autoLabelGraphDomain(xSpan: number, ySpan: number) {
  return `x±${xSpan.toFixed(2)} y±${ySpan.toFixed(2)}`;
}

function autoLabelImplicitDomain(xSpan: number, ySpan: number) {
  return `xñ${xSpan.toFixed(2)} yñ${ySpan.toFixed(2)}`;
}

function sanitizeFileBase(label: string, fallback: string) {
  const raw = (label ?? "").trim() || fallback;
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

const WORKBOOK_EXPORT_BLOCK_LABELS: Record<WorkbookBlockType, string> = {
  text: "Text",
  formula: "Formula",
  visualize: "Visualize",
  compute: "Compute",
  interaction: "Interact",
  assert: "Assert",
};

const formatExportTimestamp = (ts: number) => {
  if (!Number.isFinite(ts)) return "unknown";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return new Date(ts).toISOString();
  }
};

const formatSpan = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : "?");

const formatSpanDomain = (domain?: { xSpan: number; ySpan: number }) =>
  domain ? `x±${formatSpan(domain.xSpan)} y±${formatSpan(domain.ySpan)}` : null;

const formatParamDomain = (domain?: { uMin: number; uMax: number; vMin: number; vMax: number }) =>
  domain
    ? `u:${formatSpan(domain.uMin)}..${formatSpan(domain.uMax)} v:${formatSpan(domain.vMin)}..${formatSpan(domain.vMax)}`
    : null;

const buildSnapshotDetails = (snapshot: WorkbookViewSnapshot) => {
  const details: string[] = [];
  if (snapshot.datasetRef) details.push(`Dataset: ${snapshot.datasetRef}`);
  if (snapshot.datasetKind) details.push(`Dataset kind: ${snapshot.datasetKind}`);
  if (snapshot.viewerKind) details.push(`Viewer: ${snapshot.viewerKind}`);
  if (snapshot.surfaceId) details.push(`Surface: ${snapshot.surfaceId}`);
  if (snapshot.paramId) details.push(`Param surface: ${snapshot.paramId}`);
  if (snapshot.graphExpr) details.push(`Graph: ${snapshot.graphExpr}`);
  if (snapshot.implicitExpr) details.push(`Implicit: ${snapshot.implicitExpr}`);
  if (snapshot.paramXExpr || snapshot.paramYExpr || snapshot.paramZExpr) {
    details.push(
      `Param: x=${snapshot.paramXExpr ?? "?"}, y=${snapshot.paramYExpr ?? "?"}, z=${snapshot.paramZExpr ?? "?"}`
    );
  }
  if (snapshot.weierstrassGExpr || snapshot.weierstrassPhiExpr) {
    details.push(
      `Weierstrass: g=${snapshot.weierstrassGExpr ?? "?"}, phi=${snapshot.weierstrassPhiExpr ?? "?"}`
    );
  }
  const graphDomain = formatSpanDomain(snapshot.graphDomain);
  if (graphDomain) details.push(`Graph domain: ${graphDomain}`);
  const implicitDomain = formatSpanDomain(snapshot.implicitDomain);
  if (implicitDomain) details.push(`Implicit domain: ${implicitDomain}`);
  const paramDomain = formatParamDomain(snapshot.paramDomain);
  if (paramDomain) details.push(`Param domain: ${paramDomain}`);
  const weierstrassDomain = formatParamDomain(snapshot.weierstrassDomain);
  if (weierstrassDomain) details.push(`Weierstrass domain: ${weierstrassDomain}`);
  if (snapshot.graphResolution) details.push(`Graph resolution: ${snapshot.graphResolution}`);
  if (snapshot.implicitResolution) details.push(`Implicit resolution: ${snapshot.implicitResolution}`);
  if (snapshot.paramResolution) details.push(`Param resolution: ${snapshot.paramResolution}`);
  if (snapshot.weierstrassResolution) details.push(`Weierstrass resolution: ${snapshot.weierstrassResolution}`);
  if (snapshot.colorMode) details.push(`Color mode: ${snapshot.colorMode}`);
  if (snapshot.colorPalette) details.push(`Color palette: ${snapshot.colorPalette}`);
  return details;
};

const downloadTextFile = (contents: string, filename: string, mime = "text/plain") => {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildWorkbooksMarkdown = (workbooks: Workbook[], activeWorkbookId: string | null) => {
  const exportedAt = formatExportTimestamp(Date.now());
  if (!workbooks.length) {
    return ["# Math3D Workbook Export", `_Exported ${exportedAt}_`, "_No workbooks available._"].join("\n\n");
  }
  const multi = workbooks.length > 1;
  const lines: string[] = [];
  if (multi) {
    lines.push("# Math3D Workbook Export");
    lines.push(`_Exported ${exportedAt}_`);
  }
  workbooks.forEach((workbook) => {
    const titleLine = `${multi ? "##" : "#"} ${workbook.title}${workbook.id === activeWorkbookId ? " (active)" : ""}`;
    lines.push(titleLine);
    if (!multi) lines.push(`_Exported ${exportedAt}_`);
    lines.push(`_Last updated ${formatExportTimestamp(workbook.updatedAt)}_`);

    workbook.stages.forEach((stage, stageIndex) => {
      lines.push(`${multi ? "###" : "##"} ${stageIndex + 1}. ${stage.title}`);
      if (!stage.blocks.length) {
        lines.push("_No blocks in this stage._");
        return;
      }
      stage.blocks.forEach((block, blockIndex) => {
        const blockLabel = WORKBOOK_EXPORT_BLOCK_LABELS[block.type];
        const blockTitle = block.title || blockLabel;
        lines.push(`${multi ? "####" : "###"} ${stageIndex + 1}.${blockIndex + 1} ${blockTitle}`);
        lines.push(`Type: ${blockLabel}`);
        if (block.type === "text") {
          lines.push(block.text?.trim() ? block.text : "_(No text)_");
        } else if (block.type === "formula") {
          lines.push("```");
          lines.push(block.formula ?? "");
          lines.push("```");
        } else if (block.type === "compute") {
          lines.push(`Operator: ${block.compute?.operatorId ?? "—"}`);
          if (block.compute?.status) lines.push(`Status: ${block.compute.status}`);
          if (block.compute?.summary) lines.push(`Summary: ${block.compute.summary}`);
        } else if (block.type === "interaction") {
          if (block.interaction?.kind) lines.push(`Interaction: ${block.interaction.kind}`);
          if (block.interaction?.summary) lines.push(`Summary: ${block.interaction.summary}`);
        } else if (block.type === "assert") {
          if (block.assert?.expected) lines.push(`Expected: ${block.assert.expected}`);
          if (block.assert?.status) lines.push(`Status: ${block.assert.status}`);
        } else if (block.type === "visualize") {
          const note = block.visualize?.notes?.trim();
          if (note) lines.push(`> ${note}`);
          const snapshots: { label: string; snap: WorkbookViewSnapshot | null }[] = [
            { label: "A", snap: resolveVisualizeSnapshot(block.visualize, "A") },
            { label: "B", snap: resolveVisualizeSnapshot(block.visualize, "B") },
          ];
          snapshots.forEach(({ label, snap }) => {
            lines.push(`**Snapshot ${label}**`);
            if (snap?.thumbnail) {
              lines.push(`![Snapshot ${label}](${snap.thumbnail})`);
            } else {
              lines.push("_(No thumbnail)_");
            }
            if (snap) {
              lines.push(`Captured: ${formatExportTimestamp(snap.capturedAt)}`);
              const details = buildSnapshotDetails(snap);
              if (details.length) lines.push(details.map((d) => `- ${d}`).join("\n"));
            }
          });
        }
        const params = block.params;
        if (params?.defs?.length) {
          const paramSummary = params.defs
            .map((def) => {
              const value = params.values?.[def.id] ?? def.defaultValue ?? "";
              return `${def.label}=${String(value)}`;
            })
            .join(", ");
          if (paramSummary) lines.push(`Params: ${paramSummary}`);
        }
      });
    });
  });
  return lines.join("\n\n");
};

const buildWorkbooksReportHtml = (workbooks: Workbook[], activeWorkbookId: string | null) => {
  const exportedAt = formatExportTimestamp(Date.now());
  const multi = workbooks.length > 1;
  const hasWorkbooks = workbooks.length > 0;
  const bookTitle = multi ? "Math3D Workbook Export" : workbooks[0]?.title ?? "Math3D Workbook Export";
  const styles = `
    :root { color-scheme: light; }
    body { margin: 0; font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; background: #f8fafc; color: #0f172a; }
    .report { max-width: 980px; margin: 0 auto; padding: 24px 28px 40px; }
    .report h1 { margin: 0 0 6px; font-size: 26px; }
    .report h2 { margin: 24px 0 8px; font-size: 22px; }
    .report h3 { margin: 16px 0 6px; font-size: 18px; color: #1e293b; }
    .meta { font-size: 12px; color: #64748b; margin-bottom: 8px; }
    .workbook { margin-top: 20px; }
    .stage { margin-top: 12px; }
    .block { margin-top: 12px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
    .block-header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .block-title { font-size: 14px; font-weight: 700; }
    .block-type { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; }
    .block-body { margin-top: 8px; font-size: 12px; color: #1e293b; }
    .block-body pre { margin: 0; white-space: pre-wrap; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; }
    .snapshot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 8px; }
    .snapshot { border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px; background: #f8fafc; }
    .snapshot-title { font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 6px; }
    .snapshot img { width: 100%; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; }
    .snapshot .missing { height: 120px; border-radius: 8px; border: 1px dashed #cbd5f5; background: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #64748b; }
    .caption { font-size: 11px; color: #475569; margin-top: 6px; }
    ul.details { margin: 6px 0 0; padding-left: 18px; font-size: 11px; color: #475569; }
    .note { font-size: 12px; color: #334155; background: #f1f5f9; border-radius: 8px; padding: 6px 8px; }
    @media print {
      body { background: #fff; }
      .block { break-inside: avoid; }
      .snapshot { break-inside: avoid; }
    }
  `;

  const snapshotHtml = (snap: WorkbookViewSnapshot | null, label: string) => {
    if (!snap) {
      return `
        <div class="snapshot">
          <div class="snapshot-title">Snapshot ${label}</div>
          <div class="missing">No snapshot</div>
        </div>
      `;
    }
    const details = buildSnapshotDetails(snap);
    const detailList = details.length
      ? `<ul class="details">${details.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>`
      : "";
    const caption = `Captured ${formatExportTimestamp(snap.capturedAt)}`;
    const image = snap.thumbnail
      ? `<img src="${snap.thumbnail}" alt="Snapshot ${label}" />`
      : `<div class="missing">No thumbnail</div>`;
    return `
      <div class="snapshot">
        <div class="snapshot-title">Snapshot ${label}</div>
        ${image}
        <div class="caption">${escapeHtml(caption)}</div>
        ${detailList}
      </div>
    `;
  };

  const blocksHtml = (blocks: Workbook["stages"][number]["blocks"]) =>
    blocks
      .map((block, blockIndex) => {
        const blockLabel = WORKBOOK_EXPORT_BLOCK_LABELS[block.type];
        const blockTitle = block.title || blockLabel;
        const paramsState = block.params;
        const params =
          paramsState?.defs?.length
            ? `<div class="meta">Params: ${escapeHtml(
                paramsState.defs
                  .map((def) => {
                    const value = paramsState.values?.[def.id] ?? def.defaultValue ?? "";
                    return `${def.label}=${String(value)}`;
                  })
                  .join(", ")
              )}</div>`
            : "";
        let body = "";
        if (block.type === "text") {
          body = `<div class="block-body"><pre>${escapeHtml(block.text ?? "")}</pre></div>`;
        } else if (block.type === "formula") {
          body = `<div class="block-body"><pre>${escapeHtml(block.formula ?? "")}</pre></div>`;
        } else if (block.type === "compute") {
          body = `<div class="block-body">
            <div>Operator: ${escapeHtml(block.compute?.operatorId ?? "—")}</div>
            ${block.compute?.status ? `<div>Status: ${escapeHtml(block.compute.status)}</div>` : ""}
            ${block.compute?.summary ? `<div>Summary: ${escapeHtml(block.compute.summary)}</div>` : ""}
          </div>`;
        } else if (block.type === "interaction") {
          body = `<div class="block-body">
            ${block.interaction?.kind ? `<div>Interaction: ${escapeHtml(block.interaction.kind)}</div>` : ""}
            ${block.interaction?.summary ? `<div>Summary: ${escapeHtml(block.interaction.summary)}</div>` : ""}
          </div>`;
        } else if (block.type === "assert") {
          body = `<div class="block-body">
            ${block.assert?.expected ? `<div>Expected: ${escapeHtml(block.assert.expected)}</div>` : ""}
            ${block.assert?.status ? `<div>Status: ${escapeHtml(block.assert.status)}</div>` : ""}
          </div>`;
        } else if (block.type === "visualize") {
          const note = block.visualize?.notes?.trim();
          const snapA = resolveVisualizeSnapshot(block.visualize, "A");
          const snapB = resolveVisualizeSnapshot(block.visualize, "B");
          body = `<div class="block-body">
            ${note ? `<div class="note">${escapeHtml(note)}</div>` : ""}
            <div class="snapshot-grid">
              ${snapshotHtml(snapA, "A")}
              ${snapshotHtml(snapB, "B")}
            </div>
          </div>`;
        }
        return `
          <div class="block">
            <div class="block-header">
              <div class="block-title">${escapeHtml(`${blockIndex + 1}. ${blockTitle}`)}</div>
              <div class="block-type">${escapeHtml(blockLabel)}</div>
            </div>
            ${params}
            ${body}
          </div>
        `;
      })
      .join("");

  const workbooksHtml = hasWorkbooks
    ? workbooks
        .map((workbook, idx) => {
          const title = escapeHtml(
            `${workbook.title}${workbook.id === activeWorkbookId ? " (active)" : ""}`
          );
          const heading = multi ? `<h2>${idx + 1}. ${title}</h2>` : `<h1>${title}</h1>`;
          const updated = `<div class="meta">Last updated ${escapeHtml(formatExportTimestamp(workbook.updatedAt))}</div>`;
          const stages = workbook.stages
            .map(
              (stage, stageIndex) => `
                <div class="stage">
                  <h3>${stageIndex + 1}. ${escapeHtml(stage.title)}</h3>
                  ${stage.blocks.length ? blocksHtml(stage.blocks) : `<div class="meta">No blocks.</div>`}
                </div>
              `
            )
            .join("");
          return `<section class="workbook">${heading}${updated}${stages}</section>`;
        })
        .join("")
    : `<div class="meta">No workbooks available.</div>`;

  const header = multi
    ? `<h1>${escapeHtml(bookTitle)}</h1><div class="meta">Exported ${escapeHtml(exportedAt)}</div>`
    : `<div class="meta">Exported ${escapeHtml(exportedAt)}</div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(bookTitle)}</title>
    <style>${styles}</style>
  </head>
  <body>
    <div class="report">
      ${header}
      ${workbooksHtml}
    </div>
  </body>
</html>`;
};

type ReplayAssetBundle =
  | { inline: true; cssText: string; jsText: string }
  | { inline: false; cssLinks: string[]; scriptLinks: string[]; inlineStyles: string };

const collectReplayAssets = async (): Promise<ReplayAssetBundle> => {
  const inlineStyles = Array.from(document.querySelectorAll("style"))
    .map((node) => node.textContent ?? "")
    .filter(Boolean)
    .join("\n");
  const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((node) => (node as HTMLLinkElement).href)
    .filter(Boolean);
  const scriptLinks = Array.from(document.querySelectorAll('script[type="module"][src]'))
    .map((node) => (node as HTMLScriptElement).src)
    .filter(Boolean);

  const fetchText = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    return res.text();
  };

  try {
    const cssTexts = await Promise.all(cssLinks.map(fetchText));
    const jsTexts = await Promise.all(scriptLinks.map(fetchText));
    return {
      inline: true,
      cssText: [inlineStyles, ...cssTexts].filter(Boolean).join("\n"),
      jsText: jsTexts.join("\n\n"),
    };
  } catch {
    return { inline: false, cssLinks, scriptLinks, inlineStyles };
  }
};

const buildReplayHtml = (payload: WorkbookReplayPayload, assets: ReplayAssetBundle, title: string) => {
  const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  const safeTitle = escapeHtml(title);
  const headParts: string[] = [];
  if (assets.inline) {
    headParts.push(`<style>${assets.cssText}</style>`);
  } else {
    if (assets.inlineStyles) headParts.push(`<style>${assets.inlineStyles}</style>`);
    headParts.push(...assets.cssLinks.map((href) => `<link rel="stylesheet" href="${href}">`));
  }
  const scriptTag = assets.inline
    ? `<script type="module">${assets.jsText.replace(/<\/script>/gi, "<\\/script>")}</script>`
    : assets.scriptLinks.map((src) => `<script type="module" src="${src}"></script>`).join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    ${headParts.join("\n")}
  </head>
  <body>
    <div id="root"></div>
    <script>window.__MATH3D_REPLAY__ = ${payloadJson};</script>
    ${scriptTag}
  </body>
</html>`;
};

function autoLabelParamDomain(p: ParamDomain) {
  return `u:${p.uMin.toFixed(2)}..${p.uMax.toFixed(2)} v:${p.vMin.toFixed(2)}..${p.vMax.toFixed(2)}`;
}

const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : String(x));
const fmt3 = (v: { x: number; y: number; z: number }) => `(${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)})`;
type Vec3 = { x: number; y: number; z: number };
const vLen = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
const vDot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const vScale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const vAdd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const vSub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vCross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const vNormalize = (v: Vec3): Vec3 => {
  const len = vLen(v);
  return len > 1e-12 ? vScale(v, 1 / len) : { x: 0, y: 0, z: 0 };
};

const buildTangentBasis = (normal: Vec3) => {
  const n = vNormalize(normal);
  const ref = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const t1 = vNormalize(vCross(ref, n));
  const t2 = vNormalize(vCross(n, t1));
  return { t1, t2 };
};

const stableStringify = (value: unknown) => {
  const seen = new WeakSet();
  const walk = (val: any): any => {
    if (val === null || typeof val !== "object") return val;
    if (seen.has(val)) return "[Circular]";
    seen.add(val);
    if (Array.isArray(val)) return val.map(walk);
    const out: Record<string, any> = {};
    for (const key of Object.keys(val).sort()) {
      out[key] = walk(val[key]);
    }
    return out;
  };
  return JSON.stringify(walk(value));
};

const hashString = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const hashValue = (value: unknown) => hashString(stableStringify(value));

const WORKBOOK_PARAM_CATALOG: WorkbookParamDef[] = [
  { id: "graphResolution", label: "Graph resolution", kind: "number", min: 20, max: 320, step: 1, defaultValue: 80 },
  { id: "paramResolution", label: "Param resolution", kind: "number", min: 20, max: 320, step: 1, defaultValue: 160 },
  { id: "implicitResolution", label: "Implicit resolution", kind: "number", min: 8, max: 200, step: 1, defaultValue: 32 },
  { id: "implicitDomainSize", label: "Implicit domain size", kind: "number", min: 0.5, max: 6, step: 0.1, defaultValue: 2.2 },
  { id: "wireframe", label: "Wireframe", kind: "toggle", defaultValue: false },
  { id: "contours", label: "Contours", kind: "toggle", defaultValue: false },
  { id: "chartGrid", label: "Chart grid", kind: "toggle", defaultValue: false },
  { id: "probe", label: "Probe", kind: "toggle", defaultValue: false },
  {
    id: "colorMode",
    label: "Color mode",
    kind: "select",
    options: [
      { value: "solid", label: "Solid" },
      { value: "height", label: "Height" },
      { value: "radius", label: "Radius" },
      { value: "phase", label: "Phase" },
      { value: "curvature", label: "Curvature" },
      { value: "gaussian", label: "Gaussian" },
      { value: "mean", label: "Mean" },
      { value: "k1", label: "k1" },
      { value: "k2", label: "k2" },
    ],
    defaultValue: "solid",
  },
  {
    id: "colorPalette",
    label: "Color palette",
    kind: "select",
    options: [
      { value: "blueRed", label: "Blue/Red" },
      { value: "rainbow", label: "Rainbow" },
      { value: "grayscale", label: "Grayscale" },
      { value: "redYellow", label: "Red/Yellow" },
    ],
    defaultValue: "blueRed",
  },
  { id: "selectionRadius", label: "Selection radius", kind: "number", min: 0.05, max: 3, step: 0.05, defaultValue: 0.4 },
];

const BASE_COMPUTE_INPUTS: WorkbookPort[] = [
  { id: "dataset", label: "Dataset", type: "dataset" },
  { id: "formula", label: "Formula", type: "formula", optional: true },
  { id: "overlay", label: "Overlay", type: "overlay", optional: true },
  { id: "curve", label: "Curve", type: "curve", optional: true },
  { id: "points", label: "Points", type: "points", optional: true },
  { id: "mask", label: "Mask", type: "mask", optional: true },
  { id: "vector", label: "Vector", type: "vector", optional: true },
];
const GEODESIC_INPUTS: WorkbookPort[] = [...BASE_COMPUTE_INPUTS];
const COMPUTE_OPERATOR_OUTPUTS: Record<string, WorkbookPort[]> = {
  chart_grid: [{ id: "overlay", label: "Overlay", type: "overlay" }],
  curve_overlay: [{ id: "curve", label: "Curve", type: "curve" }],
  direction_overlay: [{ id: "curve", label: "Curve", type: "curve" }],
  selection_overlay: [{ id: "mask", label: "Mask", type: "mask" }],
  curvature_field: [{ id: "overlay", label: "Overlay", type: "overlay" }],
  geodesic_heat: [{ id: "curve", label: "Curve", type: "curve" }],
  geodesic_path: [{ id: "curve", label: "Curve", type: "curve" }],
  principal_dirs: [{ id: "overlay", label: "Overlay", type: "overlay" }],
};

const getInteractionPorts = (
  kind?: WorkbookInteractionKind | null
): { inputs: WorkbookPort[]; outputs: WorkbookPort[] } => {
  const inputs: WorkbookPort[] = [{ id: "dataset", label: "Dataset", type: "dataset" }];
  if (!kind) return { inputs, outputs: [] };
  if (kind === "pick_point") {
    const outputs: WorkbookPort[] = [{ id: "points", label: "Point", type: "points" }];
    return { inputs, outputs };
  }
  if (kind === "draw_curve") {
    const outputs: WorkbookPort[] = [{ id: "curve", label: "Curve", type: "curve" }];
    return { inputs, outputs };
  }
  if (kind === "select_region") {
    const outputs: WorkbookPort[] = [{ id: "mask", label: "Mask", type: "mask" }];
    return { inputs, outputs };
  }
  if (kind === "pick_direction") {
    const outputs: WorkbookPort[] = [{ id: "vector", label: "Vector", type: "vector" }];
    return { inputs, outputs };
  }
  return { inputs, outputs: [] };
};

const getComputePorts = (operatorId?: string) => {
  const outputs = operatorId ? COMPUTE_OPERATOR_OUTPUTS[operatorId] ?? [] : [];
  const inputs = operatorId === "geodesic_heat" ? GEODESIC_INPUTS : BASE_COMPUTE_INPUTS;
  return { inputs, outputs };
};

const DEFAULT_BLOCK_PORTS: Record<WorkbookBlockType, { inputs: WorkbookPort[]; outputs: WorkbookPort[] }> = {
  text: { inputs: [], outputs: [{ id: "text", label: "Text", type: "text" }] },
  formula: { inputs: [], outputs: [{ id: "formula", label: "Formula", type: "formula" }] },
  visualize: {
    inputs: [{ id: "dataset", label: "Dataset", type: "dataset" }],
    outputs: [{ id: "snapshot", label: "Snapshot", type: "snapshot" }],
  },
  compute: { inputs: BASE_COMPUTE_INPUTS, outputs: [] },
  interaction: { inputs: [{ id: "dataset", label: "Dataset", type: "dataset" }], outputs: [] },
  assert: { inputs: [{ id: "dataset", label: "Dataset", type: "dataset" }], outputs: [] },
};

const resolveBlockPorts = (block: WorkbookBlock): { inputs: WorkbookPort[]; outputs: WorkbookPort[] } => {
  if (block.type === "compute") {
    const ports = getComputePorts(block.compute?.operatorId);
    const inputs = ports.inputs;
    const outputs = ports.outputs.length ? ports.outputs : block.outputs ?? [];
    return { inputs, outputs };
  }
  if (block.type === "interaction") {
    const ports = getInteractionPorts(block.interaction?.kind ?? null);
    const outputs = ports.outputs.length ? ports.outputs : block.outputs ?? [];
    return { inputs: ports.inputs, outputs };
  }
  const defaults = DEFAULT_BLOCK_PORTS[block.type];
  const inputs = block.inputs?.length ? block.inputs : defaults.inputs;
  const outputs = block.outputs?.length ? block.outputs : defaults.outputs;
  return { inputs, outputs };
};

/* ---------------- App ---------------- */

const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>(IS_REPLAY_MODE ? "surfaces" : "mobius");

  useEffect(() => {
    if (IS_REPLAY_MODE) return;
    const api = window.appMenu;
    if (!api?.onModeChange) return;
    return api.onModeChange((next) => {
      if (!isModeValue(next)) return;
      setMode(next);
    });
  }, []);
  const samples = 800;
  const [rightPanelTab, setRightPanelTab] = useState<"inspector" | "workbook">(() => {
    if (IS_REPLAY_MODE) return "workbook";
    const saved = localStorage.getItem(WORKBOOK_PANEL_KEY);
    return saved === "workbook" ? "workbook" : "inspector";
  });
  const [workbooks, setWorkbooks] = useState<Workbook[]>(() => loadWorkbooks());
  const [activeWorkbookId, setActiveWorkbookId] = useState<string | null>(() => {
    if (REPLAY_PAYLOAD?.activeWorkbookId) return REPLAY_PAYLOAD.activeWorkbookId;
    return localStorage.getItem(WORKBOOK_ACTIVE_KEY);
  });
  const [activeStageId, setActiveStageId] = useState<WorkbookStageId>(() => {
    if (isWorkbookStageId(REPLAY_PAYLOAD?.activeStageId ?? null)) return REPLAY_PAYLOAD?.activeStageId ?? "define";
    const saved = localStorage.getItem(WORKBOOK_STAGE_KEY);
    return isWorkbookStageId(saved) ? saved : "define";
  });
  const [workbookCaptureToken, setWorkbookCaptureToken] = useState(0);
  const [pendingThumbnailCapture, setPendingThumbnailCapture] = useState<{
    stageId: WorkbookStageId;
    blockId: string;
    snapshot: WorkbookViewSnapshot;
    slot: WorkbookSnapshotSlot;
  } | null>(null);
  const [activeInteraction, setActiveInteraction] = useState<{
    stageId: WorkbookStageId;
    blockId: string;
    kind: WorkbookInteractionKind;
  } | null>(null);
  const [workbookCurveOverlay, setWorkbookCurveOverlay] = useState<PolylineSet | null>(null);
  const [workbookDirectionOverlay, setWorkbookDirectionOverlay] = useState<PolylineSet | null>(null);
  const [workbookCurveOverlayGhost, setWorkbookCurveOverlayGhost] = useState<PolylineSet | null>(null);
  const [workbookDirectionOverlayGhost, setWorkbookDirectionOverlayGhost] = useState<PolylineSet | null>(null);
  const [workbookGhostOverlaysEnabled, setWorkbookGhostOverlaysEnabled] = useState(() => {
    const raw = localStorage.getItem(WORKBOOK_GHOST_OVERLAYS_KEY);
    return raw === "1";
  });
  const applyWorkbookCurveOverlay = useCallback((next: PolylineSet | null) => {
    setWorkbookCurveOverlay((prev) => {
      if (prev && prev !== next) setWorkbookCurveOverlayGhost(prev);
      return next;
    });
  }, []);
  const applyWorkbookDirectionOverlay = useCallback((next: PolylineSet | null) => {
    setWorkbookDirectionOverlay((prev) => {
      if (prev && prev !== next) setWorkbookDirectionOverlayGhost(prev);
      return next;
    });
  }, []);
  const interactionPrevRef = useRef<{
    probeEnabled: boolean;
    selectRegionEnabled: boolean;
    inspectEnabled: boolean;
    geodesicHeatEnabled: boolean;
    geodesicPathEnabled: boolean;
    geodesicDiskPickMode: boolean;
  } | null>(null);
  useEffect(() => {
    if (activeWorkbookId && workbooks.some((w) => w.id === activeWorkbookId)) return;
    setActiveWorkbookId(workbooks[0]?.id ?? null);
  }, [workbooks, activeWorkbookId]);

  useEffect(() => {
    setCompareBlockId(null);
    setCompareUseSnapshotA(false);
    setCompareUseSnapshotB(false);
  }, [activeWorkbookId]);

  useEffect(() => {
    if (IS_REPLAY_MODE) return;
    saveArray(WORKBOOK_STORAGE_KEY, workbooks);
  }, [workbooks]);

  useEffect(() => {
    if (IS_REPLAY_MODE) return;
    try {
      if (activeWorkbookId) localStorage.setItem(WORKBOOK_ACTIVE_KEY, activeWorkbookId);
    } catch {
      // ignore
    }
  }, [activeWorkbookId]);

  useEffect(() => {
    if (IS_REPLAY_MODE) return;
    try {
      localStorage.setItem(WORKBOOK_STAGE_KEY, activeStageId);
    } catch {
      // ignore
    }
  }, [activeStageId]);

  useEffect(() => {
    if (IS_REPLAY_MODE) return;
    try {
      localStorage.setItem(WORKBOOK_PANEL_KEY, rightPanelTab);
    } catch {
      // ignore
    }
  }, [rightPanelTab]);

  useEffect(() => {
    if (IS_REPLAY_MODE) return;
    try {
      localStorage.setItem(WORKBOOK_GHOST_OVERLAYS_KEY, workbookGhostOverlaysEnabled ? "1" : "0");
    } catch {
      // ignore
    }
  }, [workbookGhostOverlaysEnabled]);

  const activeWorkbook = useMemo(
    () => workbooks.find((w) => w.id === activeWorkbookId) ?? null,
    [workbooks, activeWorkbookId]
  );

  // Möbius params
  const [mobiusParams, setMobiusParams] = useState<MobiusParams>(identityParams);

  const [mobiusSubTab, setMobiusSubTab] = useState<MobiusSubTab>("map");
// 0..4 steps: z -> Tδ -> J -> Sβ -> Tα
const [mobiusDecompStep, setMobiusDecompStep] = useState(4);

  // Chebyshev degree
  const [chebN, setChebN] = useState(3);

  // Transform state
  const [primKind, setPrimKind] = useState<TransformPrimitive>("vline");
  const [primValue, setPrimValue] = useState(1);

  // Standard maps selector
  const [mapId, setMapId] = useState<MapId>("stripToDisk");

  // Surfaces viewer kind
  const [surfaceViewerKind, setSurfaceViewerKind] = useState<SurfaceViewerKind>("implicit");
  const [datasetKind, setDatasetKind] = useState<DatasetKind>("surface");
  const [meshDataset, setMeshDatasetState] = useState<MeshDataset | null>(() => {
    const preset = SURFACE_MESH_PRESETS[0];
    try {
      const base = buildSurfaceMeshFromGeometry(preset.build(), preset.label, "generated", { mergeVertices: true });
      return toMeshDataset(applySurfaceMeshOps(base));
    } catch {
      return null;
    }
  });
  const [volumeDatasetOverride, setVolumeDatasetOverride] = useState<VolumeDataset | null>(null);
  const [volumeDistanceBusy, setVolumeDistanceBusy] = useState(false);
  const [volumeDistanceError, setVolumeDistanceError] = useState<string | null>(null);
  const [volumeDistanceSigned, setVolumeDistanceSigned] = useState(false);
  const [volumeDistanceAutoBounds, setVolumeDistanceAutoBounds] = useState(true);
  const [volumePresetId, setVolumePresetId] = useState<VolumePresetId>(DEFAULT_VOLUME_PRESET_ID);
  const [volumeParams, setVolumeParams] = useState<VolumePresetParams>(() =>
    getVolumePresetDefaultParams(DEFAULT_VOLUME_PRESET_ID)
  );
  const [volumeDims, setVolumeDims] = useState<[number, number, number]>(() =>
    getVolumePreset(DEFAULT_VOLUME_PRESET_ID).defaultDims
  );
  const [volumeCustomExpr, setVolumeCustomExpr] = useState("x^2 + y^2 + z^2 - 1");
  const volumePreset = useMemo(() => getVolumePreset(volumePresetId), [volumePresetId]);
  const volumeParamsResolved = useMemo(
    () => resolveVolumePresetParams(volumePreset, volumeParams),
    [volumePreset, volumeParams]
  );
  const volumePresetBounds = useMemo(
    () => getVolumePresetBounds(volumePreset, volumeParamsResolved),
    [volumePreset, volumeParamsResolved]
  );
  const [volumeSampling, setVolumeSampling] = useState<VolumeSampling>(() =>
    samplingFromBounds(volumePresetBounds, volumeDims)
  );
  const volumeCustomFnRef = useRef<((x: number, y: number, z: number) => number) | null>(null);
  const volumeCustomCompiled = useMemo(() => {
    if (volumePresetId !== "custom") return { fn: undefined, error: null };
    let src = volumeCustomExpr.trim();
    if (!src) return { fn: undefined, error: "Expression required." };
    const eqIdx = src.indexOf("=");
    if (eqIdx >= 0) src = src.slice(eqIdx + 1).trim();
    const funcNames = ["sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "abs", "log", "exp", "min", "max"];
    const funcRegex = new RegExp(`\\\\b(${funcNames.join("|")})\\\\b`, "gi");
    src = src.replace(funcRegex, (m) => m.toLowerCase());
    const funcNoParen = new RegExp(
      `\\\\b(${funcNames.join("|")})\\\\s+(-?\\\\s*[A-Za-z_][A-Za-z0-9_]*|-?\\\\s*\\\\d*\\\\.?\\\\d+)`,
      "g"
    );
    src = src.replace(funcNoParen, (_m, fn, arg) => `${fn}(${String(arg).replace(/\\\\s+/g, "")})`);
    const { fn, error } = compileExpression(src, ["x", "y", "z"]);
    if (error) return { fn: undefined, error: `${error.message} (col ${error.col})` };
    const evalFn = fn!;
    const vars = { x: 0, y: 0, z: 0 };
    const wrapped = (x: number, y: number, z: number) => {
      vars.x = x;
      vars.y = y;
      vars.z = z;
      const v = evalFn(vars);
      return Number.isFinite(v) ? v : NaN;
    };
    return { fn: wrapped, error: null };
  }, [volumeCustomExpr, volumePresetId]);
  useEffect(() => {
    if (volumeCustomCompiled.fn) {
      volumeCustomFnRef.current = volumeCustomCompiled.fn;
    }
  }, [volumeCustomCompiled.fn]);
  useEffect(() => {
    setVolumeSampling(samplingFromBounds(volumePresetBounds, volumeDims));
  }, [volumePresetBounds]);
  useEffect(() => {
    setVolumeSampling((prev) => ({ ...prev, dims: volumeDims }));
  }, [volumeDims]);
  const volumeSamplingClamped = useMemo(() => clampSampling(volumeSampling), [volumeSampling]);
  const volumeSamplingBounds = useMemo(
    () => samplingToBounds(volumeSamplingClamped),
    [volumeSamplingClamped]
  );
  const volumeSamplingSpacing = useMemo(
    () => samplingSpacing(volumeSamplingClamped),
    [volumeSamplingClamped]
  );
  const volumeDatasetPreset = useMemo(
    () => ({
      kind: "volume" as const,
      grid: buildVolumeGridFromPreset(volumePresetId, {
        dims: volumeSamplingClamped.dims,
        bounds: volumeSamplingBounds,
        params: volumeParamsResolved,
        customFn: volumeCustomCompiled.fn ?? volumeCustomFnRef.current ?? undefined,
      }),
    }),
    [volumePresetId, volumeSamplingClamped, volumeSamplingBounds, volumeParamsResolved, volumeCustomCompiled.fn]
  );
  const volumeDataset = volumeDatasetOverride ?? volumeDatasetPreset;
  const volumeScalarRange = useMemo(() => {
    const scalars = volumeDataset.grid.scalars;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < scalars.length; i++) {
      const v = scalars[i];
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 0;
    }
    return { min, max };
  }, [volumeDataset]);
  const volumeIsoRange = useMemo(() => {
    let min = volumeScalarRange.min;
    let max = volumeScalarRange.max;
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = -1;
      max = 1;
    }
    if (Math.abs(max - min) < 1e-6) {
      min -= 1;
      max += 1;
    }
    const span = max - min;
    const step = span > 0 ? span / 200 : 0.01;
    return { min, max, step };
  }, [volumeScalarRange]);
  const activeDataset =
    datasetKind === "volume" ? volumeDataset : datasetKind === "mesh" ? meshDataset : null;
  const surfaceMeshData = meshDataset?.mesh ?? null;
  const [volumeSeedAxis, setVolumeSeedAxis] = useState<SliceAxis>("z");
  const [volumeSeedIndex, setVolumeSeedIndex] = useState(() =>
    Math.floor(volumeDataset.grid.dims[2] / 2)
  );
  const [volumeCrosshair, setVolumeCrosshair] = useState<[number, number, number] | null>(null);
  const [volumeSliceOpacity, setVolumeSliceOpacity] = useState(0.85);
  const [volumeShowStreamlines, setVolumeShowStreamlines] = useState(false);
  const [volumeVectorPresetId, setVolumeVectorPresetId] = useState<VectorPresetId>("vortex");
  const [volumeStreamSeedGrid, setVolumeStreamSeedGrid] = useState(8);
  const [volumeStreamlineStepSizeOverride, setVolumeStreamlineStepSizeOverride] = useState<number | null>(null);
  const [volumeStreamlineMaxSteps, setVolumeStreamlineMaxSteps] = useState(900);
  const [volumeViewMode, setVolumeViewMode] = useState<"slices" | "3d">("slices");
  const isDev = typeof import.meta !== "undefined" && !!(import.meta as any).env?.DEV;
  const [devError, setDevError] = useState<{ message: string; stack?: string } | null>(null);
  const volumeGridBounds = useMemo(() => {
    const grid = volumeDataset.grid;
    const spacing = grid.spacing ?? [1, 1, 1];
    const origin = grid.origin ?? [0, 0, 0];
    return {
      min: [origin[0], origin[1], origin[2]] as [number, number, number],
      max: [
        origin[0] + spacing[0] * Math.max(0, grid.dims[0] - 1),
        origin[1] + spacing[1] * Math.max(0, grid.dims[1] - 1),
        origin[2] + spacing[2] * Math.max(0, grid.dims[2] - 1),
      ] as [number, number, number],
    };
  }, [volumeDataset]);
  const clampGridIndex = (value: number, max: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(max, Math.round(value)));
  };
  const gridIndexToWorld = (grid: VolumeDataset["grid"], idx: [number, number, number]) => {
    const spacing = grid.spacing ?? [1, 1, 1];
    const origin = grid.origin ?? [0, 0, 0];
    return [
      origin[0] + idx[0] * spacing[0],
      origin[1] + idx[1] * spacing[1],
      origin[2] + idx[2] * spacing[2],
    ] as [number, number, number];
  };
  const volumeCrosshairIndex = useMemo(() => {
    const grid = volumeDataset.grid;
    const centerIdx: [number, number, number] = [
      Math.round((grid.dims[0] - 1) * 0.5),
      Math.round((grid.dims[1] - 1) * 0.5),
      Math.round((grid.dims[2] - 1) * 0.5),
    ];
    if (!volumeCrosshair) return centerIdx;
    const [fx, fy, fz] = worldToGridIndex(grid, volumeCrosshair);
    return [
      clampGridIndex(fx, grid.dims[0] - 1),
      clampGridIndex(fy, grid.dims[1] - 1),
      clampGridIndex(fz, grid.dims[2] - 1),
    ] as [number, number, number];
  }, [volumeCrosshair, volumeDataset]);
  useEffect(() => {
    const grid = volumeDataset.grid;
    const centerIdx: [number, number, number] = [
      Math.round((grid.dims[0] - 1) * 0.5),
      Math.round((grid.dims[1] - 1) * 0.5),
      Math.round((grid.dims[2] - 1) * 0.5),
    ];
    setVolumeCrosshair((prev) => {
      if (!prev) return gridIndexToWorld(grid, centerIdx);
      const [fx, fy, fz] = worldToGridIndex(grid, prev);
      const idx: [number, number, number] = [
        clampGridIndex(fx, grid.dims[0] - 1),
        clampGridIndex(fy, grid.dims[1] - 1),
        clampGridIndex(fz, grid.dims[2] - 1),
      ];
      return gridIndexToWorld(grid, idx);
    });
  }, [volumeDataset]);
  const volumeCrosshairSample = useMemo(() => {
    if (!volumeCrosshair) return null;
    const grid = volumeDataset.grid;
    return {
      value: sampleGridTrilinear(grid, volumeCrosshair),
      gradMag: gradientMagnitudeAt(grid, volumeCrosshair),
    };
  }, [volumeCrosshair, volumeDataset]);
  const handleVolumeCrosshairIndexChange = useCallback(
    (axisIndex: 0 | 1 | 2, value: number) => {
      const grid = volumeDataset.grid;
      const idx: [number, number, number] = [
        volumeCrosshairIndex[0],
        volumeCrosshairIndex[1],
        volumeCrosshairIndex[2],
      ];
      idx[axisIndex] = clampGridIndex(value, grid.dims[axisIndex] - 1);
      setVolumeCrosshair(gridIndexToWorld(grid, idx));
    },
    [volumeDataset, volumeCrosshairIndex]
  );
  const handleVolumeSlicePick = useCallback(
    (world: [number, number, number]) => {
      const grid = volumeDataset.grid;
      const [fx, fy, fz] = worldToGridIndex(grid, world);
      const idx: [number, number, number] = [
        clampGridIndex(fx, grid.dims[0] - 1),
        clampGridIndex(fy, grid.dims[1] - 1),
        clampGridIndex(fz, grid.dims[2] - 1),
      ];
      setVolumeCrosshair(gridIndexToWorld(grid, idx));
    },
    [volumeDataset]
  );
  const volumeVectorPreset = useMemo(
    () => getVectorPreset(volumeVectorPresetId),
    [volumeVectorPresetId]
  );
  const volumeVectorGrid: VectorGrid | null = useMemo(() => {
    if (!volumeShowStreamlines) return null;
    return buildVectorGridFromPreset(volumeVectorPresetId, {
      dims: volumeDataset.grid.dims,
      bounds: volumeGridBounds,
    });
  }, [volumeShowStreamlines, volumeVectorPresetId, volumeDataset, volumeGridBounds]);
  const volumeStreamlineSeeds = useMemo(() => {
    if (!volumeShowStreamlines) return [];
    return buildSliceSeeds(
      volumeDataset.grid,
      volumeSeedAxis,
      volumeSeedIndex,
      volumeStreamSeedGrid,
      volumeStreamSeedGrid
    );
  }, [volumeShowStreamlines, volumeDataset, volumeSeedAxis, volumeSeedIndex, volumeStreamSeedGrid]);
  const volumeStreamlineStepAuto = useMemo(() => {
    const spacing = volumeDataset.grid.spacing ?? [1, 1, 1];
    const minSpacing = Math.min(spacing[0], spacing[1], spacing[2]);
    return Math.max(1e-3, minSpacing * 0.65);
  }, [volumeDataset]);
  const volumeStreamlineStepSize = useMemo(() => {
    const v = volumeStreamlineStepSizeOverride;
    if (Number.isFinite(v) && v && v > 0) return v;
    return volumeStreamlineStepAuto;
  }, [volumeStreamlineStepSizeOverride, volumeStreamlineStepAuto]);
  const volumeStreamlineStepRange = useMemo(() => {
    const min = Math.max(1e-4, volumeStreamlineStepAuto * 0.2);
    const max = Math.max(min * 1.2, volumeStreamlineStepAuto * 3);
    const step = Math.max(1e-4, volumeStreamlineStepAuto * 0.05);
    return { min, max, step };
  }, [volumeStreamlineStepAuto]);
  const volumeStreamlineMaxLength = useMemo(() => {
    const dx = volumeGridBounds.max[0] - volumeGridBounds.min[0];
    const dy = volumeGridBounds.max[1] - volumeGridBounds.min[1];
    const dz = volumeGridBounds.max[2] - volumeGridBounds.min[2];
    return Math.max(dx, dy, dz) * 2.4;
  }, [volumeGridBounds]);
  const [volumeContourEnabled, setVolumeContourEnabled] = useState(true);
  const [volumeContourCount, setVolumeContourCount] = useState(6);
  const [volumeWindowMode, setVolumeWindowMode] = useState<"auto" | "minmax">("auto");
  const [volumeSliceReport, setVolumeSliceReport] = useState<VolumeSliceReport | null>(null);
  const [volumeSliceHover, setVolumeSliceHover] = useState<VolumeSliceHover | null>(null);
  const [volumeShowIsosurface, setVolumeShowIsosurface] = useState(false);
  const [volumeIsoValue, setVolumeIsoValue] = useState(0);
  const [volumeIsoSmooth, setVolumeIsoSmooth] = useState(false);
  const [volumeIsoSmoothIterations, setVolumeIsoSmoothIterations] = useState(20);
  const [volumeShowCropBox, setVolumeShowCropBox] = useState(true);
  const [volumeCropGizmoEnabled, setVolumeCropGizmoEnabled] = useState(true);
  const [volumeCropGizmoMode, setVolumeCropGizmoMode] = useState<"move" | "scale">("move");
  const clampVolumeDim = (value: number) => {
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(256, Math.round(value)));
  };
  const handleVolumeDimChange = (axisIndex: 0 | 1 | 2, value: number) => {
    setVolumeDims((prev) => {
      const next: [number, number, number] = [prev[0], prev[1], prev[2]];
      next[axisIndex] = clampVolumeDim(value);
      return next;
    });
  };
  const handleVolumeSamplingCenterChange = (axisIndex: 0 | 1 | 2, value: number) => {
    setVolumeSampling((prev) => {
      const center: [number, number, number] = [prev.center[0], prev.center[1], prev.center[2]];
      center[axisIndex] = Number.isFinite(value) ? value : center[axisIndex];
      return { ...prev, center };
    });
  };
  const handleVolumeSamplingExtentChange = (axisIndex: 0 | 1 | 2, value: number) => {
    setVolumeSampling((prev) => {
      const extents: [number, number, number] = [prev.extents[0], prev.extents[1], prev.extents[2]];
      const next = Number.isFinite(value) ? Math.max(1e-6, Math.abs(value)) : extents[axisIndex];
      extents[axisIndex] = next;
      return { ...prev, extents };
    });
  };
  const handleVolumeStreamSeedGridChange = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const next = Math.max(2, Math.min(24, Math.round(value)));
    setVolumeStreamSeedGrid(next);
  }, []);
  const handleVolumeStreamlineStepChange = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) return;
      const next = Math.max(volumeStreamlineStepRange.min, Math.min(volumeStreamlineStepRange.max, value));
      setVolumeStreamlineStepSizeOverride(next);
    },
    [volumeStreamlineStepRange]
  );
  const handleVolumeStreamlineStepAuto = useCallback(() => {
    setVolumeStreamlineStepSizeOverride(null);
  }, []);
  const handleVolumeStreamlineMaxStepsChange = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const next = Math.max(50, Math.min(5000, Math.round(value)));
    setVolumeStreamlineMaxSteps(next);
  }, []);
  const handleResetVolumeSampling = () => {
    setVolumeSampling(samplingFromBounds(volumePresetBounds, volumeDims));
  };
  const handleRebuildVolumeSampling = () => {
    setVolumeSampling((prev) => ({ ...prev }));
  };
  const handleVolumeCropChange = useCallback(
    (center: [number, number, number], extents: [number, number, number]) => {
      setVolumeSampling((prev) => clampSampling({ ...prev, center, extents }));
    },
    []
  );
  const handleToggleVolumeCropGizmo = useCallback((enabled: boolean) => {
    setVolumeCropGizmoEnabled(enabled);
    if (enabled) {
      setVolumeShowCropBox(true);
    }
  }, []);
  const handleVolumeParamChange = useCallback(
    (id: string, value: number) => {
      setVolumeParams((prev) => {
        const def = volumePreset.params?.find((param) => param.id === id);
        if (!def) return prev;
        const nextValue = Number.isFinite(value)
          ? Math.min(def.max, Math.max(def.min, value))
          : def.defaultValue;
        return { ...prev, [id]: nextValue };
      });
    },
    [volumePreset]
  );
  useEffect(() => {
    setVolumeParams(getVolumePresetDefaultParams(volumePresetId));
  }, [volumePresetId]);
  const volumeSeedIndexMax = useMemo(() => {
    const [nx, ny, nz] = volumeDataset.grid.dims;
    if (volumeSeedAxis === "x") return Math.max(0, nx - 1);
    if (volumeSeedAxis === "y") return Math.max(0, ny - 1);
    return Math.max(0, nz - 1);
  }, [volumeDataset, volumeSeedAxis]);
  useEffect(() => {
    setVolumeSeedIndex((value) => Math.max(0, Math.min(volumeSeedIndexMax, value)));
  }, [volumeSeedIndexMax]);
  useEffect(() => {
    const { min, max } = volumeScalarRange;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    const hasZero = min <= 0 && max >= 0;
    const fallback = hasZero ? 0 : (min + max) * 0.5;
    if (!Number.isFinite(volumeIsoValue) || volumeIsoValue < min || volumeIsoValue > max) {
      setVolumeIsoValue(fallback);
    }
  }, [volumeScalarRange, volumeIsoValue]);
  const [surfaceMeshImportBusy, setSurfaceMeshImportBusy] = useState(false);
  const [surfaceMeshImportError, setSurfaceMeshImportError] = useState<string | null>(null);
  const [surfaceMeshMergeVertices, setSurfaceMeshMergeVertices] = useState(true);
  const [surfaceMeshExportBusy, setSurfaceMeshExportBusy] = useState(false);
  const [surfaceMeshExportError, setSurfaceMeshExportError] = useState<string | null>(null);
  const [surfaceMeshWeldTolerance, setSurfaceMeshWeldTolerance] = useState(1e-4);
  const [surfaceMeshWeldBusy, setSurfaceMeshWeldBusy] = useState(false);
  const [surfaceMeshWeldError, setSurfaceMeshWeldError] = useState<string | null>(null);
  const [vtkBusy, setVtkBusy] = useState(false);
  const [vtkError, setVtkError] = useState<string | null>(null);
  const [vtkDecimateReduction, setVtkDecimateReduction] = useState(0.5);
  const [vtkDecimateTargetFaces, setVtkDecimateTargetFaces] = useState(12000);
  const [vtkUseTargetFaces, setVtkUseTargetFaces] = useState(false);
  const [vtkSmoothIterations, setVtkSmoothIterations] = useState(20);
  const [vtkSmoothPassband, setVtkSmoothPassband] = useState(0.1);
  const [vtkPreviewBusy, setVtkPreviewBusy] = useState(false);
  const [vtkPreviewError, setVtkPreviewError] = useState<string | null>(null);
  const [vtkPreviewTargetFaces, setVtkPreviewTargetFaces] = useState(20000);
  const [vtkPreviewUseDecimate, setVtkPreviewUseDecimate] = useState(true);
  const setMeshDataset = useCallback((mesh: SurfaceMeshData | null) => {
    setMeshDatasetState(toMeshDataset(mesh));
    setDatasetKind("mesh");
  }, []);

  // complex map sweep
  const [complexMapSpec, setComplexMapSpec] = useState<ComplexMapSweepSpec>(COMPLEX_MAP_DEFAULT_SPEC);
  const [complexMapPresetId, setComplexMapPresetId] = useState<string>(
    COMPLEX_MAP_PRESETS[0]?.id ?? COMPLEX_MAP_CUSTOM_ID
  );
  const [complexMapError, setComplexMapError] = useState<string | null>(null);
  const [complexMapLine, setComplexMapLine] = useState<ComplexMapLine>(null);
  const [complexMapLinePolylines, setComplexMapLinePolylines] = useState<PolylineSet | null>(null);
  const [complexMapLineWPolylines, setComplexMapLineWPolylines] = useState<[number, number][][] | null>(null);
  const [complexMapIsolineWPolylinesU, setComplexMapIsolineWPolylinesU] = useState<[number, number][][] | null>(null);
  const [complexMapIsolineWPolylinesV, setComplexMapIsolineWPolylinesV] = useState<[number, number][][] | null>(null);
  const [complexMapIsolineZLinesU, setComplexMapIsolineZLinesU] = useState<[number, number][][] | null>(null);
  const [complexMapIsolineZLinesV, setComplexMapIsolineZLinesV] = useState<[number, number][][] | null>(null);
  const [complexMapIsoline3dPolylinesU, setComplexMapIsoline3dPolylinesU] = useState<PolylineSet | null>(null);
  const [complexMapIsoline3dPolylinesV, setComplexMapIsoline3dPolylinesV] = useState<PolylineSet | null>(null);
  const [complexMapSphereLines, setComplexMapSphereLines] = useState<ComplexMapSphereLine[] | null>(null);
  const [complexMapLive, setComplexMapLive] = useState(true);
  const [complexMapShowCritical, setComplexMapShowCritical] = useState(true);
  const [complexMapShowZeros, setComplexMapShowZeros] = useState(true);
  const [complexMapShowPoles, setComplexMapShowPoles] = useState(true);
  const [complexMapMarkersZ, setComplexMapMarkersZ] = useState(true);
  const [complexMapMarkersW, setComplexMapMarkersW] = useState(true);
  const [complexMapMarkers3d, setComplexMapMarkers3d] = useState(false);
  const [complexMapMarkerMax, setComplexMapMarkerMax] = useState(500);
  const [complexMapCriticalRel, setComplexMapCriticalRel] = useState(0.08);
  const [complexMapZeroRel, setComplexMapZeroRel] = useState(0.03);
  const [complexMapPoleRel, setComplexMapPoleRel] = useState(0.85);
  const [complexPreimageMode, setComplexPreimageMode] = useState<ComplexPreimageMode>("none");
  const [complexPreimageValue, setComplexPreimageValue] = useState(0);
  const [complexPreimageSnap, setComplexPreimageSnap] = useState(true);
  const [complexPreimagePolylines, setComplexPreimagePolylines] = useState<[number, number][][] | null>(null);
  const [complexDistortionMode, setComplexDistortionMode] = useState<ComplexDistortionMode>("none");
  const [complexDistortionShowZ, setComplexDistortionShowZ] = useState(true);
  const [complexDistortionShowSurface, setComplexDistortionShowSurface] = useState(true);
  const [complexDistortionScale, setComplexDistortionScale] = useState<"linear" | "log">("linear");
  const [complexMapGridThickness, setComplexMapGridThickness] = useState(1.1);
  const [complexMapGridOpacity, setComplexMapGridOpacity] = useState(0.85);
  const [complexMapGridShowSurface, setComplexMapGridShowSurface] = useState(true);
  const [complexMapShowSphere, setComplexMapShowSphere] = useState(false);
  const [complexMapSphereStacked, setComplexMapSphereStacked] = useState(false);
  const [complexMapProbe, setComplexMapProbe] = useState<ComplexMapProbe | null>(null);
  const [complexMapProbePins, setComplexMapProbePins] = useState<ComplexMapProbePin[]>([]);

  const updateComplexMapSpec = useCallback((patch: Partial<ComplexMapSweepSpec>) => {
    setComplexMapSpec((prev) => ({ ...prev, ...patch }));
    setComplexMapError(null);
  }, []);

  const applyComplexMapPreset = useCallback((id: string) => {
    setComplexMapPresetId(id);
    const preset = COMPLEX_MAP_PRESETS.find((p) => p.id === id);
    if (!preset) {
      setComplexMapError(null);
      return;
    }
    setComplexMapSpec((prev) => ({
      ...prev,
      reExpr: preset.reExpr,
      imExpr: preset.imExpr,
    }));
    setComplexMapError(null);
  }, []);

  const complexMapCompiled = useMemo(
    () => compileComplexMapExpressions(complexMapSpec.reExpr, complexMapSpec.imExpr),
    [complexMapSpec.reExpr, complexMapSpec.imExpr]
  );
  const complexMapFns = useMemo(() => {
    if (complexMapCompiled.error) return null;
    if (!complexMapCompiled.reFn || !complexMapCompiled.imFn) return null;
    return { reFn: complexMapCompiled.reFn, imFn: complexMapCompiled.imFn };
  }, [complexMapCompiled]);
  const complexMapMode = complexMapSpec.mapMode === "riemann" ? "riemann" : "standard";
  const complexMapSheetCount =
    complexMapMode === "riemann" ? Math.max(2, Math.round(complexMapSpec.sheetCount)) : 1;
  const complexMapSheetMode =
    complexMapMode === "riemann" && complexMapSpec.sheetMode === "all" ? "all" : "single";
  const complexMapSheetIndex = Math.min(
    Math.max(0, Math.round(complexMapSpec.sheetIndex)),
    complexMapSheetCount - 1
  );
  const complexMapBranchCutAngle = Number.isFinite(complexMapSpec.branchCutAngle)
    ? complexMapSpec.branchCutAngle
    : 0;

  useEffect(() => {
    if (complexMapMode !== "riemann") return;
    const clampedCount = Math.max(2, Math.round(complexMapSpec.sheetCount));
    const clampedIndex = Math.min(Math.max(0, Math.round(complexMapSpec.sheetIndex)), clampedCount - 1);
    if (clampedCount !== complexMapSpec.sheetCount || clampedIndex !== complexMapSpec.sheetIndex) {
      setComplexMapSpec((prev) => ({
        ...prev,
        sheetCount: clampedCount,
        sheetIndex: clampedIndex,
      }));
    }
  }, [complexMapMode, complexMapSpec.sheetCount, complexMapSpec.sheetIndex]);

  const evalComplexMapW = useCallback(
    (u: number, v: number, sheetIndex = complexMapSheetIndex) => {
      if (!complexMapFns) return null;
      const { reFn, imFn } = complexMapFns;
      let re = reFn(u, v);
      let im = imFn(u, v);
      if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
      if (complexMapMode === "riemann") {
        const w = evalRiemannSheet(re, im, sheetIndex, complexMapSheetCount, complexMapBranchCutAngle);
        if (!w) return null;
        re = w.re;
        im = w.im;
      }
      const wScale = Number.isFinite(complexMapSpec.wScale) ? complexMapSpec.wScale : 1;
      re *= wScale;
      im *= wScale;
      const clampAbs =
        complexMapSpec.clampAbs != null && Number.isFinite(complexMapSpec.clampAbs) && complexMapSpec.clampAbs > 0
          ? complexMapSpec.clampAbs
          : null;
      if (clampAbs) {
        const mag = Math.hypot(re, im);
        if (Number.isFinite(mag) && mag > clampAbs) {
          const s = clampAbs / mag;
          re *= s;
          im *= s;
        }
      }
      return { re, im };
    },
    [
      complexMapFns,
      complexMapMode,
      complexMapSheetIndex,
      complexMapSheetCount,
      complexMapBranchCutAngle,
      complexMapSpec.wScale,
      complexMapSpec.clampAbs,
    ]
  );

  useEffect(() => {
    setComplexMapProbe(null);
  }, [
    complexMapSpec.reExpr,
    complexMapSpec.imExpr,
    complexMapSpec.uMin,
    complexMapSpec.uMax,
    complexMapSpec.vMin,
    complexMapSpec.vMax,
    complexMapSpec.nu,
    complexMapSpec.nv,
    complexMapSpec.wScale,
    complexMapSpec.clampAbs,
    complexMapSpec.mapMode,
    complexMapSpec.sheetCount,
    complexMapSpec.sheetIndex,
    complexMapSpec.branchCutAngle,
  ]);

  const complexMapZExtent = useMemo(() => {
    const m = Math.max(
      1,
      Math.abs(complexMapSpec.uMin),
      Math.abs(complexMapSpec.uMax),
      Math.abs(complexMapSpec.vMin),
      Math.abs(complexMapSpec.vMax)
    );
    return m;
  }, [complexMapSpec.uMin, complexMapSpec.uMax, complexMapSpec.vMin, complexMapSpec.vMax]);

  const complexMapWExtent = useMemo(() => {
    const clampAbs = complexMapSpec.clampAbs;
    if (clampAbs != null && Number.isFinite(clampAbs) && clampAbs > 0) return clampAbs;
    if (!complexMapFns) return 3;
    const uMin = complexMapSpec.uMin;
    const uMax = complexMapSpec.uMax;
    const vMin = complexMapSpec.vMin;
    const vMax = complexMapSpec.vMax;
    const samples = 16;
    let maxMag = 0;
    for (let i = 0; i < samples; i++) {
      const u = uMin + (uMax - uMin) * (i / (samples - 1));
      for (let j = 0; j < samples; j++) {
        const v = vMin + (vMax - vMin) * (j / (samples - 1));
        const w = evalComplexMapW(u, v);
        if (!w) continue;
        const mag = Math.hypot(w.re, w.im);
        if (mag > maxMag) maxMag = mag;
      }
    }
    if (!Number.isFinite(maxMag) || maxMag <= 1e-6) return 3;
    return Math.max(2, maxMag * 1.15);
  }, [
    complexMapSpec.uMin,
    complexMapSpec.uMax,
    complexMapSpec.vMin,
    complexMapSpec.vMax,
    complexMapSpec.clampAbs,
    complexMapFns,
    evalComplexMapW,
  ]);

  const complexMapGrid = useMemo(() => {
    if (!complexMapFns) return null;
    const { reFn, imFn } = complexMapFns;
    const nu = Math.max(2, Math.round(complexMapSpec.nu));
    const nv = Math.max(2, Math.round(complexMapSpec.nv));
    if (!Number.isFinite(nu) || !Number.isFinite(nv)) return null;

    const uMin = complexMapSpec.uMin;
    const uMax = complexMapSpec.uMax;
    const vMin = complexMapSpec.vMin;
    const vMax = complexMapSpec.vMax;
    const uStep = nu > 1 ? (uMax - uMin) / (nu - 1) : 0;
    const vStep = nv > 1 ? (vMax - vMin) / (nv - 1) : 0;
    const wScale = Number.isFinite(complexMapSpec.wScale) ? complexMapSpec.wScale : 1;
    const clampAbs =
      complexMapSpec.clampAbs != null && Number.isFinite(complexMapSpec.clampAbs) && complexMapSpec.clampAbs > 0
        ? complexMapSpec.clampAbs
        : null;

    const total = nu * nv;
    const re = new Float32Array(total);
    const im = new Float32Array(total);
    const reClamped = new Float32Array(total);
    const imClamped = new Float32Array(total);
    const wMag = new Float32Array(total);
    const valid = new Uint8Array(total);
    let wMagMax = 0;

    const evalBaseW = (u: number, v: number) => {
      let r = reFn(u, v);
      let m = imFn(u, v);
      if (!Number.isFinite(r) || !Number.isFinite(m)) return null;
      if (complexMapMode === "riemann") {
        const w = evalRiemannSheet(r, m, complexMapSheetIndex, complexMapSheetCount, complexMapBranchCutAngle);
        if (!w) return null;
        r = w.re;
        m = w.im;
      }
      return { re: r, im: m };
    };

    const clampMag = (r: number, i: number, limit: number) => {
      const mag = Math.hypot(r, i);
      if (!Number.isFinite(mag) || mag <= limit) return { re: r, im: i };
      const s = limit / mag;
      return { re: r * s, im: i * s };
    };

    for (let j = 0; j < nv; j++) {
      const v = vMin + vStep * j;
      for (let i = 0; i < nu; i++) {
        const u = uMin + uStep * i;
        const idx = j * nu + i;
        const base = evalBaseW(u, v);
        if (!base) {
          re[idx] = NaN;
          im[idx] = NaN;
          reClamped[idx] = NaN;
          imClamped[idx] = NaN;
          wMag[idx] = NaN;
          continue;
        }
        let r = base.re;
        let m = base.im;
        r *= wScale;
        m *= wScale;
        re[idx] = r;
        im[idx] = m;
        const mag = Math.hypot(r, m);
        wMag[idx] = mag;
        if (Number.isFinite(mag) && mag > wMagMax) wMagMax = mag;
        let rc = r;
        let mc = m;
        if (clampAbs) {
          const clamped = clampMag(r, m, clampAbs);
          rc = clamped.re;
          mc = clamped.im;
        }
        reClamped[idx] = rc;
        imClamped[idx] = mc;
        valid[idx] = 1;
      }
    }

    if (!Number.isFinite(wMagMax) || wMagMax <= 0) {
      wMagMax = 1;
    }

    return {
      nu,
      nv,
      uMin,
      uMax,
      vMin,
      vMax,
      uStep,
      vStep,
      wScale,
      clampAbs,
      re,
      im,
      reClamped,
      imClamped,
      wMag,
      valid,
      wMagMax,
    };
  }, [
    complexMapFns,
    complexMapSpec,
    complexMapMode,
    complexMapSheetIndex,
    complexMapSheetCount,
    complexMapBranchCutAngle,
  ]);

  const complexMapJacobian = useMemo(() => {
    if (!complexMapGrid) return null;
    const { nu, nv, uStep, vStep, re, im, valid } = complexMapGrid;
    const total = nu * nv;
    const detJAbs = new Float32Array(total);
    const sigmaRatio = new Float32Array(total);
    const conformalErr = new Float32Array(total);

    const safeUStep = Math.abs(uStep) > 1e-12 ? uStep : 1;
    const safeVStep = Math.abs(vStep) > 1e-12 ? vStep : 1;

    const idx = (i: number, j: number) => j * nu + i;
    const deriv = (arr: Float32Array, i: number, j: number, axis: "u" | "v") => {
      const center = arr[idx(i, j)];
      if (!Number.isFinite(center)) return NaN;
      if (axis === "u") {
        const left = i > 0 ? arr[idx(i - 1, j)] : NaN;
        const right = i < nu - 1 ? arr[idx(i + 1, j)] : NaN;
        if (Number.isFinite(left) && Number.isFinite(right)) return (right - left) / (2 * safeUStep);
        if (Number.isFinite(right)) return (right - center) / safeUStep;
        if (Number.isFinite(left)) return (center - left) / safeUStep;
        return NaN;
      }
      const down = j > 0 ? arr[idx(i, j - 1)] : NaN;
      const up = j < nv - 1 ? arr[idx(i, j + 1)] : NaN;
      if (Number.isFinite(down) && Number.isFinite(up)) return (up - down) / (2 * safeVStep);
      if (Number.isFinite(up)) return (up - center) / safeVStep;
      if (Number.isFinite(down)) return (center - down) / safeVStep;
      return NaN;
    };

    const detVals: number[] = [];

    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const k = idx(i, j);
        if (!valid[k]) {
          detJAbs[k] = NaN;
          sigmaRatio[k] = NaN;
          conformalErr[k] = NaN;
          continue;
        }
        const a = deriv(re, i, j, "u");
        const b = deriv(re, i, j, "v");
        const c = deriv(im, i, j, "u");
        const d = deriv(im, i, j, "v");
        if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) {
          detJAbs[k] = NaN;
          sigmaRatio[k] = NaN;
          conformalErr[k] = NaN;
          continue;
        }
        const det = a * d - b * c;
        const detAbs = Math.abs(det);
        detJAbs[k] = detAbs;
        detVals.push(detAbs);

        const s1 = a * a + c * c;
        const s2 = b * b + d * d;
        const s3 = a * b + c * d;
        const tr = s1 + s2;
        const disc = Math.max(0, tr * tr - 4 * (s1 * s2 - s3 * s3));
        const sqrtDisc = Math.sqrt(disc);
        const lambda1 = 0.5 * (tr + sqrtDisc);
        const lambda2 = 0.5 * (tr - sqrtDisc);
        const sigmaMax = Math.sqrt(Math.max(0, lambda1));
        const sigmaMin = Math.sqrt(Math.max(0, lambda2));
        sigmaRatio[k] = sigmaMax / Math.max(1e-9, sigmaMin);

        const fzRe = 0.5 * (a + d);
        const fzIm = 0.5 * (c - b);
        const fzbRe = 0.5 * (a - d);
        const fzbIm = 0.5 * (c + b);
        const fz = Math.hypot(fzRe, fzIm);
        const fzb = Math.hypot(fzbRe, fzbIm);
        conformalErr[k] = fzb / Math.max(1e-9, fz);
      }
    }

    let detJMedian = 0;
    if (detVals.length) {
      detVals.sort((a, b) => a - b);
      detJMedian = detVals[Math.floor(detVals.length / 2)];
    }
    if (!Number.isFinite(detJMedian) || detJMedian <= 0) detJMedian = 1e-6;

    return { detJAbs, sigmaRatio, conformalErr, detJMedian };
  }, [complexMapGrid]);

  const buildComplexMapProbe = useCallback(
    (uRaw: number, vRaw: number, source: ComplexMapProbe["source"]): ComplexMapProbe | null => {
      if (!complexMapFns) return null;
      const uMin = Math.min(complexMapSpec.uMin, complexMapSpec.uMax);
      const uMax = Math.max(complexMapSpec.uMin, complexMapSpec.uMax);
      const vMin = Math.min(complexMapSpec.vMin, complexMapSpec.vMax);
      const vMax = Math.max(complexMapSpec.vMin, complexMapSpec.vMax);
      if (!Number.isFinite(uRaw) || !Number.isFinite(vRaw)) return null;
      const u = Math.min(uMax, Math.max(uMin, uRaw));
      const v = Math.min(vMax, Math.max(vMin, vRaw));

      const c00 = evalComplexMapW(u, v);
      if (!c00) return null;
      const du = Math.abs(uMax - uMin) / Math.max(2, Math.round(complexMapSpec.nu));
      const dv = Math.abs(vMax - vMin) / Math.max(2, Math.round(complexMapSpec.nv));
      const hU = Math.max(1e-5, du * 0.5);
      const hV = Math.max(1e-5, dv * 0.5);
      const c10 = evalComplexMapW(u + hU, v);
      const c_10 = evalComplexMapW(u - hU, v);
      const c01 = evalComplexMapW(u, v + hV);
      const c0_1 = evalComplexMapW(u, v - hV);
      if (!c10 || !c_10 || !c01 || !c0_1) return null;

      const a = (c10.re - c_10.re) / (2 * hU);
      const b = (c01.re - c0_1.re) / (2 * hV);
      const c = (c10.im - c_10.im) / (2 * hU);
      const d = (c01.im - c0_1.im) / (2 * hV);

      const det = a * d - b * c;
      const detAbs = Math.abs(det);
      const s1 = a * a + c * c;
      const s2 = b * b + d * d;
      const s3 = a * b + c * d;
      const tr = s1 + s2;
      const disc = Math.max(0, tr * tr - 4 * (s1 * s2 - s3 * s3));
      const sqrtDisc = Math.sqrt(disc);
      const lambda1 = 0.5 * (tr + sqrtDisc);
      const lambda2 = 0.5 * (tr - sqrtDisc);
      const sigmaMax = Math.sqrt(Math.max(0, lambda1));
      const sigmaMin = Math.sqrt(Math.max(0, lambda2));
      const ratio = sigmaMax / Math.max(1e-9, sigmaMin);

      const fzRe = 0.5 * (a + d);
      const fzIm = 0.5 * (c - b);
      const fzbRe = 0.5 * (a - d);
      const fzbIm = 0.5 * (c + b);
      const fz = Math.hypot(fzRe, fzIm);
      const fzb = Math.hypot(fzbRe, fzbIm);
      const conformalErr = fzb / Math.max(1e-9, fz);

      return {
        u,
        v,
        w: {
          re: c00.re,
          im: c00.im,
          mag: Math.hypot(c00.re, c00.im),
          arg: Math.atan2(c00.im, c00.re),
        },
        det,
        detAbs,
        sigmaMax,
        sigmaMin,
        ratio,
        conformalErr,
        localScale: Math.sqrt(Math.max(0, detAbs)),
        source,
      };
    },
    [complexMapFns, complexMapSpec, evalComplexMapW]
  );

  const findClosestUVForW = useCallback(
    (pt: { re: number; im: number }) => {
      if (!complexMapGrid) return null;
      const { nu, nv, uMin, vMin, uStep, vStep, reClamped, imClamped, valid } = complexMapGrid;
      let best = { u: 0, v: 0, d2: Infinity };
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          const idx = j * nu + i;
          if (!valid[idx]) continue;
          const re = reClamped[idx];
          const im = imClamped[idx];
          if (!Number.isFinite(re) || !Number.isFinite(im)) continue;
          const dx = re - pt.re;
          const dy = im - pt.im;
          const d2 = dx * dx + dy * dy;
          if (d2 < best.d2) {
            best = {
              u: uMin + uStep * i,
              v: vMin + vStep * j,
              d2,
            };
          }
        }
      }
      return Number.isFinite(best.d2) ? { u: best.u, v: best.v, d2: best.d2 } : null;
    },
    [complexMapGrid]
  );

  const setComplexMapProbeFromUV = useCallback(
    (u: number, v: number, source: ComplexMapProbe["source"]) => {
      const next = buildComplexMapProbe(u, v, source);
      if (next) setComplexMapProbe(next);
    },
    [buildComplexMapProbe]
  );

  const setComplexMapProbeFromW = useCallback(
    (pt: { re: number; im: number }) => {
      const best = findClosestUVForW(pt);
      if (!best) return;
      const next = buildComplexMapProbe(best.u, best.v, "w");
      if (next) setComplexMapProbe(next);
    },
    [findClosestUVForW, buildComplexMapProbe]
  );

  const pinComplexMapProbe = useCallback(() => {
    if (!complexMapProbe) return;
    setComplexMapProbePins((prev) => [{ ...complexMapProbe, id: makeId() }, ...prev]);
  }, [complexMapProbe]);

  const clearComplexMapProbe = useCallback(() => {
    setComplexMapProbe(null);
  }, []);

  const clearComplexMapProbePins = useCallback(() => {
    setComplexMapProbePins([]);
  }, []);

  const recallComplexMapProbe = useCallback((pin: ComplexMapProbePin) => {
    const { id, label, ...rest } = pin;
    setComplexMapProbe(rest);
  }, []);

  const removeComplexMapProbePin = useCallback((id: string) => {
    setComplexMapProbePins((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const complexMapDistortionField = useMemo(() => {
    if (!complexMapGrid || !complexMapJacobian || complexDistortionMode === "none") return null;
    const { detJAbs, sigmaRatio, conformalErr } = complexMapJacobian;
    const values =
      complexDistortionMode === "area"
        ? detJAbs
        : complexDistortionMode === "anisotropy"
        ? sigmaRatio
        : conformalErr;

    const logScale = complexDistortionScale === "log" &&
      (complexDistortionMode === "area" || complexDistortionMode === "anisotropy");
    const scaleValue = (v: number) => {
      if (!Number.isFinite(v)) return NaN;
      if (!logScale) return v;
      return Math.log10(1 + Math.max(0, v));
    };

    const scaled = new Float32Array(values.length);
    const finite: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const v = scaleValue(values[i]);
      scaled[i] = Number.isFinite(v) ? v : NaN;
      if (!Number.isFinite(v)) continue;
      finite.push(v);
    }
    if (!finite.length) return null;
    finite.sort((a, b) => a - b);
    const lo = finite[Math.floor(finite.length * 0.02)];
    const hi = finite[Math.floor(finite.length * 0.98)];
    const min = Number.isFinite(lo) ? lo : finite[0];
    const max = Number.isFinite(hi) ? hi : finite[finite.length - 1];

    return {
      values: scaled,
      nx: complexMapGrid.nu,
      ny: complexMapGrid.nv,
      xMin: complexMapGrid.uMin,
      xMax: complexMapGrid.uMax,
      yMin: complexMapGrid.vMin,
      yMax: complexMapGrid.vMax,
      min,
      max: Math.max(max, min + 1e-6),
      scale: logScale ? "log" : "linear",
    };
  }, [complexDistortionMode, complexDistortionScale, complexMapGrid, complexMapJacobian]);

  const complexMapMarkerData = useMemo(() => {
    if (!complexMapGrid || !complexMapJacobian) return null;

    const { nu, nv, uMin, vMin, uStep, vStep, reClamped, imClamped, wMag } = complexMapGrid;
    const { detJAbs, detJMedian } = complexMapJacobian;

    const critThresh = detJMedian * complexMapCriticalRel;
    const zeroThresh = complexMapGrid.wMagMax * complexMapZeroRel;
    const poleThresh = complexMapGrid.wMagMax * complexMapPoleRel;

    const limit = Math.max(20, Math.round(complexMapMarkerMax));
    const sweepIsV = complexMapSpec.sweepAxis === "v";
    const outputMode = complexMapSpec.outputMode;

    const criticalZ: [number, number][] = [];
    const criticalW: [number, number][] = [];
    const critical3d: { x: number; y: number; z: number }[] = [];
    const zeroZ: [number, number][] = [];
    const zeroW: [number, number][] = [];
    const zero3d: { x: number; y: number; z: number }[] = [];
    const poleZ: [number, number][] = [];
    const poleW: [number, number][] = [];
    const pole3d: { x: number; y: number; z: number }[] = [];

    const push3d = (arr: { x: number; y: number; z: number }[], u: number, v: number, rc: number, mc: number) => {
      const x = sweepIsV ? v : u;
      const other = sweepIsV ? u : v;
      if (outputMode === "sweep") {
        arr.push({ x, y: rc, z: mc });
      } else if (outputMode === "re") {
        arr.push({ x, y: rc, z: other });
      } else if (outputMode === "im") {
        arr.push({ x, y: mc, z: other });
      } else {
        arr.push({ x, y: rc, z: other }, { x, y: mc, z: other });
      }
    };

    for (let j = 0; j < nv; j++) {
      const v = vMin + vStep * j;
      for (let i = 0; i < nu; i++) {
        const u = uMin + uStep * i;
        const idx = j * nu + i;
        const rc = reClamped[idx];
        const mc = imClamped[idx];
        const mag = wMag[idx];
        const detAbs = detJAbs[idx];

        if (complexMapShowCritical && Number.isFinite(detAbs) && detAbs <= critThresh) {
          criticalZ.push([u, v]);
          if (Number.isFinite(rc) && Number.isFinite(mc)) criticalW.push([rc, mc]);
          if (complexMapMarkers3d && Number.isFinite(rc) && Number.isFinite(mc)) push3d(critical3d, u, v, rc, mc);
        }
        if (complexMapShowZeros && Number.isFinite(mag) && mag <= zeroThresh) {
          zeroZ.push([u, v]);
          if (Number.isFinite(rc) && Number.isFinite(mc)) zeroW.push([rc, mc]);
          if (complexMapMarkers3d && Number.isFinite(rc) && Number.isFinite(mc)) push3d(zero3d, u, v, rc, mc);
        }
        if (complexMapShowPoles && (!Number.isFinite(mag) || mag >= poleThresh)) {
          poleZ.push([u, v]);
          if (Number.isFinite(rc) && Number.isFinite(mc)) poleW.push([rc, mc]);
          if (complexMapMarkers3d && Number.isFinite(rc) && Number.isFinite(mc)) push3d(pole3d, u, v, rc, mc);
        }
      }
    }

    const limitPoints = <T,>(arr: T[]) => {
      if (arr.length <= limit) return arr;
      const stride = Math.ceil(arr.length / limit);
      return arr.filter((_v, i) => i % stride === 0);
    };

    return {
      thresholds: {
        critical: critThresh,
        zero: zeroThresh,
        pole: poleThresh,
      },
      critical: {
        z: limitPoints(criticalZ),
        w: limitPoints(criticalW),
        p3d: limitPoints(critical3d),
      },
      zero: {
        z: limitPoints(zeroZ),
        w: limitPoints(zeroW),
        p3d: limitPoints(zero3d),
      },
      pole: {
        z: limitPoints(poleZ),
        w: limitPoints(poleW),
        p3d: limitPoints(pole3d),
      },
    };
  }, [
    complexMapGrid,
    complexMapJacobian,
    complexMapSpec.sweepAxis,
    complexMapSpec.outputMode,
    complexMapShowCritical,
    complexMapShowZeros,
    complexMapShowPoles,
    complexMapMarkers3d,
    complexMapMarkerMax,
    complexMapCriticalRel,
    complexMapZeroRel,
    complexMapPoleRel,
  ]);

  const complexMapProbePoints3d = useMemo(() => {
    if (!complexMapProbe) return null;
    const { u, v, w } = complexMapProbe;
    const x = complexMapSpec.sweepAxis === "v" ? v : u;
    const other = complexMapSpec.sweepAxis === "v" ? u : v;
    const points: { x: number; y: number; z: number }[] = [];
    if (complexMapSpec.outputMode === "sweep") {
      points.push({ x, y: w.re, z: w.im });
    } else if (complexMapSpec.outputMode === "re") {
      points.push({ x, y: w.re, z: other });
    } else if (complexMapSpec.outputMode === "im") {
      points.push({ x, y: w.im, z: other });
    } else {
      points.push({ x, y: w.re, z: other }, { x, y: w.im, z: other });
    }
    return points.length ? points : null;
  }, [complexMapProbe, complexMapSpec.outputMode, complexMapSpec.sweepAxis]);

  const complexMapOverlayPointSets = useMemo(() => {
    const sets: { points: { x: number; y: number; z: number }[]; color: number; size?: number; opacity?: number }[] =
      [];
    if (complexMapMarkers3d && complexMapMarkerData) {
      if (complexMapMarkerData.critical.p3d.length) {
        sets.push({ points: complexMapMarkerData.critical.p3d, color: 0xd81b60, size: 0.055, opacity: 0.9 });
      }
      if (complexMapMarkerData.zero.p3d.length) {
        sets.push({ points: complexMapMarkerData.zero.p3d, color: 0x2e7d32, size: 0.052, opacity: 0.9 });
      }
      if (complexMapMarkerData.pole.p3d.length) {
        sets.push({ points: complexMapMarkerData.pole.p3d, color: 0xf57c00, size: 0.06, opacity: 0.9 });
      }
    }
    if (complexMapProbePoints3d?.length) {
      sets.push({ points: complexMapProbePoints3d, color: 0x111111, size: 0.07, opacity: 0.95 });
    }
    return sets.length ? sets : null;
  }, [complexMapMarkerData, complexMapMarkers3d, complexMapProbePoints3d]);

  const complexMapDistortionValues3d = useMemo(() => {
    if (!complexDistortionShowSurface || !complexMapGrid || !complexMapJacobian) return null;
    if (complexDistortionMode === "none") return null;
    const base =
      complexDistortionMode === "area"
        ? complexMapJacobian.detJAbs
        : complexDistortionMode === "anisotropy"
        ? complexMapJacobian.sigmaRatio
        : complexMapJacobian.conformalErr;

    if (!base?.length) return null;
    const logScale = complexDistortionScale === "log" &&
      (complexDistortionMode === "area" || complexDistortionMode === "anisotropy");
    const scaleValue = (v: number) => {
      if (!Number.isFinite(v)) return 0;
      if (!logScale) return v;
      return Math.log10(1 + Math.max(0, v));
    };
    const sanitize = (arr: Float32Array) => {
      const out = new Float32Array(arr.length);
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        out[i] = scaleValue(v);
      }
      return out;
    };
    if (complexMapSpec.outputMode === "both") {
      const clean = sanitize(base);
      const out = new Float32Array(base.length * 2);
      out.set(clean, 0);
      out.set(clean, clean.length);
      return out;
    }
    return sanitize(base);
  }, [
    complexDistortionMode,
    complexDistortionScale,
    complexDistortionShowSurface,
    complexMapGrid,
    complexMapJacobian,
    complexMapSpec.outputMode,
  ]);

  const isComplexMapMesh =
    surfaceViewerKind === "complex" &&
    !!surfaceMeshData &&
    isComplexMapSurfaceLabel(surfaceMeshData.label);
  const complexMapHeatmapActive =
    isComplexMapMesh &&
    complexDistortionShowSurface &&
    complexDistortionMode !== "none" &&
    !!complexMapDistortionValues3d?.length;
  const complexMapOverlayPointsActive = isComplexMapMesh ? complexMapOverlayPointSets : null;

  const [probeInfo, setProbeInfo] = useState<ProbeInfo | null>(null);
  const [probeCurv, setProbeCurv] = useState<CurvatureData | null>(null);
  const [probeStamp, setProbeStamp] = useState(0);
  const [paramProbeCurv, setParamProbeCurv] = useState<PrincipalCurvatureScalars | null>(null);

  const complexMapDistortionProbe = useMemo(() => {
    if (!complexMapProbe) return null;
    return {
      u: complexMapProbe.u,
      v: complexMapProbe.v,
      detAbs: complexMapProbe.detAbs,
      ratio: complexMapProbe.ratio,
      conformalErr: complexMapProbe.conformalErr,
    };
  }, [complexMapProbe]);

  const complexPreimageWShape = useMemo(() => {
    if (complexPreimageMode === "none") return null;
    const extent = Math.max(1e-6, complexMapWExtent);
    if (complexPreimageMode === "re") {
      return [[[complexPreimageValue, -extent], [complexPreimageValue, extent]]] as [number, number][][];
    }
    if (complexPreimageMode === "im") {
      return [[[-extent, complexPreimageValue], [extent, complexPreimageValue]]] as [number, number][][];
    }
    if (complexPreimageMode === "abs") {
      const r = Math.max(0, complexPreimageValue);
      const steps = 80;
      const pts: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        pts.push([r * Math.cos(t), r * Math.sin(t)]);
      }
      return [pts];
    }
    const theta = complexPreimageValue;
    return [[[0, 0], [extent * Math.cos(theta), extent * Math.sin(theta)]]] as [number, number][][];
  }, [complexPreimageMode, complexPreimageValue, complexMapWExtent]);

  const complexMapSphereStackParams = useMemo(() => {
    if (!complexMapSphereStacked) return null;
    const sweepIsV = complexMapSpec.sweepAxis === "v";
    const sweepMin = sweepIsV
      ? Math.min(complexMapSpec.vMin, complexMapSpec.vMax)
      : Math.min(complexMapSpec.uMin, complexMapSpec.uMax);
    const sweepMax = sweepIsV
      ? Math.max(complexMapSpec.vMin, complexMapSpec.vMax)
      : Math.max(complexMapSpec.uMin, complexMapSpec.uMax);
    const center = 0.5 * (sweepMin + sweepMax);
    const halfRange = Math.max(1e-6, 0.5 * (sweepMax - sweepMin));
    return { axis: complexMapSpec.sweepAxis, center, halfRange };
  }, [
    complexMapSphereStacked,
    complexMapSpec.sweepAxis,
    complexMapSpec.uMin,
    complexMapSpec.uMax,
    complexMapSpec.vMin,
    complexMapSpec.vMax,
  ]);

  const complexMapSphereLines3d = useMemo<RiemannSphereLine[] | null>(() => {
    if (!complexMapShowSphere) return null;
    const lines: RiemannSphereLine[] = [];
    const stackParams = complexMapSphereStackParams;
    const sweepAxis = stackParams?.axis;
    const offsetFor = (value: number) =>
      stackParams ? (value - stackParams.center) / stackParams.halfRange : 0;
    const mapPoint = (re: number, im: number, offset: number) => {
      const p = stereographicToSphere(re, im);
      return { x: p.x + offset, y: p.y, z: p.z };
    };
    const addLine = (
      line: [number, number][],
      color: number,
      opacity: number,
      axis?: "u" | "v",
      value?: number
    ) => {
      if (!line || line.length < 2) return;
      const offset =
        axis && stackParams && sweepAxis && axis === sweepAxis && Number.isFinite(value)
          ? offsetFor(value as number)
          : 0;
      const points = line.map(([re, im]) => mapPoint(re, im, offset));
      if (points.length >= 2) {
        lines.push({ points, color, opacity });
      }
    };

    if (complexMapSpec.showIsolines && complexMapSphereLines?.length) {
      for (const entry of complexMapSphereLines) {
        if (stackParams && entry.axis !== sweepAxis) continue;
        addLine(
          entry.line,
          entry.axis === "u" ? COMPLEX_GRID_COLORS_3D.u : COMPLEX_GRID_COLORS_3D.v,
          complexMapGridOpacity,
          entry.axis,
          entry.value
        );
      }
    }

    if (complexMapLineWPolylines?.length) {
      for (const line of complexMapLineWPolylines) {
        addLine(line, 0xd14d00, 0.9, complexMapLine?.axis, complexMapLine?.value ?? 0);
      }
    }

    if (complexPreimageWShape?.length) {
      for (const line of complexPreimageWShape) {
        addLine(line, 0x1b7f3a, 0.85);
      }
    }

    return lines.length ? lines : null;
  }, [
    complexMapShowSphere,
    complexMapSphereStackParams,
    complexMapSpec.showIsolines,
    complexMapSphereLines,
    complexMapGridOpacity,
    complexMapLineWPolylines,
    complexMapLine,
    complexPreimageWShape,
  ]);

  const complexMapSpherePoints3d = useMemo<RiemannSpherePoint[] | null>(() => {
    if (!complexMapShowSphere) return null;
    const points: RiemannSpherePoint[] = [];
    const stackParams = complexMapSphereStackParams;
    const sweepAxis = stackParams?.axis;
    const offsetForUV = (u: number, v: number) => {
      if (!stackParams || !sweepAxis) return 0;
      const value = sweepAxis === "v" ? v : u;
      return (value - stackParams.center) / stackParams.halfRange;
    };
    const addGroup = (
      group: { z: [number, number][]; w: [number, number][] },
      color: number,
      size: number,
      forceNorth = false
    ) => {
      const count = Math.min(group.z.length, group.w.length);
      for (let i = 0; i < count; i++) {
        const [u, v] = group.z[i];
        const [re, im] = group.w[i];
        const offset = offsetForUV(u, v);
        const p = forceNorth ? { x: 0, y: 0, z: 1 } : stereographicToSphere(re, im);
        points.push({ x: p.x + offset, y: p.y, z: p.z, color, size });
      }
    };

    if (complexMapMarkerData && complexMapMarkersW) {
      addGroup(complexMapMarkerData.critical, 0xd81b60, 0.05);
      addGroup(complexMapMarkerData.zero, 0x2e7d32, 0.045);
      addGroup(complexMapMarkerData.pole, 0xf57c00, 0.055, true);
    }

    if (complexMapProbe) {
      const offset = offsetForUV(complexMapProbe.u, complexMapProbe.v);
      const p = stereographicToSphere(complexMapProbe.w.re, complexMapProbe.w.im);
      points.push({ x: p.x + offset, y: p.y, z: p.z, color: 0x111111, size: 0.07 });
    }

    if (complexMapProbePins.length) {
      for (const pin of complexMapProbePins) {
        const offset = offsetForUV(pin.u, pin.v);
        const p = stereographicToSphere(pin.w.re, pin.w.im);
        points.push({ x: p.x + offset, y: p.y, z: p.z, color: 0x333333, size: 0.06 });
      }
    }

    return points.length ? points : null;
  }, [
    complexMapShowSphere,
    complexMapSphereStackParams,
    complexMapMarkerData,
    complexMapMarkersW,
    complexMapProbe,
    complexMapProbePins,
  ]);

  const complexMapSphereGuides = useMemo<RiemannSphereGuide[] | null>(() => {
    if (!complexMapShowSphere || !complexMapSphereStackParams || !complexMapSphereLines?.length) return null;
    const values = new Set<number>();
    for (const entry of complexMapSphereLines) {
      if (entry.axis !== complexMapSphereStackParams.axis) continue;
      values.add(entry.value);
    }
    if (!values.size) return null;
    const guides: RiemannSphereGuide[] = [];
    for (const value of values) {
      const offset = (value - complexMapSphereStackParams.center) / complexMapSphereStackParams.halfRange;
      guides.push({
        center: { x: offset, y: 0, z: 0 },
        radius: 1,
        color: 0x9ca3af,
        opacity: 0.2,
        wireframe: true,
      });
    }
    return guides;
  }, [complexMapShowSphere, complexMapSphereStackParams, complexMapSphereLines]);

  // Split eq surfaces into implicit vs graph, but keep separate selected ids
  const [implicitSurfaceId, setImplicitSurfaceId] = useState<SurfaceId>("sphere");
  const [graphSurfaceId, setGraphSurfaceId] = useState<SurfaceId>("graph_saddle");

  // Parametric surface selector
  const [paramSurfaceId, setParamSurfaceId] = useState<ParamSurfaceId>("plane");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareSurfaceId, setCompareSurfaceId] = useState<SurfaceId>("sphere");
  const [compareParamId, setCompareParamId] = useState<ParamSurfaceId>("plane");
  const [compareIgnoreWorkbookOverlays, setCompareIgnoreWorkbookOverlays] = useState(() => {
    try {
      const raw = localStorage.getItem(COMPARE_IGNORE_OVERLAYS_KEY);
      return raw === "1" || raw === "true";
    } catch {
      return false;
    }
  });
  const [compareCameraSync, setCompareCameraSync] = useState(() => {
    try {
      const raw = localStorage.getItem(COMPARE_CAMERA_SYNC_KEY);
      return raw !== "0" && raw !== "false";
    } catch {
      return true;
    }
  });
  const [compareBlockId, setCompareBlockId] = useState<string | null>(null);
  const [compareUseSnapshotA, setCompareUseSnapshotA] = useState(false);
  const [compareUseSnapshotB, setCompareUseSnapshotB] = useState(false);
  const [compareDiffHeatmapEnabled, setCompareDiffHeatmapEnabled] = useState(false);
  const [selectionMaskOverride, setSelectionMaskOverride] = useState<SelectionMask | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(COMPARE_IGNORE_OVERLAYS_KEY, compareIgnoreWorkbookOverlays ? "1" : "0");
    } catch {
      // ignore
    }
  }, [compareIgnoreWorkbookOverlays]);
  useEffect(() => {
    try {
      localStorage.setItem(COMPARE_CAMERA_SYNC_KEY, compareCameraSync ? "1" : "0");
    } catch {
      // ignore
    }
  }, [compareCameraSync]);
  const [cameraSync, setCameraSync] = useState<CameraSyncState | null>(null);
  const [cameraOverride, setCameraOverride] = useState<CameraSyncState | null>(null);
  const [cameraOverrideToken, setCameraOverrideToken] = useState(0);
  const [compareCameraOverride, setCompareCameraOverride] = useState<CameraSyncState | null>(null);
  const [compareCameraOverrideToken, setCompareCameraOverrideToken] = useState(0);

  // formulas for custom modes
  const [graphExpr, setGraphExpr] = useState("x*x - y*y"); // z=f(x,y)
  const [implicitExpr, setImplicitExpr] = useState("x*x + y*y + z*z - 1"); // f=0
  const [cgalTargetEdge, setCgalTargetEdge] = useState(0.1);
  const [cgalAutoTargetEdge, setCgalAutoTargetEdge] = useState(false);
  const [cgalPadFrac, setCgalPadFrac] = useState(0.05);
  const [cgalTriBudgetEnabled, setCgalTriBudgetEnabled] = useState(false);
  const [cgalTriBudget, setCgalTriBudget] = useState(12000);
  const [cgalRadiusBound, setCgalRadiusBound] = useState(0.1);
  const [cgalMinTrisEnabled, setCgalMinTrisEnabled] = useState(false);
  const [cgalMinTris, setCgalMinTris] = useState(5000);
  const [cgalVerbose, setCgalVerbose] = useState(false);
  const [cgalPreflightSamples, setCgalPreflightSamples] = useState(10);
  const [cgalBusy, setCgalBusy] = useState(false);
  const [cgalError, setCgalError] = useState<string | null>(null);
  const [cgalHealthState, setCgalHealthState] = useState<CgalHealthState | null>(null);
  const [cgalMeshState, setCgalMeshState] = useState<CgalMeshState | null>(null);
  const [cgalMeshToken, setCgalMeshToken] = useState(0);

  // custom parametric σ(u,v)
  const [paramXExpr, setParamXExpr] = useState("u");
  const [paramYExpr, setParamYExpr] = useState("v");
  const [paramZExpr, setParamZExpr] = useState("0");
  const [weierstrassGExpr, setWeierstrassGExpr] = useState(WEIERSTRASS_DEFAULTS.gExpr);
  const [weierstrassPhiExpr, setWeierstrassPhiExpr] = useState(WEIERSTRASS_DEFAULTS.phiExpr);
  const [weierstrassDomain, setWeierstrassDomain] = useState<ParamDomain>(WEIERSTRASS_DEFAULTS.domain);
  const [weierstrassResolution, setWeierstrassResolution] = useState(WEIERSTRASS_DEFAULTS.resolution);
  const [weierstrassRecenter, setWeierstrassRecenter] = useState(WEIERSTRASS_DEFAULTS.recenter);
  const [weierstrassError, setWeierstrassError] = useState<string | null>(null);
  const [activeWeierstrassPresetId, setActiveWeierstrassPresetId] = useState<string | null>(
    WEIERSTRASS_PRESETS[0]?.id ?? null
  );
  const [weierstrassDiagnostics, setWeierstrassDiagnostics] = useState<WeierstrassDriftResult | null>(null);
  const [weierstrassPathDisagreement, setWeierstrassPathDisagreement] = useState<{ avg: number; max: number } | null>(
    null
  );
  const [weierstrassDiagnosticError, setWeierstrassDiagnosticError] = useState<string | null>(null);
  const [diagnosticsToken, setDiagnosticsToken] = useState(0);
  const [showDriftArrow, setShowDriftArrow] = useState(false);

  // 3D visual toggles
  const [showWireframe, setShowWireframe] = useState(false);
  const [showChartGrid, setShowChartGrid] = useState(false);
  const chartGridCountU = 11;
  const chartGridCountV = 11;
  const [showPlanes, setShowPlanes] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>("solid");
  const [colorPalette, setColorPalette] = useState<ColorPalette>("blueRed");
  const [showGaussMap, setShowGaussMap] = useState(false);
  const [gaussColorMode, setGaussColorMode] = useState<GaussColorMode>("components");
  const [gaussPoints, setGaussPoints] = useState<GaussPoint[]>([]);
  useEffect(() => {
    if (datasetKind !== "volume") return;
    setCompareEnabled(false);
    setShowGaussMap(false);
  }, [datasetKind]);
  const [gaussHoverIndex, setGaussHoverIndex] = useState<number | null>(null);
  const [surfaceSampleSet, setSurfaceSampleSet] = useState<SurfaceSampleSet | null>(null);
  const [selection, setSelection] = useState<RegionSelection | null>(null);
  const [selectionMask, setSelectionMask] = useState<SelectionMask | null>(null);
  const [selectionRadius, setSelectionRadius] = useState(0.4);
  const [selectionUseUV, setSelectionUseUV] = useState(false);
  const [selectionMode, setSelectionMode] = useState<"euclidean" | "geodesic">("euclidean");
  const [selectRegionEnabled, setSelectRegionEnabled] = useState(false);
  const [selectionOverlayVisible, setSelectionOverlayVisible] = useState(true);
  const [selectionOverlayOnTop, setSelectionOverlayOnTop] = useState(false);
  const [selectionSphereVisible, setSelectionSphereVisible] = useState(true);
  const [zoomToRegion, setZoomToRegion] = useState(false);
  const [zoomNowToken, setZoomNowToken] = useState(0);
  const [selectionStatsToken, setSelectionStatsToken] = useState(0);
  const [selectionSeed, setSelectionSeed] = useState<{
    sampleIndex: number;
    meshKey: string;
    vertexIndex: number;
  } | null>(null);
  const [geodesicPathEnabled, setGeodesicPathEnabled] = useState(false);
  const [geodesicPathConstrain, setGeodesicPathConstrain] = useState(false);
  const [geodesicPathStart, setGeodesicPathStart] = useState<GeodesicPathEndpoint | null>(null);
  const [geodesicPathEnd, setGeodesicPathEnd] = useState<GeodesicPathEndpoint | null>(null);
  const [geodesicPathIndices, setGeodesicPathIndices] = useState<number[] | null>(null);
  const [geodesicPathLength, setGeodesicPathLength] = useState<number | null>(null);
  const [geodesicPathMessage, setGeodesicPathMessage] = useState<string | null>(null);
  const [geodesicPathDebug, setGeodesicPathDebug] = useState(false);
  const [geodesicPathDebugInfo, setGeodesicPathDebugInfo] = useState<string | null>(null);
  const [geodesicPathSmooth, setGeodesicPathSmooth] = useState(true);
  const [geodesicHeatEnabled, setGeodesicHeatEnabled] = useState(false);
  const [geodesicHeatBusy, setGeodesicHeatBusy] = useState(false);
  const [geodesicHeatStart, setGeodesicHeatStart] = useState<GeodesicHeatEndpoint | null>(null);
  const [geodesicHeatEnd, setGeodesicHeatEnd] = useState<GeodesicHeatEndpoint | null>(null);
  const [geodesicHeatPolylines, setGeodesicHeatPolylines] = useState<PolylineSet | null>(null);
  const [geodesicHeatLength, setGeodesicHeatLength] = useState<number | null>(null);
  const [geodesicHeatMessage, setGeodesicHeatMessage] = useState<string | null>(null);
  const [geodesicHeatPhi, setGeodesicHeatPhi] = useState<number[] | null>(null);
  const [geodesicHeatShowHeatmap, setGeodesicHeatShowHeatmap] = useState(false);
  const [geodesicHeatUseContinuous, setGeodesicHeatUseContinuous] = useState(false);
  const [geodesicHeatMeshToken, setGeodesicHeatMeshToken] = useState<number | null>(null);
  const [geodesicHeatMeshKey, setGeodesicHeatMeshKey] = useState<string | null>(null);
  const [geodesicDiskEnabled, setGeodesicDiskEnabled] = useState(false);
  const [geodesicDiskBusy, setGeodesicDiskBusy] = useState(false);
  const [geodesicDiskPickMode, setGeodesicDiskPickMode] = useState(false);
  const [geodesicDiskCenter, setGeodesicDiskCenter] = useState<GeodesicDiskCenter | null>(null);
  const [geodesicDiskRadius, setGeodesicDiskRadius] = useState(0.4);
  const [geodesicDiskRadiusApplied, setGeodesicDiskRadiusApplied] = useState(0.4);
  const [geodesicDiskAutoUpdate, setGeodesicDiskAutoUpdate] = useState(true);
  const [geodesicDiskShowBoundary, setGeodesicDiskShowBoundary] = useState(true);
  const [geodesicDiskMethod, setGeodesicDiskMethod] = useState<"heat" | "dijkstra">("heat");
  const [geodesicDiskMessage, setGeodesicDiskMessage] = useState<string | null>(null);
  const [geodesicDiskPhi, setGeodesicDiskPhi] = useState<Float64Array | null>(null);
  const [geodesicDiskPhiMeshKey, setGeodesicDiskPhiMeshKey] = useState<string | null>(null);
  const [geodesicDiskPhiMeshToken, setGeodesicDiskPhiMeshToken] = useState<number | null>(null);
  const [geodesicDiskPhiMethod, setGeodesicDiskPhiMethod] = useState<"heat" | "dijkstra" | null>(null);
  const [geodesicDiskPhiKey, setGeodesicDiskPhiKey] = useState<string | null>(null);
  const geodesicDiskPhiCacheRef = useRef(new Map<string, Float64Array>());
  const geodesicDiskRequestIdRef = useRef(0);
  const geodesicDiskRadiusTouchedRef = useRef(false);
  const paramGeodesicStateRef = useRef<ParamGeodesicState | null>(null);
  const adjacencyCacheRef = useRef(
    new Map<
      string,
      {
        positions: Float32Array;
        indices: ArrayLike<number> | null;
        neighbors: number[][];
        weights: number[][];
        vertexToMerged?: Int32Array;
        mergedToVertex?: Int32Array;
        edgeSources?: number[][];
        edgeTargets?: number[][];
      }
    >()
  );
  const implicitBakeWorkerRef = useRef<Worker | null>(null);
  const implicitBakeJobRef = useRef<string | null>(null);
  const implicitBakeKeyRef = useRef<string | null>(null);
  const implicitBakeCacheRef = useRef(new Map<string, { mesh: SurfaceMeshData; ts: number }>());
  const [inspectEnabled, setInspectEnabled] = useState(false);
  const [inspectIdx, setInspectIdx] = useState<number | null>(null);
  const [inspectPos, setInspectPos] = useState<{ x: number; y: number; z: number } | null>(null);
  const [inspectNormal, setInspectNormal] = useState<{ x: number; y: number; z: number } | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<SelectionMetricKey>("K");
  const surfaceHasUV = surfaceSampleSet?.samples.some((s) => !!s.uv) ?? false;
  useEffect(() => {
    if (!surfaceHasUV && selectionUseUV) {
      setSelectionUseUV(false);
    }
  }, [surfaceHasUV, selectionUseUV]);

  useEffect(() => {
    if (selectionMode === "geodesic" && selectionUseUV) {
      setSelectionUseUV(false);
    }
  }, [selectionMode, selectionUseUV]);

  const clearInspect = useCallback(() => {
    setInspectIdx(null);
    setInspectPos(null);
    setInspectNormal(null);
  }, []);

  useEffect(() => {
    clearInspect();
  }, [surfaceSampleSet, clearInspect]);

  useEffect(() => {
    if (!selection || selection.kind !== "surfaceDisk") return;
    if (selection.radius === selectionRadius) return;
    setSelection({ ...selection, radius: selectionRadius });
  }, [selection, selectionRadius]);

  useEffect(() => {
    if (selectionMode !== "geodesic") return;
    if (!selection || selection.kind !== "surfaceDisk" || selection.useUV) return;
    if (selectionSeed || !surfaceSampleSet?.samples.length) return;
    const center = selection.centerWorld;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < surfaceSampleSet.samples.length; i++) {
      const sample = surfaceSampleSet.samples[i];
      const d2 = sample.position.distanceToSquared(center);
      if (d2 < bestDist) {
        bestDist = d2;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const sample = surfaceSampleSet.samples[bestIdx];
      if (sample.meshKey && sample.vertexIndex != null) {
        setSelectionSeed({ sampleIndex: bestIdx, meshKey: sample.meshKey, vertexIndex: sample.vertexIndex });
      }
    }
  }, [selectionMode, selection, selectionSeed, surfaceSampleSet]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.key === "i" || event.key === "I") {
        setInspectEnabled((prev) => !prev);
      } else if (event.key === "Escape") {
        clearInspect();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [clearInspect]);

  const toggleSelectionUseUV = useCallback(() => {
    if (!surfaceHasUV) return;
    setSelectionUseUV((prev) => !prev);
  }, [surfaceHasUV]);
  const gaussHighlightPoint =
    gaussHoverIndex != null && gaussPoints[gaussHoverIndex]
      ? gaussPoints[gaussHoverIndex].position
      : null;
  const [lightPreset, setLightPreset] = useState<"studio" | "soft" | "contrast" | "neutral" | "warm">("studio");
  const [materialRoughness, setMaterialRoughness] = useState(0.3);
  const [materialMetalness, setMaterialMetalness] = useState(0.1);
  const [materialOpacity, setMaterialOpacity] = useState(1);
  const [graphResolution, setGraphResolution] = useState(80);
  const [implicitResolution, setImplicitResolution] = useState(32);
  const [implicitBakeResolution, setImplicitBakeResolution] = useState(() => {
    const raw = Number(localStorage.getItem("mathapp.implicitBake.res.v1"));
    return Number.isFinite(raw) ? Math.max(16, Math.min(320, Math.round(raw))) : 160;
  });
  const [implicitBakeBounds, setImplicitBakeBounds] = useState<ImplicitBakeBounds>(() => {
    const raw = safeParseObject<ImplicitBakeBounds>(localStorage.getItem("mathapp.implicitBake.bounds.v1"));
    return normalizeImplicitBakeBounds(raw ?? DEFAULT_IMPLICIT_BAKE_BOUNDS, DEFAULT_IMPLICIT_BAKE_BOUNDS);
  });
  const [implicitBakeBusy, setImplicitBakeBusy] = useState(false);
  const [implicitBakePhase, setImplicitBakePhase] = useState<"idle" | "sampling" | "marching">("idle");
  const [implicitBakeProgress, setImplicitBakeProgress] = useState(0);
  const [implicitBakeError, setImplicitBakeError] = useState<string | null>(null);
  const [implicitBakeCacheHit, setImplicitBakeCacheHit] = useState(false);
  const [paramResolution, setParamResolution] = useState(160);
  const [showBoundingBox, setShowBoundingBox] = useState(false);
  const [cameraResetToken, setCameraResetToken] = useState(0);

  // probe
  const [probeEnabled, setProbeEnabled] = useState(false);
  const [showProbeNormal, setShowProbeNormal] = useState(true);
  const [showProbeTangentPlane, setShowProbeTangentPlane] = useState(true);
  const [showProbeTangents, setShowProbeTangents] = useState(true);
  const [showPrincipalDirections, setShowPrincipalDirections] = useState(false);
  const [showPrincipalNormalPlanes, setShowPrincipalNormalPlanes] = useState(false);
  const [showPrincipalLines, setShowPrincipalLines] = useState(false);
  const [showPrincipalGlyphs, setShowPrincipalGlyphs] = useState(false);
  const [principalGlyphDensity, setPrincipalGlyphDensity] = useState(100);
  const [principalGlyphLength, setPrincipalGlyphLength] = useState(0.4);
  const [principalGlyphMode, setPrincipalGlyphMode] = useState<"both" | "d1">("both");
  const [showCurvatureLines, setShowCurvatureLines] = useState(false);
  const [curvatureLineField, setCurvatureLineField] = useState<"d1" | "d2">("d1");
  const [curvatureSeedSource, setCurvatureSeedSource] = useState<"global" | "selection">("global");
  const [curvatureSeedDensity, setCurvatureSeedDensity] = useState(100);
  const [curvatureStepSize, setCurvatureStepSize] = useState(0);
  const [curvatureMaxSteps, setCurvatureMaxSteps] = useState(400);
  const [curvatureMaxLines, setCurvatureMaxLines] = useState(200);
  const [curvatureRebuildToken, setCurvatureRebuildToken] = useState(0);
  const [showRidges, setShowRidges] = useState(false);
  const [showValleys, setShowValleys] = useState(false);
  const [ridgeValleySelectionOnly, setRidgeValleySelectionOnly] = useState(false);
  const [ridgeValleyMagMin, setRidgeValleyMagMin] = useState(0.05);
  const [ridgeValleyContrast, setRidgeValleyContrast] = useState(0.01);
  const [ridgeValleyMinCos, setRidgeValleyMinCos] = useState(0.3);
  const [ridgeValleySegmentScale, setRidgeValleySegmentScale] = useState(0.005);
  const [ridgeValleySampleMode, setRidgeValleySampleMode] = useState<"high" | "medium" | "low">(
    "medium"
  );
  const [ridgeValleyStitch, setRidgeValleyStitch] = useState(false);
  const [ridgeValleyDecimate, setRidgeValleyDecimate] = useState(0.002);
  const [ridgeValleyMaxCurves, setRidgeValleyMaxCurves] = useState(200);
  const [ridgeValleyMinConf, setRidgeValleyMinConf] = useState(0);
  // domain pick tokens (right panel)
  const [paramProbeUV, setParamProbeUV] = useState<{ u: number; v: number } | null>(null);
  const [paramProbeToken, setParamProbeToken] = useState(0);
  const [graphProbeXY, setGraphProbeXY] = useState<{ x: number; y: number } | null>(null);
  const [graphProbeToken, setGraphProbeToken] = useState(0);
  const [implicitProbeXYZ, setImplicitProbeXYZ] = useState<{ x: number; y: number; z: number } | null>(null);
  const [implicitProbeToken, setImplicitProbeToken] = useState(0);

  // command prompt
  const [commandInput, setCommandInput] = useState("");
  const [commandHistory, setCommandHistory] = useState<{ cmd: string; out: string }[]>([]);

  // contours (graph + implicit)
  const [showContours, setShowContours] = useState(true);
  const [contourCount, setContourCount] = useState(12);
  const [implicitOverlay, setImplicitOverlay] = useState<"none" | "normals" | "curvature">("none");

  const [graphDomains, setGraphDomains] = useState<Record<string, GraphDomain>>(() => {
    const raw = safeParseRecord<GraphDomain>(localStorage.getItem("mathapp.domainState.graph.v1"));
    const out: Record<string, GraphDomain> = {};
    for (const key of Object.keys(raw)) {
      out[key] = normalizeGraphDomain(raw[key], getDefaultGraphSpan(key as SurfaceId));
    }
    return out;
  });
  const [implicitDomains, setImplicitDomains] = useState<Record<string, ImplicitDomain>>(() => {
    const raw = safeParseRecord<ImplicitDomain>(localStorage.getItem("mathapp.domainState.implicit.v1"));
    const out: Record<string, ImplicitDomain> = {};
    for (const key of Object.keys(raw)) {
      const v = raw[key] as any;
      const xSpan = Number.isFinite(v?.xSpan) ? Number(v.xSpan) : Number(v?.size ?? 0);
      const ySpan = Number.isFinite(v?.ySpan) ? Number(v.ySpan) : Number(v?.size ?? 0);
      if (Number.isFinite(xSpan) && Number.isFinite(ySpan) && xSpan > 0 && ySpan > 0) {
        out[key] = { xSpan, ySpan };
      }
    }
    return out;
  });
  const [paramDomains, setParamDomains] = useState<Record<string, ParamDomain>>(() => {
    const raw = safeParseRecord<ParamDomain>(localStorage.getItem("mathapp.domainState.param.v1"));
    const out: Record<string, ParamDomain> = {};
    for (const key of Object.keys(raw)) {
      out[key] = normalizeParamDomain(raw[key], getParamDomainPreviewBounds(key as ParamSurfaceId));
    }
    return out;
  });

  const [graphDomainPresets, setGraphDomainPresets] = useState<GraphDomainPreset[]>(() =>
    safeParseArray<GraphDomainPreset>(localStorage.getItem("mathapp.domainPresets.graph.v1"))
  );
  const [paramDomainPresets, setParamDomainPresets] = useState<ParamDomainPreset[]>(() =>
    safeParseArray<ParamDomainPreset>(localStorage.getItem("mathapp.domainPresets.param.v1"))
  );
  const [implicitDomainPresets, setImplicitDomainPresets] = useState<ImplicitDomainPreset[]>(() =>
    safeParseArray<ImplicitDomainPreset>(localStorage.getItem("mathapp.domainPresets.implicit.v1"))
  );

  const isComplexViewer = surfaceViewerKind === "complex";
  const isMeshLikeViewer = surfaceViewerKind === "mesh" || isComplexViewer;

  // active equation surface id (single truth)
  const activeEqSurfaceId =
    surfaceViewerKind === "graph"
      ? graphSurfaceId
      : isMeshLikeViewer
        ? "surface_mesh"
        : implicitSurfaceId;
  const activeImplicitExpr = useMemo(() => {
    const fallback = (implicitExpr ?? "").trim();
    if (implicitSurfaceId === "implicit_custom") return fallback;
    const preset = IMPLICIT_EXPR_PRESETS.find((p) => p.id === implicitSurfaceId);
    return (preset?.expr ?? fallback).trim();
  }, [implicitSurfaceId, implicitExpr]);

  const activeCgalMesh = useMemo(() => {
    if (!cgalMeshState) return null;
    if (cgalMeshState.surfaceId !== activeEqSurfaceId) return null;
    if (cgalMeshState.expr !== activeImplicitExpr) return null;
    return cgalMeshState;
  }, [cgalMeshState, activeEqSurfaceId, activeImplicitExpr]);
  const surfaceMeshLabel = surfaceMeshData?.label ?? "SurfaceMesh";
  const surfaceMeshStats = useMemo(() => {
    if (!surfaceMeshData?.positions?.length) return null;
    const vertCount = Math.floor(surfaceMeshData.positions.length / 3);
    const triCount = surfaceMeshData.indices
      ? Math.floor(surfaceMeshData.indices.length / 3)
      : Math.floor(vertCount / 3);
    return { vertCount, triCount };
  }, [surfaceMeshData]);
  const currentDatasetRef = useMemo(() => {
    if (datasetKind === "volume") {
      const label = volumeDatasetOverride?.label;
      return label ? `volume:${label}` : `volume:${volumePresetId}`;
    }
    if (datasetKind === "mesh") {
      return `mesh:${surfaceMeshLabel}`;
    }
    if (surfaceViewerKind === "param") return `param:${paramSurfaceId}`;
    if (surfaceViewerKind === "weierstrass") return "weierstrass";
    if (surfaceViewerKind === "graph") return `graph:${graphSurfaceId}`;
    if (surfaceViewerKind === "implicit") return `implicit:${implicitSurfaceId}`;
    if (surfaceViewerKind === "complex") return "complex map";
    return surfaceViewerKind;
  }, [
    datasetKind,
    volumeDatasetOverride?.label,
    volumePresetId,
    surfaceMeshLabel,
    surfaceViewerKind,
    paramSurfaceId,
    graphSurfaceId,
    implicitSurfaceId,
  ]);
  const cameraSyncEnabled = compareEnabled || rightPanelTab === "workbook";
  const compareCameraSyncEnabled = compareEnabled && compareCameraSync;
  const workbookGraph = useMemo(() => {
    if (!activeWorkbook) {
      return {
        orderedBlocks: [],
        blockMetaById: new Map<string, { stageId: WorkbookStageId; index: number; block: WorkbookBlock }>(),
        dependenciesById: new Map<string, string[]>(),
        downstreamById: new Map<string, string[]>(),
        inputHashById: new Map<string, string>(),
        outputHashById: new Map<string, string>(),
        computeStatusById: new Map<string, "ok" | "stale" | "failed">(),
        computeBlockIdsByStage: {
          define: [],
          compute: [],
          visualize: [],
          explain: [],
        } as Record<WorkbookStageId, string[]>,
      };
    }

    const stageMap = new Map(activeWorkbook.stages.map((s) => [s.id, s]));
    const orderedBlocks: Array<{ stageId: WorkbookStageId; index: number; block: WorkbookBlock }> = [];
    const blockMetaById = new Map<string, { stageId: WorkbookStageId; index: number; block: WorkbookBlock }>();
    const computeBlockIdsByStage: Record<WorkbookStageId, string[]> = {
      define: [],
      compute: [],
      visualize: [],
      explain: [],
    };
    for (const stageId of WORKBOOK_STAGE_IDS) {
      const stage = stageMap.get(stageId);
      if (!stage) continue;
      stage.blocks.forEach((block, index) => {
        orderedBlocks.push({ stageId, index, block });
        blockMetaById.set(block.id, { stageId, index, block });
        if (block.type === "compute") {
          computeBlockIdsByStage[stageId].push(block.id);
        }
      });
    }

    const dependenciesById = new Map<string, string[]>();
    const downstreamById = new Map<string, string[]>();
    const inputHashById = new Map<string, string>();
    const outputHashById = new Map<string, string>();
    const computeStatusById = new Map<string, "ok" | "stale" | "failed">();
    const outputByType = new Map<WorkbookValueType, { blockId: string; hash: string }[]>();

    const blockContentPayload = (block: WorkbookBlock) => ({
      type: block.type,
      title: block.title,
      text: block.text ?? "",
      formula: block.formula ?? "",
      visualize: block.visualize
        ? {
            live: block.visualize.live,
            snapshotA: resolveVisualizeSnapshot(block.visualize, "A"),
            snapshotB: resolveVisualizeSnapshot(block.visualize, "B"),
            notes: block.visualize.notes ?? "",
          }
        : null,
      assert: block.assert
        ? {
            expected: block.assert.expected ?? "",
            status: block.assert.status ?? "pending",
          }
        : null,
      params: block.params
        ? {
            defs: block.params.defs ?? [],
            values: block.params.values ?? {},
            scrub: block.params.scrub ?? false,
            keyframes: block.params.keyframes ?? [],
          }
        : null,
      interaction: block.interaction
        ? {
            kind: block.interaction.kind,
            status: block.interaction.status ?? "idle",
            summary: block.interaction.summary ?? "",
            point: block.interaction.point ?? null,
            curve: block.interaction.curve ?? null,
            mask: block.interaction.mask ?? null,
            direction: block.interaction.direction ?? null,
            points: block.interaction.points ?? [],
            directionAngle: block.interaction.directionAngle ?? 0,
          }
        : null,
      inputs: block.inputs ?? null,
      outputs: block.outputs ?? null,
    });

    const findLatestOutput = (type: WorkbookValueType) => {
      const items = outputByType.get(type);
      if (!items || !items.length) return null;
      return items[items.length - 1];
    };

    for (const entry of orderedBlocks) {
      const { block } = entry;
      const { inputs, outputs } = resolveBlockPorts(block);
      const deps = new Set<string>();
      const inputTokens = inputs.map((input) => {
        if (input.type === "dataset") {
          return { type: input.type, value: currentDatasetRef };
        }
        if (input.type === "points") {
          const items = outputByType.get("points") ?? [];
          if (items.length) {
            const pair = items.slice(-2);
            pair.forEach((item) => deps.add(item.blockId));
            return {
              type: input.type,
              from: pair.map((item) => item.blockId),
              hash: pair.map((item) => item.hash),
            };
          }
          return { type: input.type, missing: true, optional: !!input.optional };
        }
        const upstream = findLatestOutput(input.type);
        if (upstream) {
          deps.add(upstream.blockId);
          return { type: input.type, from: upstream.blockId, hash: upstream.hash };
        }
        return { type: input.type, missing: true, optional: !!input.optional };
      });
      const depList = Array.from(deps);
      dependenciesById.set(block.id, depList);

      if (block.type === "compute") {
        const operatorId = block.compute?.operatorId ?? "";
        const inputHash = hashValue({
          operatorId,
          datasetRef: currentDatasetRef,
          viewerKind: surfaceViewerKind,
          inputs: inputTokens,
          params: block.params?.values ?? null,
        });
        inputHashById.set(block.id, inputHash);
        const cacheEntry = block.compute?.cache?.[inputHash];
        let status: "ok" | "stale" | "failed" = "stale";
        if (cacheEntry?.status === "failed") {
          status = "failed";
        } else if (cacheEntry?.status === "ok") {
          status = "ok";
        } else if (!operatorId) {
          status = "stale";
        } else if (block.compute?.status === "failed" && block.compute?.inputHash === inputHash) {
          status = "failed";
        } else if (block.compute?.status === "ok" && block.compute?.inputHash === inputHash) {
          status = "ok";
        }
        computeStatusById.set(block.id, status);
        const outputHash = hashValue({ operatorId, inputHash });
        outputHashById.set(block.id, outputHash);
        outputs.forEach((output) => {
          const list = outputByType.get(output.type) ?? [];
          list.push({ blockId: block.id, hash: outputHash });
          outputByType.set(output.type, list);
        });
      } else {
        const outputHash = hashValue(blockContentPayload(block));
        outputHashById.set(block.id, outputHash);
        outputs.forEach((output) => {
          const list = outputByType.get(output.type) ?? [];
          list.push({ blockId: block.id, hash: outputHash });
          outputByType.set(output.type, list);
        });
      }
    }

    for (const [blockId, deps] of dependenciesById) {
      deps.forEach((depId) => {
        const list = downstreamById.get(depId) ?? [];
        list.push(blockId);
        downstreamById.set(depId, list);
      });
    }

    return {
      orderedBlocks,
      blockMetaById,
      dependenciesById,
      downstreamById,
      inputHashById,
      outputHashById,
      computeStatusById,
      computeBlockIdsByStage,
    };
  }, [activeWorkbook, currentDatasetRef, surfaceViewerKind]);
  const computeStatusById = useMemo(() => {
    const map: Record<string, "ok" | "stale" | "failed"> = {};
    for (const [id, status] of workbookGraph.computeStatusById) {
      map[id] = status;
    }
    return map;
  }, [workbookGraph]);
  const workbookStatus = useMemo(() => {
    const statuses = Object.values(computeStatusById);
    if (!statuses.length) return "ok";
    if (statuses.some((status) => status === "failed")) return "failed";
    if (statuses.some((status) => status === "stale")) return "stale";
    return "ok";
  }, [computeStatusById]);

  const compareBlock = useMemo(() => {
    if (!activeWorkbook) return null;
    const visualizeBlocks = activeWorkbook.stages
      .flatMap((stage) => stage.blocks)
      .filter((block) => block.type === "visualize");
    if (!visualizeBlocks.length) return null;
    const byId = compareBlockId ? visualizeBlocks.find((block) => block.id === compareBlockId) : null;
    if (byId) return byId;
    const withSnapshots = visualizeBlocks.find((block) => {
      const snapA = resolveVisualizeSnapshot(block.visualize, "A");
      const snapB = resolveVisualizeSnapshot(block.visualize, "B");
      return !!snapA || !!snapB;
    });
    return withSnapshots ?? visualizeBlocks[0];
  }, [activeWorkbook, compareBlockId]);

  const compareSnapshotA = useMemo(
    () => (compareBlock ? resolveVisualizeSnapshot(compareBlock.visualize, "A") : null),
    [compareBlock]
  );
  const compareSnapshotB = useMemo(
    () => (compareBlock ? resolveVisualizeSnapshot(compareBlock.visualize, "B") : null),
    [compareBlock]
  );
  const activeSnapshotA = compareEnabled && compareUseSnapshotA ? compareSnapshotA : null;
  const activeSnapshotB = compareEnabled && compareUseSnapshotB ? compareSnapshotB : null;

  const compareDiffHeatmapAvailable = useMemo(() => {
    if (!compareSnapshotA || !compareSnapshotB) return false;
    if (surfaceViewerKind !== "graph") return false;
    if (!compareSnapshotA.surfaceId || !compareSnapshotB.surfaceId) return false;
    return isGraphSurface(compareSnapshotA.surfaceId) && isGraphSurface(compareSnapshotB.surfaceId);
  }, [compareSnapshotA, compareSnapshotB, surfaceViewerKind]);

  const compareDiffHeatmapValues = useMemo(() => {
    if (!compareDiffHeatmapEnabled) return null;
    if (!compareDiffHeatmapAvailable) return null;
    if (!surfaceSampleSet?.samples?.length) return null;
    const surfaceIdA = compareSnapshotA?.surfaceId;
    const surfaceIdB = compareSnapshotB?.surfaceId;
    if (!surfaceIdA || !surfaceIdB) return null;
    const exprA = compareSnapshotA?.graphExpr ?? graphExpr;
    const exprB = compareSnapshotB?.graphExpr ?? graphExpr;
    const samples = surfaceSampleSet.samples;
    const values = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const curvA = computeGraphInvariantsFromProbe(surfaceIdA, exprA, sample.position);
      const curvB = computeGraphInvariantsFromProbe(surfaceIdB, exprB, sample.position);
      const KA = curvA?.K ?? NaN;
      const KB = curvB?.K ?? NaN;
      values[i] = Number.isFinite(KA) && Number.isFinite(KB) ? Math.abs(KB - KA) : NaN;
    }
    return values;
  }, [
    compareDiffHeatmapEnabled,
    compareDiffHeatmapAvailable,
    compareSnapshotA?.surfaceId,
    compareSnapshotB?.surfaceId,
    compareSnapshotA?.graphExpr,
    compareSnapshotB?.graphExpr,
    graphExpr,
    surfaceSampleSet,
  ]);
  const compareDiffHeatmapActive = !!compareDiffHeatmapValues?.length;

  useEffect(() => {
    if (compareDiffHeatmapEnabled && !compareDiffHeatmapAvailable) {
      setCompareDiffHeatmapEnabled(false);
    }
  }, [compareDiffHeatmapEnabled, compareDiffHeatmapAvailable]);

  useEffect(() => {
    if (!compareEnabled) {
      setCompareCameraOverride(null);
      return;
    }
    if (activeSnapshotA?.camera) {
      setCameraOverride(activeSnapshotA.camera);
      setCameraOverrideToken((t) => t + 1);
    }
    if (activeSnapshotB?.camera) {
      setCompareCameraOverride(activeSnapshotB.camera);
      setCompareCameraOverrideToken((t) => t + 1);
    }
  }, [compareEnabled, activeSnapshotA?.camera, activeSnapshotB?.camera]);

  const activeGraphDomain = useMemo(
    () =>
      normalizeGraphDomain(
        graphDomains[graphSurfaceId] ?? getDefaultGraphSpan(graphSurfaceId),
        getDefaultGraphSpan(graphSurfaceId)
      ),
    [graphSurfaceId, graphDomains[graphSurfaceId]?.xSpan, graphDomains[graphSurfaceId]?.ySpan]
  );
  const activeImplicitDomain = useMemo(() => {
    const raw = implicitDomains[implicitSurfaceId] ?? getDefaultImplicitDomain(implicitSurfaceId);
    return normalizeImplicitDomain(raw, getDefaultImplicitDomain(implicitSurfaceId));
  }, [implicitSurfaceId, implicitDomains[implicitSurfaceId]?.xSpan, implicitDomains[implicitSurfaceId]?.ySpan]);
  const safeImplicitBakeBounds = useMemo(
    () => normalizeImplicitBakeBounds(implicitBakeBounds, DEFAULT_IMPLICIT_BAKE_BOUNDS),
    [implicitBakeBounds]
  );
  const graphSampleMaxPoints = useMemo(
    () => Math.min(40000, Math.max(900, Math.round(graphResolution * graphResolution))),
    [graphResolution]
  );

  const activeWeierstrassDomain = useMemo(
    () => normalizeParamDomain(weierstrassDomain, WEIERSTRASS_DEFAULTS.domain),
    [
      weierstrassDomain.uMin,
      weierstrassDomain.uMax,
      weierstrassDomain.vMin,
      weierstrassDomain.vMax,
    ]
  );

  const implicitDomainSizeFor = useCallback(
    (id: SurfaceId) => {
      if (!isImplicitSurface(id)) return undefined;
      const raw = implicitDomains[id] ?? getDefaultImplicitDomain(id);
      const safe = normalizeImplicitDomain(raw, getDefaultImplicitDomain(id));
      return Math.max(safe.xSpan, safe.ySpan);
    },
    [implicitDomains]
  );

  const paramCatalog = useMemo(() => WORKBOOK_PARAM_CATALOG, []);
  const paramDefById = useMemo(() => {
    const map = new Map<string, WorkbookParamDef>();
    paramCatalog.forEach((def) => map.set(def.id, def));
    return map;
  }, [paramCatalog]);

  const readParamValue = useCallback(
    (id: string): WorkbookParamValue | undefined => {
      switch (id) {
        case "graphResolution":
          return graphResolution;
        case "paramResolution":
          return paramResolution;
        case "implicitResolution":
          return implicitResolution;
        case "implicitDomainSize":
          return implicitDomainSizeFor(activeEqSurfaceId) ?? 2.2;
        case "wireframe":
          return showWireframe;
        case "contours":
          return showContours;
        case "chartGrid":
          return showChartGrid;
        case "probe":
          return probeEnabled;
        case "colorMode":
          return colorMode;
        case "colorPalette":
          return colorPalette;
        case "selectionRadius":
          return selectionRadius;
        default:
          return undefined;
      }
    },
    [
      graphResolution,
      paramResolution,
      implicitResolution,
      implicitDomainSizeFor,
      activeEqSurfaceId,
      showWireframe,
      showContours,
      showChartGrid,
      probeEnabled,
      colorMode,
      colorPalette,
      selectionRadius,
    ]
  );

  const applyParamValue = useCallback(
    (id: string, rawValue: WorkbookParamValue) => {
      const def = paramDefById.get(id);
      let value = rawValue;
      if (def?.kind === "number") {
        const num = typeof rawValue === "number" ? rawValue : Number(rawValue);
        if (Number.isFinite(num)) {
          const min = def.min ?? num;
          const max = def.max ?? num;
          value = Math.min(max, Math.max(min, num));
        }
      }
      switch (id) {
        case "graphResolution": {
          const next = typeof value === "number" ? Math.round(value) : graphResolution;
          setGraphResolution(next);
          return;
        }
        case "paramResolution": {
          const next = typeof value === "number" ? Math.round(value) : paramResolution;
          setParamResolution(next);
          return;
        }
        case "implicitResolution": {
          const next = typeof value === "number" ? Math.round(value) : implicitResolution;
          setImplicitResolution(next);
          return;
        }
        case "implicitDomainSize": {
          const next = typeof value === "number" ? value : implicitDomainSizeFor(activeEqSurfaceId) ?? 2.2;
          if (!isImplicitSurface(activeEqSurfaceId)) return;
          setImplicitDomains((prev) => ({
            ...prev,
            [activeEqSurfaceId]: normalizeImplicitDomain({ xSpan: next, ySpan: next }, getDefaultImplicitDomain(activeEqSurfaceId)),
          }));
          return;
        }
        case "wireframe":
          setShowWireframe(Boolean(value));
          return;
        case "contours":
          setShowContours(Boolean(value));
          return;
        case "chartGrid":
          setShowChartGrid(Boolean(value));
          return;
        case "probe":
          setProbeEnabled(Boolean(value));
          return;
        case "colorMode":
          if (typeof value === "string") setColorMode(value as ColorMode);
          return;
        case "colorPalette":
          if (typeof value === "string") setColorPalette(value as ColorPalette);
          return;
        case "selectionRadius":
          if (typeof value === "number" && Number.isFinite(value)) setSelectionRadius(value);
          return;
        default:
          return;
      }
    },
    [
      activeEqSurfaceId,
      colorMode,
      colorPalette,
      graphResolution,
      implicitResolution,
      implicitDomainSizeFor,
      paramDefById,
      paramResolution,
      selectionRadius,
      setColorMode,
      setColorPalette,
      setGraphResolution,
      setImplicitDomains,
      setImplicitResolution,
      setParamResolution,
      setProbeEnabled,
      setSelectionRadius,
      setShowChartGrid,
      setShowContours,
      setShowWireframe,
    ]
  );
  const activeParamDomain = useMemo(
    () =>
      normalizeParamDomain(
        paramDomains[paramSurfaceId] ?? getParamDomainPreviewBounds(paramSurfaceId),
        getParamDomainPreviewBounds(paramSurfaceId)
      ),
    [
      paramSurfaceId,
      paramDomains[paramSurfaceId]?.uMin,
      paramDomains[paramSurfaceId]?.uMax,
      paramDomains[paramSurfaceId]?.vMin,
      paramDomains[paramSurfaceId]?.vMax,
    ]
  );
  const activeParamLikeDomain =
    surfaceViewerKind === "weierstrass" ? activeWeierstrassDomain : activeParamDomain;
  const activeParamLikeResolution =
    surfaceViewerKind === "weierstrass" ? weierstrassResolution : paramResolution;
  const isWeierstrassViewer = surfaceViewerKind === "weierstrass";
  const paramSurfaceIdForView: ParamSurfaceId = isWeierstrassViewer ? "weierstrass" : paramSurfaceId;

  const baseOverlaySettings = useMemo(
    () => ({
      colorMode,
      colorPalette,
      showWireframe,
      showContours,
      showChartGrid,
      showBoundingBox,
      showPlanes,
    }),
    [colorMode, colorPalette, showWireframe, showContours, showChartGrid, showBoundingBox, showPlanes]
  );

  const overlaySettingsForSnapshot = useCallback(
    (snapshot: WorkbookViewSnapshot | null) => ({
      colorMode: snapshot?.colorMode ?? baseOverlaySettings.colorMode,
      colorPalette: snapshot?.colorPalette ?? baseOverlaySettings.colorPalette,
      showWireframe: snapshot?.showWireframe ?? baseOverlaySettings.showWireframe,
      showContours: snapshot?.showContours ?? baseOverlaySettings.showContours,
      showChartGrid: snapshot?.showChartGrid ?? baseOverlaySettings.showChartGrid,
      showBoundingBox: snapshot?.showBoundingBox ?? baseOverlaySettings.showBoundingBox,
      showPlanes: snapshot?.showPlanes ?? baseOverlaySettings.showPlanes,
    }),
    [baseOverlaySettings]
  );

  const compareOverlayA = useMemo(
    () => overlaySettingsForSnapshot(activeSnapshotA),
    [activeSnapshotA, overlaySettingsForSnapshot]
  );
  const compareOverlayB = useMemo(
    () => overlaySettingsForSnapshot(activeSnapshotB),
    [activeSnapshotB, overlaySettingsForSnapshot]
  );

  const resolveSnapshotSurfaceId = useCallback(
    (snapshot: WorkbookViewSnapshot | null, fallback: SurfaceId) => {
      if (!snapshot || snapshot.viewerKind !== surfaceViewerKind) return fallback;
      if (surfaceViewerKind === "graph" && snapshot.surfaceId && isGraphSurface(snapshot.surfaceId)) {
        return snapshot.surfaceId;
      }
      if (surfaceViewerKind === "implicit" && snapshot.surfaceId && !isGraphSurface(snapshot.surfaceId)) {
        return snapshot.surfaceId;
      }
      return fallback;
    },
    [surfaceViewerKind]
  );

  const resolveSnapshotParamId = useCallback(
    (snapshot: WorkbookViewSnapshot | null, fallback: ParamSurfaceId) => {
      if (!snapshot || snapshot.viewerKind !== "param") return fallback;
      return snapshot.paramId ?? fallback;
    },
    []
  );

  const primarySurfaceId = compareEnabled
    ? resolveSnapshotSurfaceId(activeSnapshotA, activeEqSurfaceId)
    : activeEqSurfaceId;
  const secondarySurfaceId = compareEnabled
    ? resolveSnapshotSurfaceId(activeSnapshotB, compareSurfaceId)
    : compareSurfaceId;
  const primaryParamId = compareEnabled
    ? resolveSnapshotParamId(activeSnapshotA, paramSurfaceIdForView)
    : paramSurfaceIdForView;
  const secondaryParamId = compareEnabled
    ? resolveSnapshotParamId(activeSnapshotB, compareParamId)
    : compareParamId;
  const primaryOverlay = compareEnabled ? compareOverlayA : baseOverlaySettings;
  const secondaryOverlay = compareEnabled ? compareOverlayB : baseOverlaySettings;

  useEffect(() => {
    if (!isGraphSurface(graphSurfaceId)) return;
    setGraphDomains((prev) => {
      if (prev[graphSurfaceId]) return prev;
      return { ...prev, [graphSurfaceId]: getDefaultGraphSpan(graphSurfaceId) };
    });
  }, [graphSurfaceId]);

  useEffect(() => {
    if (!isImplicitSurface(implicitSurfaceId)) return;
    setImplicitDomains((prev) => {
      if (prev[implicitSurfaceId]) return prev;
      return { ...prev, [implicitSurfaceId]: getDefaultImplicitDomain(implicitSurfaceId) };
    });
  }, [implicitSurfaceId]);

  useEffect(() => {
    setParamDomains((prev) => {
      if (prev[paramSurfaceId]) return prev;
      return { ...prev, [paramSurfaceId]: getParamDomainPreviewBounds(paramSurfaceId) };
    });
  }, [paramSurfaceId]);

  useEffect(() => {
    if (!compareEnabled) return;
    if (isMeshLikeViewer) {
      setCompareEnabled(false);
      return;
    }
    if (surfaceViewerKind === "graph" && !isGraphSurface(compareSurfaceId)) {
      setCompareSurfaceId("graph_saddle");
    }
    if (surfaceViewerKind === "implicit" && isGraphSurface(compareSurfaceId)) {
      setCompareSurfaceId("sphere");
    }
  }, [compareEnabled, isMeshLikeViewer, surfaceViewerKind, compareSurfaceId]);

  useEffect(() => {
    if (compareEnabled) return;
    if (compareIgnoreWorkbookOverlays) {
      setCompareIgnoreWorkbookOverlays(false);
    }
    if (compareUseSnapshotA) setCompareUseSnapshotA(false);
    if (compareUseSnapshotB) setCompareUseSnapshotB(false);
    if (compareDiffHeatmapEnabled) setCompareDiffHeatmapEnabled(false);
  }, [
    compareEnabled,
    compareIgnoreWorkbookOverlays,
    compareUseSnapshotA,
    compareUseSnapshotB,
    compareDiffHeatmapEnabled,
  ]);

  useEffect(() => {
    saveArray("mathapp.domainPresets.graph.v1", graphDomainPresets);
  }, [graphDomainPresets]);

  useEffect(() => {
    saveArray("mathapp.domainPresets.param.v1", paramDomainPresets);
  }, [paramDomainPresets]);

  useEffect(() => {
    saveArray("mathapp.domainPresets.implicit.v1", implicitDomainPresets);
  }, [implicitDomainPresets]);

  useEffect(() => {
    saveRecord("mathapp.domainState.graph.v1", graphDomains);
  }, [graphDomains]);

  useEffect(() => {
    saveRecord("mathapp.domainState.param.v1", paramDomains);
  }, [paramDomains]);

  useEffect(() => {
    saveRecord("mathapp.domainState.implicit.v1", implicitDomains);
  }, [implicitDomains]);

  useEffect(() => {
    try {
      localStorage.setItem("mathapp.implicitBake.bounds.v1", JSON.stringify(implicitBakeBounds));
    } catch {
      // ignore
    }
  }, [implicitBakeBounds]);

  useEffect(() => {
    try {
      localStorage.setItem("mathapp.implicitBake.res.v1", JSON.stringify(implicitBakeResolution));
    } catch {
      // ignore
    }
  }, [implicitBakeResolution]);

  // plane refs for 2D modes
  const zRef = useRef<PlanePlotHandle | null>(null);
  const wRef = useRef<PlanePlotHandle | null>(null);
  const [wPlaneDomainColor, setWPlaneDomainColor] = useState(true);
  const [wPlaneShowRings, setWPlaneShowRings] = useState(false);
  const [wPlaneShowRays, setWPlaneShowRays] = useState(false);

  // resizable panels
  const [leftWidth, setLeftWidth] = useState(260);
  const minLeft = 200;
  const maxLeft = 480;

  const [rightWidth, setRightWidth] = useState(260);
  const minRight = 200;
  const maxRight = 480;

  const startDragLeft = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      setLeftWidth(Math.min(maxLeft, Math.max(minLeft, startWidth + delta)));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startDragRight = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX; // drag left to expand right panel
      setRightWidth(Math.min(maxRight, Math.max(minRight, startWidth + delta)));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // root style
  const rootStyle: React.CSSProperties =
    mode === "surfaces" ? { ...styles.appRoot, maxWidth: "none", width: "100%", margin: 0 } : styles.appRoot;


const mobiusEffectiveParams = useMemo(() => {
  if (mode !== "mobius") return mobiusParams;

  if (mobiusSubTab !== "decompose") return mobiusParams;

  // In decompose tab: render intermediate composition steps
  const stepped = mobiusParamsAtDecomposeStep(mobiusParams, mobiusDecompStep);
  return stepped ?? mobiusParams; // if affine / invalid, fall back
}, [mode, mobiusParams, mobiusSubTab, mobiusDecompStep]);

    
  useEffect(() => {
    console.log(
      "[App] color",
      { colorMode, colorPalette, surfaceViewerKind, activeEqSurfaceId, paramSurfaceId }
    );
  }, [colorMode, colorPalette, surfaceViewerKind, activeEqSurfaceId, paramSurfaceId]);

  useEffect(() => {
    if (
      surfaceViewerKind !== "param" &&
      surfaceViewerKind !== "weierstrass" &&
      PARAM_CURVATURE_COLOR_MODES.includes(colorMode)
    ) {
      setColorMode("height");
    }
    if (colorMode === "phase" && !(isMeshLikeViewer && isComplexMapSurfaceLabel(surfaceMeshData?.label))) {
      setColorMode("height");
    }
  }, [surfaceViewerKind, colorMode, surfaceMeshData?.label]);

  /* ---------- central drawing effect (2D modes) ---------- */
  useEffect(() => {
    if (!zRef.current || !wRef.current) return;

    switch (mode) {
case "mobius":
  renderMobius(zRef.current, wRef.current, mobiusEffectiveParams, samples);
  break;


      case "chebyshev":
        renderChebyshev(zRef.current, wRef.current, chebN, samples);
        break;

      case "transform":
        renderTransform(zRef.current, wRef.current, { kind: primKind, value: primValue }, samples);
        break;

      case "maps":
        renderStandardMap(zRef.current, wRef.current, mapId, samples);
        break;

      case "surfaces":
        zRef.current.clear();
        wRef.current.clear();
        zRef.current.drawGrid(0.5);
        wRef.current.drawGrid(0.5);
        break;
    }
  }, [mode, mobiusParams, chebN, primKind, primValue, mapId, samples, wPlaneDomainColor, wPlaneShowRings, wPlaneShowRays]);

  /* ---------- probe reset rules ---------- */
  useEffect(() => {
    // changing surface/mode makes previous probe misleading
    setProbeInfo(null);
    setProbeCurv(null);
    setParamProbeCurv(null);
    setGraphProbeXY(null);
    setParamProbeUV(null);
    setImplicitProbeXYZ(null);
    setComplexMapProbe(null);
  }, [activeEqSurfaceId, paramSurfaceId, surfaceViewerKind, colorMode]);

  useEffect(() => {
    if (!probeEnabled) {
      setProbeInfo(null);
      setProbeCurv(null);
      setParamProbeCurv(null);
      setComplexMapProbe(null);
    }
  }, [probeEnabled]);

  const handleProbe = useCallback(
    (info: ProbeInfo) => {
      setProbeInfo(info);
      setProbeStamp((t) => t + 1);

      if (surfaceViewerKind === "graph" && isGraphSurface(activeEqSurfaceId)) {
        const curv = computeGraphInvariantsFromProbe(activeEqSurfaceId, graphExpr, info.point);
        setProbeCurv(curv);
      } else {
        setProbeCurv(null);
      }

      if (surfaceViewerKind === "complex" && info.uv) {
        const next = buildComplexMapProbe(info.uv.u, info.uv.v, "surface");
        if (next) setComplexMapProbe(next);
      }
    },
    [surfaceViewerKind, activeEqSurfaceId, graphExpr, buildComplexMapProbe]
  );

  const buildPointOutput = useCallback((info: ProbeInfo) => {
    const normal = info.normal;
    const basis = buildTangentBasis(normal);
    let meshKey: string | undefined = undefined;
    let vertexIndex: number | undefined = undefined;
    if (surfaceViewerKind === "implicit" && activeCgalMesh?.positions?.length) {
      let bestIdx = -1;
      let bestDist = Infinity;
      const pos = activeCgalMesh.positions;
      for (let i = 0; i + 2 < pos.length; i += 3) {
        const dx = pos[i] - info.point.x;
        const dy = pos[i + 1] - info.point.y;
        const dz = pos[i + 2] - info.point.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestDist) {
          bestDist = d2;
          bestIdx = i / 3;
        }
      }
      if (bestIdx >= 0) {
        meshKey = "cgal";
        vertexIndex = bestIdx;
      }
    } else if (surfaceSampleSet?.samples?.length) {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < surfaceSampleSet.samples.length; i++) {
        const sample = surfaceSampleSet.samples[i];
        const dx = sample.position.x - info.point.x;
        const dy = sample.position.y - info.point.y;
        const dz = sample.position.z - info.point.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestDist) {
          bestDist = d2;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        const sample = surfaceSampleSet.samples[bestIdx];
        meshKey = sample.meshKey ?? surfaceSampleSet.meshData?.[0]?.key;
        vertexIndex = sample.vertexIndex ?? bestIdx;
      }
    }
    return {
      point: { ...info.point },
      normal: { ...normal },
      uv: info.uv ? { ...info.uv } : undefined,
      xy: info.xy ? { ...info.xy } : undefined,
      tangentU: { ...basis.t1 },
      tangentV: { ...basis.t2 },
      meshKey,
      vertexIndex,
    };
  }, [activeCgalMesh, surfaceSampleSet, surfaceViewerKind]);

  const buildHeatEndpointFromPoint = useCallback(
    (pointOut: { point: { x: number; y: number; z: number }; uv?: { u: number; v: number }; meshKey?: string; vertexIndex?: number }) => {
      const vertexIndex = pointOut.vertexIndex;
      if (vertexIndex == null) return null;
      let positions: ArrayLike<number> | null = null;
      let indices: ArrayLike<number> | null = null;
      let meshKey = pointOut.meshKey ?? null;
      if (surfaceViewerKind === "implicit" && activeCgalMesh?.positions?.length && activeCgalMesh.indices?.length) {
        positions = activeCgalMesh.positions;
        indices = activeCgalMesh.indices;
        meshKey = "cgal";
      } else if (surfaceSampleSet?.meshData?.length) {
        const mesh =
          (meshKey && surfaceSampleSet.meshData.find((m) => m.key === meshKey)) ??
          surfaceSampleSet.meshData[0];
        if (mesh) {
          positions = mesh.positions;
          indices = mesh.indices ?? null;
          meshKey = mesh.key;
        }
      }
      if (!positions) return null;
      const triCount = indices ? Math.floor(indices.length / 3) : Math.floor(positions.length / 9);
      let faceIndex = -1;
      let a = 0;
      let b = 0;
      let c = 0;
      if (indices) {
        for (let t = 0; t < triCount; t++) {
          const base = t * 3;
          const ia = Number(indices[base]);
          const ib = Number(indices[base + 1]);
          const ic = Number(indices[base + 2]);
          if (ia === vertexIndex || ib === vertexIndex || ic === vertexIndex) {
            faceIndex = t;
            a = ia;
            b = ib;
            c = ic;
            break;
          }
        }
      } else {
        const t = Math.floor(vertexIndex / 3);
        if (t >= 0 && t < triCount) {
          faceIndex = t;
          a = t * 3;
          b = t * 3 + 1;
          c = t * 3 + 2;
        }
      }
      if (faceIndex < 0) return null;
      const ax = positions[a * 3];
      const ay = positions[a * 3 + 1];
      const az = positions[a * 3 + 2];
      const bx = positions[b * 3];
      const by = positions[b * 3 + 1];
      const bz = positions[b * 3 + 2];
      const cx = positions[c * 3];
      const cy = positions[c * 3 + 1];
      const cz = positions[c * 3 + 2];
      const bary = new THREE.Vector3();
      new THREE.Triangle(
        new THREE.Vector3(ax, ay, az),
        new THREE.Vector3(bx, by, bz),
        new THREE.Vector3(cx, cy, cz)
      ).getBarycoord(new THREE.Vector3(pointOut.point.x, pointOut.point.y, pointOut.point.z), bary);
      if (!Number.isFinite(bary.x) || !Number.isFinite(bary.y) || !Number.isFinite(bary.z)) return null;
      return {
        meshKey: meshKey ?? "mesh",
        faceIndex,
        bary: [bary.x, bary.y, bary.z] as [number, number, number],
        point: { ...pointOut.point },
        uv: pointOut.uv ? { ...pointOut.uv } : undefined,
      };
    },
    [activeCgalMesh, surfaceSampleSet, surfaceViewerKind]
  );

  const buildPathEndpointFromPoint = useCallback(
    (pointOut: { meshKey?: string; vertexIndex?: number }) => {
      if (!pointOut.meshKey || pointOut.vertexIndex == null) return null;
      return { meshKey: pointOut.meshKey, vertexIndex: pointOut.vertexIndex };
    },
    []
  );

  const collectInteractionPointOutputs = useCallback(
    (blockId: string) => {
      const points: WorkbookPointOutput[] = [];
      for (const entry of workbookGraph.orderedBlocks) {
        if (entry.block.id === blockId) break;
        const block = entry.block;
        if (block.type !== "interaction") continue;
        if (block.interaction?.kind !== "pick_point") continue;
        const point = block.interaction?.point;
        if (point) points.push(point);
      }
      return points;
    },
    [workbookGraph]
  );

  const resolveLatestCurveOutput = useCallback(
    (blockId: string) => {
      let latest: WorkbookCurveOutput | null = null;
      for (const entry of workbookGraph.orderedBlocks) {
        if (entry.block.id === blockId) break;
        const block = entry.block;
        if (block.type !== "interaction") continue;
        if (block.interaction?.kind !== "draw_curve") continue;
        const curve = block.interaction?.curve;
        if (curve?.points?.length) latest = curve;
      }
      return latest;
    },
    [workbookGraph]
  );

  const resolveLatestDirectionOutput = useCallback(
    (blockId: string) => {
      let latest: WorkbookDirectionOutput | null = null;
      for (const entry of workbookGraph.orderedBlocks) {
        if (entry.block.id === blockId) break;
        const block = entry.block;
        if (block.type !== "interaction") continue;
        if (block.interaction?.kind !== "pick_direction") continue;
        const direction = block.interaction?.direction;
        if (direction) latest = direction;
      }
      return latest;
    },
    [workbookGraph]
  );

  const resolveLatestMaskOutput = useCallback(
    (blockId: string) => {
      let latest: WorkbookMaskOutput | null = null;
      for (const entry of workbookGraph.orderedBlocks) {
        if (entry.block.id === blockId) break;
        const block = entry.block;
        if (block.type !== "interaction") continue;
        if (block.interaction?.kind !== "select_region") continue;
        const mask = block.interaction?.mask;
        if (mask?.indices?.length) latest = mask;
      }
      return latest;
    },
    [workbookGraph]
  );

  const buildSelectionMaskFromIndices = useCallback(
    (indices: number[]) => {
      const samples = surfaceSampleSet?.samples;
      if (!samples?.length) return null;
      const selected = new Uint8Array(samples.length);
      let count = 0;
      for (const idx of indices) {
        if (idx < 0 || idx >= selected.length) continue;
        if (!selected[idx]) {
          selected[idx] = 1;
          count += 1;
        }
      }
      return { selected, count };
    },
    [surfaceSampleSet]
  );

  const resolveInteractionPointPair = useCallback(
    (blockId: string) => {
      const points = collectInteractionPointOutputs(blockId);
      if (points.length < 2) return null;
      return {
        start: points[points.length - 2],
        end: points[points.length - 1],
      };
    },
    [collectInteractionPointOutputs]
  );

  const buildDirectionOutput = useCallback(
    (pointOut: { point: Vec3; normal: Vec3; tangentU: Vec3; tangentV: Vec3 }, angleDeg: number) => {
      const angle = (angleDeg * Math.PI) / 180;
      const dir = vNormalize(
        vAdd(vScale(pointOut.tangentU, Math.cos(angle)), vScale(pointOut.tangentV, Math.sin(angle)))
      );
      return {
        origin: { ...pointOut.point },
        direction: { ...dir },
        tangentU: { ...pointOut.tangentU },
        tangentV: { ...pointOut.tangentV },
      };
    },
    []
  );

  const restoreInteractionState = useCallback(() => {
    const prev = interactionPrevRef.current;
    if (!prev) return;
    setProbeEnabled(prev.probeEnabled);
    setSelectRegionEnabled(prev.selectRegionEnabled);
    setInspectEnabled(prev.inspectEnabled);
    setGeodesicHeatEnabled(prev.geodesicHeatEnabled);
    setGeodesicPathEnabled(prev.geodesicPathEnabled);
    setGeodesicDiskPickMode(prev.geodesicDiskPickMode);
    interactionPrevRef.current = null;
  }, []);

  const handleParamCurvature = useCallback((data: PrincipalCurvatureScalars | null) => {
    setParamProbeCurv(data);
  }, []);

  const handleChangeGraphDomain = useCallback(
    (d: GraphDomain) => {
      setGraphDomains((prev) => ({
        ...prev,
        [graphSurfaceId]: normalizeGraphDomain(d, getDefaultGraphSpan(graphSurfaceId)),
      }));
    },
    [graphSurfaceId]
  );

  const handleChangeParamDomain = useCallback(
    (d: ParamDomain) => {
      if (surfaceViewerKind === "weierstrass") {
        setWeierstrassDomain(normalizeParamDomain(d, WEIERSTRASS_DEFAULTS.domain));
        return;
      }
      setParamDomains((prev) => ({
        ...prev,
        [paramSurfaceId]: normalizeParamDomain(d, getParamDomainPreviewBounds(paramSurfaceId)),
      }));
    },
    [paramSurfaceId, surfaceViewerKind]
  );

  const handleChangeImplicitDomain = useCallback(
    (d: ImplicitDomain) => {
      const safe = normalizeImplicitDomain(d, getDefaultImplicitDomain(implicitSurfaceId));
      setImplicitDomains((prev) => ({
        ...prev,
        [implicitSurfaceId]: safe,
      }));
    },
    [implicitSurfaceId]
  );

  const handleChangeImplicitBakeBounds = useCallback((d: ImplicitBakeBounds) => {
    const safe = normalizeImplicitBakeBounds(d, DEFAULT_IMPLICIT_BAKE_BOUNDS);
    setImplicitBakeBounds(safe);
  }, []);

  const handleChangeWeierstrassDomain = useCallback((d: ParamDomain) => {
    setWeierstrassDomain(normalizeParamDomain(d, WEIERSTRASS_DEFAULTS.domain));
  }, []);

  const saveGraphDomainPreset = useCallback(
    (label: string) => {
      const l = label.trim() || autoLabelGraphDomain(activeGraphDomain.xSpan, activeGraphDomain.ySpan);
      const preset: GraphDomainPreset = {
        id: makeId(),
        surfaceId: graphSurfaceId,
        label: l,
        xSpan: activeGraphDomain.xSpan,
        ySpan: activeGraphDomain.ySpan,
        createdAt: Date.now(),
      };
      setGraphDomainPresets((prev) => [preset, ...prev]);
    },
    [activeGraphDomain.xSpan, activeGraphDomain.ySpan, graphSurfaceId]
  );

  const saveImplicitDomainPreset = useCallback(
    (label: string) => {
      const l = label.trim() || autoLabelImplicitDomain(activeImplicitDomain.xSpan, activeImplicitDomain.ySpan);
      const preset: ImplicitDomainPreset = {
        id: makeId(),
        surfaceId: implicitSurfaceId,
        label: l,
        xSpan: activeImplicitDomain.xSpan,
        ySpan: activeImplicitDomain.ySpan,
        createdAt: Date.now(),
      };
      setImplicitDomainPresets((prev) => [preset, ...prev]);
    },
    [activeImplicitDomain.xSpan, activeImplicitDomain.ySpan, implicitSurfaceId]
  );

  const saveParamDomainPreset = useCallback(
    (label: string) => {
      const l = label.trim() || autoLabelParamDomain(activeParamDomain);
      const preset: ParamDomainPreset = {
        id: makeId(),
        surfaceId: paramSurfaceId,
        label: l,
        uMin: activeParamDomain.uMin,
        uMax: activeParamDomain.uMax,
        vMin: activeParamDomain.vMin,
        vMax: activeParamDomain.vMax,
        createdAt: Date.now(),
      };
      setParamDomainPresets((prev) => [preset, ...prev]);
    },
    [activeParamDomain, paramSurfaceId]
  );

  const applyGraphDomainPreset = useCallback((id: string) => {
    const preset = graphDomainPresets.find((p) => p.id === id);
    if (!preset) return;
    setGraphDomains((prev) => ({
      ...prev,
      [preset.surfaceId]: normalizeGraphDomain(
        { xSpan: preset.xSpan, ySpan: preset.ySpan },
        getDefaultGraphSpan(preset.surfaceId)
      ),
    }));
  }, [graphDomainPresets]);

  const applyImplicitDomainPreset = useCallback((id: string) => {
    const preset = implicitDomainPresets.find((p) => p.id === id);
    if (!preset) return;
    setImplicitDomains((prev) => ({
      ...prev,
      [preset.surfaceId]: normalizeImplicitDomain(
        { xSpan: preset.xSpan, ySpan: preset.ySpan },
        getDefaultImplicitDomain(preset.surfaceId)
      ),
    }));
  }, [implicitDomainPresets]);

  const applyParamDomainPreset = useCallback((id: string) => {
    const preset = paramDomainPresets.find((p) => p.id === id);
    if (!preset) return;
    setParamDomains((prev) => ({
      ...prev,
      [preset.surfaceId]: normalizeParamDomain(
        { uMin: preset.uMin, uMax: preset.uMax, vMin: preset.vMin, vMax: preset.vMax },
        getParamDomainPreviewBounds(preset.surfaceId)
      ),
    }));
  }, [paramDomainPresets]);

  const removeGraphDomainPreset = useCallback((id: string) => {
    setGraphDomainPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const removeImplicitDomainPreset = useCallback((id: string) => {
    setImplicitDomainPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const removeParamDomainPreset = useCallback((id: string) => {
    setParamDomainPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handlePickParamSurface = (id: ParamSurfaceId) => {
    setDatasetKind("surface");
    setSurfaceViewerKind("param");
    setParamSurfaceId(id);
    if (compareEnabled) setCompareUseSnapshotA(false);
  };

  const handlePickEqSurface = (id: SurfaceId) => {
    setDatasetKind("surface");
    if (isGraphSurface(id)) {
      setSurfaceViewerKind("graph");
      setGraphSurfaceId(id);
    } else {
      setSurfaceViewerKind("implicit");
      setImplicitSurfaceId(id);
    }
    if (compareEnabled) setCompareUseSnapshotA(false);
  };

  const handleChangeViewerKind = useCallback((kind: SurfaceViewerKind) => {
    setSurfaceViewerKind(kind);
    setDatasetKind(kind === "mesh" || kind === "complex" ? "mesh" : "surface");
    if (kind === "weierstrass" || kind === "mesh" || kind === "complex") {
      setCompareEnabled(false);
      setCameraSync(null);
    }
  }, []);

  const applyDefaultPorts = useCallback((block: WorkbookBlock): WorkbookBlock => {
    const ports = resolveBlockPorts(block);
    return { ...block, inputs: ports.inputs, outputs: ports.outputs };
  }, []);

  const makeWorkbookBlock = (type: WorkbookBlockType): WorkbookBlock => {
    const base: WorkbookBlock = { id: makeId(), type, title: `${type[0].toUpperCase()}${type.slice(1)} block` };
    if (type === "text") return applyDefaultPorts({ ...base, title: "Text", text: "" });
    if (type === "formula") return applyDefaultPorts({ ...base, title: "Formula", formula: "" });
    if (type === "visualize")
      return applyDefaultPorts({
        ...base,
        title: "View",
        visualize: { live: true, snapshotA: null, snapshotB: null },
      });
    if (type === "compute")
      return applyDefaultPorts({
        ...base,
        title: "Compute",
        compute: { status: "idle", cache: {} },
      });
    if (type === "interaction") {
      return applyDefaultPorts({
        ...base,
        title: "Interaction",
        interaction: { kind: "pick_point", status: "idle" },
      });
    }
    return applyDefaultPorts({ ...base, title: "Assert", assert: { expected: "", status: "pending" } });
  };

  const handleCreateWorkbook = useCallback(() => {
    if (IS_REPLAY_MODE) return;
    const wb = createDefaultWorkbook(makeId);
    setWorkbooks((prev) => [wb, ...prev]);
    setActiveWorkbookId(wb.id);
    setActiveStageId("define");
  }, []);

  const handleCreateWorkbookFromTemplate = useCallback((templateId: string) => {
    if (IS_REPLAY_MODE) return;
    const wb = createWorkbookFromTemplate(templateId, makeId);
    if (!wb) return;
    setWorkbooks((prev) => [wb, ...prev]);
    setActiveWorkbookId(wb.id);
    setActiveStageId("define");
  }, []);

  const handleCreateWorkbooksFromPack = useCallback((packId: string) => {
    if (IS_REPLAY_MODE) return;
    const pack = WORKBOOK_PROBLEM_PACKS.find((p) => p.id === packId);
    if (!pack) return;
    const created: Workbook[] = [];
    for (const templateId of pack.templateIds) {
      const wb = createWorkbookFromTemplate(templateId, makeId);
      if (wb) created.push(wb);
    }
    if (!created.length) return;
    setWorkbooks((prev) => [...created, ...prev]);
    setActiveWorkbookId(created[0].id);
    setActiveStageId("define");
  }, []);

  const handleDuplicateWorkbook = useCallback(
    (id: string) => {
      if (IS_REPLAY_MODE) return;
      const base = workbooks.find((w) => w.id === id);
      if (!base) return;
      const copy: Workbook = {
        ...base,
        id: makeId(),
        title: `${base.title} copy`,
        updatedAt: Date.now(),
        stages: base.stages.map((s) => ({
          ...s,
          blocks: s.blocks.map((b) => ({ ...b, id: makeId() })),
        })),
      };
      setWorkbooks((prev) => [copy, ...prev]);
      setActiveWorkbookId(copy.id);
    },
    [workbooks]
  );

  const handleDeleteWorkbook = useCallback(
    (id: string) => {
      if (IS_REPLAY_MODE) return;
      setWorkbooks((prev) => {
        const next = prev.filter((w) => w.id !== id);
        if (activeWorkbookId === id) {
          setActiveWorkbookId(next[0]?.id ?? null);
        }
        return next;
      });
    },
    [activeWorkbookId, compareBlockId]
  );

  const handleRenameWorkbook = useCallback((id: string, title: string) => {
    if (IS_REPLAY_MODE) return;
    setWorkbooks((prev) =>
      prev.map((w) => (w.id === id ? { ...w, title, updatedAt: Date.now() } : w))
    );
  }, []);

  const handleAddWorkbookBlock = useCallback(
    (stageId: WorkbookStageId, type: WorkbookBlockType) => {
      if (IS_REPLAY_MODE) return;
      if (!activeWorkbookId) return;
      const block = makeWorkbookBlock(type);
      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId ? { ...s, blocks: [...s.blocks, block] } : s
                ),
              }
            : w
        )
      );
    },
    [activeWorkbookId]
  );

  const handleUpdateWorkbookBlock = useCallback(
    (stageId: WorkbookStageId, blockId: string, patch: Partial<WorkbookBlock>) => {
      if (IS_REPLAY_MODE) return;
      if (!activeWorkbookId) return;
      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) => {
                          if (b.id !== blockId) return b;
                          const next: WorkbookBlock = { ...b, ...patch };
                          if (patch.compute) {
                            next.compute = { ...(b.compute ?? {}), ...patch.compute };
                          }
                          if (patch.visualize) {
                            next.visualize = { ...(b.visualize ?? { live: true }), ...patch.visualize };
                          }
                          if (patch.assert) {
                            next.assert = { ...(b.assert ?? { expected: "", status: "pending" }), ...patch.assert };
                          }
                          if (patch.inputs) next.inputs = patch.inputs;
                          if (patch.outputs) next.outputs = patch.outputs;
                          return applyDefaultPorts(next);
                        }),
                      }
                    : s
                ),
              }
            : w
        )
      );
    },
    [activeWorkbookId, applyDefaultPorts]
  );

  const handleRemoveWorkbookBlock = useCallback(
    (stageId: WorkbookStageId, blockId: string) => {
      if (IS_REPLAY_MODE) return;
      if (!activeWorkbookId) return;
      if (compareBlockId === blockId) setCompareBlockId(null);
      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId ? { ...s, blocks: s.blocks.filter((b) => b.id !== blockId) } : s
                ),
              }
            : w
        )
      );
    },
    [activeWorkbookId]
  );

  const handleMoveWorkbookBlock = useCallback(
    (stageId: WorkbookStageId, blockId: string, dir: -1 | 1) => {
      if (IS_REPLAY_MODE) return;
      if (!activeWorkbookId) return;
      setWorkbooks((prev) =>
        prev.map((w) => {
          if (w.id !== activeWorkbookId) return w;
          const stages = w.stages.map((s) => {
            if (s.id !== stageId) return s;
            const idx = s.blocks.findIndex((b) => b.id === blockId);
            if (idx < 0) return s;
            const nextIdx = idx + dir;
            if (nextIdx < 0 || nextIdx >= s.blocks.length) return s;
            const nextBlocks = [...s.blocks];
            const [moved] = nextBlocks.splice(idx, 1);
            nextBlocks.splice(nextIdx, 0, moved);
            return { ...s, blocks: nextBlocks };
          });
          return { ...w, stages, updatedAt: Date.now() };
        })
      );
    },
    [activeWorkbookId]
  );

  const paramScrubTimersRef = useRef<Map<string, number>>(new Map());

  const handleAddBlockParam = useCallback(
    (stageId: WorkbookStageId, blockId: string, defId: string) => {
      if (IS_REPLAY_MODE) return;
      const def = paramDefById.get(defId);
      if (!def || !activeWorkbookId) return;
      const initial = readParamValue(defId) ?? def.defaultValue ?? (def.kind === "toggle" ? false : 0);
      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) => {
                          if (b.id !== blockId) return b;
                          const params = b.params ?? { defs: [], values: {}, scrub: false, keyframes: [] };
                          if (params.defs.some((p) => p.id === defId)) return b;
                          return {
                            ...b,
                            params: {
                              ...params,
                              defs: [...params.defs, def],
                              values: { ...params.values, [defId]: initial },
                            },
                          };
                        }),
                      }
                    : s
                ),
              }
            : w
        )
      );
    },
    [activeWorkbookId, paramDefById, readParamValue]
  );

  const handleRemoveBlockParam = useCallback(
    (stageId: WorkbookStageId, blockId: string, paramId: string) => {
      if (IS_REPLAY_MODE) return;
      if (!activeWorkbookId) return;
      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) => {
                          if (b.id !== blockId) return b;
                          const params = b.params;
                          if (!params) return b;
                          const nextDefs = params.defs.filter((p) => p.id !== paramId);
                          const nextValues = { ...params.values };
                          delete nextValues[paramId];
                          return {
                            ...b,
                            params: {
                              ...params,
                              defs: nextDefs,
                              values: nextValues,
                            },
                          };
                        }),
                      }
                    : s
                ),
              }
            : w
        )
      );
    },
    [activeWorkbookId]
  );

  const handleUpdateBlockParam = useCallback(
    (
      stageId: WorkbookStageId,
      blockId: string,
      paramId: string,
      rawValue: WorkbookParamValue,
      scrub: boolean
    ) => {
      if (IS_REPLAY_MODE) return;
      if (!activeWorkbookId) return;
      const def = paramDefById.get(paramId);
      let value = rawValue;
      if (def?.kind === "number") {
        const num = typeof rawValue === "number" ? rawValue : Number(rawValue);
        if (Number.isFinite(num)) {
          const min = def.min ?? num;
          const max = def.max ?? num;
          value = Math.min(max, Math.max(min, num));
        }
      }
      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) => {
                          if (b.id !== blockId) return b;
                          const params = b.params ?? { defs: [], values: {}, scrub: false, keyframes: [] };
                          return {
                            ...b,
                            params: {
                              ...params,
                              values: { ...params.values, [paramId]: value },
                            },
                          };
                        }),
                      }
                    : s
                ),
              }
            : w
        )
      );

      if (scrub) {
        const key = `${blockId}:${paramId}`;
        const existing = paramScrubTimersRef.current.get(key);
        if (existing) window.clearTimeout(existing);
        const timeout = window.setTimeout(() => {
          applyParamValue(paramId, value);
          paramScrubTimersRef.current.delete(key);
        }, 60);
        paramScrubTimersRef.current.set(key, timeout);
      }
    },
    [activeWorkbookId, applyParamValue, paramDefById]
  );

  const handleToggleParamScrub = useCallback(
    (stageId: WorkbookStageId, blockId: string, scrub: boolean) => {
      if (IS_REPLAY_MODE) return;
      if (!activeWorkbookId) return;
      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) => {
                          if (b.id !== blockId) return b;
                          const params = b.params ?? { defs: [], values: {}, scrub: false, keyframes: [] };
                          return { ...b, params: { ...params, scrub } };
                        }),
                      }
                    : s
                ),
              }
            : w
        )
      );
    },
    [activeWorkbookId]
  );

  const handleApplyParams = useCallback(
    (_stageId: WorkbookStageId, blockId: string) => {
      const meta = workbookGraph.blockMetaById.get(blockId);
      const params = meta?.block.params;
      if (!params) return;
      Object.entries(params.values).forEach(([paramId, value]) => {
        applyParamValue(paramId, value);
      });
    },
    [applyParamValue, workbookGraph]
  );

  const handleAddKeyframe = useCallback(
    (stageId: WorkbookStageId, blockId: string) => {
      if (IS_REPLAY_MODE) return;
      if (!activeWorkbookId) return;
      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) => {
                          if (b.id !== blockId) return b;
                          const params = b.params ?? { defs: [], values: {}, scrub: false, keyframes: [] };
                          const nextKeyframes = [...(params.keyframes ?? [])];
                          nextKeyframes.push({
                            id: makeId(),
                            label: `Keyframe ${nextKeyframes.length + 1}`,
                            values: { ...params.values },
                            createdAt: Date.now(),
                          });
                          return { ...b, params: { ...params, keyframes: nextKeyframes } };
                        }),
                      }
                    : s
                ),
              }
            : w
        )
      );
    },
    [activeWorkbookId]
  );

  const handleRemoveKeyframe = useCallback(
    (stageId: WorkbookStageId, blockId: string, keyframeId: string) => {
      if (IS_REPLAY_MODE) return;
      if (!activeWorkbookId) return;
      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) => {
                          if (b.id !== blockId) return b;
                          const params = b.params;
                          if (!params?.keyframes?.length) return b;
                          return {
                            ...b,
                            params: {
                              ...params,
                              keyframes: params.keyframes.filter((kf) => kf.id !== keyframeId),
                            },
                          };
                        }),
                      }
                    : s
                ),
              }
            : w
        )
      );
    },
    [activeWorkbookId]
  );

  const handleUpdateInteraction = useCallback(
    (stageId: WorkbookStageId, blockId: string, patch: Partial<NonNullable<WorkbookBlock["interaction"]>>) => {
      if (IS_REPLAY_MODE) return;
      if (!activeWorkbookId) return;
      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) =>
                          b.id === blockId
                            ? { ...b, interaction: { ...(b.interaction ?? { kind: "pick_point" }), ...patch } }
                            : b
                        ),
                      }
                    : s
                ),
              }
            : w
        )
      );
    },
    [activeWorkbookId]
  );

  const handleUpdateInteractionDirection = useCallback(
    (stageId: WorkbookStageId, blockId: string, angle: number) => {
      if (IS_REPLAY_MODE) return;
      const meta = workbookGraph.blockMetaById.get(blockId);
      const point = meta?.block.interaction?.point ?? null;
      const safeAngle = Number.isFinite(angle) ? Math.max(0, Math.min(360, angle)) : 0;
      if (!point) {
        handleUpdateInteraction(stageId, blockId, { directionAngle: safeAngle });
        return;
      }
      const basis = buildTangentBasis(point.normal);
      const tangentU = point.tangentU ?? basis.t1;
      const tangentV = point.tangentV ?? basis.t2;
      const direction = buildDirectionOutput(
        { point: point.point, normal: point.normal, tangentU, tangentV },
        safeAngle
      );
      handleUpdateInteraction(stageId, blockId, {
        directionAngle: safeAngle,
        point: { ...point, tangentU, tangentV },
        direction,
      });
    },
    [buildDirectionOutput, handleUpdateInteraction, workbookGraph]
  );

  const handleArmInteraction = useCallback(
    (stageId: WorkbookStageId, blockId: string) => {
      if (IS_REPLAY_MODE) return;
      if (!activeWorkbookId) return;
      const meta = workbookGraph.blockMetaById.get(blockId);
      const kind = meta?.block.interaction?.kind ?? "pick_point";
      interactionPrevRef.current = {
        probeEnabled,
        selectRegionEnabled,
        inspectEnabled,
        geodesicHeatEnabled,
        geodesicPathEnabled,
        geodesicDiskPickMode,
      };
      if (geodesicHeatEnabled) setGeodesicHeatEnabled(false);
      if (geodesicPathEnabled) setGeodesicPathEnabled(false);
      if (geodesicDiskPickMode) setGeodesicDiskPickMode(false);
      if (inspectEnabled) setInspectEnabled(false);
      if (kind === "select_region") {
        setSelectRegionEnabled(true);
        setProbeEnabled(false);
      } else {
        setSelectRegionEnabled(false);
        setProbeEnabled(true);
      }
      setActiveInteraction({ stageId, blockId, kind });
      handleUpdateInteraction(stageId, blockId, { status: "armed", summary: "Waiting for pick..." });
    },
    [
      activeWorkbookId,
      handleUpdateInteraction,
      inspectEnabled,
      probeEnabled,
      selectRegionEnabled,
      geodesicHeatEnabled,
      geodesicPathEnabled,
      geodesicDiskPickMode,
      workbookGraph,
    ]
  );

  const handleFinishInteraction = useCallback(
    (stageId: WorkbookStageId, blockId: string) => {
      if (IS_REPLAY_MODE) return;
      const meta = workbookGraph.blockMetaById.get(blockId);
      if (!meta?.block.interaction) return;
      handleUpdateInteraction(stageId, blockId, { status: "captured", summary: "Curve captured." });
      setActiveInteraction((prev) => (prev?.blockId === blockId ? null : prev));
      restoreInteractionState();
    },
    [handleUpdateInteraction, restoreInteractionState, workbookGraph]
  );

  const handleClearInteraction = useCallback(
    (stageId: WorkbookStageId, blockId: string) => {
      if (IS_REPLAY_MODE) return;
      handleUpdateInteraction(stageId, blockId, {
        status: "idle",
        summary: "",
        point: null,
        curve: null,
        mask: null,
        direction: null,
        points: [],
        directionAngle: 0,
      });
      setActiveInteraction((prev) => (prev?.blockId === blockId ? null : prev));
      restoreInteractionState();
    },
    [handleUpdateInteraction, restoreInteractionState]
  );

  useEffect(() => {
    if (IS_REPLAY_MODE) return;
    if (!activeInteraction || !probeInfo) return;
    const meta = workbookGraph.blockMetaById.get(activeInteraction.blockId);
    if (!meta) return;
    const { stageId, blockId, kind } = activeInteraction;
    if (kind === "pick_point") {
      const pointOut = buildPointOutput(probeInfo);
      handleUpdateInteraction(stageId, blockId, {
        status: "captured",
        summary: "Point captured.",
        point: pointOut,
      });
      setActiveInteraction(null);
      restoreInteractionState();
      return;
    }
    if (kind === "pick_direction") {
      const pointOut = buildPointOutput(probeInfo);
      const angle = meta.block.interaction?.directionAngle ?? 0;
      const direction = buildDirectionOutput(
        {
          point: pointOut.point,
          normal: pointOut.normal,
          tangentU: pointOut.tangentU ?? { x: 1, y: 0, z: 0 },
          tangentV: pointOut.tangentV ?? { x: 0, y: 1, z: 0 },
        },
        angle
      );
      handleUpdateInteraction(stageId, blockId, {
        status: "captured",
        summary: "Direction captured.",
        point: pointOut,
        direction,
        directionAngle: angle,
      });
      setActiveInteraction(null);
      restoreInteractionState();
      return;
    }
    if (kind === "draw_curve") {
      const existing = meta.block.interaction?.points ?? [];
      const nextPoints = [...existing, { ...probeInfo.point }];
      handleUpdateInteraction(stageId, blockId, {
        status: "armed",
        summary: `Curve points: ${nextPoints.length}`,
        points: nextPoints,
        curve: { points: nextPoints },
      });
      return;
    }
  }, [
    activeInteraction,
    buildDirectionOutput,
    buildPointOutput,
    handleUpdateInteraction,
    probeInfo,
    probeStamp,
    restoreInteractionState,
    workbookGraph,
  ]);

  const handleToggleVisualizeLive = useCallback(
    (stageId: WorkbookStageId, blockId: string, live: boolean) => {
      if (IS_REPLAY_MODE) return;
      if (!activeWorkbookId) return;
      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) =>
                              b.id === blockId
                            ? {
                                ...b,
                                visualize: {
                                  ...(b.visualize ?? { live }),
                                  live,
                                  snapshotA: live ? null : resolveVisualizeSnapshot(b.visualize, "A"),
                                  snapshotB: live ? null : resolveVisualizeSnapshot(b.visualize, "B"),
                                },
                              }
                            : b
                        ),
                      }
                    : s
                ),
              }
            : w
        )
      );
    },
    [activeWorkbookId]
  );

  const buildViewerSnapshot = useCallback((): WorkbookViewSnapshot => {
    const cam = cameraSync
      ? {
          position: { ...cameraSync.position },
          target: { ...cameraSync.target },
          up: { ...cameraSync.up },
        }
      : null;
    return {
      datasetRef: currentDatasetRef,
      datasetKind,
      viewerKind: surfaceViewerKind,
      surfaceId: activeEqSurfaceId,
      paramId: paramSurfaceId,
      graphExpr: surfaceViewerKind === "graph" ? graphExpr : undefined,
      implicitExpr: surfaceViewerKind === "implicit" ? activeImplicitExpr : undefined,
      paramXExpr: surfaceViewerKind === "param" ? paramXExpr : undefined,
      paramYExpr: surfaceViewerKind === "param" ? paramYExpr : undefined,
      paramZExpr: surfaceViewerKind === "param" ? paramZExpr : undefined,
      weierstrassGExpr: surfaceViewerKind === "weierstrass" ? weierstrassGExpr : undefined,
      weierstrassPhiExpr: surfaceViewerKind === "weierstrass" ? weierstrassPhiExpr : undefined,
      weierstrassRecenter: surfaceViewerKind === "weierstrass" ? weierstrassRecenter : undefined,
      graphDomain: surfaceViewerKind === "graph" ? activeGraphDomain : undefined,
      implicitDomain: surfaceViewerKind === "implicit" ? activeImplicitDomain : undefined,
      paramDomain: surfaceViewerKind === "param" ? activeParamDomain : undefined,
      weierstrassDomain: surfaceViewerKind === "weierstrass" ? activeWeierstrassDomain : undefined,
      graphResolution: surfaceViewerKind === "graph" ? graphResolution : undefined,
      implicitResolution: surfaceViewerKind === "implicit" ? implicitResolution : undefined,
      paramResolution: surfaceViewerKind === "param" ? paramResolution : undefined,
      weierstrassResolution: surfaceViewerKind === "weierstrass" ? weierstrassResolution : undefined,
      colorMode,
      colorPalette,
      showWireframe,
      showContours,
      showChartGrid,
      probeEnabled,
      showProbeNormal,
      showProbeTangentPlane,
      showProbeTangents,
      showPrincipalDirections,
      showPrincipalGlyphs,
      showPrincipalLines,
      showCurvatureLines,
      showRidges,
      showValleys,
      showGaussMap,
      showBoundingBox,
      showPlanes,
      volumeViewMode,
      volumeIsoValue,
      volumeShowIsosurface,
      volumeShowStreamlines,
      camera: cam,
      thumbnail: null,
      capturedAt: Date.now(),
    };
  }, [
    cameraSync,
    currentDatasetRef,
    datasetKind,
    surfaceViewerKind,
    activeEqSurfaceId,
    paramSurfaceId,
    graphExpr,
    activeImplicitExpr,
    paramXExpr,
    paramYExpr,
    paramZExpr,
    weierstrassGExpr,
    weierstrassPhiExpr,
    weierstrassRecenter,
    activeGraphDomain,
    activeImplicitDomain,
    activeParamDomain,
    activeWeierstrassDomain,
    graphResolution,
    implicitResolution,
    paramResolution,
    weierstrassResolution,
    colorMode,
    colorPalette,
    showWireframe,
    showContours,
    showChartGrid,
    probeEnabled,
    showProbeNormal,
    showProbeTangentPlane,
    showProbeTangents,
    showPrincipalDirections,
    showPrincipalGlyphs,
    showPrincipalLines,
    showCurvatureLines,
    showRidges,
    showValleys,
    showGaussMap,
    showBoundingBox,
    showPlanes,
    volumeViewMode,
    volumeIsoValue,
    volumeShowIsosurface,
    volumeShowStreamlines,
  ]);

  const handleCaptureVisualize = useCallback(
    (stageId: WorkbookStageId, blockId: string, slot: WorkbookSnapshotSlot) => {
      if (IS_REPLAY_MODE) return;
      const snapshot = buildViewerSnapshot();
      if (!activeWorkbookId) return;
      setCompareBlockId(blockId);
      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) => {
                          if (b.id !== blockId) return b;
                          const prevSnapshotA = resolveVisualizeSnapshot(b.visualize, "A");
                          const prevSnapshotB = resolveVisualizeSnapshot(b.visualize, "B");
                          const nextSnapshot = {
                            ...snapshot,
                            thumbnail:
                              (slot === "A" ? prevSnapshotA?.thumbnail : prevSnapshotB?.thumbnail) ?? null,
                          };
                          return {
                            ...b,
                            visualize: {
                              ...(b.visualize ?? { live: false }),
                              live: false,
                              snapshotA: slot === "A" ? nextSnapshot : prevSnapshotA,
                              snapshotB: slot === "B" ? nextSnapshot : prevSnapshotB,
                            },
                          };
                        }),
                      }
                    : s
                ),
              }
            : w
        )
      );
      setPendingThumbnailCapture({ stageId, blockId, snapshot, slot });
      setWorkbookCaptureToken((t) => t + 1);
    },
    [activeWorkbookId, buildViewerSnapshot]
  );

  const handleWorkbookThumbnail = useCallback(
    (dataUrl: string | null) => {
      if (IS_REPLAY_MODE) return;
      if (!pendingThumbnailCapture || !activeWorkbookId) return;
      const { stageId, blockId, snapshot, slot } = pendingThumbnailCapture;
      setPendingThumbnailCapture(null);
      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) => {
                          if (b.id !== blockId) return b;
                          const prevSnapshotA = resolveVisualizeSnapshot(b.visualize, "A");
                          const prevSnapshotB = resolveVisualizeSnapshot(b.visualize, "B");
                          const nextSnapshot = {
                            ...snapshot,
                            thumbnail: dataUrl ?? snapshot.thumbnail ?? null,
                          };
                          return {
                            ...b,
                            visualize: {
                              ...(b.visualize ?? { live: false }),
                              live: false,
                              snapshotA: slot === "A" ? nextSnapshot : prevSnapshotA,
                              snapshotB: slot === "B" ? nextSnapshot : prevSnapshotB,
                            },
                          };
                        }),
                      }
                    : s
                ),
              }
            : w
        )
      );
    },
    [activeWorkbookId, pendingThumbnailCapture]
  );

  const handleApplyVisualize = useCallback(
    (snapshot: WorkbookViewSnapshot, blockId?: string, slot?: WorkbookSnapshotSlot) => {
      if (blockId) setCompareBlockId(blockId);
      if (slot === "A") setCompareUseSnapshotA(true);
      if (slot === "B") setCompareUseSnapshotB(true);
      if (snapshot.datasetKind === "volume") {
        setDatasetKind("volume");
      } else if (snapshot.viewerKind && isSurfaceViewerKind(snapshot.viewerKind)) {
        setSurfaceViewerKind(snapshot.viewerKind);
        setDatasetKind(snapshot.viewerKind === "mesh" || snapshot.viewerKind === "complex" ? "mesh" : "surface");
      }

      if (snapshot.viewerKind === "param" || snapshot.viewerKind === "weierstrass") {
        if (snapshot.paramId) setParamSurfaceId(snapshot.paramId);
      } else if (snapshot.viewerKind === "graph") {
        if (snapshot.surfaceId) setGraphSurfaceId(snapshot.surfaceId);
      } else if (snapshot.viewerKind === "implicit") {
        if (snapshot.surfaceId) setImplicitSurfaceId(snapshot.surfaceId);
      }

      if (snapshot.graphExpr != null) setGraphExpr(snapshot.graphExpr);
      if (snapshot.implicitExpr != null) setImplicitExpr(snapshot.implicitExpr);
      if (snapshot.paramXExpr != null) setParamXExpr(snapshot.paramXExpr);
      if (snapshot.paramYExpr != null) setParamYExpr(snapshot.paramYExpr);
      if (snapshot.paramZExpr != null) setParamZExpr(snapshot.paramZExpr);
      if (snapshot.weierstrassGExpr != null) setWeierstrassGExpr(snapshot.weierstrassGExpr);
      if (snapshot.weierstrassPhiExpr != null) setWeierstrassPhiExpr(snapshot.weierstrassPhiExpr);
      if (snapshot.weierstrassRecenter != null) setWeierstrassRecenter(snapshot.weierstrassRecenter);
      if (snapshot.graphResolution != null) setGraphResolution(Math.max(10, Math.round(snapshot.graphResolution)));
      if (snapshot.implicitResolution != null) setImplicitResolution(Math.max(8, Math.round(snapshot.implicitResolution)));
      if (snapshot.paramResolution != null) setParamResolution(Math.max(10, Math.round(snapshot.paramResolution)));
      if (snapshot.weierstrassResolution != null) {
        setWeierstrassResolution(Math.max(10, Math.round(snapshot.weierstrassResolution)));
      }
      if (snapshot.graphDomain && snapshot.surfaceId && isGraphSurface(snapshot.surfaceId)) {
        setGraphDomains((prev) => ({
          ...prev,
          [snapshot.surfaceId]: normalizeGraphDomain(snapshot.graphDomain, getDefaultGraphSpan(snapshot.surfaceId)),
        }));
      }
      if (snapshot.implicitDomain && snapshot.surfaceId && isImplicitSurface(snapshot.surfaceId)) {
        setImplicitDomains((prev) => ({
          ...prev,
          [snapshot.surfaceId]: normalizeImplicitDomain(
            snapshot.implicitDomain,
            getDefaultImplicitDomain(snapshot.surfaceId)
          ),
        }));
      }
      if (snapshot.paramDomain && snapshot.paramId) {
        setParamDomains((prev) => ({
          ...prev,
          [snapshot.paramId]: normalizeParamDomain(
            snapshot.paramDomain,
            getParamDomainPreviewBounds(snapshot.paramId)
          ),
        }));
      }
      if (snapshot.weierstrassDomain) {
        setWeierstrassDomain(normalizeParamDomain(snapshot.weierstrassDomain, WEIERSTRASS_DEFAULTS.domain));
      }

      if (snapshot.colorMode) setColorMode(snapshot.colorMode);
      if (snapshot.colorPalette) setColorPalette(snapshot.colorPalette);
      if (snapshot.showWireframe !== undefined) setShowWireframe(snapshot.showWireframe);
      if (snapshot.showContours !== undefined) setShowContours(snapshot.showContours);
      if (snapshot.showChartGrid !== undefined) setShowChartGrid(snapshot.showChartGrid);
      if (snapshot.probeEnabled !== undefined) setProbeEnabled(snapshot.probeEnabled);
      if (snapshot.showProbeNormal !== undefined) setShowProbeNormal(snapshot.showProbeNormal);
      if (snapshot.showProbeTangentPlane !== undefined) setShowProbeTangentPlane(snapshot.showProbeTangentPlane);
      if (snapshot.showProbeTangents !== undefined) setShowProbeTangents(snapshot.showProbeTangents);
      if (snapshot.showPrincipalDirections !== undefined) setShowPrincipalDirections(snapshot.showPrincipalDirections);
      if (snapshot.showPrincipalGlyphs !== undefined) setShowPrincipalGlyphs(snapshot.showPrincipalGlyphs);
      if (snapshot.showPrincipalLines !== undefined) setShowPrincipalLines(snapshot.showPrincipalLines);
      if (snapshot.showCurvatureLines !== undefined) setShowCurvatureLines(snapshot.showCurvatureLines);
      if (snapshot.showRidges !== undefined) setShowRidges(snapshot.showRidges);
      if (snapshot.showValleys !== undefined) setShowValleys(snapshot.showValleys);
      if (snapshot.showGaussMap !== undefined) setShowGaussMap(snapshot.showGaussMap);
      if (snapshot.showBoundingBox !== undefined) setShowBoundingBox(snapshot.showBoundingBox);
      if (snapshot.showPlanes !== undefined) setShowPlanes(snapshot.showPlanes);
      if (snapshot.volumeViewMode) setVolumeViewMode(snapshot.volumeViewMode);
      if (snapshot.volumeIsoValue !== undefined) setVolumeIsoValue(snapshot.volumeIsoValue);
      if (snapshot.volumeShowIsosurface !== undefined) setVolumeShowIsosurface(snapshot.volumeShowIsosurface);
      if (snapshot.volumeShowStreamlines !== undefined) setVolumeShowStreamlines(snapshot.volumeShowStreamlines);

      if (snapshot.camera) {
        setCameraOverride(snapshot.camera);
        setCameraOverrideToken((t) => t + 1);
      }
    },
    [
      setDatasetKind,
      setSurfaceViewerKind,
      setParamSurfaceId,
      setGraphSurfaceId,
      setImplicitSurfaceId,
      setGraphExpr,
      setImplicitExpr,
      setParamXExpr,
      setParamYExpr,
      setParamZExpr,
      setWeierstrassGExpr,
      setWeierstrassPhiExpr,
      setWeierstrassRecenter,
      setGraphResolution,
      setImplicitResolution,
      setParamResolution,
      setWeierstrassResolution,
      setGraphDomains,
      setImplicitDomains,
      setParamDomains,
      setWeierstrassDomain,
      setColorMode,
      setColorPalette,
      setShowWireframe,
      setShowContours,
      setShowChartGrid,
      setProbeEnabled,
      setShowProbeNormal,
      setShowProbeTangentPlane,
      setShowProbeTangents,
      setShowPrincipalDirections,
      setShowPrincipalGlyphs,
      setShowPrincipalLines,
      setShowCurvatureLines,
      setShowRidges,
      setShowValleys,
      setShowGaussMap,
      setShowBoundingBox,
      setShowPlanes,
      setVolumeViewMode,
      setVolumeIsoValue,
      setVolumeShowIsosurface,
      setVolumeShowStreamlines,
      setCompareBlockId,
      setCompareUseSnapshotA,
      setCompareUseSnapshotB,
    ]
  );

  const handleExportWorkbooks = useCallback(() => {
    const payload = {
      version: 1,
      activeWorkbookId,
      activeStageId,
      workbooks,
    };
    const json = JSON.stringify(payload, null, 2);
    downloadTextFile(
      json,
      `math3d-workbooks-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json"
    );
  }, [workbooks, activeWorkbookId, activeStageId]);

  const handleExportWorkbooksMarkdown = useCallback(() => {
    const markdown = buildWorkbooksMarkdown(workbooks, activeWorkbookId);
    const base =
      workbooks.length > 1
        ? "math3d-book"
        : sanitizeFileBase(activeWorkbook?.title ?? "workbook", "workbook");
    downloadTextFile(markdown, `${base}-${new Date().toISOString().slice(0, 10)}.md`, "text/markdown");
  }, [workbooks, activeWorkbookId, activeWorkbook]);

  const handleExportWorkbooksPdf = useCallback(() => {
    const html = buildWorkbooksReportHtml(workbooks, activeWorkbookId);
    const base =
      workbooks.length > 1
        ? "math3d-book"
        : sanitizeFileBase(activeWorkbook?.title ?? "workbook", "workbook");
    const opened = window.open("", "_blank");
    if (!opened) {
      downloadTextFile(html, `${base}-${new Date().toISOString().slice(0, 10)}.html`, "text/html");
      return;
    }
    opened.document.open();
    opened.document.write(html);
    opened.document.close();
    opened.focus();
    opened.print();
  }, [workbooks, activeWorkbookId, activeWorkbook]);

  const handleExportWorkbooksReplayHtml = useCallback(async () => {
    const payload: WorkbookReplayPayload = {
      workbooks,
      activeWorkbookId,
      activeStageId,
    };
    const assets = await collectReplayAssets();
    const base =
      workbooks.length > 1
        ? "math3d-book"
        : sanitizeFileBase(activeWorkbook?.title ?? "workbook", "workbook");
    const title = workbooks.length > 1 ? "Math3D Workbook Export" : activeWorkbook?.title ?? "Math3D Workbook";
    const html = buildReplayHtml(payload, assets, title);
    downloadTextFile(html, `${base}-${new Date().toISOString().slice(0, 10)}-replay.html`, "text/html");
  }, [workbooks, activeWorkbookId, activeStageId, activeWorkbook]);

  const handleImportWorkbooks = useCallback((raw: string) => {
    if (IS_REPLAY_MODE) return;
    try {
      const parsed = JSON.parse(raw);
      const nextWorkbooks: Workbook[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.workbooks)
          ? parsed.workbooks
          : [];
      if (!nextWorkbooks.length) return;
      const normalized = normalizeWorkbooks(nextWorkbooks);
      setWorkbooks(normalized);
      const nextActive =
        typeof parsed?.activeWorkbookId === "string" &&
        normalized.some((w) => w.id === parsed.activeWorkbookId)
          ? parsed.activeWorkbookId
          : normalized[0].id;
      setActiveWorkbookId(nextActive);
      if (isWorkbookStageId(parsed?.activeStageId)) setActiveStageId(parsed.activeStageId);
    } catch {
      // ignore
    }
  }, []);

  const handleGaussPoints = useCallback(
    (points: GaussPoint[]) => {
      if (!showGaussMap) {
        setGaussPoints([]);
        return;
      }
      setGaussPoints(points);
    },
    [showGaussMap]
  );

  const handleSampleSet = useCallback((set: SurfaceSampleSet | null) => {
    setSurfaceSampleSet(set);
  }, []);

  const complexMapOverlayPolylines = useMemo<PolylineSet | null>(() => {
    if (!isMeshLikeViewer) return null;
    if (!surfaceMeshData || !isComplexMapSurfaceLabel(surfaceMeshData.label)) return null;
    if (!complexMapLinePolylines?.length) return null;
    return complexMapLinePolylines;
  }, [isMeshLikeViewer, surfaceMeshData, complexMapLinePolylines]);

  const complexMapOverlayPolylineGroups = useMemo(() => {
    if (!isMeshLikeViewer) return null;
    if (!surfaceMeshData || !isComplexMapSurfaceLabel(surfaceMeshData.label)) return null;
    const groups: { lines: PolylineSet; color: number; opacity?: number; radiusScale?: number }[] = [];
    if (complexMapSpec.showIsolines && complexMapGridShowSurface) {
      if (complexMapIsoline3dPolylinesU?.length) {
        groups.push({
          lines: complexMapIsoline3dPolylinesU,
          color: COMPLEX_GRID_COLORS_3D.u,
          opacity: complexMapGridOpacity,
          radiusScale: complexMapGridThickness,
        });
      }
      if (complexMapIsoline3dPolylinesV?.length) {
        groups.push({
          lines: complexMapIsoline3dPolylinesV,
          color: COMPLEX_GRID_COLORS_3D.v,
          opacity: complexMapGridOpacity,
          radiusScale: complexMapGridThickness,
        });
      }
    }
    return groups.length ? groups : null;
  }, [
    isMeshLikeViewer,
    surfaceMeshData,
    complexMapSpec.showIsolines,
    complexMapGridShowSurface,
    complexMapIsoline3dPolylinesU,
    complexMapIsoline3dPolylinesV,
    complexMapGridOpacity,
    complexMapGridThickness,
  ]);

  const workbookCurveOverlayGroups = useMemo(() => {
    if (!workbookCurveOverlay?.length) return null;
    return [
      {
        lines: workbookCurveOverlay,
        color: 0x16a34a,
        opacity: 0.9,
        radiusScale: 1.15,
      },
    ];
  }, [workbookCurveOverlay]);

  const workbookCurveOverlayGhostGroups = useMemo(() => {
    if (!workbookGhostOverlaysEnabled || !workbookCurveOverlayGhost?.length) return null;
    return [
      {
        lines: workbookCurveOverlayGhost,
        color: 0x16a34a,
        opacity: 0.2,
        radiusScale: 1.05,
      },
    ];
  }, [workbookCurveOverlayGhost, workbookGhostOverlaysEnabled]);

  const workbookDirectionOverlayGroups = useMemo(() => {
    if (!workbookDirectionOverlay?.length) return null;
    return [
      {
        lines: workbookDirectionOverlay,
        color: 0xf97316,
        opacity: 0.95,
        radiusScale: 1.25,
      },
    ];
  }, [workbookDirectionOverlay]);

  const workbookDirectionOverlayGhostGroups = useMemo(() => {
    if (!workbookGhostOverlaysEnabled || !workbookDirectionOverlayGhost?.length) return null;
    return [
      {
        lines: workbookDirectionOverlayGhost,
        color: 0xf97316,
        opacity: 0.2,
        radiusScale: 1.1,
      },
    ];
  }, [workbookDirectionOverlayGhost, workbookGhostOverlaysEnabled]);

  const combinedOverlayPolylineGroups = useMemo(() => {
    const groups: { lines: PolylineSet; color: number; opacity?: number; radiusScale?: number }[] = [];
    if (complexMapOverlayPolylineGroups?.length) groups.push(...complexMapOverlayPolylineGroups);
    if (workbookCurveOverlayGhostGroups?.length) groups.push(...workbookCurveOverlayGhostGroups);
    if (workbookDirectionOverlayGhostGroups?.length) groups.push(...workbookDirectionOverlayGhostGroups);
    if (workbookCurveOverlayGroups?.length) groups.push(...workbookCurveOverlayGroups);
    if (workbookDirectionOverlayGroups?.length) groups.push(...workbookDirectionOverlayGroups);
    return groups.length ? groups : null;
  }, [
    complexMapOverlayPolylineGroups,
    workbookCurveOverlayGhostGroups,
    workbookDirectionOverlayGhostGroups,
    workbookCurveOverlayGroups,
    workbookDirectionOverlayGroups,
  ]);

  const compareOverlayPolylineGroups = useMemo(() => {
    if (!compareIgnoreWorkbookOverlays) return combinedOverlayPolylineGroups;
    return complexMapOverlayPolylineGroups?.length ? complexMapOverlayPolylineGroups : null;
  }, [compareIgnoreWorkbookOverlays, combinedOverlayPolylineGroups, complexMapOverlayPolylineGroups]);

  const handleBuildComplexMapSweep = useCallback(() => {
    const res = buildComplexMapSweep(complexMapSpec);
    if (!res.build || res.error) {
      setComplexMapError(res.error ?? "Failed to build complex map surface.");
      return;
    }
    const outputLabel = COMPLEX_MAP_OUTPUT_LABELS[complexMapSpec.outputMode] ?? COMPLEX_MAP_LABEL;
    const riemannSuffix =
      complexMapSpec.outputMode === "sweep"
        ? ""
        : complexMapSpec.outputMode === "both"
        ? "Re+Im"
        : complexMapSpec.outputMode.toUpperCase();
    const label =
      complexMapMode === "riemann"
        ? `Riemann surface (${complexMapSheetCount} sheets${
            complexMapSheetMode === "single" ? `, sheet ${complexMapSheetIndex + 1}` : ""
          }${riemannSuffix ? `, ${riemannSuffix}` : ""})`
        : outputLabel;
    const next: SurfaceMeshData = {
      label,
      positions: res.build.positions,
      indices: res.build.indices,
      uvs: res.build.uvs,
      source: "generated",
    };
    setMeshDataset(applySurfaceMeshOps(next));
    setSurfaceMeshImportError(null);
    setComplexMapError(null);
  }, [
    complexMapSpec,
    complexMapMode,
    complexMapSheetCount,
    complexMapSheetMode,
    complexMapSheetIndex,
    setMeshDataset,
  ]);

  useEffect(() => {
    if (!complexMapLive) return;
    if (mode !== "surfaces") return;
    if (surfaceViewerKind !== "complex") return;
    const handle = window.setTimeout(() => {
      handleBuildComplexMapSweep();
    }, 200);
    return () => window.clearTimeout(handle);
  }, [complexMapLive, handleBuildComplexMapSweep, mode, surfaceViewerKind]);

  useEffect(() => {
    if (!complexMapLine || !complexMapFns) {
      setComplexMapLinePolylines(null);
      setComplexMapLineWPolylines(null);
      return;
    }

    const isUConst = complexMapLine.axis === "u";
    const uMin = complexMapSpec.uMin;
    const uMax = complexMapSpec.uMax;
    const vMin = complexMapSpec.vMin;
    const vMax = complexMapSpec.vMax;
    const count = Math.max(2, Math.round(isUConst ? complexMapSpec.nv : complexMapSpec.nu));
    const tMin = isUConst ? vMin : uMin;
    const tMax = isUConst ? vMax : uMax;
    const tStep = count > 1 ? (tMax - tMin) / (count - 1) : 0;

    const outputMode = complexMapSpec.outputMode;
    const lineSweep: PolylineSet = [];
    const lineRe: PolylineSet = [];
    const lineIm: PolylineSet = [];
    const lineW: [number, number][][] = [];
    let currentSweep: { x: number; y: number; z: number }[] = [];
    let currentRe: { x: number; y: number; z: number }[] = [];
    let currentIm: { x: number; y: number; z: number }[] = [];
    let currentW: [number, number][] = [];

    for (let i = 0; i < count; i++) {
      const t = tMin + tStep * i;
      const u = isUConst ? complexMapLine.value : t;
      const v = isUConst ? t : complexMapLine.value;
      const w = evalComplexMapW(u, v);
      if (!w) {
        if (currentSweep.length >= 2) lineSweep.push(currentSweep);
        if (currentRe.length >= 2) lineRe.push(currentRe);
        if (currentIm.length >= 2) lineIm.push(currentIm);
        if (currentW.length >= 2) lineW.push(currentW);
        currentSweep = [];
        currentRe = [];
        currentIm = [];
        currentW = [];
        continue;
      }
      const { re, im } = w;
      const x = complexMapSpec.sweepAxis === "v" ? v : u;
      const other = complexMapSpec.sweepAxis === "v" ? u : v;
      currentSweep.push({ x, y: re, z: im });
      currentRe.push({ x, y: re, z: other });
      currentIm.push({ x, y: im, z: other });
      currentW.push([re, im]);
    }

    if (currentSweep.length >= 2) lineSweep.push(currentSweep);
    if (currentRe.length >= 2) lineRe.push(currentRe);
    if (currentIm.length >= 2) lineIm.push(currentIm);
    if (currentW.length >= 2) lineW.push(currentW);

    const line3d: PolylineSet = [];
    if (outputMode === "sweep") {
      line3d.push(...lineSweep);
    } else if (outputMode === "re") {
      line3d.push(...lineRe);
    } else if (outputMode === "im") {
      line3d.push(...lineIm);
    } else {
      line3d.push(...lineRe, ...lineIm);
    }
    if (outputMode !== "sweep") {
      line3d.push(...lineSweep);
    }

    setComplexMapLinePolylines(line3d.length ? line3d : null);
    setComplexMapLineWPolylines(lineW.length ? lineW : null);
  }, [complexMapLine, complexMapFns, complexMapSpec, evalComplexMapW]);

  useEffect(() => {
    if (!complexMapSpec.showIsolines || !complexMapFns) {
      setComplexMapIsolineWPolylinesU(null);
      setComplexMapIsolineWPolylinesV(null);
      setComplexMapIsolineZLinesU(null);
      setComplexMapIsolineZLinesV(null);
      setComplexMapIsoline3dPolylinesU(null);
      setComplexMapIsoline3dPolylinesV(null);
      setComplexMapSphereLines(null);
      return;
    }

    const sweepIsV = complexMapSpec.sweepAxis === "v";
    const uMin = complexMapSpec.uMin;
    const uMax = complexMapSpec.uMax;
    const vMin = complexMapSpec.vMin;
    const vMax = complexMapSpec.vMax;
    const outputMode = complexMapSpec.outputMode;
    const sphereLines: ComplexMapSphereLine[] = [];

    const buildFamily = (axis: "u" | "v", count: number) => {
      const zLines: [number, number][][] = [];
      const wLines: [number, number][][] = [];
      const lineSweep: PolylineSet = [];
      const lineRe: PolylineSet = [];
      const lineIm: PolylineSet = [];

      const safeCount = Math.max(0, Math.round(count));
      if (safeCount <= 0) return { zLines, wLines, line3d: [] as PolylineSet };

      const lineMin = axis === "u" ? uMin : vMin;
      const lineMax = axis === "u" ? uMax : vMax;
      const lineStep = safeCount > 1 ? (lineMax - lineMin) / (safeCount - 1) : 0;
      const sampleCount = Math.max(2, Math.round(axis === "u" ? complexMapSpec.nv : complexMapSpec.nu));
      const sampleMin = axis === "u" ? vMin : uMin;
      const sampleMax = axis === "u" ? vMax : uMax;
      const sampleStep = sampleCount > 1 ? (sampleMax - sampleMin) / (sampleCount - 1) : 0;

      for (let k = 0; k < safeCount; k++) {
        const constVal = lineMin + lineStep * k;
        let currentW: [number, number][] = [];
        let currentSweep: { x: number; y: number; z: number }[] = [];
        let currentRe: { x: number; y: number; z: number }[] = [];
        let currentIm: { x: number; y: number; z: number }[] = [];

        for (let s = 0; s < sampleCount; s++) {
          const t = sampleMin + sampleStep * s;
          const u = axis === "u" ? constVal : t;
          const v = axis === "u" ? t : constVal;
          const w = evalComplexMapW(u, v);
          if (!w) {
            if (currentW.length >= 2) {
              wLines.push(currentW);
              sphereLines.push({ axis, value: constVal, line: currentW });
            }
            if (currentSweep.length >= 2) lineSweep.push(currentSweep);
            if (currentRe.length >= 2) lineRe.push(currentRe);
            if (currentIm.length >= 2) lineIm.push(currentIm);
            currentW = [];
            currentSweep = [];
            currentRe = [];
            currentIm = [];
            continue;
          }
          const { re, im } = w;
          currentW.push([re, im]);
          const x = sweepIsV ? v : u;
          const other = sweepIsV ? u : v;
          currentSweep.push({ x, y: re, z: im });
          currentRe.push({ x, y: re, z: other });
          currentIm.push({ x, y: im, z: other });
        }

        if (currentW.length >= 2) {
          wLines.push(currentW);
          sphereLines.push({ axis, value: constVal, line: currentW });
        }
        if (currentSweep.length >= 2) lineSweep.push(currentSweep);
        if (currentRe.length >= 2) lineRe.push(currentRe);
        if (currentIm.length >= 2) lineIm.push(currentIm);

        if (axis === "u") {
          zLines.push([
            [constVal, vMin],
            [constVal, vMax],
          ]);
        } else {
          zLines.push([
            [uMin, constVal],
            [uMax, constVal],
          ]);
        }
      }

      const line3d: PolylineSet = [];
      if (outputMode === "sweep") {
        line3d.push(...lineSweep);
      } else if (outputMode === "re") {
        line3d.push(...lineRe);
      } else if (outputMode === "im") {
        line3d.push(...lineIm);
      } else {
        line3d.push(...lineRe, ...lineIm);
      }
      if (outputMode !== "sweep") {
        line3d.push(...lineSweep);
      }

      return { zLines, wLines, line3d };
    };

    const uRes = buildFamily("u", complexMapSpec.isolinesCountU);
    const vRes = buildFamily("v", complexMapSpec.isolinesCountV);

    setComplexMapIsolineWPolylinesU(uRes.wLines.length ? uRes.wLines : null);
    setComplexMapIsolineWPolylinesV(vRes.wLines.length ? vRes.wLines : null);
    setComplexMapIsolineZLinesU(uRes.zLines.length ? uRes.zLines : null);
    setComplexMapIsolineZLinesV(vRes.zLines.length ? vRes.zLines : null);
    setComplexMapIsoline3dPolylinesU(uRes.line3d.length ? uRes.line3d : null);
    setComplexMapIsoline3dPolylinesV(vRes.line3d.length ? vRes.line3d : null);
    setComplexMapSphereLines(sphereLines.length ? sphereLines : null);
  }, [complexMapFns, complexMapSpec, evalComplexMapW]);

  useEffect(() => {
    if (complexPreimageMode === "none" || !complexMapFns) {
      setComplexPreimagePolylines(null);
      return;
    }

    const nu = Math.max(2, Math.round(complexMapSpec.nu));
    const nv = Math.max(2, Math.round(complexMapSpec.nv));
    const uMin = complexMapSpec.uMin;
    const uMax = complexMapSpec.uMax;
    const vMin = complexMapSpec.vMin;
    const vMax = complexMapSpec.vMax;
    const uStep = nu > 1 ? (uMax - uMin) / (nu - 1) : 0;
    const vStep = nv > 1 ? (vMax - vMin) / (nv - 1) : 0;

    const theta = complexPreimageMode === "arg" ? complexPreimageValue : 0;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const sample = (i: number, j: number) => {
      const u = uMin + uStep * i;
      const v = vMin + vStep * j;
      const w = evalComplexMapW(u, v);
      if (!w) return NaN;
      const { re, im } = w;
      if (complexPreimageMode === "re") return re;
      if (complexPreimageMode === "im") return im;
      if (complexPreimageMode === "abs") return Math.hypot(re, im);
      return im * cosT - re * sinT;
    };

    const level =
      complexPreimageMode === "abs" ? Math.max(0, complexPreimageValue) : complexPreimageMode === "arg" ? 0 : complexPreimageValue;

    const lines = marchingSquares({
      nx: nu,
      ny: nv,
      xMin: uMin,
      xMax: uMax,
      yMin: vMin,
      yMax: vMax,
      sample,
      level,
    });

    let polylines = lines.map((line) => line.map((p) => [p.x, p.y] as [number, number]));

    if (complexPreimageMode === "arg") {
      const filtered: [number, number][][] = [];
      for (const line of polylines) {
        let current: [number, number][] = [];
        for (const [u, v] of line) {
          const w = evalComplexMapW(u, v);
          if (!w) {
            if (current.length >= 2) filtered.push(current);
            current = [];
            continue;
          }
          const reRot = w.re * cosT + w.im * sinT;
          if (Number.isFinite(reRot) && reRot >= 0) {
            current.push([u, v]);
          } else {
            if (current.length >= 2) filtered.push(current);
            current = [];
          }
        }
        if (current.length >= 2) filtered.push(current);
      }
      polylines = filtered;
    }

    setComplexPreimagePolylines(polylines.length ? polylines : null);
  }, [complexPreimageMode, complexPreimageValue, complexMapFns, complexMapSpec, evalComplexMapW]);

  const handleGenerateSurfaceMeshPreset = useCallback((presetId: string) => {
    const preset = SURFACE_MESH_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    try {
      const base = buildSurfaceMeshFromGeometry(preset.build(), preset.label, "generated", { mergeVertices: true });
      setMeshDataset(applySurfaceMeshOps(base));
      setSurfaceMeshImportError(null);
      setSurfaceViewerKind("mesh");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to build mesh preset.";
      setSurfaceMeshImportError(msg);
    }
  }, []);

  const handleLoadSurfaceMeshFile = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || (files as FileList).length === 0) return;
      setSurfaceMeshImportBusy(true);
      setSurfaceMeshImportError(null);
      try {
        const base = await loadSurfaceMeshFromFile(files, { mergeVertices: surfaceMeshMergeVertices });
        setMeshDataset(applySurfaceMeshOps(base));
        setSurfaceViewerKind("mesh");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load mesh file.";
        setSurfaceMeshImportError(msg);
      } finally {
        setSurfaceMeshImportBusy(false);
      }
    },
    [surfaceMeshMergeVertices]
  );

  const handleExportSurfaceMeshObj = useCallback(() => {
    if (surfaceMeshExportBusy) return;
    if (!surfaceMeshData?.positions?.length) {
      setSurfaceMeshExportError("Surface mesh not ready yet.");
      return;
    }
    setSurfaceMeshExportBusy(true);
    setSurfaceMeshExportError(null);
    try {
      const base = sanitizeFileBase(surfaceMeshData.label ?? "surface_mesh", "surface_mesh");
      exportMeshToOBJ(surfaceMeshData, `${base}.obj`);
    } catch (err: any) {
      setSurfaceMeshExportError(err?.message ?? "OBJ export failed.");
    } finally {
      setSurfaceMeshExportBusy(false);
    }
  }, [surfaceMeshExportBusy, surfaceMeshData]);

  const handleExportSurfaceMeshGlb = useCallback(async () => {
    if (surfaceMeshExportBusy) return;
    if (!surfaceMeshData?.positions?.length) {
      setSurfaceMeshExportError("Surface mesh not ready yet.");
      return;
    }
    setSurfaceMeshExportBusy(true);
    setSurfaceMeshExportError(null);
    try {
      const base = sanitizeFileBase(surfaceMeshData.label ?? "surface_mesh", "surface_mesh");
      await exportMeshToGLB(surfaceMeshData, `${base}.glb`);
    } catch (err: any) {
      setSurfaceMeshExportError(err?.message ?? "GLB export failed.");
    } finally {
      setSurfaceMeshExportBusy(false);
    }
  }, [surfaceMeshExportBusy, surfaceMeshData]);

  const handleWeldSurfaceMesh = useCallback(() => {
    if (surfaceMeshWeldBusy) return;
    if (!surfaceMeshData?.positions?.length) {
      setSurfaceMeshWeldError("Surface mesh not ready yet.");
      return;
    }
    setSurfaceMeshWeldBusy(true);
    setSurfaceMeshWeldError(null);
    try {
      const tol = Math.max(1e-6, Number(surfaceMeshWeldTolerance) || 1e-6);
      const label = `${surfaceMeshData.label ?? "Surface mesh"} (welded)`;
      const welded = weldSurfaceMeshVertices(surfaceMeshData, tol, label);
      setMeshDataset(applySurfaceMeshOps(welded));
      handleChangeViewerKind("mesh");
    } catch (err: any) {
      setSurfaceMeshWeldError(err?.message ?? "Weld vertices failed.");
    } finally {
      setSurfaceMeshWeldBusy(false);
    }
  }, [handleChangeViewerKind, surfaceMeshWeldBusy, surfaceMeshData, surfaceMeshWeldTolerance, setMeshDataset]);

  const buildActiveMeshLabel = useCallback(() => {
    const eqMeta = SURFACES_EQ_META.find((m) => m.id === activeEqSurfaceId);
    const paramMeta = PARAM_SURFACES_META.find((m) => m.id === paramSurfaceId);
    return surfaceViewerKind === "graph"
      ? `Graph: ${eqMeta?.label ?? activeEqSurfaceId}`
      : surfaceViewerKind === "implicit"
        ? `Implicit: ${eqMeta?.label ?? activeEqSurfaceId}`
        : surfaceViewerKind === "weierstrass"
          ? "Weierstrass surface"
          : surfaceViewerKind === "param"
            ? `Param: ${paramMeta?.label ?? paramSurfaceId}`
            : surfaceViewerKind === "mesh" || surfaceViewerKind === "complex"
              ? surfaceMeshData?.label ?? "Surface mesh"
              : "Surface mesh";
  }, [surfaceViewerKind, activeEqSurfaceId, paramSurfaceId, surfaceMeshData?.label]);

  const buildImplicitBakeKey = useCallback((expr: string, bounds: ImplicitBakeBounds, resolution: number) => {
    const round = (v: number) => (Number.isFinite(v) ? v.toFixed(4) : "nan");
    return `${expr.trim()}::${resolution}::${round(bounds.xSpan)}::${round(bounds.ySpan)}::${round(bounds.zSpan)}`;
  }, []);

  const storeImplicitBakeCache = useCallback((key: string, mesh: SurfaceMeshData) => {
    const cache = implicitBakeCacheRef.current;
    cache.set(key, { mesh, ts: Date.now() });
    if (cache.size <= 4) return;
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of cache.entries()) {
      if (v.ts < oldestTime) {
        oldestTime = v.ts;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }, []);

  const getMeshForVtk = useCallback(() => {
    const meshData = surfaceSampleSet?.meshData ?? [];
    if (!meshData.length) return null;
    const merged = mergeMeshData(meshData);
    if (!merged.positions.length || !merged.indices.length) return null;
    return { positions: merged.positions, indices: merged.indices, label: buildActiveMeshLabel() };
  }, [surfaceSampleSet, buildActiveMeshLabel]);

  const applyVtkResultToSurfaceMesh = useCallback(
    (labelSuffix: string, res: { positions: Float32Array; indices: Uint32Array; normals?: Float32Array }) => {
      const label = `${buildActiveMeshLabel()} (${labelSuffix})`;
      const next: SurfaceMeshData = {
        label,
        positions: res.positions,
        indices: res.indices,
        normals: res.normals ?? null,
        source: "surface",
      };
      setMeshDataset(applySurfaceMeshOps(next));
      setSurfaceViewerKind("mesh");
      setSurfaceMeshImportError(null);
    },
    [buildActiveMeshLabel]
  );

  const getImplicitBakeWorker = useCallback(() => {
    if (IS_REPLAY_MODE) return null;
    if (!implicitBakeWorkerRef.current) {
      implicitBakeWorkerRef.current = new Worker(new URL("./workers/implicitBakeWorker.ts", import.meta.url), {
        type: "module",
      });
    }
    return implicitBakeWorkerRef.current;
  }, []);

  useEffect(() => {
    const worker = getImplicitBakeWorker();
    if (!worker) return;
    const handleMessage = (event: MessageEvent<any>) => {
      const msg = event.data;
      if (!msg || msg.jobId !== implicitBakeJobRef.current) return;

      if (msg.type === "progress") {
        const progress = Number(msg.progress);
        setImplicitBakePhase(msg.phase === "marching" ? "marching" : "sampling");
        setImplicitBakeProgress(Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0);
        return;
      }

      if (msg.type === "result") {
        if (!msg.ok) {
          setImplicitBakeError(msg.error ?? "Implicit bake failed.");
          setImplicitBakeBusy(false);
          setImplicitBakePhase("idle");
          return;
        }

        const label = `${buildActiveMeshLabel()} (implicit bake)`;
        const next: SurfaceMeshData = {
          label,
          positions: msg.positions,
          indices: msg.indices,
          source: "surface",
        };
        const processed = applySurfaceMeshOps(next);
        const key = implicitBakeKeyRef.current ?? "";
        if (key) {
          storeImplicitBakeCache(key, processed);
        }
        setMeshDataset(processed);
        handleChangeViewerKind("mesh");
        setImplicitBakeBusy(false);
        setImplicitBakePhase("idle");
        setImplicitBakeProgress(0);
        setImplicitBakeError(null);
        setImplicitBakeCacheHit(false);
      }
    };
    worker.addEventListener("message", handleMessage);
    return () => {
      worker.removeEventListener("message", handleMessage);
    };
  }, [buildActiveMeshLabel, getImplicitBakeWorker, handleChangeViewerKind, setMeshDataset, storeImplicitBakeCache]);

  useEffect(() => {
    return () => {
      if (implicitBakeWorkerRef.current) {
        implicitBakeWorkerRef.current.terminate();
        implicitBakeWorkerRef.current = null;
      }
    };
  }, []);

  const handleVtkCleanNormals = useCallback(async () => {
    if (vtkBusy) return;
    const mesh = getMeshForVtk();
    if (!mesh) {
      setVtkError("Surface mesh not ready yet.");
      return;
    }
    setVtkBusy(true);
    setVtkError(null);
    try {
      const res = await vtkCleanNormals(mesh.positions, mesh.indices, { computeNormals: true });
      if (!res.ok) {
        setVtkError(res.error);
        return;
      }
      applyVtkResultToSurfaceMesh("VTK clean", res);
    } catch (err: any) {
      setVtkError(err?.message ?? "VTK clean failed.");
    } finally {
      setVtkBusy(false);
    }
  }, [vtkBusy, getMeshForVtk, applyVtkResultToSurfaceMesh]);

  const handleVtkDecimate = useCallback(async () => {
    if (vtkBusy) return;
    const mesh = getMeshForVtk();
    if (!mesh) {
      setVtkError("Surface mesh not ready yet.");
      return;
    }
    setVtkBusy(true);
    setVtkError(null);
    try {
      const options = vtkUseTargetFaces
        ? { targetFaces: vtkDecimateTargetFaces, computeNormals: true }
        : { targetReduction: vtkDecimateReduction, computeNormals: true };
      const res = await vtkDecimate(mesh.positions, mesh.indices, options);
      if (!res.ok) {
        setVtkError(res.error);
        return;
      }
      applyVtkResultToSurfaceMesh("VTK decimate", res);
    } catch (err: any) {
      setVtkError(err?.message ?? "VTK decimate failed.");
    } finally {
      setVtkBusy(false);
    }
  }, [
    vtkBusy,
    getMeshForVtk,
    vtkUseTargetFaces,
    vtkDecimateTargetFaces,
    vtkDecimateReduction,
    applyVtkResultToSurfaceMesh,
  ]);

  const handleVtkSmooth = useCallback(async () => {
    if (vtkBusy) return;
    const mesh = getMeshForVtk();
    if (!mesh) {
      setVtkError("Surface mesh not ready yet.");
      return;
    }
    setVtkBusy(true);
    setVtkError(null);
    try {
      const res = await vtkSmooth(mesh.positions, mesh.indices, {
        iterations: vtkSmoothIterations,
        passband: vtkSmoothPassband,
        computeNormals: true,
      });
      if (!res.ok) {
        setVtkError(res.error);
        return;
      }
      applyVtkResultToSurfaceMesh("VTK smooth", res);
    } catch (err: any) {
      setVtkError(err?.message ?? "VTK smooth failed.");
    } finally {
      setVtkBusy(false);
    }
  }, [vtkBusy, getMeshForVtk, vtkSmoothIterations, vtkSmoothPassband, applyVtkResultToSurfaceMesh]);

  const handleBuildDistanceVolume = useCallback(async () => {
    if (volumeDistanceBusy) return;
    if (!surfaceMeshData?.positions?.length) {
      setVolumeDistanceError("Surface mesh not ready yet.");
      return;
    }
    if (!(window as any).vtkVolume?.distanceField) {
      setVolumeDistanceError("VTK volume worker unavailable.");
      return;
    }
    const positions = surfaceMeshData.positions;
    let indices = surfaceMeshData.indices;
    if (!indices || indices.length < 3) {
      const vertCount = Math.floor(positions.length / 3);
      if (vertCount < 3) {
        setVolumeDistanceError("Surface mesh has no triangles.");
        return;
      }
      const seq = new Uint32Array(vertCount);
      for (let i = 0; i < vertCount; i++) seq[i] = i;
      indices = seq;
    }

    let sampling = volumeSamplingClamped;
    let bounds = volumeSamplingBounds;
    let spacing = volumeSamplingSpacing;
    if (volumeDistanceAutoBounds) {
      const rawBounds = boundsFromPositions(positions);
      if (!rawBounds) {
        setVolumeDistanceError("Unable to compute mesh bounds for auto sampling.");
        return;
      }
      const diag = bboxDiag(rawBounds);
      const pad = Math.max(1e-3, diag * 0.06);
      const padded = {
        min: [rawBounds.min[0] - pad, rawBounds.min[1] - pad, rawBounds.min[2] - pad] as [number, number, number],
        max: [rawBounds.max[0] + pad, rawBounds.max[1] + pad, rawBounds.max[2] + pad] as [number, number, number],
      };
      const autoSampling = clampSampling(samplingFromBounds(padded, volumeSamplingClamped.dims));
      sampling = autoSampling;
      bounds = samplingToBounds(autoSampling);
      spacing = samplingSpacing(autoSampling);
      setVolumeSampling(autoSampling);
    }

    setVolumeDistanceBusy(true);
    setVolumeDistanceError(null);
    try {
      const res = await vtkVolumeDistance({
        dims: sampling.dims,
        positions,
        indices,
        spacing,
        origin: bounds.min,
        signed: volumeDistanceSigned,
        windingNumber: volumeDistanceSigned,
      });
      if (!res.ok) {
        setVolumeDistanceError(res.error);
        return;
      }
      const grid = {
        dims: res.dims,
        scalars: res.scalars,
        spacing,
        origin: bounds.min,
      };
      const label = `Distance field: ${surfaceMeshData.label ?? "Surface mesh"}`;
      const note = volumeDistanceSigned
        ? "Signed distance to surface mesh (winding number)."
        : "Unsigned distance to surface mesh.";
      setVolumeDatasetOverride({
        kind: "volume",
        grid,
        label,
        note,
        distanceSigned: volumeDistanceSigned,
        sourceId: "surface_distance",
      });
      setDatasetKind("volume");
      setVolumeShowIsosurface(true);
      setVolumeIsoValue(0);
    } catch (err: any) {
      setVolumeDistanceError(err?.message ?? "Distance field failed.");
    } finally {
      setVolumeDistanceBusy(false);
    }
  }, [
    volumeDistanceBusy,
    volumeDistanceSigned,
    volumeDistanceAutoBounds,
    surfaceMeshData,
    volumeSamplingClamped,
    volumeSamplingSpacing,
    volumeSamplingBounds,
  ]);

  const handleClearVolumeOverride = useCallback(() => {
    setVolumeDatasetOverride(null);
    setVolumeDistanceError(null);
  }, []);

  const handleUseImplicitBakeDomain = useCallback(() => {
    const zSpan = Math.max(activeImplicitDomain.xSpan, activeImplicitDomain.ySpan);
    setImplicitBakeBounds({
      xSpan: activeImplicitDomain.xSpan,
      ySpan: activeImplicitDomain.ySpan,
      zSpan,
    });
  }, [activeImplicitDomain]);

  const handleResetImplicitBakeBounds = useCallback(() => {
    setImplicitBakeBounds(DEFAULT_IMPLICIT_BAKE_BOUNDS);
  }, []);

  const handleBakeImplicit = useCallback(() => {
    if (IS_REPLAY_MODE) {
      setImplicitBakeError("Implicit bake is disabled in replay mode.");
      return;
    }
    if (implicitBakeBusy) return;
    setImplicitBakeError(null);

    const expr = (activeImplicitExpr ?? "").trim();
    if (!expr) {
      setImplicitBakeError("Expression is empty.");
      return;
    }

    const resolution = Math.max(16, Math.min(320, Math.round(implicitBakeResolution)));
    const bounds = normalizeImplicitBakeBounds(safeImplicitBakeBounds, DEFAULT_IMPLICIT_BAKE_BOUNDS);
    const key = buildImplicitBakeKey(expr, bounds, resolution);
    const cached = implicitBakeCacheRef.current.get(key);
    if (cached) {
      cached.ts = Date.now();
      setMeshDataset(cached.mesh);
      handleChangeViewerKind("mesh");
      setImplicitBakeCacheHit(true);
      return;
    }

    setImplicitBakeCacheHit(false);
    setImplicitBakeBusy(true);
    setImplicitBakePhase("sampling");
    setImplicitBakeProgress(0);

    const jobId = makeId();
    implicitBakeJobRef.current = jobId;
    implicitBakeKeyRef.current = key;

    const worker = getImplicitBakeWorker();
    if (!worker) {
      setImplicitBakeError("Implicit bake is disabled in replay mode.");
      setImplicitBakeBusy(false);
      setImplicitBakePhase("idle");
      return;
    }
    worker.postMessage({
      type: "bake",
      jobId,
      expr,
      resolution,
      bounds: {
        xMin: -bounds.xSpan,
        xMax: bounds.xSpan,
        yMin: -bounds.ySpan,
        yMax: bounds.ySpan,
        zMin: -bounds.zSpan,
        zMax: bounds.zSpan,
      },
      iso: 0,
    });
  }, [
    activeImplicitExpr,
    buildImplicitBakeKey,
    getImplicitBakeWorker,
    handleChangeViewerKind,
    implicitBakeBusy,
    implicitBakeResolution,
    safeImplicitBakeBounds,
    setMeshDataset,
  ]);

  const handleConvertToMesh = useCallback(() => {
    setSurfaceMeshImportError(null);

    if (surfaceViewerKind === "implicit") {
      if (!activeCgalMesh) {
        setSurfaceMeshImportError("Run CGAL mesh first.");
        return;
      }
      const positions = Float32Array.from(activeCgalMesh.positions);
      const indices = Uint32Array.from(activeCgalMesh.indices);
      const next: SurfaceMeshData = {
        label: buildActiveMeshLabel(),
        positions,
        indices,
        source: "surface",
      };
      setMeshDataset(applySurfaceMeshOps(next));
      handleChangeViewerKind("mesh");
      return;
    }

    if (surfaceViewerKind === "graph") {
      const baked = bakeGraphSurface({
        surfaceId: activeEqSurfaceId,
        graphExpr,
        domain: activeGraphDomain,
        resolution: graphResolution,
        label: buildActiveMeshLabel(),
      });
      if ("error" in baked) {
        setSurfaceMeshImportError(baked.error);
        return;
      }
      setMeshDataset(applySurfaceMeshOps(baked.mesh));
      handleChangeViewerKind("mesh");
      return;
    }

    if (surfaceViewerKind === "param") {
      const baked = bakeParamSurface({
        surfaceId: paramSurfaceId,
        domain: activeParamDomain,
        resolution: paramResolution,
        label: buildActiveMeshLabel(),
        customX: paramXExpr,
        customY: paramYExpr,
        customZ: paramZExpr,
      });
      if ("error" in baked) {
        setSurfaceMeshImportError(baked.error);
        return;
      }
      setMeshDataset(applySurfaceMeshOps(baked.mesh));
      handleChangeViewerKind("mesh");
      return;
    }

    if (surfaceViewerKind === "weierstrass") {
      const gExpr = (weierstrassGExpr ?? "z").trim() || "z";
      const phiExpr = (weierstrassPhiExpr ?? "1").trim() || "1";
      const baked = bakeWeierstrassSurface({
        gExpr,
        phiExpr,
        domain: activeWeierstrassDomain,
        resolution: weierstrassResolution,
        label: buildActiveMeshLabel(),
        recenterRescale: weierstrassRecenter,
      });
      if ("error" in baked) {
        setSurfaceMeshImportError(baked.error);
        return;
      }
      setMeshDataset(applySurfaceMeshOps(baked.mesh));
      handleChangeViewerKind("mesh");
      return;
    }

    if (surfaceViewerKind === "complex") {
      if (!surfaceMeshData?.positions?.length || !isComplexMapSurfaceLabel(surfaceMeshData?.label)) {
        setSurfaceMeshImportError("Complex map mesh not ready yet.");
        return;
      }
      setMeshDataset(applySurfaceMeshOps(surfaceMeshData));
      handleChangeViewerKind("mesh");
    }
  }, [
    surfaceViewerKind,
    activeCgalMesh,
    buildActiveMeshLabel,
    activeEqSurfaceId,
    graphExpr,
    activeGraphDomain,
    graphResolution,
    paramSurfaceId,
    activeParamDomain,
    paramResolution,
    paramXExpr,
    paramYExpr,
    paramZExpr,
    weierstrassGExpr,
    weierstrassPhiExpr,
    activeWeierstrassDomain,
    weierstrassResolution,
    weierstrassRecenter,
    surfaceMeshData,
    setMeshDataset,
    handleChangeViewerKind,
  ]);

  const handleParamGeodesicState = useCallback((state: ParamGeodesicState | null) => {
    paramGeodesicStateRef.current = state;
  }, []);

  const geodesicAdjacency = useMemo(() => {
    const map = new Map<
      string,
      {
        neighbors: number[][];
        weights: number[][];
        vertexToMerged?: Int32Array;
        mergedToVertex?: Int32Array;
        edgeSources?: number[][];
        edgeTargets?: number[][];
      }
    >();
    const meshData = surfaceSampleSet?.meshData ?? [];
    const cache = adjacencyCacheRef.current;
    for (const mesh of meshData) {
      const cached = cache.get(mesh.key);
      if (
        cached &&
        cached.positions === mesh.positions &&
        cached.indices === mesh.indices &&
        cached.vertexToMerged &&
        cached.edgeSources &&
        cached.edgeTargets
      ) {
        map.set(mesh.key, {
          neighbors: cached.neighbors,
          weights: cached.weights,
          vertexToMerged: cached.vertexToMerged,
          mergedToVertex: cached.mergedToVertex,
          edgeSources: cached.edgeSources,
          edgeTargets: cached.edgeTargets,
        });
        continue;
      }
      const adj = buildMeshAdjacency(mesh.indices, mesh.positions);
      cache.set(mesh.key, {
        positions: mesh.positions,
        indices: mesh.indices,
        neighbors: adj.neighbors,
        weights: adj.weights,
        vertexToMerged: adj.vertexToMerged,
        mergedToVertex: adj.mergedToVertex,
        edgeSources: adj.edgeSources,
        edgeTargets: adj.edgeTargets,
      });
      map.set(mesh.key, adj);
    }
    return map;
  }, [surfaceSampleSet]);

  const buildHeatMesh = useCallback(
    (params: {
      positions: ArrayLike<number>;
      indices: ArrayLike<number> | null;
      meshKey: string | null;
    }) => {
      const { positions, indices, meshKey } = params;
      const vertCount = Math.floor(positions.length / 3);
      const hasIndices = !!(indices && indices.length >= 3);
      const triCount = hasIndices ? Math.floor((indices as ArrayLike<number>).length / 3) : Math.floor(vertCount / 3);
      const meshAdj = meshKey ? geodesicAdjacency.get(meshKey) : null;
      const vertexToMerged = meshAdj?.vertexToMerged ?? null;
      const mergedToVertex = meshAdj?.mergedToVertex ?? null;
      const useMerge =
        !!vertexToMerged &&
        !!mergedToVertex &&
        mergedToVertex.length > 0 &&
        mergedToVertex.length < vertCount;

      const V: number[][] = [];
      if (useMerge && mergedToVertex) {
        for (let i = 0; i < mergedToVertex.length; i++) {
          const src = mergedToVertex[i];
          V.push([positions[src * 3], positions[src * 3 + 1], positions[src * 3 + 2]]);
        }
      } else {
        for (let i = 0; i + 2 < positions.length; i += 3) {
          V.push([positions[i], positions[i + 1], positions[i + 2]]);
        }
      }

      const F: number[][] = [];
      for (let t = 0; t < triCount; t++) {
        const base = t * 3;
        const a = hasIndices ? Number((indices as ArrayLike<number>)[base]) : base;
        const b = hasIndices ? Number((indices as ArrayLike<number>)[base + 1]) : base + 1;
        const c = hasIndices ? Number((indices as ArrayLike<number>)[base + 2]) : base + 2;
        const ma = useMerge && vertexToMerged ? vertexToMerged[a] : a;
        const mb = useMerge && vertexToMerged ? vertexToMerged[b] : b;
        const mc = useMerge && vertexToMerged ? vertexToMerged[c] : c;
        F.push([ma, mb, mc]);
      }

      const expandPhi = (phi: ArrayLike<number>) => {
        const out = new Float64Array(vertCount);
        if (useMerge && vertexToMerged) {
          for (let i = 0; i < vertCount; i++) {
            const mapped = vertexToMerged[i];
            out[i] =
              mapped != null && mapped >= 0 && mapped < phi.length
                ? Number(phi[mapped])
                : Number.NaN;
          }
        } else {
          const limit = Math.min(phi.length, out.length);
          for (let i = 0; i < limit; i++) {
            out[i] = Number(phi[i]);
          }
          for (let i = limit; i < out.length; i++) {
            out[i] = Number.NaN;
          }
        }
        return out;
      };

      return { V, F, expandPhi };
    },
    [geodesicAdjacency]
  );

  const buildAllowedVertexMask = useCallback(
    (meshKey: string, vertexCount: number, vertexToMerged?: Int32Array) => {
      if (!geodesicPathConstrain) return null;
      if (!selectionMask?.count || !surfaceSampleSet?.samples.length) return null;
      const allowed = new Uint8Array(vertexCount);
      const selected = selectionMask.selected;
      const samples = surfaceSampleSet.samples;
      const limit = Math.min(selected.length, samples.length);
      for (let i = 0; i < limit; i++) {
        if (!selected[i]) continue;
        const sample = samples[i];
        if (sample.meshKey !== meshKey || sample.vertexIndex == null) continue;
        const rawIndex = sample.vertexIndex;
        const mappedIndex = vertexToMerged ? vertexToMerged[rawIndex] : rawIndex;
        if (mappedIndex >= 0 && mappedIndex < vertexCount) {
          allowed[mappedIndex] = 1;
        }
      }
      return allowed;
    },
    [geodesicPathConstrain, selectionMask, surfaceSampleSet]
  );

  const formatGeodesicDebugInfo = useCallback(
    (payload: {
      neighbors: number[][];
      weights: number[][];
      dist: Float64Array;
      startIndex: number;
      endIndex: number;
      vertexToMerged?: Int32Array;
    }) => {
      const { neighbors, weights, dist, startIndex, endIndex, vertexToMerged } = payload;
      const vertexCount = neighbors.length;
      let edgeCount = 0;
      let lowDegree = 0;
      let nanWeights = 0;
      let mismatched = 0;
      let minW = Infinity;
      let maxW = -Infinity;
      for (let i = 0; i < neighbors.length; i++) {
        const degree = neighbors[i].length;
        edgeCount += degree;
        if (degree <= 2) lowDegree++;
        const ws = weights[i];
        if (!ws || ws.length !== degree) {
          mismatched++;
          continue;
        }
        for (let j = 0; j < ws.length; j++) {
          const w = ws[j];
          if (!Number.isFinite(w)) {
            nanWeights++;
            continue;
          }
          if (w < minW) minW = w;
          if (w > maxW) maxW = w;
        }
      }
      let reachable = 0;
      for (let i = 0; i < dist.length; i++) {
        if (Number.isFinite(dist[i])) reachable++;
      }
      const avgDegree = vertexCount ? edgeCount / vertexCount : 0;
      const startDegree = neighbors[startIndex]?.length ?? 0;
      const endDegree = neighbors[endIndex]?.length ?? 0;
      const mergedFrom = vertexToMerged ? vertexToMerged.length : vertexCount;
      const mergedNote = vertexToMerged ? ` merged=${vertexCount}/${mergedFrom}` : "";
      const weightNote = Number.isFinite(minW)
        ? ` w=${minW.toFixed(4)}..${maxW.toFixed(4)}`
        : "";
      const mismatchNote = mismatched ? ` mismatch=${mismatched}` : "";
      const nanNote = nanWeights ? ` nanW=${nanWeights}` : "";
      return `v=${vertexCount}${mergedNote} avgDeg=${avgDegree.toFixed(2)} lowDeg=${lowDegree} reachable=${reachable} startDeg=${startDegree} endDeg=${endDegree}${nanNote}${mismatchNote}${weightNote}`;
    },
    []
  );

  const computeGeodesicPath = useCallback(
    (start: GeodesicPathEndpoint, end: GeodesicPathEndpoint) => {
      setGeodesicPathIndices(null);
      setGeodesicPathLength(null);
      setGeodesicPathMessage(null);
      setGeodesicPathDebugInfo(null);

      if (start.meshKey !== end.meshKey) {
        setGeodesicPathMessage("Start/End on different meshes.");
        return;
      }
      const adj = geodesicAdjacency.get(start.meshKey);
      if (!adj) {
        setGeodesicPathMessage("No mesh adjacency available.");
        return;
      }
      const vertexToMerged = adj.vertexToMerged;
      const mergedToVertex = adj.mergedToVertex;
      const edgeSources = adj.edgeSources;
      const edgeTargets = adj.edgeTargets;
      const startIndex = vertexToMerged ? vertexToMerged[start.vertexIndex] : start.vertexIndex;
      const endIndex = vertexToMerged ? vertexToMerged[end.vertexIndex] : end.vertexIndex;
      if (startIndex == null || endIndex == null) {
        setGeodesicPathMessage("Start/End outside mesh bounds.");
        return;
      }
      if (
        startIndex < 0 ||
        endIndex < 0 ||
        startIndex >= adj.neighbors.length ||
        endIndex >= adj.neighbors.length
      ) {
        setGeodesicPathMessage("Start/End outside mesh bounds.");
        return;
      }

      const allowed = buildAllowedVertexMask(start.meshKey, adj.neighbors.length, vertexToMerged);
      if (geodesicPathConstrain) {
        if (!allowed || !allowed[startIndex] || !allowed[endIndex]) {
          setGeodesicPathMessage("Start/End not in selection.");
          return;
        }
      }

      const { dist, prev } = dijkstraDistancesAndPrev({
        seedIndex: startIndex,
        neighbors: adj.neighbors,
        weights: adj.weights,
        allowed,
        targetIndex: endIndex,
      });
      const length = dist[endIndex];
      const path = reconstructPath(prev, startIndex, endIndex);
      if (!path.length || !Number.isFinite(length)) {
        setGeodesicPathMessage("No path found.");
        if (geodesicPathDebug) {
          const debugInfo = formatGeodesicDebugInfo({
            neighbors: adj.neighbors,
            weights: adj.weights,
            dist,
            startIndex,
            endIndex,
            vertexToMerged,
          });
          setGeodesicPathDebugInfo(debugInfo);
          console.log("[geodesic] no path", {
            meshKey: start.meshKey,
            startIndex,
            endIndex,
            debugInfo,
          });
        }
        return;
      }

      let mappedPath = mergedToVertex ? path.map((idx) => mergedToVertex[idx]) : path;
      if (vertexToMerged && edgeSources && edgeTargets) {
        const expanded: number[] = [];
        const startRaw = start.vertexIndex;
        const endRaw = end.vertexIndex;
        expanded.push(startRaw);
        for (let i = 0; i + 1 < path.length; i++) {
          const from = path[i];
          const to = path[i + 1];
          const neighbors = adj.neighbors[from];
          const edgeIdx = neighbors ? neighbors.indexOf(to) : -1;
          if (edgeIdx < 0) continue;
          const a = edgeSources[from]?.[edgeIdx];
          const b = edgeTargets[from]?.[edgeIdx];
          if (a == null || b == null) continue;
          if (expanded[expanded.length - 1] !== a) expanded.push(a);
          if (expanded[expanded.length - 1] !== b) expanded.push(b);
        }
        if (expanded[expanded.length - 1] !== endRaw) expanded.push(endRaw);
        mappedPath = expanded;
      }
      let resolvedLength = length;
      const mesh = surfaceSampleSet?.meshData?.find((m) => m.key === start.meshKey);
      const positions = mesh?.positions;
      if (positions && positions.length >= 3) {
        const last = Math.floor(positions.length / 3);
        const startRaw = start.vertexIndex;
        const endRaw = end.vertexIndex;
        const isParamSphere =
          geodesicPathSmooth && surfaceViewerKind === "param" && paramSurfaceIdForView === "sphere";
        const isImplicitSphere = surfaceViewerKind === "implicit" && activeEqSurfaceId === "sphere";
        const canSphere =
          (isParamSphere || isImplicitSphere) &&
          startRaw >= 0 &&
          endRaw >= 0 &&
          startRaw < last &&
          endRaw < last;
        if (canSphere) {
          const ax = positions[startRaw * 3];
          const ay = positions[startRaw * 3 + 1];
          const az = positions[startRaw * 3 + 2];
          const bx = positions[endRaw * 3];
          const by = positions[endRaw * 3 + 1];
          const bz = positions[endRaw * 3 + 2];
          const aLen = Math.hypot(ax, ay, az);
          const bLen = Math.hypot(bx, by, bz);
          const r = (aLen + bLen) * 0.5;
          if (r > 1e-8) {
            const dot = (ax * bx + ay * by + az * bz) / (r * r);
            const cos = Math.min(1, Math.max(-1, dot));
            const angle = Math.acos(cos);
            if (Number.isFinite(angle)) {
              resolvedLength = r * angle;
            }
          }
        } else if (mappedPath.length >= 2) {
          let acc = 0;
          let ok = true;
          for (let i = 1; i < mappedPath.length; i++) {
            const a = mappedPath[i - 1];
            const b = mappedPath[i];
            if (a < 0 || b < 0 || a >= last || b >= last) {
              ok = false;
              break;
            }
            const ax = positions[a * 3];
            const ay = positions[a * 3 + 1];
            const az = positions[a * 3 + 2];
            const bx = positions[b * 3];
            const by = positions[b * 3 + 1];
            const bz = positions[b * 3 + 2];
            const dx = bx - ax;
            const dy = by - ay;
            const dz = bz - az;
            const seg = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (!Number.isFinite(seg)) {
              ok = false;
              break;
            }
            acc += seg;
          }
          if (ok && Number.isFinite(acc)) {
            resolvedLength = acc;
          }
        }
      }
      setGeodesicPathIndices(mappedPath);
      setGeodesicPathLength(resolvedLength);
      if (geodesicPathDebug) {
        const debugInfo = formatGeodesicDebugInfo({
          neighbors: adj.neighbors,
          weights: adj.weights,
          dist,
          startIndex,
          endIndex,
          vertexToMerged,
        });
        setGeodesicPathDebugInfo(debugInfo);
      }
    },
    [
      buildAllowedVertexMask,
      formatGeodesicDebugInfo,
      geodesicAdjacency,
      geodesicPathConstrain,
      geodesicPathDebug,
      geodesicPathSmooth,
      paramSurfaceIdForView,
      activeEqSurfaceId,
      surfaceViewerKind,
      surfaceSampleSet,
    ]
  );

  useEffect(() => {
    if (geodesicPathConstrain && !selectionMask?.count) {
      setGeodesicPathConstrain(false);
    }
  }, [geodesicPathConstrain, selectionMask?.count]);

  useEffect(() => {
    if (geodesicHeatEnabled) setGeodesicPathEnabled(false);
  }, [geodesicHeatEnabled]);

  useEffect(() => {
    if (geodesicPathEnabled) setGeodesicHeatEnabled(false);
  }, [geodesicPathEnabled]);

  useEffect(() => {
    if (!geodesicPathStart || !geodesicPathEnd) {
      setGeodesicPathIndices(null);
      setGeodesicPathLength(null);
      return;
    }
    computeGeodesicPath(geodesicPathStart, geodesicPathEnd);
  }, [
    computeGeodesicPath,
    geodesicPathConstrain,
    geodesicPathEnd,
    geodesicPathSmooth,
    geodesicPathStart,
    selectionMask,
    surfaceSampleSet,
  ]);

  const handleSurfaceSelectionPick = useCallback(
    (payload: {
      point: { x: number; y: number; z: number };
      normal: { x: number; y: number; z: number };
      uv?: { u: number; v: number };
      sampleIndex?: number;
      meshKey?: string;
      vertexIndex?: number;
    }) => {
      if (!selectRegionEnabled) return;
      console.log("[App] surface selection pick", {
        point: payload.point,
        normal: payload.normal,
        uv: payload.uv,
        selectionRadius,
        selectionUseUV,
      });
      setSelectionMaskOverride(null);
      if (payload.sampleIndex != null && payload.meshKey && payload.vertexIndex != null) {
        setSelectionSeed({
          sampleIndex: payload.sampleIndex,
          meshKey: payload.meshKey,
          vertexIndex: payload.vertexIndex,
        });
      } else {
        setSelectionSeed(null);
      }
      const nextSelection: RegionSelection =
        selectionMode === "euclidean" && selectionUseUV && payload.uv
          ? {
              kind: "surfaceDisk",
              centerUV: payload.uv,
              radius: selectionRadius,
              useUV: true,
            }
          : {
              kind: "surfaceDisk",
              centerWorld: new THREE.Vector3(payload.point.x, payload.point.y, payload.point.z),
              radius: selectionRadius,
            };
      setSelection(nextSelection);
    },
    [selectRegionEnabled, selectionRadius, selectionUseUV, selectionMode]
  );

  const handleGeodesicPathPick = useCallback(
    (payload: {
      point: { x: number; y: number; z: number };
      normal: { x: number; y: number; z: number };
      uv?: { u: number; v: number };
      sampleIndex?: number;
      meshKey?: string;
      vertexIndex?: number;
    }) => {
      if (!geodesicPathEnabled) return;
      if (!payload.meshKey || payload.vertexIndex == null) {
        setGeodesicPathMessage("No vertex picked.");
        return;
      }

      const picked: GeodesicPathEndpoint = {
        meshKey: payload.meshKey,
        vertexIndex: payload.vertexIndex,
      };

      if (!geodesicPathStart) {
        setGeodesicPathStart(picked);
        setGeodesicPathEnd(null);
        setGeodesicPathIndices(null);
        setGeodesicPathLength(null);
        setGeodesicPathMessage(null);
        return;
      }

      if (!geodesicPathEnd) {
        setGeodesicPathEnd(picked);
        return;
      }

      setGeodesicPathStart(picked);
      setGeodesicPathEnd(null);
      setGeodesicPathIndices(null);
      setGeodesicPathLength(null);
      setGeodesicPathMessage(null);
    },
    [geodesicPathEnabled, geodesicPathEnd, geodesicPathStart]
  );

  const handleGeodesicHeatPick = useCallback(
    (payload: {
      point: { x: number; y: number; z: number };
      normal: { x: number; y: number; z: number };
      meshKey?: string;
      faceIndex?: number;
      bary?: [number, number, number];
      uv?: { u: number; v: number };
    }) => {
      if (!geodesicHeatEnabled) return;
      if (!payload.meshKey || payload.faceIndex == null || !payload.bary) {
        setGeodesicHeatMessage("No face picked (mesh required).");
        return;
      }
      const picked: GeodesicHeatEndpoint = {
        meshKey: payload.meshKey,
        faceIndex: payload.faceIndex,
        bary: payload.bary,
        point: payload.point,
        uv: payload.uv,
      };
      if (!geodesicHeatStart) {
        setGeodesicHeatStart(picked);
        setGeodesicHeatEnd(null);
        setGeodesicHeatPolylines(null);
        setGeodesicHeatLength(null);
        setGeodesicHeatMessage(null);
        return;
      }
      if (!geodesicHeatEnd) {
        setGeodesicHeatEnd(picked);
        setGeodesicHeatMessage(null);
        return;
      }
      setGeodesicHeatStart(picked);
      setGeodesicHeatEnd(null);
      setGeodesicHeatPolylines(null);
      setGeodesicHeatLength(null);
      setGeodesicHeatMessage(null);
    },
    [geodesicHeatEnabled, geodesicHeatEnd, geodesicHeatStart]
  );

  const handleGeodesicDiskPick = useCallback(
    (payload: {
      point: { x: number; y: number; z: number };
      normal: { x: number; y: number; z: number };
      meshKey?: string;
      faceIndex?: number;
      bary?: [number, number, number];
      uv?: { u: number; v: number };
    }) => {
      if (!geodesicDiskEnabled) return;
      if (!payload.meshKey || payload.faceIndex == null || !payload.bary) {
        setGeodesicDiskMessage("No face picked (mesh required).");
        return;
      }
      geodesicDiskRequestIdRef.current += 1;
      const clampBary = (raw: [number, number, number]) => {
        const c0 = Math.max(0, raw[0]);
        const c1 = Math.max(0, raw[1]);
        const c2 = Math.max(0, raw[2]);
        const sum = c0 + c1 + c2;
        if (!Number.isFinite(sum) || Math.abs(sum) <= 1e-12) return raw;
        return [c0 / sum, c1 / sum, c2 / sum] as [number, number, number];
      };
      const barySum = payload.bary[0] + payload.bary[1] + payload.bary[2];
      const bary = clampBary(
        Number.isFinite(barySum) && Math.abs(barySum) > 1e-12
          ? ([
              payload.bary[0] / barySum,
              payload.bary[1] / barySum,
              payload.bary[2] / barySum,
            ] as [number, number, number])
          : payload.bary
      );
      const picked: GeodesicDiskCenter = {
        meshKey: payload.meshKey,
        faceIndex: payload.faceIndex,
        bary,
        point: payload.point,
        normal: payload.normal,
        uv: payload.uv,
      };
      setGeodesicDiskCenter(picked);
      setGeodesicDiskPhi(null);
      setGeodesicDiskPhiMethod(null);
      setGeodesicDiskPhiKey(null);
      setGeodesicDiskPickMode(false);
      setGeodesicDiskMessage(null);
    },
    [geodesicDiskEnabled]
  );

  const handleChangeGeodesicDiskRadius = useCallback((value: number) => {
    geodesicDiskRadiusTouchedRef.current = true;
    setGeodesicDiskRadius(value);
  }, []);

  const handleClearGeodesicPath = useCallback(() => {
    setGeodesicPathStart(null);
    setGeodesicPathEnd(null);
    setGeodesicPathIndices(null);
    setGeodesicPathLength(null);
    setGeodesicPathMessage(null);
    setGeodesicPathDebugInfo(null);
  }, []);

  const handleClearGeodesicHeat = useCallback(() => {
    setGeodesicHeatStart(null);
    setGeodesicHeatEnd(null);
    setGeodesicHeatPolylines(null);
    setGeodesicHeatLength(null);
    setGeodesicHeatMessage(null);
    setGeodesicHeatPhi(null);
    setGeodesicHeatMeshToken(null);
    setGeodesicHeatMeshKey(null);
  }, []);

  const handleClearGeodesicDisk = useCallback(() => {
    geodesicDiskRequestIdRef.current += 1;
    setGeodesicDiskCenter(null);
    setGeodesicDiskMessage(null);
    setGeodesicDiskPhi(null);
    setGeodesicDiskPhiMeshKey(null);
    setGeodesicDiskPhiMeshToken(null);
    setGeodesicDiskPhiMethod(null);
    setGeodesicDiskPhiKey(null);
    setGeodesicDiskPickMode(false);
  }, []);

  useEffect(() => {
    handleClearGeodesicPath();
  }, [handleClearGeodesicPath, surfaceSampleSet]);

  useEffect(() => {
    handleClearGeodesicHeat();
  }, [handleClearGeodesicHeat, cgalMeshToken, activeEqSurfaceId, implicitExpr]);
  useEffect(() => {
    handleClearGeodesicHeat();
  }, [handleClearGeodesicHeat, surfaceViewerKind]);
  useEffect(() => {
    if (surfaceViewerKind !== "graph") return;
    handleClearGeodesicHeat();
  }, [
    handleClearGeodesicHeat,
    surfaceViewerKind,
    activeEqSurfaceId,
    graphExpr,
    graphResolution,
    activeGraphDomain?.xSpan,
    activeGraphDomain?.ySpan,
  ]);

  useEffect(() => {
    if (surfaceViewerKind !== "param" && surfaceViewerKind !== "weierstrass") return;
    handleClearGeodesicHeat();
  }, [
    handleClearGeodesicHeat,
    surfaceViewerKind,
    paramSurfaceIdForView,
    paramXExpr,
    paramYExpr,
    paramZExpr,
    activeParamLikeResolution,
    activeParamLikeDomain?.uMin,
    activeParamLikeDomain?.uMax,
    activeParamLikeDomain?.vMin,
    activeParamLikeDomain?.vMax,
    weierstrassGExpr,
    weierstrassPhiExpr,
    weierstrassResolution,
    weierstrassRecenter,
  ]);

  useEffect(() => {
    handleClearGeodesicDisk();
  }, [handleClearGeodesicDisk, cgalMeshToken, activeEqSurfaceId, implicitExpr]);
  useEffect(() => {
    handleClearGeodesicDisk();
  }, [handleClearGeodesicDisk, surfaceViewerKind]);
  useEffect(() => {
    if (surfaceViewerKind !== "graph") return;
    handleClearGeodesicDisk();
  }, [
    handleClearGeodesicDisk,
    surfaceViewerKind,
    activeEqSurfaceId,
    graphExpr,
    graphResolution,
    activeGraphDomain?.xSpan,
    activeGraphDomain?.ySpan,
  ]);

  useEffect(() => {
    if (surfaceViewerKind !== "param" && surfaceViewerKind !== "weierstrass") return;
    handleClearGeodesicDisk();
  }, [
    handleClearGeodesicDisk,
    surfaceViewerKind,
    paramSurfaceIdForView,
    paramXExpr,
    paramYExpr,
    paramZExpr,
    activeParamLikeResolution,
    activeParamLikeDomain?.uMin,
    activeParamLikeDomain?.uMax,
    activeParamLikeDomain?.vMin,
    activeParamLikeDomain?.vMax,
    weierstrassGExpr,
    weierstrassPhiExpr,
    weierstrassResolution,
    weierstrassRecenter,
  ]);

  const handleClearSelection = useCallback(() => {
    setSelection(null);
    setSelectionMask(null);
    setSelectionSeed(null);
    setSelectionMaskOverride(null);
  }, []);

  const handleRefreshSelectionStats = useCallback(() => {
    setSelectionStatsToken((v) => v + 1);
  }, []);

  const handleGaussSelection = useCallback((selection: GaussCapSelection) => {
    console.log("[App] gauss cap selection", selection);
    setSelectionMaskOverride(null);
    setSelection(selection);
  }, []);

  const selectionSphere =
    selectionSphereVisible && selection?.kind === "surfaceDisk" && !selection.useUV
      ? {
          center: { x: selection.centerWorld.x, y: selection.centerWorld.y, z: selection.centerWorld.z },
          radius: selection.radius,
        }
      : null;

  useEffect(() => {
    if (!showGaussMap) {
      setGaussPoints([]);
      setGaussHoverIndex(null);
    }
  }, [showGaussMap]);

  useEffect(() => {
    setGaussHoverIndex(null);
  }, [gaussPoints]);

  useEffect(() => {
    if (selectionMaskOverride) {
      setSelectionMask(selectionMaskOverride);
      return;
    }
    if (!surfaceSampleSet || !selection) {
      setSelectionMask(null);
      console.log("[App] selection cleared", {
        samples: surfaceSampleSet?.samples.length ?? 0,
        selection: selection ? selection.kind : "none",
      });
      return;
    }
    let mask: SelectionMask;
    if (selectionMode === "geodesic" && selection.kind === "surfaceDisk" && !selection.useUV) {
      const seed = selectionSeed;
      const meshAdj = seed ? geodesicAdjacency.get(seed.meshKey) : null;
      if (seed && meshAdj && surfaceSampleSet.meshData?.length) {
        const vertexToMerged = meshAdj.vertexToMerged;
        const seedIndex = vertexToMerged ? vertexToMerged[seed.vertexIndex] : seed.vertexIndex;
        if (seedIndex == null || seedIndex < 0 || seedIndex >= meshAdj.neighbors.length) {
          mask = { selected: new Uint8Array(surfaceSampleSet.samples.length), count: 0 };
          setSelectionMask(mask);
          return;
        }
        const dist = computeGeodesicDistances({
          seedIndex,
          neighbors: meshAdj.neighbors,
          weights: meshAdj.weights,
          maxDist: selection.radius,
        });
        const selected = new Uint8Array(surfaceSampleSet.samples.length);
        let hits = 0;
        for (let i = 0; i < surfaceSampleSet.samples.length; i++) {
          const sample = surfaceSampleSet.samples[i];
          if (sample.meshKey !== seed.meshKey || sample.vertexIndex == null) continue;
          const rawIndex = sample.vertexIndex;
          const mappedIndex = vertexToMerged ? vertexToMerged[rawIndex] : rawIndex;
          if (mappedIndex != null && mappedIndex >= 0 && mappedIndex < dist.length && dist[mappedIndex] <= selection.radius) {
            selected[i] = 1;
            hits++;
          }
        }
        mask = { selected, count: hits };
      } else {
        mask = { selected: new Uint8Array(surfaceSampleSet.samples.length), count: 0 };
      }
    } else {
      mask = computeSelectionMask(surfaceSampleSet.samples, selection);
    }
    console.log("[App] computed selection mask", {
      count: mask.count,
      totalSamples: surfaceSampleSet.samples.length,
      selection: selection.kind,
      radius: selection.kind === "surfaceDisk" ? selection.radius : undefined,
    });
    setSelectionMask(mask);
  }, [surfaceSampleSet, selection, selectionMode, selectionSeed, geodesicAdjacency, selectionStatsToken, selectionMaskOverride]);

  const selectionIndices = useMemo(() => {
    if (!selectionMask?.selected?.length) return [];
    const selected = selectionMask.selected;
    const indices: number[] = [];
    for (let i = 0; i < selected.length; i++) {
      if (selected[i]) indices.push(i);
    }
    return indices;
  }, [selectionMask]);

  useEffect(() => {
    if (!activeInteraction || activeInteraction.kind !== "select_region") return;
    if (!selectionMask?.count || !selectionIndices.length) return;
    const meta = workbookGraph.blockMetaById.get(activeInteraction.blockId);
    if (!meta) return;
    handleUpdateInteraction(activeInteraction.stageId, activeInteraction.blockId, {
      status: "captured",
      summary: `Selected ${selectionMask.count} samples.`,
      mask: {
        meshKey: selectionSeed?.meshKey,
        indices: selectionIndices,
        count: selectionMask.count,
      },
    });
    setActiveInteraction(null);
    restoreInteractionState();
  }, [
    activeInteraction,
    handleUpdateInteraction,
    restoreInteractionState,
    selectionIndices,
    selectionMask,
    selectionSeed?.meshKey,
    workbookGraph,
  ]);

  const selectionBaseArrays = useMemo(() => {
    if (!surfaceSampleSet?.samples?.length) return null;
    const count = surfaceSampleSet.samples.length;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const sample = surfaceSampleSet.samples[i];
      const base = i * 3;
      positions[base] = sample.position.x;
      positions[base + 1] = sample.position.y;
      positions[base + 2] = sample.position.z;
      normals[base] = sample.normal.x;
      normals[base + 1] = sample.normal.y;
      normals[base + 2] = sample.normal.z;
    }
    return { positions, normals };
  }, [surfaceSampleSet]);

  const selectionCurvatures = useMemo(() => {
    if (!surfaceSampleSet?.samples?.length) return null;
    if (surfaceSampleSet.curvatures) return surfaceSampleSet.curvatures;
    if (surfaceViewerKind !== "graph" || !isGraphSurface(activeEqSurfaceId)) return null;
    const count = surfaceSampleSet.samples.length;
    const K = new Float32Array(count);
    const H = new Float32Array(count);
    const k1 = new Float32Array(count);
    const k2 = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const sample = surfaceSampleSet.samples[i];
      const curv = computeGraphInvariantsFromProbe(activeEqSurfaceId, graphExpr, sample.position);
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
    return { K, H, k1, k2 };
  }, [surfaceSampleSet, surfaceViewerKind, activeEqSurfaceId, graphExpr]);

  const inspectMetrics = useMemo(() => {
    if (inspectIdx == null || !selectionCurvatures) return null;
    const out: { K?: number; H?: number; k1?: number; k2?: number } = {};
    const read = (arr: Float32Array | undefined, key: "K" | "H" | "k1" | "k2") => {
      if (!arr || inspectIdx < 0 || inspectIdx >= arr.length) return;
      const v = arr[inspectIdx];
      if (Number.isFinite(v)) out[key] = v;
    };
    read(selectionCurvatures.K, "K");
    read(selectionCurvatures.H, "H");
    read(selectionCurvatures.k1, "k1");
    read(selectionCurvatures.k2, "k2");
    return Object.keys(out).length ? out : null;
  }, [inspectIdx, selectionCurvatures]);

  const handleInspectPick = useCallback((info: { index: number; point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } }) => {
    setInspectIdx(info.index);
    setInspectPos(info.point);
    setInspectNormal(info.normal);
  }, []);

  const availableSelectionMetrics = useMemo(() => {
    if (!selectionCurvatures) return [];
    const list: SelectionMetricKey[] = [];
    if (selectionCurvatures.K) list.push("K");
    if (selectionCurvatures.H) list.push("H");
    if (selectionCurvatures.k1) list.push("k1");
    if (selectionCurvatures.k2) list.push("k2");
    return list;
  }, [selectionCurvatures]);

  useEffect(() => {
    if (!availableSelectionMetrics.length) return;
    if (!availableSelectionMetrics.includes(selectedMetric)) {
      setSelectedMetric(availableSelectionMetrics[0]);
    }
  }, [availableSelectionMetrics, selectedMetric]);

  const selectionStats = useMemo(() => {
    if (!selectionBaseArrays) {
      return computeSelectionStats({
        selectedIndices: [],
        positions: new Float32Array(0),
        normals: new Float32Array(0),
      });
    }
    return computeSelectionStats({
      selectedIndices: selectionIndices,
      positions: selectionBaseArrays.positions,
      normals: selectionBaseArrays.normals,
      metrics: selectionCurvatures ?? undefined,
      histogramMetric: selectedMetric,
      binCount: 24,
      normalizeMeanNormal: true,
    });
  }, [selectionBaseArrays, selectionIndices, selectionCurvatures, selectedMetric, selectionStatsToken]);

  const complexMeshReady =
    surfaceViewerKind === "complex" &&
    !!surfaceMeshData?.positions?.length &&
    isComplexMapSurfaceLabel(surfaceMeshData?.label);
  const surfaceMeshExportable =
    surfaceViewerKind === "complex"
      ? complexMeshReady
      : !isMeshLikeViewer && (surfaceViewerKind !== "implicit" || !!activeCgalMesh);
  const vtkMeshAvailable = !!surfaceSampleSet?.meshData?.length;

  const cgalMeshInfo = useMemo(() => {
    if (!activeCgalMesh) return null;
    return {
      vertexCount: Math.floor(activeCgalMesh.positions.length / 3),
      triCount: Math.floor(activeCgalMesh.indices.length / 3),
    };
  }, [activeCgalMesh]);

  const geodesicDiskPhiActive = useMemo(() => {
    if (!geodesicDiskPhi || !geodesicDiskPhiMethod) return false;
    if (geodesicDiskPhiMethod !== geodesicDiskMethod) return false;
    if (surfaceViewerKind === "implicit") {
      return geodesicDiskPhiMeshToken === cgalMeshToken;
    }
    if (!geodesicDiskPhiMeshKey) return false;
    return !!surfaceSampleSet?.meshData?.some((m) => m.key === geodesicDiskPhiMeshKey);
  }, [
    geodesicDiskPhi,
    geodesicDiskPhiMethod,
    geodesicDiskMethod,
    geodesicDiskPhiMeshKey,
    geodesicDiskPhiMeshToken,
    cgalMeshToken,
    surfaceViewerKind,
    surfaceSampleSet?.meshData,
  ]);

  const geodesicDiskMeshData = useMemo(() => {
    if (!geodesicDiskCenter) return null;
    if (surfaceViewerKind === "implicit") {
      const positions = activeCgalMesh?.positions ?? null;
      const indices = activeCgalMesh?.indices ?? null;
      if (!positions || positions.length < 3 || !indices || indices.length < 3) return null;
      return { positions, indices };
    }
    const meshData = surfaceSampleSet?.meshData?.find((m) => m.key === geodesicDiskCenter.meshKey);
    if (!meshData) return null;
    return { positions: meshData.positions, indices: meshData.indices ?? null };
  }, [geodesicDiskCenter, surfaceViewerKind, activeCgalMesh, surfaceSampleSet?.meshData]);

  const geodesicDiskResult = useMemo(() => {
    if (!geodesicDiskEnabled || !geodesicDiskPhiActive || !geodesicDiskMeshData || !geodesicDiskPhi) {
      return null;
    }
    return buildGeodesicDisk({
      positions: geodesicDiskMeshData.positions,
      indices: geodesicDiskMeshData.indices,
      phi: geodesicDiskPhi,
      radius: geodesicDiskRadiusApplied,
    });
  }, [
    geodesicDiskEnabled,
    geodesicDiskPhiActive,
    geodesicDiskMeshData,
    geodesicDiskPhi,
    geodesicDiskRadiusApplied,
  ]);

  const geodesicDiskSelectionIndices = useMemo(() => {
    if (!geodesicDiskEnabled || !geodesicDiskPhiActive || !geodesicDiskPhi) return [];
    if (!surfaceSampleSet?.samples?.length) return [];
    const meshKey = geodesicDiskPhiMeshKey ?? geodesicDiskCenter?.meshKey;
    if (!meshKey) return [];
    const selected: number[] = [];
    const samples = surfaceSampleSet.samples;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      if (sample.meshKey !== meshKey || sample.vertexIndex == null) continue;
      const idx = sample.vertexIndex;
      if (idx < 0 || idx >= geodesicDiskPhi.length) continue;
      if (geodesicDiskPhi[idx] <= geodesicDiskRadiusApplied) {
        selected.push(i);
      }
    }
    return selected;
  }, [
    geodesicDiskEnabled,
    geodesicDiskPhiActive,
    geodesicDiskPhi,
    geodesicDiskRadiusApplied,
    geodesicDiskPhiMeshKey,
    geodesicDiskCenter,
    surfaceSampleSet,
  ]);

  const geodesicDiskSelectionStats = useMemo(() => {
    if (!selectionBaseArrays) {
      return computeSelectionStats({
        selectedIndices: [],
        positions: new Float32Array(0),
        normals: new Float32Array(0),
      });
    }
    return computeSelectionStats({
      selectedIndices: geodesicDiskSelectionIndices,
      positions: selectionBaseArrays.positions,
      normals: selectionBaseArrays.normals,
      metrics: selectionCurvatures ?? undefined,
      normalizeMeanNormal: true,
    });
  }, [selectionBaseArrays, selectionCurvatures, geodesicDiskSelectionIndices]);

  const implicitDomainBBox = useCallback((domain: ImplicitDomain) => {
    const size = Math.max(Number(domain.xSpan), Number(domain.ySpan));
    const half = Number.isFinite(size) && size > 0 ? size : 1;
    return {
      min: [-half, -half, -half] as [number, number, number],
      max: [half, half, half] as [number, number, number],
    };
  }, []);

  useEffect(() => {
    if (surfaceViewerKind !== "implicit") return;
    let alive = true;
    (async () => {
      const res = await cgalHealth();
      if (!alive) return;
      setCgalHealthState(res);
    })();
    return () => {
      alive = false;
    };
  }, [surfaceViewerKind]);
  const geodesicHeatGraphAvailable =
    surfaceViewerKind === "graph" &&
    isGraphSurface(activeEqSurfaceId) &&
    !!surfaceSampleSet?.meshData?.length;
  const geodesicHeatParamAvailable =
    (surfaceViewerKind === "param" || surfaceViewerKind === "weierstrass") &&
    !!surfaceSampleSet?.meshData?.length;
  const geodesicHeatMeshAvailable =
    (surfaceViewerKind === "mesh" || surfaceViewerKind === "complex") && !!surfaceSampleSet?.meshData?.length;
  const geodesicHeatAvailable =
    (surfaceViewerKind === "implicit" && !!activeCgalMesh) ||
    geodesicHeatGraphAvailable ||
    geodesicHeatParamAvailable ||
    geodesicHeatMeshAvailable;
  const geodesicHeatHeatmapAllowed =
    (surfaceViewerKind === "implicit" ||
      surfaceViewerKind === "graph" ||
      surfaceViewerKind === "param" ||
      surfaceViewerKind === "weierstrass" ||
      surfaceViewerKind === "mesh" ||
      surfaceViewerKind === "complex") &&
    !geodesicHeatUseContinuous;
  const geodesicHeatHeatmapActive = useMemo(() => {
    if (!geodesicHeatHeatmapAllowed) return false;
    if (!geodesicHeatShowHeatmap || !geodesicHeatPhi?.length) return false;
    if (surfaceViewerKind === "implicit") {
      return geodesicHeatMeshToken === cgalMeshToken;
    }
    if (
      surfaceViewerKind === "graph" ||
      surfaceViewerKind === "param" ||
      surfaceViewerKind === "weierstrass" ||
      surfaceViewerKind === "mesh" ||
      surfaceViewerKind === "complex"
    ) {
      if (!geodesicHeatMeshKey) return false;
      const meshes = surfaceSampleSet?.meshData;
      return !!meshes?.some((m) => m.key === geodesicHeatMeshKey);
    }
    return false;
  }, [
    geodesicHeatShowHeatmap,
    geodesicHeatPhi,
    geodesicHeatMeshToken,
    geodesicHeatMeshKey,
    geodesicHeatHeatmapAllowed,
    cgalMeshToken,
    surfaceViewerKind,
    surfaceSampleSet?.meshData,
  ]);
  const geodesicHeatHeatmapValues = geodesicHeatHeatmapActive ? geodesicHeatPhi : null;
  const geodesicHeatUnavailableReason = useMemo(() => {
    if (geodesicHeatAvailable) return "";
    if (surfaceViewerKind === "implicit") return "Run CGAL mesh first";
    if (surfaceViewerKind === "graph") {
      return "Graph mesh not ready";
    }
    if (surfaceViewerKind === "param" || surfaceViewerKind === "weierstrass") {
      return "Param mesh not ready";
    }
    if (surfaceViewerKind === "mesh" || surfaceViewerKind === "complex") {
      return "Surface mesh not ready";
    }
    return "Heat path only available in implicit, graph, param/weierstrass, or mesh";
  }, [activeEqSurfaceId, geodesicHeatAvailable, surfaceViewerKind]);
  const geodesicHeatHeatmapReason = useMemo(() => {
    if (geodesicHeatHeatmapAllowed) return "";
    if (geodesicHeatUseContinuous) return "Heatmap requires mesh heat (disable continuous ODE)";
    return "Heatmap only available in implicit, graph, param/weierstrass, or mesh";
  }, [geodesicHeatHeatmapAllowed, geodesicHeatUseContinuous]);
  const geodesicDiskAvailable = geodesicHeatAvailable;
  const geodesicDiskUnavailableReason = useMemo(() => {
    if (geodesicDiskAvailable) return "";
    if (surfaceViewerKind === "implicit") return "Run CGAL mesh first";
    if (surfaceViewerKind === "graph") return "Graph mesh not ready";
    if (surfaceViewerKind === "param" || surfaceViewerKind === "weierstrass") {
      return "Param mesh not ready";
    }
    if (surfaceViewerKind === "mesh" || surfaceViewerKind === "complex") {
      return "Surface mesh not ready";
    }
    return "Disk only available in implicit, graph, param/weierstrass, or mesh";
  }, [geodesicDiskAvailable, surfaceViewerKind]);

  useEffect(() => {
    if (!geodesicHeatAvailable) setGeodesicHeatEnabled(false);
  }, [geodesicHeatAvailable]);
  useEffect(() => {
    if (!geodesicDiskAvailable) {
      setGeodesicDiskEnabled(false);
      setGeodesicDiskPickMode(false);
    }
  }, [geodesicDiskAvailable]);
  useEffect(() => {
    if (!geodesicHeatHeatmapAllowed && geodesicHeatShowHeatmap) {
      setGeodesicHeatShowHeatmap(false);
    }
  }, [geodesicHeatHeatmapAllowed, geodesicHeatShowHeatmap]);
  useEffect(() => {
    const allowed =
      surfaceViewerKind === "graph" ||
      surfaceViewerKind === "param" ||
      surfaceViewerKind === "weierstrass";
    if (!allowed && geodesicHeatUseContinuous) {
      setGeodesicHeatUseContinuous(false);
    }
  }, [surfaceViewerKind, geodesicHeatUseContinuous]);
  useEffect(() => {
    if (!geodesicDiskAutoUpdate) return;
    setGeodesicDiskRadiusApplied(geodesicDiskRadius);
  }, [geodesicDiskAutoUpdate, geodesicDiskRadius]);
  useEffect(() => {
    setGeodesicDiskPhi(null);
    setGeodesicDiskPhiMethod(null);
    setGeodesicDiskPhiKey(null);
  }, [geodesicDiskMethod]);

  const handleRunGeodesicHeat = useCallback(
    async (override?: { start: GeodesicHeatEndpoint; end: GeodesicHeatEndpoint }) => {
    setGeodesicHeatMessage(null);
    setGeodesicHeatPolylines(null);
    setGeodesicHeatLength(null);
    setGeodesicHeatPhi(null);
    setGeodesicHeatMeshToken(null);
    setGeodesicHeatMeshKey(null);

    const resolvedStart = override?.start ?? geodesicHeatStart;
    const resolvedEnd = override?.end ?? geodesicHeatEnd;
    const isImplicitHeat = surfaceViewerKind === "implicit";
    const isGraphHeat = surfaceViewerKind === "graph" && isGraphSurface(activeEqSurfaceId);
    const isParamHeat = surfaceViewerKind === "param" || surfaceViewerKind === "weierstrass";
    const wantPhi = geodesicHeatShowHeatmap && !geodesicHeatUseContinuous;
    if (!isImplicitHeat && !isGraphHeat && !isParamHeat) {
      setGeodesicHeatMessage("Heat path is available only in implicit, graph, or param mode.");
      return;
    }

    if (isImplicitHeat && !activeCgalMesh) {
      setGeodesicHeatMessage("Run CGAL mesh first.");
      return;
    }
    if (isGraphHeat && !surfaceSampleSet?.meshData?.length) {
      setGeodesicHeatMessage("Graph mesh not ready.");
      return;
    }
    if (isParamHeat && !surfaceSampleSet?.meshData?.length) {
      setGeodesicHeatMessage("Param mesh not ready.");
      return;
    }

    if (!resolvedStart || !resolvedEnd) {
      const msg = isImplicitHeat
        ? "Pick two points on the CGAL mesh."
        : isGraphHeat
          ? "Pick two points on the graph mesh."
          : "Pick two points on the param mesh.";
      setGeodesicHeatMessage(msg);
      return;
    }

    if (resolvedStart.meshKey !== resolvedEnd.meshKey) {
      setGeodesicHeatMessage("Pick both points on the same mesh.");
      return;
    }

    if (isGraphHeat && geodesicHeatUseContinuous) {
      const domain = activeGraphDomain ?? getDefaultGraphSpan(activeEqSurfaceId);
      const start2D = { x: resolvedStart.point.x, y: resolvedStart.point.z };
      const end2D = { x: resolvedEnd.point.x, y: resolvedEnd.point.z };
      setGeodesicHeatBusy(true);
      try {
        const res = solveContinuousGraphGeodesic({
          surfaceId: activeEqSurfaceId,
          graphExpr,
          start: start2D,
          end: end2D,
          domain,
          maxSteps: 2400,
        });
        if (!res.ok) {
          setGeodesicHeatMessage(res.error);
          return;
        }
        setGeodesicHeatPolylines(res.polyline?.length ? [res.polyline] : null);
        setGeodesicHeatLength(Number.isFinite(res.length) ? res.length : null);
      } catch (e: any) {
        setGeodesicHeatMessage(e?.message ?? String(e));
      } finally {
        setGeodesicHeatBusy(false);
      }
      return;
    }

    if (isParamHeat && geodesicHeatUseContinuous) {
      const paramState = paramGeodesicStateRef.current;
      if (!paramState) {
        setGeodesicHeatMessage("Param geodesic state not ready.");
        return;
      }
      if (!resolvedStart.uv || !resolvedEnd.uv) {
        setGeodesicHeatMessage("Pick two points on the param mesh (UV required).");
        return;
      }
      if (paramState.meshKey && paramState.meshKey !== resolvedStart.meshKey) {
        setGeodesicHeatMessage("Param mesh changed; repick the endpoints.");
        return;
      }
      setGeodesicHeatBusy(true);
      try {
        const res = solveContinuousParamGeodesic({
          paramFunc: paramState.paramFunc,
          startUV: resolvedStart.uv,
          endUV: resolvedEnd.uv,
          domain: paramState.domain,
          wrap: paramState.wrap,
          startPoint: resolvedStart.point,
          endPoint: resolvedEnd.point,
          maxSteps: 2400,
        });
        if (!res.ok) {
          setGeodesicHeatMessage(res.error);
          return;
        }
        setGeodesicHeatPolylines(res.polyline?.length ? [res.polyline] : null);
        setGeodesicHeatLength(Number.isFinite(res.length) ? res.length : null);
      } catch (e: any) {
        setGeodesicHeatMessage(e?.message ?? String(e));
      } finally {
        setGeodesicHeatBusy(false);
      }
      return;
    }

    let positions: ArrayLike<number> | null = null;
    let indices: ArrayLike<number> | null = null;
    let heatMeshKey: string | null = null;
    if (isImplicitHeat) {
      const pos = activeCgalMesh?.positions ?? null;
      const idx = activeCgalMesh?.indices ?? null;
      if (!pos || pos.length < 3 || !idx || idx.length < 3) {
        setGeodesicHeatMessage("CGAL mesh data missing.");
        return;
      }
      positions = pos;
      indices = idx;
    } else {
      const meshData = surfaceSampleSet?.meshData?.find((m) => m.key === resolvedStart.meshKey)
        ?? surfaceSampleSet?.meshData?.[0];
      heatMeshKey = meshData?.key ?? null;
      const pos = meshData?.positions;
      const idx = meshData?.indices ?? null;
      if (!pos || pos.length < 3) {
        setGeodesicHeatMessage(isGraphHeat ? "Graph mesh data missing." : "Param mesh data missing.");
        return;
      }
      positions = pos;
      indices = idx;
    }

    setGeodesicHeatBusy(true);
    try {
      if (!positions) {
        setGeodesicHeatMessage("Mesh data missing.");
        return;
      }
      const heatMesh = buildHeatMesh({
        positions,
        indices,
        meshKey: isImplicitHeat ? null : heatMeshKey,
      });
      const res = await runGeodesicHeat({
        mesh: { V: heatMesh.V, F: heatMesh.F },
        source: { face: resolvedStart.faceIndex, bary: resolvedStart.bary },
        target: { face: resolvedEnd.faceIndex, bary: resolvedEnd.bary },
        options: {
          t_factor: 1.0,
          step_factor: 0.25,
          max_steps: 8000,
          stop_eps: 1e-4,
          return_phi: wantPhi,
        },
      });

      if (!res.ok) {
        setGeodesicHeatMessage(res.error ?? "Heat path failed.");
        return;
      }

      const pts = res.polyline.map((p) => ({ x: p[0], y: p[1], z: p[2] }));
      setGeodesicHeatPolylines(pts.length ? [pts] : null);
      setGeodesicHeatLength(Number.isFinite(res.length) ? res.length : null);
      if (wantPhi && res.phi_vertex?.length) {
        const expanded = heatMesh.expandPhi(res.phi_vertex);
        setGeodesicHeatPhi(Array.from(expanded));
        if (isImplicitHeat) {
          setGeodesicHeatMeshToken(cgalMeshToken);
        } else {
          setGeodesicHeatMeshKey(heatMeshKey);
        }
      }
    } catch (e: any) {
      setGeodesicHeatMessage(e?.message ?? String(e));
    } finally {
      setGeodesicHeatBusy(false);
    }
  },
  [
    activeCgalMesh,
    activeEqSurfaceId,
    activeGraphDomain,
    buildHeatMesh,
    cgalMeshToken,
    geodesicHeatShowHeatmap,
    geodesicHeatUseContinuous,
    geodesicHeatEnd,
    geodesicHeatStart,
    graphExpr,
    surfaceSampleSet,
    surfaceViewerKind,
  ]);

  const handleRunComputeBlock = useCallback(
    (stageId: WorkbookStageId, blockId: string, operatorId?: string) => {
      if (IS_REPLAY_MODE) return;
      if (!activeWorkbookId) return;
      const meta = workbookGraph.blockMetaById.get(blockId);
      const block = meta?.block;
      const resolvedOperator = operatorId ?? block?.compute?.operatorId;
      if (!resolvedOperator) {
        handleUpdateWorkbookBlock(stageId, blockId, {
          compute: { status: "stale", summary: "Select an operator first." },
        });
        return;
      }

      const applyViewPatch = (patch?: WorkbookComputeOutputs["viewPatch"]) => {
        if (!patch) return;
        if (patch.colorMode) setColorMode(patch.colorMode);
        if (patch.showWireframe != null) setShowWireframe(patch.showWireframe);
        if (patch.showContours != null) setShowContours(patch.showContours);
        if (patch.showChartGrid != null) setShowChartGrid(patch.showChartGrid);
        if (patch.probeEnabled != null) setProbeEnabled(patch.probeEnabled);
        if (patch.showProbeNormal != null) setShowProbeNormal(patch.showProbeNormal);
        if (patch.showProbeTangentPlane != null) setShowProbeTangentPlane(patch.showProbeTangentPlane);
        if (patch.showProbeTangents != null) setShowProbeTangents(patch.showProbeTangents);
        if (patch.showPrincipalDirections != null) setShowPrincipalDirections(patch.showPrincipalDirections);
        if (patch.showPrincipalGlyphs != null) setShowPrincipalGlyphs(patch.showPrincipalGlyphs);
      };

      const applyComputeOutputs = (outputs?: WorkbookComputeOutputs) => {
        if (!outputs) return;
        applyViewPatch(outputs.viewPatch);
        if (outputs.geodesicHeat) {
          setGeodesicHeatEnabled(true);
          setGeodesicHeatPolylines(outputs.geodesicHeat.polylines ?? null);
          setGeodesicHeatLength(outputs.geodesicHeat.length ?? null);
          if (outputs.geodesicHeat.phi != null) setGeodesicHeatPhi(outputs.geodesicHeat.phi ?? null);
          if (outputs.geodesicHeat.meshToken != null) setGeodesicHeatMeshToken(outputs.geodesicHeat.meshToken);
          if (outputs.geodesicHeat.meshKey != null) setGeodesicHeatMeshKey(outputs.geodesicHeat.meshKey);
          if (outputs.geodesicHeat.message != null) setGeodesicHeatMessage(outputs.geodesicHeat.message);
        }
        if (outputs.curveOverlay) {
          applyWorkbookCurveOverlay(outputs.curveOverlay.polylines ?? null);
        }
        if (outputs.directionOverlay) {
          applyWorkbookDirectionOverlay(outputs.directionOverlay.polylines ?? null);
        }
        if (outputs.selectionMask?.indices?.length) {
          const mask = buildSelectionMaskFromIndices(outputs.selectionMask.indices);
          if (mask) {
            setSelection(null);
            setSelectionSeed(null);
            setSelectionMaskOverride(mask);
            setSelectionMask(mask);
          }
        }
      };

      const inputHash =
        workbookGraph.inputHashById.get(blockId) ??
        hashValue({
          operatorId: resolvedOperator,
          datasetRef: currentDatasetRef,
          viewerKind: surfaceViewerKind,
          inputs: [],
        });
      const cacheEntry = block?.compute?.cache?.[inputHash];
      if (cacheEntry?.status === "ok") {
        applyComputeOutputs(cacheEntry.outputs);
        handleUpdateWorkbookBlock(stageId, blockId, {
          compute: {
            status: "ok",
            summary: cacheEntry.summary ?? "Cached output applied.",
            datasetRef: currentDatasetRef,
            lastRunAt: Date.now(),
            inputHash,
            outputHash: cacheEntry.outputHash,
          },
        });
        return;
      }

      if (block?.params?.values) {
        Object.entries(block.params.values).forEach(([paramId, value]) => {
          applyParamValue(paramId, value);
        });
      }

      let status: "ok" | "stale" | "failed" = "ok";
      let summary = "";
      let outputs: WorkbookComputeOutputs | undefined;

      if (datasetKind === "volume") {
        status = "failed";
        summary = "Compute operators target surface datasets (switch off Volume).";
      } else {
        if (resolvedOperator === "chart_grid") {
          const patch: WorkbookComputeOutputs["viewPatch"] = {
            probeEnabled: true,
            showProbeNormal: true,
            showProbeTangentPlane: true,
            showProbeTangents: true,
          };
          if (surfaceViewerKind === "param" || surfaceViewerKind === "weierstrass") {
            patch.showChartGrid = true;
            summary = "Chart grid (iso-u/iso-v) + probe enabled.";
          } else if (surfaceViewerKind === "graph") {
            patch.showChartGrid = true;
            summary = "Chart grid (iso-x/iso-y) + probe enabled.";
          } else {
            patch.showWireframe = true;
            if (surfaceViewerKind === "implicit") {
              patch.showContours = true;
              summary = "Wireframe + contours + probe enabled.";
            } else {
              summary = "Wireframe + probe enabled.";
            }
          }
          applyViewPatch(patch);
          outputs = { viewPatch: patch };
        } else if (resolvedOperator === "curve_overlay") {
          const curve = resolveLatestCurveOutput(blockId);
          if (!curve?.points?.length) {
            status = "stale";
            summary = "Draw a curve before running.";
          } else {
            const polylines: PolylineSet = [curve.points];
            applyWorkbookCurveOverlay(polylines);
            outputs = { curveOverlay: { polylines } };
            summary = "Curve overlay applied.";
          }
        } else if (resolvedOperator === "direction_overlay") {
          const directionOut = resolveLatestDirectionOutput(blockId);
          if (!directionOut) {
            status = "stale";
            summary = "Pick a direction before running.";
          } else {
            const bbox = surfaceSampleSet?.bbox ?? null;
            const size = bbox ? bbox.getSize(new THREE.Vector3()).length() : null;
            let domainSize: number | null = null;
            if (surfaceViewerKind === "graph") {
              domainSize = Math.hypot(activeGraphDomain.xSpan, activeGraphDomain.ySpan);
            } else if (surfaceViewerKind === "implicit") {
              domainSize = Math.hypot(activeImplicitDomain.xSpan, activeImplicitDomain.ySpan);
            } else if (surfaceViewerKind === "param" || surfaceViewerKind === "weierstrass") {
              const uSpan = activeParamLikeDomain
                ? Math.abs(activeParamLikeDomain.uMax - activeParamLikeDomain.uMin)
                : 1;
              const vSpan = activeParamLikeDomain
                ? Math.abs(activeParamLikeDomain.vMax - activeParamLikeDomain.vMin)
                : 1;
              domainSize = Math.hypot(uSpan, vSpan);
            }
            const base = size ?? domainSize ?? 2;
            const length = Math.max(0.2, base * 0.25);
            const dir = vNormalize(directionOut.direction);
            const end = vAdd(directionOut.origin, vScale(dir, length));
            const polylines: PolylineSet = [[directionOut.origin, end]];
            applyWorkbookDirectionOverlay(polylines);
            outputs = { directionOverlay: { polylines } };
            summary = "Direction overlay applied.";
          }
        } else if (resolvedOperator === "selection_overlay") {
          const maskOut = resolveLatestMaskOutput(blockId);
          if (!maskOut?.indices?.length) {
            status = "stale";
            summary = "Select a region before running.";
          } else {
            const mask = buildSelectionMaskFromIndices(maskOut.indices);
            if (!mask) {
              status = "stale";
              summary = "Selection overlay requires sampled surface.";
            } else {
              setSelection(null);
              setSelectionSeed(null);
              setSelectionMaskOverride(mask);
              setSelectionMask(mask);
              outputs = { selectionMask: maskOut };
              summary = `Selection overlay applied (${mask.count} samples).`;
            }
          }
        } else if (resolvedOperator === "curvature_field") {
          const patch: WorkbookComputeOutputs["viewPatch"] = {
            colorMode: surfaceViewerKind === "param" || surfaceViewerKind === "weierstrass" ? "gaussian" : "curvature",
            showPrincipalDirections: true,
            showPrincipalGlyphs: true,
          };
          applyViewPatch(patch);
          outputs = { viewPatch: patch };
          summary = "Curvature coloring + principal directions enabled.";
        } else if (resolvedOperator === "geodesic_heat") {
          setGeodesicHeatEnabled(true);
          const pointPair = resolveInteractionPointPair(blockId);
          let resolvedStart = geodesicHeatStart;
          let resolvedEnd = geodesicHeatEnd;
          let usingInteraction = false;

          if (pointPair) {
            const start = buildHeatEndpointFromPoint(pointPair.start);
            const end = buildHeatEndpointFromPoint(pointPair.end);
            if (!start || !end) {
              status = "stale";
              summary = "Pick points on the surface mesh (PickPoint outputs missing mesh data).";
            } else {
              resolvedStart = start;
              resolvedEnd = end;
              usingInteraction = true;
            }
          }

          if (status === "ok") {
            if (!geodesicHeatAvailable) {
              status = "stale";
              summary = geodesicHeatUnavailableReason || "Heat path not available yet.";
            } else if (!resolvedStart || !resolvedEnd) {
              status = "stale";
              summary = pointPair
                ? "Need two PickPoint outputs before running."
                : "Pick two points on the surface before running.";
            } else if (resolvedStart.meshKey !== resolvedEnd.meshKey) {
              status = "stale";
              summary = "Pick both points on the same mesh.";
            } else {
              summary = usingInteraction ? "Geodesic heat path from PickPoint outputs." : "Geodesic heat path requested.";
              setGeodesicHeatStart(resolvedStart);
              setGeodesicHeatEnd(resolvedEnd);
              handleRunGeodesicHeat({ start: resolvedStart, end: resolvedEnd });
            }
          }
        } else if (resolvedOperator === "geodesic_path") {
          setGeodesicPathEnabled(true);
          const pointPair = resolveInteractionPointPair(blockId);
          let resolvedStart = geodesicPathStart;
          let resolvedEnd = geodesicPathEnd;
          let usingInteraction = false;

          if (pointPair) {
            const start = buildPathEndpointFromPoint(pointPair.start);
            const end = buildPathEndpointFromPoint(pointPair.end);
            if (!start || !end) {
              status = "stale";
              summary = "Pick points on the surface mesh (PickPoint outputs missing vertex data).";
            } else {
              resolvedStart = start;
              resolvedEnd = end;
              usingInteraction = true;
            }
          }

          if (status === "ok") {
            if (!resolvedStart || !resolvedEnd) {
              status = "stale";
              summary = pointPair
                ? "Need two PickPoint outputs before running."
                : "Pick two points on the surface before running.";
            } else if (resolvedStart.meshKey !== resolvedEnd.meshKey) {
              status = "stale";
              summary = "Pick both points on the same mesh.";
            } else {
              summary = usingInteraction ? "Geodesic path from PickPoint outputs." : "Geodesic path requested.";
              setGeodesicPathStart(resolvedStart);
              setGeodesicPathEnd(resolvedEnd);
              computeGeodesicPath(resolvedStart, resolvedEnd);
            }
          }
        } else if (resolvedOperator === "principal_dirs") {
          const patch: WorkbookComputeOutputs["viewPatch"] = {
            showPrincipalDirections: true,
            showPrincipalGlyphs: true,
          };
          applyViewPatch(patch);
          outputs = { viewPatch: patch };
          summary = "Principal direction glyphs enabled.";
        } else {
          status = "failed";
          summary = "Unknown operator.";
        }
      }

      const outputHash = hashValue({ operatorId: resolvedOperator, inputHash, outputs: outputs ?? null });
      const cache: Record<string, WorkbookComputeCacheEntry> = {
        ...(block?.compute?.cache ?? {}),
      };
      if (status === "ok" || status === "failed") {
        cache[inputHash] = {
          inputHash,
          outputHash,
          status: status === "ok" ? "ok" : "failed",
          summary,
          outputs,
          createdAt: Date.now(),
        };
      }
      const cacheEntries = Object.values(cache);
      if (cacheEntries.length > 8) {
        cacheEntries.sort((a, b) => a.createdAt - b.createdAt);
        const pruned: Record<string, WorkbookComputeCacheEntry> = {};
        cacheEntries.slice(cacheEntries.length - 8).forEach((entry) => {
          pruned[entry.inputHash] = entry;
        });
        Object.keys(cache).forEach((key) => {
          delete cache[key];
        });
        Object.assign(cache, pruned);
      }

      setWorkbooks((prev) =>
        prev.map((w) =>
          w.id === activeWorkbookId
            ? {
                ...w,
                updatedAt: Date.now(),
                stages: w.stages.map((s) =>
                  s.id === stageId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) =>
                          b.id === blockId
                            ? {
                                ...b,
                                compute: {
                                  ...(b.compute ?? {}),
                                  operatorId: resolvedOperator,
                                  status,
                                  summary,
                                  datasetRef: currentDatasetRef,
                                  lastRunAt: Date.now(),
                                  inputHash,
                                  outputHash,
                                  cache,
                                },
                              }
                            : b
                        ),
                      }
                    : s
                ),
              }
            : w
        )
      );
    },
    [
      activeWorkbookId,
      activeGraphDomain,
      activeImplicitDomain,
      activeParamLikeDomain,
      applyParamValue,
      buildHeatEndpointFromPoint,
      buildPathEndpointFromPoint,
      buildSelectionMaskFromIndices,
      computeGeodesicPath,
      currentDatasetRef,
      datasetKind,
      geodesicHeatAvailable,
      geodesicHeatEnd,
      geodesicHeatStart,
      geodesicHeatUnavailableReason,
      geodesicPathEnd,
      geodesicPathStart,
      handleRunGeodesicHeat,
      handleUpdateWorkbookBlock,
      resolveInteractionPointPair,
      resolveLatestCurveOutput,
      resolveLatestDirectionOutput,
      resolveLatestMaskOutput,
      setSelection,
      setSelectionSeed,
      setColorMode,
      setGeodesicHeatEnabled,
      setGeodesicHeatEnd,
      setGeodesicHeatLength,
      setGeodesicHeatMessage,
      setGeodesicHeatMeshKey,
      setGeodesicHeatMeshToken,
      setGeodesicHeatPhi,
      setGeodesicHeatPolylines,
      setGeodesicHeatStart,
      setGeodesicPathEnabled,
      setGeodesicPathEnd,
      setGeodesicPathStart,
      setSelectionMask,
      setSelectionMaskOverride,
      applyWorkbookCurveOverlay,
      applyWorkbookDirectionOverlay,
      setShowContours,
      setShowChartGrid,
      setShowPrincipalDirections,
      setShowPrincipalGlyphs,
      setShowProbeNormal,
      setShowProbeTangentPlane,
      setShowProbeTangents,
      setShowWireframe,
      setProbeEnabled,
      surfaceSampleSet,
      surfaceViewerKind,
      workbookGraph,
    ]
  );

  const handleRunComputeStage = useCallback(
    (stageId: WorkbookStageId) => {
      if (IS_REPLAY_MODE) return;
      const ids = workbookGraph.computeBlockIdsByStage[stageId] ?? [];
      ids.forEach((id) => {
        const meta = workbookGraph.blockMetaById.get(id);
        handleRunComputeBlock(stageId, id, meta?.block.compute?.operatorId);
      });
    },
    [handleRunComputeBlock, workbookGraph]
  );

  const handleRunAllStale = useCallback(() => {
    if (IS_REPLAY_MODE) return;
    Object.entries(computeStatusById).forEach(([id, status]) => {
      if (status !== "stale") return;
      const meta = workbookGraph.blockMetaById.get(id);
      if (!meta) return;
      handleRunComputeBlock(meta.stageId, id, meta.block.compute?.operatorId);
    });
  }, [computeStatusById, handleRunComputeBlock, workbookGraph]);

  const handleRunFromBlock = useCallback(
    (stageId: WorkbookStageId, blockId: string) => {
      if (IS_REPLAY_MODE) return;
      const ids = workbookGraph.computeBlockIdsByStage[stageId] ?? [];
      const startIdx = ids.indexOf(blockId);
      if (startIdx < 0) return;
      ids.slice(startIdx).forEach((id) => {
        const meta = workbookGraph.blockMetaById.get(id);
        handleRunComputeBlock(stageId, id, meta?.block.compute?.operatorId);
      });
    },
    [handleRunComputeBlock, workbookGraph]
  );

  const handleRecomputeGeodesicDisk = useCallback(
    async (centerOverride?: GeodesicDiskCenter | null) => {
      setGeodesicDiskMessage(null);

      const center = centerOverride ?? geodesicDiskCenter;
      if (!center) {
        setGeodesicDiskMessage("Pick a center on the mesh.");
        return;
      }
      if (!geodesicDiskAvailable) {
        setGeodesicDiskMessage(geodesicDiskUnavailableReason || "Disk not available.");
        return;
      }

      const isImplicitDisk = surfaceViewerKind === "implicit";
      let positions: ArrayLike<number> | null = null;
      let indices: ArrayLike<number> | null = null;
      let meshKey = center.meshKey;

      if (isImplicitDisk) {
        const pos = activeCgalMesh?.positions ?? null;
        const idx = activeCgalMesh?.indices ?? null;
        if (!pos || pos.length < 3 || !idx || idx.length < 3) {
          setGeodesicDiskMessage("CGAL mesh data missing.");
          return;
        }
        positions = pos;
        indices = idx;
      } else {
        const meshData = surfaceSampleSet?.meshData?.find((m) => m.key === center.meshKey);
        if (!meshData || !meshData.positions || meshData.positions.length < 3) {
          setGeodesicDiskMessage(
            surfaceViewerKind === "graph" ? "Graph mesh data missing." : "Param mesh data missing."
          );
          return;
        }
        positions = meshData.positions;
        indices = meshData.indices ?? null;
        meshKey = meshData.key;
      }

      const clampBary = (raw: [number, number, number]) => {
        const c0 = Math.max(0, raw[0]);
        const c1 = Math.max(0, raw[1]);
        const c2 = Math.max(0, raw[2]);
        const sum = c0 + c1 + c2;
        if (!Number.isFinite(sum) || Math.abs(sum) <= 1e-12) return raw;
        return [c0 / sum, c1 / sum, c2 / sum] as [number, number, number];
      };
      const barySum = center.bary[0] + center.bary[1] + center.bary[2];
      const bary = clampBary(
        Number.isFinite(barySum) && Math.abs(barySum) > 1e-12
          ? ([
              center.bary[0] / barySum,
              center.bary[1] / barySum,
              center.bary[2] / barySum,
            ] as [number, number, number])
          : center.bary
      );
      const baryKey = bary.map((v) => v.toFixed(6)).join(",");
      const meshTokenKey = isImplicitDisk ? String(cgalMeshToken) : "mesh";
      const cacheKey = [
        geodesicDiskMethod,
        meshKey,
        meshTokenKey,
        center.faceIndex,
        baryKey,
      ].join("|");

      if (geodesicDiskPhiKey && geodesicDiskPhiKey === cacheKey && geodesicDiskPhi) {
        if (!geodesicDiskAutoUpdate) {
          setGeodesicDiskRadiusApplied(geodesicDiskRadius);
        }
        return;
      }

      const cached = geodesicDiskPhiCacheRef.current.get(cacheKey);
      if (cached) {
        setGeodesicDiskPhi(cached);
        setGeodesicDiskPhiMethod(geodesicDiskMethod);
        setGeodesicDiskPhiMeshKey(meshKey);
        setGeodesicDiskPhiMeshToken(isImplicitDisk ? cgalMeshToken : null);
        setGeodesicDiskPhiKey(cacheKey);
        if (!geodesicDiskAutoUpdate) {
          setGeodesicDiskRadiusApplied(geodesicDiskRadius);
        }
        return;
      }

      const vertCount = Math.floor((positions?.length ?? 0) / 3);
      if (!vertCount) {
        setGeodesicDiskMessage("Mesh data missing.");
        return;
      }
      if (!positions) {
        setGeodesicDiskMessage("Mesh data missing.");
        return;
      }

      const faceBase = center.faceIndex * 3;
      const triIndices =
        indices && indices.length >= faceBase + 3
          ? [
              Number(indices[faceBase]),
              Number(indices[faceBase + 1]),
              Number(indices[faceBase + 2]),
            ]
          : [faceBase, faceBase + 1, faceBase + 2];

      if (triIndices.some((idx) => idx < 0 || idx >= vertCount)) {
        setGeodesicDiskMessage("Picked face is out of range.");
        return;
      }

      const requestId = ++geodesicDiskRequestIdRef.current;
      setGeodesicDiskBusy(true);
      try {
        if (geodesicDiskMethod === "heat") {
          const heatMesh = buildHeatMesh({
            positions,
            indices,
            meshKey: isImplicitDisk ? null : meshKey,
          });
          const res = await runGeodesicHeat({
            mesh: { V: heatMesh.V, F: heatMesh.F },
            source: { face: center.faceIndex, bary },
            target: { face: center.faceIndex, bary },
            options: {
              t_factor: 1.0,
              step_factor: 0.25,
              max_steps: 8000,
              stop_eps: 1e-4,
              return_phi: true,
            },
          });

          if (!res.ok) {
            setGeodesicDiskMessage(res.error ?? "Geodesic heat failed.");
            return;
          }
          if (!res.phi_vertex?.length) {
            setGeodesicDiskMessage("Geodesic heat returned empty distances.");
            return;
          }
          if (geodesicDiskRequestIdRef.current !== requestId) return;

          const phi = heatMesh.expandPhi(res.phi_vertex);
          if (phi.length !== vertCount) {
            setGeodesicDiskMessage("Heat distances did not match mesh vertex count.");
            return;
          }
          const phiCenter =
            bary[0] * phi[triIndices[0]] +
            bary[1] * phi[triIndices[1]] +
            bary[2] * phi[triIndices[2]];
          let phiMin = Infinity;
          let phiMax = -Infinity;
          let posCount = 0;
          let negCount = 0;
          if (Number.isFinite(phiCenter)) {
            for (let i = 0; i < phi.length; i++) {
              const v = phi[i] - phiCenter;
              phi[i] = v;
              if (!Number.isFinite(v)) continue;
              if (v >= 0) posCount++;
              else negCount++;
              if (v < phiMin) phiMin = v;
              if (v > phiMax) phiMax = v;
            }
          }
          const needsInvert =
            (Number.isFinite(phiMax) && Number.isFinite(phiMin) && phiMax <= 0 && phiMin < 0) ||
            (posCount < negCount && Number.isFinite(phiMin) && Number.isFinite(phiMax) && phiMax < -phiMin * 0.3);
          if (needsInvert) {
            phiMin = Infinity;
            phiMax = -Infinity;
            posCount = 0;
            negCount = 0;
            for (let i = 0; i < phi.length; i++) {
              const v = -phi[i];
              phi[i] = v;
              if (!Number.isFinite(v)) continue;
              if (v >= 0) posCount++;
              else negCount++;
              if (v < phiMin) phiMin = v;
              if (v > phiMax) phiMax = v;
            }
          }
          if (Number.isFinite(phiMax) && phiMax > 0) {
            for (let i = 0; i < phi.length; i++) {
              const v = phi[i];
              if (!Number.isFinite(v)) continue;
              if (v < 0) phi[i] = 0;
            }
          }
          if (!Number.isFinite(phiMax) || phiMax <= 1e-9) {
            setGeodesicDiskMessage("Heat distances collapsed; try Dijkstra.");
            return;
          }
          if (!geodesicDiskRadiusTouchedRef.current && Number.isFinite(phiMax) && phiMax > 0) {
            const nextRadius = Math.max(0.001, Math.min(geodesicDiskRadius, phiMax * 0.25));
            if (nextRadius !== geodesicDiskRadius) {
              setGeodesicDiskRadius(nextRadius);
              if (geodesicDiskAutoUpdate) {
                setGeodesicDiskRadiusApplied(nextRadius);
              }
            }
          }

          geodesicDiskPhiCacheRef.current.set(cacheKey, phi);
          setGeodesicDiskPhi(phi);
          setGeodesicDiskPhiMethod("heat");
          setGeodesicDiskPhiMeshKey(meshKey);
          setGeodesicDiskPhiMeshToken(isImplicitDisk ? cgalMeshToken : null);
          setGeodesicDiskPhiKey(cacheKey);
        } else {
          const meshAdj = geodesicAdjacency.get(meshKey) ?? geodesicAdjacency.get(center.meshKey);
          if (!meshAdj) {
            setGeodesicDiskMessage("Geodesic graph not ready.");
            return;
          }
          const seedIndexRaw =
            center.bary[1] > center.bary[0] && center.bary[1] >= center.bary[2]
              ? triIndices[1]
              : center.bary[2] > center.bary[0] && center.bary[2] > center.bary[1]
                ? triIndices[2]
                : triIndices[0];
          const vertexToMerged = meshAdj.vertexToMerged;
          const seedIndex = vertexToMerged ? vertexToMerged[seedIndexRaw] : seedIndexRaw;
          if (seedIndex == null || seedIndex < 0 || seedIndex >= meshAdj.neighbors.length) {
            setGeodesicDiskMessage("Seed vertex out of range.");
            return;
          }
          const { dist } = dijkstraDistancesAndPrev({
            seedIndex,
            neighbors: meshAdj.neighbors,
            weights: meshAdj.weights,
            maxDist: Number.POSITIVE_INFINITY,
          });
          const phi = new Float64Array(vertCount);
          for (let i = 0; i < vertCount; i++) {
            const mapped = vertexToMerged ? vertexToMerged[i] : i;
            phi[i] =
              mapped != null && mapped >= 0 && mapped < dist.length
                ? dist[mapped]
                : Number.POSITIVE_INFINITY;
          }
          if (geodesicDiskRequestIdRef.current !== requestId) return;
          geodesicDiskPhiCacheRef.current.set(cacheKey, phi);
          setGeodesicDiskPhi(phi);
          setGeodesicDiskPhiMethod("dijkstra");
          setGeodesicDiskPhiMeshKey(meshKey);
          setGeodesicDiskPhiMeshToken(isImplicitDisk ? cgalMeshToken : null);
          setGeodesicDiskPhiKey(cacheKey);
        }
        if (!geodesicDiskAutoUpdate) {
          setGeodesicDiskRadiusApplied(geodesicDiskRadius);
        }
      } catch (e: any) {
        setGeodesicDiskMessage(e?.message ?? String(e));
      } finally {
        setGeodesicDiskBusy(false);
      }
    },
    [
      activeCgalMesh,
      buildHeatMesh,
      cgalMeshToken,
      geodesicAdjacency,
      geodesicDiskAutoUpdate,
      geodesicDiskAvailable,
      geodesicDiskCenter,
      geodesicDiskMethod,
      geodesicDiskPhi,
      geodesicDiskPhiKey,
      geodesicDiskRadius,
      geodesicDiskUnavailableReason,
      surfaceSampleSet?.meshData,
      surfaceViewerKind,
    ]
  );

  useEffect(() => {
    if (!geodesicDiskEnabled || !geodesicDiskCenter) return;
    handleRecomputeGeodesicDisk(geodesicDiskCenter);
  }, [geodesicDiskCenter, geodesicDiskEnabled, geodesicDiskMethod, handleRecomputeGeodesicDisk]);

  const selectionBBoxForCgal = useMemo(() => {
    if (selectionStats.count <= 0) return null;
    return {
      min: [
        selectionStats.bbox.min[0],
        selectionStats.bbox.min[1],
        selectionStats.bbox.min[2],
      ],
      max: [
        selectionStats.bbox.max[0],
        selectionStats.bbox.max[1],
        selectionStats.bbox.max[2],
      ],
    } as BBox3;
  }, [selectionStats]);

  const cgalDomainPreview = useMemo(
    () =>
      getCgalDomainBBox({
        selectionBBox: selectionBBoxForCgal,
        implicitDomainBBox: implicitDomainBBox(activeImplicitDomain),
        padFrac: cgalPadFrac,
      }),
    [selectionBBoxForCgal, implicitDomainBBox, activeImplicitDomain, cgalPadFrac]
  );
  const cgalDomainDiag = useMemo(() => bboxDiag(cgalDomainPreview), [cgalDomainPreview]);
  const cgalAutoEdge = useMemo(() => Math.max(1e-6, 0.02 * cgalDomainDiag), [cgalDomainDiag]);
  const cgalTriBudgetEdge = useMemo(
    () => estimateTargetEdgeFromBudget(cgalDomainDiag, cgalTriBudget),
    [cgalDomainDiag, cgalTriBudget]
  );
  const cgalEffectiveEdge = useMemo(() => {
    const baseTargetEdge = cgalTriBudgetEnabled
      ? cgalTriBudgetEdge
      : cgalAutoTargetEdge
        ? cgalAutoEdge
        : cgalTargetEdge;
    const minTrisEdge = cgalMinTrisEnabled
      ? estimateTargetEdgeFromBudget(cgalDomainDiag, cgalMinTris)
      : null;
    if (minTrisEdge != null && Number.isFinite(minTrisEdge)) {
      return Math.min(baseTargetEdge, minTrisEdge);
    }
    return baseTargetEdge;
  }, [
    cgalTriBudgetEnabled,
    cgalTriBudgetEdge,
    cgalAutoTargetEdge,
    cgalAutoEdge,
    cgalTargetEdge,
    cgalMinTrisEnabled,
    cgalMinTris,
    cgalDomainDiag,
  ]);
  const cgalEstimatedTris = useMemo(
    () => estimateTrianglesFromDiag(cgalDomainDiag, cgalEffectiveEdge),
    [cgalDomainDiag, cgalEffectiveEdge]
  );
  const cgalTooHeavy = useMemo(
    () => cgalEstimatedTris > 1_000_000 && !cgalTriBudgetEnabled && !cgalAutoTargetEdge,
    [cgalEstimatedTris, cgalTriBudgetEnabled, cgalAutoTargetEdge]
  );

  const handleVtkPreviewImplicit = useCallback(async () => {
    if (vtkBusy || vtkPreviewBusy) return;
    if (surfaceViewerKind !== "implicit") {
      setVtkPreviewError("VTK preview is available only in the implicit viewer.");
      return;
    }

    const expr = activeImplicitExpr;
    if (!expr) {
      setVtkPreviewError("Implicit expression is empty.");
      return;
    }

    const resolution = Math.max(8, Math.min(220, Math.round(implicitResolution)));
    const targetFaces = Number.isFinite(vtkPreviewTargetFaces) ? Math.max(200, Math.round(vtkPreviewTargetFaces)) : 20000;

    setVtkPreviewBusy(true);
    setVtkPreviewError(null);
    try {
      const res = await vtkPreviewImplicit({
        expr,
        iso: 0,
        domain: cgalDomainPreview,
        resolution,
        targetFaces: vtkPreviewUseDecimate ? targetFaces : undefined,
      });
      if (!res.ok) {
        setVtkPreviewError(res.error);
        return;
      }
      applyVtkResultToSurfaceMesh("VTK preview", res);
    } catch (err: any) {
      setVtkPreviewError(err?.message ?? "VTK preview failed.");
    } finally {
      setVtkPreviewBusy(false);
    }
  }, [
    vtkBusy,
    vtkPreviewBusy,
    surfaceViewerKind,
    activeImplicitExpr,
    implicitResolution,
    vtkPreviewTargetFaces,
    vtkPreviewUseDecimate,
    cgalDomainPreview,
    applyVtkResultToSurfaceMesh,
  ]);

  const handleRunCgalMesh = useCallback(async () => {
    setCgalError(null);

    if (surfaceViewerKind !== "implicit") {
      setCgalError("CGAL meshing is available only in the implicit viewer.");
      return;
    }

    const expr = activeImplicitExpr;
    if (!expr) {
      setCgalError("Implicit expression is empty.");
      return;
    }

    if (cgalTooHeavy) {
      setCgalError(
        `Estimated ~${cgalEstimatedTris.toLocaleString()} triangles. Increase target edge or enable auto/tri budget.`
      );
    }

    setCgalBusy(true);
    try {
      const domain = cgalDomainPreview;
      const diag = cgalDomainDiag;
      const targetEdge = cgalEffectiveEdge;
      const baseTargetEdge = cgalTriBudgetEnabled
        ? cgalTriBudgetEdge
        : cgalAutoTargetEdge
          ? cgalAutoEdge
          : cgalTargetEdge;
      const minTrisEdge = cgalMinTrisEnabled
        ? estimateTargetEdgeFromBudget(diag, cgalMinTris)
        : null;
      console.log("[CGAL] mesh request", {
        selectionCount: selectionStats.count,
        selectionBBox: selectionBBoxForCgal,
        domain,
        targetEdge,
        baseTargetEdge,
        minTrisEdge,
        autoTargetEdge: cgalAutoTargetEdge,
        padFrac: cgalPadFrac,
        triBudgetEnabled: cgalTriBudgetEnabled,
        triBudget: cgalTriBudget,
        minTrisEnabled: cgalMinTrisEnabled,
        minTris: cgalMinTris,
        radiusBound: cgalRadiusBound,
        verbose: cgalVerbose,
        preflightSamples: cgalPreflightSamples,
        domainDiag: diag,
      });

      const res = await runCgalMesh({
        f: expr,
        iso: 0,
        domain,
        quality: { target_edge: targetEdge, radiusBound: cgalRadiusBound },
        verbose: cgalVerbose,
        preflightSamples: cgalPreflightSamples,
      });

      console.log("[CGAL] mesh response", {
        ok: res.ok,
        positions: res.ok ? res.positions.length : undefined,
        indices: res.ok ? res.indices.length : undefined,
        error: res.ok ? undefined : res.error,
      });

      if (!res.ok) {
        setCgalError(res.error);
        return;
      }

      setCgalMeshState({
        surfaceId: activeEqSurfaceId,
        expr,
        positions: res.positions,
        indices: res.indices,
        createdAt: Date.now(),
      });
      setCgalMeshToken((t) => t + 1);
    } catch (e: any) {
      setCgalError(e?.message ?? String(e));
    } finally {
      setCgalBusy(false);
    }
  }, [
    surfaceViewerKind,
    activeImplicitExpr,
    selectionStats,
    implicitDomainBBox,
    activeImplicitDomain,
    cgalTargetEdge,
    cgalAutoTargetEdge,
    cgalPadFrac,
    cgalTriBudgetEnabled,
    cgalTriBudget,
    cgalRadiusBound,
    cgalMinTrisEnabled,
    cgalMinTris,
    cgalVerbose,
    cgalPreflightSamples,
    cgalDomainPreview,
    cgalDomainDiag,
    cgalAutoEdge,
    cgalTriBudgetEdge,
    cgalEffectiveEdge,
    cgalEstimatedTris,
    cgalTooHeavy,
    selectionBBoxForCgal,
    activeEqSurfaceId,
  ]);

  const handleStopCgalWorker = useCallback(async () => {
    try {
      const res = await stopCgalWorker();
      if (!res.ok) {
        setCgalError(res.error ?? "Failed to stop CGAL worker.");
        return;
      }
      setCgalBusy(false);
      setCgalHealthState(null);
      setCgalError("CGAL worker stopped.");
    } catch (e: any) {
      setCgalError(e?.message ?? String(e));
    }
  }, []);

  const handleResetWeierstrass = useCallback(() => {
    setWeierstrassGExpr(WEIERSTRASS_DEFAULTS.gExpr);
    setWeierstrassPhiExpr(WEIERSTRASS_DEFAULTS.phiExpr);
    setWeierstrassDomain({ ...WEIERSTRASS_DEFAULTS.domain });
    setWeierstrassResolution(WEIERSTRASS_DEFAULTS.resolution);
    setWeierstrassRecenter(WEIERSTRASS_DEFAULTS.recenter);
    setActiveWeierstrassPresetId(WEIERSTRASS_PRESETS[0]?.id ?? null);
    setWeierstrassError(null);
  }, []);

  useEffect(() => {
    const res = computeWeierstrassDrift({
      gExpr: weierstrassGExpr,
      phiExpr: weierstrassPhiExpr,
      uMin: weierstrassDomain.uMin,
      uMax: weierstrassDomain.uMax,
      vMin: weierstrassDomain.vMin,
      vMax: weierstrassDomain.vMax,
      samples: weierstrassResolution,
    });
    if ("errorMessage" in res) {
      setWeierstrassDiagnosticError(res.errorMessage);
      setWeierstrassDiagnostics(null);
    } else {
      setWeierstrassDiagnosticError(null);
      setWeierstrassDiagnostics(res);
    }
  }, [
    diagnosticsToken,
    weierstrassGExpr,
    weierstrassPhiExpr,
    weierstrassDomain.uMin,
    weierstrassDomain.uMax,
    weierstrassDomain.vMin,
    weierstrassDomain.vMax,
    weierstrassResolution,
  ]);

  const activeWeierstrassPreset =
    WEIERSTRASS_PRESETS.find((p) => p.id === activeWeierstrassPresetId) ?? null;

  const applyWeierstrassPreset = useCallback((preset: WeierstrassPreset) => {
    setWeierstrassGExpr(preset.gExpr);
    setWeierstrassPhiExpr(preset.phiExpr);
    setWeierstrassResolution(preset.resolution);
    setWeierstrassRecenter(preset.recenterRescale);
    setWeierstrassDomain({ ...preset.defaultDomain });
    setActiveWeierstrassPresetId(preset.id);
  }, []);

  const applySuggestedDomain = useCallback((preset: WeierstrassPreset) => {
    setWeierstrassDomain({ ...preset.suggestedDomain });
  }, []);

  const recomputeWeierstrassDiagnostics = useCallback(() => {
    setDiagnosticsToken((t) => t + 1);
  }, []);

  const toggleDriftArrow = useCallback(() => {
    setShowDriftArrow((v) => !v);
  }, []);

  const pushCommandResult = useCallback((cmd: string, out: string) => {
    setCommandHistory((prev) => [{ cmd, out }, ...prev].slice(0, 12));
  }, []);

  const tokenizeCommand = (input: string) => {
    const out: string[] = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(input))) {
      out.push(match[1] ?? match[2] ?? match[3]);
    }
    return out;
  };

  const runSurfaceCommand = useCallback(
    (raw: string) => {
      const cmd = raw.trim();
      if (!cmd) return;

      const tokens = tokenizeCommand(cmd);
      const head = (tokens[0] ?? "").toLowerCase();

      const say = (out: string) => pushCommandResult(cmd, out);

      if (head === "help") {
        return say(
          [
            "surface implicit|graph|param <id>",
            "surface mesh",
            "colorMode <solid|height|radius|phase|curvature|gaussian|mean|k1|k2>",
            "palette <blueRed|rainbow|grayscale|redYellow>",
            "wireframe on|off  |  planes on|off  |  probe on|off",
            "normals on|off  |  tangents on|off  |  tangentPlane on|off",
            "lighting <studio|soft|contrast|neutral|warm>",
            "roughness <0..1>  metalness <0..1>  opacity <0..1>",
            "resolution graph|implicit|param <n>",
            "expr graph|implicit \"expr\"  |  expr param x|y|z \"expr\"",
            "probe at <x> <y>  |  probe uv <u> <v>",
            "position  |  gaussmap  |  curvature",
          ].join("\n")
        );
      }

      if (head === "surface") {
        const kind = (tokens[1] ?? "").toLowerCase();
        const id = tokens[2] as SurfaceId | ParamSurfaceId | undefined;
        if (kind === "mesh") {
          setSurfaceViewerKind("mesh");
          return say("surface viewer = mesh");
        }
        if (!id) return say("Missing surface id.");
        if (kind === "graph") {
          if (!isGraphSurface(id as SurfaceId)) return say(`Not a graph surface: ${id}`);
          setSurfaceViewerKind("graph");
          setGraphSurfaceId(id as SurfaceId);
          return say(`graph surface = ${id}`);
        }
        if (kind === "implicit") {
          if (isGraphSurface(id as SurfaceId)) return say(`Not an implicit surface: ${id}`);
          setSurfaceViewerKind("implicit");
          setImplicitSurfaceId(id as SurfaceId);
          return say(`implicit surface = ${id}`);
        }
        if (kind === "param") {
          setSurfaceViewerKind("param");
          setParamSurfaceId(id as ParamSurfaceId);
          return say(`param surface = ${id}`);
        }
        return say("Usage: surface implicit|graph|param <id> | surface mesh");
      }

      if (head === "colormode") {
        const m = tokens[1] as ColorMode | undefined;
        if (!m) return say("Missing colorMode.");
        setColorMode(m);
        return say(`colorMode = ${m}`);
      }

      if (head === "palette") {
        const p = tokens[1] as ColorPalette | undefined;
        if (!p) return say("Missing palette.");
        setColorPalette(p);
        return say(`palette = ${p}`);
      }

      if (head === "wireframe") {
        const v = (tokens[1] ?? "").toLowerCase();
        const on = v === "on" || v === "true" || v === "1";
        setShowWireframe(on);
        return say(`wireframe = ${on ? "on" : "off"}`);
      }

      if (head === "planes") {
        const v = (tokens[1] ?? "").toLowerCase();
        const on = v === "on" || v === "true" || v === "1";
        setShowPlanes(on);
        return say(`planes = ${on ? "on" : "off"}`);
      }

      if (head === "probe") {
        const sub = (tokens[1] ?? "").toLowerCase();
        if (sub === "on" || sub === "off") {
          const on = sub === "on";
          setProbeEnabled(on);
          return say(`probe = ${on ? "on" : "off"}`);
        }
        if (sub === "at" || sub === "xy") {
          const x = Number(tokens[2]);
          const y = Number(tokens[3]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return say("Usage: probe at <x> <y>");
          setProbeEnabled(true);
          setGraphProbeXY({ x, y });
          setGraphProbeToken((t) => t + 1);
          return say(`probe graph at (${x}, ${y})`);
        }
        if (sub === "uv") {
          const u = Number(tokens[2]);
          const v = Number(tokens[3]);
          if (!Number.isFinite(u) || !Number.isFinite(v)) return say("Usage: probe uv <u> <v>");
          setProbeEnabled(true);
          setParamProbeUV({ u, v });
          setParamProbeToken((t) => t + 1);
          return say(`probe param at (${u}, ${v})`);
        }
        return say("Usage: probe on|off | probe at <x> <y> | probe uv <u> <v>");
      }

      if (head === "normals") {
        const v = (tokens[1] ?? "").toLowerCase();
        const on = v === "on" || v === "true" || v === "1";
        setShowProbeNormal(on);
        return say(`show normals = ${on ? "on" : "off"}`);
      }

      if (head === "tangents") {
        const v = (tokens[1] ?? "").toLowerCase();
        const on = v === "on" || v === "true" || v === "1";
        setShowProbeTangents(on);
        return say(`show tangents = ${on ? "on" : "off"}`);
      }

      if (head === "tangentplane") {
        const v = (tokens[1] ?? "").toLowerCase();
        const on = v === "on" || v === "true" || v === "1";
        setShowProbeTangentPlane(on);
        return say(`show tangent plane = ${on ? "on" : "off"}`);
      }

      if (head === "lighting") {
        const p = (tokens[1] ?? "").toLowerCase() as "studio" | "soft" | "contrast" | "neutral" | "warm";
        if (!p || !["studio", "soft", "contrast", "neutral", "warm"].includes(p)) return say("lighting studio|soft|contrast|neutral|warm");
        setLightPreset(p);
        return say(`lighting = ${p}`);
      }

      if (head === "roughness") {
        const v = Number(tokens[1]);
        if (!Number.isFinite(v)) return say("roughness <0..1>");
        setMaterialRoughness(Math.min(1, Math.max(0, v)));
        return say(`roughness = ${Math.min(1, Math.max(0, v)).toFixed(2)}`);
      }

      if (head === "metalness") {
        const v = Number(tokens[1]);
        if (!Number.isFinite(v)) return say("metalness <0..1>");
        setMaterialMetalness(Math.min(1, Math.max(0, v)));
        return say(`metalness = ${Math.min(1, Math.max(0, v)).toFixed(2)}`);
      }

      if (head === "opacity") {
        const v = Number(tokens[1]);
        if (!Number.isFinite(v)) return say("opacity <0..1>");
        setMaterialOpacity(Math.min(1, Math.max(0, v)));
        return say(`opacity = ${Math.min(1, Math.max(0, v)).toFixed(2)}`);
      }

      if (head === "resolution") {
        const kind = (tokens[1] ?? "").toLowerCase();
        const n = Number(tokens[2]);
        if (!Number.isFinite(n)) return say("resolution graph|implicit|param <n>");
        if (kind === "graph") {
          setGraphResolution(Math.round(n));
          return say(`graph resolution = ${Math.round(n)}`);
        }
        if (kind === "implicit") {
          setImplicitResolution(Math.round(n));
          return say(`implicit resolution = ${Math.round(n)}`);
        }
        if (kind === "param") {
          setParamResolution(Math.round(n));
          return say(`param resolution = ${Math.round(n)}`);
        }
        return say("resolution graph|implicit|param <n>");
      }

      if (head === "expr") {
        const kind = (tokens[1] ?? "").toLowerCase();
        if (kind === "graph") {
          const expr = tokens.slice(2).join(" ");
          if (!expr) return say("expr graph \"<expr>\"");
          setSurfaceViewerKind("graph");
          setGraphSurfaceId("graph_custom");
          setGraphExpr(expr);
          return say("graph expr updated");
        }
        if (kind === "implicit") {
          const expr = tokens.slice(2).join(" ");
          if (!expr) return say("expr implicit \"<expr>\"");
          setSurfaceViewerKind("implicit");
          setImplicitSurfaceId("implicit_custom");
          setImplicitExpr(expr);
          return say("implicit expr updated");
        }
        if (kind === "param") {
          const axis = (tokens[2] ?? "").toLowerCase();
          const expr = tokens.slice(3).join(" ");
          if (!axis || !expr) return say("expr param x|y|z \"<expr>\"");
          setSurfaceViewerKind("param");
          setParamSurfaceId("custom");
          if (axis === "x") setParamXExpr(expr);
          else if (axis === "y") setParamYExpr(expr);
          else if (axis === "z") setParamZExpr(expr);
          else return say("expr param x|y|z \"<expr>\"");
          return say(`param ${axis} expr updated`);
        }
        return say("expr graph|implicit|param ...");
      }

      if (head === "position") {
        if (!probeInfo) return say("No probe data.");
        const p = probeInfo.point;
        return say(`p = (${p.x.toFixed(4)}, ${p.y.toFixed(4)}, ${p.z.toFixed(4)})`);
      }

      if (head === "gaussmap") {
        if (!probeInfo) return say("No probe data.");
        const n = probeInfo.normal;
        return say(`n = (${n.x.toFixed(4)}, ${n.y.toFixed(4)}, ${n.z.toFixed(4)})`);
      }

      if (head === "curvature") {
        if (!probeCurv || !isGraphSurface(activeEqSurfaceId)) return say("Curvature only available for graph surfaces.");
        return say(
          `K=${probeCurv.K.toFixed(5)}  H=${probeCurv.H.toFixed(5)}  k1=${probeCurv.k1.toFixed(5)}  k2=${probeCurv.k2.toFixed(5)}`
        );
      }

      return say(`Unknown command: ${head}`);
    },
    [
      activeEqSurfaceId,
      probeCurv,
      probeInfo,
      pushCommandResult,
      setColorMode,
      setColorPalette,
      setGraphExpr,
      setGraphProbeToken,
      setGraphProbeXY,
      setGraphResolution,
      setImplicitExpr,
      setImplicitResolution,
      setImplicitSurfaceId,
      setLightPreset,
      setMaterialMetalness,
      setMaterialOpacity,
      setMaterialRoughness,
      setParamProbeToken,
      setParamProbeUV,
      setParamResolution,
      setParamSurfaceId,
      setParamXExpr,
      setParamYExpr,
      setParamZExpr,
      setProbeEnabled,
      setShowPlanes,
      setShowProbeNormal,
      setShowProbeTangents,
      setShowProbeTangentPlane,
      setShowWireframe,
      setSurfaceViewerKind,
      setGraphSurfaceId,
    ]
  );

  const handleRunCommand = useCallback(
    (cmd: string) => {
      if (!cmd.trim()) return;
      runSurfaceCommand(cmd);
      setCommandInput("");
    },
    [runSurfaceCommand]
  );

  useEffect(() => {
    if (!isDev || typeof window === "undefined") return;

    const onError = (ev: ErrorEvent) => {
      const message = ev.message || "Uncaught error";
      const stack = ev.error?.stack;
      setDevError({ message, stack });
    };

    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
      const stack = reason instanceof Error ? reason.stack : undefined;
      setDevError({ message, stack });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [isDev]);

  return (
    <div style={rootStyle}>
      {isDev && devError && (
        <div
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            zIndex: 3000,
            maxWidth: 520,
            padding: "10px 12px",
            background: "#fff4f4",
            border: "1px solid #f2b8b5",
            borderRadius: 8,
            boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Dev error</div>
          <div style={{ marginBottom: devError.stack ? 6 : 0 }}>{devError.message}</div>
          {devError.stack && (
            <pre
              style={{
                margin: 0,
                padding: 6,
                background: "#fff",
                border: "1px solid #f2b8b5",
                borderRadius: 6,
                maxHeight: 160,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                fontSize: 11,
              }}
            >
              {devError.stack.split("\n").slice(0, 6).join("\n")}
            </pre>
          )}
          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setDevError(null)} style={{ padding: "3px 8px" }}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      <header style={styles.header}>
        <h1 style={styles.h1}>Math3D</h1>

        <div style={styles.tabs}>
          <TabButton active={mode === "surfaces"} onClick={() => setMode("surfaces")}>
            Surfaces
          </TabButton>
        </div>

        <div style={styles.controls}>
          {mode === "maps" ? (
            <MapsButtons mapId={mapId} onChangeMapId={setMapId} />
          ) : mode === "surfaces" ? (
            <SurfacesControls
              viewerKind={surfaceViewerKind}
              onChangeViewerKind={handleChangeViewerKind}
              datasetKind={datasetKind}
              onChangeDatasetKind={setDatasetKind}
              surfaceId={activeEqSurfaceId}
              onChangeSurface={handlePickEqSurface}
              paramId={paramSurfaceId}
              onChangeParamId={setParamSurfaceId}
              activeWeierstrassPreset={activeWeierstrassPreset}
              onApplyWeierstrassPreset={applyWeierstrassPreset}
              onApplySuggestedDomain={applySuggestedDomain}
              compareEnabled={compareEnabled}
              compareIgnoreWorkbookOverlays={compareIgnoreWorkbookOverlays}
              compareCameraSync={compareCameraSync}
              compareDiffHeatmapEnabled={compareDiffHeatmapEnabled}
              compareDiffHeatmapAvailable={compareDiffHeatmapAvailable}
              onToggleCompare={() => {
                setCompareEnabled((v) => !v);
                if (rightPanelTab !== "workbook") setCameraSync(null);
              }}
              onToggleCompareIgnoreWorkbookOverlays={() => setCompareIgnoreWorkbookOverlays((v) => !v)}
              onToggleCompareCameraSync={() => setCompareCameraSync((v) => !v)}
              onToggleCompareDiffHeatmap={() => setCompareDiffHeatmapEnabled((v) => !v)}
              compareSurfaceId={compareSurfaceId}
              onChangeCompareSurface={(id) => {
                setCompareSurfaceId(id);
                setCompareUseSnapshotB(false);
              }}
              compareParamId={compareParamId}
              onChangeCompareParamId={(id) => {
                setCompareParamId(id);
                setCompareUseSnapshotB(false);
              }}
            />
          ) : (
            <div style={{ ...styles.group, ...styles.groupWide }}>
              <div
                style={{
                  width: "100%",
                  height: 32,
                  borderRadius: 8,
                  background: "linear-gradient(90deg, #ffffff, #f5f7ff)",
                  boxShadow: "inset 0 0 0 1px #e0e0e0",
                }}
              />
            </div>
          )}
        </div>
      </header>

      <div
        style={{
          ...styles.wrap,
          ...(mode === "surfaces"
            ? {
              maxWidth: "100%",
              width: "100%",
            }
            : null),
        }}
      >
        {mode === "surfaces" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "row", minHeight: 400 }}>
            {/* LEFT */}
            <div style={{ ...styles.panelLeft, width: leftWidth }}>
                <SurfacesLeftPanel
                  viewerKind={surfaceViewerKind}
                  surfaceId={activeEqSurfaceId}
                  paramId={paramSurfaceId}
                  datasetKind={datasetKind}
                  volumeDatasetOverride={volumeDatasetOverride}
                  volumeDistanceBusy={volumeDistanceBusy}
                  volumeDistanceError={volumeDistanceError}
                  volumeDistanceSigned={volumeDistanceSigned}
                  volumeDistanceAutoBounds={volumeDistanceAutoBounds}
                  onBuildDistanceVolume={handleBuildDistanceVolume}
                  onClearVolumeOverride={handleClearVolumeOverride}
                  volumePresetId={volumePresetId}
                  volumePreset={volumePreset}
                  volumeDims={volumeDims}
                  volumeParams={volumeParamsResolved}
                  volumeCustomExpr={volumeCustomExpr}
                  volumeCustomError={volumeCustomCompiled.error}
                  volumeSeedAxis={volumeSeedAxis}
                  volumeSeedIndex={volumeSeedIndex}
                  volumeSeedIndexMax={volumeSeedIndexMax}
                  volumeCrosshairWorld={volumeCrosshair}
                  volumeCrosshairIndex={volumeCrosshairIndex}
                  volumeCrosshairValue={volumeCrosshairSample?.value ?? null}
                  volumeCrosshairGradMag={volumeCrosshairSample?.gradMag ?? null}
                  volumeViewMode={volumeViewMode}
                  volumeOpacity={volumeSliceOpacity}
                  volumeVectorPresetId={volumeVectorPresetId}
                  volumeVectorPresetLabel={volumeVectorPreset.label}
                  volumeShowStreamlines={volumeShowStreamlines}
                  volumeStreamSeedGrid={volumeStreamSeedGrid}
                  volumeStreamlineStepSize={volumeStreamlineStepSize}
                  volumeStreamlineStepRange={volumeStreamlineStepRange}
                  volumeStreamlineMaxSteps={volumeStreamlineMaxSteps}
                  volumeStreamlineMaxLength={volumeStreamlineMaxLength}
                  volumeSampling={volumeSamplingClamped}
                  volumeSamplingSpacing={volumeSamplingSpacing}
                  volumeShowCropBox={volumeShowCropBox}
                  volumeCropGizmoEnabled={volumeCropGizmoEnabled}
                  volumeCropGizmoMode={volumeCropGizmoMode}
                  volumeContourEnabled={volumeContourEnabled}
                  volumeContourCount={volumeContourCount}
                  volumeWindowMode={volumeWindowMode}
                  volumeSliceReport={volumeSliceReport}
                  volumeSliceHover={volumeSliceHover}
                  volumeShowIsosurface={volumeShowIsosurface}
                  volumeIsoValue={volumeIsoValue}
                  volumeIsoRange={volumeIsoRange}
                  volumeIsoSmooth={volumeIsoSmooth}
                  volumeIsoSmoothIterations={volumeIsoSmoothIterations}
                  onChangeVolumePresetId={setVolumePresetId}
                  onChangeVolumeDim={handleVolumeDimChange}
                  onChangeVolumeSamplingCenter={handleVolumeSamplingCenterChange}
                  onChangeVolumeSamplingExtent={handleVolumeSamplingExtentChange}
                  onResetVolumeSampling={handleResetVolumeSampling}
                  onRebuildVolumeSampling={handleRebuildVolumeSampling}
                  onToggleVolumeCropBox={setVolumeShowCropBox}
                  onToggleVolumeCropGizmo={handleToggleVolumeCropGizmo}
                  onChangeVolumeCropGizmoMode={setVolumeCropGizmoMode}
                  onToggleVolumeContour={setVolumeContourEnabled}
                  onChangeVolumeContourCount={setVolumeContourCount}
                  onChangeVolumeWindowMode={setVolumeWindowMode}
                  onToggleVolumeIsosurface={setVolumeShowIsosurface}
                  onChangeVolumeIsoValue={setVolumeIsoValue}
                  onToggleVolumeIsoSmooth={setVolumeIsoSmooth}
                  onChangeVolumeIsoSmoothIterations={setVolumeIsoSmoothIterations}
                  onChangeVolumeParam={handleVolumeParamChange}
                  onChangeVolumeCustomExpr={setVolumeCustomExpr}
                  onChangeVolumeCrosshairIndex={handleVolumeCrosshairIndexChange}
                  onChangeVolumeSeedAxis={setVolumeSeedAxis}
                  onChangeVolumeSeedIndex={setVolumeSeedIndex}
                  onChangeVolumeViewMode={setVolumeViewMode}
                  onChangeVolumeOpacity={setVolumeSliceOpacity}
                  onChangeVolumeVectorPreset={setVolumeVectorPresetId}
                  onToggleVolumeStreamlines={setVolumeShowStreamlines}
                  onChangeVolumeStreamSeedGrid={handleVolumeStreamSeedGridChange}
                  onChangeVolumeStreamlineStepSize={handleVolumeStreamlineStepChange}
                  onResetVolumeStreamlineStep={handleVolumeStreamlineStepAuto}
                  onChangeVolumeStreamlineMaxSteps={handleVolumeStreamlineMaxStepsChange}
                  surfaceMeshLabel={surfaceMeshLabel}
                  surfaceMeshStats={surfaceMeshStats}
                  surfaceMeshSource={surfaceMeshData?.source ?? null}
                  surfaceMeshImportBusy={surfaceMeshImportBusy}
                  surfaceMeshImportError={surfaceMeshImportError}
                  surfaceMeshMergeVertices={surfaceMeshMergeVertices}
                  surfaceMeshPresets={SURFACE_MESH_PRESETS}
                  surfaceMeshExportable={surfaceMeshExportable}
                  surfaceMeshExportBusy={surfaceMeshExportBusy}
                  surfaceMeshExportError={surfaceMeshExportError}
                  surfaceMeshWeldTolerance={surfaceMeshWeldTolerance}
                  surfaceMeshWeldBusy={surfaceMeshWeldBusy}
                  surfaceMeshWeldError={surfaceMeshWeldError}
                  onExportSurfaceMeshObj={handleExportSurfaceMeshObj}
                  onExportSurfaceMeshGlb={handleExportSurfaceMeshGlb}
                  onChangeSurfaceMeshWeldTolerance={setSurfaceMeshWeldTolerance}
                  onWeldSurfaceMesh={handleWeldSurfaceMesh}
                  implicitBakeResolution={implicitBakeResolution}
                  implicitBakeBounds={safeImplicitBakeBounds}
                  implicitBakeBusy={implicitBakeBusy}
                  implicitBakePhase={implicitBakePhase}
                  implicitBakeProgress={implicitBakeProgress}
                  implicitBakeError={implicitBakeError}
                  implicitBakeCacheHit={implicitBakeCacheHit}
                  onChangeImplicitBakeResolution={setImplicitBakeResolution}
                  onChangeImplicitBakeBounds={handleChangeImplicitBakeBounds}
                  onBakeImplicit={handleBakeImplicit}
                  onUseImplicitBakeDomain={handleUseImplicitBakeDomain}
                  onResetImplicitBakeBounds={handleResetImplicitBakeBounds}
                  onToggleSurfaceMeshMergeVertices={setSurfaceMeshMergeVertices}
                  onGenerateSurfaceMeshPreset={handleGenerateSurfaceMeshPreset}
                  onLoadSurfaceMeshFile={handleLoadSurfaceMeshFile}
                  onConvertToMesh={handleConvertToMesh}
                  onToggleVolumeDistanceSigned={setVolumeDistanceSigned}
                  onToggleVolumeDistanceAutoBounds={setVolumeDistanceAutoBounds}
                  vtkAvailable={vtkMeshAvailable}
                  vtkBusy={vtkBusy}
                  vtkError={vtkError}
                  vtkDecimateReduction={vtkDecimateReduction}
                  onChangeVtkDecimateReduction={setVtkDecimateReduction}
                  vtkDecimateTargetFaces={vtkDecimateTargetFaces}
                  onChangeVtkDecimateTargetFaces={setVtkDecimateTargetFaces}
                  vtkUseTargetFaces={vtkUseTargetFaces}
                  onToggleVtkUseTargetFaces={setVtkUseTargetFaces}
                  vtkSmoothIterations={vtkSmoothIterations}
                  onChangeVtkSmoothIterations={setVtkSmoothIterations}
                  vtkSmoothPassband={vtkSmoothPassband}
                  onChangeVtkSmoothPassband={setVtkSmoothPassband}
                  onVtkCleanNormals={handleVtkCleanNormals}
                  onVtkDecimate={handleVtkDecimate}
                  onVtkSmooth={handleVtkSmooth}
                  graphExpr={graphExpr}
                  implicitExpr={implicitExpr}
                onChangeGraphExpr={setGraphExpr}
                onChangeImplicitExpr={setImplicitExpr}
                  paramXExpr={paramXExpr}
                  paramYExpr={paramYExpr}
                  paramZExpr={paramZExpr}
                  complexMapSpec={complexMapSpec}
                  complexMapPresetId={complexMapPresetId}
                  complexMapError={complexMapError}
                  complexMapLive={complexMapLive}
                  onToggleComplexMapLive={setComplexMapLive}
                  complexMapLine={complexMapLine}
                  complexMapZExtent={complexMapZExtent}
                  complexMapWExtent={complexMapWExtent}
                  complexMapLineWPolylines={complexMapLineWPolylines}
                  complexMapIsolineWPolylinesU={complexMapIsolineWPolylinesU}
                  complexMapIsolineWPolylinesV={complexMapIsolineWPolylinesV}
                  complexMapIsolineZLinesU={complexMapIsolineZLinesU}
                  complexMapIsolineZLinesV={complexMapIsolineZLinesV}
                  complexMapGridThickness={complexMapGridThickness}
                  complexMapGridOpacity={complexMapGridOpacity}
                  complexMapGridShowSurface={complexMapGridShowSurface}
                  complexMapMarkerData={complexMapMarkerData}
                  complexMapShowCritical={complexMapShowCritical}
                  complexMapShowZeros={complexMapShowZeros}
                  complexMapShowPoles={complexMapShowPoles}
                  complexMapMarkersZ={complexMapMarkersZ}
                  complexMapMarkersW={complexMapMarkersW}
                  complexMapMarkers3d={complexMapMarkers3d}
                  complexMapMarkerMax={complexMapMarkerMax}
                  complexMapCriticalRel={complexMapCriticalRel}
                  complexMapZeroRel={complexMapZeroRel}
                  complexMapPoleRel={complexMapPoleRel}
                  setComplexMapShowCritical={setComplexMapShowCritical}
                  setComplexMapShowZeros={setComplexMapShowZeros}
                  setComplexMapShowPoles={setComplexMapShowPoles}
                  setComplexMapMarkersZ={setComplexMapMarkersZ}
                  setComplexMapMarkersW={setComplexMapMarkersW}
                  setComplexMapMarkers3d={setComplexMapMarkers3d}
                  setComplexMapMarkerMax={setComplexMapMarkerMax}
                  setComplexMapCriticalRel={setComplexMapCriticalRel}
                  setComplexMapZeroRel={setComplexMapZeroRel}
                  setComplexMapPoleRel={setComplexMapPoleRel}
                  complexPreimageMode={complexPreimageMode}
                  complexPreimageValue={complexPreimageValue}
                  complexPreimageSnap={complexPreimageSnap}
                  complexPreimagePolylines={complexPreimagePolylines}
                  complexPreimageWShape={complexPreimageWShape}
                  setComplexPreimageMode={setComplexPreimageMode}
                  setComplexPreimageValue={setComplexPreimageValue}
                  setComplexPreimageSnap={setComplexPreimageSnap}
                  complexDistortionMode={complexDistortionMode}
                  complexDistortionShowZ={complexDistortionShowZ}
                  complexDistortionShowSurface={complexDistortionShowSurface}
                  complexDistortionScale={complexDistortionScale}
                  complexMapDistortionField={complexMapDistortionField}
                  complexMapDistortionProbe={complexMapDistortionProbe}
                  complexMapProbe={complexMapProbe}
                  complexMapProbePins={complexMapProbePins}
                  setComplexDistortionMode={setComplexDistortionMode}
                  setComplexDistortionShowZ={setComplexDistortionShowZ}
                  setComplexDistortionShowSurface={setComplexDistortionShowSurface}
                  setComplexDistortionScale={setComplexDistortionScale}
                  setComplexMapGridThickness={setComplexMapGridThickness}
                  setComplexMapGridOpacity={setComplexMapGridOpacity}
                  setComplexMapGridShowSurface={setComplexMapGridShowSurface}
                  complexMapShowSphere={complexMapShowSphere}
                  onToggleComplexMapShowSphere={setComplexMapShowSphere}
                  complexMapSphereStacked={complexMapSphereStacked}
                  onToggleComplexMapSphereStacked={setComplexMapSphereStacked}
                  complexMapSphereLines={complexMapSphereLines3d}
                  complexMapSpherePoints={complexMapSpherePoints3d}
                  complexMapSphereGuides={complexMapSphereGuides}
                  onPinComplexMapProbe={pinComplexMapProbe}
                  onClearComplexMapProbe={clearComplexMapProbe}
                  onClearComplexMapProbePins={clearComplexMapProbePins}
                  onRecallComplexMapProbe={recallComplexMapProbe}
                  onRemoveComplexMapProbePin={removeComplexMapProbePin}
                  wPlaneDomainColor={wPlaneDomainColor}
                  wPlaneShowRings={wPlaneShowRings}
                  wPlaneShowRays={wPlaneShowRays}
                  onChangeWPlaneDomainColor={setWPlaneDomainColor}
                  onChangeWPlaneShowRings={setWPlaneShowRings}
                  onChangeWPlaneShowRays={setWPlaneShowRays}
                  onChangeParamXExpr={setParamXExpr}
                  onChangeParamYExpr={setParamYExpr}
                  onChangeParamZExpr={setParamZExpr}
                  onChangeComplexMapSpec={updateComplexMapSpec}
                  onChangeComplexMapPreset={applyComplexMapPreset}
                  onBuildComplexMapSweep={handleBuildComplexMapSweep}
                  onPickComplexMapLine={setComplexMapLine}
                  onSetComplexMapProbeFromUV={setComplexMapProbeFromUV}
                  onSetComplexMapProbeFromW={setComplexMapProbeFromW}
                  weierstrassGExpr={weierstrassGExpr}
                weierstrassPhiExpr={weierstrassPhiExpr}
                onChangeWeierstrassGExpr={setWeierstrassGExpr}
                onChangeWeierstrassPhiExpr={setWeierstrassPhiExpr}
                weierstrassDomain={weierstrassDomain}
                onChangeWeierstrassDomain={handleChangeWeierstrassDomain}
                weierstrassResolution={weierstrassResolution}
                onChangeWeierstrassResolution={setWeierstrassResolution}
                  weierstrassRecenter={weierstrassRecenter}
                  onToggleWeierstrassRecenter={() => setWeierstrassRecenter((v) => !v)}
                  onResetWeierstrass={handleResetWeierstrass}
                  weierstrassError={weierstrassError}
                  weierstrassDiagnostics={weierstrassDiagnostics}
                  weierstrassPathDisagreement={weierstrassPathDisagreement}
                  weierstrassDiagnosticError={weierstrassDiagnosticError}
                  showDriftArrow={showDriftArrow}
                onToggleDriftArrow={toggleDriftArrow}
                onRecomputeDiagnostics={recomputeWeierstrassDiagnostics}
                showWireframe={showWireframe}
                onToggleWireframe={() => setShowWireframe((w) => !w)}
                showPlanes={showPlanes}
                onTogglePlanes={() => setShowPlanes((p) => !p)}
                lightPreset={lightPreset}
                onChangeLightPreset={setLightPreset}
                materialRoughness={materialRoughness}
                onSetMaterialRoughness={setMaterialRoughness}
                materialMetalness={materialMetalness}
                onSetMaterialMetalness={setMaterialMetalness}
                materialOpacity={materialOpacity}
                onSetMaterialOpacity={setMaterialOpacity}
                graphResolution={graphResolution}
                onSetGraphResolution={setGraphResolution}
                implicitResolution={implicitResolution}
                onSetImplicitResolution={setImplicitResolution}
                paramResolution={paramResolution}
                onSetParamResolution={setParamResolution}
                colorMode={colorMode}
                onChangeColorMode={setColorMode}
                colorPalette={colorPalette}
                onChangeColorPalette={setColorPalette}
                implicitOverlay={implicitOverlay}
                onChangeImplicitOverlay={setImplicitOverlay}
                probeEnabled={probeEnabled}
                onToggleProbe={() => setProbeEnabled((p) => !p)}
                showProbeNormal={showProbeNormal}
                onToggleProbeNormal={() => setShowProbeNormal((v) => !v)}
                showProbeTangentPlane={showProbeTangentPlane}
                onToggleProbeTangentPlane={() => setShowProbeTangentPlane((v) => !v)}
                showProbeTangents={showProbeTangents}
                onToggleProbeTangents={() => setShowProbeTangents((v) => !v)}
                showPrincipalDirections={showPrincipalDirections}
                onTogglePrincipalDirections={() => setShowPrincipalDirections((v) => !v)}
                showPrincipalNormalPlanes={showPrincipalNormalPlanes}
                onTogglePrincipalNormalPlanes={() => setShowPrincipalNormalPlanes((v) => !v)}
                showPrincipalLines={showPrincipalLines}
                onTogglePrincipalLines={() => setShowPrincipalLines((v) => !v)}
                showPrincipalGlyphs={showPrincipalGlyphs}
                onTogglePrincipalGlyphs={() => setShowPrincipalGlyphs((v) => !v)}
                principalGlyphDensity={principalGlyphDensity}
                onChangePrincipalGlyphDensity={setPrincipalGlyphDensity}
                principalGlyphLength={principalGlyphLength}
                onChangePrincipalGlyphLength={setPrincipalGlyphLength}
                principalGlyphMode={principalGlyphMode}
                onChangePrincipalGlyphMode={setPrincipalGlyphMode}
                showCurvatureLines={showCurvatureLines}
                onToggleCurvatureLines={() => setShowCurvatureLines((v) => !v)}
                curvatureLineField={curvatureLineField}
                onChangeCurvatureLineField={setCurvatureLineField}
                curvatureSeedSource={curvatureSeedSource}
                onChangeCurvatureSeedSource={setCurvatureSeedSource}
                curvatureSeedDensity={curvatureSeedDensity}
                onChangeCurvatureSeedDensity={setCurvatureSeedDensity}
                curvatureStepSize={curvatureStepSize}
                onChangeCurvatureStepSize={setCurvatureStepSize}
                curvatureMaxSteps={curvatureMaxSteps}
                onChangeCurvatureMaxSteps={setCurvatureMaxSteps}
                curvatureMaxLines={curvatureMaxLines}
                onChangeCurvatureMaxLines={setCurvatureMaxLines}
                onRebuildCurvatureLines={() => setCurvatureRebuildToken((t) => t + 1)}
                showRidges={showRidges}
                onToggleRidges={() => setShowRidges((v) => !v)}
                showValleys={showValleys}
                onToggleValleys={() => setShowValleys((v) => !v)}
                ridgeValleySelectionOnly={ridgeValleySelectionOnly}
                onToggleRidgeValleySelectionOnly={() => setRidgeValleySelectionOnly((v) => !v)}
                ridgeValleyMagMin={ridgeValleyMagMin}
                onChangeRidgeValleyMagMin={setRidgeValleyMagMin}
                ridgeValleyContrast={ridgeValleyContrast}
                onChangeRidgeValleyContrast={setRidgeValleyContrast}
                ridgeValleyMinCos={ridgeValleyMinCos}
                onChangeRidgeValleyMinCos={setRidgeValleyMinCos}
                ridgeValleySegmentScale={ridgeValleySegmentScale}
                onChangeRidgeValleySegmentScale={setRidgeValleySegmentScale}
                ridgeValleySampleMode={ridgeValleySampleMode}
                onChangeRidgeValleySampleMode={setRidgeValleySampleMode}
                ridgeValleyStitch={ridgeValleyStitch}
                onToggleRidgeValleyStitch={() => setRidgeValleyStitch((v) => !v)}
                ridgeValleyDecimate={ridgeValleyDecimate}
                onChangeRidgeValleyDecimate={setRidgeValleyDecimate}
                ridgeValleyMaxCurves={ridgeValleyMaxCurves}
                onChangeRidgeValleyMaxCurves={setRidgeValleyMaxCurves}
                ridgeValleyMinConf={ridgeValleyMinConf}
                onChangeRidgeValleyMinConf={setRidgeValleyMinConf}
                showBoundingBox={showBoundingBox}
                onToggleBoundingBox={() => setShowBoundingBox((b) => !b)}
                showGaussMap={showGaussMap}
                gaussColorMode={gaussColorMode}
                onChangeGaussColorMode={setGaussColorMode}
                gaussPointsCount={surfaceSampleSet?.samples.length ?? 0}
                onResetCamera={() => setCameraResetToken((t) => t + 1)}
                probeInfo={probeInfo}
                probeCurv={probeCurv}
                paramProbeCurv={paramProbeCurv}
                // contours
                showContours={showContours}
                onToggleContours={() => setShowContours((v) => !v)}
                contourCount={contourCount}
                onSetContourCount={setContourCount}
                selectRegionEnabled={selectRegionEnabled}
                onToggleSelectRegion={() => setSelectRegionEnabled((v) => !v)}
                selectionMode={selectionMode}
                onChangeSelectionMode={setSelectionMode}
                selectionRadius={selectionRadius}
                onSetSelectionRadius={setSelectionRadius}
                selectionUseUV={selectionUseUV}
                selectionHasUV={surfaceHasUV}
                onToggleSelectionUseUV={toggleSelectionUseUV}
                zoomToRegion={zoomToRegion}
                onToggleZoomToRegion={() => setZoomToRegion((v) => !v)}
                onZoomNow={() => setZoomNowToken((v) => v + 1)}
                onClearSelection={handleClearSelection}
                selectionMaskCount={selectionMask?.count ?? 0}
                selectionOverlayVisible={selectionOverlayVisible}
                onToggleSelectionOverlayVisible={() => setSelectionOverlayVisible((v) => !v)}
                selectionOverlayOnTop={selectionOverlayOnTop}
                onToggleSelectionOverlayOnTop={() => setSelectionOverlayOnTop((v) => !v)}
                selectionSphereVisible={selectionSphereVisible}
                onToggleSelectionSphereVisible={() => setSelectionSphereVisible((v) => !v)}
                geodesicPathEnabled={geodesicPathEnabled}
                onToggleGeodesicPathEnabled={() => setGeodesicPathEnabled((v) => !v)}
                onClearGeodesicPath={handleClearGeodesicPath}
                geodesicPathStart={geodesicPathStart}
                geodesicPathEnd={geodesicPathEnd}
                geodesicPathLength={geodesicPathLength}
                geodesicPathMessage={geodesicPathMessage}
                geodesicPathConstrain={geodesicPathConstrain}
                onToggleGeodesicPathConstrain={() => setGeodesicPathConstrain((v) => !v)}
                geodesicPathSmooth={geodesicPathSmooth}
                onToggleGeodesicPathSmooth={() => setGeodesicPathSmooth((v) => !v)}
                geodesicPathDebug={geodesicPathDebug}
                geodesicPathDebugInfo={geodesicPathDebugInfo}
                onToggleGeodesicPathDebug={() => setGeodesicPathDebug((v) => !v)}
                geodesicHeatEnabled={geodesicHeatEnabled}
                geodesicHeatAvailable={geodesicHeatAvailable}
                geodesicHeatBusy={geodesicHeatBusy}
                geodesicHeatStart={geodesicHeatStart}
                geodesicHeatEnd={geodesicHeatEnd}
                geodesicHeatLength={geodesicHeatLength}
                geodesicHeatMessage={geodesicHeatMessage}
                geodesicHeatShowHeatmap={geodesicHeatShowHeatmap}
                geodesicHeatUseContinuous={geodesicHeatUseContinuous}
                geodesicHeatUnavailableReason={geodesicHeatUnavailableReason}
                geodesicHeatHeatmapAllowed={geodesicHeatHeatmapAllowed}
                geodesicHeatHeatmapReason={geodesicHeatHeatmapReason}
                onToggleGeodesicHeatEnabled={() => setGeodesicHeatEnabled((v) => !v)}
                onToggleGeodesicHeatShowHeatmap={() => setGeodesicHeatShowHeatmap((v) => !v)}
                onToggleGeodesicHeatUseContinuous={() => setGeodesicHeatUseContinuous((v) => !v)}
                onRunGeodesicHeat={handleRunGeodesicHeat}
                onClearGeodesicHeat={handleClearGeodesicHeat}
                geodesicDiskEnabled={geodesicDiskEnabled}
                geodesicDiskAvailable={geodesicDiskAvailable}
                geodesicDiskBusy={geodesicDiskBusy}
                geodesicDiskPickMode={geodesicDiskPickMode}
                geodesicDiskCenter={geodesicDiskCenter}
                geodesicDiskRadius={geodesicDiskRadius}
                geodesicDiskAutoUpdate={geodesicDiskAutoUpdate}
                geodesicDiskShowBoundary={geodesicDiskShowBoundary}
                geodesicDiskMethod={geodesicDiskMethod}
                geodesicDiskUnavailableReason={geodesicDiskUnavailableReason}
                geodesicDiskMessage={geodesicDiskMessage}
                geodesicDiskStats={geodesicDiskResult?.stats ?? null}
                geodesicDiskSelectionStats={geodesicDiskSelectionStats}
                onToggleGeodesicDiskEnabled={() =>
                  setGeodesicDiskEnabled((v) => {
                    const next = !v;
                    if (!next) setGeodesicDiskPickMode(false);
                    return next;
                  })
                }
                onPickGeodesicDiskCenter={() => setGeodesicDiskPickMode((v) => !v)}
                onChangeGeodesicDiskRadius={handleChangeGeodesicDiskRadius}
                onApplyGeodesicDiskRadius={() => setGeodesicDiskRadiusApplied(geodesicDiskRadius)}
                onToggleGeodesicDiskAutoUpdate={() => setGeodesicDiskAutoUpdate((v) => !v)}
                onToggleGeodesicDiskShowBoundary={() => setGeodesicDiskShowBoundary((v) => !v)}
                onChangeGeodesicDiskMethod={setGeodesicDiskMethod}
                onRecomputeGeodesicDisk={() => handleRecomputeGeodesicDisk()}
                onClearGeodesicDisk={handleClearGeodesicDisk}
                inspectEnabled={inspectEnabled}
                onToggleInspectEnabled={() => setInspectEnabled((v) => !v)}
                onClearInspect={clearInspect}
                inspectIdx={inspectIdx}
                inspectPos={inspectPos}
                inspectNormal={inspectNormal}
                inspectMetrics={inspectMetrics}
                commandInput={commandInput}
                onChangeCommandInput={setCommandInput}
                onRunCommand={handleRunCommand}
                commandHistory={commandHistory}
                selectionStats={selectionStats}
                availableSelectionMetrics={availableSelectionMetrics}
                selectedMetric={selectedMetric}
                onChangeSelectedMetric={setSelectedMetric}
                onRefreshSelectionStats={handleRefreshSelectionStats}
              />
            </div>

            <div onMouseDown={startDragLeft} style={splitterStyle} />

            {/* MIDDLE */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "stretch", justifyContent: "center" }}>
              <div
                style={{
                  flex: 1,
                  height: "80vh",
                  minHeight: 360,
                  borderRadius: 12,
                  boxShadow: "0 0 0 1px #e0e0e0",
                  overflow: "hidden",
                  background: "#f8f9fb",
                  padding: compareEnabled ? 10 : 0,
                  boxSizing: "border-box",
                }}
              >
                {datasetKind === "volume" ? (
                  volumeViewMode === "slices" ? (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 8,
                        padding: 8,
                        boxSizing: "border-box",
                      }}
                    >
                      {(
                        [
                          { id: "xy", label: "XY", axis: "z" as const, index: volumeCrosshairIndex[2], preset: "xy", primary: true },
                          { id: "xz", label: "XZ", axis: "y" as const, index: volumeCrosshairIndex[1], preset: "xz", primary: false },
                          { id: "yz", label: "YZ", axis: "x" as const, index: volumeCrosshairIndex[0], preset: "yz", primary: false },
                        ] as const
                      ).map((view) => (
                        <div
                          key={view.id}
                          style={{
                            position: "relative",
                            borderRadius: 10,
                            overflow: "hidden",
                            background: "#f8f9fb",
                            boxShadow: "0 0 0 1px #e0e0e0",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              top: 8,
                              left: 8,
                              padding: "2px 6px",
                              borderRadius: 6,
                              background: "rgba(255,255,255,0.85)",
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: 0.3,
                              color: "#1f2937",
                              pointerEvents: "none",
                              zIndex: 2,
                            }}
                          >
                            {view.label}
                          </div>
                          <VolumeViewer
                            dataset={activeDataset?.kind === "volume" ? activeDataset : null}
                            vectorGrid={view.primary ? volumeVectorGrid : null}
                            axis={view.axis}
                            index={view.index}
                            opacity={volumeSliceOpacity}
                            crosshair={volumeCrosshair}
                            onSlicePick={handleVolumeSlicePick}
                            viewPreset={view.preset}
                            showAxes={false}
                            contourEnabled={volumeContourEnabled}
                            contourCount={volumeContourCount}
                            windowMode={volumeWindowMode}
                            onSliceReport={view.primary ? setVolumeSliceReport : undefined}
                            onSliceHover={setVolumeSliceHover}
                            showIsosurface={volumeShowIsosurface && view.primary}
                            isoValue={volumeIsoValue}
                            isoSmoothing={volumeIsoSmooth}
                            isoSmoothingIterations={volumeIsoSmoothIterations}
                            showCropBox={volumeShowCropBox}
                            cropCenter={volumeSamplingClamped.center}
                            cropExtents={volumeSamplingClamped.extents}
                            cropGizmoEnabled={view.primary ? volumeCropGizmoEnabled : false}
                            cropGizmoMode={volumeCropGizmoMode}
                            onCropChange={handleVolumeCropChange}
                            showStreamlines={volumeShowStreamlines && view.primary}
                            streamlineSeeds={view.primary ? volumeStreamlineSeeds : undefined}
                            streamlineStepSize={volumeStreamlineStepSize}
                            streamlineMaxSteps={volumeStreamlineMaxSteps}
                            streamlineMaxLength={volumeStreamlineMaxLength}
                            captureToken={view.primary ? workbookCaptureToken : 0}
                            onCaptureThumbnail={view.primary ? handleWorkbookThumbnail : undefined}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ width: "100%", height: "100%", padding: 8, boxSizing: "border-box" }}>
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          borderRadius: 10,
                          overflow: "hidden",
                          background: "#f8f9fb",
                          boxShadow: "0 0 0 1px #e0e0e0",
                        }}
                      >
                        <VolumeViewer
                          dataset={activeDataset?.kind === "volume" ? activeDataset : null}
                          vectorGrid={volumeVectorGrid}
                          axis={"z"}
                          index={volumeCrosshairIndex[2]}
                          opacity={volumeSliceOpacity}
                          crosshair={volumeCrosshair}
                          onSlicePick={handleVolumeSlicePick}
                          viewPreset="free"
                          showAxes={true}
                          contourEnabled={volumeContourEnabled}
                          contourCount={volumeContourCount}
                          windowMode={volumeWindowMode}
                          onSliceReport={setVolumeSliceReport}
                          onSliceHover={setVolumeSliceHover}
                          showIsosurface={volumeShowIsosurface}
                          isoValue={volumeIsoValue}
                          isoSmoothing={volumeIsoSmooth}
                          isoSmoothingIterations={volumeIsoSmoothIterations}
                          showCropBox={volumeShowCropBox}
                          cropCenter={volumeSamplingClamped.center}
                          cropExtents={volumeSamplingClamped.extents}
                          cropGizmoEnabled={volumeCropGizmoEnabled}
                          cropGizmoMode={volumeCropGizmoMode}
                          onCropChange={handleVolumeCropChange}
                          showStreamlines={volumeShowStreamlines}
                          streamlineSeeds={volumeStreamlineSeeds}
                          streamlineStepSize={volumeStreamlineStepSize}
                          streamlineMaxSteps={volumeStreamlineMaxSteps}
                          streamlineMaxLength={volumeStreamlineMaxLength}
                          captureToken={workbookCaptureToken}
                          onCaptureThumbnail={handleWorkbookThumbnail}
                        />
                      </div>
                    </div>
                  )
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        showGaussMap || (surfaceViewerKind === "complex" && complexMapShowSphere)
                          ? "minmax(0,1fr) 320px"
                          : "1fr",
                      gap: showGaussMap || (surfaceViewerKind === "complex" && complexMapShowSphere) ? 10 : 0,
                      height: "100%",
                    }}
                  >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: compareEnabled ? "1fr 1fr" : "1fr",
                        gap: compareEnabled ? 10 : 0,
                        height: "100%",
                      }}
                    >
                      <div style={{ borderRadius: 10, overflow: "hidden", background: "#f8f9fb" }}>
                        {surfaceViewerKind === "param" || surfaceViewerKind === "weierstrass" ? (
                        <ParamSurfaceViewer
                            surfaceId={primaryParamId}
                            customX={paramXExpr}
                            customY={paramYExpr}
                            customZ={paramZExpr}
                            wireframe={primaryOverlay.showWireframe}
                            showPlanes={primaryOverlay.showPlanes}
                            lightPreset={lightPreset}
                            materialRoughness={materialRoughness}
                            materialMetalness={materialMetalness}
                            materialOpacity={materialOpacity}
                            paramResolution={activeParamLikeResolution}
                            colorMode={primaryOverlay.colorMode}
                            colorPalette={primaryOverlay.colorPalette}
                            showChartGrid={primaryOverlay.showChartGrid}
                            chartGridCountU={chartGridCountU}
                            chartGridCountV={chartGridCountV}
                            paramDomain={activeParamLikeDomain}
                            weierstrassGExpr={weierstrassGExpr}
                            weierstrassPhiExpr={weierstrassPhiExpr}
                            weierstrassResolution={weierstrassResolution}
                            weierstrassRecenter={weierstrassRecenter}
                            onWeierstrassError={setWeierstrassError}
                            onWeierstrassPathDisagreement={setWeierstrassPathDisagreement}
                            probeEnabled={probeEnabled}
                            showProbeNormal={showProbeNormal}
                            showProbeTangentPlane={showProbeTangentPlane}
                            showProbeTangents={showProbeTangents}
                            showPrincipalDirections={showPrincipalDirections}
                            showPrincipalNormalPlanes={showPrincipalNormalPlanes}
                            showPrincipalLines={showPrincipalLines}
                            showPrincipalGlyphs={showPrincipalGlyphs}
                            principalGlyphDensity={principalGlyphDensity}
                            principalGlyphLength={principalGlyphLength}
                            principalGlyphMode={principalGlyphMode}
                            showCurvatureLines={showCurvatureLines}
                            curvatureLineField={curvatureLineField}
                            curvatureSeedSource={curvatureSeedSource}
                            curvatureSeedDensity={curvatureSeedDensity}
                            curvatureStepSize={curvatureStepSize}
                            curvatureMaxSteps={curvatureMaxSteps}
                            curvatureMaxLines={curvatureMaxLines}
                            curvatureRebuildToken={curvatureRebuildToken}
                            showRidges={showRidges}
                            showValleys={showValleys}
                            ridgeValleySelectionOnly={ridgeValleySelectionOnly}
                            ridgeValleyMagMin={ridgeValleyMagMin}
                            ridgeValleyContrast={ridgeValleyContrast}
                            ridgeValleyMinCos={ridgeValleyMinCos}
                            ridgeValleySegmentScale={ridgeValleySegmentScale}
                            ridgeValleySampleMode={ridgeValleySampleMode}
                            ridgeValleyStitch={ridgeValleyStitch}
                            ridgeValleyDecimate={ridgeValleyDecimate}
                            ridgeValleyMaxCurves={ridgeValleyMaxCurves}
                            ridgeValleyMinConf={ridgeValleyMinConf}
                            showBoundingBox={primaryOverlay.showBoundingBox}
                            resetToken={cameraResetToken}
                            onProbe={handleProbe}
                            onParamCurvature={handleParamCurvature}
                            paramProbeUV={paramProbeUV}
                            paramProbeToken={paramProbeToken}
                            onSetCustomX={setParamXExpr}
                            onSetCustomY={setParamYExpr}
                            onSetCustomZ={setParamZExpr}
                            isCameraLeader={cameraSyncEnabled}
                            onCameraSync={cameraSyncEnabled ? setCameraSync : undefined}
                            cameraOverride={cameraOverride}
                            cameraOverrideToken={cameraOverrideToken}
                            captureToken={workbookCaptureToken}
                            onCaptureThumbnail={handleWorkbookThumbnail}
                          gaussMapEnabled={showGaussMap}
                          onToggleGaussMap={() => setShowGaussMap((v) => !v)}
                          onGaussPoints={handleGaussPoints}
                          gaussHighlightPoint={gaussHighlightPoint}
                            onSampleSet={handleSampleSet}
                            selectionMask={selectionMask}
                            selectRegionEnabled={selectRegionEnabled}
                            onSelectionPick={handleSurfaceSelectionPick}
                            inspectEnabled={inspectEnabled}
                            onInspectPick={handleInspectPick}
                            inspectPoint={inspectPos}
                            selectionOverlayVisible={selectionOverlayVisible}
                            selectionOverlayOnTop={selectionOverlayOnTop}
                            selectionSphere={selectionSphere}
                            geodesicPathEnabled={geodesicPathEnabled}
                            onGeodesicPathPick={handleGeodesicPathPick}
                            geodesicPathStart={geodesicPathStart}
                            geodesicPathEnd={geodesicPathEnd}
                            geodesicPathIndices={geodesicPathIndices}
                            geodesicPathSmooth={geodesicPathSmooth}
                            geodesicPathDebug={geodesicPathDebug}
                            geodesicHeatEnabled={geodesicHeatEnabled && geodesicHeatAvailable}
                            onGeodesicHeatPick={handleGeodesicHeatPick}
                            geodesicHeatStart={
                              geodesicHeatStart
                                ? { point: geodesicHeatStart.point, meshKey: geodesicHeatStart.meshKey }
                                : null
                            }
                            geodesicHeatEnd={
                              geodesicHeatEnd
                                ? { point: geodesicHeatEnd.point, meshKey: geodesicHeatEnd.meshKey }
                                : null
                            }
                            geodesicHeatPolylines={geodesicHeatPolylines}
                            geodesicHeatmapValues={geodesicHeatHeatmapValues}
                            geodesicHeatmapEnabled={geodesicHeatHeatmapActive}
                            overlayPolylineGroups={combinedOverlayPolylineGroups}
                            geodesicDiskEnabled={geodesicDiskEnabled}
                            geodesicDiskPickEnabled={geodesicDiskEnabled && geodesicDiskPickMode}
                            onGeodesicDiskPick={handleGeodesicDiskPick}
                            geodesicDiskCenter={
                              geodesicDiskCenter ? { point: geodesicDiskCenter.point } : null
                            }
                            geodesicDiskMesh={geodesicDiskResult?.mesh ?? null}
                            geodesicDiskBoundary={geodesicDiskResult?.boundary ?? null}
                            geodesicDiskShowBoundary={geodesicDiskShowBoundary}
                            zoomToRegion={zoomToRegion}
                            zoomToRegionToken={zoomNowToken}
                            weierstrassDiagnostics={
                              surfaceViewerKind === "weierstrass" ? weierstrassDiagnostics : null
                            }
                            showDriftArrow={surfaceViewerKind === "weierstrass" ? showDriftArrow : false}
                            onParamGeodesicState={handleParamGeodesicState}
                          />
                        ) : (
                        <SurfaceViewer
                              surfaceId={primarySurfaceId}
                              graphExpr={graphExpr}
                            implicitExpr={implicitExpr}
                            implicitMeshOverride={activeCgalMesh}
                            surfaceMeshOverride={
                              surfaceViewerKind === "mesh" || surfaceViewerKind === "complex" ? surfaceMeshData : null
                            }
                            implicitMeshToken={cgalMeshToken}
                            sampleMaxPoints={surfaceViewerKind === "graph" ? graphSampleMaxPoints : undefined}
                            wireframe={primaryOverlay.showWireframe}
                            showPlanes={primaryOverlay.showPlanes}
                            lightPreset={lightPreset}
                            materialRoughness={materialRoughness}
                            materialMetalness={materialMetalness}
                            materialOpacity={materialOpacity}
                            graphResolution={graphResolution}
                            implicitResolution={implicitResolution}
                            implicitDomainSize={implicitDomainSizeFor(primarySurfaceId)}
                            colorMode={primaryOverlay.colorMode}
                            colorPalette={primaryOverlay.colorPalette}
                            showChartGrid={primaryOverlay.showChartGrid}
                            chartGridCountU={chartGridCountU}
                            chartGridCountV={chartGridCountV}
                            implicitOverlay={implicitOverlay}
                            graphDomain={activeGraphDomain}
                            showBoundingBox={primaryOverlay.showBoundingBox}
                            resetToken={cameraResetToken}
                            graphProbeXY={graphProbeXY}
                            graphProbeToken={graphProbeToken}
                            implicitProbeXYZ={implicitProbeXYZ}
                            implicitProbeToken={implicitProbeToken}
                            probeEnabled={probeEnabled}
                            showProbeNormal={showProbeNormal}
                            showProbeTangentPlane={showProbeTangentPlane}
                            showProbeTangents={showProbeTangents}
                            showPrincipalDirections={showPrincipalDirections}
                            showPrincipalNormalPlanes={showPrincipalNormalPlanes}
                            showPrincipalLines={showPrincipalLines}
                            showPrincipalGlyphs={showPrincipalGlyphs}
                            principalGlyphDensity={principalGlyphDensity}
                            principalGlyphLength={principalGlyphLength}
                            principalGlyphMode={principalGlyphMode}
                            showCurvatureLines={showCurvatureLines}
                            curvatureLineField={curvatureLineField}
                            curvatureSeedSource={curvatureSeedSource}
                            curvatureSeedDensity={curvatureSeedDensity}
                            curvatureStepSize={curvatureStepSize}
                            curvatureMaxSteps={curvatureMaxSteps}
                            curvatureMaxLines={curvatureMaxLines}
                            curvatureRebuildToken={curvatureRebuildToken}
                            showRidges={showRidges}
                            showValleys={showValleys}
                            ridgeValleySelectionOnly={ridgeValleySelectionOnly}
                            ridgeValleyMagMin={ridgeValleyMagMin}
                            ridgeValleyContrast={ridgeValleyContrast}
                            ridgeValleyMinCos={ridgeValleyMinCos}
                            ridgeValleySegmentScale={ridgeValleySegmentScale}
                            ridgeValleySampleMode={ridgeValleySampleMode}
                            ridgeValleyStitch={ridgeValleyStitch}
                            ridgeValleyDecimate={ridgeValleyDecimate}
                            ridgeValleyMaxCurves={ridgeValleyMaxCurves}
                            ridgeValleyMinConf={ridgeValleyMinConf}
                            onProbe={handleProbe}
                            onSetGraphExpr={setGraphExpr}
                            onSetImplicitExpr={setImplicitExpr}
                            // contours (remove if SurfaceViewer doesn't support yet)
                            showContours={primaryOverlay.showContours}
                            contourCount={contourCount}
                            isCameraLeader={cameraSyncEnabled}
                            onCameraSync={cameraSyncEnabled ? setCameraSync : undefined}
                            cameraOverride={cameraOverride}
                            cameraOverrideToken={cameraOverrideToken}
                            captureToken={workbookCaptureToken}
                            onCaptureThumbnail={handleWorkbookThumbnail}
                          gaussMapEnabled={showGaussMap}
                          onToggleGaussMap={() => setShowGaussMap((v) => !v)}
                        onGaussPoints={handleGaussPoints}
                        gaussHighlightPoint={gaussHighlightPoint}
                        onSampleSet={handleSampleSet}
                        selectionMask={selectionMask}
                        selectRegionEnabled={selectRegionEnabled}
                        onSelectionPick={handleSurfaceSelectionPick}
                        inspectEnabled={inspectEnabled}
                        onInspectPick={handleInspectPick}
                        inspectPoint={inspectPos}
                        selectionOverlayVisible={selectionOverlayVisible}
                        selectionOverlayOnTop={selectionOverlayOnTop}
                        selectionSphere={selectionSphere}
                        geodesicPathEnabled={geodesicPathEnabled}
                        onGeodesicPathPick={handleGeodesicPathPick}
                        geodesicPathStart={geodesicPathStart}
                        geodesicPathEnd={geodesicPathEnd}
                        geodesicPathIndices={geodesicPathIndices}
                        geodesicHeatEnabled={geodesicHeatEnabled && geodesicHeatAvailable}
                        onGeodesicHeatPick={handleGeodesicHeatPick}
                        geodesicHeatStart={geodesicHeatStart ? { point: geodesicHeatStart.point, meshKey: geodesicHeatStart.meshKey } : null}
                        geodesicHeatEnd={geodesicHeatEnd ? { point: geodesicHeatEnd.point, meshKey: geodesicHeatEnd.meshKey } : null}
                        geodesicHeatPolylines={geodesicHeatPolylines}
                        geodesicHeatmapValues={geodesicHeatHeatmapValues}
                        geodesicHeatmapEnabled={geodesicHeatHeatmapActive}
                        overlayHeatmapValues={
                          compareDiffHeatmapActive
                            ? compareDiffHeatmapValues
                            : complexMapHeatmapActive
                            ? complexMapDistortionValues3d
                            : null
                        }
                        overlayHeatmapEnabled={compareDiffHeatmapActive || complexMapHeatmapActive}
                        overlayPolylines={complexMapOverlayPolylines}
                        overlayPolylinesColor={0xffd400}
                        overlayPolylineGroups={combinedOverlayPolylineGroups}
                        overlayPointSets={complexMapOverlayPointsActive}
                        geodesicDiskEnabled={geodesicDiskEnabled}
                        geodesicDiskPickEnabled={geodesicDiskEnabled && geodesicDiskPickMode}
                        onGeodesicDiskPick={handleGeodesicDiskPick}
                        geodesicDiskCenter={geodesicDiskCenter ? { point: geodesicDiskCenter.point } : null}
                        geodesicDiskMesh={geodesicDiskResult?.mesh ?? null}
                        geodesicDiskBoundary={geodesicDiskResult?.boundary ?? null}
                        geodesicDiskShowBoundary={geodesicDiskShowBoundary}
                        zoomToRegion={zoomToRegion}
                        zoomToRegionToken={zoomNowToken}
                      />
                        )}
                      </div>

                          {compareEnabled && (
                        <div style={{ borderRadius: 10, overflow: "hidden", background: "#f8f9fb" }}>
                          {surfaceViewerKind === "param" ? (
                            <ParamSurfaceViewer
                              surfaceId={secondaryParamId}
                              customX={paramXExpr}
                              customY={paramYExpr}
                              customZ={paramZExpr}
                              wireframe={secondaryOverlay.showWireframe}
                              showPlanes={secondaryOverlay.showPlanes}
                              lightPreset={lightPreset}
                              materialRoughness={materialRoughness}
                              materialMetalness={materialMetalness}
                              materialOpacity={materialOpacity}
                              paramResolution={paramResolution}
                              colorMode={secondaryOverlay.colorMode}
                              colorPalette={secondaryOverlay.colorPalette}
                              showChartGrid={secondaryOverlay.showChartGrid}
                              chartGridCountU={chartGridCountU}
                              chartGridCountV={chartGridCountV}
                              paramDomain={activeParamDomain}
                              overlayPolylineGroups={compareOverlayPolylineGroups}
                              probeEnabled={false}
                              showProbeNormal={false}
                              showProbeTangentPlane={false}
                              showProbeTangents={false}
                              showPrincipalDirections={false}
                              showPrincipalNormalPlanes={false}
                              showPrincipalLines={false}
                              showPrincipalGlyphs={false}
                              showCurvatureLines={false}
                            showBoundingBox={secondaryOverlay.showBoundingBox}
                              resetToken={cameraResetToken}
                              onSetCustomX={setParamXExpr}
                              onSetCustomY={setParamYExpr}
                              onSetCustomZ={setParamZExpr}
                              isCameraLeader={false}
                              cameraSync={compareCameraSyncEnabled ? cameraSync : null}
                              cameraOverride={compareCameraOverride}
                              cameraOverrideToken={compareCameraOverrideToken}
                            />
                          ) : (
                            <SurfaceViewer
                              surfaceId={secondarySurfaceId}
                              graphExpr={graphExpr}
                              implicitExpr={implicitExpr}
                              surfaceMeshOverride={
                                surfaceViewerKind === "mesh" || surfaceViewerKind === "complex" ? surfaceMeshData : null
                              }
                              sampleMaxPoints={surfaceViewerKind === "graph" ? graphSampleMaxPoints : undefined}
                              wireframe={secondaryOverlay.showWireframe}
                              showPlanes={secondaryOverlay.showPlanes}
                              lightPreset={lightPreset}
                              materialRoughness={materialRoughness}
                              materialMetalness={materialMetalness}
                              materialOpacity={materialOpacity}
                              graphResolution={graphResolution}
                              implicitResolution={implicitResolution}
                              implicitDomainSize={implicitDomainSizeFor(secondarySurfaceId)}
                              colorMode={secondaryOverlay.colorMode}
                              colorPalette={secondaryOverlay.colorPalette}
                              implicitOverlay={implicitOverlay}
                              graphDomain={activeGraphDomain}
                              showBoundingBox={secondaryOverlay.showBoundingBox}
                              resetToken={cameraResetToken}
                              overlayPolylineGroups={compareOverlayPolylineGroups}
                              graphProbeXY={null}
                              graphProbeToken={0}
                              implicitProbeXYZ={null}
                              implicitProbeToken={0}
                              probeEnabled={false}
                              showProbeNormal={false}
                              showProbeTangentPlane={false}
                              showProbeTangents={false}
                              showPrincipalDirections={false}
                              showPrincipalNormalPlanes={false}
                              showPrincipalLines={false}
                              showPrincipalGlyphs={false}
                              showCurvatureLines={false}
                              // contours (remove if SurfaceViewer doesn't support yet)
                              showContours={secondaryOverlay.showContours}
                              contourCount={contourCount}
                              showChartGrid={secondaryOverlay.showChartGrid}
                              chartGridCountU={chartGridCountU}
                              chartGridCountV={chartGridCountV}
                              isCameraLeader={false}
                              cameraSync={compareCameraSyncEnabled ? cameraSync : null}
                              cameraOverride={compareCameraOverride}
                              cameraOverrideToken={compareCameraOverrideToken}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {(showGaussMap || (surfaceViewerKind === "complex" && complexMapShowSphere)) && (
                    <div
                      style={{
                        minWidth: 240,
                        maxWidth: 340,
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        alignItems: "stretch",
                        overflowY: "auto",
                      }}
                    >
                      {showGaussMap && (
                        <GaussMapPanel
                          samples={surfaceSampleSet?.samples ?? []}
                          palette={colorPalette}
                          colorMode={gaussColorMode}
                          probeNormal={probeInfo?.normal ?? null}
                          inspectDir={inspectNormal}
                          onPointHover={(idx) => setGaussHoverIndex(idx)}
                          height={surfaceViewerKind === "complex" && complexMapShowSphere ? 220 : 280}
                          selectionMask={selectionMask}
                          onGaussSelection={handleGaussSelection}
                          densityNormals={selectionBaseArrays?.normals ?? null}
                          densitySelectionIndices={selectionIndices}
                        />
                      )}
                      {surfaceViewerKind === "complex" && complexMapShowSphere && (
                        <div
                          style={{
                            borderRadius: 10,
                            background: "#f8f9fb",
                            boxShadow: "0 0 0 1px #e0e0e0",
                            padding: 8,
                            minHeight: 250,
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Riemann sphere</div>
                          <RiemannSpherePlot
                            lines={complexMapSphereLines3d}
                            points={complexMapSpherePoints3d}
                            guideSpheres={complexMapSphereGuides}
                            style={{ height: 220 }}
                          />
                          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                            w mapped by stereographic projection; poles collapse to the north pole.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>

            <div onMouseDown={startDragRight} style={splitterStyle} />

            {/* RIGHT */}
            <div style={{ ...styles.panelLeft, width: rightWidth, maxWidth: maxRight }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {(["inspector", "workbook"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setRightPanelTab(tab)}
                    style={pill(rightPanelTab === tab)}
                    aria-pressed={rightPanelTab === tab}
                  >
                    {tab === "inspector" ? "Inspector" : "Workbook"}
                  </button>
                ))}
              </div>

              {rightPanelTab === "inspector" ? (
                <SurfacesRightPanel
                  viewerKind={surfaceViewerKind}
                  surfaceId={activeEqSurfaceId}
                  paramId={paramSurfaceId}
                  surfaceMeshLabel={surfaceMeshLabel}
                  surfaceMeshStats={surfaceMeshStats}
                  surfaceMeshSource={surfaceMeshData?.source ?? null}
                  onPickEqSurface={handlePickEqSurface}
                  onPickParamSurface={handlePickParamSurface}
                  implicitExpr={implicitExpr}
                  onChangeImplicitExpr={setImplicitExpr}
                  implicitResolution={implicitResolution}
                  vtkPreviewBusy={vtkPreviewBusy}
                  vtkPreviewError={vtkPreviewError}
                  vtkPreviewTargetFaces={vtkPreviewTargetFaces}
                  vtkPreviewUseDecimate={vtkPreviewUseDecimate}
                  onChangeVtkPreviewTargetFaces={setVtkPreviewTargetFaces}
                  onChangeVtkPreviewUseDecimate={setVtkPreviewUseDecimate}
                  onRunVtkPreview={handleVtkPreviewImplicit}
                  cgalHealthState={cgalHealthState}
                  cgalBusy={cgalBusy}
                  cgalError={cgalError}
                  cgalTargetEdge={cgalTargetEdge}
                  cgalAutoTargetEdge={cgalAutoTargetEdge}
                  onChangeCgalTargetEdge={setCgalTargetEdge}
                  onChangeCgalAutoTargetEdge={setCgalAutoTargetEdge}
                  cgalPadFrac={cgalPadFrac}
                  onChangeCgalPadFrac={setCgalPadFrac}
                  cgalTriBudgetEnabled={cgalTriBudgetEnabled}
                  onChangeCgalTriBudgetEnabled={setCgalTriBudgetEnabled}
                  cgalTriBudget={cgalTriBudget}
                  onChangeCgalTriBudget={setCgalTriBudget}
                  cgalAutoEdge={cgalAutoEdge}
                  cgalTriBudgetEdge={cgalTriBudgetEdge}
                  cgalRadiusBound={cgalRadiusBound}
                  onChangeCgalRadiusBound={setCgalRadiusBound}
                  cgalMinTrisEnabled={cgalMinTrisEnabled}
                  onChangeCgalMinTrisEnabled={setCgalMinTrisEnabled}
                  cgalMinTris={cgalMinTris}
                  onChangeCgalMinTris={setCgalMinTris}
                  cgalDomainDiag={cgalDomainDiag}
                  cgalEffectiveEdge={cgalEffectiveEdge}
                  cgalEstimatedTris={cgalEstimatedTris}
                  cgalTooHeavy={cgalTooHeavy}
                  cgalVerbose={cgalVerbose}
                  onChangeCgalVerbose={setCgalVerbose}
                  cgalPreflightSamples={cgalPreflightSamples}
                  onChangeCgalPreflightSamples={setCgalPreflightSamples}
                  onRunCgalMesh={handleRunCgalMesh}
                  onStopCgalWorker={handleStopCgalWorker}
                  cgalMeshInfo={cgalMeshInfo}
                  probeInfo={probeInfo}
                  onPickDomainUV={(uv) => {
                    setParamProbeUV(uv);
                    setParamProbeToken((t) => t + 1);
                  }}
                  onPickDomainXY={(xy) => {
                    setGraphProbeXY(xy);
                    setGraphProbeToken((t) => t + 1);
                  }}
                  onPickDomainXYZ={(xyz) => {
                    setImplicitProbeXYZ(xyz);
                    setImplicitProbeToken((t) => t + 1);
                  }}
                  graphDomain={activeGraphDomain}
                  onChangeGraphDomain={handleChangeGraphDomain}
                  paramDomain={activeParamLikeDomain}
                  onChangeParamDomain={handleChangeParamDomain}
                  implicitDomain={activeImplicitDomain}
                  onChangeImplicitDomain={handleChangeImplicitDomain}
                  graphDomainPresets={graphDomainPresets}
                  paramDomainPresets={paramDomainPresets}
                  implicitDomainPresets={implicitDomainPresets}
                  onSaveGraphDomainPreset={saveGraphDomainPreset}
                  onSaveParamDomainPreset={saveParamDomainPreset}
                  onSaveImplicitDomainPreset={saveImplicitDomainPreset}
                  onApplyGraphDomainPreset={applyGraphDomainPreset}
                  onApplyParamDomainPreset={applyParamDomainPreset}
                  onApplyImplicitDomainPreset={applyImplicitDomainPreset}
                  onRemoveGraphDomainPreset={removeGraphDomainPreset}
                  onRemoveParamDomainPreset={removeParamDomainPreset}
                  onRemoveImplicitDomainPreset={removeImplicitDomainPreset}
                />
              ) : (
                <WorkbookPanel
                  workbooks={workbooks}
                  activeWorkbookId={activeWorkbookId}
                  activeStageId={activeStageId}
                  computeStatusById={computeStatusById}
                  workbookStatus={workbookStatus}
                  onSelectWorkbook={setActiveWorkbookId}
                  onCreateWorkbook={handleCreateWorkbook}
                  onCreateWorkbookFromTemplate={handleCreateWorkbookFromTemplate}
                  onCreateWorkbooksFromPack={handleCreateWorkbooksFromPack}
                  onDuplicateWorkbook={handleDuplicateWorkbook}
                  onDeleteWorkbook={handleDeleteWorkbook}
                  onRenameWorkbook={handleRenameWorkbook}
                  onSelectStage={setActiveStageId}
                  onAddBlock={handleAddWorkbookBlock}
                  onUpdateBlock={handleUpdateWorkbookBlock}
                  onRemoveBlock={handleRemoveWorkbookBlock}
                  onMoveBlock={handleMoveWorkbookBlock}
                  onCaptureVisualize={handleCaptureVisualize}
                  onApplyVisualize={handleApplyVisualize}
                  onToggleVisualizeLive={handleToggleVisualizeLive}
                  onRunComputeBlock={handleRunComputeBlock}
                  onRunComputeStage={handleRunComputeStage}
                  onRunAllStale={handleRunAllStale}
                  onRunFromBlock={handleRunFromBlock}
                  onClearWorkbookSelection={() => {
                    setSelectionMaskOverride(null);
                    setSelectionMask(null);
                    setSelection(null);
                    setSelectionSeed(null);
                  }}
                  paramCatalog={paramCatalog}
                  onAddBlockParam={handleAddBlockParam}
                  onRemoveBlockParam={handleRemoveBlockParam}
                  onUpdateBlockParam={handleUpdateBlockParam}
                  onToggleParamScrub={handleToggleParamScrub}
                  onApplyParams={handleApplyParams}
                  onAddKeyframe={handleAddKeyframe}
                  onRemoveKeyframe={handleRemoveKeyframe}
                  onUpdateInteraction={handleUpdateInteraction}
                  onUpdateInteractionDirection={handleUpdateInteractionDirection}
                  onArmInteraction={handleArmInteraction}
                  onFinishInteraction={handleFinishInteraction}
                  onClearInteraction={handleClearInteraction}
                  onExportJson={handleExportWorkbooks}
                  onExportMarkdown={handleExportWorkbooksMarkdown}
                  onExportPdf={handleExportWorkbooksPdf}
                  onExportReplayHtml={handleExportWorkbooksReplayHtml}
                  onImportJson={handleImportWorkbooks}
                  readOnly={IS_REPLAY_MODE}
                  currentDatasetRef={currentDatasetRef}
                  cameraReady={!!cameraSync}
                  ghostOverlaysEnabled={workbookGhostOverlaysEnabled}
                  onToggleGhostOverlays={(next) => setWorkbookGhostOverlaysEnabled(next)}
                  templates={WORKBOOK_TEMPLATES}
                  problemPacks={WORKBOOK_PROBLEM_PACKS}
                />
              )}
            </div>
          </div>
        ) : (
          <>
            {/* LEFT (2D modes) */}
            <div style={{ ...styles.panelLeft, width: leftWidth }}>
              {mode === "mobius" && <MobiusScreen params={mobiusParams} onChange={setMobiusParams} />}

              {mode === "chebyshev" && <ChebyshevScreen n={chebN} onChangeN={setChebN} />}

              {mode === "transform" && (
                <TransformPanel kind={primKind} value={primValue} onChangeKind={setPrimKind} onChangeValue={setPrimValue} />
              )}

              {mode === "maps" && <MapsPanel mapId={mapId} />}
            </div>

            <div onMouseDown={startDragLeft} style={splitterStyle} />

            {/* RIGHT (2D planes) */}
            <div style={styles.stack}>


{mode === "mobius" && (
  <div style={{ marginBottom: 10 }}>
    <div style={pillRow}>
      {(["map", "decompose", "invariants", "circles"] as MobiusSubTab[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => {
            setMobiusSubTab(t);
            if (t !== "decompose") setMobiusDecompStep(4);
          }}
          style={pill(mobiusSubTab === t)}
          aria-pressed={mobiusSubTab === t}
        >
          {t === "map" ? "Map" : t === "decompose" ? "Decompose" : t === "invariants" ? "Invariants" : "Circles/Lines"}
        </button>
      ))}
    </div>

    {mobiusSubTab === "decompose" && (
      <MobiusDecomposeCard
        params={mobiusParams}
        step={mobiusDecompStep}
        onStep={setMobiusDecompStep}
      />
    )}

    {mobiusSubTab === "invariants" && <MobiusInvariantsCard params={mobiusParams} />}

    {mobiusSubTab === "circles" && (
    <div style={{ ...cardStyle, maxHeight: 140, overflow: "auto" }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Circles/Lines</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Coming next: pick a circle/line in Z-plane and show its image parameters in W-plane.
        </div>
      </div>
    )}
  </div>
)}

              <h3 style={styles.h3}>Z-plane (domain)</h3>
              <div style={{ flex: 1, minHeight: 260 }}>
                <PlanePlot id="svgZ" extent={3} step={1} ref={zRef} style={{ height: "100%" }} />
              </div>

              <h3 style={styles.h3}>W-plane (image)</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, marginBottom: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={wPlaneDomainColor}
                    onChange={(e) => setWPlaneDomainColor(e.target.checked)}
                  />
                  Domain coloring
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={wPlaneShowRings}
                    onChange={(e) => setWPlaneShowRings(e.target.checked)}
                    disabled={!wPlaneDomainColor}
                  />
                  |w| rings
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={wPlaneShowRays}
                    onChange={(e) => setWPlaneShowRays(e.target.checked)}
                    disabled={!wPlaneDomainColor}
                  />
                  arg(w) rays
                </label>
              </div>
              <div style={{ flex: 1, minHeight: 260 }}>
                <PlanePlot
                  id="svgW"
                  extent={3}
                  step={1}
                  ref={wRef}
                  style={{ height: "100%" }}
                  domainColoring={wPlaneDomainColor}
                  domainRings={wPlaneShowRings}
                  domainRays={wPlaneShowRays}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;

/* ---------------- Transform panel ---------------- */

type TransformPanelProps = {
  kind: TransformPrimitive;
  value: number;
  onChangeKind: (k: TransformPrimitive) => void;
  onChangeValue: (v: number) => void;
};

const TransformPanel: React.FC<TransformPanelProps> = ({ kind, value, onChangeKind, onChangeValue }) => {
  const labelParam = kind === "circle" ? "r" : kind === "vline" ? "x₀" : "y₀";

  return (
    <section>
      <h2 style={styles.h2}>Transform viewer (z ↦ z²)</h2>

      <label>Primitive</label>
      <select value={kind} onChange={(e) => onChangeKind(e.target.value as TransformPrimitive)}>
        <option value="vline">Vertical line (Re z = x₀)</option>
        <option value="hline">Horizontal line (Im z = y₀)</option>
        <option value="circle">Circle (center 0, radius r)</option>
      </select>

      <label style={{ marginTop: 8, display: "block" }}>Parameter {labelParam}</label>
      <input type="number" step={0.1} value={value} onChange={(e) => onChangeValue(Number(e.target.value) || 0)} />

      <p style={styles.hint}>Domain curve is drawn in the Z-plane; its image under f(z)=z² appears in the W-plane.</p>
    </section>
  );
};

/* ---------------- Maps UI ---------------- */

const MAPS_META: { id: MapId; label: string; desc: string }[] = [
  { id: "square", label: "z² demo", desc: "Unit circle mapped by w = z² (demo)." },
  { id: "cayley", label: "Cayley", desc: "Cayley map: unit disk ↔ right half-plane." },
  { id: "stripToDisk", label: "Strip → disk", desc: "Horizontal strip |Im z| < 1 mapped to the unit disk." },
];

type MapsButtonsProps = {
  mapId: MapId;
  onChangeMapId: (m: MapId) => void;
};

const MapsButtons: React.FC<MapsButtonsProps> = ({ mapId, onChangeMapId }) => (
  <div style={{ ...styles.group, ...styles.groupWide }}>
    <div style={styles.presetsRow}>
      {MAPS_META.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChangeMapId(m.id)}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid " + (mapId === m.id ? "#0a66c2" : "#ddd"),
            background: mapId === m.id ? "#e6f0ff" : "#fff",
            fontWeight: mapId === m.id ? 600 : 400,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  </div>
);

const MapsPanel: React.FC<{ mapId: MapId }> = ({ mapId }) => {
  const meta = MAPS_META.find((m) => m.id === mapId) ?? MAPS_META[0];
  return (
    <section>
      <h2 style={styles.h2}>Standard conformal maps</h2>
      <p style={styles.hint}>{meta.desc}</p>
    </section>
  );
};

/* ---------------- Surfaces controls ---------------- */

type SurfacesControlsProps = {
  viewerKind: SurfaceViewerKind;
  onChangeViewerKind: (k: SurfaceViewerKind) => void;
  datasetKind: DatasetKind;
  onChangeDatasetKind: (k: DatasetKind) => void;
  surfaceId: SurfaceId;
  onChangeSurface: (s: SurfaceId) => void;
  paramId: ParamSurfaceId;
  onChangeParamId: (p: ParamSurfaceId) => void;
  activeWeierstrassPreset: WeierstrassPreset | null;
  onApplyWeierstrassPreset: (preset: WeierstrassPreset) => void;
  onApplySuggestedDomain: (preset: WeierstrassPreset) => void;
  compareEnabled: boolean;
  compareIgnoreWorkbookOverlays: boolean;
  compareCameraSync: boolean;
  compareDiffHeatmapEnabled: boolean;
  compareDiffHeatmapAvailable: boolean;
  onToggleCompare: () => void;
  onToggleCompareIgnoreWorkbookOverlays: () => void;
  onToggleCompareCameraSync: () => void;
  onToggleCompareDiffHeatmap: () => void;
  compareSurfaceId: SurfaceId;
  onChangeCompareSurface: (s: SurfaceId) => void;
  compareParamId: ParamSurfaceId;
  onChangeCompareParamId: (p: ParamSurfaceId) => void;
};

const SurfacesControls: React.FC<SurfacesControlsProps> = ({
  viewerKind,
  onChangeViewerKind,
  datasetKind,
  onChangeDatasetKind,
  surfaceId,
  onChangeSurface,
  paramId,
  onChangeParamId,
  activeWeierstrassPreset,
  onApplyWeierstrassPreset,
  onApplySuggestedDomain,
  compareEnabled,
  compareIgnoreWorkbookOverlays,
  compareCameraSync,
  compareDiffHeatmapEnabled,
  compareDiffHeatmapAvailable,
  onToggleCompare,
  onToggleCompareIgnoreWorkbookOverlays,
  onToggleCompareCameraSync,
  onToggleCompareDiffHeatmap,
  compareSurfaceId,
  onChangeCompareSurface,
  compareParamId,
  onChangeCompareParamId,
}) => {
  const implicitSurfaces = SURFACES_EQ_META.filter((s) => !isGraphSurface(s.id));
  const graphSurfaces = SURFACES_EQ_META.filter((s) => isGraphSurface(s.id));
    const isVolume = datasetKind === "volume";
    const isMesh = datasetKind === "mesh";
    const isSurface = datasetKind === "surface";

  return (
    <div style={{ ...styles.group, ...styles.groupWide, gap: 12 }}>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
            onClick={() => {
              onChangeDatasetKind("surface");
              onChangeViewerKind("implicit");
            }}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
              border: "1px solid " + (isSurface && viewerKind === "implicit" ? "#0a66c2" : "#ddd"),
              background: isSurface && viewerKind === "implicit" ? "#e6f0ff" : "#fff",
              fontWeight: isSurface && viewerKind === "implicit" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          f(x,y,z) = 0 viewer
        </button>

        <button
          type="button"
            onClick={() => {
              onChangeDatasetKind("surface");
              onChangeViewerKind("graph");
            }}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
              border: "1px solid " + (isSurface && viewerKind === "graph" ? "#0a66c2" : "#ddd"),
              background: isSurface && viewerKind === "graph" ? "#e6f0ff" : "#fff",
              fontWeight: isSurface && viewerKind === "graph" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          z = f(x,y) viewer
        </button>

        <button
          type="button"
            onClick={() => {
              onChangeDatasetKind("surface");
              onChangeViewerKind("param");
            }}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
              border: "1px solid " + (isSurface && viewerKind === "param" ? "#0a66c2" : "#ddd"),
              background: isSurface && viewerKind === "param" ? "#e6f0ff" : "#fff",
              fontWeight: isSurface && viewerKind === "param" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          σ(u,v) viewer
        </button>
        <button
          type="button"
            onClick={() => {
              onChangeDatasetKind("surface");
              onChangeViewerKind("weierstrass");
            }}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
              border: "1px solid " + (isSurface && viewerKind === "weierstrass" ? "#0a66c2" : "#ddd"),
              background: isSurface && viewerKind === "weierstrass" ? "#e6f0ff" : "#fff",
              fontWeight: isSurface && viewerKind === "weierstrass" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          Weierstrass
        </button>
        <button
          type="button"
            onClick={() => {
              onChangeDatasetKind("mesh");
              onChangeViewerKind("complex");
            }}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
              border: "1px solid " + (isMesh && viewerKind === "complex" ? "#0a66c2" : "#ddd"),
              background: isMesh && viewerKind === "complex" ? "#e6f0ff" : "#fff",
              fontWeight: isMesh && viewerKind === "complex" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          Complex map
        </button>
        <button
          type="button"
            onClick={() => {
              onChangeDatasetKind("mesh");
              onChangeViewerKind("mesh");
            }}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
              border: "1px solid " + (isMesh && viewerKind === "mesh" ? "#0a66c2" : "#ddd"),
              background: isMesh && viewerKind === "mesh" ? "#e6f0ff" : "#fff",
              fontWeight: isMesh && viewerKind === "mesh" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          SurfaceMesh
        </button>
        <button
          type="button"
          onClick={() => onChangeDatasetKind("volume")}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid " + (isVolume ? "#0a66c2" : "#ddd"),
            background: isVolume ? "#e6f0ff" : "#fff",
            fontWeight: isVolume ? 600 : 400,
            cursor: "pointer",
          }}
        >
          Volume
        </button>
      </div>

      {datasetKind !== "volume" && (
        <div style={{ flex: 1 }}>
          {viewerKind === "implicit" && (
            <SurfacesButtons surfaceId={surfaceId} surfaces={implicitSurfaces} onChangeSurface={onChangeSurface} />
          )}
          {viewerKind === "graph" && (
            <SurfacesButtons surfaceId={surfaceId} surfaces={graphSurfaces} onChangeSurface={onChangeSurface} />
          )}
          {viewerKind === "param" && <ParamSurfacesButtons paramId={paramId} onChangeParamId={onChangeParamId} />}
          {viewerKind === "weierstrass" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Presets</span>
                <span
                  title="Presets avoid singularities on the boundary; adjust the domain carefully when poles are nearby."
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: "1px solid #bbb",
                    fontSize: 12,
                    textAlign: "center",
                    lineHeight: "14px",
                    cursor: "help",
                    userSelect: "none",
                  }}
                >
                  ?
                </span>
              </div>
              <div style={styles.presetsRow}>
                {WEIERSTRASS_PRESETS.map((p) => {
                  const active = activeWeierstrassPreset?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onApplyWeierstrassPreset(p)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid " + (active ? "#0a66c2" : "#ddd"),
                        background: active ? "#e6f0ff" : "#fff",
                        fontWeight: active ? 600 : 400,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              {activeWeierstrassPreset && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #e0e0e0",
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Suggested safe domain</div>
                  <div style={{ fontSize: 12 }}>
                    u range: [{fmt(activeWeierstrassPreset.suggestedDomain.uMin)}, {fmt(activeWeierstrassPreset.suggestedDomain.uMax)}], v range: [{fmt(activeWeierstrassPreset.suggestedDomain.vMin)}, {fmt(activeWeierstrassPreset.suggestedDomain.vMax)}]
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.8, marginTop: 6 }}>
                    {activeWeierstrassPreset.safeDomainReason}
                  </div>
                  <button
                    type="button"
                    onClick={() => onApplySuggestedDomain(activeWeierstrassPreset)}
                    style={{ marginTop: 8, padding: "4px 10px" }}
                  >
                    Apply suggested domain
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={compareEnabled}
            onChange={onToggleCompare}
            disabled={viewerKind === "weierstrass" || viewerKind === "mesh" || viewerKind === "complex" || isVolume}
          />
          Compare
        </label>
        {compareEnabled && (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={compareCameraSync}
                onChange={onToggleCompareCameraSync}
              />
              Sync cameras
            </label>
            <label
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
              title="Graph snapshots only: shows |ΔK| curvature heatmap on the left pane."
            >
              <input
                type="checkbox"
                checked={compareDiffHeatmapEnabled}
                onChange={onToggleCompareDiffHeatmap}
                disabled={!compareDiffHeatmapAvailable}
              />
              Diff heatmap
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={compareIgnoreWorkbookOverlays}
                onChange={onToggleCompareIgnoreWorkbookOverlays}
              />
              Ignore workbook overlays
            </label>
          </>
        )}
      </div>

      {compareEnabled && viewerKind !== "mesh" && viewerKind !== "complex" && !isVolume && (
        <div style={{ flex: 1 }}>
          {viewerKind === "implicit" && (
            <SurfacesButtons surfaceId={compareSurfaceId} surfaces={implicitSurfaces} onChangeSurface={onChangeCompareSurface} />
          )}
          {viewerKind === "graph" && (
            <SurfacesButtons surfaceId={compareSurfaceId} surfaces={graphSurfaces} onChangeSurface={onChangeCompareSurface} />
          )}
          {(viewerKind === "param" || viewerKind === "graph") && (
            <ParamSurfacesButtons paramId={compareParamId} onChangeParamId={onChangeCompareParamId} />
          )}
        </div>
      )}
    </div>
  );
};

type SurfacesButtonsProps = {
  surfaceId: SurfaceId;
  surfaces: { id: SurfaceId; label: string }[];
  onChangeSurface: (s: SurfaceId) => void;
};

const SurfacesButtons: React.FC<SurfacesButtonsProps> = ({ surfaceId, surfaces, onChangeSurface }) => (
  <div style={styles.presetsRow}>
    {surfaces.map((s) => (
      <button
        key={s.id}
        type="button"
        onClick={() => onChangeSurface(s.id)}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid " + (surfaceId === s.id ? "#0a66c2" : "#ddd"),
          background: surfaceId === s.id ? "#e6f0ff" : "#fff",
          fontWeight: surfaceId === s.id ? 600 : 400,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {s.label}
      </button>
    ))}
  </div>
);

type ParamSurfacesButtonsProps = {
  paramId: ParamSurfaceId;
  onChangeParamId: (p: ParamSurfaceId) => void;
};

const ParamSurfacesButtons: React.FC<ParamSurfacesButtonsProps> = ({ paramId, onChangeParamId }) => (
  <div style={styles.presetsRow}>
    {PARAM_SURFACES_META.map((s) => (
      <button
        key={s.id}
        type="button"
        onClick={() => onChangeParamId(s.id)}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid " + (paramId === s.id ? "#0a66c2" : "#ddd"),
          background: paramId === s.id ? "#e6f0ff" : "#fff",
          fontWeight: paramId === s.id ? 600 : 400,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {s.label}
      </button>
    ))}
  </div>
);

/* ---------------- Surfaces Left Panel ---------------- */

type SurfacesLeftPanelProps = {
  viewerKind: SurfaceViewerKind;
  surfaceId: SurfaceId;
  paramId: ParamSurfaceId;
  datasetKind: DatasetKind;
  volumeDatasetOverride: VolumeDataset | null;
  volumeDistanceBusy: boolean;
  volumeDistanceError: string | null;
  volumeDistanceSigned: boolean;
  volumeDistanceAutoBounds: boolean;
  onBuildDistanceVolume: () => void;
  onClearVolumeOverride: () => void;
  volumePresetId: VolumePresetId;
  volumePreset: VolumePreset;
  volumeDims: [number, number, number];
  volumeParams: VolumePresetParams;
  volumeCustomExpr: string;
  volumeCustomError: string | null;
  volumeSeedAxis: SliceAxis;
  volumeSeedIndex: number;
  volumeSeedIndexMax: number;
  volumeCrosshairWorld: [number, number, number] | null;
  volumeCrosshairIndex: [number, number, number];
  volumeCrosshairValue: number | null;
  volumeCrosshairGradMag: number | null;
  volumeViewMode: "slices" | "3d";
  volumeOpacity: number;
  volumeVectorPresetId: VectorPresetId;
  volumeVectorPresetLabel: string;
  volumeShowStreamlines: boolean;
  volumeStreamSeedGrid: number;
  volumeStreamlineStepSize: number;
  volumeStreamlineStepRange: { min: number; max: number; step: number };
  volumeStreamlineMaxSteps: number;
  volumeStreamlineMaxLength: number;
  volumeSampling: VolumeSampling;
  volumeSamplingSpacing: [number, number, number];
  volumeShowCropBox: boolean;
  volumeCropGizmoEnabled: boolean;
  volumeCropGizmoMode: "move" | "scale";
  volumeContourEnabled: boolean;
  volumeContourCount: number;
  volumeWindowMode: "auto" | "minmax";
  volumeSliceReport: VolumeSliceReport | null;
  volumeSliceHover: VolumeSliceHover | null;
  volumeShowIsosurface: boolean;
  volumeIsoValue: number;
  volumeIsoRange: { min: number; max: number; step: number };
  volumeIsoSmooth: boolean;
  volumeIsoSmoothIterations: number;
  onChangeVolumePresetId: (id: VolumePresetId) => void;
  onChangeVolumeDim: (axisIndex: 0 | 1 | 2, value: number) => void;
  onChangeVolumeSamplingCenter: (axisIndex: 0 | 1 | 2, value: number) => void;
  onChangeVolumeSamplingExtent: (axisIndex: 0 | 1 | 2, value: number) => void;
  onResetVolumeSampling: () => void;
  onRebuildVolumeSampling: () => void;
  onToggleVolumeCropBox: (v: boolean) => void;
  onToggleVolumeCropGizmo: (v: boolean) => void;
  onChangeVolumeCropGizmoMode: (mode: "move" | "scale") => void;
  onToggleVolumeContour: (v: boolean) => void;
  onChangeVolumeContourCount: (v: number) => void;
  onChangeVolumeWindowMode: (mode: "auto" | "minmax") => void;
  onToggleVolumeIsosurface: (v: boolean) => void;
  onChangeVolumeIsoValue: (v: number) => void;
  onToggleVolumeIsoSmooth: (v: boolean) => void;
  onChangeVolumeIsoSmoothIterations: (v: number) => void;
  onChangeVolumeParam: (id: string, value: number) => void;
  onChangeVolumeCustomExpr: (value: string) => void;
  onChangeVolumeCrosshairIndex: (axisIndex: 0 | 1 | 2, value: number) => void;
  onChangeVolumeSeedAxis: (axis: SliceAxis) => void;
  onChangeVolumeSeedIndex: (value: number) => void;
  onChangeVolumeViewMode: (mode: "slices" | "3d") => void;
  onChangeVolumeOpacity: (value: number) => void;
  onChangeVolumeVectorPreset: (id: VectorPresetId) => void;
  onToggleVolumeStreamlines: (v: boolean) => void;
  onChangeVolumeStreamSeedGrid: (v: number) => void;
  onChangeVolumeStreamlineStepSize: (v: number) => void;
  onResetVolumeStreamlineStep: () => void;
  onChangeVolumeStreamlineMaxSteps: (v: number) => void;
  surfaceMeshLabel: string;
  surfaceMeshStats: { vertCount: number; triCount: number } | null;
  surfaceMeshSource: SurfaceMeshSource | null;
  surfaceMeshImportBusy: boolean;
  surfaceMeshImportError: string | null;
  surfaceMeshMergeVertices: boolean;
  surfaceMeshPresets: SurfaceMeshPreset[];
  surfaceMeshExportable: boolean;
  surfaceMeshExportBusy: boolean;
  surfaceMeshExportError: string | null;
  surfaceMeshWeldTolerance: number;
  surfaceMeshWeldBusy: boolean;
  surfaceMeshWeldError: string | null;
  onExportSurfaceMeshObj: () => void;
  onExportSurfaceMeshGlb: () => void;
  onChangeSurfaceMeshWeldTolerance: (v: number) => void;
  onWeldSurfaceMesh: () => void;
  implicitBakeResolution: number;
  implicitBakeBounds: ImplicitBakeBounds;
  implicitBakeBusy: boolean;
  implicitBakePhase: "idle" | "sampling" | "marching";
  implicitBakeProgress: number;
  implicitBakeError: string | null;
  implicitBakeCacheHit: boolean;
  onChangeImplicitBakeResolution: (v: number) => void;
  onChangeImplicitBakeBounds: (d: ImplicitBakeBounds) => void;
  onBakeImplicit: () => void;
  onUseImplicitBakeDomain: () => void;
  onResetImplicitBakeBounds: () => void;
  onToggleSurfaceMeshMergeVertices: (v: boolean) => void;
  onGenerateSurfaceMeshPreset: (id: string) => void;
  onLoadSurfaceMeshFile: (files: FileList | File[] | null) => void;
  onConvertToMesh: () => void;
  onToggleVolumeDistanceSigned: (v: boolean) => void;
  onToggleVolumeDistanceAutoBounds: (v: boolean) => void;
  vtkAvailable: boolean;
  vtkBusy: boolean;
  vtkError: string | null;
  vtkDecimateReduction: number;
  onChangeVtkDecimateReduction: (v: number) => void;
  vtkDecimateTargetFaces: number;
  onChangeVtkDecimateTargetFaces: (v: number) => void;
  vtkUseTargetFaces: boolean;
  onToggleVtkUseTargetFaces: (v: boolean) => void;
  vtkSmoothIterations: number;
  onChangeVtkSmoothIterations: (v: number) => void;
  vtkSmoothPassband: number;
  onChangeVtkSmoothPassband: (v: number) => void;
  onVtkCleanNormals: () => void;
  onVtkDecimate: () => void;
  onVtkSmooth: () => void;

  graphExpr: string;
  implicitExpr: string;
  onChangeGraphExpr: (s: string) => void;
  onChangeImplicitExpr: (s: string) => void;

  paramXExpr: string;
  paramYExpr: string;
  paramZExpr: string;
  complexMapSpec: ComplexMapSweepSpec;
  complexMapPresetId: string;
  complexMapError: string | null;
  complexMapLive: boolean;
  onToggleComplexMapLive: (v: boolean) => void;
  complexMapLine: ComplexMapLine;
  complexMapZExtent: number;
  complexMapWExtent: number;
  complexMapLineWPolylines: [number, number][][] | null;
  complexMapIsolineWPolylinesU: [number, number][][] | null;
  complexMapIsolineWPolylinesV: [number, number][][] | null;
  complexMapIsolineZLinesU: [number, number][][] | null;
  complexMapIsolineZLinesV: [number, number][][] | null;
  complexMapGridThickness: number;
  complexMapGridOpacity: number;
  complexMapGridShowSurface: boolean;
  complexMapMarkerData: ComplexMapMarkerData | null;
  complexMapShowCritical: boolean;
  complexMapShowZeros: boolean;
  complexMapShowPoles: boolean;
  complexMapMarkersZ: boolean;
  complexMapMarkersW: boolean;
  complexMapMarkers3d: boolean;
  complexMapMarkerMax: number;
  complexMapCriticalRel: number;
  complexMapZeroRel: number;
  complexMapPoleRel: number;
  setComplexMapShowCritical: (v: boolean) => void;
  setComplexMapShowZeros: (v: boolean) => void;
  setComplexMapShowPoles: (v: boolean) => void;
  setComplexMapMarkersZ: (v: boolean) => void;
  setComplexMapMarkersW: (v: boolean) => void;
  setComplexMapMarkers3d: (v: boolean) => void;
  setComplexMapMarkerMax: (v: number) => void;
  setComplexMapCriticalRel: (v: number) => void;
  setComplexMapZeroRel: (v: number) => void;
  setComplexMapPoleRel: (v: number) => void;
  complexPreimageMode: ComplexPreimageMode;
  complexPreimageValue: number;
  complexPreimageSnap: boolean;
  complexPreimagePolylines: [number, number][][] | null;
  complexPreimageWShape: [number, number][][] | null;
  setComplexPreimageMode: (m: ComplexPreimageMode) => void;
  setComplexPreimageValue: (v: number) => void;
  setComplexPreimageSnap: (v: boolean) => void;
  complexDistortionMode: ComplexDistortionMode;
  complexDistortionShowZ: boolean;
  complexDistortionShowSurface: boolean;
  complexDistortionScale: "linear" | "log";
  complexMapDistortionField: ComplexMapDistortionField | null;
  complexMapDistortionProbe: ComplexMapDistortionProbe | null;
  complexMapProbe: ComplexMapProbe | null;
  complexMapProbePins: ComplexMapProbePin[];
  setComplexDistortionMode: (m: ComplexDistortionMode) => void;
  setComplexDistortionShowZ: (v: boolean) => void;
  setComplexDistortionShowSurface: (v: boolean) => void;
  setComplexDistortionScale: (v: "linear" | "log") => void;
  setComplexMapGridThickness: (v: number) => void;
  setComplexMapGridOpacity: (v: number) => void;
  setComplexMapGridShowSurface: (v: boolean) => void;
  complexMapShowSphere: boolean;
  onToggleComplexMapShowSphere: (v: boolean) => void;
  complexMapSphereStacked: boolean;
  onToggleComplexMapSphereStacked: (v: boolean) => void;
  complexMapSphereLines: RiemannSphereLine[] | null;
  complexMapSpherePoints: RiemannSpherePoint[] | null;
  complexMapSphereGuides: RiemannSphereGuide[] | null;
  onPinComplexMapProbe: () => void;
  onClearComplexMapProbe: () => void;
  onClearComplexMapProbePins: () => void;
  onRecallComplexMapProbe: (pin: ComplexMapProbePin) => void;
  onRemoveComplexMapProbePin: (id: string) => void;
  wPlaneDomainColor: boolean;
  wPlaneShowRings: boolean;
  wPlaneShowRays: boolean;
  onChangeWPlaneDomainColor: (v: boolean) => void;
  onChangeWPlaneShowRings: (v: boolean) => void;
  onChangeWPlaneShowRays: (v: boolean) => void;
  onChangeParamXExpr: (s: string) => void;
  onChangeParamYExpr: (s: string) => void;
  onChangeParamZExpr: (s: string) => void;
  onChangeComplexMapSpec: (patch: Partial<ComplexMapSweepSpec>) => void;
  onChangeComplexMapPreset: (id: string) => void;
  onBuildComplexMapSweep: () => void;
  onPickComplexMapLine: (line: ComplexMapLine) => void;
  onSetComplexMapProbeFromUV: (u: number, v: number, source: ComplexMapProbe["source"]) => void;
  onSetComplexMapProbeFromW: (pt: { re: number; im: number }) => void;
  weierstrassGExpr: string;
  weierstrassPhiExpr: string;
  onChangeWeierstrassGExpr: (s: string) => void;
  onChangeWeierstrassPhiExpr: (s: string) => void;
  weierstrassDomain: ParamDomain;
  onChangeWeierstrassDomain: (d: ParamDomain) => void;
  weierstrassResolution: number;
  onChangeWeierstrassResolution: (v: number) => void;
  weierstrassRecenter: boolean;
  onToggleWeierstrassRecenter: () => void;
  onResetWeierstrass: () => void;
  weierstrassError: string | null;

  showWireframe: boolean;
  onToggleWireframe: () => void;
  showPlanes: boolean;
  onTogglePlanes: () => void;
  lightPreset: "studio" | "soft" | "contrast" | "neutral" | "warm";
  onChangeLightPreset: (p: "studio" | "soft" | "contrast" | "neutral" | "warm") => void;
  materialRoughness: number;
  onSetMaterialRoughness: (v: number) => void;
  materialMetalness: number;
  onSetMaterialMetalness: (v: number) => void;
  materialOpacity: number;
  onSetMaterialOpacity: (v: number) => void;
  graphResolution: number;
  onSetGraphResolution: (v: number) => void;
  implicitResolution: number;
  onSetImplicitResolution: (v: number) => void;
  paramResolution: number;
  onSetParamResolution: (v: number) => void;

  colorMode: ColorMode;
  onChangeColorMode: (m: ColorMode) => void;
  colorPalette: ColorPalette;
  onChangeColorPalette: (p: ColorPalette) => void;
  implicitOverlay: "none" | "normals" | "curvature";
  onChangeImplicitOverlay: (m: "none" | "normals" | "curvature") => void;

  probeEnabled: boolean;
  onToggleProbe: () => void;
  showProbeNormal: boolean;
  onToggleProbeNormal: () => void;
  showProbeTangentPlane: boolean;
  onToggleProbeTangentPlane: () => void;
  showProbeTangents: boolean;
  onToggleProbeTangents: () => void;
  showPrincipalDirections: boolean;
  onTogglePrincipalDirections: () => void;
  showPrincipalNormalPlanes: boolean;
  onTogglePrincipalNormalPlanes: () => void;
  showPrincipalLines: boolean;
  onTogglePrincipalLines: () => void;
  showPrincipalGlyphs: boolean;
  onTogglePrincipalGlyphs: () => void;
  principalGlyphDensity: number;
  onChangePrincipalGlyphDensity: (value: number) => void;
  principalGlyphLength: number;
  onChangePrincipalGlyphLength: (value: number) => void;
  principalGlyphMode: "both" | "d1";
  onChangePrincipalGlyphMode: (mode: "both" | "d1") => void;
  showCurvatureLines: boolean;
  onToggleCurvatureLines: () => void;
  curvatureLineField: "d1" | "d2";
  onChangeCurvatureLineField: (field: "d1" | "d2") => void;
  curvatureSeedSource: "global" | "selection";
  onChangeCurvatureSeedSource: (source: "global" | "selection") => void;
  curvatureSeedDensity: number;
  onChangeCurvatureSeedDensity: (value: number) => void;
  curvatureStepSize: number;
  onChangeCurvatureStepSize: (value: number) => void;
  curvatureMaxSteps: number;
  onChangeCurvatureMaxSteps: (value: number) => void;
  curvatureMaxLines: number;
  onChangeCurvatureMaxLines: (value: number) => void;
  onRebuildCurvatureLines: () => void;
  showRidges: boolean;
  onToggleRidges: () => void;
  showValleys: boolean;
  onToggleValleys: () => void;
  ridgeValleySelectionOnly: boolean;
  onToggleRidgeValleySelectionOnly: () => void;
  ridgeValleyMagMin: number;
  onChangeRidgeValleyMagMin: (value: number) => void;
  ridgeValleyContrast: number;
  onChangeRidgeValleyContrast: (value: number) => void;
  ridgeValleyMinCos: number;
  onChangeRidgeValleyMinCos: (value: number) => void;
  ridgeValleySegmentScale: number;
  onChangeRidgeValleySegmentScale: (value: number) => void;
  ridgeValleySampleMode: "high" | "medium" | "low";
  onChangeRidgeValleySampleMode: (value: "high" | "medium" | "low") => void;
  ridgeValleyStitch: boolean;
  onToggleRidgeValleyStitch: () => void;
  ridgeValleyDecimate: number;
  onChangeRidgeValleyDecimate: (value: number) => void;
  ridgeValleyMaxCurves: number;
  onChangeRidgeValleyMaxCurves: (value: number) => void;
  ridgeValleyMinConf: number;
  onChangeRidgeValleyMinConf: (value: number) => void;
  showBoundingBox: boolean;
  onToggleBoundingBox: () => void;
  weierstrassDiagnostics: WeierstrassDriftResult | null;
  weierstrassPathDisagreement: { avg: number; max: number } | null;
  weierstrassDiagnosticError: string | null;
  showDriftArrow: boolean;
  onToggleDriftArrow: () => void;
  onRecomputeDiagnostics: () => void;
  showGaussMap: boolean;
  gaussColorMode: GaussColorMode;
  onChangeGaussColorMode: (mode: GaussColorMode) => void;
  gaussPointsCount: number;
  onResetCamera: () => void;

  probeInfo: ProbeInfo | null;
  probeCurv: CurvatureData | null;
  paramProbeCurv: PrincipalCurvatureScalars | null;
  selectRegionEnabled: boolean;
  onToggleSelectRegion: () => void;
  selectionMode: "euclidean" | "geodesic";
  onChangeSelectionMode: (mode: "euclidean" | "geodesic") => void;
  selectionRadius: number;
  onSetSelectionRadius: (value: number) => void;
  selectionUseUV: boolean;
  selectionHasUV: boolean;
  onToggleSelectionUseUV: () => void;
  zoomToRegion: boolean;
  onToggleZoomToRegion: () => void;
  onZoomNow: () => void;
  onClearSelection: () => void;
  selectionMaskCount: number;
  selectionOverlayVisible: boolean;
  onToggleSelectionOverlayVisible: () => void;
  selectionOverlayOnTop: boolean;
  onToggleSelectionOverlayOnTop: () => void;
  selectionSphereVisible: boolean;
  onToggleSelectionSphereVisible: () => void;
  geodesicPathEnabled: boolean;
  onToggleGeodesicPathEnabled: () => void;
  onClearGeodesicPath: () => void;
  geodesicPathStart: GeodesicPathEndpoint | null;
  geodesicPathEnd: GeodesicPathEndpoint | null;
  geodesicPathLength: number | null;
  geodesicPathMessage: string | null;
  geodesicPathConstrain: boolean;
  onToggleGeodesicPathConstrain: () => void;
  geodesicPathSmooth: boolean;
  onToggleGeodesicPathSmooth: () => void;
  geodesicPathDebug: boolean;
  geodesicPathDebugInfo: string | null;
  onToggleGeodesicPathDebug: () => void;
  geodesicHeatEnabled: boolean;
  geodesicHeatAvailable: boolean;
  geodesicHeatBusy: boolean;
  geodesicHeatStart: GeodesicHeatEndpoint | null;
  geodesicHeatEnd: GeodesicHeatEndpoint | null;
  geodesicHeatLength: number | null;
  geodesicHeatMessage: string | null;
  geodesicHeatShowHeatmap: boolean;
  geodesicHeatUseContinuous: boolean;
  geodesicHeatUnavailableReason: string;
  geodesicHeatHeatmapAllowed: boolean;
  geodesicHeatHeatmapReason: string;
  onToggleGeodesicHeatEnabled: () => void;
  onToggleGeodesicHeatShowHeatmap: () => void;
  onToggleGeodesicHeatUseContinuous: () => void;
  onRunGeodesicHeat: () => void;
  onClearGeodesicHeat: () => void;
  geodesicDiskEnabled: boolean;
  geodesicDiskAvailable: boolean;
  geodesicDiskBusy: boolean;
  geodesicDiskPickMode: boolean;
  geodesicDiskCenter: GeodesicDiskCenter | null;
  geodesicDiskRadius: number;
  geodesicDiskAutoUpdate: boolean;
  geodesicDiskShowBoundary: boolean;
  geodesicDiskMethod: "heat" | "dijkstra";
  geodesicDiskUnavailableReason: string;
  geodesicDiskMessage: string | null;
  geodesicDiskStats: { area: number; perimeter: number; vertexCount: number; triangleCount: number; phi: { min: number; max: number; mean: number } } | null;
  geodesicDiskSelectionStats: SelectionStats;
  onToggleGeodesicDiskEnabled: () => void;
  onPickGeodesicDiskCenter: () => void;
  onChangeGeodesicDiskRadius: (value: number) => void;
  onApplyGeodesicDiskRadius: () => void;
  onToggleGeodesicDiskAutoUpdate: () => void;
  onToggleGeodesicDiskShowBoundary: () => void;
  onChangeGeodesicDiskMethod: (method: "heat" | "dijkstra") => void;
  onRecomputeGeodesicDisk: () => void;
  onClearGeodesicDisk: () => void;
  inspectEnabled: boolean;
  onToggleInspectEnabled: () => void;
  onClearInspect: () => void;
  inspectIdx: number | null;
  inspectPos: { x: number; y: number; z: number } | null;
  inspectNormal: { x: number; y: number; z: number } | null;
  inspectMetrics: { K?: number; H?: number; k1?: number; k2?: number } | null;

  // contours (graph surfaces)
  showContours: boolean;
  onToggleContours: () => void;
  contourCount: number;
  onSetContourCount: (n: number) => void;

  commandInput: string;
  onChangeCommandInput: (v: string) => void;
  onRunCommand: (cmd: string) => void;
  commandHistory: { cmd: string; out: string }[];
  selectionStats: SelectionStats;
  availableSelectionMetrics: SelectionMetricKey[];
  selectedMetric: SelectionMetricKey;
  onChangeSelectedMetric: (metric: SelectionMetricKey) => void;
  onRefreshSelectionStats: () => void;

};

const SurfacesLeftPanel: React.FC<SurfacesLeftPanelProps> = ({
  viewerKind,
  surfaceId,
  paramId,
  datasetKind,
  volumeDatasetOverride,
  volumeDistanceBusy,
  volumeDistanceError,
  volumeDistanceSigned,
  volumeDistanceAutoBounds,
  onBuildDistanceVolume,
  onClearVolumeOverride,
  volumePresetId,
  volumePreset,
  volumeDims,
  volumeParams,
  volumeCustomExpr,
  volumeCustomError,
  volumeSeedAxis,
  volumeSeedIndex,
  volumeSeedIndexMax,
  volumeCrosshairWorld,
  volumeCrosshairIndex,
  volumeCrosshairValue,
  volumeCrosshairGradMag,
  volumeViewMode,
  volumeOpacity,
  volumeVectorPresetId,
  volumeVectorPresetLabel,
  volumeShowStreamlines,
  volumeStreamSeedGrid,
  volumeStreamlineStepSize,
  volumeStreamlineStepRange,
  volumeStreamlineMaxSteps,
  volumeStreamlineMaxLength,
  volumeSampling,
  volumeSamplingSpacing,
  volumeShowCropBox,
  volumeCropGizmoEnabled,
  volumeCropGizmoMode,
  volumeContourEnabled,
  volumeContourCount,
  volumeWindowMode,
  volumeSliceReport,
  volumeSliceHover,
  volumeShowIsosurface,
  volumeIsoValue,
  volumeIsoRange,
  volumeIsoSmooth,
  volumeIsoSmoothIterations,
  onChangeVolumePresetId,
  onChangeVolumeDim,
  onChangeVolumeSamplingCenter,
  onChangeVolumeSamplingExtent,
  onResetVolumeSampling,
  onRebuildVolumeSampling,
  onToggleVolumeCropBox,
  onToggleVolumeCropGizmo,
  onChangeVolumeCropGizmoMode,
  onToggleVolumeContour,
  onChangeVolumeContourCount,
  onChangeVolumeWindowMode,
  onToggleVolumeIsosurface,
  onChangeVolumeIsoValue,
  onToggleVolumeIsoSmooth,
  onChangeVolumeIsoSmoothIterations,
  onChangeVolumeParam,
  onChangeVolumeCustomExpr,
  onChangeVolumeCrosshairIndex,
  onChangeVolumeSeedAxis,
  onChangeVolumeSeedIndex,
  onChangeVolumeViewMode,
  onChangeVolumeOpacity,
  onChangeVolumeVectorPreset,
  onToggleVolumeStreamlines,
  onChangeVolumeStreamSeedGrid,
  onChangeVolumeStreamlineStepSize,
  onResetVolumeStreamlineStep,
  onChangeVolumeStreamlineMaxSteps,
  surfaceMeshLabel,
  surfaceMeshStats,
  surfaceMeshSource,
  surfaceMeshImportBusy,
  surfaceMeshImportError,
  surfaceMeshMergeVertices,
  surfaceMeshPresets,
  surfaceMeshExportable,
  surfaceMeshExportBusy,
  surfaceMeshExportError,
  surfaceMeshWeldTolerance,
  surfaceMeshWeldBusy,
  surfaceMeshWeldError,
  onExportSurfaceMeshObj,
  onExportSurfaceMeshGlb,
  onChangeSurfaceMeshWeldTolerance,
  onWeldSurfaceMesh,
  implicitBakeResolution,
  implicitBakeBounds,
  implicitBakeBusy,
  implicitBakePhase,
  implicitBakeProgress,
  implicitBakeError,
  implicitBakeCacheHit,
  onChangeImplicitBakeResolution,
  onChangeImplicitBakeBounds,
  onBakeImplicit,
  onUseImplicitBakeDomain,
  onResetImplicitBakeBounds,
  onToggleSurfaceMeshMergeVertices,
  onGenerateSurfaceMeshPreset,
  onLoadSurfaceMeshFile,
    onConvertToMesh,
  onToggleVolumeDistanceSigned,
  onToggleVolumeDistanceAutoBounds,
  vtkAvailable,
  vtkBusy,
  vtkError,
  vtkDecimateReduction,
  onChangeVtkDecimateReduction,
  vtkDecimateTargetFaces,
  onChangeVtkDecimateTargetFaces,
  vtkUseTargetFaces,
  onToggleVtkUseTargetFaces,
  vtkSmoothIterations,
  onChangeVtkSmoothIterations,
  vtkSmoothPassband,
  onChangeVtkSmoothPassband,
  onVtkCleanNormals,
  onVtkDecimate,
  onVtkSmooth,
  graphExpr,
  implicitExpr,
  onChangeGraphExpr,
  onChangeImplicitExpr,
  paramXExpr,
  paramYExpr,
  paramZExpr,
  complexMapSpec,
  complexMapPresetId,
  complexMapError,
  complexMapLive,
  onToggleComplexMapLive,
  complexMapLine,
  complexMapZExtent,
  complexMapWExtent,
  complexMapLineWPolylines,
  complexMapIsolineWPolylinesU,
  complexMapIsolineWPolylinesV,
  complexMapIsolineZLinesU,
  complexMapIsolineZLinesV,
  complexMapGridThickness,
  complexMapGridOpacity,
  complexMapGridShowSurface,
  complexMapMarkerData,
  complexMapShowCritical,
  complexMapShowZeros,
  complexMapShowPoles,
  complexMapMarkersZ,
  complexMapMarkersW,
  complexMapMarkers3d,
  complexMapMarkerMax,
  complexMapCriticalRel,
  complexMapZeroRel,
  complexMapPoleRel,
  setComplexMapShowCritical,
  setComplexMapShowZeros,
  setComplexMapShowPoles,
  setComplexMapMarkersZ,
  setComplexMapMarkersW,
  setComplexMapMarkers3d,
  setComplexMapMarkerMax,
  setComplexMapCriticalRel,
  setComplexMapZeroRel,
  setComplexMapPoleRel,
  complexPreimageMode,
  complexPreimageValue,
  complexPreimageSnap,
  complexPreimagePolylines,
  complexPreimageWShape,
  setComplexPreimageMode,
  setComplexPreimageValue,
  setComplexPreimageSnap,
  complexDistortionMode,
  complexDistortionShowZ,
  complexDistortionShowSurface,
  complexDistortionScale,
  complexMapDistortionField,
  complexMapDistortionProbe,
  complexMapProbe,
  complexMapProbePins,
  setComplexDistortionMode,
  setComplexDistortionShowZ,
  setComplexDistortionShowSurface,
  setComplexDistortionScale,
  setComplexMapGridThickness,
  setComplexMapGridOpacity,
  setComplexMapGridShowSurface,
  complexMapShowSphere,
  onToggleComplexMapShowSphere,
  complexMapSphereStacked,
  onToggleComplexMapSphereStacked,
  complexMapSphereLines,
  complexMapSpherePoints,
  complexMapSphereGuides,
  onPinComplexMapProbe,
  onClearComplexMapProbe,
  onClearComplexMapProbePins,
  onRecallComplexMapProbe,
  onRemoveComplexMapProbePin,
  wPlaneDomainColor,
  wPlaneShowRings,
  wPlaneShowRays,
  onChangeWPlaneDomainColor,
  onChangeWPlaneShowRings,
  onChangeWPlaneShowRays,
  onChangeParamXExpr,
  onChangeParamYExpr,
  onChangeParamZExpr,
  onChangeComplexMapSpec,
  onChangeComplexMapPreset,
  onBuildComplexMapSweep,
  onPickComplexMapLine,
  onSetComplexMapProbeFromUV,
  onSetComplexMapProbeFromW,
  weierstrassGExpr,
  weierstrassPhiExpr,
  onChangeWeierstrassGExpr,
  onChangeWeierstrassPhiExpr,
  weierstrassDomain,
  onChangeWeierstrassDomain,
  weierstrassResolution,
  onChangeWeierstrassResolution,
  weierstrassRecenter,
  onToggleWeierstrassRecenter,
  onResetWeierstrass,
  weierstrassError,
  showWireframe,
  onToggleWireframe,
  showPlanes,
  onTogglePlanes,
  lightPreset,
  onChangeLightPreset,
  materialRoughness,
  onSetMaterialRoughness,
  materialMetalness,
  onSetMaterialMetalness,
  materialOpacity,
  onSetMaterialOpacity,
  graphResolution,
  onSetGraphResolution,
  implicitResolution,
  onSetImplicitResolution,
  paramResolution,
  onSetParamResolution,
  colorMode,
  onChangeColorMode,
  colorPalette,
  onChangeColorPalette,
  implicitOverlay,
  onChangeImplicitOverlay,
  probeEnabled,
  onToggleProbe,
  showProbeNormal,
  onToggleProbeNormal,
  showProbeTangentPlane,
  onToggleProbeTangentPlane,
  showProbeTangents,
  onToggleProbeTangents,
  showPrincipalDirections,
  onTogglePrincipalDirections,
  showPrincipalNormalPlanes,
  onTogglePrincipalNormalPlanes,
  showPrincipalLines,
  onTogglePrincipalLines,
  showPrincipalGlyphs,
  onTogglePrincipalGlyphs,
  principalGlyphDensity,
  onChangePrincipalGlyphDensity,
  principalGlyphLength,
  onChangePrincipalGlyphLength,
  principalGlyphMode,
  onChangePrincipalGlyphMode,
  showCurvatureLines,
  onToggleCurvatureLines,
  curvatureLineField,
  onChangeCurvatureLineField,
  curvatureSeedSource,
  onChangeCurvatureSeedSource,
  curvatureSeedDensity,
  onChangeCurvatureSeedDensity,
  curvatureStepSize,
  onChangeCurvatureStepSize,
  curvatureMaxSteps,
  onChangeCurvatureMaxSteps,
  curvatureMaxLines,
  onChangeCurvatureMaxLines,
  onRebuildCurvatureLines,
  showRidges,
  onToggleRidges,
  showValleys,
  onToggleValleys,
  ridgeValleySelectionOnly,
  onToggleRidgeValleySelectionOnly,
  ridgeValleyMagMin,
  onChangeRidgeValleyMagMin,
  ridgeValleyContrast,
  onChangeRidgeValleyContrast,
  ridgeValleyMinCos,
  onChangeRidgeValleyMinCos,
  ridgeValleySegmentScale,
  onChangeRidgeValleySegmentScale,
  ridgeValleySampleMode,
  onChangeRidgeValleySampleMode,
  ridgeValleyStitch,
  onToggleRidgeValleyStitch,
  ridgeValleyDecimate,
  onChangeRidgeValleyDecimate,
  ridgeValleyMaxCurves,
  onChangeRidgeValleyMaxCurves,
  ridgeValleyMinConf,
  onChangeRidgeValleyMinConf,
  showBoundingBox,
  onToggleBoundingBox,
  showGaussMap,
  gaussColorMode,
  onChangeGaussColorMode,
  gaussPointsCount,
  onResetCamera,
  probeInfo,
  probeCurv,
  paramProbeCurv,
  selectRegionEnabled,
  onToggleSelectRegion,
  selectionMode,
  onChangeSelectionMode,
  selectionRadius,
  onSetSelectionRadius,
  selectionUseUV,
  selectionHasUV,
  onToggleSelectionUseUV,
  zoomToRegion,
  onToggleZoomToRegion,
  onZoomNow,
  onClearSelection,
  selectionMaskCount,
  selectionOverlayVisible,
  onToggleSelectionOverlayVisible,
  selectionOverlayOnTop,
  onToggleSelectionOverlayOnTop,
  selectionSphereVisible,
  onToggleSelectionSphereVisible,
  geodesicPathEnabled,
  onToggleGeodesicPathEnabled,
  onClearGeodesicPath,
  geodesicPathStart,
  geodesicPathEnd,
  geodesicPathLength,
  geodesicPathMessage,
  geodesicPathConstrain,
  onToggleGeodesicPathConstrain,
  geodesicPathSmooth,
  onToggleGeodesicPathSmooth,
  geodesicPathDebug,
  geodesicPathDebugInfo,
  onToggleGeodesicPathDebug,
  geodesicHeatEnabled,
  geodesicHeatAvailable,
  geodesicHeatBusy,
  geodesicHeatStart,
  geodesicHeatEnd,
  geodesicHeatLength,
  geodesicHeatMessage,
  geodesicHeatShowHeatmap,
  geodesicHeatUseContinuous,
  geodesicHeatUnavailableReason,
  geodesicHeatHeatmapAllowed,
  geodesicHeatHeatmapReason,
  onToggleGeodesicHeatEnabled,
  onToggleGeodesicHeatShowHeatmap,
  onToggleGeodesicHeatUseContinuous,
  onRunGeodesicHeat,
  onClearGeodesicHeat,
  geodesicDiskEnabled,
  geodesicDiskAvailable,
  geodesicDiskBusy,
  geodesicDiskPickMode,
  geodesicDiskCenter,
  geodesicDiskRadius,
  geodesicDiskAutoUpdate,
  geodesicDiskShowBoundary,
  geodesicDiskMethod,
  geodesicDiskUnavailableReason,
  geodesicDiskMessage,
  geodesicDiskStats,
  geodesicDiskSelectionStats,
  onToggleGeodesicDiskEnabled,
  onPickGeodesicDiskCenter,
  onChangeGeodesicDiskRadius,
  onApplyGeodesicDiskRadius,
  onToggleGeodesicDiskAutoUpdate,
  onToggleGeodesicDiskShowBoundary,
  onChangeGeodesicDiskMethod,
  onRecomputeGeodesicDisk,
  onClearGeodesicDisk,
  inspectEnabled,
  onToggleInspectEnabled,
  onClearInspect,
  inspectIdx,
  inspectPos,
  inspectNormal,
  inspectMetrics,
  showContours,
  onToggleContours,
  contourCount,
  onSetContourCount,
  commandInput,
  onChangeCommandInput,
  onRunCommand,
  commandHistory,
  selectionStats,
  availableSelectionMetrics,
  selectedMetric,
  onChangeSelectedMetric,
  onRefreshSelectionStats,
  weierstrassDiagnostics,
  weierstrassPathDisagreement,
  weierstrassDiagnosticError,
  showDriftArrow,
  onToggleDriftArrow,
  onRecomputeDiagnostics,
}) => {
  const meshReady = !!surfaceMeshStats;
  const implicitBakePercent = Math.max(0, Math.min(100, Math.round(implicitBakeProgress * 100)));
  const eqMeta = SURFACES_EQ_META.find((m) => m.id === surfaceId) ?? SURFACES_EQ_META[0];
  const paramMeta = PARAM_SURFACES_META.find((m) => m.id === paramId) ?? PARAM_SURFACES_META[0];
  const geodesicSmoothEnabled = viewerKind === "param" || viewerKind === "weierstrass";

  const isVolume = datasetKind === "volume";
  const isWeierstrass = viewerKind === "weierstrass";
  const isMeshViewer = viewerKind === "mesh" || viewerKind === "complex";
  const isEqViewer = viewerKind === "implicit" || viewerKind === "graph";
  const meshMeta = {
    label: surfaceMeshLabel,
    formula: "Triangle surface mesh",
    note: "Imported or generated triangle mesh.",
  };
  const distanceSigned = volumeDatasetOverride?.distanceSigned;
  const volumeMeta = volumeDatasetOverride
    ? {
        label: volumeDatasetOverride.label ?? "Volume: Distance field",
        formula: distanceSigned ? "Signed distance field d(p, S)" : "Unsigned distance field |d(p, S)|",
        note: volumeDatasetOverride.note ?? "Distance field sampled on a voxel grid.",
      }
    : {
        label: `Volume: ${volumePreset.label}`,
        formula: volumePresetId === "custom" ? (volumeCustomExpr.trim() || volumePreset.formula) : volumePreset.formula,
        note: volumePreset.note ?? "Scalar field on a voxel grid.",
      };
  const activeMeta = isVolume
    ? volumeMeta
    : isMeshViewer
      ? meshMeta
      : isWeierstrass
        ? WEIERSTRASS_META
        : isEqViewer
          ? eqMeta
          : paramMeta;
  const diagStatusColors: Record<"good" | "warn" | "bad", string> = {
    good: "#1f894f",
    warn: "#e2a700",
    bad: "#d9302f",
  };
  const diagSuccess = isWeierstrassDiagnosticsSuccess(weierstrassDiagnostics)
    ? weierstrassDiagnostics
    : null;
  const diagStatusLabel = diagSuccess
    ? diagSuccess.okLevel
    : weierstrassDiagnosticError
    ? "unavailable"
    : "pending";
  const diagStatusColor = diagSuccess ? diagStatusColors[diagSuccess.okLevel] : "#9e9e9e";
  const fmtVal = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : String(v));
  const volumeBounds = samplingToBounds(volumeSampling);

  const modeLabel =
    isVolume
      ? "volume grid (voxels)"
      : viewerKind === "implicit"
        ? "implicit surface  f(x,y,z) = 0"
        : viewerKind === "graph"
          ? "graph (explicit)  z = f(x,y)"
      : viewerKind === "weierstrass"
        ? "Weierstrass minimal surface  X(z) = Re integral Phi(z) dz"
        : viewerKind === "complex"
          ? "complex map surface  w(u,v) = Re + i Im"
          : viewerKind === "mesh"
            ? "surface mesh (triangles)"
            : "parametric surface  σ(u,v)";

  const isGraphCustom = viewerKind === "graph" && surfaceId === "graph_custom";
  const isImplicitCustom = viewerKind === "implicit" && surfaceId === "implicit_custom";
  const isParamCustom = viewerKind === "param" && paramId === "custom";
  const isGraphAny = viewerKind === "graph" && isGraphSurface(surfaceId);
  const isImplicitAny = viewerKind === "implicit" && isImplicitSurface(surfaceId);
  const implicitExprTrimmed = (implicitExpr ?? "").trim();
  const [leftTab, setLeftTab] = useState<"controls" | "theory">("controls");
  const meshFileInputRef = useRef<HTMLInputElement | null>(null);
  const zPlaneRef = useRef<PlanePlotHandle | null>(null);
  const wPlaneRef = useRef<PlanePlotHandle | null>(null);
  const [complexLineMode, setComplexLineMode] = useState<"vertical" | "horizontal">("vertical");
  const [complexToolMode, setComplexToolMode] = useState<"line" | "probe" | "preimage">("line");
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const safeWeierstrassDomain = normalizeParamDomain(weierstrassDomain, WEIERSTRASS_DEFAULTS.domain);
  const complexMapIsRiemann = complexMapSpec.mapMode === "riemann";
  const complexMapSheetCount = complexMapIsRiemann ? Math.max(2, Math.round(complexMapSpec.sheetCount)) : 1;
  const complexMapSheetIndex = Math.min(
    Math.max(0, Math.round(complexMapSpec.sheetIndex)),
    Math.max(0, complexMapSheetCount - 1)
  );
  const complexMapBranchCutDeg = (complexMapSpec.branchCutAngle * 180) / Math.PI;
  const canPhaseColor =
    (viewerKind === "mesh" || viewerKind === "complex") && isComplexMapSurfaceLabel(surfaceMeshLabel);
  const colorModes: ColorMode[] =
    viewerKind === "param" || viewerKind === "weierstrass"
      ? ["solid", "height", "radius", "gaussian", "mean", "k1", "k2"]
      : viewerKind === "graph"
      ? ["solid", "height", "radius", "curvature"]
      : canPhaseColor
        ? ["solid", "height", "radius", "phase"]
        : ["solid", "height", "radius"];
  const volumeParamDefs = volumePreset.params ?? [];
  const volumeShowCustom = volumePresetId === "custom";
  const volumePresetOptions = VOLUME_PRESETS.filter((preset) => preset.id !== "custom");
  const lastVolumePresetIdRef = useRef<VolumePresetId>(DEFAULT_VOLUME_PRESET_ID);
  useEffect(() => {
    if (volumePresetId !== "custom") {
      lastVolumePresetIdRef.current = volumePresetId;
    }
  }, [volumePresetId]);
  useEffect(() => {
    if (viewerKind !== "complex") return;
    const shouldProbeBeOn = complexToolMode === "probe";
    if (probeEnabled !== shouldProbeBeOn) {
      onToggleProbe();
    }
  }, [viewerKind, complexToolMode, probeEnabled, onToggleProbe]);
  const volumeParamDecimals = (step: number) => {
    if (step >= 1) return 0;
    if (step >= 0.1) return 1;
    if (step >= 0.01) return 2;
    if (step >= 0.001) return 3;
    return 4;
  };
  const formatVolumeParam = (value: number, step: number) => value.toFixed(volumeParamDecimals(step));
  const volumeCustomExamples = [
    { label: "Sphere", expr: "x^2 + y^2 + z^2 - 1" },
    { label: "Ellipsoid", expr: "x^2/1.6^2 + y^2/1.0^2 + z^2/0.7^2 - 1" },
    { label: "Torus", expr: "(x^2 + y^2 - 1.0)^2 + z^2 - 0.35^2" },
    { label: "Gyroid", expr: "sin(x)*cos(y) + sin(y)*cos(z) + sin(z)*cos(x)" },
    { label: "Cos surface", expr: "cos(x) + cos(y) + cos(z) - 0.5" },
    { label: "Schwarz D", expr: "cos(x)*cos(y)*cos(z) - cos(x) - cos(y) - cos(z) + 0.3" },
    { label: "Neovius", expr: "3*(cos(x) + cos(y) + cos(z)) + 4*cos(x)*cos(y)*cos(z)" },
    {
      label: "Metaballs",
      expr:
        "exp(-4*((x+0.6)^2+y^2+z^2)) + exp(-4*((x-0.6)^2+y^2+z^2)) + exp(-4*(x^2+(y-0.6)^2+z^2)) - 0.7",
    },
    { label: "Rounded box", expr: "abs(x)^4 + abs(y)^4 + abs(z)^4 - 1" },
    { label: "Capped cylinder", expr: "max(x^2 + y^2 - 1.0^2, abs(z) - 1.1)" },
    { label: "Shell", expr: "abs(sqrt(x^2+y^2+z^2) - 1.0) - 0.12" },
    { label: "Octahedron-like", expr: "abs(x) + abs(y) + abs(z) - 1" },
    { label: "Shell", expr: "(sqrt(x^2+y^2+z^2)-1.0)^2 - 0.02" },
    { label: "Double cone", expr: "x^2 + y^2 - z^2" },
    { label: "Saddle (implicit)", expr: "z - x^2 + y^2" },
  ];

  const handleZPlaneClick = useCallback(
    (pt: { re: number; im: number }, ev: MouseEvent) => {
      const baseAxis = complexLineMode === "vertical" ? "u" : "v";
      const axis = ev.shiftKey ? (baseAxis === "u" ? "v" : "u") : baseAxis;
      const uMin = Math.min(complexMapSpec.uMin, complexMapSpec.uMax);
      const uMax = Math.max(complexMapSpec.uMin, complexMapSpec.uMax);
      const vMin = Math.min(complexMapSpec.vMin, complexMapSpec.vMax);
      const vMax = Math.max(complexMapSpec.vMin, complexMapSpec.vMax);
      if (complexToolMode === "line") {
        const value = axis === "u" ? clamp(pt.re, uMin, uMax) : clamp(pt.im, vMin, vMax);
        onPickComplexMapLine({ axis, value });
      }

      if (complexToolMode === "probe") {
        const u = clamp(pt.re, uMin, uMax);
        const v = clamp(pt.im, vMin, vMax);
        onSetComplexMapProbeFromUV(u, v, "z");
      }
    },
    [complexLineMode, complexMapSpec, complexToolMode, onPickComplexMapLine, onSetComplexMapProbeFromUV]
  );

  const snapPreimageValue = useCallback(
    (mode: ComplexPreimageMode, value: number) => {
      if (!complexPreimageSnap || mode === "none" || !Number.isFinite(value)) return value;
      if (mode === "arg") {
        const nice = [
          -Math.PI,
          -3 * Math.PI / 4,
          -2 * Math.PI / 3,
          -Math.PI / 2,
          -Math.PI / 3,
          -Math.PI / 4,
          -Math.PI / 6,
          0,
          Math.PI / 6,
          Math.PI / 4,
          Math.PI / 3,
          Math.PI / 2,
          2 * Math.PI / 3,
          3 * Math.PI / 4,
          Math.PI,
        ];
        let best = nice[0];
        let bestD = Infinity;
        for (const n of nice) {
          const d = Math.abs(value - n);
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
        return best;
      }

      const base = [0, 0.5, 1, 2, 3, 4];
      const nice = mode === "abs" ? base : base.concat(base.slice(1).map((v) => -v));
      let best = nice[0];
      let bestD = Infinity;
      for (const n of nice) {
        const d = Math.abs(value - n);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best;
    },
    [complexPreimageSnap]
  );

  const applyPreimageValue = useCallback(
    (mode: ComplexPreimageMode, value: number) => {
      const next = snapPreimageValue(mode, value);
      if (Number.isFinite(next)) setComplexPreimageValue(next);
    },
    [snapPreimageValue]
  );

  const handleWPlaneClick = useCallback(
    (pt: { re: number; im: number }) => {
      if (complexToolMode === "preimage" && complexPreimageMode !== "none") {
        if (complexPreimageMode === "re") {
          applyPreimageValue(complexPreimageMode, clamp(pt.re, -complexMapWExtent, complexMapWExtent));
        } else if (complexPreimageMode === "im") {
          applyPreimageValue(complexPreimageMode, clamp(pt.im, -complexMapWExtent, complexMapWExtent));
        } else if (complexPreimageMode === "abs") {
          applyPreimageValue(
            complexPreimageMode,
            Math.max(0, Math.min(complexMapWExtent, Math.hypot(pt.re, pt.im)))
          );
        } else {
          applyPreimageValue(complexPreimageMode, Math.atan2(pt.im, pt.re));
        }
      }

      if (complexToolMode === "probe") {
        onSetComplexMapProbeFromW(pt);
      }
    },
    [applyPreimageValue, complexMapWExtent, complexPreimageMode, complexToolMode, onSetComplexMapProbeFromW]
  );

  useEffect(() => {
    zPlaneRef.current?.drawGrid(1);
    wPlaneRef.current?.drawGrid(1);

    if (complexDistortionShowZ && complexMapDistortionField) {
      zPlaneRef.current?.drawHeatmap({
        values: complexMapDistortionField.values,
        nx: complexMapDistortionField.nx,
        ny: complexMapDistortionField.ny,
        xMin: complexMapDistortionField.xMin,
        xMax: complexMapDistortionField.xMax,
        yMin: complexMapDistortionField.yMin,
        yMax: complexMapDistortionField.yMax,
        min: complexMapDistortionField.min,
        max: complexMapDistortionField.max,
        palette: colorPalette,
        opacity: 0.78,
      });
    }

    if (complexMapSpec.showIsolines) {
      const gridStyle = { width: complexMapGridThickness, opacity: complexMapGridOpacity };
      if (complexMapIsolineZLinesU?.length) {
        for (const line of complexMapIsolineZLinesU) {
          zPlaneRef.current?.drawCurve(line, COMPLEX_GRID_COLORS.u, gridStyle);
        }
      }
      if (complexMapIsolineZLinesV?.length) {
        for (const line of complexMapIsolineZLinesV) {
          zPlaneRef.current?.drawCurve(line, COMPLEX_GRID_COLORS.v, gridStyle);
        }
      }
      if (complexMapIsolineWPolylinesU?.length) {
        for (const line of complexMapIsolineWPolylinesU) {
          wPlaneRef.current?.drawCurve(line, COMPLEX_GRID_COLORS.u, gridStyle);
        }
      }
      if (complexMapIsolineWPolylinesV?.length) {
        for (const line of complexMapIsolineWPolylinesV) {
          wPlaneRef.current?.drawCurve(line, COMPLEX_GRID_COLORS.v, gridStyle);
        }
      }
    }

    if (complexPreimagePolylines?.length) {
      for (const line of complexPreimagePolylines) {
        zPlaneRef.current?.drawCurve(line, "#1b7f3a");
      }
    }

    if (complexPreimageWShape?.length) {
      for (const line of complexPreimageWShape) {
        wPlaneRef.current?.drawCurve(line, "#1b7f3a");
      }
    }

    if (complexMapLine) {
      const uMin = Math.min(complexMapSpec.uMin, complexMapSpec.uMax);
      const uMax = Math.max(complexMapSpec.uMin, complexMapSpec.uMax);
      const vMin = Math.min(complexMapSpec.vMin, complexMapSpec.vMax);
      const vMax = Math.max(complexMapSpec.vMin, complexMapSpec.vMax);

      if (complexMapLine.axis === "u") {
        zPlaneRef.current?.drawCurve(
          [
            [complexMapLine.value, vMin],
            [complexMapLine.value, vMax],
          ],
          "#d14d00"
        );
      } else {
        zPlaneRef.current?.drawCurve(
          [
            [uMin, complexMapLine.value],
            [uMax, complexMapLine.value],
          ],
          "#d14d00"
        );
      }
    }

    if (complexMapLineWPolylines?.length) {
      for (const line of complexMapLineWPolylines) {
        wPlaneRef.current?.drawCurve(line, "#d14d00");
      }
    }

    if (complexMapMarkerData) {
      if (complexMapMarkersZ) {
        if (complexMapMarkerData.critical.z.length) {
          zPlaneRef.current?.drawPoints(complexMapMarkerData.critical.z, {
            color: "#d81b60",
            shape: "diamond",
            size: 4.2,
            layer: "crit-z",
          });
        }
        if (complexMapMarkerData.zero.z.length) {
          zPlaneRef.current?.drawPoints(complexMapMarkerData.zero.z, {
            color: "#2e7d32",
            shape: "circle",
            size: 4.0,
            layer: "zero-z",
          });
        }
        if (complexMapMarkerData.pole.z.length) {
          zPlaneRef.current?.drawPoints(complexMapMarkerData.pole.z, {
            color: "#f57c00",
            shape: "triangle",
            size: 4.6,
            layer: "pole-z",
          });
        }
      }

      if (complexMapMarkersW) {
        if (complexMapMarkerData.critical.w.length) {
          wPlaneRef.current?.drawPoints(complexMapMarkerData.critical.w, {
            color: "#d81b60",
            shape: "diamond",
            size: 4.2,
            layer: "crit-w",
          });
        }
        if (complexMapMarkerData.zero.w.length) {
          wPlaneRef.current?.drawPoints(complexMapMarkerData.zero.w, {
            color: "#2e7d32",
            shape: "circle",
            size: 4.0,
            layer: "zero-w",
          });
        }
        if (complexMapMarkerData.pole.w.length) {
          wPlaneRef.current?.drawPoints(complexMapMarkerData.pole.w, {
            color: "#f57c00",
            shape: "triangle",
            size: 4.6,
            layer: "pole-w",
          });
        }
      }
    }

    if (probeEnabled && complexMapProbe) {
      zPlaneRef.current?.drawPoints([[complexMapProbe.u, complexMapProbe.v]], {
        color: "#111",
        shape: "cross",
        size: 5.2,
        layer: "probe-z",
      });
      wPlaneRef.current?.drawPoints([[complexMapProbe.w.re, complexMapProbe.w.im]], {
        color: "#111",
        shape: "cross",
        size: 5.2,
        layer: "probe-w",
      });
    } else {
      zPlaneRef.current?.drawPoints([], { layer: "probe-z" });
      wPlaneRef.current?.drawPoints([], { layer: "probe-w" });
    }
  }, [
    complexMapLine,
    complexMapLineWPolylines,
    complexMapIsolineWPolylinesU,
    complexMapIsolineWPolylinesV,
    complexMapIsolineZLinesU,
    complexMapIsolineZLinesV,
    complexPreimagePolylines,
    complexPreimageWShape,
    complexMapMarkerData,
    complexMapMarkersZ,
    complexMapMarkersW,
    complexDistortionShowZ,
    complexMapDistortionField,
    colorPalette,
    complexMapSpec,
    complexMapGridOpacity,
    complexMapGridThickness,
    wPlaneDomainColor,
    wPlaneShowRings,
    wPlaneShowRays,
    probeEnabled,
    complexMapProbe,
  ]);
  const wrapComplexAdvancedTools = (content: React.ReactNode) => {
    if (viewerKind !== "complex") return content;
    return (
      <details style={{ ...cardStyle, marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Mesh tools (advanced)</summary>
        <div style={{ marginTop: 8 }}>{content}</div>
      </details>
    );
  };

  return (
    <section>
      <h2 style={styles.h2}>{isVolume ? "Volume viewer (three.js)" : "Surface viewer (three.js)"}</h2>
      <p style={styles.hint}>
        Rotate with mouse, scroll to zoom. In <strong>probe mode</strong> click the surface to read point p and unit normal n.
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {(["controls", "theory"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setLeftTab(t)}
            style={pill(leftTab === t)}
            aria-pressed={leftTab === t}
          >
            {t === "controls" ? "Controls" : "Theory"}
          </button>
        ))}
      </div>

      <div style={{ display: leftTab === "controls" ? "block" : "none" }}>
      <h3 style={styles.h3}>{activeMeta.label}</h3>
      <p style={styles.hint}>
        Mode: <strong>{modeLabel}</strong>
      </p>

      {datasetKind === "volume" && (
        <div style={{ ...cardStyle, marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Volume grid</div>
          {volumeDatasetOverride && (
            <div
              style={{
                marginBottom: 10,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e0e0e0",
                background: "#fff",
                fontSize: 11,
              }}
            >
              <div style={{ fontWeight: 600 }}>Active: {volumeDatasetOverride.label ?? "Distance field"}</div>
              {volumeDatasetOverride.note && (
                <div style={{ marginTop: 4, opacity: 0.7 }}>{volumeDatasetOverride.note}</div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={onClearVolumeOverride} style={{ padding: "4px 8px" }}>
                  Use preset grid
                </button>
                <button
                  type="button"
                  onClick={onBuildDistanceVolume}
                  disabled={volumeDistanceBusy}
                  style={{ padding: "4px 8px" }}
                >
                  {volumeDistanceBusy ? "Rebuilding..." : "Rebuild distance field"}
                </button>
              </div>
              {volumeDistanceError && (
                <div style={{ marginTop: 6, color: "#b42318" }}>Error: {volumeDistanceError}</div>
              )}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Dims (Nx, Ny, Nz)</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  min={1}
                  max={256}
                  value={volumeDims[0]}
                  onChange={(e) => onChangeVolumeDim(0, Number(e.target.value))}
                  style={{ width: 70 }}
                  aria-label="Volume dim Nx"
                />
                <input
                  type="number"
                  min={1}
                  max={256}
                  value={volumeDims[1]}
                  onChange={(e) => onChangeVolumeDim(1, Number(e.target.value))}
                  style={{ width: 70 }}
                  aria-label="Volume dim Ny"
                />
                <input
                  type="number"
                  min={1}
                  max={256}
                  value={volumeDims[2]}
                  onChange={(e) => onChangeVolumeDim(2, Number(e.target.value))}
                  style={{ width: 70 }}
                  aria-label="Volume dim Nz"
                />
              </div>
            </label>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>Sampling box</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {(["X", "Y", "Z"] as const).map((label, axisIndex) => (
                <label
                  key={`center-${label}`}
                  style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}
                >
                  <span>Center {label}</span>
                  <input
                    type="number"
                    value={volumeSampling.center[axisIndex]}
                    onChange={(e) => onChangeVolumeSamplingCenter(axisIndex as 0 | 1 | 2, Number(e.target.value))}
                    style={{ width: 90 }}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 6 }}>
              {(["X", "Y", "Z"] as const).map((label, axisIndex) => (
                <label
                  key={`extent-${label}`}
                  style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}
                >
                  <span>Extent {label}</span>
                  <input
                    type="number"
                    min={0}
                    value={volumeSampling.extents[axisIndex]}
                    onChange={(e) => onChangeVolumeSamplingExtent(axisIndex as 0 | 1 | 2, Number(e.target.value))}
                    style={{ width: 90 }}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={volumeShowCropBox}
                  onChange={(e) => onToggleVolumeCropBox(e.target.checked)}
                />
                Show crop box
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={volumeCropGizmoEnabled}
                  onChange={(e) => onToggleVolumeCropGizmo(e.target.checked)}
                />
                Crop gizmo
              </label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => onChangeVolumeCropGizmoMode("move")}
                  style={pill(volumeCropGizmoMode === "move")}
                  disabled={!volumeCropGizmoEnabled}
                >
                  Move
                </button>
                <button
                  type="button"
                  onClick={() => onChangeVolumeCropGizmoMode("scale")}
                  style={pill(volumeCropGizmoMode === "scale")}
                  disabled={!volumeCropGizmoEnabled}
                >
                  Scale
                </button>
              </div>
              <button type="button" onClick={onRebuildVolumeSampling} style={{ padding: "4px 8px" }}>
                Rebuild grid
              </button>
              <button type="button" onClick={onResetVolumeSampling} style={{ padding: "4px 8px" }}>
                Reset bounds
              </button>
            </div>
            <div style={{ fontSize: 10, opacity: 0.65, marginTop: 6 }}>
              Spacing: {fmtVal(volumeSamplingSpacing[0], 3)} × {fmtVal(volumeSamplingSpacing[1], 3)} ×{" "}
              {fmtVal(volumeSamplingSpacing[2], 3)} (world units)
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Field</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() =>
                  onChangeVolumePresetId(volumeShowCustom ? lastVolumePresetIdRef.current : volumePresetId)
                }
                style={pill(!volumeShowCustom)}
                aria-pressed={!volumeShowCustom}
              >
                Preset
              </button>
              <button
                type="button"
                onClick={() => onChangeVolumePresetId("custom")}
                style={pill(volumeShowCustom)}
                aria-pressed={volumeShowCustom}
              >
                Custom
              </button>
            </div>
          </div>

          {!volumeShowCustom && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Preset</div>
              <div style={pillRow}>
                {volumePresetOptions.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onChangeVolumePresetId(preset.id)}
                    style={pill(volumePresetId === preset.id)}
                    aria-pressed={volumePresetId === preset.id}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!volumeShowCustom && volumeParamDefs.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Parameters</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {volumeParamDefs.map((param) => {
                  const value = volumeParams[param.id] ?? param.defaultValue;
                  return (
                    <label
                      key={param.id}
                      style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, minWidth: 200 }}
                    >
                      <span>
                        {param.label} {formatVolumeParam(value, param.step)}
                      </span>
                      <input
                        type="range"
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        value={value}
                        onChange={(e) => onChangeVolumeParam(param.id, Number(e.target.value))}
                      />
                      <input
                        type="number"
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        value={value}
                        onChange={(e) => onChangeVolumeParam(param.id, Number(e.target.value))}
                        style={{ width: 90 }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {volumeShowCustom && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Custom field</div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                <span>F(x,y,z)</span>
                <input
                  type="text"
                  value={volumeCustomExpr}
                  onChange={(e) => onChangeVolumeCustomExpr(e.target.value)}
                  placeholder="e.g. x^2 + y^2 + z^2 - 1"
                  style={{ width: "100%", fontFamily: "monospace" }}
                />
              </label>
              <div style={{ marginTop: 8, fontSize: 11 }}>
                <div style={{ marginBottom: 6, opacity: 0.8 }}>Examples</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {volumeCustomExamples.map((ex) => (
                    <button
                      key={ex.label}
                      type="button"
                      onClick={() => onChangeVolumeCustomExpr(ex.expr)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                        fontSize: 11,
                      }}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
                Use x,y,z and functions like sin, cos, exp, log, sqrt, abs, min, max. Use sin(x) or sin x. You can type
                F=... and it will be accepted.
              </div>
              {volumeCustomError && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#b00020" }}>Error: {volumeCustomError}</div>
              )}
            </div>
          )}

          <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Crosshair</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {(["X", "Y", "Z"] as const).map((label, axisIndex) => (
              <label
                key={label}
                style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, minWidth: 90 }}
              >
                <span>{label} index</span>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, volumeSampling.dims[axisIndex] - 1)}
                  value={volumeCrosshairIndex[axisIndex]}
                  onChange={(e) => onChangeVolumeCrosshairIndex(axisIndex as 0 | 1 | 2, Number(e.target.value))}
                  style={{ width: 80 }}
                />
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#566273", marginTop: 6 }}>
            {volumeCrosshairWorld
              ? `World: (${fmtVal(volumeCrosshairWorld[0], 3)}, ${fmtVal(volumeCrosshairWorld[1], 3)}, ${fmtVal(
                  volumeCrosshairWorld[2],
                  3
                )})`
              : "Click a slice to place the crosshair."}
          </div>
          {volumeCrosshairWorld && (
            <div style={{ fontSize: 11, color: "#566273", marginTop: 2 }}>
              F={fmtVal(volumeCrosshairValue ?? 0, 4)} · |∇F|={fmtVal(volumeCrosshairGradMag ?? 0, 4)}
            </div>
          )}

          <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>View</div>
          <div style={pillRow}>
            <button
              type="button"
              onClick={() => onChangeVolumeViewMode("slices")}
              style={pill(volumeViewMode === "slices")}
              aria-pressed={volumeViewMode === "slices"}
            >
              Slices
            </button>
            <button
              type="button"
              onClick={() => onChangeVolumeViewMode("3d")}
              style={pill(volumeViewMode === "3d")}
              aria-pressed={volumeViewMode === "3d"}
            >
              3D
            </button>
          </div>

          <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Volume slice</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, minWidth: 160 }}>
              <span>Opacity {volumeOpacity.toFixed(2)}</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={volumeOpacity}
                onChange={(e) => onChangeVolumeOpacity(Number(e.target.value))}
                style={{ width: 160 }}
              />
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={volumeContourEnabled}
                onChange={(e) => onToggleVolumeContour(e.target.checked)}
              />
              Contours
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Count</span>
              <input
                type="number"
                min={1}
                max={16}
                value={volumeContourCount}
                onChange={(e) =>
                  onChangeVolumeContourCount(Math.max(1, Math.min(16, Number(e.target.value))))
                }
                style={{ width: 70 }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={volumeWindowMode === "auto"}
                onChange={(e) => onChangeVolumeWindowMode(e.target.checked ? "auto" : "minmax")}
              />
              Auto window/level
            </label>
          </div>
          {volumeSliceReport && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
              <VolumeSliceHistogram stats={volumeSliceReport} />
              <div style={{ fontSize: 10, color: "#566273" }}>
                <div>
                  min {fmtVal(volumeSliceReport.min)} · max {fmtVal(volumeSliceReport.max)}
                </div>
                <div>
                  window {fmtVal(volumeSliceReport.window.low)} → {fmtVal(volumeSliceReport.window.high)} (
                  {volumeSliceReport.window.mode})
                </div>
                <div>
                  mean {fmtVal(volumeSliceReport.mean)} · σ {fmtVal(volumeSliceReport.std)}
                </div>
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
            {volumeSliceHover
              ? `Hover: (${fmtVal(volumeSliceHover.world[0], 3)}, ${fmtVal(volumeSliceHover.world[1], 3)}, ${fmtVal(
                  volumeSliceHover.world[2],
                  3
                )})  F=${fmtVal(volumeSliceHover.value, 4)}  |∇F|=${fmtVal(volumeSliceHover.gradMag ?? 0, 4)}`
              : "Hover over a slice to read F(x,y,z)."}
          </div>
          <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Isosurface</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={volumeShowIsosurface}
                onChange={(e) => onToggleVolumeIsosurface(e.target.checked)}
              />
              Show
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, minWidth: 180 }}>
              <span>Iso {fmtVal(volumeIsoValue, 4)}</span>
              <input
                type="range"
                min={volumeIsoRange.min}
                max={volumeIsoRange.max}
                step={volumeIsoRange.step}
                value={volumeIsoValue}
                onChange={(e) => onChangeVolumeIsoValue(Number(e.target.value))}
                style={{ width: 180 }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={volumeIsoSmooth}
                onChange={(e) => onToggleVolumeIsoSmooth(e.target.checked)}
              />
              Smoothing
            </label>
            {volumeIsoSmooth && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                <span>Iterations {volumeIsoSmoothIterations}</span>
                <input
                  type="range"
                  min={5}
                  max={80}
                  step={1}
                  value={volumeIsoSmoothIterations}
                  onChange={(e) => onChangeVolumeIsoSmoothIterations(Number(e.target.value))}
                  style={{ width: 140 }}
                />
              </label>
            )}
          </div>
          <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Streamlines</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={volumeShowStreamlines}
                onChange={(e) => onToggleVolumeStreamlines(e.target.checked)}
              />
              Show
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Seed plane</span>
              <div style={pillRow}>
                {(["x", "y", "z"] as const).map((axis) => (
                  <button
                    key={axis}
                    type="button"
                    onClick={() => onChangeVolumeSeedAxis(axis)}
                    style={pill(volumeSeedAxis === axis)}
                    aria-pressed={volumeSeedAxis === axis}
                  >
                    {axis.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Seed index</span>
              <input
                type="number"
                min={0}
                max={volumeSeedIndexMax}
                value={volumeSeedIndex}
                onChange={(e) => onChangeVolumeSeedIndex(Number(e.target.value))}
                style={{ width: 80 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Seeds per side</span>
              <input
                type="number"
                min={2}
                max={24}
                value={volumeStreamSeedGrid}
                onChange={(e) => onChangeVolumeStreamSeedGrid(Number(e.target.value))}
                style={{ width: 80 }}
              />
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, minWidth: 180 }}>
              <span>Step size {fmtVal(volumeStreamlineStepSize, 4)}</span>
              <input
                type="range"
                min={volumeStreamlineStepRange.min}
                max={volumeStreamlineStepRange.max}
                step={volumeStreamlineStepRange.step}
                value={volumeStreamlineStepSize}
                onChange={(e) => onChangeVolumeStreamlineStepSize(Number(e.target.value))}
                style={{ width: 180 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Step (num)</span>
              <input
                type="number"
                min={volumeStreamlineStepRange.min}
                max={volumeStreamlineStepRange.max}
                step={volumeStreamlineStepRange.step}
                value={volumeStreamlineStepSize}
                onChange={(e) => onChangeVolumeStreamlineStepSize(Number(e.target.value))}
                style={{ width: 90 }}
              />
            </label>
            <button type="button" onClick={onResetVolumeStreamlineStep} style={{ padding: "3px 8px" }}>
              Auto step
            </button>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Max steps</span>
              <input
                type="number"
                min={50}
                max={5000}
                step={10}
                value={volumeStreamlineMaxSteps}
                onChange={(e) => onChangeVolumeStreamlineMaxSteps(Number(e.target.value))}
                style={{ width: 90 }}
              />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Field preset</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {VECTOR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChangeVolumeVectorPreset(preset.id)}
                  style={pill(volumeVectorPresetId === preset.id)}
                  aria-pressed={volumeVectorPresetId === preset.id}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
              Active field: {volumeVectorPresetLabel}. Step {fmtVal(volumeStreamlineStepSize, 3)}, max steps{" "}
              {volumeStreamlineMaxSteps}, max length {fmtVal(volumeStreamlineMaxLength, 2)}.
            </div>
          </div>
          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
            Source: {volumeDatasetOverride?.label ?? volumePreset.label} sampled on{" "}
            {(volumeDatasetOverride?.grid.dims ?? volumeSampling.dims)[0]}x
            {(volumeDatasetOverride?.grid.dims ?? volumeSampling.dims)[1]}x
            {(volumeDatasetOverride?.grid.dims ?? volumeSampling.dims)[2]}. Bounds: x in [
            {fmtVal(volumeBounds.min[0])}, {fmtVal(volumeBounds.max[0])}], y in [
            {fmtVal(volumeBounds.min[1])}, {fmtVal(volumeBounds.max[1])}], z in [{fmtVal(volumeBounds.min[2])},{" "}
            {fmtVal(volumeBounds.max[2])}].
          </div>
        </div>
      )}

      {viewerKind === "complex" && (
      <div style={{ ...cardStyle, marginTop: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Complex Map Sweep (z→w)</div>
        <div style={{ fontSize: 11, opacity: 0.75 }}>
          {complexMapIsRiemann
            ? "Define p(z) = Re + i Im and render the k-sheet surface w^k = p(z)."
            : "Map z = u + iv to w(u,v) = Re + i Im, then sweep or graph Re/Im as surfaces."}
        </div>
        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Tool mode</div>
        <div style={pillRow}>
          {(
            [
              { id: "line", label: "Set line" },
              { id: "probe", label: "Probe" },
              { id: "preimage", label: "Preimage pick" },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setComplexToolMode(mode.id)}
              style={pill(complexToolMode === mode.id)}
              aria-pressed={complexToolMode === mode.id}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, opacity: 0.72, marginTop: 6 }}>
          {complexToolMode === "line"
            ? "Click Z-plane to set a mapped line."
            : complexToolMode === "probe"
              ? "Click Z/W/3D to inspect one linked point."
              : "Click W-plane to set a preimage target."}
        </div>

        <details style={{ marginTop: 10 }} open>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Map</summary>
          <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 0 }}>Mapping definition</div>
        <label style={{ fontSize: 12 }}>Re({complexMapIsRiemann ? "p" : "w"})(u,v) =</label>
        <input
          type="text"
          value={complexMapSpec.reExpr}
          onChange={(e) => {
            onChangeComplexMapSpec({ reExpr: e.target.value });
            if (complexMapPresetId !== COMPLEX_MAP_CUSTOM_ID) onChangeComplexMapPreset(COMPLEX_MAP_CUSTOM_ID);
          }}
          style={{
            width: "100%",
            marginTop: 2,
            marginBottom: 6,
            padding: "4px 6px",
            borderRadius: 6,
            border: "1px solid #ccc",
            fontFamily: "monospace",
            fontSize: 13,
            boxSizing: "border-box",
          }}
        />

        <label style={{ fontSize: 12 }}>Im({complexMapIsRiemann ? "p" : "w"})(u,v) =</label>
        <input
          type="text"
          value={complexMapSpec.imExpr}
          onChange={(e) => {
            onChangeComplexMapSpec({ imExpr: e.target.value });
            if (complexMapPresetId !== COMPLEX_MAP_CUSTOM_ID) onChangeComplexMapPreset(COMPLEX_MAP_CUSTOM_ID);
          }}
          style={{
            width: "100%",
            marginTop: 2,
            marginBottom: 8,
            padding: "4px 6px",
            borderRadius: 6,
            border: "1px solid #ccc",
            fontFamily: "monospace",
            fontSize: 13,
            boxSizing: "border-box",
          }}
        />

        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Quick presets</div>
        <div style={{ ...pillRow, flexWrap: "wrap" }}>
          {[{ id: COMPLEX_MAP_CUSTOM_ID, label: "Custom" }, ...COMPLEX_MAP_PRESETS].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChangeComplexMapPreset(p.id)}
              style={pill(complexMapPresetId === p.id)}
              aria-pressed={complexMapPresetId === p.id}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ ...styles.hint, marginTop: 6 }}>Use u, v and functions like sin, cos, exp. Constants: pi, e.</div>

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Map mode</div>
        <div style={pillRow}>
          <button
            type="button"
            onClick={() => onChangeComplexMapSpec({ mapMode: "standard" })}
            style={pill(!complexMapIsRiemann)}
            aria-pressed={!complexMapIsRiemann}
          >
            Single-valued w = f(z)
          </button>
          <button
            type="button"
            onClick={() => onChangeComplexMapSpec({ mapMode: "riemann" })}
            style={pill(complexMapIsRiemann)}
            aria-pressed={complexMapIsRiemann}
          >
            Multi-sheet w^k = p(z)
          </button>
        </div>
        {complexMapIsRiemann && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 11 }}>
                Sheets k
                <input
                  type="number"
                  min={2}
                  max={12}
                  step={1}
                  value={complexMapSheetCount}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    onChangeComplexMapSpec({ sheetCount: clampInt(v, 2, 12) });
                  }}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 11 }}>
                Active sheet
                <input
                  type="number"
                  min={1}
                  max={complexMapSheetCount}
                  step={1}
                  value={complexMapSheetIndex + 1}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    onChangeComplexMapSpec({ sheetIndex: clampInt(v - 1, 0, complexMapSheetCount - 1) });
                  }}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => onChangeComplexMapSpec({ sheetMode: "all" })}
                style={pill(complexMapSpec.sheetMode === "all")}
                aria-pressed={complexMapSpec.sheetMode === "all"}
              >
                Render all sheets
              </button>
              <button
                type="button"
                onClick={() => onChangeComplexMapSpec({ sheetMode: "single" })}
                style={pill(complexMapSpec.sheetMode !== "all")}
                aria-pressed={complexMapSpec.sheetMode !== "all"}
              >
                Render active sheet only
              </button>
            </div>
            <label style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              <span>Branch cut angle (deg)</span>
              <input
                type="number"
                step={5}
                value={Number.isFinite(complexMapBranchCutDeg) ? complexMapBranchCutDeg.toFixed(1) : "0"}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  onChangeComplexMapSpec({ branchCutAngle: (v * Math.PI) / 180 });
                }}
                style={{ width: "100%" }}
              />
            </label>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
              The branch cut angle rotates the principal argument; zeros of p(z) are branch points for k&gt;1.
            </div>
          </>
        )}

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Domain & sampling</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={{ fontSize: 11 }}>
            u min
            <input
              type="number"
              step={0.1}
              value={complexMapSpec.uMin}
              onChange={(e) => onChangeComplexMapSpec({ uMin: Number(e.target.value) })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            u max
            <input
              type="number"
              step={0.1}
              value={complexMapSpec.uMax}
              onChange={(e) => onChangeComplexMapSpec({ uMax: Number(e.target.value) })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            v min
            <input
              type="number"
              step={0.1}
              value={complexMapSpec.vMin}
              onChange={(e) => onChangeComplexMapSpec({ vMin: Number(e.target.value) })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            v max
            <input
              type="number"
              step={0.1}
              value={complexMapSpec.vMax}
              onChange={(e) => onChangeComplexMapSpec({ vMax: Number(e.target.value) })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            nu
            <input
              type="number"
              min={2}
              max={400}
              step={1}
              value={complexMapSpec.nu}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onChangeComplexMapSpec({ nu: clampInt(v, 2, 400) });
              }}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            nv
            <input
              type="number"
              min={2}
              max={400}
              step={1}
              value={complexMapSpec.nv}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onChangeComplexMapSpec({ nv: clampInt(v, 2, 400) });
              }}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
        </div>

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Embedding</div>
        <div style={pillRow}>
          {(["v", "u"] as const).map((axis) => (
            <button
              key={axis}
              type="button"
              onClick={() => onChangeComplexMapSpec({ sweepAxis: axis })}
              style={pill(complexMapSpec.sweepAxis === axis)}
              aria-pressed={complexMapSpec.sweepAxis === axis}
            >
              Sweep by {axis}
            </button>
          ))}
        </div>
          </div>
        </details>

        <details style={{ marginTop: 10 }} open>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>View / Output</summary>
          <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 0, marginBottom: 4 }}>Output surface</div>
        <div style={pillRow}>
          {(
            [
              { id: "sweep", label: "Sweep (Re, Im)" },
              { id: "re", label: "Re surface" },
              { id: "im", label: "Im surface" },
              { id: "both", label: "Re + Im surfaces" },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onChangeComplexMapSpec({ outputMode: mode.id })}
              style={pill(complexMapSpec.outputMode === mode.id)}
              aria-pressed={complexMapSpec.outputMode === mode.id}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
          Re/Im surfaces use x = sweep axis, z = the other domain axis, height = Re/Im.
        </div>

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Scaling & safety</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
          <span style={{ minWidth: 54 }}>w scale</span>
          <input
            type="number"
            step={0.1}
            value={complexMapSpec.wScale}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChangeComplexMapSpec({ wScale: v });
            }}
            style={{ width: 90 }}
          />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={complexMapSpec.clampAbs != null}
              onChange={(e) => onChangeComplexMapSpec({ clampAbs: e.target.checked ? 4 : null })}
            />
            Clamp |w|
          </label>
          <input
            type="number"
            step={0.1}
            min={0}
            value={complexMapSpec.clampAbs ?? 4}
            disabled={complexMapSpec.clampAbs == null}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChangeComplexMapSpec({ clampAbs: v });
            }}
            style={{ width: 80 }}
          />
        </div>

        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Mapped coordinate net (advanced)</summary>
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={complexMapSpec.showIsolines}
                  onChange={(e) => onChangeComplexMapSpec({ showIsolines: e.target.checked })}
                />
                Show u/v grid
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: COMPLEX_GRID_COLORS.u }} />
                u-count
                <input
                  type="number"
                  min={0}
                  max={120}
                  step={1}
                  value={complexMapSpec.isolinesCountU}
                  disabled={!complexMapSpec.showIsolines}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChangeComplexMapSpec({ isolinesCountU: clampInt(v, 0, 120) });
                  }}
                  style={{ width: 70 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: COMPLEX_GRID_COLORS.v }} />
                v-count
                <input
                  type="number"
                  min={0}
                  max={120}
                  step={1}
                  value={complexMapSpec.isolinesCountV}
                  disabled={!complexMapSpec.showIsolines}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChangeComplexMapSpec({ isolinesCountV: clampInt(v, 0, 120) });
                  }}
                  style={{ width: 70 }}
                />
              </label>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "center",
                marginTop: 6,
                opacity: complexMapSpec.showIsolines ? 1 : 0.6,
                fontSize: 11,
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span>Thickness {fmtVal(complexMapGridThickness, 2)}</span>
                <input
                  type="range"
                  min={0.4}
                  max={2.5}
                  step={0.1}
                  value={complexMapGridThickness}
                  onChange={(e) => setComplexMapGridThickness(Number(e.target.value))}
                  disabled={!complexMapSpec.showIsolines}
                  style={{ width: 140 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span>Opacity {fmtVal(complexMapGridOpacity, 2)}</span>
                <input
                  type="range"
                  min={0.15}
                  max={1}
                  step={0.05}
                  value={complexMapGridOpacity}
                  onChange={(e) => setComplexMapGridOpacity(Number(e.target.value))}
                  disabled={!complexMapSpec.showIsolines}
                  style={{ width: 140 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 18 }}>
                <input
                  type="checkbox"
                  checked={complexMapGridShowSurface}
                  onChange={(e) => setComplexMapGridShowSurface(e.target.checked)}
                  disabled={!complexMapSpec.showIsolines}
                />
                Show on surface
              </label>
            </div>
            {complexMapSpec.outputMode !== "sweep" && (
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>
                3D lines include mapped lines plus the Re/Im graph lines.
              </div>
            )}
          </div>
        </details>

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Z/W planes</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          <button
            type="button"
            onClick={() => setComplexLineMode("vertical")}
            style={pill(complexLineMode === "vertical")}
            aria-pressed={complexLineMode === "vertical"}
            disabled={complexToolMode !== "line"}
          >
            Vertical line
          </button>
          <button
            type="button"
            onClick={() => setComplexLineMode("horizontal")}
            style={pill(complexLineMode === "horizontal")}
            aria-pressed={complexLineMode === "horizontal"}
            disabled={complexToolMode !== "line"}
          >
            Horizontal line
          </button>
          <button
            type="button"
            onClick={() => onPickComplexMapLine(null)}
            style={pill(!complexMapLine)}
            aria-pressed={!complexMapLine}
            disabled={complexToolMode !== "line"}
          >
            Clear line
          </button>
          <span style={{ fontSize: 11, opacity: 0.7, alignSelf: "center" }}>
            {complexToolMode === "line"
              ? "Click Z-plane to pick. Shift-click flips direction."
              : "Switch Tool mode to Set line to edit mapped lines."}
          </span>
        </div>
        <details style={{ marginBottom: 6 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 12 }}>W-plane overlays (advanced)</summary>
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, marginBottom: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={wPlaneDomainColor}
                  onChange={(e) => onChangeWPlaneDomainColor(e.target.checked)}
                />
                W-plane domain coloring
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={wPlaneShowRings}
                  onChange={(e) => onChangeWPlaneShowRings(e.target.checked)}
                  disabled={!wPlaneDomainColor}
                />
                |w| rings
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={wPlaneShowRays}
                  onChange={(e) => onChangeWPlaneShowRays(e.target.checked)}
                  disabled={!wPlaneDomainColor}
                />
                arg(w) rays
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, marginBottom: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapShowSphere}
                  onChange={(e) => onToggleComplexMapShowSphere(e.target.checked)}
                />
                Riemann sphere view
              </label>
              {complexMapShowSphere && (
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={complexMapSphereStacked}
                    onChange={(e) => onToggleComplexMapSphereStacked(e.target.checked)}
                  />
                  Stack along sweep axis ({complexMapSpec.sweepAxis})
                </label>
              )}
            </div>
            {complexMapShowSphere && (
              <div style={{ fontSize: 11, opacity: 0.72, marginBottom: 6 }}>
                Riemann sphere is shown in the right-side panel next to the main 3D view.
              </div>
            )}
          </div>
        </details>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Z-plane</div>
            <PlanePlot
              id="svgZ"
              extent={complexMapZExtent}
              step={1}
              ref={zPlaneRef}
              style={{ height: 160 }}
              onClickPoint={complexToolMode === "preimage" ? undefined : handleZPlaneClick}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>W-plane</div>
            <PlanePlot
              id="svgW"
              extent={complexMapWExtent}
              step={1}
              ref={wPlaneRef}
              style={{ height: 160 }}
              onClickPoint={complexToolMode === "line" ? undefined : handleWPlaneClick}
              domainColoring={wPlaneDomainColor}
              domainRings={wPlaneShowRings}
              domainRays={wPlaneShowRays}
            />
          </div>
          {complexMapShowSphere && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Riemann sphere</div>
              <RiemannSpherePlot
                lines={complexMapSphereLines}
                points={complexMapSpherePoints}
                guideSpheres={complexMapSphereGuides}
                style={{ height: 180 }}
              />
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                w mapped by stereographic projection; poles collapse to the north pole.
              </div>
            </div>
          )}
        </div>

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Preimage tool</div>
        <div style={pillRow}>
          {(
            [
              { id: "none", label: "Off" },
              { id: "re", label: "Re(w)=c" },
              { id: "im", label: "Im(w)=c" },
              { id: "abs", label: "|w|=r" },
              { id: "arg", label: "arg(w)=θ" },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setComplexPreimageMode(mode.id)}
              style={pill(complexPreimageMode === mode.id)}
              aria-pressed={complexPreimageMode === mode.id}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            Value
            <input
              type="number"
              step={complexPreimageMode === "arg" ? 0.1 : 0.05}
              value={complexPreimageValue}
              disabled={complexPreimageMode === "none"}
              onChange={(e) => applyPreimageValue(complexPreimageMode, Number(e.target.value))}
              style={{ width: 90 }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <input
              type="checkbox"
              checked={complexPreimageSnap}
              onChange={(e) => setComplexPreimageSnap(e.target.checked)}
              disabled={complexPreimageMode === "none"}
            />
            Snap to nice values
          </label>
          {complexPreimageMode === "arg" && (
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              θ = {(complexPreimageValue * (180 / Math.PI)).toFixed(1)}°
            </span>
          )}
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            {complexToolMode === "preimage" ? "Click W-plane to set." : "Switch Tool mode to Preimage pick to set."}
          </span>
        </div>
          </div>
        </details>

        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Analysis</summary>
          <div style={{ marginTop: 8 }}>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Marker overlays (advanced)</summary>
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapShowCritical}
                  onChange={(e) => setComplexMapShowCritical(e.target.checked)}
                />
                critical |detJ| ≤ {fmtVal(complexMapMarkerData?.thresholds.critical ?? 0, 4)}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapShowZeros}
                  onChange={(e) => setComplexMapShowZeros(e.target.checked)}
                />
                zeros |w| ≤ {fmtVal(complexMapMarkerData?.thresholds.zero ?? 0, 4)}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapShowPoles}
                  onChange={(e) => setComplexMapShowPoles(e.target.checked)}
                />
                poles |w| ≥ {fmtVal(complexMapMarkerData?.thresholds.pole ?? 0, 4)}
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6, fontSize: 11 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                crit rel
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={complexMapCriticalRel}
                  onChange={(e) => setComplexMapCriticalRel(clamp(Number(e.target.value), 0, 1))}
                  style={{ width: 70 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                zero rel
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={complexMapZeroRel}
                  onChange={(e) => setComplexMapZeroRel(clamp(Number(e.target.value), 0, 1))}
                  style={{ width: 70 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                pole rel
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.02}
                  value={complexMapPoleRel}
                  onChange={(e) => setComplexMapPoleRel(clamp(Number(e.target.value), 0, 1))}
                  style={{ width: 70 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                max markers
                <input
                  type="number"
                  min={20}
                  max={2000}
                  step={10}
                  value={complexMapMarkerMax}
                  onChange={(e) => setComplexMapMarkerMax(clampInt(Number(e.target.value), 20, 2000))}
                  style={{ width: 80 }}
                />
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6, fontSize: 11 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapMarkersZ}
                  onChange={(e) => setComplexMapMarkersZ(e.target.checked)}
                />
                Z-plane markers
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapMarkersW}
                  onChange={(e) => setComplexMapMarkersW(e.target.checked)}
                />
                W-plane markers
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexMapMarkers3d}
                  onChange={(e) => setComplexMapMarkers3d(e.target.checked)}
                />
                3D markers
              </label>
            </div>
          </div>
        </details>

        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Distortion (advanced)</summary>
          <div style={{ marginTop: 6 }}>
            <div style={pillRow}>
              {(
                [
                  { id: "none", label: "Off" },
                  { id: "area", label: "Area |detJ|" },
                  { id: "anisotropy", label: "σmax/σmin" },
                  { id: "conformal", label: "Conformal error" },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setComplexDistortionMode(mode.id)}
                  style={pill(complexDistortionMode === mode.id)}
                  aria-pressed={complexDistortionMode === mode.id}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6, fontSize: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Scale
                <button
                  type="button"
                  onClick={() => setComplexDistortionScale("linear")}
                  style={pill(complexDistortionScale === "linear")}
                  aria-pressed={complexDistortionScale === "linear"}
                  disabled={complexDistortionMode === "none"}
                >
                  Linear
                </button>
                <button
                  type="button"
                  onClick={() => setComplexDistortionScale("log")}
                  style={pill(complexDistortionScale === "log")}
                  aria-pressed={complexDistortionScale === "log"}
                  disabled={
                    complexDistortionMode === "none" ||
                    (complexDistortionMode !== "area" && complexDistortionMode !== "anisotropy")
                  }
                >
                  Log
                </button>
              </div>
              {complexDistortionMode === "conformal" && (
                <span style={{ opacity: 0.7 }}>Log scale only applies to |detJ| and σmax/σmin.</span>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6, fontSize: 11 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexDistortionShowZ}
                  onChange={(e) => setComplexDistortionShowZ(e.target.checked)}
                  disabled={complexDistortionMode === "none"}
                />
                Z-plane heatmap
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={complexDistortionShowSurface}
                  onChange={(e) => setComplexDistortionShowSurface(e.target.checked)}
                  disabled={complexDistortionMode === "none"}
                />
                Surface color
              </label>
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
              {complexMapDistortionProbe ? (
                <>
                  u={fmtVal(complexMapDistortionProbe.u, 3)} v={fmtVal(complexMapDistortionProbe.v, 3)} · |detJ|=
                  {fmtVal(complexMapDistortionProbe.detAbs, 4)} · σmax/σmin=
                  {fmtVal(complexMapDistortionProbe.ratio, 3)} · conf=
                  {fmtVal(complexMapDistortionProbe.conformalErr, 4)}
                  {complexDistortionScale === "log" &&
                    (complexDistortionMode === "area" || complexDistortionMode === "anisotropy") && (
                      <>
                        {" "}· log10(1+v)=
                        {complexDistortionMode === "area"
                          ? fmtVal(Math.log10(1 + Math.max(0, complexMapDistortionProbe.detAbs)), 4)
                          : fmtVal(Math.log10(1 + Math.max(0, complexMapDistortionProbe.ratio)), 4)}
                      </>
                    )}
                </>
              ) : (
                "Probe in Z/W/3D to read local distortion."
              )}
            </div>
          </div>
        </details>
          </div>
        </details>

        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Inspect</summary>
          <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 0, marginBottom: 4 }}>Linked probe</div>
        <div style={{ fontSize: 11, opacity: 0.75 }}>
          {complexToolMode === "probe"
            ? "Probe mode is active. Click Z/W/3D to inspect."
            : "Switch Tool mode to Probe to inspect points."}
        </div>
        <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6, lineHeight: 1.4 }}>
          {complexMapProbe ? (
            <>
              u={fmtVal(complexMapProbe.u, 3)} v={fmtVal(complexMapProbe.v, 3)} · w=
              {fmtVal(complexMapProbe.w.re, 3)} + {fmtVal(complexMapProbe.w.im, 3)}i · |w|=
              {fmtVal(complexMapProbe.w.mag, 3)} · arg(w)={fmtVal(complexMapProbe.w.arg, 3)} (
              {fmtVal((complexMapProbe.w.arg * 180) / Math.PI, 1)}°)
              <br />
              local scale={fmtVal(complexMapProbe.localScale, 4)} · detJ={fmtVal(complexMapProbe.det, 4)}
            </>
          ) : (
            "Click the Z-plane, W-plane, or 3D surface to inspect a point."
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={onPinComplexMapProbe} disabled={!complexMapProbe}>
            Pin probe
          </button>
          <button type="button" onClick={onClearComplexMapProbe} disabled={!complexMapProbe}>
            Clear
          </button>
          {complexMapProbePins.length > 0 && (
            <button type="button" onClick={onClearComplexMapProbePins}>
              Clear pins
            </button>
          )}
        </div>
        {complexMapProbePins.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
            {complexMapProbePins.map((pin) => (
              <div
                key={pin.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 6px",
                  borderRadius: 6,
                  border: "1px solid #e0e0e0",
                  background: "#fafafa",
                  fontSize: 11,
                }}
              >
                <div style={{ flex: 1 }}>
                  u={fmtVal(pin.u, 3)} v={fmtVal(pin.v, 3)} · |w|={fmtVal(pin.w.mag, 3)} · detJ=
                  {fmtVal(pin.det, 3)}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => onRecallComplexMapProbe(pin)}>
                    Use
                  </button>
                  <button type="button" onClick={() => onRemoveComplexMapProbePin(pin.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
          </div>
        </details>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={onBuildComplexMapSweep} style={{ padding: "4px 10px" }}>
            {complexMapSpec.outputMode === "both" ? "Build surfaces" : "Build surface"}
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <input
              type="checkbox"
              checked={complexMapLive}
              onChange={(e) => onToggleComplexMapLive(e.target.checked)}
            />
            Live update
          </label>
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            {complexMapLive ? "Auto rebuild on edits." : "Rebuild after edits."}
          </span>
        </div>

        {complexMapError && (
          <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{complexMapError}</div>
        )}
      </div>
      )}

      <div style={{ marginTop: 10, fontSize: 12 }}>
        <label style={{ display: "block", cursor: "pointer", marginBottom: 2 }}>
          <input type="checkbox" checked={showWireframe} onChange={onToggleWireframe} style={{ marginRight: 6 }} />
          Wireframe mesh
        </label>
        <label style={{ display: "block", cursor: "pointer" }}>
          <input type="checkbox" checked={showPlanes} onChange={onTogglePlanes} style={{ marginRight: 6 }} />
          Show coordinate planes (x=0, y=0, z=0)
        </label>
        <label style={{ display: "block", cursor: "pointer" }}>
          <input type="checkbox" checked={showProbeNormal} onChange={onToggleProbeNormal} style={{ marginRight: 6 }} />
          Show normal arrow
        </label>
        <label style={{ display: "block", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showProbeTangentPlane}
            onChange={onToggleProbeTangentPlane}
            style={{ marginRight: 6 }}
          />
          Show tangent plane
        </label>
        <label style={{ display: "block", cursor: "pointer" }}>
          <input type="checkbox" checked={showProbeTangents} onChange={onToggleProbeTangents} style={{ marginRight: 6 }} />
          Show tangent directions
        </label>
      </div>

      {wrapComplexAdvancedTools(
      <>
      <details style={{ ...cardStyle, marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>SurfaceMesh</summary>
        <div style={{ marginTop: 8 }}>
        {viewerKind !== "mesh" ? (
          <>
            <button
              type="button"
              onClick={onConvertToMesh}
              disabled={!surfaceMeshExportable}
              style={{ padding: "4px 10px" }}
            >
              Convert to Mesh…
            </button>
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
              {surfaceMeshExportable
                ? viewerKind === "complex"
                  ? "Switch to the SurfaceMesh viewer using the current complex map mesh."
                  : "Bake the current surface into a mesh dataset."
                : viewerKind === "implicit"
                  ? "Run CGAL mesh first to convert an implicit surface (or use the implicit baker below)."
                  : viewerKind === "complex"
                    ? "Build the complex map surface first."
                    : "Mesh conversion will enable once the surface is ready."}
            </div>
            {surfaceMeshImportError && (
              <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>
                {surfaceMeshImportError}
              </div>
            )}
            {viewerKind === "implicit" && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #e0e0e0",
                  background: "#fafafa",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Implicit baker (marching cubes)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <label style={{ fontSize: 11 }}>
                    x span
                    <input
                      type="number"
                      min={0.2}
                      step={0.1}
                      value={implicitBakeBounds.xSpan}
                      onChange={(e) =>
                        onChangeImplicitBakeBounds({
                          ...implicitBakeBounds,
                          xSpan: Math.max(0.2, Number(e.target.value)),
                        })
                      }
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                  <label style={{ fontSize: 11 }}>
                    y span
                    <input
                      type="number"
                      min={0.2}
                      step={0.1}
                      value={implicitBakeBounds.ySpan}
                      onChange={(e) =>
                        onChangeImplicitBakeBounds({
                          ...implicitBakeBounds,
                          ySpan: Math.max(0.2, Number(e.target.value)),
                        })
                      }
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                  <label style={{ fontSize: 11 }}>
                    z span
                    <input
                      type="number"
                      min={0.2}
                      step={0.1}
                      value={implicitBakeBounds.zSpan}
                      onChange={(e) =>
                        onChangeImplicitBakeBounds({
                          ...implicitBakeBounds,
                          zSpan: Math.max(0.2, Number(e.target.value)),
                        })
                      }
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                  <label style={{ fontSize: 11 }}>
                    resolution
                    <input
                      type="number"
                      min={16}
                      max={320}
                      step={1}
                      value={implicitBakeResolution}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) {
                          onChangeImplicitBakeResolution(Math.max(16, Math.min(320, Math.round(v))));
                        }
                      }}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={onUseImplicitBakeDomain} style={{ padding: "4px 8px" }}>
                    Use domain
                  </button>
                  <button type="button" onClick={onResetImplicitBakeBounds} style={{ padding: "4px 8px" }}>
                    Reset
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  <button type="button" onClick={onBakeImplicit} disabled={implicitBakeBusy} style={{ padding: "4px 10px" }}>
                    {implicitBakeBusy ? "Baking..." : "Bake (marching cubes)"}
                  </button>
                </div>
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
                  Runs in a worker so higher resolutions stay responsive.
                </div>
                {implicitBakeBusy && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11, color: "#555" }}>
                      {implicitBakePhase === "marching" ? "Marching cubes" : "Sampling grid"} · {implicitBakePercent}%
                    </div>
                    <div style={{ height: 6, background: "#eee", borderRadius: 999, overflow: "hidden", marginTop: 4 }}>
                      <div style={{ width: `${implicitBakePercent}%`, height: "100%", background: "#0a66c2" }} />
                    </div>
                  </div>
                )}
                {implicitBakeCacheHit && (
                  <div style={{ fontSize: 11, color: "#357", marginTop: 6 }}>Used cached bake.</div>
                )}
                {implicitBakeError && (
                  <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{implicitBakeError}</div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{surfaceMeshLabel}</div>
            {surfaceMeshStats && (
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
                {surfaceMeshStats.vertCount.toLocaleString()} verts · {surfaceMeshStats.triCount.toLocaleString()} tris
              </div>
            )}
            {surfaceMeshSource && (
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>Source: {surfaceMeshSource}</div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Generate</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {surfaceMeshPresets.map((p) => (
                <button key={p.id} type="button" onClick={() => onGenerateSurfaceMeshPreset(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Load file</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => meshFileInputRef.current?.click()}
                disabled={surfaceMeshImportBusy}
              >
                {surfaceMeshImportBusy ? "Loading..." : "Load STL/OBJ/PLY/GLTF"}
              </button>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={surfaceMeshMergeVertices}
                  onChange={(e) => onToggleSurfaceMeshMergeVertices(e.target.checked)}
                />
                merge vertices
              </label>
              <input
                ref={meshFileInputRef}
                type="file"
                multiple
                accept=".stl,.obj,.ply,.gltf,.glb"
                style={{ display: "none" }}
                onChange={(e) => {
                  const files = e.currentTarget.files ?? null;
                  onLoadSurfaceMeshFile(files);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
              For .gltf with external .bin/textures, select all related files together.
            </div>
            {surfaceMeshImportError && (
              <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{surfaceMeshImportError}</div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Export</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              <button type="button" onClick={onExportSurfaceMeshGlb} disabled={surfaceMeshExportBusy || !meshReady}>
                {surfaceMeshExportBusy ? "Exporting..." : "Export GLB"}
              </button>
              <button type="button" onClick={onExportSurfaceMeshObj} disabled={surfaceMeshExportBusy || !meshReady}>
                {surfaceMeshExportBusy ? "Exporting..." : "Export OBJ"}
              </button>
            </div>
            {surfaceMeshExportError && (
              <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{surfaceMeshExportError}</div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Weld vertices</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <label style={{ fontSize: 11 }}>
                Tolerance
                <input
                  type="number"
                  min={1e-6}
                  max={0.1}
                  step={0.0001}
                  value={surfaceMeshWeldTolerance}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      onChangeSurfaceMeshWeldTolerance(Math.max(1e-6, Math.min(0.1, v)));
                    }
                  }}
                  style={{ width: 90, marginLeft: 6 }}
                />
              </label>
              <button type="button" onClick={onWeldSurfaceMesh} disabled={surfaceMeshWeldBusy || !meshReady}>
                {surfaceMeshWeldBusy ? "Welding..." : "Weld"}
              </button>
            </div>
            {surfaceMeshWeldError && (
              <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{surfaceMeshWeldError}</div>
            )}
          </>
        )}
        <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600 }}>Volume bridge</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <input
              type="checkbox"
              checked={volumeDistanceSigned}
              onChange={(e) => onToggleVolumeDistanceSigned(e.target.checked)}
            />
            Signed (winding number)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <input
              type="checkbox"
              checked={volumeDistanceAutoBounds}
              onChange={(e) => onToggleVolumeDistanceAutoBounds(e.target.checked)}
            />
            Auto bounds (fit mesh)
          </label>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          <button
            type="button"
            onClick={onBuildDistanceVolume}
            disabled={volumeDistanceBusy}
            style={{ padding: "4px 10px" }}
          >
            {volumeDistanceBusy ? "Building..." : "Surface → Volume (distance)"}
          </button>
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
          Builds a {volumeDistanceSigned ? "signed" : "unsigned"} distance field on{" "}
          {volumeDistanceAutoBounds ? "auto mesh bounds" : "the current sampling box"}. Use the Volume panel to view
          slices/isosurface.
        </div>
        {volumeDistanceError && (
          <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{volumeDistanceError}</div>
        )}
        </div>
      </details>

      <details style={{ ...cardStyle, marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Python mesh ops (VTK)</summary>
        <div style={{ marginTop: 8 }}>
        {!vtkAvailable ? (
          <div style={{ fontSize: 11, color: "#666" }}>Mesh data not ready yet.</div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              <button type="button" onClick={onVtkCleanNormals} disabled={vtkBusy}>
                {vtkBusy ? "Working..." : "Clean + normals"}
              </button>
              <button type="button" onClick={onVtkDecimate} disabled={vtkBusy}>
                {vtkBusy ? "Working..." : "Decimate"}
              </button>
              <button type="button" onClick={onVtkSmooth} disabled={vtkBusy}>
                {vtkBusy ? "Working..." : "Smooth"}
              </button>
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Decimate</div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={vtkUseTargetFaces}
                onChange={(e) => onToggleVtkUseTargetFaces(e.target.checked)}
                disabled={vtkBusy}
              />
              Use target faces
            </label>
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 10, color: "#555" }}>
                Reduction {vtkDecimateReduction.toFixed(2)}
              </div>
              <input
                type="range"
                min={0}
                max={0.95}
                step={0.01}
                value={vtkDecimateReduction}
                onChange={(e) => onChangeVtkDecimateReduction(Number(e.target.value))}
                disabled={vtkUseTargetFaces || vtkBusy}
                style={{ width: 180 }}
              />
            </div>
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 10, color: "#555" }}>Target faces</div>
              <input
                type="number"
                min={100}
                max={1000000}
                step={100}
                value={vtkDecimateTargetFaces}
                onChange={(e) => onChangeVtkDecimateTargetFaces(Number(e.target.value))}
                disabled={!vtkUseTargetFaces || vtkBusy}
                style={{ width: 120 }}
              />
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, marginTop: 10, marginBottom: 4 }}>Smooth</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Iterations
                <input
                  type="number"
                  min={1}
                  max={200}
                  step={1}
                  value={vtkSmoothIterations}
                  onChange={(e) => onChangeVtkSmoothIterations(Number(e.target.value))}
                  disabled={vtkBusy}
                  style={{ width: 60 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Passband
                <input
                  type="number"
                  min={0.001}
                  max={1}
                  step={0.01}
                  value={vtkSmoothPassband}
                  onChange={(e) => onChangeVtkSmoothPassband(Number(e.target.value))}
                  disabled={vtkBusy}
                  style={{ width: 70 }}
                />
              </label>
            </div>
          </>
        )}
        {vtkError && <div style={{ fontSize: 11, color: "#b42318", marginTop: 6 }}>{vtkError}</div>}
        </div>
      </details>

      <details style={{ ...cardStyle, marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Display & analysis</summary>
        <div style={{ marginTop: 8, fontSize: 12 }}>
        {viewerKind !== "complex" && (
          <label style={{ display: "block", cursor: "pointer", marginTop: 2 }}>
            <input type="checkbox" checked={probeEnabled} onChange={onToggleProbe} style={{ marginRight: 6 }} />
            Probe mode: pick point on surface
          </label>
        )}

        <div style={{ marginTop: 0, fontSize: 12 }}>
          {(viewerKind === "param" ||
            viewerKind === "weierstrass" ||
            viewerKind === "graph" ||
            viewerKind === "implicit") && (
            <div style={{ marginTop: 6 }}>
              <label style={{ display: "block", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={showPrincipalDirections}
                  onChange={onTogglePrincipalDirections}
                  style={{ marginRight: 6 }}
                />
                Show principal directions
              </label>
              <label style={{ display: "block", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={showPrincipalNormalPlanes}
                  onChange={onTogglePrincipalNormalPlanes}
                  style={{ marginRight: 6 }}
                />
                Show principal normal planes
              </label>
              <label style={{ display: "block", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={showPrincipalLines}
                  onChange={onTogglePrincipalLines}
                  style={{ marginRight: 6 }}
                />
                Trace principal curvature lines
              </label>
              <label style={{ display: "block", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={showPrincipalGlyphs}
                  onChange={onTogglePrincipalGlyphs}
                  style={{ marginRight: 6 }}
                />
                Show principal direction glyphs
              </label>
              {showPrincipalGlyphs && (
                <div
                  style={{
                    marginLeft: 20,
                    marginTop: 6,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 11,
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>Density</span>
                    <select
                      value={principalGlyphDensity}
                      onChange={(e) => onChangePrincipalGlyphDensity(Number(e.target.value))}
                      style={{ fontSize: 11, padding: "2px 4px" }}
                    >
                      <option value={50}>1/50</option>
                      <option value={100}>1/100</option>
                      <option value={200}>1/200</option>
                      <option value={400}>1/400</option>
                    </select>
                  </label>
                  <div style={{ minWidth: 160 }}>
                    <div style={{ fontSize: 10, color: "#555" }}>
                      Length {principalGlyphLength.toFixed(2)}
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={1.2}
                      step={0.05}
                      value={principalGlyphLength}
                      onChange={(e) => onChangePrincipalGlyphLength(Number(e.target.value))}
                      style={{ width: 160 }}
                    />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>Mode</span>
                    <select
                      value={principalGlyphMode}
                      onChange={(e) => onChangePrincipalGlyphMode(e.target.value as "both" | "d1")}
                      style={{ fontSize: 11, padding: "2px 4px" }}
                    >
                      <option value="both">d1 + d2</option>
                      <option value="d1">d1 only</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        <details style={{ marginTop: 8 }} open={showCurvatureLines}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Curvature lines</summary>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            <label style={{ display: "block", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showCurvatureLines}
                onChange={onToggleCurvatureLines}
                style={{ marginRight: 6 }}
              />
              Show curvature lines
            </label>
            <div
              style={{
                marginLeft: 18,
                marginTop: 6,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                opacity: showCurvatureLines ? 1 : 0.6,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "#555" }}>Field</div>
                <label style={{ marginRight: 10 }}>
                  <input
                    type="radio"
                    name="curvature-field"
                    value="d1"
                    checked={curvatureLineField === "d1"}
                    onChange={() => onChangeCurvatureLineField("d1")}
                    disabled={!showCurvatureLines}
                    style={{ marginRight: 4 }}
                  />
                  along d1 (k1)
                </label>
                <label>
                  <input
                    type="radio"
                    name="curvature-field"
                    value="d2"
                    checked={curvatureLineField === "d2"}
                    onChange={() => onChangeCurvatureLineField("d2")}
                    disabled={!showCurvatureLines}
                    style={{ marginRight: 4 }}
                  />
                  along d2 (k2)
                </label>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#555" }}>Seed source</div>
                <label style={{ marginRight: 10 }}>
                  <input
                    type="radio"
                    name="curvature-seed-source"
                    value="global"
                    checked={curvatureSeedSource === "global"}
                    onChange={() => onChangeCurvatureSeedSource("global")}
                    disabled={!showCurvatureLines}
                    style={{ marginRight: 4 }}
                  />
                  Global grid
                </label>
                <label title={selectionMaskCount ? "" : "No selection available"}>
                  <input
                    type="radio"
                    name="curvature-seed-source"
                    value="selection"
                    checked={curvatureSeedSource === "selection"}
                    onChange={() => onChangeCurvatureSeedSource("selection")}
                    disabled={!showCurvatureLines || selectionMaskCount === 0}
                    style={{ marginRight: 4 }}
                  />
                  Selection region
                </label>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>Seed density</span>
                <select
                  value={curvatureSeedDensity}
                  onChange={(e) => onChangeCurvatureSeedDensity(Number(e.target.value))}
                  disabled={!showCurvatureLines}
                  style={{ fontSize: 11, padding: "2px 4px" }}
                >
                  <option value={50}>High</option>
                  <option value={100}>Medium</option>
                  <option value={200}>Low</option>
                </select>
              </label>

              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: 11, color: "#555" }}>
                  Step size h {curvatureStepSize > 0 ? curvatureStepSize.toFixed(3) : "(auto)"}
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.005}
                  value={curvatureStepSize}
                  onChange={(e) => onChangeCurvatureStepSize(Number(e.target.value))}
                  disabled={!showCurvatureLines}
                  style={{ width: 180 }}
                />
              </div>

              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: 11, color: "#555" }}>Max steps {curvatureMaxSteps}</div>
                <input
                  type="range"
                  min={80}
                  max={800}
                  step={20}
                  value={curvatureMaxSteps}
                  onChange={(e) => onChangeCurvatureMaxSteps(Number(e.target.value))}
                  disabled={!showCurvatureLines}
                  style={{ width: 180 }}
                />
              </div>

              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: 11, color: "#555" }}>Max lines {curvatureMaxLines}</div>
                <input
                  type="range"
                  min={40}
                  max={400}
                  step={20}
                  value={curvatureMaxLines}
                  onChange={(e) => onChangeCurvatureMaxLines(Number(e.target.value))}
                  disabled={!showCurvatureLines}
                  style={{ width: 180 }}
                />
              </div>

              <button
                type="button"
                onClick={onRebuildCurvatureLines}
                disabled={!showCurvatureLines}
                style={{ alignSelf: "flex-start", fontSize: 11, padding: "3px 6px" }}
              >
                Rebuild
              </button>
            </div>
          </div>
        </details>

        <details style={{ marginTop: 8 }} open={showRidges || showValleys}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Ridges / Valleys</summary>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            {(() => {
              const ridgeValleyAvailable =
                viewerKind === "graph" ||
                viewerKind === "implicit" ||
                viewerKind === "param" ||
                viewerKind === "weierstrass" ||
                viewerKind === "mesh" ||
                viewerKind === "complex";
              if (!ridgeValleyAvailable) {
                return (
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
                    Ridge/valley detection unavailable (principal curvatures/directions not computed).
                  </div>
                );
              }
              return null;
            })()}

            {(() => {
              const ridgeValleyAvailable =
                viewerKind === "graph" ||
                viewerKind === "implicit" ||
                viewerKind === "param" ||
                viewerKind === "weierstrass" ||
                viewerKind === "mesh" ||
                viewerKind === "complex";
              const ridgeValleyEnabled = ridgeValleyAvailable && (showRidges || showValleys);
              const ridgeValleyStitchEnabled = ridgeValleyEnabled && ridgeValleyStitch;
              return (
                <>
                  <label style={{ display: "block", cursor: ridgeValleyAvailable ? "pointer" : "not-allowed" }}>
                    <input
                      type="checkbox"
                      checked={showRidges}
                      onChange={onToggleRidges}
                      disabled={!ridgeValleyAvailable}
                      style={{ marginRight: 6 }}
                    />
                    Show ridges
                  </label>
                  <label style={{ display: "block", cursor: ridgeValleyAvailable ? "pointer" : "not-allowed" }}>
                    <input
                      type="checkbox"
                      checked={showValleys}
                      onChange={onToggleValleys}
                      disabled={!ridgeValleyAvailable}
                      style={{ marginRight: 6 }}
                    />
                    Show valleys
                  </label>

                  <label
                    style={{
                      display: "block",
                      cursor: ridgeValleyAvailable && selectionMaskCount ? "pointer" : "not-allowed",
                      color: ridgeValleyAvailable && selectionMaskCount ? "#000" : "#999",
                      marginTop: 4,
                    }}
                    title={selectionMaskCount ? "" : "No selection available"}
                  >
                    <input
                      type="checkbox"
                      checked={ridgeValleySelectionOnly}
                      onChange={onToggleRidgeValleySelectionOnly}
                      disabled={!ridgeValleyAvailable || selectionMaskCount === 0}
                      style={{ marginRight: 6 }}
                    />
                    Only inside selection
                  </label>

                  <label
                    style={{
                      display: "block",
                      cursor: ridgeValleyAvailable ? "pointer" : "not-allowed",
                      marginTop: 4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={ridgeValleyStitch}
                      onChange={onToggleRidgeValleyStitch}
                      disabled={!ridgeValleyAvailable}
                      style={{ marginRight: 6 }}
                    />
                    Stitch into curves (v2)
                  </label>

                  <div
                    style={{
                      marginLeft: 18,
                      marginTop: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      opacity: ridgeValleyEnabled ? 1 : 0.6,
                    }}
                  >
                    <div style={{ minWidth: 180 }}>
                      <div style={{ fontSize: 11, color: "#555" }}>
                        Magnitude threshold {ridgeValleyMagMin.toFixed(3)}
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.005}
                        value={ridgeValleyMagMin}
                        onChange={(e) => onChangeRidgeValleyMagMin(Number(e.target.value))}
                        disabled={!ridgeValleyEnabled}
                        style={{ width: 180 }}
                      />
                    </div>

                    <div style={{ minWidth: 180 }}>
                      <div style={{ fontSize: 11, color: "#555" }}>
                        Contrast threshold {ridgeValleyContrast.toFixed(3)}
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={0.5}
                        step={0.005}
                        value={ridgeValleyContrast}
                        onChange={(e) => onChangeRidgeValleyContrast(Number(e.target.value))}
                        disabled={!ridgeValleyEnabled}
                        style={{ width: 180 }}
                      />
                    </div>

                    <div style={{ minWidth: 180 }}>
                      <div style={{ fontSize: 11, color: "#555" }}>
                        Link minCos {ridgeValleyMinCos.toFixed(2)}
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={0.7}
                        step={0.02}
                        value={ridgeValleyMinCos}
                        onChange={(e) => onChangeRidgeValleyMinCos(Number(e.target.value))}
                        disabled={!ridgeValleyEnabled}
                        style={{ width: 180 }}
                      />
                    </div>

                    {!ridgeValleyStitch && (
                      <div style={{ minWidth: 180 }}>
                        <div style={{ fontSize: 11, color: "#555" }}>
                          Segment length {ridgeValleySegmentScale.toFixed(4)}
                        </div>
                        <input
                          type="range"
                          min={0.001}
                          max={0.02}
                          step={0.001}
                          value={ridgeValleySegmentScale}
                          onChange={(e) => onChangeRidgeValleySegmentScale(Number(e.target.value))}
                          disabled={!ridgeValleyEnabled}
                          style={{ width: 180 }}
                        />
                      </div>
                    )}

                    {ridgeValleyStitch && (
                      <>
                        <div style={{ minWidth: 180 }}>
                          <div style={{ fontSize: 11, color: "#555" }}>
                            Decimate spacing {ridgeValleyDecimate.toFixed(4)}
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={0.02}
                            step={0.0005}
                            value={ridgeValleyDecimate}
                            onChange={(e) => onChangeRidgeValleyDecimate(Number(e.target.value))}
                            disabled={!ridgeValleyStitchEnabled}
                            style={{ width: 180 }}
                          />
                        </div>

                        <div style={{ minWidth: 180 }}>
                          <div style={{ fontSize: 11, color: "#555" }}>
                            Max curves {ridgeValleyMaxCurves}
                          </div>
                          <input
                            type="range"
                            min={20}
                            max={400}
                            step={10}
                            value={ridgeValleyMaxCurves}
                            onChange={(e) => onChangeRidgeValleyMaxCurves(Number(e.target.value))}
                            disabled={!ridgeValleyStitchEnabled}
                            style={{ width: 180 }}
                          />
                        </div>

                        <div style={{ minWidth: 180 }}>
                          <div style={{ fontSize: 11, color: "#555" }}>
                            Min confidence {ridgeValleyMinConf.toFixed(3)}
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.01}
                            value={ridgeValleyMinConf}
                            onChange={(e) => onChangeRidgeValleyMinConf(Number(e.target.value))}
                            disabled={!ridgeValleyStitchEnabled}
                            style={{ width: 180 }}
                          />
                        </div>
                      </>
                    )}

                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>Sample density</span>
                      <select
                        value={ridgeValleySampleMode}
                        onChange={(e) => onChangeRidgeValleySampleMode(e.target.value as "high" | "medium" | "low")}
                        disabled={!ridgeValleyEnabled}
                        style={{ fontSize: 11, padding: "2px 4px" }}
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </label>
                  </div>
                </>
              );
            })()}
          </div>
        </details>

        <div style={{ marginTop: 8 }}>
          <label style={{ display: "block", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selectRegionEnabled}
              onChange={onToggleSelectRegion}
              style={{ marginRight: 6 }}
            />
            Select region {selectionMaskCount ? `(${selectionMaskCount} normals)` : ""}
          </label>
          {selectRegionEnabled && (
            <div
              style={{
                marginLeft: 20,
                marginTop: 6,
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                fontSize: 11,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 180 }}>
                <div style={{ fontSize: 10, color: "#555" }}>Selection mode</div>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="radio"
                    name="selection-mode"
                    value="euclidean"
                    checked={selectionMode === "euclidean"}
                    onChange={() => onChangeSelectionMode("euclidean")}
                  />
                  Euclidean ball
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="radio"
                    name="selection-mode"
                    value="geodesic"
                    checked={selectionMode === "geodesic"}
                    onChange={() => onChangeSelectionMode("geodesic")}
                  />
                  Geodesic disk
                </label>
              </div>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: 10, color: "#555" }}>Radius {selectionRadius.toFixed(2)}</div>
                <input
                  type="range"
                  min={0.05}
                  max={2}
                  step={0.05}
                  value={selectionRadius}
                  onChange={(e) => onSetSelectionRadius(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: selectionHasUV && selectionMode === "euclidean" ? "pointer" : "not-allowed",
                  color: selectionHasUV && selectionMode === "euclidean" ? "#000" : "#999",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectionUseUV}
                  onChange={onToggleSelectionUseUV}
                  disabled={!selectionHasUV || selectionMode === "geodesic"}
                  style={{ marginRight: 6 }}
                />
                Use UV
              </label>
              <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={zoomToRegion}
                  onChange={onToggleZoomToRegion}
                  style={{ marginRight: 6 }}
                />
                Zoom to region
              </label>
              <button type="button" onClick={onZoomNow} style={{ padding: "4px 8px" }}>
                Zoom now
              </button>
              <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selectionOverlayVisible}
                  onChange={onToggleSelectionOverlayVisible}
                  style={{ marginRight: 6 }}
                />
                Show selection
              </label>
              <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selectionOverlayOnTop}
                  onChange={onToggleSelectionOverlayOnTop}
                  style={{ marginRight: 6 }}
                />
                Overlay on top
              </label>
              <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selectionSphereVisible}
                  onChange={onToggleSelectionSphereVisible}
                  style={{ marginRight: 6 }}
                />
                Show selection sphere
              </label>
              <button type="button" onClick={onClearSelection} style={{ padding: "4px 8px" }}>
                Clear selection
              </button>
            </div>
          )}
          {selectRegionEnabled && (
            <details style={{ marginLeft: 20, marginTop: 8 }} open>
              <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Selection stats</summary>
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                  <button
                    type="button"
                    onClick={onRefreshSelectionStats}
                    style={{ padding: "3px 8px", fontSize: 11 }}
                  >
                    Refresh stats
                  </button>
                </div>
                <SelectionStatsPanel
                  stats={selectionStats}
                  availableMetrics={availableSelectionMetrics}
                  selectedMetric={availableSelectionMetrics.length ? selectedMetric : null}
                  onSelectedMetricChange={onChangeSelectedMetric}
                />
              </div>
            </details>
          )}
          <details style={{ marginLeft: 20, marginTop: 10 }} open={geodesicDiskEnabled}>
            <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Geodesic disk</summary>
            <div style={{ marginTop: 6, fontSize: 11, display: "flex", flexDirection: "column", gap: 8 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: geodesicDiskAvailable ? "pointer" : "not-allowed",
                  color: geodesicDiskAvailable ? "#000" : "#999",
                }}
                title={geodesicDiskAvailable ? "" : geodesicDiskUnavailableReason}
              >
                <input
                  type="checkbox"
                  checked={geodesicDiskEnabled}
                  onChange={onToggleGeodesicDiskEnabled}
                  disabled={!geodesicDiskAvailable}
                  style={{ marginRight: 6 }}
                />
                Enable disk
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={onPickGeodesicDiskCenter}
                  disabled={!geodesicDiskAvailable || !geodesicDiskEnabled}
                  style={{ padding: "3px 8px" }}
                >
                  {geodesicDiskPickMode ? "Click surface..." : "Pick center"}
                </button>
                <span>Center: {geodesicDiskCenter ? geodesicDiskCenter.faceIndex : "-"}</span>
                {geodesicDiskBusy && <span style={{ color: "#666" }}>Computing...</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 180 }}>
                  <div style={{ fontSize: 10, color: "#555" }}>
                    Radius {geodesicDiskRadius.toFixed(2)}
                  </div>
                  <input
                    type="range"
                    min={0.001}
                    max={5}
                    step={0.01}
                    value={geodesicDiskRadius}
                    onChange={(e) => onChangeGeodesicDiskRadius(Number(e.target.value))}
                    disabled={!geodesicDiskEnabled}
                    style={{ width: "100%" }}
                  />
                </div>
                <input
                  type="number"
                  min={0.001}
                  step={0.01}
                  value={Number.isFinite(geodesicDiskRadius) ? geodesicDiskRadius : 0}
                  onChange={(e) => onChangeGeodesicDiskRadius(Number(e.target.value))}
                  disabled={!geodesicDiskEnabled}
                  style={{ width: 80, padding: "2px 4px", fontSize: 11 }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={geodesicDiskAutoUpdate}
                    onChange={onToggleGeodesicDiskAutoUpdate}
                    disabled={!geodesicDiskEnabled}
                  />
                  Auto-update radius
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={geodesicDiskShowBoundary}
                    onChange={onToggleGeodesicDiskShowBoundary}
                    disabled={!geodesicDiskEnabled}
                  />
                  Show boundary
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>Method</span>
                  <select
                    value={geodesicDiskMethod}
                    onChange={(e) => onChangeGeodesicDiskMethod(e.target.value as "heat" | "dijkstra")}
                    disabled={!geodesicDiskEnabled}
                    style={{ fontSize: 11, padding: "2px 6px" }}
                  >
                    <option value="heat">Heat</option>
                    <option value="dijkstra">Dijkstra (approx)</option>
                  </select>
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={onRecomputeGeodesicDisk}
                  disabled={!geodesicDiskEnabled || !geodesicDiskCenter || geodesicDiskBusy}
                  style={{ padding: "3px 8px" }}
                >
                  {geodesicDiskBusy ? "Running..." : "Recompute distances"}
                </button>
                {!geodesicDiskAutoUpdate && (
                  <button
                    type="button"
                    onClick={onApplyGeodesicDiskRadius}
                    disabled={!geodesicDiskEnabled}
                    style={{ padding: "3px 8px" }}
                  >
                    Apply radius
                  </button>
                )}
                <button type="button" onClick={onClearGeodesicDisk} style={{ padding: "3px 8px" }}>
                  Clear disk
                </button>
              </div>
              {geodesicDiskMessage && <div style={{ color: "#b23b1a" }}>{geodesicDiskMessage}</div>}
              <DiskStatsPanel
                stats={geodesicDiskStats}
                curvatureStats={geodesicDiskSelectionStats.metrics}
                sampleCount={geodesicDiskSelectionStats.count}
                compact
              />
            </div>
          </details>
          <details style={{ marginLeft: 20, marginTop: 10 }} open={geodesicPathEnabled}>
            <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Geodesic path</summary>
            <div style={{ marginTop: 6, fontSize: 11, display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={geodesicPathEnabled}
                  onChange={onToggleGeodesicPathEnabled}
                  style={{ marginRight: 6 }}
                />
                Enable geodesic path tool
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" onClick={onClearGeodesicPath} style={{ padding: "3px 8px" }}>
                  Clear path
                </button>
                {geodesicPathLength != null && Number.isFinite(geodesicPathLength) && (
                  <span style={{ fontWeight: 600 }}>Length: {geodesicPathLength.toFixed(3)}</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <span>Start: {geodesicPathStart ? geodesicPathStart.vertexIndex : "-"}</span>
                <span>End: {geodesicPathEnd ? geodesicPathEnd.vertexIndex : "-"}</span>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: selectionMaskCount ? "pointer" : "not-allowed",
                  color: selectionMaskCount ? "#000" : "#999",
                }}
                title={selectionMaskCount ? "" : "No selection available"}
              >
                <input
                  type="checkbox"
                  checked={geodesicPathConstrain}
                  onChange={onToggleGeodesicPathConstrain}
                  disabled={!selectionMaskCount}
                  style={{ marginRight: 6 }}
                />
                Constrain path to selection
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: geodesicSmoothEnabled ? "pointer" : "not-allowed",
                  color: geodesicSmoothEnabled ? "#000" : "#999",
                }}
                title={geodesicSmoothEnabled ? "" : "Smooth path only applies to param surfaces"}
              >
                <input
                  type="checkbox"
                  checked={geodesicPathSmooth}
                  onChange={onToggleGeodesicPathSmooth}
                  disabled={!geodesicSmoothEnabled}
                  style={{ marginRight: 6 }}
                />
                Smooth path (param)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={geodesicPathDebug}
                  onChange={onToggleGeodesicPathDebug}
                  style={{ marginRight: 6 }}
                />
                Debug geodesic
              </label>
              {geodesicPathMessage && (
                <div style={{ color: "#b23b1a" }}>{geodesicPathMessage}</div>
              )}
              {geodesicPathDebug && geodesicPathDebugInfo && (
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#445" }}>
                  {geodesicPathDebugInfo}
                </div>
              )}

              <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed #ddd" }}>
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4 }}>Heat method (mesh)</div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: geodesicHeatAvailable ? "pointer" : "not-allowed",
                    color: geodesicHeatAvailable ? "#000" : "#999",
                  }}
                  title={geodesicHeatAvailable ? "" : geodesicHeatUnavailableReason}
                >
                  <input
                    type="checkbox"
                    checked={geodesicHeatEnabled}
                    onChange={onToggleGeodesicHeatEnabled}
                    disabled={!geodesicHeatAvailable}
                    style={{ marginRight: 6 }}
                  />
                  Enable heat path tool
                </label>
                <div style={{ display: "flex", gap: 12 }}>
                  <span>Start: {geodesicHeatStart ? geodesicHeatStart.faceIndex : "-"}</span>
                  <span>End: {geodesicHeatEnd ? geodesicHeatEnd.faceIndex : "-"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={onRunGeodesicHeat}
                    disabled={!geodesicHeatAvailable || geodesicHeatBusy}
                    style={{ padding: "3px 8px" }}
                  >
                    {geodesicHeatBusy ? "Running..." : "Run heat path"}
                  </button>
                  <button
                    type="button"
                    onClick={onClearGeodesicHeat}
                    style={{ padding: "3px 8px" }}
                  >
                    Clear heat
                  </button>
                  {geodesicHeatLength != null && Number.isFinite(geodesicHeatLength) && (
                    <span style={{ fontWeight: 600 }}>Length: {geodesicHeatLength.toFixed(3)}</span>
                  )}
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: geodesicHeatHeatmapAllowed ? "pointer" : "not-allowed",
                    color: geodesicHeatHeatmapAllowed ? "#000" : "#999",
                  }}
                  title={geodesicHeatHeatmapAllowed ? "" : geodesicHeatHeatmapReason}
                >
                  <input
                    type="checkbox"
                    checked={geodesicHeatShowHeatmap}
                    onChange={onToggleGeodesicHeatShowHeatmap}
                    disabled={!geodesicHeatHeatmapAllowed}
                    style={{ marginRight: 6 }}
                  />
                  Show distance heatmap
                </label>
                {(viewerKind === "graph" || viewerKind === "param" || viewerKind === "weierstrass") && (
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 4,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={geodesicHeatUseContinuous}
                      onChange={onToggleGeodesicHeatUseContinuous}
                      style={{ marginRight: 6 }}
                    />
                    Use continuous ODE (graph/param)
                  </label>
                )}
                {geodesicHeatMessage && (
                  <div style={{ color: "#b23b1a" }}>{geodesicHeatMessage}</div>
                )}
              </div>
            </div>
          </details>
          <div style={{ marginLeft: 20, marginTop: 10, fontSize: 12 }}>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={inspectEnabled}
                onChange={onToggleInspectEnabled}
                style={{ marginRight: 6 }}
              />
              Inspect mode
            </label>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
              <button type="button" onClick={onClearInspect} style={{ padding: "4px 8px" }}>
                Clear inspect
              </button>
              <span style={{ fontSize: 11, color: "#666" }}>Shortcut: I / Esc</span>
            </div>
            {inspectIdx != null && inspectPos && inspectNormal && (
              <div
                style={{
                  marginTop: 8,
                  border: "1px solid #d9dde7",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "#f7f8fb",
                  fontSize: 11,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Inspect</div>
                <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: "4px 8px" }}>
                  <div style={{ color: "#556" }}>Idx</div>
                  <div>{inspectIdx}</div>
                  <div style={{ color: "#556" }}>Pos</div>
                  <div>{fmt3(inspectPos)}</div>
                  <div style={{ color: "#556" }}>Normal</div>
                  <div>{fmt3(inspectNormal)}</div>
                  {inspectMetrics?.K != null && (
                    <>
                      <div style={{ color: "#556" }}>K</div>
                      <div>{fmt(inspectMetrics.K)}</div>
                    </>
                  )}
                  {inspectMetrics?.H != null && (
                    <>
                      <div style={{ color: "#556" }}>H</div>
                      <div>{fmt(inspectMetrics.H)}</div>
                    </>
                  )}
                  {inspectMetrics?.k1 != null && (
                    <>
                      <div style={{ color: "#556" }}>k1</div>
                      <div>{fmt(inspectMetrics.k1)}</div>
                    </>
                  )}
                  {inspectMetrics?.k2 != null && (
                    <>
                      <div style={{ color: "#556" }}>k2</div>
                      <div>{fmt(inspectMetrics.k2)}</div>
                    </>
              )}
            </div>
          </div>
        )}
        {(viewerKind === "mesh" || viewerKind === "complex") && (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {viewerKind === "complex"
              ? "Complex map controls live in the left panel."
              : "SurfaceMesh presets and import live in the left panel."}
          </div>
        )}
        </div>
        </div>
        <label style={{ display: "block", cursor: "pointer", marginTop: 2 }}>
          <input type="checkbox" checked={showBoundingBox} onChange={onToggleBoundingBox} style={{ marginRight: 6 }} />
          Show bounding box for domain
        </label>

        <button
          type="button"
          onClick={onResetCamera}
          style={{
            marginTop: 6,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Reset camera view
        </button>
      </div>
      </details>
      </>
      )}

      {/* color mode */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Coloring</div>
        <div style={pillRow}>
          {colorModes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChangeColorMode(m)}
              style={pill(colorMode === m)}
              aria-pressed={colorMode === m}
            >
              {COLOR_MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {showGaussMap && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Gauss map</div>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Color by</div>
          <div style={pillRow}>
            {(["components", "palette"] as GaussColorMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChangeGaussColorMode(m)}
                style={pill(gaussColorMode === m)}
                aria-pressed={gaussColorMode === m}
              >
                {m === "components" ? "Normal RGB" : "Palette (N.z)"}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
            {gaussPointsCount > 0 ? `${gaussPointsCount} normals plotted` : "Waiting for normals..."}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Lighting</div>
        <div style={pillRow}>
          {(["studio", "soft", "contrast", "neutral", "warm"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChangeLightPreset(p)}
              style={pill(lightPreset === p)}
              aria-pressed={lightPreset === p}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Material</div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ minWidth: 80 }}>Roughness</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={materialRoughness}
            onChange={(e) => onSetMaterialRoughness(clamp01(Number(e.target.value)))}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={materialRoughness}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onSetMaterialRoughness(clamp01(v));
            }}
            style={{ width: 70 }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ minWidth: 80 }}>Metalness</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={materialMetalness}
            onChange={(e) => onSetMaterialMetalness(clamp01(Number(e.target.value)))}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={materialMetalness}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onSetMaterialMetalness(clamp01(v));
            }}
            style={{ width: 70 }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ minWidth: 80 }}>Opacity</span>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.01}
            value={materialOpacity}
            onChange={(e) => onSetMaterialOpacity(clamp01(Number(e.target.value)))}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={materialOpacity}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onSetMaterialOpacity(clamp01(v));
            }}
            style={{ width: 70 }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Mesh resolution</div>
        {viewerKind === "graph" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ minWidth: 80 }}>Graph</span>
            <input
              type="range"
              min={20}
              max={160}
              step={1}
              value={graphResolution}
              onChange={(e) => onSetGraphResolution(clampInt(Number(e.target.value), 20, 160))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={20}
              max={200}
              step={1}
              value={graphResolution}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onSetGraphResolution(clampInt(v, 20, 200));
              }}
              style={{ width: 70 }}
            />
          </div>
        )}

        {viewerKind === "implicit" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ minWidth: 80 }}>Implicit</span>
            <input
              type="range"
              min={18}
              max={64}
              step={1}
              value={implicitResolution}
              onChange={(e) => onSetImplicitResolution(clampInt(Number(e.target.value), 18, 64))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={18}
              max={80}
              step={1}
              value={implicitResolution}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onSetImplicitResolution(clampInt(v, 18, 80));
              }}
              style={{ width: 70 }}
            />
          </div>
        )}

        {viewerKind === "param" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ minWidth: 80 }}>Param</span>
            <input
              type="range"
              min={20}
              max={240}
              step={1}
              value={paramResolution}
              onChange={(e) => onSetParamResolution(clampInt(Number(e.target.value), 20, 240))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={20}
              max={240}
              step={1}
              value={paramResolution}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onSetParamResolution(clampInt(v, 20, 240));
              }}
              style={{ width: 70 }}
            />
          </div>
        )}
        {viewerKind === "weierstrass" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ minWidth: 80 }}>Weierstrass</span>
            <input
              type="range"
              min={40}
              max={200}
              step={1}
              value={weierstrassResolution}
              onChange={(e) => onChangeWeierstrassResolution(clampInt(Number(e.target.value), 40, 200))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={40}
              max={200}
              step={1}
              value={weierstrassResolution}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onChangeWeierstrassResolution(clampInt(v, 40, 200));
              }}
              style={{ width: 70 }}
            />
          </div>
        )}
      </div>

      {viewerKind === "implicit" && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Implicit overlays</div>
          <div style={pillRow}>
            {(["none", "normals", "curvature"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChangeImplicitOverlay(m)}
                style={pill(implicitOverlay === m)}
                aria-pressed={implicitOverlay === m}
              >
                {m}
              </button>
            ))}
          </div>
          <div style={styles.hint}>Normals use f(x,y,z) gradients; curvature colors the implicit mesh.</div>
        </div>
      )}

      {/* palette */}
      <div style={{ marginBottom: 10 }}>
  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Palette</div>

  <div style={pillRow}>
    {(["blueRed", "rainbow", "grayscale", "redYellow"] as const).map((p) => (
      <button
        key={p}
        type="button"
        onClick={() => onChangeColorPalette(p)}
        style={pill(colorPalette === p)}
        aria-pressed={colorPalette === p}
      >
        {p === "blueRed" ? "blue–red" : p === "redYellow" ? "red–yellow" : p}
      </button>
    ))}
  </div>
</div>

      {isEqViewer && <p style={styles.hint}>{eqMeta.note}</p>}
      {viewerKind === "param" && <p style={styles.hint}>{paramMeta.note}</p>}
      {viewerKind === "weierstrass" && <p style={styles.hint}>{WEIERSTRASS_META.note}</p>}

      {/* custom graph formula */}
      {isGraphCustom && (
        <div style={{ marginTop: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: "block" }}>Custom formula z =</label>
          <input
            type="text"
            value={graphExpr}
            onChange={(e) => onChangeGraphExpr(e.target.value)}
            placeholder="e.g. x*x - y*y, Math.sin(x)*Math.cos(y)"
            style={{
              width: "100%",
              marginTop: 4,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
          <p style={styles.hint}>
            Use <code>x</code>, <code>y</code> and <code>Math.*</code>.
          </p>
        </div>
      )}

      {/* contours for graph + implicit */}
      {(isGraphAny || isImplicitAny) && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Contours (level sets)</div>
          {isImplicitAny && (
            <div style={styles.hint}>Implicit contours are intersections with horizontal planes (y = const).</div>
          )}

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={showContours} onChange={onToggleContours} />
            Show contour lines
          </label>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
            <span style={{ minWidth: 52 }}>Levels</span>
            <input
              type="range"
              min={3}
              max={30}
              value={contourCount}
              onChange={(e) => onSetContourCount(parseInt(e.target.value, 10))}
              disabled={!showContours}
              style={{ flex: 1 }}
            />
            <span style={{ width: 28, textAlign: "right", opacity: showContours ? 1 : 0.5 }}>{contourCount}</span>
          </div>
        </div>
      )}

      {/* custom implicit */}
      {isImplicitCustom && (
        <div style={{ marginTop: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: "block" }}>Implicit function f(x, y, z) =</label>
          <input
            type="text"
            value={implicitExpr}
            onChange={(e) => onChangeImplicitExpr(e.target.value)}
            placeholder="e.g. x*x + y*y + z*z - 1"
            style={{
              width: "100%",
              marginTop: 4,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Load implicit preset</div>
            <div style={pillRow}>
              {IMPLICIT_EXPR_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChangeImplicitExpr(p.expr)}
                  style={pill(implicitExprTrimmed === p.expr)}
                  aria-pressed={implicitExprTrimmed === p.expr}
                  title={p.expr}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {viewerKind === "weierstrass" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Weierstrass data</div>
          <div style={styles.hint}>z = u + i v. Expressions use z (complex), u, v, i, pi, e.</div>

          <label style={{ fontSize: 12 }}>g(z) =</label>
          <input
            type="text"
            value={weierstrassGExpr}
            onChange={(e) => onChangeWeierstrassGExpr(e.target.value)}
            style={{
              width: "100%",
              marginTop: 2,
              marginBottom: 6,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />

          <label style={{ fontSize: 12 }}>phi(z) =</label>
          <input
            type="text"
            value={weierstrassPhiExpr}
            onChange={(e) => onChangeWeierstrassPhiExpr(e.target.value)}
            style={{
              width: "100%",
              marginTop: 2,
              marginBottom: 6,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />

          {weierstrassError && (
            <div style={{ fontSize: 11, color: "#b42318", marginBottom: 6 }}>
              {weierstrassError}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
            <label style={{ fontSize: 11 }}>
              u min
              <input
                type="number"
                step={0.1}
                value={safeWeierstrassDomain.uMin}
                onChange={(e) =>
                  onChangeWeierstrassDomain({ ...safeWeierstrassDomain, uMin: Number(e.target.value) })
                }
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 11 }}>
              u max
              <input
                type="number"
                step={0.1}
                value={safeWeierstrassDomain.uMax}
                onChange={(e) =>
                  onChangeWeierstrassDomain({ ...safeWeierstrassDomain, uMax: Number(e.target.value) })
                }
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 11 }}>
              v min
              <input
                type="number"
                step={0.1}
                value={safeWeierstrassDomain.vMin}
                onChange={(e) =>
                  onChangeWeierstrassDomain({ ...safeWeierstrassDomain, vMin: Number(e.target.value) })
                }
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 11 }}>
              v max
              <input
                type="number"
                step={0.1}
                value={safeWeierstrassDomain.vMax}
                onChange={(e) =>
                  onChangeWeierstrassDomain({ ...safeWeierstrassDomain, vMax: Number(e.target.value) })
                }
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 8 }}>
            <input type="checkbox" checked={weierstrassRecenter} onChange={onToggleWeierstrassRecenter} />
            Recenter / Rescale
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={onResetWeierstrass} style={{ padding: "4px 8px" }}>
              Reset defaults
            </button>
          </div>

          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #e0e0e0",
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Diagnostics</span>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: diagStatusColor,
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>
                Status: {diagStatusLabel}
              </span>
            </div>
            {weierstrassDiagnosticError ? (
              <div style={{ fontSize: 11, color: "#b42318", marginBottom: 6 }}>{weierstrassDiagnosticError}</div>
            ) : (
              <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>
                Path-independence is checked by integrating Φ(z) along the UV box boundary. The status
                follows the thresholds: green &lt; 1e-3, yellow 1e-3..1e-2, red &gt; 1e-2.
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>Path drift (rectangle loop):</span>
              <span style={{ fontFamily: "monospace" }}>
                {diagSuccess ? fmt(diagSuccess.drift) : "-"}
              </span>
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              dx, dy, dz drift vector:{" "}
              <span style={{ fontFamily: "monospace" }}>
                {diagSuccess ? fmt3(diagSuccess.driftVec) : "(-)"}
              </span>
            </div>
            {weierstrassPathDisagreement && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6 }}>
                <span>Path disagreement:</span>
                <span style={{ fontFamily: "monospace" }}>
                  avg {fmt(weierstrassPathDisagreement.avg)}, max {fmt(weierstrassPathDisagreement.max)}
                </span>
              </div>
            )}
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={showDriftArrow} onChange={onToggleDriftArrow} />
                Show drift vector arrow
              </label>
              <button type="button" onClick={onRecomputeDiagnostics} style={{ padding: "4px 8px" }}>
                Recompute diagnostics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* custom param */}
      {isParamCustom && (
        <div style={{ marginTop: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: "block" }}>Custom σ(u,v)</label>
          <p style={styles.hint}>
            Enter three expressions in <code>u</code>, <code>v</code>. Use <code>Math.*</code>.
          </p>

          <label style={{ fontSize: 12 }}>x(u,v) =</label>
          <input
            type="text"
            value={paramXExpr}
            onChange={(e) => onChangeParamXExpr(e.target.value)}
            style={{
              width: "100%",
              marginTop: 2,
              marginBottom: 6,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />

          <label style={{ fontSize: 12 }}>y(u,v) =</label>
          <input
            type="text"
            value={paramYExpr}
            onChange={(e) => onChangeParamYExpr(e.target.value)}
            style={{
              width: "100%",
              marginTop: 2,
              marginBottom: 6,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />

          <label style={{ fontSize: 12 }}>z(u,v) =</label>
          <input
            type="text"
            value={paramZExpr}
            onChange={(e) => onChangeParamZExpr(e.target.value)}
            style={{
              width: "100%",
              marginTop: 2,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
        </div>
      )}
      </div>

      <div style={{ display: leftTab === "theory" ? "block" : "none" }}>
        <h3 style={styles.h3}>{activeMeta.label} theory</h3>
        <p style={styles.hint}>Curvature, gradients, and vectors from the latest probe.</p>

        {!probeInfo ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Enable <b>Probe mode</b> and click the surface to populate details.
          </div>
        ) : (
          <>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Probe</div>
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                <b>p</b> = <span style={{ fontFamily: "monospace" }}>{fmt3(probeInfo.point)}</span>
              </div>
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                <b>n</b> = <span style={{ fontFamily: "monospace" }}>{fmt3(probeInfo.normal)}</span>
              </div>
              {probeInfo.xy && (
                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  <b>x,y</b> ={" "}
                  <span style={{ fontFamily: "monospace" }}>
                    ({fmt(probeInfo.xy.x)}, {fmt(probeInfo.xy.y)})
                  </span>
                </div>
              )}
              {probeInfo.uv && (
                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  <b>u,v</b> ={" "}
                  <span style={{ fontFamily: "monospace" }}>
                    ({fmt(probeInfo.uv.u)}, {fmt(probeInfo.uv.v)})
                  </span>
                </div>
              )}
            </div>

            {probeCurv && isGraphAny ? (
              <>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Principal curvatures</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
                    k1 = {fmt(probeCurv.k1)}
                    <br />
                    k2 = {fmt(probeCurv.k2)}
                    <br />
                    H = {fmt(probeCurv.H)}
                    <br />
                    K = {fmt(probeCurv.K)}
                  </div>
                </div>
                {(() => {
                  const xu = { x: 1, y: probeCurv.fx, z: 0 };
                  const xv = { x: 0, y: probeCurv.fy, z: 1 };
                  const e1 = vNormalize(xu);
                  const proj = vScale(e1, vDot(xv, e1));
                  const e2 = vNormalize(vSub(xv, proj));
                  const nFromXuXv = vNormalize(vCross(xu, xv));

                  return (
                    <>
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Tangent basis (world)</div>
                        <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
                          Xu = {fmt3(xu)}
                          <br />
                          Xv = {fmt3(xv)}
                        </div>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Orthonormal basis (world)</div>
                        <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
                          e1 = {fmt3(e1)}
                          <br />
                          e2 = {fmt3(e2)}
                        </div>
                      </div>

                      <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Normal from Xu x Xv</div>
                        <div style={{ fontFamily: "monospace", fontSize: 12 }}>
                          n = {fmt3(nFromXuXv)}
                        </div>
                      </div>
                    </>
                  );
                })()}

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Derivatives</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
                    fx = {fmt(probeCurv.fx)}{"  "}fy = {fmt(probeCurv.fy)}
                    <br />
                    fxx = {fmt(probeCurv.fxx)}{"  "}fyy = {fmt(probeCurv.fyy)}{"  "}fxy = {fmt(probeCurv.fxy)}
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Gradient</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12 }}>
                    grad f = ({fmt(probeCurv.fx)}, {fmt(probeCurv.fy)})
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Curvature / invariants</div>
                  <pre
                    style={{
                      marginTop: 6,
                      marginBottom: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontSize: 11,
                      background: "#fafafa",
                      border: "1px solid #eee",
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    {JSON.stringify(probeCurv, null, 2)}
                  </pre>
                </div>
              </>
            ) : (viewerKind === "param" || viewerKind === "weierstrass") && paramProbeCurv ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Principal curvatures</div>
                <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
                  k1 = {fmt(paramProbeCurv.k1)}
                  <br />
                  k2 = {fmt(paramProbeCurv.k2)}
                  <br />
                  H = {fmt(paramProbeCurv.H)}
                  <br />
                  K = {fmt(paramProbeCurv.K)}
                </div>
                {paramProbeCurv.isUmbilic && (
                  <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
                    Umbilic point: principal directions are unstable.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 11, opacity: 0.75 }}>
                {viewerKind === "param" || viewerKind === "weierstrass"
                  ? "Principal curvature data unavailable for this probe."
                  : "Curvature details currently compute only for graph surfaces."}
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Command prompt</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="text"
              value={commandInput}
              onChange={(e) => onChangeCommandInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRunCommand(commandInput);
              }}
              placeholder='Try: surface graph graph_ripple'
              style={{
                flex: 1,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #ccc",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            />
            <button
              type="button"
              onClick={() => onRunCommand(commandInput)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Run
            </button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
            Examples: <code>help</code>, <code>colorMode gaussian</code>, <code>probe at 0.4 -0.2</code>, <code>expr graph "sin(x)+cos(y)"</code>
          </div>

          {commandHistory.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {commandHistory.slice(0, 4).map((h, i) => (
                <div
                  key={`${h.cmd}-${i}`}
                  style={{
                    background: "#fafafa",
                    border: "1px solid #eee",
                    borderRadius: 8,
                    padding: "6px 8px",
                    fontSize: 11,
                  }}
                >
                  <div style={{ fontFamily: "monospace", marginBottom: 4 }}>&gt; {h.cmd}</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{h.out}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Theory notes</div>
          <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5 }}>
            <div>Graph parametrization: X(u,v) = (u, f(u,v), v) in world coordinates.</div>
            <div>Tangents: Xu = (1, fx, 0), Xv = (0, fy, 1).</div>
            <div>First fundamental form: E = dot(Xu, Xu), F = dot(Xu, Xv), G = dot(Xv, Xv).</div>
            <div>Second fundamental form: e = dot(n, Xuu), f = dot(n, Xuv), g = dot(n, Xvv).</div>
            <div>Curvatures: K = (eg - f^2)/(EG - F^2), H = (Eg - 2Ff + Ge)/(2(EG - F^2)).</div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ---------------- Right Panel (domain previews) ---------------- */

type SurfacesRightPanelProps = {
  viewerKind: SurfaceViewerKind;
  surfaceId: SurfaceId;
  paramId: ParamSurfaceId;
  surfaceMeshLabel: string;
  surfaceMeshStats: { vertCount: number; triCount: number } | null;
  surfaceMeshSource: SurfaceMeshSource | null;

  onPickEqSurface: (id: SurfaceId) => void;
  onPickParamSurface: (id: ParamSurfaceId) => void;

  implicitExpr: string;
  onChangeImplicitExpr: (s: string) => void;
  implicitResolution: number;
  vtkPreviewBusy: boolean;
  vtkPreviewError: string | null;
  vtkPreviewTargetFaces: number;
  vtkPreviewUseDecimate: boolean;
  onChangeVtkPreviewTargetFaces: (v: number) => void;
  onChangeVtkPreviewUseDecimate: (v: boolean) => void;
  onRunVtkPreview: () => void;
  cgalHealthState: CgalHealthState | null;
  cgalBusy: boolean;
  cgalError: string | null;
  cgalTargetEdge: number;
  onChangeCgalTargetEdge: (v: number) => void;
  cgalAutoTargetEdge: boolean;
  onChangeCgalAutoTargetEdge: (v: boolean) => void;
  cgalPadFrac: number;
  onChangeCgalPadFrac: (v: number) => void;
  cgalTriBudgetEnabled: boolean;
  onChangeCgalTriBudgetEnabled: (v: boolean) => void;
  cgalTriBudget: number;
  onChangeCgalTriBudget: (v: number) => void;
  cgalAutoEdge: number;
  cgalTriBudgetEdge: number;
  cgalRadiusBound: number;
  onChangeCgalRadiusBound: (v: number) => void;
  cgalMinTrisEnabled: boolean;
  onChangeCgalMinTrisEnabled: (v: boolean) => void;
  cgalMinTris: number;
  onChangeCgalMinTris: (v: number) => void;
  cgalDomainDiag: number;
  cgalEffectiveEdge: number;
  cgalEstimatedTris: number;
  cgalTooHeavy: boolean;
  cgalVerbose: boolean;
  onChangeCgalVerbose: (v: boolean) => void;
  cgalPreflightSamples: number;
  onChangeCgalPreflightSamples: (v: number) => void;
  onRunCgalMesh: () => void;
  onStopCgalWorker: () => void;
  cgalMeshInfo: { vertexCount: number; triCount: number } | null;

  probeInfo: ProbeInfo | null;

  onPickDomainUV: (uv: { u: number; v: number }) => void;
  onPickDomainXY: (xy: { x: number; y: number }) => void;
  onPickDomainXYZ: (xyz: { x: number; y: number; z: number }) => void;

  graphDomain: GraphDomain;
  onChangeGraphDomain: (d: GraphDomain) => void;
  paramDomain: ParamDomain;
  onChangeParamDomain: (d: ParamDomain) => void;
  implicitDomain: ImplicitDomain;
  onChangeImplicitDomain: (d: ImplicitDomain) => void;

  graphDomainPresets: GraphDomainPreset[];
  paramDomainPresets: ParamDomainPreset[];
  implicitDomainPresets: ImplicitDomainPreset[];
  onSaveGraphDomainPreset: (label: string) => void;
  onSaveParamDomainPreset: (label: string) => void;
  onSaveImplicitDomainPreset: (label: string) => void;
  onApplyGraphDomainPreset: (id: string) => void;
  onApplyParamDomainPreset: (id: string) => void;
  onApplyImplicitDomainPreset: (id: string) => void;
  onRemoveGraphDomainPreset: (id: string) => void;
  onRemoveParamDomainPreset: (id: string) => void;
  onRemoveImplicitDomainPreset: (id: string) => void;
};

const SurfacesRightPanel: React.FC<SurfacesRightPanelProps> = ({
  viewerKind,
  surfaceId,
  paramId,
  surfaceMeshLabel,
  surfaceMeshStats,
  surfaceMeshSource,
  onPickEqSurface,
  onPickParamSurface,
  implicitExpr,
  onChangeImplicitExpr,
  implicitResolution,
  vtkPreviewBusy,
  vtkPreviewError,
  vtkPreviewTargetFaces,
  vtkPreviewUseDecimate,
  onChangeVtkPreviewTargetFaces,
  onChangeVtkPreviewUseDecimate,
  onRunVtkPreview,
  cgalHealthState,
  cgalBusy,
  cgalError,
  cgalTargetEdge,
  onChangeCgalTargetEdge,
  cgalAutoTargetEdge,
  onChangeCgalAutoTargetEdge,
  cgalPadFrac,
  onChangeCgalPadFrac,
  cgalTriBudgetEnabled,
  onChangeCgalTriBudgetEnabled,
  cgalTriBudget,
  onChangeCgalTriBudget,
  cgalAutoEdge,
  cgalTriBudgetEdge,
  cgalRadiusBound,
  onChangeCgalRadiusBound,
  cgalMinTrisEnabled,
  onChangeCgalMinTrisEnabled,
  cgalMinTris,
  onChangeCgalMinTris,
  cgalDomainDiag,
  cgalEffectiveEdge,
  cgalEstimatedTris,
  cgalTooHeavy,
  cgalVerbose,
  onChangeCgalVerbose,
  cgalPreflightSamples,
  onChangeCgalPreflightSamples,
  onRunCgalMesh,
  onStopCgalWorker,
  cgalMeshInfo,
  probeInfo,
  onPickDomainUV,
  onPickDomainXY,
  onPickDomainXYZ,
  graphDomain,
  onChangeGraphDomain,
  paramDomain,
  onChangeParamDomain,
  implicitDomain,
  onChangeImplicitDomain,
  graphDomainPresets,
  paramDomainPresets,
  implicitDomainPresets,
  onSaveGraphDomainPreset,
  onSaveParamDomainPreset,
  onSaveImplicitDomainPreset,
  onApplyGraphDomainPreset,
  onApplyParamDomainPreset,
  onApplyImplicitDomainPreset,
  onRemoveGraphDomainPreset,
  onRemoveParamDomainPreset,
  onRemoveImplicitDomainPreset,
}) => {
  const eqMeta = SURFACES_EQ_META.find((m) => m.id === surfaceId) ?? SURFACES_EQ_META[0];
  const paramMeta = PARAM_SURFACES_META.find((m) => m.id === paramId) ?? PARAM_SURFACES_META[0];

  const isImplicitCustom = viewerKind === "implicit" && surfaceId === "implicit_custom";
  const isWeierstrass = viewerKind === "weierstrass";
  const isMeshViewer = viewerKind === "mesh" || viewerKind === "complex";
  const isGraphViewer = viewerKind === "graph";
  const isParamViewer = viewerKind === "param" || isWeierstrass;
  const isImplicitViewer = viewerKind === "implicit";
  const isEqViewer = isGraphViewer || isImplicitViewer;
  const showDomainPicker = isGraphViewer || isParamViewer || isImplicitViewer;
  const cgalReady = !!cgalHealthState?.ok;
  const cgalStatusText = cgalHealthState ? (cgalHealthState.ok ? "available" : "unavailable") : "checking...";
  const cgalStatusColor = cgalHealthState ? (cgalHealthState.ok ? "#1f894f" : "#b42318") : "#777";
  const cgalDisabled = cgalBusy || cgalHealthState?.ok === false;
  const cgalStopDisabled = !cgalHealthState && !cgalBusy;
  const cgalTargetEdgeLocked = cgalDisabled || cgalAutoTargetEdge || cgalTriBudgetEnabled;
  const vtkPreviewDisabled = vtkPreviewBusy || cgalBusy;
  const vtkPreviewResolution = Math.max(8, Math.min(220, Math.round(implicitResolution)));
  const fmtTriEstimate = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return "0";
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    return `${Math.round(value)}`;
  };

  const [graphDomainLabel, setGraphDomainLabel] = useState("");
  const [implicitDomainLabel, setImplicitDomainLabel] = useState("");
  const [paramDomainLabel, setParamDomainLabel] = useState("");

  const paramDefaults = isWeierstrass ? WEIERSTRASS_DEFAULTS.domain : getParamDomainPreviewBounds(paramId);
  const safeGraphDomain = normalizeGraphDomain(graphDomain, getDefaultGraphSpan(surfaceId));
  const safeParamDomain = normalizeParamDomain(paramDomain, paramDefaults);
  const safeImplicitDomain = normalizeImplicitDomain(implicitDomain, getDefaultImplicitDomain(surfaceId));
  const meshMeta = {
    label: surfaceMeshLabel,
    formula: "Triangle surface mesh",
    note: "Imported or generated triangle mesh.",
  };
  const activeMeta = isMeshViewer
    ? meshMeta
    : isWeierstrass
      ? WEIERSTRASS_META
      : isParamViewer
        ? paramMeta
        : eqMeta;


  return (
    <section>
      <h2 style={styles.h2}>Inspector</h2>

      {/* What you are looking at */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Active surface</div>
        <div style={{ fontWeight: 700, marginTop: 2 }}>{activeMeta.label}</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          {activeMeta.formula}
        </div>
        {isMeshViewer && surfaceMeshStats && (
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
            {surfaceMeshStats.vertCount.toLocaleString()} verts · {surfaceMeshStats.triCount.toLocaleString()} tris
            {surfaceMeshSource ? ` · ${surfaceMeshSource}` : ""}
          </div>
        )}
      </div>

      {/* Domain picker */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Pick a domain point</div>

        {!showDomainPicker ? (
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            {isMeshViewer
              ? "Domain picking is not used for SurfaceMesh. Use probe mode to pick points on the mesh."
              : "Domain picking is available for graph, param, and Weierstrass surfaces. Use probe mode to pick points on implicit surfaces."}
          </div>
        ) : isParamViewer ? (
          <>
            <ParamDomainPreview
              width={260}
              height={220}
              uMin={safeParamDomain.uMin}
              uMax={safeParamDomain.uMax}
              vMin={safeParamDomain.vMin}
              vMax={safeParamDomain.vMax}
              onPick={onPickDomainUV}
              picked={probeInfo?.uv ?? null}
            />
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
              Click to send (u,v) into the {isWeierstrass ? "Weierstrass" : "param"} surface viewer.
            </div>
          </>
        ) : isGraphViewer ? (
          <>
            <XYDomainPreview
              width={260}
              height={220}
              xSpan={safeGraphDomain.xSpan}
              ySpan={safeGraphDomain.ySpan}
              onPick={onPickDomainXY}
              picked={probeInfo?.xy ?? null}
            />
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
              Click to send (x,y) into the graph/implicit viewer.
            </div>
          </>
        ) : (
          <>
            <XYDomainPreview
              width={260}
              height={220}
              xSpan={safeImplicitDomain.xSpan}
              ySpan={safeImplicitDomain.ySpan}
              onPick={(xy) => onPickDomainXYZ({ x: xy.x, y: xy.y, z: 0 })}
              picked={probeInfo?.point ? { x: probeInfo.point.x, y: probeInfo.point.y } : null}
            />
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
              Click to send (x,y, z=0) into the implicit viewer.
            </div>
          </>
        )}
      </div>

      {(showDomainPicker || isImplicitViewer) && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Domain bounds</div>
          {isGraphViewer && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 11 }}>
                  x span
                  <input
                    type="number"
                    min={0.2}
                    step={0.1}
                    value={safeGraphDomain.xSpan}
                    onChange={(e) =>
                      onChangeGraphDomain({
                        ...safeGraphDomain,
                        xSpan: Math.max(0.2, Number(e.target.value)),
                      })
                    }
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  y span
                  <input
                    type="number"
                    min={0.2}
                    step={0.1}
                    value={safeGraphDomain.ySpan}
                    onChange={(e) =>
                      onChangeGraphDomain({
                        ...safeGraphDomain,
                        ySpan: Math.max(0.2, Number(e.target.value)),
                      })
                    }
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                    onClick={() => onChangeGraphDomain(getDefaultGraphSpan(surfaceId))}
                    style={{ padding: "4px 8px" }}
                  >
                  Reset
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Saved domains</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text"
                    placeholder="Label (optional)"
                    value={graphDomainLabel}
                    onChange={(e) => setGraphDomainLabel(e.target.value)}
                    style={{ flex: 1, padding: "4px 6px", fontSize: 12 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onSaveGraphDomainPreset(graphDomainLabel);
                      setGraphDomainLabel("");
                    }}
                    style={{ padding: "4px 8px" }}
                  >
                    Save
                  </button>
                </div>
                {graphDomainPresets.filter((p) => p.surfaceId === surfaceId).length === 0 ? (
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>No saved domains yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {graphDomainPresets
                      .filter((p) => p.surfaceId === surfaceId)
                      .map((p) => (
                        <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button type="button" onClick={() => onApplyGraphDomainPreset(p.id)} style={{ flex: 1, padding: "4px 8px" }}>
                            {p.label}
                          </button>
                          <button type="button" onClick={() => onRemoveGraphDomainPreset(p.id)} style={{ padding: "4px 8px" }}>
                            Remove
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}
          {isParamViewer && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 11 }}>
                  u min
                  <input
                    type="number"
                    step={0.1}
                    value={safeParamDomain.uMin}
                    onChange={(e) => onChangeParamDomain({ ...safeParamDomain, uMin: Number(e.target.value) })}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  u max
                  <input
                    type="number"
                    step={0.1}
                    value={safeParamDomain.uMax}
                    onChange={(e) => onChangeParamDomain({ ...safeParamDomain, uMax: Number(e.target.value) })}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  v min
                  <input
                    type="number"
                    step={0.1}
                    value={safeParamDomain.vMin}
                    onChange={(e) => onChangeParamDomain({ ...safeParamDomain, vMin: Number(e.target.value) })}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  v max
                  <input
                    type="number"
                    step={0.1}
                    value={safeParamDomain.vMax}
                    onChange={(e) => onChangeParamDomain({ ...safeParamDomain, vMax: Number(e.target.value) })}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => onChangeParamDomain({ ...paramDefaults })}
                  style={{ padding: "4px 8px" }}
                >
                  Reset
                </button>
              </div>
              {viewerKind === "param" && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Saved domains</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      placeholder="Label (optional)"
                      value={paramDomainLabel}
                      onChange={(e) => setParamDomainLabel(e.target.value)}
                      style={{ flex: 1, padding: "4px 6px", fontSize: 12 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onSaveParamDomainPreset(paramDomainLabel);
                        setParamDomainLabel("");
                      }}
                      style={{ padding: "4px 8px" }}
                    >
                      Save
                    </button>
                  </div>
                  {paramDomainPresets.filter((p) => p.surfaceId === paramId).length === 0 ? (
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>No saved domains yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                      {paramDomainPresets
                        .filter((p) => p.surfaceId === paramId)
                        .map((p) => (
                          <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <button type="button" onClick={() => onApplyParamDomainPreset(p.id)} style={{ flex: 1, padding: "4px 8px" }}>
                              {p.label}
                            </button>
                            <button type="button" onClick={() => onRemoveParamDomainPreset(p.id)} style={{ padding: "4px 8px" }}>
                              Remove
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {isImplicitViewer && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                <label style={{ fontSize: 11 }}>
                  x span
                  <input
                    type="number"
                    min={0.2}
                    step={0.1}
                    value={safeImplicitDomain.xSpan}
                    onChange={(e) =>
                      onChangeImplicitDomain({
                        ...safeImplicitDomain,
                        xSpan: Math.max(0.2, Number(e.target.value)),
                      })
                    }
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  y span
                  <input
                    type="number"
                    min={0.2}
                    step={0.1}
                    value={safeImplicitDomain.ySpan}
                    onChange={(e) =>
                      onChangeImplicitDomain({
                        ...safeImplicitDomain,
                        ySpan: Math.max(0.2, Number(e.target.value)),
                      })
                    }
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => onChangeImplicitDomain(getDefaultImplicitDomain(surfaceId))}
                  style={{ padding: "4px 8px" }}
                >
                  Reset
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Saved domains</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text"
                    placeholder="Label (optional)"
                    value={implicitDomainLabel}
                    onChange={(e) => setImplicitDomainLabel(e.target.value)}
                    style={{ flex: 1, padding: "4px 6px", fontSize: 12 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onSaveImplicitDomainPreset(implicitDomainLabel);
                      setImplicitDomainLabel("");
                    }}
                    style={{ padding: "4px 8px" }}
                  >
                    Save
                  </button>
                </div>
                {implicitDomainPresets.filter((p) => p.surfaceId === surfaceId).length === 0 ? (
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>No saved domains yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {implicitDomainPresets
                      .filter((p) => p.surfaceId === surfaceId)
                      .map((p) => (
                        <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button type="button" onClick={() => onApplyImplicitDomainPreset(p.id)} style={{ flex: 1, padding: "4px 8px" }}>
                            {p.label}
                          </button>
                          <button type="button" onClick={() => onRemoveImplicitDomainPreset(p.id)} style={{ padding: "4px 8px" }}>
                            Remove
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
                Affects the sampling box for marching-cubes implicit surfaces (z uses the larger span).
              </div>
            </>
          )}
        </div>
      )}

      {/* Custom implicit editor (optional, but handy) */}
      {isImplicitCustom && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Implicit formula</div>
          <input
            type="text"
            value={implicitExpr}
            onChange={(e) => onChangeImplicitExpr(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 12,
              boxSizing: "border-box",
            }}
          />
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
              Use <code>x</code>, <code>y</code>, <code>z</code> and <code>Math.*</code>.
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600 }}>Preview (VTK)</div>
                <div style={{ fontSize: 11, color: vtkPreviewBusy ? "#b42318" : "#556" }}>
                  {vtkPreviewBusy ? "running..." : "fast grid"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => void onRunVtkPreview()}
                  disabled={vtkPreviewDisabled}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid #d0d5dd",
                    background: vtkPreviewDisabled ? "#f3f4f6" : "#fff",
                    cursor: vtkPreviewDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  {vtkPreviewBusy ? "preview..." : "preview (VTK)"}
                </button>
                <span style={{ fontSize: 11, color: "#556" }}>res {vtkPreviewResolution}^3</span>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#556" }}>
                  <input
                    type="checkbox"
                    checked={vtkPreviewUseDecimate}
                    disabled={vtkPreviewDisabled}
                    onChange={(e) => onChangeVtkPreviewUseDecimate(e.target.checked)}
                  />
                  decimate
                </label>
                <input
                  type="number"
                  min={200}
                  max={500000}
                  step={100}
                  value={Math.min(500000, Math.max(200, Math.round(vtkPreviewTargetFaces)))}
                  disabled={!vtkPreviewUseDecimate || vtkPreviewDisabled}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChangeVtkPreviewTargetFaces(Math.min(500000, Math.max(200, v)));
                  }}
                  style={{ width: 110 }}
                />
                <span style={{ fontSize: 11, color: "#556" }}>faces</span>
              </div>
              {vtkPreviewError && <div style={{ fontSize: 11, color: "#b42318" }}>{vtkPreviewError}</div>}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600 }}>Robust meshing (CGAL)</div>
                <div style={{ fontSize: 11, color: cgalStatusColor }}>{cgalStatusText}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 11, color: "#556" }}>target edge</label>
                <input
                  type="number"
                  min={0.0001}
                  step={0.01}
                  value={cgalTargetEdge}
                  disabled={cgalTargetEdgeLocked}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChangeCgalTargetEdge(Math.max(0.0001, v));
                  }}
                  style={{ width: 90 }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#556" }}>
                  <input
                    type="checkbox"
                    checked={cgalAutoTargetEdge}
                    disabled={cgalDisabled || cgalTriBudgetEnabled}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      onChangeCgalAutoTargetEdge(checked);
                      if (checked) onChangeCgalTriBudgetEnabled(false);
                    }}
                  />
                  auto (2% diag)
                </label>
                {cgalAutoTargetEdge && (
                  <span style={{ fontSize: 11, color: "#556" }}>edge {fmt(cgalAutoEdge)}</span>
                )}
                <label style={{ fontSize: 11, color: "#556" }}>pad %</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={Number.isFinite(cgalPadFrac) ? (cgalPadFrac * 100).toFixed(1) : "5.0"}
                  disabled={cgalDisabled}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChangeCgalPadFrac(Math.min(0.5, Math.max(0, v / 100)));
                  }}
                  style={{ width: 70 }}
                />
                <button
                  type="button"
                  onClick={() => void onRunCgalMesh()}
                  disabled={cgalDisabled}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid #d0d5dd",
                    background: cgalDisabled ? "#f3f4f6" : "#fff",
                    cursor: cgalDisabled ? "not-allowed" : "pointer",
                  }}
                  title={
                    cgalTooHeavy
                      ? "Estimated mesh too heavy. Increase target edge or enable auto/tri budget."
                      : cgalReady
                        ? ""
                        : cgalHealthState?.error ?? "CGAL not available"
                  }
                >
                  {cgalBusy ? "meshing..." : "gcalc (CGAL)"}
                </button>
                <button
                  type="button"
                  onClick={() => void onStopCgalWorker()}
                  disabled={cgalStopDisabled}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid #f04438",
                    background: cgalStopDisabled ? "#f3f4f6" : "#fff",
                    color: cgalStopDisabled ? "#999" : "#b42318",
                    cursor: cgalStopDisabled ? "not-allowed" : "pointer",
                  }}
                  title={cgalStopDisabled ? "CGAL worker not running" : "Stop CGAL worker"}
                >
                  stop
                </button>
              </div>
              <div style={{ fontSize: 11, color: cgalTooHeavy ? "#b42318" : "#556" }}>
                est tris ~{fmtTriEstimate(cgalEstimatedTris)} @ edge {fmt(cgalEffectiveEdge)}
              </div>
              {cgalTooHeavy && (
                <div style={{ fontSize: 11, color: "#b42318" }}>
                  Estimated mesh is huge. Increase target edge or enable auto/tri budget.
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#556" }}>
                  <input
                    type="checkbox"
                    checked={cgalVerbose}
                    disabled={cgalDisabled}
                    onChange={(e) => onChangeCgalVerbose(e.target.checked)}
                  />
                  verbose (CGAL)
                </label>
                <label style={{ fontSize: 11, color: "#556" }}>preflight samples</label>
                <input
                  type="number"
                  min={3}
                  max={40}
                  step={1}
                  value={Math.max(3, Math.min(40, Math.round(cgalPreflightSamples)))}
                  disabled={cgalDisabled}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChangeCgalPreflightSamples(Math.max(3, Math.min(40, Math.round(v))));
                  }}
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 11, color: "#556" }}>per axis</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#556" }}>
                  <input
                    type="checkbox"
                    checked={cgalTriBudgetEnabled}
                    disabled={cgalDisabled}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      onChangeCgalTriBudgetEnabled(checked);
                      if (checked) onChangeCgalAutoTargetEdge(false);
                    }}
                  />
                  tri budget
                </label>
                <input
                  type="range"
                  min={200}
                  max={1000000}
                  step={200}
                  value={Math.min(1000000, Math.max(200, Math.round(cgalTriBudget)))}
                  disabled={cgalDisabled || !cgalTriBudgetEnabled}
                  onChange={(e) => onChangeCgalTriBudget(Math.min(1000000, Math.max(200, Number(e.target.value))))}
                  style={{ width: 160 }}
                />
                <input
                  type="number"
                  min={200}
                  max={1000000}
                  step={200}
                  value={Math.min(1000000, Math.max(200, Math.round(cgalTriBudget)))}
                  disabled={cgalDisabled || !cgalTriBudgetEnabled}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChangeCgalTriBudget(Math.min(1000000, Math.max(200, v)));
                  }}
                  style={{ width: 90 }}
                />
                {cgalTriBudgetEnabled && (
                  <span style={{ fontSize: 11, color: "#556" }}>edge {fmt(cgalTriBudgetEdge)}</span>
                )}
                <label style={{ fontSize: 11, color: "#556" }}>radius bound</label>
                <input
                  type="range"
                  min={0.001}
                  max={1}
                  step={0.001}
                  value={Number.isFinite(cgalRadiusBound) ? cgalRadiusBound : 0.1}
                  disabled={cgalDisabled}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChangeCgalRadiusBound(Math.max(0.001, Math.min(1, v)));
                  }}
                  style={{ width: 140 }}
                />
                <input
                  type="number"
                  min={0.001}
                  max={1}
                  step={0.001}
                  value={Number.isFinite(cgalRadiusBound) ? cgalRadiusBound : 0.1}
                  disabled={cgalDisabled}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChangeCgalRadiusBound(Math.max(0.001, Math.min(1, v)));
                  }}
                  style={{ width: 80 }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#556" }}>
                  <input
                    type="checkbox"
                    checked={cgalMinTrisEnabled}
                    disabled={cgalDisabled}
                    onChange={(e) => onChangeCgalMinTrisEnabled(e.target.checked)}
                  />
                  min tris (domain)
                </label>
                <input
                  type="number"
                  min={200}
                  max={1000000}
                  step={200}
                  value={Math.min(1000000, Math.max(200, Math.round(cgalMinTris)))}
                  disabled={cgalDisabled || !cgalMinTrisEnabled}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChangeCgalMinTris(Math.min(1000000, Math.max(200, v)));
                  }}
                  style={{ width: 110 }}
                />
                {cgalMinTrisEnabled && (
                  <span style={{ fontSize: 11, color: "#556" }}>edge {fmt(estimateTargetEdgeFromBudget(cgalDomainDiag, cgalMinTris))}</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  disabled={cgalDisabled}
                  onClick={() => {
                    onChangeCgalMinTrisEnabled(true);
                    onChangeCgalMinTris(100000);
                  }}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 8,
                    border: "1px solid #d0d5dd",
                    background: cgalDisabled ? "#f3f4f6" : "#fff",
                    cursor: cgalDisabled ? "not-allowed" : "pointer",
                    fontSize: 11,
                  }}
                >
                  100k tris
                </button>
                <span style={{ fontSize: 11, color: "#556" }}>preset</span>
              </div>
              {cgalMeshInfo && (
                <div style={{ fontSize: 11, color: "#556" }}>
                  {cgalMeshInfo.vertexCount} verts · {cgalMeshInfo.triCount} tris
                </div>
              )}
              {cgalError && <div style={{ fontSize: 11, color: "#b42318" }}>{cgalError}</div>}
              {!cgalReady && cgalHealthState?.error && (
                <div style={{ fontSize: 11, color: "#b42318" }}>{cgalHealthState.error}</div>
              )}
            </div>
          </div>
        )}

      <div style={{ marginBottom: 12, fontSize: 11, opacity: 0.75 }}>
        Probe details, gradients, and curvature live in the left panel (Theory tab).
      </div>

      <details style={{ marginBottom: 12 }}>
        <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Quick pick</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>Implicit / Graph</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SURFACES_EQ_META.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPickEqSurface(s.id)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid " + (surfaceId === s.id && isEqViewer ? "#0a66c2" : "#ddd"),
                    background: surfaceId === s.id && isEqViewer ? "#e6f0ff" : "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>Parametric</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PARAM_SURFACES_META.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPickParamSurface(s.id)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid " + (paramId === s.id && viewerKind === "param" ? "#0a66c2" : "#ddd"),
                    background: paramId === s.id && viewerKind === "param" ? "#e6f0ff" : "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
};

/* ---------------- Domain previews (SVG) ---------------- */

type XYDomainPreviewProps = {
  width: number;
  height: number;
  xSpan: number; // shows x in [-xSpan, xSpan]
  ySpan: number; // shows y in [-ySpan, ySpan]
  onPick: (xy: { x: number; y: number }) => void;
  picked?: { x: number; y: number } | null;
};

const XYDomainPreview: React.FC<XYDomainPreviewProps> = ({ width, height, xSpan, ySpan, onPick, picked: pickedProp }) => {
  const [picked, setPicked] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (pickedProp) setPicked(pickedProp);
  }, [pickedProp?.x, pickedProp?.y]);

  const safeXSpan = Number.isFinite(xSpan) && xSpan > 0 ? xSpan : 1;
  const safeYSpan = Number.isFinite(ySpan) && ySpan > 0 ? ySpan : 1;

  const pad = 12;
  const w = width;
  const h = height;

  const toXY = (clientX: number, clientY: number, svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    const px = (clientX - r.left - pad) / (r.width - 2 * pad);
    const py = (clientY - r.top - pad) / (r.height - 2 * pad);
    const x = (px * 2 - 1) * safeXSpan;
    const y = (1 - py * 2) * safeYSpan;
    return { x, y };
  };

  const toPx = (x: number, y: number) => {
    const px = pad + ((x / safeXSpan + 1) * 0.5) * (w - 2 * pad);
    const py = pad + ((1 - (y / safeYSpan + 1) * 0.5) * (h - 2 * pad));
    return { px, py };
  };

  const gridLines = 8;

  return (
    <div style={{ border: "1px solid #e6e6e6", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <svg
        width={w}
        height={h}
        style={{ display: "block", cursor: "crosshair" }}
        onMouseDown={(e) => {
          const svg = e.currentTarget;
          const xy = toXY(e.clientX, e.clientY, svg);
          setPicked(xy);
          onPick(xy);
        }}
      >
        {/* background */}
        <rect x={0} y={0} width={w} height={h} fill="#ffffff" />

        {/* inner frame */}
        <rect x={pad} y={pad} width={w - 2 * pad} height={h - 2 * pad} fill="#fbfbfd" stroke="#e8e8ee" />

        {/* grid */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const t = i / gridLines;
          const x = pad + t * (w - 2 * pad);
          const y = pad + t * (h - 2 * pad);
          return (
            <g key={i}>
              <line x1={x} y1={pad} x2={x} y2={h - pad} stroke="#eee" />
              <line x1={pad} y1={y} x2={w - pad} y2={y} stroke="#eee" />
            </g>
          );
        })}

        {/* axes */}
        {(() => {
          const o = toPx(0, 0);
          return (
            <g>
              <line x1={pad} y1={o.py} x2={w - pad} y2={o.py} stroke="#bbb" />
              <line x1={o.px} y1={pad} x2={o.px} y2={h - pad} stroke="#bbb" />
            </g>
          );
        })()}

        {/* picked marker */}
        {picked && (() => {
          const p = toPx(picked.x, picked.y);
          return (
            <g>
              <circle cx={p.px} cy={p.py} r={5} fill="#ff3b30" />
              <circle cx={p.px} cy={p.py} r={9} fill="none" stroke="#ff3b30" opacity={0.5} />
            </g>
          );
        })()}
      </svg>

      <div style={{ padding: "8px 10px", fontSize: 11, borderTop: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
        <span style={{ opacity: 0.75 }}>x ? ±{xSpan.toFixed(2)}  y ? ±{ySpan.toFixed(2)}</span>
        <span style={{ fontFamily: "monospace" }}>
          {picked ? `(${fmt(picked.x)}, ${fmt(picked.y)})` : "(click)"}
        </span>
      </div>
    </div>
  );
};

type ParamDomainPreviewProps = {
  width: number;
  height: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  onPick: (uv: { u: number; v: number }) => void;
  picked?: { u: number; v: number } | null;
};

const ParamDomainPreview: React.FC<ParamDomainPreviewProps> = ({
  width,
  height,
  uMin,
  uMax,
  vMin,
  vMax,
  onPick,
  picked: pickedProp,
}) => {
  const [picked, setPicked] = useState<{ u: number; v: number } | null>(null);
  useEffect(() => {
    if (pickedProp) setPicked(pickedProp);
  }, [pickedProp?.u, pickedProp?.v]);

  const pad = 12;
  const w = width;
  const h = height;

  const toUV = (clientX: number, clientY: number, svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    const px = (clientX - r.left - pad) / (r.width - 2 * pad);
    const py = (clientY - r.top - pad) / (r.height - 2 * pad);
    const u = uMin + px * (uMax - uMin);
    const v = vMax - py * (vMax - vMin);
    return { u, v };
  };

  const toPx = (u: number, v: number) => {
    const px = pad + ((u - uMin) / (uMax - uMin)) * (w - 2 * pad);
    const py = pad + ((vMax - v) / (vMax - vMin)) * (h - 2 * pad);
    return { px, py };
  };

  const gridLines = 8;

  return (
    <div style={{ border: "1px solid #e6e6e6", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <svg
        width={w}
        height={h}
        style={{ display: "block", cursor: "crosshair" }}
        onMouseDown={(e) => {
          const svg = e.currentTarget;
          const uv = toUV(e.clientX, e.clientY, svg);
          setPicked(uv);
          onPick(uv);
        }}
      >
        <rect x={0} y={0} width={w} height={h} fill="#ffffff" />
        <rect x={pad} y={pad} width={w - 2 * pad} height={h - 2 * pad} fill="#fbfbfd" stroke="#e8e8ee" />

        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const t = i / gridLines;
          const x = pad + t * (w - 2 * pad);
          const y = pad + t * (h - 2 * pad);
          return (
            <g key={i}>
              <line x1={x} y1={pad} x2={x} y2={h - pad} stroke="#eee" />
              <line x1={pad} y1={y} x2={w - pad} y2={y} stroke="#eee" />
            </g>
          );
        })}

        {/* picked marker */}
        {picked && (() => {
          const p = toPx(picked.u, picked.v);
          return (
            <g>
              <circle cx={p.px} cy={p.py} r={5} fill="#ff3b30" />
              <circle cx={p.px} cy={p.py} r={9} fill="none" stroke="#ff3b30" opacity={0.5} />
            </g>
          );
        })()}
      </svg>

      <div style={{ padding: "8px 10px", fontSize: 11, borderTop: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
        <span style={{ opacity: 0.75 }}>u∈[{fmt(uMin)},{fmt(uMax)}], v∈[{fmt(vMin)},{fmt(vMax)}]</span>
        <span style={{ fontFamily: "monospace" }}>
          {picked ? `(${fmt(picked.u)}, ${fmt(picked.v)})` : "(click)"}
        </span>
      </div>
    </div>
  );
};
const cardStyle: React.CSSProperties = {
  marginTop: 8,
  background: "#fff",
  border: "1px solid #e6e6e6",
  borderRadius: 12,
  padding: 10,
};

type C = { re: number; im: number };

const c0: C = { re: 0, im: 0 };
const c1: C = { re: 1, im: 0 };

const cAbs2 = (z: C) => z.re * z.re + z.im * z.im;
const cAdd = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cDiv = (a: C, b: C): C => {
  const d = cAbs2(b);
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const cNeg = (a: C): C => ({ re: -a.re, im: -a.im });

const cToStr = (z: C) => `${z.re.toFixed(4)}${z.im < 0 ? " − " : " + "}${Math.abs(z.im).toFixed(4)}i`;

type M2 = { a: C; b: C; c: C; d: C };

const mId = (): M2 => ({ a: c1, b: c0, c: c0, d: c1 });

const mMul = (X: M2, Y: M2): M2 => ({
  a: cAdd(cMul(X.a, Y.a), cMul(X.b, Y.c)),
  b: cAdd(cMul(X.a, Y.b), cMul(X.b, Y.d)),
  c: cAdd(cMul(X.c, Y.a), cMul(X.d, Y.c)),
  d: cAdd(cMul(X.c, Y.b), cMul(X.d, Y.d)),
});

const mT = (t: C): M2 => ({ a: c1, b: t, c: c0, d: c1 });        // z -> z + t
const mS = (k: C): M2 => ({ a: k, b: c0, c: c0, d: c1 });        // z -> k z
const mJ = (): M2 => ({ a: c0, b: c1, c: c1, d: c0 });           // z -> 1/z

const mToParams = (M: M2): MobiusParams => ({ a: M.a, b: M.b, c: M.c, d: M.d });

function mobiusParamsAtDecomposeStep(p: MobiusParams, step: number, eps = 1e-12): MobiusParams | null {
  const A = p.a, B = p.b, Cc = p.c, D = p.d;

  if (cAbs2(Cc) < eps) {
    // affine case (no universal alpha/beta/delta decomposition)
    return null;
  }

  const alpha = cDiv(A, Cc);
  const delta = cDiv(D, Cc);
  const beta = cDiv(cSub(cMul(B, Cc), cMul(A, D)), cMul(Cc, Cc)); // (BC-AD)/C^2

  // Build step matrix:
  // step0: id
  // step1: Tδ
  // step2: J ∘ Tδ
  // step3: Sβ ∘ J ∘ Tδ
  // step4: Tα ∘ Sβ ∘ J ∘ Tδ
  let M = mId();

  if (step >= 1) M = mMul(mT(delta), M);
  if (step >= 2) M = mMul(mJ(), M);
  if (step >= 3) M = mMul(mS(beta), M);
  if (step >= 4) M = mMul(mT(alpha), M);

  return mToParams(M);
}
const MobiusDecomposeCard: React.FC<{
  params: MobiusParams;
  step: number;
  onStep: (s: number) => void;
}> = ({ params, step, onStep }) => {
  const eps = 1e-12;
  const A = params.a, B = params.b, Cc = params.c, D = params.d;

  const isAffine = cAbs2(Cc) < eps;

  let alpha: C | null = null;
  let beta: C | null = null;
  let delta: C | null = null;

  if (!isAffine) {
    alpha = cDiv(A, Cc);
    delta = cDiv(D, Cc);
    beta = cDiv(cSub(cMul(B, Cc), cMul(A, D)), cMul(Cc, Cc));
  }

  const stepsLabel = [
    "0: z",
    "1: Tδ(z)=z+δ",
    "2: J(z)=1/(z+δ)",
    "3: Sβ(z)=β/(z+δ)",
    "4: Tα(z)=α+β/(z+δ)",
  ];

  const copyLatex = async () => {
    const latex =
      isAffine
        ? `f(z)=\\frac{Az+B}{D}=\\left(\\frac{A}{D}\\right)z+\\frac{B}{D}`
        : `\\alpha=\\frac{A}{C},\\ \\delta=\\frac{D}{C},\\ \\beta=\\frac{BC-AD}{C^2},\\quad f(z)=\\alpha+\\frac{\\beta}{z+\\delta}=T_\\alpha\\circ S_\\beta\\circ J\\circ T_\\delta`;
    await navigator.clipboard.writeText(latex);
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>Decomposition</div>
        <button
          type="button"
          onClick={copyLatex}
          style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}
        >
          Copy LaTeX
        </button>
      </div>

      <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
        Matrix: <span style={{ fontFamily: "monospace" }}>A,B,C,D</span>
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 12, marginTop: 4 }}>
        A={cToStr(A)}{"  "}B={cToStr(B)}{"  "}C={cToStr(Cc)}{"  "}D={cToStr(D)}
      </div>

      {isAffine ? (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
          Affine case (C≈0): f(z) = (A/D)z + (B/D). Stepper disabled.
        </div>
      ) : (
        <>
          <div style={{ marginTop: 8, fontSize: 12 }}>
            <div style={{ fontFamily: "monospace" }}>α = A/C = {alpha ? cToStr(alpha) : ""}</div>
            <div style={{ fontFamily: "monospace" }}>δ = D/C = {delta ? cToStr(delta) : ""}</div>
            <div style={{ fontFamily: "monospace" }}>β = (BC−AD)/C² = {beta ? cToStr(beta) : ""}</div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ fontWeight: 700 }}>Step</span>
              <span style={{ fontFamily: "monospace" }}>{stepsLabel[step]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={4}
              step={1}
              value={step}
              onChange={(e) => onStep(parseInt(e.target.value, 10))}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            Rendering uses the chosen intermediate map in the W-plane.
          </div>
        </>
      )}
    </div>
  );
};
const MobiusInvariantsCard: React.FC<{ params: MobiusParams }> = ({ params }) => {
  const eps = 1e-12;
  const A = params.a, B = params.b, Cc = params.c, D = params.d;

  const det = cSub(cMul(A, D), cMul(B, Cc)); // AD-BC
  const isAffine = cAbs2(Cc) < eps;

  const pole = isAffine ? null : cNeg(cDiv(D, Cc));  // -D/C
  const fInf = isAffine ? null : cDiv(A, Cc);        // A/C

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>Invariants</div>

      <div style={{ fontSize: 12 }}>
        <div><b>det</b> = AD − BC = <span style={{ fontFamily: "monospace" }}>{cToStr(det)}</span></div>

        {isAffine ? (
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            C≈0 (affine). No pole; f(∞)=∞.
          </div>
        ) : (
          <>
            <div style={{ marginTop: 6 }}>
              <b>pole</b> zₚ = −D/C = <span style={{ fontFamily: "monospace" }}>{pole ? cToStr(pole) : ""}</span>
            </div>
            <div style={{ marginTop: 4 }}>
              <b>f(∞)</b> = A/C = <span style={{ fontFamily: "monospace" }}>{fInf ? cToStr(fInf) : ""}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              Next easy add: fixed points (solve Cz² + (D−A)z − B = 0).
            </div>
          </>
        )}
      </div>
    </div>
  );
};
