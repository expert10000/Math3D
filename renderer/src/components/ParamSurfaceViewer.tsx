// src/components/ParamSurfaceViewer.tsx
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ParametricGeometry } from "three/examples/jsm/geometries/ParametricGeometry.js";

import DomainDirectionPicker from "./DomainDirectionPicker";
import { integrateGeodesic } from "../math/geodesic";

import type { ColorMode, ColorPalette, ProbeInfo, SliceNormal, SlicePreset } from "./SurfaceViewer";
import AxisGizmo from "./AxisGizmo";

type ParamPreset = {
  id: string;
  label: string;
  xExpr: string;
  yExpr: string;
  zExpr: string;
  createdAt: number;
};

const LS_PARAM_KEY = "mathapp.surfacePresets.param.v1";

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

export type ParamSurfaceId =
  | "plane"
  | "cylinder"
  | "cone"
  | "helicoid"
  | "catenoid"
  | "sphere"
  | "ellipsoid"
  | "torus"
  | "mobius"
  | "kleinBottle"
  | "hyperbolicParaboloid"
  | "enneper"
  | "paraboloid"
  | "pseudosphere"
  | "dini"
  | "twistedStrip"
  // ✅ NEW (your Figure 8 pair)
  | "expCone" // σ(u,v)=(u cos v, u sin v, ln u), u>0
  | "helicoidUV" // τ(u,v)=(u cos v, u sin v, v)
  | "custom";

type Props = {
  surfaceId: ParamSurfaceId;
  customX?: string;
  customY?: string;
  customZ?: string;
  wireframe?: boolean;
  showPlanes?: boolean;
  lightPreset?: "studio" | "soft" | "contrast" | "neutral" | "warm";
  materialRoughness?: number;
  materialMetalness?: number;
  materialOpacity?: number;
  paramResolution?: number;
  colorMode?: ColorMode;
  colorPalette?: ColorPalette;
  showBoundingBox?: boolean;
  resetToken?: number;

  probeEnabled?: boolean;
  showProbeNormal?: boolean;
  showProbeTangentPlane?: boolean;
  showProbeTangents?: boolean;
  onProbe?: (info: ProbeInfo) => void;

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
};

// ---------- safe expression for custom σ(u,v) ----------
function makeSafeParamExpr(
  expr: string | undefined,
  fallback: (u: number, v: number) => number
): (u: number, v: number) => number {
  const trimmed = (expr ?? "").trim();
  if (!trimmed) return fallback;

  let compiled: (u: number, v: number) => number;
  try {
    compiled = new Function(
      "u",
      "v",
      `
      const {
        sin, cos, tan, asin, acos, atan,
        sinh, cosh, tanh,
        exp, log, sqrt, abs, pow,
        PI
      } = Math;
      return (${trimmed});
    `
    ) as (u: number, v: number) => number;
  } catch {
    return () => NaN;
  }

  return (u: number, v: number) => {
    try {
      const val = compiled(u, v);
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

    case "paraboloid":
      return { uMin: 0, uMax: 2, vMin: 0, vMax: 2 * Math.PI };

    case "cylinder":
    case "cone":
    case "helicoid":
    case "catenoid":
      return { uMin: -Math.PI, uMax: Math.PI, vMin: -2, vMax: 2 };

    case "sphere":
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

    // ✅ NEW: exponential cone (u>0), v is angle
    case "expCone":
      return { uMin: 0.15, uMax: 2.8, vMin: 0, vMax: 2 * Math.PI };

    // ✅ NEW: τ(u,v)=(u cos v, u sin v, v)
    // v is BOTH angle and height, so we DO NOT wrap it (no identification); just choose a few turns
    case "helicoidUV":
      return { uMin: 0, uMax: 1.8, vMin: 0, vMax: 6 * Math.PI };

    case "custom":
    default:
      return { uMin: -Math.PI, uMax: Math.PI, vMin: -2, vMax: 2 };
  }
}

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
    surfaceId === "helicoid" ||
    surfaceId === "catenoid" ||
    surfaceId === "sphere" ||
    surfaceId === "ellipsoid" ||
    surfaceId === "torus" ||
    surfaceId === "mobius" ||
    surfaceId === "kleinBottle" ||
    surfaceId === "pseudosphere" ||
    surfaceId === "dini" ||
    surfaceId === "twistedStrip";

  const wrapV =
    surfaceId === "torus" ||
    surfaceId === "kleinBottle" ||
    surfaceId === "expCone" ||
    surfaceId === "paraboloid"; // ✅ v is angle for expCone/paraboloid

  // NOTE: helicoidUV: v is not “just angle” because z=v, so NO wrapping.
  return { wrapU, wrapV };
}

