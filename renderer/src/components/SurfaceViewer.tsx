// src/components/SurfaceViewer.tsx
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ParametricGeometry } from "three/examples/jsm/geometries/ParametricGeometry.js";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { buildGraphContours } from "../math/contours";
import { computePrincipalCurvatureAtUV, type PrincipalCurvatureResult } from "../math/principalCurvature";
import { integratePrincipalStreamlineBidirectional, stabilizePrincipalResult } from "../math/principalStreamlines";
import { marchingSquares } from "../math/marchingSquares";

import AxisGizmo from "./AxisGizmo";
import { compileExpression } from "../math/expression";

export type ColorMode =
  | "solid"
  | "height"
  | "radius"
  | "curvature"
  | "gaussian"
  | "mean"
  | "k1"
  | "k2";
export type ColorPalette = "blueRed" | "rainbow" | "grayscale" | "redYellow";

export type SlicePreset = "xy" | "yz" | "xz" | "custom";
export type SliceNormal = { x: number; y: number; z: number };
type GraphDomain = { xSpan: number; ySpan: number };
type CameraSyncState = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
};

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

export type SurfaceId =
  | "sphere"
  | "hyperboloid"
  | "hyperboloid_twoSheet"
  | "ellipsoid"
  | "torus_implicit"
  | "gyroid"
  | "superquadric"
  | "roman"
  | "scherk"
  | "paraboloid"
  | "cone"
  | "cylinder"
  // graph-style z = f(x,y)
  | "graph_saddle"
  | "graph_rotatedSaddle"
  | "graph_monkey"
  | "graph_wave"
  | "graph_paraboloid"
  | "graph_gaussian"
  | "graph_ripple"
  | "graph_mexican"
  | "graph_sinSum"
  | "graph_sinc"
  | "graph_sinc2"
  | "graph_custom"
  // implicit f(x,y,z)=0
  | "implicit_custom";

export type ProbeInfo = {
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  uv?: { u: number; v: number };
  xy?: { x: number; y: number };
};

