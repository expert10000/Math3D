// src/App.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { uiStyles as styles } from "./uiStyles";

import MobiusScreen from "./screens/MobiusScreen";
import { ChebyshevScreen } from "./screens/ChebyshevScreen";

import { PlanePlot, type PlanePlotHandle } from "./components/PlanePlot";
import TabButton from "./components/TabButton";
import GaussMapPanel from "./components/GaussMapPanel";
import { SelectionStatsPanel } from "./components/SelectionStatsPanel";
import { DiskStatsPanel } from "./components/DiskStatsPanel";

import {
  SurfaceViewer,
  type SurfaceId,
  type ColorMode,
  type ProbeInfo,
} from "./components/SurfaceViewer";
import { VolumeViewer } from "./components/VolumeViewer";

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
import { solveContinuousGraphGeodesic } from "./math/graphGeodesicContinuous";
import { compileExpression } from "./math/expression";
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
  type SurfaceMeshData,
  type SurfaceMeshSource,
  type SurfaceMeshPreset,
} from "./mesh/surfaceMesh";
import {
  computeAdjacency,
  computeMeanEdgeLength,
  computeVertexNormals,
  validateMesh,
} from "./mesh/meshOps";
import type { DatasetKind, SurfaceDataset } from "./scene/datasets";
import type { PolylineSet } from "./scene/renderPrimitives";
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
import type { SliceAxis } from "./scene/volume/sliceVolume";
/* ---------------- App modes ---------------- */

type Mode = "mobius" | "chebyshev" | "transform" | "maps" | "surfaces";
type SurfaceViewerKind = "implicit" | "graph" | "param" | "weierstrass" | "mesh";
type GraphDomain = { xSpan: number; ySpan: number };
type ImplicitDomain = { xSpan: number; ySpan: number };
type ParamDomain = { uMin: number; uMax: number; vMin: number; vMax: number };
type CameraSyncState = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
};
type CgalMeshState = {
  surfaceId: SurfaceId;
  expr: string;
  positions: number[];
  indices: number[];
  createdAt: number;
};
type CgalHealthState = { ok: boolean; error?: string };

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

const toSurfaceDataset = (mesh: SurfaceMeshData | null): SurfaceDataset | null =>
  mesh ? { kind: "surface", mesh } : null;

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

function autoLabelGraphDomain(xSpan: number, ySpan: number) {
  return `x±${xSpan.toFixed(2)} y±${ySpan.toFixed(2)}`;
}

function autoLabelImplicitDomain(xSpan: number, ySpan: number) {
  return `xñ${xSpan.toFixed(2)} yñ${ySpan.toFixed(2)}`;
}

function autoLabelParamDomain(p: ParamDomain) {
  return `u:${p.uMin.toFixed(2)}..${p.uMax.toFixed(2)} v:${p.vMin.toFixed(2)}..${p.vMax.toFixed(2)}`;
}

const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : String(x));
const fmt3 = (v: { x: number; y: number; z: number }) => `(${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)})`;
type Vec3 = { x: number; y: number; z: number };
const vLen = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
const vDot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const vScale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
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

/* ---------------- App ---------------- */

