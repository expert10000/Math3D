import * as THREE from "three";

export type PrincipalCurvatureScalars = {
  k1: number;
  k2: number;
  H: number;
  K: number;
  isUmbilic: boolean;
};

export type PrincipalCurvatureResult = PrincipalCurvatureScalars & {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  dir1: THREE.Vector3;
  dir2: THREE.Vector3;
  uvDir1: { du: number; dv: number };
  uvDir2: { du: number; dv: number };
};

type ParamFunc = (u: number, v: number, target: THREE.Vector3) => void;

export function computePrincipalCurvatureAtUV(opts: {
  paramFunc: ParamFunc;
  u: number;
  v: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  du?: number;
  dv?: number;
  umbilicEps?: number;
}): PrincipalCurvatureResult | null {
  const { paramFunc, u, v, uMin, uMax, vMin, vMax } = opts;
  const uRange = uMax - uMin || 1;
  const vRange = vMax - vMin || 1;
  const du = opts.du ?? Math.max(1e-5, Math.abs(uRange) * 1e-3);
  const dv = opts.dv ?? Math.max(1e-5, Math.abs(vRange) * 1e-3);

  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  const evalParam = (uu: number, vv: number, target: THREE.Vector3) => {
    paramFunc(clamp(uu, uMin, uMax), clamp(vv, vMin, vMax), target);
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

  const ru = new THREE.Vector3();
  const rv = new THREE.Vector3();
  const ruu = new THREE.Vector3();
  const rvv = new THREE.Vector3();
  const ruv = new THREE.Vector3();

  evalParam(u, v, p);

  evalParam(u + du, v, pu1);
  evalParam(u - du, v, pu2);
  ru.copy(pu1).sub(pu2).multiplyScalar(0.5 / du);
  ruu.copy(pu1).add(pu2).addScaledVector(p, -2).multiplyScalar(1 / (du * du));

  evalParam(u, v + dv, pv1);
  evalParam(u, v - dv, pv2);
  rv.copy(pv1).sub(pv2).multiplyScalar(0.5 / dv);
  rvv.copy(pv1).add(pv2).addScaledVector(p, -2).multiplyScalar(1 / (dv * dv));

  evalParam(u + du, v + dv, puv1);
  evalParam(u + du, v - dv, puv2);
  evalParam(u - du, v + dv, puv3);
  evalParam(u - du, v - dv, puv4);
  ruv.copy(puv1).sub(puv2).sub(puv3).add(puv4).multiplyScalar(1 / (4 * du * dv));

  const n = new THREE.Vector3().crossVectors(ru, rv);
  const nLen2 = n.lengthSq();
  const E = ru.dot(ru);
  const F = ru.dot(rv);
  const G = rv.dot(rv);
  const denom = E * G - F * F;

  if (!Number.isFinite(nLen2) || !Number.isFinite(denom)) return null;
  if (!Number.isFinite(E) || !Number.isFinite(F) || !Number.isFinite(G)) return null;
  if (nLen2 < 1e-12 || Math.abs(denom) < 1e-12) return null;
  n.multiplyScalar(1 / Math.sqrt(nLen2));

  const e = ruu.dot(n);
  const f = ruv.dot(n);
  const g = rvv.dot(n);

  const H = (e * G - 2 * f * F + g * E) / (2 * denom);
  const K = (e * g - f * f) / denom;
  if (!Number.isFinite(H) || !Number.isFinite(K)) return null;
  const disc = Math.max(0, H * H - K);
  const sqrtDisc = Math.sqrt(disc);
  const k1 = H + sqrtDisc;
  const k2 = H - sqrtDisc;
  const isUmbilic = Math.abs(k1 - k2) < (opts.umbilicEps ?? 1e-3);

  const invDen = 1 / denom;
  const S11 = (G * e - F * f) * invDen;
  const S12 = (G * f - F * g) * invDen;
  const S21 = (-F * e + E * f) * invDen;
  const S22 = (-F * f + E * g) * invDen;

  const eigenDir = (k: number) => {
    const a = S11 - k;
    const b = S12;
    const c = S21;
    const d = S22 - k;
    const r1 = a * a + b * b;
    const r2 = c * c + d * d;
    let x: number;
    let y: number;
    if (r1 >= r2) {
      x = -b;
      y = a;
    } else {
      x = d;
      y = -c;
    }
    const len = Math.hypot(x, y);
    if (len < 1e-12) return { du: 1, dv: 0 };
    return { du: x / len, dv: y / len };
  };

  const uvDir1 = eigenDir(k1);
  const uvDir2 = eigenDir(k2);

  const dir1 = ru.clone().multiplyScalar(uvDir1.du).addScaledVector(rv, uvDir1.dv);
  const dir2 = ru.clone().multiplyScalar(uvDir2.du).addScaledVector(rv, uvDir2.dv);
  if (dir1.lengthSq() < 1e-12 || dir2.lengthSq() < 1e-12) return null;
  dir1.normalize();
  dir2.normalize();

  return {
    k1,
    k2,
    H,
    K,
    isUmbilic,
    point: p.clone(),
    normal: n.clone(),
    dir1,
    dir2,
    uvDir1,
    uvDir2,
  };
}
