import * as THREE from "three";
import { integrateGeodesic } from "./geodesic";

export type ParamSurfaceFunc = (u: number, v: number, target?: THREE.Vector3) => THREE.Vector3;

export type ParamGeodesicDomain = {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
};

export type ParamWrap = {
  wrapU?: boolean;
  wrapV?: boolean;
};

export type ParamGeodesicState = {
  paramFunc: ParamSurfaceFunc;
  domain: ParamGeodesicDomain;
  wrap?: ParamWrap;
  meshKey?: string;
};

export type ContinuousParamGeodesicOptions = {
  paramFunc: ParamSurfaceFunc;
  startUV: { u: number; v: number };
  endUV: { u: number; v: number };
  domain: ParamGeodesicDomain;
  wrap?: ParamWrap;
  startPoint?: { x: number; y: number; z: number };
  endPoint?: { x: number; y: number; z: number };
  maxSteps?: number;
  angleSamples?: number;
  refinePasses?: number;
  span?: number;
  maxArcFactor?: number;
};

export type ContinuousParamGeodesicResult =
  | { ok: true; polyline: { x: number; y: number; z: number }[]; length: number; bestError: number }
  | { ok: false; error: string };

function pathLength(points: THREE.Vector3[]): number {
  if (points.length < 2) return 0;
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += points[i - 1].distanceTo(points[i]);
  }
  return len;
}

function unwrapDelta(a: number, b: number, range: number, wrap?: boolean): number {
  let d = b - a;
  if (wrap && Number.isFinite(range) && range > 0) {
    if (d > 0.5 * range) d -= range;
    else if (d < -0.5 * range) d += range;
  }
  return d;
}

export function solveContinuousParamGeodesic(
  opts: ContinuousParamGeodesicOptions
): ContinuousParamGeodesicResult {
  const {
    paramFunc,
    startUV,
    endUV,
    domain,
    wrap = {},
    startPoint,
    endPoint,
    maxSteps = 2200,
    angleSamples = 21,
    refinePasses = 4,
    span = Math.PI,
    maxArcFactor = 1.25,
  } = opts;

  const uRange = domain.uMax - domain.uMin;
  const vRange = domain.vMax - domain.vMin;

  const du = unwrapDelta(startUV.u, endUV.u, uRange, wrap.wrapU);
  const dv = unwrapDelta(startUV.v, endUV.v, vRange, wrap.wrapV);
  const baseLen = Math.hypot(du, dv);
  if (!Number.isFinite(baseLen) || baseLen <= 1e-8) {
    return { ok: false, error: "Start and end are too close in parameter space." };
  }

  const d0 = { du: du / baseLen, dv: dv / baseLen };
  const d1 = { du: -d0.dv, dv: d0.du };

  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  if (startPoint) {
    p0.set(startPoint.x, startPoint.y, startPoint.z);
  } else {
    paramFunc(startUV.u, startUV.v, p0);
  }
  if (endPoint) {
    p1.set(endPoint.x, endPoint.y, endPoint.z);
  } else {
    paramFunc(endUV.u, endUV.v, p1);
  }

  const chordLen = p0.distanceTo(p1);
  if (!Number.isFinite(chordLen) || chordLen <= 1e-8) {
    return {
      ok: true,
      polyline: [{ x: p0.x, y: p0.y, z: p0.z }, { x: p1.x, y: p1.y, z: p1.z }],
      length: 0,
      bestError: 0,
    };
  }

  const desiredSeg = Math.max(0.003, chordLen / 240);
  const maxArcLength = chordLen * maxArcFactor;
  const steps = Math.min(maxSteps, Math.max(320, Math.ceil(maxArcLength / desiredSeg)));
  const h = maxArcLength / steps;

  const shoot = (theta: number) => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const dir = { du: d0.du * c + d1.du * s, dv: d0.dv * c + d1.dv * s };

    const pts = integrateGeodesic({
      sigma: paramFunc,
      startUV,
      dirUV: dir,
      domain,
      wrap,
      steps,
      h,
      maxArcLength,
      maxStepLength3D: desiredSeg * 2.5,
    });
    if (pts.length < 2) return null;

    let bestDist = Infinity;
    let bestIndex = pts.length - 1;
    for (let i = 0; i < pts.length; i++) {
      const d = pts[i].distanceTo(p1);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
        if (bestDist <= desiredSeg * 0.8) break;
      }
    }
    const trimmed = pts.slice(0, bestIndex + 1);
    return { pts: trimmed, err: bestDist, theta };
  };

  type Candidate = { pts: THREE.Vector3[]; err: number; theta: number };
  let best: Candidate | null = null;
  const sampleStep = (2 * span) / Math.max(2, angleSamples - 1);
  for (let i = 0; i < angleSamples; i++) {
    const t = -span + sampleStep * i;
    const cand = shoot(t);
    if (!cand) continue;
    if (!best || cand.err < best.err) best = cand;
  }

  if (!best) {
    return { ok: false, error: "Continuous solver failed to find a viable path." };
  }

  let window = sampleStep;
  for (let pass = 0; pass < refinePasses; pass++) {
    let localBest: Candidate = best;
    const samples = 7;
    const half = (samples - 1) / 2;
    for (let i = 0; i < samples; i++) {
      const t = localBest.theta + ((i - half) / half) * window;
      const cand = shoot(t);
      if (!cand) continue;
      if (cand.err < localBest.err) localBest = cand;
    }
    best = localBest;
    window *= 0.4;
  }

  const acceptDist = Math.max(desiredSeg * 8, chordLen * 0.5);
  if (!Number.isFinite(best.err) || best.err > acceptDist) {
    return { ok: false, error: "Continuous solver did not converge to the target." };
  }

  const polyline = best.pts.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  const length = pathLength(best.pts);
  return { ok: true, polyline, length, bestError: best.err };
}
