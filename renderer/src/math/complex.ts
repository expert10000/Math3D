// src/math/complex.ts

export type Complex = { re: number; im: number };

export const C = (re = 0, im = 0): Complex => ({ re, im });

export const add = (x: Complex, y: Complex): Complex =>
  C(x.re + y.re, x.im + y.im);

export const mul = (x: Complex, y: Complex): Complex =>
  C(x.re * y.re - x.im * y.im, x.re * y.im + x.im * y.re);

export const abs2 = (z: Complex): number => z.re * z.re + z.im * z.im;

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
