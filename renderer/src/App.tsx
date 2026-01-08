// src/App.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uiStyles as styles } from "./uiStyles";

import MobiusScreen from "./screens/MobiusScreen";
import { ChebyshevScreen } from "./screens/ChebyshevScreen";

import { PlanePlot, type PlanePlotHandle } from "./components/PlanePlot";
import TabButton from "./components/TabButton";

import {
  SurfaceViewer,
  type SurfaceId,
  type ColorMode,
  type ColorPalette,
  type ProbeInfo,
  type SlicePreset,
  type SliceNormal,
} from "./components/SurfaceViewer";

import { ParamSurfaceViewer, type ParamSurfaceId } from "./components/ParamSurfaceViewer";

import { renderMobius } from "./d3/MobiusRenderer";
import { renderChebyshev } from "./d3/ChebyshevRenderer";
import { renderTransform, type TransformPrimitive } from "./d3/TransformRenderer";
import { renderStandardMap, type MapId } from "./d3/StandardMapRenderer";

import type { MobiusParams } from "./math/mobius";
import { computeGraphInvariantsFromProbe, type CurvatureData } from "./math/surfaceInvariants";

/* ---------------- App modes ---------------- */

type Mode = "mobius" | "chebyshev" | "transform" | "maps" | "surfaces";
type SurfaceViewerKind = "implicit" | "graph" | "param";

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

    // graph surfaces
    { id: "graph_saddle", label: "Saddle graph", formula: "z = x² − y²", note: "Classical saddle; negative curvature at the origin." },
    { id: "graph_rotatedSaddle", label: "Rotated saddle", formula: "z = 2xy", note: "Same as x² − y² rotated by 45°." },
    { id: "graph_monkey", label: "Monkey saddle", formula: "z = x³ − 3xy²", note: "Saddle with 3 valleys; higher-order critical point." },
    { id: "graph_wave", label: "Wave", formula: "z = sin x · cos y", note: "Periodic surface; good for gradients." },
    { id: "graph_custom", label: "Custom graph", formula: "z = f(x, y)", note: "User-defined graph expression in x,y." },

    // implicit custom
    { id: "implicit_custom", label: "Implicit surface", formula: "f(x, y, z) = 0", note: "Level set of an equation." },
  ];

const GRAPH_SURFACE_IDS: SurfaceId[] = [
  "graph_saddle",
  "graph_rotatedSaddle",
  "graph_monkey",
  "graph_wave",
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
    { id: "torus", label: "Torus", formula: "σ(u,v) = ((R + r cos v) cos u, (R + r cos v) sin u, r sin v)", note: "Donut surface." },
    { id: "mobius", label: "Möbius strip", formula: "σ(u,v) ≈ ((1 + v/2 cos(u/2)) cos u, …)", note: "Non-orientable strip." },
    { id: "kleinBottle", label: "Klein bottle", formula: "σ(u,v) = immersion in ℝ³ (self-intersecting)", note: "Embedding needs ℝ⁴." },
    { id: "hyperbolicParaboloid", label: "Hyperbolic paraboloid", formula: "σ(u,v) = (u, v, u v)", note: "Saddle; ruled (two families)." },
    { id: "enneper", label: "Enneper surface", formula: "σ(u,v) = (u − u³/3 + u v², v − v³/3 + v u², u² − v²)", note: "Minimal; self-intersections." },
      { id: "expCone", label: "Exp cone", formula: "σ(u,v) = (e^u cos v, e^u sin v, u)", note: "u>0; v is angle." },

  { id: "helicoidUV", label: "Helicoid (u,v)", formula: "σ(u,v) = (u cos v, u sin v, v)", note: "v is angle + height; use a few turns (no wrapV)." },

    { id: "custom", label: "Custom σ(u,v)", formula: "σ(u,v) = (X(u,v), Y(u,v), Z(u,v))", note: "User-defined parametrisation." },
  ];

function getParamDomainPreviewBounds(id: ParamSurfaceId) {
  // keep these consistent with ParamSurfaceViewer's domain switch
  switch (id) {
    case "expCone":
      return { uMin: 0.15, uMax: 2.8, vMin: 0, vMax: 2 * Math.PI };

    case "helicoidUV":
      return { uMin: 0, uMax: 1.8, vMin: 0, vMax: 6 * Math.PI };

    // defaults for everything else (safe generic)
    default:
      return { uMin: -Math.PI, uMax: Math.PI, vMin: -1, vMax: 1 };
  }
}

