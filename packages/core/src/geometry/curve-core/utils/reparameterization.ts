import type { AnyCurve } from "../model";
import { curveDomainSpan } from "../model";
import { distancePoint } from "./vector";

export const clampToDomain = (curve: AnyCurve, t: number): number => {
  if (t <= curve.domain.tMin) return curve.domain.tMin;
  if (t >= curve.domain.tMax) return curve.domain.tMax;
  return t;
};

export const normalizeCurveParameter = (curve: AnyCurve, t: number): number => {
  const span = curveDomainSpan(curve.domain);
  if (span <= 1e-12) return 0;
  return (clampToDomain(curve, t) - curve.domain.tMin) / span;
};

export const denormalizeCurveParameter = (curve: AnyCurve, u: number): number => {
  const uc = Math.min(1, Math.max(0, u));
  return curve.domain.tMin + uc * curveDomainSpan(curve.domain);
};

export type ArcLengthTable = {
  ts: number[];
  lengths: number[];
  totalLength: number;
};

export const buildArcLengthTable = (curve: AnyCurve, segments = 256): ArcLengthTable => {
  const count = Math.max(2, Math.floor(segments));
  const ts: number[] = new Array(count + 1);
  const lengths: number[] = new Array(count + 1);
  const tMin = curve.domain.tMin;
  const tMax = curve.domain.tMax;
  const dt = (tMax - tMin) / count;

  let total = 0;
  ts[0] = tMin;
  lengths[0] = 0;
  let prev = curve.eval(tMin);

  for (let i = 1; i <= count; i += 1) {
    const t = i === count ? tMax : tMin + i * dt;
    ts[i] = t;
    const next = curve.eval(t);
    total += distancePoint(prev, next);
    lengths[i] = total;
    prev = next;
  }

  return { ts, lengths, totalLength: total };
};

export const invertArcLengthTable = (table: ArcLengthTable, s: number): number => {
  if (table.totalLength <= 1e-12) return table.ts[0] ?? 0;
  const target = Math.min(table.totalLength, Math.max(0, s));
  const lengths = table.lengths;
  const ts = table.ts;

  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] <= target) lo = mid;
    else hi = mid;
  }

  const aLen = lengths[lo];
  const bLen = lengths[lo + 1];
  const aT = ts[lo];
  const bT = ts[lo + 1];
  const span = Math.max(1e-12, bLen - aLen);
  const alpha = (target - aLen) / span;
  return aT + (bT - aT) * alpha;
};

export const reparameterizeByArcLength = (curve: AnyCurve, segments = 256) => {
  const table = buildArcLengthTable(curve, segments);
  return {
    table,
    tToS: (t: number): number => {
      const tc = clampToDomain(curve, t);
      const ts = table.ts;
      const lengths = table.lengths;
      let lo = 0;
      let hi = ts.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (ts[mid] <= tc) lo = mid;
        else hi = mid;
      }
      const aT = ts[lo];
      const bT = ts[lo + 1];
      const aS = lengths[lo];
      const bS = lengths[lo + 1];
      const span = Math.max(1e-12, bT - aT);
      const alpha = (tc - aT) / span;
      return aS + (bS - aS) * alpha;
    },
    sToT: (s: number): number => invertArcLengthTable(table, s),
    uToT: (u: number): number => invertArcLengthTable(table, Math.max(0, Math.min(1, u)) * table.totalLength),
  };
};