type GizmoView = "xy" | "xz" | "yz";

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
  return new ParametricGeometry(
    (u, v, target) => {
      const x = (u - 0.5) * 2 * xMax;
      const y = (v - 0.5) * 2 * yMax;
      const z = f(x, y);
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
  const { geometry } = buildGraphContours(f, {
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
      // red -> yellow (increase green)
      // x=0 => red (1,0,0), x=1 => yellow (1,1,0)
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


function applyVertexColors(
  geometry: THREE.BufferGeometry,
  colorMode: ColorMode,
  palette: ColorPalette
) {
  if (colorMode === "solid") {
    geometry.deleteAttribute("color");
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


const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function colorFromPalette(t: number, palette: ColorPalette, out = new THREE.Color()) {
  const u = clamp01(t);

  if (palette === "grayscale") {
    return out.setRGB(u, u, u);
  }

  if (palette === "redYellow") {
    // red -> yellow (increase green)
    return out.setRGB(1, u, 0);
  }

  if (palette === "rainbow") {
    // hue sweep: blue->red-ish
    // (tweak if you want different sweep)
    return out.setHSL((1 - u) * 0.7, 1.0, 0.5);
  }

  // "blueRed"
  // smooth blue -> (purple) -> red
  // interpolate in RGB
  const r = u;
  const g = 0.15 + 0.2 * (1 - Math.abs(2 * u - 1));
  const b = 1 - u;
  return out.setRGB(r, g, b);
}
const DBG_COLORS = true;

function solidColorForPalette(palette: ColorPalette): number {
  if (palette === "redYellow") return 0xffcc00;
  if (palette === "grayscale") return 0x888888;
  if (palette === "blueRed") return 0x4f8cff;
  return 0x6a5cff;
}

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

/* ---------- props ---------- */

type Props = {
  surfaceId: SurfaceId;
  graphExpr?: string;
  implicitExpr?: string;

  wireframe?: boolean;
  showPlanes?: boolean;

  lightPreset?: "studio" | "soft" | "contrast" | "neutral" | "warm";
  materialRoughness?: number;
  materialMetalness?: number;
  materialOpacity?: number;

  graphResolution?: number;
  implicitResolution?: number;

  colorMode?: ColorMode;
  colorPalette?: ColorPalette;
  implicitOverlay?: "none" | "normals" | "curvature";
  graphDomain?: GraphDomain;
  isCameraLeader?: boolean;
  cameraSync?: CameraSyncState | null;
  onCameraSync?: (state: CameraSyncState) => void;

  showBoundingBox?: boolean;
  resetToken?: number;

  probeEnabled?: boolean;
  showProbeNormal?: boolean;
  showProbeTangentPlane?: boolean;
  showProbeTangents?: boolean;
  showPrincipalDirections?: boolean;
  showPrincipalNormalPlanes?: boolean;
  showPrincipalLines?: boolean;
  graphProbeXY?: { x: number; y: number } | null;
  graphProbeToken?: number;
  onProbe?: (info: ProbeInfo) => void;

  onSetGraphExpr?: (expr: string) => void;
  onSetImplicitExpr?: (expr: string) => void;

  showContours?: boolean;
  contourCount?: number;
};



/* ---------- main viewer ---------- */

export const SurfaceViewer: React.FC<Props> = (props) => {
  const {
    surfaceId,
    graphExpr,
    implicitExpr,

    wireframe,
    showPlanes,

    lightPreset = "studio",
    materialRoughness = 0.3,
    materialMetalness = 0.1,
    materialOpacity = 1,

    graphResolution = 80,
    implicitResolution = 32,

    colorMode = "solid",
    colorPalette = "blueRed",
    implicitOverlay = "none",
    graphDomain,
    isCameraLeader = false,
    cameraSync = null,
    onCameraSync,

    showBoundingBox = false,
    resetToken,

    probeEnabled = false,
    showProbeNormal = true,
    showProbeTangentPlane = true,
    showProbeTangents = true,
    showPrincipalDirections = false,
    showPrincipalNormalPlanes = false,
    showPrincipalLines = false,
    graphProbeXY = null,
    graphProbeToken,
    onProbe,

    onSetGraphExpr,
    onSetImplicitExpr,

    showContours = false,
    contourCount = 12,
  } = props;

  const mountRef = useRef<HTMLDivElement | null>(null);

  // slice visuals
  const sliceGroupRef = useRef<THREE.Group | null>(null);

  const surfaceObjRef = useRef<THREE.Object3D | null>(null);
  const probeWidgetsRef = useRef<{
    marker: THREE.Mesh;
    normal: THREE.ArrowHelper;
    plane: THREE.Mesh;
    t1: THREE.ArrowHelper;
    t2: THREE.ArrowHelper;
  } | null>(null);
  const principalGroupRef = useRef<THREE.Group | null>(null);
  const prevPrincipalRef = useRef<PrincipalCurvatureResult | null>(null);
  const [probeXY, setProbeXY] = useState<{ x: number; y: number } | null>(null);
  const [sceneEpoch, setSceneEpoch] = useState(0);

  type ViewMode = "free" | GizmoView;
  const [viewMode, setViewMode] = useState<ViewMode>("free");
  const [lockToPlane, setLockToPlane] = useState(false);
  const [slicePlaneEnabled, setSlicePlaneEnabled] = useState(false);
  const [slicePlanePreset, setSlicePlanePreset] = useState<SlicePreset>("xy");
  const [slicePlaneTheta, setSlicePlaneTheta] = useState(0);
  const [slicePlanePhi, setSlicePlanePhi] = useState(0);
  const [slicePlaneOffset, setSlicePlaneOffset] = useState(0);
  const [slicePlaneSize, setSlicePlaneSize] = useState(3.5);

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const centerRef = useRef(new THREE.Vector3(0, 0, 0));
  const radiusRef = useRef<number>(3);

  const onProbeRef = useRef<Props["onProbe"] | undefined>(undefined);
  useEffect(() => {
    onProbeRef.current = onProbe;
  }, [onProbe]);

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
      prevPrincipalRef.current = null;
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
    prevPrincipalRef.current = null;
    if (principalGroupRef.current) clearGroup(principalGroupRef.current);
  }, [surfaceId, graphExpr, implicitExpr, graphDomain?.xSpan, graphDomain?.ySpan]);

useEffect(() => {
  console.log("[SurfaceViewer] props", { surfaceId, colorMode, colorPalette, wireframe });
}, [surfaceId, colorMode, colorPalette, wireframe]);

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
    } else if (view === "yz") {
      cam.position.set(center.x + d, center.y, center.z);
      cam.up.set(0, 1, 0);
    }

    controls.target.copy(center);
    cam.lookAt(center);
    controls.update();
  };

  useEffect(() => {
    setViewMode("free");
    setLockToPlane(false);
  }, [resetToken]);

  useEffect(() => {
    const controls = controlsRef.current;
    const cam = cameraRef.current;
    if (!controls || !cam) return;

    const shouldLock = lockToPlane && viewMode !== "free";
    controls.enableRotate = !shouldLock;

    if (viewMode === "free") return;
    applyCameraView(viewMode as GizmoView);
  }, [viewMode, lockToPlane]);

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
      return Number.isFinite(v) ? v : NaN;
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

    root.traverse((o) => {
      const anyO = o as any;
      if (anyO?.isMarchingCubes) {
        const implicitMeta = (anyO as any).userData?.__implicit as
          | { f: (x: number, y: number, z: number) => number }
          | undefined;
        const useImplicitCurv = implicitOverlay === "curvature" && typeof implicitMeta?.f === "function";

        const mats = Array.isArray(anyO.material) ? anyO.material : [anyO.material];
        for (const m of mats) {
          if (!m) continue;
          (m as any).wireframe = !!wireframe;
          (m as any).vertexColors = useImplicitCurv;
          (m as any).roughness = materialRoughness;
          (m as any).metalness = materialMetalness;
          (m as any).transparent = clamp01(materialOpacity) < 1;
          (m as any).opacity = clamp01(materialOpacity);
          if (useImplicitCurv) {
            (m as any).color?.set(0xffffff);
          } else if (colorMode === "solid") {
            (m as any).color?.set(solidColorForPalette(colorPalette));
          } else {
            (m as any).color?.set(0xffffff);
          }
          m.needsUpdate = true;
        }
        if (anyO.geometry) {
          if (useImplicitCurv && implicitMeta?.f) {
            applyImplicitCurvatureColors(anyO.geometry, implicitMeta.f, colorPalette);
          } else if (anyO.geometry.getAttribute("color")) {
            anyO.geometry.deleteAttribute("color");
          }
        }
        return;
      }

      if (anyO?.isMesh && anyO.geometry) {
        const mesh = anyO as THREE.Mesh;
        const geom = mesh.geometry as THREE.BufferGeometry;

        debugMesh("[recolorTraverse] BEFORE", mesh, { surfaceId, colorMode, colorPalette });

        if (colorMode === "solid") {
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
          (m as any).wireframe = !!wireframe;
          (m as any).vertexColors = colorMode !== "solid";
          (m as any).roughness = materialRoughness;
          (m as any).metalness = materialMetalness;
          (m as any).transparent = clamp01(materialOpacity) < 1;
          (m as any).opacity = clamp01(materialOpacity);
          if (colorMode === "solid") {
            (m as any).color?.set(solidColorForPalette(colorPalette));
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

  }, [surfaceId, graphExpr, colorMode, colorPalette, wireframe, materialRoughness, materialMetalness, materialOpacity]);

  // --- rebuild graph contours live (no scene rebuild) ---
  useEffect(() => {
    const root = surfaceObjRef.current;
    if (!root) return;
    if (!isGraphId(surfaceId)) return;

    const group = root as THREE.Group;

    // remove old contours
    for (const ch of [...group.children]) {
      if ((ch as any)?.userData?.__contours) {
        group.remove(ch);

        const ls = ch as THREE.LineSegments;
        const geom = ls.geometry as THREE.BufferGeometry | undefined;
        if (geom) geom.dispose();

        const matAny = (ls as any).material as THREE.Material | THREE.Material[] | undefined;
        if (matAny) {
          if (Array.isArray(matAny)) matAny.forEach((m) => m.dispose());
          
          else matAny.dispose();
        }
      }
    }

    if (!showContours || contourCount <= 0) return;

    const f = getGraphF();
    const spans = (group as any).userData?.__graph as { xSpan: number; ySpan: number } | undefined;
    const xSpan = spans?.xSpan ?? 1.5;
    const ySpan = spans?.ySpan ?? 1.5;

    const contours = makeGraphContourLines(f, xSpan, ySpan, contourCount);
    (contours as any).userData = { ...(contours as any).userData, __contours: true };
    group.add(contours);
  }, [surfaceId, graphExpr, showContours, contourCount]);

  // --- slicing plane + intersection (graph + implicit surfaces) ---
  useEffect(() => {
    const group = sliceGroupRef.current;
    if (!group) return;

    clearGroup(group);

    if (!slicePlaneEnabled) return;

    const isGraphSurface = isGraphId(surfaceId);
    const isImplicitSurface = isImplicitId(surfaceId);
    if (!isGraphSurface && !isImplicitSurface) return;

    const normal = sliceNormalFromAngles();
    const offset = slicePlaneOffset;
    const planeSize = Math.max(0.5, slicePlaneSize);

    const planeGeom = new THREE.PlaneGeometry(planeSize, planeSize, 1, 1);
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
    planeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    planeMesh.position.copy(normal.clone().multiplyScalar(offset));
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
    const normalOffset = normal.clone().multiplyScalar(lineOffset);

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
          return normal.x * x + normal.y * z + normal.z * y - offset;
        },
      });

      for (const poly of polylines) {
        if (poly.length < 2) continue;
        const pts: THREE.Vector3[] = [];
        for (const pt of poly) {
          const z = f(pt.x, pt.y);
          if (!Number.isFinite(z)) continue;
          pts.push(new THREE.Vector3(pt.x, z, pt.y).add(normalOffset));
        }
        if (pts.length < 2) continue;
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geom, lineMat);
        line.renderOrder = 12;
        group.add(line);
      }
    } else if (isImplicitSurface) {
      const root = surfaceObjRef.current as THREE.Object3D | null;
      let implicitF: ((x: number, y: number, z: number) => number) | null = null;

      if (root) {
        root.traverse((obj) => {
          if (implicitF) return;
          const anyObj = obj as any;
          if (anyObj?.isMarchingCubes) {
            const meta = anyObj.userData?.__implicit as { f: (x: number, y: number, z: number) => number } | undefined;
            if (meta?.f) implicitF = meta.f;
          }
        });
      }

      if (!implicitF) {
        lineMat.dispose();
        return;
      }

      const { e1, e2 } = makePlaneBasis(normal);
      const x0 = normal.clone().multiplyScalar(offset);

      const sMax = planeSize * 0.5;
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

      for (const poly of polylines) {
        if (poly.length < 2) continue;
        const pts: THREE.Vector3[] = [];
        for (const pt of poly) {
          const s = pt.x;
          const t = pt.y;
          const x = x0x + e1x * s + e2x * t;
          const y = x0y + e1y * s + e2y * t;
          const z = x0z + e1z * s + e2z * t;
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
          pts.push(new THREE.Vector3(x, y, z).add(normalOffset));
        }
        if (pts.length < 2) continue;
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geom, lineMat);
        line.renderOrder = 12;
        group.add(line);
      }
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

  // MarchingCubes: update material color only (no vertex colors)
  if ((obj as any).isMarchingCubes) {
    const mat = (obj as any).material as THREE.Material | undefined;
    if (mat && (mat as any).color) {
      if (colorMode === "solid") {
        (mat as any).color.set(solidColorForPalette(colorPalette));
      } else {
        (mat as any).color.set(0xffffff);
      }
      (mat as any).vertexColors = false;
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
  if (mat) {
    mat.vertexColors = colorMode !== "solid";
    if (colorMode === "solid") {
      mat.color.set(solidColorForPalette(colorPalette));
    } else {
      mat.color.set(0xffffff);
    }
    mat.needsUpdate = true;
  }

  // repaint
  if (colorMode === "curvature") {
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

  console.log("[SurfaceViewer] recolor OK", { surfaceId, colorMode, colorPalette });
}, [surfaceId, graphExpr, implicitExpr, colorMode, colorPalette, implicitOverlay]);

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
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    renderer.setClearColor(0xf8f9fb, 1);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.localClippingEnabled = true;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(3, 3, 4);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    controls.screenSpacePanning = true;

    cameraRef.current = camera;
    controlsRef.current = controls;

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

    const makeMaterial2 = () =>
      new THREE.MeshStandardMaterial({
        color: 0x0b5ed7,
        metalness: materialMetalness,
        roughness: materialRoughness,
        side: THREE.DoubleSide,
        wireframe: !!wireframe,
        vertexColors: colorMode !== "solid",
        transparent: opacity < 1,
        opacity,
      });

    const makeMaterial = () =>
      new THREE.MeshStandardMaterial({
        color: colorMode === "solid" ? solidColorForPalette(colorPalette) : 0xffffff,
        metalness: materialMetalness,
        roughness: materialRoughness,
        side: THREE.DoubleSide,
        wireframe: !!wireframe,
        vertexColors: colorMode !== "solid",
        transparent: opacity < 1,
        opacity,
      });



    const makeImplicitSurface = (f: (x: number, y: number, z: number) => number, size = 2.2) => {
      const effect = new MarchingCubes(implicitRes, makeMaterial(), true, true);
      const field = effect.field;

      let idx = 0;
      for (let k = 0; k < implicitRes; k++) {
        const z = ((k / (implicitRes - 1)) * 2 - 1) * size;
        for (let j = 0; j < implicitRes; j++) {
          const y = ((j / (implicitRes - 1)) * 2 - 1) * size;
          for (let i = 0; i < implicitRes; i++) {
            const x = ((i / (implicitRes - 1)) * 2 - 1) * size;

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
      (effect as any).userData.__implicit = { f, size };

      return effect;
    };

    const makeSurface = (id: SurfaceId): THREE.Object3D => {
      switch (id) {
        case "sphere": {
          const geo = new THREE.SphereGeometry(1, 64, 64);
          if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);
          return new THREE.Mesh(geo, makeMaterial());
        }
        case "cylinder": {
          const geo = new THREE.CylinderGeometry(1, 1, 2.4, 64, 1, false);
          if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);
          return new THREE.Mesh(geo, makeMaterial());
        }
        case "cone": {
          const geo = new THREE.ConeGeometry(1.2, 2.4, 64, 1, false);
          if (colorMode !== "solid") applyVertexColors(geo, colorMode, colorPalette);
          return new THREE.Mesh(geo, makeMaterial());
        }
        case "paraboloid": {
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
          const geo = new ParametricGeometry(
            (u, v, target) => {
              const t = (u - 0.5) * 2;
              const theta = v * 2 * Math.PI;
              const a = 0.8;
              const c = 0.6;
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
          return makeImplicitSurface(
            (x, y, z) => (z * z) / (c * c) - (x * x) / (a * a) - (y * y) / (b * b) - 1,
            2.3
          );
        }
        case "ellipsoid": {
          const a = 1.3;
          const b = 0.9;
          const c = 0.7;
          return makeImplicitSurface((x, y, z) => (x * x) / (a * a) + (y * y) / (b * b) + (z * z) / (c * c) - 1);
        }
        case "torus_implicit": {
          const R = 1.05;
          const r = 0.45;
          return makeImplicitSurface((x, y, z) => {
            const q = Math.sqrt(x * x + y * y) - R;
            return q * q + z * z - r * r;
          }, 2.1);
        }
        case "gyroid": {
          const s = 1.4;
          return makeImplicitSurface(
            (x, y, z) => Math.sin(x * s) * Math.cos(y * s) + Math.sin(y * s) * Math.cos(z * s) + Math.sin(z * s) * Math.cos(x * s),
            2.2
          );
        }
        case "superquadric": {
          const n = 4;
          return makeImplicitSurface((x, y, z) => Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n) + Math.pow(Math.abs(z), n) - 1.2);
        }
        case "roman": {
          return makeImplicitSurface(
            (x, y, z) => x * x * y * y + y * y * z * z + z * z * x * x - 2 * x * y * z,
            1.8
          );
        }
        case "scherk": {
          return makeImplicitSurface((x, y, z) => Math.sin(z) - Math.sinh(x) * Math.sinh(y), 1.6);
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
          return makeImplicitSurface(f, 2.1);
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

    let implicitOverlayLines: THREE.LineSegments | null = null;
    const findImplicitObj = (): THREE.Object3D | null => {
      let found: THREE.Object3D | null = null;
      surfaceObj.traverse((obj) => {
        if ((obj as any)?.isMarchingCubes) found = obj;
      });
      return found;
    };
    const implicitObj = findImplicitObj();
    const implicitMeta = (implicitObj as any)?.userData?.__implicit as
      | { f: (x: number, y: number, z: number) => number }
      | undefined;
    if (implicitObj && implicitMeta?.f) {
      if (implicitOverlay === "curvature" && (implicitObj as any).geometry) {
        applyImplicitCurvatureColors((implicitObj as any).geometry, implicitMeta.f, colorPalette);
      }
      if (implicitOverlay === "normals" && (implicitObj as any).geometry) {
        implicitOverlayLines = buildImplicitNormalLines((implicitObj as any).geometry, implicitMeta.f, 0.22);
        if (implicitOverlayLines) scene.add(implicitOverlayLines);
      }
    }

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
    }

    const axesLength = 1.6;
    const axes = new THREE.AxesHelper(axesLength);
    scene.add(axes);

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
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(0.35, 0.35, 0.35);
      sprite.position.copy(position);
      scene.add(sprite);
      labelSprites.push(sprite);
    };

    makeAxisLabel("+x", "#d9534f", new THREE.Vector3(axesLength * 1.1, 0, 0));
    makeAxisLabel("+y", "#5cb85c", new THREE.Vector3(0, axesLength * 1.1, 0));
    makeAxisLabel("+z", "#5bc0de", new THREE.Vector3(0, 0, axesLength * 1.1));

    if (showPlanes) {
      const planeSize = 3.0;
      const basePlaneMat = new THREE.MeshBasicMaterial({
        color: 0x888888,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.15,
      });

      const planeGeom = new THREE.PlaneGeometry(planeSize * 2, planeSize * 2);

      const planeXY = new THREE.Mesh(planeGeom.clone(), basePlaneMat.clone());
      scene.add(planeXY);

      const planeYZ = new THREE.Mesh(planeGeom.clone(), basePlaneMat.clone());
      planeYZ.rotation.y = Math.PI / 2;
      scene.add(planeYZ);

      const planeXZ = new THREE.Mesh(planeGeom.clone(), basePlaneMat.clone());
      planeXZ.rotation.x = -Math.PI / 2;
      scene.add(planeXZ);
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

    const principalGroup = new THREE.Group();
    scene.add(principalGroup);
    principalGroupRef.current = principalGroup;

    const applyProbe = (point: THREE.Vector3, normalWorld: THREE.Vector3, xyDomain?: { x: number; y: number }) => {
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

      setProbeXY(xyDomain ?? null);

      const cb = onProbeRef.current;
      if (cb) {
        cb({
          point: { x: point.x, y: point.y, z: point.z },
          normal: { x: n.x, y: n.y, z: n.z },
          xy: xyDomain,
        });
      }
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const handlePointerDown = (event: PointerEvent) => {
      if (!probeEnabled) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointer.set(x, y);

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects([surfaceObj], true);
      if (!intersects.length) return;

      const hit = intersects[0];
      const point = hit.point.clone();

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
      if (isGraphId(surfaceId)) {
        xyDomain = { x: point.x, y: point.z };
      }

      applyProbe(point, normalWorld, xyDomain);
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    setSceneEpoch((v) => v + 1);

    // ---- programmatic probe for graphs (from XY mini-map) ----
    if (graphProbeXY && isGraphId(surfaceId)) {
      const { x, y } = graphProbeXY;

      const f = getGraphF();
      const z = f(x, y);
      const point = new THREE.Vector3(x, z, y);

      const eps = 1e-2;
      const fx = (f(x + eps, y) - f(x - eps, y)) / (2 * eps);
      const fy = (f(x, y + eps) - f(x, y - eps)) / (2 * eps);

      const normalWorld = new THREE.Vector3(fx, -1, fy).normalize();
      applyProbe(point, normalWorld, { x, y });
    }

    const handleResize = () => {
      const { width: w, height: h } = getSize();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);

    let frameId = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);

      if (isCameraLeader && onCameraSync) {
        controls.removeEventListener("change", emitCameraSync);
      }
      controls.dispose();

      labelSprites.forEach((s) => {
        const mat = s.material as THREE.SpriteMaterial;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });

      if (sliceGroupRef.current) {
        clearGroup(sliceGroupRef.current);
        scene.remove(sliceGroupRef.current);
      }

      if (principalGroupRef.current) {
        clearGroup(principalGroupRef.current);
        scene.remove(principalGroupRef.current);
        principalGroupRef.current = null;
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
    resetToken,
    probeEnabled,
    graphProbeXY,
    graphProbeToken,
    graphResolution,
    implicitResolution,
    graphDomain?.xSpan,
    graphDomain?.ySpan,
    isCameraLeader,
    onCameraSync,
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
    const group = principalGroupRef.current;
    if (!group) return;

    clearGroup(group);

    if (!isGraphId(surfaceId)) return;
    if (!probeXY) return;
    if (!showPrincipalDirections && !showPrincipalNormalPlanes && !showPrincipalLines) return;

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
      const steps = 320;
      const range = Math.min(Math.abs(uMax - uMin), Math.abs(vMax - vMin));
      const step = 0.02 * range;
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
        steps,
        step,
        normalOffset: lineOffset,
      });
      if (p1.length >= 2) {
        const geom = new THREE.BufferGeometry().setFromPoints(p1);
        const line = new THREE.Line(geom, lineMaterial1);
        line.renderOrder = 996;
        group.add(line);
      } else {
        lineMaterial1.dispose();
      }

      const p2 = integratePrincipalStreamlineBidirectional(frameAt, startUV, 2, {
        steps,
        step,
        normalOffset: lineOffset,
      });
      if (p2.length >= 2) {
        const geom = new THREE.BufferGeometry().setFromPoints(p2);
        const line = new THREE.Line(geom, lineMaterial2);
        line.renderOrder = 996;
        group.add(line);
      } else {
        lineMaterial2.dispose();
      }
    }
  }, [
    probeXY?.x,
    probeXY?.y,
    surfaceId,
    graphExpr,
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
  const sliceOffsetRange = isGraphSurface
    ? Math.max(1, graphDomain?.xSpan ?? 1.5, graphDomain?.ySpan ?? 1.5)
    : Math.max(1, radiusRef.current || 3);
  const sliceSizeMax = Math.max(2, sliceOffsetRange * 2.5);
  const sliceThetaDeg = toDeg(slicePlaneTheta);
  const slicePhiDeg = toDeg(slicePlanePhi);
  const presetButtonStyle = (active: boolean) => ({
    padding: "2px 8px",
    borderRadius: 6,
    border: "1px solid #cfd6df",
    background: active ? "#dbe7ff" : "#f2f4f7",
    fontSize: 11,
    cursor: "pointer",
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
        }}
      />

      {sliceUiEnabled && (
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
            </>
          )}
        </div>
      )}

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
