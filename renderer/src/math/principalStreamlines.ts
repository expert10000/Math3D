// src/math/principalStreamlines.ts
import * as THREE from "three";
import type { PrincipalCurvatureResult } from "./principalCurvature";

export type UV = { u: number; v: number };

export type BoundsUV = { uMin: number; uMax: number; vMin: number; vMax: number };

export type IntegrateOptions = {
  bounds: BoundsUV;
  step: number; // UV step size (in UV units)
  maxSteps: number;
  minDirLen?: number; // stop if UV direction too small
  normalOffset?: number; // offset points along normal to avoid z-fighting
};

export type StreamlineResult = {
  uv: UV[];
  xyz: THREE.Vector3[];
};

export function withinBounds(uv: UV, b: BoundsUV): boolean {
  return uv.u >= b.uMin && uv.u <= b.uMax && uv.v >= b.vMin && uv.v <= b.vMax;
}

export function normalize2(du: number, dv: number): { du: number; dv: number; len: number } {
  const len = Math.hypot(du, dv);
  if (!Number.isFinite(len) || len <= 0) return { du: 0, dv: 0, len: 0 };
  return { du: du / len, dv: dv / len, len };
}

/**
 * Stabilize principal frame against previous:
 * - swap (dir1,dir2) if current dir2 matches prev dir1 better
 * - flip signs to keep dot(prev,cur) >= 0
 * - apply same operations to uvDir1/uvDir2 and k1/k2
 * - finally enforce orthonormal tangent pair using N x dir1 for dir2
 */
export function stabilizePrincipalResult(
  current: PrincipalCurvatureResult,
  prev: PrincipalCurvatureResult | null,
): PrincipalCurvatureResult {
  // Clone result (defensive: do not mutate inputs)
  let out: PrincipalCurvatureResult = {
    k1: current.k1,
    k2: current.k2,
    H: current.H,
    K: current.K,
    isUmbilic: current.isUmbilic,
    point: current.point.clone(),
    normal: current.normal.clone(),
    dir1: current.dir1.clone(),
    dir2: current.dir2.clone(),
    uvDir1: { du: current.uvDir1.du, dv: current.uvDir1.dv },
    uvDir2: { du: current.uvDir2.du, dv: current.uvDir2.dv },
  };

  // Normalize normal + project directions into tangent (defensive)
  const N = out.normal.clone();
  if (N.lengthSq() > 0) N.normalize();

  out.dir1 = out.dir1.clone().sub(N.clone().multiplyScalar(out.dir1.dot(N)));
  out.dir2 = out.dir2.clone().sub(N.clone().multiplyScalar(out.dir2.dot(N)));

  if (out.dir1.lengthSq() > 0) out.dir1.normalize();
  if (out.dir2.lengthSq() > 0) out.dir2.normalize();

  if (!prev) {
    // enforce perpendicular pair
    if (N.lengthSq() > 0 && out.dir1.lengthSq() > 0) {
      const d2 = new THREE.Vector3().crossVectors(N, out.dir1);
      if (d2.lengthSq() > 0) {
        d2.normalize();
        out.dir2 = d2;
      }
    }
    out.normal = N;
    return out;
  }

  const pd1 = prev.dir1.clone();
  const pd2 = prev.dir2.clone();
  if (pd1.lengthSq() > 0) pd1.normalize();
  if (pd2.lengthSq() > 0) pd2.normalize();

  const a = Math.abs(out.dir1.dot(pd1));
  const b = Math.abs(out.dir2.dot(pd1));

  // Swap if current dir2 aligns better with previous dir1
  if (b > a) {
    const tmpDir = out.dir1;
    out.dir1 = out.dir2;
    out.dir2 = tmpDir;

    const tmpUV = out.uvDir1;
    out.uvDir1 = out.uvDir2;
    out.uvDir2 = tmpUV;

    const tmpK = out.k1;
    out.k1 = out.k2;
    out.k2 = tmpK;
  }

  // Flip signs for continuity
  if (out.dir1.dot(pd1) < 0) {
    out.dir1.negate();
    out.uvDir1.du *= -1;
    out.uvDir1.dv *= -1;
  }

  if (out.dir2.dot(pd2) < 0) {
    out.dir2.negate();
    out.uvDir2.du *= -1;
    out.uvDir2.dv *= -1;
  }

  // Enforce clean perpendicular tangent pair:
  if (N.lengthSq() > 0 && out.dir1.lengthSq() > 0) {
    const d2 = new THREE.Vector3().crossVectors(N, out.dir1);
    if (d2.lengthSq() > 0) {
      d2.normalize();
      out.dir2 = d2;
    }
  }

  out.normal = N;
  return out;
}

