// src/math/weierstrass.ts
import { compileComplexExpression, type ComplexExprError } from "./complexExpr";
import * as THREE from "three";
import {
  C,
  add,
  sub,
  mul,
  scale,
  isFiniteC,
  type Complex,
} from "./complex";

type Vec3 = { x: number; y: number; z: number };
type Complex3 = { x: Complex; y: Complex; z: Complex };

export type WeierstrassBuildResult = {
  paramFunc: (u: number, v: number, target: { set: (x: number, y: number, z: number) => void }) => void;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  error?: ComplexExprError;
  errorMessage?: string;
};

type DriftArgs = {
  gExpr: string;
  phiExpr: string;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  samples: number;
};

export type WeierstrassDriftResult =
  | {
      driftVec: THREE.Vector3;
      drift: number;
      okLevel: "good" | "warn" | "bad";
    }
  | { errorMessage: string };


const C0 = C(0, 0);
const C1 = C(1, 0);
const CI = C(0, 1);

function avgPhi(a: Complex3, b: Complex3): Complex3 {
  return {
    x: scale(add(a.x, b.x), 0.5),
    y: scale(add(a.y, b.y), 0.5),
    z: scale(add(a.z, b.z), 0.5),
  };
}

function realPartMul(phi: Complex3, dz: Complex): Vec3 {
  const px = mul(phi.x, dz).re;
  const py = mul(phi.y, dz).re;
  const pz = mul(phi.z, dz).re;
  return { x: px, y: py, z: pz };
}

function makePhi(g: Complex, phi: Complex): Complex3 {
  const g2 = mul(g, g);
  const oneMinus = sub(C1, g2);
  const onePlus = add(C1, g2);
  return {
    x: mul(scale(oneMinus, 0.5), phi),
    y: mul(mul(CI, scale(onePlus, 0.5)), phi),
    z: mul(g, phi),
  };
}

function bilerp(p00: Vec3, p10: Vec3, p01: Vec3, p11: Vec3, tx: number, ty: number): Vec3 {
  const a = {
    x: p00.x + (p10.x - p00.x) * tx,
    y: p00.y + (p10.y - p00.y) * tx,
    z: p00.z + (p10.z - p00.z) * tx,
  };
  const b = {
    x: p01.x + (p11.x - p01.x) * tx,
    y: p01.y + (p11.y - p01.y) * tx,
    z: p01.z + (p11.z - p01.z) * tx,
  };
  return {
    x: a.x + (b.x - a.x) * ty,
    y: a.y + (b.y - a.y) * ty,
    z: a.z + (b.z - a.z) * ty,
  };
}

