// src/App.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uiStyles as styles } from "./uiStyles";

import MobiusScreen from "./screens/MobiusScreen";
import { ChebyshevScreen } from "./screens/ChebyshevScreen";

import { PlanePlot, type PlanePlotHandle } from "./components/PlanePlot";
import TabButton from "./components/TabButton";
import GaussMapPanel from "./components/GaussMapPanel";
import { SelectionStatsPanel } from "./components/SelectionStatsPanel";

import {
  SurfaceViewer,
  type SurfaceId,
  type ColorMode,
  type ProbeInfo,
} from "./components/SurfaceViewer";

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
import { computeSelectionStats, type SelectionMetricKey } from "./math/selection/selectionStats";

import type { MobiusParams } from "./math/mobius";
import { computeGraphInvariantsFromProbe, type CurvatureData } from "./math/surfaceInvariants";
import type { PrincipalCurvatureScalars } from "./math/principalCurvature";
import { computeWeierstrassDrift, type WeierstrassDriftResult } from "./math/weierstrass";
import { WEIERSTRASS_PRESETS, type WeierstrassPreset } from "./math/weierstrassPresets";
/* ---------------- App modes ---------------- */

type Mode = "mobius" | "chebyshev" | "transform" | "maps" | "surfaces";
type SurfaceViewerKind = "implicit" | "graph" | "param" | "weierstrass";
type GraphDomain = { xSpan: number; ySpan: number };
type ImplicitDomain = { xSpan: number; ySpan: number };
type ParamDomain = { uMin: number; uMax: number; vMin: number; vMax: number };
type CameraSyncState = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
};

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

const WEIERSTRASS_META = {
  label: "Weierstrass",
  formula: "X(z) = Re integral Phi(z) dz",
  note: "Minimal surface from Weierstrass data g(z), phi(z).",
};

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

