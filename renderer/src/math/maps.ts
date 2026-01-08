// src/math/maps.ts
// Minimal complex helpers just for standard maps

export type Cpx = { re: number; im: number };

const c = (re: number, im: number): Cpx => ({ re, im });

const add = (z: Cpx, w: Cpx): Cpx =>
  c(z.re + w.re, z.im + w.im);

const sub = (z: Cpx, w: Cpx): Cpx =>
  c(z.re - w.re, z.im - w.im);

const mul = (z: Cpx, w: Cpx): Cpx =>
  c(z.re * w.re - z.im * w.im, z.re * w.im + z.im * w.re);

const div = (z: Cpx, w: Cpx): Cpx => {
  const denom = w.re * w.re + w.im * w.im || 1e-16;
  return c(
    (z.re * w.re + z.im * w.im) / denom,
    (z.im * w.re - z.re * w.im) / denom
  );
};

const exp = (z: Cpx): Cpx => {
  const ea = Math.exp(z.re);
  return c(ea * Math.cos(z.im), ea * Math.sin(z.im));
};

/* ---------------- 1. Cayley: disk ↔ right half-plane ----------------
   w = (1 + z) / (1 - z)
------------------------------------------------------------------- */

export function cayley(z: Cpx): Cpx {
  const one = c(1, 0);
  const num = add(one, z);
  const den = sub(one, z);
  return div(num, den);
}

/* --------- 4. Strip |Im z| < h/2 → right half-plane ---------------
   w = exp(π z / h)
------------------------------------------------------------------- */

export function stripToRightHalfPlane(z: Cpx, h: number): Cpx {
  const factor = Math.PI / h;
  const t = c(factor * z.re, factor * z.im);
  return exp(t);
}

/* --------- 5. Strip |Im z| < h/2 → unit disk ----------------------
   ζ = (e^{π z/h} − 1) / (e^{π z/h} + 1)  = Cayley ∘ exp
------------------------------------------------------------------- */

export function stripToDisk(z: Cpx, h: number): Cpx {
  const w = stripToRightHalfPlane(z, h); // right half-plane
  const one = c(1, 0);
  const num = add(one, w);
  const den = sub(one, w);
  return div(num, den); // same Cayley formula
}

/* --------- 3. Disk automorphism φ_{a,θ}(z) (optional, later) ------

export function diskAuto(z: Cpx, a: Cpx, theta: number): Cpx {
  const eitheta = c(Math.cos(theta), Math.sin(theta));
  const zMinusA = sub(z, a);
  const conjA = c(a.re, -a.im);
  const one = c(1, 0);
  const oneMinusAz = sub(one, mul(conjA, z));
  return mul(eitheta, div(zMinusA, oneMinusAz));
}

------------------------------------------------------------------- */
