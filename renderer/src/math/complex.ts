// src/math/complex.ts

export type Complex = { re: number; im: number };

export const C = (re = 0, im = 0): Complex => ({ re, im });

export const add = (x: Complex, y: Complex): Complex =>
  C(x.re + y.re, x.im + y.im);

export const sub = (x: Complex, y: Complex): Complex =>
  C(x.re - y.re, x.im - y.im);

export const mul = (x: Complex, y: Complex): Complex =>
  C(x.re * y.re - x.im * y.im, x.re * y.im + x.im * y.re);

export const scale = (z: Complex, s: number): Complex =>
  C(z.re * s, z.im * s);

export const abs2 = (z: Complex): number => z.re * z.re + z.im * z.im;

export const abs = (z: Complex): number => Math.sqrt(abs2(z));

export const div = (x: Complex, y: Complex): Complex => {
  const d = y.re * y.re + y.im * y.im;
  if (d === 0) return C(NaN, NaN);
  return C(
    (x.re * y.re + x.im * y.im) / d,
    (x.im * y.re - x.re * y.im) / d
  );
};

export const isFiniteC = (z: Complex): boolean =>
  Number.isFinite(z.re) && Number.isFinite(z.im);

export const exp = (z: Complex): Complex => {
  const ea = Math.exp(z.re);
  return C(ea * Math.cos(z.im), ea * Math.sin(z.im));
};

export const log = (z: Complex): Complex =>
  C(Math.log(Math.sqrt(abs2(z))), Math.atan2(z.im, z.re));

export const sqrt = (z: Complex): Complex => {
  if (z.re === 0 && z.im === 0) return C(0, 0);
  const r = Math.sqrt(abs(z));
  const theta = Math.atan2(z.im, z.re) * 0.5;
  return C(r * Math.cos(theta), r * Math.sin(theta));
};

export const sin = (z: Complex): Complex =>
  C(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im));

export const cos = (z: Complex): Complex =>
  C(Math.cos(z.re) * Math.cosh(z.im), -Math.sin(z.re) * Math.sinh(z.im));

export const tan = (z: Complex): Complex => div(sin(z), cos(z));

export const powReal = (z: Complex, a: number): Complex => exp(scale(log(z), a));
