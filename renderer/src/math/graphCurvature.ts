/*
import { BufferAttribute, BufferGeometry } from "three";

// Approximate Gaussian curvature for a graph z = f(x,y)
function gaussianCurvatureForGraph(
  f: (x: number, y: number) => number,
  x: number,
  y: number
): number {
  const h = 1e-3;

  const f0 = f(x, y);
  const fx =
    (f(x + h, y) - f(x - h, y)) / (2 * h);
  const fy =
    (f(x, y + h) - f(x, y - h)) / (2 * h);
  const fxx =
    (f(x + h, y) - 2 * f0 + f(x - h, y)) / (h * h);
  const fyy =
    (f(x, y + h) - 2 * f0 + f(x, y - h)) / (h * h);
  const fxy =
    (f(x + h, y + h) -
      f(x + h, y - h) -
      f(x - h, y + h) +
      f(x - h, y - h)) /
    (4 * h * h);

  const denom = Math.pow(1 + fx * fx + fy * fy, 2);
  if (!Number.isFinite(denom) || denom === 0) return 0;

  const K = (fxx * fyy - fxy * fxy) / denom;
  return Number.isFinite(K) ? K : 0;
}


export function applyCurvatureColorsToGraph(
  geometry: BufferGeometry,
  f: (x: number, y: number) => number
) {
  const pos = geometry.getAttribute("position") as BufferAttribute;
  const n = pos.count;

  const Kvals = new Float32Array(n);
  let maxAbsK = 0;

  // 1st pass – compute K at each vertex, track max |K|
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);

    const K = gaussianCurvatureForGraph(f, x, y);
    Kvals[i] = K;

    const a = Math.abs(K);
    if (a > maxAbsK) maxAbsK = a;
  }

  if (maxAbsK === 0) maxAbsK = 1; // avoid divide-by-zero

  // 2nd pass – map K / maxAbsK ∈ [-1,1] → blue–white–red
  const colors = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const t = Kvals[i] / maxAbsK;    // -1..1
    const j = 3 * i;

    // simple symmetric palette:
    // t=-1 → blue, t=0 → white, t=+1 → red
    const c = 0.5 * (t + 1);          // 0..1
    const r = c;
    const g = 1 - Math.abs(t);
    const b = 1 - c;

    colors[j] = r;
    colors[j + 1] = g;
    colors[j + 2] = b;
  }

  geometry.setAttribute("color", new BufferAttribute(colors, 3));
}
*/

// src/math/graphCurvature.ts
import * as THREE from "three";

export type GraphCurvatureSample = {
  x: number;
  y: number;
  z: number;
  E: number;
  F: number;
  G: number;
  e: number;
  f: number;
  g: number;
  K: number;
  H: number;
  k1: number;
  k2: number;
};

/**
 * Red→yellow gradient just for curvature:
 *  t=0   ⇒ dark red
 *  t≈0.5 ⇒ orange
 *  t=1   ⇒ bright yellow
 */
function curvatureRedYellow(t: number) {
  const x = Math.min(1, Math.max(0, t));
  const r = 1.0;
  const g = 0.2 + 0.8 * x;
  const b = 0.0;
  return { r, g, b };
}

/**
 * Compute curvature of a graph z = f(x,y) at each vertex of a
 * graph-geometry surface and write vertex colors according to |K|.
 *
 * Geometry is assumed to be created by makeGraphGeometry, with
 * world coords (X,Y,Z) = (x, z, y_domain).
 */
export function applyCurvatureColorsToGraph(
  geometry: THREE.BufferGeometry,
  f: (x: number, y: number) => number
) {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) return;

  const count = pos.count;
  const Kvals = new Float32Array(count);

  const eps = 1e-2; // step for finite differences

  let Kmin = Infinity;
  let Kmax = -Infinity;

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);        // domain x
    const yDom = pos.getZ(i);     // domain y  (remember: (x, z, y) in world)
    // const z = pos.getY(i);     // height, not needed directly here

    // sample f and derivatives by finite differences
    const f00 = f(x, yDom);

    const fx = (f(x + eps, yDom) - f(x - eps, yDom)) / (2 * eps);
    const fy = (f(x, yDom + eps) - f(x, yDom - eps)) / (2 * eps);

    const fxx = (f(x + eps, yDom) - 2 * f00 + f(x - eps, yDom)) / (eps * eps);
    const fyy = (f(x, yDom + eps) - 2 * f00 + f(x, yDom - eps)) / (eps * eps);
    const fxy =
      (f(x + eps, yDom + eps) -
        f(x + eps, yDom - eps) -
        f(x - eps, yDom + eps) +
        f(x - eps, yDom - eps)) /
      (4 * eps * eps);

    // First fundamental form for graph r(x,y) = (x, f(x,y), y)
    const E = 1 + fx * fx;
    const F = fx * fy;
    const G = 1 + fy * fy;

    const denomN = Math.sqrt(1 + fx * fx + fy * fy) || 1;
    const e = fxx / denomN;
    const fcoef = fxy / denomN;
    const g = fyy / denomN;

    const EG_F2 = E * G - F * F;
    let K = 0;

    if (Math.abs(EG_F2) > 1e-10) {
      K = (e * g - fcoef * fcoef) / EG_F2;
    } else {
      K = 0;
    }

    Kvals[i] = K;
    if (K < Kmin) Kmin = K;
    if (K > Kmax) Kmax = K;
  }

  // Symmetric range around 0 so that "flat" ≈ dark red, large |K| ≈ yellow
  const KabsMax = Math.max(Math.abs(Kmin), Math.abs(Kmax)) || 1;

  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const K = Kvals[i];

    // compress |K| using atan so huge values don't dominate
    const kNorm = Math.atan(Math.abs(K) / KabsMax * 3) / (Math.PI / 2); // 0..1
    const { r, g, b } = curvatureRedYellow(kNorm);

    colors[3 * i] = r;
    colors[3 * i + 1] = g;
    colors[3 * i + 2] = b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.attributes.color.needsUpdate = true;
}