function isImplicitSurface(id: SurfaceId): boolean {
  return !isGraphSurface(id);
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
  const [gaussHoverIndex, setGaussHoverIndex] = useState<number | null>(null);
  const [surfaceSampleSet, setSurfaceSampleSet] = useState<SurfaceSampleSet | null>(null);
  const [selection, setSelection] = useState<RegionSelection | null>(null);
  const [selectionMask, setSelectionMask] = useState<SelectionMask | null>(null);
  const [selectionRadius, setSelectionRadius] = useState(0.4);
  const [selectionUseUV, setSelectionUseUV] = useState(false);
  const [selectRegionEnabled, setSelectRegionEnabled] = useState(false);
  const [selectionOverlayVisible, setSelectionOverlayVisible] = useState(true);
  const [selectionOverlayOnTop, setSelectionOverlayOnTop] = useState(false);
  const [selectionSphereVisible, setSelectionSphereVisible] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<SelectionMetricKey>("K");
  const surfaceHasUV = surfaceSampleSet?.samples.some((s) => !!s.uv) ?? false;
  useEffect(() => {
    if (!surfaceHasUV && selectionUseUV) {
      setSelectionUseUV(false);
    }
  }, [surfaceHasUV, selectionUseUV]);

  useEffect(() => {
    if (!selection || selection.kind !== "surfaceDisk") return;
    if (selection.radius === selectionRadius) return;
    setSelection({ ...selection, radius: selectionRadius });
  }, [selection, selectionRadius]);

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
  const [paramResolution, setParamResolution] = useState(64);
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
  const activeEqSurfaceId = surfaceViewerKind === "graph" ? graphSurfaceId : implicitSurfaceId;
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
    if (kind === "weierstrass") {
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

  const handleSurfaceSelectionPick = useCallback(
    (payload: {
      point: { x: number; y: number; z: number };
      normal: { x: number; y: number; z: number };
      uv?: { u: number; v: number };
    }) => {
      if (!selectRegionEnabled) return;
      console.log("[App] surface selection pick", {
        point: payload.point,
        normal: payload.normal,
        uv: payload.uv,
        selectionRadius,
        selectionUseUV,
      });
      const nextSelection: RegionSelection =
        selectionUseUV && payload.uv
          ? {
              kind: "surfaceDisk",
              centerUV: payload.uv,
              radius: selectionRadius,
              useUV: true,
            }
          : {
              kind: "surfaceDisk",
              centerWorld: { x: payload.point.x, y: payload.point.y, z: payload.point.z },
              radius: selectionRadius,
            };
      setSelection(nextSelection);
    },
    [selectRegionEnabled, selectionRadius, selectionUseUV]
  );

  const handleClearSelection = useCallback(() => {
    setSelection(null);
    setSelectionMask(null);
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
    const mask = computeSelectionMask(surfaceSampleSet.samples, selection);
    console.log("[App] computed selection mask", {
      count: mask.count,
      totalSamples: surfaceSampleSet.samples.length,
      selection: selection.kind,
      radius: selection.kind === "surfaceDisk" ? selection.radius : undefined,
    });
    setSelectionMask(mask);
  }, [surfaceSampleSet, selection]);

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
  }, [selectionBaseArrays, selectionIndices, selectionCurvatures, selectedMetric]);

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
        return say("Usage: surface implicit|graph|param <id>");
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
              weierstrassGExpr={weierstrassGExpr}
              weierstrassPhiExpr={weierstrassPhiExpr}
              onChangeWeierstrassGExpr={setWeierstrassGExpr}
              onChangeWeierstrassPhiExpr={setWeierstrassPhiExpr}
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
                activeWeierstrassPreset={activeWeierstrassPreset}
                onApplyWeierstrassPreset={applyWeierstrassPreset}
                onApplySuggestedDomain={applySuggestedDomain}
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
                selectionRadius={selectionRadius}
                onSetSelectionRadius={setSelectionRadius}
                selectionUseUV={selectionUseUV}
                selectionHasUV={surfaceHasUV}
                onToggleSelectionUseUV={toggleSelectionUseUV}
                onClearSelection={handleClearSelection}
                selectionMaskCount={selectionMask?.count ?? 0}
                selectionOverlayVisible={selectionOverlayVisible}
                onToggleSelectionOverlayVisible={() => setSelectionOverlayVisible((v) => !v)}
                selectionOverlayOnTop={selectionOverlayOnTop}
                onToggleSelectionOverlayOnTop={() => setSelectionOverlayOnTop((v) => !v)}
                selectionSphereVisible={selectionSphereVisible}
                onToggleSelectionSphereVisible={() => setSelectionSphereVisible((v) => !v)}
                commandInput={commandInput}
                onChangeCommandInput={setCommandInput}
                onRunCommand={handleRunCommand}
                commandHistory={commandHistory}
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
                          selectionOverlayVisible={selectionOverlayVisible}
                          selectionOverlayOnTop={selectionOverlayOnTop}
                          selectionSphere={selectionSphere}
                            weierstrassDiagnostics={
                              surfaceViewerKind === "weierstrass" ? weierstrassDiagnostics : null
                            }
                            showDriftArrow={surfaceViewerKind === "weierstrass" ? showDriftArrow : false}
                          />
                        ) : (
                        <SurfaceViewer
                            surfaceId={activeEqSurfaceId}
                            graphExpr={graphExpr}
                            implicitExpr={implicitExpr}
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
                          selectionOverlayVisible={selectionOverlayVisible}
                          selectionOverlayOnTop={selectionOverlayOnTop}
                          selectionSphere={selectionSphere}
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
                        onPointHover={(idx) => setGaussHoverIndex(idx)}
                        height={280}
                        selectionMask={selectionMask}
                        onGaussSelection={handleGaussSelection}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div onMouseDown={startDragRight} style={splitterStyle} />

            {/* RIGHT */}
            <div style={{ ...styles.panelLeft, width: rightWidth, maxWidth: maxRight }}>
              <SurfacesRightPanel
                viewerKind={surfaceViewerKind}
                surfaceId={activeEqSurfaceId}
                paramId={paramSurfaceId}
                onPickEqSurface={handlePickEqSurface}
                onPickParamSurface={handlePickParamSurface}
                implicitExpr={implicitExpr}
                onChangeImplicitExpr={setImplicitExpr}
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
                weierstrassDiagnostics={weierstrassDiagnostics}
                weierstrassDiagnosticError={weierstrassDiagnosticError}
                showDriftArrow={showDriftArrow}
                onToggleDriftArrow={toggleDriftArrow}
                onRecomputeDiagnostics={recomputeWeierstrassDiagnostics}
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
  weierstrassGExpr: string;
  weierstrassPhiExpr: string;
  onChangeWeierstrassGExpr: (v: string) => void;
  onChangeWeierstrassPhiExpr: (v: string) => void;
  activeWeierstrassPreset: WeierstrassPreset | null;
  onApplyWeierstrassPreset: (preset: WeierstrassPreset) => void;
  onApplySuggestedDomain: (preset: WeierstrassPreset) => void;
  compareEnabled: boolean;
  onToggleCompare: () => void;
  compareSurfaceId: SurfaceId;
  onChangeCompareSurface: (s: SurfaceId) => void;
  compareParamId: ParamSurfaceId;
  onChangeCompareParamId: (p: ParamSurfaceId) => void;
};