export type FrameEval = (uv: UV) => PrincipalCurvatureResult | null;

/**
 * Integrate streamline in UV using uvDir1 or uvDir2.
 * Uses frame stabilization per-step to avoid swapping/flipping along the curve.
 */
export function integratePrincipalStreamline(
  frameAt: FrameEval,
  start: UV,
  which: 1 | 2,
  dirSign: 1 | -1,
  opts: IntegrateOptions,
): StreamlineResult {
  const { bounds, step, maxSteps } = opts;
  const minDirLen = opts.minDirLen ?? 1e-12;
  const normalOffset = opts.normalOffset ?? 0;

  const uvs: UV[] = [];
  const xyzs: THREE.Vector3[] = [];

  let uv: UV = { u: start.u, v: start.v };
  let prevFrame: PrincipalCurvatureResult | null = null;

  // For UV direction continuity (sign choice), keep last used UV dir
  let prevUVDir: { du: number; dv: number } | null = null;

  for (let i = 0; i < maxSteps; i++) {
    if (!withinBounds(uv, bounds)) break;

    const raw = frameAt(uv);
    if (!raw) break;

    const frame = stabilizePrincipalResult(raw, prevFrame);
    prevFrame = frame;

    const uvDir = which === 1 ? frame.uvDir1 : frame.uvDir2;
    if (!Number.isFinite(uvDir.du) || !Number.isFinite(uvDir.dv)) break;

    const n = normalize2(uvDir.du, uvDir.dv);
    if (n.len < minDirLen) break;

    let du = n.du * dirSign;
    let dv = n.dv * dirSign;

    // Keep continuity of UV direction (avoid 180° flips step-to-step)
    if (prevUVDir) {
      const dot = du * prevUVDir.du + dv * prevUVDir.dv;
      if (dot < 0) {
        du = -du;
        dv = -dv;
      }
    }

    uvs.push({ u: uv.u, v: uv.v });

    const p = frame.point.clone();
    if (normalOffset !== 0) p.addScaledVector(frame.normal, normalOffset);
    xyzs.push(p);

    uv = { u: uv.u + step * du, v: uv.v + step * dv };
    prevUVDir = { du, dv };

    if (!withinBounds(uv, bounds)) break;
  }

  return { uv: uvs, xyz: xyzs };
}

/**
 * Integrate backward + forward and join into one polyline.
 */
export function integratePrincipalStreamlineBidirectional(
  frameAt: FrameEval,
  start: UV,
  which: 1 | 2,
  opts: IntegrateOptions,
): StreamlineResult {
  const back = integratePrincipalStreamline(frameAt, start, which, -1, opts);
  const fwd = integratePrincipalStreamline(frameAt, start, which, +1, opts);

  const backUV = back.uv.slice().reverse();
  const backXYZ = back.xyz.slice().reverse();

  // Remove duplicate start point if both present
  if (backUV.length > 0 && fwd.uv.length > 0) {
    backUV.pop();
    backXYZ.pop();
  }

  return {
    uv: [...backUV, ...fwd.uv],
    xyz: [...backXYZ, ...fwd.xyz],
  };
}

export function buildPolylineGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const n = points.length;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3 + 0] = points[i].x;
    arr[i * 3 + 1] = points[i].y;
    arr[i * 3 + 2] = points[i].z;
  }
  geom.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  return geom;
}