/* ---------------- small helpers ---------------- */

const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : String(x));
const fmt3 = (v: { x: number; y: number; z: number }) => `(${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)})`;

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

  // formulas for custom modes
  const [graphExpr, setGraphExpr] = useState("x*x - y*y"); // z=f(x,y)
  const [implicitExpr, setImplicitExpr] = useState("x*x + y*y + z*z - 1"); // f=0

  // custom parametric σ(u,v)
  const [paramXExpr, setParamXExpr] = useState("u");
  const [paramYExpr, setParamYExpr] = useState("v");
  const [paramZExpr, setParamZExpr] = useState("0");

  // 3D visual toggles
  const [showWireframe, setShowWireframe] = useState(false);
  const [showPlanes, setShowPlanes] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>("solid");
  const [colorPalette, setColorPalette] = useState<ColorPalette>("blueRed");
  const [showBoundingBox, setShowBoundingBox] = useState(false);
  const [cameraResetToken, setCameraResetToken] = useState(0);

  // probe
  const [probeEnabled, setProbeEnabled] = useState(false);
  const [probeInfo, setProbeInfo] = useState<ProbeInfo | null>(null);
  const [probeCurv, setProbeCurv] = useState<CurvatureData | null>(null);

  // domain pick tokens (right panel)
  const [paramProbeUV, setParamProbeUV] = useState<{ u: number; v: number } | null>(null);
  const [paramProbeToken, setParamProbeToken] = useState(0);
  const [graphProbeXY, setGraphProbeXY] = useState<{ x: number; y: number } | null>(null);
  const [graphProbeToken, setGraphProbeToken] = useState(0);

  // contours (graph mode)
  const [showContours, setShowContours] = useState(true);
  const [contourCount, setContourCount] = useState(12);

  // slicing (multi-plane)
  const [sliceEnabled, setSliceEnabled] = useState(false);
  const [sliceShowPlane, setSliceShowPlane] = useState(true);
  const [sliceShowSheet, setSliceShowSheet] = useState(true);
  const [sliceThickness, setSliceThickness] = useState(0);
  const [sliceSheetOpacity, setSliceSheetOpacity] = useState(0.12);

  const [sliceLineColorMode, setSliceLineColorMode] = useState<"solid" | "height" | "arclen">("solid");
  const [sliceLinePalette, setSliceLinePalette] = useState<"blueRed" | "rainbow" | "grayscale">("rainbow");

  // multi-plane toggles + offsets
  const [sliceXY, setSliceXY] = useState(true);
  const [sliceYZ, setSliceYZ] = useState(false);
  const [sliceXZ, setSliceXZ] = useState(false);

  const [sliceXYOffset, setSliceXYOffset] = useState(0);
  const [sliceYZOffset, setSliceYZOffset] = useState(0);
  const [sliceXZOffset, setSliceXZOffset] = useState(0);

  // legacy single-plane controls (kept for compatibility if SurfaceViewer expects them)
  const [slicePreset, setSlicePreset] = useState<SlicePreset>("xy");
  const [sliceOffset, setSliceOffset] = useState(0);
  const [sliceNormal, setSliceNormal] = useState<SliceNormal>({ x: 0, y: 0, z: 1 });

  // active equation surface id (single truth)
  const activeEqSurfaceId = surfaceViewerKind === "graph" ? graphSurfaceId : implicitSurfaceId;

  // build slicePlanes ONCE (App is the single source of truth)
  const slicePlanes = useMemo(
    () =>
    ([
      sliceXY ? { preset: "xy" as const, offset: sliceXYOffset, normal: { x: 0, y: 0, z: 1 } } : null,
      sliceYZ ? { preset: "yz" as const, offset: sliceYZOffset, normal: { x: 1, y: 0, z: 0 } } : null,
      sliceXZ ? { preset: "xz" as const, offset: sliceXZOffset, normal: { x: 0, y: 1, z: 0 } } : null,
    ].filter(Boolean) as {
      preset: "xy" | "yz" | "xz";
      offset: number;
      normal: { x: number; y: number; z: number };
    }[]),
    [sliceXY, sliceYZ, sliceXZ, sliceXYOffset, sliceYZOffset, sliceXZOffset]
  );

  const snapSlicesToProbe = useCallback(() => {
    if (!probeInfo) return;
    const { x, y, z } = probeInfo.point;
    if (sliceXY) setSliceXYOffset(z);
    if (sliceYZ) setSliceYZOffset(x);
    if (sliceXZ) setSliceXZOffset(y);
  }, [probeInfo, sliceXY, sliceYZ, sliceXZ]);

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
    if (surfaceViewerKind !== "param" && PARAM_CURVATURE_COLOR_MODES.includes(colorMode)) {
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
    setGraphProbeXY(null);
    setParamProbeUV(null);
  }, [activeEqSurfaceId, paramSurfaceId, surfaceViewerKind, colorMode]);

  useEffect(() => {
    if (!probeEnabled) {
      setProbeInfo(null);
      setProbeCurv(null);
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
              onChangeViewerKind={setSurfaceViewerKind}
              surfaceId={activeEqSurfaceId}
              onChangeSurface={handlePickEqSurface}
              paramId={paramSurfaceId}
              onChangeParamId={setParamSurfaceId}
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
                showWireframe={showWireframe}
                onToggleWireframe={() => setShowWireframe((w) => !w)}
                showPlanes={showPlanes}
                onTogglePlanes={() => setShowPlanes((p) => !p)}
                colorMode={colorMode}
                onChangeColorMode={setColorMode}
                colorPalette={colorPalette}
                onChangeColorPalette={setColorPalette}
                probeEnabled={probeEnabled}
                onToggleProbe={() => setProbeEnabled((p) => !p)}
                showBoundingBox={showBoundingBox}
                onToggleBoundingBox={() => setShowBoundingBox((b) => !b)}
                onResetCamera={() => setCameraResetToken((t) => t + 1)}
                probeInfo={probeInfo}
                onSnapSlicesToProbe={snapSlicesToProbe}
                // contours
                showContours={showContours}
                onToggleContours={() => setShowContours((v) => !v)}
                contourCount={contourCount}
                onSetContourCount={setContourCount}
                // slicing
                sliceEnabled={sliceEnabled}
                onSetSliceEnabled={setSliceEnabled}
                sliceShowPlane={sliceShowPlane}
                onSetSliceShowPlane={setSliceShowPlane}
                sliceShowSheet={sliceShowSheet}
                onSetSliceShowSheet={setSliceShowSheet}
                sliceThickness={sliceThickness}
                onSetSliceThickness={setSliceThickness}
                sliceSheetOpacity={sliceSheetOpacity}
                onSetSliceSheetOpacity={setSliceSheetOpacity}
                sliceLineColorMode={sliceLineColorMode}
                onSetSliceLineColorMode={setSliceLineColorMode}
                sliceLinePalette={sliceLinePalette}
                onSetSliceLinePalette={setSliceLinePalette}
                sliceXY={sliceXY}
                onSetSliceXY={setSliceXY}
                sliceYZ={sliceYZ}
                onSetSliceYZ={setSliceYZ}
                sliceXZ={sliceXZ}
                onSetSliceXZ={setSliceXZ}
                sliceXYOffset={sliceXYOffset}
                onSetSliceXYOffset={setSliceXYOffset}
                sliceYZOffset={sliceYZOffset}
                onSetSliceYZOffset={setSliceYZOffset}
                sliceXZOffset={sliceXZOffset}
                onSetSliceXZOffset={setSliceXZOffset}
                // legacy
                slicePreset={slicePreset}
                onSetSlicePreset={setSlicePreset}
                sliceOffset={sliceOffset}
                onSetSliceOffset={setSliceOffset}
                sliceNormal={sliceNormal}
                onSetSliceNormal={setSliceNormal}
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
                }}
              >
                {surfaceViewerKind === "param" ? (
                  <ParamSurfaceViewer
                    surfaceId={paramSurfaceId}
                    customX={paramXExpr}
                    customY={paramYExpr}
                    customZ={paramZExpr}
                    wireframe={showWireframe}
                    showPlanes={showPlanes}
                    colorMode={colorMode}
                    colorPalette={colorPalette}
                    probeEnabled={probeEnabled}
                    showBoundingBox={showBoundingBox}
                    resetToken={cameraResetToken}
                    onProbe={handleProbe}
                    paramProbeUV={paramProbeUV}
                    paramProbeToken={paramProbeToken}
                    sliceEnabled={sliceEnabled}
                    slicePreset={slicePreset}
                    sliceOffset={sliceOffset}
                    sliceNormal={sliceNormal}
                    sliceShowPlane={sliceShowPlane}
                    sliceShowSheet={sliceShowSheet}
                    sliceThickness={sliceThickness}
                    slicePlanes={slicePlanes}
                    sliceLineColorMode={sliceLineColorMode}
                    sliceLinePalette={sliceLinePalette}
                    sliceSheetOpacity={sliceSheetOpacity}
                    onSetCustomX={setParamXExpr}
                    onSetCustomY={setParamYExpr}
                    onSetCustomZ={setParamZExpr}
                  />
                ) : (
                  <SurfaceViewer
                    surfaceId={activeEqSurfaceId}
                    graphExpr={graphExpr}
                    implicitExpr={implicitExpr}
                    wireframe={showWireframe}
                    showPlanes={showPlanes}
                    colorMode={colorMode}
                    colorPalette={colorPalette}
                    showBoundingBox={showBoundingBox}
                    resetToken={cameraResetToken}
                    graphProbeXY={graphProbeXY}
                    graphProbeToken={graphProbeToken}
                    probeEnabled={probeEnabled}
                    onProbe={handleProbe}
                    onSetGraphExpr={setGraphExpr}
                    onSetImplicitExpr={setImplicitExpr}
                    // contours (remove if SurfaceViewer doesn’t support yet)
                    showContours={showContours}
                    contourCount={contourCount}
                    // slicing
                    sliceEnabled={sliceEnabled}
                    sliceShowPlane={sliceShowPlane}
                    sliceShowSheet={sliceShowSheet}
                    sliceThickness={sliceThickness}
                    sliceSheetOpacity={sliceSheetOpacity}
                    sliceLineColorMode={sliceLineColorMode}
                    sliceLinePalette={sliceLinePalette}
                    slicePlanes={slicePlanes}
                    // legacy
                    slicePreset={slicePreset}
                    sliceOffset={sliceOffset}
                    sliceNormal={sliceNormal}
                  />
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
                onPickEqSurface={handlePickEqSurface}
                onPickParamSurface={handlePickParamSurface}
                implicitExpr={implicitExpr}
                onChangeImplicitExpr={setImplicitExpr}
                probeInfo={probeInfo}
                probeCurv={probeCurv}
                onPickDomainUV={(uv) => {
                  setParamProbeUV(uv);
                  setParamProbeToken((t) => t + 1);
                }}
                onPickDomainXY={(xy) => {
                  setGraphProbeXY(xy);
                  setGraphProbeToken((t) => t + 1);
                }}
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
};

const SurfacesControls: React.FC<SurfacesControlsProps> = ({
  viewerKind,
  onChangeViewerKind,
  surfaceId,
  onChangeSurface,
  paramId,
  onChangeParamId,
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
      </div>

      <div style={{ flex: 1 }}>
        {viewerKind === "implicit" && (
          <SurfacesButtons surfaceId={surfaceId} surfaces={implicitSurfaces} onChangeSurface={onChangeSurface} />
        )}
        {viewerKind === "graph" && <SurfacesButtons surfaceId={surfaceId} surfaces={graphSurfaces} onChangeSurface={onChangeSurface} />}
        {viewerKind === "param" && <ParamSurfacesButtons paramId={paramId} onChangeParamId={onChangeParamId} />}
      </div>
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

  showWireframe: boolean;
  onToggleWireframe: () => void;
  showPlanes: boolean;
  onTogglePlanes: () => void;

  colorMode: ColorMode;
  onChangeColorMode: (m: ColorMode) => void;
  colorPalette: ColorPalette;
  onChangeColorPalette: (p: ColorPalette) => void;

  probeEnabled: boolean;
  onToggleProbe: () => void;
  showBoundingBox: boolean;
  onToggleBoundingBox: () => void;
  onResetCamera: () => void;

  probeInfo: ProbeInfo | null;
  onSnapSlicesToProbe: () => void;

  // contours (graph surfaces)
  showContours: boolean;
  onToggleContours: () => void;
  contourCount: number;
  onSetContourCount: (n: number) => void;

  // slicing
  sliceEnabled: boolean;
  onSetSliceEnabled: (v: boolean) => void;

  sliceShowPlane: boolean;
  onSetSliceShowPlane: (v: boolean) => void;

  sliceShowSheet: boolean;
  onSetSliceShowSheet: (v: boolean) => void;

  sliceThickness: number;
  onSetSliceThickness: (v: number) => void;

  sliceSheetOpacity: number;
  onSetSliceSheetOpacity: (v: number) => void;

  sliceLineColorMode: "solid" | "height" | "arclen";
  onSetSliceLineColorMode: (v: "solid" | "height" | "arclen") => void;

  sliceLinePalette: "blueRed" | "rainbow" | "grayscale";
  onSetSliceLinePalette: (v: "blueRed" | "rainbow" | "grayscale") => void;

  sliceXY: boolean;
  onSetSliceXY: (v: boolean) => void;
  sliceYZ: boolean;
  onSetSliceYZ: (v: boolean) => void;
  sliceXZ: boolean;
  onSetSliceXZ: (v: boolean) => void;

  sliceXYOffset: number;
  onSetSliceXYOffset: (v: number) => void;
  sliceYZOffset: number;
  onSetSliceYZOffset: (v: number) => void;
  sliceXZOffset: number;
  onSetSliceXZOffset: (v: number) => void;

  // legacy
  slicePreset: SlicePreset;
  onSetSlicePreset: (p: SlicePreset) => void;
  sliceOffset: number;
  onSetSliceOffset: (v: number) => void;
  sliceNormal: SliceNormal;
  onSetSliceNormal: (n: SliceNormal) => void;
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
  showWireframe,
  onToggleWireframe,
  showPlanes,
  onTogglePlanes,
  colorMode,
  onChangeColorMode,
  colorPalette,
  onChangeColorPalette,
  probeEnabled,
  onToggleProbe,
  showBoundingBox,
  onToggleBoundingBox,
  onResetCamera,
  probeInfo,
  onSnapSlicesToProbe,
  showContours,
  onToggleContours,
  contourCount,
  onSetContourCount,
  sliceEnabled,
  onSetSliceEnabled,
  sliceShowPlane,
  onSetSliceShowPlane,
  sliceShowSheet,
  onSetSliceShowSheet,
  sliceThickness,
  onSetSliceThickness,
  sliceSheetOpacity,
  onSetSliceSheetOpacity,
  sliceLineColorMode,
  onSetSliceLineColorMode,
  sliceLinePalette,
  onSetSliceLinePalette,
  sliceXY,
  onSetSliceXY,
  sliceYZ,
  onSetSliceYZ,
  sliceXZ,
  onSetSliceXZ,
  sliceXYOffset,
  onSetSliceXYOffset,
  sliceYZOffset,
  onSetSliceYZOffset,
  sliceXZOffset,
  onSetSliceXZOffset,
}) => {
  const eqMeta = SURFACES_EQ_META.find((m) => m.id === surfaceId) ?? SURFACES_EQ_META[0];
  const paramMeta = PARAM_SURFACES_META.find((m) => m.id === paramId) ?? PARAM_SURFACES_META[0];

  const isEqViewer = viewerKind === "implicit" || viewerKind === "graph";
  const activeMeta = isEqViewer ? eqMeta : paramMeta;

  const modeLabel =
    viewerKind === "implicit"
      ? "implicit surface  f(x,y,z) = 0"
      : viewerKind === "graph"
        ? "graph (explicit)  z = f(x,y)"
        : "parametric surface  σ(u,v)";

  const isGraphCustom = viewerKind === "graph" && surfaceId === "graph_custom";
  const isImplicitCustom = viewerKind === "implicit" && surfaceId === "implicit_custom";
  const isParamCustom = viewerKind === "param" && paramId === "custom";
  const isGraphAny = viewerKind === "graph" && isGraphSurface(surfaceId);
  const colorModes: ColorMode[] =
    viewerKind === "param"
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
      <div style={{ marginBottom: 8, fontSize: 12 }}>
        <span style={{ marginRight: 6 }}>Coloring:</span>

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
      </div>

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

      {/* contours only for graph viewer */}
      {isGraphAny && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Contours (level sets)</div>

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

      {/* slicing */}
      <div style={{ marginTop: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={sliceEnabled} onChange={(e) => onSetSliceEnabled(e.target.checked)} />
          <b>Slice plane (cross-section)</b>
        </label>

        {sliceEnabled && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={sliceXY} onChange={(e) => onSetSliceXY(e.target.checked)} />
                XY
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={sliceYZ} onChange={(e) => onSetSliceYZ(e.target.checked)} />
                YZ
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={sliceXZ} onChange={(e) => onSetSliceXZ(e.target.checked)} />
                XZ
              </label>

              <button
                type="button"
                onClick={() => {
                  onSetSliceXY(true);
                  onSetSliceYZ(true);
                  onSetSliceXZ(true);
                }}
                style={{ padding: "2px 8px" }}
              >
                All 3
              </button>

              <button
                type="button"
                onClick={() => {
                  onSetSliceXY(true);
                  onSetSliceYZ(false);
                  onSetSliceXZ(false);
                }}
                style={{ padding: "2px 8px" }}
              >
                Only XY
              </button>
            </div>

            {sliceXY && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>XY offset (z)</span>
                  <span>{sliceXYOffset.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={0.01}
                  value={sliceXYOffset}
                  onChange={(e) => onSetSliceXYOffset(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
            )}

            {sliceYZ && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>YZ offset (x)</span>
                  <span>{sliceYZOffset.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={0.01}
                  value={sliceYZOffset}
                  onChange={(e) => onSetSliceYZOffset(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
            )}

            {sliceXZ && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>XZ offset (y)</span>
                  <span>{sliceXZOffset.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={0.01}
                  value={sliceXZOffset}
                  onChange={(e) => onSetSliceXZOffset(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={sliceShowPlane} onChange={(e) => onSetSliceShowPlane(e.target.checked)} />
                Show intersection curve
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={sliceShowSheet} onChange={(e) => onSetSliceShowSheet(e.target.checked)} />
                Show slice sheet
              </label>
            </div>

            {sliceShowSheet && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Sheet opacity</span>
                  <span>{sliceSheetOpacity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.02}
                  max={0.35}
                  step={0.01}
                  value={sliceSheetOpacity}
                  onChange={(e) => onSetSliceSheetOpacity(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
            )}

            <div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Thickness (slab)</span>
                <span>{sliceThickness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1.0}
                step={0.01}
                value={sliceThickness}
                onChange={(e) => onSetSliceThickness(Number(e.target.value))}
                style={{ width: "100%" }}
              />
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                0 = single plane, &gt;0 keeps a slab between two planes (CT-scan feel)
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 600 }}>Intersection coloring</div>

              <select value={sliceLineColorMode} onChange={(e) => onSetSliceLineColorMode(e.target.value as any)}>
                <option value="solid">Solid</option>
                <option value="height">By height</option>
                <option value="arclen">By arc length</option>
              </select>

              <button
                type="button"
                disabled={!probeInfo}
                onClick={onSnapSlicesToProbe}
                style={{
                  marginTop: 8,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  background: probeInfo ? "#fff" : "#f3f3f3",
                  cursor: probeInfo ? "pointer" : "not-allowed",
                  fontSize: 12,
                }}
              >
                Slice through probe
              </button>

              {sliceLineColorMode !== "solid" && (
                <div style={{ display: "flex", gap: 10 }}>
                  {(["rainbow", "blueRed", "grayscale"] as const).map((p) => (
                    <label key={p} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="radio" name="sliceLinePalette" checked={sliceLinePalette === p} onChange={() => onSetSliceLinePalette(p)} />
                      {p === "blueRed" ? "blue-red" : p}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
    </section>
  );
};

/* ---------------- Right Panel (domain previews + probe readout) ---------------- */

type SurfacesRightPanelProps = {
  viewerKind: SurfaceViewerKind;
  surfaceId: SurfaceId;
  paramId: ParamSurfaceId;

  onPickEqSurface: (id: SurfaceId) => void;
  onPickParamSurface: (id: ParamSurfaceId) => void;

  implicitExpr: string;
  onChangeImplicitExpr: (s: string) => void;

  probeInfo: ProbeInfo | null;
  probeCurv: CurvatureData | null;

  onPickDomainUV: (uv: { u: number; v: number }) => void;
  onPickDomainXY: (xy: { x: number; y: number }) => void;
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
  probeCurv,
  onPickDomainUV,
  onPickDomainXY,
}) => {
  const eqMeta = SURFACES_EQ_META.find((m) => m.id === surfaceId) ?? SURFACES_EQ_META[0];
  const paramMeta = PARAM_SURFACES_META.find((m) => m.id === paramId) ?? PARAM_SURFACES_META[0];

  const isImplicitCustom = viewerKind === "implicit" && surfaceId === "implicit_custom";
  const isGraphViewer = viewerKind === "graph";
  const isParamViewer = viewerKind === "param";
  const showDomainPicker = isGraphViewer || isParamViewer;

  const uvBounds = getParamDomainPreviewBounds(paramId);


  return (
    <section>
      <h2 style={styles.h2}>Inspector</h2>

      {/* What you are looking at */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Active surface</div>
        <div style={{ fontWeight: 700, marginTop: 2 }}>{viewerKind === "param" ? paramMeta.label : eqMeta.label}</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          {viewerKind === "param" ? paramMeta.formula : eqMeta.formula}
        </div>
      </div>

      {/* Domain picker */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Pick a domain point</div>

        {!showDomainPicker ? (
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            Domain picking is available for graph and param surfaces.
          </div>
        ) : isParamViewer ? (
          <>
            <ParamDomainPreview
              width={260}
              height={220}
              uMin={uvBounds.uMin}
              uMax={uvBounds.uMax}
              vMin={uvBounds.vMin}
              vMax={uvBounds.vMax}
              onPick={onPickDomainUV}
              picked={probeInfo?.uv ?? null}
            />
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
              Click to send (u,v) into the param surface viewer.
            </div>
          </>
        ) : (
          <>
            <XYDomainPreview
              width={260}
              height={220}
              extent={2}
              onPick={onPickDomainXY}
              picked={probeInfo?.xy ?? null}
            />
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
              Click to send (x,y) into the graph/implicit viewer.
            </div>
          </>
        )}
      </div>

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

      {/* Probe readout */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Probe readout</div>

        {!probeInfo ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Enable <b>Probe mode</b> (left panel) and click the surface.
          </div>
        ) : (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e6e6e6",
              borderRadius: 10,
              padding: 10,
              fontSize: 12,
            }}
          >
            <div style={{ marginBottom: 6 }}>
              <b>p</b> = <span style={{ fontFamily: "monospace" }}>{fmt3(probeInfo.point)}</span>
            </div>
            <div style={{ marginBottom: 6 }}>
              <b>n</b> = <span style={{ fontFamily: "monospace" }}>{fmt3(probeInfo.normal)}</span>
            </div>
            {probeInfo.xy && (
              <div style={{ marginBottom: 6 }}>
                <b>x,y</b> ={" "}
                <span style={{ fontFamily: "monospace" }}>
                  ({fmt(probeInfo.xy.x)}, {fmt(probeInfo.xy.y)})
                </span>
              </div>
            )}
            {probeInfo.uv && (
              <div style={{ marginBottom: 6 }}>
                <b>u,v</b> ={" "}
                <span style={{ fontFamily: "monospace" }}>
                  ({fmt(probeInfo.uv.u)}, {fmt(probeInfo.uv.v)})
                </span>
              </div>
            )}

            {probeCurv ? (
              <>
                <div style={{ marginTop: 8, fontWeight: 700 }}>Curvature / invariants</div>
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
                {isGraphViewer && (
                  <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
                    (Computed from graph derivatives at the probed point.)
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 11, opacity: 0.75 }}>No invariants for this mode (or not implemented).</div>
            )}
          </div>
        )}
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
                    border: "1px solid " + (surfaceId === s.id && viewerKind !== "param" ? "#0a66c2" : "#ddd"),
                    background: surfaceId === s.id && viewerKind !== "param" ? "#e6f0ff" : "#fff",
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
  extent: number; // shows x,y in [-extent, extent]
  onPick: (xy: { x: number; y: number }) => void;
  picked?: { x: number; y: number } | null;
};

const XYDomainPreview: React.FC<XYDomainPreviewProps> = ({ width, height, extent, onPick, picked: pickedProp }) => {
  const [picked, setPicked] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (pickedProp) setPicked(pickedProp);
  }, [pickedProp?.x, pickedProp?.y]);

  const pad = 12;
  const w = width;
  const h = height;

  const toXY = (clientX: number, clientY: number, svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    const px = (clientX - r.left - pad) / (r.width - 2 * pad);
    const py = (clientY - r.top - pad) / (r.height - 2 * pad);
    const x = (px * 2 - 1) * extent;
    const y = (1 - py * 2) * extent;
    return { x, y };
  };

  const toPx = (x: number, y: number) => {
    const px = pad + ((x / extent + 1) * 0.5) * (w - 2 * pad);
    const py = pad + ((1 - (y / extent + 1) * 0.5) * (h - 2 * pad));
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
        <span style={{ opacity: 0.75 }}>x,y ∈ [{-extent}, {extent}]</span>
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