const SurfacesControls: React.FC<SurfacesControlsProps> = ({
  viewerKind,
  onChangeViewerKind,
  surfaceId,
  onChangeSurface,
  paramId,
  onChangeParamId,
  weierstrassGExpr,
  weierstrassPhiExpr,
  onChangeWeierstrassGExpr,
  onChangeWeierstrassPhiExpr,
  activeWeierstrassPreset,
  onApplyWeierstrassPreset,
  onApplySuggestedDomain,
  compareEnabled,
  onToggleCompare,
  compareSurfaceId,
  onChangeCompareSurface,
  compareParamId,
  onChangeCompareParamId,
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
            disabled={viewerKind === "weierstrass"}
          />
          Compare
        </label>
      </div>

      {compareEnabled && (
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
  activeWeierstrassPreset: WeierstrassPreset | null;
  onApplyWeierstrassPreset: (preset: WeierstrassPreset) => void;
  onApplySuggestedDomain: (preset: WeierstrassPreset) => void;

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
  selectionRadius: number;
  onSetSelectionRadius: (value: number) => void;
  selectionUseUV: boolean;
  selectionHasUV: boolean;
  onToggleSelectionUseUV: () => void;
  onClearSelection: () => void;
  selectionMaskCount: number;
  selectionOverlayVisible: boolean;
  onToggleSelectionOverlayVisible: () => void;
  selectionOverlayOnTop: boolean;
  onToggleSelectionOverlayOnTop: () => void;
  selectionSphereVisible: boolean;
  onToggleSelectionSphereVisible: () => void;

  // contours (graph surfaces)
  showContours: boolean;
  onToggleContours: () => void;
  contourCount: number;
  onSetContourCount: (n: number) => void;

  commandInput: string;
  onChangeCommandInput: (v: string) => void;
  onRunCommand: (cmd: string) => void;
  commandHistory: { cmd: string; out: string }[];

};

const SurfacesLeftPanel: React.FC<SurfacesLeftPanelProps> = ({
  viewerKind,
  surfaceId,
  paramId,
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
  activeWeierstrassPreset,
  onApplyWeierstrassPreset,
  onApplySuggestedDomain,
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
  selectionRadius,
  onSetSelectionRadius,
  selectionUseUV,
  selectionHasUV,
  onToggleSelectionUseUV,
  onClearSelection,
  selectionMaskCount,
  selectionOverlayVisible,
  onToggleSelectionOverlayVisible,
  selectionOverlayOnTop,
  onToggleSelectionOverlayOnTop,
  selectionSphereVisible,
  onToggleSelectionSphereVisible,
  showContours,
  onToggleContours,
  contourCount,
  onSetContourCount,
  commandInput,
  onChangeCommandInput,
  onRunCommand,
  commandHistory,
  weierstrassDiagnostics,
  weierstrassPathDisagreement,
  weierstrassDiagnosticError,
  showDriftArrow,
  onToggleDriftArrow,
  onRecomputeDiagnostics,
}) => {
  const eqMeta = SURFACES_EQ_META.find((m) => m.id === surfaceId) ?? SURFACES_EQ_META[0];
  const paramMeta = PARAM_SURFACES_META.find((m) => m.id === paramId) ?? PARAM_SURFACES_META[0];

  const isWeierstrass = viewerKind === "weierstrass";
  const isEqViewer = viewerKind === "implicit" || viewerKind === "graph";
  const activeMeta = isWeierstrass ? WEIERSTRASS_META : isEqViewer ? eqMeta : paramMeta;
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

  const modeLabel =
    viewerKind === "implicit"
      ? "implicit surface  f(x,y,z) = 0"
      : viewerKind === "graph"
        ? "graph (explicit)  z = f(x,y)"
        : viewerKind === "weierstrass"
          ? "Weierstrass minimal surface  X(z) = Re integral Phi(z) dz"
          : "parametric surface  σ(u,v)";

  const isGraphCustom = viewerKind === "graph" && surfaceId === "graph_custom";
  const isImplicitCustom = viewerKind === "implicit" && surfaceId === "implicit_custom";
  const isParamCustom = viewerKind === "param" && paramId === "custom";
  const isGraphAny = viewerKind === "graph" && isGraphSurface(surfaceId);
  const isImplicitAny = viewerKind === "implicit" && !isGraphSurface(surfaceId);
  const [leftTab, setLeftTab] = useState<"controls" | "theory">("controls");
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));
  const safeWeierstrassDomain = normalizeParamDomain(weierstrassDomain, WEIERSTRASS_DEFAULTS.domain);
  const colorModes: ColorMode[] =
    viewerKind === "param" || viewerKind === "weierstrass"
      ? ["solid", "height", "radius", "gaussian", "mean", "k1", "k2"]
      : viewerKind === "graph"
      ? ["solid", "height", "radius", "curvature"]
      : ["solid", "height", "radius"];

  return (
    <section>
      <h2 style={styles.h2}>Surface viewer (three.js)</h2>
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
            </div>
          )}
        </div>

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
                  cursor: selectionHasUV ? "pointer" : "not-allowed",
                  color: selectionHasUV ? "#000" : "#999",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectionUseUV}
                  onChange={onToggleSelectionUseUV}
                  disabled={!selectionHasUV}
                  style={{ marginRight: 6 }}
                />
                Use UV
              </label>
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
                <SelectionStatsPanel
                  stats={selectionStats}
                  availableMetrics={availableSelectionMetrics}
                  selectedMetric={availableSelectionMetrics.length ? selectedMetric : null}
                  onSelectedMetricChange={setSelectedMetric}
                />
              </div>
            </details>
          )}
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
              max={160}
              step={1}
              value={paramResolution}
              onChange={(e) => onSetParamResolution(clampInt(Number(e.target.value), 20, 160))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={20}
              max={200}
              step={1}
              value={paramResolution}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onSetParamResolution(clampInt(v, 20, 200));
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

  onPickEqSurface: (id: SurfaceId) => void;
  onPickParamSurface: (id: ParamSurfaceId) => void;

  implicitExpr: string;
  onChangeImplicitExpr: (s: string) => void;

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
  weierstrassDiagnostics: WeierstrassDriftResult | null;
  weierstrassDiagnosticError: string | null;
  showDriftArrow: boolean;
  onToggleDriftArrow: () => void;
  onRecomputeDiagnostics: () => void;
};

