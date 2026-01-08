// src/math/geodesic.ts
import * as THREE from "three";

export type SigmaUV = (
  u: number,
  v: number,
  target?: THREE.Vector3
) => THREE.Vector3;

export type WrapMode = {
  wrapU?: boolean; // periodic u
  wrapV?: boolean; // periodic v
};

export type Domain = {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
};

export type GeodesicOptions = {
  sigma: SigmaUV;
  startUV: { u: number; v: number };
  dirUV: { du: number; dv: number }; // initial direction in parameter domain units
  domain?: Domain;
  wrap?: WrapMode;
  steps?: number;
  h?: number;
  eps?: number;
  stopAtBoundary?: boolean;

  // robustness / stopping:
  maxArcLength?: number; // stop after traveling this much in 3D
  maxSpeed?: number;     // stop if |dσ/dt| exceeds this
  detEps?: number;       // stop if metric det < detEps

  // extra robustness (prevents "teleport" spikes):
  renormalizeSpeed?: boolean; // keep metric speed ~ constant
  maxStepLength3D?: number;   // stop if next 3D step is too large
};

export function integrateGeodesic(opts: GeodesicOptions): THREE.Vector3[] {
  const {
    sigma,
    startUV,
    dirUV,
    domain = { uMin: 0, uMax: 1, vMin: 0, vMax: 1 },
    wrap = {},
    steps = 600,
    h = 0.01,
    eps = 1e-4,
    stopAtBoundary = true,
    maxArcLength,
    maxSpeed,
    detEps = 1e-12,
    renormalizeSpeed = true,
    maxStepLength3D = 0.4,
  } = opts;

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  const clamp = (x: number, a: number, b: number) =>
    Math.max(a, Math.min(b, x));

  const wrapToDomain = (x: number, a: number, b: number) => {
    const L = b - a;
    if (!Number.isFinite(L) || Math.abs(L) < 1e-15) return a;
    let t = (x - a) % L;
    if (t < 0) t += L;
    return a + t;
  };

  const inDomain = (u: number, v: number) =>
    u >= domain.uMin &&
    u <= domain.uMax &&
    v >= domain.vMin &&
    v <= domain.vMax;

const applyWrap = (u: number, v: number) => {
  // ✅ torus-like / covering-space integration:
  // if we are NOT wrapping and we also do NOT stop at the boundary,
  // then do NOT clamp either.
  if (!stopAtBoundary && !wrap.wrapU && !wrap.wrapV) {
    return { u, v };
  }

  let uu = u;
  let vv = v;

  if (wrap.wrapU) uu = wrapToDomain(uu, domain.uMin, domain.uMax);
  else uu = clamp(uu, domain.uMin, domain.uMax);

  if (wrap.wrapV) vv = wrapToDomain(vv, domain.vMin, domain.vMax);
  else vv = clamp(vv, domain.vMin, domain.vMax);

  return { u: uu, v: vv };
};

  const evalSigma = (u: number, v: number) =>
    sigma(u, v, new THREE.Vector3()).clone();

  // finite-diff helpers
  const sigma_u = (u: number, v: number) => {
    const u1 = u + eps,
      u0 = u - eps;
    const p1 = sigma(u1, v, tmp).clone();
    const p0 = sigma(u0, v, tmp2).clone();
    return p1.sub(p0).multiplyScalar(1 / (2 * eps));
  };

  const sigma_v = (u: number, v: number) => {
    const v1 = v + eps,
      v0 = v - eps;
    const p1 = sigma(u, v1, tmp).clone();
    const p0 = sigma(u, v0, tmp2).clone();
    return p1.sub(p0).multiplyScalar(1 / (2 * eps));
  };

  const metric = (u: number, v: number) => {
    const su = sigma_u(u, v);
    const sv = sigma_v(u, v);
    const E = su.dot(su);
    const F = su.dot(sv);
    const G = sv.dot(sv);
    return { E, F, G, su, sv };
  };

  const metricDerivs = (u: number, v: number) => {
    const m_u1 = metric(u + eps, v);
    const m_u0 = metric(u - eps, v);
    const m_v1 = metric(u, v + eps);
    const m_v0 = metric(u, v - eps);

    const Eu = (m_u1.E - m_u0.E) / (2 * eps);
    const Fu = (m_u1.F - m_u0.F) / (2 * eps);
    const Gu = (m_u1.G - m_u0.G) / (2 * eps);

    const Ev = (m_v1.E - m_v0.E) / (2 * eps);
    const Fv = (m_v1.F - m_v0.F) / (2 * eps);
    const Gv = (m_v1.G - m_v0.G) / (2 * eps);

    return { Eu, Fu, Gu, Ev, Fv, Gv };
  };

  const christoffel = (u: number, v: number) => {
    const { E, F, G } = metric(u, v);
    const det = E * G - F * F;

    if (!Number.isFinite(det) || det <= detEps) return null;

    const inv11 = G / det; // g^{uu}
    const inv12 = -F / det; // g^{uv}
    const inv22 = E / det; // g^{vv}

    const { Eu, Fu, Gu, Ev, Fv, Gv } = metricDerivs(u, v);

    const Guuu = 0.5 * (inv11 * Eu + inv12 * (2 * Fu - Ev));
    const Guuv = 0.5 * (inv11 * Ev + inv12 * Gu);
    const Guvv = 0.5 * (inv11 * (2 * Fv - Gu) + inv12 * Gv);

    const Gvuu = 0.5 * (inv12 * Eu + inv22 * (2 * Fu - Ev));
    const Gvuv = 0.5 * (inv12 * Ev + inv22 * Gu);
    const Gvvv = 0.5 * (inv12 * (2 * Fv - Gu) + inv22 * Gv);

    if (
      !Number.isFinite(Guuu) ||
      !Number.isFinite(Guuv) ||
      !Number.isFinite(Guvv) ||
      !Number.isFinite(Gvuu) ||
      !Number.isFinite(Gvuv) ||
      !Number.isFinite(Gvvv)
    ) {
      return null;
    }

    return { Guuu, Guuv, Guvv, Gvuu, Gvuv, Gvvv };
  };

  // normalize initial direction to unit speed w.r.t metric at start
  {
    const { E, F, G } = metric(startUV.u, startUV.v);
    const wU = dirUV.du,
      wV = dirUV.dv;
    const speed2 = E * wU * wU + 2 * F * wU * wV + G * wV * wV;

    if (!Number.isFinite(speed2) || speed2 <= 1e-12) {
      const uv0 = applyWrap(startUV.u, startUV.v);
      return [evalSigma(uv0.u, uv0.v)];
    }

    const s = Math.sqrt(speed2);
    dirUV.du = wU / s;
    dirUV.dv = wV / s;
  }

  // because we normalized: target metric speed^2 ≈ 1
  const targetSpeed2 = 1;

  type State = { u: number; v: number; pu: number; pv: number };

  const f = (S: State): State | null => {
    const { u, v, pu, pv } = S;
    const ch = christoffel(u, v);
    if (!ch) return null;

    const { Guuu, Guuv, Guvv, Gvuu, Gvuv, Gvvv } = ch;

    const uDD = -(Guuu * pu * pu + 2 * Guuv * pu * pv + Guvv * pv * pv);
    const vDD = -(Gvuu * pu * pu + 2 * Gvuv * pu * pv + Gvvv * pv * pv);

    if (!Number.isFinite(uDD) || !Number.isFinite(vDD)) return null;

    return { u: pu, v: pv, pu: uDD, pv: vDD };
  };

  const add = (a: State, b: State, s: number): State => ({
    u: a.u + s * b.u,
    v: a.v + s * b.v,
    pu: a.pu + s * b.pu,
    pv: a.pv + s * b.pv,
  });

  const rk4 = (S: State, dt: number): State | null => {
    const k1 = f(S);
    if (!k1) return null;
    const k2 = f(add(S, k1, dt / 2));
    if (!k2) return null;
    const k3 = f(add(S, k2, dt / 2));
    if (!k3) return null;
    const k4 = f(add(S, k3, dt));
    if (!k4) return null;

    const Su = S.u + (dt / 6) * (k1.u + 2 * k2.u + 2 * k3.u + k4.u);
    const Sv = S.v + (dt / 6) * (k1.v + 2 * k2.v + 2 * k3.v + k4.v);
    const Spu = S.pu + (dt / 6) * (k1.pu + 2 * k2.pu + 2 * k3.pu + k4.pu);
    const Spv = S.pv + (dt / 6) * (k1.pv + 2 * k2.pv + 2 * k3.pv + k4.pv);

    if (
      !Number.isFinite(Su) ||
      !Number.isFinite(Sv) ||
      !Number.isFinite(Spu) ||
      !Number.isFinite(Spv)
    ) {
      return null;
    }

    return { u: Su, v: Sv, pu: Spu, pv: Spv };
  };

  let S: State = { u: startUV.u, v: startUV.v, pu: dirUV.du, pv: dirUV.dv };

  const pts: THREE.Vector3[] = [];
  let arc = 0;
  let prev: THREE.Vector3 | null = null;

  for (let i = 0; i < steps; i++) {
    if (stopAtBoundary && !wrap.wrapU && !wrap.wrapV && !inDomain(S.u, S.v)) break;

    const uv = applyWrap(S.u, S.v);
    const p = evalSigma(uv.u, uv.v);

    if (prev) {
      arc += p.distanceTo(prev);
      if (typeof maxArcLength === "number" && arc >= maxArcLength) {
        pts.push(p);
        break;
      }
    }

    // optional maxSpeed check using |dσ/dt| ≈ |σ_u * du/dt + σ_v * dv/dt|
    if (typeof maxSpeed === "number") {
      const { su, sv } = metric(uv.u, uv.v);
      const vel = su.multiplyScalar(S.pu).add(sv.multiplyScalar(S.pv));
      const sp = vel.length();
      if (!Number.isFinite(sp) || sp > maxSpeed) {
        pts.push(p);
        break;
      }
    }

    pts.push(p);
    prev = p;

    const next = rk4(S, h);
    if (!next) break;

    // keep metric speed from drifting (helps torus/cylinder a lot)
    if (renormalizeSpeed) {
      const uvN = applyWrap(next.u, next.v);
      const { E, F, G } = metric(uvN.u, uvN.v);
      const sp2 = E * next.pu * next.pu + 2 * F * next.pu * next.pv + G * next.pv * next.pv;
      if (!Number.isFinite(sp2) || sp2 <= 1e-12) break;
      const s = Math.sqrt(targetSpeed2 / sp2);
      next.pu *= s;
      next.pv *= s;
    }

    // stop before we draw a huge chord (teleport)
    if (Number.isFinite(maxStepLength3D) && prev) {
      const uvN = applyWrap(next.u, next.v);
      const pNext = evalSigma(uvN.u, uvN.v);
      if (
        !Number.isFinite(pNext.x) ||
        !Number.isFinite(pNext.y) ||
        !Number.isFinite(pNext.z)
      ) {
        break;
      }
      if (pNext.distanceTo(prev) > maxStepLength3D) break;
    }

    S = next;
  }

  return pts;
}