export const ParamSurfaceViewer: React.FC<Props> = ({
  surfaceId,
  customX,
  customY,
  customZ,
  wireframe,
  showPlanes,
  lightPreset = "studio",
  materialRoughness = 0.6,
  materialMetalness = 0.1,
  materialOpacity = 1,
  paramResolution = 64,
  colorMode = "solid",
  colorPalette = "blueRed",
  showBoundingBox = false,
  resetToken,
  probeEnabled = false,
  showProbeNormal = true,
  showProbeTangentPlane = true,
  showProbeTangents = true,
  onProbe,
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
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // refs for stable callbacks / flags
  const viewerRef = useRef<ViewerState | null>(null);
  const onProbeRef = useRef(onProbe);
  const probeEnabledRef = useRef(probeEnabled);
  const showProbeNormalRef = useRef(showProbeNormal);
  const showProbeTangentPlaneRef = useRef(showProbeTangentPlane);
  const showProbeTangentsRef = useRef(showProbeTangents);

  // last known probe uv in DOMAIN coords
  const [probeUV, setProbeUV] = useState<{ u: number; v: number } | null>(null);

  // geodesic UI + line
  const [showGeodesic, setShowGeodesic] = useState(false);
  // direction stored in NORMALIZED uv-space (unit-ish, for the picker)
  const [geoDir, setGeoDir] = useState<{ du: number; dv: number }>({ du: 1, dv: 0 });
  const geodesicLineRef = useRef<THREE.Line | null>(null);

  type GizmoView = "xy" | "xz" | "yz";
  type ViewMode = "free" | GizmoView;

  const [viewMode, setViewMode] = useState<ViewMode>("free");
  const [lockToPlane, setLockToPlane] = useState(false);

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const centerRef = useRef(new THREE.Vector3(0, 0, 0));
  const radiusRef = useRef<number>(3);

  const sliceDirtyRef = useRef(true);
  const surfaceObjRef = useRef<THREE.Object3D | null>(null);
  const probeWidgetsRef = useRef<{
    marker: THREE.Mesh;
    normal: THREE.ArrowHelper;
    plane: THREE.Mesh;
    t1: THREE.ArrowHelper;
    t2: THREE.ArrowHelper;
  } | null>(null);
  const sliceLinesRef = useRef<THREE.LineSegments | null>(null);
  const sliceMatRef = useRef<THREE.LineBasicMaterial | null>(null);
  const sliceSheetsRef = useRef<THREE.Group | null>(null);

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
    onProbeRef.current = onProbe;
  }, [onProbe]);

  useEffect(() => {
    showProbeNormalRef.current = showProbeNormal;
    showProbeTangentPlaneRef.current = showProbeTangentPlane;
    showProbeTangentsRef.current = showProbeTangents;
  }, [showProbeNormal, showProbeTangentPlane, showProbeTangents]);

  useEffect(() => {
    probeEnabledRef.current = probeEnabled;
  }, [probeEnabled]);

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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fb);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(4, 3, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    renderer.localClippingEnabled = true;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    cameraRef.current = camera;
    controlsRef.current = controls;

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

    // optional coordinate planes
    const extraGeoms: THREE.BufferGeometry[] = [];
    const extraMats: THREE.Material[] = [];
    if (showPlanes) {
      const planeSize = 6;

      const makePlane = () =>
        new THREE.MeshBasicMaterial({
          color: 0x999999,
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
        });

      const matXZ = makePlane();
      const geoXZ = new THREE.PlaneGeometry(planeSize, planeSize);
      const planeXZ = new THREE.Mesh(geoXZ, matXZ);
      planeXZ.rotation.x = -Math.PI / 2;
      scene.add(planeXZ);

      const matXY = makePlane();
      const geoXY = new THREE.PlaneGeometry(planeSize, planeSize);
      const planeXY = new THREE.Mesh(geoXY, matXY);
      scene.add(planeXY);

      const matYZ = makePlane();
      const geoYZ = new THREE.PlaneGeometry(planeSize, planeSize);
      const planeYZ = new THREE.Mesh(geoYZ, matYZ);
      planeYZ.rotation.y = Math.PI / 2;
      scene.add(planeYZ);

      extraGeoms.push(geoXZ, geoXY, geoYZ);
      extraMats.push(matXZ, matXY, matYZ);
    }

    const slices = Math.max(16, Math.round(paramResolution));
    const stacks = Math.max(16, Math.round(paramResolution));

    const { uMin, uMax, vMin, vMax } = getDomain(surfaceId);

    let paramFunc: (u: number, v: number, target: THREE.Vector3) => void;

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
    } else {
      paramFunc = (u, v, target) => {
        let x = 0,
          y = 0,
          z = 0;

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
            x = u * Math.cos(v);
            y = u * Math.sin(v);
            z = 0.6 * u * u;
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

          // ✅ NEW: σ(u,v) = (u cos v, u sin v, ln u)
          case "expCone":
            x = u * Math.cos(v);
            y = u * Math.sin(v);
            z = Math.log(Math.max(u, 1e-9));
            break;

          // ✅ NEW: τ(u,v) = (u cos v, u sin v, v)
          case "helicoidUV":
            x = u * Math.cos(v);
            y = u * Math.sin(v);
            z = v;
            break;
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

    // raycaster for surface click
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const handlePointerDown = (event: PointerEvent) => {
      if (!probeEnabledRef.current) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointer.set(x, y);

      raycaster.setFromCamera(pointer, camera);
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

      applyProbe(point, normalWorld, uvDomain);
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    const animate = () => {
      requestAnimationFrame(animate);
      if (sliceDirtyRef.current && surfaceObjRef.current) {
        updateSlice(surfaceObjRef.current);
        sliceDirtyRef.current = false;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const { width: w, height: h } = getSize();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", onResize);

    return () => {
      // dispose geodesic line if present
      if (geodesicLineRef.current) {
        scene.remove(geodesicLineRef.current);
        geodesicLineRef.current.geometry.dispose();
        (geodesicLineRef.current.material as THREE.Material).dispose();
        geodesicLineRef.current = null;
      }

      viewerRef.current = null;
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      extraGeoms.forEach((g) => g.dispose());
      extraMats.forEach((m) => m.dispose());

      labelSprites.forEach((s) => {
        const mat = s.material as THREE.SpriteMaterial;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });

      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }

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
      sliceLinesRef.current = null;
      sliceMatRef.current = null;
      sliceSheetsRef.current = null;

      surfaceObjRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, [
    surfaceId,
    customX,
    customY,
    customZ,
    wireframe,
    showPlanes,
    lightPreset,
    colorMode,
    showBoundingBox,
    resetToken,
    paramResolution,
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

    if (colorMode === "solid") {
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
  }, [colorMode, colorPalette, surfaceId, materialRoughness, materialMetalness, materialOpacity]);

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

  const canLoad = !!(onSetCustomX || onSetCustomY || onSetCustomZ);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

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

      {/* BOTTOM-LEFT overlay: Axis gizmo + lock toggle */}
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
                    <button onClick={() => loadParamPreset(p)} disabled={!onSetCustomX || !onSetCustomY || !onSetCustomZ}>
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