const SurfacesRightPanel: React.FC<SurfacesRightPanelProps> = ({
  viewerKind,
  surfaceId,
  paramId,
  onPickEqSurface,
  onPickParamSurface,
  implicitExpr,
  onChangeImplicitExpr,
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
  weierstrassDiagnostics,
  weierstrassDiagnosticError,
  showDriftArrow,
  onToggleDriftArrow,
  onRecomputeDiagnostics,
}) => {
  const eqMeta = SURFACES_EQ_META.find((m) => m.id === surfaceId) ?? SURFACES_EQ_META[0];
  const paramMeta = PARAM_SURFACES_META.find((m) => m.id === paramId) ?? PARAM_SURFACES_META[0];

  const isImplicitCustom = viewerKind === "implicit" && surfaceId === "implicit_custom";
  const isWeierstrass = viewerKind === "weierstrass";
  const isGraphViewer = viewerKind === "graph";
  const isParamViewer = viewerKind === "param" || isWeierstrass;
  const isImplicitViewer = viewerKind === "implicit";
  const isEqViewer = isGraphViewer || isImplicitViewer;
  const showDomainPicker = isGraphViewer || isParamViewer || isImplicitViewer;

  const [graphDomainLabel, setGraphDomainLabel] = useState("");
  const [implicitDomainLabel, setImplicitDomainLabel] = useState("");
  const [paramDomainLabel, setParamDomainLabel] = useState("");

  const paramDefaults = isWeierstrass ? WEIERSTRASS_DEFAULTS.domain : getParamDomainPreviewBounds(paramId);
  const safeGraphDomain = normalizeGraphDomain(graphDomain, getDefaultGraphSpan(surfaceId));
  const safeParamDomain = normalizeParamDomain(paramDomain, paramDefaults);
  const safeImplicitDomain = normalizeImplicitDomain(implicitDomain, getDefaultImplicitDomain(surfaceId));
  const activeMeta = isWeierstrass ? WEIERSTRASS_META : isParamViewer ? paramMeta : eqMeta;


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
      </div>

      {/* Domain picker */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Pick a domain point</div>

        {!showDomainPicker ? (
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            Domain picking is available for graph, param, and Weierstrass surfaces. Use probe mode to pick points on implicit surfaces.
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

type ImplicitDomainPreviewProps = {
  width: number;
  height: number;
  xSpan: number; // x in [-xSpan, xSpan]
  zSpan: number; // z in [-zSpan, zSpan]
  yValue?: number;
  onPick: (xyz: { x: number; y: number; z: number }) => void;
  picked?: { x: number; y: number; z: number } | null;
};

const ImplicitDomainPreview: React.FC<ImplicitDomainPreviewProps> = ({
  width,
  height,
  xSpan,
  zSpan,
  yValue,
  onPick,
  picked: pickedProp,
}) => {
  const [picked, setPicked] = useState<{ x: number; y: number; z: number } | null>(null);
  const [y, setY] = useState(Number.isFinite(yValue ?? 0) ? (yValue as number) : 0);

  useEffect(() => {
    if (pickedProp) setPicked(pickedProp);
  }, [pickedProp?.x, pickedProp?.y, pickedProp?.z]);

  useEffect(() => {
    if (Number.isFinite(yValue ?? 0)) setY(yValue as number);
  }, [yValue]);

  const safeXSpan = Number.isFinite(xSpan) && xSpan > 0 ? xSpan : 1;
  const safeZSpan = Number.isFinite(zSpan) && zSpan > 0 ? zSpan : 1;

  const pad = 12;
  const w = width;
  const h = height;

  const toXZ = (clientX: number, clientY: number, svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    const px = (clientX - r.left - pad) / (r.width - 2 * pad);
    const py = (clientY - r.top - pad) / (r.height - 2 * pad);
    const x = (px * 2 - 1) * safeXSpan;
    const z = (1 - py * 2) * safeZSpan;
    return { x, z };
  };

  const toPx = (x: number, z: number) => {
    const px = pad + ((x / safeXSpan + 1) * 0.5) * (w - 2 * pad);
    const py = pad + ((1 - (z / safeZSpan + 1) * 0.5) * (h - 2 * pad));
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
          const xz = toXZ(e.clientX, e.clientY, svg);
          const next = { x: xz.x, y, z: xz.z };
          setPicked(next);
          onPick(next);
        }}
      >
        <rect x={0} y={0} width={w} height={h} fill="#ffffff" />
        <rect x={pad} y={pad} width={w - 2 * pad} height={h - 2 * pad} fill="#fbfbfd" stroke="#e8e8ee" />

        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const t = i / gridLines;
          const x = pad + t * (w - 2 * pad);
          const y0 = pad + t * (h - 2 * pad);
          return (
            <g key={i}>
              <line x1={x} y1={pad} x2={x} y2={h - pad} stroke="#eee" />
              <line x1={pad} y1={y0} x2={w - pad} y2={y0} stroke="#eee" />
            </g>
          );
        })}

        {(() => {
          const o = toPx(0, 0);
          return (
            <g>
              <line x1={pad} y1={o.py} x2={w - pad} y2={o.py} stroke="#bbb" />
              <line x1={o.px} y1={pad} x2={o.px} y2={h - pad} stroke="#bbb" />
            </g>
          );
        })()}

        {picked && (() => {
          const p = toPx(picked.x, picked.z);
          return (
            <g>
              <circle cx={p.px} cy={p.py} r={5} fill="#ff3b30" />
              <circle cx={p.px} cy={p.py} r={9} fill="none" stroke="#ff3b30" opacity={0.5} />
            </g>
          );
        })()}
      </svg>

      <div style={{ padding: "8px 10px", fontSize: 11, borderTop: "1px solid #eee", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ opacity: 0.75 }}>x ±{safeXSpan.toFixed(2)}  z ±{safeZSpan.toFixed(2)}</span>
          <span style={{ fontFamily: "monospace" }}>
            {picked ? `(${fmt(picked.x)}, ${fmt(picked.z)})` : "(click)"}
          </span>
        </div>
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 8 }}>
          y
          <input
            type="number"
            step={0.1}
            value={Number.isFinite(y) ? y : 0}
            onChange={(e) => setY(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </label>
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

const paramsToM = (p: MobiusParams): M2 => ({ a: p.a, b: p.b, c: p.c, d: p.d });
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