const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>("mobius");
  const samples = 800;

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
  const [surfaceDataset, setSurfaceDatasetState] = useState<SurfaceDataset | null>(() => {
    const preset = SURFACE_MESH_PRESETS[0];
    try {
      const base = buildSurfaceMeshFromGeometry(preset.build(), preset.label, "generated", { mergeVertices: true });
      return toSurfaceDataset(applySurfaceMeshOps(base));
    } catch {
      return null;
    }
  });
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
  const volumeCustomCompiled = useMemo(() => {
    if (volumePresetId !== "custom") return { fn: undefined, error: null };
    const src = volumeCustomExpr.trim();
    if (!src) return { fn: undefined, error: "Expression required." };
    const { fn, error } = compileExpression(src, ["x", "y", "z"]);
    return { fn, error: error ? error.message : null };
  }, [volumeCustomExpr, volumePresetId]);
  const volumeDataset = useMemo(
    () => ({
      kind: "volume",
      grid: buildVolumeGridFromPreset(volumePresetId, {
        dims: volumeDims,
        params: volumeParamsResolved,
        customFn: volumeCustomCompiled.fn,
      }),
    }),
    [volumePresetId, volumeDims, volumeParamsResolved, volumeCustomCompiled.fn]
  );
  const activeDataset = datasetKind === "volume" ? volumeDataset : surfaceDataset;
  const surfaceMeshData = surfaceDataset?.mesh ?? null;
  const [volumeSliceAxis, setVolumeSliceAxis] = useState<SliceAxis>("z");
  const [volumeSliceIndex, setVolumeSliceIndex] = useState(() =>
    Math.floor(volumeDataset.grid.dims[2] / 2)
  );
  const [volumeSliceOpacity, setVolumeSliceOpacity] = useState(0.85);
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
  const volumeSliceMax = useMemo(() => {
    const [nx, ny, nz] = volumeDataset.grid.dims;
    if (volumeSliceAxis === "x") return Math.max(0, nx - 1);
    if (volumeSliceAxis === "y") return Math.max(0, ny - 1);
    return Math.max(0, nz - 1);
  }, [volumeDataset, volumeSliceAxis]);
  useEffect(() => {
    setVolumeSliceIndex((value) => Math.max(0, Math.min(volumeSliceMax, value)));
  }, [volumeSliceMax]);
  const [surfaceMeshImportBusy, setSurfaceMeshImportBusy] = useState(false);
  const [surfaceMeshImportError, setSurfaceMeshImportError] = useState<string | null>(null);
  const [surfaceMeshMergeVertices, setSurfaceMeshMergeVertices] = useState(true);
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
  const setSurfaceDataset = useCallback((mesh: SurfaceMeshData | null) => {
    setSurfaceDatasetState(toSurfaceDataset(mesh));
    setDatasetKind("surface");
  }, []);

  // Split eq surfaces into implicit vs graph, but keep separate selected ids
  const [implicitSurfaceId, setImplicitSurfaceId] = useState<SurfaceId>("sphere");
  const [graphSurfaceId, setGraphSurfaceId] = useState<SurfaceId>("graph_saddle");

  // Parametric surface selector
  const [paramSurfaceId, setParamSurfaceId] = useState<ParamSurfaceId>("plane");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareSurfaceId, setCompareSurfaceId] = useState<SurfaceId>("sphere");
  const [compareParamId, setCompareParamId] = useState<ParamSurfaceId>("plane");
  const [cameraSync, setCameraSync] = useState<CameraSyncState | null>(null);

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
  const [probeInfo, setProbeInfo] = useState<ProbeInfo | null>(null);
  const [probeCurv, setProbeCurv] = useState<CurvatureData | null>(null);
  const [paramProbeCurv, setParamProbeCurv] = useState<PrincipalCurvatureScalars | null>(null);

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

  // active equation surface id (single truth)
  const activeEqSurfaceId =
    surfaceViewerKind === "graph"
      ? graphSurfaceId
      : surfaceViewerKind === "mesh"
        ? "surface_mesh"
        : implicitSurfaceId;
  const activeImplicitExpr = useMemo(() => {
    const fallback = (implicitExpr ?? "").trim();
    if (implicitSurfaceId === "implicit_custom") return fallback;
    const preset = IMPLICIT_EXPR_PRESETS.find((p) => p.id === implicitSurfaceId);
    return (preset?.expr ?? fallback).trim();
  }, [implicitSurfaceId, implicitExpr]);
  const surfaceMeshLabel = surfaceMeshData?.label ?? "SurfaceMesh";
  const surfaceMeshStats = useMemo(() => {
    if (!surfaceMeshData?.positions?.length) return null;
    const vertCount = Math.floor(surfaceMeshData.positions.length / 3);
    const triCount = surfaceMeshData.indices
      ? Math.floor(surfaceMeshData.indices.length / 3)
      : Math.floor(vertCount / 3);
    return { vertCount, triCount };
  }, [surfaceMeshData]);
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
    if (surfaceViewerKind === "mesh") {
      setCompareEnabled(false);
      return;
    }
    if (surfaceViewerKind === "graph" && !isGraphSurface(compareSurfaceId)) {
      setCompareSurfaceId("graph_saddle");
    }
    if (surfaceViewerKind === "implicit" && isGraphSurface(compareSurfaceId)) {
      setCompareSurfaceId("sphere");
    }
  }, [compareEnabled, surfaceViewerKind, compareSurfaceId]);

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

  // plane refs for 2D modes
  const zRef = useRef<PlanePlotHandle | null>(null);
  const wRef = useRef<PlanePlotHandle | null>(null);

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
  }, [surfaceViewerKind, colorMode]);

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
  }, [mode, mobiusParams, chebN, primKind, primValue, mapId, samples]);

  /* ---------- probe reset rules ---------- */
  useEffect(() => {
    // changing surface/mode makes previous probe misleading
    setProbeInfo(null);
    setProbeCurv(null);
    setParamProbeCurv(null);
    setGraphProbeXY(null);
    setParamProbeUV(null);
    setImplicitProbeXYZ(null);
  }, [activeEqSurfaceId, paramSurfaceId, surfaceViewerKind, colorMode]);

  useEffect(() => {
    if (!probeEnabled) {
      setProbeInfo(null);
      setProbeCurv(null);
      setParamProbeCurv(null);
    }
  }, [probeEnabled]);

  const handleProbe = useCallback(
    (info: ProbeInfo) => {
      setProbeInfo(info);

      if (surfaceViewerKind === "graph" && isGraphSurface(activeEqSurfaceId)) {
        const curv = computeGraphInvariantsFromProbe(activeEqSurfaceId, graphExpr, info.point);
        setProbeCurv(curv);
      } else {
        setProbeCurv(null);
      }
    },
    [surfaceViewerKind, activeEqSurfaceId, graphExpr]
  );

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
    setSurfaceViewerKind("param");
    setParamSurfaceId(id);
  };

  const handlePickEqSurface = (id: SurfaceId) => {
    if (isGraphSurface(id)) {
      setSurfaceViewerKind("graph");
      setGraphSurfaceId(id);
    } else {
      setSurfaceViewerKind("implicit");
      setImplicitSurfaceId(id);
    }
  };

  const handleChangeViewerKind = useCallback((kind: SurfaceViewerKind) => {
    setSurfaceViewerKind(kind);
    if (kind === "weierstrass" || kind === "mesh") {
      setCompareEnabled(false);
      setCameraSync(null);
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

  const handleGenerateSurfaceMeshPreset = useCallback((presetId: string) => {
    const preset = SURFACE_MESH_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    try {
      const base = buildSurfaceMeshFromGeometry(preset.build(), preset.label, "generated", { mergeVertices: true });
      setSurfaceDataset(applySurfaceMeshOps(base));
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
        setSurfaceDataset(applySurfaceMeshOps(base));
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

  const activeCgalMesh = useMemo(() => {
    if (!cgalMeshState) return null;
    if (cgalMeshState.surfaceId !== activeEqSurfaceId) return null;
    if (cgalMeshState.expr !== activeImplicitExpr) return null;
    return cgalMeshState;
  }, [cgalMeshState, activeEqSurfaceId, activeImplicitExpr]);

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
            : surfaceViewerKind === "mesh"
              ? surfaceMeshData?.label ?? "Surface mesh"
              : "Surface mesh";
  }, [surfaceViewerKind, activeEqSurfaceId, paramSurfaceId, surfaceMeshData?.label]);

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
      setSurfaceDataset(applySurfaceMeshOps(next));
      setSurfaceViewerKind("mesh");
      setSurfaceMeshImportError(null);
    },
    [buildActiveMeshLabel]
  );

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

  const handleExportToSurfaceMesh = useCallback(() => {
    if (surfaceViewerKind === "implicit" && !activeCgalMesh) {
      setSurfaceMeshImportError("Run CGAL mesh first.");
      return;
    }
    const meshData = surfaceSampleSet?.meshData ?? [];
    if (!meshData.length) {
      setSurfaceMeshImportError("Surface mesh not ready yet.");
      return;
    }
    const merged = mergeMeshData(meshData);
    const eqMeta = SURFACES_EQ_META.find((m) => m.id === activeEqSurfaceId);
    const paramMeta = PARAM_SURFACES_META.find((m) => m.id === paramSurfaceId);
    const label =
      surfaceViewerKind === "graph"
        ? `Graph: ${eqMeta?.label ?? activeEqSurfaceId}`
        : surfaceViewerKind === "implicit"
          ? `Implicit: ${eqMeta?.label ?? activeEqSurfaceId}`
          : surfaceViewerKind === "weierstrass"
            ? "Weierstrass surface"
            : surfaceViewerKind === "param"
              ? `Param: ${paramMeta?.label ?? paramSurfaceId}`
              : "Surface mesh";

    const next: SurfaceMeshData = {
      label,
      positions: merged.positions,
      indices: merged.indices,
      source: "surface",
    };
    setSurfaceDataset(applySurfaceMeshOps(next));
    setSurfaceViewerKind("mesh");
    setSurfaceMeshImportError(null);
  }, [surfaceSampleSet, surfaceViewerKind, activeEqSurfaceId, paramSurfaceId, activeCgalMesh]);

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
  }, []);

  const handleRefreshSelectionStats = useCallback(() => {
    setSelectionStatsToken((v) => v + 1);
  }, []);

  const handleGaussSelection = useCallback((selection: GaussCapSelection) => {
    console.log("[App] gauss cap selection", selection);
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
  }, [surfaceSampleSet, selection, selectionMode, selectionSeed, geodesicAdjacency, selectionStatsToken]);

  const selectionIndices = useMemo(() => {
    if (!selectionMask?.selected?.length) return [];
    const selected = selectionMask.selected;
    const indices: number[] = [];
    for (let i = 0; i < selected.length; i++) {
      if (selected[i]) indices.push(i);
    }
    return indices;
  }, [selectionMask]);

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

  const surfaceMeshExportable =
    surfaceViewerKind !== "mesh" &&
    (surfaceViewerKind === "implicit" ? !!activeCgalMesh : !!surfaceSampleSet?.meshData?.length);
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
  const geodesicHeatMeshAvailable = surfaceViewerKind === "mesh" && !!surfaceSampleSet?.meshData?.length;
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
      surfaceViewerKind === "mesh") &&
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
      surfaceViewerKind === "mesh"
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
    if (surfaceViewerKind === "mesh") {
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
    if (surfaceViewerKind === "mesh") {
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

  const handleRunGeodesicHeat = useCallback(async () => {
    setGeodesicHeatMessage(null);
    setGeodesicHeatPolylines(null);
    setGeodesicHeatLength(null);
    setGeodesicHeatPhi(null);
    setGeodesicHeatMeshToken(null);
    setGeodesicHeatMeshKey(null);

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

    if (!geodesicHeatStart || !geodesicHeatEnd) {
      const msg = isImplicitHeat
        ? "Pick two points on the CGAL mesh."
        : isGraphHeat
          ? "Pick two points on the graph mesh."
          : "Pick two points on the param mesh.";
      setGeodesicHeatMessage(msg);
      return;
    }

    if (geodesicHeatStart.meshKey !== geodesicHeatEnd.meshKey) {
      setGeodesicHeatMessage("Pick both points on the same mesh.");
      return;
    }

    if (isGraphHeat && geodesicHeatUseContinuous) {
      const domain = activeGraphDomain ?? getDefaultGraphSpan(activeEqSurfaceId);
      const start2D = { x: geodesicHeatStart.point.x, y: geodesicHeatStart.point.z };
      const end2D = { x: geodesicHeatEnd.point.x, y: geodesicHeatEnd.point.z };
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
      if (!geodesicHeatStart.uv || !geodesicHeatEnd.uv) {
        setGeodesicHeatMessage("Pick two points on the param mesh (UV required).");
        return;
      }
      if (paramState.meshKey && paramState.meshKey !== geodesicHeatStart.meshKey) {
        setGeodesicHeatMessage("Param mesh changed; repick the endpoints.");
        return;
      }
      setGeodesicHeatBusy(true);
      try {
        const res = solveContinuousParamGeodesic({
          paramFunc: paramState.paramFunc,
          startUV: geodesicHeatStart.uv,
          endUV: geodesicHeatEnd.uv,
          domain: paramState.domain,
          wrap: paramState.wrap,
          startPoint: geodesicHeatStart.point,
          endPoint: geodesicHeatEnd.point,
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
      const meshData = surfaceSampleSet?.meshData?.find((m) => m.key === geodesicHeatStart.meshKey)
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
        source: { face: geodesicHeatStart.faceIndex, bary: geodesicHeatStart.bary },
        target: { face: geodesicHeatEnd.faceIndex, bary: geodesicHeatEnd.bary },
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
  }, [
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

          if (!res.ok || !res.phi_vertex?.length) {
            setGeodesicDiskMessage(res?.error ?? "Geodesic heat failed.");
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
            "colorMode <solid|height|radius|curvature|gaussian|mean|k1|k2>",
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

  return (
    <div style={rootStyle}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Möbius/Chebyshev/Surfaces</h1>

        <div style={styles.tabs}>
          <TabButton active={mode === "mobius"} onClick={() => setMode("mobius")}>
            Möbius map
          </TabButton>

          <TabButton active={mode === "chebyshev"} onClick={() => setMode("chebyshev")}>
            Chebyshev Tₙ
          </TabButton>

          <TabButton active={mode === "transform"} onClick={() => setMode("transform")}>
            Transform (z²)
          </TabButton>

          <TabButton active={mode === "maps"} onClick={() => setMode("maps")}>
            Standard maps
          </TabButton>

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
              surfaceId={activeEqSurfaceId}
              onChangeSurface={handlePickEqSurface}
              paramId={paramSurfaceId}
              onChangeParamId={setParamSurfaceId}
              activeWeierstrassPreset={activeWeierstrassPreset}
              onApplyWeierstrassPreset={applyWeierstrassPreset}
              onApplySuggestedDomain={applySuggestedDomain}
              compareEnabled={compareEnabled}
              onToggleCompare={() => {
                setCompareEnabled((v) => !v);
                setCameraSync(null);
              }}
              compareSurfaceId={compareSurfaceId}
              onChangeCompareSurface={setCompareSurfaceId}
              compareParamId={compareParamId}
              onChangeCompareParamId={setCompareParamId}
              geodesicHeatHeatmapAllowed={geodesicHeatHeatmapAllowed}
              geodesicHeatHeatmapReason={geodesicHeatHeatmapReason}
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
                  onChangeDatasetKind={setDatasetKind}
                  volumePresetId={volumePresetId}
                  volumePreset={volumePreset}
                  volumeDims={volumeDims}
                  volumeParams={volumeParamsResolved}
                  volumeCustomExpr={volumeCustomExpr}
                  volumeCustomError={volumeCustomCompiled.error}
                  volumeAxis={volumeSliceAxis}
                  volumeIndex={volumeSliceIndex}
                  volumeIndexMax={volumeSliceMax}
                  volumeOpacity={volumeSliceOpacity}
                  onChangeVolumePresetId={setVolumePresetId}
                  onChangeVolumeDim={handleVolumeDimChange}
                  onChangeVolumeParam={handleVolumeParamChange}
                  onChangeVolumeCustomExpr={setVolumeCustomExpr}
                  onChangeVolumeAxis={setVolumeSliceAxis}
                  onChangeVolumeIndex={setVolumeSliceIndex}
                  onChangeVolumeOpacity={setVolumeSliceOpacity}
                  surfaceMeshLabel={surfaceMeshLabel}
                  surfaceMeshStats={surfaceMeshStats}
                  surfaceMeshSource={surfaceMeshData?.source ?? null}
                  surfaceMeshImportBusy={surfaceMeshImportBusy}
                  surfaceMeshImportError={surfaceMeshImportError}
                  surfaceMeshMergeVertices={surfaceMeshMergeVertices}
                  surfaceMeshPresets={SURFACE_MESH_PRESETS}
                  surfaceMeshExportable={surfaceMeshExportable}
                  onToggleSurfaceMeshMergeVertices={setSurfaceMeshMergeVertices}
                  onGenerateSurfaceMeshPreset={handleGenerateSurfaceMeshPreset}
                  onLoadSurfaceMeshFile={handleLoadSurfaceMeshFile}
                  onExportSurfaceMesh={handleExportToSurfaceMesh}
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
                onChangeParamXExpr={setParamXExpr}
                onChangeParamYExpr={setParamYExpr}
                onChangeParamZExpr={setParamZExpr}
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
                  <div style={{ width: "100%", height: "100%" }}>
                    <VolumeViewer
                      dataset={activeDataset?.kind === "volume" ? activeDataset : null}
                      axis={volumeSliceAxis}
                      index={volumeSliceIndex}
                      opacity={volumeSliceOpacity}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: showGaussMap ? "minmax(0,1fr) 320px" : "1fr",
                      gap: showGaussMap ? 10 : 0,
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
                            surfaceId={paramSurfaceIdForView}
                            customX={paramXExpr}
                            customY={paramYExpr}
                            customZ={paramZExpr}
                            wireframe={showWireframe}
                            showPlanes={showPlanes}
                            lightPreset={lightPreset}
                            materialRoughness={materialRoughness}
                            materialMetalness={materialMetalness}
                            materialOpacity={materialOpacity}
                            paramResolution={activeParamLikeResolution}
                            colorMode={colorMode}
                            colorPalette={colorPalette}
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
                            showBoundingBox={showBoundingBox}
                            resetToken={cameraResetToken}
                            onProbe={handleProbe}
                            onParamCurvature={handleParamCurvature}
                            paramProbeUV={paramProbeUV}
                            paramProbeToken={paramProbeToken}
                            onSetCustomX={setParamXExpr}
                            onSetCustomY={setParamYExpr}
                            onSetCustomZ={setParamZExpr}
                            isCameraLeader={compareEnabled}
                            onCameraSync={compareEnabled ? setCameraSync : undefined}
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
                              surfaceId={activeEqSurfaceId}
                              graphExpr={graphExpr}
                            implicitExpr={implicitExpr}
                            implicitMeshOverride={activeCgalMesh}
                            surfaceMeshOverride={surfaceViewerKind === "mesh" ? surfaceMeshData : null}
                            implicitMeshToken={cgalMeshToken}
                            sampleMaxPoints={surfaceViewerKind === "graph" ? graphSampleMaxPoints : undefined}
                            wireframe={showWireframe}
                            showPlanes={showPlanes}
                            lightPreset={lightPreset}
                            materialRoughness={materialRoughness}
                            materialMetalness={materialMetalness}
                            materialOpacity={materialOpacity}
                            graphResolution={graphResolution}
                            implicitResolution={implicitResolution}
                            implicitDomainSize={implicitDomainSizeFor(activeEqSurfaceId)}
                            colorMode={colorMode}
                            colorPalette={colorPalette}
                            implicitOverlay={implicitOverlay}
                            graphDomain={activeGraphDomain}
                            showBoundingBox={showBoundingBox}
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
                            showContours={showContours}
                            contourCount={contourCount}
                            isCameraLeader={compareEnabled}
                            onCameraSync={compareEnabled ? setCameraSync : undefined}
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
                              surfaceId={compareParamId}
                              customX={paramXExpr}
                              customY={paramYExpr}
                              customZ={paramZExpr}
                              wireframe={showWireframe}
                              showPlanes={showPlanes}
                              lightPreset={lightPreset}
                              materialRoughness={materialRoughness}
                              materialMetalness={materialMetalness}
                              materialOpacity={materialOpacity}
                              paramResolution={paramResolution}
                              colorMode={colorMode}
                              colorPalette={colorPalette}
                              paramDomain={activeParamDomain}
                              probeEnabled={false}
                              showProbeNormal={false}
                              showProbeTangentPlane={false}
                              showProbeTangents={false}
                              showPrincipalDirections={false}
                              showPrincipalNormalPlanes={false}
                              showPrincipalLines={false}
                              showPrincipalGlyphs={false}
                              showCurvatureLines={false}
                            showBoundingBox={showBoundingBox}
                              resetToken={cameraResetToken}
                              onSetCustomX={setParamXExpr}
                              onSetCustomY={setParamYExpr}
                              onSetCustomZ={setParamZExpr}
                              isCameraLeader={false}
                              cameraSync={cameraSync}
                            />
                          ) : (
                            <SurfaceViewer
                              surfaceId={compareSurfaceId}
                              graphExpr={graphExpr}
                              implicitExpr={implicitExpr}
                              surfaceMeshOverride={surfaceViewerKind === "mesh" ? surfaceMeshData : null}
                              sampleMaxPoints={surfaceViewerKind === "graph" ? graphSampleMaxPoints : undefined}
                              wireframe={showWireframe}
                              showPlanes={showPlanes}
                              lightPreset={lightPreset}
                              materialRoughness={materialRoughness}
                              materialMetalness={materialMetalness}
                              materialOpacity={materialOpacity}
                              graphResolution={graphResolution}
                              implicitResolution={implicitResolution}
                              implicitDomainSize={implicitDomainSizeFor(compareSurfaceId)}
                              colorMode={colorMode}
                              colorPalette={colorPalette}
                              implicitOverlay={implicitOverlay}
                              graphDomain={activeGraphDomain}
                              showBoundingBox={showBoundingBox}
                              resetToken={cameraResetToken}
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
                              showContours={showContours}
                              contourCount={contourCount}
                              isCameraLeader={false}
                              cameraSync={cameraSync}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {showGaussMap && (
                    <div style={{ minWidth: 240, maxWidth: 340, display: "flex", alignItems: "stretch" }}>
                    <GaussMapPanel
                        samples={surfaceSampleSet?.samples ?? []}
                        palette={colorPalette}
                        colorMode={gaussColorMode}
                        probeNormal={probeInfo?.normal ?? null}
                        inspectDir={inspectNormal}
                        onPointHover={(idx) => setGaussHoverIndex(idx)}
                        height={280}
                        selectionMask={selectionMask}
                        onGaussSelection={handleGaussSelection}
                        densityNormals={selectionBaseArrays?.normals ?? null}
                        densitySelectionIndices={selectionIndices}
                      />
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>

            <div onMouseDown={startDragRight} style={splitterStyle} />

            {/* RIGHT */}
            <div style={{ ...styles.panelLeft, width: rightWidth, maxWidth: maxRight }}>
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
              <div style={{ flex: 1, minHeight: 260 }}>
                <PlanePlot id="svgW" extent={3} step={1} ref={wRef} style={{ height: "100%" }} />
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
  surfaceId: SurfaceId;
  onChangeSurface: (s: SurfaceId) => void;
  paramId: ParamSurfaceId;
  onChangeParamId: (p: ParamSurfaceId) => void;
  activeWeierstrassPreset: WeierstrassPreset | null;
  onApplyWeierstrassPreset: (preset: WeierstrassPreset) => void;
  onApplySuggestedDomain: (preset: WeierstrassPreset) => void;
  compareEnabled: boolean;
  onToggleCompare: () => void;
  compareSurfaceId: SurfaceId;
  onChangeCompareSurface: (s: SurfaceId) => void;
  compareParamId: ParamSurfaceId;
  onChangeCompareParamId: (p: ParamSurfaceId) => void;
  geodesicHeatHeatmapAllowed: boolean;
  geodesicHeatHeatmapReason: string;
};

const SurfacesControls: React.FC<SurfacesControlsProps> = ({
  viewerKind,
  onChangeViewerKind,
  surfaceId,
  onChangeSurface,
  paramId,
  onChangeParamId,
  activeWeierstrassPreset,
  onApplyWeierstrassPreset,
  onApplySuggestedDomain,
  compareEnabled,
  onToggleCompare,
  compareSurfaceId,
  onChangeCompareSurface,
  compareParamId,
  onChangeCompareParamId,
  geodesicHeatHeatmapAllowed,
  geodesicHeatHeatmapReason,
}) => {
  const implicitSurfaces = SURFACES_EQ_META.filter((s) => !isGraphSurface(s.id));
  const graphSurfaces = SURFACES_EQ_META.filter((s) => isGraphSurface(s.id));

  return (
    <div style={{ ...styles.group, ...styles.groupWide, gap: 12 }}>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
          onClick={() => onChangeViewerKind("implicit")}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid " + (viewerKind === "implicit" ? "#0a66c2" : "#ddd"),
            background: viewerKind === "implicit" ? "#e6f0ff" : "#fff",
            fontWeight: viewerKind === "implicit" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          f(x,y,z) = 0 viewer
        </button>

        <button
          type="button"
          onClick={() => onChangeViewerKind("graph")}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid " + (viewerKind === "graph" ? "#0a66c2" : "#ddd"),
            background: viewerKind === "graph" ? "#e6f0ff" : "#fff",
            fontWeight: viewerKind === "graph" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          z = f(x,y) viewer
        </button>

        <button
          type="button"
          onClick={() => onChangeViewerKind("param")}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid " + (viewerKind === "param" ? "#0a66c2" : "#ddd"),
            background: viewerKind === "param" ? "#e6f0ff" : "#fff",
            fontWeight: viewerKind === "param" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          σ(u,v) viewer
        </button>
        <button
          type="button"
          onClick={() => onChangeViewerKind("weierstrass")}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid " + (viewerKind === "weierstrass" ? "#0a66c2" : "#ddd"),
            background: viewerKind === "weierstrass" ? "#e6f0ff" : "#fff",
            fontWeight: viewerKind === "weierstrass" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          Weierstrass
        </button>
        <button
          type="button"
          onClick={() => onChangeViewerKind("mesh")}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid " + (viewerKind === "mesh" ? "#0a66c2" : "#ddd"),
            background: viewerKind === "mesh" ? "#e6f0ff" : "#fff",
            fontWeight: viewerKind === "mesh" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          SurfaceMesh
        </button>
      </div>

      <div style={{ flex: 1 }}>
        {viewerKind === "implicit" && (
          <SurfacesButtons surfaceId={surfaceId} surfaces={implicitSurfaces} onChangeSurface={onChangeSurface} />
        )}
        {viewerKind === "graph" && <SurfacesButtons surfaceId={surfaceId} surfaces={graphSurfaces} onChangeSurface={onChangeSurface} />}
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

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={compareEnabled}
            onChange={onToggleCompare}
            disabled={viewerKind === "weierstrass" || viewerKind === "mesh"}
          />
          Compare
        </label>
      </div>

      {compareEnabled && viewerKind !== "mesh" && (
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
  onChangeDatasetKind: (kind: DatasetKind) => void;
  volumePresetId: VolumePresetId;
  volumePreset: VolumePreset;
  volumeDims: [number, number, number];
  volumeParams: VolumePresetParams;
  volumeCustomExpr: string;
  volumeCustomError: string | null;
  volumeAxis: SliceAxis;
  volumeIndex: number;
  volumeIndexMax: number;
  volumeOpacity: number;
  onChangeVolumePresetId: (id: VolumePresetId) => void;
  onChangeVolumeDim: (axisIndex: 0 | 1 | 2, value: number) => void;
  onChangeVolumeParam: (id: string, value: number) => void;
  onChangeVolumeCustomExpr: (value: string) => void;
  onChangeVolumeAxis: (axis: SliceAxis) => void;
  onChangeVolumeIndex: (value: number) => void;
  onChangeVolumeOpacity: (value: number) => void;
  surfaceMeshLabel: string;
  surfaceMeshStats: { vertCount: number; triCount: number } | null;
  surfaceMeshSource: SurfaceMeshSource | null;
  surfaceMeshImportBusy: boolean;
  surfaceMeshImportError: string | null;
  surfaceMeshMergeVertices: boolean;
  surfaceMeshPresets: SurfaceMeshPreset[];
  surfaceMeshExportable: boolean;
  onToggleSurfaceMeshMergeVertices: (v: boolean) => void;
  onGenerateSurfaceMeshPreset: (id: string) => void;
  onLoadSurfaceMeshFile: (files: FileList | File[] | null) => void;
  onExportSurfaceMesh: () => void;
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
  onChangeParamXExpr: (s: string) => void;
  onChangeParamYExpr: (s: string) => void;
  onChangeParamZExpr: (s: string) => void;
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
  onChangeDatasetKind,
  volumePresetId,
  volumePreset,
  volumeDims,
  volumeParams,
  volumeCustomExpr,
  volumeCustomError,
  volumeAxis,
  volumeIndex,
  volumeIndexMax,
  volumeOpacity,
  onChangeVolumePresetId,
  onChangeVolumeDim,
  onChangeVolumeParam,
  onChangeVolumeCustomExpr,
  onChangeVolumeAxis,
  onChangeVolumeIndex,
  onChangeVolumeOpacity,
  surfaceMeshLabel,
  surfaceMeshStats,
  surfaceMeshSource,
  surfaceMeshImportBusy,
  surfaceMeshImportError,
  surfaceMeshMergeVertices,
  surfaceMeshPresets,
  surfaceMeshExportable,
  onToggleSurfaceMeshMergeVertices,
  onGenerateSurfaceMeshPreset,
  onLoadSurfaceMeshFile,
  onExportSurfaceMesh,
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
  onChangeParamXExpr,
  onChangeParamYExpr,
  onChangeParamZExpr,
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
  const eqMeta = SURFACES_EQ_META.find((m) => m.id === surfaceId) ?? SURFACES_EQ_META[0];
  const paramMeta = PARAM_SURFACES_META.find((m) => m.id === paramId) ?? PARAM_SURFACES_META[0];
  const geodesicSmoothEnabled = viewerKind === "param" || viewerKind === "weierstrass";

  const isVolume = datasetKind === "volume";
  const isWeierstrass = viewerKind === "weierstrass";
  const isMeshViewer = viewerKind === "mesh";
  const isEqViewer = viewerKind === "implicit" || viewerKind === "graph";
  const meshMeta = {
    label: surfaceMeshLabel,
    formula: "Triangle surface mesh",
    note: "Imported or generated triangle mesh.",
  };
  const volumeMeta = {
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
  const volumeBounds = getVolumePresetBounds(volumePreset, volumeParams);

  const modeLabel =
    isVolume
      ? "volume grid (voxels)"
      : viewerKind === "implicit"
        ? "implicit surface  f(x,y,z) = 0"
        : viewerKind === "graph"
          ? "graph (explicit)  z = f(x,y)"
          : viewerKind === "weierstrass"
            ? "Weierstrass minimal surface  X(z) = Re integral Phi(z) dz"
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
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));
  const safeWeierstrassDomain = normalizeParamDomain(weierstrassDomain, WEIERSTRASS_DEFAULTS.domain);
  const colorModes: ColorMode[] =
    viewerKind === "param" || viewerKind === "weierstrass"
      ? ["solid", "height", "radius", "gaussian", "mean", "k1", "k2"]
      : viewerKind === "graph"
      ? ["solid", "height", "radius", "curvature"]
      : ["solid", "height", "radius"];
  const volumeParamDefs = volumePreset.params ?? [];
  const volumeShowCustom = volumePresetId === "custom";
  const volumeParamDecimals = (step: number) => {
    if (step >= 1) return 0;
    if (step >= 0.1) return 1;
    if (step >= 0.01) return 2;
    if (step >= 0.001) return 3;
    return 4;
  };
  const formatVolumeParam = (value: number, step: number) => value.toFixed(volumeParamDecimals(step));

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

      <div style={{ ...cardStyle, marginTop: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Dataset mode</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onChangeDatasetKind("surface")}
            style={pill(datasetKind === "surface")}
            aria-pressed={datasetKind === "surface"}
          >
            Surface
          </button>
          <button
            type="button"
            onClick={() => onChangeDatasetKind("volume")}
            style={pill(datasetKind === "volume")}
            aria-pressed={datasetKind === "volume"}
          >
            Volume
          </button>
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
          Surface datasets render triangle meshes. Volume datasets will use voxel grids.
        </div>
      </div>

      {datasetKind === "volume" && (
        <div style={{ ...cardStyle, marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Volume grid</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, minWidth: 160 }}>
              <span>Preset</span>
              <select
                value={volumePresetId}
                onChange={(e) => onChangeVolumePresetId(e.target.value as VolumePresetId)}
                style={{ fontSize: 11, padding: "2px 4px", minWidth: 160 }}
              >
                {VOLUME_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>

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

          {volumeParamDefs.length > 0 && (
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
              {volumeCustomError && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#b00020" }}>Error: {volumeCustomError}</div>
              )}
            </div>
          )}

          <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Volume slice</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Axis</span>
              <select
                value={volumeAxis}
                onChange={(e) => onChangeVolumeAxis(e.target.value as SliceAxis)}
                style={{ fontSize: 11, padding: "2px 4px", width: 80 }}
              >
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="z">Z</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span>Index</span>
              <input
                type="number"
                min={0}
                max={volumeIndexMax}
                value={volumeIndex}
                onChange={(e) => onChangeVolumeIndex(Number(e.target.value))}
                style={{ width: 90 }}
              />
            </label>

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
          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
            Source: {volumePreset.label} field sampled on {volumeDims[0]}x{volumeDims[1]}x{volumeDims[2]}. Bounds: x in [
            {fmtVal(volumeBounds.min[0])}, {fmtVal(volumeBounds.max[0])}], y in [{fmtVal(volumeBounds.min[1])},{" "}
            {fmtVal(volumeBounds.max[1])}], z in [{fmtVal(volumeBounds.min[2])}, {fmtVal(volumeBounds.max[2])}].
          </div>
        </div>
      )}

      <div style={{ ...cardStyle, marginTop: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>SurfaceMesh</div>
        {viewerKind !== "mesh" ? (
          <>
            <button
              type="button"
              onClick={onExportSurfaceMesh}
              disabled={!surfaceMeshExportable}
              style={{ padding: "4px 10px" }}
            >
              Export to SurfaceMesh
            </button>
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
              {surfaceMeshExportable
                ? "Convert the current surface triangles into SurfaceMesh mode."
                : viewerKind === "implicit"
                  ? "Run CGAL mesh first to export an implicit surface mesh."
                  : "Mesh export will enable once the surface is ready."}
            </div>
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
          </>
        )}
      </div>

      <div style={{ ...cardStyle, marginTop: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Python mesh ops (VTK)</div>
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

      {/* toggles */}
      <div style={{ marginTop: 6, marginBottom: 8, fontSize: 12 }}>
        <label style={{ display: "block", cursor: "pointer", marginBottom: 2 }}>
          <input type="checkbox" checked={showWireframe} onChange={onToggleWireframe} style={{ marginRight: 6 }} />
          Wireframe mesh
        </label>

        <label style={{ display: "block", cursor: "pointer" }}>
          <input type="checkbox" checked={showPlanes} onChange={onTogglePlanes} style={{ marginRight: 6 }} />
          Show coordinate planes (x=0, y=0, z=0)
        </label>

        <label style={{ display: "block", cursor: "pointer", marginTop: 2 }}>
          <input type="checkbox" checked={probeEnabled} onChange={onToggleProbe} style={{ marginRight: 6 }} />
          Probe mode: pick point on surface
        </label>

        <div style={{ marginLeft: 20, marginTop: 4, fontSize: 12 }}>
          <label style={{ display: "block", cursor: "pointer" }}>
            <input type="checkbox" checked={showProbeNormal} onChange={onToggleProbeNormal} style={{ marginRight: 6 }} />
            Show normal arrow
          </label>
          <label style={{ display: "block", cursor: "pointer" }}>
            <input type="checkbox" checked={showProbeTangentPlane} onChange={onToggleProbeTangentPlane} style={{ marginRight: 6 }} />
            Show tangent plane
          </label>
          <label style={{ display: "block", cursor: "pointer" }}>
            <input type="checkbox" checked={showProbeTangents} onChange={onToggleProbeTangents} style={{ marginRight: 6 }} />
            Show tangent directions
          </label>
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
                viewerKind === "mesh";
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
                viewerKind === "mesh";
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
        {viewerKind === "mesh" && (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            SurfaceMesh presets and import live in the left panel.
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
  const isMeshViewer = viewerKind === "mesh";
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
