import type { AnyCurve, CurveEvalResult, CurvePoint } from "../model";

export const sampleUniform = (curve: AnyCurve, sampleCount = 128): CurveEvalResult[] => {
  const n = Math.max(2, Math.floor(sampleCount));
  const tMin = curve.domain.tMin;
  const tMax = curve.domain.tMax;
  const dt = (tMax - tMin) / (n - 1);
  const rows: CurveEvalResult[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i === n - 1 ? tMax : tMin + i * dt;
    rows.push({ t, point: curve.eval(t) });
  }
  return rows;
};

export const samplesToPolyline = <TPoint extends CurvePoint>(samples: Array<{ point: TPoint }>): TPoint[] => {
  return samples.map((row) => row.point);
};

