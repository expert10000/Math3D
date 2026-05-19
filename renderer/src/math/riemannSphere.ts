import { C, type Complex } from "./complex";
import { mapMobiusPoint, type MobiusParams } from "./mobius";

export type SpherePoint3 = { x: number; y: number; z: number };

export const RIEMANN_NORTH_POLE: SpherePoint3 = { x: 0, y: 0, z: 1 };

export const stereographicToSphere = (re: number, im: number): SpherePoint3 => {
  if (!Number.isFinite(re) || !Number.isFinite(im)) return { ...RIEMANN_NORTH_POLE };
  const r2 = re * re + im * im;
  if (!Number.isFinite(r2)) return { ...RIEMANN_NORTH_POLE };
  const denom = 1 + r2;
  if (!Number.isFinite(denom) || denom === 0) return { ...RIEMANN_NORTH_POLE };
  return {
    x: (2 * re) / denom,
    y: (2 * im) / denom,
    z: (r2 - 1) / denom,
  };
};

export const sphereToStereographic = (p: SpherePoint3): Complex | null => {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null;
  const denom = 1 - p.z;
  if (!Number.isFinite(denom) || Math.abs(denom) <= 1e-12) return null;
  return C(p.x / denom, p.y / denom);
};

export const wrapPrincipalAngle = (theta: number): number => {
  const twoPi = Math.PI * 2;
  let t = theta;
  if (!Number.isFinite(t)) return 0;
  t = ((t + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  return t;
};

export const evalRiemannSheet = (
  re: number,
  im: number,
  sheetIndex: number,
  sheetCount: number,
  branchCutAngle: number
): Complex | null => {
  const r = Math.hypot(re, im);
  if (!Number.isFinite(r)) return null;
  if (r === 0) return C(0, 0);
  const thetaRaw = Math.atan2(im, re);
  const theta = wrapPrincipalAngle(thetaRaw - branchCutAngle) + branchCutAngle;
  const k = Math.max(1, sheetCount);
  const angle = (theta + 2 * Math.PI * sheetIndex) / k;
  const mag = Math.pow(r, 1 / k);
  return C(mag * Math.cos(angle), mag * Math.sin(angle));
};

export const mapPlanePointToSphere = (z: Complex): SpherePoint3 => stereographicToSphere(z.re, z.im);

export const mapMobiusPointToSphere = (
  z: Complex,
  params: MobiusParams,
  eps = 1e-12
): SpherePoint3 => {
  const w = mapMobiusPoint(z, params, eps);
  if (!w) return { ...RIEMANN_NORTH_POLE };
  return stereographicToSphere(w.re, w.im);
};