export function buildWeierstrassSurface(params: {
  gExpr: string;
  phiExpr: string;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  resolution: number;
  recenterRescale: boolean;
}): WeierstrassBuildResult {
  const gRes = compileComplexExpression(params.gExpr);
  if (gRes.error) return { uMin: params.uMin, uMax: params.uMax, vMin: params.vMin, vMax: params.vMax, error: gRes.error, errorMessage: gRes.error.message, paramFunc: () => {} };
  const phiRes = compileComplexExpression(params.phiExpr);
  if (phiRes.error) return { uMin: params.uMin, uMax: params.uMax, vMin: params.vMin, vMax: params.vMax, error: phiRes.error, errorMessage: phiRes.error.message, paramFunc: () => {} };

  const gFn = gRes.fn!;
  const phiFn = phiRes.fn!;

  let uMin = Number.isFinite(params.uMin) ? params.uMin : -1;
  let uMax = Number.isFinite(params.uMax) ? params.uMax : 1;
  let vMin = Number.isFinite(params.vMin) ? params.vMin : -1;
  let vMax = Number.isFinite(params.vMax) ? params.vMax : 1;
  if (uMin === uMax) uMax = uMin + 0.1;
  if (vMin === vMax) vMax = vMin + 0.1;
  if (uMin > uMax) [uMin, uMax] = [uMax, uMin];
  if (vMin > vMax) [vMin, vMax] = [vMax, vMin];

  const res = Math.max(4, Math.round(params.resolution));
  const du = (uMax - uMin) / (res - 1);
  const dv = (vMax - vMin) / (res - 1);

  const phiGrid: Complex3[][] = Array.from({ length: res }, () => new Array<Complex3>(res));
  const xGrid: Vec3[][] = Array.from({ length: res }, () => new Array<Vec3>(res));

  for (let j = 0; j < res; j++) {
    const v = vMin + dv * j;
    for (let i = 0; i < res; i++) {
      const u = uMin + du * i;
      const z = C(u, v);
      const g = gFn({ z, u, v });
      const phi = phiFn({ z, u, v });
      if (!isFiniteC(g) || !isFiniteC(phi)) {
        return { uMin, uMax, vMin, vMax, errorMessage: "Non-finite value in g(z) or phi(z).", paramFunc: () => {} };
      }
      phiGrid[j][i] = makePhi(g, phi);
    }
  }

  xGrid[0][0] = { x: 0, y: 0, z: 0 };

  for (let i = 1; i < res; i++) {
    const mid = avgPhi(phiGrid[0][i - 1], phiGrid[0][i]);
    const d = realPartMul(mid, C(du, 0));
    const prev = xGrid[0][i - 1];
    xGrid[0][i] = { x: prev.x + d.x, y: prev.y + d.y, z: prev.z + d.z };
  }

  for (let j = 1; j < res; j++) {
    {
      const mid = avgPhi(phiGrid[j - 1][0], phiGrid[j][0]);
      const d = realPartMul(mid, C(0, dv));
      const prev = xGrid[j - 1][0];
      xGrid[j][0] = { x: prev.x + d.x, y: prev.y + d.y, z: prev.z + d.z };
    }
    for (let i = 1; i < res; i++) {
      const mid = avgPhi(phiGrid[j][i - 1], phiGrid[j][i]);
      const d = realPartMul(mid, C(du, 0));
      const prev = xGrid[j][i - 1];
      xGrid[j][i] = { x: prev.x + d.x, y: prev.y + d.y, z: prev.z + d.z };
    }
  }

  let min = { x: Infinity, y: Infinity, z: Infinity };
  let max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const p = xGrid[j][i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
        return { uMin, uMax, vMin, vMax, errorMessage: "Non-finite point in surface integration.", paramFunc: () => {} };
      }
      if (p.x < min.x) min.x = p.x;
      if (p.y < min.y) min.y = p.y;
      if (p.z < min.z) min.z = p.z;
      if (p.x > max.x) max.x = p.x;
      if (p.y > max.y) max.y = p.y;
      if (p.z > max.z) max.z = p.z;
    }
  }

  if (params.recenterRescale) {
    const cx = (min.x + max.x) * 0.5;
    const cy = (min.y + max.y) * 0.5;
    const cz = (min.z + max.z) * 0.5;
    const extent = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
    const scaleTo = extent > 1e-9 ? 2.0 / extent : 1;
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const p = xGrid[j][i];
        xGrid[j][i] = {
          x: (p.x - cx) * scaleTo,
          y: (p.y - cy) * scaleTo,
          z: (p.z - cz) * scaleTo,
        };
      }
    }
  }

  const paramFunc = (u: number, v: number, target: { set: (x: number, y: number, z: number) => void }) => {
    const uu = (u - uMin) / (uMax - uMin);
    const vv = (v - vMin) / (vMax - vMin);
    const uClamped = Math.min(1, Math.max(0, uu));
    const vClamped = Math.min(1, Math.max(0, vv));

    const gx = uClamped * (res - 1);
    const gy = vClamped * (res - 1);
    const i0 = Math.floor(gx);
    const j0 = Math.floor(gy);
    const i1 = Math.min(res - 1, i0 + 1);
    const j1 = Math.min(res - 1, j0 + 1);
    const tx = gx - i0;
    const ty = gy - j0;

    const p = bilerp(
      xGrid[j0][i0],
      xGrid[j0][i1],
      xGrid[j1][i0],
      xGrid[j1][i1],
      tx,
      ty
    );
    target.set(p.x, p.y, p.z);
  };

  return { paramFunc, uMin, uMax, vMin, vMax };
}

function clampSamples(raw: number) {
  const n = Math.round(raw);
  return Math.min(200, Math.max(40, Number.isFinite(n) ? n : 80));
}

function evalPhiVector(
  gFn: (ctx: { z: Complex; u: number; v: number }) => Complex,
  phiFn: (ctx: { z: Complex; u: number; v: number }) => Complex,
  u: number,
  v: number
): Complex3 | null {
  const z = C(u, v);
  const g = gFn({ z, u, v });
  const phi = phiFn({ z, u, v });
  if (!isFiniteC(g) || !isFiniteC(phi)) return null;
  return makePhi(g, phi);
}

