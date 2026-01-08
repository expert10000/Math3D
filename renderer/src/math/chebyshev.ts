// src/math/chebyshev.ts

/**
 * Real Chebyshev polynomial T_n(x)
 * uses the standard recurrence:
 * T_0 = 1, T_1 = x, T_{n+1} = 2x T_n - T_{n-1}
 */
export function chebyshevT(n: number, x: number): number {
  if (n === 0) return 1;
  if (n === 1) return x;

  let Tnm1 = 1;   // T_0
  let Tn = x;     // T_1

  for (let k = 1; k < n; k++) {
    const Tnp1 = 2 * x * Tn - Tnm1;
    Tnm1 = Tn;
    Tn = Tnp1;
  }
  return Tn;
}