function addVec3(target: Vec3, source: Vec3) {
  target.x += source.x;
  target.y += source.y;
  target.z += source.z;
}

function integrateEdge(
  samples: number,
  start: { u: number; v: number },
  step: { du: number; dv: number },
  dz: Complex,
  psi: (u: number, v: number) => Complex3 | null
): { ok: boolean; sum: Vec3 } {
  const sum: Vec3 = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < samples; i++) {
    const u0 = start.u + step.du * i;
    const v0 = start.v + step.dv * i;
    const u1 = start.u + step.du * (i + 1);
    const v1 = start.v + step.dv * (i + 1);

    const phi0 = psi(u0, v0);
    const phi1 = psi(u1, v1);
    if (!phi0 || !phi1) return { ok: false, sum };

    const avg = avgPhi(phi0, phi1);
    const contribution = realPartMul(avg, dz);
    if (!Number.isFinite(contribution.x) || !Number.isFinite(contribution.y) || !Number.isFinite(contribution.z)) {
      return { ok: false, sum };
    }
    addVec3(sum, contribution);
  }
  return { ok: true, sum };
}

export function computeWeierstrassDrift(args: DriftArgs): WeierstrassDriftResult {
  const gRes = compileComplexExpression(args.gExpr);
  if (gRes.error) return { errorMessage: gRes.error.message };
  const phiRes = compileComplexExpression(args.phiExpr);
  if (phiRes.error) return { errorMessage: phiRes.error.message };

  const gFn = gRes.fn!;
  const phiFn = phiRes.fn!;

  let u0 = Number.isFinite(args.uMin) ? args.uMin : -1;
  let u1 = Number.isFinite(args.uMax) ? args.uMax : 1;
  let v0 = Number.isFinite(args.vMin) ? args.vMin : -1;
  let v1 = Number.isFinite(args.vMax) ? args.vMax : 1;
  if (u0 === u1) u1 = u0 + 0.1;
  if (v0 === v1) v1 = v0 + 0.1;
  if (u0 > u1) [u0, u1] = [u1, u0];
  if (v0 > v1) [v0, v1] = [v1, v0];

  const samples = clampSamples(args.samples);
  const du = (u1 - u0) / samples;
  const dv = (v1 - v0) / samples;

  const psi = (u: number, v: number) => evalPhiVector(gFn, phiFn, u, v);

  const e1 = integrateEdge(samples, { u: u0, v: v0 }, { du, dv: 0 }, C(du, 0), psi);
  if (!e1.ok) return { errorMessage: "Diagnostics unavailable (singularity on boundary)." };
  const e2 = integrateEdge(samples, { u: u1, v: v0 }, { du: 0, dv }, C(0, dv), psi);
  if (!e2.ok) return { errorMessage: "Diagnostics unavailable (singularity on boundary)." };
  const e3 = integrateEdge(samples, { u: u1, v: v1 }, { du: -du, dv: 0 }, C(-du, 0), psi);
  if (!e3.ok) return { errorMessage: "Diagnostics unavailable (singularity on boundary)." };
  const e4 = integrateEdge(samples, { u: u0, v: v1 }, { du: 0, dv: -dv }, C(0, -dv), psi);
  if (!e4.ok) return { errorMessage: "Diagnostics unavailable (singularity on boundary)." };

  const total = {
    x: e1.sum.x + e2.sum.x + e3.sum.x + e4.sum.x,
    y: e1.sum.y + e2.sum.y + e3.sum.y + e4.sum.y,
    z: e1.sum.z + e2.sum.z + e3.sum.z + e4.sum.z,
  };

  if (!Number.isFinite(total.x) || !Number.isFinite(total.y) || !Number.isFinite(total.z)) {
    return { errorMessage: "Diagnostics unavailable (singularity on boundary)." };
  }

  const driftVec = new THREE.Vector3(total.x, total.y, total.z);
  const drift = driftVec.length();

  const okLevel: "good" | "warn" | "bad" =
    drift < 1e-3 ? "good" : drift < 1e-2 ? "warn" : "bad";

  return { drift, driftVec, okLevel };
}
